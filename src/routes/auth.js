const express = require('express');
const db = require('../db');
const { validateRegister } = require('../validate');
const { hashPassword, verifyPassword, startSession, endSession, publicUser } = require('../auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { valid, errors, data } = validateRegister(req.body);
  if (!valid) return res.status(422).json({ error: 'Some details need fixing.', fields: errors });

  if (db.get('SELECT id FROM users WHERE email = ?', [data.email])) {
    return res.status(409).json({
      error: 'Some details need fixing.',
      fields: { email: 'An account with this email already exists. Log in instead.' },
    });
  }

  const { lastId } = db.run(
    `INSERT INTO users (name, email, password_hash, role, org_name, phone, address, lat, lng, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.email, hashPassword(data.password), data.role, data.orgName, data.phone,
     data.address, data.lat, data.lng, new Date().toISOString()]
  );
  startSession(res, lastId);
  res.status(201).json({ user: publicUser(db.get('SELECT * FROM users WHERE id = ?', [lastId])) });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const row = db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' });
  }
  startSession(res, row.id);
  res.json({ user: publicUser(row) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  endSession(req, res);
  res.status(204).end();
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({ user: req.user || null });
});

module.exports = router;
