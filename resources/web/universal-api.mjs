// Explicit user-configured API adapters. No filesystem, environment or CLI authentication.
// Anthropic: https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
// Gemini: https://ai.google.dev/api/generate-content
import { randomUUID } from 'node:crypto';
import { runOpenAI } from './openai-responses.mjs';

const FORMATS = new Set(['chat-completions', 'responses', 'anthropic', 'gemini', 'custom-json']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);
const REQUEST_LIMIT = 64 * 1024 * 1024;
const RESPONSE_LIMIT = 16 * 1024 * 1024;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function jsonCopy(value, limit = REQUEST_LIMIT, status = 400) {
  let nodes = 0;
  const visit = (v, depth) => {
    if (++nodes > 250000 || depth > 48) throw fail('JSON превышает допустимую сложность.', status);
    if (v == null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (typeof v !== 'object' || !Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v))) throw fail('Ожидается обычное JSON-значение.', status);
    for (const key of Object.keys(v)) {
      if (FORBIDDEN.has(key)) throw fail('Недопустимое поле JSON.', status);
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor || !own(descriptor, 'value')) throw fail('JSON не должен содержать вычисляемые свойства.', status);
      visit(descriptor.value, depth + 1);
    }
  };
  visit(value, 0);
  const serialized = JSON.stringify(value);
  if (serialized == null || Buffer.byteLength(serialized) > limit) throw fail('JSON превышает допустимый размер.', status);
  return JSON.parse(serialized);
}

function string(value, label, max = 1024, empty = false) {
  if (typeof value !== 'string' || value.length > max || !empty && !value.trim()) throw fail(`Некорректное поле API: ${label}.`);
  return value;
}
function toolName(value, status = 400) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw fail('Некорректное имя инструмента API.', status);
  return value;
}
function toolArguments(value, status = 502) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { throw fail('API вернул некорректные JSON-аргументы инструмента.', status); }
  }
  if (!object(parsed)) throw fail('Аргументы инструмента должны быть JSON-объектом.', status);
  return jsonCopy(parsed, 1024 * 1024, status);
}
function canonicalCall({ id, name, args }, allowed, status = 502) {
  toolName(name, status);
  if (!allowed.has(name)) throw fail('API запросил инструмент, которого нет в разрешённом наборе.', status);
  if (id != null && (typeof id !== 'string' || !id || id.length > 256)) throw fail('API вернул некорректный идентификатор инструмента.', status);
  return { id: id || `call_${randomUUID()}`, type: 'function', function: { name, arguments: JSON.stringify(toolArguments(args ?? {}, status)) } };
}
function canonicalTools(value) {
  if (!Array.isArray(value) || value.length > 128) throw fail('Некорректный набор инструментов API.');
  value = jsonCopy(value, 4 * 1024 * 1024);
  const names = new Set();
  return value.map(tool => {
    if (tool?.type !== 'function' || !object(tool.function)) throw fail('Поддерживаются только функции приложения.');
    const name = toolName(tool.function.name);
    if (names.has(name)) throw fail('Имена инструментов должны быть уникальными.');
    names.add(name);
    const parameters = tool.function.parameters ?? { type: 'object', properties: {} };
    if (!object(parameters)) throw fail('Ожидается JSON-схема аргументов инструмента.');
    return { type: 'function', function: { name, description: string(tool.function.description ?? '', 'description', 32768, true), parameters: jsonCopy(parameters, 1024 * 1024) } };
  });
}
function text(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw fail('Неподдерживаемое содержимое сообщения.');
  return content.map(part => {
    if (part?.type === 'text' && typeof part.text === 'string') return part.text;
    if (part?.type === 'refusal' && typeof part.refusal === 'string') return part.refusal;
    if (part?.type === 'image_url') return '';
    throw fail('Неподдерживаемая часть сообщения.');
  }).join('\n');
}
function history(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw fail('История должна содержать от 1 до 100 сообщений.');
  const copy = jsonCopy(value);
  for (const message of copy) {
    if (!object(message) || !['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)) throw fail('Некорректная роль сообщения API.');
    text(message.content);
    if (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 64)) throw fail('Некорректные вызовы инструментов в истории.');
    if (message.response_items != null && (!Array.isArray(message.response_items) || message.response_items.length > 1000)) throw fail('Некорректные native-элементы истории API.');
  }
  return copy;
}

function endpoint(baseUrl, suffix, exact = false) {
  let url;
  try { url = new URL(string(baseUrl, 'baseUrl', 4096)); } catch { throw fail('Некорректный адрес API.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback) || url.username || url.password || url.hash || !exact && url.search || /\{\{/.test(baseUrl)) throw fail('API должен использовать HTTPS или HTTP локального компьютера, без учётных данных в адресе.');
  const credentialFields = new Set(['apikey', 'key', 'token', 'authorization', 'accesstoken', 'apitoken', 'authtoken', 'refreshtoken', 'clientsecret', 'secret', 'password', 'auth', 'bearer', 'subscriptionkey', 'credential', 'credentials', 'signature', 'sig']);
  if ([...url.searchParams.keys()].some(key => credentialFields.has(key.replace(/[^A-Za-z0-9]/g, '').toLowerCase()))) throw fail('Ключ API нужно передавать в заголовке, а не в адресе.');
  if (!exact) {
    const path = url.pathname.replace(/\/+$/, '');
    url.pathname = path.endsWith(suffix) ? path : `${path}${suffix}`;
  }
  return url.href;
}

const PLACEHOLDER = /\{\{(messages|tools|model|prompt|apiKey)\}\}/g;
function interpolate(value, replacements) {
  if (typeof value === 'string') {
    const whole = /^\{\{(messages|tools|model|prompt|apiKey)\}\}$/.exec(value);
    if (whole) return jsonCopy(replacements[whole[1]]);
    if (/\{\{[^}]*\}\}/.test(value.replace(PLACEHOLDER, ''))) throw fail('Неизвестная переменная JSON-шаблона.');
    return value.replace(PLACEHOLDER, (_, key) => typeof replacements[key] === 'string' ? replacements[key] : JSON.stringify(replacements[key]));
  }
  if (Array.isArray(value)) return value.map(item => interpolate(item, replacements));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolate(item, replacements)]));
  return value;
}
function headers(template, replacements, defaults = {}) {
  if (template == null) template = {};
  if (!object(template) || Object.keys(template).length > 32) throw fail('Заголовки API должны быть JSON-объектом.');
  const output = new Headers(defaults);
  for (const [name, raw] of Object.entries(template)) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) || /^(host|cookie|set-cookie|content-length|connection|transfer-encoding|upgrade|proxy-authorization|proxy-connection|accept-encoding)$/i.test(name)) throw fail('Недопустимый заголовок API.');
    const value = interpolate(string(raw, 'header', 8192, true), replacements);
    if (typeof value !== 'string' || value.length > 8192 || /[\r\n\0]/.test(value)) throw fail('Некорректное значение заголовка API.');
    try { output.set(name, value); } catch { throw fail('Некорректный заголовок API.'); }
  }
  // Requests are always finite JSON, independent of user-supplied header casing.
  output.set('Content-Type', 'application/json');
  return Object.fromEntries(output.entries());
}

