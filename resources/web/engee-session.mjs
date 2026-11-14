import { fileURLToPath } from 'node:url';
import path from 'node:path';

const STATES = new Set(['starting', 'running', 'stopping', 'stopped']);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function baseUrl(value) {
  let url; try { url = new URL(value); } catch { throw fail('Некорректный адрес кабинета Engee.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw fail('Нужен адрес Engee без пароля и параметров.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw fail('Для удалённого Engee нужен HTTPS.');
  return url.href.replace(/\/$/, '');
}
const endpoint = (base, route) => base + '/account/api/engee/' + route;
const idValue = value => typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : Number.isSafeInteger(value) ? value : null;
const numberValue = value => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
const textValue = value => typeof value === 'string' ? value.slice(0, 200) : '';
function rows(data) { return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : []; }
function bound(item, names) {
  for (const key of names) {
    const value = numberValue(item?.[key]);
    if (value !== null) return value;
  }
  return null;
}
function limitView(item) {
  const product = item?.baseProduct || {};
  return {
    id: idValue(item?.id),
    name: textValue(product.name || product.systemName || 'Лимит'),
    systemName: textValue(product.systemName),
    use: numberValue(item?.use),
    min: bound(item, ['min', 'minimum', 'minUse', 'minimumUse']),
    max: bound(item, ['max', 'maximum', 'maxUse', 'maximumUse', 'limit', 'availableUse', 'total']),
    available: typeof item?.available === 'boolean' ? item.available : true,
  };
}
function optionsView(versions, limits) {
  const availableVersions = rows(versions).map(item => ({ id: idValue(item?.id), name: textValue(item?.name) })).filter(item => item.id !== null && item.name);
  const availableLimits = rows(limits).map(limitView).filter(item => item.id !== null);
  const timeout = availableLimits.find(item => item.systemName === 'timeout');
  return {
    versions: availableVersions,
    limits: availableLimits,
    inactivityTimeout: {
      unit: 'seconds',
      default: timeout?.use !== null && timeout?.use !== undefined ? timeout.use * 60 : 600,
      min: Math.max(60, (timeout?.min ?? 1) * 60),
      max: timeout?.max === null || timeout?.max === undefined ? null : timeout.max * 60,
      step: 60,
      available: !!timeout && timeout.available,
    },
  };
}
function safeInfo(info, base, fallback = 'unknown') {
  const status = STATES.has(info?.serverStatus) ? info.serverStatus : fallback;
  let runtimeUrl = null;
  if (typeof info?.url === 'string' && info.url) {
    try {
      const url = new URL(info.url, base + '/');
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) runtimeUrl = url.href.replace(/\/$/, '');
      else if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.username && !url.password && !url.search && !url.hash) runtimeUrl = url.href.replace(/\/$/, '');
    } catch {}
  }
  const version = typeof info?.version === 'string' ? info.version : typeof info?.serverVersion === 'string' ? info.serverVersion : textValue(info?.productVersion?.name) || null;
  return { serverStatus: status, runtimeUrl, version: version ? textValue(version) : null };
}
async function readOptions(request, base) {
  const [versions, limits] = await Promise.all([request(endpoint(base, 'version'), 'GET'), request(endpoint(base, 'limits'), 'GET')]);
  return { versions, limits, view: optionsView(versions, limits) };
}
/** Only product versions/limits are exposed; account, licence and user metadata are dropped. */
export async function sessionOptions(request, accountUrl) {
  if (typeof request !== 'function') throw fail('Не настроен запрос Engee.');
  return (await readOptions(request, baseUrl(accountUrl))).view;
}
function startPayload(options, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail('Некорректные параметры запуска Engee.');
  const payload = {};
  if (args.versionId !== undefined && args.versionId !== null && args.versionId !== '') {
    const versionId = idValue(args.versionId);
    if (versionId === null || !options.view.versions.some(version => String(version.id) === String(versionId))) throw fail('Выбранная версия недоступна для текущей лицензии. Обновите список версий.', 409);
    payload.versionId = options.view.versions.find(version => String(version.id) === String(versionId)).id;
  }
  // Without a selected version, omit versionId and let the Engee API choose its default.
  const payloadLimits = rows(options.limits).filter(item => idValue(item?.id) !== null && numberValue(item?.use) !== null).map(item => ({ profileOrganisationLicenseLimitId: item.id, use: numberValue(item.use) }));
  const timeout = options.view.limits.find(item => item.systemName === 'timeout');
  const hasTimeout = args.inactivityTimeout !== undefined && args.inactivityTimeout !== null && args.inactivityTimeout !== '';
  if (hasTimeout) {
    const seconds = numberValue(args.inactivityTimeout);
    if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds % 60 !== 0) throw fail('Таймаут простоя задаётся в секундах: минимум 60, целое число минут.');
    if (!timeout || !timeout.available) throw fail('Текущая лицензия не предоставляет настройку таймаута простоя.', 409);
    const minutes = seconds / 60;
    if (timeout.min !== null && minutes < timeout.min) throw fail('Таймаут ниже разрешённого текущей лицензией.');
    if (timeout.max !== null && minutes > timeout.max) throw fail('Таймаут превышает разрешённый текущей лицензией.');
    const row = payloadLimits.find(item => String(item.profileOrganisationLicenseLimitId) === String(timeout.id));
    if (!row) throw fail('Не удалось определить лимит таймаута Engee.', 409);
    row.use = minutes;
  }
  if (payloadLimits.length) payload.limits = payloadLimits;
  return Object.keys(payload).length ? payload : undefined;
}
function notStopped(info, base) {
  if (info.serverStatus === 'running') return { ...safeInfo(info, base), changed: false, accepted: false, message: 'Engee уже запущена. Повторный запуск и перезапуск не выполнены.' };
  if (info.serverStatus === 'starting') return { ...safeInfo(info, base), changed: false, accepted: false, message: 'Engee уже запускается. Дождитесь готовности.' };
  throw fail(info.serverStatus === 'stopping' ? 'Engee ещё останавливается. Дождитесь статуса stopped.' : 'Неизвестный статус Engee. Обновите состояние перед запуском.', 409);
}
/** Caller must obtain user confirmation before invoking this mutation. */
export async function startSession(request, accountUrl, args = {}) {
  if (typeof request !== 'function') throw fail('Не настроен запрос Engee.');
  const base = baseUrl(accountUrl), info = await request(endpoint(base, 'info'), 'GET');
  if (info.serverStatus !== 'stopped') return notStopped(info, base);
  const options = await readOptions(request, base), payload = startPayload(options, args);
  const current = await request(endpoint(base, 'info'), 'GET');
  if (current.serverStatus !== 'stopped') return notStopped(current, base);
  await request(endpoint(base, 'start'), 'POST', payload);
  let after;
  try { after = await request(endpoint(base, 'info'), 'GET'); } catch { after = { serverStatus: 'starting' }; }
  return { ...safeInfo(after, base, 'starting'), changed: true, accepted: true, message: 'Команда запуска Engee принята. Обновите состояние, чтобы подтвердить готовность.' };
}
/** DELETE may return 204; the injected request adapter should return {} for it. */
export async function stopSession(request, accountUrl) {
  if (typeof request !== 'function') throw fail('Не настроен запрос Engee.');
  const base = baseUrl(accountUrl), info = await request(endpoint(base, 'info'), 'GET');
  if (info.serverStatus === 'stopped') return { ...safeInfo(info, base), changed: false, accepted: false, message: 'Engee уже остановлена.' };
  if (info.serverStatus === 'stopping') return { ...safeInfo(info, base), changed: false, accepted: false, message: 'Engee уже останавливается.' };
  if (!['running', 'starting'].includes(info.serverStatus)) throw fail('Неизвестный статус Engee. Обновите состояние перед остановкой.', 409);
  await request(endpoint(base, 'stop'), 'DELETE');
  let after;
  try { after = await request(endpoint(base, 'info'), 'GET'); } catch { after = { serverStatus: 'stopping' }; }
  return { ...safeInfo(after, base, 'stopping'), changed: true, accepted: true, message: 'Команда остановки Engee принята. Обновите состояние, чтобы подтвердить остановку.' };
}

