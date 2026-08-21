import crypto from 'crypto';
import axios from 'axios';

const TELEMETRY_SERVER_URL = 'https://telemetry.travelbuff.app/v1/telemetry';
const instanceId = crypto.randomUUID();
const keypair = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

async function run() {
  try {
    const challengeRes = await axios.get(`${TELEMETRY_SERVER_URL}/challenge?instance_id=${instanceId}`);
    const { challenge, difficulty = 4 } = challengeRes.data;
    const targetPrefix = '0'.repeat(difficulty);
    let nonce = 0;
    while (true) {
      const hash = crypto.createHash('sha256').update(`${challenge}:${nonce}`).digest('hex');
      if (hash.startsWith(targetPrefix)) break;
      nonce++;
    }
    
    console.log('Registering...');
    await axios.post(`${TELEMETRY_SERVER_URL}/register`, {
      instance_id: instanceId,
      public_key: keypair.publicKey,
      challenge, nonce
    });
    console.log('Registered!');

    const payload = {
      instance_id: instanceId,
      event_type: 'startup',
      app_version: '7.1.0'
    };
    const payloadStr = JSON.stringify(payload);
    const signature = crypto.sign(null, Buffer.from(payloadStr, 'utf8'), keypair.privateKey).toString('hex');
    
    console.log('Pinging...');
    const pingRes = await axios.post(TELEMETRY_SERVER_URL, payloadStr, {
      headers: {
        'Content-Type': 'application/json',
        'X-Instance-ID': instanceId,
        'X-Signature': signature,
        'X-Timestamp': new Date().toISOString()
      }
    });
    console.log('Ping success!', pingRes.status);
  } catch (err) {
    console.error(err.response ? err.response.data : err.message);
  }
}
run();
