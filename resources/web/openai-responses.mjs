// Responses API: https://developers.openai.com/api/docs/guides/function-calling
// Stateless replay: https://developers.openai.com/api/docs/guides/reasoning
// This adapter never reads files, saved authentication, environment keys or CLI sessions.

const allowedOutputTypes = new Set(['message', 'function_call', 'reasoning']);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const clone = value => structuredClone(value);

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw fail(`Некорректное поле OpenAI: ${label}.`);
  return value;
}
function functionName(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) throw fail('Некорректное имя инструмента OpenAI.');
  return value;
}
function outputItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item) || !allowedOutputTypes.has(item.type)) throw fail('Неподдерживаемый элемент истории OpenAI.');
  if (item.type === 'function_call') {
    requiredString(item.call_id, 'call_id'); functionName(item.name);
    if (typeof item.arguments !== 'string') throw fail('Аргументы инструмента OpenAI должны быть JSON-строкой.');
  } else if (item.type === 'message') {
    if (item.role !== 'assistant' || !Array.isArray(item.content)) throw fail('Некорректное сообщение истории OpenAI.');
    if (item.phase != null && !['commentary', 'final_answer'].includes(item.phase)) throw fail('Некорректная фаза сообщения OpenAI.');
    for (const part of item.content) {
      if (!part || !['output_text', 'refusal'].includes(part.type) || typeof (part.type === 'refusal' ? part.refusal : part.text) !== 'string') throw fail('Неподдерживаемое содержимое ответа OpenAI.');
    }
  } else {
    if (!Array.isArray(item.summary) || item.encrypted_content != null && typeof item.encrypted_content !== 'string') throw fail('Некорректный reasoning item OpenAI.');
  }
  // Keep ids, phase, status, encrypted reasoning and content order exactly as returned.
  return clone(item);
}
function textContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw fail('Неподдерживаемое содержимое сообщения OpenAI.');
  return content.map(part => {
    if (part?.type === 'text' && typeof part.text === 'string') return part.text;
    if (part?.type === 'refusal' && typeof part.refusal === 'string') return part.refusal;
    throw fail('В этой роли OpenAI поддерживается только текст.');
  }).join('\n');
}
function inputContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) throw fail('Неподдерживаемое содержимое сообщения OpenAI.');
  return content.map(part => {
    if (part?.type === 'text' && typeof part.text === 'string') return { type: 'input_text', text: part.text };
    if (part?.type !== 'image_url') throw fail('OpenAI поддерживает текст и изображения PNG/JPEG/WebP/GIF.');
    const image = typeof part.image_url === 'string' ? { url: part.image_url } : part.image_url;
    const url = requiredString(image?.url, 'image_url');
    if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)) {
      let parsed; try { parsed = new URL(url); } catch {}
      if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) throw fail('Изображение OpenAI должно быть вложением или адресом HTTPS.');
    }
    if (image.detail != null && !['auto', 'low', 'high', 'original'].includes(image.detail)) throw fail('Некорректная детализация изображения OpenAI.');
    return { type: 'input_image', image_url: url, ...(image.detail ? { detail: image.detail } : {}) };
  });
}

export function toResponsesInput(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 100) throw fail('Некорректная история OpenAI.');
  const input = [];
  for (const message of messages) {
    if (!message || !['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)) throw fail('Неподдерживаемая роль сообщения OpenAI.');
    if (message.role === 'assistant' && Array.isArray(message.response_items) && message.response_items.length) {
      if (message.response_items.length > 1000) throw fail('Слишком много элементов истории OpenAI.');
      input.push(...message.response_items.map(outputItem));
      continue; // The original output already contains its text and function calls.
    }
    if (message.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: requiredString(message.tool_call_id, 'tool_call_id'), output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? null) });
      continue;
    }
    if (message.role === 'assistant') {
      // Compatibility with existing Chat Completions histories.
      if (Array.isArray(message.reasoning_items)) input.push(...message.reasoning_items.map(item => {
        if (item?.type !== 'reasoning') throw fail('Некорректный reasoning item OpenAI.');
        return outputItem(item);
      }));
      const content = textContent(message.content);
      if (content) input.push({ role: 'assistant', content, ...(message.phase && ['commentary', 'final_answer'].includes(message.phase) ? { phase: message.phase } : {}) });
      if (message.tool_calls != null && !Array.isArray(message.tool_calls)) throw fail('Некорректные вызовы инструментов OpenAI.');
      for (const call of message.tool_calls || []) {
        if (call.type != null && call.type !== 'function') throw fail('OpenAI поддерживает только инструменты приложения.');
        const fn = call.function;
        input.push({ type: 'function_call', call_id: requiredString(call.id, 'call_id'), name: functionName(fn?.name), arguments: typeof fn?.arguments === 'string' ? fn.arguments : JSON.stringify(fn?.arguments ?? {}) });
      }
    } else input.push({ role: message.role, content: inputContent(message.content) });
  }
  return input;
}

