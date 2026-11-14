import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID, randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {detectJulia} from './julia.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const JULIA_LIMITS=Object.freeze({codeBytes:64*1024,outputBytes:256*1024,timeoutMs:30000});
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const blocked=value=>/(?:^|[\\/])summy(?:[\\/]|$)/i.test(value);
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const digest=value=>createHash('sha256').update(value).digest('hex');
const WRAPPER=`let
    marker = pop!(ENV, "ENGEE_JULIA_RESULT_MARKER")
    try
        value = Base.include_string(Main, read(stdin, String), "confirmed-code.jl")
        if value !== nothing
            print(stdout, "\\n", marker, "BEGIN\\n")
            show(stdout, value)
            print(stdout, "\\n", marker, "END\\n")
        end
    catch exception
        Base.showerror(stderr, exception, catch_backtrace())
        println(stderr)
        exit(1)
    end
end`;

async function ordinaryDirectory(directory){
  if(typeof directory!=='string'||!directory||/[\0\r\n]/.test(directory)||blocked(directory))throw failure('Выберите обычную папку проекта Engee.');
  const resolved=path.resolve(directory);
  if(resolved===path.parse(resolved).root||/^\\\\|^\/\//.test(resolved))throw failure('Выберите отдельную локальную папку проекта.');
  let cursor=path.parse(resolved).root;
  for(const part of path.relative(cursor,resolved).split(path.sep).filter(Boolean)){
    cursor=path.join(cursor,part);
    const stat=await fs.lstat(cursor),real=await fs.realpath(cursor);
    if(!stat.isDirectory()||stat.isSymbolicLink()||!samePath(real,cursor)||blocked(real))throw failure('Рабочая папка Julia не должна проходить через ссылки.');
  }
  return fs.realpath(resolved);
}
async function binaryHash(file){
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
function validateCode(code){
  if(typeof code!=='string'||!code.trim()||Buffer.byteLength(code)>JULIA_LIMITS.codeBytes||code.includes('\0'))throw failure('Введите код Julia размером до 64 КиБ.');
  if(/\b(?:using|import)\s+Plots\b|\bPlots\s*\.|Pkg\.(?:add|develop)\s*\([^\n]*Plots/i.test(code))throw failure('Используйте встроенную графику Engee без подключения Plots.');
  // This is a policy guard, not an OS sandbox. The approval warns about normal local file permissions.
  if(blocked(code))throw failure('Код должен относиться только к выбранному проекту Engee.');
  return code;
}
function runEnvironment(executable,directory,marker,source){
  const values=new Map();
  for(const [name,value]of Object.entries(source))if(/^(?:SYSTEMROOT|WINDIR)$/i.test(name)&&typeof value==='string'&&!blocked(value))values.set(name.toUpperCase(),value);
  const systemRoot=values.get('SYSTEMROOT')||values.get('WINDIR')||'C:\\Windows';
  return {SystemRoot:systemRoot,WINDIR:values.get('WINDIR')||systemRoot,
    PATH:[path.dirname(executable),path.join(systemRoot,'System32'),systemRoot].join(path.delimiter),
    TEMP:path.join(directory,'temp'),TMP:path.join(directory,'temp'),
    JULIA_DEPOT_PATH:path.join(directory,'depot')+path.delimiter,JULIA_LOAD_PATH:'@'+path.delimiter+'@stdlib',
    JULIA_PKG_PRECOMPILE_AUTO:'0',JULIA_NUM_THREADS:'1',ENGEE_JULIA_RESULT_MARKER:marker};
}
function parseOutput(bytes,marker){
  const text=bytes.toString('utf8'),start='\n'+marker+'BEGIN\n',end='\n'+marker+'END\n';
  const from=text.lastIndexOf(start),to=from<0?-1:text.indexOf(end,from+start.length);
  if(from<0||to<0)return {stdout:text.split(marker).join('')};
  const result=text.slice(from+start.length,to);
  return {stdout:text.slice(0,from)+(text.slice(to+end.length)),result};
}
function killOwnedTree(child){
  if(child.exitCode!==null||child.signalCode!==null)return Promise.resolve();
  if(process.platform!=='win32'||!Number.isInteger(child.pid)||child.pid<=0){try{child.kill('SIGKILL');}catch{}return Promise.resolve();}
  // Never use process-name termination. Only this still-owned child PID and its descendants.
  const systemRoot=process.env.SystemRoot||process.env.SYSTEMROOT||'C:\\Windows';
  return new Promise(resolve=>{
    let killer,timer,finished=false;try{killer=spawn(path.join(systemRoot,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,shell:false,stdio:'ignore'});}catch{try{child.kill();}catch{}resolve();return;}
    const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);try{if(child.exitCode===null&&child.signalCode===null)child.kill();}catch{}resolve();};
    killer.once('error',finish);killer.once('close',finish);
    timer=setTimeout(()=>{try{if(killer.exitCode===null&&killer.signalCode===null)killer.kill();}catch{}finish();},1200);
  });
}

/** A bounded, separately confirmed local process. This deliberately does not claim OS sandboxing. */
export function createJuliaRunner({root=ROOT,detect=detectJulia,spawnProcess=spawn,killProcess=killOwnedTree,environment=process.env,timeoutMs=JULIA_LIMITS.timeoutMs,outputBytes=JULIA_LIMITS.outputBytes,stopGraceMs=2000}={}){
  const runRoot=path.join(root,'data','julia-runs');let busy=false,activeChild,unconfirmedChild;
  const live=child=>child&&child.exitCode===null&&child.signalCode===null;
  async function prepare({workspace,juliaPath='',code}){
    validateCode(code);
    const cwd=await ordinaryDirectory(workspace),detected=await detect({configuredPath:juliaPath});
    if(!detected.available||!detected.path||!detected.version)throw failure(detected.message||'Julia не найдена. Укажите установленную Julia в параметрах.');
    return Object.freeze({code,codeHash:digest(code),cwd,executable:detected.path,version:detected.version,
      executableHash:await binaryHash(detected.path),juliaPathSetting:juliaPath});
  }
  async function verify(snapshot,{workspace,juliaPath=''}){
    if(!snapshot||snapshot.codeHash!==digest(validateCode(snapshot.code)))throw failure('Код изменился после предложения. Повторите подтверждение.');
    if(juliaPath!==snapshot.juliaPathSetting||!samePath(await ordinaryDirectory(workspace),snapshot.cwd))throw failure('Папка проекта или путь Julia изменились. Повторите подтверждение.');
    const detected=await detect({configuredPath:juliaPath});
    if(!detected.available||!detected.path||!samePath(detected.path,snapshot.executable)||detected.version!==snapshot.version||await binaryHash(detected.path)!==snapshot.executableHash)throw failure('Установленная Julia изменилась. Повторите просмотр кода и подтверждение.');
  }
  async function run(snapshot,{workspace,juliaPath='',signal}={}){
    if(busy||live(unconfirmedChild))throw failure('Дождитесь завершения текущего вычисления Julia или остановите его.',409);
    busy=true;let directory;
    const started=Date.now(),empty=()=>({origin:'julia',version:snapshot?.version||null,stdout:'',stderr:'',exitCode:null,ok:false,durationMs:Date.now()-started,timedOut:false,cancelled:true,truncated:false});
    try{
      if(signal?.aborted)return empty();
      await verify(snapshot,{workspace,juliaPath});if(signal?.aborted)return empty();
      // Validate the app-owned storage before creating or recursively removing a request directory.
      await ordinaryDirectory(root);await fs.mkdir(runRoot,{recursive:true});await ordinaryDirectory(runRoot);
      const id=randomUUID();directory=path.join(runRoot,id);await fs.mkdir(directory);
      await Promise.all(['depot','temp'].map(name=>fs.mkdir(path.join(directory,name))));
      const marker='engee_result_'+randomBytes(24).toString('hex')+'_';
      const env=runEnvironment(snapshot.executable,directory,marker,environment);
      return await new Promise((resolve,reject)=>{
        let child;try{child=spawnProcess(snapshot.executable,['--startup-file=no','--history-file=no','--compiled-modules=no','--color=no','--project='+snapshot.cwd,'-e',WRAPPER],{cwd:snapshot.cwd,env,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});}catch{reject(failure('Не удалось запустить установленную Julia.',502));return;}
        activeChild=child;
        const exited=()=>{if(unconfirmedChild===child)unconfirmedChild=undefined;if(activeChild===child)activeChild=undefined;};
        child.once('exit',exited);child.once('close',exited);
        const stdout=[],stderr=[];let size=0,timedOut=false,cancelled=false,truncated=false,stopping=false,spawnFailed=false,timer,stopTimer,settled=false;
        const finish=(exitCode,forced=false)=>{
          if(settled)return;settled=true;clearTimeout(timer);clearTimeout(stopTimer);signal?.removeEventListener('abort',abort);
          child.stdout.off('data',onStdout);child.stderr.off('data',onStderr);
          if(forced){child.stdin.destroy();child.stdout.destroy();child.stderr.destroy();child.unref?.();}
          if(spawnFailed){reject(failure('Не удалось запустить установленную Julia.',502));return;}
          const unconfirmed=forced&&child.exitCode===null&&child.signalCode===null;
          if(unconfirmed)unconfirmedChild=child;
          if(activeChild===child)activeChild=undefined;
          resolve({origin:'julia',version:snapshot.version,...parseOutput(Buffer.concat(stdout),marker),stderr:Buffer.concat(stderr).toString('utf8'),exitCode:typeof exitCode==='number'?exitCode:null,ok:exitCode===0&&!timedOut&&!cancelled&&!truncated&&!forced,durationMs:Date.now()-started,timedOut,cancelled,truncated,...(forced?{terminationUnconfirmed:unconfirmed}: {}),...(unconfirmed?{error:'Не удалось подтвердить завершение процесса Julia. Вывод закрыт; перед повторным запуском проверьте свои процессы.'}: {})});
        };
        const stop=()=>{if(stopping||settled)return;stopping=true;stopTimer=setTimeout(()=>finish(child.exitCode,true),stopGraceMs);Promise.resolve().then(()=>killProcess(child)).catch(()=>{});};
        const abort=()=>{cancelled=true;stop();};
        const capture=(target,chunk)=>{if(settled)return;const bytes=Buffer.from(chunk),remaining=Math.max(0,outputBytes-size);if(remaining)target.push(bytes.subarray(0,remaining));size+=Math.min(bytes.length,remaining);if(bytes.length>remaining){truncated=true;stop();}};
        const onStdout=chunk=>capture(stdout,chunk),onStderr=chunk=>capture(stderr,chunk);
        child.stdout.on('data',onStdout);child.stderr.on('data',onStderr);
        child.stdin.on('error',()=>{});
        child.once('error',()=>{spawnFailed=true;stop();});
        child.once('close',exitCode=>finish(exitCode));
        timer=setTimeout(()=>{timedOut=true;stop();},timeoutMs);
        signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted)abort();else child.stdin.end(snapshot.code,'utf8');
      });
    }finally{
      if(directory){const relative=path.relative(runRoot,directory);if(/^[a-f0-9-]{36}$/.test(relative))try{await ordinaryDirectory(directory);await fs.rm(directory,{recursive:true,force:true});}catch{} }
      busy=false;
    }
  }
  async function close(){
    // References come only from this runner; never discover or terminate unrelated Julia processes.
    const children=[...new Set([activeChild,unconfirmedChild].filter(live))];
    await Promise.allSettled(children.map(child=>new Promise(resolve=>{
      const timer=setTimeout(resolve,stopGraceMs);
      Promise.resolve().then(()=>killProcess(child)).catch(()=>{}).finally(()=>{clearTimeout(timer);resolve();});
    })));
  }
  return {prepare,run,verify,close,limits:JULIA_LIMITS};
}
const runner=createJuliaRunner();
export const prepareJuliaCode=options=>runner.prepare(options);
export const runJuliaCode=(snapshot,options)=>runner.run(snapshot,options);
export const closeJuliaRuns=()=>runner.close();
export async function juliaCapability({juliaPath=''}={}){
  const detected=await detectJulia({configuredPath:juliaPath});
  return {available:!!detected.available,version:detected.version||null,executable:detected.path||null,message:detected.available?'Julia найдена. Код из чата выполняется только после подтверждения.':detected.message};
}
