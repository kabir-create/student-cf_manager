// server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs');
const { Parser } = require('json2csv');

const app = express();
const db = new sqlite3.Database('./students.db');
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Create tables if they don't exist
const initTables = () => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, email TEXT, phone TEXT,
    cf_handle TEXT, current_rating INTEGER,
    max_rating INTEGER, last_updated TEXT,
    email_reminders_sent INTEGER DEFAULT 0,
    email_enabled INTEGER DEFAULT 1
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS contests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    contest_name TEXT,
    rank INTEGER,
    old_rating INTEGER,
    new_rating INTEGER,
    timestamp INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    problem_name TEXT,
    rating INTEGER,
    verdict TEXT,
    timestamp INTEGER
  )`);
};
initTables();

// Retry utility
async function fetchWithRetry(url, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url);
      if (res.status === 200 && res.data.status === 'OK') {
        return res.data.result;
      }
      throw new Error('Non-OK response');
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`⚠️ Retry ${i + 1} failed. Waiting ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

// Data Fetchers
async function fetchAndStoreContests(userId, handle) {
  const contests = await fetchWithRetry(`https://codeforces.com/api/user.rating?handle=${handle}`);
  db.run(`DELETE FROM contests WHERE user_id = ?`, [userId]);
  const stmt = db.prepare(`INSERT INTO contests (user_id, contest_name, rank, old_rating, new_rating, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const c of contests) {
    stmt.run(userId, c.contestName, c.rank, c.oldRating, c.newRating, c.ratingUpdateTimeSeconds);
  }
  stmt.finalize();
}

async function fetchAndStoreSubmissions(userId, handle) {
  const submissions = await fetchWithRetry(`https://codeforces.com/api/user.status?handle=${handle}&from=1&count=10000`);
  db.run(`DELETE FROM submissions WHERE user_id = ?`, [userId]);
  const stmt = db.prepare(`INSERT INTO submissions (user_id, problem_name, rating, verdict, timestamp) VALUES (?, ?, ?, ?, ?)`);
  for (const s of submissions) {
    const p = s.problem;
    if (p && s.verdict && s.creationTimeSeconds) {
      stmt.run(userId, p.name, p.rating || null, s.verdict, s.creationTimeSeconds);
    }
  }
  stmt.finalize();
}

// Insert a student if not exists (Kabish07)
db.get(`SELECT * FROM students WHERE cf_handle = 'Kabish07'`, async (err, row) => {
  if (!row) {
    db.run(`INSERT INTO students (name, email, cf_handle) VALUES (?, ?, ?)`, ['Kabish07', 'tanishcmpunk@gmail.com', 'Kabish07'], async function () {
      const userId = this.lastID;
      try {
        await fetchAndStoreContests(userId, 'Kabish07');
        await fetchAndStoreSubmissions(userId, 'Kabish07');
        console.log('✅ Data fetched for Kabish07');
      } catch (e) {
        console.error('❌ Failed to fetch data for Kabish07:', e.message);
      }
    });
  }
});

// Cron job to sync CF rating at 2AM daily
cron.schedule('0 2 * * *', async () => {
  db.all('SELECT id, cf_handle, email_enabled FROM students WHERE cf_handle IS NOT NULL', [], async (err, students) => {
    if (err) return console.error(err);
    for (const s of students) {
      try {
        const r = await axios.get(`https://codeforces.com/api/user.info?handles=${s.cf_handle}`);
        const info = r.data.result[0];
        db.run(`UPDATE students SET current_rating = ?, max_rating = ?, last_updated = datetime('now') WHERE id = ?`,
          [info.rating || 0, info.maxRating || 0, s.id]);

        // Reminder detection (example logic: no submissions in 7 days)
        if (s.email_enabled) {
          const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
          db.get(`SELECT COUNT(*) as cnt FROM submissions WHERE user_id = ? AND timestamp >= ?`, [s.id, oneWeekAgo], (e, row) => {
            if (row.cnt === 0) {
              db.run(`UPDATE students SET email_reminders_sent = COALESCE(email_reminders_sent, 0) + 1 WHERE id = ?`, [s.id]);
              console.log(`📧 Reminder would be sent to ${s.cf_handle}`);
            }
          });
        }

      } catch (e) {
        console.error(`Rating fetch failed for ${s.cf_handle}`);
      }
    }
  });
});

// API routes
app.get('/api/students', (req, res) => {
  db.all('SELECT * FROM students', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/students', (req, res) => {
  const { name, email, phone, cf_handle } = req.body;
  db.run(`INSERT INTO students (name, email, phone, cf_handle) VALUES (?, ?, ?, ?)`,
    [name, email, phone, cf_handle], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

app.put('/api/students/:id', (req, res) => {
  const { name, email, phone, cf_handle, email_enabled } = req.body;
  db.run(`UPDATE students SET name = ?, email = ?, phone = ?, cf_handle = ?, email_enabled = ? WHERE id = ?`,
    [name, email, phone, cf_handle, email_enabled, req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});

app.delete('/api/students/:id', (req, res) => {
  db.run('DELETE FROM students WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/students/download', (req, res) => {
  db.all('SELECT * FROM students', [], (err, rows) => {
    if (err) return res.status(500).send('Error fetching data');
    const parser = new Parser();
    const csv = parser.parse(rows);
    res.header('Content-Type', 'text/csv');
    res.attachment('students.csv');
    res.send(csv);
  });
});

app.get('/api/student/:id', (req, res) => {
  db.get('SELECT * FROM students WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row || {});
  });
});

app.get('/api/student/:id/contests', (req, res) => {
  const userId = req.params.id;
  const days = parseInt(req.query.days || '90');
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  db.get('SELECT * FROM students WHERE id = ?', [userId], async (err, row) => {
    if (!row || !row.cf_handle) return res.json([]);
    try {
      await fetchAndStoreContests(userId, row.cf_handle);
    } catch (e) {
      console.error("⚠️ Contest fetch failed:", e.message);
    }
    db.all(`SELECT * FROM contests WHERE user_id = ? AND timestamp >= ? ORDER BY timestamp ASC`, [userId, since], (err2, contests) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(contests);
    });
  });
});

app.get('/api/student/:id/submissions', (req, res) => {
  const userId = req.params.id;
  const days = parseInt(req.query.days || '30');
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  db.get('SELECT * FROM students WHERE id = ?', [userId], async (err, row) => {
    if (!row || !row.cf_handle) return res.json([]);
    try {
      await fetchAndStoreSubmissions(userId, row.cf_handle);
    } catch (e) {
      console.error("⚠️ Submissions fetch failed:", e.message);
    }
    db.all(`SELECT * FROM submissions WHERE user_id = ? AND timestamp >= ?`, [userId, since], (err2, rows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(rows);
    });
  });
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
