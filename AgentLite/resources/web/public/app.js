/**
 * Agent Lite v4 — menu, chat sessions, input history
 */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── Modal helpers ──────────────────────────────────────────────────
function openModal(name) {
  const el = $(`#modal-${name}`);
  if (!el) return;
  el.hidden = false;
  const inp = el.querySelector('input, textarea, button:not(.modal__close)');
  if (inp) setTimeout(() => inp.focus(), 50);
}
function closeModal(name) {
  const el = $(`#modal-${name}`);
  if (el) el.hidden = true;
}
$$('.modal__close').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
$$('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id.replace('modal-', '')); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeMenu();
    $$('.modal-overlay:not([hidden])').forEach(ov => closeModal(ov.id.replace('modal-', '')));
  }
});

// ── Menu ───────────────────────────────────────────────────────────
const menu = $('#menu');
const btnMenu = $('#btn-menu');
function closeMenu() { menu.hidden = true; }
btnMenu.addEventListener('click', e => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
});
document.addEventListener('click', e => {
  if (!menu.hidden && !menu.contains(e.target) && !btnMenu.contains(e.target)) closeMenu();
});
menu.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => {
  const name = btn.dataset.open;
  closeMenu();
  if (name === 'files') loadFiles();
  if (name === 'skills') loadSkills();
  if (name === 'logs') refreshLogs();
  openModal(name);
}));

// ── Theme ─────────────────────────────────────────────────────────
const themeBtn = $('#theme-btn');
document.documentElement.dataset.theme = localStorage.getItem('agentlite-theme') || 'dark';
function syncThemeLabel() {
  themeBtn.textContent = document.documentElement.dataset.theme === 'light' ? '🌙 Тёмная тема' : '☀️ Светлая тема';
}
syncThemeLabel();
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('agentlite-theme', next);
  syncThemeLabel();
  closeMenu();
});

// ── State: sessions / current chat ────────────────────────────────
const SESS_KEY = 'agentlite-sessions-v1';
const CUR_KEY  = 'agentlite-current-session';
const MAX_SESSIONS = 10;

let sessions = [];
let currentId = null;
let history = [];

const msgs = $('#msgs');
const welcomeEl = msgs.querySelector('.msgs__welcome');

function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function currentSession() { return sessions.find(s => s.id === currentId) || null; }

function saveSessions() {
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  sessions = sessions.slice(0, MAX_SESSIONS);
  try {
    localStorage.setItem(SESS_KEY, JSON.stringify(sessions));
    localStorage.setItem(CUR_KEY, currentId || '');
  } catch {}
}

function persistCurrent() {
  const s = currentSession();
  if (!s) return;
  s.messages = history;
  s.updatedAt = Date.now();
  if (!s.title || s.title === 'Новый чат') {
    const first = history.find(m => m.role === 'user');
    if (first) s.title = String(first.content).replace(/\s+/g, ' ').trim().slice(0, 48) || 'Новый чат';
  }
  saveSessions();
}

function createSession() {
  const s = { id: uid(), title: 'Новый чат', updatedAt: Date.now(), tokens: 0, messages: [] };
  sessions.unshift(s);
  currentId = s.id;
  history = [];
  saveSessions();
  return s;
}

