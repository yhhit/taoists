// ============== State ==============
let token = localStorage.getItem('token');
let username = localStorage.getItem('username');
let currentDate = new Date();
let currentPage = 'home';

// ============== API Helper ==============
async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

// ============== Toast ==============
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ============== Date Helpers ==============
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDisplay(d) {
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${weekDays[d.getDay()]}`;
}

function getToday() {
  return formatDate(new Date());
}

// ============== Auth ==============
function initAuth() {
  // Tab switching
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.auth-form-inner').forEach(f => f.classList.remove('active'));
      document.getElementById(target === 'login' ? 'login-form' : 'register-form').classList.add('active');
      document.getElementById('auth-error').textContent = '';
    });
  });

  // Login
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
      token = data.token;
      username = data.username;
      localStorage.setItem('token', token);
      localStorage.setItem('username', username);
      showApp();
    } catch (err) {
      document.getElementById('auth-error').textContent = err.error || '登录失败';
    }
  });

  // Register
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('reg-username').value.trim();
    const p = document.getElementById('reg-password').value;
    try {
      const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
      token = data.token;
      username = data.username;
      localStorage.setItem('token', token);
      localStorage.setItem('username', username);
      showApp();
    } catch (err) {
      document.getElementById('auth-error').textContent = err.error || '注册失败';
    }
  });
}

function logout() {
  token = null;
  username = null;
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
  // Clear form inputs
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('reg-username').value = '';
  document.getElementById('reg-password').value = '';
}

// ============== App Init ==============
function showApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('user-badge').textContent = username;
  currentDate = new Date();
  updateDateDisplay();
  switchPage('home');
  checkWarnings();
}

// ============== Page Navigation ==============
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

  // Load page data
  const dateStr = formatDate(currentDate);
  switch (page) {
    case 'home': loadHome(); break;
    case 'meditation':
      document.getElementById('med-date').value = dateStr;
      loadMeditations();
      break;
    case 'thoughts':
      document.getElementById('thought-date').value = dateStr;
      loadThoughts();
      break;
    case 'schedule':
      document.getElementById('sched-date').value = dateStr;
      loadSchedule();
      break;
    case 'leaderboard':
      loadLeaderboard();
      break;
  }
}

// ============== Date Navigation ==============
function updateDateDisplay() {
  document.getElementById('current-date').textContent = formatDateDisplay(currentDate);
}

function prevDate() {
  currentDate.setDate(currentDate.getDate() - 1);
  updateDateDisplay();
  if (currentPage === 'home') loadHome();
}

function nextDate() {
  currentDate.setDate(currentDate.getDate() + 1);
  updateDateDisplay();
  if (currentPage === 'home') loadHome();
}

// ============== Home / Scores ==============
async function loadHome() {
  const dateStr = formatDate(currentDate);
  try {
    const score = await api(`/api/scores?date=${dateStr}`);
    
    // Update score ring
    const totalPercent = score.totalScore / 100;
    const circumference = 2 * Math.PI * 52;
    const offset = circumference * (1 - totalPercent);
    const ring = document.getElementById('score-ring-fg');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = offset;

    document.getElementById('total-score').textContent = score.totalScore;
    document.getElementById('med-score').textContent = `${score.meditationScore}/50`;
    document.getElementById('wake-score').textContent = `${score.wakeScore}/25`;
    document.getElementById('sleep-score').textContent = `${score.sleepScore}/25`;
    document.getElementById('thought-count').textContent = `${score.thoughtCount}次`;

    // Update summary text
    const parts = [];
    if (score.meditationMinutes > 0) parts.push(`打坐 <strong>${score.meditationMinutes}分钟</strong>`);
    if (score.wakeTime) parts.push(`起床 <strong>${score.wakeTime}</strong>`);
    if (score.sleepTime) parts.push(`睡觉 <strong>${score.sleepTime}</strong>`);
    if (score.thoughtCount > 0) parts.push(`凡心 <strong>${score.thoughtCount}次</strong>`);
    document.getElementById('score-summary').innerHTML = parts.length > 0 ? parts.join('<br>') : '今日暂无记录';
  } catch (err) {
    if (err.error === '未登录' || err.error === '登录已过期') logout();
  }
}

// SVG gradient is now defined inline in HTML

// ============== Warnings ==============
async function checkWarnings() {
  try {
    const data = await api(`/api/warnings?date=${getToday()}`);
    const banner = document.getElementById('warning-banner');
    if (data.hasWarnings) {
      const msgs = data.warnings.map(w => w.message).join('；');
      document.getElementById('warning-text').textContent = msgs;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  } catch (err) {
    // Ignore
  }
}

// ============== Meditation ==============
async function loadMeditations() {
  const dateStr = formatDate(currentDate);
  try {
    const rows = await api(`/api/meditations?date=${dateStr}`);
    const list = document.getElementById('med-list');
    if (rows.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🧘</div><p>今日尚无打坐记录</p></div>';
      return;
    }
    list.innerHTML = rows.map(r => `
      <div class="record-card">
        <div class="record-info">
          <div class="record-title">${r.duration_minutes} 分钟</div>
          <div class="record-detail">
            ${r.notes ? `<span class="label">备注：</span>${escHtml(r.notes)}` : ''}
          </div>
        </div>
        <div class="record-actions">
          <button class="btn-delete" onclick="deleteMeditation(${r.id})" title="删除">🗑</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    // Ignore
  }
}

