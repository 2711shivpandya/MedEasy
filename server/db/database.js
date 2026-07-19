/* ================================================================
   MedEasy — Database Connection (better-sqlite3)
   Auto-initializes schema on first run
   ================================================================ */

'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const DB_PATH   = process.env.DB_PATH || './medeasy.db';
const SCHEMA    = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

let db;

function getDb() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH), { verbose: process.env.NODE_ENV === 'development' ? console.log : undefined });
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Run schema (all CREATE IF NOT EXISTS, safe to re-run)
    db.exec(SCHEMA);
    console.log(`[DB] Connected → ${path.resolve(DB_PATH)}`);
  }
  return db;
}

module.exports = { getDb };
