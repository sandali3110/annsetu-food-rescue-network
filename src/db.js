/**
 * SQLite database using sql.js (SQLite compiled to WebAssembly).
 * It needs no installation and works the same on Windows, macOS and Linux.
 * The whole database lives in one file: data/annsetu.db
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { DB_FILE } = require('./config');

let db;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('donor', 'rescuer')),
  org_name      TEXT NOT NULL,
  phone         TEXT NOT NULL,
  address       TEXT NOT NULL,
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  food_type      TEXT NOT NULL CHECK (food_type IN ('veg', 'non-veg', 'mixed')),
  servings       INTEGER NOT NULL CHECK (servings > 0),
  safe_until     TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  lat            REAL NOT NULL,
  lng            REAL NOT NULL,
  status         TEXT NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available', 'claimed', 'picked_up', 'delivered', 'expired', 'cancelled')),
  claimed_by     INTEGER REFERENCES users(id),
  claimed_at     TEXT,
  pickup_eta     TEXT,
  pickup_code    TEXT,
  picked_up_at   TEXT,
  delivered_at   TEXT,
  people_served  INTEGER,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_donor ON listings(donor_id);
CREATE INDEX IF NOT EXISTS idx_listings_claimed_by ON listings(claimed_by);
`;

async function init() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_FILE) ? new SQL.Database(fs.readFileSync(DB_FILE)) : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(SCHEMA);
}

function save() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
  db.run('PRAGMA foreign_keys = ON;'); // export() resets pragmas
}

/** Runs a SELECT and returns every row as an object. */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Runs a SELECT and returns the first row, or null. */
function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

/** Runs INSERT / UPDATE / DELETE, saves to disk, returns { changes, lastId }. */
function run(sql, params = []) {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastId = get('SELECT last_insert_rowid() AS id').id;
  save();
  return { changes, lastId };
}

/** Runs several statements as one transaction, saving once at the end. */
function transaction(fn) {
  db.run('BEGIN');
  try {
    const result = fn({
      run: (sql, params = []) => {
        db.run(sql, params);
        return { changes: db.getRowsModified(), lastId: get('SELECT last_insert_rowid() AS id').id };
      },
    });
    db.run('COMMIT');
    save();
    return result;
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

module.exports = { init, all, get, run, transaction };