function readPath(value, path) {
  string(path, 'JSON path', 512, true);
  if (path === '' || path === '$') return value;
  if (path === '$.') throw fail('Некорректный JSON path.');
  let source = path.startsWith('$.') ? path.slice(2) : path.startsWith('$[') ? path.slice(1) : path;
  const tokens = [];
  while (source) {
    const match = /^(?:([A-Za-z_][A-Za-z0-9_-]*)|\[(\d{1,6})\])/.exec(source);
    if (!match) throw fail('JSON path поддерживает только поля через точку и числовые индексы.');
    const token = match[1] ?? Number(match[2]);
    if (FORBIDDEN.has(token) || tokens.length >= 32) throw fail('Недопустимый JSON path.');
    tokens.push(token);
    source = source.slice(match[0].length);
    if (source.startsWith('.')) source = source.slice(1);
    else if (source && !source.startsWith('[')) throw fail('Некорректный JSON path.');
    if (!source && /\.$/.test(path)) throw fail('Некорректный JSON path.');
  }
  let current = value;
  for (const token of tokens) {
    if (current == null || typeof current !== 'object' || !own(current, token)) return undefined;
    current = current[token];
  }
  return current;
}

async function postJson(url, payload, requestHeaders, signal) {
  const body = JSON.stringify(jsonCopy(payload));
  const timeout = AbortSignal.timeout(180000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetch(url, { method: 'POST', headers: requestHeaders, body, redirect: 'error', signal: combined });
  } catch {
    if (combined.aborted) throw Object.assign(fail('Запрос API отменён или время ожидания истекло.', 499), { name: 'AbortError' });
    throw fail('Не удалось подключиться к выбранному API. Проверьте адрес и доступность сервиса.', 502);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    const hint = response.status === 401 || response.status === 403 ? 'Проверьте ключ и права доступа.' : response.status === 404 ? 'Проверьте адрес API и идентификатор модели.' : response.status === 429 ? 'Достигнут лимит запросов или квота сервиса.' : 'Проверьте настройки и состояние сервиса.';
    throw fail(`API вернул HTTP ${response.status}. ${hint}`, 502);
  }
  if (Number(response.headers.get('content-length')) > RESPONSE_LIMIT) {
    await response.body?.cancel().catch(() => {});
    throw fail('Ответ API превышает допустимый размер.', 502);
  }
  const reader = response.body?.getReader();
  if (!reader) throw fail('API вернул пустой ответ.', 502);
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT) { await reader.cancel(); throw fail('Ответ API превышает допустимый размер.', 502); }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (combined.aborted) throw Object.assign(fail('Запрос API отменён или время ожидания истекло.', 499), { name: 'AbortError' });
    if (error?.status) throw error;
    throw fail('Не удалось прочитать ответ API.', 502);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('API вернул ответ, который не является JSON.', 502); }
  return jsonCopy(parsed, RESPONSE_LIMIT, 502);
}

