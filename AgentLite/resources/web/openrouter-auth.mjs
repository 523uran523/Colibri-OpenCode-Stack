// Official PKCE: https://openrouter.ai/docs/guides/overview/auth/oauth
// Free routing: https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground
// Limits: https://openrouter.ai/docs/api_reference/limits
import {randomBytes,randomUUID,createHash} from 'node:crypto';

const API='https://openrouter.ai/api/v1',MODEL='openrouter/free',TTL=10*60*1000,RETAIN=15*60*1000;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const keyValid=value=>typeof value==='string'&&value.trim()&&value.length<=16384&&!/[\r\n\0]/.test(value);

function limitsFor(data){
  const result={},item=data?.data;
  if(!item||typeof item!=='object')return result;
  const credits={};
  for(const [field,target]of [['limit','limit'],['limit_remaining','remaining']])if(item[field]===null||finite(item[field]))credits[target]=item[field];
  if(Object.keys(credits).length)result.credits=credits;
  const quota={};for(const field of ['used','limit','remaining'])if(finite(item.free_model_daily_requests?.[field]))quota[field]=item.free_model_daily_requests[field];
  if(Object.keys(quota).length)result.freeQuota=quota;
  return result;
}
function httpMessage(status,source,limitSource){
  if(source==='exchange')return `OpenRouter: HTTP ${status}. Вход не завершён. Повторите подключение; код действует 10 минут.`;
  if(status===401||status===403)return `OpenRouter: HTTP ${status}. Проверьте доступ API-ключа в OpenRouter. Текущее подключение сохранено.`;
  if(status===402){
    const detail=limitSource==='openrouter_key_limit'?'Достигнут лимит этого ключа: проверьте ограничения в OpenRouter.':limitSource==='openrouter_in_flight_budget'?'Сервис временно ограничил параллельные запросы. Повторите проверку позже.':'Проверьте баланс аккаунта и ограничения ключа в OpenRouter: отрицательный баланс может блокировать даже бесплатные модели.';
    return `OpenRouter: HTTP 402. ${detail} Платные модели не включались.`;
  }
  if(status===429)return 'OpenRouter: HTTP 429. Исчерпана бесплатная квота или сервис перегружен. Подождите и повторите проверку. Платные модели не включались.';
  if(status===404||status===503)return `OpenRouter: HTTP ${status}. Бесплатная модель временно недоступна. Повторите позже. Платные модели не включались.`;
  return `OpenRouter: HTTP ${status}. Не удалось проверить бесплатную модель. Текущее подключение сохранено.`;
}

export function callbackPage(message='Вход получен. Вернитесь в Engee Agent: приложение проверяет бесплатную модель.'){
  const nonce=randomBytes(18).toString('base64');
  const safe=String(message).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  return {html:'<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Engee Agent · OpenRouter</title><style nonce="'+nonce+'">body{font:18px system-ui;max-width:640px;margin:64px auto;padding:24px;line-height:1.5}a{color:#2459b9}</style></head><body><h1>Подключение OpenRouter</h1><p>'+safe+'</p><p><a href="/">Вернуться в Engee Agent</a></p><script nonce="'+nonce+'">history.replaceState(null,"",location.pathname);</script></body></html>',headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}};
}

