/**
 * Agent Lite v3 — SPA with modals + context tracking + project switcher
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
  if (e.key === 'Escape') $$('.modal-overlay:not([hidden])').forEach(ov => closeModal(ov.id.replace('modal-', '')));
});

// Open modals from header
$('#btn-settings').addEventListener('click', () => openModal('settings'));
$('#btn-files').addEventListener('click', () => { loadFiles(); openModal('files'); });
$('#btn-skills').addEventListener('click', () => { loadSkills(); openModal('skills'); });
$('#btn-logs').addEventListener('click', () => { refreshLogs(); openModal('logs'); });

// ── Theme ─────────────────────────────────────────────────────────
const saved = localStorage.getItem('agentlite-theme') || 'dark';
document.documentElement.dataset.theme = saved;
$('#theme-btn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('agentlite-theme', next);
});

// ── Context ring ───────────────────────────────────────────────────
const ctxBtn   = $('#ctx-btn');
const ctxFg    = document.querySelector('.ctx__ring-fg');
const ctxLabel = $('#ctx-label');

function setContext(tokens, max) {
  const pct = Math.min(100, Math.round(tokens / max * 100));
  ctxLabel.textContent = pct + '%';
  ctxBtn.classList.remove('ctx--warn', 'ctx--crit');
  if (pct > 90) ctxBtn.classList.add('ctx--crit');
  else if (pct > 70) ctxBtn.classList.add('ctx--warn');
  // SVG ring: circumference of r=15.9155 ≈ 100
  ctxFg.style.strokeDasharray = `${pct}, 100`;
  ctxBtn.title = `Контекст: ${tokens} / ${max} токенов (${pct}%)`;
}

// Load initial context
fetch('/api/context/stats').then(r => r.json()).then(d => {
  if (d.current_tokens !== undefined) setContext(d.current_tokens, d.max_tokens || 16384);
}).catch(() => {});

// Compact button
ctxBtn.addEventListener('click', async () => {
  if (ctxBtn.classList.contains('ctx--busy')) return;
  ctxBtn.classList.add('ctx--busy');
  ctxLabel.textContent = '…';
  ctxLabel.style.color = 'var(--muted)';
  try {
    const r = await fetch('/api/context/compact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const d = await r.json();
    if (d.compacted) {
      // Clear the visible chat history (server replaced it with summary)
      msgs.innerHTML = '';
      history = d.new_history || [];
      const div = document.createElement('div');
      div.className = 'msg msg--system';
      div.innerHTML = `<div class="msg__role">Контекст сжат</div>
        <div class="msg__bubble" style="font-size:12px;color:var(--muted)">
          ${d.summary?.replace(/</g, '&lt;')}…<br>
          Сохранено ${d.kept_messages} последних сообщений.
        </div>`;
      msgs.appendChild(div);
      setContext(0, 16384);
      // Show a system notification in chat
      addMsg('system', '🗜️ Контекст сжат: ' + (d.summary || '').slice(0, 200) + '…');
      msgs.querySelector('.msg--system:last-child')?.remove(); // we already added the styled one
    } else if (d.error) {
      alert('Ошибка: ' + d.error);
    } else {
      alert(d.message || 'Нечего сжимать');
    }
  } catch (e) {
    alert('Ошибка сжатия: ' + e.message);
  } finally {
    ctxBtn.classList.remove('ctx--busy');
    ctxLabel.style.color = '';
    setContext(0, 16384);
    fetch('/api/context/stats').then(r => r.json()).then(d => setContext(d.current_tokens, d.max_tokens)).catch(() => {});
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
  engPanelDot.className = 'dot';
  if (state === 'on')  { engineDot.classList.add('dot--on');  engPanelDot.classList.add('dot--on'); }
  if (state === 'run') { engineDot.classList.add('dot--run'); engPanelDot.classList.add('dot--run'); }
  if (state === 'err') { engineDot.classList.add('dot--err'); engPanelDot.classList.add('dot--err'); }
  engineLabel.textContent = label;
  engPanelLabel.textContent = label;
  btnStart.disabled = state === 'on' || state === 'run';
  btnStop.disabled  = !(state === 'on');
}

async function checkEngine() {
  try {
    await fetch('/api/health');
    const llm = await fetch('/api/probe').then(x => x.json()).catch(() => ({}));
    if (llm.error) setEngineState('err', 'Прокси недоступен');
    else setEngineState('on', llm.model || 'Qwen готов');
  } catch {
    setEngineState('', 'Сервер не запущен');
  }
}

btnStart.addEventListener('click', async () => {
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
  setEngineState('run', 'Остановка…');
  try { await fetch('/api/engine/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
  catch {}
  setEngineState('', 'Остановлен');
});

// ── Chat ──────────────────────────────────────────────────────────
const msgs       = $('#msgs');
const form       = $('#chat-form');
const promptEl   = $('#prompt');
const thinking   = $('#thinking');
const thinkingTx = $('#thinking-text');
const sendBtn    = $('#send-btn');
const stopBtn    = $('#stop-btn');

let history = [];

function addMsg(role, content) {
  const welcome = msgs.querySelector('.msgs__welcome');
  if (welcome) welcome.remove();
  const div = document.createElement('div');
  div.className = `msg msg--${role}`;
  const roleEl = document.createElement('div');
  roleEl.className = 'msg__role';
  roleEl.textContent = role === 'user' ? 'Вы' : role === 'system' ? 'Система' : 'Agent';
  const bubble = document.createElement('div');
  bubble.className = 'msg__bubble';
  bubble.textContent = content;
  div.append(roleEl, bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return bubble;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const text = promptEl.value.trim();
  if (!text) return;
  promptEl.value = '';
  addMsg('user', text);
  history.push({ role: 'user', content: text });

  thinking.hidden = false;
  thinkingTx.textContent = 'Модель думает…';
  sendBtn.disabled = true;
  stopBtn.hidden = false;

  const bubble = addMsg('assistant', '…');
  let aborted = false;
  stopBtn.onclick = () => { aborted = true; stopBtn.hidden = true; };

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content ?? JSON.stringify(data);
    bubble.textContent = reply;
    history.push({ role: 'assistant', content: reply });
    // Show tool-call events
    if (data.tool_events?.length) {
      const toolDiv = document.createElement('div');
      toolDiv.className = 'msg msg--tools';
      toolDiv.innerHTML = '<div class="msg__role">Инструменты</div>' +
        data.tool_events.map(e =>
          `<div class="tool-event">${e.tool === 'bash' ? '⚡' : e.tool === 'read_skill' ? '🧩' : '⚙️'} <b>${e.tool}</b>(${JSON.stringify(e.args).slice(0, 120)})</div>`
        ).join('');
      msgs.appendChild(toolDiv);
    }
    // Update context indicator
    if (data.usage) setContext(data.usage.current_tokens, data.usage.max_tokens);
  } catch (err) {
    if (aborted) {
      bubble.textContent = '⏹ Остановлено';
    } else {
      bubble.textContent = `Ошибка: ${err.message}`;
      bubble.style.color = 'var(--error)';
    }
  } finally {
    thinking.hidden = true;
    thinkingTx.textContent = 'Модель думает…';
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

// Project switcher
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
checkEngine();
setInterval(checkEngine, 15_000);
