'use strict';
const $ = id => document.getElementById(id);
const SESSION_KEY = 'engee-agent-conversation-v1';
const EXECUTION_KEY = 'engee-agent-execution-target-v1';
const app = { state: null, history: [], events: [], busy: false, controller: null, filePath: '', selectedFile: null, tools: [], sdkPromise: null, sdkReady: false, fingerprint: '', attachments: [], uploading: 0, modelCatalog: {}, integrations: null, slashSelection: 0, claudeSession: null, executionTarget: 'engee' };
try { if (sessionStorage.getItem(EXECUTION_KEY) === 'julia') app.executionTarget = 'julia'; } catch { /* The current mode works without browser storage. */ }
let credentialEpoch = 0;
let freeApiFlow = null;
const labels = { chat: ['ДИАЛОГ', 'Рабочее пространство'], settings: ['ПАРАМЕТРЫ', 'Параметры'], files: ['ПАРАМЕТРЫ', 'Параметры'], skills: ['ПАРАМЕТРЫ', 'Параметры'], downloads: ['ПАРАМЕТРЫ', 'Параметры'], terminal: ['ТЕРМИНАЛ', 'Терминал проекта Engee'] };
const SLASH_COMMANDS = [ ['/help', 'Справка и список команд'], ['/status', 'Проверить сервер Engee'], ['/eval', 'Выполнить код в выбранной среде'], ['/files', 'Файлы и рабочая папка'], ['/skills', 'Открыть навыки'], ['/clear', 'Очистить этот диалог'], ['/new', 'Начать новый диалог'], ['/models', 'Найти доступные модели'] ];
const HELP_SECTIONS = { models: 'models', attachments: 'dialog', cloud: 'cloud', local: 'local', workspace: 'project', engee: 'engee', claude: 'claude', opencode: 'opencode', commands: 'commands', config: 'binding', eval: 'eval', terminal: 'terminal', skills: 'skills', downloads: 'downloads', editor: 'editor', ollama: 'ollama', interface: 'interface', connections: 'connections' };

function readableError(error) {
  if (error?.name === 'AbortError') return 'Запрос остановлен.';
  if (typeof error === 'string') return error;
  const value = error?.message || error?.msg || error?.error?.message || error?.error;
  return typeof value === 'string' ? value : 'Не удалось выполнить запрос. Проверьте подключение.';
}
async function api(path, body, options = {}) {
  const controller = new AbortController();
  const signal = options.signal;
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeout || 60000);
  try {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store' });
    const source = await response.text();
    let result;
    try { result = source ? JSON.parse(source) : {}; } catch { throw new Error(`Сервер вернул неожиданный ответ (${response.status}).`); }
    if (!response.ok || result.error) throw new Error(readableError(result.error || result.message || `Ошибка сервера: ${response.status}`));
    return result;
  } catch (error) { if (timedOut) throw new Error('Сервер не ответил вовремя. Проверьте подключение и повторите запрос.'); throw error; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
function withTimeout(promise, signal, duration = 150000) {
  return new Promise((resolve, reject) => {
    let ended = false, timer;
    const finish = (fn, value) => { if (ended) return; ended = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value); };
    const abort = () => finish(reject, new DOMException('Запрос остановлен', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(reject, new Error('Облачная модель не ответила вовремя. Повторите запрос.')), duration);
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}
function setStatus(id, text, kind = '') { const element = $(id); element.textContent = text; element.classList.remove('bad', 'good'); if (kind) element.classList.add(kind); }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => { $('toast').hidden = true; }, 4200); }
function showError(error) { $('global-error').textContent = readableError(error); $('global-error').hidden = false; }
function clearError() { $('global-error').hidden = true; }
function executionLabel(target = app.executionTarget) { return target === 'julia' ? 'Локальная Julia' : 'Engee'; }
function executionCapability() { return app.state?.executionTargets?.julia; }
function canUseJulia() { return executionCapability()?.available === true; }
function toolsUrl(target = app.executionTarget) { return `/api/tools?executionTarget=${encodeURIComponent(target)}`; }
async function refreshToolDefinitions(signal, target = app.executionTarget) { const tools = (await api(toolsUrl(target), undefined, { signal })).tools || []; const result = tools.filter(tool => target === 'julia' ? !['engee_eval_code', 'engee_eval_file'].includes(tool.function?.name) : tool.function?.name !== 'julia_eval_code'); if (target === app.executionTarget) app.toolDefinitions = result; return result; }
function closeExecutionMenu(focus = false) { if (!$('execution-menu')) return; $('execution-menu').hidden = true; $('execution-mode-button').setAttribute('aria-expanded', 'false'); if (focus) $('execution-mode-button').focus(); }
function renderExecutionTarget() {
  const button = $('execution-mode-button'); if (!button) return;
  const title = `Код в чате: ${executionLabel()}${app.executionTarget === 'julia' && !canUseJulia() ? ' · недоступна' : ''}`;
  button.title = title; button.setAttribute('aria-label', title); button.disabled = app.busy; button.classList.toggle('julia-mode', app.executionTarget === 'julia');
  document.querySelectorAll('[name=executionTarget]').forEach(input => { input.checked = input.value === app.executionTarget; input.disabled = app.busy || input.value === 'julia' && !canUseJulia(); });
  $('execution-julia-state').textContent = canUseJulia() ? `Версия ${executionCapability().version || 'не указана'}` : executionCapability()?.message || (app.state?.executionTargets ? 'Julia не установлена. Добавьте её в «Параметры → Компоненты».' : 'Для Julia требуется обновлённый сервер приложения.');
  document.querySelectorAll('.code-run').forEach(button => { button.disabled = app.busy || app.executionTarget === 'julia' && !canUseJulia(); button.title = `Подтвердить и выполнить этот Julia-код: ${executionLabel()}`; });
  if (app.busy) closeExecutionMenu();
}
async function chooseExecutionTarget(target) {
  if (app.busy || !['engee', 'julia'].includes(target) || target === 'julia' && !canUseJulia()) { renderExecutionTarget(); return; }
  if (target !== app.executionTarget) { app.history = app.history.map(({ reasoning_details, reasoning_content, response_items, reasoning_items, ...message }) => {
    if (message.role === 'tool') return { role: 'assistant', content: `Фактический результат ранее выполненного инструмента:\n${contentText(message.content)}` };
    if (message.role === 'assistant' && message.tool_calls?.length) return { role: 'assistant', content: [contentText(message.content), ...message.tool_calls.map(call => `Ранее вызван инструмент ${call.function?.name || 'проекта'} с аргументами: ${call.function?.arguments || '{}'}`)].filter(Boolean).join('\n') };
    return message;
  }); saveConversation(); }
  app.executionTarget = target; try { sessionStorage.setItem(EXECUTION_KEY, target); } catch {} app.toolDefinitions = []; renderExecutionTarget(); closeExecutionMenu(true);
  try { await refreshToolDefinitions(); } catch (error) { showError(error); }
}
function organizeParameters() {
  const panel = $('view-settings'), form = $('settings-form'), cards = [...form.children].filter(element => element.tagName === 'ARTICLE'), footer = form.querySelector('.settings-footer'); form.classList.remove('settings-grid'); form.classList.add('parameters-form');
  const group = (id, title, children, grid = false, open = false) => { const details = document.createElement('details'); details.id = `parameters-${id}`; details.className = 'parameter-group'; details.open = open; const summary = document.createElement('summary'); summary.textContent = title; const content = document.createElement('div'); content.className = `parameter-content${grid ? ' parameter-grid' : ''}`; children.forEach(child => { if (child) content.append(child); }); details.append(summary, content); return details; };
  const connectionActions = document.createElement('div'); connectionActions.className = 'parameter-actions'; connectionActions.append($('add-connection'));
  const models = group('models', 'Нейросети и подключения', [group('current-connection', 'Текущее подключение', [cards[0]]), group('connections', 'Ваши подключения', [connectionActions, $('free-api-connect'), panel.querySelector('.saved-connections')]), group('local-models', 'Локальные модели', [cards[1]]), group('services', 'Другие сервисы', [panel.querySelector('.cloud-catalog')])]);
  cards[2].append(cards[3].querySelector('.engee-login'));
  const engee = group('engee', 'Engee', [group('account', 'Аккаунт', [cards[2]]), group('runtime', 'Среда выполнения', [cards[3]]), group('config', 'Токены и конфигурация', [cards[4]])]); form.append(models, engee);
  const sections = {};
  for (const id of ['files', 'skills', 'downloads']) { const section = $(`view-${id}`); section.classList.remove('view'); section.classList.add('parameter-panel'); section.hidden = false; section.querySelector('.section-intro h2')?.remove(); sections[id] = section; }
  $('project-files-body').append(sections.files.querySelector('.file-card'));
  const files = group('files', 'Файлы проекта', [group('workspace', 'Рабочая папка', [sections.files]), group('skills', 'Навыки', [sections.skills])]);
  const downloads = group('downloads', 'Компоненты', [sections.downloads]); panel.append(files, downloads);
  downloads.addEventListener('toggle', () => { if (downloads.open && app.state) discoverIntegrations().catch(error => { $('integration-status').textContent = readableError(error); $('integration-status').hidden = false; }); });
  engee.addEventListener('toggle', () => { if (engee.open && app.state) { loadEngeeLogin(); if (!app.engeeOptionsLoaded) loadEngeeOptions(); } });
  panel.append(footer); $('save-settings').setAttribute('form', 'settings-form');
}
function openProjectFiles() { const dialog = $('project-files-dialog'); if (!dialog.open) dialog.showModal(); if (!$('file-list').children.length) $('file-list').textContent = app.state ? 'Загрузка файлов…' : 'Подключаем папку проекта…'; if (app.state) loadFiles(app.filePath).catch(error => { $('file-list').textContent = `Не удалось прочитать папку: ${readableError(error)}. Нажмите ↻ для повтора.`; showError(error); }); }
function closeProjectFiles(focus = true) { const dialog = $('project-files-dialog'); if (dialog.open) dialog.close(); if (location.hash === '#files') history.replaceState(null, '', '#chat'); if (focus) $('prompt').focus(); }
function closeChatModelMenu(focus = false) { $('chat-model-menu').hidden = true; $('chat-model-button').setAttribute('aria-expanded', 'false'); if (focus) $('chat-model-button').focus(); }
function renderChatModelButton() { const config = app.state?.config || {}, provider = app.state?.providers?.find(item => item.id === config.provider), service = activeConnection()?.name || providerDisplayName(provider) || config.provider || 'Сервис'; const name = config.model || (serverChoosesModel() ? 'Модель выбирает сервер' : service === 'Сервис' ? 'Модель' : service); $('chat-model-name').textContent = name; $('chat-model-button').title = `${service} · ${name}`; $('chat-model-button').setAttribute('aria-label', `Выбрать сервис и модель: ${service} · ${name}`); $('chat-model-button').disabled = app.busy; if (app.busy) closeChatModelMenu(); }
function view(name) {
  const freeApiLink = name === 'settings/openrouter'; if (freeApiLink) name = 'settings';
  if (!labels[name]) name = 'chat';
  const surface = name === 'files' ? 'chat' : ['skills', 'downloads'].includes(name) ? 'settings' : name;
  if (name !== 'files' && $('project-files-dialog').open) closeProjectFiles(false);
  if (surface !== 'settings') clearCredentialViews();
  document.querySelectorAll('.view').forEach(element => { element.hidden = element.id !== `view-${surface}`; });
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === surface));
  $('view-label').textContent = labels[name][0]; $('page-title').textContent = labels[name][1];
  const targetHash = `#${freeApiLink ? 'settings/openrouter' : name}`; if (location.hash !== targetHash) history.replaceState(null, '', targetHash);
  const category = $('parameters-' + name); if (surface === 'settings' && name !== 'settings' && category) { if (name === 'skills') $('parameters-files').open = true; category.open = true; requestAnimationFrame(() => category.scrollIntoView({ block: 'start' })); }
  if (name === 'files') openProjectFiles();
  if (name === 'settings' && app.state && !app.engeeOptionsLoaded) loadEngeeOptions();
  if (name === 'settings' && app.state) loadEngeeLogin();
  if (name === 'downloads' && app.state) discoverIntegrations().catch(error => { $('integration-status').textContent = readableError(error); $('integration-status').hidden = false; });
  if (freeApiLink) { $('parameters-models').open = true; $('parameters-connections').open = true; $('free-api-options').hidden = hasOpenRouterKey(); $('free-api-connect-button').setAttribute('aria-expanded', String(!$('free-api-options').hidden)); requestAnimationFrame(() => $('free-api-connect').scrollIntoView({ block: 'center' })); }
}
function saveConversation() {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ history: app.history, events: app.events, fingerprint: app.fingerprint, claudeSession: app.claudeSession ? { sessionId: app.claudeSession.sessionId || app.claudeSession.sessionID || app.claudeSession.id } : null })); }
  catch { /* Storage availability does not affect the current conversation. */ }
  window.EngeePersistence?.changed();
}
function restoreConversation() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
    if (Array.isArray(value.history)) app.history = value.history.filter(item => item && ['user', 'assistant', 'tool'].includes(item.role));
    if (Array.isArray(value.events)) app.events = value.events;
    if (typeof value.fingerprint === 'string') app.fingerprint = value.fingerprint;
    if (typeof value.claudeSession?.sessionId === 'string') app.claudeSession = { sessionId: value.claudeSession.sessionId };
  } catch { app.history = []; app.events = []; }
}
function contentText(content) { return typeof content === 'string' ? content : Array.isArray(content) ? content.filter(block => block.type === 'text' || block.text).map(block => block.text || '').join('\n') : ''; }
function renderText(parent, content) {
  const value = contentText(content); const pattern = /```([^\n]*)\n([\s\S]*?)```/g; let offset = 0, match;
  const plain = text => { if (!text) return; const node = document.createElement('div'); node.className = 'message-text'; node.textContent = text; parent.append(node); };
  while ((match = pattern.exec(value))) {
    plain(value.slice(offset, match.index));
    const container = document.createElement('div'); container.className = 'code-container'; const toolbar = document.createElement('div'); toolbar.className = 'code-toolbar';
    const language = document.createElement('span'); language.textContent = match[1].trim() || 'Код'; const copy = copyButton(match[2], 'Скопировать код');
    const save = saveCodeButton(match[2], match[1].trim()); const actions = document.createElement('div'); actions.className = 'code-actions'; actions.append(copy, save); if (/^(julia|jl)$/i.test(match[1].trim())) actions.append(runCodeButton(match[2]));
    toolbar.append(language, actions); const code = document.createElement('pre'); code.className = 'code-block'; code.textContent = match[2]; container.append(toolbar, code); parent.append(container); offset = pattern.lastIndex;
  }
  plain(value.slice(offset));
}
function renderEvent(event) {
  if (event.role === 'tool') {
    const details = document.createElement('details'); details.className = 'message-tool';
    const summary = document.createElement('summary'); summary.textContent = `${event.label || 'Инструмент'} · ${event.name || 'Действие в проекте'}`;
    const pre = document.createElement('pre'); pre.textContent = event.content || ''; details.append(summary, pre); $('messages').append(details); return;
  }
  const article = document.createElement('article'); article.className = `message ${event.role === 'user' ? 'user' : event.role === 'error' ? 'error' : 'assistant'}`;
  const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.textContent = event.role === 'user' ? 'Вы' : event.role === 'error' ? '!' : '✦';
  const body = document.createElement('div'); body.className = 'message-body';
  const label = document.createElement('div'); label.className = 'message-label'; label.textContent = event.role === 'user' ? 'ВЫ' : event.role === 'error' ? 'СОСТОЯНИЕ ЗАПРОСА' : 'ENGEE AGENT';
  if (event.createdAt && !Number.isNaN(Date.parse(event.createdAt))) { const time = document.createElement('time'); time.dateTime = event.createdAt; time.title = new Date(event.createdAt).toLocaleString('ru-RU'); time.textContent = new Date(event.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); if (event.role === 'assistant' && Number.isFinite(event.responseMs)) time.textContent += ` · ответ за ${event.responseMs < 1000 ? (event.responseMs / 1000).toFixed(1).replace('.', ',') : Math.round(event.responseMs / 1000)} с`; label.append(time); }
  if (event.origin) { const source = document.createElement('span'); source.className = 'message-source'; source.textContent = event.origin === 'engee' ? 'Engee' : event.origin === 'julia' ? `Локальная Julia${event.version ? ` · ${event.version}` : ''}` : [event.providerLabel || event.provider, event.model].filter(Boolean).join(' · '); label.append(source); }
  body.append(label); renderText(body, event.content);
  if (event.attachments?.length) { const attachments = document.createElement('div'); attachments.className = 'message-attachments'; event.attachments.forEach(item => attachments.append(attachmentChip(item, false))); body.append(attachments); }
  if (event.role !== 'error') { const actions = document.createElement('div'); actions.className = 'message-actions'; actions.append(copyButton(contentText(event.content), 'Скопировать сообщение')); body.append(actions); }
  article.append(avatar, body); $('messages').append(article);
}
function renderConversation() { document.querySelectorAll('.message,.message-tool').forEach(element => element.remove()); $('welcome').hidden = app.events.length > 0; app.events.forEach(renderEvent); $('messages').scrollTop = app.events.length ? $('messages').scrollHeight : 0; }
function addEvent(event) { event.createdAt ||= new Date().toISOString(); app.events.push(event); $('welcome').hidden = true; renderEvent(event); $('messages').scrollTop = $('messages').scrollHeight; saveConversation(); }

