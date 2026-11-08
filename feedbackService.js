import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import axios from 'axios';
import { db } from './db.js';

const FEEDBACK_SERVER_URL = process.env.FEEDBACK_SERVER_URL || 'https://telemetry.travelbuff.app/v1/feedback';
const TELEMETRY_SERVER_URL = 'https://telemetry.travelbuff.app/v1/telemetry';

const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes
const HOURLY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_PER_HOUR = 5;
const MAX_PER_DAY = 15;
const MAX_PAYLOAD_BYTES = 8192;

async function getConfig(key) {
  const row = await db.get('SELECT value FROM app_config WHERE key = ?', [key]);
  return row ? row.value : null;
}

async function setConfig(key, value) {
  await db.run(
    'INSERT INTO app_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
}

async function ensureInstanceIdentity() {
  let instanceId = await getConfig('telemetry_instance_id');
  let publicKey = await getConfig('telemetry_public_key');
  let privateKey = await getConfig('telemetry_private_key');

  if (publicKey && publicKey.includes('-----BEGIN')) {
    publicKey = null;
    privateKey = null;
  }

  if (!instanceId || !publicKey || !privateKey) {
    instanceId = crypto.randomUUID();
    const keypair = crypto.generateKeyPairSync('ed25519');
    publicKey = keypair.publicKey.export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
    privateKey = keypair.privateKey.export({ format: 'der', type: 'pkcs8' }).subarray(16).toString('hex');

    await setConfig('telemetry_instance_id', instanceId);
    await setConfig('telemetry_public_key', publicKey);
    await setConfig('telemetry_private_key', privateKey);
    await setConfig('telemetry_registered', '0');
  }

  return { instanceId, publicKey, privateKey };
}

function solvePoW(challenge, difficulty = 4) {
  const safeDifficulty = Math.min(Math.max(Number(difficulty) || 4, 1), 6);
  const targetPrefix = '0'.repeat(safeDifficulty);
  let nonce = 0;
  while (true) {
    const hash = crypto.createHash('sha256').update(`${challenge}:${nonce}`).digest('hex');
    if (hash.startsWith(targetPrefix)) {
      return String(nonce);
    }
    nonce++;
  }
}

function signEd25519(dataStr, privateKeyHex) {
  try {
    const rawSeed = Buffer.from(privateKeyHex, 'hex');
    const pkcs8Header = Buffer.from('302e020100300506032b657004220420', 'hex');
    const fullPkcs8 = Buffer.concat([pkcs8Header, rawSeed]);
    const privateKey = crypto.createPrivateKey({
      key: fullPkcs8,
      format: 'der',
      type: 'pkcs8'
    });
    return crypto.sign(null, Buffer.from(dataStr, 'utf8'), privateKey).toString('hex');
  } catch (err) {
    console.error('[Feedback] Ed25519 sign error:', err.message);
    return null;
  }
}

function sanitizeText(str, maxLength) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLength);
}

export async function getFeedbackQuotaStatus(userId) {
  const now = Date.now();
  const oneHourAgo = now - HOURLY_WINDOW_MS;
  const oneDayAgo = now - DAILY_WINDOW_MS;

  const recentRows = await db.all(
    'SELECT created_at FROM feedback_submissions WHERE created_at >= ? ORDER BY created_at DESC',
    [oneDayAgo]
  );

  const lastSubmission = recentRows.length > 0 ? Number(recentRows[0].created_at) : 0;
  const elapsedSinceLast = now - lastSubmission;
  const cooldownRemainingSec = lastSubmission && elapsedSinceLast < COOLDOWN_MS
    ? Math.ceil((COOLDOWN_MS - elapsedSinceLast) / 1000)
    : 0;

  const hourlyCount = recentRows.filter(r => Number(r.created_at) >= oneHourAgo).length;
  const dailyCount = recentRows.length;

  const hourlyRemaining = Math.max(0, MAX_PER_HOUR - hourlyCount);
  const dailyRemaining = Math.max(0, MAX_PER_DAY - dailyCount);

  return {
    canSubmit: cooldownRemainingSec === 0 && hourlyRemaining > 0 && dailyRemaining > 0,
    cooldownRemainingSec,
    hourlyRemaining,
    dailyRemaining,
    maxPerHour: MAX_PER_HOUR,
    maxPerDay: MAX_PER_DAY
  };
}