function facade(content, calls = [], extra = {}, finish = 'stop') {
  const ids = new Set(calls.map(call => call.id));
  if (ids.size !== calls.length) throw fail('API вернул повторные идентификаторы вызовов инструментов.', 502);
  const message = { role: 'assistant', content, ...extra };
  if (calls.length) message.tool_calls = calls;
  return { choices: [{ message, finish_reason: calls.length ? 'tool_calls' : finish }] };
}
function chatHistory(messages) {
  return messages.map(message => {
    const output = { role: message.role, content: message.content ?? null };
    if (message.role === 'assistant' && message.tool_calls?.length) output.tool_calls = message.tool_calls;
    if (message.role === 'assistant' && typeof message.reasoning_content === 'string') output.reasoning_content = message.reasoning_content;
    if (message.role === 'tool') output.tool_call_id = string(message.tool_call_id, 'tool_call_id', 256);
    return output;
  });
}
function chatResponse(data, allowed) {
  const message = data?.choices?.[0]?.message;
  if (!object(message)) throw fail('API не вернул сообщение Chat Completions.', 502);
  if (message.content != null && typeof message.content !== 'string' && !Array.isArray(message.content)) throw fail('API вернул неподдерживаемое содержимое ответа.', 502);
  const content = text(message.content);
  if (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 64)) throw fail('API вернул некорректный набор вызовов.', 502);
  const calls = (message.tool_calls ?? []).map(call => {
    if (call?.type !== 'function') throw fail('API вернул неподдерживаемый тип инструмента.', 502);
    return canonicalCall({ id: call.id, name: call.function?.name, args: call.function?.arguments }, allowed);
  });
  return facade(content, calls, typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {}, data.choices[0].finish_reason ?? 'stop');
}