function loadSessions() {
  try { sessions = JSON.parse(localStorage.getItem(SESS_KEY) || '[]'); } catch { sessions = []; }
  if (!Array.isArray(sessions)) sessions = [];
  sessions = sessions
    .filter(s => s && s.id)
    .map(s => ({
      id: s.id,
      title: s.title || 'Новый чат',
      updatedAt: Number(s.updatedAt) || Date.now(),
      tokens: Number(s.tokens) || 0,
      messages: Array.isArray(s.messages)
        ? s.messages.filter(m => m && ['user', 'assistant', 'system'].includes(m.role) && typeof m.content === 'string')
        : [],
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  currentId = localStorage.getItem(CUR_KEY) || null;
  let cur = sessions.find(s => s.id === currentId) || sessions[0];
  if (!cur) { createSession(); return; }
  currentId = cur.id;
  history = cur.messages;
  localStorage.setItem(CUR_KEY, currentId);
}

// ── Chat rendering ────────────────────────────────────────────────
function updateWelcome() {
  if (welcomeEl) welcomeEl.hidden = msgs.querySelector('.msg') !== null;
}
function clearMessages() {
  msgs.querySelectorAll('.msg').forEach(el => el.remove());
  updateWelcome();
}
function addMsg(role, content) {
  const div = document.createElement('div');
  div.className = `msg msg--${role}`;
  const roleEl = document.createElement('div');
  roleEl.className = 'msg__role';
  roleEl.textContent = role === 'user' ? 'Вы' : 'Agent';
  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble';
  bubble.textContent = content;
  div.append(roleEl, bubble);
  msgs.appendChild(div);
  updateWelcome();
  msgs.scrollTop = msgs.scrollHeight;
  return bubble;
}
function addSystemMsg(content) {
  const div = document.createElement('div');
  div.className = 'msg msg--system';
  const roleEl = document.createElement('div');
  roleEl.className = 'msg__role';
  roleEl.textContent = 'Контекст';
  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble';
  bubble.textContent = content;
  div.append(roleEl, bubble);
  msgs.appendChild(div);
  updateWelcome();
  msgs.scrollTop = msgs.scrollHeight;
}
function renderSession() {
  clearMessages();
  for (const m of history) {
    if (m.role === 'user' || m.role === 'assistant') addMsg(m.role, m.content);
    else if (m.role === 'system') addSystemMsg(m.content);
  }
  msgs.scrollTop = msgs.scrollHeight;
}

// ── Session switching ─────────────────────────────────────────────
const histList = $('#hist-list');

function renderHistoryList() {
  histList.innerHTML = '';
  if (!sessions.length) {
    histList.innerHTML = '<li class="hist-empty">Нет сохранённых чатов</li>';
    return;
  }
  sessions.forEach(s => {
    const li = document.createElement('li');
    li.className = 'hist-item' + (s.id === currentId ? ' sel' : '');
    const info = document.createElement('div');
    info.className = 'hist-info';
    const title = document.createElement('div');
    title.className = 'hist-title';
    title.textContent = s.title || 'Без названия';
    const meta = document.createElement('div');
    meta.className = 'hist-meta';
    const d = new Date(s.updatedAt);
    meta.textContent = d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      + ' · ' + (s.messages?.length || 0) + ' сообщ.';
    info.append(title, meta);
    const del = document.createElement('button');
    del.className = 'hist-del';
    del.textContent = '✕';
    del.title = 'Удалить чат';
    del.addEventListener('click', ev => deleteSession(s.id, ev));
    li.append(info, del);
    li.addEventListener('click', () => switchSession(s.id));
    histList.appendChild(li);
  });
}

function switchSession(id) {
  if (id === currentId) { closeModal('history'); return; }
  persistCurrent();
  const s = sessions.find(x => x.id === id);
  if (!s) return;
  currentId = id;
  history = Array.isArray(s.messages) ? s.messages : [];
  localStorage.setItem(CUR_KEY, currentId);
  renderSession();
  setContext(s.tokens || 0, 16384);
  renderHistoryList();
  closeModal('history');
  promptEl.focus();
}

function newChat() {
  persistCurrent();
  createSession();
  clearMessages();
  setContext(0, 16384);
  renderHistoryList();
  closeModal('history');
  closeMenu();
  promptEl.focus();
}

// Wipe the current session entirely (used when it got polluted with raw XML)
function clearHistory() {
  if (!window.confirm('Очистить текущую историю? Сессия будет удалена целиком, включая ответы с XML-разметкой.')) return;
  sessions = sessions.filter(s => s.id !== currentId);
  saveSessions();
  createSession(); // fresh empty session, history = []
  clearMessages();
  setContext(0, 16384);
  renderHistoryList();
  closeModal('history');
  closeMenu();
  promptEl.focus();
}

function deleteSession(id, ev) {
  if (ev) ev.stopPropagation();
  const wasCurrent = id === currentId;
  sessions = sessions.filter(s => s.id !== id);
  if (wasCurrent) {
    const next = sessions[0];
    if (next) { currentId = next.id; history = next.messages || []; }
    else { createSession(); }
    renderSession();
    setContext(currentSession()?.tokens || 0, 16384);
  }
  saveSessions();
  renderHistoryList();
}

$('#btn-history').addEventListener('click', () => { renderHistoryList(); openModal('history'); });
$('#btn-newchat').addEventListener('click', newChat);
$('#btn-clear-history').addEventListener('click', clearHistory);
$('#hist-new').addEventListener('click', newChat);

// ── Context ring ───────────────────────────────────────────────────
const ctxBtn   = $('#ctx-btn');
const ctxFg    = $('.ctx__ring-fg');
const ctxLabel = $('#ctx-label');

function setContext(tokens, max = 16384) {
  const pct = Math.max(0, Math.min(100, Math.round(tokens / max * 100)));
  ctxLabel.textContent = pct + '%';
  ctxBtn.classList.remove('ctx--warn', 'ctx--crit');
  if (pct > 90) ctxBtn.classList.add('ctx--crit');
  else if (pct > 70) ctxBtn.classList.add('ctx--warn');
  ctxFg.style.strokeDasharray = `${pct}, 100`;
  ctxBtn.title = `Контекст: ${tokens} / ${max} токенов (${pct}%). Нажмите, чтобы сжать.`;
}

ctxBtn.addEventListener('click', async () => {
  if (ctxBtn.classList.contains('ctx--busy')) return;
  if (!history.length) { alert('История пуста — нечего сжимать.'); return; }
  ctxBtn.classList.add('ctx--busy');
  ctxLabel.textContent = '…';
  try {
    const r = await fetch('/api/context/compact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
    if (!d.compacted) { alert(d.message || 'Нечего сжимать'); return; }
    history = Array.isArray(d.new_history) ? d.new_history : history;
    const s = currentSession();
    if (s) s.tokens = d.usage?.current_tokens || 0;
    persistCurrent();
    renderSession();
    setContext(d.usage?.current_tokens || 0, d.usage?.max_tokens || 16384);
  } catch (e) {
    alert('Ошибка сжатия: ' + e.message);
  } finally {
    ctxBtn.classList.remove('ctx--busy');
    const s = currentSession();
    setContext(s?.tokens || 0, 16384);
  }
});

// ── Engine status ─────────────────────────────────────────────────
const engineDot   = $('#engine-dot');
const engineLabel = $('#engine-label');
const btnStart    = $('#btn-start');
const btnStop     = $('#btn-stop');
const engPanelDot   = $('#eng-panel-dot');
const engPanelLabel = $('#eng-panel-label');

function setEngineState(state, label) {
  engineDot.className = 'dot';
  if (engPanelDot) engPanelDot.className = 'dot';
  if (state === 'on')  { engineDot.classList.add('dot--on');  if (engPanelDot) engPanelDot.classList.add('dot--on'); }
  if (state === 'run') { engineDot.classList.add('dot--run'); if (engPanelDot) engPanelDot.classList.add('dot--run'); }
  if (state === 'err') { engineDot.classList.add('dot--err'); if (engPanelDot) engPanelDot.classList.add('dot--err'); }
  engineLabel.textContent = label;
  if (engPanelLabel) engPanelLabel.textContent = label;
  btnStart.disabled = state === 'on' || state === 'run';
  btnStop.disabled  = !(state === 'on');
}

async function checkEngine() {
  try {
    await fetch('/api/health');
    const llm = await fetch('/api/probe').then(x => x.json()).catch(() => ({}));
    if (llm.error) setEngineState('err', 'Прокси недоступен');
    else {
      setEngineState('on', 'Qwen готов');
      engineLabel.title = llm.model || 'Qwen готов';
    }
  } catch {
    setEngineState('', 'Сервер не запущен');
  }
}

btnStart.addEventListener('click', async () => {
  closeMenu();
  setEngineState('run', 'Запуск…');
  try {
    await fetch('/api/engine/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const poll = setInterval(async () => {
      try {
        const r = await fetch('/api/probe');
        if (r.ok) { clearInterval(poll); checkEngine(); }
      } catch {}
    }, 3000);
    setTimeout(() => clearInterval(poll), 240_000);
  } catch {
    setEngineState('err', 'Ошибка запуска');
  }
});

btnStop.addEventListener('click', async () => {
  closeMenu();
  setEngineState('run', 'Остановка…');
  try { await fetch('/api/engine/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
  catch {}
  setEngineState('', 'Остановлен');
});

// ── Chat ──────────────────────────────────────────────────────────
const form       = $('#chat-form');
const promptEl   = $('#prompt');
const sendBtn    = $('#send-btn');
const stopBtn    = $('#stop-btn');

let chatAbort = null;
let lastDiff = null;

// ── Chat/Agent mode toggle ────────────────────────────────────────
const modeChat  = $('#mode-chat');
const modeAgent = $('#mode-agent');
let chatMode = localStorage.getItem('agent-mode') || 'agent';
const applyMode = (m, save = true) => {
  chatMode = m === 'chat' ? 'chat' : 'agent';
  modeChat.classList.toggle('active', chatMode === 'chat');
  modeAgent.classList.toggle('active', chatMode === 'agent');
  $('#mode-toggle').dataset.mode = chatMode;
  if (save) localStorage.setItem('agent-mode', chatMode);
};
modeChat.addEventListener('click', () => applyMode('chat'));
modeAgent.addEventListener('click', () => applyMode('agent'));
applyMode(chatMode, false);

form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = promptEl.value.trim();
  if (!text) return;
  promptEl.value = '';
  pushInputHistory(text);
  addMsg('user', text);
  history.push({ role: 'user', content: text });
  persistCurrent();

  sendBtn.disabled = true;
  stopBtn.hidden = false;

  // Per-message work state: spinner + ticking timer inside the agent bubble
  const t0 = Date.now();
  const fmtElapsed = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  };
  const bubble = addMsg('assistant', '');
  bubble.innerHTML = '<div class="work-line"><span class="spinner"></span><span class="work-line__label">Работает…</span><span class="msg__timer">00:00</span></div>';
  const timerEl = bubble.querySelector('.msg__timer');
  const msgTimer = setInterval(() => { timerEl.textContent = fmtElapsed(); }, 1000);
  let finished = false;
  const finishMsg = () => {
    if (finished) return;
    finished = true;
    clearInterval(msgTimer);
    timerEl.textContent = fmtElapsed();
  };
  chatAbort = new AbortController();
  stopBtn.onclick = () => { try { chatAbort.abort(); } catch {} finishMsg(); };

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history, mode: chatMode }),
      signal: chatAbort.signal,
    });
    if (!resp.ok || !resp.body) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    // ── Read SSE stream: tool_call / tool_result / file_change / done / error ──
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const toolIcon = t => t === 'bash' ? '⚡' : t === 'read_skill' ? '🧩' : t === 'read' ? '📖' : t === 'write' ? '📝' : t === 'edit' ? '✏️' : t === 'grep' ? '🔍' : t === 'list' ? '📁' : '⚙️';
    let toolLogDiv = null;
    const runningCards = [];
    // Accordion: reasoning + tool cards live collapsed inside <details>.
    // Created only when the model actually reasons/calls tools, so chat mode
    // (pure conversation, no events) never shows it.
    const ensureToolLog = () => {
      if (!toolLogDiv && chatMode === 'agent') {
        const details = document.createElement('details');
        details.className = 'reasoning-dropdown msg';
        details.innerHTML = '<summary class="reasoning-dropdown__summary">🤔 Показать размышления и инструменты</summary><div class="reasoning-dropdown__body"></div>';
        msgs.appendChild(details);
        toolLogDiv = details;
      }
      return toolLogDiv;
    };
    const toolBody = () => toolLogDiv.querySelector('.reasoning-dropdown__body');
    let finalReply = null;
    let usage = null;

    const handleEvent = ev => {
      if (ev.type === 'reasoning') {
        const log = ensureToolLog();
        if (!log) return;
        const p = document.createElement('div');
        p.className = 'reasoning-text';
        p.textContent = String(ev.text || '').slice(0, 4000);
        toolBody().appendChild(p);
        msgs.scrollTop = msgs.scrollHeight;
      } else if (ev.type === 'tool_call') {
        const log = ensureToolLog();
        if (!log) return;
        const card = document.createElement('div');
        card.className = 'tool-event tool-event--running';
        card.innerHTML = `${toolIcon(ev.tool)} <b>Запуск: ${esc(ev.tool)}</b><div class="tool-args">${esc(JSON.stringify(ev.args ?? {})).slice(0, 400)}</div>`;
        toolBody().appendChild(card);
        runningCards.push(card);
        msgs.scrollTop = msgs.scrollHeight;
      } else if (ev.type === 'tool_result') {
        const card = runningCards.shift();
        if (card) {
          card.classList.remove('tool-event--running');
          card.classList.add('tool-event--done');
          const res = document.createElement('div');
          res.className = 'tool-result';
          res.textContent = String(ev.result || '').slice(0, 300);
          card.appendChild(res);
        }
        msgs.scrollTop = msgs.scrollHeight;
      } else if (ev.type === 'file_change') {
        const log = ensureToolLog();
        if (!log) return;
        const row = document.createElement('div');
        row.className = 'tool-event tool-event--file';
        row.innerHTML = `✅ Файл <b>${esc(ev.path || 'файл')}</b> изменён. <button class="diff-btn">Показать diff</button>`;
        row.querySelector('.diff-btn').addEventListener('click', async () => {
          lastDiff = ev;
          // lazy-load the diff modal logic on first use
          const { showDiff } = await import('/diff.mjs');
          showDiff(ev, openModal);
        });
        toolBody().appendChild(row);
        msgs.scrollTop = msgs.scrollHeight;
      } else if (ev.type === 'done') {
        finalReply = ev.reply ?? '';
        usage = ev.usage || null;
        // Drop the accordion if the round produced no reasoning and no tool cards
        if (toolLogDiv && !toolLogDiv.querySelector('.tool-event') && !toolLogDiv.querySelector('.reasoning-text')) {
          toolLogDiv.remove();
          toolLogDiv = null;
        }
        finishMsg();
        const took = timerEl.textContent;
        const textEl = document.createElement('div');
        textEl.className = 'msg__text';
        textEl.textContent = finalReply;
        const meta = document.createElement('div');
        meta.className = 'msg__time';
        meta.textContent = `Заняло: ${took}`;
        bubble.textContent = '';
        bubble.append(textEl, meta);
      } else if (ev.type === 'error') {
        throw new Error(ev.message || 'Ошибка сервера');
      }
    };

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const parts = sseBuffer.split('\n\n');
      sseBuffer = parts.pop();
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        let ev = null;
        try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        handleEvent(ev);
      }
    }
    if (finalReply == null) throw new Error('Пустой ответ от сервера');
    history.push({ role: 'assistant', content: finalReply });

    if (usage) {
      const s = currentSession();
      if (s) s.tokens = usage.current_tokens || 0;
      setContext(usage.current_tokens || 0, usage.max_tokens || 16384);
    }
    persistCurrent();
  } catch (err) {
    finishMsg();
    const took = timerEl.textContent;
    if (err.name === 'AbortError') {
      bubble.textContent = '⏹ Остановлено';
      bubble.style.color = 'var(--muted)';
    } else {
      bubble.textContent = `Ошибка: ${err.message}`;
      bubble.style.color = 'var(--error)';
    }
    const meta = document.createElement('div');
    meta.className = 'msg__time';
    meta.textContent = `Заняло: ${took}`;
    bubble.appendChild(meta);
  } finally {
    chatAbort = null;
    if (msgTimer) clearInterval(msgTimer);
    sendBtn.disabled = false;
    stopBtn.hidden = true;
    stopBtn.onclick = null;
    msgs.scrollTop = msgs.scrollHeight;
  }
});

