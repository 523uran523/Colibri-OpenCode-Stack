import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const names={claude:['claude.exe'],powershell:['powershell.exe','pwsh.exe'],gitbash:['bash.exe']};
const labels={claude:'Claude Code',powershell:'PowerShell',gitbash:'Git Bash'};
const blocked=value=>/(?:^|[\\/])summy(?:[\\/]|$)/i.test(value);
const fail=message=>Object.assign(new Error(message),{status:400,code:'COMPONENT_PATH_INVALID'});

/** Path validation reads metadata only. It never starts or installs a component. */
export function createComponentPaths({root=ROOT,files=fs}={}){
  async function validate(kind,value){
    if(!names[kind]||typeof value!=='string'||value.length>4096||/[\0\r\n]/.test(value))throw fail('Некорректный путь к программе.');
    if(!value.trim())return '';
    const raw=value.trim(),file=path.resolve(root,raw),relative=path.relative(root,file);
    if(blocked(raw)||blocked(file)||/^\\\\|^\/\//.test(raw))throw fail('Выберите локальную программу для проекта Engee.');
    if(!path.isAbsolute(raw)&&(relative==='..'||relative.startsWith('..'+path.sep)))throw fail('Укажите полный путь к программе.');
    if(!names[kind].includes(path.basename(file).toLowerCase()))throw fail('Для '+labels[kind]+' нужен файл '+names[kind].join(' или ')+'.');
    let cursor=path.parse(file).root;
    try{const parts=path.relative(cursor,file).split(path.sep).filter(Boolean);for(let i=0;i<parts.length;i++){
      cursor=path.join(cursor,parts[i]);const stat=await files.lstat(cursor),real=await files.realpath(cursor);
      if(stat.isSymbolicLink()||real.toLowerCase()!==cursor.toLowerCase()||blocked(real)||(i===parts.length-1?!stat.isFile():!stat.isDirectory()))throw fail('Путь программы не должен проходить через ссылки.');
    }}catch(error){if(error.code==='COMPONENT_PATH_INVALID')throw error;throw fail('Программа не найдена. Установите '+labels[kind]+' или исправьте путь.');}
    return file;
  }
  async function resolve(kind,{configuredPath='',candidates=[]}={}){
    let manualFailed=false;
    if(configuredPath){try{const file=await validate(kind,configuredPath);return {path:file,resolvedPath:file,configuredPath,source:'configured',message:'Используется указанный путь '+labels[kind]+'.'};}catch{manualFailed=true;}}
    for(const candidate of [...new Set(candidates.filter(Boolean))]){if(blocked(candidate))continue;try{const file=await validate(kind,candidate);return {path:file,resolvedPath:file,configuredPath,source:'auto',message:manualFailed?'Указанный путь недоступен; программа найдена автоматически.':'Программа найдена автоматически.'};}catch{}}
    return {path:null,resolvedPath:null,configuredPath,source:'unavailable',message:manualFailed?'Указанный путь недоступен. Установите '+labels[kind]+' или исправьте путь.':labels[kind]+' не найдена. Установите её или укажите полный путь.'};
  }
  return {validate,resolve};
}
const components=createComponentPaths();
export const validateComponentPath=(kind,value)=>components.validate(kind,value);
export const resolveComponentPath=(kind,options)=>components.resolve(kind,options);
