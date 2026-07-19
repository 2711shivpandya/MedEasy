-- MedEasy Database Schema for PostgreSQL
-- This schema can be automatically run on init

-- ── Users table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,              -- bcrypt hash
  avatar      TEXT DEFAULT NULL,          -- optional avatar URL
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Appointments table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id                 SERIAL PRIMARY KEY,
  booking_id         TEXT NOT NULL UNIQUE,   -- e.g. ME-123456
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doctor_name        TEXT NOT NULL,
  doctor_specialty   TEXT NOT NULL,
  hospital           TEXT NOT NULL,
  appt_date          TEXT NOT NULL,          -- ISO date string
  appt_time          TEXT NOT NULL,
  reason             TEXT,
  patient_name       TEXT NOT NULL,
  patient_email      TEXT NOT NULL,
  patient_phone      TEXT,
  insurance_id       TEXT,
  insurance_provider TEXT,
  status             TEXT NOT NULL DEFAULT 'confirmed',
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Symptom checks table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS symptom_checks (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  symptoms    TEXT NOT NULL,
  urgency     TEXT NOT NULL,           -- emergency | urgent | routine
  result_json TEXT NOT NULL,           -- full JSON response
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_user ON appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appt_date);
CREATE INDEX IF NOT EXISTS idx_symptom_user      ON symptom_checks(user_id);