function imagePart(part, format) {
  const url = part?.image_url?.url;
  if (typeof url !== 'string') throw fail('Некорректное изображение в сообщении.');
  const inline = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(url);
  if (inline) return format === 'anthropic' ? { type: 'image', source: { type: 'base64', media_type: inline[1], data: inline[2] } } : { inlineData: { mimeType: inline[1], data: inline[2] } };
  if (format === 'anthropic') {
    let external; try { external = new URL(url); } catch { throw fail('Некорректный адрес изображения.'); }
    if (external.protocol === 'https:' && !external.username && !external.password) return { type: 'image', source: { type: 'url', url } };
  }
  throw fail('Для этого API используйте приложенное изображение в формате base64.');
}
function nativeContent(content, format) {
  if (content == null) return [];
  if (typeof content === 'string') return content ? [format === 'anthropic' ? { type: 'text', text: content } : { text: content }] : [];
  return content.map(part => part.type === 'image_url' ? imagePart(part, format) : format === 'anthropic' ? { type: 'text', text: part.type === 'refusal' ? part.refusal : part.text } : { text: part.type === 'refusal' ? part.refusal : part.text });
}
function mergeMessages(output, role, parts, field, toolFirst = false) {
  if (!parts.length) return;
  const previous = output.at(-1);
  if (previous?.role === role) previous[field].push(...parts);
  else output.push({ role, [field]: parts });
  if (toolFirst && role === 'user') output.at(-1)[field].sort((a, b) => Number(b.type === 'tool_result') - Number(a.type === 'tool_result'));
}
function anthropicHistory(messages, allowed) {
  const output = []; const system = []; const pending = new Set();
  for (const message of messages) {
    if (['system', 'developer'].includes(message.role)) { const value = text(message.content); if (value) system.push(value); continue; }
    if (message.role === 'tool') {
      const id = string(message.tool_call_id, 'tool_call_id', 256);
      if (!pending.delete(id)) throw fail('Результат инструмента не соответствует вызову Anthropic.');
      mergeMessages(output, 'user', [{ type: 'tool_result', tool_use_id: id, content: text(message.content), ...(message.is_error === true ? { is_error: true } : {}) }], 'content', true);
      continue;
    }
    if (pending.size) throw fail('Результаты всех инструментов должны следовать сразу после вызовов Anthropic.');
    let parts;
    if (message.role === 'assistant' && message.response_items?.length) {
      parts = message.response_items;
      for (const part of parts) {
        if (!object(part) || !['text', 'tool_use', 'thinking', 'redacted_thinking'].includes(part.type)) throw fail('История содержит элементы другого формата API.');
        if (part.type === 'text' && typeof part.text !== 'string' || part.type === 'thinking' && (typeof part.thinking !== 'string' || typeof part.signature !== 'string') || part.type === 'redacted_thinking' && typeof part.data !== 'string') throw fail('Некорректный native-блок Anthropic.');
        if (part.type === 'tool_use') {
          if (!part.id) throw fail('Отсутствует идентификатор вызова Anthropic в истории.');
          const call = canonicalCall({ id: part.id, name: part.name, args: part.input }, allowed, 400);
          if (pending.has(call.id)) throw fail('Повторный идентификатор инструмента Anthropic.');
          pending.add(call.id);
        }
      }
    } else {
      parts = nativeContent(message.content, 'anthropic');
      for (const call of message.tool_calls ?? []) {
        const normalized = canonicalCall({ id: call.id, name: call.function?.name, args: call.function?.arguments }, allowed, 400);
        if (pending.has(normalized.id)) throw fail('Повторный идентификатор инструмента Anthropic.');
        pending.add(normalized.id);
        parts.push({ type: 'tool_use', id: normalized.id, name: normalized.function.name, input: JSON.parse(normalized.function.arguments) });
      }
    }
    mergeMessages(output, message.role === 'assistant' ? 'assistant' : 'user', parts, 'content', true);
  }
  if (pending.size) throw fail('В истории отсутствуют результаты инструментов Anthropic.');
  if (!output.length) throw fail('Anthropic ожидает пользовательское сообщение.');
  return { messages: output, ...(system.length ? { system: system.join('\n\n') } : {}) };
}
function anthropicResponse(data, allowed) {
  if (!Array.isArray(data?.content) || !data.content.length || data.content.length > 1000) throw fail('API не вернул native-блоки Anthropic.', 502);
  const calls = []; const visible = []; const preserved = [];
  for (const part of data.content) {
    if (!object(part) || !['text', 'tool_use', 'thinking', 'redacted_thinking'].includes(part.type)) throw fail('API вернул неподдерживаемый блок Anthropic.', 502);
    if (part.type === 'text') { if (typeof part.text !== 'string') throw fail('Некорректный текст ответа Anthropic.', 502); visible.push(part.text); }
    if (part.type === 'thinking' && (typeof part.thinking !== 'string' || typeof part.signature !== 'string') || part.type === 'redacted_thinking' && typeof part.data !== 'string') throw fail('Некорректный native-блок Anthropic.', 502);
    if (part.type === 'tool_use') {
      if (!part.id) throw fail('Отсутствует идентификатор вызова Anthropic.', 502);
      calls.push(canonicalCall({ id: part.id, name: part.name, args: part.input }, allowed));
    }
    preserved.push(part);
  }
  if (calls.length > 64) throw fail('API вернул слишком много вызовов инструментов.', 502);
  return facade(visible.join('\n'), calls, { response_items: preserved }, data.stop_reason === 'max_tokens' ? 'length' : 'stop');
}

