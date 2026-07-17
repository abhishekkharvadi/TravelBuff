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
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_configs (
      user_id TEXT PRIMARY KEY,
      immich_url TEXT,
      immich_key TEXT,
      immich_alt_url TEXT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      visited INTEGER DEFAULT 0,
      notes TEXT,
      immich_album_id TEXT,
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

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      details TEXT,
      file_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS itinerary_items (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      date TEXT NOT NULL,
      place_id TEXT NOT NULL,
      sequence_order INTEGER NOT NULL,
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
  `;

  await db.exec(schema);
  // Safely add state & country columns if they don't exist in older databases
  await db.run('ALTER TABLE locations ADD COLUMN state TEXT').catch(() => {});
  await db.run('ALTER TABLE locations ADD COLUMN country TEXT').catch(() => {});
  await db.run('ALTER TABLE user_configs ADD COLUMN immich_alt_url TEXT').catch(() => {});

  // Seed custom categories for all existing users
  try {
    const users = await db.all('SELECT id FROM users');
    for (const user of users) {
      await seedDefaultCategories(user.id);
    }
  } catch (err) {
    console.error('Error migrating custom categories for existing users:', err);
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
