const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { initDb, query, execute } = require('./db');

const app = express();
const PORT = 9192;
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
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (password.length < 3) return res.status(400).json({ error: '密码至少3个字符' });

  const existing = await query('SELECT id FROM users WHERE username = ?', [username]);
  if (existing.length > 0) return res.status(400).json({ error: '用户名已存在' });

  const hash = bcrypt.hashSync(password, 10);
  const result = await execute('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]);
  const token = jwt.sign({ id: result.insertId, username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: user.username });
});

// ============== Meditation Routes ==============
app.get('/api/meditations', authMiddleware, async (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = await query('SELECT * FROM meditations WHERE user_id = ? AND date = ? ORDER BY created_at DESC', [req.user.id, date]);
  } else {
    rows = await query('SELECT * FROM meditations WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 100', [req.user.id]);
  }
  res.json(rows);
});

app.post('/api/meditations', authMiddleware, async (req, res) => {
  const { date, duration_minutes, notes } = req.body;
  if (!date || !duration_minutes) return res.status(400).json({ error: '日期和时长不能为空' });
  const result = await execute('INSERT INTO meditations (user_id, date, duration_minutes, notes) VALUES (?, ?, ?, ?)', [req.user.id, date, duration_minutes, notes || null]);
  res.json({ id: result.insertId });
});

