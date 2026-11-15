import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const blocked=value=>/(?:^|[\\/])summy(?:[\\/]|$)/i.test(value);
const launcher=value=>/[\\/](?:WindowsApps|\.juliaup[\\/]bin)(?:[\\/]|$)/i.test(value);
const failure=message=>Object.assign(new Error(message),{status:400,code:'JULIA_PATH_INVALID'});
const empty=message=>({available:false,path:null,version:null,message,downloadUrl:'https://julialang.org/downloads/'});

/** Injectable filesystem/version reader keeps optional component tests independent of installations. */
export function createJuliaDetector({root=ROOT,home=os.homedir(),env=process.env,files=fs,execVersion=exec}={}){
  async function ordinaryParents(target){
    let cursor=path.parse(target).root;
    for(const part of path.relative(cursor,target).split(path.sep).filter(Boolean).slice(0,-1)){
      cursor=path.join(cursor,part);
      const stat=await files.lstat(cursor),real=await files.realpath(cursor);
      if(!stat.isDirectory()||stat.isSymbolicLink()||real.toLowerCase()!==cursor.toLowerCase()||blocked(real))throw failure('Путь Julia не должен проходить через ссылки.');
    }
  }
  async function validatePath(value){
    if(typeof value!=='string'||!value.trim()||value.length>4096||/[\0\r\n]/.test(value))throw failure('Укажите путь к установленной julia.exe.');
    const raw=value.trim();
    if(blocked(raw)||/^\\\\|^\/\//.test(raw))throw failure('Выберите локальную установленную Julia.');
    const requested=path.resolve(root,raw),relative=path.relative(root,requested);
    if(!path.isAbsolute(raw)&&(relative==='..'||relative.startsWith('..'+path.sep)))throw failure('Укажите полный путь к julia.exe.');
    if(path.basename(requested).toLowerCase()!=='julia.exe'||launcher(requested))throw failure('Нужен файл bin/julia.exe установленной Julia. Ярлык juliaup не запускается при обнаружении.');
    let stat,real;try{await ordinaryParents(requested);stat=await files.lstat(requested);real=await files.realpath(requested);}catch(error){if(error.code==='JULIA_PATH_INVALID')throw error;throw failure('Файл Julia не найден. Установите Julia или исправьте путь.');}
    if(!stat.isFile()||stat.isSymbolicLink()||real.toLowerCase()!==requested.toLowerCase()||blocked(real))throw failure('Укажите обычный файл julia.exe без ссылок.');
    try{if((await files.lstat(path.join(path.dirname(real),'juliaup.exe'))).isFile())throw failure('Выберите bin/julia.exe установленной версии, а не запускатель juliaup.');}catch(error){if(error.code!=='ENOENT')throw error;}
    return real;
  }
  async function versionAt(file){
    const variables={};for(const [key,value]of Object.entries(env))if(/^(?:SYSTEMROOT|WINDIR|PATH|PATHEXT|COMSPEC|TEMP|TMP|USERPROFILE|HOMEDRIVE|HOMEPATH|HOME)$/i.test(key)&&typeof value==='string')variables[key]=value;
    const {stdout}=await execVersion(file,['--startup-file=no','--history-file=no','--version'],{cwd:root,env:variables,timeout:5000,maxBuffer:65536,windowsHide:true,shell:false});
    const version=String(stdout||'').match(/^julia version (\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?)[ \t\r]*$/m)?.[1];
    if(!version)throw failure('Не удалось подтвердить версию Julia. Выберите официальный файл bin/julia.exe.');
    return version;
  }
  async function folders(directory,prefix,suffix){
    if(!directory||blocked(directory))return [];
    try{await ordinaryParents(path.join(directory,'_metadata_only'));const stat=await files.lstat(directory);if(!stat.isDirectory()||stat.isSymbolicLink())return [];const entries=await files.readdir(directory,{withFileTypes:true});return entries.filter(entry=>entry.isDirectory()&&!entry.isSymbolicLink()&&prefix.test(entry.name)).slice(0,32).map(entry=>path.join(directory,entry.name,suffix));}catch{return [];}
  }
  async function detect({configuredPath=''}={}){
    if(configuredPath){try{const file=await validatePath(configuredPath),version=await versionAt(file);return {...empty('Julia найдена. Запуск — вручную в терминале.'),available:true,path:file,version};}catch(error){return empty(error.code==='JULIA_PATH_INVALID'?error.message:'Не удалось проверить Julia. Исправьте путь или установите официальный runtime.');}}
    const candidates=(env.PATH||'').split(path.delimiter).filter(directory=>directory&&!blocked(directory)&&!launcher(directory)).slice(0,100).map(directory=>path.join(directory,'julia.exe'));
    const depot=env.JULIAUP_DEPOT_PATH||path.join(home,'.julia');
    candidates.push(...await folders(path.join(depot,'juliaup'),/^julia-\d/i,'bin/julia.exe'));
    if(env.LOCALAPPDATA)candidates.push(...await folders(path.join(env.LOCALAPPDATA,'Programs'),/^Julia-\d/i,'bin/julia.exe'));
    if(env.ProgramFiles)candidates.push(...await folders(env.ProgramFiles,/^Julia-\d/i,'bin/julia.exe'));
    for(const candidate of [...new Set(candidates)]){try{const file=await validatePath(candidate),version=await versionAt(file);return {...empty('Julia найдена. Запуск — вручную в терминале.'),available:true,path:file,version};}catch{}}
    return empty('Julia не найдена. Установите её с официального сайта или укажите полный путь к bin/julia.exe.');
  }
  return {detect,validatePath};
}
const detector=createJuliaDetector();
export const detectJulia=options=>detector.detect(options);
export async function validateJuliaPath(value){
  if(typeof value!=='string')throw failure('Путь Julia должен быть строкой.');
  if(!value.trim())return '';
  const file=await detector.validatePath(value),detected=await detector.detect({configuredPath:file});
  if(!detected.available)throw failure(detected.message);
  return file;
}
