const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

app.set('trust proxy', 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
  name: 'atsmaim_session',
  keys: [process.env.SESSION_SECRET || 'dev-secret-change-me'],
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true
}));

async function init() {
  await pool.query('CREATE SCHEMA IF NOT EXISTS atsmaim');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atsmaim.users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atsmaim.patients (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES atsmaim.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date DATE NOT NULL,
      ext_a_sessions INT,
      ext_a_date DATE,
      ext_b_sessions INT,
      ext_b_date DATE,
      ext_c_sessions INT,
      ext_c_date DATE,
      sessions_done INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

function toIsoDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function rowToPatient(r) {
  return {
    id: r.id,
    name: r.name,
    startDate: toIsoDate(r.start_date),
    extA: r.ext_a_sessions ? { sessions: r.ext_a_sessions, date: toIsoDate(r.ext_a_date) } : null,
    extB: r.ext_b_sessions ? { sessions: r.ext_b_sessions, date: toIsoDate(r.ext_b_date) } : null,
    extC: r.ext_c_sessions ? { sessions: r.ext_c_sessions, date: toIsoDate(r.ext_c_date) } : null,
    sessionsDone: r.sessions_done
  };
}

app.post('/api/signup', async (req, res) => {
  try {
    const { username, password, code } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
    }
    if (process.env.SIGNUP_CODE && code !== process.env.SIGNUP_CODE) {
      return res.status(403).json({ error: 'קוד הרשמה שגוי' });
    }
    const hash = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO atsmaim.users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username.trim(), hash]
    );
    req.session.userId = r.rows[0].id;
    res.json({ username: r.rows[0].username });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'שם המשתמש כבר תפוס' });
    }
    console.error('signup error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'שם משתמש וסיסמה נדרשים' });
    }
    const r = await pool.query(
      'SELECT id, username, password_hash FROM atsmaim.users WHERE username = $1',
      [username.trim()]
    );
    if (!r.rows[0]) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'שם משתמש או סיסמה שגויים' });
    req.session.userId = r.rows[0].id;
    res.json({ username: r.rows[0].username });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'שגיאת שרת' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', async (req, res) => {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'unauthorized' });
  const r = await pool.query('SELECT username FROM atsmaim.users WHERE id = $1', [req.session.userId]);
  if (!r.rows[0]) {
    req.session = null;
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.json({ username: r.rows[0].username });
});

app.get('/api/patients', requireAuth, async (req, res) => {
  const r = await pool.query(
    'SELECT * FROM atsmaim.patients WHERE user_id = $1 ORDER BY created_at ASC, id ASC',
    [req.session.userId]
  );
  res.json(r.rows.map(rowToPatient));
});

app.post('/api/patients', requireAuth, async (req, res) => {
  const { name, startDate } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const date = startDate || new Date().toISOString().slice(0, 10);
  const r = await pool.query(
    'INSERT INTO atsmaim.patients (user_id, name, start_date) VALUES ($1, $2, $3) RETURNING *',
    [req.session.userId, name.trim(), date]
  );
  res.json(rowToPatient(r.rows[0]));
});

app.patch('/api/patients/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  const fields = [];
  const values = [];
  let i = 1;
  const map = { name: 'name', startDate: 'start_date', sessionsDone: 'sessions_done' };
  for (const [k, col] of Object.entries(map)) {
    if (req.body[k] !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(req.body[k]);
    }
  }
  for (const slot of ['A', 'B', 'C']) {
    const ext = req.body['ext' + slot];
    if (ext === undefined) continue;
    const lo = slot.toLowerCase();
    if (ext === null) {
      fields.push(`ext_${lo}_sessions = NULL`, `ext_${lo}_date = NULL`);
    } else {
      if (![15, 30, 35].includes(ext.sessions)) return res.status(400).json({ error: 'ext sessions must be 15, 30 or 35' });
      fields.push(`ext_${lo}_sessions = $${i++}`);
      values.push(ext.sessions);
      fields.push(`ext_${lo}_date = $${i++}`);
      values.push(ext.date || new Date().toISOString().slice(0, 10));
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'no fields' });
  values.push(id, req.session.userId);
  const r = await pool.query(
    `UPDATE atsmaim.patients SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
    values
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rowToPatient(r.rows[0]));
});

app.delete('/api/patients/:id', requireAuth, async (req, res) => {
  const r = await pool.query(
    'DELETE FROM atsmaim.patients WHERE id = $1 AND user_id = $2',
    [Number(req.params.id), req.session.userId]
  );
  res.json({ ok: r.rowCount > 0 });
});

app.post('/api/patients/:id/sessions/delta', requireAuth, async (req, res) => {
  const delta = req.body && req.body.delta;
  if (delta !== 1 && delta !== -1) return res.status(400).json({ error: 'bad delta' });
  const r = await pool.query(
    `UPDATE atsmaim.patients
     SET sessions_done = GREATEST(0, sessions_done + $1)
     WHERE id = $2 AND user_id = $3 RETURNING *`,
    [delta, Number(req.params.id), req.session.userId]
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'not found' });
  res.json(rowToPatient(r.rows[0]));
});

init()
  .then(() => {
    app.listen(PORT, () => console.log('atsmaim listening on ' + PORT));
  })
  .catch(err => {
    console.error('init failed:', err);
    process.exit(1);
  });