async function addMeditation() {
  const date = document.getElementById('med-date').value;
  const duration = parseInt(document.getElementById('med-duration').value);
  const notes = document.getElementById('med-notes').value.trim();
  if (!date || !duration || duration <= 0) {
    showToast('请填写日期和有效时长', 'error');
    return;
  }
  try {
    await api('/api/meditations', { method: 'POST', body: JSON.stringify({ date, duration_minutes: duration, notes }) });
    showToast('打坐记录已添加 🧘');
    document.getElementById('med-duration').value = '';
    document.getElementById('med-notes').value = '';
    loadMeditations();
    checkWarnings();
  } catch (err) {
    showToast(err.error || '添加失败', 'error');
  }
}

async function deleteMeditation(id) {
  if (!confirm('确定删除这条记录？')) return;
  try {
    await api(`/api/meditations/${id}`, { method: 'DELETE' });
    showToast('已删除');
    loadMeditations();
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// ============== Thoughts ==============
async function loadThoughts() {
  const dateStr = formatDate(currentDate);
  try {
    const rows = await api(`/api/thoughts?date=${dateStr}`);
    const list = document.getElementById('thought-list');
    if (rows.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">💭</div><p>今日无凡俗心记录 — 很好！</p></div>';
      return;
    }
    list.innerHTML = rows.map(r => `
      <div class="record-card">
        <div class="record-info">
          <div class="record-title">${escHtml(r.cause)}</div>
          <div class="record-detail">
            <span class="label">内容：</span>${escHtml(r.content)}<br>
            ${r.trajectory ? `<span class="label">轨迹：</span>${escHtml(r.trajectory)}` : ''}
          </div>
        </div>
        <div class="record-actions">
          <button class="btn-delete" onclick="deleteThought(${r.id})" title="删除">🗑</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    // Ignore
  }
}

async function addThought() {
  const date = document.getElementById('thought-date').value;
  const cause = document.getElementById('thought-cause').value.trim();
  const content = document.getElementById('thought-content').value.trim();
  const trajectory = document.getElementById('thought-trajectory').value.trim();
  if (!date || !cause || !content) {
    showToast('请填写日期、原因和内容', 'error');
    return;
  }
  try {
    await api('/api/thoughts', { method: 'POST', body: JSON.stringify({ date, cause, content, trajectory }) });
    showToast('凡俗心记录已添加 💭');
    document.getElementById('thought-cause').value = '';
    document.getElementById('thought-content').value = '';
    document.getElementById('thought-trajectory').value = '';
    loadThoughts();
  } catch (err) {
    showToast(err.error || '添加失败', 'error');
  }
}

async function deleteThought(id) {
  if (!confirm('确定删除这条记录？')) return;
  try {
    await api(`/api/thoughts/${id}`, { method: 'DELETE' });
    showToast('已删除');
    loadThoughts();
  } catch (err) {
    showToast('删除失败', 'error');
  }
}

// ============== Schedule ==============
async function loadSchedule() {
  const dateStr = formatDate(currentDate);
  try {
    const rows = await api(`/api/schedules?date=${dateStr}`);
    const list = document.getElementById('sched-list');
    if (rows.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">⏰</div><p>今日尚无作息记录</p></div>';
      // Reset remark visibility
      document.getElementById('wake-remark-group').style.display = 'none';
      document.getElementById('sleep-remark-group').style.display = 'none';
      document.getElementById('sched-wake').value = '';
      document.getElementById('sched-sleep').value = '';
      document.getElementById('sched-wake-remark').value = '';
      document.getElementById('sched-sleep-remark').value = '';
      return;
    }
    const r = rows[0];
    // Pre-fill form with existing data
    document.getElementById('sched-wake').value = r.wake_time || '';
    document.getElementById('sched-sleep').value = r.sleep_time || '';
    document.getElementById('sched-wake-remark').value = r.wake_remark || '';
    document.getElementById('sched-sleep-remark').value = r.sleep_remark || '';
    checkScheduleRemarks();

    list.innerHTML = `
      <div class="record-card">
        <div class="record-info">
          <div class="record-title">
            ${r.wake_time ? `☀️ 起床 ${r.wake_time}` : ''}
            ${r.wake_time && r.sleep_time ? ' · ' : ''}
            ${r.sleep_time ? `🌙 睡觉 ${r.sleep_time}` : ''}
          </div>
          <div class="record-detail">
            ${r.wake_remark ? `<span class="label">起床备注：</span>${escHtml(r.wake_remark)}<br>` : ''}
            ${r.sleep_remark ? `<span class="label">睡觉备注：</span>${escHtml(r.sleep_remark)}` : ''}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    // Ignore
  }
}

function checkScheduleRemarks() {
  const wakeVal = document.getElementById('sched-wake').value;
  const sleepVal = document.getElementById('sched-sleep').value;

  // Check wake time > 9:00
  if (wakeVal) {
    const [wh, wm] = wakeVal.split(':').map(Number);
    if (wh > 9 || (wh === 9 && wm > 0)) {
      document.getElementById('wake-remark-group').style.display = 'block';
    } else {
      document.getElementById('wake-remark-group').style.display = 'none';
    }
  } else {
    document.getElementById('wake-remark-group').style.display = 'none';
  }

  // Check sleep time > 0:30
  if (sleepVal) {
    const [sh, sm] = sleepVal.split(':').map(Number);
    if ((sh === 0 && sm > 30) || (sh >= 1 && sh < 6)) {
      document.getElementById('sleep-remark-group').style.display = 'block';
    } else {
      document.getElementById('sleep-remark-group').style.display = 'none';
    }
  } else {
    document.getElementById('sleep-remark-group').style.display = 'none';
  }
}

// Remark modal for auto popup
function showRemarkModal(title, msg, callback) {
  const modal = document.getElementById('remark-modal');
  document.getElementById('remark-modal-title').textContent = title;
  document.getElementById('remark-modal-msg').textContent = msg;
  document.getElementById('remark-modal-input').value = '';
  modal.style.display = 'flex';

  const confirmBtn = document.getElementById('remark-modal-confirm');
  const cancelBtn = document.getElementById('remark-modal-cancel');
  const overlay = modal.querySelector('.modal-overlay');

  function close() {
    modal.style.display = 'none';
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    overlay.removeEventListener('click', onCancel);
  }

  function onConfirm() {
    const val = document.getElementById('remark-modal-input').value.trim();
    if (!val) {
      showToast('备注不能为空', 'error');
      return;
    }
    close();
    callback(val);
  }

  function onCancel() {
    close();
  }

  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  overlay.addEventListener('click', onCancel);
}

async function addSchedule() {
  const date = document.getElementById('sched-date').value;
  const wake_time = document.getElementById('sched-wake').value;
  const sleep_time = document.getElementById('sched-sleep').value;
  let wake_remark = document.getElementById('sched-wake-remark').value.trim();
  let sleep_remark = document.getElementById('sched-sleep-remark').value.trim();

  if (!date) {
    showToast('请选择日期', 'error');
    return;
  }
  if (!wake_time && !sleep_time) {
    showToast('请至少填写一项时间', 'error');
    return;
  }

  // Check if wake remark is needed but missing -> show modal
  if (wake_time) {
    const [wh, wm] = wake_time.split(':').map(Number);
    if ((wh > 9 || (wh === 9 && wm > 0)) && !wake_remark) {
      showRemarkModal('⚠️ 起床超时', `起床时间 ${wake_time} 超过了 9:00，请说明原因：`, (remark) => {
        document.getElementById('sched-wake-remark').value = remark;
        document.getElementById('wake-remark-group').style.display = 'block';
        addSchedule(); // Retry
      });
      return;
    }
  }

  // Check if sleep remark is needed but missing -> show modal
  if (sleep_time) {
    const [sh, sm] = sleep_time.split(':').map(Number);
    if (((sh === 0 && sm > 30) || (sh >= 1 && sh < 6)) && !sleep_remark) {
      showRemarkModal('⚠️ 睡觉超时', `睡觉时间 ${sleep_time} 超过了 0:30，请说明原因：`, (remark) => {
        document.getElementById('sched-sleep-remark').value = remark;
        document.getElementById('sleep-remark-group').style.display = 'block';
        addSchedule(); // Retry
      });
      return;
    }
  }

  try {
    await api('/api/schedules', {
      method: 'POST',
      body: JSON.stringify({ date, wake_time, sleep_time, wake_remark, sleep_remark })
    });
    showToast('作息记录已保存 ⏰');
    loadSchedule();
    checkWarnings();
  } catch (err) {
    if (err.needWakeRemark) {
      showRemarkModal('⚠️ 起床超时', err.error, (remark) => {
        document.getElementById('sched-wake-remark').value = remark;
        addSchedule();
      });
    } else if (err.needSleepRemark) {
      showRemarkModal('⚠️ 睡觉超时', err.error, (remark) => {
        document.getElementById('sched-sleep-remark').value = remark;
        addSchedule();
      });
    } else {
      showToast(err.error || '保存失败', 'error');
    }
  }
}

// ============== Leaderboard ==============
let currentLbRange = 'day';

async function loadLeaderboard(range) {
  if (range) currentLbRange = range;
  try {
    const data = await api(`/api/leaderboard?range=${currentLbRange}&date=${getToday()}`);
    const list = document.getElementById('lb-list');
    if (data.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">🏆</div><p>暂无排行数据</p></div>';
      return;
    }

    const rangeLabels = { day: '今日', week: '本周', month: '本月', halfyear: '半年' };

    list.innerHTML = data.map((item, i) => {
      const rankClass = i < 3 ? `rank-${i + 1}` : 'rank-other';
      const medals = ['🥇', '🥈', '🥉'];
      const rankDisplay = i < 3 ? medals[i] : (i + 1);
      return `
        <div class="lb-item" onclick="showUserDetail('${escHtml(item.username)}')">
          <div class="lb-rank ${rankClass}">${rankDisplay}</div>
          <div class="lb-info">
            <div class="lb-name">${escHtml(item.username)}</div>
            <div class="lb-stats">打坐${item.totalMeditation}分钟 · 凡心${item.totalThoughts}次</div>
          </div>
          <div class="lb-score-wrap">
            <div class="lb-score">${item.avgScore}</div>
            <div class="lb-score-label">平均分</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    // Ignore
  }
}

async function showUserDetail(uname) {
  const modal = document.getElementById('user-detail-modal');
  document.getElementById('user-detail-title').textContent = `${uname} 的修炼记录`;
  document.getElementById('user-detail-summary').innerHTML = '';
  document.getElementById('user-detail-list').innerHTML = '<div class="empty-state"><p>加载中...</p></div>';
  modal.style.display = 'flex';

  try {
    const data = await api(`/api/user-detail?username=${encodeURIComponent(uname)}&range=${currentLbRange}&date=${getToday()}`);
    const days = data.days;

    if (days.length === 0) {
      document.getElementById('user-detail-summary').innerHTML = '';
      document.getElementById('user-detail-list').innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>该时段暂无记录</p></div>';
      return;
    }

    // Calculate summary
    let totalScore = 0, totalMed = 0, totalThoughts = 0;
    days.forEach(d => {
      totalScore += d.totalScore;
      totalMed += d.meditationMinutes;
      totalThoughts += d.thoughtCount;
    });
    const avgScore = Math.round(totalScore / days.length * 10) / 10;

    document.getElementById('user-detail-summary').innerHTML = `
      <div class="ud-stat"><span class="ud-stat-value">${avgScore}</span><span class="ud-stat-label">平均分</span></div>
      <div class="ud-stat"><span class="ud-stat-value">${days.length}</span><span class="ud-stat-label">记录天数</span></div>
      <div class="ud-stat"><span class="ud-stat-value">${totalMed}</span><span class="ud-stat-label">总打坐(分)</span></div>
      <div class="ud-stat"><span class="ud-stat-value">${totalThoughts}</span><span class="ud-stat-label">凡心次数</span></div>
    `;

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    document.getElementById('user-detail-list').innerHTML = days.map(d => {
      const dt = new Date(d.date);
      const dateLabel = `${dt.getMonth() + 1}/${dt.getDate()} 周${weekDays[dt.getDay()]}`;

      // Meditation records
      let medHtml = '';
      if (d.meditations && d.meditations.length > 0) {
        medHtml = `<div class="ud-section">
          <div class="ud-section-title">🧘 打坐记录 (${d.meditationScore}分)</div>
          ${d.meditations.map(m => `<div class="ud-record-item">
            <span class="ud-val">${m.duration_minutes}分钟</span>${m.notes ? ` <span class="ud-record-note">— ${escHtml(m.notes)}</span>` : ''}
          </div>`).join('')}
        </div>`;
      }

      // Schedule
      let schedHtml = '';
      if (d.wakeTime || d.sleepTime) {
        schedHtml = `<div class="ud-section">
          <div class="ud-section-title">⏰ 作息 (${d.wakeScore + d.sleepScore}分)</div>
          ${d.wakeTime ? `<div class="ud-record-item">☀️ 起床 <span class="ud-val">${d.wakeTime}</span> (${d.wakeScore}分)${d.wakeRemark ? ` <span class="ud-record-note">— ${escHtml(d.wakeRemark)}</span>` : ''}</div>` : ''}
          ${d.sleepTime ? `<div class="ud-record-item">🌙 睡觉 <span class="ud-val">${d.sleepTime}</span> (${d.sleepScore}分)${d.sleepRemark ? ` <span class="ud-record-note">— ${escHtml(d.sleepRemark)}</span>` : ''}</div>` : ''}
        </div>`;
      }

      // Thoughts
      let thoughtHtml = '';
      if (d.thoughts && d.thoughts.length > 0) {
        thoughtHtml = `<div class="ud-section">
          <div class="ud-section-title">💭 凡俗心 (${d.thoughtCount}次)</div>
          ${d.thoughts.map(t => `<div class="ud-record-item">
            <div><span class="ud-record-label">原因：</span>${escHtml(t.cause)}</div>
            <div><span class="ud-record-label">内容：</span>${escHtml(t.content)}</div>
            ${t.trajectory ? `<div><span class="ud-record-label">轨迹：</span>${escHtml(t.trajectory)}</div>` : ''}
          </div>`).join('')}
        </div>`;
      }

      const hasRecords = medHtml || schedHtml || thoughtHtml;

      return `
        <div class="ud-day-card">
          <div class="ud-day-header">
            <span class="ud-day-date">${dateLabel}</span>
            <span class="ud-day-total">${d.totalScore}分</span>
          </div>
          ${hasRecords ? `${medHtml}${schedHtml}${thoughtHtml}` : '<div class="ud-no-record">暂无记录</div>'}
        </div>
      `;
    }).join('');
  } catch (err) {
    document.getElementById('user-detail-list').innerHTML = '<div class="empty-state"><p>加载失败</p></div>';
  }
}

function closeUserDetail() {
  document.getElementById('user-detail-modal').style.display = 'none';
}

// ============== Utility ==============
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============== Event Bindings ==============
document.addEventListener('DOMContentLoaded', () => {
  initAuth();

  // Logout
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Date navigation
  document.getElementById('date-prev').addEventListener('click', prevDate);
  document.getElementById('date-next').addEventListener('click', nextDate);

  // Warning close
  document.getElementById('warning-close').addEventListener('click', () => {
    document.getElementById('warning-banner').style.display = 'none';
  });

  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchPage(item.dataset.page));
  });

  // Meditation
  document.getElementById('btn-add-med').addEventListener('click', addMeditation);

  // Thoughts
  document.getElementById('btn-add-thought').addEventListener('click', addThought);

  // Schedule
  document.getElementById('btn-add-sched').addEventListener('click', addSchedule);
  document.getElementById('sched-wake').addEventListener('change', checkScheduleRemarks);
  document.getElementById('sched-sleep').addEventListener('change', checkScheduleRemarks);

  // Leaderboard tabs
  document.querySelectorAll('.lb-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadLeaderboard(tab.dataset.range);
    });
  });

  // User detail modal close
  document.getElementById('user-detail-close').addEventListener('click', closeUserDetail);
  document.getElementById('user-detail-overlay').addEventListener('click', closeUserDetail);

  // Auto login if token exists
  if (token && username) {
    showApp();
  }
});
