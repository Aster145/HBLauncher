'use strict';
// Read-only access to the title-owned mounts already exposed by ftpd-sb.
// No paths on the PC, SD card or system partitions are accepted here.
const path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const P=require('../../apps/file-browser/protocol.json');
const {virtualPath,nativePath}=require('./ftp-native.cjs');
const UTF8=new TextDecoder('utf-8',{fatal:true});
const MOUNTS=['save','tmp','rom'];
const COLLATOR=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'variant'});
const META=P.metadata,ATLAS_BYTES=P.atlas.width*P.atlas.height;

function decode(bytes){return UTF8.decode(bytes);}
function normalizePath(value){
 if(typeof value!=='string'||!value.startsWith('/'))throw Error('Path must be absolute');
 const result=virtualPath('/',value);
 if(result!=='/')nativePath(result);
 return result;
}
function requestFields(request){
 if(!Buffer.isBuffer(request)||request.length<32)throw Error('Invalid browser request');
 const mode=request.readUInt32LE(8),page=request.readUInt32LE(12),length=request.readUInt32LE(16);
 if(request.readUInt32LE(4)!==P.request.op||![1,2,3].includes(mode))throw Error('Invalid browser operation');
 if(length<1||length>P.request.pathMaxBytes||request.length<32+length)throw Error('Invalid path length');
 return {mode,page,path:normalizePath(decode(request.subarray(32,32+length)))};
}
function safeSize(value){if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid file size');return value;}
function parentPath(value){if(value==='/')return '/';const i=value.lastIndexOf('/');return i===0?'/':value.slice(0,i);}
function childPath(parent,name){return (parent==='/'?'':parent)+'/'+name;}
function validEntry(entry,parent){
 if(!entry||typeof entry.name!=='string'||!entry.name||entry.name==='.'||entry.name==='..'||/[\x00-\x1f\x7f/\\:]/.test(entry.name))throw Error('Invalid directory entry');
 const bytes=Buffer.from(entry.name,'utf8');
 // A real Switch directory name is at most 0x300 bytes; retain it exactly.
 if(bytes.length>META.entryStride-META.entryNameOffset||decode(bytes)!==entry.name)throw Error('Directory entry name is too long or invalid');
 if(entry.type!=='dir'&&entry.type!=='file')throw Error('Invalid directory entry type');
 return {name:entry.name,type:entry.type,size:entry.type==='dir'?0:safeSize(entry.size),actionable:Buffer.byteLength(childPath(parent,entry.name))<=P.request.pathMaxBytes};
}
function compareEntries(a,b){return (a.type==='dir'?0:1)-(b.type==='dir'?0:1)||COLLATOR.compare(a.name,b.name)||(a.name<b.name?-1:a.name>b.name?1:0);}
function pageIndex(page,pages){return Math.min(page,Math.max(0,pages-1));}
function previewText(bytes,offset,size){
 // A page boundary can bisect a valid UTF-8 character. Trim only the split
 // bytes at those boundaries; malformed sequences inside a page stay binary.
 let start=0;
 if(offset>0)while(start<Math.min(3,bytes.length)&&(bytes[start]&0xc0)===0x80)start++;
 let text=null;
 // Streaming mode tolerates only an unfinished valid UTF-8 sequence at EOF
 // of this page. It must not silently hide an invalid trailing byte.
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(start),{stream:offset+bytes.length<size});}catch{}
 if(text===null||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))return null;
 return text.replace(/^\uFEFF/,'');
}
function shortError(error){return String(error?.message??error??'Unknown error').replace(/[\r\n\t]/g,' ').slice(0,400);}
function errorFrame(error,fields={}){return {mode:[2,3].includes(fields.mode)?fields.mode:1,status:1,path:fields.path??'/',page:0,pageCount:1,totalEntries:0,entries:[],fileSize:0,previewOffset:0,previewLength:0,previewKind:0,error:shortError(error)};}
function putUtf8(buffer,offset,value,max){
 const bytes=Buffer.from(value,'utf8');let length=Math.min(max,bytes.length);
 // Keep the returned value valid UTF-8 even when an error text is shortened.
 while(length&&length<bytes.length&&(bytes[length]&0xc0)===0x80)length--;
 bytes.copy(buffer,offset,0,length);return length;
}
function metadata(frame){
 const b=Buffer.alloc(META.bytes);
 const values=[P.magic,1,frame.mode,frame.status,frame.page,frame.pageCount,frame.totalEntries,frame.entries.length];
 values.forEach((value,i)=>b.writeUInt32LE(value>>>0,i*4));
 b.writeBigUInt64LE(BigInt(frame.fileSize||0),32);b.writeBigUInt64LE(BigInt(frame.previewOffset||0),40);
 b.writeUInt32LE(frame.previewLength||0,48);b.writeUInt32LE(frame.previewKind||0,52);b.writeUInt32LE(frame.path==='/'?0:1,56);
 b.writeUInt32LE(putUtf8(b,META.pathOffset,frame.path,P.request.pathMaxBytes),64);
 b.writeUInt32LE(putUtf8(b,META.errorOffset,frame.error||'',128),68);
 frame.entries.forEach((entry,i)=>{
  const o=META.entriesOffset+i*META.entryStride;b.writeUInt32LE(entry.type==='dir'?1:2,o);
  b.writeUInt32LE(putUtf8(b,o+META.entryNameOffset,entry.name,META.entryStride-META.entryNameOffset),o+4);
  b.writeBigUInt64LE(BigInt(entry.size),o+8);b.writeUInt32LE(entry.actionable?1:0,o+16);
 });
 return b;
}
function python(){
 if(process.env.PYTHON)return process.env.PYTHON;
 const local=path.resolve(__dirname,'../../tools/python-env/Scripts/python.exe');
 return fs.existsSync(local)?local:'python3';
}
async function render(frame){
 return new Promise((resolve,reject)=>{
  const child=spawn(python(),[path.join(__dirname,'file-browser-render.py')],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:{...process.env,PYTHONUTF8:'1'}});
  const chunks=[];let length=0,stderr='',settled=false;
  const timer=setTimeout(()=>{child.kill();finish(Error('Browser text renderer timed out'));},15000);
  function finish(error,result){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(result);}
  child.on('error',finish);
  child.stdout.on('data',bytes=>{length+=bytes.length;if(length>ATLAS_BYTES){child.kill();finish(Error('Invalid browser atlas length'));}else chunks.push(bytes);});
  child.stderr.on('data',bytes=>{stderr=(stderr+bytes.toString('utf8')).slice(-4096);});
  child.stdin.on('error',()=>{});
  child.on('close',code=>{if(code!==0)return finish(Error('Browser text renderer failed: '+stderr.trim()));if(length!==ATLAS_BYTES)return finish(Error('Invalid browser atlas length'));finish(null,Buffer.concat(chunks));});
  child.stdin.end(JSON.stringify(frame));
 });
}
function create({rpc,directory,storage:providedStorage,render:providedRender,nativeFactory}={}){
 let storage=providedStorage;
 async function getStorage(){
  if(!storage)storage=(await (nativeFactory??require('./ftp-native.cjs').create)(rpc,directory)).storage;
  return storage;
 }
 async function list(fields){
  let entries;
  if(fields.path==='/')entries=MOUNTS.map(name=>({name,type:'dir',size:0}));
  else entries=await (await getStorage()).list(fields.path);
  if(!Array.isArray(entries)||entries.length>4096)throw Error('Directory exceeds 4096 entries');
  entries=entries.map(entry=>validEntry(entry,fields.path)).sort(compareEntries);
  const pageCount=Math.max(1,Math.ceil(entries.length/P.pageRows)),page=pageIndex(fields.page,pageCount);
  return {...fields,status:0,page,pageCount,totalEntries:entries.length,entries:entries.slice(page*P.pageRows,(page+1)*P.pageRows),fileSize:0,previewOffset:0,previewLength:0,previewKind:0,error:''};
 }
 async function preview(fields){
  if(fields.path==='/')throw Error('Choose a file to preview');
  const api=await getStorage(),stat=await api.stat(fields.path);
  if(stat.type!=='file')throw Error('Choose a file to preview');
  const file=await api.openRead(fields.path);
  try{
   const fileSize=safeSize(file.size),pageCount=Math.max(1,Math.ceil(fileSize/P.previewPageBytes));
   if(pageCount>0xffffffff)throw Error('File exceeds the preview address range');
   const page=pageIndex(fields.page,pageCount),previewOffset=page*P.previewPageBytes;
   const expected=Math.min(P.previewPageBytes,fileSize-previewOffset),bytes=expected?await api.read(file,previewOffset,expected):Buffer.alloc(0);
   if(!Buffer.isBuffer(bytes)||bytes.length!==expected)throw Error('Incomplete file read');
   const text=fields.mode===3?null:previewText(bytes,previewOffset,fileSize);
   return {...fields,status:0,page,pageCount,totalEntries:0,entries:[],fileSize,previewOffset,previewLength:bytes.length,previewKind:text===null?2:1,previewText:text,previewHex:bytes.toString('hex'),error:''};
  }finally{await api.close(file);}
 }
 return {async handle(request){
  let fields,frame;
  try{fields=requestFields(request);frame=await (fields.mode===1?list(fields):preview(fields));}catch(error){frame=errorFrame(error,fields);}
  let atlas;
  try{atlas=await (providedRender??render)(frame);if(!Buffer.isBuffer(atlas)||atlas.length!==ATLAS_BYTES)throw Error('Invalid browser atlas length');}
  catch(error){frame=errorFrame(error,fields);atlas=Buffer.alloc(ATLAS_BYTES);}
  const meta=metadata(frame);
  return {payload:Buffer.from(meta.subarray(0,1024)),writes:[{offset:META.offset,bytes:meta},{offset:P.atlas.offset,bytes:atlas}]};
 },reset(){/* No cached directory entries or open file handles survive a request. */}};
}
module.exports={create,normalizePath,parentPath,requestFields,metadata,previewText,compareEntries,protocol:P,render};