export function responseToChat(response) {
  if (!response || typeof response !== 'object' || !Array.isArray(response.output)) throw fail('OpenAI вернул ответ без массива output.', 502);
  if (response.error || ['failed', 'cancelled'].includes(response.status)) throw fail('OpenAI не завершил запрос. Повторите его после проверки подключения и квоты.', 502);
  const items = response.output.map(outputItem), toolCalls = [], text = [];
  let phase;
  for (const item of items) {
    if (item.type === 'message') {
      phase = item.phase ?? phase;
      for (const part of item.content) text.push(part.type === 'refusal' ? part.refusal : part.text);
    } else if (item.type === 'function_call') toolCalls.push({ id: item.call_id, type: 'function', function: { name: item.name, arguments: item.arguments } });
  }
  if (!text.length && typeof response.output_text === 'string' && response.output_text) text.push(response.output_text);
  if (!text.length && !toolCalls.length) throw fail(response.status === 'incomplete' ? 'OpenAI исчерпал лимит ответа до вывода текста. Увеличьте лимит или упростите запрос.' : 'OpenAI вернул пустой ответ.', 502);
  const message = { role: 'assistant', content: text.length ? text.join('\n') : null, response_items: items, ...(phase ? { phase } : {}), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
  const usage = response.usage ? { prompt_tokens: response.usage.input_tokens || 0, completion_tokens: response.usage.output_tokens || 0, total_tokens: response.usage.total_tokens || 0 } : undefined;
  return { id: response.id, object: 'chat.completion', created: response.created_at, model: response.model, choices: [{ index: 0, message, finish_reason: toolCalls.length ? 'tool_calls' : response.status === 'incomplete' ? 'length' : 'stop' }], ...(usage ? { usage } : {}) };
}

function responsesTools(tools) {
  if (!Array.isArray(tools) || tools.length > 128) throw fail('Некорректный список инструментов OpenAI.');
  return tools.map(tool => {
    if (tool?.type !== 'function' || !tool.function || typeof tool.function !== 'object') throw fail('OpenAI использует только инструменты приложения.');
    const fn = tool.function;
    if (!fn.parameters || typeof fn.parameters !== 'object' || Array.isArray(fn.parameters)) throw fail('Инструмент OpenAI должен содержать JSON Schema.');
    // The existing application schemas contain optional fields; do not silently make them required.
    return { type: 'function', name: functionName(fn.name), ...(typeof fn.description === 'string' ? { description: fn.description } : {}), parameters: clone(fn.parameters), strict: false };
  });
}
function endpoint(baseUrl) {
  let url; try { url = new URL(baseUrl); } catch { throw fail('Некорректный адрес OpenAI API.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback) || url.username || url.password || url.search || url.hash) throw fail('OpenAI API требует HTTPS или локальный тестовый адрес.');
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/responses') ? pathname : pathname + '/responses';
  return url.href;
}

function requestHeaders(value, apiKey) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).length > 32) throw fail('Заголовки OpenAI должны быть JSON-объектом.');
  const merged = new Headers();
  for (const name of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/.test(name) || /^(host|cookie|set-cookie|content-length|connection|transfer-encoding|upgrade|proxy-authorization|proxy-connection|accept-encoding)$/i.test(name)) throw fail('Недопустимый заголовок OpenAI.');
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.value !== 'string' || descriptor.value.length > 8192 || /[\r\n\0]/.test(descriptor.value)) throw fail('Некорректное значение заголовка OpenAI.');
    try { merged.set(name, descriptor.value); } catch { throw fail('Некорректное значение заголовка OpenAI.'); }
  }
  if (apiKey && !merged.has('Authorization')) {
    try { merged.set('Authorization', `Bearer ${apiKey}`); } catch { throw fail('Некорректные параметры авторизации OpenAI.'); }
  }
  merged.set('Content-Type', 'application/json');
  return merged;
}

export async function runOpenAI({ baseUrl = 'https://api.openai.com/v1', apiKey = '', model, messages, tools = [], signal, maxTokens = 16384, headers = {}, requireKey = true } = {}) {
  if (typeof requireKey !== 'boolean' || typeof apiKey !== 'string' || apiKey.length > 8192 || /[\r\n\0]/.test(apiKey)) throw fail('Некорректные параметры авторизации OpenAI.');
  const key = apiKey.trim();
  if (requireKey && !key) throw fail('Введите личный API-ключ OpenAI в настройках.');
  const mergedHeaders = requestHeaders(headers, key);
  requiredString(model, 'model');
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 131072) throw fail('Некорректный лимит ответа OpenAI.');
  const url = endpoint(baseUrl);
  const payload = { model, input: toResponsesInput(messages), store: false, stream: false, include: ['reasoning.encrypted_content'], max_output_tokens: maxTokens };
  if (tools.length) { payload.tools = responsesTools(tools); payload.parallel_tool_calls = false; }
  const timeout = AbortSignal.timeout(180000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try { response = await fetch(url, { method: 'POST', redirect: 'error', headers: mergedHeaders, body: JSON.stringify(payload), signal: combined }); }
  catch {
    if (signal?.aborted) throw Object.assign(fail('Запрос OpenAI остановлен.', 499), { name: 'AbortError' });
    throw fail(timeout.aborted ? 'OpenAI не ответил за 3 минуты.' : 'Не удалось соединиться с OpenAI. Проверьте интернет и адрес API.', 502);
  }
  if (!response.ok) {
    // Do not echo provider diagnostics: they may contain the supplied key or private prompt.
    const hint = response.status === 401 ? 'Проверьте API-ключ.' : response.status === 403 ? 'Проверьте доступ аккаунта к этой модели.' : response.status === 404 ? 'Выберите доступную модель из списка.' : response.status === 429 ? 'Проверьте квоту и баланс API.' : 'Проверьте выбранную модель и настройки API.';
    throw fail(`OpenAI: HTTP ${response.status}. ${hint}`, 502);
  }
  let data; try { data = await response.json(); } catch { throw fail('OpenAI вернул некорректный JSON.', 502); }
  return responseToChat(data);
}