// Attach file
$('#attach-btn').addEventListener('click', () => $('#attach-input').click());
$('#attach-input').addEventListener('change', async e => {
  for (const f of e.target.files) {
    const txt = await f.text();
    promptEl.value += `\n\nФайл: ${f.name}\n\`\`\`\n${txt.slice(0, 4000)}\n\`\`\``;
  }
  e.target.value = '';
});

// ── Input history (↑ / ↓) ─────────────────────────────────────────
const INPUT_KEY = 'agentlite-input-history';
let inputHistory = [];
try { inputHistory = JSON.parse(localStorage.getItem(INPUT_KEY) || '[]'); } catch { inputHistory = []; }
if (!Array.isArray(inputHistory)) inputHistory = [];
let inputIdx = -1;
let inputDraft = '';

function pushInputHistory(text) {
  if (inputHistory[inputHistory.length - 1] !== text) inputHistory.push(text);
  if (inputHistory.length > 50) inputHistory = inputHistory.slice(-50);
  inputIdx = -1;
  inputDraft = '';
  try { localStorage.setItem(INPUT_KEY, JSON.stringify(inputHistory)); } catch {}
}

function onFirstLine(el) {
  return el.value.lastIndexOf('\n', Math.max(0, el.selectionStart - 1)) === -1;
}
function onLastLine(el) {
  return el.value.indexOf('\n', el.selectionEnd) === -1;
}

