/* ================================================================
   MedEasy — Express Server Entry Point
   ================================================================ */

'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes = require('./routes/auth');
const apiRoutes  = require('./routes/api');
const authMiddleware = require('./middleware/authMiddleware');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────

const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
];

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile, Postman, curl)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS policy: origin ${origin} is not allowed`));
  },
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ── Serve frontend static files ───────────────────────────────────────────
// Uncomment to serve frontend from Express (optional)
// app.use(express.static(path.join(__dirname, '..')));

// ── Health check ──────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'MedEasy API', timestamp: new Date().toISOString() });
});

// ── Auth routes (public) ──────────────────────────────────────────────────

app.use('/api/auth', authRoutes);

// ── Protected API routes ──────────────────────────────────────────────────

app.use('/api', authMiddleware, apiRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── Global error handler ──────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

// ── Start server ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║  🩺  MedEasy API Server                  ║
║  Running on http://localhost:${PORT}       ║
║  Environment: ${process.env.NODE_ENV || 'development'}            ║
╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