app.delete('/api/meditations/:id', authMiddleware, async (req, res) => {
  await execute('DELETE FROM meditations WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ============== Worldly Thoughts Routes ==============
app.get('/api/thoughts', authMiddleware, async (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = await query('SELECT * FROM worldly_thoughts WHERE user_id = ? AND date = ? ORDER BY created_at DESC', [req.user.id, date]);
  } else {
    rows = await query('SELECT * FROM worldly_thoughts WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT 100', [req.user.id]);
  }
  res.json(rows);
});

app.post('/api/thoughts', authMiddleware, async (req, res) => {
  const { date, cause, content, trajectory } = req.body;
  if (!date || !cause || !content) return res.status(400).json({ error: '日期、原因和内容不能为空' });
  const result = await execute('INSERT INTO worldly_thoughts (user_id, date, cause, content, trajectory) VALUES (?, ?, ?, ?, ?)', [req.user.id, date, cause, content, trajectory || null]);
  res.json({ id: result.insertId });
});

app.delete('/api/thoughts/:id', authMiddleware, async (req, res) => {
  await execute('DELETE FROM worldly_thoughts WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ============== Schedule Routes ==============
app.get('/api/schedules', authMiddleware, async (req, res) => {
  const { date } = req.query;
  let rows;
  if (date) {
    rows = await query('SELECT * FROM schedules WHERE user_id = ? AND date = ? ORDER BY created_at DESC', [req.user.id, date]);
  } else {
    rows = await query('SELECT * FROM schedules WHERE user_id = ? ORDER BY date DESC LIMIT 100', [req.user.id]);
  }
  res.json(rows);
});

app.post('/api/schedules', authMiddleware, async (req, res) => {
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
  const existing = await query('SELECT id FROM schedules WHERE user_id = ? AND date = ?', [req.user.id, date]);
  if (existing.length > 0) {
    const updates = [];
    const params = [];
    if (wake_time !== undefined) { updates.push('wake_time = ?'); params.push(wake_time); }
    if (sleep_time !== undefined) { updates.push('sleep_time = ?'); params.push(sleep_time); }
    if (wake_remark !== undefined) { updates.push('wake_remark = ?'); params.push(wake_remark); }
    if (sleep_remark !== undefined) { updates.push('sleep_remark = ?'); params.push(sleep_remark); }
    if (updates.length > 0) {
      params.push(existing[0].id, req.user.id);
      await execute(`UPDATE schedules SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, params);
    }
    res.json({ id: existing[0].id, updated: true });
  } else {
    const result = await execute('INSERT INTO schedules (user_id, date, wake_time, sleep_time, wake_remark, sleep_remark) VALUES (?, ?, ?, ?, ?, ?)', [req.user.id, date, wake_time || null, sleep_time || null, wake_remark || null, sleep_remark || null]);
    res.json({ id: result.insertId });
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

async function getDailyScore(userId, date) {
  const medRows = await query('SELECT COALESCE(SUM(duration_minutes), 0) as total FROM meditations WHERE user_id = ? AND date = ?', [userId, date]);
  const meditationScore = calcMeditationScore(medRows[0].total);

  const schedRows = await query('SELECT * FROM schedules WHERE user_id = ? AND date = ?', [userId, date]);
  const schedule = schedRows[0] || null;
  const wakeScore = schedule ? calcWakeScore(schedule.wake_time) : 0;
  const sleepScore = schedule ? calcSleepScore(schedule.sleep_time) : 0;

  const thoughtRows = await query('SELECT COUNT(*) as count FROM worldly_thoughts WHERE user_id = ? AND date = ?', [userId, date]);
  const medCountRows = await query('SELECT COUNT(*) as count FROM meditations WHERE user_id = ? AND date = ?', [userId, date]);

  return {
    date,
    meditationMinutes: medRows[0].total,
    meditationCount: medCountRows[0].count,
    meditationScore,
    wakeScore,
    sleepScore,
    scheduleScore: Math.round((wakeScore + sleepScore) * 10) / 10,
    totalScore: Math.round((meditationScore + wakeScore + sleepScore) * 10) / 10,
    thoughtCount: thoughtRows[0].count,
    wakeTime: schedule?.wake_time || null,
    sleepTime: schedule?.sleep_time || null
  };
}

app.get('/api/scores', authMiddleware, async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: '日期不能为空' });
  res.json(await getDailyScore(req.user.id, date));
});

// ============== Leaderboard ==============
app.get('/api/leaderboard', authMiddleware, async (req, res) => {
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

  const users = await query('SELECT id, username FROM users');
  const leaderboard = [];

  for (const user of users) {
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
    const daysCount = dates.length;

    for (const date of dates) {
      const score = await getDailyScore(user.id, date);
      totalScore += score.totalScore;
      totalMeditation += score.meditationMinutes;
      totalThoughts += score.thoughtCount;
    }

    leaderboard.push({
      username: user.username,
      avgScore: daysCount > 0 ? Math.round(totalScore / daysCount * 10) / 10 : 0,
      totalScore: Math.round(totalScore * 10) / 10,
      totalMeditation,
      totalThoughts,
      daysCount
    });
  }

  leaderboard.sort((a, b) => b.avgScore - a.avgScore);
  res.json(leaderboard);
});

// ============== User Detail ==============
app.get('/api/user-detail', authMiddleware, async (req, res) => {
  const { username, range } = req.query;
  const today = req.query.date || new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (!username) return res.status(400).json({ error: '用户名不能为空' });

  const userRows = await query('SELECT id, username FROM users WHERE username = ?', [username]);
  if (userRows.length === 0) return res.status(404).json({ error: '用户不存在' });
  const user = userRows[0];

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

  const dates = [];
  const d = new Date(startDate);
  const end = new Date(endDate);
  while (d <= end) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }

  const dailyDetails = [];
  for (const date of dates) {
    const score = await getDailyScore(user.id, date);
    const meditations = await query('SELECT duration_minutes, notes FROM meditations WHERE user_id = ? AND date = ? ORDER BY created_at DESC', [user.id, date]);
    const thoughts = await query('SELECT cause, content, trajectory FROM worldly_thoughts WHERE user_id = ? AND date = ? ORDER BY created_at DESC', [user.id, date]);
    const schedRows = await query('SELECT wake_time, sleep_time, wake_remark, sleep_remark FROM schedules WHERE user_id = ? AND date = ?', [user.id, date]);
    const schedule = schedRows[0] || null;
    dailyDetails.push({
      ...score,
      wakeRemark: schedule?.wake_remark || null,
      sleepRemark: schedule?.sleep_remark || null,
      meditations,
      thoughts
    });
  }

  // For day range, show all days; for other ranges, filter empty days
  let resultDays;
  if (!range || range === 'day') {
    resultDays = dailyDetails;
  } else {
    resultDays = dailyDetails.filter(d => d.totalScore > 0 || d.meditationMinutes > 0 || d.thoughtCount > 0 || d.wakeTime || d.sleepTime);
  }

  res.json({
    username: user.username,
    range,
    startDate,
    endDate,
    days: resultDays.reverse()
  });
});

// ============== Insights Plaza ==============
app.get('/api/insights', authMiddleware, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  const rows = await query(
    `SELECT i.id, i.content, i.created_at, i.user_id, u.username,
            (SELECT COUNT(*) FROM insight_comments WHERE insight_id = i.id) as comment_count
     FROM insights i JOIN users u ON i.user_id = u.id
     ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  const countRows = await query('SELECT COUNT(*) as total FROM insights');
  const total = countRows[0].total;

  res.json({ items: rows, total, page, pages: Math.ceil(total / limit) });
});

app.post('/api/insights', authMiddleware, async (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '感悟内容不能为空' });
  const result = await execute('INSERT INTO insights (user_id, content) VALUES (?, ?)', [req.user.id, content.trim()]);
  res.json({ id: result.insertId });
});

app.delete('/api/insights/:id', authMiddleware, async (req, res) => {
  await execute('DELETE FROM insights WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ============== Insight Comments ==============
app.get('/api/insights/:id/comments', authMiddleware, async (req, res) => {
  const insightId = parseInt(req.params.id);
  const rows = await query(
    `SELECT c.id, c.content, c.created_at, c.user_id, u.username
     FROM insight_comments c JOIN users u ON c.user_id = u.id
     WHERE c.insight_id = ?
     ORDER BY c.created_at ASC`,
    [insightId]
  );
  res.json(rows);
});

app.post('/api/insights/:id/comments', authMiddleware, async (req, res) => {
  const insightId = parseInt(req.params.id);
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: '评论内容不能为空' });
  const result = await execute(
    'INSERT INTO insight_comments (insight_id, user_id, content) VALUES (?, ?, ?)',
    [insightId, req.user.id, content.trim()]
  );
  res.json({ id: result.insertId });
});

app.delete('/api/insight-comments/:id', authMiddleware, async (req, res) => {
  await execute('DELETE FROM insight_comments WHERE id = ? AND user_id = ?', [parseInt(req.params.id), req.user.id]);
  res.json({ ok: true });
});

// ============== Warning Check ==============
app.get('/api/warnings', authMiddleware, async (req, res) => {
  const today = req.query.date || new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const userId = req.user.id;

  const warnings = [];

  const medCount = await query('SELECT COUNT(*) as c FROM meditations WHERE user_id = ? AND date = ?', [userId, today]);
  if (medCount[0].c === 0) warnings.push({ type: 'meditation', message: '今日尚未记录打坐' });

  const schedCount = await query('SELECT COUNT(*) as c FROM schedules WHERE user_id = ? AND date = ?', [userId, today]);
  if (schedCount[0].c === 0) warnings.push({ type: 'schedule', message: '今日尚未记录作息' });

  res.json({ date: today, warnings, hasWarnings: warnings.length > 0 });
});

// ============== Fallback to SPA ==============
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============== Start Server ==============
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`修炼记录系统运行在 http://localhost:${PORT}`);
  });
}

start().catch(console.error);
