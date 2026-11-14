import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Official protocol: https://engee.com/helpcenter/stable/ru/external-software/external-software-interface-for-engee.html
// This module accepts already selected bytes; it never reads local paths or credentials.
const MAX_UPLOAD = 64 * 1024 * 1024;
const PRIVATE_NAME = /^(?:credentials?|secrets?|tokens?|passwords?|settings|config|private[._-]?key|access[._-]?token|api[._-]?key|client[._-]?secret)(?:[._-]|$)|^id_(?:rsa|ed25519)(?:[._-]|$)|\.(?:pem|key|p12|pfx|ppk|kdbx|keystore)$/i;
const fail = (message, status = 400, code = 'ENGEE_FILE_INVALID') => Object.assign(new Error(message), { status, code });
function runtimeBase(value) {
  let url; try { url = new URL(value); } catch { throw fail('Некорректный адрес работающей сессии Engee.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw fail('Нужен адрес сессии Engee без пароля и параметров.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw fail('Для удалённой сессии Engee нужен HTTPS.');
  return url.href.replace(/\/+$/, '');
}
function safePart(value) {
  return value.length > 0 && value.length <= 240 && value !== '.' && value !== '..' && !value.startsWith('.') && !PRIVATE_NAME.test(value) && !/[\\/:\x00-\x1f\x7f%]/.test(value);
}
export function validateRemoteDirectory(value = '') {
  if (typeof value !== 'string' || value.length > 2000) throw fail('Укажите папку внутри /user.');
  let relative = value;
  if (relative === '/user' || relative === '/user/') relative = '';
  else if (relative.startsWith('/user/')) relative = relative.slice(6);
  else if (relative.startsWith('/')) throw fail('Передача разрешена только внутри /user.', 403);
  relative = relative.replace(/\/$/, '');
  if (relative && !relative.split('/').every(safePart)) throw fail('Папка содержит недопустимый или закрытый компонент.', 403);
  return relative ? '/user/' + relative : '/user';
}
export function validateRemoteFilename(value) {
  if (typeof value !== 'string' || !safePart(value)) throw fail('Выберите обычный файл проекта без закрытых данных.', 403);
  return value;
}
async function selectedBytes(value) {
  let bytes;
  const size = value instanceof Blob ? value.size : value instanceof Uint8Array || value instanceof ArrayBuffer ? value.byteLength : null;
  if (size !== null && size > MAX_UPLOAD) throw fail('Размер файла превышает 64 МиБ.', 413);
  if (value instanceof Blob) bytes = Buffer.from(await value.arrayBuffer());
  else if (value instanceof Uint8Array) bytes = Buffer.from(value);
  else if (value instanceof ArrayBuffer) bytes = Buffer.from(value.slice(0));
  else throw fail('Передайте байты явно выбранного файла, а не локальный путь.');
  if (bytes.length > MAX_UPLOAD) throw fail('Размер файла превышает 64 МиБ.', 413);
  return bytes;
}
function describe(bytes, name, destination) {
  return { name, destination, requestedPath: destination + '/' + name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), collisionPolicy: 'suffix', requiresConfirmation: true };
}
export async function prepareRemoteUpload({ file, name, destination = 'EngeeAgent' }) {
  const filename = validateRemoteFilename(name), directory = validateRemoteDirectory(destination);
  return describe(await selectedBytes(file), filename, directory);
}
export async function uploadRemoteFile({ request, runtimeUrl, file, name, destination = 'EngeeAgent', confirmed = false, expectedSha256 }) {
  if (typeof request !== 'function') throw fail('Не задан обработчик запросов Engee.');
  if (confirmed !== true) throw fail('Сначала подтвердите передачу выбранного файла в Engee.', 403, 'ENGEE_UPLOAD_CONFIRMATION_REQUIRED');
  const base = runtimeBase(runtimeUrl), filename = validateRemoteFilename(name), directory = validateRemoteDirectory(destination), bytes = await selectedBytes(file);
  const preview = describe(bytes, filename, directory);
  if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedSha256) || preview.sha256 !== expectedSha256.toLowerCase()) throw fail('Файл изменился после предварительного просмотра. Подтвердите его заново.', 409, 'ENGEE_UPLOAD_CHANGED');
  const form = new FormData();
  form.append('paths', JSON.stringify({ sources: [directory] }));
  form.append('upload_files', new Blob([bytes], { type: 'application/octet-stream' }), filename);
  // The callback must retain FormData and let fetch generate the multipart boundary.
  // Existing authenticated JSON callbacks may return a parsed object; raw callbacks return Response.
  const response = await request(base + '/external/file/upload', 'POST', form, { responseType: 'raw' });
  if (response instanceof Response) {
    if (response.redirected) throw fail('Engee перенаправила загрузку. Проверьте доступ к работающей сессии.', 502, 'ENGEE_UPLOAD_REDIRECTED');
    if (!response.ok) throw fail('Engee отклонила передачу файла (HTTP ' + response.status + ').', response.status, 'ENGEE_UPLOAD_HTTP_ERROR');
    // An upload response schema is not documented; do not invent an actual saved path.
    await response.body?.cancel();
  }
  return { accepted: true, ...preview, actualPath: null, message: 'Файл передан в Engee. При совпадении имени Engee добавляет суффикс; существующий файл сохраняется.' };
}
export function remoteListCommand(relative = '') {
  const directory = validateRemoteDirectory(relative), encoded = Buffer.from(directory, 'utf8').toString('base64');
  // No user code is interpolated: the path is base64, scope checks are fixed, and no file is read.
  // Base filesystem functions are sufficient; this does not require an optional JSON package.
  return `using Base64\nlet root = realpath("/user"), requested = String(base64decode("${encoded}"))\n    current = "/user"\n    for component in split(replace(requested, r"^/user/?" => ""), '/'; keepempty=false)\n        current = joinpath(current, component)\n        islink(current) && error("Symbolic-link directory is not allowed")\n    end\n    directory = realpath(requested)\n    (directory == root || startswith(directory, root * "/")) || error("Directory must be inside /user")\n    names = filter(name -> !startswith(name, ".") && !occursin(r"^(credentials?|secrets?|tokens?|passwords?|settings|config)([._-]|$)|^id_(rsa|ed25519)([._-]|$)"i, name), readdir(directory; join=false, sort=true))\n    repr(names[1:min(length(names), 1000)])\nend`;
}
export async function listRemoteFiles(request, runtimeUrl, relative = '') {
  if (typeof request !== 'function') throw fail('Не задан обработчик запросов Engee.');
  const directory = validateRemoteDirectory(relative);
  const response = await request(runtimeBase(runtimeUrl) + '/external/command/eval', 'POST', { command: remoteListCommand(directory) });
  if (typeof response?.result !== 'string') throw fail('Engee не вернула ожидаемый список имён.', 502, 'ENGEE_FILE_LIST_INVALID');
  return { directory, text: response.result.slice(0, 256000), format: 'julia-repr', limit: 1000, readOnly: true };
}

