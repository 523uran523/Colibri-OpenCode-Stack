'use strict';
(() => {
  const KEEP = '__KEEP_DRAFT_SECRET__';
  const state = { ready: false, starting: false, activeId: '', summaries: [], revision: 0, refs: [], drafts: {}, serial: Promise.resolve(), sequence: 0, savedSequence: 0, timer: null, switching: false, shutdown: null, settingsDirty: false, configDirty: false, juliaDirty: false, programPathsDirty: false, restoredConfigText: '', orphanFile: null };
  const fields = ['provider', 'baseUrl', 'model', 'modelsDir', 'workspace', 'engeeAccountUrl', 'engeeRuntimeUrl', 'engeeUsername', 'apiKey', 'engeeToken', 'engeePassword', 'clearEngeeLogin'];
  const secrets = ['apiKey', 'engeeToken', 'engeePassword', 'engeeUsername'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const value = id => $(id)?.type === 'checkbox' ? $(id).checked : $(id)?.value || '';
  const fileDirty = () => Boolean(app.selectedFile && !$('file-editor').hidden && $('file-editor').value !== app.selectedFile.content);
  const enqueue = operation => { const promise = state.serial.then(operation); state.serial = promise.catch(() => {}); return promise; };
  const matchedRefs = prefix => state.refs.filter(ref => String(ref.path || '').replace(/^drafts\./, '').startsWith(prefix));
  const currentSettings = () => Object.fromEntries(fields.map(id => [id, value(id)]));
  const hasSettingsDraft = () => state.settingsDirty || state.juliaDirty || state.configDirty || state.programPathsDirty;
  function secretFields(source, prefix, ids) {
    const result = { ...source };
    ids.forEach(id => { if (!result[id] && state.drafts?.settings?.fields?.[id] === KEEP && prefix === 'settings.fields.' && (id !== 'apiKey' || state.drafts.settings.provider === result.provider)) result[id] = KEEP; });
    return result;
  }
  function captureDrafts() {
    const settings = secretFields(currentSettings(), 'settings.fields.', secrets);
    const wizard = window.EngeeConnections?.captureDraft?.() || state.drafts.wizard || null;
    if (wizard && !wizard.apiKey && state.drafts.wizard?.apiKey === KEEP && wizard.id === state.drafts.wizard.id && wizard.type === state.drafts.wizard.type) wizard.apiKey = KEEP;
    const bindToken = { target: value('token-target'), provider: $('provider').value, connectionId: app.state?.config.connectionId || '', token: value('bind-token') || (state.drafts.bindToken?.token === KEEP ? KEEP : '') };
    return {
      settings: { provider: settings.provider, connectionId: app.state?.config.connectionId || '', fields: settings, changed: state.settingsDirty },
      bindToken,
      juliaPath: { value: value('julia-path'), changed: state.juliaDirty },
      programPaths: { fields: Object.fromEntries(programPathFields.map(id => [id, value(id)])), changed: state.programPathsDirty },
      configEditor: { text: value('config-editor'), loaded: !$('config-editor').disabled, changed: state.configDirty },
      fileEditor: fileDirty() ? { ...app.selectedFile, originalContent: app.selectedFile.content, content: value('file-editor'), workspace: app.state?.config.workspace } : state.orphanFile,
      skill: { name: value('skill-name'), content: value('skill-source'), open: !$('skill-editor').hidden },
      newFile: { path: value('code-save-path'), content: value('code-save-source') },
      wizard
    };
  }
  function captureChat() {
    const first = app.events.find(event => event.role === 'user' && contentText(event.content).trim());
    const summary = state.summaries.find(chat => chat.id === state.activeId);
    return { id: state.activeId, title: contentText(first?.content).replace(/\s+/g, ' ').slice(0, 70) || summary?.title || 'Новый диалог', createdAt: summary?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), history: clone(app.activeMessages ? app.activeMessages.slice(1) : app.history), events: clone(app.events), fingerprint: app.fingerprint, claudeSession: app.claudeSession ? { sessionId: app.claudeSession.sessionId } : null, executionTarget: app.executionTarget, draft: { prompt: value('prompt'), attachments: clone(app.attachments) } };
  }
  function accept(result) {
    if (result.revision !== undefined) state.revision = result.revision;
    if (Array.isArray(result.chats)) state.summaries = result.chats;
    if (result.activeId) state.activeId = result.activeId;
    if (Array.isArray(result.draftSecretRefs)) state.refs = result.draftSecretRefs;
    if (result.drafts) state.drafts = result.drafts;
    renderHistory();
  }
  function changed() {
    state.sequence++; clearTimeout(state.timer);
    if (state.ready && !state.switching && !state.shutdown) state.timer = setTimeout(() => flush().catch(error => { $('chat-history-status').textContent = `Не сохранено: ${readableError(error)}`; $('chat-history-button').classList.add('unsaved'); }), 450);
  }
  function flush() {
    clearTimeout(state.timer);
    if (!state.ready) return Promise.reject(new Error('Локальное сохранение ещё не подключено.'));
    return enqueue(async () => {
      const sequence = state.sequence, chat = captureChat(), drafts = captureDrafts();
      const result = await api('/api/chats/upsert', { chat, activeId: state.activeId, drafts, revision: state.revision, draftSecretRefs: state.refs }, { timeout: 60000 });
      accept(result); state.savedSequence = sequence; $('chat-history-button').classList.remove('unsaved'); $('chat-history-status').textContent = 'До 5 диалогов · сохранено на этом компьютере';
      if (state.sequence !== sequence && !state.switching && !state.shutdown) changed();
      return result;
    });
  }
  function normalizeInterrupted(history) {
    const result = clone(Array.isArray(history) ? history : []), answered = new Set(result.filter(item => item.role === 'tool').map(item => item.tool_call_id));
    for (let index = result.length - 1; index >= 0; index--) {
      const missing = result[index].tool_calls?.filter(call => !answered.has(call.id)) || [];
      if (missing.length) result.splice(index + 1, 0, ...missing.map(call => ({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: 'Предыдущий запрос был прерван. Действие не выполнено. Не повторяй его без новой просьбы пользователя.', interrupted: true }) })));
    }
    return result;
  }
  function applyChat(chat) {
    app.history = normalizeInterrupted(chat.history); app.events = Array.isArray(chat.events) ? chat.events : []; app.fingerprint = chat.fingerprint || ''; app.claudeSession = chat.claudeSession?.sessionId ? { sessionId: chat.claudeSession.sessionId } : null; app.executionTarget = chat.executionTarget === 'julia' ? 'julia' : 'engee'; app.attachments = Array.isArray(chat.draft?.attachments) ? chat.draft.attachments : [];
    $('prompt').value = chat.draft?.prompt || ''; $('slash-menu').hidden = true; app.activeMessages = null; app.toolDefinitions = []; renderAttachments(); renderConversation(); renderExecutionTarget(); saveConversation(); try { sessionStorage.setItem('engee-agent-durable-chat-id-v1', chat.id); } catch {} refreshToolDefinitions().catch(showError);
  }
  function closeHistory(focus = false) { $('chat-history-menu').hidden = true; $('chat-history-button').setAttribute('aria-expanded', 'false'); if (focus) $('chat-history-button').focus(); }
  function renderHistory() {
    $('chat-history-list').replaceChildren();
    [...state.summaries].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).forEach(chat => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'history-chat'; button.disabled = app.busy || state.switching || Boolean(state.shutdown); button.setAttribute('aria-current', chat.id === state.activeId ? 'true' : 'false');
      const title = document.createElement('span'); title.textContent = chat.title || 'Новый диалог'; button.append(title);
      const time = document.createElement('small'); time.textContent = Number.isNaN(Date.parse(chat.updatedAt)) ? '' : new Date(chat.updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); button.append(time);
      button.addEventListener('click', () => switchChat(chat.id).catch(showError)); $('chat-history-list').append(button);
    });
    $('chat-history-button').disabled = !state.ready || app.busy || state.switching || Boolean(state.shutdown);
  }
  async function switchChat(id) {
    if (app.busy || state.switching || state.shutdown || id === state.activeId) return;
    state.switching = true; setBusy(true); renderHistory();
    try { await flush(); const response = await api(`/api/chats/read?id=${encodeURIComponent(id)}`); if (!response.chat) throw new Error('Диалог не найден.'); const result = await enqueue(() => api('/api/chats/upsert', { chat: response.chat, activeId: id, revision: state.revision })); accept(result); applyChat(response.chat); state.savedSequence = state.sequence; closeHistory(); }
    finally { state.switching = false; setBusy(false); renderHistory(); }
  }
  async function limitChoice() {
    const oldest = [...state.summaries].filter(chat => chat.id !== state.activeId).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];
    $('chat-limit-message').textContent = `На этом компьютере сохраняются до 5 диалогов. После создания нового будет удалён самый давно открывавшийся диалог «${oldest?.title || 'Старый диалог'}». Текущий диалог и его черновик сохранятся.`;
    return new Promise(resolve => { const dialog = $('chat-limit-dialog'); dialog.returnValue = 'cancel'; dialog.addEventListener('close', () => resolve(dialog.returnValue === 'create'), { once: true }); dialog.showModal(); });
  }
  async function newChat() {
    if (app.busy || state.switching || state.shutdown) return;
    if (state.summaries.length >= 5 && !await limitChoice()) return;
    state.switching = true; setBusy(true); renderHistory();
    try {
      await flush(); const date = new Date().toISOString(), chat = { id: crypto.randomUUID(), title: 'Новый диалог', createdAt: date, updatedAt: date, history: [], events: [], fingerprint: '', claudeSession: null, executionTarget: app.executionTarget, draft: { prompt: '', attachments: [] } };
      const response = await enqueue(() => api('/api/chats/upsert', { chat, activeId: chat.id, revision: state.revision })); accept(response); applyChat(chat); state.savedSequence = state.sequence; closeHistory(); toast(response.pruned?.length ? 'Новый диалог создан. Самый старый диалог удалён; сохранено 5 диалогов.' : 'Новый диалог создан');
    } catch (error) { showError(error); }
    finally { state.switching = false; setBusy(false); renderHistory(); $('prompt').focus(); }
  }
  async function clearActive() {
    if (app.busy || state.switching || state.shutdown) return;
    state.switching = true; setBusy(true);
    try { await flush(); const current = captureChat(), chat = { ...current, history: [], events: [], fingerprint: '', claudeSession: null, draft: { prompt: '', attachments: [] } }; const response = await enqueue(() => api('/api/chats/upsert', { chat, activeId: state.activeId, revision: state.revision })); accept(response); applyChat(chat); state.savedSequence = state.sequence; toast('Этот диалог и его контекст очищены. Остальные диалоги сохранены.'); }
    catch (error) { showError(error); }
    finally { state.switching = false; setBusy(false); renderHistory(); }
  }
  function fileEdits() {
    if (!fileDirty()) return [];
    if (!app.selectedFile.editToken) throw new Error('Файл нужно заново открыть из списка проекта перед сохранением. Черновик сохранён локально.');
    if (app.selectedFile.conflict) throw new Error('Файл на диске изменился после создания черновика. Сравните изменения перед сохранением.');
    return [{ path: app.selectedFile.path, content: value('file-editor'), editToken: app.selectedFile.editToken }];
  }
  function acceptFiles(response, edits = []) {
    const files = response.fileResults || [];
    files.forEach(file => { if (app.selectedFile?.path === file.path) { app.selectedFile.content = edits.find(edit => edit.path === file.path)?.content ?? app.selectedFile.content; app.selectedFile.editToken = file.editToken || app.selectedFile.editToken; app.selectedFile.sha256 = file.sha256 || app.selectedFile.sha256; state.orphanFile = null; $('file-content').textContent = app.selectedFile.content || '(Пустой файл)'; } });
  }
  async function saveFile() {
    if (app.busy && !state.guardSaving) throw new Error('Сначала завершите текущий запрос.');
    const edits = fileEdits(); if (!edits.length) return true;
    const ownBusy = !app.busy; if (ownBusy) setBusy(true);
    try { const response = await enqueue(() => api('/api/autosave', { fileEdits: edits }, { timeout: 60000 })); if (response.saved !== true) throw new Error('Сервер не подтвердил сохранение файла.'); if (response.chatState) accept(response.chatState); acceptFiles(response, edits); $('file-operation-result').hidden = false; $('file-operation-result').textContent = 'Файл сохранён.'; changed(); return true; }
    catch (error) { $('file-operation-result').hidden = false; $('file-operation-result').textContent = readableError(error); throw error; }
    finally { if (ownBusy) setBusy(false); }
  }
  let guardPromise = null;
  function guardFile() {
    if (!fileDirty()) return Promise.resolve(true);
    if (guardPromise) return guardPromise;
    const dialog = $('unsaved-file-dialog'); $('unsaved-file-name').textContent = app.selectedFile.path; $('unsaved-file-error').hidden = true;
    guardPromise = new Promise(resolve => {
      const finish = accepted => { dialog.close(); cleanup(); guardPromise = null; resolve(accepted); };
      const cancel = () => finish(false);
      const discard = () => { $('file-editor').value = app.selectedFile.content; state.orphanFile = null; changed(); finish(true); };
      const save = async () => {
        [ 'unsaved-file-save', 'unsaved-file-discard', 'unsaved-file-cancel' ].forEach(id => { $(id).disabled = true; }); $('unsaved-file-save').textContent = 'Сохранение…'; state.guardSaving = true;
        try { await saveFile(); finish(true); } catch (error) { $('unsaved-file-error').textContent = readableError(error); $('unsaved-file-error').hidden = false; }
        finally { state.guardSaving = false; [ 'unsaved-file-save', 'unsaved-file-discard', 'unsaved-file-cancel' ].forEach(id => { $(id).disabled = false; }); $('unsaved-file-save').textContent = 'Сохранить'; }
      };
      const escape = event => { event.preventDefault(); if (!state.guardSaving) cancel(); };
      const cleanup = () => { $('unsaved-file-cancel').removeEventListener('click', cancel); $('unsaved-file-discard').removeEventListener('click', discard); $('unsaved-file-save').removeEventListener('click', save); dialog.removeEventListener('cancel', escape); };
      $('unsaved-file-cancel').addEventListener('click', cancel); $('unsaved-file-discard').addEventListener('click', discard); $('unsaved-file-save').addEventListener('click', save); dialog.addEventListener('cancel', escape); dialog.showModal();
    }); return guardPromise;
  }
  function decorateConfig(config) {
    const result = { ...config };
    secrets.forEach(id => { if (!result[id] && state.drafts.settings?.fields?.[id] === KEEP && (id !== 'apiKey' || state.drafts.settings.provider === config.provider)) result[id] = KEEP; });
    if (result.clearEngeeLogin) { delete result.engeePassword; delete result.engeeUsername; }
    return { ...result, draftSecretRefs: state.refs };
  }
  function settingsSaved() { state.settingsDirty = false; state.drafts.settings = null; changed(); }
  function configSaved() { state.configDirty = false; state.restoredConfigText = ''; state.drafts.configEditor = null; changed(); }
  function programPathsSaved() { state.programPathsDirty = false; state.drafts.programPaths = null; for (const id of programPathFields) delete $(id).dataset.dirty; changed(); }
  function wizardSecretPayload() { const refs = matchedRefs('wizard.').filter(ref => ref.kind !== 'connectionText' || Object.entries(state.drafts.wizard?.fields || {}).some(([id, stored]) => String(ref.path || '').endsWith(id) && value(id) === stored)); return { ...(state.drafts.wizard?.apiKey === KEEP ? { apiKey: KEEP } : {}), draftSecretRefs: refs }; }
  function clearWizardDraft() { state.drafts.wizard = null; window.EngeeConnections?.clearDraft?.(); changed(); }
  function buildAutosave() {
    const configPatch = state.settingsDirty ? decorateConfig(formConfig()) : {};
    if (state.juliaDirty) configPatch.juliaPath = value('julia-path');
    if (state.programPathsDirty) for (const id of programPathFields) configPatch[id] = value(id).trim();
    const batch = { fileEdits: fileEdits(), ...(Object.keys(configPatch).length ? { configPatch } : {}), draftSecretRefs: state.refs };
    if (state.configDirty) {
      const ref = state.refs.find(item => item.kind === 'configEditor');
      if (ref && value('config-editor') === state.restoredConfigText) batch.configDocumentRef = ref.id;
      else { try { batch.configDocument = JSON.parse(value('config-editor')); if (ref) batch.configDocumentBaseRef = ref.id; } catch { throw new Error('Конфигурация не сохранена: исправьте JSON в редакторе.'); } }
    }
    const token = value('bind-token') || (state.drafts.bindToken?.token === KEEP ? KEEP : '');
    if (token) batch.bindToken = { target: value('token-target'), token, provider: $('provider').value, connectionId: app.state?.config.connectionId || '' };
    batch.chatState = { chat: captureChat(), activeId: state.activeId, drafts: captureDrafts(), revision: state.revision, draftSecretRefs: state.refs };
    return batch;
  }
  async function shutdown() {
    if (!state.ready || app.busy || state.shutdown) return;
    state.shutdown = new AbortController(); const signal = state.shutdown.signal, dialog = $('shutdown-save-dialog');
    $('shutdown-save-title').textContent = 'Сохранение…'; $('shutdown-save-error').hidden = true; $('shutdown-save-loading').hidden = false; $('shutdown-save-retry').hidden = true; $('shutdown-save-cancel').disabled = false; $('shutdown-save-stage').textContent = 'Подготавливаем файлы, настройки и диалоги.';
    if (!dialog.open) dialog.showModal(); setBusy(true); renderHistory();
    let stopRequested = false;
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await flush(); if (signal.aborted) throw new DOMException('Отменено', 'AbortError');
      const batch = buildAutosave(); $('shutdown-save-stage').textContent = 'Сохраняем файлы, настройки, историю и черновики…';
      state.saving = true; const saved = await enqueue(() => api('/api/autosave', batch, { timeout: 120000 })); state.saving = false;
      if (saved.saved !== true || !saved.saveId) throw new Error('Сервер не подтвердил завершение сохранения. Выключение отменено.');
      acceptFiles(saved, batch.fileEdits); if (saved.chatState) accept(saved.chatState); if (saved.config) app.state.config = saved.config; state.settingsDirty = false; state.juliaDirty = false; state.configDirty = false; state.programPathsDirty = false;
      if (signal.aborted) throw new DOMException('Отменено', 'AbortError');
      $('shutdown-save-stage').textContent = 'Сохранено. Завершаем приложение…'; $('shutdown-save-cancel').disabled = true;
      stopRequested = true; const closed = await api('/api/shutdown', { expectedSaveId: saved.saveId }, { timeout: 30000 });
      if (closed.error || closed.ok === false) throw new Error(closed.message || 'Приложение не подтвердило остановку.');
      state.stopped = true; state.savedSequence = state.sequence; $('shutdown-save-title').textContent = 'Сохранено'; $('shutdown-save-stage').textContent = 'Сохранено. Приложение остановлено.'; $('shutdown-save-loading').hidden = true; $('shutdown-save-cancel').textContent = 'Закрыть'; $('shutdown-save-cancel').disabled = false; paintHealth('server-status', 'bad', 'Приложение: сервер остановлен');
    } catch (error) {
      $('shutdown-save-loading').hidden = true; $('shutdown-save-cancel').disabled = false;
      if (signal.aborted) { dialog.close(); toast('Выключение отменено. Приложение продолжает работать.'); }
      else { $('shutdown-save-title').textContent = stopRequested ? 'Остановка не подтверждена' : 'Сохранение не завершено'; $('shutdown-save-error').textContent = stopRequested ? `Сохранение подтверждено, но остановка приложения не подтверждена: ${readableError(error)}. Проверьте подключение перед повтором.` : `${readableError(error)} Приложение и терминалы не закрыты.`; $('shutdown-save-error').hidden = false; $('shutdown-save-retry').hidden = false; }
    } finally { state.saving = false; state.shutdown = null; setBusy(false); renderHistory(); }
  }
  function cancelShutdown() { if ($('shutdown-save-cancel').disabled) return; if (state.shutdown) { state.shutdown.abort(); if (state.saving) { $('shutdown-save-stage').textContent = 'Выключение отменено. Дожидаемся начатого локального сохранения…'; $('shutdown-save-cancel').disabled = true; } } else $('shutdown-save-dialog').close(); }
  function setDraftValues(draftFields = {}) { Object.entries(draftFields).forEach(([id, stored]) => { const node = $(id); if (!node) return; if (stored === KEEP) { node.value = ''; node.placeholder = '••••••••'; node.dataset.secretDraft = 'true'; if (id === 'engeeUsername') node.dataset.dirty = 'true'; const badge = $(`${id}-saved`); if (badge) { badge.hidden = false; badge.textContent = 'Черновик сохранён'; } } else if (node.type === 'checkbox') node.checked = Boolean(stored); else node.value = String(stored ?? ''); }); }
  async function restoreDrafts(drafts = {}) {
    state.drafts = drafts; state.settingsDirty = Boolean(drafts.settings?.changed); state.juliaDirty = Boolean(drafts.juliaPath?.changed); state.configDirty = Boolean(drafts.configEditor?.changed); state.programPathsDirty = Boolean(drafts.programPaths?.changed);
    setDraftValues(drafts.settings?.fields); renderModelControls();
    if (drafts.bindToken) { setDraftValues({ 'token-target': drafts.bindToken.target, 'bind-token': drafts.bindToken.token }); }
    if (drafts.juliaPath) { $('julia-path').value = drafts.juliaPath.value || ''; if (state.juliaDirty) $('julia-path').dataset.dirty = 'true'; }
    if (drafts.programPaths) { setDraftValues(drafts.programPaths.fields); if (state.programPathsDirty) for (const id of programPathFields) $(id).dataset.dirty = 'true'; }
    if (drafts.configEditor?.loaded) { $('config-editor').disabled = false; $('config-editor').value = drafts.configEditor.text || ''; state.restoredConfigText = $('config-editor').value; $('save-config-editor').disabled = false; }
    if (drafts.skill) { $('skill-name').value = drafts.skill.name || ''; $('skill-source').value = drafts.skill.content || ''; $('skill-editor').hidden = !drafts.skill.open; }
    if (drafts.newFile) { $('code-save-path').value = drafts.newFile.path || ''; $('code-save-source').value = drafts.newFile.content || ''; }
    if (drafts.fileEditor) {
      const file = drafts.fileEditor; state.orphanFile = file;
      if (file.workspace === app.state?.config.workspace) {
        try { const current = await api(`/api/file?path=${encodeURIComponent(file.path)}`); const conflict = Boolean(file.conflict || file.sha256 && current.sha256 && file.sha256 !== current.sha256); showSelectedFile(file.path, file.originalContent ?? current.content, current); app.selectedFile.conflict = conflict; $('file-content').hidden = true; $('file-editor').hidden = false; $('file-editor').value = file.content || ''; $('save-file').hidden = false; $('edit-file').hidden = true; state.orphanFile = null; if (conflict) showError('Восстановлен черновик. Файл на диске изменился: сравните версии перед сохранением.'); }
        catch (error) { showError(`Черновик файла сохранён локально, но файл сейчас недоступен: ${readableError(error)}`); }
      } else showError('Черновик файла сохранён в другом проекте. Верните прежнюю рабочую папку, чтобы восстановить его.');
    }
  }
  async function initialize() {
    if (!app.state || state.ready || state.starting) return; state.starting = true;
    try {
      let migrated = false; try { migrated = Boolean(sessionStorage.getItem('engee-agent-durable-chat-id-v1')); } catch {}
      const legacy = !migrated && (app.history.length || app.events.length) ? captureChat() : null;
      const response = await api('/api/chats'); accept(response);
      let chat;
      if (legacy && response.chats?.length) {
        if (response.chats.length >= 5 && !await limitChoice()) { showError('Прежний диалог остался в этой вкладке. Перенос в локальную историю отменён; сообщения не удалены. Обновите подключение, чтобы повторить перенос.'); return; }
        legacy.id = crypto.randomUUID(); legacy.createdAt = new Date().toISOString(); legacy.updatedAt = legacy.createdAt;
        const saved = await api('/api/chats/upsert', { chat: legacy, activeId: legacy.id, revision: state.revision }); accept(saved); chat = legacy;
      }
      if (!chat && response.activeId) { const saved = await api(`/api/chats/read?id=${encodeURIComponent(response.activeId)}`); chat = saved.chat; }
      if (!chat) { state.activeId = crypto.randomUUID(); chat = captureChat(); const saved = await api('/api/chats/upsert', { chat, activeId: state.activeId, drafts: {}, revision: state.revision }); accept(saved); }
      state.switching = true; applyChat(chat); await restoreDrafts(response.drafts || {}); state.ready = true; state.savedSequence = state.sequence; $('chat-history-status').textContent = 'До 5 диалогов · сохранено на этом компьютере'; renderHistory();
    } catch (error) { $('chat-history-status').textContent = `История недоступна: ${readableError(error)}`; $('chat-history-button').title = 'Локальное сохранение недоступно. Обновите приложение.'; }
    finally { state.starting = false; state.switching = false; renderHistory(); }
  }
  window.EngeePersistence = { ready: () => state.ready, changed, flush, guardFile, saveFile, shutdown, newChat, clearActive, settingsSaved, configSaved, programPathsSaved, decorateConfig, hasSettingsDraft, wizardSecretPayload, clearWizardDraft, wizardDraft: () => state.drafts.wizard, codeDraft: () => state.drafts.newFile, configRef: () => state.refs.find(ref => ref.kind === 'configEditor' && value('config-editor') === state.restoredConfigText)?.id, configBaseRef: () => state.refs.find(ref => ref.kind === 'configEditor' && state.restoredConfigText)?.id, refs: () => state.refs, fileDirty, bindDraftToken: () => state.drafts.bindToken?.token === KEEP ? KEEP : '', bindSaved: () => { state.drafts.bindToken = null; changed(); } };
  $('chat-history-button').addEventListener('click', () => { if (!state.ready || app.busy) return; const open = $('chat-history-menu').hidden; $('chat-history-menu').hidden = !open; $('chat-history-button').setAttribute('aria-expanded', String(open)); renderHistory(); });
  document.addEventListener('pointerdown', event => { if (!$('chat-history-menu').hidden && !$('chat-history-picker').contains(event.target)) closeHistory(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('chat-history-menu').hidden) { closeHistory(true); event.preventDefault(); } });
  $('shutdown-save-cancel').addEventListener('click', cancelShutdown); $('shutdown-save-retry').addEventListener('click', shutdown); $('shutdown-save-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelShutdown(); });
  document.addEventListener('input', event => { if (!event.target.matches('input,textarea,select')) return; if (fields.includes(event.target.id)) state.settingsDirty = true; if (event.target.id === 'julia-path') state.juliaDirty = true; if (programPathFields.includes(event.target.id)) state.programPathsDirty = true; if (event.target.id === 'config-editor') state.configDirty = true; changed(); });
  document.addEventListener('change', event => { if (!event.target.matches('input,textarea,select')) return; if (fields.includes(event.target.id)) state.settingsDirty = true; changed(); });
  document.addEventListener('click', event => { if (event.target.closest('#connection-wizard-close,#connection-wizard-cancel')) { state.drafts.wizard = window.EngeeConnections?.captureDraft?.() || state.drafts.wizard; changed(); } }, true);
  $('connection-wizard').addEventListener('cancel', () => { state.drafts.wizard = window.EngeeConnections?.captureDraft?.() || state.drafts.wizard; changed(); }, true);
  window.addEventListener('engee-state', initialize);
  window.addEventListener('beforeunload', event => { if (!state.stopped && (state.sequence !== state.savedSequence || fileDirty() || state.settingsDirty || state.juliaDirty || state.configDirty || state.programPathsDirty || app.busy || app.uploading)) { event.preventDefault(); event.returnValue = ''; } });
  new MutationObserver(renderHistory).observe($('send-chat'), { attributes: true, attributeFilter: ['hidden'] });
  renderHistory(); initialize();
})();
