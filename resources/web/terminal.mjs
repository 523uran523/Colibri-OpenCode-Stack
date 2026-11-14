import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { detectJulia } from './julia.mjs';
import {resolveComponentPath} from './component-paths.mjs';

const WEB = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(WEB, '../..');
const VENDOR = path.join(ROOT, 'resources/runtime/node-pty');
const require = createRequire(import.meta.url);
const sessions = new Map();
const MAX_SESSIONS = 3, MAX_REPLAY_BYTES = 1024 * 1024, MAX_REPLAY_EVENTS = 4096;
const MAX_INPUT_BYTES = 64 * 1024, RETAIN_EXIT_MS = 5 * 60 * 1000;
let creating = 0, ptyLibrary;
const fail = (message, status = 400, code = 'TERMINAL_INVALID') => Object.assign(new Error(message), { status, code });
const protectedProject = value => /(?:^|[\\/])summy(?:[\\/]|$)/i.test(value);
const systemRoot = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';

function nativePty() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw fail('Встроенный терминал в этой сборке поддерживает Windows x64.', 503, 'TERMINAL_UNSUPPORTED_PLATFORM');
  const windowsBuild = Number(os.release().split('.')[2] || 0);
  if (windowsBuild < 17763) throw fail('Для терминала требуется Windows 10 версии 1809 или новее.', 503, 'TERMINAL_UNSUPPORTED_WINDOWS');
  if (!ptyLibrary) {
    try {
      ptyLibrary = require(path.join(VENDOR, 'lib/index.js'));
      require(path.join(VENDOR, 'prebuilds/win32-x64/conpty.node'));
    } catch { throw fail('Компонент интерактивного терминала не найден или не загружается. Распакуйте полный архив приложения.', 503, 'TERMINAL_RUNTIME_MISSING'); }
  }
  return ptyLibrary;
}
async function firstFile(candidates) {
  for (const file of [...new Set(candidates.filter(Boolean))]) {
    if (protectedProject(file)) continue;
    try { if ((await fs.stat(file)).isFile()) return file; } catch {}
  }
  return null;
}
export async function detectShells({juliaPath='',powershellPath='',gitBashPath=''}={}) {
  let supported = true, message = '';
  try { nativePty(); } catch (error) { supported = false; message = error.message; }
  const powershell = await resolveComponentPath('powershell',{configuredPath:powershellPath,candidates:process.platform === 'win32' ? [path.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')]:[]});
  const gitbash = await resolveComponentPath('gitbash',{configuredPath:gitBashPath,candidates:process.platform === 'win32' ? [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Git/bin/bash.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Git/bin/bash.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs/Git/bin/bash.exe'),
    ...(process.env.PATH || '').split(path.delimiter).filter(dir => /[\\/]Git(?:[\\/]|$)/i.test(dir)).map(dir => path.join(dir, 'bash.exe')),
  ] : []});
  const julia=process.platform==='win32'?await detectJulia({configuredPath:juliaPath}):{available:false,path:null,version:null,message:'Встроенный терминал этой сборки поддерживает Windows x64.'};
  return { supported, message, platform: process.platform, architecture: process.arch, maxSessions: MAX_SESSIONS, shells: [
    { id: 'powershell', label: 'Windows PowerShell', ...powershell, available: supported && !!powershell.path },
    { id: 'gitbash', label: 'Git Bash', ...gitbash, available: supported && !!gitbash.path },
    { id: 'julia', label: 'Julia — локальный REPL', available: supported && julia.available, path:julia.path,version:julia.version,message:julia.message,downloadUrl:'https://julialang.org/downloads/' },
  ] };
}
function dimensions(cols = 80, rows = 24) {
  if (!Number.isInteger(cols) || cols < 2 || cols > 500 || !Number.isInteger(rows) || rows < 2 || rows > 200) throw fail('Размер терминала: 2–500 столбцов и 2–200 строк.');
  return { cols, rows };
}
async function workspaceDirectory(value) {
  if (typeof value !== 'string' || !value.trim() || !path.isAbsolute(value) || protectedProject(value)) throw fail('Выберите рабочую папку проекта Engee.', 403, 'TERMINAL_WORKSPACE_INVALID');
  const requested = path.resolve(value), stat = await fs.lstat(requested), real = await fs.realpath(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink() || real.toLowerCase() !== requested.toLowerCase() || requested === path.parse(requested).root) throw fail('Рабочая папка должна быть обычной папкой проекта без ссылок.', 403, 'TERMINAL_WORKSPACE_INVALID');
  return real;
}
function environment(profile) {
  // A whitelist prevents credentials and unrelated application variables from being inherited.
  const allowed = /^(?:SYSTEMROOT|WINDIR|PATH|PATHEXT|COMSPEC|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|HOME|PROGRAMFILES(?:\(X86\))?|PROGRAMW6432|OS|PROCESSOR_[A-Z_]+|NUMBER_OF_PROCESSORS)$/i;
  const env = {};
  const names=new Map();
  for (const [name, value] of Object.entries(process.env)) if (allowed.test(name) && typeof value === 'string') {const folded=name.toUpperCase(),previous=names.get(folded);if(previous)delete env[previous];env[name]=value;names.set(folded,name);}
  const pathKey = Object.keys(env).find(name => name.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = [path.join(ROOT, 'resources/runtime'), ...(env[pathKey] || '').split(path.delimiter).filter(dir => !protectedProject(dir))].join(path.delimiter);
  for(const name of Object.keys(env))if(name.toUpperCase()==='SYSTEMROOT')delete env[name];
  env.SystemRoot = systemRoot;
  // Prevent shared PowerShell history from being loaded; no profile file is copied or read.
  env.APPDATA = path.join(profile, 'roaming');
  env.LOCALAPPDATA = path.join(profile, 'local');
  env.TERM = 'xterm-256color'; env.COLORTERM = 'truecolor';
  env.HISTFILE = '/dev/null'; env.HISTSIZE = '0'; env.HISTFILESIZE = '0';
  env.GIT_CONFIG_NOSYSTEM = '1'; env.GIT_CONFIG_GLOBAL = path.join(profile, 'empty-git-config');
  return env;
}
function view(session) {
  return { id: session.id, shell: session.shell, cwd: session.cwd, executable:session.executable, pid: session.pty.pid || null, cols: session.cols, rows: session.rows, status: session.status, sequence: session.sequence };
}
function publish(session, event) {
  const message = Object.freeze({ ...event, sequence: ++session.sequence });
  const size = Buffer.byteLength(JSON.stringify(message));
  session.history.push({ message, size }); session.historyBytes += size;
  while (session.historyBytes > MAX_REPLAY_BYTES || session.history.length > MAX_REPLAY_EVENTS) session.historyBytes -= session.history.shift().size;
  for (const listener of [...session.listeners]) try { listener(message); } catch { session.listeners.delete(listener); }
}
function exited(session, exitCode = null, signal = null) {
  if (session.status === 'exited') return;
  clearTimeout(session.gracefulInputTimer);clearTimeout(session.forceCloseTimer);
  session.status = 'exited'; publish(session, { type: 'exit', exitCode: Number.isInteger(exitCode) ? exitCode : null, signal: Number.isInteger(signal) ? signal : null });
  const timer = setTimeout(() => { session.listeners.clear(); sessions.delete(session.id); }, RETAIN_EXIT_MS); timer.unref();
}
function getSession(id, active = false) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw fail('Сеанс терминала не найден.', 404, 'TERMINAL_NOT_FOUND');
  const session = sessions.get(id);
  if (!session) throw fail('Сеанс терминала не найден. Откройте новый терминал.', 404, 'TERMINAL_NOT_FOUND');
  if (active && session.status !== 'running') throw fail('Этот терминал уже завершён.', 409, 'TERMINAL_EXITED');
  return session;
}
export async function createTerminal({ workspace, shell = 'powershell', cols = 80, rows = 24, juliaPath='', powershellPath='',gitBashPath='' } = {}) {
  const size = dimensions(cols, rows);
  if (!['powershell', 'gitbash','julia'].includes(shell)) throw fail('Выберите PowerShell, Git Bash или Julia.');
  if ([...sessions.values()].filter(session => session.status !== 'exited').length + creating >= MAX_SESSIONS) throw fail('Одновременно доступны три терминала. Закройте один из существующих.', 409, 'TERMINAL_SESSION_LIMIT');
  creating++;
  try {
    const cwd = await workspaceDirectory(workspace), shells = await detectShells({juliaPath,powershellPath,gitBashPath}), selected = shells.shells.find(item => item.id === shell);
    if (!selected?.available) throw fail(shells.message || selected?.message || 'Оболочка не найдена. Установите её или выберите доступный вариант.', 503, 'TERMINAL_SHELL_MISSING');
    const id = randomUUID(), profile = path.join(ROOT, 'data/terminal', id);
    await fs.mkdir(path.join(profile, 'roaming'), { recursive: true }); await fs.mkdir(path.join(profile, 'local'), { recursive: true });
    await fs.writeFile(path.join(profile, 'empty-git-config'), '');
    // The only fixed initialization disables history. User commands arrive exclusively via inputTerminal.
    const args = shell === 'powershell' ? ['-NoLogo', '-NoProfile', '-NoExit', '-Command', 'if (Get-Command Set-PSReadLineOption -ErrorAction SilentlyContinue) { Set-PSReadLineOption -HistorySaveStyle SaveNothing }'] : shell==='julia'?['--startup-file=no','--history-file=no','--project='+cwd,'--color=yes','--interactive']:['--noprofile', '--norc', '-i'];
    const env=environment(profile);
    if(shell==='julia'){await fs.mkdir(path.join(profile,'julia-depot'),{recursive:true});env.JULIA_DEPOT_PATH=path.join(profile,'julia-depot')+path.delimiter;env.JULIA_LOAD_PATH=['@','@stdlib'].join(path.delimiter);}
    let pty;
    try { pty = nativePty().spawn(selected.path, args, { name: 'xterm-256color', ...size, cwd, env, useConpty: true, useConptyDll: false }); }
    catch { throw fail('Не удалось открыть интерактивную оболочку. Проверьте полную распаковку приложения и наличие выбранной оболочки.', 503, 'TERMINAL_SPAWN_FAILED'); }
    const session = { id, shell, cwd, executable:selected.path, pty, ...size, status: 'running', sequence: 0, history: [], historyBytes: 0, listeners: new Set() };
    sessions.set(id, session);
    publish(session, { type: 'ready', ...view(session) });
    pty.onData(data => publish(session, { type: 'output', data }));
    pty.onExit(event => exited(session, event.exitCode, event.signal));
    pty.on('error', () => { publish(session, { type: 'error', message: 'Соединение с интерактивной оболочкой прервано.' }); closeTerminal({ id,force:true }); });
    return view(session);
  } finally { creating--; }
}
export function inputTerminal({ id, data } = {}) {
  const session = getSession(id, true);
  if (typeof data !== 'string' || Buffer.byteLength(data) > MAX_INPUT_BYTES) throw fail('Ввод терминала должен быть строкой до 64 КиБ.');
  session.pty.write(data);
  return { id, accepted: true };
}
export function resizeTerminal({ id, cols, rows } = {}) {
  const session = getSession(id, true), size = dimensions(cols, rows);
  session.pty.resize(size.cols, size.rows); Object.assign(session, size);
  return view(session);
}
function forceClose(session){
  if(session.status==='exited')return;
  clearTimeout(session.gracefulInputTimer);clearTimeout(session.forceCloseTimer);
  session.status='closing';
  try{session.pty.kill();}catch{exited(session);}
}
export function closeTerminal({ id,force=false } = {}) {
  const session = getSession(id);
  if(force){forceClose(session);return {id,closed:true};}
  if (session.status !== 'exited' && session.status !== 'closing') {
    session.status = 'closing';
    if(session.shell==='julia'){
      // Let Julia leave its REPL before ConPTY is destroyed. node-pty's forced
      // console-list helper can otherwise race the already closed console.
      try{session.pty.write('\x03');session.gracefulInputTimer=setTimeout(()=>{if(session.status!=='closing')return;try{session.pty.write('exit()\r');}catch{forceClose(session);}},100);session.gracefulInputTimer.unref();session.forceCloseTimer=setTimeout(()=>forceClose(session),3000);session.forceCloseTimer.unref();}catch{forceClose(session);}
    }else forceClose(session);
  }
  return { id, closed: true };
}
export function listTerminals() { return { terminals: [...sessions.values()].map(view), maxSessions: MAX_SESSIONS }; }
export function subscribeTerminal(id, listener, { afterSequence = 0 } = {}) {
  const session = getSession(id);
  if (typeof listener !== 'function' || !Number.isSafeInteger(afterSequence) || afterSequence < 0) throw fail('Некорректная подписка терминала.');
  session.listeners.add(listener);
  for (const { message } of session.history) if (message.sequence > afterSequence) listener(message);
  return () => session.listeners.delete(listener);
}
export function closeAllTerminals() {
  for (const session of sessions.values()) closeTerminal({ id: session.id,force:true });
}

async function selfTest({ live = false } = {}) {
  const assert = await import('node:assert/strict');
  assert.throws(() => dimensions(0, 24)); assert.throws(() => dimensions(80, 999));
  assert.throws(() => inputTerminal({ id: 'not-a-session', data: 'PUBLIC_QA' }), error => error.status === 404);
  process.env.ENGEE_QA_DUMMY_SECRET = 'PUBLIC_QA_NOT_A_SECRET'; process.env.ANTHROPIC_QA_DUMMY_SECRET = 'PUBLIC_QA_NOT_A_SECRET';
  const env = environment(path.join(ROOT, 'data/terminal/qa'));
  assert.equal(env.ENGEE_QA_DUMMY_SECRET, undefined); assert.equal(env.ANTHROPIC_QA_DUMMY_SECRET, undefined);
  delete process.env.ENGEE_QA_DUMMY_SECRET; delete process.env.ANTHROPIC_QA_DUMMY_SECRET;
  const detected = await detectShells();
  if (!live) { console.log(JSON.stringify({ pass: true, realShellsStarted: 0, shells: detected.shells.map(({ id, available }) => ({ id, available })) })); return; }
  const workspace = path.join(ROOT, 'data/terminal/qa-workspace-' + randomUUID()); await fs.mkdir(workspace, { recursive: true });
  const report = [];
  try {
    for (const candidate of detected.shells.filter(item => item.available&&item.id!=='julia')) {
      const terminal = await createTerminal({ workspace, shell: candidate.id, cols: 92, rows: 28 });
      let output = '', exitEvent = null;
      const unsubscribe = subscribeTerminal(terminal.id, event => { if (event.type === 'output') output += event.data; if (event.type === 'exit') exitEvent = event; });
      try {
        const command = candidate.id === 'powershell' ? "Write-Output ('ENGEE_'+'PTY_OK'); Write-Output (Get-Location).Path\r" : "printf 'ENGEE_%s\\n' 'PTY_OK'; pwd\r";
        inputTerminal({ id: terminal.id, data: command });
        const deadline = Date.now() + 15000;
        while ((!output.includes('ENGEE_PTY_OK') || !output.toLowerCase().includes('qa-workspace-')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(output.includes('ENGEE_PTY_OK'), candidate.id + ': interactive output marker absent');
        assert.ok(output.toLowerCase().includes('qa-workspace-'), candidate.id + ': working directory absent');
        const resized = resizeTerminal({ id: terminal.id, cols: 110, rows: 36 }); assert.equal(resized.cols, 110); assert.equal(resized.rows, 36);
        const replay = []; const stopReplay = subscribeTerminal(terminal.id, event => replay.push(event), { afterSequence: 0 }); stopReplay();
        assert.ok(replay.some(event => event.type === 'output' && event.data.includes('ENGEE_PTY_OK')));
        inputTerminal({ id: terminal.id, data: 'exit\r' });
        const exitDeadline = Date.now() + 10000; while (!exitEvent && Date.now() < exitDeadline) await new Promise(resolve => setTimeout(resolve, 100));
        assert.ok(exitEvent, candidate.id + ': exit event absent');
        assert.throws(() => inputTerminal({ id: terminal.id, data: 'PUBLIC_QA' }), error => error.status === 409);
        report.push({ shell: candidate.id, nativePty: true, echo: true, workspace: true, resize: true, replay: true, exitCode: exitEvent.exitCode });
      } finally { unsubscribe(); closeTerminal({ id: terminal.id }); }
    }
    assert.ok(report.length > 0, 'No shell was tested');
    console.log(JSON.stringify({ pass: true, actualCredentialsRead: false, cloudRequests: 0, tests: report }));
  } finally { closeAllTerminals(); }
}
if (process.argv.includes('--self-test') && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await selfTest({ live: process.argv.includes('--live') });
