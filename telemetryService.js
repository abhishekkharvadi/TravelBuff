import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import { db } from './db.js';

const TELEMETRY_SERVER_URL = 'https://telemetry.travelbuff.app/v1/telemetry';

let telemetryInterval = null;
let startupTimeout = null;

export async function initTelemetry() {
  console.log('[Telemetry] Initializing telemetry service...');
  if (process.env.DISABLE_TELEMETRY === 'true') {
    console.log('[Telemetry] Disabled via DISABLE_TELEMETRY environment variable.');
    return;
  }

  try {
    // Ensure instance identity exists
    let instanceId = await getConfig('telemetry_instance_id');
    let publicKey = await getConfig('telemetry_public_key');
    let privateKey = await getConfig('telemetry_private_key');
    let isEnabled = await getConfig('telemetry_enabled');

    // Migrate old PEM formats
    if (publicKey && publicKey.includes('-----BEGIN')) {
      publicKey = null;
      privateKey = null;
    }

    if (isEnabled === null || isEnabled === undefined) {
      isEnabled = '1';
      await setConfig('telemetry_enabled', '1');
    }

    if (!instanceId || !publicKey || !privateKey) {
      console.log('[Telemetry] Generating new cryptographic instance identity...');
      instanceId = crypto.randomUUID();
      
      const keypair = crypto.generateKeyPairSync('ed25519');
      // Extract raw 32-byte public key hex from SPKI DER (header is 12 bytes)
      publicKey = keypair.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
      // Extract raw 32-byte private key hex from PKCS8 DER (header is 16 bytes)
      privateKey = keypair.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(16).toString('hex');
      
      await setConfig('telemetry_instance_id', instanceId);
      await setConfig('telemetry_public_key', publicKey);
      await setConfig('telemetry_private_key', privateKey);
      await setConfig('telemetry_registered', '0');
    }

    if (isEnabled !== '1') {
      console.log('[Telemetry] Aborting startup: Telemetry is explicitly disabled in app_config.');
      return;
    }

    console.log('[Telemetry] Telemetry is enabled. Scheduling startup sequence...');

    // Attempt Registration and Ping immediately
    (async () => {
      try {
        const registered = await ensureRegistered(instanceId, publicKey);
        if (registered) {
          await sendTelemetryPing('startup');
        }
      } catch (err) {
        console.error('[Telemetry] Startup sequence error:', err.message);
      }
    })();

    startHeartbeatTimer();
  } catch (err) {
    console.error('[Telemetry] Initialization error:', err.message);
  }
}

function startHeartbeatTimer() {
  stopHeartbeatTimer();
  // 24 hours interval
  telemetryInterval = setInterval(async () => {
    try {
      const isEnabled = await getConfig('telemetry_enabled');
      if (isEnabled === '1') {
        const instanceId = await getConfig('telemetry_instance_id');
        const publicKey = await getConfig('telemetry_public_key');
        const registered = await ensureRegistered(instanceId, publicKey);
        if (registered) {
          await sendTelemetryPing('heartbeat');
        }
      }
    } catch (err) {
      // Silently catch
    }
  }, 24 * 60 * 60 * 1000);
}

function stopHeartbeatTimer() {
  if (telemetryInterval) clearInterval(telemetryInterval);
}

export async function setTelemetryEnabled(enabled) {
  await setConfig('telemetry_enabled', enabled ? '1' : '0');
  if (enabled) {
    startHeartbeatTimer();
    triggerManualPing().catch(() => {});
  } else {
    stopHeartbeatTimer();
  }
}

export async function getTelemetryStatus() {
  const instanceId = await getConfig('telemetry_instance_id');
  const publicKey = await getConfig('telemetry_public_key');
  const isEnabled = await getConfig('telemetry_enabled');
  const registered = await getConfig('telemetry_registered');
  const lastReported = await getConfig('telemetry_last_reported');
  
  const payloadPreview = await buildPayload('preview');

  return {
    enabled: isEnabled === '1' && process.env.DISABLE_TELEMETRY !== 'true',
    instance_id: instanceId,
    public_key: publicKey,
    registered: registered === '1',
    last_reported: lastReported || null,
    preview_payload: payloadPreview
  };
}