promptEl.addEventListener('keydown', e => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (!inputHistory.length) return;
  if (e.key === 'ArrowUp' && !onFirstLine(promptEl)) return;
  if (e.key === 'ArrowDown' && !onLastLine(promptEl)) return;
  e.preventDefault();
  if (e.key === 'ArrowUp') {
    if (inputIdx === -1) {
      inputDraft = promptEl.value;
      inputIdx = inputHistory.length - 1;
    } else if (inputIdx > 0) {
      inputIdx--;
    }
    promptEl.value = inputHistory[inputIdx];
  } else {
    if (inputIdx === -1) return;
    if (inputIdx < inputHistory.length - 1) {
      inputIdx++;
      promptEl.value = inputHistory[inputIdx];
    } else {
      inputIdx = -1;
      promptEl.value = inputDraft;
    }
  }
  promptEl.selectionStart = promptEl.selectionEnd = promptEl.value.length;
});

// ── Settings modal ────────────────────────────────────────────────
const cfgBase      = $('#cfg-base');
const cfgModel     = $('#cfg-model');
const cfgTokens    = $('#cfg-tokens');
const cfgWorkspace = $('#cfg-workspace');
const cfgResult    = $('#cfg-result');

fetch('/api/config').then(r => r.json()).then(d => {
  if (d.baseUrl)   cfgBase.value      = d.baseUrl;
  if (d.model)     cfgModel.value     = d.model;
  if (d.maxTokens) cfgTokens.value    = d.maxTokens;
  if (d.workspace) {
    cfgWorkspace.value = d.workspace;
    const fsRoot = $('#fs-root');
    if (fsRoot) fsRoot.value = d.workspace;
  }
}).catch(() => {});

