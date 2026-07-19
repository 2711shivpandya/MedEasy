/* ================================================================
   MedEasy — Database Connection (Postgres via pg)
   Auto-initializes schema on first run if in development
   ================================================================ */

'use strict';

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

let schemaRun = false;

function getDb() {
  if (!schemaRun && process.env.DATABASE_URL) {
    schemaRun = true;
    const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    pool.query(SCHEMA)
      .then(() => console.log('[DB] Schema verified'))
      .catch(err => console.error('[DB] Schema error:', err));
  }
  return pool;
}

module.exports = { getDb };