// Fully offline contract verification: requests below are mocks, never Engee HTTP.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--self-test')) {
  const { default: assert } = await import('node:assert/strict');
  const versions = { results: [{ id: 'public-v1', name: 'Public QA stable', username: 'must-not-leak' }] };
  const limits = { results: [{ id: 'public-timeout', use: 10, min: 1, max: 60, baseProduct: { systemName: 'timeout', name: 'Timeout' }, profileOrganisationLicense: { username: 'must-not-leak' } }] };
  const publicOptions = await sessionOptions(async url => url.endsWith('/version') ? versions : limits, 'https://engee.com');
  assert.equal(publicOptions.inactivityTimeout.default, 600); assert.equal(publicOptions.inactivityTimeout.max, 3600); assert.ok(!JSON.stringify(publicOptions).includes('must-not-leak'));
  let calls = [], infoCount = 0;
  const request = async (url, method, body) => { calls.push({ url, method, body }); if (url.endsWith('/version')) return versions; if (url.endsWith('/limits')) return limits; if (url.endsWith('/info')) return ++infoCount >= 3 ? { serverStatus: 'starting', url: '/prod/public-qa/' } : { serverStatus: 'stopped' }; return {}; };
  const started = await startSession(request, 'https://engee.com', { versionId: 'public-v1', inactivityTimeout: 600 });
  assert.equal(started.serverStatus, 'starting'); const post = calls.find(call => call.method === 'POST'); assert.equal(post.body.versionId, 'public-v1'); assert.equal(post.body.limits[0].use, 10); assert.equal(started.runtimeUrl, 'https://engee.com/prod/public-qa');
  const withoutVersion = startPayload({ versions, limits, view: optionsView(versions, limits) }, {}); assert.equal(withoutVersion.versionId, undefined); assert.equal(withoutVersion.limits[0].use, 10);
  assert.throws(() => startPayload({ versions, limits, view: optionsView(versions, limits) }, { inactivityTimeout: 601 }));
  assert.throws(() => startPayload({ versions, limits, view: optionsView(versions, limits) }, { inactivityTimeout: 3660 }));
  calls = []; const already = await startSession(async (url, method) => { calls.push(method); return { serverStatus: 'running' }; }, 'https://engee.com'); assert.equal(already.changed, false); assert.deepEqual(calls, ['GET']);
  calls = []; infoCount = 0; const stopped = await stopSession(async (url, method) => { calls.push(method); return method === 'DELETE' ? {} : { serverStatus: ++infoCount === 1 ? 'running' : 'stopped' }; }, 'https://engee.com'); assert.equal(stopped.serverStatus, 'stopped'); assert.ok(calls.includes('DELETE'));
  console.log(JSON.stringify({ selfTest: 'pass', networkRequests: 0 }));
}
