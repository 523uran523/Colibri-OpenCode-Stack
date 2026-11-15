import path from 'node:path';

const checkedMessage='Ответ модели ещё не проверялся.';
const claudeModels=new Set(['default','sonnet','opus','haiku']);
const localCatalogs=new Set(['ollama','lmstudio']);
function samePath(first,second){
  if(typeof first!=='string'||typeof second!=='string'||!first||!second)return false;
  const windows=/^[a-z]:[\\/]|^\\\\/i.test(first)||/^[a-z]:[\\/]|^\\\\/i.test(second);
  return windows?path.win32.resolve(first).toLowerCase()===path.win32.resolve(second).toLowerCase():path.resolve(first)===path.resolve(second);
}
function healthUrl(base){
  const url=new URL(base);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)throw Error('Not an owned loopback runtime');
  url.pathname=url.pathname.replace(/\/v1\/?$/,'').replace(/\/$/,'')+'/health';
  return url.href;
}

/** Read-only diagnostic. Dependencies must only inspect files, metadata or catalogs. */
export async function readLlmStatus({config={},profile,local={},requiresKey=false,hasApiKey=false,selectLocal,discoverModels,detectClaude,fetchImpl=fetch,healthTimeoutMs=3000}={}){
  const provider=typeof config.provider==='string'?config.provider:'';
  let model=String(profile?.type==='api'?profile.settings?.model||'':config.model||'');
  if(provider==='claude'&&!profile)model||='default';
  const result={provider,model,connectionId:typeof config.connectionId==='string'?config.connectionId:'',state:'unverified',message:'Соединение и ответ модели ещё не проверены.',serverReachable:null,selectedModelAvailable:null,generationVerified:false};
  const finish=(state,message,fields={})=>({...result,state,message,...fields});
  if(profile?.type==='program')return finish('unverified','Программу откройте вручную в терминале. '+checkedMessage);
  if(profile?.type==='api'&&profile.settings?.format==='custom-json')return finish('unverified','Шаблон JSON настроен. Соединение и ответ проверяются отправкой сообщения.');
  if(!profile&&provider==='puter')return finish('unverified','Доступ Puter проверяется запросом из браузера. '+checkedMessage);
  if(!profile&&provider==='claude'){
    let detected;
    try{detected=await detectClaude();}catch{return finish('unavailable','Не удалось проверить Claude Code.');}
    if(!detected?.available)return finish('unavailable','Claude Code не найдена или её версия недоступна.',{serverReachable:false});
    if(!claudeModels.has(model))return finish('missing','Выбранная модель Claude не поддерживается приложением.',{selectedModelAvailable:false});
    if(detected.auth?.authenticated===false)return finish('unavailable','Claude Code требует входа на этом ПК.',{serverReachable:true});
    if(detected.auth?.authenticated!==true)return finish('unverified','Claude Code найдена; состояние входа не подтверждено. '+checkedMessage,{serverReachable:true});
    return finish('ready','Claude Code доступна. '+checkedMessage,{serverReachable:true,selectedModelAvailable:true});
  }
  if(provider==='local'&&profile?.type!=='api'){
    let selected;
    try{selected=await selectLocal();}catch{return finish('missing','Выбранный GGUF не найден. Обновите список моделей.',{selectedModelAvailable:false});}
    if(!selected?.path||!selected?.name)return finish('missing','В выбранной папке нет доступной модели GGUF.',{selectedModelAvailable:false});
    result.model=selected.name;
    if(local.starting&&samePath(selected.path,local.modelPath))return finish('starting','GGUF запускается. Дождитесь готовности.',{selectedModelAvailable:true});
    if(!local.running||!samePath(selected.path,local.modelPath)||!local.baseUrl)return finish('not_started','Выбранный GGUF ещё не запущен. Запустите модель или отправьте сообщение.',{selectedModelAvailable:true});
    let response;
    try{response=await fetchImpl(healthUrl(local.baseUrl),{method:'GET',redirect:'error',signal:AbortSignal.timeout(healthTimeoutMs)});}catch{return finish('unavailable','Запущенный GGUF-сервер не отвечает.',{serverReachable:false,selectedModelAvailable:true});}
    if(!response.ok)return finish(response.status===503?'starting':'unavailable',response.status===503?'GGUF-сервер ещё загружает модель.':'GGUF-сервер не готов.',{serverReachable:true,selectedModelAvailable:true});
    return finish('ready','Выбранный GGUF запущен и сервер отвечает. '+checkedMessage,{serverReachable:true,selectedModelAvailable:true});
  }
  if(!profile&&requiresKey&&!hasApiKey)return finish('unavailable','Сохраните API-ключ выбранного сервиса.',{serverReachable:null});
  let catalog;
  try{catalog=await discoverModels();}catch(error){
    // Error bodies or endpoint URLs can contain private values. Return only fixed messages.
    const status=Number(String(error?.message||'').match(/\bHTTP\s+(\d{3})\b/i)?.[1]);
    if([404,405,501].includes(status))return finish('unverified','Этот сервер не предоставил каталог моделей. Доступ к модели проверяется отправкой сообщения.',{serverReachable:true});
    if([401,403].includes(status))return finish('unavailable','Сервер отклонил доступ. Проверьте ключ и разрешения аккаунта.',{serverReachable:true});
    return finish('unavailable','Сервер модели недоступен или не вернул корректный каталог. Проверьте адрес и соединение.',{serverReachable:status?true:false});
  }
  if(catalog?.source==='documentation')return finish('unverified','Показаны примеры из документации. Доступность выбранной модели не подтверждена.',{serverReachable:true});
  const ids=(Array.isArray(catalog?.models)?catalog.models:[]).map(item=>typeof item==='string'?item:item?.id).filter(id=>typeof id==='string'&&id);
  if(!model)return finish('unverified','Сервер отвечает. Выберите модель из его каталога.',{serverReachable:true});
  if(ids.includes(model))return finish('ready','Выбранная модель есть в каталоге доступного сервера. '+checkedMessage,{serverReachable:true,selectedModelAvailable:true});
  if(ids.length||localCatalogs.has(provider)||profile?.type==='local'&&localCatalogs.has(profile.settings?.engine))return finish('missing','Выбранной модели нет в каталоге этого сервера. Обновите список и выберите доступную модель.',{serverReachable:true,selectedModelAvailable:false});
  return finish('unverified','Сервер отвечает, но каталог моделей пуст. Доступность выбранной модели проверяется отправкой сообщения.',{serverReachable:true});
}