$('#cfg-probe').addEventListener('click', async () => {
  cfgResult.textContent = 'Проверяю…';
  cfgResult.className = 'set-result';
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: cfgBase.value.trim(), model: cfgModel.value.trim(), maxTokens: parseInt(cfgTokens.value, 10) || 4096 }),
    });
    const r = await fetch('/api/probe');
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    cfgResult.textContent = `✓ ${d.model || cfgModel.value}`;
    cfgResult.className = 'set-result set-result--ok';
    checkEngine();
  } catch (e) {
    cfgResult.textContent = `✗ ${e.message}`;
    cfgResult.className = 'set-result set-result--err';
  }
});

$('#cfg-save').addEventListener('click', async () => {
  cfgResult.textContent = 'Сохраняю…';
  cfgResult.className = 'set-result';
  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl:   cfgBase.value.trim(),
        model:     cfgModel.value.trim(),
        maxTokens: parseInt(cfgTokens.value, 10) || 4096,
        workspace: cfgWorkspace.value.trim(),
      }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
    cfgResult.textContent = '✓ Сохранено';
    cfgResult.className = 'set-result set-result--ok';
    const fsRoot = $('#fs-root');
    if (fsRoot) fsRoot.value = cfgWorkspace.value.trim();
  } catch (e) {
    cfgResult.textContent = `✗ ${e.message}`;
    cfgResult.className = 'set-result set-result--err';
  }
});

