import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path, { dirname, join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { WebSocketServer } from 'ws';
import url from 'url';
import { db, initDatabase, seedDefaultTags, seedDefaultCategories, cleanupDuplicateCopyPlaces } from './db.js';
import { 
  initTelemetry, 
  getTelemetryStatus, 
  setTelemetryEnabled, 
  triggerManualPing 
} from './telemetryService.js';
import { processMarkdownImport, geocode } from './importService.js';
import axios from 'axios';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
let JWT_SECRET = process.env.JWT_SECRET || 'travelbuff-super-secret-key-12345';

async function resolveJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  try {
    const row = await db.get("SELECT value FROM app_config WHERE key = 'jwt_secret'");
    if (row && row.value) {
      return row.value;
    }
    const newSecret = crypto.randomBytes(32).toString('hex');
    await db.run("INSERT OR REPLACE INTO app_config (key, value) VALUES ('jwt_secret', ?)", [newSecret]);
    console.log('[Auth] Generated and persisted new JWT_SECRET in database.');
    return newSecret;
  } catch (err) {
    console.error('[Auth] Error resolving JWT_SECRET from database:', err);
    return 'travelbuff-super-secret-key-12345';
  }
}

const app = express();
app.use(cors({
  exposedHeaders: ['X-Refreshed-Token']
}));
app.use(express.json({ limit: '500mb' }));

