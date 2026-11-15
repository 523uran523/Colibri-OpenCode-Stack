/**
 * Agent Lite — minimal front-end
 * Connects to /api/* endpoints served by server.mjs
 */

const $ = s => document.querySelector(s);

// ── Theme ──────────────────────────────────────────────────────────
const themeBtn = $('#theme-btn');
const saved = localStorage.getItem('agentlite-theme') || 'dark';
document.documentElement.dataset.theme = saved;
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('agentlite-theme', next);
});

// ── Navigation ─────────────────────────────────────────────────────
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav__btn');

function switchView(name) {
  views.forEach(v => v.hidden = v.id !== `view-${name}`);
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'logs') refreshLogs();
  if (name === 'skills') loadSkills();
  if (name === 'files')  loadFiles();
}
navBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));

// ── Engine status ──────────────────────────────────────────────────
const engineDot   = $('#engine-dot');
const engineLabel = $('#engine-label');
const btnStart    = $('#btn-start');
const btnStop     = $('#btn-stop');
const engPanelDot   = $('#eng-panel-dot');
const engPanelLabel = $('#eng-panel-label');
const engStartBtn   = $('#eng-start-btn');
const engStopBtn    = $('#eng-stop-btn');

function setEngineState(state, label) {
  engineDot.className = 'dot';
  if (state === 'on')  engineDot.classList.add('dot--on');
  if (state === 'run') engineDot.classList.add('dot--run');
  if (state === 'err') engineDot.classList.add('dot--err');
  engineLabel.textContent = label;
  btnStart.disabled = state === 'on' || state === 'run';
  btnStop.disabled  = !(state === 'on');
  // Also update Logs panel
  engPanelDot.className = 'dot';
  if (state === 'on')  engPanelDot.classList.add('dot--on');
  if (state === 'run') engPanelDot.classList.add('dot--run');
  if (state === 'err') engPanelDot.classList.add('dot--err');
  engPanelLabel.textContent = state === 'on' ? label : label;
  engStartBtn.disabled = state === 'on' || state === 'run';
  engStopBtn.disabled  = !(state === 'on');
}

// Wire up Logs panel buttons
engStartBtn.addEventListener('click', () => btnStart.click());
engStopBtn.addEventListener('click', () => btnStop.click());

async function checkEngine() {
  try {
    const r = await fetch('/api/health');
    const d = await r.json();
    const llm = await fetch('/api/probe').then(x => x.json()).catch(() => ({}));
    if (llm.error) {
      setEngineState('err', 'Прокси недоступен');
    } else {
      setEngineState('on', llm.model || 'Qwen готов');
    }
  } catch {
    setEngineState('', 'Сервер не запущен');
  }
}

btnStart.addEventListener('click', async () => {
  setEngineState('run', 'Запуск…');
  try {
    await fetch('/api/engine/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    // Poll until ready
    const poll = setInterval(async () => {
      try {
        const r = await fetch('/api/probe');
        if (r.ok) { clearInterval(poll); checkEngine(); }
      } catch {}
    }, 3000);
    setTimeout(() => clearInterval(poll), 240_000); // stop polling after 4 min
  } catch (e) {
    setEngineState('err', 'Ошибка запуска');
  }
});

btnStop.addEventListener('click', async () => {
  setEngineState('run', 'Остановка…');
  try { await fetch('/api/engine/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
  catch {}
  setEngineState('', 'Остановлен');
});

// ── Chat ───────────────────────────────────────────────────────────
const msgs     = $('#msgs');
const form     = $('#chat-form');
const promptEl = $('#prompt');
const thinking = $('#thinking');
const thinkingText = $('#thinking-text');
const sendBtn  = $('#send-btn');
const stopBtn  = $('#stop-btn');

let history = [];

function addMsg(role, content) {
  // Remove welcome if present
  const welcome = msgs.querySelector('.msgs__welcome');
  if (welcome) welcome.remove();

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
  thinkingText.textContent = 'Модель думает…';
  sendBtn.disabled = true;
  stopBtn.hidden = false;

  const bubble = addMsg('assistant', '…');
  let aborted = false;

  stopBtn.onclick = () => { aborted = true; stopBtn.hidden = true; };

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...history, { role: 'assistant', content: '' }] }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content ?? JSON.stringify(data);
    bubble.textContent = reply;
    history.push({ role: 'assistant', content: reply });
  } catch (err) {
    if (aborted) {
      bubble.textContent = '⏹ Остановлено';
    } else {
      bubble.textContent = `Ошибка: ${err.message}`;
      bubble.style.color = 'var(--error)';
    }
  } finally {
    thinking.hidden = true;
    sendBtn.disabled = false;
    stopBtn.hidden = true;
    msgs.scrollTop = msgs.scrollHeight;
  }
});

// Attach file → prepend as context message
$('#attach-btn').addEventListener('click', () => $('#attach-input').click());
$('#attach-input').addEventListener('change', async e => {
  for (const f of e.target.files) {
    const txt = await f.text();
    promptEl.value += `\n\nФайл: ${f.name}\n\`\`\`\n${txt.slice(0, 4000)}\n\`\`\``;
  }
  e.target.value = '';
});