// ── Files modal ───────────────────────────────────────────────────
const fsList    = $('#fs-list');
const fsName    = $('#fs-name');
const fsContent = $('#fs-content');
const fsPath    = $('#fs-path');
const fsRoot    = $('#fs-root');
const fsResult  = $('#fs-result');
let curFile = '';

async function loadFiles() {
  const p = fsPath.value.trim();
  fsResult.textContent = '';
  fsResult.className = 'fs-result';
  try {
    const r = await fetch(`/api/files${p ? `?path=${encodeURIComponent(p)}` : ''}`);
    const d = await r.json();
    if (d.error) throw new Error(d.error);
    fsList.innerHTML = '';
    const files = d.files || [];
    if (files.length === 0) {
      fsList.innerHTML = '<li style="color:var(--muted)">Папка пуста или не найдена</li>';
      return;
    }
    files.forEach(f => {
      const li = document.createElement('li');
      li.textContent = (f.isDirectory ? '📁 ' : '') + f.name;
      li.title = f.path;
      if (f.isDirectory) li.addEventListener('click', () => { fsPath.value = f.path; loadFiles(); });
      else li.addEventListener('click', () => openFile(f, li));
      fsList.appendChild(li);
    });
  } catch (e) {
    fsList.innerHTML = `<li style="color:var(--error)">${e.message}</li>`;
  }
}