export async function triggerManualPing() {
  if (process.env.DISABLE_TELEMETRY === 'true') throw new Error('Disabled via env');
  const isEnabled = await getConfig('telemetry_enabled');
  if (isEnabled !== '1') throw new Error('Telemetry is disabled');
  
  const instanceId = await getConfig('telemetry_instance_id');
  const publicKey = await getConfig('telemetry_public_key');
  
  await ensureRegistered(instanceId, publicKey);
  await sendTelemetryPing('manual');
}

async function ensureRegistered(instanceId, publicKey) {
  const isRegistered = await getConfig('telemetry_registered');
  if (isRegistered === '1') {
    console.log('[Telemetry] Instance already registered. Skipping handshake.');
    return true;
  }

  try {
    console.log(`[Telemetry] Requesting PoW challenge for instance: ${instanceId}`);
    const challengeRes = await axios.get(`${TELEMETRY_SERVER_URL}/challenge?instance_id=${instanceId}`, { timeout: 5000 });
    const { challenge, difficulty = 4 } = challengeRes.data;
    
    if (!challenge) {
      console.error('[Telemetry] Server returned empty challenge.');
      return false;
    }

    console.log(`[Telemetry] Received challenge. Solving PoW (difficulty: ${difficulty})...`);
    const targetPrefix = '0'.repeat(difficulty);
    let nonce = 0;
    while (true) {
      const hash = crypto.createHash('sha256').update(`${challenge}:${nonce}`).digest('hex');
      if (hash.startsWith(targetPrefix)) {
        break;
      }
      nonce++;
    }

    console.log(`[Telemetry] PoW solved. Dispatching registration payload...`);
    const registerRes = await axios.post(`${TELEMETRY_SERVER_URL}/register`, {
      instance_id: instanceId,
      public_key: publicKey,
      challenge: challenge,
      nonce: nonce
    }, { timeout: 5000 });

    if (registerRes.status === 201 || registerRes.status === 200) {
      await setConfig('telemetry_registered', '1');
      console.log('[Telemetry] Instance registered successfully.');
      return true;
    } else {
      console.error(`[Telemetry] Registration failed with status: ${registerRes.status}`);
    }
  } catch (err) {
    console.error('[Telemetry] Registration handshake error:', err.response ? JSON.stringify(err.response.data) : err.message);
    return false;
  }
  return false;
}

function signPayload(payloadStr, privateKeyHex) {
  try {
    const rawSeed = Buffer.from(privateKeyHex, 'hex');
    // PKCS#8 DER header for Ed25519 (16 bytes): 302e020100300506032b657004220420
    const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const fullPkcs8 = Buffer.concat([pkcs8Header, rawSeed]);
    
    const privateKey = crypto.createPrivateKey({
      key: fullPkcs8,
      format: 'der',
      type: 'pkcs8',
    });
    
    return crypto.sign(null, Buffer.from(payloadStr, 'utf8'), privateKey).toString('hex');
  } catch (err) {
    console.error('[Telemetry] Failed to sign payload:', err);
    return null;
  }
}

