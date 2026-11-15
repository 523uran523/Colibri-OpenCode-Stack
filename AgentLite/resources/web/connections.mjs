import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateProgram} from './programs.mjs';

const fail=message=>Object.assign(new Error(message),{status:400});
const formats=new Set(['chat-completions','responses','anthropic','gemini','custom-json']);
const text=(value,label,max=4096)=>{if(typeof value!=='string'||value.length>max)throw fail('Некорректное поле: '+label);return value.trim();};
function endpoint(value){const raw=text(value,'адрес API');let url;try{url=new URL(raw);}catch{throw fail('Укажите полный адрес API.');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.hash||url.search)throw fail('Нужен HTTP/HTTPS адрес без паролей и параметров.');if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw fail('Для удалённого сервера нужен HTTPS.');return url.href.replace(/\/$/,'');}
function noLiteralSecrets(value,key=''){
 if(value&&typeof value==='object'){for(const [name,item]of Object.entries(value))noLiteralSecrets(item,name);return;}
 if(/auth|api.?key|token|password|secret|cookie/i.test(key)&&typeof value==='string'&&value&&!value.includes('{{apiKey}}'))throw fail('Секрет задаётся в поле API-ключ. В шаблоне используйте {{apiKey}}.');
}
async function settingsFor(type,settings){
 if(!settings||typeof settings!=='object'||Array.isArray(settings)||JSON.stringify(settings).length>131072)throw fail('Некорректные параметры подключения.');
 if(type==='api'){
  const format=settings.format||'chat-completions';if(!formats.has(format))throw fail('Выберите формат API.');
  const result={format,baseUrl:endpoint(settings.baseUrl),model:text(settings.model||'','модель')};
  if(format!=='custom-json'&&!result.model)throw fail('Укажите точное название модели. Каталог доступных моделей находится на сайте сервиса.');
  if(settings.headers!==undefined){if(!settings.headers||typeof settings.headers!=='object'||Array.isArray(settings.headers)||Object.keys(settings.headers).length>32)throw fail('Заголовки должны быть объектом JSON.');for(const [name,value]of Object.entries(settings.headers)){if(!/^[A-Za-z0-9_-]+$/.test(name)||typeof value!=='string'||/[\r\n]/.test(value)||value.length>16384)throw fail('Некорректный заголовок API.');}noLiteralSecrets(settings.headers);result.headers=settings.headers;}
  if(format==='custom-json'){
   if(!settings.requestTemplate||typeof settings.requestTemplate!=='object'||Array.isArray(settings.requestTemplate))throw fail('Задайте объект JSON запроса.');noLiteralSecrets(settings.requestTemplate);result.requestTemplate=settings.requestTemplate;
   for(const field of ['responsePath','toolsPath','toolNamePath','toolArgumentsPath','toolIdPath'])if(settings[field]!==undefined){const p=text(settings[field],field,1024);if(p&&!/^[A-Za-z0-9_$.[\]-]+$/.test(p))throw fail('Путь к полю ответа должен использовать имена полей и индексы.');result[field]=p;}
   if(!result.responsePath)throw fail('Укажите путь к тексту ответа.');
  }
  return result;
 }
 if(type==='local'){
  const engine=settings.engine||'ollama';if(!['ollama','gguf','lmstudio','server'].includes(engine))throw fail('Выберите локальный движок.');
  const result={engine,model:text(settings.model||'','модель')};
  if(engine==='gguf'){result.modelsDir=text(settings.modelsDir||'resources/LLM','папка моделей');result.modelPath=text(settings.modelPath||'','файл GGUF');}
  else result.baseUrl=endpoint(settings.baseUrl||(engine==='lmstudio'?'http://127.0.0.1:1234/v1':'http://127.0.0.1:11434/v1'));
  return result;
 }
 if(type==='program'){
  const program=await validateProgram(settings);return {...program,...(settings.workspace?{workspace:text(settings.workspace,'рабочая папка')}: {})};
 }
 throw fail('Выберите API, программу или локальную модель.');
}
export async function createConnectionsStore(data){
 const file=path.join(data,'connections.json');let items=[];const notices=[];
 try{const document=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(document.connections)||document.connections.length>100)throw Error('format');for(const item of document.connections){if(!item||typeof item.id!=='string'||!item.id||typeof item.name!=='string'||!['api','local','program'].includes(item.type)||typeof item.apiKey!=='string')throw Error('format');if(items.some(old=>old.id===item.id))throw Error('format');if(item.type!=='program')item.settings=await settingsFor(item.type,item.settings);items.push(item);}}catch(error){if(error.code!=='ENOENT'){await fs.rename(file,file+'.invalid-'+Date.now());items=[];notices.push('Файл подключений повреждён. Оригинал сохранён рядом с ним; добавьте подключения через интерфейс.');}}
 const persist=async()=>{const temporary=file+'.tmp';await fs.writeFile(temporary,JSON.stringify({version:1,connections:items},null,2)+'\n',{mode:0o600});await fs.rename(temporary,file);};
 const publicItem=item=>({id:item.id,name:item.name,type:item.type,settings:item.settings,hasApiKey:!!item.apiKey});
 return {
  notices,
  secrets:()=>items.map(item=>item.apiKey).filter(Boolean),
  list:()=>items.map(publicItem),
  get:id=>items.find(item=>item.id===id),
  async save(input){
   if(!input||typeof input!=='object')throw fail('Некорректное подключение.');
   const existing=input.id?items.find(item=>item.id===input.id):undefined;if(input.id&&!existing)throw fail('Подключение не найдено.');
   const name=text(input.name,'название',120);if(!name)throw fail('Укажите название подключения.');
   const settings=await settingsFor(input.type,input.settings);
   const item={id:existing?.id||randomUUID(),name,type:input.type,settings,apiKey:existing?.apiKey||''};
   if(input.clearApiKey)item.apiKey='';
   if(input.apiKey!==undefined){const key=text(input.apiKey,'API-ключ',16384);if(key)item.apiKey=key;}
   const previous=items;items=existing?items.map(old=>old.id===item.id?item:old):[...items,item];if(items.length>100){items=previous;throw fail('Максимум 100 подключений.');}
   try{await persist();}catch(error){items=previous;throw error;}return publicItem(item);
  },
  async remove(id){const previous=items;items=items.filter(item=>item.id!==id);if(items.length===previous.length)throw fail('Подключение не найдено.');try{await persist();}catch(error){items=previous;throw error;}},
 };
}