async function openFile(f, li) {
  const rel = f.path || f.name;
  try {
    const r = await fetch(`/api/file?path=${encodeURIComponent(rel)}`);
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
    const text = await r.text();
    curFile = rel;
    fsName.textContent = rel;
    fsContent.textContent = text;
    fsContent.style.color = '';
    fsContent.contentEditable = 'true';
    $('#fs-save').hidden = false;
    fsList.querySelectorAll('li').forEach(x => x.classList.remove('sel'));
    if (li) li.classList.add('sel');
  } catch (e) {
    fsContent.textContent = e.message;
    fsContent.style.color = 'var(--error)';
  }
}

$('#fs-go').addEventListener('click', loadFiles);

async function switchProject() {
  const newRoot = fsRoot.value.trim();
  if (!newRoot) { fsResult.textContent = 'Введите путь'; fsResult.className = 'fs-result fs-result--err'; return; }
  fsResult.textContent = 'Сохраняю…';
  fsResult.className = 'fs-result';
  try {
    const r = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: newRoot }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    cfgWorkspace.value = newRoot;
    fsPath.value = '';
    fsResult.textContent = '✓ Проект: ' + newRoot;
    fsResult.className = 'fs-result fs-result--ok';
    loadFiles();
  } catch (e) {
    fsResult.textContent = '✗ ' + e.message;
    fsResult.className = 'fs-result fs-result--err';
  }
}
$('#fs-root-go').addEventListener('click', switchProject);
fsRoot.addEventListener('keydown', e => { if (e.key === 'Enter') switchProject(); });

$('#fs-close').addEventListener('click', () => {
  fsName.textContent = 'Выберите файл';
  fsContent.textContent = '';
  fsContent.style.color = '';
  fsContent.contentEditable = 'false';
  $('#fs-save').hidden = true;
  curFile = '';
});