function geminiHistory(messages, allowed) {
  const contents = []; const system = []; const pending = new Map();
  for (const message of messages) {
    if (['system', 'developer'].includes(message.role)) { const value = text(message.content); if (value) system.push({ text: value }); continue; }
    if (message.role === 'tool') {
      const id = string(message.tool_call_id, 'tool_call_id', 256); const call = pending.get(id);
      if (!call) throw fail('Результат инструмента не соответствует вызову Gemini.');
      pending.delete(id);
      let response; try { response = JSON.parse(text(message.content)); } catch { response = { output: text(message.content) }; }
      if (!object(response)) response = { output: response };
      mergeMessages(contents, 'user', [{ functionResponse: { name: call.name, response, ...(call.nativeId ? { id: call.nativeId } : {}) } }], 'parts');
      continue;
    }
    if (pending.size) throw fail('В истории Gemini отсутствует результат предыдущего инструмента.');
    let parts;
    if (message.role === 'assistant' && message.response_items?.length) {
      parts = message.response_items;
      let index = 0;
      for (const part of parts) {
        if (!object(part) || !own(part, 'text') && !own(part, 'functionCall') || own(part, 'text') && typeof part.text !== 'string' || part.thoughtSignature != null && typeof part.thoughtSignature !== 'string') throw fail('История содержит элементы другого формата API.');
        if (part.functionCall) {
          const call = canonicalCall({ id: part.functionCall.id ?? message.tool_calls?.[index]?.id, name: part.functionCall.name, args: part.functionCall.args }, allowed, 400);
          if (pending.has(call.id)) throw fail('Повторный идентификатор инструмента Gemini.');
          pending.set(call.id, { name: call.function.name, nativeId: part.functionCall.id }); index++;
        }
      }
    } else {
      parts = nativeContent(message.content, 'gemini');
      for (const call of message.tool_calls ?? []) {
        const normalized = canonicalCall({ id: call.id, name: call.function?.name, args: call.function?.arguments }, allowed, 400);
        if (pending.has(normalized.id)) throw fail('Повторный идентификатор инструмента Gemini.');
        pending.set(normalized.id, { name: normalized.function.name, nativeId: normalized.id });
        parts.push({ functionCall: { id: normalized.id, name: normalized.function.name, args: JSON.parse(normalized.function.arguments) } });
      }
    }
    mergeMessages(contents, message.role === 'assistant' ? 'model' : 'user', parts, 'parts');
  }
  if (pending.size) throw fail('В истории отсутствуют результаты инструментов Gemini.');
  if (!contents.length) throw fail('Gemini ожидает пользовательское сообщение.');
  return { contents, ...(system.length ? { systemInstruction: { parts: system } } : {}) };
}
function geminiResponse(data, allowed) {
  const candidate = data?.candidates?.[0]; const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || !parts.length || parts.length > 1000) throw fail('Gemini не вернул содержимое ответа. Проверьте ограничения модели.', 502);
  const visible = []; const reasoning = []; const calls = [];
  for (const part of parts) {
    if (!object(part) || !own(part, 'text') && !own(part, 'functionCall')) throw fail('Gemini вернул неподдерживаемое содержимое.', 502);
    if (part.thoughtSignature != null && typeof part.thoughtSignature !== 'string') throw fail('Gemini вернул некорректную подпись thoughtSignature.', 502);
    if (own(part, 'text')) {
      if (typeof part.text !== 'string') throw fail('Gemini вернул некорректный текст.', 502);
      (part.thought ? reasoning : visible).push(part.text);
    }
    if (part.functionCall) calls.push(canonicalCall({ id: part.functionCall.id, name: part.functionCall.name, args: part.functionCall.args }, allowed));
  }
  if (calls.length > 64) throw fail('API вернул слишком много вызовов инструментов.', 502);
  return facade(visible.join('\n'), calls, { response_items: parts, ...(reasoning.length ? { reasoning_content: reasoning.join('\n') } : {}) }, candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop');
}

function customResponse(data, settings, allowed) {
  const responsePath = settings.responsePath ?? 'choices[0].message.content';
  const value = readPath(data, responsePath);
  let calls = [];
  if (settings.toolsPath) {
    const values = readPath(data, settings.toolsPath);
    if (values !== undefined && (!Array.isArray(values) || values.length > 64)) throw fail('Путь инструментов должен возвращать массив.', 502);
    calls = (values ?? []).map(call => canonicalCall({
      id: readPath(call, settings.toolIdPath || 'id'),
      name: readPath(call, settings.toolNamePath || 'function.name'),
      args: readPath(call, settings.toolArgumentsPath || 'function.arguments')
    }, allowed));
  }
  if (value === undefined && !calls.length) throw fail('В ответе API не найден настроенный путь текста.', 502);
  const content = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return facade(content, calls);
}

