import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure data directory exists for persistence
const DB_DIR = process.env.DATABASE_DIR || join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = join(DB_DIR, 'travelbuff.db');
const dbInstance = new sqlite3.Database(DB_PATH);

// Promise Wrappers for SQLite
export const db = {
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      dbInstance.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      dbInstance.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      dbInstance.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  },
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      dbInstance.exec(sql, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
};

// Initialize Tables
export async function initDatabase() {
  const schema = `
    CREATE TABLE IF NOT EXISTS app_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      profile_picture TEXT,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_configs (
      user_id TEXT PRIMARY KEY,
      immich_url TEXT,
      immich_key TEXT,
      immich_alt_url TEXT,
      ai_settings TEXT,
      owntracks_key TEXT NOT NULL UNIQUE,
      base_currency TEXT DEFAULT 'USD',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      state TEXT,
      country TEXT,
      latitude REAL,
      longitude REAL,
      visited INTEGER DEFAULT 0,
      notes TEXT,
      immich_album_id TEXT,
      local_file_data TEXT,
      parent_id TEXT DEFAULT NULL,
      is_folder INTEGER DEFAULT 0,
      photo_sync_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      visited INTEGER DEFAULT 0,
      notes TEXT,
      immich_album_id TEXT,
      local_file_data TEXT,
      photo_sync_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entity_photos (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      is_featured INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_categories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT,
      type TEXT DEFAULT 'place',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS entity_tags (
      entity_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (entity_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      rules TEXT,
      manual_location_ids TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      length INTEGER DEFAULT 1,
      visited INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trip_currency_rates (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      rate REAL NOT NULL,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS trip_notes (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT,
      file_path TEXT,
      completed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS itinerary_items (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      date TEXT NOT NULL,
      place_id TEXT,
      location_id TEXT,
      notes TEXT,
      sequence_order INTEGER NOT NULL,
      distance_from_prev REAL DEFAULT -1,
      duration_from_prev REAL DEFAULT -1,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (place_id) REFERENCES places(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      category TEXT NOT NULL,
      notes TEXT,
      receipt_path TEXT,
      is_planned INTEGER DEFAULT 0,
      reservation_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gps_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_imports (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      url TEXT,
      type TEXT NOT NULL,
      data TEXT NOT NULL,
      source TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saved_markdowns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      parsed_items_state TEXT,
      import_context TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      relation TEXT,
      immich_person_id TEXT,
      immich_person_name TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      address TEXT,
      latitude REAL,
      longitude REAL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `;

  await db.exec(schema);

  // Safely add state & country columns if they don't exist in older databases
  await db.run('ALTER TABLE saved_markdowns ADD COLUMN status TEXT DEFAULT "pending"').catch(() => {});
  await db.run('ALTER TABLE saved_markdowns ADD COLUMN parsed_items_state TEXT').catch(() => {});
  await db.run('ALTER TABLE saved_markdowns ADD COLUMN import_context TEXT').catch(() => {});
  await db.run('ALTER TABLE places ADD COLUMN address TEXT').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN state TEXT').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN country TEXT').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN source_urls TEXT').catch(() => {});
  await db.run('ALTER TABLE user_configs ADD COLUMN immich_alt_url TEXT').catch(() => {});
  await db.run('ALTER TABLE user_configs ADD COLUMN ai_settings TEXT').catch(() => {});
  await db.run('ALTER TABLE users ADD COLUMN profile_picture TEXT').catch(() => {});
  await db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0').catch(() => {});
  await db.run('ALTER TABLE trips ADD COLUMN length INTEGER DEFAULT 1').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN local_file_data TEXT').catch(() => {});
  await db.run('ALTER TABLE places ADD COLUMN local_file_data TEXT').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN photo_sync_status TEXT DEFAULT "pending"').catch(() => {});
  await db.run('ALTER TABLE places ADD COLUMN photo_sync_status TEXT DEFAULT "pending"').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN parent_id TEXT DEFAULT NULL').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN is_folder INTEGER DEFAULT 0').catch(() => {});
  await db.run('ALTER TABLE reservations ADD COLUMN completed INTEGER DEFAULT 0').catch(() => {});
  await db.run('ALTER TABLE itinerary_items ADD COLUMN distance_from_prev REAL DEFAULT -1').catch(() => {});
  await db.run('ALTER TABLE itinerary_items ADD COLUMN duration_from_prev REAL DEFAULT -1').catch(() => {});
  await db.run('ALTER TABLE itinerary_items ADD COLUMN location_id TEXT').catch(() => {});
  await db.run('ALTER TABLE itinerary_items ADD COLUMN notes TEXT').catch(() => {});
  await db.run('UPDATE itinerary_items SET distance_from_prev = -1 WHERE (distance_from_prev IS NULL OR distance_from_prev = 0) AND sequence_order > 1').catch(() => {});
  await db.run('UPDATE itinerary_items SET duration_from_prev = -1 WHERE (duration_from_prev IS NULL OR duration_from_prev = 0) AND sequence_order > 1').catch(() => {});
  await db.run('ALTER TABLE expenses ADD COLUMN reservation_id TEXT').catch(() => {});
  await db.run('ALTER TABLE trips ADD COLUMN companions TEXT').catch(() => {});
  await db.run('ALTER TABLE trips ADD COLUMN start_address_id TEXT').catch(() => {});
  await db.run('ALTER TABLE trips ADD COLUMN stop_address_id TEXT').catch(() => {});

  // Auto-promote earliest registered user to Admin if no admin exists yet
  try {
    const adminCheck = await db.get('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
    if (!adminCheck || adminCheck.count === 0) {
      const firstUser = await db.get('SELECT id, username FROM users ORDER BY created_at ASC LIMIT 1');
      if (firstUser) {
        await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [firstUser.id]);
        console.log(`[Migration] Auto-promoted earliest registered user "${firstUser.username}" (${firstUser.id}) to Admin.`);
      }
    }
  } catch (err) {
    console.error('Error auto-promoting earliest user to Admin:', err);
  }

  // One-Time Safe Migration: Backfill locations and places local_file_data from existing entity_photos
  try {
    const locRes = await db.run(`
      UPDATE locations 
      SET local_file_data = (
        SELECT file_path FROM entity_photos 
        WHERE entity_photos.entity_id = locations.id 
        ORDER BY is_featured DESC, created_at DESC LIMIT 1
      ) 
      WHERE local_file_data IS NULL OR local_file_data = ''
    `);
    const placeRes = await db.run(`
      UPDATE places 
      SET local_file_data = (
        SELECT file_path FROM entity_photos 
        WHERE entity_photos.entity_id = places.id 
        ORDER BY is_featured DESC, created_at DESC LIMIT 1
      ) 
      WHERE local_file_data IS NULL OR local_file_data = ''
    `);
    if (locRes.changes > 0 || placeRes.changes > 0) {
      console.log(`[Migration] Auto-populated cover photo links: ${locRes.changes} locations, ${placeRes.changes} places.`);
    }
  } catch (err) {
    console.error('Error running cover photo backfill migration:', err);
  }

  console.log('SQLite database tables initialized successfully.');
}