// ── Settings ──────────────────────────────────────────────────────
const cfgBase   = $('#cfg-base');
const cfgModel  = $('#cfg-model');
const cfgTokens = $('#cfg-tokens');
const cfgResult = $('#cfg-result');

// Load current settings
fetch('/api/config').then(r => r.json()).then(d => {
  if (d.baseUrl)   cfgBase.value   = d.baseUrl;
  if (d.model)     cfgModel.value  = d.model;
  if (d.maxTokens) cfgTokens.value = d.maxTokens;
}).catch(() => {});

$('#cfg-probe').addEventListener('click', async () => {
  cfgResult.textContent = 'Проверяю…';
  cfgResult.className = 'set-result';
  try {
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: cfgBase.value.trim(),
        model:   cfgModel.value.trim(),
        maxTokens: parseInt(cfgTokens.value, 10) || 4096,
      }),
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

// ── Files ──────────────────────────────────────────────────────────
const fsList     = $('#fs-list');
const fsName     = $('#fs-name');
const fsContent  = $('#fs-content');
const fsPath     = $('#fs-path');

let curFile = '';

async function loadFiles() {
  const p = fsPath.value.trim() || 'workspace';
  try {
    const r = await fetch(`/api/files?path=${encodeURIComponent(p)}`);
    const d = await r.json();
    fsList.innerHTML = '';
    (d.files || []).forEach(f => {
      const li = document.createElement('li');
      li.textContent = f.name;
      li.title = f.path;
      if (f.isDirectory) li.style.color = 'var(--muted)';
      li.addEventListener('click', () => openFile(f, p));
      fsList.appendChild(li);
    });
  } catch (e) {
    fsList.innerHTML = `<li style="color:var(--error)">${e.message}</li>`;
  }
}

async function openFile(f, baseDir) {
  const rel = f.path || f.name;
  try {
    const r = await fetch(`/api/file?path=${encodeURIComponent(rel)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    curFile = rel;
    fsName.textContent = rel;
    fsContent.textContent = d.content ?? d;
    fsContent.contentEditable = 'true';
    $('#fs-edit').hidden = false;
    $('#fs-save').hidden = false;
    fsList.querySelectorAll('li').forEach(li => li.classList.toggle('sel', li.title === rel));
  } catch (e) {
    fsContent.textContent = e.message;
  }
}

$('#fs-go').addEventListener('click', loadFiles);
$('#fs-close').addEventListener('click', () => {
  fsName.textContent = 'Выберите файл';
  fsContent.textContent = '';
  fsContent.contentEditable = 'false';
  $('#fs-edit').hidden = $('#fs-save').hidden = true;
  curFile = '';
});

$('#fs-save').addEventListener('click', async () => {
  if (!curFile) return;
  try {
    await fetch('/api/file/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: curFile, content: fsContent.textContent }),
    });
    fsContent.contentEditable = 'false';
    alert('Сохранено');
  } catch (e) { alert(e.message); }
});

$('#fs-edit').addEventListener('click', () => {
  fsContent.contentEditable = 'true';
  fsContent.focus();
});

// ── Skills ─────────────────────────────────────────────────────────
const skList  = $('#sk-list');
const skTitle = $('#sk-title');
const skBody  = $('#sk-body');

async function loadSkills() {
  try {
    const r = await fetch('/api/skills');
    const d = await r.json();
    skList.innerHTML = '';
    (d.skills || []).forEach(s => {
      const li = document.createElement('li');
      li.textContent = s.name;
      li.addEventListener('click', async () => {
        skList.querySelectorAll('li').forEach(x => x.classList.remove('sel'));
        li.classList.add('sel');
        skTitle.textContent = s.name;
        skBody.textContent = 'Загрузка…';
        try {
          const rr = await fetch(`/api/skill/${encodeURIComponent(s.name)}`);
          skBody.textContent = await rr.text();
        } catch { skBody.textContent = 'Ошибка загрузки'; }
      });
      skList.appendChild(li);
    });
  } catch (e) {
    skList.innerHTML = `<li style="color:var(--error)">${e.message}</li>`;
  }
}

$('#sk-new').addEventListener('click', async () => {
  const name = prompt('Название навыка (латиница, дефисы):');
  if (!name) return;
  const src = prompt('Содержимое SKILL.md (YAML-заголовок + текст):',
    `---\nname: ${name}\ndescription: Новый навык\n---\n\n# ${name}\n`);
  if (!src) return;
  try {
    await fetch('/api/skill/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content: src }),
    });
    loadSkills();
  } catch (e) { alert(e.message); }
});

// ── Logs ───────────────────────────────────────────────────────────
const logOut = $('#log-out');

async function refreshLogs() {
  try {
    const r = await fetch('/api/logs');
    const d = await r.json();
    logOut.textContent = d.tail || d.content || JSON.stringify(d, null, 2);
    logOut.scrollTop = logOut.scrollHeight;
  } catch (e) {
    logOut.textContent = `Ошибка: ${e.message}`;
  }
}
$('#log-refresh').addEventListener('click', refreshLogs);

// ── Init ───────────────────────────────────────────────────────────
checkEngine();
setInterval(checkEngine, 15_000);
