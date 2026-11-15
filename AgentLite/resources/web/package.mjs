import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Transform } from 'node:stream';
import { createDeflateRaw } from 'node:zlib';
import { once } from 'node:events';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ROOT_FILES=['EngeeAgent.exe','Start-EngeeAgent.cmd','start-engee-agent.sh','Build-Public-ZIP.cmd','Build-Personal-ZIP.cmd','README.md','THIRD_PARTY.md'];
const RESOURCE_ROOTS=['resources/runtime','resources/LLM','resources/skills','resources/web'];
const PERSONAL_DATA=['settings.json','connections.json'];
const blocked=value=>/(?:^|[\\/])summy(?:[\\/]|$)/i.test(value);
async function ordinary(file,directory=false,parents=null){
  const absolute=path.resolve(file);if(blocked(absolute))throw Error('Package paths must stay in the Engee project.');
  let cursor=path.parse(absolute).root;const parts=path.relative(cursor,absolute).split(path.sep).filter(Boolean);
  for(let i=0;i<parts.length;i++){cursor=path.join(cursor,parts[i]);if(i<parts.length-1&&parents?.has(cursor.toLowerCase()))continue;const stat=await fsp.lstat(cursor);if(stat.isSymbolicLink()||(i===parts.length-1?!((directory&&stat.isDirectory())||(!directory&&stat.isFile())):!stat.isDirectory()))throw Error('Package source must contain ordinary files and folders without links.');if(stat.isDirectory())parents?.add(cursor.toLowerCase());}
  return absolute;
}
/** Enumerates only release assets; does not read configuration values or create a ZIP. */
export async function selectPackageFiles({root=ROOT,personal=false,overlay=null}={}){
  if(!personal&&overlay)throw Error('Overlay is allowed only for the personal archive.');
  const parents=new Set();await ordinary(root,true,parents);const files=new Map();
  async function include(relative,file){try{files.set(relative,await ordinary(file,false,parents));}catch(error){if(error.code!=='ENOENT')throw error;}}
  async function walk(directory,prefix){
    await ordinary(directory,true,parents);
    for(const entry of await fsp.readdir(directory,{withFileTypes:true})){
      const relative=prefix+'/'+entry.name;
      if(prefix.startsWith('resources/skills/')&&entry.isDirectory()&&['test','tests'].includes(entry.name.toLowerCase()))continue;
      if(entry.isSymbolicLink()||entry.name.startsWith('.')||['node_modules','__pycache__','_build'].includes(entry.name)||/\.(?:zip|tmp|log)$/i.test(entry.name))continue;
      if(entry.isDirectory())await walk(path.join(directory,entry.name),relative);
      else if(entry.isFile())await include(relative,path.join(directory,entry.name));
    }
  }
  for(const name of ROOT_FILES)await include(name,path.join(root,name));
  if(!personal)await include('Создать ярлык на рабочем столе.cmd',path.join(root,'Создать ярлык на рабочем столе.cmd'));
  if(personal)await include('PERSONAL-README.md',path.join(overlay||root,'PERSONAL-README.md'));
  for(const relative of RESOURCE_ROOTS)await walk(path.join(root,relative),relative);
  for(const name of ['README.md','connection-smoke.jl'])await include('workspace/'+name,path.join(root,'workspace',name));
  if(personal)for(const name of PERSONAL_DATA)await include('data/'+name,path.join(overlay||root,'data',name));
  if(personal&&!files.has('data/settings.json'))throw Error('Personal settings not found. Save connections in the application first.');
  if(files.size>=65535)throw Error('Too many files for this ZIP writer. Use a ZIP64 archiver.');
  const folded=new Set();for(const relative of files.keys()){const key=relative.toLowerCase();if(folded.has(key))throw Error('Windows package path collision.');folded.add(key);}
  return new Map([...files].sort(([a],[b])=>a<b?-1:a>b?1:0));
}
async function main(){
const personal=process.argv.includes('--personal');
const outputArg=process.argv.indexOf('--output'),overlayArg=process.argv.indexOf('--overlay');
const output=path.resolve(outputArg>=0?process.argv[outputArg+1]:path.join(ROOT,'..',personal?'EngeeAgent-Personal-Windows-x64.zip':'EngeeAgent-Windows-x64.zip'));
const overlay=overlayArg>=0?path.resolve(process.argv[overlayArg+1]):null;
const exportRoot=path.join(ROOT,'data','exports');
if(output.startsWith(ROOT+path.sep)&&!(process.argv.includes('--app-export')&&output.startsWith(exportRoot+path.sep)))throw Error('Save ZIP outside the application folder or use the application export folder.');
const files=await selectPackageFiles({personal,overlay});
if(process.argv.includes('--dry-run')){console.log(JSON.stringify({dryRun:true,personal,files:[...files.keys()],count:files.size,archiveCreated:false}));return;}
const sources=JSON.parse(await fsp.readFile(path.join(ROOT,'resources/runtime/SOURCES.json'),'utf8'));
const manifest={app:'engee-portable-agent',version:sources.appVersion||'1.2.0',platform:'windows-x64',mode:personal?'personal':'public',createdAt:new Date().toISOString(),files:[]};
async function* entries(){for(const item of files)yield item;yield ['RELEASE-MANIFEST.json',Buffer.from(JSON.stringify(manifest,null,2)+'\n')];}
await fsp.mkdir(path.dirname(output),{recursive:true});
const stream=fs.createWriteStream(output+'.tmp');
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
let offset=0;
async function write(buffer){offset+=buffer.length;if(offset>=0xffffffff)throw new Error('ZIP exceeds 4 GB. Use a ZIP64 archiver for large models.');if(!stream.write(buffer))await once(stream,'drain');}
const directory=[],buildParents=new Set();
try{
  for await(const [relative,file] of entries()){
    const virtual=Buffer.isBuffer(file);if(!virtual){await ordinary(file,false,buildParents);if((await fsp.realpath(file)).toLowerCase()!==path.resolve(file).toLowerCase())throw Error('Package source path changed or contains a link.');}const stat=virtual?{size:file.length,mtime:new Date()}:await fsp.stat(file);if(stat.size>=0xffffffff)throw new Error('A file exceeds the supported 4 GB size.');
    const name=Buffer.from((personal?'EngeeAgent-Personal/':'EngeeAgent/')+relative,'utf8');
    const date=stat.mtime;const dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
    const dosDate=((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
    const flags=0x0808,method=8,entryOffset=offset;
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(flags,6);header.writeUInt16LE(method,8);header.writeUInt16LE(dosTime,10);header.writeUInt16LE(dosDate,12);header.writeUInt16LE(name.length,26);
    await write(header);await write(name);
    let crc=0xffffffff,plainSize=0,compressedSize=0;const digest=createHash('sha256');
    const checksum=new Transform({transform(chunk,encoding,callback){for(const b of chunk)crc=table[(crc^b)&255]^(crc>>>8);plainSize+=chunk.length;digest.update(chunk);callback(null,chunk);}});
    const source=virtual?(await import('node:stream')).Readable.from([file]):fs.createReadStream(file);const compressed=source.pipe(checksum).pipe(createDeflateRaw({level:6}));
    source.on('error',e=>compressed.destroy(e));checksum.on('error',e=>compressed.destroy(e));
    for await(const chunk of compressed){compressedSize+=chunk.length;await write(chunk);}
    if(plainSize!==stat.size)throw Error('A package source changed during the build. Freeze the application and retry.');
    if(!virtual)manifest.files.push({path:relative,size:plainSize,sha256:digest.digest('hex')});
    crc=(crc^0xffffffff)>>>0;
    const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50,0);descriptor.writeUInt32LE(crc,4);descriptor.writeUInt32LE(compressedSize,8);descriptor.writeUInt32LE(plainSize,12);await write(descriptor);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);central.writeUInt16LE(dosTime,12);central.writeUInt16LE(dosDate,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(compressedSize,20);central.writeUInt32LE(plainSize,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(entryOffset,42);directory.push(Buffer.concat([central,name]));
  }
  const dirOffset=offset;
  for(const entry of directory)await write(entry);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(directory.length,8);end.writeUInt16LE(directory.length,10);end.writeUInt32LE(offset-dirOffset,12);end.writeUInt32LE(dirOffset,16);await write(end);
  stream.end();await once(stream,'finish');await fsp.rename(output+'.tmp',output);
  console.log(JSON.stringify({archive:output,personal,files:files.size+1,version:manifest.version,bytes:offset}));
}catch(error){stream.destroy();await fsp.rm(output+'.tmp',{force:true}).catch(()=>{});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
