const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { getDb, prepare, saveDb } = require('./db');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'xiulian_secret_key_2024';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============== Auth Middleware ==============
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: '未登录' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

// ============== Auth Routes ==============
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (password.length < 3) return res.status(400).json({ error: '密码至少3个字符' });

  const existing = prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  const result = prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// ============== Meditation Routes ==============
app.get('/api/meditations', authMiddleware, (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = prepare('SELECT * FROM meditations WHERE user_id = ? AND date = ? ORDER BY created_at DESC').all(req.user.id, date);
  } else {
    rows = prepare('SELECT * FROM meditations WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 100').all(req.user.id);
  }
  res.json(rows);
});

app.post('/api/meditations', authMiddleware, (req, res) => {
  const { date, duration_minutes, notes } = req.body;
  if (!date || !duration_minutes) return res.status(400).json({ error: '日期和时长不能为空' });
  const result = prepare('INSERT INTO meditations (user_id, date, duration_minutes, notes) VALUES (?, ?, ?, ?)').run(req.user.id, date, duration_minutes, notes || null);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/meditations/:id', authMiddleware, (req, res) => {
  prepare('DELETE FROM meditations WHERE id = ? AND user_id = ?').run(parseInt(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ============== Worldly Thoughts Routes ==============
app.get('/api/thoughts', authMiddleware, (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = prepare('SELECT * FROM worldly_thoughts WHERE user_id = ? AND date = ? ORDER BY created_at DESC').all(req.user.id, date);
  } else {
    rows = prepare('SELECT * FROM worldly_thoughts WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 100').all(req.user.id);
  }
  res.json(rows);
});

app.post('/api/thoughts', authMiddleware, (req, res) => {
  const { date, cause, content, trajectory } = req.body;
  if (!date || !cause || !content) return res.status(400).json({ error: '日期、原因和内容不能为空' });
  const result = prepare('INSERT INTO worldly_thoughts (user_id, date, cause, content, trajectory) VALUES (?, ?, ?, ?, ?)').run(req.user.id, date, cause, content, trajectory || null);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/thoughts/:id', authMiddleware, (req, res) => {
  prepare('DELETE FROM worldly_thoughts WHERE id = ? AND user_id = ?').run(parseInt(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ============== Schedule Routes ==============
app.get('/api/schedules', authMiddleware, (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = prepare('SELECT * FROM schedules WHERE user_id = ? AND date = ? ORDER BY created_at DESC').all(req.user.id, date);
  } else {
    rows = prepare('SELECT * FROM schedules WHERE user_id = ? ORDER BY date DESC LIMIT 100').all(req.user.id);
  }
  res.json(rows);
});

app.post('/api/schedules', authMiddleware, (req, res) => {
  const { date, wake_time, sleep_time, wake_remark, sleep_remark } = req.body;
  if (!date) return res.status(400).json({ error: '日期不能为空' });

  // Check if wake_time exceeds 9:00 and requires remark
  if (wake_time) {
    const [wh, wm] = wake_time.split(':').map(Number);
    if (wh > 9 || (wh === 9 && wm > 0)) {
      if (!wake_remark) return res.status(400).json({ error: '起床超过9:00，必须填写备注原因', needWakeRemark: true });
    }
  }

  // Check if sleep_time exceeds 00:30 and requires remark
  if (sleep_time) {
    const [sh, sm] = sleep_time.split(':').map(Number);
    if ((sh === 0 && sm > 30) || (sh >= 1 && sh < 6)) {
      if (!sleep_remark) return res.status(400).json({ error: '睡觉超过0:30，必须填写备注原因', needSleepRemark: true });
    }
  }

  // Upsert: insert or update for the same date
  const existing = prepare('SELECT id FROM schedules WHERE user_id = ? AND date = ?').get(req.user.id, date);
  if (existing) {
    const updates = [];
    const params = [];
    if (wake_time !== undefined) { updates.push('wake_time = ?'); params.push(wake_time); }
    if (sleep_time !== undefined) { updates.push('sleep_time = ?'); params.push(sleep_time); }
    if (wake_remark !== undefined) { updates.push('wake_remark = ?'); params.push(wake_remark); }
    if (sleep_remark !== undefined) { updates.push('sleep_remark = ?'); params.push(sleep_remark); }
    if (updates.length > 0) {
      params.push(existing.id, req.user.id);
      prepare(`UPDATE schedules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...params);
    }
    res.json({ id: existing.id, updated: true });
  } else {
    const result = prepare('INSERT INTO schedules (user_id, date, wake_time, sleep_time, wake_remark, sleep_remark) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, date, wake_time || null, sleep_time || null, wake_remark || null, sleep_remark || null);
    res.json({ id: result.lastInsertRowid });
  }
});

// ============== Score Calculation ==============
function calcMeditationScore(totalMinutes) {
  if (totalMinutes >= 30) return 50;
  return Math.round((totalMinutes / 30) * 50 * 10) / 10;
}

function calcWakeScore(wakeTime) {
  if (!wakeTime) return 0;
  const [h, m] = wakeTime.split(':').map(Number);
  const totalMin = h * 60 + m;
  const threshold = 9 * 60; // 9:00
  if (totalMin <= threshold) return 25;
  const overMin = totalMin - threshold;
  const periods = Math.floor(overMin / 20);
  const remainder = overMin % 20;
  let score = 25;
  for (let i = 0; i < periods; i++) {
    score *= 0.7;
  }
  if (remainder > 0) {
    score *= (1 - 0.3 * (remainder / 20));
  }
  return Math.round(score * 10) / 10;
}

function calcSleepScore(sleepTime) {
  if (!sleepTime) return 0;
  const [h, m] = sleepTime.split(':').map(Number);
  // If hour >= 18, it's before midnight = good
  if (h >= 18) return 25;
  if (h === 0 && m <= 30) return 25;
  // Past 0:30
  const threshold = 30;
  let overMin;
  if (h < 6) {
    const totalMin = h * 60 + m;
    overMin = totalMin - threshold;
  } else {
    return 25;
  }
  if (overMin <= 0) return 25;
  const periods = Math.floor(overMin / 20);
  const remainder = overMin % 20;
  let score = 25;
  for (let i = 0; i < periods; i++) {
    score *= 0.7;
  }
  if (remainder > 0) {
    score *= (1 - 0.3 * (remainder / 20));
  }
  return Math.round(score * 10) / 10;
}

function getDailyScore(userId, date) {
  const medRow = prepare('SELECT COALESCE(SUM(duration_minutes), 0) as total FROM meditations WHERE user_id = ? AND date = ?').get(userId, date);
  const meditationScore = calcMeditationScore(medRow.total);

  const schedule = prepare('SELECT * FROM schedules WHERE user_id = ? AND date = ?').get(userId, date);
  const wakeScore = schedule ? calcWakeScore(schedule.wake_time) : 0;
  const sleepScore = schedule ? calcSleepScore(schedule.sleep_time) : 0;

  const thoughtRow = prepare('SELECT COUNT(*) as count FROM worldly_thoughts WHERE user_id = ? AND date = ?').get(userId, date);

  const medCount = prepare('SELECT COUNT(*) as count FROM meditations WHERE user_id = ? AND date = ?').get(userId, date);

  return {
    date,
    meditationMinutes: medRow.total,
    meditationCount: medCount.count,
    meditationScore,
    wakeScore,
    sleepScore,
    scheduleScore: Math.round((wakeScore + sleepScore) * 10) / 10,
    totalScore: Math.round((meditationScore + wakeScore + sleepScore) * 10) / 10,
    thoughtCount: thoughtRow.count,
    wakeTime: schedule?.wake_time || null,
    sleepTime: schedule?.sleep_time || null
  };
}

app.get('/api/scores', authMiddleware, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: '日期不能为空' });
  res.json(getDailyScore(req.user.id, date));
});

// ============== Leaderboard ==============
app.get('/api/leaderboard', authMiddleware, (req, res) => {
  const { range } = req.query;
  const today = req.query.date || new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let startDate, endDate;
  endDate = today;

  switch (range) {
    case 'week': {
      const d = new Date(today);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      startDate = d.toISOString().slice(0, 10);
      break;
    }
    case 'month': {
      startDate = today.slice(0, 7) + '-01';
      break;
    }
    case 'halfyear': {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().slice(0, 10);
      break;
    }
    default:
      startDate = today;
  }

  const users = prepare('SELECT id, username FROM users').all();
  const leaderboard = users.map(user => {
    const dates = [];
    const d = new Date(startDate);
    const end = new Date(endDate);
    while (d <= end) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }

    let totalScore = 0;
    let totalMeditation = 0;
    let totalThoughts = 0;
    let daysCount = dates.length;

    dates.forEach(date => {
      const score = getDailyScore(user.id, date);
      totalScore += score.totalScore;
      totalMeditation += score.meditationMinutes;
      totalThoughts += score.thoughtCount;
    });

    return {
      username: user.username,
      avgScore: daysCount > 0 ? Math.round(totalScore / daysCount * 10) / 10 : 0,
      totalScore: Math.round(totalScore * 10) / 10,
      totalMeditation,
      totalThoughts,
      daysCount
    };
  });

  leaderboard.sort((a, b) => b.avgScore - a.avgScore);
  res.json(leaderboard);
});

// ============== Warning Check ==============
app.get('/api/warnings', authMiddleware, (req, res) => {
  const today = req.query.date || new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const userId = req.user.id;

  const warnings = [];

  const medCount = prepare('SELECT COUNT(*) as c FROM meditations WHERE user_id = ? AND date = ?').get(userId, today);
  if (medCount.c === 0) warnings.push({ type: 'meditation', message: '今日尚未记录打坐' });

  const scheduleCount = prepare('SELECT COUNT(*) as c FROM schedules WHERE user_id = ? AND date = ?').get(userId, today);
  if (scheduleCount.c === 0) warnings.push({ type: 'schedule', message: '今日尚未记录作息' });

  res.json({ date: today, warnings, hasWarnings: warnings.length > 0 });
});

// ============== Fallback to SPA ==============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============== Start Server ==============
async function start() {
  await getDb();
  app.listen(PORT, () => {
    console.log(`修炼记录系统运行在 http://localhost:${PORT}`);
  });
}

start().catch(console.error);
