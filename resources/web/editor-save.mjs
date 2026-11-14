import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {atomicWrite,ordinaryPath} from './chat-store.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const editable=/\.(?:txt|md|jl|ngscript|json|csv|ya?ml|v|sv|py|mjs|js|html|css|log|toml)$/i;

export function createEditorSave({workspace,resolveFile,checkCode=()=>{},write=atomicWrite}={}){
  const tokens=new Map(),TTL=8*60*60*1000;
  async function root(){return ordinaryPath(await workspace());}
  async function bytesAt(target){await ordinaryPath(path.dirname(target));const stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1024*1024)throw fail('Нужен существующий текстовый файл до 1 МиБ.');const bytes=await fs.readFile(target);if(bytes.includes(0))throw fail('Двоичный файл нельзя редактировать как текст.');return bytes;}
  async function read(relative){const cwd=await root(),target=await resolveFile(relative),bytes=await bytesAt(target),content=bytes.toString('utf8');
    const result={path:relative,content,sha256:digest(bytes),workspaceId:digest(cwd.toLowerCase())};
    if(editable.test(relative)){const editToken=randomUUID();tokens.set(editToken,{path:relative,target,cwd,hash:result.sha256,expires:Date.now()+TTL});while(tokens.size>128)tokens.delete(tokens.keys().next().value);result.editToken=editToken;}return result;
  }
  async function prepare(edits=[]){if(!Array.isArray(edits)||edits.length>8)throw fail('За один раз можно сохранить до 8 открытых файлов.');const cwd=await root(),seen=new Set(),plans=[];
    for(const edit of edits){const token=tokens.get(edit?.editToken);if(!token||token.expires<Date.now()||token.path!==edit.path||token.cwd!==cwd)throw fail('Файл или рабочая папка изменились. Откройте файл заново перед сохранением.',409);if(typeof edit.content!=='string'||Buffer.byteLength(edit.content)>1024*1024||edit.content.includes('\0'))throw fail('Содержимое файла должно быть текстом до 1 МиБ.');const target=await resolveFile(edit.path);if(target!==token.target||seen.has(target))throw fail('Некорректный список сохранения.');seen.add(target);const before=await bytesAt(target);if(digest(before)!==token.hash)throw fail('Файл изменился на диске. Обновите его перед сохранением.',409);if(/\.(jl|ngscript)$/i.test(edit.path))checkCode(edit.content);plans.push({token,editToken:edit.editToken,target,before,after:Buffer.from(edit.content,'utf8')});}
    return plans;
  }
  async function commit(plans){const written=[];try{for(const plan of plans){const cwd=await root(),target=await resolveFile(plan.token.path);if(cwd!==plan.token.cwd||target!==plan.target||digest(await bytesAt(target))!==digest(plan.before))throw fail('Файл изменился во время сохранения. Повторите просмотр.',409);await write(target,plan.after);written.push(plan);plan.token.hash=digest(plan.after);plan.token.expires=Date.now()+TTL;}return written.map(plan=>({path:plan.token.path,sha256:plan.token.hash,editToken:plan.editToken,workspaceId:digest(plan.token.cwd.toLowerCase())}));}
    catch(error){for(const plan of written.reverse())try{if(digest(await bytesAt(plan.target))===digest(plan.after)){await write(plan.target,plan.before);plan.token.hash=digest(plan.before);}}catch{}throw error;}
  }
  async function rollback(plans){for(const plan of [...plans].reverse())if(digest(await bytesAt(plan.target))===digest(plan.after)){await write(plan.target,plan.before);plan.token.hash=digest(plan.before);}}
  return {read,prepare,commit,rollback};
}
