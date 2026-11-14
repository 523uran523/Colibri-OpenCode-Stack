import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createTerminal, inputTerminal, closeTerminal } from './terminal.mjs';

const extensions = new Set(['.exe', '.cmd', '.bat', '.ps1']);
const protectedProject = value => /(?:^|[\\/])summy(?:[\\/]|$)/i.test(value);
const controls = /[\x00-\x1f\x7f]/;
const fail = (message, status = 400, code = 'PROGRAM_INVALID') => Object.assign(new Error(message), { status, code });

async function regularFileWithoutLinks(file, directory = false) {
  // Check every parent before descending, so junctions cannot redirect into another project.
  const { root } = path.parse(file), parts = file.slice(root.length).split(path.sep);
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink() || (i < parts.length - 1 || directory ? !stat.isDirectory() : !stat.isFile())) return false;
  }
  return true;
}
async function firstExecutable(candidates) {
  for (const candidate of [...new Set(candidates.filter(Boolean))]) {
    if (!path.isAbsolute(candidate) || protectedProject(candidate) || controls.test(candidate) || !extensions.has(path.extname(candidate).toLowerCase())) continue;
    try { if (await regularFileWithoutLinks(path.resolve(candidate))) return path.resolve(candidate); } catch {}
  }
  return '';
}

export async function detectPrograms() {
  // Metadata only: no CLI execution, authentication, sessions or global configuration reads.
  const folders = (process.env.PATH || '').split(path.delimiter).map(dir => dir.replace(/^"|"$/g, '')).filter(dir => dir && path.isAbsolute(dir) && !protectedProject(dir));
  const home = os.homedir(), local = process.env.LOCALAPPDATA || path.join(home, 'AppData/Local');
  const fromPath = name => folders.flatMap(dir => ['.exe', '.cmd', '.bat', '.ps1'].map(ext => path.join(dir, name + ext)));
  const codexFallbacks = [];
  const codexBin = path.join(local, 'OpenAI/Codex/bin');
  if (!protectedProject(codexBin)) {
    try {
      if (await regularFileWithoutLinks(codexBin, true)) for (const entry of (await fs.readdir(codexBin, { withFileTypes: true })).slice(0, 64)) {
        if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.')) codexFallbacks.push(path.join(codexBin, entry.name, 'codex.exe'));
      }
    } catch {}
  }
  const presets = [
    { id: 'claude', name: 'Claude Code', candidates: [...fromPath('claude'), path.join(home, '.local/bin/claude.exe')] },
    { id: 'codex', name: 'Codex CLI', candidates: [...fromPath('codex'), ...codexFallbacks] },
    { id: 'opencode', name: 'OpenCode', candidates: [...fromPath('opencode'), path.join(home, '.local/bin/opencode.exe')] },
  ];
  const programs = [];
  for (const item of presets) {
    const executable = await firstExecutable(item.candidates);
    programs.push({ id: item.id, name: item.name, executable, available: !!executable, args: [] });
  }
  return { programs };
}

export async function validateProgram(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw fail('Укажите программу и отдельный список аргументов.');
  const executable = settings.executable;
  if (typeof executable !== 'string' || !executable.trim() || executable.length > 32767 || !path.isAbsolute(executable) || controls.test(executable)) throw fail('Укажите полный путь к программе.');
  if (protectedProject(executable) || protectedProject(path.resolve(executable))) throw fail('Подключение доступно только в контексте проекта Engee.', 403, 'PROGRAM_PROJECT_FORBIDDEN');
  const file = path.resolve(executable), extension = path.extname(file).toLowerCase();
  if (!extensions.has(extension)) throw fail('Выберите файл .exe, .cmd, .bat или .ps1.');
  const args = settings.args ?? [];
  if (!Array.isArray(args) || args.length > 64 || args.some(arg => typeof arg !== 'string' || arg.length > 8192 || controls.test(arg)) || args.reduce((sum, arg) => sum + Buffer.byteLength(arg), 0) > 24576) throw fail('Аргументы задаются списком строк без переводов строк, до 64 аргументов и 24 КиБ.');
  if (args.some(protectedProject)) throw fail('Аргументы не должны обращаться к другому проекту.', 403, 'PROGRAM_PROJECT_FORBIDDEN');
  // Batch scripts introduce a second command parser after PowerShell. Refuse its metacharacters.
  if (['.cmd', '.bat'].includes(extension) && args.some(arg => /["&|<>^%!()]/.test(arg))) throw fail('Аргументы .cmd/.bat не должны содержать командные символы: используйте исполняемый .exe или .ps1.');
  let available = false;
  try { available = await regularFileWithoutLinks(file); } catch {}
  if (!available) throw fail('Программа не найдена или путь содержит ссылку. Выберите обычный файл программы.', 404, 'PROGRAM_NOT_FOUND');
  return { executable: file, args: [...args] };
}

const literal = value => "'" + value.replace(/'/g, "''") + "'";
function windowsArgument(value) {
  // Microsoft CRT quoting: double backslashes before quotes and before the closing quote.
  return '"' + value.replace(/(\\*)"/g, (_, slashes) => slashes + slashes + '\\"').replace(/\\+$/, slashes => slashes + slashes) + '"';
}
function invocation(program, workspace) {
  const extension = path.extname(program.executable).toLowerCase();
  if (['.cmd', '.bat'].includes(extension)) return '& ' + literal(program.executable) + ' @(' + program.args.map(literal).join(',') + ')\r';
  let executable = program.executable, args = program.args;
  if (extension === '.ps1') {
    const root = process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows';
    executable = path.join(root, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    args = ['-NoLogo', '-NoProfile', '-File', program.executable, ...args];
  }
  // PowerShell 5.1 native & invocation loses embedded quotes; provide an exact command line.
  // NoNewWindow attaches the program to this PTY. Execution policy is never changed.
  return 'Start-Process -FilePath ' + literal(executable) + (args.length ? ' -ArgumentList ' + literal(args.map(windowsArgument).join(' ')) : '') + ' -WorkingDirectory ' + literal(workspace) + ' -NoNewWindow -Wait -ErrorAction Stop\r';
}

export async function launchProgram({ program, workspace, powershellPath = '' } = {}) {
  const validated = await validateProgram(program);
  const terminal = await createTerminal({ workspace, powershellPath, shell: 'powershell' });
  try { inputTerminal({ id: terminal.id, data: invocation(validated, terminal.cwd) }); }
  catch { closeTerminal({ id: terminal.id }); throw fail('Не удалось передать команду запуска в терминал.', 503, 'PROGRAM_LAUNCH_FAILED'); }
  return { terminal, message: 'Команда запуска передана в терминал проекта. Проверьте вывод программы в новой сессии.' };
}
