import http from 'node:http';
import fs from 'node:fs/promises';
import { existsSync, realpathSync, lstatSync, createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { detectClaude, runClaude, openClaudeSession, prepareClaudeContext } from './claude.mjs';
import { runOpenAI } from './openai-responses.mjs';
import { createOpenRouterAuth, callbackPage } from './openrouter-auth.mjs';
import { readLlmStatus } from './llm-status.mjs';
import { validateJuliaPath } from './julia.mjs';
import {validateComponentPath} from './component-paths.mjs';
import { createChatStore, DRAFT_SECRET, CHAT_LIMITS, atomicWrite, restoreMaskedText } from './chat-store.mjs';
import { createEditorSave } from './editor-save.mjs';
import { juliaCapability, prepareJuliaCode, runJuliaCode, closeJuliaRuns } from './julia-runner.mjs';
import { runUniversalApi } from './universal-api.mjs';
import { createConnectionsStore } from './connections.mjs';
import { detectPrograms, launchProgram, validateProgram } from './programs.mjs';
import { sessionOptions, startSession, stopSession } from './engee-session.mjs';
import { prepareRemoteUpload, uploadRemoteFile, listRemoteFiles } from './engee-files.mjs';
import { detectShells, createTerminal, inputTerminal, resizeTerminal, closeTerminal, subscribeTerminal, listTerminals, closeAllTerminals } from './terminal.mjs';

const WEB = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(WEB, '../..');
const DATA = path.join(ROOT, 'data');
const SKILLS = path.join(ROOT, 'resources/skills');
const DEFAULT_MODELS = path.join(ROOT, 'resources/LLM');
const DEFAULT_WORKSPACE = path.join(ROOT, 'workspace');
const CONFIG = path.join(DATA, 'settings.json');
const PORT = Number(process.env.ENGEE_AGENT_PORT || 3081);
const installationId = createHash('sha256').update(ROOT.toLowerCase().replace(/[\\/]+$/,'')).digest('hex').slice(0, 16);
const providers = [
  {id:'ollama', group:'local', label:'Ollama — локальные и облачные модели', baseUrl:'http://127.0.0.1:11434/v1', defaultModel:'', requiresKey:false, website:'https://ollama.com'},
  {id:'local', group:'local', label:'GGUF — встроенный запуск на процессоре', baseUrl:'', defaultModel:'local', requiresKey:false, website:'https://github.com/ggml-org/llama.cpp'},
  {id:'lmstudio', group:'local', label:'LM Studio — локальный сервер', baseUrl:'http://127.0.0.1:1234/v1', defaultModel:'', requiresKey:false, website:'https://lmstudio.ai'},
  {id:'claude', group:'claude', label:'Claude Code — приложение на этом ПК', baseUrl:'', defaultModel:'default', requiresKey:false, website:'https://code.claude.com/docs/en/setup'},
  {id:'openai', label:'Codex — OpenAI API', baseUrl:'https://api.openai.com/v1', defaultModel:'', requiresKey:true, website:'https://platform.openai.com/api-keys'},
  {id:'puter', label:'Puter — гостевой доступ / вход', baseUrl:'', defaultModel:'gpt-5.4-nano', requiresKey:false, website:'https://puter.com'},
  {id:'openrouter', group:'free', freeOnly:true, label:'OpenRouter — только бесплатные модели', baseUrl:'https://openrouter.ai/api/v1', defaultModel:'openrouter/free', requiresKey:true, website:'https://openrouter.ai/settings/keys'},
  {id:'groq', label:'Groq — бесплатная квота', baseUrl:'https://api.groq.com/openai/v1', defaultModel:'openai/gpt-oss-20b', requiresKey:true, website:'https://console.groq.com/keys'},
  {id:'gemini', label:'Gemini — бесплатная квота', baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel:'gemini-3.1-flash-lite', requiresKey:true, website:'https://aistudio.google.com/apikey'},
  {id:'deepseek', label:'DeepSeek — API', baseUrl:'https://api.deepseek.com', defaultModel:'deepseek-flash', requiresKey:true, website:'https://platform.deepseek.com/api_keys'},
  {id:'qwen', label:'Qwen — Alibaba Cloud API', baseUrl:'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', defaultModel:'qwen3.8-flash', requiresKey:true, website:'https://www.alibabacloud.com/help/en/model-studio/get-api-key'},
  {id:'kimi', label:'Kimi — API', baseUrl:'https://api.moonshot.ai/v1', defaultModel:'kimi-k3', requiresKey:true, website:'https://platform.kimi.ai'},
  {id:'colibri', group:'local', label:'Colibri — локальная Qwen3-Coder', baseUrl:'http://127.0.0.1:8001/v1', defaultModel:'qwen3-coder-30b-a3b-colibri', requiresKey:false, website:''},
  {id:'custom', label:'Другой LLM — совместимый API', baseUrl:'', defaultModel:'', requiresKey:false, website:''},
];
for(const preset of providers)if(!preset.group)preset.group='advanced';
await Promise.all([DATA, SKILLS, DEFAULT_MODELS, DEFAULT_WORKSPACE].map(p=>fs.mkdir(p,{recursive:true})));
const defaults = {provider:'colibri',baseUrl:'http://127.0.0.1:8001/v1',model:'qwen3-coder-30b-a3b-colibri',connectionId:'',modelsDir:'resources/LLM',workspace:'workspace',localModelPath:'',juliaPath:'',claudePath:'',powershellPath:'',gitBashPath:'',engeeAccountUrl:'https://engee.com',engeeRuntimeUrl:'',apiKeys:{},engeeToken:'',engeeUsername:'',engeePassword:'',engeeEnabled:false,maxTokens:4096};
let config = {...defaults};
const notices=[];
try {config = {...defaults, ...JSON.parse(await fs.readFile(CONFIG,'utf8'))};} catch(e) {if(e.code !== 'ENOENT'){await fs.rename(CONFIG,CONFIG+'.invalid-'+Date.now());notices.push('Конфигурация повреждена. Сохранена резервная копия; настройте подключения в интерфейсе.');}}
config.apiKeys ||= {};
const connections=await createConnectionsStore(DATA);notices.push(...connections.notices);
if(config.connectionId&&!connections.get(config.connectionId)){config.connectionId='';config.provider='local';config.model='local';config.baseUrl='';notices.push('Сохранённое подключение не найдено. Выбрана встроенная локальная модель.');}
for(const [field,fallback] of [['workspace','workspace'],['modelsDir','resources/LLM']]){
  const selected=path.resolve(ROOT,String(config[field]||fallback));
  if(!existsSync(selected)||!lstatSync(selected).isDirectory()){config[field]=fallback;notices.push(field==='workspace'?'Папка проекта с другого ПК не найдена. Выбрана встроенная папка workspace.':'Папка моделей не найдена. Выбрана встроенная resources/LLM.');}
}
if(config.provider==='claude'){const detected=await detectClaude({configuredPath:config.claudePath||''});if(!detected.available||detected.auth?.authenticated===false){config.provider='local';config.model='local';config.baseUrl='';notices.push('Claude Code на этом ПК не найден или требует входа. Выбрана встроенная локальная модель; настройте Claude в «Параметры → Нейросети и подключения».');}}
if(config.localModelPath&&!existsSync(path.resolve(ROOT,config.localModelPath)))config.localModelPath='';
const pending = new Map();
const requests = new Set();
const packages=new Map();
let lifecycleBusy=false,mutationEpoch=0,activeMutations=0;const saveReceipts=new Map();
let chats;
let localProcess, localBase = '', localModel = '';
let localStarting = false;
let engeeAccess = '';

// --- Engine management (Colibri + Proxy) ---
const CALIBRI_ROOT = process.env.CALIBRI_ROOT || ROOT; // AgentLite is self-contained now
let COLIBRI_RUNTIME='colibri-v2.1.0';try{
  const candidate=path.join(process.env.LOCALAPPDATA||'','colibri','runtime',COLIBRI_RUNTIME);
  if(!existsSync(path.join(candidate,'coli')))throw new Error('no coli binary');
  COLIBRI_RUNTIME=candidate;
}catch(e){console.error('Runtime probe failed, falling back:',e.message);}
const ENGINE_PORT = 8000;
const PROXY_PORT = 8001;
let engineProcess = null;
let proxyProcess = null;
let engineState = 'stopped'; // stopped | starting | running | error
let engineLogBuffer = [];
async function startEngine(){
  if(engineState==='starting'||engineState==='running')throw fail('Движок уже запущен.',409);
  engineState='starting';
  const logsDir=path.join(DATA,'logs');await fs.mkdir(logsDir,{recursive:true});
  const logFile=path.join(logsDir,'engine.log');
  try{
    const args=['serve','--model',path.join('G:\\','models','qwen3-coder-30b'),'--model-id','qwen3-coder-30b-a3b-colibri','--cap','32','--ctx','16384','--host','127.0.0.1','--port',String(ENGINE_PORT)];
    engineProcess=spawn('py',['-3',path.join(COLIBRI_RUNTIME,'coli'),...args],{env:{...process.env,COLI_CUDA:'1',CUDA_DENSE:'1',CUDA_EXPERT_GB:'3',HEAT_FILE:'G:\\colibri_cache\\qwen.heat',COLI_CACHE_DIR:'G:\\colibri_cache',COLI_TOOL_FALLBACK:'1',COLI_CTX:'16384'},cwd:CALIBRI_ROOT,stdio:['ignore','pipe','pipe']});
    engineProcess.stdout.on('data',d=>{engineLogBuffer.push(d.toString());if(engineLogBuffer.length>500)engineLogBuffer=engineLogBuffer.slice(-500);console.log('[engine]',d.toString().trim());});
    engineProcess.stderr.on('data',d=>{engineLogBuffer.push('[err] '+d.toString());if(engineLogBuffer.length>500)engineLogBuffer=engineLogBuffer.slice(-500);});
    engineProcess.on('close',code=>{engineState='stopped';engineProcess=null;proxyProcess?.kill();console.log('engine exited code='+code);});
    await new Promise((resolve,reject)=>setTimeout(resolve,3000));
    const h=await fetch(`http://127.0.0.1:${ENGINE_PORT}/health`).catch(()=>null);
    if(h?.ok){
      engineState='running';
      proxyProcess=spawn('py',['-3',path.join(CALIBRI_ROOT,'tools','colibri_proxy.py'),`--listen=${PROXY_PORT}`,`--upstream-host=127.0.0.1`,`--upstream-port=${ENGINE_PORT}`,`--log`,path.join(DATA,'logs','proxy-requests.jsonl')],{cwd:CALIBRI_ROOT,stdio:['ignore','ignore','ignore']});
      proxyProcess.on('error',()=>{});proxyProcess.on('close',()=>{engineState='stopped';engineProcess?.kill();});
    }else{throw new Error('Colibri не ответил на /health через 3 сек.');}
  }catch(e){engineState='error';console.error('startEngine failed:',e.message);}
}
async function stopEngine(){
  if(proxyProcess){proxyProcess.kill();proxyProcess=null;}
  if(engineProcess){engineProcess.kill();engineProcess=null;}
  engineState='stopped';engineLogBuffer=[];
}
async function engineStatus(){return{state:engineState,logTail:engineLogBuffer.slice(-100).join('\n').toString()};}

const fail = (message, status=400) => Object.assign(new Error(message),{status});
const absolute = value => path.resolve(ROOT, String(value));
const inside = (root, target) => {const relative=path.relative(root,target);return !relative.startsWith('..'+path.sep) && relative!=='..' && !path.isAbsolute(relative);};
function noLinks(root, target) {
  let item = root;
  const rejectLink=p=>{try{if(lstatSync(p).isSymbolicLink())throw fail('Ссылки за пределы рабочей папки запрещены.');}catch(e){if(e.code!=='ENOENT')throw e;}};
  rejectLink(item);
  if(existsSync(root) && path.resolve(realpathSync(root)).toLowerCase()!==path.resolve(root).toLowerCase()) throw fail('Папка не должна находиться внутри ссылки.');
  for (const part of path.relative(root,target).split(path.sep).filter(Boolean)) {
    item=path.join(item,part);
    rejectLink(item);
  }
}
function workspacePath(input='') {
  if(typeof input!=='string') throw fail('Укажите относительный путь.');
  const root=absolute(config.workspace), target=path.resolve(root,input);
  if(!inside(root,target)) throw fail('Файл находится за пределами рабочей папки.',403);
  if(inside(DATA,target)) throw fail('Личные настройки приложения недоступны агенту.',403);
  noLinks(root,target);
  if(path.relative(root,target).split(path.sep).some(p=>p.startsWith('.') || /^(node_modules|data)$/i.test(p))) throw fail('Служебные и скрытые файлы недоступны агенту.',403);
  return target;
}
const redact = str => {
  let output=String(str);
  for(const secret of [config.engeeToken,config.engeeUsername,config.engeePassword,engeeAccess,...Object.values(config.apiKeys),...connections.secrets(),...(chats?.secrets()||[])].filter(Boolean)) output=output.split(secret).join('[скрыто]');
  return output.replace(/Bearer\s+\S+/gi,'Bearer [скрыто]');
};
function activeConnection(){return config.connectionId?connections.get(config.connectionId):undefined;}
function publicConfig(){const {apiKeys,engeeToken,engeeUsername,engeePassword,...rest}=config;return {...rest,hasApiKey:!!(activeConnection()?.type==='api'?activeConnection().apiKey:apiKeys[config.provider]),apiKeyStatus:Object.fromEntries(providers.map(provider=>[provider.id,!!apiKeys[provider.id]])),hasEngeeToken:!!engeeToken,hasEngeeLogin:!!engeeUsername&&!!engeePassword};}
function freeOpenRouter(baseUrl,model){if(validateUrl(baseUrl,true)!=='https://openrouter.ai/api/v1')throw fail('Бесплатный режим OpenRouter использует https://openrouter.ai/api/v1. Для другого сервера добавьте отдельное подключение.');if(model!=='openrouter/free'&&!/:free$/.test(model))throw fail('В этом режиме доступны только openrouter/free и модели с окончанием :free.');}
function validateUrl(value, required=false) {
  if(!value && !required) return '';
  let url;try{url=new URL(value);}catch{throw fail('Некорректный адрес сервера.');}
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw fail('Нужен http/https адрес без пароля и параметров.');
  if(url.protocol==='http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw fail('Для удалённого сервера нужен HTTPS.');
  return url.href.replace(/\/$/,'');
}
async function saveConfig(input, {openRouterKey,dryRun=false,baseline=config}={}) {
  if(!input || typeof input!=='object' || Array.isArray(input)) throw fail('Некорректные настройки.');
  const next={...baseline, apiKeys:{...baseline.apiKeys}};
  if(openRouterKey!==undefined){if(baseline.apiKeys.openrouter)throw fail('Существующий ключ OpenRouter сохранён. Проверьте его; новый ключ не заменяет старый.',409);if(typeof openRouterKey!=='string'||!openRouterKey.trim()||openRouterKey.length>16384||/[\r\n\0]/.test(openRouterKey))throw fail('OpenRouter не вернул корректный API-ключ.');next.apiKeys.openrouter=openRouterKey.trim();}
  const changedProvider = input.provider && input.provider!==baseline.provider;
  if(input.provider!==undefined){
    const preset=providers.find(p=>p.id===input.provider);if(!preset)throw fail('Неизвестное подключение.');
    next.provider=input.provider;
    if(input.connectionId===undefined)next.connectionId='';
    if(changedProvider){next.baseUrl=preset.baseUrl;next.model=preset.defaultModel;}
  }
  if(input.connectionId!==undefined){if(typeof input.connectionId!=='string'||input.connectionId&&!connections.get(input.connectionId))throw fail('Сохранённое подключение не найдено.');next.connectionId=input.connectionId;}
  for(const key of ['baseUrl','model','modelsDir','workspace','localModelPath','engeeAccountUrl','engeeRuntimeUrl']) if(input[key]!==undefined){
    if(typeof input[key]!=='string' || input[key].length>4096) throw fail('Некорректное поле настроек.');
    next[key]=input[key].trim();
  }
  next.baseUrl=validateUrl(next.baseUrl);
  if(next.provider==='openrouter')freeOpenRouter(next.baseUrl,next.model);
  next.engeeAccountUrl=validateUrl(next.engeeAccountUrl,true);
  next.engeeRuntimeUrl=validateUrl(next.engeeRuntimeUrl);
  for(const key of ['workspace','modelsDir']) {
    if(!next[key])throw fail('Укажите папку.');
    const dir=absolute(next[key]);
    if(dir===path.parse(dir).root)throw fail('Выберите отдельную папку, а не весь диск.');
    if(key==='workspace' && inside(DATA,dir))throw fail('Личные настройки нельзя выбирать рабочей папкой.');
    if(existsSync(dir) && (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink())) throw fail('Укажите обычную папку.');
    noLinks(path.parse(dir).root,dir);
    if(!dryRun)await fs.mkdir(dir,{recursive:true});
    // Store paths inside the archive relative to its root, preserving portability.
    next[key]=inside(ROOT,dir) ? path.relative(ROOT,dir) : dir;
  }
  if(input.apiKey!==undefined){if(typeof input.apiKey!=='string'||input.apiKey.length>16384)throw fail('Некорректный ключ.');if(input.apiKey&&!next.connectionId) next.apiKeys[next.provider]=input.apiKey.trim();}
  if(input.clearApiKey&&!next.connectionId)delete next.apiKeys[next.provider];
  if(input.engeeToken!==undefined){if(typeof input.engeeToken!=='string')throw fail('Некорректный токен.');if(input.engeeToken)next.engeeToken=input.engeeToken.trim();}
  if(input.clearEngeeToken)next.engeeToken='';
  for(const field of ['engeeUsername','engeePassword'])if(input[field]!==undefined){if(typeof input[field]!=='string')throw fail('Некорректные данные входа.');if(input[field])next[field]=input[field];}
  if(input.clearEngeeLogin){next.engeeUsername='';next.engeePassword='';}
  if(input.juliaPath!==undefined){const file=await validateJuliaPath(input.juliaPath);next.juliaPath=file&&inside(ROOT,file)?path.relative(ROOT,file):file;}
  for(const [field,kind]of [['claudePath','claude'],['powershellPath','powershell'],['gitBashPath','gitbash']])if(input[field]!==undefined){const file=await validateComponentPath(kind,input[field]);next[field]=file&&inside(ROOT,file)?path.relative(ROOT,file):file;}
  if(dryRun)return next;
  const tmp=CONFIG+'.tmp';
  const profile=next.connectionId&&connections.get(next.connectionId);if(profile?.type==='api'&&(input.apiKey||input.clearApiKey))await connections.save({...profile,apiKey:input.apiKey||'',clearApiKey:input.clearApiKey});
  await atomicWrite(CONFIG,JSON.stringify(next,null,2)+'\n');config=next;
  pending.clear();engeeAccess='';
  return {config:publicConfig()};
}
async function persistConfig(){await atomicWrite(CONFIG,JSON.stringify(config,null,2)+'\n');}
const KEEP_SECRET='__KEEP_SECRET__';
function configEditor(){const document={...config,apiKeys:{...config.apiKeys}};for(const key of ['engeeToken','engeeUsername','engeePassword'])document[key]=config[key]?KEEP_SECRET:'';for(const key of Object.keys(document.apiKeys))document.apiKeys[key]=document.apiKeys[key]?KEEP_SECRET:'';return {path:'data/settings.json',document,secretsMasked:true};}
async function saveEditor(document,{dryRun=false}={}){
  if(!document||typeof document!=='object'||Array.isArray(document))throw fail('Конфигурация должна быть объектом JSON.');
  const allowed=['provider','baseUrl','model','connectionId','modelsDir','workspace','localModelPath','juliaPath','claudePath','powershellPath','gitBashPath','engeeAccountUrl','engeeRuntimeUrl','apiKeys','engeeToken','engeeUsername','engeePassword','engeeEnabled','contextTokens','maxTokens','apiProxyEnabled','apiProxyPort'];
  if(Object.keys(document).some(k=>!allowed.includes(k)))throw fail('В конфигурации есть неизвестные поля.');
  const keys=document.apiKeys??configEditor().document.apiKeys;if(!keys||typeof keys!=='object'||Array.isArray(keys))throw fail('apiKeys должен быть объектом.');
  const nextKeys={};for(const [id,value] of Object.entries(keys)){if(!providers.some(p=>p.id===id)||typeof value!=='string'||value.length>16384)throw fail('Некорректный ключ нейросети.');const actual=value===KEEP_SECRET?config.apiKeys[id]:value.trim();if(actual)nextKeys[id]=actual;}
  const input={...document};delete input.apiKeys;
  for(const key of ['engeeToken','engeeUsername','engeePassword']){if(input[key]===KEEP_SECRET)delete input[key];else if(input[key]!==undefined&&(typeof input[key]!=='string'||input[key].length>16384))throw fail('Некорректное поле доступа Engee.');}
  if(dryRun){const candidate=await saveConfig(input,{dryRun:true});candidate.apiKeys=nextKeys;for(const key of ['engeeToken','engeeUsername','engeePassword'])if(document[key]==='')candidate[key]='';return candidate;}
  const old=config,previousKeys=config.apiKeys;await saveConfig(input);
  try{config.apiKeys=nextKeys;for(const key of ['engeeToken','engeeUsername','engeePassword'])if(document[key]==='')config[key]='';await persistConfig();}catch(e){config=old;config.apiKeys=previousKeys;await persistConfig();throw e;}
  return {config:publicConfig(),message:'Конфигурация сохранена. Проверьте подключение Engee и выбранной модели.'};
}
async function bindToken(body){if(typeof body.token!=='string'||!body.token.trim()||body.token.length>16384)throw fail('Введите токен.');if(body.target==='engee')return {...await saveConfig({engeeToken:body.token}),message:'Токен привязан к Engee. Нажмите «Проверить Engee».'};if(body.target==='provider'){if(['puter','local','claude'].includes(config.provider))throw fail('Для этого подключения токен API не используется. Выберите сервис с API-ключом.');return {...await saveConfig({apiKey:body.token}),message:'Ключ привязан к выбранному провайдеру: '+config.provider+'. Проверьте соединение.'};}throw fail('Выберите Engee или нейросеть.');}
chats=await createChatStore({directory:DATA,getSecrets:()=>[config.engeeToken,config.engeeUsername,config.engeePassword,engeeAccess,...Object.values(config.apiKeys),...connections.secrets()].filter(Boolean)});
const editorSave=createEditorSave({workspace:()=>absolute(config.workspace),resolveFile:workspacePath,checkCode:checkEngeeCode});
const plainObject=value=>value&&typeof value==='object'&&!Array.isArray(value);
function suppliedDraftRef(refs,fieldPath){if(!Array.isArray(refs)||refs.length>20)throw fail('Ссылка сохранённого черновика потеряна.');const ref=refs.find(item=>item?.path===fieldPath);if(!ref)throw fail('Введите поле доступа заново.',409);return ref.id;}
function configDraftContext(input,baseline=config){const provider=input.provider??baseline.provider;return {provider,connectionId:input.connectionId??(input.provider!==undefined?'':baseline.connectionId||''),baseUrl:input.baseUrl??(provider!==baseline.provider?providers.find(item=>item.id===provider)?.baseUrl||'':baseline.baseUrl||'')};}
function resolveConfigDraft(input){if(!plainObject(input))throw fail('Некорректные настройки.');const result={...input};delete result.draftSecretRefs;for(const field of ['apiKey','engeeToken','engeeUsername','engeePassword'])if(result[field]===DRAFT_SECRET)result[field]=chats.resolve(suppliedDraftRef(input.draftSecretRefs,'drafts.settings.fields.'+field),{kind:'config',field,context:configDraftContext(input)});return result;}
function resolveBindDraft(input){const result={...input};delete result.draftSecretRefs;if(result.token===DRAFT_SECRET)result.token=chats.resolve(suppliedDraftRef(input.draftSecretRefs,'drafts.bindToken.token'),{kind:'bindToken',field:'token',context:{target:result.target||'',provider:config.provider,connectionId:config.connectionId||''}});return result;}
function resolveConnectionDraft(input){const result=JSON.parse(JSON.stringify(input));delete result.draftSecretRefs;const context={profileId:result.id||'',type:result.type||'',name:result.name||'',baseUrl:result.settings?.baseUrl||'',format:result.settings?.format||'chat-completions'};
  for(const ref of input.draftSecretRefs||[])if(ref?.kind==='connectionText'&&['settings.headers','settings.requestTemplate'].includes(ref.field)){const key=ref.field.split('.')[1];if(result.settings?.[key]&&JSON.stringify(result.settings[key]).includes(DRAFT_SECRET)){const original=chats.resolve(ref.id,{kind:'connectionText',field:ref.field,context});result.settings[key]=JSON.parse(restoreMaskedText(JSON.stringify(result.settings[key]),original));}}
  function visit(value,parts=[]){if(value===DRAFT_SECRET){const field=parts.join('.');return chats.resolve(suppliedDraftRef(input.draftSecretRefs,'drafts.wizard.'+field),{kind:'connection',field,context});}if(Array.isArray(value))return value.map((item,index)=>visit(item,[...parts,String(index)]));if(plainObject(value)){const out={};for(const [key,item]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw fail('Недопустимое поле подключения.');out[key]=visit(item,[...parts,key]);}return out;}return value;}
  return visit(result);
}
function editorDraftDocument(input){if(input.draftSecretRef){if(input.document!==undefined)throw fail('Выберите изменённый документ или сохранённый черновик.');let document;try{document=JSON.parse(chats.resolve(input.draftSecretRef,{kind:'configEditor',field:'text',context:{path:'data/settings.json'}}));}catch(error){if(error.status)throw error;throw fail('Сохранённый черновик конфигурации содержит незавершённый JSON. Введите исправленный документ в редакторе.');}return document;}if(input.draftBaseRef){const original=chats.resolve(input.draftBaseRef,{kind:'configEditor',field:'text',context:{path:'data/settings.json'}});return JSON.parse(restoreMaskedText(JSON.stringify(input.document),original));}return input.document;}
function bindPatch(body,baseline=config){if(typeof body.token!=='string'||!body.token.trim()||body.token.length>16384)throw fail('Введите токен.');if(body.target==='engee')return {engeeToken:body.token};if(body.target==='provider'&&!['puter','local','claude'].includes(baseline.provider))return {apiKey:body.token};throw fail('Выберите Engee или провайдера с API-ключом.');}
async function autosaveLocal(body={}){
  if(!plainObject(body))throw fail('Некорректный пакет сохранения.');
  if(requests.size&&(body.fileEdits?.length||body.configPatch||body.configDocument||body.configDocumentRef||body.bindToken))throw fail('Сначала завершите или остановите текущий запрос.',409);
  const before=config,oldProfile=activeConnection()?JSON.parse(JSON.stringify(activeConnection())):null,plans=await editorSave.prepare(body.fileEdits||[]);
  const refs=body.draftSecretRefs||[],patch=body.configPatch?resolveConfigDraft({...body.configPatch,draftSecretRefs:refs}):null;
  const document=body.configDocumentRef?editorDraftDocument({draftSecretRef:body.configDocumentRef}):body.configDocumentBaseRef?editorDraftDocument({document:body.configDocument,draftBaseRef:body.configDocumentBaseRef}):body.configDocument;
  const token=body.bindToken?resolveBindDraft({...body.bindToken,draftSecretRefs:refs}):null;
  let candidate=document!==undefined?await saveEditor(document,{dryRun:true}):config;
  if(patch)candidate=await saveConfig(patch,{dryRun:true,baseline:candidate});
  if(token){if(token.target==='provider'&&candidate.provider!==config.provider)throw fail('Провайдер изменился. Привяжите токен после сохранения подключения.',409);candidate=await saveConfig(bindPatch(token,candidate),{dryRun:true,baseline:candidate});}
  const secretValues=[candidate.engeeToken,candidate.engeeUsername,candidate.engeePassword,...Object.values(candidate.apiKeys||{}),patch?.apiKey,token?.token].filter(Boolean);
  const stateInput=body.chatState?JSON.parse(JSON.stringify(body.chatState)):null;
  const drafts=JSON.parse(JSON.stringify(stateInput?.drafts||chats.list().drafts));
  if(plans.some(plan=>plan.token.path===drafts.fileEditor?.path))drafts.fileEditor=null;
  if(document!==undefined)drafts.configEditor=null;
  if(patch){if(Object.keys(patch).some(key=>!['juliaPath','claudePath','powershellPath','gitBashPath'].includes(key))){if(drafts.settings){drafts.settings.changed=false;for(const key of ['apiKey','engeeToken','engeeUsername','engeePassword'])delete drafts.settings.fields?.[key];}}if(patch.juliaPath!==undefined)drafts.juliaPath={value:candidate.juliaPath||'',changed:false};}
  if(patch&&['claudePath','powershellPath','gitBashPath'].some(key=>patch[key]!==undefined)&&drafts.programPaths)drafts.programPaths={fields:Object.fromEntries(['claudePath','powershellPath','gitBashPath'].map(key=>[key,candidate[key]||''])),changed:false};
  if(token&&drafts.bindToken)drafts.bindToken.token='';
  if(stateInput)stateInput.drafts=drafts;
  const updatesDrafts=plans.length||document!==undefined||patch||token;
  const chatPlan=stateInput?await (stateInput.chat?chats.prepareUpsert(stateInput,{extraSecrets:secretValues}):chats.prepare(stateInput,{extraSecrets:secretValues})):updatesDrafts?await chats.prepareCurrent(drafts,{extraSecrets:secretValues}):null;
  let fileResults=[],configChanged=false;
  try{
    fileResults=await editorSave.commit(plans);
    if(document!==undefined){configChanged=true;await saveEditor(document);}
    if(patch){configChanged=true;await saveConfig(patch);}
    if(token){configChanged=true;await bindToken(token);}
    const chatState=chatPlan?await chats.commit(chatPlan):await chats.flush();
    const saveId=randomUUID();saveReceipts.set(saveId,{epoch:mutationEpoch,revision:chats.revision(),workspace:config.workspace,configHash:createHash('sha256').update(JSON.stringify(config)).digest('hex'),settingsHash:await fingerprint(CONFIG),connectionsHash:await fingerprint(path.join(DATA,'connections.json')),chatsHash:await fingerprint(path.join(DATA,'chats.json')),files:plans.map(plan=>({target:plan.target,hash:createHash('sha256').update(plan.after).digest('hex')})),expires:Date.now()+10*60000});while(saveReceipts.size>20)saveReceipts.delete(saveReceipts.keys().next().value);
    return {saved:true,saveId,fileResults,chatState,config:publicConfig(),message:'Изменения и локальные диалоги сохранены.'};
  }catch(error){
    if(configChanged){try{if(oldProfile){await connections.save({...oldProfile,clearApiKey:!oldProfile.apiKey});}config=before;await persistConfig();}catch{throw fail('Сохранение не завершено, восстановление настроек тоже не удалось. Приложение оставлено открытым; проверьте локальные файлы.',500);}}
    try{await editorSave.rollback(plans);}catch{throw fail('Сохранение не завершено. Файлы изменились во время отката; приложение оставлено открытым.',409);}
    throw error;
  }
}
const openRouterAuth=createOpenRouterAuth({port:PORT,getKey:()=>config.apiKeys.openrouter||'',saveKey:key=>saveConfig({},{openRouterKey:key}),activate:()=>saveConfig({provider:'openrouter',connectionId:'',baseUrl:'https://openrouter.ai/api/v1',model:'openrouter/free'})});
function localState(){return {running:!!localProcess&&!!localBase,starting:localStarting,modelPath:localModel&&inside(ROOT,localModel)?path.relative(ROOT,localModel):localModel,model:localModel?path.basename(localModel):'',baseUrl:localBase};}
async function models(settings=config){
  const root=absolute(settings.modelsDir), result=[];
  async function walk(dir,depth=0){
    if(depth>4)return;
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      if(entry.isSymbolicLink() || entry.name.startsWith('.'))continue;
      const p=path.join(dir,entry.name);
      if(entry.isDirectory())await walk(p,depth+1);
      else if(entry.name.toLowerCase().endsWith('.gguf')){
        const s=await fs.stat(p);result.push({name:entry.name,path:inside(ROOT,p)?path.relative(ROOT,p):p,size:s.size});
      }
    }
  }
  try{await walk(root);}catch{ }
  return result.sort((a,b)=>a.size-b.size);
}
async function skillList(){
  const list=[];
  for(const entry of await fs.readdir(SKILLS,{withFileTypes:true})) if(entry.isDirectory() && !entry.isSymbolicLink()) {
    if(config.engeeEnabled !== true && entry.name.startsWith('engee-')) continue;
    try{const content=await fs.readFile(path.join(SKILLS,entry.name,'SKILL.md'),'utf8');const title=content.match(/^#\s+(.+)$/m)?.[1]||entry.name;list.push({name:entry.name,title});}catch{}
  }
  return list.sort((a,b)=>a.name.localeCompare(b.name));
}
async function listFiles(input=''){
  const dir=workspacePath(input);
  const files=[];
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
    if(e.isSymbolicLink()||e.name.startsWith('.')||['node_modules','data'].includes(e.name))continue;
    const p=path.join(dir,e.name);const s=await fs.stat(p);
    files.push({name:e.name,path:path.relative(absolute(config.workspace),p).split(path.sep).join('/'),type:e.isDirectory()?'directory':'file',isDirectory:e.isDirectory(),size:s.size});
  }
  return {files:files.sort((a,b)=>Number(b.isDirectory)-Number(a.isDirectory)||a.name.localeCompare(b.name))};
}
async function readText(target){const s=await fs.stat(target);if(!s.isFile()||s.size>1024*1024)throw fail('Нужен текстовый файл размером до 1 МБ.');const bytes=await fs.readFile(target);if(bytes.includes(0))throw fail('Двоичный файл нельзя прочитать как текст.');return bytes.toString('utf8');}
async function fingerprint(target){try{return createHash('sha256').update(await fs.readFile(target)).digest('hex');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const tool = (name,description,properties={},required=[]) => ({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
const str = description=>({type:'string',description});
const tools = [
  tool('list_files','Показать файлы рабочей папки.',{path:str('Относительная папка, пусто для корня.')}),
  tool('read_file','Прочитать текстовый файл рабочей папки.',{path:str('Относительный путь.')},['path']),
  tool('write_file','Предложить запись файла. Пользователь подтвердит точное содержимое.',{path:str('Относительный путь.'),content:str('Полное содержимое файла.')},['path','content']),
  tool('read_skill','Прочитать SKILL.md или ресурс навыка. Возвращает полный текст — вызывай только когда навык действительно нужен.',{name:str('Имя навыка.'),path:str('Относительный ресурс навыка, по умолчанию SKILL.md.')},['name']),
  tool('search_skills','Поиск по локальной справке и навыкам. Возвращает фрагменты и пути — не читает полные SKILL.md, экономит контекст.',{query:str('Искомое слово/фраза.'),name:str('Ограничить одним навыком, необязательно.')},['query']),
  tool('save_skill','Предложить новый навык, сохраняемый в resources/skills.',{name:str('Имя латиницей, цифры и дефисы.'),content:str('Полный SKILL.md с YAML name/description.')},['name','content']),
  tool('engee_status','Проверить статус Engee через настроенный личный API.'),
  tool('engee_start','Предложить запуск среды Engee. Пользователь подтвердит версию и таймаут.',{versionId:str('ID из списка доступных версий; пусто для версии аккаунта.'),inactivityTimeout:{type:'integer',description:'Таймаут простоя в секундах, кратный 60.'}}),
  tool('engee_stop','Предложить остановку среды Engee. Требует отдельного подтверждения пользователя.'),
  tool('engee_upload_file','Предложить передачу выбранного файла проекта в папку /user в Engee. Поддерживает модели и данные, до 64 МиБ. Требует подтверждения.',{path:str('Относительный локальный файл проекта.'),destination:str('Папка Engee внутри /user, например /user/EngeeAgent.')},['path']),
  tool('engee_list_files','Показать имена файлов в выбранной папке /user в Engee. Использует фиксированную команду чтения каталога.',{path:str('Папка Engee внутри /user, по умолчанию /user.')}),
  tool('engee_eval_file','Предложить запуск локального .jl/.ngscript в Engee после подтверждения пользователем.',{path:str('Относительный путь к проверенному файлу.')},['path']),
  tool('engee_eval_code','Предложить выполнение точного кода Julia в Engee. Для вычислений используй фактический результат Engee; требуется подтверждение пользователя.',{code:str('Полный код Julia, например 1+1 или sin.(1:2).')},['code']),
];
const juliaTool=tool('julia_eval_code','Предложить выполнение точного кода в локальной Julia. Пользователь подтверждает код, рабочую папку и установленную версию; код выполняется с обычными правами пользователя.',{code:str('Полный код Julia до 64 КиБ. Последнее значение возвращается даже без println.')},['code']);
function executionTarget(value='julia'){if(!['julia'].includes(value))throw fail('Выберите режим выполнения.');return value;}
function toolsFor(target){
  let base = target==='julia' ? [...tools.filter(item=>!['engee_eval_file','engee_eval_code'].includes(item.function.name)),juliaTool] : tools;
  if(config.engeeEnabled !== true){
    base = base.filter(item=>!/^engee_/.test(item.function.name));
  }
  return base;
}
const systemPrompt = `Ты универсальный AI-агент для работы с кодом и проектами. Отвечай по-русски. Доступна только явно выбранная рабочая папка. Не выдумывай результаты: используй инструменты и сообщай фактические ответы. Для кода используй встроенные функции. Не устанавливай пакеты и не подключай внешние сервисы без разрешения. Запись/запуск требуют подтверждения точного содержимого. Не читай секреты и системные файлы. Подключения пользователь задаёт через настройки. Доступные навыки перечислены ниже.`;
function skillPath(name,relative='SKILL.md'){
  if(!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(name))throw fail('Некорректное имя навыка.');
  if(typeof relative!=='string')throw fail('Некорректный путь.');
  const root=path.join(SKILLS,name), target=path.resolve(root,relative);
  if(!inside(root,target)||relative.split(/[\\/]/).some(p=>p.startsWith('.')))throw fail('Недоступный ресурс навыка.',403);
  noLinks(root,target);return target;
}
async function searchSkills(query,name){
  if(typeof query!=='string'||query.length<2||query.length>200)throw fail('Для поиска нужно от 2 до 200 символов.');
  const roots=name?[{name}]:await skillList();const found=[];let visited=0;
  async function walk(dir,skill){
    if(found.length>=15||visited>6000)return;
    for(const e of await fs.readdir(dir,{withFileTypes:true})){
      if(found.length>=15)return;
      if(e.isSymbolicLink()||e.name.startsWith('.'))continue;
      const p=path.join(dir,e.name);
      if(e.isDirectory())await walk(p,skill);
      else if(/\.(md|json|txt|jl|py|mjs)$/i.test(e.name)){
        visited++;const st=await fs.stat(p);if(st.size>5*1024*1024)continue;
        const text=await fs.readFile(p,'utf8'), i=text.toLowerCase().indexOf(query.toLowerCase());
        if(i>=0)found.push({skill,path:path.relative(path.join(SKILLS,skill),p).split(path.sep).join('/'),excerpt:text.slice(Math.max(0,i-220),i+600)});
      }
    }
  }
  for(const item of roots){const p=path.dirname(skillPath(item.name));await walk(p,item.name);if(found.length>=15)break;}
  return {matches:found};
}
function checkEngeeCode(content){
  if(/\b(?:using|import)\s+Plots\b|\bPlots\s*\.|Pkg\.(?:add|develop)\s*\([^\n]*Plots/i.test(content))throw fail('Используйте встроенную графику Engee без подключения Plots.');
}
async function engeeRequest(url,method='GET',body,options={}){
  if(!config.engeeToken && !(config.engeeUsername&&config.engeePassword))throw fail('В настройках нужен личный токен или данные входа Engee.');
  const multipart=body instanceof FormData;
  const sendRequest=async token=>{try{return await fetch(url,{method,redirect:'error',headers:{Authorization:`Bearer ${token}`,...(body&&!multipart?{'Content-Type':'application/json'}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(120000)});}catch(e){throw fail(e.name==='TimeoutError'?'Engee не ответил за 2 минуты. Проверьте соединение и состояние среды в «Параметры → Engee».':'Не удалось соединиться с Engee. Проверьте интернет и нажмите «Проверить Engee» в «Параметры → Engee». Если запуск кода оборвался, сначала проверьте результат в Engee, прежде чем повторять действие.',502);}};
  let response=await sendRequest(engeeAccess||config.engeeToken);
  if(response.status===401 && config.engeeUsername&&config.engeePassword){
    const login=await fetch(config.engeeAccountUrl+'/account/api/login',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:config.engeeUsername,password:config.engeePassword}),signal:AbortSignal.timeout(30000)});
    if(!login.ok)throw fail(`Вход Engee: HTTP ${login.status}. Проверьте данные входа.`,502);
    const credentials=await login.json();
    if(typeof credentials.accessToken!=='string'||!credentials.accessToken)throw fail('Engee не вернул accessToken.',502);
    engeeAccess=credentials.accessToken;response=await sendRequest(engeeAccess);
  }
  if(!response.ok){let data={};try{data=await response.json();}catch{}const message=data.error?.full_description?.split('\n\n')[0]||data.error?.short_description||data.message||data.error?.message||(typeof data.error==='string'?data.error:'')||data.detail;const detail=typeof message==='string'?redact(message).slice(0,700):'';if(data.result_code==='command_error')throw fail('Ошибка выполнения кода в Engee: '+(detail||'Проверьте синтаксис и имена функций.'),422);throw fail(`Engee: HTTP ${response.status}.${detail?' '+detail:''} Проверьте подключение, лицензию и готовность среды.`,502);}
  return options.responseType==='raw'?response:response.status===204?{}:response.json();
}
async function engeeInfo(){
  const info=await engeeRequest(`${config.engeeAccountUrl}/account/api/engee/info`);
  const result={serverStatus:info.serverStatus??null,serverReady:info.serverReady??(info.serverStatus==='running'),runtimeUrl:info.url??null,version:info.version??info.serverVersion??info.productVersion?.name??null};
  if(result.serverStatus==='running'&&result.serverReady){
    try{const runtime=validateUrl(config.engeeRuntimeUrl||new URL(result.runtimeUrl,config.engeeAccountUrl+'/').href,true);const reply=await engeeRequest(runtime+'/external/command/eval','POST',{command:'string(engee.version())'});result.version=reply.result??result.version;}catch{result.versionError='Версия среды пока недоступна; статус проверен.';}
  }
  return result;
}
async function prepareTool(name,args={},target='engee') {
  target=executionTarget(target);
  if(!toolsFor(target).some(t=>t.function.name===name))throw fail('Этот инструмент недоступен в выбранном режиме выполнения.');
  if(!args||typeof args!=='object'||Array.isArray(args))throw fail('Неверные аргументы инструмента.');
  if(name==='list_files')return {result:await listFiles(args.path||'')};
  if(name==='read_file')return {result:{content:await readText(workspacePath(args.path))}};
  if(name==='read_skill')return {result:{content:await readText(skillPath(args.name,args.path||'SKILL.md'))}};
  if(name==='search_skills')return {result:await searchSkills(args.query,args.name)};
  if(config.engeeEnabled===true){
    if(name==='engee_status')return {result:await engeeInfo()};
    if(name==='engee_list_files'){const info=await engeeInfo();if(info.serverStatus!=='running'||!info.serverReady)throw fail('Дождитесь готовности среды Engee.');const runtime=validateUrl(config.engeeRuntimeUrl||new URL(info.runtimeUrl,config.engeeAccountUrl+'/').href,true);return {result:await listRemoteFiles(engeeRequest,runtime,args.path||'')};}
  }
  let action={name,arguments:{...args},workspace:config.workspace,executionTarget:target};
  if(name==='julia_eval_code'){checkEngeeCode(typeof args.code==='string'?args.code:'');action.juliaSnapshot=await prepareJuliaCode({workspace:workspacePath(''),juliaPath:config.juliaPath||'',code:args.code});action.arguments={code:action.juliaSnapshot.code};action.description='Выполнение этого точного кода в локальной Julia. Код может читать и изменять файлы с обычными правами пользователя. Время — до 30 секунд, вывод — до 256 КиБ.';action.preview={origin:'julia',cwd:action.juliaSnapshot.cwd,executable:action.juliaSnapshot.executable,version:action.juliaSnapshot.version};}
  if(name==='engee_start')action.description='Запуск среды Engee с выбранной версией и таймаутом простоя';
  if(name==='engee_stop')action.description='Остановка среды Engee: текущие вычисления будут прекращены';
  if(name==='engee_upload_file'){const target=workspacePath(args.path),stat=await fs.stat(target);if(!stat.isFile()||stat.size>64*1024*1024)throw fail('Для передачи нужен файл до 64 МиБ.');const preview=await prepareRemoteUpload({file:await fs.readFile(target),name:path.basename(target),destination:args.destination});action.hash=preview.sha256;action.arguments={path:args.path,destination:preview.destination,name:preview.name,size:preview.size,sha256:preview.sha256,collisionPolicy:preview.collisionPolicy};action.description='Передача этого файла в Engee. При совпадении имени Engee добавляет суффикс, исходный файл не перезаписывается.';}
  if(name==='engee_eval_code'){if(typeof args.code!=='string'||!args.code.trim()||Buffer.byteLength(args.code)>1024*1024)throw fail('Введите код Julia до 1 МБ.');checkEngeeCode(args.code);action.arguments={code:args.code};action.description='Выполнение этого точного кода Julia в вашей среде Engee';}
  if(name==='write_file'){
    const target=workspacePath(args.path);if(typeof args.content!=='string'||Buffer.byteLength(args.content)>1024*1024)throw fail('Содержимое должно быть текстом до 1 МБ.');
    action.previousHash=await fingerprint(target);
    if(/\.(jl|ngscript)$/i.test(args.path))checkEngeeCode(args.content);
    action.description='Запись файла в рабочую папку';
  }
  if(name==='save_skill'){
    action.previousHash=await fingerprint(skillPath(args.name));
    if(typeof args.content!=='string'||args.content.length>256000||!/^---\r?\n[\s\S]*?\r?\n---/m.test(args.content))throw fail('Навык должен иметь YAML name/description и содержимое до 256 КБ.');
    action.description='Сохранение навыка в resources/skills';
  }
  if(name==='engee_eval_file'){
    if(!/\.(jl|ngscript)$/i.test(args.path||''))throw fail('Для запуска нужен .jl или .ngscript.');
    const content=await readText(workspacePath(args.path));checkEngeeCode(content);
    action.content=content;action.arguments.content=content;
    action.hash=createHash('sha256').update(content).digest('hex');
    action.description='Выполнение точного содержимого файла в Engee';
  }
  const id=randomUUID();pending.set(id,{...action,expires:Date.now()+10*60000});
  return {pending:{id,name,arguments:action.arguments,description:action.description,...action.preview}};
}
async function confirm(id,allow,signal){
  const action=pending.get(id);pending.delete(id);
  if(!action||action.expires<Date.now())throw fail('Подтверждение истекло. Повторите предложение.');
  if(!allow)return {result:{declined:true,message:'Пользователь отклонил действие.'}};
  if(action.workspace!==config.workspace)throw fail('Рабочая папка изменилась. Повторите предложение.');
  const args=action.arguments;
  if(action.name==='julia_eval_code'){const result=await runJuliaCode(action.juliaSnapshot,{workspace:workspacePath(''),juliaPath:config.juliaPath||'',signal});for(const field of ['stdout','stderr','result','error'])if(typeof result[field]==='string')result[field]=redact(result[field]);return {result};}
  if(action.name==='engee_start')return {result:await startSession(engeeRequest,config.engeeAccountUrl,args)};
  if(action.name==='engee_stop')return {result:await stopSession(engeeRequest,config.engeeAccountUrl)};
  if(action.name==='engee_eval_code'){const info=await engeeInfo();if(info.serverStatus!=='running'||!info.serverReady)throw fail('Engee ещё не готова. Запустите среду в «Параметры → Engee» и дождитесь готовности.');const runtime=validateUrl(config.engeeRuntimeUrl||new URL(info.runtimeUrl,config.engeeAccountUrl+'/').href,true);return {result:await engeeRequest(runtime+'/external/command/eval','POST',{command:args.code})};}
  if(action.name==='engee_upload_file'){const target=workspacePath(args.path),stat=await fs.stat(target);if(!stat.isFile()||stat.size>64*1024*1024)throw fail('Файл больше не подходит для передачи.');const bytes=await fs.readFile(target);const info=await engeeInfo();if(info.serverStatus!=='running'||!info.serverReady)throw fail('Дождитесь готовности среды Engee.');const runtime=validateUrl(config.engeeRuntimeUrl||new URL(info.runtimeUrl,config.engeeAccountUrl+'/').href,true);return {result:await uploadRemoteFile({request:engeeRequest,runtimeUrl:runtime,file:bytes,name:args.name,destination:args.destination,confirmed:true,expectedSha256:action.hash})};}
  if(action.name==='write_file'){
    const p=workspacePath(args.path);await fs.mkdir(path.dirname(p),{recursive:true});workspacePath(args.path);
    if(await fingerprint(p)!==action.previousHash)throw fail('Файл изменился после предложения записи. Повторите просмотр и подтверждение.');
    await fs.writeFile(p,args.content,'utf8');return {result:{written:args.path,bytes:Buffer.byteLength(args.content)}};
  }
  if(action.name==='save_skill'){
    const p=skillPath(args.name);await fs.mkdir(path.dirname(p),{recursive:true});skillPath(args.name);
    if(await fingerprint(p)!==action.previousHash)throw fail('Навык изменился после предложения. Повторите подтверждение.');
    await fs.writeFile(p,args.content,'utf8');return {result:{saved:args.name,path:`resources/skills/${args.name}/SKILL.md`}};
  }
  if(action.name==='engee_eval_file'){
    const content=await readText(workspacePath(args.path));
    if(createHash('sha256').update(content).digest('hex')!==action.hash)throw fail('Файл изменился после предложения. Повторите просмотр и подтверждение.');
    const info=await engeeInfo();if(info.serverStatus!=='running'||!info.serverReady)throw fail('Engee ещё не готова к выполнению. Нажмите «Проверить Engee» и дождитесь готовности среды.');
    const runtime=validateUrl(config.engeeRuntimeUrl||new URL(info.runtimeUrl,config.engeeAccountUrl+'/').href,true);
    let command=content;
    if(args.path.toLowerCase().endsWith('.ngscript')){
      // Run the native notebook, retaining cell metadata and runtime semantics.
      const encoded=Buffer.from(content).toString('base64');
      command=`begin\nimport Base64\nagent_dir = mktempdir()\nagent_file = joinpath(agent_dir, "agent_notebook.ngscript")\nwrite(agent_file, Base64.base64decode("${encoded}"))\ntry\n engee.script.run(agent_file; isolate = true)\nfinally\n rm(agent_dir; recursive=true, force=true)\nend\nend`;
    }
    return {result:await engeeRequest(runtime+'/external/command/eval','POST',{command})};
  }
  throw fail('Неизвестное подтверждение.');
}
async function startLocal(modelPath){
  if(localStarting)throw fail('Модель уже запускается. Подождите.');
  const available=await models();const selected=available.find(m=>absolute(m.path)===absolute(modelPath||available[0]?.path||''));
  if(!selected)throw fail('Выберите GGUF из папки моделей.');
  if(activeConnection()?.settings?.engine!=='gguf')config.connectionId='';
  if(localProcess && localModel===absolute(selected.path) && localBase){config.provider='local';config.model=selected.name;config.baseUrl='';config.localModelPath=selected.path;await persistConfig();return {message:'Модель уже запущена и выбрана для чата.',baseUrl:localBase,model:selected.name,config:publicConfig(),local:localState()};}
  const bin=path.join(ROOT,'resources/runtime/llama',process.platform==='win32'?'llama-server.exe':'llama-server');
  if(!existsSync(bin))throw fail('Для этой ОС не найден llama-server в resources/runtime/llama.');
  localStarting=true;
  if(localProcess)localProcess.kill();localBase='';
  try{
    const port=await freePort();
    const log=createWriteStream(path.join(DATA,'local-model.log'),{flags:'a'});
    const child=spawn(bin,['-m',absolute(selected.path),'--host','127.0.0.1','--port',String(port),'-c','4096','-t',String(Math.min(8,os.availableParallelism())),'--jinja','--reasoning-budget','0'],{cwd:path.dirname(bin),windowsHide:true,stdio:['ignore','pipe','pipe']});
    localProcess=child;localModel=absolute(selected.path);
    child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
    let ended=false;child.once('exit',()=>{ended=true;if(localProcess===child){localBase='';localProcess=undefined;}log.end();});
    let spawnError;child.once('error',e=>{spawnError=e;ended=true;});
    const base=`http://127.0.0.1:${port}`;
    for(let i=0;i<120;i++){
      if(ended)throw fail('Не удалось запустить GGUF. Подробности: data/local-model.log.');
      if(spawnError)throw fail('Ошибка запуска локальной модели.');
      try{const response=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});if(response.ok){localBase=base+'/v1';config.localModelPath=selected.path;config.provider='local';config.model=selected.name;config.baseUrl='';await persistConfig();return {message:'Локальная модель запущена и выбрана для чата.',baseUrl:localBase,model:selected.name,config:publicConfig(),local:localState()};}}catch{}
      await new Promise(r=>setTimeout(r,500));
    }
    child.kill();throw fail('Модель не запустилась за 60 секунд. Проверьте память и data/local-model.log.');
  }finally{localStarting=false;}
}
function freePort(){return new Promise((resolve,reject)=>{const srv=http.createServer();srv.once('error',reject);srv.listen(0,'127.0.0.1',()=>{const port=srv.address().port;srv.close(()=>resolve(port));});});}
async function completion(body,signal){
  const target=executionTarget(body.executionTarget),selectedTools=toolsFor(target);
  if(config.provider==='puter')throw fail('Puter выполняет запрос через вход в браузере.');
  if(!Array.isArray(body.messages)||body.messages.length>100)throw fail('Некорректная история диалога.');
  const profile=activeConnection();
  if(profile?.type==='api')return runUniversalApi({settings:profile.settings,apiKey:profile.apiKey,messages:body.messages,tools:body.tools?.length?selectedTools:[],signal});
  if(config.provider==='claude'){
    let info={serverStatus:'not_connected'};try{info=await engeeInfo();}catch(e){info={error:redact(e.message)};}
    const safeInfo={serverStatus:info.serverStatus||null,version:info.version||null,error:info.error||null};
    return runClaude({configuredPath:config.claudePath||'',messages:body.messages,workspace:absolute(config.workspace),model:config.model||'default',systemPrompt:systemPrompt+'\nПроверенные данные Engee на момент запроса: '+JSON.stringify(safeInfo)+'\nТокены и данные входа не входят в контекст. Используй эти проверенные значения версии и статуса. Для анализа пользователь явно добавляет файлы в диалог; CLI не читает исходный проект автоматически. Для записи пользователю нужно сохранить предложенный код через интерфейс; CLI не меняет оригинал.',sessionId:body.sessionId,newSession:body.newSession,contextId:body.contextId,contextApproved:body.contextApproved===true,signal});
  }
  const preset=providers.find(p=>p.id===config.provider), key=config.apiKeys[config.provider];
  if(config.provider==='openrouter')freeOpenRouter(config.baseUrl,config.model);
  if(preset.requiresKey && !key)throw fail('Введите личный ключ выбранного сервиса в настройках.');
  if(config.provider==='openai'){
    if(!config.model)throw fail('Обновите список моделей OpenAI и выберите доступную вашему ключу модель.');
    return runOpenAI({baseUrl:validateUrl(config.baseUrl,true),apiKey:key,model:config.model,messages:body.messages,tools:body.tools?.length?selectedTools:[],signal,maxTokens:16384});
  }
  if(config.provider==='colibri'){
    const upstreamBase = (config.baseUrl || 'http://127.0.0.1:8001/v1').replace(/\/v1$/, '');
    const payload = {
      model: config.model || 'qwen3-coder-30b-a3b-colibri',
      messages: body.messages,
      stream: false,
      max_tokens: config.maxTokens || 1024,
    };
    if (body.tools?.length) payload.tools = selectedTools;
    if (body.tool_choice) payload.tool_choice = body.tool_choice;
    const timeout = AbortSignal.timeout(180000);
    const response = await fetch(upstreamBase + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: timeout,
    });
    if (!response.ok) {
      let detail = '';
      try { const d = await response.json(); detail = String(d.error?.message || d.message || '').slice(0, 500); } catch { }
      throw fail(`Colibri: HTTP ${response.status}. ${detail || 'ошибка'}`, 502);
    }
    return response.json();
  }
  let base=config.baseUrl;
  if(config.provider==='local'){
    const selected=await selectedLocalModel();if(!localBase||localModel!==absolute(selected.path))await startLocal(selected.path);base=localBase;
  }
  if(config.provider==='ollama'){
    const catalog=await discoverModels();
    if(!config.model){config.model=catalog.models[0]?.id||'';await persistConfig();}
    if(!catalog.models.some(m=>m.id===config.model))throw fail(`Ollama не содержит модель «${config.model||'не выбрана'}». Обновите список моделей и выберите установленную. Встроенная GGUF доступна отдельной кнопкой «Использовать в чате».`,404);
  }
  if(!config.model)throw fail('Выберите модель из списка сервера.');
  base=validateUrl(base,true);
  const payload={model:config.model||preset.defaultModel,messages:body.messages,stream:false,max_tokens:2048};
  if(body.tools?.length)payload.tools=selectedTools;
  if(config.provider==='colibri'){
    payload.max_tokens = config.maxTokens || 1024;
    if (body.tool_choice) payload.tool_choice = body.tool_choice;
  }
  if(config.provider==='openrouter')payload.provider={max_price:{prompt:0,completion:0,request:0}};
  if(config.provider==='local'){payload.chat_template_kwargs={enable_thinking:false};payload.temperature=0;}
  if(config.provider==='ollama')payload.reasoning_effort='none';
  if(config.provider==='deepseek')payload.thinking={type:'disabled'};
  if(config.provider==='qwen')payload.enable_thinking=false;
  if(config.provider==='kimi')payload.max_tokens=16384;
  if(config.provider==='local' && body.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='image_url')))throw fail('Встроенная модель не распознаёт изображения. Выберите облачную модель с поддержкой изображений.');
  const timeout=AbortSignal.timeout(180000);
  const response=await fetch(base+'/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})},body:JSON.stringify(payload),signal:signal?AbortSignal.any([signal,timeout]):timeout});
  if(!response.ok){let detail='';try{const data=await response.json();detail=String(data.error?.message||(typeof data.error==='string'?data.error:'')||data.message||'').slice(0,500);}catch{}
    throw fail(`Модель: HTTP ${response.status}. ${redact(detail)}`,502);}
  return response.json();
}
async function probe(){
  if(activeConnection())return {status:'ok',...await testConnection(config.connectionId)};
  if(config.provider==='puter')return {status:'browser',message:'Нажмите «Начать бесплатно» для гостевого доступа или входа Puter.'};
  if(config.provider==='local'){const selected=await selectedLocalModel();const r=await startLocal(selected.path);return {status:'ok',message:r.message};}
  if(config.provider==='claude'){const result=await detectClaude({configuredPath:config.claudePath||''});if(!result.available)throw fail('Claude Code не установлен. Откройте «Параметры → Компоненты».');return {status:'ok',message:'Claude Code найден. Авторизация и ответ проверяются отправкой сообщения.',...result};}
  if(config.provider==='colibri'){
    const upstreamBase = (config.baseUrl || 'http://127.0.0.1:8001/v1').replace(/\/v1$/, '');
    const response = await fetch(upstreamBase + '/v1/models', { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fail(`Colibri: HTTP ${response.status}. Запустите прокси на порту 8001.`, 502);
    const result = await response.json();
    return { status: 'ok', message: 'Colibri доступен. Модель: ' + (config.model || result.data?.[0]?.id || 'не выбрана'), models: (result.data || []).map(m => m.id) };
  }
  const preset=providers.find(p=>p.id===config.provider), key=config.apiKeys[config.provider];
  if(preset.requiresKey&&!key)throw fail('Для подключения нужен личный API-ключ.');
  const response=await fetch(validateUrl(config.baseUrl,true)+'/models',{headers:key?{Authorization:`Bearer ${key}`}:{},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw fail(`Проверка подключения: HTTP ${response.status}.`,502);
  const result=await response.json();return {status:'ok',message:'Сервер доступен. Генерация проверяется отправкой сообщения.',models:(result.data||[]).slice(0,100).map(m=>m.id)};
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf','.ico':'image/x-icon'};
async function selectedLocalModel(settings=config){const available=await models(settings),byPath=settings.localModelPath&&available.find(m=>absolute(m.path)===absolute(settings.localModelPath));const byName=available.find(m=>m.name===settings.model);if(settings.model&&!['local'].includes(settings.model)&&!byName)throw fail('Выбранный GGUF не найден. Обновите список и запустите нужный файл модели.',404);const selected=byPath&&(!byName||byPath.name===settings.model)?byPath:byName||available[0];if(!selected)throw fail('В папке моделей нет GGUF. Выберите папку или добавьте модель.');return selected;}
async function discoverModels(input={}){
  if(input.connectionId){const result=await testConnection(input.connectionId);return {models:result.models||[],message:result.message};}
  const provider=input.provider===undefined?config.provider:input.provider;
  const preset=providers.find(item=>item.id===provider);if(!preset)throw fail('Выберите известное подключение.');
  if(provider==='local')return {models:(await models()).map(m=>({id:m.name,...m})),message:'GGUF из выбранной папки.'};
  if(provider==='claude')return {models:[{id:'default'},{id:'sonnet'},{id:'opus'},{id:'haiku'}],message:'Модели доступны по вашей подписке Claude.'};
  if(provider==='puter')return {models:[{id:'gpt-5.4-nano'},{id:'gpt-4o-mini'},{id:'claude-sonnet-4-6'}],message:'Актуальный каталог Puter уточняется после входа; доступ зависит от квоты.'};
  if(input.baseUrl!==undefined&&typeof input.baseUrl!=='string')throw fail('Укажите адрес API сервера.');
  const baseUrl=validateUrl(input.baseUrl===undefined?(provider===config.provider?config.baseUrl:preset.baseUrl):input.baseUrl,true);
  if(provider==='openrouter')freeOpenRouter(baseUrl,'openrouter/free');
  const key=config.apiKeys[provider];
  if(preset.requiresKey&&!key)throw fail('Сначала сохраните API-ключ этого сервиса в «Параметры → Нейросети и подключения».');
  let response;try{response=await fetch(baseUrl+'/models',{headers:key?{Authorization:`Bearer ${key}`}:{},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw fail(provider==='ollama'?'Ollama недоступна по этому адресу. Запустите Ollama и нажмите «Обновить модели».':'Не удалось получить список моделей. Проверьте интернет и адрес API.',502);}
  if(provider==='qwen'&&[404,405].includes(response.status))return {models:[{id:'qwen3.8-flash'},{id:'qwen3.8-max'},{id:'qwen3.7-plus'},{id:'qwen3-coder-plus'}],source:'documentation',message:'Этот адрес Qwen не предоставил каталог API. Показаны примеры из официального каталога; доступность выбранной модели проверяется первым запросом.'};
  if(!response.ok)throw fail(`Каталог моделей: HTTP ${response.status}. Проверьте адрес и ключ.`,502);
  const result=await response.json();let entries=(Array.isArray(result.data)?result.data:[]).filter(m=>typeof m.id==='string'&&m.id);
  if(provider==='openrouter')entries=entries.filter(m=>/:free$/.test(m.id)&&Number(m.pricing?.prompt)===0&&Number(m.pricing?.completion)===0);
  if(provider==='openai')entries=entries.filter(m=>/^(?:gpt-|codex|o\d)/i.test(m.id)&&!/(?:audio|realtime|transcrib|tts|embedding|image)/i.test(m.id));
  return {models:[...(provider==='openrouter'?[{id:'openrouter/free'}]:[]),...entries.slice(0,300).map(m=>({id:m.id}))],message:provider==='openrouter'?'Показаны только бесплатные модели. Квота зависит от аккаунта OpenRouter.':'Модели, которые вернул выбранный сервер.'};
}
function connectionById(id){const item=connections.get(id);if(!item)throw fail('Подключение не найдено.',404);return item;}
async function useConnection(id){
  const profile=connectionById(id);if(profile.type==='program')throw fail('Программу откройте в терминале проекта.');
  let input={connectionId:id,model:profile.settings.model||''};
  if(profile.type==='api')input={...input,provider:'custom',baseUrl:profile.settings.baseUrl};
  else if(profile.settings.engine==='gguf')input={...input,provider:'local',baseUrl:'',modelsDir:profile.settings.modelsDir,localModelPath:profile.settings.modelPath,model:profile.settings.model||path.basename(profile.settings.modelPath)};
  else input={...input,provider:profile.settings.engine==='server'?'custom':profile.settings.engine,baseUrl:profile.settings.baseUrl};
  return {...await saveConfig(input),message:'Подключение выбрано: '+profile.name+'.'};
}
async function testConnection(id){
  const profile=connectionById(id),settings=profile.settings;
  if(profile.type==='program'){await validateProgram(settings);return {ok:true,message:'Программа найдена. Запуск выполняется кнопкой «Открыть в терминале».'};}
  if(profile.type==='local'&&settings.engine==='gguf'){
    const root=absolute(settings.modelsDir),file=absolute(settings.modelPath);if(!inside(root,file)||path.extname(file).toLowerCase()!=='.gguf')throw fail('Выберите GGUF внутри папки моделей.');noLinks(root,file);const stat=await fs.stat(file);if(!stat.isFile())throw fail('Файл модели не найден.');
    return {ok:true,message:'Файл GGUF найден. Модель запустится при отправке сообщения.',models:[{id:path.basename(file)}]};
  }
  if(profile.type==='api'&&settings.format==='custom-json')return {ok:true,message:'Шаблон JSON настроен. Соединение и ответ проверяются отправкой сообщения.'};
  let base=validateUrl(settings.baseUrl,true),headers=new Headers();
  if(profile.apiKey){if(settings.format==='gemini')headers.set('x-goog-api-key',profile.apiKey);else if(settings.format==='anthropic')headers.set('x-api-key',profile.apiKey);else headers.set('Authorization','Bearer '+profile.apiKey);}
  if(settings.format==='anthropic')headers.set('anthropic-version','2023-06-01');
  for(const [name,value]of Object.entries(settings.headers||{}))headers.set(name,value.replaceAll('{{apiKey}}',profile.apiKey||'').replaceAll('{{model}}',settings.model||''));
  base=base.replace(/\/(?:chat\/completions|responses|messages)$/,'');
  let response;try{response=await fetch(base+'/models',{headers,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw fail('Сервер не ответил. Проверьте адрес и запущенную программу модели.',502);}
  if(!response.ok)throw fail('Проверка подключения: HTTP '+response.status+'. Проверьте адрес, ключ и доступ к API.',502);
  let result;try{result=await response.json();}catch{throw fail('Каталог моделей вернул некорректный JSON.',502);}
  const list=(Array.isArray(result.data)?result.data:Array.isArray(result.models)?result.models:[]).map(item=>({id:item.id||item.name?.replace(/^models\//,'')})).filter(item=>typeof item.id==='string').slice(0,300);
  return {ok:true,message:'Сервер доступен. Ответ выбранной модели проверяется отправкой сообщения.',models:list};
}
async function integrations(){
  const result={claude:await detectClaude({configuredPath:config.claudePath||''}),opencode:{available:false},ollama:{available:false,models:[]}};
  const candidates=(process.env.PATH||'').split(path.delimiter).flatMap(p=>['opencode.exe','opencode.cmd','opencode.ps1'].map(n=>path.join(p,n)));
  result.opencode.path=candidates.find(existsSync)||'';result.opencode.available=!!result.opencode.path;
  try{const response=await fetch('http://127.0.0.1:11434/api/tags',{signal:AbortSignal.timeout(3000)});if(response.ok){const data=await response.json();result.ollama={available:true,baseUrl:'http://127.0.0.1:11434/v1',models:(data.models||[]).map(m=>({id:m.name,size:m.size}))};}}catch{}
  result.llama={available:existsSync(path.join(ROOT,'resources/runtime/llama/llama-server.exe')),bundled:true,path:'resources/runtime/llama/llama-server.exe',resolvedPath:path.join(ROOT,'resources/runtime/llama/llama-server.exe')};
  return result;
}
async function uploadAttachment(body){
  const name=typeof body.filename==='string'?path.basename(body.filename).replace(/[^\p{L}\p{N}._ -]/gu,'_'):'';
  if(!name||name.startsWith('.')||/^(?:settings|credentials|auth|secrets?)(?:\.|$)/i.test(name))throw fail('Выберите рабочий файл, а не файл доступа.');
  const ext=path.extname(name).toLowerCase();
  const images={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
  const textual=['.txt','.md','.jl','.ngscript','.json','.csv','.yaml','.yml','.v','.sv','.py','.mjs','.js','.html','.css','.log'];
  if(!images[ext]&&!textual.includes(ext))throw fail('Сейчас поддерживаются текст, код, ngscript, CSV и изображения PNG/JPEG/WebP. Другие файлы добавьте в рабочую папку и используйте подходящий инструмент.');
  if(typeof body.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64))throw fail('Некорректное содержимое файла.');
  const bytes=Buffer.from(body.base64,'base64');const limit=images[ext]?4*1024*1024:1024*1024;
  if(!bytes.length||bytes.length>limit)throw fail(images[ext]?'Изображение должно быть до 4 МБ.':'Текстовый файл должен быть до 1 МБ.');
  if(!images[ext]&&bytes.includes(0))throw fail('Двоичный файл не поддерживается как текст.');
  const id=randomUUID(), dir=path.join(DATA,'attachments');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,id+ext),bytes);
  return {id,name,mime:images[ext]||'text/plain',size:bytes.length,...(images[ext]?{image:'data:'+images[ext]+';base64,'+bytes.toString('base64')}:{content:bytes.toString('utf8')})};
}
async function readBody(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>CHAT_LIMITS.requestBytes)throw fail('История и вложения слишком большие. Начните новый диалог или уменьшите вложения.',413);chunks.push(chunk);}const data=Buffer.concat(chunks).toString('utf8');try{return data?JSON.parse(data):{};}catch{throw fail('Нужен JSON.');}}
async function buildPackage(personal){
  if([...packages.values()].some(p=>p.status==='running'))throw fail('Архив уже собирается. Дождитесь завершения.');
  const id=randomUUID(),dir=path.join(DATA,'exports',id),filename=personal?'EngeeAgent-Personal-Windows-x64.zip':'EngeeAgent-Windows-x64.zip';await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,filename),job={id,status:'running',personal,file,filename};packages.set(id,job);
  const args=[path.join(WEB,'package.mjs'),'--app-export','--output',file,...(personal?['--personal']:[])];
  const child=spawn(process.execPath,args,{cwd:ROOT,windowsHide:true,stdio:['ignore','ignore','pipe']});let detail='';
  child.stderr.on('data',chunk=>{detail+=chunk.toString().slice(0,2000);});
  child.on('error',()=>{job.status='error';job.error='Не удалось запустить сборку.';});child.on('exit',code=>{job.status=code===0?'ready':'error';if(code!==0)job.error=redact(detail).slice(0,700)||'Не удалось собрать ZIP.';});return {id,status:job.status};
}
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{
  try{
    const host=req.headers.host;
    if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(host))throw fail('Недопустимый Host.',403);
    if(req.headers.origin&&!['http://'+host].includes(req.headers.origin))throw fail('Запросы разрешены только со страницы этого приложения.',403);
    const url=new URL(req.url,'http://'+host), route=url.pathname;
    if(req.method==='GET' && route==='/api/health')return send(res,200,{app:'agent-lite',version:'1.0.0',port:PORT});

    // ─── Agent Lite minimal endpoints ─────────────────────────────────────
    // GET /api/probe — quick LLM health check via the active provider
    if(req.method==='GET' && route==='/api/probe'){
      try {
        const base = (config.baseUrl || 'http://127.0.0.1:8001/v1').replace(/\/v1$/,'');
        const resp = await fetch(base + '/v1/models', { signal: AbortSignal.timeout(5000) });
        if (!resp.ok) return send(res, 200, { error: `HTTP ${resp.status}` });
        const d = await resp.json();
        return send(res, 200, { ok: true, model: config.model || 'default', models: (d.data || []).map(m=>m.id).slice(0,10) });
      } catch (e) {
        return send(res, 200, { error: e.message });
      }
    }
    // GET /api/config — current config (public fields only)
    if(req.method==='GET' && route==='/api/config')
      return send(res, 200, { baseUrl: config.baseUrl, model: config.model, maxTokens: config.maxTokens || 4096, provider: config.provider });
    // GET /api/skills — list skill names
    if(req.method==='GET' && route==='/api/skills'){
      const list = await skillList();
      return send(res, 200, { skills: list });
    }
    // GET /api/skill/:name — read one skill
    if(req.method==='GET' && route.startsWith('/api/skill/')){
      const name = decodeURIComponent(route.slice('/api/skill/'.length));
      try {
        const content = await fs.readFile(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
        return send(res, 200, { name, content });
      } catch {
        return send(res, 404, { error: 'Skill not found' });
      }
    }
    // GET /api/logs — last 300 lines of engine log buffer
    if(req.method==='GET' && route==='/api/logs')
      return send(res, 200, { tail: engineLogBuffer.slice(-300).join('\n'), state: engineState });
    // POST /api/chat — simple one-shot chat (no tools, no multi-turn state)
    if(req.method==='POST' && route==='/api/chat'){
      let body;
      try { body = await readBody(req); } catch { body = {}; }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      try {
        const base = (config.baseUrl || 'http://127.0.0.1:8001/v1').replace(/\/v1$/,'');
        const model  = body.model || config.model || 'qwen3-coder-30b-a3b-colibri';
        const maxTok = body.max_tokens || config.maxTokens || 4096;
        const resp = await fetch(base + '/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, max_tokens: maxTok, stream: false }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(()=> '');
          return send(res, 502, { error: `Upstream ${resp.status}: ${errText.slice(0,200)}` });
        }
        const data = await resp.json();
        return send(res, 200, data);
      } catch (e) {
        return send(res, 502, { error: e.message });
      }
    }
    // POST /api/file/save — write file to workspace
    if(req.method==='POST' && route==='/api/file/save'){
      let body;
      try { body = await readBody(req); } catch { body = {}; }
      const target = workspacePath(String(body.path||'').trim());
      if (body.content === undefined) throw fail('Пустой контент.');
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, String(body.content), 'utf8');
      return send(res, 200, { saved: true, path: body.path });
    }
    // POST /api/skill/save — create new skill
    if(req.method==='POST' && route==='/api/skill/save'){
      let body;
      try { body = await readBody(req); } catch { body = {}; }
      const name = String(body.name||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'');
      if (!name || name.length > 60) throw fail('Некорректное имя навыка.');
      const content = String(body.content||'');
      const dir = path.join(SKILLS, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'SKILL.md'), content, 'utf8');
      return send(res, 200, { saved: true, name });
    }

    // ─── Existing (legacy) routes ─────────────────────────────────────────
    if(req.method==='GET' && route==='/api/openrouter/auth/status')return send(res,200,openRouterAuth.status(url.searchParams.get('id')));
    if(req.method==='GET' && route==='/auth/openrouter/callback'){
      let page,status=200;try{if(url.searchParams.getAll('state').length!==1||url.searchParams.getAll('code').length>1||url.searchParams.getAll('error').length>1)throw fail('Не удалось подтвердить запрос входа OpenRouter. Начните подключение из Engee Agent.');page=openRouterAuth.callback({state:url.searchParams.get('state'),code:url.searchParams.get('code'),error:url.searchParams.get('error')});}catch(error){status=error.status||400;page=callbackPage(error.status?error.message:'Не удалось завершить вход OpenRouter. Повторите подключение.');}res.writeHead(status,page.headers);return res.end(page.html);
    }
    if(req.method==='GET' && route==='/api/state'){
      const skills=await skillList();let julia={available:false};if(config.juliaPath&&config.juliaPath.length>0){try{julia=await juliaCapability({juliaPath:config.juliaPath});}catch{}}
      const execTargets={julia};if(config.engeeEnabled===true)execTargets.engee={available:true};
      return send(res,200,{executionTargets:execTargets,config:publicConfig(),providers,connections:connections.list(),notices,models:await models(),local:localState(),skills,workspaceFiles:(await listFiles()).files,systemPrompt:systemPrompt+'\n'+skills.map(s=>s.name+': '+s.title).join('\n'),engine:{state:engineState}});
    }
    if(req.method==='GET' && route==='/api/llm/status'){
      const selected={provider:config.provider,model:config.model,connectionId:config.connectionId,baseUrl:config.baseUrl,modelsDir:config.modelsDir,localModelPath:config.localModelPath},profile=activeConnection(),preset=providers.find(item=>item.id===selected.provider);
      return send(res,200,await readLlmStatus({config:selected,profile,local:{running:!!localProcess&&!!localBase,starting:localStarting,modelPath:localModel,baseUrl:localBase},requiresKey:!!preset?.requiresKey,hasApiKey:!!config.apiKeys[selected.provider],detectClaude:()=>detectClaude({configuredPath:config.claudePath||''}),selectLocal:async()=>{const model=await selectedLocalModel(selected);return {...model,path:await fs.realpath(absolute(model.path))};},discoverModels:()=>discoverModels(profile?{connectionId:profile.id}:{provider:selected.provider,baseUrl:selected.baseUrl})}));
    }
    if(req.method==='GET' && route==='/api/tools'){const target=executionTarget(url.searchParams.get('executionTarget')??undefined);return send(res,200,{executionTarget:target,tools:toolsFor(target)});}
    if(req.method==='GET' && route==='/api/connections')return send(res,200,{connections:connections.list(),activeId:config.connectionId||''});
    if(req.method==='GET' && route==='/api/programs')return send(res,200,await detectPrograms());
    if(req.method==='GET' && route==='/api/terminal/shells')return send(res,200,{...await detectShells({juliaPath:config.juliaPath||'',powershellPath:config.powershellPath||'',gitBashPath:config.gitBashPath||''}),workspace:absolute(config.workspace)});
    if(req.method==='GET' && route==='/api/terminal/sessions')return send(res,200,listTerminals());
    if(req.method==='GET' && route==='/api/terminal/events'){
      const id=url.searchParams.get('id'),session=listTerminals().terminals.find(item=>item.id===id);
      if(!session)throw fail('Сеанс терминала не найден. Откройте новый терминал.',404);
      const afterSequence=Math.max(Number(url.searchParams.get('afterSequence')||0),Number(req.headers['last-event-id']||0));
      if(!Number.isSafeInteger(afterSequence)||afterSequence<0)throw fail('Некорректная последовательность терминала.');
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
      const emit=event=>{if(res.destroyed)return;if(res.writableLength>1024*1024){res.destroy();return;}res.write((event.sequence?'id: '+event.sequence+'\n':'')+'data: '+JSON.stringify(event)+'\n\n');};
      if(session.status==='exited'){emit({type:'exit',exitCode:null});res.end();return;}
      emit({type:'ready',...session,sequence:0});
      const unsubscribe=subscribeTerminal(id,emit,{afterSequence});
      const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': heartbeat\n\n');},15000);heartbeat.unref();
      res.on('close',()=>{clearInterval(heartbeat);unsubscribe();});return;
    }
    if(req.method==='GET' && route==='/api/integrations')return send(res,200,await integrations());
    if(req.method==='GET' && route==='/api/config/editor')return send(res,200,configEditor());
    if(req.method==='GET' && route==='/api/chats')return send(res,200,chats.list());
    if(req.method==='GET' && route==='/api/chats/read')return send(res,200,await chats.read(url.searchParams.get('id')));
    if(req.method==='GET' && route==='/api/config/login')return send(res,200,{username:config.engeeUsername||'',passwordStored:!!config.engeePassword});
    if(req.method==='GET' && route==='/api/engee/options')return send(res,200,await sessionOptions(engeeRequest,config.engeeAccountUrl));
    if(req.method==='GET' && route==='/api/package'){const job=packages.get(url.searchParams.get('id'));if(!job)throw fail('Сборка не найдена.',404);return send(res,200,{id:job.id,status:job.status,personal:job.personal,error:job.error,downloadUrl:job.status==='ready'?'/api/package/download?id='+job.id:undefined});}
    if(req.method==='GET' && route==='/api/package/download'){const job=packages.get(url.searchParams.get('id'));if(!job||job.status!=='ready')throw fail('Архив ещё не готов.',404);res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+job.filename+'"','Cache-Control':'no-store'});createReadStream(job.file).pipe(res);return;}
    if(req.method==='GET' && route==='/api/files')return send(res,200,await listFiles(url.searchParams.get('path')||''));
    if(req.method==='GET' && route==='/api/logs/stream'){
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','Connection':'keep-alive','X-Content-Type-Options':'nosniff'});
      const emit=(data)=>{if(!res.destroyed)res.write(`data: ${JSON.stringify(data)}\n\n`);};
      emit({type:'init',log:engineLogBuffer.slice(-200).join('\n'),state:engineState});
      const watcher=fs.watchFile(path.join(DATA,'logs','engine.log'),()=>{try{const lines=engineLogBuffer.slice(-500).join('\n');emit({type:'log',lines});}catch{};});
      res.on('close',()=>{clearInterval(watcher);});
      return;
    }
    if(req.method==='GET' && route==='/api/engine/status')return send(res,200,await engineStatus());
    if(req.method==='GET' && route==='/api/file')return send(res,200,await editorSave.read(url.searchParams.get('path')||''));
    if(req.method==='GET' && route.startsWith('/api/skills/'))return send(res,200,{content:await readText(skillPath(decodeURIComponent(route.slice(12))))});
    if(req.method==='GET' && route==='/docs/guide.pdf'){res.writeHead(302,{Location:'/help/guide.html#start','Cache-Control':'no-store'});return res.end();}
    if(req.method==='GET' && route.startsWith('/docs/')){
      const docs={'/docs/free-cloud':'FREE_CLOUD.md','/docs/models':'README.md'};if(!docs[route])throw fail('Документ не найден.',404);
      const content=await fs.readFile(path.join(DEFAULT_MODELS,docs[route]),'utf8');res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(content);
    }
    if(req.method==='POST' && route.startsWith('/api/')){
      if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw fail('Нужен Content-Type application/json.',415);
      const body=await readBody(req);let result;
      if(lifecycleBusy)throw fail('Сохранение уже выполняется. Дождитесь завершения.',409);
      const lifecycle=['/api/autosave','/api/shutdown'].includes(route),readonly=['/api/models/discover','/api/connections/test','/api/terminal/input','/api/terminal/resize','/api/completion','/api/confirm'].includes(route);
      if(lifecycle&&activeMutations)throw fail('Другое сохранение ещё выполняется. Дождитесь завершения и повторите.',409);
      let closing=false;const tracked=!lifecycle&&!readonly;
      if(lifecycle)lifecycleBusy=true;else if(tracked)activeMutations++;
      try{
      if(route!=='/api/shutdown'&&!['/api/models/discover','/api/connections/test','/api/terminal/resize'].includes(route))mutationEpoch++;
      if(route==='/api/config')result=await saveConfig(resolveConfigDraft(body));
      else if(route==='/api/openrouter/auth/start')result=openRouterAuth.start();
      else if(route==='/api/openrouter/auth/cancel')result=openRouterAuth.cancel(body.id);
      else if(route==='/api/openrouter/check')result=openRouterAuth.check();
      else if(route==='/api/connections'){const connection=await connections.save(resolveConnectionDraft(body));if(config.connectionId===connection.id)await useConnection(connection.id);result={connection,message:'Подключение сохранено.'};}
      else if(route==='/api/connections/use')result=await useConnection(body.id);
      else if(route==='/api/connections/test')result=await testConnection(body.id);
      else if(route==='/api/connections/remove'){const active=config.connectionId===body.id;connectionById(body.id);if(active)await saveConfig({provider:'local',connectionId:'',model:'local',baseUrl:''});await connections.remove(body.id);result={message:'Подключение удалено.',config:publicConfig()};}
      else if(route==='/api/programs/launch'){const profile=connectionById(body.id);if(profile.type!=='program')throw fail('Выберите подключение программы.');result=await launchProgram({program:profile.settings,workspace:absolute(profile.settings.workspace||config.workspace),powershellPath:config.powershellPath||''});}
      else if(route==='/api/terminal/create')result=await createTerminal({workspace:absolute(config.workspace),shell:body.shell,cols:body.cols,rows:body.rows,juliaPath:config.juliaPath||'',powershellPath:config.powershellPath||'',gitBashPath:config.gitBashPath||''});
      else if(route==='/api/terminal/input')result=inputTerminal({id:body.id,data:body.data});
      else if(route==='/api/terminal/resize')result=resizeTerminal({id:body.id,cols:body.cols,rows:body.rows});
      else if(route==='/api/terminal/close')result=closeTerminal({id:body.id});
      else if(route==='/api/config/editor')result=await saveEditor(editorDraftDocument(body));
      else if(route==='/api/tokens/bind')result=await bindToken(resolveBindDraft(body));
      else if(route==='/api/chats/save')result=await chats.save(body);
      else if(route==='/api/chats/upsert')result=await chats.upsert(body);
      else if(route==='/api/chats/delete')result=await chats.remove(body);
      else if(route==='/api/autosave')result=await autosaveLocal(body);
      else if(route==='/api/package')result=await buildPackage(body.personal===true);
      else if(route==='/api/probe')result=await probe();
      else if(route==='/api/local/start')result=await startLocal(body.modelPath);
      else if(route==='/api/models/discover')result=await discoverModels(body);
      else if(route==='/api/attachments')result=await uploadAttachment(body);
      else if(route==='/api/claude/open')result=await openClaudeSession({workspace:absolute(config.workspace),sessionId:body.sessionId,systemPrompt});
      else if(route==='/api/claude/context'){if(body.paths?.length)throw fail('Добавьте выбранные файлы через «Файлы проекта» или скрепку. Автоматическая загрузка проекта в Claude отключена.');result=await prepareClaudeContext({workspace:absolute(config.workspace),sessionId:body.sessionId,paths:[]});}
      else if(route==='/api/claude/stop'){for(const item of requests)if(item.provider==='claude')item.controller.abort();result={message:'Запросы Claude остановлены.'};}
      else if(route==='/api/completion'){const controller=new AbortController(),item={controller,provider:config.provider};requests.add(item);res.on('close',()=>{if(!res.writableEnded)controller.abort();});try{result=await completion(body,controller.signal);}finally{requests.delete(item);}}
      else if(route==='/api/tool')result=await prepareTool(body.name,body.arguments,body.executionTarget);
      else if(route==='/api/confirm'){const controller=new AbortController(),item={controller,provider:pending.get(body.id)?.name==='julia_eval_code'?'julia':'action'};requests.add(item);res.on('close',()=>{if(!res.writableEnded)controller.abort();});try{result=await confirm(body.id,body.allow===true,controller.signal);}finally{requests.delete(item);}}
      else if(route==='/api/skills')result=await prepareTool('save_skill',body);
      else if(route==='/api/engine/start'){if(requests.size)throw fail('Завершите текущий запрос.',409);startEngine();result={state:'starting',message:'Движок запускается. Ожидайте загрузки модели (~1–3 минуты)…'};}
      else if(route==='/api/engine/stop'){await stopEngine();result={state:'stopped',message:'Движок остановлен.'};}
      else if(route==='/api/shutdown'){
        if(requests.size)throw fail('Сначала завершите или остановите текущий запрос. Изменения и терминалы сохранены.',409);
        if(body.expectedSaveId){const receipt=saveReceipts.get(body.expectedSaveId);if(!receipt||receipt.expires<Date.now()||receipt.epoch!==mutationEpoch||receipt.revision!==chats.revision()||receipt.workspace!==config.workspace||receipt.configHash!==createHash('sha256').update(JSON.stringify(config)).digest('hex'))throw fail('Состояние изменилось после сохранения. Повторите сохранение перед выходом.',409);noLinks(DATA,CONFIG);noLinks(DATA,path.join(DATA,'connections.json'));noLinks(DATA,path.join(DATA,'chats.json'));if(receipt.connectionsHash!==await fingerprint(path.join(DATA,'connections.json'))||receipt.chatsHash!==await fingerprint(path.join(DATA,'chats.json')))throw fail('Локальные подключения или история изменились после сохранения. Повторите сохранение.',409);if(receipt.settingsHash!==await fingerprint(CONFIG))throw fail('Локальные настройки изменились после сохранения. Повторите сохранение.',409);for(const item of receipt.files){noLinks(absolute(config.workspace),item.target);if(item.hash!==await fingerprint(item.target))throw fail('Сохранённый файл изменился на диске. Повторите просмотр перед выходом.',409);}}
        try{
          if(body.autosave)await autosaveLocal(body.autosave);else {await chats.flush();await persistConfig();}
          openRouterAuth.close();closeAllTerminals();await closeJuliaRuns();closing=true;send(res,200,{saved:true,message:'Все изменения сохранены. Приложение остановлено.'});setTimeout(()=>{server.close();server.closeAllConnections();if(localProcess)localProcess.kill();process.exit(0);},200);return;
        }catch(error){lifecycleBusy=false;throw error;}
      }
      else throw fail('Метод не найден.',404);
      return send(res,200,result);
      }finally{if(tracked)activeMutations--;if(lifecycle&&!closing)lifecycleBusy=false;}
    }
    if(req.method!=='GET')throw fail('Метод недоступен.',405);
    const asset=route==='/'?'index.html':decodeURIComponent(route.slice(1));
    const publicRoot=path.join(WEB,'public'), file=path.resolve(publicRoot,asset);
    if(!inside(publicRoot,file))throw fail('Недоступный файл.',403);
    noLinks(publicRoot,file);
    let content=await fs.readFile(file);const nonce=asset==='index.html'?randomBytes(18).toString('base64'):'';
    if(nonce)content=content.toString('utf8').replace('</head>','<meta name="engee-style-nonce" content="'+nonce+'">\n</head>');
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'"+(nonce?" 'nonce-"+nonce+"'":"")+"; img-src 'self' data:; connect-src 'self' https://*.puter.com https://*.puter.site wss://api.puter.com; frame-src https://*.puter.com https://puter.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"});res.end(content);
  }catch(e){if(!res.headersSent)send(res,e.status|| (e.code==='ENOENT'?404:500),{error:redact(e.message||'Ошибка приложения.')});else res.end();}
});
// --- API-эндпоинт для внешних моделей (Codex, OpenCode и т.д.) ---
// Прокси-рераундер на colibri_proxy (127.0.0.1:8001). Отвечает в OpenAI-формате.
const API_PROXY_PORT = Number(config.apiProxyPort ?? 8002);
const API_PROXY_ENABLED = config.apiProxyEnabled !== false;
const apiProxyServer = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host;
    if (![`127.0.0.1:${API_PROXY_PORT}`, `localhost:${API_PROXY_PORT}`, String(API_PROXY_PORT)].includes(host))
      throw fail('Недопустимый Host.', 403);
    const url = new URL(req.url, 'http://127.0.0.1:' + API_PROXY_PORT), route = url.pathname;
    if (req.method === 'POST' && route === '/v1/chat/completions') {
      const ctype = (req.headers['content-type'] || '');
      if (!/^application\/json(?:;|$)/i.test(ctype)) throw fail('Нужен Content-Type application/json.', 415);
      const body = await readBody(req);
      const upstreamBase = (config.baseUrl || 'http://127.0.0.1:8001/v1').replace(/\/v1$/, '');
      const upstreamUrl = upstreamBase + '/v1/chat/completions';
      const payload = {
        model: body.model || config.model || 'qwen3-coder-30b-a3b-colibri',
        messages: Array.isArray(body.messages) ? body.messages : [],
        stream: false,
        max_tokens: body.max_tokens || config.maxTokens || 1024,
      };
      if (body.tools && body.tools.length) payload.tools = body.tools;
      if (body.tool_choice) payload.tool_choice = body.tool_choice;
      const timeout = AbortSignal.timeout(180000);
      const response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: timeout,
      });
      if (!response.ok) {
        let detail = '';
        try { const d = await response.json(); detail = String(d.error?.message || d.message || '').slice(0, 500); } catch { }
        throw fail(`Colibri: HTTP ${response.status}. ${detail || 'ошибка'}`, 502);
      }
      const data = await response.json();
      return send(res, 200, data);
    }
    if (req.method === 'GET' && route === '/v1/models') {
      const upstreamBase = (config.baseUrl || 'http://127.0.0.1:8001/v1').replace(/\/v1$/, '');
      const response = await fetch(upstreamBase + '/v1/models', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw fail('Colibri недоступен.', 502);
      return send(res, 200, await response.json());
    }
    throw fail('Метод не найден.', 404);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || (e.code === 'ENOTFOUND' ? 502 : 500), { error: e.message || 'Ошибка API.' });
    else res.end();
  }
});
if (API_PROXY_ENABLED) {
  apiProxyServer.on('error', (error) => {
    console.error(error.code === 'EADDRINUSE' ? `Порт API ${API_PROXY_PORT} занят.` : error.message);
  });
  apiProxyServer.listen(API_PROXY_PORT, '127.0.0.1', () => console.log(`API-эндпоинт: http://127.0.0.1:${API_PROXY_PORT}/v1/chat/completions`));
}

server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Порт ${PORT} занят. Запустите EngeeAgent.exe для автоматического выбора порта.`:redact(error.message));process.exit(1);});
server.listen(PORT,'127.0.0.1',()=>console.log(`Engee Agent: http://127.0.0.1:${PORT}/`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{for(const item of requests)item.controller.abort();closeAllTerminals();await closeJuliaRuns();server.closeAllConnections();server.close(()=>process.exit(0));});
process.on('exit',()=>{closeAllTerminals();void closeJuliaRuns();if(localProcess)localProcess.kill();});