function copyButton(content, label) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'message-copy'; button.textContent = label; button.title = label;
  button.addEventListener('click', async () => { try { await navigator.clipboard.writeText(content); button.textContent = 'Скопировано'; button.classList.add('copy-success'); setTimeout(() => { button.textContent = label; button.classList.remove('copy-success'); }, 1800); } catch { toast('Браузер не разрешил копирование. Выделите текст вручную.'); } });
  return button;
}
function saveCodeButton(content, language) { const button = document.createElement('button'); button.type = 'button'; button.className = 'message-copy'; button.textContent = 'Сохранить в проект'; button.title = 'Выбрать имя файла и подтвердить запись в рабочую папку Engee'; button.addEventListener('click', () => openCodeSave(content, language)); return button; }
function runCodeButton(content) { const button = document.createElement('button'); button.type = 'button'; button.className = 'message-copy code-run'; button.textContent = 'Выполнить'; button.title = `Подтвердить и выполнить этот Julia-код: ${executionLabel()}`; button.disabled = app.busy || app.executionTarget === 'julia' && !canUseJulia(); button.addEventListener('click', () => evaluateInEngee(content, true)); return button; }
function openCodeSave(content = '', language = '', target) {
  if (app.busy) { toast('Сначала завершите текущий запрос.'); return; }
  const extension = /^(julia|jl)$/i.test(language) ? 'jl' : /^ngscript$/i.test(language) ? 'ngscript' : /^(verilog|v)$/i.test(language) ? 'v' : /^json$/i.test(language) ? 'json' : 'txt';
  const draft = !content && !target ? window.EngeePersistence?.codeDraft() : null;
  $('code-save-title').textContent = content ? 'Сохранить код в проект' : 'Создать новый файл'; $('code-save-path').value = target || draft?.path || `example.${extension}`; $('code-save-source').value = content || draft?.content || ''; $('code-save-dialog').showModal(); $('code-save-path').focus();
}
function toolSucceeded(result) { return !(result?.error || result?.denied || result?.declined || result?.cancelled || result?.ok === false || result?.allowed === false || (typeof result === 'string' && /denied|отклон|cancelled|отмен/i.test(result))); }
function visibleToolResult(name, result) { return ['engee_status', 'engee_start', 'engee_stop'].includes(name) ? { serverStatus: result?.serverStatus, serverReady: result?.serverReady, version: typeof result?.version === 'string' ? result.version : result?.version?.name || result?.version?.id, ...(result?.declined ? { declined: true, message: 'Действие отклонено.' } : {}), ...(result?.error ? { error: readableError(result.error) } : {}) } : result; }
async function manualTool(name, args, target = app.executionTarget) {
  if (app.busy) throw new Error('Сначала завершите текущий запрос.');
  const previousTools = app.tools; app.activeOperation = 'tool'; app.controller = new AbortController(); const signal = app.controller.signal; setBusy(true); $('run-status-text').textContent = 'Подготовка действия в проекте…';
  try { app.tools = await refreshToolDefinitions(signal, target); const result = await executeTool({ id: `manual-${Date.now()}`, function: { name, arguments: JSON.stringify(args) } }, signal, target); const visible = visibleToolResult(name, result); $('file-operation-result').textContent = typeof visible === 'string' ? visible : JSON.stringify(visible, null, 2); $('file-operation-result').hidden = false; return result; }
  catch (error) { $('file-operation-result').textContent = readableError(error); $('file-operation-result').hidden = false; throw error; }
  finally { app.tools = previousTools; app.controller = null; app.activeOperation = null; setBusy(false); }
}
function juliaResultText(result) {
  if (result?.declined || result?.denied) return 'Выполнение в локальной Julia отклонено. Код не выполнен.';
  const parts = []; if (result?.timedOut) parts.push('Julia превысила время выполнения.'); else if (result?.cancelled) parts.push('Выполнение Julia остановлено.'); else if (result?.ok === false || result?.error) parts.push('Выполнение Julia завершилось ошибкой.'); else parts.push('Результат локальной Julia:');
  if (result?.stdout) parts.push(String(result.stdout)); if (result?.result !== undefined && String(result.result).trim() !== String(result?.stdout || '').trim()) parts.push(`${result?.stdout ? 'Значение:\n' : ''}${String(result.result)}`); if (result?.stderr) parts.push(`stderr:\n${String(result.stderr)}`); if (result?.error) parts.push(readableError(result.error));
  if (Number.isInteger(result?.exitCode) && result.exitCode !== 0) parts.push(`Код выхода: ${result.exitCode}`); if (result?.truncated) parts.push('Вывод сокращён: превышен лимит.');
  if (parts.length === 1 && toolSucceeded(result)) parts.push('Код выполнен без текстового вывода.'); return parts.join('\n');
}
function recordManualExecution(code, target, result, event) {
  app.history.push({ role: 'user', content: `Запрошено ручное выполнение кода. Среда: ${executionLabel(target)}.\nКод:\n${code}` }, { role: 'assistant', content: `Фактический исход ручного выполнения. Среда: ${executionLabel(target)}${event.version ? ` · версия ${event.version}` : ''}.\n${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}` });
  addEvent(event);
}
async function evaluateInEngee(source, codeBlock = false) {
  if (app.busy) return;
  const target = app.executionTarget, origin = target === 'julia' ? 'julia' : 'engee';
  if (target === 'julia' && !canUseJulia()) { showError(executionCapability()?.message || 'Локальная Julia недоступна. Проверьте «Параметры → Компоненты».'); return; }
  const code = codeBlock ? String(source || '') : String(source || '').replace(/^\/eval(?:\s+|$)/, '').trim();
  if (!code) { $('prompt').value = '/eval '; openHelp('eval'); return; }
  clearError(); $('slash-menu').hidden = true; addEvent({ role: 'user', content: `/eval\n${code}` }); if (!codeBlock) $('prompt').value = '';
  try {
    const result = await manualTool(target === 'julia' ? 'julia_eval_code' : 'engee_eval_code', { code }, target);
    if (target === 'julia') { recordManualExecution(code, target, result, { role: result?.error || result?.ok === false || result?.timedOut ? 'error' : 'assistant', content: juliaResultText(result), origin, version: result?.version || executionCapability()?.version, responseMs: Number.isFinite(result?.durationMs) ? result.durationMs : app.lastToolMs }); return; }
    if (!toolSucceeded(result)) { recordManualExecution(code, target, result, { role: result?.error ? 'error' : 'assistant', content: result?.error ? `Ошибка Engee: ${readableError(result.error)}` : 'Выполнение в Engee отменено. Код не выполнен.', origin: 'engee', responseMs: app.lastToolMs }); return; }
    const value = typeof result === 'string' ? result : result?.output ?? result?.text ?? result?.value ?? result?.result ?? JSON.stringify(result, null, 2);
    recordManualExecution(code, target, result, { role: 'assistant', content: `Результат Engee:\n${value}`, origin: 'engee', responseMs: app.lastToolMs });
  } catch (error) { const message = readableError(error); recordManualExecution(code, target, { error: message, completed: false }, { role: 'error', content: `Ошибка ${executionLabel(target)}: ${message}`, origin }); }
  finally { $('prompt').focus(); }
}
function formatEngeeStatus(result) {
  const status = result?.serverStatus;
  const names = { stopped: 'Среда Engee остановлена', starting: 'Среда Engee запускается', running: 'Среда Engee работает', stopping: 'Среда Engee останавливается' };
  let text = names[status] || (status === undefined ? 'Состояние Engee не получено' : `Сервер Engee ответил: HTTP ${status}.`);
  if (status === 'running' && result.serverReady === false) text = 'Engee запускается: среда ещё готовится';
  if (status === 'running' && result.serverReady === undefined) text = 'Среда Engee запущена, готовность не проверена';
  const version = typeof result?.version === 'string' ? result.version : result?.version?.name || result?.version?.id;
  if (version) text += ` · версия ${version}`;
  return text;
}
function paintHealth(id, state, text) { const element = $(id); element.classList.remove('is-good', 'is-pending', 'is-bad', 'offline'); element.classList.add(`is-${state}`); element.title = text; element.setAttribute('aria-label', text); }
function renderLlmHealth() {
  if (!app.state) return;
  const config = app.state.config, check = app.llmHealth; if (check?.fingerprint === configurationFingerprint(config)) { paintHealth('llm-health', check.state, check.text); return; }
  const label = activeConnection()?.name || providerDisplayName(app.state.providers?.find(item => item.id === config.provider)) || config.provider || 'не выбрана';
  const message = config.provider === 'local' ? app.state.local?.starting ? 'GGUF запускается' : app.state.local?.running ? 'готовность GGUF не проверена' : 'GGUF запустится при первом сообщении' : 'состояние не проверено';
  paintHealth('llm-health', 'pending', `Нейросеть: ${label} · ${config.model || selectedModelLabel()} · ${message}`);
}
function setLlmHealth(state, text, fingerprint = configurationFingerprint(app.state?.config || {})) { app.llmHealth = { state, text, fingerprint }; renderLlmHealth(); }
function updateEngeeStatus(result) {
  const text = formatEngeeStatus(result); $('engee-state').textContent = text; const ready = result?.serverStatus === 'running' && result?.serverReady === true && Boolean(result?.version);
  setStatus('engee-probe-result', text, ready ? 'good' : ''); const failed = result?.error || result?.ok === false || ['failed', 'error'].includes(result?.serverStatus);
  paintHealth('engee-health', failed ? 'bad' : ready ? 'good' : 'pending', `Engee: ${text}`);
}
async function waitForEngeeReady() {
  const deadline = Date.now() + 120000; app.activeOperation = 'engee-ready'; app.controller = new AbortController(); const signal = app.controller.signal; setBusy(true);
  const pause = duration => new Promise((resolve, reject) => { const aborted = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(new DOMException('Ожидание остановлено', 'AbortError')); }; const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, duration); signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted(); });
  try {
    while (Date.now() < deadline) {
      $('run-status-text').textContent = 'Engee запускается: ждём готовности среды…'; setStatus('engee-lifecycle-result', 'Engee запускается: ждём готовности среды…');
        try {
          const response = await api('/api/tool', { name: 'engee_status', arguments: {} }, { signal, timeout: Math.min(15000, Math.max(1, deadline - Date.now())) }); const result = response.result ?? response; updateEngeeStatus(result);
          if (result.serverStatus === 'running' && result.serverReady === true) { setStatus('engee-lifecycle-result', 'Engee готова к выполнению кода.', 'good'); return true; }
          if (['stopped', 'stopping', 'failed', 'error'].includes(result.serverStatus) || result.error || result.ok === false) { setStatus('engee-lifecycle-result', `Запуск Engee не завершён: ${result.error ? readableError(result.error) : formatEngeeStatus(result)}. Нажмите «Проверить Engee».`, 'bad'); return false; }
        } catch (error) {
          if (signal.aborted) throw error;
          const message = `Пока не удалось проверить готовность Engee: ${readableError(error)} Продолжаем ожидание…`; setStatus('engee-lifecycle-result', message); $('run-status-text').textContent = 'Engee запускается: повторяем проверку готовности…'; paintHealth('engee-health', 'pending', message);
        }
      if (Date.now() < deadline) await pause(Math.min(3000, deadline - Date.now()));
    }
    setStatus('engee-lifecycle-result', 'Готовность Engee пока не подтверждена. Нажмите «Проверить Engee».'); return false;
  } catch (error) { const timedOut = Date.now() >= deadline; setStatus('engee-lifecycle-result', signal.aborted ? 'Ожидание готовности остановлено. Нажмите «Проверить Engee».' : timedOut ? 'Готовность Engee пока не подтверждена. Нажмите «Проверить Engee».' : `Проверка готовности: ${readableError(error)} Нажмите «Проверить Engee».`, signal.aborted || timedOut ? '' : 'bad'); return false; }
  finally { app.controller = null; app.activeOperation = null; setBusy(false); }
}
async function loadEngeeOptions() {
  $('engee-load-options').disabled = true;
  try {
    const result = await api('/api/engee/options'); $('engee-version').replaceChildren(); const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = 'Версия по умолчанию'; $('engee-version').append(defaultOption);
    (result.versions || []).forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name || item.id; $('engee-version').append(option); });
    const timeout = result.inactivityTimeout || {}; $('engee-timeout').min = Math.max(1, Math.ceil((timeout.min || 60) / 60)); if (timeout.max) $('engee-timeout').max = Math.floor(timeout.max / 60); else $('engee-timeout').removeAttribute('max');
    if (!app.engeeOptionsLoaded && timeout.default) $('engee-timeout').value = Math.ceil(timeout.default / 60);
    app.engeeOptionsLoaded = true; app.engeeStartAvailable = result.startAvailable !== false; app.engeeTimeoutAvailable = timeout.available !== false; $('engee-start').disabled = !app.engeeStartAvailable; $('engee-timeout').disabled = !app.engeeTimeoutAvailable;
    setStatus('engee-lifecycle-result', app.engeeStartAvailable ? `Доступно версий: ${(result.versions || []).length}${app.engeeTimeoutAvailable ? '' : ' · Таймаут определяется настройками аккаунта'}` : 'Запуск среды недоступен для текущего аккаунта.');
  } catch (error) { setStatus('engee-lifecycle-result', readableError(error), 'bad'); }
  finally { $('engee-load-options').disabled = false; }
}
function showSelectedFile(path, content, metadata = {}) {
  app.selectedFile = { path, content, editToken: metadata.editToken, workspaceId: metadata.workspaceId, sha256: metadata.sha256 }; $('file-name').textContent = path; $('file-content').textContent = content || '(Пустой файл)'; $('file-content').hidden = false; $('file-editor').hidden = true; $('file-editor').value = content; $('edit-file').hidden = false; $('save-file').hidden = true; $('file-to-chat').hidden = false; $('run-file').hidden = !/\.(jl|ngscript)$/i.test(path); $('upload-to-engee').hidden = false; $('file-operation-result').textContent = ''; $('file-operation-result').hidden = true;
  window.EngeePersistence?.changed();
}
async function saveProjectFile(target, content) {
  if (!target.trim()) throw new Error('Укажите путь файла внутри рабочей папки.');
  if (window.EngeePersistence?.fileDirty() && !await window.EngeePersistence.guardFile()) return { declined: true, message: 'Текущие изменения файла сохранены в редакторе. Новая запись отменена.' };
  if (/\b(?:using|import)\s+Plots\b|\bPlots\s*\./.test(content)) throw new Error('В примерах Engee используйте встроенные графические функции без подключения Plots.');
  const result = await manualTool('write_file', { path: target.trim(), content });
  if (toolSucceeded(result)) { let metadata = {}; try { metadata = await api(`/api/file?path=${encodeURIComponent(target.trim())}`); } catch {} showSelectedFile(target.trim(), content, metadata); await loadFiles(app.filePath); toast('Файл сохранён в проекте'); }
  else toast('Файл не сохранён. Проверьте результат действия.');
  return result;
}
function openHelp(key) { window.open(`/help/guide.html#${HELP_SECTIONS[key] || 'interface'}`, '_blank', 'noopener'); }
function attachmentImage(item) {
  const value = typeof item.image === 'string' ? item.image : item.image?.url || item.image?.image_url?.url || item.image_url?.url;
  return typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value) ? value : null;
}
function attachmentChip(item, removable) {
  const chip = document.createElement('div'); chip.className = 'attachment-chip';
  const image = attachmentImage(item);
  if (image) { const thumbnail = document.createElement('img'); thumbnail.src = image; thumbnail.alt = item.name || 'Изображение'; chip.append(thumbnail); }
  else { const symbol = document.createElement('span'); symbol.className = 'attachment-symbol'; symbol.textContent = '▤'; chip.append(symbol); }
  const description = document.createElement('div'); const name = document.createElement('strong'); name.textContent = item.name || 'Вложение'; const size = document.createElement('small'); size.textContent = item.size >= 1024 ** 2 ? `${(item.size / 1024 ** 2).toFixed(1)} МБ` : `${Math.ceil((item.size || 0) / 1024)} КБ`; description.append(name, size); chip.append(description);
  if (removable) { const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'attachment-remove'; remove.textContent = '×'; remove.title = `Убрать ${item.name}`; remove.setAttribute('aria-label', `Убрать ${item.name}`); remove.addEventListener('click', () => { app.attachments = app.attachments.filter(value => value !== item); renderAttachments(); }); chip.append(remove); }
  return chip;
}
function renderAttachments() { $('attachment-list').replaceChildren(); $('attachment-list').hidden = !app.attachments.length; app.attachments.forEach(item => $('attachment-list').append(attachmentChip(item, true))); window.EngeePersistence?.changed(); }
function readAsBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error(`Не удалось прочитать ${file.name}`)); reader.readAsDataURL(file); }); }
async function uploadAttachments(files) {
  if (app.busy) return;
  const values = [...files];
  if (values.length + app.attachments.length > 5) { toast('До 5 вложений за сообщение. Уберите лишние файлы.'); return; }
  for (const file of values) {
    const image = /\.(png|jpe?g|webp)$/i.test(file.name); const limit = image ? 4 : 1;
    if (file.size > limit * 1024 ** 2) { toast(`${file.name}: размер больше ${limit} МБ.`); continue; }
    app.uploading++; $('send-chat').disabled = true; $('attach-file').disabled = true;
    setStatus('model-change-status', `Обрабатываем ${file.name} локально…`);
    try {
      const base64 = await readAsBase64(file);
      const result = await api('/api/attachments', { filename: file.name, mime: file.type || 'text/plain', base64 });
      const attachment = result.attachment || result;
      if (!attachment.name) attachment.name = file.name;
      if (!attachment.size) attachment.size = file.size;
      if (!attachment.mime) attachment.mime = file.type || 'text/plain';
      app.attachments.push(attachment); renderAttachments(); setStatus('model-change-status', '');
    } catch (error) { setStatus('model-change-status', readableError(error), 'bad'); }
    finally { app.uploading--; $('send-chat').disabled = app.uploading > 0; $('attach-file').disabled = app.uploading > 0; }
  }
}
function buildUserContent(prompt, attachments) {
  if (!attachments.length) return prompt;
  const blocks = [{ type: 'text', text: prompt }];
  attachments.forEach(item => {
    const image = attachmentImage(item);
    if (image) { blocks.push({ type: 'text', text: `Изображение: ${item.name}` }); blocks.push({ type: 'image_url', image_url: { url: image } }); }
    else blocks.push({ type: 'text', text: `Вложение: ${item.name}\n\n${typeof item.content === 'string' ? item.content : '(Не удалось извлечь текст)'}` });
  });
  return blocks;
}
function providerDisplayName(provider) { return provider?.id === 'custom' ? 'Другой LLM / совместимый API' : provider?.label || provider?.id || ''; }
function orderedProviders(providers = []) { const priority = { ollama: 0, local: 1, lmstudio: 2, claude: 3 }; return providers.map((provider, index) => ({ provider, index })).sort((a, b) => (priority[a.provider.id] ?? 4) - (priority[b.provider.id] ?? 4) || a.index - b.index).map(item => item.provider); }
function providerGroup(provider) { return provider.group || (['ollama', 'local', 'lmstudio'].includes(provider.id) ? 'local' : provider.id === 'claude' ? 'claude' : 'advanced'); }
function renderProviderSelect(id, includeProfiles = false) {
  const select = $(id), config = app.state?.config || {}, providers = orderedProviders(app.state?.providers || []); select.replaceChildren();
  for (const [group, label] of [['local', 'Локальные модели'], ['claude', 'Claude'], ['free', 'Бесплатный API']]) {
    const options = providers.filter(provider => providerGroup(provider) === group); const section = document.createElement('optgroup'); section.label = label;
    options.forEach(provider => { const option = document.createElement('option'); option.value = provider.id; option.textContent = providerDisplayName(provider); section.append(option); });
    if (!options.length) { const option = document.createElement('option'); option.value = `unavailable:${group}`; option.disabled = true; option.textContent = group === 'free' ? 'Пока нет подтверждённого сервиса' : 'Пока недоступно'; section.append(option); }
    select.append(section);
  }
  const profiles = (app.state?.connections || []).filter(item => item.type !== 'program');
  if (includeProfiles && profiles.length) { const section = document.createElement('optgroup'); section.label = 'Ваши подключения'; profiles.forEach(profile => { const option = document.createElement('option'); option.value = `profile:${profile.id}`; option.textContent = profile.name; section.append(option); }); select.append(section); }
  const current = providers.find(provider => provider.id === config.provider);
  if (current && providerGroup(current) === 'advanced' && !(includeProfiles && config.connectionId && profiles.some(profile => profile.id === config.connectionId))) { const section = document.createElement('optgroup'); section.label = 'Настроенное подключение'; const option = document.createElement('option'); option.value = current.id; option.textContent = providerDisplayName(current); section.append(option); select.append(section); }
  select.value = includeProfiles && config.connectionId && profiles.some(profile => profile.id === config.connectionId) ? `profile:${config.connectionId}` : config.provider || '';
}
function configurationFingerprint(config) { return `${config.provider}:${config.model}:${endpointKey(config.baseUrl)}:${config.connectionId || ''}`; }
function activeConnection() { return app.state?.connections?.find(item => item.id === app.state.config.connectionId); }
function serverChoosesModel() { const profile = activeConnection(); return profile?.type === 'api' && profile.settings?.format === 'custom-json'; }
function selectedModelLabel() { return app.state?.config.model || (serverChoosesModel() ? 'Модель выбирает сервер' : 'Модель не указана'); }
function usesModelCatalog(provider) { return provider === 'ollama' || providerGroup(app.state?.providers?.find(item => item.id === provider) || { id: provider }) === 'free'; }
function endpointKey(value) { return String(value || '').trim().replace(/\/+$/, ''); }
function discoveredIds(result) { return [...new Set((result.models || []).map(item => typeof item === 'string' ? item : item.id || item.name).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]; }
function currentCatalog(provider, baseUrl) { return app.catalogs?.[`${provider}|${endpointKey(baseUrl)}`]?.ids; }
function storeCatalog(provider, baseUrl, ids, error = '') { if (provider === 'openrouter') ids = ids.filter(id => id === 'openrouter/free' || /:free$/i.test(id)); app.modelCatalog[provider] = ids; (app.catalogs ||= {})[`${provider}|${endpointKey(baseUrl)}`] = { ids, error }; }
function fillOllamaSelect(id, baseUrl, selected, provider = 'ollama') {
  const select = $(id); const ids = currentCatalog(provider, baseUrl); const ollama = provider === 'ollama'; select.setAttribute('aria-label', ollama ? 'Установленная модель Ollama' : 'Бесплатная модель API'); const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = ids?.length ? ollama ? 'Выберите установленную модель' : 'Выберите бесплатную модель' : ids ? ollama ? 'Нет установленных моделей' : 'Нет доступных бесплатных моделей' : 'Обновите список моделей'; select.replaceChildren(placeholder);
  (ids || []).forEach(model => { const option = document.createElement('option'); option.value = model; option.textContent = ollama ? `${model} · ${/:cloud$/i.test(model) ? 'Облачная' : 'Локальная'}` : model; select.append(option); });
  if (selected && !ids?.includes(selected)) { const option = document.createElement('option'); option.value = selected; option.textContent = `${selected} · ${ids === undefined ? 'доступность не проверена' : 'нет на сервере'}`; option.disabled = true; select.append(option); }
  select.value = selected || '';
  return ids;
}
function catalogNotice(prefix, provider, baseUrl, selected, ids) {
  const notice = $(`${prefix}-notice`); const message = $(`${prefix}-message`); const error = app.catalogs?.[`${provider}|${endpointKey(baseUrl)}`]?.error;
  const text = error ? `Список моделей недоступен: ${error}` : ids === undefined ? 'Список моделей ещё не загружен.' : !ids.length ? provider === 'ollama' ? 'В Ollama нет установленных моделей.' : 'Доступные бесплатные модели не найдены.' : selected && !ids.includes(selected) ? 'Выбранная модель отсутствует на этом сервере. Выберите модель из списка.' : '';
  const link = notice.querySelector('a'); link.href = `/help/guide.html#${provider === 'ollama' ? 'ollama' : 'free-api'}`; link.textContent = provider === 'ollama' ? 'Подключить Ollama ↗' : 'Подключить бесплатный API ↗'; message.textContent = text; notice.hidden = !text;
}
function renderModelControls() {
  renderChatModelButton();
  $('chat-model-input').placeholder = serverChoosesModel() ? 'Модель выбирает сервер' : 'Точное название модели';
  const config = app.state?.config || {}; const chatOllama = usesModelCatalog(config.provider); $('chat-ollama-model').hidden = !chatOllama; $('chat-model-input').hidden = chatOllama; $('chat-ollama-notice').hidden = !chatOllama;
  if (chatOllama) { const ids = fillOllamaSelect('chat-ollama-model', config.baseUrl, config.model, config.provider); catalogNotice('chat-ollama', config.provider, config.baseUrl, config.model, ids); }
  const provider = $('provider').value; const settingsOllama = usesModelCatalog(provider); $('settings-ollama-model').hidden = !settingsOllama; $('model').hidden = settingsOllama; $('settings-discover-models').textContent = settingsOllama ? 'Обновить модели' : 'Найти модели';
  if (settingsOllama) { const ids = fillOllamaSelect('settings-ollama-model', $('baseUrl').value, $('model').value, provider); catalogNotice('settings-models', provider, $('baseUrl').value, $('model').value, ids); $('settings-model-count').textContent = ids?.length ? `Доступно: ${ids.length}` : ''; }
  else $('settings-models-notice').hidden = true;
  $('settings-model-list').replaceChildren(); (currentCatalog($('provider').value, $('baseUrl').value) || []).forEach(model => { const option = document.createElement('option'); option.value = model; $('settings-model-list').append(option); });
}
function renderModelSuggestions() {
  $('chat-model-list').replaceChildren(); const config = app.state?.config || {};
  const ids = currentCatalog(config.provider, config.baseUrl) || (config.provider === 'local' ? (app.state?.models || []).map(item => item.name) : []);
  const values = [...new Set([config.model, ...ids].filter(Boolean))];
  values.forEach(value => { const option = document.createElement('option'); option.value = value; $('chat-model-list').append(option); });
  renderModelControls();
}
async function switchChatProvider(id) {
  if (app.busy) return;
  if (id.startsWith('profile:')) { await window.EngeeConnections?.use(id.slice(8)); return; }
  const provider = app.state?.providers?.find(item => item.id === id); if (!provider) { toast('Провайдер пока недоступен. Обновите состояние сервера.'); return; }
  $('chat-provider').disabled = true; $('chat-model-input').disabled = true; $('send-chat').disabled = true; setStatus('model-change-status', 'Переключаем…');
  try {
    const local = id === 'local' && app.state?.local?.running ? app.state.local : null;
    await api('/api/config', { provider: id, baseUrl: local?.baseUrl || provider.baseUrl || '', model: local?.model || provider.defaultModel || '' });
    const preserveDrafts = window.EngeePersistence?.hasSettingsDraft() === true; await refreshState(!preserveDrafts, preserveDrafts); setStatus('model-change-status', ''); if (usesModelCatalog(id)) await discoverModels();
  } catch (error) { setStatus('model-change-status', readableError(error), 'bad'); }
  finally { $('chat-provider').disabled = false; $('chat-model-input').disabled = false; $('send-chat').disabled = app.uploading > 0; }
}
async function switchChatModel() {
  if (app.busy || !app.state) return;
  const model = $('chat-model-input').value.trim(); if ((!model && !serverChoosesModel()) || model === app.state.config.model) return;
  $('chat-model-input').disabled = true; $('send-chat').disabled = true; setStatus('model-change-status', 'Сохраняем модель…');
  try { if (app.state.config.connectionId) await window.EngeeConnections.changeModel(model); else { await api('/api/config', { model }); const preserveDrafts = window.EngeePersistence?.hasSettingsDraft() === true; await refreshState(!preserveDrafts, preserveDrafts); } setStatus('model-change-status', ''); }
  catch (error) { setStatus('model-change-status', readableError(error), 'bad'); }
  finally { $('chat-model-input').disabled = false; $('send-chat').disabled = app.uploading > 0; }
}
async function discoverModels() {
  if (!app.state || app.busy) return;
  setStatus('model-change-status', 'Ищем модели…');
  const { provider, baseUrl } = app.state.config;
  try { const result = await api('/api/models/discover', { provider, baseUrl }); storeCatalog(provider, baseUrl, discoveredIds(result)); renderModelSuggestions(); if (app.state.config.provider === provider && endpointKey(app.state.config.baseUrl) === endpointKey(baseUrl)) setStatus('model-change-status', provider === 'ollama' ? '' : result.message || `Найдено моделей: ${app.modelCatalog[provider].length}`, 'good'); }
  catch (error) { storeCatalog(provider, baseUrl, [], readableError(error)); renderModelSuggestions(); if (provider !== 'ollama' && app.state.config.provider === provider) setStatus('model-change-status', readableError(error), 'bad'); }
}
async function discoverSettingsModels() {
  if (!app.state || app.busy) return;
  const provider = $('provider').value; const baseUrl = $('baseUrl').value.trim(); $('settings-discover-models').disabled = true; $('settings-model-count').textContent = 'Обновляем…';
  try { if ($('apiKey').value && !['ollama', 'local'].includes(provider)) throw new Error('Сначала сохраните введённый API-ключ кнопкой «Сохранить настройки».'); const result = await api('/api/models/discover', { provider, baseUrl }); storeCatalog(provider, baseUrl, discoveredIds(result)); renderModelSuggestions(); if ($('provider').value === provider && endpointKey($('baseUrl').value) === endpointKey(baseUrl)) { $('settings-model-count').textContent = app.modelCatalog[provider].length ? `Доступно: ${app.modelCatalog[provider].length}` : ''; if (provider !== 'ollama' && !app.modelCatalog[provider].length) { $('settings-models-message').textContent = 'Сервер не вернул модели. Укажите точное название вручную.'; $('settings-models-notice').hidden = false; } } }
  catch (error) { storeCatalog(provider, baseUrl, [], readableError(error)); renderModelControls(); if ($('provider').value === provider && endpointKey($('baseUrl').value) === endpointKey(baseUrl)) { $('settings-model-count').textContent = ''; if (provider !== 'ollama') { $('settings-models-message').textContent = readableError(error); $('settings-models-notice').hidden = false; } } }
  finally { applyProfileLocks(); }
}
async function selectOllamaModel(fromSettings = false) {
  if (!app.state || app.busy) return;
  const select = $(fromSettings ? 'settings-ollama-model' : 'chat-ollama-model'); const model = select.value; const baseUrl = fromSettings ? $('baseUrl').value.trim() : app.state.config.baseUrl; const provider = fromSettings ? $('provider').value : app.state.config.provider;
  if (!model || !currentCatalog(provider, baseUrl)?.includes(model)) return;
  select.disabled = true; $('send-chat').disabled = true;
  try { if (app.state.config.connectionId && provider === app.state.config.provider && endpointKey(baseUrl) === endpointKey(app.state.config.baseUrl)) await window.EngeeConnections.changeModel(model); else { await api('/api/config', { provider, baseUrl, model }); if (fromSettings || $('provider').value === provider && endpointKey($('baseUrl').value) === endpointKey(baseUrl)) $('model').value = model; await refreshState(false); } setStatus(fromSettings ? 'settings-model-count' : 'model-change-status', fromSettings ? 'Выбрана для диалога' : ''); }
  catch (error) { setStatus(fromSettings ? 'settings-model-count' : 'model-change-status', readableError(error), 'bad'); }
  finally { select.disabled = false; applyProfileLocks(); $('send-chat').disabled = app.uploading > 0; }
}
async function discoverIntegrations() {
  $('detect-integrations').disabled = true;
  try {
    const [result] = await Promise.all([api('/api/integrations'), discoverJulia()]); app.integrations = result;
    for (const name of ['claude', 'ollama', 'opencode']) {
      const data = result[name] || {}; const element = $(`integration-${name}`); element.classList.toggle('available', Boolean(data.available));
      element.textContent = data.available ? `Обнаружен${data.version ? ` · ${String(data.version).slice(0, 70)}` : ''}${name === 'ollama' && Array.isArray(data.models) ? ` · моделей: ${data.models.length}` : ''}` : 'Не обнаружен';
      if (name === 'claude' && data.available && data.auth) element.textContent += ` · ${typeof data.auth === 'string' ? data.auth : data.auth.authenticated || data.auth.loggedIn ? 'вход выполнен' : 'вход не подтверждён'}`;
    }
    await discoverProgramPaths(); $('integration-status').hidden = true;
  } finally { $('detect-integrations').disabled = false; }
}
const programPathFields = ['claudePath', 'powershellPath', 'gitBashPath'];
function renderProgramPathControls() {
  const supported = programPathFields.every(name => typeof app.state?.config?.[name] === 'string');
  const disabled = !supported || app.busy || Boolean(app.programPathsSaving);
  for (const name of programPathFields) { const input = $(name); if (!input) continue; if (input.dataset.dirty !== 'true') input.value = app.state?.config?.[name] || ''; input.disabled = disabled; }
  for (const id of ['save-program-paths', 'detect-program-paths']) { const button = $(id); if (button) { button.disabled = disabled; button.title = supported ? '' : 'Для настройки путей требуется обновлённый сервер приложения.'; } }
}
function programPathRow(name, data, fallback = '') {
  const row = document.createElement('div'); row.className = 'program-path-row'; const heading = document.createElement('strong'); heading.textContent = name;
  const badge = document.createElement('span'); badge.className = 'integration-badge'; badge.classList.toggle('available', data?.available === true); badge.classList.toggle('bad', data?.available === false); badge.textContent = data?.available === true ? `Найден${data.version ? ` · ${data.version}` : ''}` : data?.available === false ? 'Не найден' : 'Не проверен';
  const input = document.createElement('input'); input.readOnly = true; input.setAttribute('aria-label', `Путь: ${name}`); input.value = data?.path || data?.executable || fallback; input.placeholder = data?.available === false ? 'Установите программу или укажите путь' : 'Путь не предоставлен'; input.title = input.value || data?.message || input.placeholder;
  row.append(heading, badge, input); if (data?.message && (data.available === false || data.configuredPath && data.source === 'auto')) { const note = document.createElement('span'); note.className = `field-status${data.available === false ? ' bad' : ''}`; note.textContent = data.message; row.append(note); } return row;
}
async function discoverProgramPaths() {
  const list = $('program-path-list'); if (!list) return; renderProgramPathControls();
  const replies = await Promise.allSettled([api('/api/terminal/shells', undefined, { timeout: 15000 }), api('/api/programs', undefined, { timeout: 15000 })]);
  const shells = replies[0].status === 'fulfilled' ? replies[0].value.shells || [] : [], programs = replies[1].status === 'fulfilled' ? replies[1].value.programs || [] : [];
  const integration = app.integrations || {}; list.replaceChildren();
  list.append(programPathRow('Claude Code', integration.claude || programs.find(item => item.id === 'claude')));
  for (const [id, label] of [['powershell', 'PowerShell'], ['gitbash', 'Git Bash'], ['julia', 'Julia']]) list.append(programPathRow(label, shells.find(item => item.id === id)));
  for (const [id, label] of [['codex', 'Codex CLI'], ['opencode', 'OpenCode']]) { const data = programs.find(item => item.id === id); list.append(programPathRow(label, data)); const badge = $(`integration-${id}`); if (badge && data) { badge.classList.toggle('available', data.available === true); badge.textContent = data.available ? 'Обнаружен' : 'Не обнаружен'; badge.title = data.executable || data.path || 'Установите программу и укажите путь в мастере подключений'; } }
  list.append(programPathRow('Встроенный GGUF runtime', integration.llama, integration.llama?.bundled ? 'resources/runtime/llama/llama-server.exe' : ''));
  const failed = replies.filter(reply => reply.status === 'rejected'); if (failed.length) setStatus('program-paths-result', 'Часть путей не удалось проверить. Нажмите «Проверить пути» для повтора.', 'bad');
  else if (app.programPathsSaving !== true) setStatus('program-paths-result', '');
}
async function saveProgramPaths() {
  if (app.busy || app.programPathsSaving || !programPathFields.every(name => typeof app.state?.config?.[name] === 'string')) return;
  const patch = Object.fromEntries(programPathFields.map(name => [name, $(name).value.trim()])); app.programPathsSaving = true; renderProgramPathControls(); setStatus('program-paths-result', 'Проверяем и сохраняем пути…');
  try { await api('/api/config', patch); for (const name of programPathFields) delete $(name).dataset.dirty; window.EngeePersistence?.programPathsSaved(); await refreshState(false); await discoverIntegrations(); await window.EngeeTerminal?.refresh?.(); setStatus('program-paths-result', 'Пути сохранены. Они применяются к новым запросам и новым сессиям.', 'good'); }
  catch (error) { setStatus('program-paths-result', readableError(error), 'bad'); }
  finally { app.programPathsSaving = false; renderProgramPathControls(); }
}
function juliaSupported() { return typeof app.state?.config?.juliaPath === 'string'; }
function renderJuliaControls() {
  const supported = juliaSupported(), pendingTitle = 'Обновление приложения ожидает завершения терминальной сессии';
  for (const id of ['save-julia-path', 'detect-julia']) { const button = $(id); if (button) { button.disabled = !supported || app.busy || Boolean(app.juliaSaving); button.title = supported ? '' : pendingTitle; } }
  if (!supported && $('integration-julia')) { $('integration-julia').classList.remove('available'); $('integration-julia').textContent = 'Ожидает обновления'; $('integration-julia').title = pendingTitle; }
}
function renderJuliaPath() { const input = $('julia-path'); if (input && input.dataset.dirty !== 'true') input.value = app.state?.config?.juliaPath || ''; renderJuliaControls(); }
async function discoverJulia() {
  const button = $('detect-julia'), badge = $('integration-julia'); if (!button || !badge) return; if (!juliaSupported()) { renderJuliaControls(); return; }
  button.disabled = true;
  try {
    const response = await api('/api/terminal/shells', undefined, { timeout: 15000 }); const julia = (response.shells || []).find(shell => shell.id === 'julia');
    badge.classList.toggle('available', Boolean(julia?.available)); badge.textContent = julia?.available ? 'Найдена' : 'Не обнаружена'; badge.title = julia?.available ? 'Julia доступна для ручного запуска в терминале' : 'Установите Julia или укажите путь к julia.exe';
    $('julia-path').placeholder = !app.state?.config?.juliaPath && julia?.path ? julia.path : 'Автоматическое обнаружение'; return julia;
  } catch (error) { badge.classList.remove('available'); badge.textContent = 'Проверка недоступна'; setStatus('julia-path-result', readableError(error), 'bad'); }
  finally { renderJuliaControls(); }
}
async function saveJuliaPath() {
  if (app.busy || app.juliaSaving || !juliaSupported()) return; app.juliaSaving = true; renderJuliaControls(); setStatus('julia-path-result', 'Сохраняем путь…');
  try { await api('/api/config', { juliaPath: $('julia-path').value.trim() }); delete $('julia-path').dataset.dirty; await refreshState(false); await Promise.all([discoverJulia(), window.EngeeTerminal?.refresh ? window.EngeeTerminal.refresh() : Promise.resolve()]); setStatus('julia-path-result', 'Путь сохранён', 'good'); }
  catch (error) { setStatus('julia-path-result', readableError(error), 'bad'); }
  finally { app.juliaSaving = false; renderJuliaControls(); }
}
function updateClaudeSession(value) {
  app.claudeSession = value;
}
function resetConversation() { if (app.busy) return; if (window.EngeePersistence?.ready()) return window.EngeePersistence.clearActive(); app.history = []; app.events = []; app.fingerprint = ''; app.attachments = []; app.claudeSession = null; renderAttachments(); saveConversation(); renderConversation(); toast('Диалог очищен'); }
function renderSlash(filter = '') {
  $('slash-menu').replaceChildren(); const commands = SLASH_COMMANDS.filter(([command]) => command.startsWith(filter || '/')); app.slashSelection = Math.min(app.slashSelection, Math.max(0, commands.length - 1));
  commands.forEach(([command, description], index) => { const button = document.createElement('button'); button.type = 'button'; button.className = `slash-command${index === app.slashSelection ? ' selected' : ''}`; button.setAttribute('role', 'menuitem'); button.dataset.command = command; const strong = document.createElement('strong'); strong.textContent = command; const detail = document.createElement('span'); detail.textContent = description; button.append(strong, detail); button.addEventListener('click', () => runSlash(command)); $('slash-menu').append(button); });
  $('slash-menu').hidden = !commands.length;
}
async function runSlash(command) {
  if (app.busy) return; $('slash-menu').hidden = true; $('prompt').value = '';
  if (command === '/help') openHelp('commands');
    else if (command === '/eval') { $('prompt').value = '/eval '; }
  else if (command === '/files') view('files');
  else if (command === '/skills') view('skills');
  else if (command === '/models') await discoverModels();
  else if (command === '/clear') await resetConversation();
  else if (command === '/new') { if (window.EngeePersistence?.ready()) await window.EngeePersistence.newChat(); else await resetConversation(); }
  else if (command === '/status') {
    app.activeOperation = 'engee-status'; app.controller = new AbortController(); const signal = app.controller.signal; setBusy(true); $('run-status-text').textContent = 'Проверяем Engee…'; addEvent({ role: 'user', content: '/status' });
    try { const started = performance.now(); const response = await api('/api/tool', { name: 'engee_status', arguments: {} }, { signal, timeout: 60000 }); const responseMs = performance.now() - started; const result = response.result ?? response; updateEngeeStatus(result); addEvent({ role: 'assistant', content: formatEngeeStatus(result), origin: 'engee', responseMs }); setStatus('model-change-status', ''); }
    catch (error) { addEvent({ role: 'error', content: readableError(error), origin: 'engee' }); }
    finally { app.controller = null; app.activeOperation = null; setBusy(false); $('prompt').focus(); }
  } else { $('prompt').value = command; toast('Неизвестная команда. Введите /help для списка.'); }
}

function loadPuter() {
  if (window.puter?.ai) { app.sdkReady = true; return Promise.resolve(window.puter); }
  if (app.sdkPromise) return app.sdkPromise;
  $('puter-guest').disabled = true; $('puter-login').disabled = true; $('quick-puter').disabled = true;
  app.sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script'); script.src = '/vendor/puter.js'; script.async = true;
    const failed = message => { app.sdkPromise = null; $('puter-guest').disabled = false; $('puter-login').disabled = false; $('quick-puter').disabled = false; reject(new Error(message)); };
    const timer = setTimeout(() => { script.remove(); failed('Не удалось загрузить Puter. Проверьте интернет и обновите страницу.'); }, 20000);
    script.onload = () => {
      clearTimeout(timer);
      if (!window.puter?.ai) { failed('Puter недоступен в этом браузере.'); return; }
      app.sdkReady = true; $('puter-guest').disabled = false; $('puter-login').disabled = false; $('quick-puter').disabled = false; resolve(window.puter); updatePuterStatus();
    };
    script.onerror = () => { clearTimeout(timer); failed('Не удалось загрузить Puter. Проверьте интернет и обновите страницу.'); };
    document.head.append(script);
  });
  return app.sdkPromise;
}
function updatePuterStatus() { if (!app.sdkReady) return; const signed = window.puter.auth.isSignedIn(); setStatus('puter-status', signed ? 'Puter подключён в этом браузере.' : 'Нажмите «Начать с Puter» для гостевого доступа.', signed ? 'good' : ''); $('quick-puter').hidden = signed || app.state?.config?.provider !== 'puter'; }
async function signInPuter(guest) {
  if (!app.sdkReady) { toast('Puter загружается. Повторите подключение через несколько секунд.'); setStatus('puter-status', 'Puter ещё загружается. Повторите через несколько секунд.', 'bad'); loadPuter().catch(error => setStatus('puter-status', readableError(error), 'bad')); return; }
  try {
    // Opening the auth popup must remain directly inside a user click.
    const login = window.puter.auth.signIn(guest ? { attempt_temp_user_creation: true } : { request_auth: true });
    $('puter-guest').disabled = true; $('puter-login').disabled = true;
    setStatus('puter-status', 'Завершите подключение в окне Puter…');
    await withTimeout(login, null, 120000); updatePuterStatus(); toast('Puter подключён. Можно вернуться к диалогу.');
  } catch (error) { setStatus('puter-status', `${readableError(error)} ${guest ? 'Если гостевой доступ недоступен, нажмите «Войти в аккаунт». ' : ''}Разрешите всплывающее окно.`, 'bad'); view('settings'); $('parameters-models').open = true; }
  finally { $('puter-guest').disabled = false; $('puter-login').disabled = false; }
}
function hasOpenRouterKey() {
  const config = app.state?.config || {}; return Boolean(config.apiKeyStatus?.openrouter ?? (config.provider === 'openrouter' && config.hasApiKey));
}
function renderFreeApiControls() {
  const stored = hasOpenRouterKey(); $('free-api-connect-button').textContent = stored ? 'Проверить бесплатный API' : 'Подключить бесплатный API';
  $('free-api-connect-button').disabled = app.busy || Boolean(freeApiFlow) || !app.state; $('free-api-login').disabled = app.busy || Boolean(freeApiFlow) || !app.state;
  $('free-api-cancel').hidden = !freeApiFlow; $('free-api-cancel').disabled = Boolean(freeApiFlow?.controller.signal.aborted);
  if (stored) { $('free-api-options').hidden = true; $('free-api-connect-button').setAttribute('aria-expanded', 'false'); }
}
function waitFreeApi(duration, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(new DOMException('Подключение отменено', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, duration); signal.addEventListener('abort', aborted, { once: true }); if (signal.aborted) aborted();
  });
}
async function refreshFreeApiState() { await safeStatusRefresh(); if ($('provider').value === 'openrouter' && !activeSettingsProfile()) setCredentialSaved('apiKey', hasOpenRouterKey()); }
async function connectFreeApi(existingKey = false) {
  if (app.busy || freeApiFlow || !app.state) return;
  let popup = null;
  if (!existingKey) {
    popup = window.open('', `engee-openrouter-${Date.now()}`, 'popup,width=560,height=760');
    if (!popup) { setStatus('free-api-status', 'Разрешите всплывающее окно для входа в OpenRouter и повторите попытку.', 'bad'); return; }
    popup.opener = null;
  }
  const flow = { controller: new AbortController(), id: null }; freeApiFlow = flow; app.controller = flow.controller; app.activeOperation = 'free-api'; const signal = flow.controller.signal; setBusy(true);
  setStatus('free-api-status', existingKey ? 'Проверяем бесплатную модель…' : 'Открываем вход в OpenRouter…'); $('run-status-text').textContent = existingKey ? 'Проверяем бесплатный API…' : 'Ожидаем вход в OpenRouter…';
  let settled = false;
  try {
    const started = await api(existingKey ? '/api/openrouter/check' : '/api/openrouter/auth/start', {}, { signal, timeout: 20000 });
    if (typeof started.id !== 'string' || !started.id) throw new Error('Сервер не вернул идентификатор подключения.'); flow.id = started.id;
    if (!existingKey) { const url = new URL(started.url); if (url.protocol !== 'https:' || url.hostname !== 'openrouter.ai' || url.pathname !== '/auth') throw new Error('Сервер вернул неверный адрес входа OpenRouter.'); popup.location.href = url.href; }
    const deadline = Date.now() + (existingKey ? 130000 : 720000);
    setStatus('free-api-status', started.message || (existingKey ? 'Проверяем ответ бесплатной модели…' : 'Войдите в OpenRouter в открывшемся окне. Затем приложение проверит бесплатную модель.'));
    while (!signal.aborted && Date.now() < deadline) {
      const result = await api(`/api/openrouter/auth/status?id=${encodeURIComponent(flow.id)}`, undefined, { signal, timeout: Math.min(20000, Math.max(1, deadline - Date.now())) });
      if (result.status === 'success') {
        if (result.provider !== 'openrouter' || String(result.answer).trim() !== '2' || !(result.model === 'openrouter/free' || /:free$/i.test(result.model || '')) || result.cost != null && Number(result.cost) !== 0) throw new Error('Сервер не подтвердил успешный ответ бесплатной модели.');
        settled = true; await refreshFreeApiState();
        if (app.state?.config.provider === 'openrouter') { storeCatalog('openrouter', app.state.config.baseUrl, [...(currentCatalog('openrouter', app.state.config.baseUrl) || []), result.model]); renderModelSuggestions(); }
        setStatus('free-api-status', result.message || 'Бесплатная модель ответила: 2', 'good'); return;
      }
      if (['error', 'cancelled', 'expired'].includes(result.status)) { settled = true; await refreshFreeApiState(); setStatus('free-api-status', result.message || (result.status === 'expired' ? 'Время входа истекло. Повторите подключение.' : result.status === 'cancelled' ? 'Подключение отменено.' : 'Бесплатный API недоступен. Повторите попытку или введите ключ вручную.'), result.status === 'cancelled' ? '' : 'bad'); return; }
      if (result.status !== 'pending') throw new Error('Сервер вернул неизвестный статус подключения.');
      if (result.message) setStatus('free-api-status', result.message);
      await waitFreeApi(Math.min(2000, Math.max(1, deadline - Date.now())), signal);
    }
    if (signal.aborted) throw new DOMException('Подключение отменено', 'AbortError'); throw new Error('Время проверки истекло. Повторите подключение.');
  } catch (error) { await refreshFreeApiState(); setStatus('free-api-status', error.name === 'AbortError' ? 'Подключение отменено.' : readableError(error), error.name === 'AbortError' ? '' : 'bad'); }
  finally {
    if (!settled && flow.id) { try { await api('/api/openrouter/auth/cancel', { id: flow.id }, { timeout: 5000 }); } catch { /* Local controls still recover if cancellation cannot reach the server. */ } }
    if (popup && !popup.closed) popup.close(); freeApiFlow = null; app.controller = null; app.activeOperation = null; setBusy(false);
  }
}
function providerFields(changed = false) {
  const provider = app.state?.providers?.find(item => item.id === $('provider').value); if (!provider) return;
  if (changed) { clearCredentialViews({ fields: ['apiKey'], discardDraft: true }); $('baseUrl').value = provider.baseUrl || ''; $('model').value = provider.defaultModel || ''; setStatus('probe-result', ''); $('api-key-hint').textContent = 'Новый ключ сохраняется только в локальных настройках приложения.'; }
  $('puter-connect').hidden = provider.id !== 'puter'; $('base-url-field').hidden = ['puter', 'claude'].includes(provider.id); $('api-key-field').hidden = ['puter', 'local', 'claude'].includes(provider.id) || provider.id === 'ollama' && isLocalApi($('baseUrl').value);
  $('provider-info').replaceChildren();
  if (provider.website && /^https?:\/\//i.test(provider.website)) { const link = document.createElement('a'); link.href = provider.website; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Сайт провайдера ↗'; $('provider-info').append(link); }
  const activeProfile = provider.id === app.state.config.provider ? app.state.connections?.find(item => item.id === app.state.config.connectionId) : null;
  setCredentialSaved('apiKey', Boolean(activeProfile?.hasApiKey ?? app.state.config.apiKeyStatus?.[provider.id] ?? (provider.id === app.state.config.provider && app.state.config.hasApiKey)));
  document.querySelector('[data-secret-field="apiKey"]').disabled = false;
  if (provider.id === 'puter') loadPuter().catch(error => setStatus('puter-status', readableError(error), 'bad'));
  renderModelControls();
  applyProfileLocks();
}
function activeSettingsProfile() { return $('provider').value === app.state?.config.provider ? app.state?.connections?.find(item => item.id === app.state.config.connectionId) : null; }
function applyProfileLocks() { const locked = Boolean(activeSettingsProfile()); $('model').readOnly = locked; $('baseUrl').readOnly = locked; $('apiKey').readOnly = locked; $('settings-ollama-model').disabled = app.busy || locked; $('settings-discover-models').disabled = app.busy || locked; if (locked) document.querySelector('[data-secret-field="apiKey"]').title = 'Изменить API-ключ в мастере этого подключения'; }
function isLocalApi(value) { try { return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(new URL(value).hostname); } catch { return false; } }
function setCredentialSaved(field, saved) {
  const input = $(field); input.dataset.secretSaved = saved ? 'true' : 'false';
  input.placeholder = saved ? '••••••••' : field === 'apiKey' ? 'Введите ключ' : field === 'engeeToken' ? 'Введите токен' : 'Введите пароль';
  const badge = $(`${field}-saved`); badge.hidden = false; badge.textContent = input.dataset.secretDirty === 'true' && input.value ? 'Введён' : saved ? 'Сохранён' : 'Не задан'; badge.classList.toggle('unset', !saved && !input.value);
  const button = document.querySelector(`[data-secret-field="${field}"]`); button.textContent = input.value ? input.type === 'text' ? 'Скрыть' : 'Показать' : saved ? 'Заменить' : 'Показать'; button.title = !input.value && saved ? 'Для замены введите новое значение' : 'Показать или скрыть введённое вами значение';
}
function clearCredentialViews({ fields = ['apiKey', 'engeeToken', 'engeePassword'], discardDraft = false } = {}) {
  credentialEpoch++;
  fields.forEach(field => { const input = $(field); if (discardDraft || input.dataset.secretDirty !== 'true') { input.value = ''; delete input.dataset.secretDirty; } input.type = 'password'; const button = document.querySelector(`[data-secret-field="${field}"]`); button.textContent = !input.value && input.dataset.secretSaved === 'true' ? 'Заменить' : 'Показать'; button.setAttribute('aria-expanded', 'false'); button.disabled = false; });
  if (fields.includes('engeePassword') && (discardDraft || $('engeeUsername').dataset.dirty !== 'true')) { $('engeeUsername').value = ''; delete $('engeeUsername').dataset.dirty; }
}
async function loadEngeeLogin() {
  const epoch = credentialEpoch;
  try { const result = await api('/api/config/login'); if (epoch !== credentialEpoch || $('view-settings').hidden) return; if ($('engeeUsername').dataset.dirty !== 'true') $('engeeUsername').value = typeof result.username === 'string' ? result.username : ''; setCredentialSaved('engeePassword', Boolean(result.passwordStored)); if (result.username || result.passwordStored) document.querySelector('.engee-login').open = true; setStatus('engee-login-state', ''); }
  catch { if (epoch === credentialEpoch && !$('view-settings').hidden) setStatus('engee-login-state', 'Не удалось загрузить сохранённый вход. Обновите настройки.', 'bad'); }
}
async function toggleCredential(field, button) {
  const input = $(field);
  if (field === 'apiKey' && input.readOnly && activeSettingsProfile()) { window.EngeeConnections?.open(activeSettingsProfile()); return; }
  if (input.type === 'text') { input.type = 'password'; button.textContent = 'Показать'; button.setAttribute('aria-expanded', 'false'); return; }
  if (input.value) { input.type = 'text'; button.textContent = 'Скрыть'; button.setAttribute('aria-expanded', 'true'); return; }
  input.focus();
}
function sizeLabel(bytes) { if (!Number.isFinite(Number(bytes)) || !Number(bytes)) return ''; return Number(bytes) >= 1024 ** 3 ? `${(Number(bytes) / 1024 ** 3).toFixed(2)} ГБ` : `${(Number(bytes) / 1024 ** 2).toFixed(0)} МБ`; }
function renderModels() {
  $('local-models').replaceChildren(); const models = app.state?.models || [];
  if (!models.length) { const note = document.createElement('p'); note.className = 'empty-note'; note.textContent = 'Модели не найдены. Поместите GGUF-файл в указанную папку и обновите список.'; $('local-models').append(note); }
  models.forEach(model => {
    const item = document.createElement('div'); item.className = 'model-item'; const description = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = model.name || model.path;
    const size = document.createElement('small'); size.textContent = sizeLabel(model.size) || 'Локальная модель'; description.append(name, size);
    const active = Boolean(app.state?.local?.running && app.state.local.modelPath === model.path);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary'; button.textContent = active ? 'Использовать' : 'Запустить'; button.title = active ? 'Выбрать уже работающую модель в диалоге' : 'Запустить эту GGUF и выбрать её в диалоге'; button.addEventListener('click', () => startModel(model, button));
    item.append(description, button); $('local-models').append(item);
  });
}
function renderSkills() {
  $('skill-list').replaceChildren(); const skills = app.state?.skills || [];
  if (!skills.length) { const note = document.createElement('p'); note.className = 'empty-note'; note.textContent = 'Добавьте первый навык.'; $('skill-list').append(note); }
  skills.forEach(skill => {
    const button = document.createElement('button'); button.className = 'skill-item'; button.type = 'button'; button.textContent = skill.title || skill.name;
    const small = document.createElement('small'); small.textContent = skill.name; button.append(small);
    button.addEventListener('click', async () => { try { clearError(); const result = await api(`/api/skills/${encodeURIComponent(skill.name)}`); $('skill-title').textContent = skill.title || skill.name; $('skill-text').textContent = result.content || ''; document.querySelectorAll('.skill-item').forEach(item => item.classList.toggle('active', item === button)); } catch (error) { showError(error); } });
    $('skill-list').append(button);
  });
}
function renderCatalog() {
  $('provider-catalog').replaceChildren();
  const providers = (app.state?.providers || []).filter(item => providerGroup(item) === 'free');
  if (!providers.length) { const note = document.createElement('p'); note.className = 'empty-note'; note.textContent = 'Бесплатный API появится здесь после проверки доступности.'; $('provider-catalog').append(note); }
  providers.forEach(provider => {
    const item = document.createElement('div'); item.className = 'catalog-item'; const strong = document.createElement('strong'); strong.textContent = provider.label;
    const small = document.createElement('small'); small.textContent = provider.note || 'Условия бесплатного доступа — в инструкции'; item.append(strong, small);
    if (provider.website && /^https?:\/\//i.test(provider.website)) { const link = document.createElement('a'); link.href = provider.website; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Открыть сайт ↗'; item.append(link); }
    $('provider-catalog').append(item);
  });
}
async function refreshState(fillForm = true, preserveDrafts = false) {
  return applyState(await api('/api/state'), fillForm, preserveDrafts);
}
async function applyState(state, fillForm = true, preserveDrafts = false) {
  const previousProvider = app.state?.config?.provider, previousConnection = app.state?.config?.connectionId; app.state = state; const config = state.config || {};
  renderJuliaPath();
  renderProgramPathControls();
  renderExecutionTarget();
  if (!preserveDrafts && previousProvider && (previousProvider !== config.provider || previousConnection !== config.connectionId)) clearCredentialViews({ fields: ['apiKey'], discardDraft: true });
  const fingerprint = configurationFingerprint(config); if (app.fingerprint && app.fingerprint !== fingerprint) { app.history = app.history.map(({ reasoning_details, reasoning_content, response_items, reasoning_items, ...message }) => message); app.fingerprint = fingerprint; saveConversation(); }
  const notices = state.startupNotices || state.notices || [];
  $('startup-notices').textContent = (Array.isArray(notices) ? notices : [notices]).map(item => typeof item === 'string' ? item : item?.message || '').filter(Boolean).join('\n'); $('startup-notices').hidden = !$('startup-notices').textContent;
  if (state.engee?.serverStatus !== undefined) updateEngeeStatus(state.engee);
  $('server-status').classList.remove('offline'); $('server-status').lastChild.textContent = ' Сервер работает';
  paintHealth('server-status', 'good', 'Приложение: сервер доступен'); renderLlmHealth();
  const provider = state.providers?.find(item => item.id === config.provider);
  $('sidebar-provider').textContent = activeConnection()?.name || providerDisplayName(provider) || config.provider || 'Выберите провайдера'; $('sidebar-model').textContent = selectedModelLabel();
  $('chat-model').textContent = `${activeConnection()?.name || provider?.label || config.provider || 'Модель'} · ${selectedModelLabel()}`;
  $('chat-workspace').textContent = config.workspace || 'Подключить папку';
  $('local-state').hidden = config.provider !== 'local' || !state.local;
  if (state.local) $('local-state').textContent = state.local.running ? `GGUF работает · ${state.local.model || 'локальная модель'}` : state.local.starting ? 'GGUF запускается…' : config.model ? 'GGUF · запуск при первом сообщении' : 'Выберите GGUF-модель';
  renderProviderSelect('chat-provider', true);
  $('chat-model-input').value = config.model || ''; renderModelSuggestions();
  $('quick-puter').hidden = config.provider !== 'puter' || (app.sdkReady && window.puter.auth.isSignedIn());
  $('workspace-caption').textContent = config.workspace ? `Рабочая папка: ${config.workspace}` : 'Выберите рабочую папку в подключениях.';
  if (fillForm) {
    renderProviderSelect('provider');
    ['provider', 'baseUrl', 'model', 'modelsDir', 'workspace', 'engeeAccountUrl', 'engeeRuntimeUrl'].forEach(name => { $(name).value = config[name] || ''; });
    clearCredentialViews(); $('clearEngeeLogin').checked = false;
    setCredentialSaved('engeeToken', Boolean(config.hasEngeeToken)); setCredentialSaved('engeePassword', Boolean(config.hasEngeeLogin));
    $('api-key-hint').textContent = config.hasApiKey ? 'Ключ сохранён. Оставьте поле пустым, чтобы использовать его.' : 'Ключ сохраняется только в локальных настройках приложения.';
    $('engee-token-hint').textContent = config.hasEngeeToken ? 'Токен сохранён. Оставьте поле пустым, чтобы использовать его.' : 'Токен хранится в локальных настройках.';
    $('engee-login-hint').textContent = config.hasEngeeLogin ? 'Вход сохранён. Пустые поля сохранят текущий логин и пароль.' : 'Оставьте поля пустыми, если используете только токен.';
    providerFields();
    if (!$('view-settings').hidden) await loadEngeeLogin();
  }
  try { await refreshToolDefinitions(); } catch { app.toolDefinitions = []; }
  $('data-info-button').disabled = false; renderModels(); renderSkills(); renderCatalog(); renderFreeApiControls(); if ($('project-files-dialog').open) loadFiles(app.filePath).catch(showError); window.dispatchEvent(new CustomEvent('engee-state', { detail: state })); return state;
}
async function safeStatusRefresh(signal) {
  try {
    const state = await api('/api/state', undefined, { signal, timeout: 5000 }); if (!app.state) return;
      app.state.config = state.config || app.state.config; app.state.local = state.local; app.state.executionTargets = state.executionTargets; renderExecutionTarget(); const config = app.state.config, provider = app.state.providers?.find(item => item.id === config.provider);
    paintHealth('server-status', 'good', 'Приложение: сервер доступен'); renderLlmHealth();
    $('sidebar-provider').textContent = activeConnection()?.name || providerDisplayName(provider) || config.provider; $('sidebar-model').textContent = selectedModelLabel(); $('chat-model').textContent = `${activeConnection()?.name || provider?.label || config.provider} · ${selectedModelLabel()}`;
    $('local-state').hidden = config.provider !== 'local' || !state.local; if (state.local) $('local-state').textContent = state.local.running ? `GGUF работает · ${state.local.model || config.model || 'локальная модель'}` : state.local.starting ? 'GGUF запускается…' : config.model ? 'GGUF · запуск при первом сообщении' : 'Выберите GGUF-модель';
    renderProviderSelect('chat-provider', true); $('chat-model-input').value = config.model || ''; renderChatModelButton(); const catalog = usesModelCatalog(config.provider); $('chat-ollama-model').hidden = !catalog; $('chat-model-input').hidden = catalog; $('chat-ollama-notice').hidden = !catalog;
    if (catalog) { const ids = fillOllamaSelect('chat-ollama-model', config.baseUrl, config.model, config.provider); catalogNotice('chat-ollama', config.provider, config.baseUrl, config.model, ids); }
    if (app.busy && app.activeOperation === 'model' && config.provider === 'local' && !state.local?.running) $('run-status-text').textContent = state.local?.starting ? 'Локальная модель запускается…' : 'Ожидаем локальную модель…';
    renderFreeApiControls();
  } catch { /* A failed status refresh must not hide the completed model response. */ }
}
async function refreshAllConnections() {
  if (app.busy || app.refreshing || !app.state) return;
  app.refreshing = true; $('refresh-state').disabled = true; clearError();
  const config = { ...app.state.config }, fingerprint = configurationFingerprint(config); const profile = activeConnection();
  paintHealth('server-status', 'pending', 'Приложение: проверка состояния'); paintHealth('llm-health', 'pending', 'Нейросеть: проверка состояния'); paintHealth('engee-health', 'pending', 'Engee: проверка состояния');
  try {
    const catalogQuery = config.connectionId ? { connectionId: config.connectionId } : { provider: config.provider, baseUrl: config.baseUrl };
    const needsCatalog = !['local', 'claude', 'puter'].includes(config.provider) && profile?.settings?.format !== 'custom-json';
    const results = await Promise.allSettled([
      api('/api/state', undefined, { timeout: 15000 }),
      needsCatalog ? api('/api/models/discover', catalogQuery, { timeout: 15000 }) : Promise.resolve(null),
      api('/api/llm/status', undefined, { timeout: 20000 }),
      discoverIntegrations(),
      api('/api/tool', { name: 'engee_status', arguments: {} }, { timeout: 60000 }),
      window.EngeeTerminal?.refresh ? window.EngeeTerminal.refresh() : Promise.resolve()
    ]);
    const [state, catalog, llm, , engee] = results;
    if (state.status === 'fulfilled') {
      if (configurationFingerprint(app.state.config) === fingerprint && configurationFingerprint(state.value.config || {}) === fingerprint) await applyState(state.value, false, true);
      paintHealth('server-status', 'good', 'Приложение: сервер доступен');
    } else paintHealth('server-status', 'bad', `Приложение: ${readableError(state.reason)}`);
    if (configurationFingerprint(app.state.config) === fingerprint) {
      if (catalog.status === 'fulfilled' && catalog.value) { storeCatalog(config.provider, config.baseUrl, discoveredIds(catalog.value)); renderModelSuggestions(); }
      if (llm.status === 'fulfilled') {
        const value = llm.value, same = value.provider === config.provider && String(value.connectionId || '') === String(config.connectionId || '') && String(value.model || '') === String(config.model || '');
        if (same) { const color = value.state === 'ready' ? 'good' : ['missing', 'unavailable'].includes(value.state) ? 'bad' : 'pending'; setLlmHealth(color, `Нейросеть: ${value.message || value.state}${value.generationVerified === true ? '' : ' · Ответ модели не проверялся'}`, fingerprint); }
        else { app.llmHealth = null; renderLlmHealth(); }
      } else setLlmHealth('bad', `Нейросеть: ${readableError(llm.reason)}`, fingerprint);
    } else renderLlmHealth();
    if (engee.status === 'fulfilled') updateEngeeStatus(engee.value.result ?? engee.value); else paintHealth('engee-health', 'bad', `Engee: ${readableError(engee.reason)}`);
  } catch (error) { showError(error); }
  finally { app.refreshing = false; $('refresh-state').disabled = app.busy; }
}
function formConfig() {
  const config = {}; ['provider', 'baseUrl', 'model', 'modelsDir', 'workspace', 'engeeAccountUrl', 'engeeRuntimeUrl'].forEach(name => { config[name] = $(name).value.trim(); });
  if ($('apiKey').value.trim()) config.apiKey = $('apiKey').value.trim(); if ($('engeeToken').value.trim()) config.engeeToken = $('engeeToken').value.trim();
  if ($('engeeUsername').value.trim()) config.engeeUsername = $('engeeUsername').value.trim(); if ($('engeePassword').value) config.engeePassword = $('engeePassword').value;
  if ($('clearEngeeLogin').checked) config.clearEngeeLogin = true; if (activeSettingsProfile()) config.connectionId = app.state.config.connectionId; return config;
}
async function saveSettings() { const config = formConfig(); if (config.workspace !== app.state?.config?.workspace && window.EngeePersistence && !await window.EngeePersistence.guardFile()) throw new Error('Смена проекта отменена.'); await api('/api/config', window.EngeePersistence?.decorateConfig(config) || config); delete $('engeeUsername').dataset.dirty; clearCredentialViews({ discardDraft: true }); await refreshState(); window.EngeePersistence?.settingsSaved(); setStatus('save-result', 'Сохранено'); }
async function startModel(model, button) {
  if (app.busy) { toast('Сначала завершите текущий запрос.'); return; }
  button.disabled = true; setStatus('local-result', 'Запускаем локальную модель…');
  try { await api('/api/config', { modelsDir: $('modelsDir').value.trim() }); const result = await api('/api/local/start', { modelPath: model.path }, { timeout: 180000 }); await refreshState(); setStatus('local-result', result.message || 'Локальная модель запущена. Можно отправить сообщение.', 'good'); toast('Локальная модель готова'); }
  catch (error) { setStatus('local-result', readableError(error), 'bad'); } finally { button.disabled = false; }
}
function normalizeMessage(response) {
  const source = response?.choices?.[0]?.message || response?.message || (typeof response === 'string' ? { content: response } : response);
  if (!source || (source.content === undefined && !source.tool_calls)) throw new Error('Модель вернула ответ без сообщения. Проверьте название модели и адрес API.');
  const text = contentText(source.content); if (!text.trim() && !source.tool_calls?.length) throw new Error('Модель вернула пустой ответ. Повторите запрос или выберите другую модель.');
  const message = { role: 'assistant', content: text || null };
  if (source.tool_calls?.length) message.tool_calls = source.tool_calls.map((call, index) => ({ id: call.id || `call_${Date.now()}_${index}`, type: 'function', function: { name: call.function?.name || call.name, arguments: typeof call.function?.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function?.arguments || call.input || {}) } }));
  if (source.reasoning_details) message.reasoning_details = source.reasoning_details; if (typeof source.reasoning_content === 'string') message.reasoning_content = source.reasoning_content; if (Array.isArray(source.response_items)) message.response_items = source.response_items; return message;
}
function dialogChoice(dialog, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Запрос остановлен', 'AbortError')); return; }
    const clean = () => { dialog.removeEventListener('close', closed); signal?.removeEventListener('abort', aborted); };
    const closed = () => { clean(); resolve(dialog.returnValue === 'allow'); };
    const aborted = () => { clean(); dialog.close('deny'); reject(new DOMException('Запрос остановлен', 'AbortError')); };
    dialog.addEventListener('close', closed, { once: true }); signal?.addEventListener('abort', aborted, { once: true }); dialog.returnValue = 'deny'; dialog.showModal();
  });
}
function systemMessage() {
  const manualOnly = app.state?.config?.provider === 'claude';
  const fallback = 'В этой сессии Claude нет доступа к функциям выполнения кода приложения. Не запускай код через CLI. Предложи код в блоке ```julia\n<код>\n```; пользователь нажмёт «Выполнить» и подтвердит запуск в выбранной среде. До получения фактического результата не утверждай, что код выполнен или проверен.';
  const instruction = app.executionTarget === 'julia' ? `Среда выполнения кода в чате: локальная Julia. ${canUseJulia() ? `Установлена Julia ${executionCapability().version || '(версия не получена)'}. ${manualOnly ? fallback : 'Для выполнения используй только julia_eval_code с обязательным подтверждением пользователя.'}` : 'Julia недоступна: не утверждай, что код выполнен.'} Функции/API Engee не доступны в локальной Julia; итоговую проверку моделей Engee выполняют в Engee.` : `Среда выполнения кода в чате: Engee. Локальная Julia не выбрана: её инструмент недоступен. Не меняй режим сам; при необходимости попроси пользователя выбрать «Код в чате». ${manualOnly ? fallback : 'Используй реальные инструменты Engee.'}`;
  return { role: 'system', content: `${app.state?.systemPrompt || 'Ты инженерный помощник Engee. Используй реальные результаты инструментов и файлы проекта.'}\n\n${instruction}` };
}
function selectDataInfoTab(name, focus = false) {
  const selected = name === 'commands' ? 'commands' : 'context';
  document.querySelectorAll('[data-info-tab]').forEach(button => {
    const active = button.dataset.infoTab === selected;
    button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    $(`data-panel-${button.dataset.infoTab}`).hidden = !active;
  });
  if (focus) $(`data-tab-${selected}`).focus();
}
function renderDataInfoCommands() {
  $('data-command-list').replaceChildren();
  SLASH_COMMANDS.forEach(([command, description]) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'data-command'; button.dataset.command = command; button.disabled = app.busy;
    const label = document.createElement('strong'); label.textContent = command;
    const detail = document.createElement('span'); detail.textContent = description;
    button.append(label, detail);
    button.addEventListener('click', () => {
      if (app.busy) return;
      $('prompt').value = command === '/eval' ? `${command} ` : command;
      $('slash-menu').hidden = true; $('data-info-dialog').close('close'); $('prompt').focus();
    });
    $('data-command-list').append(button);
  });
}
function showDataInfo() {
  if (!app.state) return;
  const config = app.state.config; const prompt = $('prompt').value.trim();
  const messages = app.activeMessages ? [...app.activeMessages] : [systemMessage(), ...app.history];
  if (!app.activeMessages && (prompt || app.attachments.length)) messages.push({ role: 'user', content: buildUserContent(prompt || 'Изучи приложенные материалы и кратко опиши их.', app.attachments) });
  const tools = config.provider === 'claude' ? [] : app.toolDefinitions || [];
  const provider = app.state.providers?.find(item => item.id === config.provider);
  const destination = config.provider === 'puter' ? 'https://api.puter.com — Puter и поставщик выбранной модели' : config.provider === 'claude' ? 'Claude Code → сервис Anthropic, через вход в установленном CLI' : config.provider === 'ollama' && /:cloud$/i.test(config.model || '') ? `Ollama Cloud (https://ollama.com), через локальный сервер ${config.baseUrl}` : config.baseUrl;
  const command = /^\/(help|status|eval|files|skills|clear|new|models)(?:\s|$)/.exec(prompt);
  $('data-destination').textContent = command ? `Команда ${command[0].trim()}\nПолучатель: ${command[1] === 'eval' ? executionLabel() : command[1] === 'status' ? 'среда Engee' : 'локальный интерфейс'}` : `${activeConnection()?.name || provider?.label || config.provider} · ${selectedModelLabel()}\nПолучатель: ${destination || 'локальный процесс'}\nКод в чате: ${executionLabel()}`;
  // The panel uses only browser-visible messages and schemas already fetched for the workspace.
  // It does not read saved secrets, fetch context, start a model request or consume the draft.
  $('data-payload').textContent = JSON.stringify(command ? { command: prompt, executionTarget: app.executionTarget, attachmentsSent: false } : { messages, executionTarget: app.executionTarget, ...(tools.length ? { tools } : {}), ...(config.provider === 'claude' ? { ClaudeProjectFiles: [] } : {}) }, (key, value) => key === 'encrypted_content' ? '[зашифрованное состояние OpenAI]' : value, 2);
  selectDataInfoTab('context'); renderDataInfoCommands();
  $('data-info-dialog').querySelector('details').open = false; $('data-info-dialog').showModal();
}
async function completion(messages, tools, signal) {
  if (messages.length > 100) { let start = messages.length - 95; while (start < messages.length && messages[start].role !== 'user') start++; if (start === messages.length) throw new Error('Текущий запрос превысил размер контекста. Начните новый запрос после завершения инструментов. История сохранена локально.'); messages = [messages[0], ...messages.slice(start)]; }
  const config = app.state.config;
  if (config.provider === 'puter') {
    const puter = await loadPuter();
    if (!puter.auth.isSignedIn()) throw new Error('Сначала подключите Puter: откройте «Подключения» и нажмите «Начать с Puter».');
    if (signal?.aborted) throw new DOMException('Запрос остановлен', 'AbortError');
    return normalizeMessage(await withTimeout(puter.ai.chat(messages, { model: config.model, normalize: true, stream: false, ...(tools.length ? { tools, parallelToolCalls: false } : {}) }), signal));
  }
  let context;
  if (config.provider === 'claude') {
    // The snapshot is explicitly empty. Only files the user attached to messages are sent.
    context = await api('/api/claude/context', { paths: [], executionTarget: app.executionTarget, ...(app.claudeSession?.sessionId ? { sessionId: app.claudeSession.sessionId } : {}) }, { signal });
    if (!context.contextId || (context.files && context.files.length)) throw new Error('Claude получил непустой контекст проекта без выбора файлов. Отправка заблокирована. Добавьте нужные файлы к сообщению явно.');
    if (context.sessionId) updateClaudeSession({ sessionId: context.sessionId });
  }
  const response = await api('/api/completion', { messages, executionTarget: app.executionTarget, ...(tools.length && config.provider !== 'claude' ? { tools } : {}), ...(context ? { contextId: context.contextId, contextApproved: true, sessionId: context.sessionId || app.claudeSession?.sessionId } : {}) }, { signal, timeout: config.provider === 'claude' ? 600000 : 180000 });
  if (response.claude) updateClaudeSession(response.claude);
  if (response.sessionId) { updateClaudeSession({ sessionId: response.sessionId }); saveConversation(); }
  return normalizeMessage(response);
}
async function executeTool(call, signal, target = app.executionTarget) {
  app.lastToolMs = undefined;
  const name = call.function.name;
  if (!app.tools.some(tool => tool.function?.name === name)) return { error: `Неизвестный инструмент: ${name}` };
  let args; try { args = JSON.parse(call.function.arguments || '{}'); } catch { return { error: 'Аргументы инструмента должны быть корректным JSON.' }; }
  const timedRequest = async (path, body) => { const started = performance.now(); try { return await api(path, body, { signal, timeout: 180000 }); } finally { app.lastToolMs = performance.now() - started; } };
  let response = await timedRequest('/api/tool', { name, arguments: args, executionTarget: target });
  let label = 'Выполнено';
  if (response.pending) {
    const pending = typeof response.pending === 'object' ? response.pending : response; const id = pending.id || response.id;
    if (!id) throw new Error('Сервер не вернул идентификатор подтверждения. Действие не выполнено.');
    $('confirmation-name').textContent = pending.name || name;
    const isEvalCode = ['engee_eval_code', 'julia_eval_code'].includes(name), exactArgs = pending.arguments || args;
    const context = isEvalCode ? [['Среда', executionLabel(target)], ['Папка', pending.cwd || exactArgs.cwd], ['Версия', pending.version || exactArgs.version], ['Программа', pending.executable || exactArgs.executable]].filter(([,value]) => value).map(([key,value]) => `${key}: ${value}`).join('\n') : '';
    $('confirmation-description').textContent = [pending.description || pending.message || 'Помощник предлагает изменить файлы или выполнить код.', context].filter(Boolean).join('\n');
    $('confirmation-arguments').textContent = isEvalCode ? String(exactArgs.code ?? args.code ?? '') : JSON.stringify(exactArgs, null, 2); $('run-status-text').textContent = 'Ожидаем вашего подтверждения…';
    const allow = await dialogChoice($('confirmation'), signal); response = await timedRequest('/api/confirm', { id, allow }); label = allow ? 'Подтверждено' : 'Отклонено';
  }
  const result = response.result ?? response;
  if (result?.error || result?.ok === false) label = 'Ошибка';
  else if (result?.declined || result?.denied || result?.cancelled) label = 'Отклонено';
  const visibleResult = visibleToolResult(name, result);
  addEvent({ role: 'tool', name, label, content: name === 'julia_eval_code' ? juliaResultText(result).slice(0, 20000) : JSON.stringify(visibleResult, null, 2).slice(0, 20000) });
  if (name === 'julia_eval_code' && app.activeOperation === 'model') addEvent({ role: result?.error || result?.ok === false || result?.timedOut ? 'error' : 'assistant', content: juliaResultText(result), origin: 'julia', version: result?.version || executionCapability()?.version, responseMs: Number.isFinite(result?.durationMs) ? result.durationMs : app.lastToolMs });
  return result;
}
function setBusy(busy) {
  app.busy = busy; $('send-chat').hidden = busy; $('stop-chat').hidden = !busy; $('run-status').hidden = !busy;
  ['prompt', 'save-settings', 'probe', 'engee-probe', 'scan-models', 'refresh-state', 'chat-provider', 'chat-model-input', 'chat-ollama-model', 'settings-ollama-model', 'settings-discover-models', 'attach-file', 'connect-workspace', 'new-file', 'edit-file', 'save-file', 'run-file', 'upload-to-engee', 'bind-token-button', 'load-config-editor', 'save-config-editor', 'engee-start', 'engee-stop', 'engee-load-options', 'engee-version', 'engee-timeout'].forEach(id => { $(id).disabled = busy; }); document.querySelectorAll('[data-prompt]').forEach(button => { button.disabled = busy; });
  if (busy) $('slash-menu').hidden = true;
  $('engee-timeout').disabled = busy || app.engeeTimeoutAvailable === false;
  $('save-config-editor').disabled = busy || $('config-editor').disabled;
  $('engee-start').disabled = busy || app.engeeStartAvailable === false;
  applyProfileLocks();
  renderJuliaControls();
  renderProgramPathControls();
  renderExecutionTarget();
  renderChatModelButton();
  document.querySelectorAll('.data-command').forEach(button => { button.disabled = busy; });
  $('refresh-state').disabled = busy || Boolean(app.refreshing);
  renderFreeApiControls();
}
async function sendMessage() {
  let prompt = $('prompt').value.trim(); if ((!prompt && !app.attachments.length) || app.busy || app.uploading) return;
  if (/^\/eval(?:\s+|$)/.test(prompt)) { await evaluateInEngee(prompt); return; }
  if (prompt.startsWith('/') && /^\/[a-z]+\s*$/.test(prompt)) { await runSlash(prompt.trim()); return; }
  if (!app.state) { showError('Сервер ещё не подключён. Нажмите обновить.'); return; }
  if (app.executionTarget === 'julia' && !canUseJulia()) { showError(executionCapability()?.message || 'Локальная Julia недоступна. Выберите Engee или проверьте «Параметры → Компоненты».'); return; }
  if (usesModelCatalog(app.state.config.provider) && !currentCatalog(app.state.config.provider, app.state.config.baseUrl)?.includes(app.state.config.model)) { toast(app.state.config.provider === 'ollama' ? 'Обновите список Ollama и выберите установленную модель.' : 'Обновите список бесплатного API и выберите доступную модель.'); $('chat-ollama-model').focus(); return; }
  if (!app.state.config.model && !serverChoosesModel()) { view('settings'); $('parameters-models').open = true; toast('Укажите модель и сохраните настройки.'); return; }
  clearError(); const fingerprint = configurationFingerprint(app.state.config);
  if (app.fingerprint !== fingerprint) app.history = app.history.map(({ reasoning_details, reasoning_content, response_items, reasoning_items, ...message }) => message);
  const attachments = app.attachments.slice(); prompt = prompt || 'Изучи приложенные материалы и кратко опиши их.';
  const userContent = buildUserContent(prompt, attachments);
  app.fingerprint = fingerprint; app.history.push({ role: 'user', content: userContent }); addEvent({ role: 'user', content: prompt, attachments: attachments.map(item => ({ name: item.name, mime: item.mime, size: item.size, image: attachmentImage(item) })) }); app.attachments = []; renderAttachments(); $('prompt').value = ''; setBusy(true);
  app.activeOperation = 'model'; app.controller = new AbortController(); const signal = app.controller.signal;
  let statusRefreshBusy = false; const statusTimer = app.state.config.provider === 'local' ? setInterval(async () => { if (statusRefreshBusy || signal.aborted) return; statusRefreshBusy = true; try { await safeStatusRefresh(signal); } finally { statusRefreshBusy = false; } }, 1500) : null;
  const working = [systemMessage(), ...app.history]; app.activeMessages = working;
  try {
    $('run-status-text').textContent = 'Модель думает…'; app.tools = app.state.config.provider === 'claude' ? [] : await refreshToolDefinitions(signal); if (app.state.config.provider !== 'claude') app.toolDefinitions = app.tools;
    let finished = false;
    for (let step = 0; step < 8; step++) {
      if (signal.aborted) throw new DOMException('Запрос остановлен', 'AbortError');
      $('run-status-text').textContent = step ? `Модель продолжает работу · шаг ${step + 1} из 8` : 'Модель думает…';
      const requestStarted = performance.now(); const message = await completion(working, app.tools, signal); const responseMs = performance.now() - requestStarted; if (signal.aborted) throw new DOMException('Запрос остановлен', 'AbortError'); await safeStatusRefresh(signal); setLlmHealth('good', `Нейросеть: ${selectedModelLabel()} · получен ответ модели`); working.push(message);
      if (message.content) addEvent({ role: 'assistant', content: message.content, responseMs, origin: 'model', provider: app.state.config.provider, providerLabel: activeConnection()?.name || providerDisplayName(app.state.providers?.find(item => item.id === app.state.config.provider)), model: app.state.config.model });
      if (!message.tool_calls?.length) { finished = true; break; }
      let juliaDeclined = false;
      for (const call of message.tool_calls) {
        if (juliaDeclined) { const notRun = { declined: true, notRun: true, message: 'Предыдущее выполнение Julia отклонено. Остальные действия этого сообщения не выполнялись.' }; working.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(notRun) }); addEvent({ role: 'tool', name: call.function.name, label: 'Не выполнено', content: notRun.message }); continue; }
        $('run-status-text').textContent = `Работа с проектом · ${call.function.name}`; let result;
        try { result = await executeTool(call, signal); } catch (error) { if (signal.aborted) throw error; result = { error: readableError(error) }; addEvent({ role: 'tool', name: call.function.name, label: 'Ошибка', content: readableError(error) }); }
        working.push({ role: 'tool', tool_call_id: call.id, content: typeof result === 'string' ? result : JSON.stringify(result) });
        if (call.function.name === 'julia_eval_code' && (result?.declined || result?.denied || result?.cancelled)) juliaDeclined = true;
      }
      if (juliaDeclined) { finished = true; break; }
    }
    app.history = working.slice(1); if (!finished) addEvent({ role: 'error', content: 'Достигнут предел 8 шагов. Проверьте результаты выше и отправьте сообщение для продолжения.' }); saveConversation();
  } catch (error) {
    // Preserve completed actions, and close any interrupted tool batch for valid replay.
    const answered = new Set(working.filter(item => item.role === 'tool').map(item => item.tool_call_id));
    working.filter(item => item.role === 'assistant').forEach(item => item.tool_calls?.forEach(call => { if (!answered.has(call.id)) working.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Запрос прерван. Действие не было завершено; перед повтором проверь состояние проекта.' }) }); }));
    app.history = working.slice(1); addEvent({ role: 'error', content: readableError(error) });
  }
  finally { clearInterval(statusTimer); await safeStatusRefresh(); app.controller = null; app.activeOperation = null; app.activeMessages = null; setBusy(false); $('prompt').focus(); }
}
async function loadFiles(path = '') {
  if (path !== app.filePath && window.EngeePersistence && !await window.EngeePersistence.guardFile()) return;
  clearError(); const response = await api(`/api/files?path=${encodeURIComponent(path)}`); app.filePath = path; $('file-path').value = path; $('file-list').replaceChildren(); const files = response.files || [];
  if (!files.length) { const note = document.createElement('p'); note.className = 'empty-note'; note.textContent = 'В этой папке пока нет файлов.'; $('file-list').append(note); }
  files.forEach(file => {
    const directory = file.isDirectory || file.type === 'directory' || file.type === 'dir'; const pathToFile = file.path || [path.replace(/[\\/]$/, ''), file.name].filter(Boolean).join('/');
    const button = document.createElement('button'); button.className = 'file-item'; button.type = 'button'; const icon = document.createElement('span'); icon.textContent = directory ? '▱' : '▤'; button.append(icon, document.createTextNode(file.name || pathToFile));
    button.addEventListener('click', async () => {
      try {
        if (directory) await loadFiles(pathToFile);
        else {
          if (app.busy || window.EngeePersistence && !await window.EngeePersistence.guardFile()) return;
          const selection = (app.fileSelectionEpoch || 0) + 1; app.fileSelectionEpoch = selection;
          app.selectedFile = { path: pathToFile, content: null }; $('file-name').textContent = file.name || pathToFile; $('upload-to-engee').hidden = false; $('file-to-chat').hidden = true; $('edit-file').hidden = true; $('save-file').hidden = true; $('run-file').hidden = true; $('file-editor').hidden = true; $('file-content').hidden = false; $('file-content').textContent = 'Читаем файл…';
          try { const result = await api(`/api/file?path=${encodeURIComponent(pathToFile)}`); if (app.fileSelectionEpoch !== selection) return; showSelectedFile(pathToFile, result.content || '', result); }
          catch (error) { if (app.fileSelectionEpoch !== selection) return; $('file-content').textContent = `${readableError(error)}\n\nВыбранный файл можно передать в Engee кнопкой выше.`; }
          document.querySelectorAll('.file-item').forEach(item => item.classList.toggle('active', item === button));
        }
      } catch (error) { showError(error); }
    }); $('file-list').append(button);
  });
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => view(button.dataset.view)));
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => view(button.dataset.open)));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => { $('prompt').value = button.dataset.prompt; $('prompt').focus(); }));
window.addEventListener('hashchange', () => view(location.hash.slice(1)));
$('chat-form').addEventListener('submit', event => { event.preventDefault(); sendMessage(); });
$('data-info-button').addEventListener('click', showDataInfo);
document.querySelectorAll('[data-info-tab]').forEach(button => {
  button.addEventListener('click', () => selectDataInfoTab(button.dataset.infoTab));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'context' : event.key === 'End' ? 'commands' : button.dataset.infoTab === 'context' ? 'commands' : 'context';
    selectDataInfoTab(next, true);
  });
});
$('execution-mode-button').addEventListener('click', () => { if (app.busy) return; const opening = $('execution-menu').hidden; $('execution-menu').hidden = !opening; $('execution-mode-button').setAttribute('aria-expanded', String(opening)); if (opening) document.querySelector(`[name=executionTarget][value=${app.executionTarget}]`)?.focus(); });
document.querySelectorAll('[name=executionTarget]').forEach(input => input.addEventListener('change', () => chooseExecutionTarget(input.value)));
document.addEventListener('pointerdown', event => { if (!$('execution-menu').hidden && !$('execution-picker').contains(event.target)) closeExecutionMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('execution-menu').hidden) { closeExecutionMenu(true); event.preventDefault(); } });
$('prompt').addEventListener('keydown', event => {
  if (event.isComposing) return;
  const menuItems = [...$('slash-menu').querySelectorAll('.slash-command')];
  if (!$('slash-menu').hidden && menuItems.length) {
    if (event.key === 'Escape') { $('slash-menu').hidden = true; event.preventDefault(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); app.slashSelection = (app.slashSelection + (event.key === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length; menuItems.forEach((item, index) => item.classList.toggle('selected', index === app.slashSelection)); return; }
    if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') { event.preventDefault(); runSlash(menuItems[app.slashSelection].dataset.command); return; }
  }
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
});
$('prompt').addEventListener('input', () => { const value = $('prompt').value; if (/^\/[a-z]*$/.test(value)) { app.slashSelection = 0; renderSlash(value); } else $('slash-menu').hidden = true; });
$('stop-chat').addEventListener('click', () => { app.controller?.abort(); if (app.activeOperation === 'model' && app.state?.config.provider === 'claude') api('/api/claude/stop', {}).catch(() => {}); });
$('provider').addEventListener('change', () => providerFields(true));
document.querySelectorAll('[data-secret-field]').forEach(button => button.addEventListener('click', () => toggleCredential(button.dataset.secretField, button)));
['apiKey', 'engeeToken', 'engeePassword'].forEach(field => $(field).addEventListener('input', () => { $(field).dataset.secretDirty = 'true'; setCredentialSaved(field, $(field).dataset.secretSaved === 'true'); if (field === 'apiKey') document.querySelector('[data-secret-field="apiKey"]').disabled = false; }));
$('engeeUsername').addEventListener('input', () => { $('engeeUsername').dataset.dirty = 'true'; });
$('puter-guest').addEventListener('click', () => signInPuter(true)); $('puter-login').addEventListener('click', () => signInPuter(false));
$('quick-puter').addEventListener('click', () => signInPuter(true));
$('free-api-connect-button').addEventListener('click', () => { if (hasOpenRouterKey()) { connectFreeApi(true); return; } const expanded = $('free-api-options').hidden; $('free-api-options').hidden = !expanded; $('free-api-connect-button').setAttribute('aria-expanded', String(expanded)); if (expanded) $('free-api-login').focus(); });
$('free-api-login').addEventListener('click', () => connectFreeApi(false));
$('free-api-cancel').addEventListener('click', () => { freeApiFlow?.controller.abort(); renderFreeApiControls(); });
$('chat-provider').addEventListener('change', () => switchChatProvider($('chat-provider').value));
$('chat-model-button').addEventListener('click', () => { if (app.busy) return; const open = $('chat-model-menu').hidden; $('chat-model-menu').hidden = !open; $('chat-model-button').setAttribute('aria-expanded', String(open)); if (open) $('chat-provider').focus(); });
document.addEventListener('pointerdown', event => { if (!$('chat-model-menu').hidden && !$('chat-model-picker').contains(event.target)) closeChatModelMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('chat-model-menu').hidden) { closeChatModelMenu(true); event.preventDefault(); } });
$('chat-model-input').addEventListener('change', switchChatModel);
$('chat-ollama-model').addEventListener('change', () => selectOllamaModel());
$('settings-ollama-model').addEventListener('change', () => selectOllamaModel(true));
$('settings-discover-models').addEventListener('click', discoverSettingsModels);
$('baseUrl').addEventListener('input', () => { renderModelControls(); if ($('provider').value === 'ollama') $('api-key-field').hidden = isLocalApi($('baseUrl').value); });
$('attach-file').addEventListener('click', () => $('attachment-input').click());
$('attachment-input').addEventListener('change', async () => { await uploadAttachments($('attachment-input').files); $('attachment-input').value = ''; });
$('chat-form').addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
$('chat-form').addEventListener('drop', event => { if (event.dataTransfer.files.length) { event.preventDefault(); uploadAttachments(event.dataTransfer.files); } });
$('prompt').addEventListener('paste', event => { if (event.clipboardData.files.length) { event.preventDefault(); uploadAttachments(event.clipboardData.files); } });
document.addEventListener('click', event => { if (!event.target.closest('#slash-menu,#prompt')) $('slash-menu').hidden = true; });
document.querySelectorAll('[data-help]').forEach(button => { const href = `/help/guide.html#${HELP_SECTIONS[button.dataset.help] || 'interface'}`; const link = document.createElement('a'); link.className = button.className; link.href = href; link.target = '_blank'; link.rel = 'noopener'; link.title = button.title; link.setAttribute('aria-label', button.title || 'Открыть инструкцию'); link.textContent = button.textContent; button.replaceWith(link); });
document.querySelectorAll('[data-select-provider]').forEach(button => button.addEventListener('click', async () => { await switchChatProvider(button.dataset.selectProvider); view('chat'); }));
$('detect-integrations').addEventListener('click', () => discoverIntegrations().catch(error => { $('integration-status').textContent = readableError(error); $('integration-status').hidden = false; }));
$('julia-path')?.addEventListener('input', () => { $('julia-path').dataset.dirty = 'true'; });
$('save-julia-path')?.addEventListener('click', saveJuliaPath);
$('detect-julia')?.addEventListener('click', () => discoverJulia());
for (const name of programPathFields) $(name)?.addEventListener('input', () => { $(name).dataset.dirty = 'true'; });
$('save-program-paths')?.addEventListener('click', saveProgramPaths);
$('detect-program-paths')?.addEventListener('click', () => discoverIntegrations().catch(error => setStatus('program-paths-result', readableError(error), 'bad')));
$('program-paths-form')?.addEventListener('submit', event => { event.preventDefault(); saveProgramPaths(); });
document.querySelectorAll('[data-program-wizard]').forEach(button => button.addEventListener('click', () => window.EngeeConnections?.open(null, 'program')));
$('workspace-form').addEventListener('submit', async event => {
  event.preventDefault(); if (app.busy || window.EngeePersistence && !await window.EngeePersistence.guardFile()) return; $('connect-workspace').disabled = true; setStatus('workspace-result', 'Подключаем…');
  try { await api('/api/config', { workspace: $('workspace').value.trim() }); app.filePath = ''; app.selectedFile = null; $('file-editor').hidden = true; $('save-file').hidden = true; $('file-to-chat').hidden = true; $('file-name').textContent = 'Выберите файл'; $('file-content').textContent = 'Содержимое появится здесь.'; await refreshState(false); await loadFiles(); setStatus('workspace-result', 'Рабочая папка подключена', 'good'); }
  catch (error) { setStatus('workspace-result', readableError(error), 'bad'); }
  finally { $('connect-workspace').disabled = false; }
});
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); if (app.busy) return; $('save-settings').disabled = true; clearError(); setStatus('save-result', 'Сохраняем…');
  try { await saveSettings(); toast('Настройки сохранены'); } catch (error) { setStatus('save-result', readableError(error), 'bad'); } finally { $('save-settings').disabled = false; }
});
$('probe').addEventListener('click', async () => {
  if (app.busy) return; $('probe').disabled = true; setStatus('probe-result', 'Проверяем…');
  try {
    await saveSettings();
    if (app.state.config.provider === 'puter') {
      const messages = [{ role: 'user', content: 'Ответь только: OK' }];
      await completion(messages, [], null); setStatus('probe-result', 'Puter ответил. Соединение работает.', 'good');
    } else { const result = await api('/api/probe', {}); setStatus('probe-result', result.message || (typeof result.status === 'string' ? result.status : 'Соединение проверено.'), result.ok === false ? 'bad' : 'good'); }
  } catch (error) { setStatus('probe-result', readableError(error), 'bad'); } finally { $('probe').disabled = false; }
});
$('scan-models').addEventListener('click', async () => {
  if (app.busy) return; $('scan-models').disabled = true;
  try { await api('/api/config', { modelsDir: $('modelsDir').value.trim() }); await refreshState(false); setStatus('local-result', 'Список моделей обновлён', 'good'); } catch (error) { setStatus('local-result', readableError(error), 'bad'); } finally { $('scan-models').disabled = false; }
});
$('engee-probe').addEventListener('click', async () => {
  if (app.busy) return; $('engee-probe').disabled = true; setStatus('engee-probe-result', 'Проверяем…');
  try {
    await saveSettings();
    const response = await api('/api/tool', { name: 'engee_status', arguments: {} }, { timeout: 60000 });
    const result = response.result ?? response;
    updateEngeeStatus(result);
  } catch (error) { setStatus('engee-probe-result', readableError(error), 'bad'); } finally { $('engee-probe').disabled = false; }
});
$('engee-load-options').addEventListener('click', loadEngeeOptions);
$('engee-start').addEventListener('click', async () => {
  const minutes = Number($('engee-timeout').value); if (app.engeeTimeoutAvailable !== false && (!$('engee-timeout').checkValidity() || !Number.isFinite(minutes) || minutes < 1)) { $('engee-timeout').reportValidity(); return; }
  try { const result = await manualTool('engee_start', { versionId: $('engee-version').value, ...(app.engeeTimeoutAvailable === false ? {} : { inactivityTimeout: minutes * 60 }) }); if (result?.serverStatus !== undefined) updateEngeeStatus(result); if (toolSucceeded(result) && ['starting', 'running'].includes(result?.serverStatus)) { if (result.serverReady === true) setStatus('engee-lifecycle-result', 'Engee готова к выполнению кода.', 'good'); else await waitForEngeeReady(); } else setStatus('engee-lifecycle-result', toolSucceeded(result) ? 'Запрос запуска выполнен. Нажмите «Проверить Engee» для состояния.' : 'Запуск не выполнен. Проверьте результат.', toolSucceeded(result) ? 'good' : 'bad'); }
  catch (error) { setStatus('engee-lifecycle-result', readableError(error), 'bad'); }
});
$('engee-stop').addEventListener('click', async () => {
  try { const result = await manualTool('engee_stop', {}); if (result?.serverStatus !== undefined) updateEngeeStatus(result); setStatus('engee-lifecycle-result', toolSucceeded(result) ? 'Запрос остановки выполнен. Нажмите «Проверить Engee» для состояния.' : 'Остановка не выполнена.', toolSucceeded(result) ? 'good' : 'bad'); }
  catch (error) { setStatus('engee-lifecycle-result', readableError(error), 'bad'); }
});
$('refresh-state').addEventListener('click', refreshAllConnections);
$('file-path-form').addEventListener('submit', event => { event.preventDefault(); loadFiles($('file-path').value.trim()).catch(showError); });
$('files-refresh').addEventListener('click', () => loadFiles(app.filePath).catch(showError));
$('files-up').addEventListener('click', () => { const parts = app.filePath.replace(/\\/g, '/').replace(/\/$/, '').split('/'); parts.pop(); loadFiles(parts.join('/')).catch(showError); });
$('new-file').addEventListener('click', () => openCodeSave('', 'julia'));
$('edit-file').addEventListener('click', () => { if (!app.selectedFile || app.busy) return; $('file-content').hidden = true; $('file-editor').hidden = false; $('file-editor').value = app.selectedFile.content; $('save-file').hidden = false; $('edit-file').hidden = true; $('file-editor').focus(); });
$('save-file').addEventListener('click', () => { if (app.selectedFile) (window.EngeePersistence?.ready() ? window.EngeePersistence.saveFile() : saveProjectFile(app.selectedFile.path, $('file-editor').value)).catch(showError); });
$('file-editor').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); $('save-file').click(); } });
$('run-file').addEventListener('click', async () => {
  if (!app.selectedFile || app.busy) return;
  if (!$('file-editor').hidden && $('file-editor').value !== app.selectedFile.content) { toast('Сначала сохраните изменения файла.'); return; }
  try { const result = await manualTool('engee_eval_file', { path: app.selectedFile.path }, 'engee'); if (!toolSucceeded(result)) toast('Выполнение файла не подтверждено или завершилось ошибкой. Проверьте результат.'); }
  catch (error) { showError(error); }
});
$('cancel-code-save').addEventListener('click', () => $('code-save-dialog').close());
$('confirm-code-save').addEventListener('click', async () => { const target = $('code-save-path').value.trim(), content = $('code-save-source').value; if (!target) { $('code-save-path').reportValidity(); return; } $('code-save-dialog').close(); try { await saveProjectFile(target, content); } catch (error) { showError(error); } });
$('upload-to-engee').addEventListener('click', () => { if (!app.selectedFile || app.busy) return; $('engee-upload-name').textContent = `Выбранный файл: ${app.selectedFile.path}`; $('engee-list-result').hidden = true; $('engee-upload-dialog').showModal(); });
$('engee-list-files').addEventListener('click', async () => {
  const directory = $('engee-upload-destination').value.trim(); if (!directory) { $('engee-upload-destination').reportValidity(); return; }
  $('engee-list-files').disabled = true; $('engee-list-result').textContent = 'Читаем содержимое папки…'; $('engee-list-result').hidden = false;
  try { const response = await api('/api/tool', { name: 'engee_list_files', arguments: { path: directory } }); const result = response.result ?? response; $('engee-list-result').textContent = result.text ?? (typeof result === 'string' ? result : JSON.stringify(result, null, 2)); }
  catch (error) { $('engee-list-result').textContent = readableError(error); }
  finally { $('engee-list-files').disabled = false; }
});
$('engee-upload-cancel').addEventListener('click', () => $('engee-upload-dialog').close());
$('engee-upload-confirm').addEventListener('click', async () => {
  const destination = $('engee-upload-destination').value.trim(); if (!destination) { $('engee-upload-destination').reportValidity(); return; }
  const selectedPath = app.selectedFile?.path; $('engee-upload-dialog').close(); if (!selectedPath) return;
  try { const result = await manualTool('engee_upload_file', { path: selectedPath, destination }); if (toolSucceeded(result)) toast('Передача файла в Engee выполнена. Проверьте результат действия.'); }
  catch (error) { showError(error); }
});
$('project-files-open').addEventListener('click', () => view('files'));
$('project-files-close').addEventListener('click', () => closeProjectFiles());
$('project-files-dialog').addEventListener('close', () => { if (location.hash === '#files') history.replaceState(null, '', '#chat'); });
$('file-to-chat').addEventListener('click', () => { if (!app.selectedFile) return; if (app.busy) { toast('Сначала завершите запрос.'); return; } const content = $('file-editor').hidden ? app.selectedFile.content : $('file-editor').value; $('prompt').value = `${$('prompt').value ? `${$('prompt').value}\n\n` : ''}Файл проекта: ${app.selectedFile.path}\n\n${content}`; closeProjectFiles(false); view('chat'); $('prompt').focus(); window.EngeePersistence?.changed(); toast('Файл добавлен к сообщению. Допишите задачу и отправьте.'); });
$('new-skill').addEventListener('click', () => { $('skill-editor').hidden = false; $('skill-name').focus(); }); $('cancel-skill').addEventListener('click', () => { $('skill-editor').hidden = true; });
$('skill-editor').addEventListener('submit', async event => {
  event.preventDefault(); if (app.busy) return; const submit = $('skill-editor').querySelector('[type=submit]'); submit.disabled = true;
  try { setStatus('skill-result', 'Подготовка сохранения…'); const result = await manualTool('save_skill', { name: $('skill-name').value.trim(), content: $('skill-source').value }); if (!toolSucceeded(result)) { setStatus('skill-result', result?.declined || result?.denied || result?.cancelled ? 'Навык не сохранён: действие отклонено. Текст остался в редакторе.' : 'Навык не сохранён. Проверьте результат действия.', 'bad'); return; } await refreshState(false); $('skill-editor').hidden = true; $('skill-name').value = ''; $('skill-source').value = ''; setStatus('skill-result', ''); toast('Навык сохранён в resources/skills'); }
  catch (error) { setStatus('skill-result', readableError(error), 'bad'); } finally { submit.disabled = false; }
});
$('shutdown').addEventListener('click', () => { if (app.busy || app.uploading) { toast('Сначала завершите текущий запрос или загрузку вложения.'); return; } if (!window.EngeePersistence?.ready()) { showError('Сохранение перед выключением пока недоступно. Обновите подключение к приложению.'); return; } window.EngeePersistence.shutdown(); });
$('bind-token-button').addEventListener('click', async () => {
  const token = $('bind-token').value.trim() || window.EngeePersistence?.bindDraftToken(); if (!token) { setStatus('bind-token-result', 'Введите токен', 'bad'); return; }
  $('bind-token-button').disabled = true;
  try { const target = $('token-target').value; if (target === 'provider') await saveSettings(); const result = await api('/api/tokens/bind', { target, token, draftSecretRefs: window.EngeePersistence?.refs() || [] }); $('bind-token').value = ''; window.EngeePersistence?.bindSaved(); await refreshState(); setStatus('bind-token-result', result.message || 'Токен привязан', 'good'); }
  catch (error) { setStatus('bind-token-result', readableError(error), 'bad'); }
  finally { $('bind-token-button').disabled = false; }
});
$('load-config-editor').addEventListener('click', async () => {
  $('load-config-editor').disabled = true;
  try { const result = await api('/api/config/editor'); if (!result.secretsMasked) throw new Error('Сервер не подтвердил маскирование секретов. Конфигурация не показана.'); $('config-editor').value = JSON.stringify(result.document || {}, null, 2); $('config-editor').disabled = false; $('save-config-editor').disabled = false; $('config-editor-path').textContent = result.path || 'Локальная конфигурация'; setStatus('config-editor-result', 'Секреты скрыты'); }
  catch (error) { setStatus('config-editor-result', readableError(error), 'bad'); }
  finally { $('load-config-editor').disabled = false; }
});
$('save-config-editor').addEventListener('click', async () => {
  $('save-config-editor').disabled = true;
  try { const document = JSON.parse($('config-editor').value); if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Конфигурация должна быть JSON-объектом.'); if (document.workspace && document.workspace !== app.state?.config.workspace && window.EngeePersistence && !await window.EngeePersistence.guardFile()) return; const ref = window.EngeePersistence?.configRef(), baseRef = window.EngeePersistence?.configBaseRef(); const result = await api('/api/config/editor', ref ? { draftSecretRef: ref } : { document, ...(baseRef ? { draftBaseRef: baseRef } : {}) }); window.EngeePersistence?.configSaved(); await refreshState(); setStatus('config-editor-result', result.message || 'Конфигурация сохранена', 'good'); $('load-config-editor').click(); }
  catch (error) { setStatus('config-editor-result', readableError(error), 'bad'); }
  finally { $('save-config-editor').disabled = false; }
});
async function buildPackage(personal) {
  if (app.packaging) return;
  if (personal && !await dialogChoice($('package-confirm'), null)) return;
  app.packaging = true; $('package-public').disabled = true; $('package-personal').disabled = true; $('package-download').hidden = true; setStatus('package-status', 'Начинаем сборку архива…');
  try {
    let result = await api('/api/package', { personal });
    const id = result.id;
    const started = Date.now();
    while (result.status === 'running') {
      if (!id || Date.now() - started > 30 * 60 * 1000) throw new Error('Сборка не завершилась за отведённое время. Проверьте состояние сервера.');
      await new Promise(resolve => setTimeout(resolve, 2000));
      result = await api(`/api/package?id=${encodeURIComponent(id)}`); setStatus('package-status', result.status === 'running' ? 'Архив собирается. Дождитесь ссылки на скачивание…' : 'Проверяем готовый архив…');
    }
    if (result.status !== 'ready' || !result.downloadUrl) throw new Error(result.error || 'Не удалось собрать архив.');
    const destination = new URL(result.downloadUrl, location.origin);
    if (destination.origin !== location.origin) throw new Error('Сервер вернул внешнюю ссылку. Скачивание заблокировано.');
    $('package-download').href = destination.href; $('package-download').hidden = false; setStatus('package-status', 'Архив готов', 'good');
  } catch (error) { setStatus('package-status', readableError(error), 'bad'); }
  finally { app.packaging = false; $('package-public').disabled = false; $('package-personal').disabled = false; }
}
$('package-public').addEventListener('click', () => buildPackage(false));
$('package-personal').addEventListener('click', () => buildPackage(true));
organizeParameters(); $('chat-model-menu').append($('chat-ollama-notice')); restoreConversation(); if (app.claudeSession) updateClaudeSession(app.claudeSession); renderConversation(); renderExecutionTarget(); view(location.hash.slice(1) || 'chat');

/* ===== Theme toggle ===== */
(function initThemeToggle() {
  const root = document.documentElement;
  const toggle = $('theme-toggle');
  if (!toggle) return;
  let current = localStorage.getItem('theme') || 'light';
  root.setAttribute('data-theme', current);
  const icon = current === 'dark' ? '☀' : '◐';
  toggle.textContent = icon;
  toggle.addEventListener('click', () => {
    current = current === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', current);
    localStorage.setItem('theme', current);
    toggle.textContent = current === 'dark' ? '☀' : '◐';
    toggle.setAttribute('aria-label', `Переключить на ${current === 'dark' ? 'светлую' : 'тёмную'} тему`);
  });
})();
window.EngeeApp = { refresh: async () => { const preserveDrafts = window.EngeePersistence?.hasSettingsDraft() === true; await refreshState(false, preserveDrafts); if (!preserveDrafts) { renderProviderSelect('provider'); $('baseUrl').value = app.state.config.baseUrl || ''; $('model').value = app.state.config.model || ''; providerFields(); } if (usesModelCatalog(app.state?.config.provider)) await discoverModels(); }, view, busy: () => app.busy, state: () => app.state };
refreshState().then(refreshAllConnections).catch(error => { paintHealth('server-status', 'bad', `Приложение: ${readableError(error)}`); showError(error); });