export function createOpenRouterAuth({port,getKey,saveKey,activate,fetchImpl=globalThis.fetch,now=Date.now}={}){
  if(!Number.isInteger(port)||port<1||port>65535||![getKey,saveKey,activate,fetchImpl,now].every(item=>typeof item==='function'))throw fail('Не настроен модуль подключения OpenRouter.');
  const flows=new Map(),states=new Map();
  let closed=false;
  function finish(flow,status,message){flow.status=status;flow.message=message;flow.finishedAt=now();if(flow.state)states.delete(flow.state);flow.verifier='';flow.state='';}
  function prune(){const time=now();for(const [id,flow]of flows){if(flow.status==='pending'&&time>=flow.expiresAt){flow.controller.abort();finish(flow,'expired','Время входа истекло. Нажмите «Подключить бесплатный API» ещё раз.');}if(flow.status!=='pending'&&time-flow.finishedAt>=RETAIN)flows.delete(id);}}
  const timer=setInterval(prune,30000);timer.unref();
  const view=flow=>({id:flow.id,status:flow.status,message:flow.message,expiresAt:flow.expiresAt,...(flow.result||{})});
  function active(){prune();if(closed)throw fail('Приложение остановлено.',409);return [...flows.values()].find(flow=>flow.status==='pending');}
  function create(kind){if(active())throw fail('Подключение уже проверяется. Дождитесь результата или отмените текущий вход.',409);if(flows.size>=20){const first=[...flows.values()].find(item=>item.status!=='pending');if(first)flows.delete(first.id);}const flow={id:randomUUID(),kind,status:'pending',message:kind==='auth'?'Завершите вход в открытой вкладке OpenRouter.':'Проверяется сохранённый ключ и бесплатная модель.',expiresAt:now()+TTL,controller:new AbortController(),verifier:'',state:''};flows.set(flow.id,flow);return flow;}
  function ensurePending(flow){prune();if(flow.status!=='pending'||flow.controller.signal.aborted)throw fail('Проверка OpenRouter остановлена.',409);}
  async function readJson(response){
    const chunks=[];let size=0;try{for await(const chunk of response.body){size+=chunk.length;if(size>64*1024){await response.body?.cancel().catch(()=>{});throw Error('size');}chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail('OpenRouter вернул некорректный ответ. Повторите проверку.',502);}
  }
  async function request(flow,route,options,source){
    ensurePending(flow);let response;
    try{response=await fetchImpl(API+route,{...options,redirect:'error',signal:AbortSignal.any([flow.controller.signal,AbortSignal.timeout(source==='exchange'?30000:120000)])});}
    catch{ensurePending(flow);throw fail('OpenRouter недоступен или время ответа истекло. Проверьте интернет и повторите подключение.',502);}
    let data;try{data=await readJson(response);}catch(error){if(!response.ok)throw fail(httpMessage(response.status,source),502);throw error;}ensurePending(flow);
    if(!response.ok||data?.error){const status=response.ok?(Number.isInteger(data.error?.code)?data.error.code:502):response.status;throw Object.assign(fail(httpMessage(status,source,data?.error?.metadata?.limit_source),502),{providerStatus:status});}
    return data;
  }
  async function queryLimits(flow,key){try{return limitsFor(await request(flow,'/key',{method:'GET',headers:{Authorization:'Bearer '+key}},'limits'));}catch{return {};}}
  async function verify(flow,key){
    let response;
    try{response=await request(flow,'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages:[{role:'user',content:'Ответь только числом: 1+1'}],stream:false,max_tokens:1024,temperature:0,provider:{max_price:{prompt:0,completion:0,request:0}}})},'completion');}
    catch(error){flow.result=await queryLimits(flow,key);throw error;}
    const content=response.choices?.[0]?.message?.content;
    let answer=typeof content==='string'?content.trim():'';
    const fenced=/^```(?:[A-Za-z0-9_-]{0,20})\s*\n([\s\S]*?)\n?```$/.exec(answer);if(fenced)answer=fenced[1].trim();
    const emphasis=/^(\*\*|__)([\s\S]*)\1$/.exec(answer);if(emphasis)answer=emphasis[2].trim();
    if(!/^2(?:[.,]0+)?[.!]?$/.test(answer))throw fail('Бесплатная модель не вернула ожидаемый ответ «2». Текущее подключение сохранено; повторите проверку позже.',502);
    let cost=null;
    if(response.usage&&own(response.usage,'cost')&&response.usage.cost!==null){cost=typeof response.usage.cost==='number'?response.usage.cost:typeof response.usage.cost==='string'&&response.usage.cost.trim()?Number(response.usage.cost):NaN;if(!Number.isFinite(cost)||cost!==0)throw fail('OpenRouter не подтвердил нулевую стоимость ответа. Текущее подключение сохранено; платные модели не выбирались.',502);}
    ensurePending(flow);
    if(getKey()!==key)throw fail('Ключ OpenRouter изменился во время проверки. Повторите проверку сохранённого ключа.',409);
    await activate();ensurePending(flow);
    const actualModel=typeof response.model==='string'&&/^[A-Za-z0-9][A-Za-z0-9._/:+-]{0,255}$/.test(response.model)&&!response.model.includes(key)?response.model:null;
    flow.result={provider:'openrouter',model:MODEL,actualModel,answer:'2',cost};finish(flow,'success','Бесплатная модель ответила: 1+1 = 2. OpenRouter выбран для чата.'+(cost===null?' Сервис не сообщил стоимость в ответе.':''));
  }
  async function complete(flow,work){try{await work();}catch(error){if(flow.status==='pending'){const message=typeof error?.message==='string'&&error?.status?error.message:'Не удалось сохранить подключение OpenRouter. Текущее подключение сохранено.';finish(flow,'error',message);}}finally{flow.verifier='';}}
  return {
    start(){if(getKey())throw fail('Ключ OpenRouter уже сохранён. Нажмите «Проверить бесплатный API»: новый ключ не создаётся.',409);const flow=create('auth');flow.verifier=randomBytes(48).toString('base64url');flow.state=randomBytes(32).toString('base64url');states.set(flow.state,flow.id);const url=new URL('https://openrouter.ai/auth');url.searchParams.set('callback_url','http://127.0.0.1:'+port+'/auth/openrouter/callback');url.searchParams.set('code_challenge',createHash('sha256').update(flow.verifier).digest('base64url'));url.searchParams.set('code_challenge_method','S256');url.searchParams.set('key_label','Engee Agent — бесплатные модели');url.searchParams.set('state',flow.state);return {url:url.href,id:flow.id,expiresAt:flow.expiresAt};},
    status(id){prune();const flow=flows.get(id);if(!flow)throw fail('Подключение OpenRouter не найдено. Начните новый вход.',404);return view(flow);},
    cancel(id){prune();const flow=flows.get(id);if(!flow)throw fail('Подключение OpenRouter не найдено.',404);if(flow.status==='pending'){flow.controller.abort();finish(flow,'cancelled','Подключение отменено. Текущее подключение сохранено.');}return view(flow);},
    callback({state,code,error}={}){
      prune();if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state))throw fail('Не удалось подтвердить запрос входа. Начните подключение из Engee Agent.',400);
      const id=states.get(state),flow=flows.get(id);if(!flow)throw fail('Этот запрос входа недействителен, использован или истёк. Начните новый вход.',400);ensurePending(flow);
      // Consume state before any await: simultaneous/replayed callbacks cannot exchange twice.
      states.delete(state);flow.state='';
      if(error){finish(flow,'error','Вход OpenRouter отменён или не разрешён. Текущее подключение сохранено.');return callbackPage(flow.message);}
      if(typeof code!=='string'||!code||code.length>8192||/[\x00-\x20\x7f]/.test(code)){finish(flow,'error','OpenRouter не передал код входа. Повторите подключение.');return callbackPage(flow.message);}
      flow.message='Вход получен. Проверяется бесплатная модель; текущий выбор пока сохранён.';
      void complete(flow,async()=>{if(getKey())throw fail('Ключ OpenRouter уже сохранён. Новый ключ не заменит существующий; проверьте сохранённый ключ.',409);const result=await request(flow,'/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,code_verifier:flow.verifier,code_challenge_method:'S256'})},'exchange');flow.verifier='';if(!keyValid(result.key))throw fail('OpenRouter не вернул API-ключ. Повторите подключение.',502);const key=result.key.trim();ensurePending(flow);if(getKey())throw fail('Ключ OpenRouter изменился. Существующий ключ сохранён; проверьте его.',409);await saveKey(key);ensurePending(flow);await verify(flow,key);});
      return callbackPage();
    },
    check(){const key=getKey();if(!keyValid(key))throw fail('Ключ OpenRouter ещё не сохранён. Нажмите «Подключить бесплатный API».');const flow=create('check');void complete(flow,()=>verify(flow,key));return view(flow);},
    close(){closed=true;clearInterval(timer);for(const flow of flows.values())if(flow.status==='pending'){flow.controller.abort();finish(flow,'cancelled','Приложение остановлено. Проверка OpenRouter отменена.');}states.clear();}
  };
}