$('#fs-save').addEventListener('click', async () => {
  if (!curFile) return;
  try {
    const r = await fetch('/api/file/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: curFile, content: fsContent.textContent }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
    fsContent.contentEditable = 'false';
    alert('Сохранено: ' + curFile);
  } catch (e) { alert(e.message); }
});

// ── Skills modal ──────────────────────────────────────────────────
const skList  = $('#sk-list');
const skTitle = $('#sk-title');
const skBody  = $('#sk-body');

async function loadSkills() {
  try {
    const r = await fetch('/api/skills');
    const d = await r.json();
    skList.innerHTML = '';
    const skills = d.skills || [];
    if (skills.length === 0) { skList.innerHTML = '<li style="color:var(--muted)">Навыки не найдены</li>'; return; }
    skills.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s.name;
      li.title = s.description || s.title || s.name;
      li.addEventListener('click', async () => {
        skList.querySelectorAll('li').forEach(x => x.classList.remove('sel'));
        li.classList.add('sel');
        skTitle.textContent = s.name;
        skBody.textContent = 'Загрузка…';
        try {
          const rr = await fetch(`/api/skill/${encodeURIComponent(s.name)}`);
          if (!rr.ok) throw new Error(`HTTP ${rr.status}`);
          const data = await rr.json().catch(() => rr.text());
          skBody.textContent = typeof data === 'string' ? data : (data.content || JSON.stringify(data, null, 2));
        } catch (e) { skBody.textContent = 'Ошибка: ' + e.message; }
      });
      const desc = document.createElement('div');
      desc.className = 'sk-desc';
      desc.textContent = s.description || s.title || '';
      li.appendChild(desc);
      skList.appendChild(li);
    });
  } catch (e) {
    skList.innerHTML = `<li style="color:var(--error)">${e.message}</li>`;
  }
}

$('#sk-new').addEventListener('click', () => {
  const f = $('#sk-form');
  f.hidden = false;
  $('#sk-name').value = '';
  $('#sk-desc').value = '';
  $('#sk-content').value = '';
  $('#sk-result').textContent = '';
  $('#sk-result').className = 'set-result';
  $('#sk-name').focus();
});
$('#sk-cancel').addEventListener('click', () => { $('#sk-form').hidden = true; });

$('#sk-save').addEventListener('click', async () => {
  const res  = $('#sk-result');
  const name = $('#sk-name').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const desc = $('#sk-desc').value.trim().replace(/\s+/g, ' ');
  const body = $('#sk-content').value.trim();
  if (!name) { res.textContent = 'Укажите имя'; res.className = 'set-result set-result--err'; return; }
  if (!desc) { res.textContent = 'Укажите описание'; res.className = 'set-result set-result--err'; return; }
  if (!body) { res.textContent = 'Введите инструкцию'; res.className = 'set-result set-result--err'; return; }
  const content = `---\nname: ${name}\ndescription: ${desc}\n---\n\n${body}\n`;
  res.textContent = 'Сохраняю…';
  res.className = 'set-result';
  try {
    const r = await fetch('/api/skill/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || `HTTP ${r.status}`); }
    res.textContent = '✓ Сохранено';
    res.className = 'set-result set-result--ok';
    $('#sk-form').hidden = true;
    await loadSkills();
  } catch (e) {
    res.textContent = '✗ ' + e.message;
    res.className = 'set-result set-result--err';
  }
});

// ── Logs modal ────────────────────────────────────────────────────
const logOut = $('#log-out');
let logPollId = null;

async function refreshLogs() {
  try {
    const r = await fetch('/api/logs');
    const d = await r.json();
    logOut.textContent = d.tail || d.content || JSON.stringify(d, null, 2);
    logOut.scrollTop = logOut.scrollHeight;
  } catch (e) { logOut.textContent = `Ошибка: ${e.message}`; }
}

$('#log-refresh').addEventListener('click', refreshLogs);
$('#log-clear').addEventListener('click', () => { logOut.textContent = ''; logOut.scrollTop = 0; });

const logModal = $('#modal-logs');
new MutationObserver(() => {
  if (!logModal.hidden) { if (!logPollId) logPollId = setInterval(refreshLogs, 4000); }
  else { if (logPollId) { clearInterval(logPollId); logPollId = null; } }
}).observe(logModal, { attributes: true, attributeFilter: ['hidden'] });

// ── Init ───────────────────────────────────────────────────────────
loadSessions();
renderSession();
renderHistoryList();
setContext(currentSession()?.tokens || 0, 16384);
checkEngine();
setInterval(checkEngine, 15_000);