async function sendTelemetryPing(eventType) {
  try {
    console.log(`[Telemetry] Preparing to dispatch '${eventType}' event...`);
    const instanceId = await getConfig('telemetry_instance_id');
    const privateKey = await getConfig('telemetry_private_key');
    
    if (!instanceId || !privateKey) {
      console.error('[Telemetry] Missing instance identity or private key. Cannot dispatch ping.');
      return;
    }

    const payload = await buildPayload(eventType);
    const payloadStr = JSON.stringify(payload);
    
    const signature = signPayload(payloadStr, privateKey);
    if (!signature) {
      console.error('[Telemetry] Aborting ping: Failed to generate signature.');
      return;
    }

    const timestamp = new Date().toISOString();

    console.log(`[Telemetry] Dispatching '${eventType}' payload to server...`);
    await axios.post(TELEMETRY_SERVER_URL, payloadStr, {
      headers: {
        'Content-Type': 'application/json',
        'X-Instance-ID': instanceId,
        'X-Signature': signature,
        'X-Timestamp': timestamp
      },
      timeout: 5000
    });

    await setConfig('telemetry_last_reported', timestamp);
    console.log(`[Telemetry] Ping ('${eventType}') dispatched successfully.`);
  } catch (err) {
    if (err.response && err.response.data && err.response.data.requires_registration) {
      console.warn('[Telemetry] Server indicates instance is not registered. Resetting local registration flag...');
      await setConfig('telemetry_registered', '0');
      // Trigger a manual registration attempt in the background
      const instanceId = await getConfig('telemetry_instance_id');
      const publicKey = await getConfig('telemetry_public_key');
      ensureRegistered(instanceId, publicKey).catch(() => {});
    } else {
      console.error(`[Telemetry] Ping ('${eventType}') error:`, err.response ? JSON.stringify(err.response.data) : err.message);
    }
  }
}

async function buildPayload(eventType) {
  const instanceId = await getConfig('telemetry_instance_id');
  
  // App Version
  let appVersion = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    appVersion = pkg.version;
  } catch (e) {}

  // Scale Buckets
  let tripsCount = 0;
  let locsCount = 0;
  try {
    const tripsRes = await db.get('SELECT COUNT(*) as count FROM trips');
    tripsCount = tripsRes?.count || 0;
    const locsRes = await db.get('SELECT COUNT(*) as count FROM locations');
    locsCount = locsRes?.count || 0;
  } catch (e) {}

  const tripsBucket = tripsCount === 0 ? "0" : tripsCount <= 5 ? "1-5" : tripsCount <= 20 ? "6-20" : "20+";
  const locsBucket = locsCount === 0 ? "0" : locsCount <= 50 ? "1-50" : locsCount <= 200 ? "50-200" : "200+";

  // Features
  let hasImmich = false, hasOwntracks = false, hasGoogleMaps = false, aiProvider = 'none';
  try {
    const configs = await db.all('SELECT immich_url, owntracks_key, ai_settings FROM user_configs');
    for (const conf of configs) {
      if (conf.immich_url) hasImmich = true;
      if (conf.owntracks_key) hasOwntracks = true;
      if (conf.ai_settings) {
        try {
          const ai = JSON.parse(conf.ai_settings);
          if (ai.provider && ai.provider !== 'none') aiProvider = ai.provider;
        } catch (e) {}
      }
    }
    
    // Check if google maps is configured (env or any user)
    if (process.env.VITE_GOOGLE_MAPS_API_KEY) hasGoogleMaps = true;
  } catch (e) {}

  return {
    instance_id: instanceId,
    event_type: eventType,
    app_version: appVersion,
    platform: process.platform,
    arch: process.arch,
    is_docker: fs.existsSync('/.dockerenv') || process.env.IS_DOCKER === 'true',
    node_version: process.version,
    features: {
      has_immich: hasImmich,
      has_owntracks: hasOwntracks,
      has_google_maps: hasGoogleMaps,
      ai_provider: aiProvider
    },
    scale_buckets: {
      trips: tripsBucket,
      locations: locsBucket
    },
    uptime_hours: Math.floor(process.uptime() / 3600)
  };
}

async function getConfig(key) {
  try {
    const row = await db.get('SELECT value FROM app_config WHERE key = ?', [key]);
    return row ? row.value : null;
  } catch (err) {
    return null;
  }
}

async function setConfig(key, value) {
  try {
    await db.run('INSERT OR REPLACE INTO app_config (key, value) VALUES (?, ?)', [key, value]);
  } catch (err) {}
}
