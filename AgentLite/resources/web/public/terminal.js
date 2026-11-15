'use strict';
(() => {
  const element = id => document.getElementById(id);
  const panel = element('view-terminal');
  const state = { term: null, fit: null, id: null, cwd: '', cwdInUse: '', stream: null, epoch: 0, opening: false, loading: null, ready: false, input: '', sending: false, sequence: 0, resizeTimer: null, assets: null };
  const errorText = error => error?.message || 'Не удалось выполнить действие терминала.';
  function workspace(text) { element('terminal-workspace').textContent = text; element('terminal-workspace').title = text; }
  function status(text, error = false) { element('terminal-status').textContent = text; element('terminal-status').classList.toggle('bad', error); }
  function controls() { element('terminal-open').disabled = state.opening || !!state.id || !element('terminal-shell').value; element('terminal-new').disabled = state.opening || !element('terminal-shell').value; element('terminal-close').disabled = state.opening || !state.id; element('terminal-shell').disabled = state.opening || !!state.id; }
  async function request(route, body) {
    const response = await fetch(`/api/terminal/${route}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
    const result = await response.json(); if (!response.ok || result.error) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || result.message || `Ошибка сервера: ${response.status}`); return result;
  }
  function script(url) { return new Promise((resolve, reject) => { const node = document.createElement('script'); node.src = url; node.onload = resolve; node.onerror = () => reject(new Error('Не удалось загрузить локальные файлы терминала.')); document.head.append(node); }); }
  async function assets() { if (!state.assets) state.assets = (async () => { await script('/vendor/xterm/xterm.js'); await script('/vendor/xterm/addon-fit.js'); if (!window.Terminal || !window.FitAddon?.FitAddon) throw new Error('Файлы xterm.js не готовы.'); })().catch(error => { state.assets = null; throw error; }); return state.assets; }
  function loadShells() {
    if (state.loading) return state.loading;
    const current = { id: state.id, stream: state.stream, epoch: state.epoch };
    const unchanged = () => current.id === state.id && current.stream === state.stream && current.epoch === state.epoch;
    state.loading = (async () => {
      try {
        const [shellsReply, sessionsReply] = await Promise.allSettled([request('shells'), current.id ? request('sessions') : Promise.resolve(null)]);
        let available = [], lost = false;
        if (shellsReply.status === 'fulfilled') {
          const result = shellsReply.value, previous = element('terminal-shell').value; element('terminal-shell').replaceChildren();
          (result.shells || []).forEach(shell => { const option = document.createElement('option'); option.value = shell.id; option.textContent = `${shell.label || shell.id}${shell.available ? '' : ' · не установлен'}`; option.disabled = !shell.available; element('terminal-shell').append(option); });
          available = (result.shells || []).filter(shell => shell.available); element('terminal-shell').value = available.some(shell => shell.id === previous) ? previous : available.some(shell => shell.id === 'powershell') ? 'powershell' : available[0]?.id || '';
          state.cwd = result.workspace || result.cwd || ''; workspace(state.id ? state.cwdInUse || state.cwd : state.cwd || 'Папка проекта не выбрана');
        }
        if (current.id && unchanged()) {
          if (sessionsReply.status === 'fulfilled' && Array.isArray(sessionsReply.value?.terminals)) {
            const session = sessionsReply.value.terminals.find(item => item.id === current.id);
            if (!session || session.status === 'exited') { disconnect(); lost = true; workspace(state.cwd || 'Папка проекта не выбрана'); status('Сессия больше недоступна. Можно открыть новую.'); }
            else if (session.status === 'closing') { state.ready = false; status('Сессия завершается…'); }
            else if (session.status === 'running' && (!state.stream || state.stream.readyState === EventSource.CLOSED)) stream(current.id);
          } else status('Статус сессии не проверен. Повторите обновление.', true);
        }
        if (!lost && unchanged()) {
          if (shellsReply.status === 'rejected') status(errorText(shellsReply.reason), true);
          else if (!state.id) status(available.length ? 'Готов к открытию' : 'Доступная оболочка не найдена', !available.length);
          else if (state.cwd && state.cwdInUse && state.cwd !== state.cwdInUse) status('Сессия работает в прежней папке. Для нового проекта откройте новую сессию.');
        }
      } catch (error) { if (unchanged()) status(errorText(error), true); }
      finally { state.loading = null; controls(); }
    })();
    controls(); return state.loading;
  }
  function fit() { if (!state.term || panel.hidden) return; try { state.fit.fit(); } catch { /* A hidden or not yet measured container is fitted on the next view. */ } }
  async function flushInput() {
    if (state.sending || !state.id || !state.ready) return; state.sending = true;
    const id = state.id;
    try { while (state.input && state.id === id && state.ready) { const data = state.input.slice(0, 16000); state.input = state.input.slice(data.length); await request('input', { id, data }); } }
    catch (error) { if (state.id === id) { state.input = ''; state.ready = false; status(`Ввод не отправлен: ${errorText(error)}`, true); } }
    finally { state.sending = false; if (state.input && state.id && state.ready) flushInput(); }
  }
  async function initTerminal() {
    if (state.term) return; await assets(); element('terminal-placeholder').hidden = true;
    // xterm creates its own style elements. The page grants only those elements a style nonce.
    const nonce = document.querySelector('meta[name="engee-style-nonce"]')?.content;
    const terminalDocument = nonce ? new Proxy(document, { get(target, property) { if (property === 'createElement') return (...args) => { const node = target.createElement(...args); if (node.tagName === 'STYLE') node.nonce = nonce; return node; }; const value = Reflect.get(target, property, target); return typeof value === 'function' ? value.bind(target) : value; } }) : document;
    state.term = new window.Terminal({ documentOverride: terminalDocument, cursorBlink: true, fontFamily: '"Cascadia Mono", Consolas, monospace', fontSize: 14, scrollback: 3000, allowProposedApi: false, logLevel: 'off', theme: { background: '#101a2d', foreground: '#d8e4f7', cursor: '#70cfe6', selectionBackground: '#708dc566', black: '#19243a', red: '#f38ca0', green: '#8ed3ae', yellow: '#e9d49b', blue: '#86b8fb', magenta: '#b7a8f2', cyan: '#72d3df', white: '#e3edf9' }, linkHandler: { activate: (event, uri) => { if (event.isTrusted && /^https?:\/\//i.test(uri)) window.open(uri, '_blank', 'noopener'); } } });
    state.fit = new window.FitAddon.FitAddon(); state.term.loadAddon(state.fit);
    // The bundled scrollbar also uses ownerDocument during synchronous open().
    const createElement = document.createElement;
    if (nonce) document.createElement = function (...args) { const node = createElement.apply(document, args); if (node.tagName === 'STYLE') node.nonce = nonce; return node; };
    try { state.term.open(element('terminal-screen')); } finally { document.createElement = createElement; }
    fit();
    state.term.onData(data => { if (!state.id || !state.ready) return; state.input += data; flushInput(); });
    state.term.onResize(({ cols, rows }) => { clearTimeout(state.resizeTimer); const id = state.id; if (!id) return; state.resizeTimer = setTimeout(() => { if (id === state.id) request('resize', { id, cols, rows }).catch(error => status(errorText(error), true)); }, 120); });
    new ResizeObserver(fit).observe(element('terminal-screen'));
  }
  function disconnect() { const source = state.stream; state.stream = null; state.epoch++; state.ready = false; state.input = ''; state.id = null; state.sequence = 0; state.cwdInUse = ''; clearTimeout(state.resizeTimer); source?.close(); controls(); }
  function stream(id) {
    const previous = state.stream, source = new EventSource(`/api/terminal/events?id=${encodeURIComponent(id)}&afterSequence=${state.sequence}`); state.stream = source; state.ready = false; state.epoch++; previous?.close();
    source.onmessage = event => {
      if (state.id !== id || state.stream !== source) return; let data; try { data = JSON.parse(event.data); } catch { status('Неожиданный ответ потока терминала.', true); return; }
      const sequence = Number(data.sequence || event.lastEventId); if (data.type !== 'ready' && sequence && sequence <= state.sequence) return; if (sequence > state.sequence) state.sequence = sequence;
      if (data.type === 'ready') { state.ready = true; state.cwdInUse = data.cwd || state.cwdInUse; workspace(state.cwdInUse || state.cwd); status('Сессия открыта'); controls(); state.term.focus(); }
      else if (data.type === 'output' && typeof data.data === 'string') state.term.write(data.data);
      else if (data.type === 'exit') { state.term.writeln(`\r\n[Сессия завершена${data.exitCode === undefined ? '' : ` · код ${data.exitCode}`}]`); disconnect(); status('Сессия завершена. Можно открыть новую.'); }
      else if (data.type === 'error') status(data.message || 'Ошибка терминальной сессии.', true);
    };
    source.onerror = () => { if (state.id === id && state.stream === source) { state.ready = false; status('Восстанавливаем соединение с терминалом…'); } };
  }
  async function open() {
    if (state.id || state.opening) return; state.opening = true; controls(); status('Открываем сессию…');
    try {
      await loadShells(); const shell = element('terminal-shell').value; if (!shell) throw new Error('Установите доступную оболочку и обновите список.');
      await initTerminal(); state.term.reset(); fit();
      const result = await request('create', { shell, cols: state.term.cols, rows: state.term.rows }); if (typeof result.id !== 'string' || !result.id) throw new Error('Сервер не вернул идентификатор терминала.');
      state.id = result.id; state.sequence = 0; state.cwdInUse = result.cwd || state.cwd; workspace(state.cwdInUse); stream(state.id);
    } catch (error) { status(errorText(error), true); }
    finally { state.opening = false; controls(); }
  }
  async function close() { if (!state.id) return; const id = state.id, epoch = state.epoch; try { await request('close', { id }); if (state.id === id && state.epoch === epoch) { disconnect(); status('Сессия закрыта'); } } catch (error) { if (state.id === id && state.epoch === epoch) { status(errorText(error), true); throw error; } } }
  async function attach(metadata) {
    if (state.id || state.opening) throw new Error('Сначала закройте текущую сессию терминала.');
    if (!metadata?.id) throw new Error('Идентификатор терминальной сессии не получен.');
    state.opening = true; controls();
    try { await initTerminal(); state.term.reset(); fit(); state.id = metadata.id; state.sequence = 0; state.cwdInUse = metadata.cwd || state.cwd; workspace(state.cwdInUse); stream(state.id); }
    catch (error) { if (!state.id) request('close', { id: metadata.id }).catch(() => {}); status(errorText(error), true); throw error; }
    finally { state.opening = false; controls(); }
  }
  window.EngeeTerminal = { canAttach: () => !state.id && !state.opening, attach, refresh: loadShells };
  element('terminal-open').addEventListener('click', open);
  element('terminal-new').addEventListener('click', async () => { try { await close(); await open(); } catch { /* The current session stays visible if closing fails. */ } });
  element('terminal-close').addEventListener('click', () => close().catch(() => {}));
  element('terminal-shell').addEventListener('change', controls);
  element('terminal-clear').addEventListener('click', () => state.term?.clear());
  element('terminal-copy').addEventListener('click', async () => { const selection = state.term?.getSelection(); if (!selection) { status('Сначала выделите текст в терминале'); return; } try { await navigator.clipboard.writeText(selection); status('Выделенный текст скопирован'); } catch { status('Браузер не разрешил копирование', true); } });
  new MutationObserver(() => { if (!panel.hidden) { loadShells(); requestAnimationFrame(fit); } }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('pagehide', () => { if (state.id) { const id = state.id; disconnect(); navigator.sendBeacon('/api/terminal/close', new Blob([JSON.stringify({ id })], { type: 'application/json' })); } });
  if (!panel.hidden) loadShells(); controls();
})();