// Wrap express with HTTP server
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket connection upgrade with JWT validation
server.on('upgrade', (request, socket, head) => {
  const parsed = url.parse(request.url, true);
  if (parsed.pathname === '/api/ws') {
    const token = parsed.query.token;
    if (!token) {
      console.warn('[WebSocket] Upgrade failed: Missing token in connection query');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    try {
      let decoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (_) {
        decoded = jwt.verify(token, 'travelbuff-super-secret-key-12345');
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.userId = decoded.id;
        wss.emit('connection', ws, request);
      });
    } catch (err) {
      console.warn(`[WebSocket] Upgrade rejected for user token: ${err.message}`);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  } else {
    socket.destroy();
  }
});
// Mutex to prevent concurrent database transactions in SQLite
class Mutex {
  constructor() {
    this.queue = Promise.resolve();
  }
  async run(fn) {
    const previous = this.queue;
    let resolveNext;
    this.queue = new Promise(resolve => { resolveNext = resolve; });
    try {
      await previous;
      return await fn();
    } finally {
      resolveNext();
    }
  }
}
const dbMutex = new Mutex();


// Broadcast changes to user's client sockets
function notifyUserClients(userId, excludeWs = null) {
  wss.clients.forEach((client) => {
    if (client.userId === userId && client.readyState === 1 && client !== excludeWs) {
      client.send(JSON.stringify({ type: 'SYNC_REQUIRED' }));
    }
  });
}

wss.on('connection', (ws) => {
  console.log(`[WebSocket] Client connected for user ID: ${ws.userId}`);
  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected for user ID: ${ws.userId}`);
  });
});

// Ensure upload directory exists
const UPLOADS_DIR = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

// Setup Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${uniqueSuffix}${extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ==========================================
// Middleware: Authentication
// ==========================================

// Healthcheck endpoint
app.get('/api/health', async (req, res) => {
  try {
    await db.get('SELECT 1'); // verify db connection
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      version: process.env.npm_package_version || 'unknown',
      database: 'connected'
    });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
  }
});
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  if (!token) return res.status(401).json({ error: 'Access token required' });

  let decodedUser;
  let usedFallback = false;

  try {
    decodedUser = jwt.verify(token, JWT_SECRET);
  } catch (err1) {
    try {
      decodedUser = jwt.verify(token, 'travelbuff-super-secret-key-12345');
      usedFallback = true;
    } catch (err2) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
  }

  if (decodedUser) {
    if (usedFallback && JWT_SECRET !== 'travelbuff-super-secret-key-12345') {
      try {
        const refreshedToken = jwt.sign(
          { id: decodedUser.id, username: decodedUser.username, is_admin: decodedUser.is_admin || 0 },
          JWT_SECRET,
          { expiresIn: '3650d' }
        );
        res.setHeader('X-Refreshed-Token', refreshedToken);
      } catch (signErr) {
        console.warn('[Auth] Failed to generate refreshed token on fallback match:', signErr);
      }
    }
    req.user = decodedUser;
    next();
  }
}

function authenticateAdminToken(req, res, next) {
  authenticateToken(req, res, () => {
    if (!req.user || !req.user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// ==========================================
// Auth API
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Auto-assign admin role (is_admin = 1) if this is the very first user in database
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const isAdmin = userCount.count === 0 ? 1 : 0;

    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const owntracksKey = crypto.randomBytes(16).toString('hex');

    await db.run(
      'INSERT INTO users (id, username, password_hash, is_admin) VALUES (?, ?, ?, ?)',
      [userId, username, hash, isAdmin]
    );

    await db.run(
      'INSERT INTO user_configs (user_id, owntracks_key) VALUES (?, ?)',
      [userId, owntracksKey]
    );

    await seedDefaultTags(userId);
    await seedDefaultCategories(userId);

    const token = jwt.sign({ id: userId, username, is_admin: isAdmin }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username, userId, isAdmin, owntracksKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password, trustDevice } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const config = await db.get('SELECT owntracks_key FROM user_configs WHERE user_id = ?', [user.id]);
    
    // Set longer expiration for trusted devices, e.g. 10 years, else 1 day
    const expiresIn = trustDevice ? '3650d' : '1d';
    const isAdmin = user.is_admin || 0;
    const token = jwt.sign({ id: user.id, username: user.username, is_admin: isAdmin }, JWT_SECRET, { expiresIn });
    
    res.json({ 
      token, 
      username: user.username, 
      userId: user.id,
      isAdmin,
      profilePicture: user.profile_picture,
      owntracksKey: config ? config.owntracks_key : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const config = await db.get('SELECT * FROM user_configs WHERE user_id = ?', [req.user.id]);
    const user = await db.get('SELECT profile_picture, is_admin FROM users WHERE id = ?', [req.user.id]);
    res.json({ 
      id: req.user.id, 
      username: req.user.username, 
      isAdmin: user ? (user.is_admin || 0) : 0, 
      config, 
      profilePicture: user ? user.profile_picture : null 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/refresh', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, is_admin, profile_picture FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, is_admin: user.is_admin || 0 },
      JWT_SECRET,
      { expiresIn: '3650d' }
    );
    res.json({
      token,
      userId: user.id,
      username: user.username,
      isAdmin: user.is_admin || 0,
      profilePicture: user.profile_picture
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Admin User Management API
// ==========================================
app.get('/api/admin/users', authenticateAdminToken, async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, is_admin, profile_picture, created_at FROM users ORDER BY created_at ASC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users/:userId/reset-password', authenticateAdminToken, async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters long' });
  }
  try {
    const targetUser = await db.get('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
    res.json({ success: true, message: `Password for "${targetUser.username}" updated successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Admin Telemetry API
// ==========================================
app.get('/api/admin/telemetry/status', authenticateAdminToken, async (req, res) => {
  try {
    const status = await getTelemetryStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/telemetry/toggle', authenticateAdminToken, async (req, res) => {
  try {
    const { enabled } = req.body;
    await setTelemetryEnabled(enabled);
    res.json({ success: true, enabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/telemetry/ping', authenticateAdminToken, async (req, res) => {
  try {
    await triggerManualPing();
    res.json({ success: true, message: 'Test ping dispatched successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:userId', authenticateAdminToken, async (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own active admin account' });
  }

  try {
    const targetUser = await db.get('SELECT id, username FROM users WHERE id = ?', [userId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1. Collect user's location & place IDs
    const locations = await db.all('SELECT id FROM locations WHERE user_id = ?', [userId]);
    const locationIds = locations.map(l => l.id);
    const places = await db.all('SELECT id FROM places WHERE user_id = ?', [userId]);
    const placeIds = places.map(p => p.id);
    const entityIds = [...locationIds, ...placeIds];

    // 2. Collect user's trip IDs
    const trips = await db.all('SELECT id FROM trips WHERE user_id = ?', [userId]);
    const tripIds = trips.map(t => t.id);

    // 3. Collect uploaded media files to delete from disk
    const filesToDelete = new Set();
    if (entityIds.length > 0) {
      const placeholders = entityIds.map(() => '?').join(',');
      const photos = await db.all(`SELECT file_path FROM entity_photos WHERE entity_id IN (${placeholders})`, entityIds);
      photos.forEach(p => { if (p.file_path) filesToDelete.add(p.file_path); });
    }
    if (tripIds.length > 0) {
      const placeholders = tripIds.map(() => '?').join(',');
      const reservations = await db.all(`SELECT file_path FROM reservations WHERE trip_id IN (${placeholders})`, tripIds);
      reservations.forEach(r => { if (r.file_path) filesToDelete.add(r.file_path); });
      const expenses = await db.all(`SELECT receipt_path FROM expenses WHERE trip_id IN (${placeholders})`, tripIds);
      expenses.forEach(e => { if (e.receipt_path) filesToDelete.add(e.receipt_path); });
    }

    // 4. Delete physical files from disk
    for (const relPath of filesToDelete) {
      const filename = basename(relPath);
      const fullPath = join(UPLOADS_DIR, filename);
      if (fs.existsSync(fullPath)) {
        try { await fs.promises.unlink(fullPath); } catch (_) {}
      }
    }

    // 5. Delete dependent table rows
    if (entityIds.length > 0) {
      const placeholders = entityIds.map(() => '?').join(',');
      await db.run(`DELETE FROM entity_tags WHERE entity_id IN (${placeholders})`, entityIds);
      await db.run(`DELETE FROM entity_photos WHERE entity_id IN (${placeholders})`, entityIds);
    }
    await db.run('DELETE FROM places WHERE user_id = ?', [userId]);

    if (tripIds.length > 0) {
      const placeholders = tripIds.map(() => '?').join(',');
      await db.run(`DELETE FROM itinerary_items WHERE trip_id IN (${placeholders})`, tripIds);
      await db.run(`DELETE FROM reservations WHERE trip_id IN (${placeholders})`, tripIds);
      await db.run(`DELETE FROM expenses WHERE trip_id IN (${placeholders})`, tripIds);
      await db.run(`DELETE FROM trip_notes WHERE trip_id IN (${placeholders})`, tripIds);
      await db.run(`DELETE FROM trip_currency_rates WHERE trip_id IN (${placeholders})`, tripIds);
    }

    // 6. Delete user-owned tables & account
    await db.run('DELETE FROM locations WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM collections WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM trips WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM custom_categories WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM tags WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM gps_logs WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM ai_imports WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM saved_markdowns WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM people WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM user_addresses WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM user_configs WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM users WHERE id = ?', [userId]);

    console.log(`[Admin] Permanently deleted user "${targetUser.username}" (${userId}) and all associated data.`);
    res.json({ success: true, message: `User "${targetUser.username}" and all associated data deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Config & Integration API
// ==========================================
app.post('/api/config', authenticateToken, async (req, res) => {
  const { immich_url, immich_key, immich_alt_url, base_currency, ai_settings } = req.body;
  try {
    await db.run(
      `UPDATE user_configs SET immich_url = ?, immich_key = ?, immich_alt_url = ?, base_currency = ?, ai_settings = ? WHERE user_id = ?`,
      [immich_url || null, immich_key || null, immich_alt_url || null, base_currency || 'USD', ai_settings || null, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/log-error', async (req, res) => {
  const { errorMsg, context } = req.body;
  const logFilePath = join(__dirname, 'server_error.log');
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${context || 'CLIENT'}] ${errorMsg}\n`;
  
  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Failed to write to server_error.log:', err);
      return res.status(500).json({ error: 'Failed to write log' });
    }
    res.json({ success: true });
  });
});

// ==========================================
// Account Management API
// ==========================================
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT username, profile_picture FROM users WHERE id = ?', [req.user.id]);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/profile-picture', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  try {
    await db.run('UPDATE users SET profile_picture = ? WHERE id = ?', [fileUrl, req.user.id]);
    res.json({ profilePicture: fileUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }

  try {
    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashed, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// OwnTracks Public Webhook (No JWT, identified by token)
// ==========================================
app.post('/api/owntracks/webhook/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const config = await db.get('SELECT user_id FROM user_configs WHERE owntracks_key = ?', [token]);
    if (!config) {
      return res.status(403).json({ error: 'Invalid web-hook token' });
    }

    const { _type, lat, lon, acc, tst } = req.body;
    // OwnTracks sends different packets; we only log coordinates
    if (_type === 'location' && lat && lon) {
      const id = crypto.randomUUID();
      const timestamp = tst || Math.floor(Date.now() / 1000);
      
      await db.run(
        `INSERT INTO gps_logs (id, user_id, latitude, longitude, accuracy, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, config.user_id, lat, lon, acc || null, timestamp]
      );
      res.json({ status: 'ok', msg: 'Coordinate logged' });
      notifyUserClients(config.user_id);
      return;
    }

    res.json({ status: 'ignored', msg: 'Not a location payload' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Immich API Proxy (To avoid CORS issues in browser)
// ==========================================
async function fetchImmich(url, apiKey, endpoint) {
  return new Promise((resolve, reject) => {
    const headers = { 'x-api-key': apiKey };
    const requestUrl = `${url.replace(/\/$/, '')}/api/${endpoint}`;
    const client = requestUrl.startsWith('https') ? https : http;
    
    const req = client.get(requestUrl, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error('Invalid JSON response from Immich'));
        }
      });
    });
    
    req.on('error', (err) => reject(err));
  });
}

function proxyImmichStream(url, apiKey, endpoint, res) {
  const headers = { 'x-api-key': apiKey };
  const requestUrl = `${url.replace(/\/$/, '')}/api/${endpoint}`;
  const client = requestUrl.startsWith('https') ? https : http;

  const req = client.get(requestUrl, { headers }, (remoteRes) => {
    res.writeHead(remoteRes.statusCode, remoteRes.headers);
    remoteRes.pipe(res);
  });

  req.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });
}

app.post('/api/immich/test', authenticateToken, async (req, res) => {
  const { immich_url, immich_key } = req.body;
  if (!immich_url || !immich_key) {
    return res.status(400).json({ error: 'URL and Key are required for testing' });
  }
  try {
    const version = await fetchImmich(immich_url, immich_key, 'server/version');
    res.json(version);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/immich/albums', authenticateToken, async (req, res) => {
  try {
    const config = await db.get('SELECT immich_url, immich_key FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.immich_url || !config.immich_key) {
      return res.json([]);
    }

    const albums = await fetchImmich(config.immich_url, config.immich_key, 'albums');
    res.json(albums);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/immich/album/:albumId', authenticateToken, async (req, res) => {
  const { albumId } = req.params;
  try {
    const config = await db.get('SELECT immich_url, immich_key FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.immich_url || !config.immich_key) {
      return res.json({ assets: [] });
    }

    const albumDetails = await fetchImmich(config.immich_url, config.immich_key, `albums/${albumId}`);
    res.json(albumDetails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/immich/people', authenticateToken, async (req, res) => {
  try {
    const config = await db.get('SELECT immich_url, immich_key FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.immich_url || !config.immich_key) {
      return res.json({ people: [] });
    }

    const people = await fetchImmich(config.immich_url, config.immich_key, 'people');
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/immich/asset/thumbnail/:assetId', authenticateToken, async (req, res) => {
  const { assetId } = req.params;
  try {
    const config = await db.get('SELECT immich_url, immich_key FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.immich_url || !config.immich_key) {
      return res.status(204).end();
    }

    proxyImmichStream(config.immich_url, config.immich_key, `assets/${assetId}/thumbnail`, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/immich/asset/original/:assetId', authenticateToken, async (req, res) => {
  const { assetId } = req.params;
  try {
    const config = await db.get('SELECT immich_url, immich_key FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.immich_url || !config.immich_key) {
      return res.status(204).end();
    }

    proxyImmichStream(config.immich_url, config.immich_key, `assets/${assetId}/original`, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/immich/person/thumbnail/:personId', authenticateToken, async (req, res) => {
  const { personId } = req.params;
  try {
    const config = await db.get('SELECT immich_url, immich_key FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.immich_url || !config.immich_key) {
      return res.status(204).end();
    }

    proxyImmichStream(config.immich_url, config.immich_key, `people/${personId}/thumbnail`, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// OwnTracks Distance Pull API
// ==========================================
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // distance in km
}

app.get('/api/trips/:tripId/owntracks-distance', authenticateToken, async (req, res) => {
  const { tripId } = req.params;
  try {
    const trip = await db.get('SELECT * FROM trips WHERE id = ? AND user_id = ?', [tripId, req.user.id]);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!trip.start_date || !trip.end_date) {
      return res.status(400).json({ error: 'Trip start and end dates are required to retrieve distance' });
    }

    // Convert trip dates to unix timestamps
    const startUnix = Math.floor(new Date(trip.start_date + 'T00:00:00').getTime() / 1000);
    const endUnix = Math.floor(new Date(trip.end_date + 'T23:59:59').getTime() / 1000);

    // Fetch user logs
    const logs = await db.all(
      `SELECT latitude, longitude, timestamp, accuracy FROM gps_logs 
       WHERE user_id = ? AND timestamp >= ? AND timestamp <= ? 
       ORDER BY timestamp ASC`,
      [req.user.id, startUnix, endUnix]
    );

    // Group logs by local date and compute distance
    const distanceByDay = {};
    let currentDate = trip.start_date;
    const endStr = trip.end_date;

    const datesList = [];
    let d = new Date(currentDate);
    const endD = new Date(endStr);
    while (d <= endD) {
      datesList.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }

    datesList.forEach(date => {
      distanceByDay[date] = 0;
    });

    // We filter coordinates with accuracy > 100m to eliminate noise
    const filteredLogs = logs.filter(log => !log.accuracy || log.accuracy <= 100);

    // Compute consecutive distances
    for (let i = 1; i < filteredLogs.length; i++) {
      const p1 = filteredLogs[i - 1];
      const p2 = filteredLogs[i];

      const dist = calculateHaversineDistance(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
      // Ensure distance isn't abnormally large (e.g. teleporting due to GPS error, limit speed to 500km/h)
      const hoursDiff = (p2.timestamp - p1.timestamp) / 3600;
      if (hoursDiff > 0 && dist / hoursDiff > 500) {
        continue; // skip outlier
      }

      // Assign to the date of p2
      const logDate = new Date(p2.timestamp * 1000).toISOString().split('T')[0];
      if (distanceByDay[logDate] !== undefined) {
        distanceByDay[logDate] += dist;
      }
    }

    // Round values
    Object.keys(distanceByDay).forEach(date => {
      distanceByDay[date] = Math.round(distanceByDay[date] * 100) / 100;
    });

    res.json({ totalKm: Object.values(distanceByDay).reduce((a, b) => a + b, 0), distanceByDay });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// File Upload API
// ==========================================
app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ fileUrl });
});

app.post('/api/import/download-url', authenticateToken, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    const contentType = response.headers.get('content-type') || '';
    let ext = '.jpg';
    if (contentType.includes('image/png')) ext = '.png';
    else if (contentType.includes('image/webp')) ext = '.webp';
    else if (contentType.includes('image/gif')) ext = '.gif';
    
    const filename = `downloaded-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    const filePath = join(UPLOADS_DIR, filename);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);
    res.json({ fileUrl: `/uploads/${filename}` });
  } catch (err) {
    console.error('Failed to download image URL:', err);
    res.status(500).json({ error: err.message });
  }
});

// Client-side Error Logger Endpoint
app.post('/api/log-error', (req, res) => {
  const { errorMsg, context } = req.body || {};
  console.error(`[Client Error Log] Context: ${context || 'Unknown'} | Message: ${errorMsg || 'No message'}`);
  res.json({ success: true });
});

// Shared Multi-Stage Resolution Engine (Used by API and Scheduler)
async function resolvePhotoAndDescription({ query, locationContext, latitude, longitude, googleMapsApiKey, loggerPrefix = 'Search-Photo' }) {
  if (!query) return { fileUrl: null, description: null, message: 'Query is required' };
  const headers = { 'User-Agent': 'TravelBuffPersonalApp/1.2 (contact-abhishek@example.com; Developer Test Instance)' };
  let imageUrl = null;
  let description = null;
  let source = 'wikimedia';

  // Helper for N-gram Substring combinations (for 4+ word names)
  const generateSubQueries = (rawQuery, locCtx) => {
    const clean = rawQuery.replace(/[,;]/g, '').trim();
    const words = clean.split(/\s+/).filter(w => w.length > 0);
    const set = new Set();
    set.add(clean);

    if (words.length >= 4) {
      // Remove common prefix descriptors (e.g. Zonal, Government, Royal, National)
      const stopPrefixes = ['zonal', 'government', 'govt', 'royal', 'national', 'state', 'district', 'central', 'the'];
      if (stopPrefixes.includes(words[0].toLowerCase())) {
        const withoutPrefix = words.slice(1).join(' ');
        if (withoutPrefix.length >= 3) set.add(withoutPrefix);
      }
      // 3-word & 2-word sliding sub-phrases
      for (let len = words.length - 1; len >= 2; len--) {
        for (let i = 0; i <= words.length - len; i++) {
          const sub = words.slice(i, i + len).join(' ');
          if (sub.length >= 4) set.add(sub);
        }
      }
    }

    const queries = Array.from(set);
    if (locCtx && locCtx.trim()) {
      queries.push(`${clean} ${locCtx.trim()}`);
    }
    return queries;
  };

  // Helper for Regex Candidate Title Matching
  const isRegexTitleMatch = (inputQuery, candidateTitle) => {
    if (!candidateTitle) return !1;
    const cleanInput = inputQuery.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const cleanCand = candidateTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const words = cleanInput.split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'near', 'via'].includes(w));
    if (words.length === 0) return true;
    let matchCount = 0;
    for (const w of words) {
      if (cleanCand.includes(w)) matchCount++;
    }
    return (matchCount / words.length) >= 0.5;
  };

  // 1. Geosearch (Coordinates-Based)
  if (latitude && longitude) {
    try {
      const geoUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gscoord=${latitude}|${longitude}&gsradius=10000&gslimit=15&format=json&origin=*`;
      const geoRes = await fetch(geoUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const geoItems = geoData?.query?.geosearch || [];
        const validGeo = geoItems.find(item => {
          const title = (item.title || '').toLowerCase();
          return title.endsWith('.jpg') || title.endsWith('.jpeg') || title.endsWith('.png') || title.endsWith('.webp');
        });
        if (validGeo) {
          const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(validGeo.title)}&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
          const infoRes = await fetch(infoUrl, { headers, signal: AbortSignal.timeout(8000) });
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            const pages = infoData?.query?.pages || {};
            const pageId = Object.keys(pages)[0];
            imageUrl = pages[pageId]?.imageinfo?.[0]?.thumburl || pages[pageId]?.imageinfo?.[0]?.url;
          }
        }
      }
    } catch (err) {
      console.error(`[${loggerPrefix}] Geosearch failed or timed out:`, err.message || err);
    }
  }

  const tryFetchWikiTitle = async (searchTitle) => {
    try {
      let cleanTitle = searchTitle;
      if (searchTitle.includes(',')) cleanTitle = searchTitle.split(',')[0].trim();
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(cleanTitle)}&prop=pageimages|extracts&pithumbsize=640&exintro=1&explaintext=1&exlimit=1&format=json&origin=*&redirects=1`;
      const wikiRes = await fetch(wikiUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const pages = wikiData?.query?.pages || {};
        const pageId = Object.keys(pages)[0];
        if (pageId && pageId !== '-1' && pages[pageId]) {
          const page = pages[pageId];
          const extractText = page.extract || '';
          const isDisambig = extractText.toLowerCase().includes('may refer to:') || extractText.toLowerCase().includes('can refer to:');
          return {
            img: page.thumbnail?.source || null,
            desc: extractText.split('\n')[0]?.trim() || null,
            isDisambig
          };
        }
      }
    } catch (err) {
      console.error(`[${loggerPrefix}] Wikipedia Page API failed for "${searchTitle}":`, err.message || err);
    }
    return null;
  };

  // 2. Multi-Stage Wikipedia Title & Substring Lookup
  const searchVariants = generateSubQueries(query, locationContext);
  for (const variant of searchVariants) {
    const wikiResult = await tryFetchWikiTitle(variant);
    if (wikiResult && !wikiResult.isDisambig) {
      if (wikiResult.img && !imageUrl) imageUrl = wikiResult.img;
      if (wikiResult.desc && !description) description = wikiResult.desc;
      if (imageUrl && description) break;
    }
  }

  // 3. Wikipedia Fuzzy Full-Text Search API (list=search) + Server-Side Regex Matching
  if (!imageUrl) {
    for (const variant of searchVariants.slice(0, 3)) {
      try {
        const srUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(variant)}&format=json&origin=*`;
        const srRes = await fetch(srUrl, { headers, signal: AbortSignal.timeout(8000) });
        if (srRes.ok) {
          const srData = await srRes.json();
          const candidates = srData?.query?.search || [];
          for (const cand of candidates.slice(0, 4)) {
            if (isRegexTitleMatch(query, cand.title)) {
              const res = await tryFetchWikiTitle(cand.title);
              if (res && res.img) {
                imageUrl = res.img;
                if (res.desc && !description) description = res.desc;
                console.log(`[${loggerPrefix}] Fuzzy Search + Regex matched candidate "${cand.title}" for input "${query}"`);
                break;
              }
            }
          }
        }
        if (imageUrl) break;
      } catch (err) {
        console.error(`[${loggerPrefix}] Wikipedia Fuzzy search failed for "${variant}":`, err.message || err);
      }
    }
  }

  // 4. Fallback: Wikimedia Commons Text Search
  if (!imageUrl) {
    for (const variant of searchVariants.slice(0, 3)) {
      try {
        const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(variant)}&srnamespace=6&format=json&origin=*`;
        const searchRes = await fetch(searchUrl, { headers, signal: AbortSignal.timeout(8000) });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const searchItems = searchData?.query?.search || [];
          const validImage = searchItems.find(item => {
            const title = (item.title || '').toLowerCase();
            return title.endsWith('.jpg') || title.endsWith('.jpeg') || title.endsWith('.png') || title.endsWith('.webp');
          });

          if (validImage) {
            const fileTitle = validImage.title;
            const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
            const infoRes = await fetch(infoUrl, { headers, signal: AbortSignal.timeout(8000) });
            if (infoRes.ok) {
              const infoData = await infoRes.json();
              const pages = infoData?.query?.pages || {};
              const pageId = Object.keys(pages)[0];
              imageUrl = pages[pageId]?.imageinfo?.[0]?.thumburl || pages[pageId]?.imageinfo?.[0]?.url;
              if (imageUrl) break;
            }
          }
        }
      } catch (err) {
        console.error(`[${loggerPrefix}] Commons search failed:`, err.message || err);
      }
    }
  }

  // 5. Tier 2 Fallback: Google Maps Places API
  const apiKeyToUse = googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY;
  if (!imageUrl && apiKeyToUse) {
    for (const gQuery of searchVariants.slice(0, 2)) {
      try {
        const gUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(gQuery)}&key=${apiKeyToUse}`;
        const gRes = await fetch(gUrl, { signal: AbortSignal.timeout(8000) });
        if (gRes.ok) {
          const gData = await gRes.json();
          const candidate = gData?.results?.[0];
          if (candidate && candidate.photos && candidate.photos.length > 0) {
            const photoRef = candidate.photos[0].photo_reference;
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoRef}&key=${apiKeyToUse}`;
            source = 'google_maps';
            break;
          }
        }
      } catch (gErr) {
        console.error(`[${loggerPrefix}] Google Places photo search failed:`, gErr.message || gErr);
      }
    }
  }

  if (!imageUrl) {
    const logName = locationContext ? `${query} (${locationContext})` : query;
    console.warn(`[${loggerPrefix}] No image resolved for "${logName}"`);
    const checkedSources = apiKeyToUse ? 'Wikipedia, Commons or Google Maps' : 'Wikipedia or Commons';
    return { fileUrl: null, description, message: `No public cover image found on ${checkedSources}` };
  }

  // Download Image Locally
  try {
    const response = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      return { fileUrl: null, description, message: `Failed to download image (HTTP ${response.status})` };
    }
    const contentType = response.headers.get('content-type') || '';
    let ext = '.jpg';
    if (contentType.includes('image/png')) ext = '.png';
    else if (contentType.includes('image/webp')) ext = '.webp';
    else if (contentType.includes('image/gif')) ext = '.gif';

    const prefix = source === 'google_maps' ? 'gmap' : 'wiki';
    const filename = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    const filePath = join(UPLOADS_DIR, filename);

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
    console.log(`[${loggerPrefix}] Successfully downloaded image for "${query}" to /uploads/${filename}`);
    return { fileUrl: `/uploads/${filename}`, description, source };
  } catch (err) {
    console.error(`[${loggerPrefix}] Failed downloading resolved image for "${query}":`, err.message || err);
    return { fileUrl: null, description, error: err.message };
  }
}

app.post('/api/import/search-photo', authenticateToken, async (req, res) => {
  try {
    const result = await resolvePhotoAndDescription({ ...req.body, loggerPrefix: 'Search-Photo' });
    res.json(result);
  } catch (err) {
    console.error('Exception in search-photo endpoint:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Sync Endpoint (Offline sync queue)
// ==========================================
app.post('/api/sync', authenticateToken, async (req, res) => {
  const { actions } = req.body; // Array of operations: { table, action: 'insert'|'update'|'delete', data }
  if (!actions || !Array.isArray(actions)) {
    return res.status(400).json({ error: 'Sync payload must be an array' });
  }

  const userId = req.user.id;

  await dbMutex.run(async () => {
    try {
      await db.exec('BEGIN TRANSACTION');

      const tablesWithUserId = [
        'user_configs',
        'locations',
        'places',
        'custom_categories',
        'tags',
        'collections',
        'trips',
        'gps_logs',
        'ai_imports',
        'saved_markdowns',
        'people',
        'user_addresses'
      ];

      for (const op of actions) {
        const { table, action, data } = op;
        console.log("[Sync Debug]", table, action, JSON.stringify(data));
        if (!data || typeof data !== 'object') continue;
        const hasUserId = tablesWithUserId.includes(table);
        
        if (hasUserId) {
          data.user_id = userId; 
        }

        if (table === 'itinerary_items' && (data.sequence_order === undefined || data.sequence_order === null)) {
          data.sequence_order = 0;
        }

        if (action === 'insert') {
          const columns = Object.keys(data).filter(col => data[col] !== undefined);
          if (columns.length === 0) continue;
          const placeholders = columns.map(() => '?').join(', ');
          const values = columns.map(col => typeof data[col] === 'object' ? JSON.stringify(data[col]) : data[col]);
          
          await db.run(
            `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
            values
          );
        } 
        else if (action === 'update') {
          const id = data.id;
          if (!id) continue;

          const columns = Object.keys(data).filter(col => col !== 'id' && data[col] !== undefined);
          if (columns.length === 0) continue;
          const assignments = columns.map(col => `${col} = ?`).join(', ');
          const values = columns.map(col => typeof data[col] === 'object' ? JSON.stringify(data[col]) : data[col]);
          
          if (hasUserId) {
            values.push(id, userId);
            await db.run(
              `UPDATE ${table} SET ${assignments} WHERE id = ? AND user_id = ?`,
              values
            );
          } else {
            values.push(id);
            await db.run(
              `UPDATE ${table} SET ${assignments} WHERE id = ?`,
              values
            );
          }
        } 
        else if (action === 'delete_folder') {
          if (table === 'locations') {
            const id = data.id;
            if (id) {
              const deletePhotosForEntity = async (entityId) => {
                try {
                  const photos = await db.all('SELECT file_path FROM entity_photos WHERE entity_id = ?', [entityId]);
                  for (const p of photos) {
                    if (p.file_path && p.file_path.startsWith('/uploads/')) {
                      const filename = p.file_path.replace('/uploads/', '');
                      const filePath = join(UPLOADS_DIR, filename);
                      if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                      }
                    }
                  }
                  await db.run('DELETE FROM entity_photos WHERE entity_id = ?', [entityId]);
                } catch (err) {
                  console.error('Failed to delete photos for entity:', entityId, err);
                }
              };

              const deleteLocationRecursively = async (locId) => {
                const childLocs = await db.all('SELECT id FROM locations WHERE parent_id = ? AND user_id = ?', [locId, userId]);
                for (const child of childLocs) {
                  await deleteLocationRecursively(child.id);
                }
                const loc = await db.get('SELECT local_file_data FROM locations WHERE id = ?', [locId]);
                if (loc && loc.local_file_data && loc.local_file_data.startsWith('/uploads/')) {
                  const filename = loc.local_file_data.replace('/uploads/', '');
                  const filePath = join(UPLOADS_DIR, filename);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
                await deletePhotosForEntity(locId);

                const subPlaces = await db.all('SELECT id, local_file_data FROM places WHERE location_id = ?', [locId]);
                for (const sp of subPlaces) {
                  if (sp.local_file_data && sp.local_file_data.startsWith('/uploads/')) {
                    const filename = sp.local_file_data.replace('/uploads/', '');
                    const filePath = join(UPLOADS_DIR, filename);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                  }
                  await deletePhotosForEntity(sp.id);
                  await db.run('DELETE FROM places WHERE id = ?', [sp.id]);
                }
                await db.run('DELETE FROM locations WHERE id = ? AND user_id = ?', [locId, userId]);
              };

              const deleteContents = data.deleteContents;
              if (deleteContents) {
                await deleteLocationRecursively(id);
              } else {
                await db.run('UPDATE locations SET parent_id = NULL WHERE parent_id = ? AND user_id = ?', [id, userId]);
                const loc = await db.get('SELECT local_file_data FROM locations WHERE id = ?', [id]);
                if (loc && loc.local_file_data && loc.local_file_data.startsWith('/uploads/')) {
                  const filename = loc.local_file_data.replace('/uploads/', '');
                  const filePath = join(UPLOADS_DIR, filename);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
                await deletePhotosForEntity(id);

                const subPlaces = await db.all('SELECT id, local_file_data FROM places WHERE location_id = ?', [id]);
                for (const sp of subPlaces) {
                  if (sp.local_file_data && sp.local_file_data.startsWith('/uploads/')) {
                    const filename = sp.local_file_data.replace('/uploads/', '');
                    const filePath = join(UPLOADS_DIR, filename);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                  }
                  await deletePhotosForEntity(sp.id);
                  await db.run('DELETE FROM places WHERE id = ?', [sp.id]);
                }
                await db.run('DELETE FROM locations WHERE id = ? AND user_id = ?', [id, userId]);
              }
            }
          }
        }
        else if (action === 'delete') {
          if (table === 'entity_tags') {
            const { entity_id, tag_id } = data;
            await db.run(`DELETE FROM entity_tags WHERE entity_id = ? AND tag_id = ?`, [entity_id, tag_id]);
          } else {
            const id = data.id;
            if (!id) continue;

            const deletePhotosForEntity = async (entityId) => {
              try {
                const photos = await db.all('SELECT file_path FROM entity_photos WHERE entity_id = ?', [entityId]);
                for (const p of photos) {
                  if (p.file_path && p.file_path.startsWith('/uploads/')) {
                    const filename = p.file_path.replace('/uploads/', '');
                    const filePath = join(UPLOADS_DIR, filename);
                    if (fs.existsSync(filePath)) {
                      fs.unlinkSync(filePath);
                    }
                  }
                }
                await db.run('DELETE FROM entity_photos WHERE entity_id = ?', [entityId]);
              } catch (err) {
                console.error('Failed to delete photos for entity:', entityId, err);
              }
            };

            if (table === 'locations') {
              const loc = await db.get('SELECT local_file_data FROM locations WHERE id = ?', [id]);
              if (loc && loc.local_file_data && loc.local_file_data.startsWith('/uploads/')) {
                const filename = loc.local_file_data.replace('/uploads/', '');
                const filePath = join(UPLOADS_DIR, filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              }
              await deletePhotosForEntity(id);

              const subPlaces = await db.all('SELECT id, local_file_data FROM places WHERE location_id = ?', [id]);
              for (const sp of subPlaces) {
                if (sp.local_file_data && sp.local_file_data.startsWith('/uploads/')) {
                  const filename = sp.local_file_data.replace('/uploads/', '');
                  const filePath = join(UPLOADS_DIR, filename);
                  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                }
                await deletePhotosForEntity(sp.id);
                await db.run('DELETE FROM places WHERE id = ?', [sp.id]);
              }
            } else if (table === 'places') {
              const pl = await db.get('SELECT local_file_data FROM places WHERE id = ?', [id]);
              if (pl && pl.local_file_data && pl.local_file_data.startsWith('/uploads/')) {
                const filename = pl.local_file_data.replace('/uploads/', '');
                const filePath = join(UPLOADS_DIR, filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              }
              await deletePhotosForEntity(id);
            }

            if (hasUserId) {
              await db.run(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`, [id, userId]);
            } else {
              await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
            }
          }
        }
      }

      await db.exec('COMMIT');
      res.json({ success: true });
      notifyUserClients(userId);
    } catch (err) {
      try {
        await db.exec('ROLLBACK');
      } catch (rollbackErr) {
        console.warn('Rollback failed (possibly no transaction active):', rollbackErr.message);
      }
      try {
        const dataDir = process.env.DATABASE_DIR || join(__dirname, 'data');
        const logPath = join(dataDir, 'server_error.log');
        const logMessage = `[${new Date().toISOString()}] Sync failed: ${err.message}\nStack: ${err.stack}\n\n`;
        fs.appendFileSync(logPath, logMessage);
      } catch (logErr) {
        console.error('Failed to write to error log:', logErr);
      }
      res.status(500).json({ error: err.message });
    }
  });
});

// ==========================================
// CRUD API Routes
// ==========================================

// Locations
app.get('/api/locations', authenticateToken, async (req, res) => {
  try {
    const locations = await db.all('SELECT * FROM locations WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(locations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/locations', authenticateToken, async (req, res) => {
  const { id, name, latitude, longitude, visited, notes, immich_album_id, parent_id, is_folder } = req.body;
  const locId = id || crypto.randomUUID();
  try {
    await db.run(
      `INSERT INTO locations (id, user_id, name, latitude, longitude, visited, notes, immich_album_id, parent_id, is_folder) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [locId, req.user.id, name, latitude || null, longitude || null, visited || 0, notes || '', immich_album_id || null, parent_id || null, is_folder || 0]
    );
    const result = await db.get('SELECT * FROM locations WHERE id = ?', [locId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, latitude, longitude, visited, notes, immich_album_id, parent_id, is_folder } = req.body;
  try {
    await db.run(
      `UPDATE locations SET name = ?, latitude = ?, longitude = ?, visited = ?, notes = ?, immich_album_id = ?, parent_id = ?, is_folder = ? 
       WHERE id = ? AND user_id = ?`,
      [name, latitude, longitude, visited, notes, immich_album_id, parent_id, is_folder, id, req.user.id]
    );
    const result = await db.get('SELECT * FROM locations WHERE id = ?', [id]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locations/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    await db.run('DELETE FROM locations WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    notifyUserClients(userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// AI Imports
// ==========================================
app.get('/api/ai_imports', authenticateToken, async (req, res) => {
  try {
    const imports = await db.all('SELECT * FROM ai_imports WHERE user_id = ?', [req.user.id]);
    res.json(imports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/markdown', authenticateToken, async (req, res) => {
  const { url, scraper, imageDirection } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    let firecrawlKey = '';
    const config = await db.get('SELECT ai_settings FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (config && config.ai_settings) {
      try {
        const parsed = JSON.parse(config.ai_settings);
        firecrawlKey = parsed.firecrawlKey || '';
      } catch (e) {
        console.warn('Failed to parse ai_settings', e);
      }
    }

    const { markdown, places } = await processMarkdownImport(url, scraper || 'jina', firecrawlKey, imageDirection || 'below');
    res.json({ success: true, markdown, places });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/document', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No document file uploaded' });
  }

  const { parserEngine } = req.body;
  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const ext = extname(originalName).toLowerCase();

  try {
    let markdown = '';
    let extractedImages = [];

    if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
      markdown = fs.readFileSync(filePath, 'utf-8');
    } else if (ext === '.html' || ext === '.htm') {
      const htmlContent = fs.readFileSync(filePath, 'utf-8');
      try {
        const TurndownModule = await import('turndown');
        const TurndownService = TurndownModule.default || TurndownModule;
        const turndownService = new TurndownService({ headingStyle: 'atx' });
        markdown = turndownService.turndown(htmlContent);
      } catch (err) {
        markdown = htmlContent.replace(/<[^>]+>/g, '\n');
      }
    } else if (ext === '.docx' || ext === '.doc') {
      try {
        const mammothModule = await import('mammoth');
        const mammoth = mammothModule.default || mammothModule;
        const result = await mammoth.convertToHtml({ path: filePath });
        const html = result.value;
        const TurndownModule = await import('turndown');
        const TurndownService = TurndownModule.default || TurndownModule;
        const turndownService = new TurndownService({ headingStyle: 'atx' });
        markdown = turndownService.turndown(html);
      } catch (err) {
        markdown = `# ${originalName}\n\n${fs.readFileSync(filePath, 'utf-8')}`;
      }
    } else if (ext === '.pdf') {
      try {
        const pdfParseModule = await import('pdf-parse');
        const pdfParse = pdfParseModule.default || pdfParseModule;
        const pdfBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        const rawText = pdfData.text || '';

        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        const formattedLines = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const isNumberedHeading = /^(?:Day\s+\d+|Step\s+\d+|\d+[\.\:\)-])\s+[A-Z]/i.test(line);
          const isShortTitle = line.length >= 3 && line.length <= 60 && (line === line.toUpperCase() || /^[A-Z][a-zA-Z0-9\s,–'-]+$/.test(line));

          if ((isNumberedHeading || isShortTitle) && !line.endsWith('.')) {
            formattedLines.push(`\n## ${line}\n`);
          } else {
            formattedLines.push(line);
          }
        }

        markdown = `# ${originalName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')}\n\n` + formattedLines.join('\n');
      } catch (err) {
        console.error('PDF parsing error:', err);
        markdown = `# ${originalName}\n\n${fs.readFileSync(filePath, 'utf-8')}`;
      }
    } else {
      markdown = fs.readFileSync(filePath, 'utf-8');
    }

    try { fs.unlinkSync(filePath); } catch (_) {}

    const imgRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = imgRegex.exec(markdown)) !== null) {
      if (match[1] && !extractedImages.includes(match[1])) {
        extractedImages.push(match[1]);
      }
    }

    const cleanGuideName = originalName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    res.json({
      success: true,
      guideName: cleanGuideName,
      markdown,
      images: extractedImages
    });
  } catch (err) {
    console.error('Document import error:', err);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/import/geocode', authenticateToken, async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    const coords = await geocode(query);
    if (coords) {
      res.json([coords]); // return as array to maintain compatibility with client expectations
    } else {
      res.json([]);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function callAiProvider({ provider = 'Gemini', apiKey = '', model = 'gemini-1.5-pro', endpoint = '', systemPrompt = '', userMessage = '' }) {
  const cleanKey = (apiKey || '').trim();
  const cleanModel = (model || '').trim();

  if (!cleanKey && ['Gemini', 'OpenAI', 'Claude'].includes(provider)) {
    throw new Error(`API Key is missing for provider ${provider}.`);
  }

  let responseText = '';

  try {
    if (provider === 'Gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const response = await axios.post(
        url,
        {
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\n${userMessage}`
            }]
          }]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanKey
          }
        }
      );
      responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else if (provider === 'OpenAI') {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: cleanModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      }, {
        headers: { 
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        }
      });
      responseText = response.data?.choices?.[0]?.message?.content || '';
    } else if (provider === 'Claude') {
      const response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: cleanModel,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      }, {
        headers: {
          'x-api-key': cleanKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      });
      responseText = response.data?.content?.[0]?.text || '';
    } else {
      const targetUrl = endpoint || 'http://localhost:11434/api/generate';
      const response = await axios.post(targetUrl, {
        model: cleanModel,
        prompt: `${systemPrompt}\n\n${userMessage}`,
        stream: false
      });
      responseText = response.data?.response || response.data?.choices?.[0]?.message?.content || '';
    }
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'AI request failed';
    throw new Error(errorMsg);
  }

  let cleanedText = responseText.trim();
  if (cleanedText.startsWith('```json')) {
    cleanedText = cleanedText.substring(7);
  }
  if (cleanedText.startsWith('```')) {
    cleanedText = cleanedText.substring(3);
  }
  if (cleanedText.endsWith('```')) {
    cleanedText = cleanedText.substring(0, cleanedText.length - 3);
  }
  cleanedText = cleanedText.trim();

  try {
    return JSON.parse(cleanedText);
  } catch (e) {
    throw new Error('AI returned invalid JSON: ' + responseText.substring(0, 300));
  }
}

app.post('/api/import/extract-ai', authenticateToken, async (req, res) => {
  const { places, markdown, city, state, country, prompt, homeCoords } = req.body;
  if (!places || !Array.isArray(places)) {
    return res.status(400).json({ error: 'Places array is required' });
  }

  try {
    const config = await db.get('SELECT ai_settings FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.ai_settings) {
      return res.status(400).json({ error: 'AI settings not configured. Please go to Settings -> AI Settings to configure.' });
    }

    const aiSettings = JSON.parse(config.ai_settings);
    const provider = aiSettings.provider || 'Gemini';
    const apiKey = aiSettings.apiKey || '';
    const model = aiSettings.model || 'gemini-1.5-pro';
    const endpoint = aiSettings.endpointUrl || '';

    const homeLat = homeCoords?.lat;
    const homeLng = homeCoords?.lng || homeCoords?.lon;
    const homeContext = (homeLat && homeLng) 
      ? `Starting and Ending Home Waypoint Coordinates: Latitude = ${homeLat}, Longitude = ${homeLng}. Use this home coordinate as the starting and ending point when planning the day-wise itinerary starting in the morning.`
      : '';

    const markdownContext = markdown ? `\n\nFull Travel Guide Document Context:\n\"\"\"\n${markdown.slice(0, 12000)}\n\"\"\"` : '';

    const systemPrompt = `You are a travel geocoding, landmark cleaning, and itinerary extraction assistant. Refine the input list of places and create an optimized day-wise itinerary using both the place list and full guide document context.
Context: City = "${city || ''}", State = "${state || ''}", Country = "${country || ''}".
${homeContext}

Instructions:
1. Parse the full guide document context (if provided) to extract exact Day assignments (e.g. Day 1, Day 2 from headings like "# Day 1: Old City") and appropriate categories for each place.
2. Clean and normalize place names (e.g. convert conversational or action phrases like "Get a bird's eye view from Golconda Fort" to clean landmark titles like "Golconda Fort").
3. Extract geocoding details (latitude, longitude, formatted address, category, short 1-2 sentence description) for each place.
4. Assign day numbers (1, 2, 3, etc.) based on markdown Day headings if present, or geographical proximity.
5. Classify the item type: set "type": "place" for places of visit, or "type": "location" if the item represents a top-level city/region folder.

Expected Output Format: JSON array of objects (or JSON object containing a "places" array), where each place object contains:
- id: match the place's input id exactly
- name: clean landmark place name
- address: full formatted address
- latitude: number (e.g. 17.3850)
- longitude: number (e.g. 78.4867)
- category: one of 'Attraction', 'Dining', 'Lodging', 'Transit', 'Shopping', 'Other'
- description: a short 1-2 sentence description summarizing what this place is
- day: integer number representing the day of visit (1, 2, 3, etc.)
- type: 'place' or 'location'
- isRelevant: boolean (true if valid visitable place, false if header or general advice)

Respond ONLY with valid JSON. Do not include markdown code block syntax (like \`\`\`json).`;

    const userMessage = `${prompt || 'Extract geocoding details, categories, and day-wise itinerary for these places.'}${markdownContext}\n\nPlaces Input:\n${JSON.stringify(places.map(p => ({ id: p.id, name: p.name, description: p.description || '', day: p.day || null, type: p.type || 'place' })), null, 2)}`;

    const parsedResults = await callAiProvider({
      provider,
      apiKey,
      model,
      endpoint,
      systemPrompt,
      userMessage
    });

    res.json(parsedResults);
  } catch (err) {
    console.error('AI extraction API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/generate-trip', authenticateToken, async (req, res) => {
  const { locations, collections, lengthDays, prompt, placesList } = req.body;
  if (!lengthDays && !prompt) {
    return res.status(400).json({ error: 'Trip length (days) is required' });
  }

  try {
    const config = await db.get('SELECT ai_settings FROM user_configs WHERE user_id = ?', [req.user.id]);
    if (!config || !config.ai_settings) {
      return res.status(400).json({ error: 'AI settings not configured. Please go to Settings -> AI Settings to configure.' });
    }

    const aiSettings = JSON.parse(config.ai_settings);
    const provider = aiSettings.provider || 'Gemini';
    const apiKey = aiSettings.apiKey || '';
    const model = aiSettings.model || 'gemini-1.5-pro';
    const endpoint = aiSettings.endpointUrl || '';

    const systemPrompt = `You are a travel planning assistant. Generate a day-wise itinerary for a trip.
You are given a list of existing places of visit (with their names, ratings, and geocoordinates/locations).
Trip Length: ${lengthDays || 3} days.
The activities returned MUST only be assignments of the existing place names provided in the list. Do not invent new places or write descriptions.
If any day specifies an assigned location constraint, you must ONLY assign places belonging to that assigned location for that day.
If not all places can fit in the trip itinerary, then only choose the important ones and ones which have >4 star ratings.

Your response MUST be a JSON array of objects representing days. Each day object must contain:
- day: number (e.g. 1, 2)
- title: day title or highlight (e.g. "Exploring the Historic Center")
- activities: an array of strings representing the names of the places of visit to cover on this day (exact matches from the provided list, ordered optimally by geocoordinates).

Respond ONLY with valid JSON. Do not include markdown code block syntax (like \`\`\`json).`;

    const userMessage = `${prompt ? prompt : `Assign these places of visit to a ${lengthDays}-day itinerary based on their locations and coordinates:`}
Places List: ${JSON.stringify(placesList || [])}
Locations: ${JSON.stringify(locations || [])}
Collections: ${JSON.stringify(collections || [])}`;

    const parsedJson = await callAiProvider({
      provider,
      apiKey,
      model,
      endpoint,
      systemPrompt,
      userMessage
    });

    res.json(parsedJson);
  } catch (err) {
    console.error('AI itinerary generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Saved Markdowns Endpoints
app.get('/api/import/saved-markdowns', authenticateToken, async (req, res) => {
  try {
    const markdowns = await db.all('SELECT * FROM saved_markdowns WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(markdowns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/import/saved-markdowns', authenticateToken, async (req, res) => {
  const { id, name, url, content } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'Name and content are required' });
  const mdId = id || crypto.randomUUID();

  try {
    await db.run(
      `INSERT INTO saved_markdowns (id, user_id, name, url, content) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, content=excluded.content, url=excluded.url`,
      [mdId, req.user.id, name, url || null, content]
    );
    const result = await db.get('SELECT * FROM saved_markdowns WHERE id = ?', [mdId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/import/saved-markdowns/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, content } = req.body;
  try {
    if (name !== undefined && content !== undefined) {
      await db.run('UPDATE saved_markdowns SET name = ?, content = ? WHERE id = ? AND user_id = ?', [name, content, id, req.user.id]);
    } else if (name !== undefined) {
      await db.run('UPDATE saved_markdowns SET name = ? WHERE id = ? AND user_id = ?', [name, id, req.user.id]);
    } else if (content !== undefined) {
      await db.run('UPDATE saved_markdowns SET content = ? WHERE id = ? AND user_id = ?', [content, id, req.user.id]);
    }
    const result = await db.get('SELECT * FROM saved_markdowns WHERE id = ?', [id]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/import/saved-markdowns/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM saved_markdowns WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Places
app.get('/api/places', authenticateToken, async (req, res) => {
  try {
    const places = await db.all('SELECT * FROM places WHERE user_id = ?', [req.user.id]);
    res.json(places);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/places', authenticateToken, async (req, res) => {
  const { id, location_id, name, category, latitude, longitude, visited, notes, immich_album_id } = req.body;
  const pId = id || crypto.randomUUID();
  try {
    await db.run(
      `INSERT INTO places (id, user_id, location_id, name, category, latitude, longitude, visited, notes, immich_album_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pId, req.user.id, location_id, name, category, latitude || null, longitude || null, visited || 0, notes || '', immich_album_id || null]
    );
    const result = await db.get('SELECT * FROM places WHERE id = ?', [pId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/places/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, category, latitude, longitude, visited, notes, immich_album_id } = req.body;
  try {
    await db.run(
      `UPDATE places SET name = ?, category = ?, latitude = ?, longitude = ?, visited = ?, notes = ?, immich_album_id = ? 
       WHERE id = ? AND user_id = ?`,
      [name, category, latitude, longitude, visited, notes, immich_album_id, id, req.user.id]
    );
    const result = await db.get('SELECT * FROM places WHERE id = ?', [id]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/places/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM places WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// People Management Endpoints
app.get('/api/people', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM people WHERE user_id = ? ORDER BY name ASC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/people', authenticateToken, async (req, res) => {
  const { id, name, relation, immich_person_id, immich_person_name, notes } = req.body;
  const pId = id || crypto.randomUUID();
  try {
    await db.run(
      `INSERT INTO people (id, user_id, name, relation, immich_person_id, immich_person_name, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [pId, req.user.id, name, relation || 'Friend', immich_person_id || null, immich_person_name || null, notes || '']
    );
    const row = await db.get('SELECT * FROM people WHERE id = ?', [pId]);
    notifyUserClients(req.user.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/people/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, relation, immich_person_id, immich_person_name, notes } = req.body;
  try {
    await db.run(
      `UPDATE people SET name = ?, relation = ?, immich_person_id = ?, immich_person_name = ?, notes = ? WHERE id = ? AND user_id = ?`,
      [name, relation, immich_person_id || null, immich_person_name || null, notes || '', id, req.user.id]
    );
    const row = await db.get('SELECT * FROM people WHERE id = ?', [id]);
    notifyUserClients(req.user.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/people/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM people WHERE id = ? AND user_id = ?', [id, req.user.id]);
    notifyUserClients(req.user.id);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Saved User Addresses Endpoints
app.get('/api/user-addresses', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM user_addresses WHERE user_id = ? ORDER BY is_default DESC, label ASC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user-addresses', authenticateToken, async (req, res) => {
  const { id, label, address, latitude, longitude, is_default } = req.body;
  const addrId = id || crypto.randomUUID();
  try {
    if (is_default) {
      await db.run('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }
    await db.run(
      `INSERT INTO user_addresses (id, user_id, label, address, latitude, longitude, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [addrId, req.user.id, label || 'Home', address || '', latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null, is_default ? 1 : 0]
    );
    const row = await db.get('SELECT * FROM user_addresses WHERE id = ?', [addrId]);
    notifyUserClients(req.user.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/user-addresses/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { label, address, latitude, longitude, is_default } = req.body;
  try {
    if (is_default) {
      await db.run('UPDATE user_addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
    }
    await db.run(
      `UPDATE user_addresses SET label = ?, address = ?, latitude = ?, longitude = ?, is_default = ? WHERE id = ? AND user_id = ?`,
      [label, address, latitude ? parseFloat(latitude) : null, longitude ? parseFloat(longitude) : null, is_default ? 1 : 0, id, req.user.id]
    );
    const row = await db.get('SELECT * FROM user_addresses WHERE id = ?', [id]);
    notifyUserClients(req.user.id);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/user-addresses/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM user_addresses WHERE id = ? AND user_id = ?', [id, req.user.id]);
    notifyUserClients(req.user.id);
    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Photos
app.get('/api/photos', authenticateToken, async (req, res) => {
  try {
    const photos = await db.all(`
      SELECT ep.* FROM entity_photos ep
      WHERE ep.entity_id IN (
        SELECT id FROM locations WHERE user_id = ?
        UNION
        SELECT id FROM places WHERE location_id IN (SELECT id FROM locations WHERE user_id = ?)
      )
    `, [req.user.id, req.user.id]);
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/photos/:entityId', authenticateToken, async (req, res) => {
  const { entityId } = req.params;
  try {
    const photos = await db.all('SELECT * FROM entity_photos WHERE entity_id = ?', [entityId]);
    res.json(photos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/photos', authenticateToken, async (req, res) => {
  const { id, entity_id, file_path, is_featured } = req.body;
  const photoId = id || crypto.randomUUID();
  try {
    if (is_featured) {
      await db.run('UPDATE entity_photos SET is_featured = 0 WHERE entity_id = ?', [entity_id]);
    }
    await db.run(
      'INSERT INTO entity_photos (id, entity_id, file_path, is_featured) VALUES (?, ?, ?, ?)',
      [photoId, entity_id, file_path, is_featured || 0]
    );
    const result = await db.get('SELECT * FROM entity_photos WHERE id = ?', [photoId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/photos/:id/featured', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const photo = await db.get('SELECT entity_id FROM entity_photos WHERE id = ?', [id]);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });
    await db.run('UPDATE entity_photos SET is_featured = 0 WHERE entity_id = ?', [photo.entity_id]);
    await db.run('UPDATE entity_photos SET is_featured = 1 WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/photos/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const photo = await db.get('SELECT file_path FROM entity_photos WHERE id = ?', [id]);
    if (photo) {
      const fullPath = join(__dirname, photo.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    await db.run('DELETE FROM entity_photos WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tags
app.get('/api/tags', authenticateToken, async (req, res) => {
  try {
    const tags = await db.all('SELECT * FROM tags WHERE user_id = ?', [req.user.id]);
    res.json(tags);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tags', authenticateToken, async (req, res) => {
  const { id, name, color } = req.body;
  const tagId = id || crypto.randomUUID();
  try {
    await db.run('INSERT INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)', [tagId, req.user.id, name, color]);
    const result = await db.get('SELECT * FROM tags WHERE id = ?', [tagId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tags/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM tags WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Entity Tags mapping
app.get('/api/entity-tags', authenticateToken, async (req, res) => {
  try {
    const list = await db.all(
      `SELECT et.* FROM entity_tags et 
       JOIN tags t ON et.tag_id = t.id 
       WHERE t.user_id = ?`,
      [req.user.id]
    );
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/entity-tags', authenticateToken, async (req, res) => {
  const { entity_id, tag_id } = req.body;
  try {
    await db.run('INSERT OR IGNORE INTO entity_tags (entity_id, tag_id) VALUES (?, ?)', [entity_id, tag_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/entity-tags/:entityId/:tagId', authenticateToken, async (req, res) => {
  const { entityId, tagId } = req.params;
  try {
    await db.run('DELETE FROM entity_tags WHERE entity_id = ? AND tag_id = ?', [entityId, tagId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Collections
app.get('/api/collections', authenticateToken, async (req, res) => {
  try {
    const list = await db.all('SELECT * FROM collections WHERE user_id = ?', [req.user.id]);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collections', authenticateToken, async (req, res) => {
  const { id, name, rules, manual_location_ids } = req.body;
  const colId = id || crypto.randomUUID();
  try {
    await db.run(
      'INSERT INTO collections (id, user_id, name, rules, manual_location_ids) VALUES (?, ?, ?, ?, ?)',
      [colId, req.user.id, name, rules ? JSON.stringify(rules) : null, manual_location_ids ? JSON.stringify(manual_location_ids) : null]
    );
    const result = await db.get('SELECT * FROM collections WHERE id = ?', [colId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/collections/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, rules, manual_location_ids } = req.body;
  try {
    await db.run(
      'UPDATE collections SET name = ?, rules = ?, manual_location_ids = ? WHERE id = ? AND user_id = ?',
      [name, rules ? JSON.stringify(rules) : null, manual_location_ids ? JSON.stringify(manual_location_ids) : null, id, req.user.id]
    );
    const result = await db.get('SELECT * FROM collections WHERE id = ?', [id]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/collections/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM collections WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Custom Categories
app.get('/api/categories', authenticateToken, async (req, res) => {
  try {
    const list = await db.all('SELECT * FROM custom_categories WHERE user_id = ?', [req.user.id]);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', authenticateToken, async (req, res) => {
  const { id, name, icon, type } = req.body;
  const catId = id || crypto.randomUUID();
  try {
    await db.run(
      'INSERT INTO custom_categories (id, user_id, name, icon, type) VALUES (?, ?, ?, ?, ?)',
      [catId, req.user.id, name, icon || '', type || 'place']
    );
    const result = await db.get('SELECT * FROM custom_categories WHERE id = ?', [catId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM custom_categories WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trips
app.get('/api/trips', authenticateToken, async (req, res) => {
  try {
    const trips = await db.all('SELECT * FROM trips WHERE user_id = ? ORDER BY start_date DESC', [req.user.id]);
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', authenticateToken, async (req, res) => {
  const { id, name, start_date, end_date, length, visited, notes, rates, companions, start_address_id, stop_address_id } = req.body;
  const tId = id || crypto.randomUUID();
  try {
    await db.exec('BEGIN TRANSACTION');

    const companionsStr = typeof companions === 'string' ? companions : (Array.isArray(companions) ? JSON.stringify(companions) : null);

    await db.run(
      'INSERT INTO trips (id, user_id, name, start_date, end_date, length, visited, notes, companions, start_address_id, stop_address_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [tId, req.user.id, name, start_date || null, end_date || null, length || 1, visited || 0, notes || '', companionsStr, start_address_id || null, stop_address_id || null]
    );

    // Save rates
    if (rates && typeof rates === 'object') {
      for (const cur of Object.keys(rates)) {
        await db.run(
          'INSERT INTO trip_currency_rates (id, trip_id, currency, rate) VALUES (?, ?, ?, ?)',
          [crypto.randomUUID(), tId, cur, rates[cur]]
        );
      }
    }

    // Auto-propagate default Visited tag to locations & places if trip is marked visited on creation
    if (visited) {
      await autoPropagateVisited(tId, req.user.id);
    }

    await db.exec('COMMIT');
    const result = await db.get('SELECT * FROM trips WHERE id = ?', [tId]);
    res.json(result);
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('Rollback failed (possibly no transaction active):', rollbackErr.message);
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trips/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, start_date, end_date, length, visited, notes, rates, companions, start_address_id, stop_address_id } = req.body;
  try {
    await db.exec('BEGIN TRANSACTION');

    const companionsStr = typeof companions === 'string' ? companions : (Array.isArray(companions) ? JSON.stringify(companions) : null);

    await db.run(
      `UPDATE trips SET name = ?, start_date = ?, end_date = ?, length = ?, visited = ?, notes = ?, companions = ?, start_address_id = ?, stop_address_id = ? 
       WHERE id = ? AND user_id = ?`,
      [name, start_date, end_date, length || 1, visited, notes, companionsStr, start_address_id || null, stop_address_id || null, id, req.user.id]
    );

    // Update rates
    if (rates && typeof rates === 'object') {
      await db.run('DELETE FROM trip_currency_rates WHERE trip_id = ?', [id]);
      for (const cur of Object.keys(rates)) {
        await db.run(
          'INSERT INTO trip_currency_rates (id, trip_id, currency, rate) VALUES (?, ?, ?, ?)',
          [crypto.randomUUID(), id, cur, rates[cur]]
        );
      }
    }

    // Auto-propagate visited tag if changed to visited
    if (visited) {
      await autoPropagateVisited(id, req.user.id);
    }

    await db.exec('COMMIT');
    const result = await db.get('SELECT * FROM trips WHERE id = ?', [id]);
    res.json(result);
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('Rollback failed (possibly no transaction active):', rollbackErr.message);
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM trips WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trip Currency Rates
app.get('/api/trips/:tripId/rates', authenticateToken, async (req, res) => {
  try {
    const list = await db.all('SELECT * FROM trip_currency_rates WHERE trip_id = ?', [req.params.tripId]);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trip Notes
app.get('/api/trips/:tripId/notes', authenticateToken, async (req, res) => {
  try {
    const list = await db.all('SELECT * FROM trip_notes WHERE trip_id = ? ORDER BY created_at ASC', [req.params.tripId]);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Tag propagation on completed trip
async function autoPropagateVisited(tripId, userId) {
  // Find all places associated with this trip's itinerary
  const items = await db.all(
    `SELECT DISTINCT place_id FROM itinerary_items WHERE trip_id = ?`,
    [tripId]
  );
  
  const placeIds = items.map(i => i.place_id);

  if (placeIds.length === 0) return;

  // Find all location IDs for these places
  const placeholders = placeIds.map(() => '?').join(',');
  const placesRows = await db.all(
    `SELECT DISTINCT location_id FROM places WHERE id IN (${placeholders})`,
    placeIds
  );
  const locationIds = placesRows.map(p => p.location_id);

  // Propagate visited status in batch (no tags)
  for (const pId of placeIds) {
    await db.run(`UPDATE places SET visited = 1 WHERE id = ?`, [pId]);
  }

  for (const locId of locationIds) {
    await db.run(`UPDATE locations SET visited = 1 WHERE id = ?`, [locId]);
  }
}

// Trip Reservations
app.get('/api/reservations/:tripId', authenticateToken, async (req, res) => {
  try {
    const list = await db.all(
      `SELECT r.* FROM reservations r 
       JOIN trips t ON r.trip_id = t.id 
       WHERE r.trip_id = ? AND t.user_id = ?`,
      [req.params.tripId, req.user.id]
    );
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reservations', authenticateToken, async (req, res) => {
  const { id, trip_id, type, title, details, file_path } = req.body;
  const resId = id || crypto.randomUUID();
  try {
    await db.run(
      'INSERT INTO reservations (id, trip_id, type, title, details, file_path) VALUES (?, ?, ?, ?, ?, ?)',
      [resId, trip_id, type, title, JSON.stringify(details || {}), file_path || null]
    );
    const result = await db.get('SELECT * FROM reservations WHERE id = ?', [resId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reservations/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM reservations WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trip Itinerary Items
app.get('/api/itineraries/:tripId', authenticateToken, async (req, res) => {
  try {
    const list = await db.all(
      `SELECT i.* FROM itinerary_items i 
       JOIN trips t ON i.trip_id = t.id 
       WHERE i.trip_id = ? AND t.user_id = ?
       ORDER BY i.date ASC, i.sequence_order ASC`,
      [req.params.tripId, req.user.id]
    );
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/itineraries', authenticateToken, async (req, res) => {
  const { id, trip_id, date, place_id, location_id, notes, sequence_order } = req.body;
  const itemId = id || crypto.randomUUID();
  try {
    await db.run(
      'INSERT INTO itinerary_items (id, trip_id, date, place_id, location_id, notes, sequence_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [itemId, trip_id, date, place_id || null, location_id || null, notes || null, sequence_order || 0]
    );
    const result = await db.get('SELECT * FROM itinerary_items WHERE id = ?', [itemId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/itineraries/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM itinerary_items WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trip Expenses & Budgets
app.get('/api/expenses/:tripId', authenticateToken, async (req, res) => {
  try {
    const list = await db.all(
      `SELECT e.* FROM expenses e 
       JOIN trips t ON e.trip_id = t.id 
       WHERE e.trip_id = ? AND t.user_id = ?
       ORDER BY e.date ASC`,
      [req.params.tripId, req.user.id]
    );
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', authenticateToken, async (req, res) => {
  const { id, trip_id, date, amount, currency, category, notes, receipt_path, is_planned } = req.body;
  const expId = id || crypto.randomUUID();
  try {
    await db.run(
      `INSERT INTO expenses (id, trip_id, date, amount, currency, category, notes, receipt_path, is_planned) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [expId, trip_id, date, amount, currency || 'USD', category, notes || '', receipt_path || null, is_planned || 0]
    );
    const result = await db.get('SELECT * FROM expenses WHERE id = ?', [expId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM expenses WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Visit logs for Location detailing (which trips visited this location)
app.get('/api/locations/:locationId/visits', authenticateToken, async (req, res) => {
  const { locationId } = req.params;
  try {
    const visits = await db.all(
      `SELECT DISTINCT t.id, t.name, t.start_date, t.end_date, t.notes FROM trips t
       JOIN itinerary_items i ON i.trip_id = t.id
       JOIN places p ON i.place_id = p.id
       WHERE p.location_id = ? AND t.visited = 1 AND t.user_id = ?
       ORDER BY t.start_date DESC`,
      [locationId, req.user.id]
    );
    res.json(visits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Backup & Restore API
// ==========================================
app.get('/api/backup/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const backup = {
      version: '1.0',
      export_date: new Date().toISOString(),
      data: {},
      files: []
    };

    // User-owned tables with direct user_id column
    const directUserTables = [
      'user_configs',
      'locations',
      'places',
      'custom_categories',
      'tags',
      'collections',
      'trips',
      'gps_logs',
      'ai_imports',
      'saved_markdowns',
      'people',
      'user_addresses'
    ];

    for (const table of directUserTables) {
      let rows = await db.all(`SELECT * FROM ${table} WHERE user_id = ?`, [userId]);
      if (table === 'user_configs') {
        rows = rows.map(r => {
          const newRow = { ...r };
          delete newRow.immich_key;
          return newRow;
        });
      }
      backup.data[table] = rows;
    }

    // User's location & place IDs for dependent tables
    const userLocationIds = (backup.data.locations || []).map(l => l.id);
    const userPlaceIds = (backup.data.places || []).map(p => p.id);
    const userEntityIds = [...userLocationIds, ...userPlaceIds];

    // Dependent entity_tags
    if (userEntityIds.length > 0) {
      const placeholders = userEntityIds.map(() => '?').join(',');
      backup.data.entity_tags = await db.all(
        `SELECT * FROM entity_tags WHERE entity_id IN (${placeholders})`,
        userEntityIds
      );
    } else {
      backup.data.entity_tags = [];
    }

    // Dependent entity_photos
    if (userEntityIds.length > 0) {
      const placeholders = userEntityIds.map(() => '?').join(',');
      backup.data.entity_photos = await db.all(
        `SELECT * FROM entity_photos WHERE entity_id IN (${placeholders})`,
        userEntityIds
      );
    } else {
      backup.data.entity_photos = [];
    }

    // User's trip IDs for dependent trip tables
    const userTripIds = (backup.data.trips || []).map(t => t.id);

    const tripDependentTables = [
      'trip_currency_rates',
      'trip_notes',
      'reservations',
      'itinerary_items',
      'expenses'
    ];

    for (const table of tripDependentTables) {
      if (userTripIds.length > 0) {
        const placeholders = userTripIds.map(() => '?').join(',');
        backup.data[table] = await db.all(
          `SELECT * FROM ${table} WHERE trip_id IN (${placeholders})`,
          userTripIds
        );
      } else {
        backup.data[table] = [];
      }
    }

    // Backup only the active user's uploaded media files
    const filesToBackup = new Set();
    if (backup.data.locations) {
      backup.data.locations.forEach(l => {
        if (l.local_file_data) filesToBackup.add(l.local_file_data);
      });
    }
    if (backup.data.places) {
      backup.data.places.forEach(p => {
        if (p.local_file_data) filesToBackup.add(p.local_file_data);
      });
    }
    if (backup.data.entity_photos) {
      backup.data.entity_photos.forEach(p => {
        if (p.file_path) filesToBackup.add(p.file_path);
      });
    }
    if (backup.data.reservations) {
      backup.data.reservations.forEach(r => {
        if (r.file_path) filesToBackup.add(r.file_path);
      });
    }
    if (backup.data.expenses) {
      backup.data.expenses.forEach(e => {
        if (e.receipt_path) filesToBackup.add(e.receipt_path);
      });
    }

    for (const relPath of filesToBackup) {
      const filename = basename(relPath);
      const fullPath = join(UPLOADS_DIR, filename);
      if (fs.existsSync(fullPath)) {
        try {
          const fileData = await fs.promises.readFile(fullPath);
          backup.files.push({
            file_path: relPath,
            base64_data: fileData.toString('base64')
          });
        } catch (readErr) {
          console.warn(`Failed to read file ${filename} for backup:`, readErr);
        }
      }
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=travelbuff_backup.json');
    res.json(backup);
  } catch (err) {
    console.error('Backup export failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Deduplicate places marked with (copy)
app.post('/api/places/deduplicate', authenticateToken, async (req, res) => {
  try {
    const mergedCount = await cleanupDuplicateCopyPlaces();
    res.json({ success: true, mergedCount, message: `Successfully merged ${mergedCount} duplicate places.` });
  } catch (err) {
    console.error('Failed to deduplicate places:', err);
    res.status(500).json({ error: err.message });
  }
});

// Phase 1: Database Metadata Non-Blocking Restore Endpoint
app.post('/api/backup/restore/metadata', async (req, res) => {
  const { data, currentUserId } = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Missing database data in restore payload' });
  }

  const idMap = new Map();
  let restoredCount = 0;
  let duplicatedCount = 0;
  const warnings = [];
  const tableCounts = {};

  if (currentUserId) {
    const oldUserIds = new Set();
    const userIdTables = ['user_configs', 'locations', 'places', 'custom_categories', 'tags', 'collections', 'trips', 'gps_logs', 'ai_imports', 'saved_markdowns', 'people', 'user_addresses'];
    userIdTables.forEach(table => {
      const rows = data[table];
      if (rows && Array.isArray(rows)) {
        rows.forEach(row => {
          if (row.user_id) oldUserIds.add(row.user_id);
        });
      }
    });

    for (const oldId of oldUserIds) {
      if (oldId !== currentUserId) {
        idMap.set(oldId, currentUserId);
      }
    }
  }

  // NOTE: 'users' table is strictly EXCLUDED from restore to prevent overwriting login accounts or logging users out
  const tablesOrder = [
    'user_configs',
    'locations',
    'places',
    'custom_categories',
    'tags',
    'entity_tags',
    'collections',
    'trips',
    'trip_currency_rates',
    'trip_notes',
    'reservations',
    'itinerary_items',
    'expenses',
    'gps_logs',
    'entity_photos',
    'ai_imports',
    'saved_markdowns',
    'people',
    'user_addresses'
  ];

  for (const table of tablesOrder) {
    const rows = data[table];
    if (!rows || !Array.isArray(rows)) continue;
    tableCounts[table] = 0;

    for (const row of rows) {
      try {
        // Explicitly assign user_id to currentUserId for user-owned records
        if (currentUserId && row.user_id !== undefined) {
          row.user_id = currentUserId;
        }

        const pkCol = (table === 'user_configs') ? 'user_id' : 'id';
        let originalId = row[pkCol];

        if (table !== 'entity_tags' && originalId) {
          if (table === 'user_configs' && currentUserId) {
            row[pkCol] = currentUserId;
          } else {
            const exists = await db.get(`SELECT 1 FROM ${table} WHERE ${pkCol} = ?`, [originalId]);
            if (exists) {
              const newId = `${table.slice(0, 3)}_${crypto.randomUUID()}`;
              idMap.set(originalId, newId);
              row[pkCol] = newId;
            }
          }
        }

        // Only append (Copy) if an entity with the SAME NAME already exists under currentUserId's account
        if (['locations', 'places', 'trips', 'collections'].includes(table) && row.name && currentUserId) {
          const nameExistsForUser = await db.get(
            `SELECT 1 FROM ${table} WHERE user_id = ? AND name = ?`,
            [currentUserId, row.name]
          );
          if (nameExistsForUser) {
            row.name = `${row.name} (Copy)`;
            duplicatedCount++;
          }
        }

        if (table === 'user_configs' && row.owntracks_key) {
          const existing = await db.get('SELECT 1 FROM user_configs WHERE owntracks_key = ?', [row.owntracks_key]);
          if (existing) {
            row.owntracks_key = crypto.randomBytes(8).toString('hex');
          }
        }

        // Preserve existing immich_key when restoring user_configs
        if (table === 'user_configs' && currentUserId) {
          const existingConfig = await db.get('SELECT immich_key FROM user_configs WHERE user_id = ?', [currentUserId]);
          if (existingConfig && existingConfig.immich_key && (!row.immich_key || row.immich_key === '')) {
            row.immich_key = existingConfig.immich_key;
          } else if (!row.immich_key) {
            delete row.immich_key;
          }
        }

        if (table === 'tags' && row.name && row.user_id) {
          const finalUserId = idMap.has(row.user_id) ? idMap.get(row.user_id) : row.user_id;
          let currentName = row.name;
          let existing = await db.get('SELECT 1 FROM tags WHERE user_id = ? AND name = ?', [finalUserId, currentName]);
          while (existing) {
            currentName = `${currentName} (Copy)`;
            existing = await db.get('SELECT 1 FROM tags WHERE user_id = ? AND name = ?', [finalUserId, currentName]);
          }
          row.name = currentName;
        }

        for (const key of Object.keys(row)) {
          const val = row[key];
          if (typeof val === 'string' && idMap.has(val)) {
            row[key] = idMap.get(val);
          }
        }

        if (table === 'collections' && typeof row.manual_location_ids === 'string' && row.manual_location_ids) {
          const ids = row.manual_location_ids.split(',').map(id => {
            const trimmed = id.trim();
            return idMap.has(trimmed) ? idMap.get(trimmed) : trimmed;
          });
          row.manual_location_ids = ids.join(',');
        }

        if (table === 'entity_tags') {
          const exists = await db.get('SELECT 1 FROM entity_tags WHERE entity_id = ? AND tag_id = ?', [row.entity_id, row.tag_id]);
          if (exists) {
            continue;
          }
        }

        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const isReplace = (table === 'user_configs');
        const sql = `${isReplace ? 'INSERT OR REPLACE' : 'INSERT'} INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        const params = columns.map(col => row[col]);
        await db.run(sql, params);
        restoredCount++;
        tableCounts[table]++;
      } catch (rowErr) {
        console.warn(`[Restore Metadata Warning] Table '${table}' row failed:`, rowErr.message);
        warnings.push(`Skipped row in ${table}: ${rowErr.message}`);
      }
    }
  }

  // Check configuration integration warnings
  try {
    const activeUserId = currentUserId;
    if (activeUserId) {
      const config = await db.get('SELECT immich_key FROM user_configs WHERE user_id = ?', [activeUserId]);
      const hasPeople = (data.people && data.people.length > 0);
      if ((!config || !config.immich_key) && hasPeople) {
        warnings.push('Immich API Key not configured. Companion & member avatars are saved in pending state until Immich API key is added in Settings.');
      }
    }
  } catch (_) {}

  if (currentUserId) {
    notifyUserClients(currentUserId);
  }

  res.json({
    success: true,
    restored_count: restoredCount,
    duplicated_count: duplicatedCount,
    table_counts: tableCounts,
    warnings: warnings
  });
});

// Phase 2: Chunked Media Batch Restore Endpoint
app.post('/api/backup/restore/media-chunk', async (req, res) => {
  const { files } = req.body;
  if (!files || !Array.isArray(files)) {
    return res.status(400).json({ error: 'Missing files array in chunk payload' });
  }

  let processedCount = 0;
  let skippedCount = 0;
  const chunkErrors = [];

  for (const file of files) {
    if (!file.file_path || !file.base64_data) continue;
    try {
      const filename = basename(file.file_path);
      const destPath = join(UPLOADS_DIR, filename);

      // Check if file already exists on server disk (Fast 1ms skip for resumed uploads)
      if (fs.existsSync(destPath)) {
        skippedCount++;
        continue;
      }

      const buffer = Buffer.from(file.base64_data, 'base64');
      await fs.promises.writeFile(destPath, buffer);
      processedCount++;
    } catch (writeErr) {
      console.warn(`[Restore Media Chunk Warning] File '${file.file_path}' write error:`, writeErr.message);
      chunkErrors.push(`Failed to save ${file.file_path}: ${writeErr.message}`);
    }
  }

  res.json({
    success: true,
    files_processed: processedCount,
    files_skipped: skippedCount,
    errors: chunkErrors
  });
});

app.post('/api/backup/restore', async (req, res) => {
  const { data, files, currentUserId } = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Missing data in backup payload' });
  }

  const idMap = new Map();
  let restoredCount = 0;
  let duplicatedCount = 0;

  if (currentUserId) {
    // Collect all old user IDs from the users table and user_id fields
    const oldUserIds = new Set();
    if (data.users && Array.isArray(data.users)) {
      data.users.forEach(u => { if (u.id) oldUserIds.add(u.id); });
    }
    const userIdTables = ['user_configs', 'locations', 'places', 'custom_categories', 'tags', 'collections', 'trips', 'gps_logs', 'ai_imports', 'saved_markdowns'];
    userIdTables.forEach(table => {
      const rows = data[table];
      if (rows && Array.isArray(rows)) {
        rows.forEach(row => {
          if (row.user_id) oldUserIds.add(row.user_id);
        });
      }
    });

    // Map all old user IDs to the current logged-in user ID
    for (const oldId of oldUserIds) {
      if (oldId !== currentUserId) {
        idMap.set(oldId, currentUserId);
      }
    }
  }

  // NOTE: 'users' table is strictly EXCLUDED from restore to prevent overwriting login accounts or logging users out
  const tablesOrder = [
    'user_configs',
    'locations',
    'places',
    'custom_categories',
    'tags',
    'entity_tags',
    'collections',
    'trips',
    'trip_currency_rates',
    'trip_notes',
    'reservations',
    'itinerary_items',
    'expenses',
    'gps_logs',
    'entity_photos',
    'ai_imports',
    'saved_markdowns',
    'people',
    'user_addresses'
  ];

  try {
    for (const table of tablesOrder) {
      const rows = data[table];
      if (!rows || !Array.isArray(rows)) continue;

      for (const row of rows) {
        try {
          if (currentUserId && row.user_id !== undefined) {
            row.user_id = currentUserId;
          }

          const pkCol = (table === 'user_configs') ? 'user_id' : 'id';
          let originalId = row[pkCol];

          if (table !== 'entity_tags' && originalId) {
            if (table === 'user_configs' && currentUserId) {
              row[pkCol] = currentUserId;
            } else {
              const exists = await db.get(`SELECT 1 FROM ${table} WHERE ${pkCol} = ?`, [originalId]);
              if (exists) {
                const newId = `${table.slice(0, 3)}_${crypto.randomUUID()}`;
                idMap.set(originalId, newId);
                row[pkCol] = newId;
              }
            }
          }

          if (['locations', 'places', 'trips', 'collections'].includes(table) && row.name && currentUserId) {
            const nameExistsForUser = await db.get(
              `SELECT 1 FROM ${table} WHERE user_id = ? AND name = ?`,
              [currentUserId, row.name]
            );
            if (nameExistsForUser) {
              row.name = `${row.name} (Copy)`;
              duplicatedCount++;
            }
          }

          if (table === 'users' && row.username) {
            const existing = await db.get('SELECT 1 FROM users WHERE username = ?', [row.username]);
            if (existing) {
              row.username = `${row.username}_copy_${crypto.randomBytes(2).toString('hex')}`;
            }
          }
          if (table === 'user_configs' && row.owntracks_key) {
            const existing = await db.get('SELECT 1 FROM user_configs WHERE owntracks_key = ?', [row.owntracks_key]);
            if (existing) {
              row.owntracks_key = crypto.randomBytes(8).toString('hex');
            }
          }
          if (table === 'tags' && row.name && row.user_id) {
            const finalUserId = idMap.has(row.user_id) ? idMap.get(row.user_id) : row.user_id;
            let currentName = row.name;
            let existing = await db.get('SELECT 1 FROM tags WHERE user_id = ? AND name = ?', [finalUserId, currentName]);
            while (existing) {
              currentName = `${currentName} (Copy)`;
              existing = await db.get('SELECT 1 FROM tags WHERE user_id = ? AND name = ?', [finalUserId, currentName]);
            }
            row.name = currentName;
          }

          for (const key of Object.keys(row)) {
            const val = row[key];
            if (typeof val === 'string' && idMap.has(val)) {
              row[key] = idMap.get(val);
            }
          }

          if (table === 'collections' && typeof row.manual_location_ids === 'string' && row.manual_location_ids) {
            const ids = row.manual_location_ids.split(',').map(id => {
              const trimmed = id.trim();
              return idMap.has(trimmed) ? idMap.get(trimmed) : trimmed;
            });
            row.manual_location_ids = ids.join(',');
          }

          if (table === 'entity_tags') {
            const exists = await db.get('SELECT 1 FROM entity_tags WHERE entity_id = ? AND tag_id = ?', [row.entity_id, row.tag_id]);
            if (exists) {
              continue;
            }
          }

          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(', ');
          const isReplace = (table === 'user_configs');
          const sql = `${isReplace ? 'INSERT OR REPLACE' : 'INSERT'} INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
          const params = columns.map(col => row[col]);
          await db.run(sql, params);
          restoredCount++;
        } catch (rowErr) {
          console.warn(`[Legacy Restore Warning] Row skipped in ${table}:`, rowErr.message);
        }
      }
    }

    // Restore files
    if (files && Array.isArray(files)) {
      for (const file of files) {
        if (file.file_path && file.base64_data) {
          const filename = basename(file.file_path);
          const destPath = join(UPLOADS_DIR, filename);
          try {
            const buffer = Buffer.from(file.base64_data, 'base64');
            await fs.promises.writeFile(destPath, buffer);
          } catch (writeErr) {
            console.error(`Failed to restore file ${filename}:`, writeErr);
          }
        }
      }
    }

    res.json({
      success: true,
      restored_count: restoredCount,
      duplicated_count: duplicatedCount
    });
    if (currentUserId) {
      notifyUserClients(currentUserId);
    }
  } catch (err) {
    console.error('Backup restore failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Static Assets & SPA Fallback Route
// ==========================================
app.use(express.static(join(__dirname, 'dist')));
app.get('*', (req, res, next) => {
  // If request begins with /api, let express route handler handle it
  if (req.path.startsWith('/api')) return next();
  // If request is for an asset or static file extension, return 404 Not Found instead of index.html
  if (req.path.startsWith('/assets') || /\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|eot)$/i.test(req.path)) {
    return res.status(404).send('Asset not found');
  }
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ==========================================
// Scheduled Background Retry Job (Every 6 Hours)
// ==========================================
async function runBackgroundPhotoSyncRetry() {
  console.log('[Scheduler] Checking for failed or pending cover photos/descriptions to retry...');
  try {
    const failedLocations = await db.all(
      `SELECT id, user_id, name, latitude, longitude, COALESCE(photo_sync_retry_count, 0) as retry_count FROM locations WHERE (photo_sync_status = 'pending' AND local_file_data IS NULL) OR (photo_sync_status = 'failed' AND COALESCE(photo_sync_retry_count, 0) < 2)`
    );
    const failedPlaces = await db.all(
      `SELECT p.id, p.user_id, p.name, p.latitude, p.longitude, COALESCE(p.photo_sync_retry_count, 0) as retry_count, l.name as loc_name FROM places p JOIN locations l ON p.location_id = l.id WHERE (p.photo_sync_status = 'pending' AND p.local_file_data IS NULL) OR (p.photo_sync_status = 'failed' AND COALESCE(p.photo_sync_retry_count, 0) < 2)`
    );

    const queue = [];
    for (const loc of failedLocations) {
      queue.push({ id: loc.id, userId: loc.user_id, type: 'location', name: loc.name, locationContext: '', lat: loc.latitude, lon: loc.longitude });
    }
    for (const pl of failedPlaces) {
      queue.push({ id: pl.id, userId: pl.user_id, type: 'place', name: pl.name, locationContext: pl.loc_name, lat: pl.latitude, lon: pl.longitude });
    }

    if (queue.length === 0) {
      console.log('[Scheduler] No failed or pending photo sync tasks found.');
      return;
    }

    // Process max 5 items per run to prevent Wikimedia rate limiting / server blocking
    const maxBatchSize = 5;
    const batch = queue.slice(0, maxBatchSize);
    console.log(`[Scheduler] Found ${queue.length} total pending photo sync tasks. Processing batch of ${batch.length} (with 6s throttling)...`);
    const headers = { 'User-Agent': 'TravelBuffPersonalApp/1.2 (contact-abhishek@example.com; Developer Test Instance)' };

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      // 6-second delay between queries to strictly comply with Wikimedia rate limits
      await new Promise(r => setTimeout(r, 6000));

      try {
        console.log(`[Scheduler] [${i + 1}/${batch.length}] Retrying photo lookup for ${item.type} "${item.name}"...`);
        
        const result = await resolvePhotoAndDescription({
          query: item.name,
          locationContext: item.locationContext,
          latitude: item.lat,
          longitude: item.lon,
          loggerPrefix: 'Scheduler'
        });

        if (!result || !result.fileUrl) {
          throw new Error(result?.message || result?.error || 'No image resolved on Wikipedia, Commons or Google Maps');
        }

        const localFileUrl = result.fileUrl;
        const description = result.description;

        // Save to SQLite
        if (item.type === 'location') {
          const loc = await db.get('SELECT notes FROM locations WHERE id = ?', [item.id]);
          const notesText = (loc && !loc.notes) ? description : loc?.notes;
          await db.run(
            `UPDATE locations SET local_file_data = ?, notes = ?, photo_sync_status = 'completed' WHERE id = ?`,
            [localFileUrl, notesText, item.id]
          );
        } else {
          const pl = await db.get('SELECT notes FROM places WHERE id = ?', [item.id]);
          const notesText = (pl && !pl.notes) ? description : pl?.notes;
          await db.run(
            `UPDATE places SET local_file_data = ?, notes = ?, photo_sync_status = 'completed' WHERE id = ?`,
            [localFileUrl, notesText, item.id]
          );
        }

        // Insert into entity_photos
        await db.run(
          `INSERT INTO entity_photos (id, entity_id, file_path, is_featured, created_at) VALUES (?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), item.id, localFileUrl, 1, new Date().toISOString()]
        );

        console.log(`[Scheduler] Successfully resolved and synced photo for ${item.type} "${item.name}".`);

        // Notify client session so UI refreshes live
        notifyUserClients(item.userId);
      } catch (err) {
        console.error(`[Scheduler] Retry failed for ${item.type} "${item.name}": ${err.message}`);
        // Increment retry count and mark as failed so it stops retrying once it reaches 2
        if (item.type === 'location') {
          await db.run(`UPDATE locations SET photo_sync_status = 'failed', photo_sync_retry_count = COALESCE(photo_sync_retry_count, 0) + 1 WHERE id = ?`, [item.id]);
        } else {
          await db.run(`UPDATE places SET photo_sync_status = 'failed', photo_sync_retry_count = COALESCE(photo_sync_retry_count, 0) + 1 WHERE id = ?`, [item.id]);
        }
      }
    }
  } catch (schedulerErr) {
    console.error('[Scheduler] Error running background retry scheduler:', schedulerErr);
  }
}

// ==========================================
// Boot Server
// ==========================================
(async () => {
  try {
    await initDatabase();
    await initTelemetry();
    JWT_SECRET = await resolveJwtSecret();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`TravelBuff server is listening on port ${PORT}`);
      
      // Delay initial scheduler run by 30 seconds to allow standard boot tasks to finish
      setTimeout(runBackgroundPhotoSyncRetry, 30000);
      
      // Schedule background photo retry every 6 hours
      setInterval(runBackgroundPhotoSyncRetry, 6 * 60 * 60 * 1000);
    });
  } catch (err) {
    console.error('Critical database initialization failure:', err);
    process.exit(1);
  }
})();