// Helper to seed default tags for a new user
export async function seedDefaultTags(userId) {
  const defaultTags = [
    { name: '#flight', color: '#3b82f6' },
    { name: '#hotel', color: '#eab308' },
    { name: '#transportation', color: '#8b5cf6' },
    { name: '#restaurant', color: '#ec4899' },
    { name: '#Day1', color: '#6b7280' },
    { name: '#Day2', color: '#4b5563' },
    { name: '#morning', color: '#f59e0b' },
    { name: '#evening', color: '#374151' },
    { name: '#to-book', color: '#ef4444' },
    { name: '#confirmed', color: '#10b981' },
    { name: '#paid', color: '#22c55e' },
    { name: '#saved', color: '#06b6d4' },
    { name: '#must-do', color: '#dc2626' },
    { name: '#maybe', color: '#a855f7' },
    { name: '#hidden-gem', color: '#f43f5e' },
    { name: '#city-center', color: '#14b8a6' },
    { name: '#old-town', color: '#d97706' },
    { name: '#beach', color: '#06b6d4' },
    { name: '#nature', color: '#22c55e' },
    { name: '#shopping', color: '#ec4899' }
  ];

  try {
    for (const tag of defaultTags) {
      const cleanName = tag.name.replace('#', '');
      const tagId = `tag-${cleanName}-${userId}`;
      await db.run(
        `INSERT OR IGNORE INTO tags (id, user_id, name, color) VALUES (?, ?, ?, ?)`,
        [tagId, userId, tag.name, tag.color]
      );
    }
  } catch (err) {
    console.error('Error seeding default tags:', err);
  }
}

// Helper to seed custom categories for a user
export async function seedDefaultCategories(userId) {
  const defaultCategories = [
    { name: 'Monuments', icon: '🗿' },
    { name: 'Cultural villages', icon: '🏡' },
    { name: 'National parks', icon: '🏞️' },
    { name: 'Coastal areas', icon: '🏖️' },
    { name: 'Islands', icon: '🏝️' },
    { name: 'Geological wonders', icon: '🌋' },
    { name: 'Theme parks', icon: '🎡' },
    { name: 'Nightlife districts', icon: '🌃' },
    { name: 'Culinary hotspots', icon: '🍳' },
    { name: 'Resort', icon: '🏨' },
    { name: 'Wellness retreats', icon: '🧘' },
    { name: 'Scenic trails', icon: '🥾' },
    { name: 'City Skylines', icon: '🏙️' },
    { name: 'Public squares', icon: '🏛️' },
    { name: 'Cafe', icon: '☕' },
    { name: 'Temple/Religous Place', icon: '⛩️' },
    { name: 'Heritage Site', icon: '🏰' },
    { name: 'Restaurants', icon: '🍽️' }
  ];

  try {
    for (const cat of defaultCategories) {
      const catId = `cat-${cat.name.toLowerCase().replace(/\s+/g, '-')}-${userId}`;
      await db.run(
        `INSERT OR IGNORE INTO custom_categories (id, user_id, name, icon, type) VALUES (?, ?, ?, ?, ?)`,
        [catId, userId, cat.name, cat.icon, 'place']
      );
    }
  } catch (err) {
    console.error('Error seeding default categories:', err);
  }
}
