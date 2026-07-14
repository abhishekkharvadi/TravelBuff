import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { dirname, join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { db, initDatabase, seedDefaultTags, seedDefaultCategories } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'travelbuff-super-secret-key-12345';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure upload directory exists
const UPLOADS_DIR = process.env.UPLOADS_DIR || join(__dirname, 'data', 'uploads');
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
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
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

    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);
    const owntracksKey = crypto.randomBytes(16).toString('hex');

    await db.run(
      'INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)',
      [userId, username, hash]
    );

    await db.run(
      'INSERT INTO user_configs (user_id, owntracks_key) VALUES (?, ?)',
      [userId, owntracksKey]
    );

    await seedDefaultTags(userId);
    await seedDefaultCategories(userId);

    const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username, userId, owntracksKey });
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
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn });
    
    res.json({ 
      token, 
      username: user.username, 
      userId: user.id,
      owntracksKey: config ? config.owntracks_key : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const config = await db.get('SELECT * FROM user_configs WHERE user_id = ?', [req.user.id]);
    res.json({ id: req.user.id, username: req.user.username, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// Config & Integration API
// ==========================================
app.post('/api/config', authenticateToken, async (req, res) => {
  const { immich_url, immich_key, base_currency } = req.body;
  try {
    await db.run(
      `UPDATE user_configs SET immich_url = ?, immich_key = ?, base_currency = ? WHERE user_id = ?`,
      [immich_url || null, immich_key || null, base_currency || 'USD', req.user.id]
    );
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
      return res.json({ status: 'ok', msg: 'Coordinate logged' });
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
      return res.status(400).json({ error: 'Immich not configured' });
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
      return res.status(400).json({ error: 'Immich not configured' });
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
      return res.status(400).json({ error: 'Immich not configured' });
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
      return res.status(400).json({ error: 'Immich not configured' });
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
      return res.status(400).json({ error: 'Immich not configured' });
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
      return res.status(400).json({ error: 'Immich not configured' });
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

// ==========================================
// Sync Endpoint (Offline sync queue)
// ==========================================
app.post('/api/sync', authenticateToken, async (req, res) => {
  const { actions } = req.body; // Array of operations: { table, action: 'insert'|'update'|'delete', data }
  if (!actions || !Array.isArray(actions)) {
    return res.status(400).json({ error: 'Sync payload must be an array' });
  }

  const userId = req.user.id;

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
      'gps_logs'
    ];

    for (const op of actions) {
      const { table, action, data } = op;
      const hasUserId = tablesWithUserId.includes(table);
      
      if (hasUserId) {
        data.user_id = userId; 
      }

      if (action === 'insert') {
        const columns = Object.keys(data).filter(col => data[col] !== undefined);
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
      else if (action === 'delete') {
        if (table === 'entity_tags') {
          // entity_tags uses composite key [entity_id, tag_id]
          const { entity_id, tag_id } = data;
          await db.run(`DELETE FROM entity_tags WHERE entity_id = ? AND tag_id = ?`, [entity_id, tag_id]);
        } else {
          const id = data.id;
          if (!id) continue;
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
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (rollbackErr) {
      console.warn('Rollback failed (possibly no transaction active):', rollbackErr.message);
    }
    res.status(500).json({ error: err.message });
  }
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
  const { id, name, latitude, longitude, visited, notes, immich_album_id } = req.body;
  const locId = id || crypto.randomUUID();
  try {
    await db.run(
      `INSERT INTO locations (id, user_id, name, latitude, longitude, visited, notes, immich_album_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [locId, req.user.id, name, latitude || null, longitude || null, visited || 0, notes || '', immich_album_id || null]
    );
    const result = await db.get('SELECT * FROM locations WHERE id = ?', [locId]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/locations/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, latitude, longitude, visited, notes, immich_album_id } = req.body;
  try {
    await db.run(
      `UPDATE locations SET name = ?, latitude = ?, longitude = ?, visited = ?, notes = ?, immich_album_id = ? 
       WHERE id = ? AND user_id = ?`,
      [name, latitude, longitude, visited, notes, immich_album_id, id, req.user.id]
    );
    const result = await db.get('SELECT * FROM locations WHERE id = ?', [id]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/locations/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.run('DELETE FROM locations WHERE id = ? AND user_id = ?', [id, req.user.id]);
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

// Photos
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
  const { id, name, start_date, end_date, visited, notes, rates } = req.body;
  const tId = id || crypto.randomUUID();
  try {
    await db.exec('BEGIN TRANSACTION');

    await db.run(
      'INSERT INTO trips (id, user_id, name, start_date, end_date, visited, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tId, req.user.id, name, start_date || null, end_date || null, visited || 0, notes || '']
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
  const { name, start_date, end_date, visited, notes, rates } = req.body;
  try {
    await db.exec('BEGIN TRANSACTION');

    await db.run(
      `UPDATE trips SET name = ?, start_date = ?, end_date = ?, visited = ?, notes = ? 
       WHERE id = ? AND user_id = ?`,
      [name, start_date, end_date, visited, notes, id, req.user.id]
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
  const { id, trip_id, date, place_id, sequence_order } = req.body;
  const itemId = id || crypto.randomUUID();
  try {
    await db.run(
      'INSERT INTO itinerary_items (id, trip_id, date, place_id, sequence_order) VALUES (?, ?, ?, ?, ?)',
      [itemId, trip_id, date, place_id, sequence_order]
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
app.get('/api/backup/export', async (req, res) => {
  try {
    const backup = {
      version: '1.0',
      export_date: new Date().toISOString(),
      data: {},
      files: []
    };

    const tables = [
      'users',
      'user_configs',
      'locations',
      'places',
      'custom_categories',
      'tags',
      'entity_tags',
      'collections',
      'trips',
      'trip_currency_rates',
      'reservations',
      'itinerary_items',
      'expenses',
      'gps_logs',
      'entity_photos'
    ];

    for (const table of tables) {
      let rows = await db.all(`SELECT * FROM ${table}`);
      if (table === 'user_configs') {
        rows = rows.map(r => {
          const newRow = { ...r };
          delete newRow.immich_key;
          return newRow;
        });
      }
      backup.data[table] = rows;
    }

    const filesToBackup = new Set();
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
    const userIdTables = ['user_configs', 'locations', 'places', 'custom_categories', 'tags', 'collections', 'trips', 'gps_logs'];
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

  const tablesOrder = [
    'users',
    'user_configs',
    'locations',
    'places',
    'custom_categories',
    'tags',
    'entity_tags',
    'collections',
    'trips',
    'trip_currency_rates',
    'reservations',
    'itinerary_items',
    'expenses',
    'gps_logs',
    'entity_photos'
  ];

  try {
    for (const table of tablesOrder) {
      const rows = data[table];
      if (!rows || !Array.isArray(rows)) continue;

      for (const row of rows) {
        // 1. Uniquify single primary key conflicts
        const pkCol = (table === 'user_configs') ? 'user_id' : 'id';
        let originalId = row[pkCol];

        if (table !== 'entity_tags' && originalId) {
          // If this is user_configs and we have currentUserId, assign it immediately
          if (table === 'user_configs' && currentUserId) {
            row[pkCol] = currentUserId;
          } else {
            const exists = await db.get(`SELECT 1 FROM ${table} WHERE ${pkCol} = ?`, [originalId]);
            if (exists) {
              const newId = `${table.slice(0, 3)}_${crypto.randomUUID()}`;
              idMap.set(originalId, newId);
              row[pkCol] = newId;
              duplicatedCount++;

              // Append copy labels for primary entities if duplicated
              if (['locations', 'places', 'trips', 'collections'].includes(table) && row.name) {
                row.name = `${row.name} (Copy)`;
              }
            }
          }
        }

        // 2. Uniquify other UNIQUE constraint columns
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

        // 3. Dynamically translate all foreign key IDs from idMap
        for (const key of Object.keys(row)) {
          const val = row[key];
          if (typeof val === 'string' && idMap.has(val)) {
            row[key] = idMap.get(val);
          }
        }

        // Special handling for collections manual_location_ids list
        if (table === 'collections' && typeof row.manual_location_ids === 'string' && row.manual_location_ids) {
          const ids = row.manual_location_ids.split(',').map(id => {
            const trimmed = id.trim();
            return idMap.has(trimmed) ? idMap.get(trimmed) : trimmed;
          });
          row.manual_location_ids = ids.join(',');
        }

        // 4. Handle entity_tags composite primary key conflicts
        if (table === 'entity_tags') {
          const exists = await db.get('SELECT 1 FROM entity_tags WHERE entity_id = ? AND tag_id = ?', [row.entity_id, row.tag_id]);
          if (exists) {
            continue;
          }
        }

        // 5. Insert row into database
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const isReplace = (table === 'user_configs');
        const sql = `${isReplace ? 'INSERT OR REPLACE' : 'INSERT'} INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        const params = columns.map(col => row[col]);
        await db.run(sql, params);
        restoredCount++;
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
  // If request begins with API, let it fail as 404 naturally
  if (req.path.startsWith('/api')) return next();
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

// ==========================================
// Boot Server
// ==========================================
(async () => {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`TravelBuff server is listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Critical database initialization failure:', err);
    process.exit(1);
  }
})();
