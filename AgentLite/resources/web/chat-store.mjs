import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

export const DRAFT_SECRET='__KEEP_DRAFT_SECRET__';
export const CHAT_LIMITS=Object.freeze({chats:5,jsonBytes:16*1024*1024,requestBytes:64*1024*1024,imageBytes:4*1024*1024,mediaBytes:160*1024*1024});
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const blocked=value=>/(?:^|[\\/])summy(?:[\\/]|$)/i.test(value);
const clone=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function ordinaryPath(directory){
  const resolved=path.resolve(directory);if(blocked(resolved)||/^\\\\/.test(resolved))throw fail('Нужна локальная папка Engee без ссылок.',403);
  let cursor=path.parse(resolved).root;
  for(const part of path.relative(cursor,resolved).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);const stat=await fs.lstat(cursor),real=await fs.realpath(cursor);if(!stat.isDirectory()||stat.isSymbolicLink()||real.toLowerCase()!==cursor.toLowerCase())throw fail('Локальное хранилище не должно проходить через ссылки.',403);}
  return resolved;
}
async function ordinaryFile(file){try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw fail('Файл локального хранилища должен быть обычным файлом.',403);return stat;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export async function atomicWrite(file,bytes){
  await ordinaryPath(path.dirname(file));await ordinaryFile(file);const temporary=file+'.tmp-'+randomUUID();let handle;
  try{handle=await fs.open(temporary,'wx',0o600);await handle.writeFile(bytes);await handle.sync();await handle.close();handle=null;
    for(let attempt=0;;attempt++){await ordinaryPath(path.dirname(file));await ordinaryFile(file);try{await fs.rename(temporary,file);break;}catch(error){if(attempt>=5||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,25*2**attempt));}}
  }finally{if(handle)await handle.close().catch(()=>{});await fs.rm(temporary,{force:true}).catch(()=>{});}
}
function checkedJson(input,max=CHAT_LIMITS.requestBytes){let bytes;try{bytes=JSON.stringify(input);}catch{throw fail('Нужен обычный JSON локального состояния.');}if(!bytes||Buffer.byteLength(bytes)>max)throw fail('Локальная история слишком большая. Уменьшите вложения или очистите один диалог.',413);return JSON.parse(bytes);}
function settingsContext(drafts){const fields=drafts.settings?.fields||{};return {provider:String(drafts.settings?.provider||fields.provider||''),connectionId:String(drafts.settings?.connectionId||fields.connectionId||''),baseUrl:String(fields.baseUrl||'')};}
function bindContext(drafts){return {target:String(drafts.bindToken?.target||''),provider:String(drafts.bindToken?.provider||''),connectionId:String(drafts.bindToken?.connectionId||'')};}
function connectionContext(drafts){const wizard=drafts.wizard||{};return {profileId:String(wizard.id||''),type:String(wizard.type||''),name:String(wizard.name||''),baseUrl:String(wizard.settings?.baseUrl||''),format:String(wizard.settings?.format||'chat-completions')};}
function secretDescriptor(parts,drafts){
  if(parts.length===3&&parts[0]==='settings'&&parts[1]==='fields'&&['apiKey','engeeToken','engeeUsername','engeePassword'].includes(parts[2]))return {kind:'config',field:parts[2],context:settingsContext(drafts)};
  if(parts.join('.')==='bindToken.token')return {kind:'bindToken',field:'token',context:bindContext(drafts)};
  if(parts.join('.')==='wizard.apiKey')return {kind:'connection',field:'apiKey',context:connectionContext(drafts)};
  if(parts.join('.')==='wizard.fields.connection-headers')return {kind:'connectionText',field:'settings.headers',context:connectionContext(drafts)};
  if(parts.join('.')==='wizard.fields.connection-request-template')return {kind:'connectionText',field:'settings.requestTemplate',context:connectionContext(drafts)};
  if(parts[0]==='wizard'&&parts[1]==='settings'&&/auth|api.?key|token|password|secret|cookie/i.test(parts.at(-1)))return {kind:'connection',field:parts.slice(1).join('.'),context:connectionContext(drafts)};
  if(parts.join('.')==='configEditor.text')return {kind:'configEditor',field:'text',context:{path:'data/settings.json'}};
  return null;
}
function maskedText(text,redact,config=false){
  const marker=config?'__KEEP_SECRET__':DRAFT_SECRET;
  try{const doc=JSON.parse(text);function walk(value,key='',all=false){if(typeof value==='string'&&(all||/auth|api.?key|token|password|secret|cookie|engeeUsername/i.test(key))&&value&&!value.includes('{{apiKey}}'))return marker;if(Array.isArray(value))return value.map(item=>walk(item,key,all));if(plain(value)){const result={};for(const [name,item]of Object.entries(value))result[name]=walk(item,name,all||name==='apiKeys');return result;}return value;}return redact(JSON.stringify(walk(doc),null,2));}
  catch{
    let safe=text.replace(/("?(?:authorization|api.?key|engeeToken|engeeUsername|engeePassword|password|token|secret|cookie)[\w-]*"?\s*:\s*)("(?:\\.|[^"\r\n])*(?:"|$)|[^\r\n,}]*)/gim,(all,key)=>key+'"'+marker+'"');
    safe=safe.replace(/("apiKeys"\s*:\s*\{)([^}]*)/g,(all,key,body)=>key+body.replace(/("[^"\\]+"\s*:\s*)"(?:\\.|[^"\r\n])*(?:"|$)/gm,(all,prefix)=>prefix+'"'+marker+'"'));
    return redact(safe);
  }
}
export function restoreMaskedText(text,original){
  const scalars={};for(const match of original.matchAll(/"([^"\\]+)"\s*:\s*"((?:\\.|[^"\\])*)/g))try{const value=JSON.parse('"'+match[2]+'"');scalars[match[1]]=scalars[match[1]]!==undefined&&scalars[match[1]]!==value?null:value;}catch{}
  let current,previous;try{current=JSON.parse(text);}catch{
    return text.replace(/("([^"\\]+)"\s*:\s*)"(?:__KEEP_DRAFT_SECRET__|__KEEP_SECRET__)"/g,(all,prefix,key)=>{const value=scalars[key];if(typeof value!=='string')throw fail('Введите неоднозначное поле доступа заново.',409);return prefix+JSON.stringify(value);});
  }
  try{previous=JSON.parse(original);}catch{
    previous=scalars;
  }
  function merge(value,old,key=''){
    if(value===DRAFT_SECRET||value==='__KEEP_SECRET__'){const retained=typeof old==='string'?old:previous?.[key];if(typeof retained!=='string'||retained===DRAFT_SECRET)throw fail('Нельзя однозначно восстановить поле доступа. Введите его заново.',409);return retained;}
    if(Array.isArray(value))return value.map((item,index)=>merge(item,old?.[index],String(index)));
    if(plain(value)){const result={};for(const [name,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(name))throw fail('Недопустимое поле черновика.');result[name]=merge(item,old?.[name],name);}return result;}return value;
  }
  return JSON.stringify(merge(current,previous),null,2);
}
function privateSecrets(entries){
  const values=entries.map(entry=>entry.value);
  for(const entry of entries.filter(item=>['configEditor','connectionText'].includes(item.kind))){
    try{const doc=JSON.parse(entry.value);function walk(value,key='',all=false){if(typeof value==='string'&&(all||/auth|api.?key|token|password|secret|cookie|engeeUsername/i.test(key)))values.push(value);else if(plain(value)||Array.isArray(value))for(const [name,item]of Object.entries(value))walk(item,name,all||name==='apiKeys');}walk(doc);}
    catch{const fragments=[entry.value,...[...entry.value.matchAll(/"apiKeys"\s*:\s*\{([^}]*)/g)].map(match=>match[1])];for(const [index,fragment]of fragments.entries())for(const match of fragment.matchAll(index?/"[^"\\]+"\s*:\s*"((?:\\.|[^"\\])*)/g:/"(?:engeeToken|engeeUsername|engeePassword|password|apiKey|token)"\s*:\s*"((?:\\.|[^"\\])*)/g)){try{values.push(JSON.parse('"'+match[1]+'"'));}catch{values.push(match[1]);}}}
  }
  return values.filter(value=>typeof value==='string'&&value&&value!=='__KEEP_SECRET__'&&value!==DRAFT_SECRET);
}

/** Private local state only. Stored messages are data; restoration never dispatches tools or code. */
export async function createChatStore({directory,getSecrets=()=>[],write=atomicWrite}={}){
  await ordinaryPath(directory);const file=path.join(directory,'chats.json'),backup=path.join(directory,'chats.backup.json'),mediaRoot=path.join(directory,'chat-media');
  await fs.mkdir(mediaRoot,{recursive:true});await ordinaryPath(mediaRoot);
  let state={version:1,revision:0,chats:[],activeId:null,drafts:{},privateDrafts:[],media:{}},queue=Promise.resolve();const notices=[];
  function validateStored(document){
    if(!plain(document)||document.version!==1||!Number.isSafeInteger(document.revision)||document.revision<0||!Array.isArray(document.chats)||document.chats.length>5||!plain(document.drafts)||!Array.isArray(document.privateDrafts)||!plain(document.media))throw Error('invalid');
    if(document.chats.some(chat=>!plain(chat)||!uuid(chat.id)||!Array.isArray(chat.history)||!Array.isArray(chat.events))||new Set(document.chats.map(chat=>chat.id)).size!==document.chats.length)throw Error('invalid');
    if(document.privateDrafts.length>20||document.privateDrafts.some(entry=>!uuid(entry.id)||typeof entry.value!=='string'||!['config','bindToken','connection','connectionText','configEditor'].includes(entry.kind)||!plain(entry.context)))throw Error('invalid');
    for(const [id,item]of Object.entries(document.media))if(!/^[a-f0-9]{64}$/.test(id)||!plain(item)||!['image/png','image/jpeg','image/webp'].includes(item.mime)||!Number.isInteger(item.size)||item.size<1||item.size>CHAT_LIMITS.imageBytes)throw Error('invalid');
    return document;
  }
  async function load(target){const stat=await ordinaryFile(target);if(!stat)return null;if(stat.size>CHAT_LIMITS.jsonBytes)throw Error('invalid');return validateStored(JSON.parse(await fs.readFile(target,'utf8')));}
  try{state=await load(file)||state;}catch(error){if(error.status)throw error;notices.push('Локальная история повреждена. Оригинал сохранён; проверена резервная копия.');await fs.rename(file,file+'.invalid-'+Date.now());try{state=await load(backup)||state;}catch(error){if(error.status)throw error;notices.push('Резервная история тоже повреждена. Начните новый диалог.');}}
  const redact=(text,secrets=[])=>{let value=String(text);for(const secret of [...getSecrets(),...privateSecrets(state.privateDrafts),...secrets].filter(secret=>typeof secret==='string'&&secret))value=value.split(secret).join('[скрыто]');return value.replace(/Bearer\s+\S+/gi,'Bearer [скрыто]');};
  const summaries=()=>state.chats.map(({id,title,createdAt,updatedAt})=>({id,title,createdAt,updatedAt}));
  const refs=()=>state.privateDrafts.map(({id,path,kind,field,context})=>({id,path,kind,field,context}));
  const publicState=()=>({chats:summaries(),activeId:state.activeId,drafts:clone(state.drafts),draftSecretRefs:refs(),revision:state.revision,limit:5,notices:[...notices]});
  function resolve(id,{kind,field,context}){const entry=state.privateDrafts.find(item=>item.id===id);if(!entry||entry.kind!==kind||entry.field!==field||!equal(entry.context,context))throw fail('Сохранённый черновик доступа относится к другому полю или подключению. Введите значение заново.',409);return entry.value;}
  async function prepare(input,{extraSecrets=[]}={}){
    input=checkedJson(input);if(!plain(input)||!Array.isArray(input.chats)||input.chats.length>50||!plain(input.drafts||{}))throw fail('Некорректное локальное состояние диалогов.');
    if(input.revision!==undefined&&input.revision!==state.revision)throw fail('История изменилась в другом окне. Обновите её перед сохранением.',409);
    const drafts=input.drafts||{},privateDrafts=[],supplied=input.draftSecretRefs||[];if(!Array.isArray(supplied)||supplied.length>20)throw fail('Некорректные ссылки черновиков.');
    function extract(value,parts=[]){
      const descriptor=secretDescriptor(parts,drafts);
      if(descriptor&&typeof value==='string'&&value){
        const dotted='drafts.'+parts.join('.');let entry;
        const suppliedRef=supplied.find(item=>item.path===dotted),old=state.privateDrafts.find(item=>item.id===suppliedRef?.id),isPrivateText=['configEditor','connectionText'].includes(descriptor.kind);
        if(value===DRAFT_SECRET||isPrivateText&&old&&value===maskedText(old.value,text=>redact(text,extraSecrets),descriptor.kind==='configEditor')){
          const ref=supplied.find(item=>item.path===dotted);if(!ref)throw fail('Ссылка сохранённого черновика потеряна. Введите поле заново.',409);
          const original=state.privateDrafts.find(item=>item.id===ref.id);const restored=resolve(ref.id,descriptor);entry={...original,value:restored};
        }else {if(isPrivateText&&old&&(value.includes(DRAFT_SECRET)||value.includes('__KEEP_SECRET__'))){const original=resolve(old.id,descriptor);value=restoreMaskedText(value,original);}entry={id:randomUUID(),path:dotted,...descriptor,value};}
        if(entry.value.length>(isPrivateText?1024*1024:16384))throw fail('Черновик доступа слишком большой.');privateDrafts.push(entry);
        return isPrivateText?maskedText(entry.value,text=>redact(text,extraSecrets),descriptor.kind==='configEditor'):DRAFT_SECRET;
      }
      if(Array.isArray(value))return value.map((item,index)=>extract(item,[...parts,String(index)]));
      if(plain(value)){const result={};for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw fail('Недопустимое поле локального состояния.');result[key]=extract(item,[...parts,key]);}return result;}
      return value;
    }
    const safeDrafts=extract(drafts),secretValues=[...extraSecrets,...privateSecrets(privateDrafts)],media={...state.media},blobs=new Map();let nodes=0;
    function sanitize(value,depth=0){
      if(++nodes>100000||depth>40)throw fail('Слишком сложное локальное состояние.');
      if(typeof value==='string'){
        const image=value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]*={0,2})$/);
        if(image){const bytes=Buffer.from(image[2],'base64');if(!bytes.length||bytes.length>CHAT_LIMITS.imageBytes)throw fail('Изображение в истории должно быть до 4 МиБ.',413);const id=hash(bytes);media[id]={mime:image[1],size:bytes.length};blobs.set(id,bytes);return 'engee-media:'+id;}
        if(value.startsWith('engee-media:')){if(!/^[a-f0-9]{64}$/.test(value.slice(12))||!media[value.slice(12)])throw fail('Вложение локальной истории не найдено.');return value;}
        return redact(value,secretValues);
      }
      if(Array.isArray(value))return value.map(item=>sanitize(item,depth+1));
      if(plain(value)){const result={};for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw fail('Недопустимое поле локальной истории.');result[key]=sanitize(item,depth+1);}return result;}
      return value;
    }
    const now=new Date().toISOString(),seen=new Set();let chats=input.chats.map(chat=>{
      if(!plain(chat)||!uuid(chat.id)||seen.has(chat.id)||typeof chat.title!=='string'||chat.title.length>200||!Array.isArray(chat.history)||chat.history.length>5000||!Array.isArray(chat.events)||chat.events.length>10000||!['engee','julia'].includes(chat.executionTarget||'engee'))throw fail('Некорректный диалог.');seen.add(chat.id);
      if(chat.history.some(message=>!plain(message)||!['user','assistant','tool'].includes(message.role)))throw fail('Некорректная история сообщений.');
      const previous=state.chats.find(item=>item.id===chat.id);return sanitize({id:chat.id,title:chat.title||'Новый диалог',createdAt:previous?.createdAt||now,updatedAt:chat.updatedAt&&Date.parse(chat.updatedAt)?chat.updatedAt:now,history:chat.history,events:chat.events,fingerprint:String(chat.fingerprint||''),claudeSession:chat.claudeSession||null,executionTarget:chat.executionTarget||'engee',draft:chat.draft||{prompt:'',attachments:[]}});
    });
    let activeId=input.activeId||null;if(activeId&&!seen.has(activeId))throw fail('Текущий диалог не найден.');
    chats.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));if(activeId){const index=chats.findIndex(chat=>chat.id===activeId);chats.unshift(...chats.splice(index,1));}
    const pruned=chats.slice(5).map(({id,title})=>({id,title}));chats=chats.slice(0,5);
    const document={version:1,revision:state.revision+1,chats,activeId,drafts:sanitize(safeDrafts),privateDrafts,media,updatedAt:now};
    // Keep only media reachable from retained chats or public recovery drafts.
    const used=new Set(JSON.stringify({chats:document.chats,drafts:document.drafts}).match(/engee-media:[a-f0-9]{64}/g)?.map(item=>item.slice(12))||[]);
    document.media=Object.fromEntries(Object.entries(media).filter(([id])=>used.has(id)));if(Object.values(document.media).reduce((sum,item)=>sum+item.size,0)>CHAT_LIMITS.mediaBytes)throw fail('Слишком много изображений в локальной истории.',413);
    const bytes=Buffer.from(JSON.stringify(document));if(bytes.length>CHAT_LIMITS.jsonBytes)throw fail('Текст локальной истории слишком большой.',413);
    return {document,bytes,blobs,pruned,baseRevision:state.revision};
  }
  async function commit(plan){
    const operation=queue.then(async()=>{
      if(plan.baseRevision!==state.revision)throw fail('История изменилась в другом окне. Обновите её перед сохранением.',409);
      await ordinaryPath(directory);await ordinaryPath(mediaRoot);
      const created=[];
      try{
        for(const [id,bytes]of plan.blobs)if(plan.document.media[id]){const target=path.join(mediaRoot,id+'.bin'),stat=await ordinaryFile(target);if(!stat){await write(target,bytes);created.push({id,target});}else if(stat.size!==bytes.length||hash(await fs.readFile(target))!==id)throw fail('Локальное вложение повреждено. Повторите добавление изображения.');}
        await verifyMedia(plan.document);await write(backup,Buffer.from(JSON.stringify(state)));await write(file,plan.bytes);state=plan.document;
      }catch(error){for(const item of created)if(!state.media[item.id])try{await ordinaryPath(mediaRoot);await ordinaryFile(item.target);await fs.unlink(item.target);}catch{}throw error;}
      // Backups retain the previous chat state, so keep both generations of media.
      try{const previous=await load(backup),keep=new Set([...Object.keys(state.media),...Object.keys(previous?.media||{})]);for(const name of await fs.readdir(mediaRoot))if(/^[a-f0-9]{64}\.bin$/.test(name)&&!keep.has(name.slice(0,64))){const target=path.join(mediaRoot,name);await ordinaryFile(target);await fs.unlink(target);}}catch{if(!notices.includes('Старые вложения не удалось очистить.'))notices.push('Старые вложения не удалось очистить.');}
      return {...publicState(),saved:true,pruned:plan.pruned};
    });queue=operation.catch(()=>{});return operation;
  }
  async function save(input,options){return commit(await prepare(input,options));}
  async function read(id){if(!uuid(id))throw fail('Некорректный ID диалога.');const chat=state.chats.find(item=>item.id===id);if(!chat)throw fail('Диалог не найден.',404);
    async function hydrate(value){if(typeof value==='string'&&/^engee-media:[a-f0-9]{64}$/.test(value)){const id=value.slice(12),item=state.media[id];if(!item)throw fail('Вложение истории не найдено.');await ordinaryPath(mediaRoot);const target=path.join(mediaRoot,id+'.bin'),stat=await ordinaryFile(target);if(!stat||stat.size!==item.size)throw fail('Вложение истории повреждено.');const bytes=await fs.readFile(target);if(hash(bytes)!==id)throw fail('Вложение истории повреждено.');return 'data:'+item.mime+';base64,'+bytes.toString('base64');}if(Array.isArray(value))return Promise.all(value.map(hydrate));if(plain(value)){const result={};for(const [key,item]of Object.entries(value))result[key]=await hydrate(item);return result;}return value;}
    return {chat:await hydrate(clone(chat)),revision:state.revision};
  }
  async function prepareUpsert(input,options){if(!plain(input)||!plain(input.chat))throw fail('Нужен диалог.');const chats=state.chats.filter(chat=>chat.id!==input.chat.id);chats.push({...input.chat,updatedAt:new Date().toISOString()});return prepare({chats,activeId:input.activeId===undefined?input.chat.id:input.activeId,drafts:input.drafts||state.drafts,draftSecretRefs:input.draftSecretRefs||refs(),revision:input.revision},options);}
  async function upsert(input){return commit(await prepareUpsert(input));}
  async function prepareCurrent(drafts,options){return prepare({chats:state.chats,activeId:state.activeId,drafts,draftSecretRefs:refs(),revision:state.revision},options);}
  async function remove(input){if(!uuid(input.id))throw fail('Некорректный ID диалога.');if(!state.chats.some(chat=>chat.id===input.id))throw fail('Диалог не найден.',404);const chats=state.chats.filter(chat=>chat.id!==input.id);return save({chats,activeId:state.activeId===input.id?chats[0]?.id||null:state.activeId,drafts:state.drafts,draftSecretRefs:refs(),revision:input.revision});}
  async function verifyMedia(document){await ordinaryPath(mediaRoot);for(const [id,item]of Object.entries(document.media)){const target=path.join(mediaRoot,id+'.bin'),stat=await ordinaryFile(target);if(!stat||stat.size!==item.size||hash(await fs.readFile(target))!==id)throw fail('Сохранённое изображение повреждено. Повторите добавление вложения перед выходом.');}}
  async function flush(){await queue;await ordinaryPath(directory);await verifyMedia(state);await write(file,Buffer.from(JSON.stringify(state)));return publicState();}
  return {list:publicState,read,prepare,prepareUpsert,prepareCurrent,commit,save,upsert,remove,flush,resolve,secrets:()=>privateSecrets(state.privateDrafts),revision:()=>state.revision};
}