/** Return one Chat Completions-shaped message; tools remain app-owned and are never executed here. */
export async function runUniversalApi({ settings, apiKey = '', messages, tools = [], signal } = {}) {
  if (!object(settings)) throw fail('Выберите поддерживаемый формат API.');
  settings = jsonCopy(settings, 2 * 1024 * 1024);
  if (!FORMATS.has(settings.format)) throw fail('Выберите поддерживаемый формат API.');
  const model = string(settings.model ?? '', 'model', 256, settings.format === 'custom-json');
  string(apiKey, 'apiKey', 8192, true);
  if (/[\r\n\0]/.test(apiKey)) throw fail('Некорректный ключ API.');
  messages = history(messages); tools = canonicalTools(tools);
  const allowed = new Set(tools.map(tool => tool.function.name));
  const prompt = text([...messages].reverse().find(message => message.role === 'user')?.content);
  const replacements = { messages, tools, model, prompt, apiKey };
  // Validate configured paths before any network request.
  for (const field of ['responsePath', 'toolsPath', 'toolNamePath', 'toolArgumentsPath', 'toolIdPath']) if (settings[field] != null) readPath({}, settings[field]);
  if (settings.format === 'responses') {
    const requestHeaders = headers(settings.headers, replacements);
    const responseUrl = endpoint(settings.baseUrl, '/responses');
    const baseUrl = responseUrl.replace(/\/responses$/, '');
    const result = await runOpenAI({ baseUrl, apiKey, model, messages, tools, signal, headers: requestHeaders, requireKey: false });
    // The shared transport preserves encrypted reasoning; this layer also applies the app tool allowlist.
    const calls = result?.choices?.[0]?.message?.tool_calls ?? [];
    if (calls.length > 64 || new Set(calls.map(call => call.id)).size !== calls.length) throw fail('API вернул некорректный набор вызовов инструментов.', 502);
    for (const call of calls) canonicalCall({ id: call.id, name: call.function?.name, args: call.function?.arguments }, allowed);
    return result;
  }
  let url; let payload; let defaults = {}; let decode;
  if (settings.format === 'chat-completions') {
    url = endpoint(settings.baseUrl, '/chat/completions');
    payload = { model, messages: chatHistory(messages), stream: false, ...(tools.length ? { tools, tool_choice: 'auto' } : {}) };
    if (apiKey) defaults.Authorization = `Bearer ${apiKey}`;
    decode = data => chatResponse(data, allowed);
  } else if (settings.format === 'anthropic') {
    url = endpoint(settings.baseUrl, '/messages');
    payload = { model, max_tokens: 8192, stream: false, ...anthropicHistory(messages, allowed), ...(tools.length ? { tools: tools.map(tool => ({ name: tool.function.name, description: tool.function.description, input_schema: tool.function.parameters })) } : {}) };
    defaults['anthropic-version'] = '2023-06-01';
    if (apiKey) defaults['x-api-key'] = apiKey;
    decode = data => anthropicResponse(data, allowed);
  } else if (settings.format === 'gemini') {
    const modelId = model.replace(/^models\//, '');
    if (!/^[A-Za-z0-9._-]{1,256}$/.test(modelId)) throw fail('Некорректный идентификатор модели Gemini.');
    url = endpoint(settings.baseUrl, `/models/${encodeURIComponent(modelId)}:generateContent`);
    payload = { ...geminiHistory(messages, allowed), ...(tools.length ? { tools: [{ functionDeclarations: tools.map(tool => ({ name: tool.function.name, description: tool.function.description, parametersJsonSchema: tool.function.parameters })) }] } : {}) };
    if (apiKey) defaults['x-goog-api-key'] = apiKey;
    decode = data => geminiResponse(data, allowed);
  } else {
    url = endpoint(settings.baseUrl, '', true);
    let template = settings.requestTemplate;
    if (typeof template === 'string') { try { template = JSON.parse(template); } catch { throw fail('Шаблон запроса должен быть корректным JSON.'); } }
    if (!object(template)) throw fail('Укажите JSON-объект шаблона запроса.');
    payload = interpolate(template, replacements);
    // Custom endpoints get credentials only through explicitly configured headers/template.
    decode = data => customResponse(data, settings, allowed);
  }
  const requestHeaders = headers(settings.headers, replacements, defaults);
  const data = await postJson(url, payload, requestHeaders, signal);
  return decode(data);
}