export async function submitFeedback({ userId, category, title, message, contactEmail, diagnostics }) {
  const validCategories = ['bug', 'feature', 'other'];
  const cleanCategory = validCategories.includes(category) ? category : 'other';
  const cleanTitle = sanitizeText(title, 120);
  const cleanMessage = sanitizeText(message, 2000);
  const cleanEmail = contactEmail ? sanitizeText(contactEmail, 150) : null;

  if (cleanTitle.length < 5) {
    const err = new Error('Subject must be at least 5 characters long.');
    err.statusCode = 400;
    throw err;
  }
  if (cleanMessage.length < 15) {
    const err = new Error('Feedback description must be at least 15 characters long.');
    err.statusCode = 400;
    throw err;
  }
  if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    const err = new Error('Please enter a valid contact email address or leave it blank.');
    err.statusCode = 400;
    throw err;
  }

  // Check rate limits
  const quota = await getFeedbackQuotaStatus(userId);
  if (quota.cooldownRemainingSec > 0) {
    const err = new Error(`Please wait ${quota.cooldownRemainingSec} seconds before submitting another feedback.`);
    err.statusCode = 429;
    throw err;
  }
  if (quota.hourlyRemaining <= 0) {
    const err = new Error(`Hourly feedback limit (${MAX_PER_HOUR}/hour) reached. Please try again later.`);
    err.statusCode = 429;
    throw err;
  }
  if (quota.dailyRemaining <= 0) {
    const err = new Error(`Daily feedback limit (${MAX_PER_DAY}/day) reached. Please try again tomorrow.`);
    err.statusCode = 429;
    throw err;
  }

  const { instanceId, publicKey, privateKey } = await ensureInstanceIdentity();

  // Content deduplication check within last 24h
  const contentHash = crypto
    .createHash('sha256')
    .update(`${instanceId}:${cleanCategory}:${cleanTitle.toLowerCase()}:${cleanMessage.toLowerCase()}`)
    .digest('hex');

  const duplicate = await db.get(
    'SELECT id FROM feedback_submissions WHERE content_hash = ? AND created_at >= ?',
    [contentHash, Date.now() - DAILY_WINDOW_MS]
  );
  if (duplicate) {
    const err = new Error('This exact feedback has already been submitted in the last 24 hours.');
    err.statusCode = 409;
    throw err;
  }

  // Build safe diagnostics if opted in
  let safeDiagnostics = null;
  if (diagnostics && typeof diagnostics === 'object') {
    let appVersion = '7.9.0';
    try {
      const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
      appVersion = pkg.version || appVersion;
    } catch (_) {}

    safeDiagnostics = {
      app_version: sanitizeText(String(diagnostics.app_version || appVersion), 32),
      active_tab: sanitizeText(String(diagnostics.active_tab || 'unknown'), 40),
      platform: sanitizeText(String(diagnostics.platform || `${os.platform()}-${os.arch()}`), 64),
      viewport: sanitizeText(String(diagnostics.viewport || ''), 32),
      sync_status: sanitizeText(String(diagnostics.sync_status || 'online'), 20),
      docker_env: fs.existsSync('/.dockerenv')
    };
  }

  const payload = {
    category: cleanCategory,
    title: cleanTitle,
    message: cleanMessage,
    contact_email: cleanEmail,
    diagnostics: safeDiagnostics
  };

  const payloadStr = JSON.stringify(payload);
  if (Buffer.byteLength(payloadStr, 'utf8') > MAX_PAYLOAD_BYTES) {
    const err = new Error('Feedback payload exceeds maximum allowed size (8 KB).');
    err.statusCode = 413;
    throw err;
  }

  // Ensure telemetry registration if possible (non-blocking if telemetry endpoint is unreachable)
  const isRegistered = await getConfig('telemetry_registered');
  if (isRegistered !== '1') {
    try {
      const regChal = await axios.get(`${TELEMETRY_SERVER_URL}/challenge?instance_id=${instanceId}`, { timeout: 4000 });
      if (regChal.data && regChal.data.challenge) {
        const regNonce = solvePoW(regChal.data.challenge, regChal.data.difficulty || 4);
        const regRes = await axios.post(`${TELEMETRY_SERVER_URL}/register`, {
          instance_id: instanceId,
          public_key: publicKey,
          challenge: regChal.data.challenge,
          nonce: Number(regNonce)
        }, { timeout: 4000 });
        if (regRes.status === 200 || regRes.status === 201) {
          await setConfig('telemetry_registered', '1');
        }
      }
    } catch (_) {
      // Continue; X-Public-Key is also sent with feedback for direct verification
    }
  }

  // Request per-submission PoW challenge from admin.travelbuff.app
  let challenge = crypto.randomBytes(16).toString('hex');
  let difficulty = 4;
  try {
    const challengeRes = await axios.get(`${FEEDBACK_SERVER_URL}/challenge?instance_id=${encodeURIComponent(instanceId)}`, {
      timeout: 5000
    });
    if (challengeRes.data && challengeRes.data.challenge) {
      challenge = challengeRes.data.challenge;
      difficulty = challengeRes.data.difficulty || 4;
    }
  } catch (_) {
    // Fallback to locally generated PoW challenge if remote /challenge endpoint is not yet active
  }

  const powNonce = solvePoW(challenge, difficulty);
  const timestamp = String(Date.now());
  const canonicalSignature = signEd25519(`${instanceId}:${timestamp}:${payloadStr}`, privateKey);
  const bodySignature = signEd25519(payloadStr, privateKey);

  if (!canonicalSignature || !bodySignature) {
    const err = new Error('Failed to cryptographically sign feedback payload.');
    err.statusCode = 500;
    throw err;
  }

  let remoteFeedbackId = null;
  try {
    const response = await axios.post(FEEDBACK_SERVER_URL, payloadStr, {
      headers: {
        'Content-Type': 'application/json',
        'X-Instance-ID': instanceId,
        'X-Public-Key': publicKey,
        'X-Timestamp': timestamp,
        'X-Signature': canonicalSignature,
        'X-Payload-Signature': bodySignature,
        'X-PoW-Challenge': challenge,
        'X-PoW-Nonce': powNonce
      },
      maxRedirects: 0,
      timeout: 10000
    });
    if (typeof response.data !== 'object' || !response.data || (!response.data.feedback_id && !response.data.id)) {
      throw new Error('Unexpected response from feedback server.');
    }
    remoteFeedbackId = response.data?.feedback_id || response.data?.id || null;
  } catch (err) {
    const remoteMsg = err.response?.data?.error || err.response?.data?.message;
    const status = err.response?.status;
    if (status === 429) {
      const rateErr = new Error(remoteMsg || 'The feedback server is rate-limiting requests. Please try again later.');
      rateErr.statusCode = 429;
      throw rateErr;
    }
    const forwardErr = new Error(
      remoteMsg || 'Unable to reach admin.travelbuff.app right now. Please check your internet connection or try again later.'
    );
    forwardErr.statusCode = status && status >= 400 && status < 600 ? status : 502;
    throw forwardErr;
  }

  const localId = crypto.randomUUID();
  await db.run(
    `INSERT INTO feedback_submissions (id, user_id, category, title, content_hash, remote_feedback_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [localId, userId, cleanCategory, cleanTitle, contentHash, remoteFeedbackId, Date.now()]
  );

  return {
    id: localId,
    feedback_id: remoteFeedbackId || `FB-${localId.slice(0, 8).toUpperCase()}`,
    quota: await getFeedbackQuotaStatus(userId)
  };
}