async function selfTest() {
  const assert = await import('node:assert/strict');
  assert.equal(validateRemoteDirectory('Мои модели/demo'), '/user/Мои модели/demo');
  assert.equal(validateRemoteDirectory('/user/EngeeAgent'), '/user/EngeeAgent');
  for (const bad of ['/tmp', '../escape', '/user/../escape', '/user/.ssh', 'foo\\bar', 'foo//bar', 'foo/%2e%2e', 'credentials']) assert.throws(() => validateRemoteDirectory(bad));
  for (const bad of ['.env', 'secret.txt', 'credentials.json', 'id_rsa', 'private_key.txt', 'auth.pem', '../a.engee', 'a/b.engee']) assert.throws(() => validateRemoteFilename(bad));
  const bytes = Buffer.from('PUBLIC_QA_NATIVE_MODEL_BYTES'), prepared = await prepareRemoteUpload({ file: bytes, name: 'public.engee', destination: 'qa' });
  let calls = 0;
  const request = async (url, method, form, options) => {
    calls++; assert.equal(url, 'https://engee.example/runtime/external/file/upload'); assert.equal(method, 'POST'); assert.equal(options.responseType, 'raw');
    assert.deepEqual(JSON.parse(form.get('paths')), { sources: ['/user/qa'] });
    assert.equal(form.get('upload_files').name, 'public.engee'); assert.deepEqual(Buffer.from(await form.get('upload_files').arrayBuffer()), bytes);
    return new Response('{}', { status: 200 });
  };
  await assert.rejects(uploadRemoteFile({ request, runtimeUrl: 'https://engee.example/runtime', file: bytes, name: 'public.engee', destination: 'qa', expectedSha256: prepared.sha256 }), error => error.status === 403);
  await assert.rejects(uploadRemoteFile({ request, runtimeUrl: 'https://engee.example/runtime', file: Buffer.from('changed'), name: 'public.engee', destination: 'qa', confirmed: true, expectedSha256: prepared.sha256 }), error => error.status === 409);
  assert.equal(calls, 0);
  const uploaded = await uploadRemoteFile({ request, runtimeUrl: 'https://engee.example/runtime', file: bytes, name: 'public.engee', destination: 'qa', confirmed: true, expectedSha256: prepared.sha256 });
  assert.equal(uploaded.accepted, true); assert.equal(uploaded.actualPath, null); assert.equal(calls, 1);
  await assert.rejects(uploadRemoteFile({ request, runtimeUrl: 'http://outside.example/runtime', file: bytes, name: 'public.engee', confirmed: true, expectedSha256: prepared.sha256 }), error => error.status === 400);
  const list = await listRemoteFiles(async (url, method, payload) => { assert.ok(url.endsWith('/external/command/eval')); assert.equal(method, 'POST'); assert.ok(payload.command.includes('islink(current)')); assert.ok(!payload.command.includes('JSON')); return { result: '["public.engee"]' }; }, 'https://engee.example/runtime', 'qa');
  assert.equal(list.text, '["public.engee"]'); assert.equal(list.readOnly, true);
  console.log(JSON.stringify({ pass: true, networkRequests: 0, actualFilesRead: 0, uploadCalls: calls, confirmationAndHashChecked: true }));
}
if (process.argv.includes('--self-test') && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await selfTest();
