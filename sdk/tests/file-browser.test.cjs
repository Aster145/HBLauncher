'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,normalizePath,parentPath,protocol:P,previewText}=require('../host/file-browser.cjs');
const ATLAS=Buffer.alloc(P.atlas.width*P.atlas.height);
function request(mode=1,value='/',page=0){const bytes=Buffer.from(value),b=Buffer.alloc(1056);b.writeUInt32LE(1);b.writeUInt32LE(5,4);b.writeUInt32LE(mode,8);b.writeUInt32LE(page,12);b.writeUInt32LE(bytes.length,16);bytes.copy(b,32);return b;}
function fixture(overrides={}){
 const calls=[],frames=[];
 const defaults={
  async list(value){calls.push(['list',value]);return [];},
  async stat(value){calls.push(['stat',value]);return {type:'file',size:0};},
  async openRead(value){calls.push(['openRead',value]);return {handle:1,size:0,write:false};},
  async read(file,offset,length){calls.push(['read',offset,length]);return Buffer.alloc(length);},
  async close(file){calls.push(['close',file.handle]);}
 };
 const storage=new Proxy({...defaults,...overrides},{get(target,name){if(name==='then')return undefined;if(!(name in target))throw Error('Unexpected storage operation: '+String(name));return target[name];}});
 const browser=create({storage,render:async frame=>{frames.push(frame);return ATLAS;}});
 return {browser,calls,frames,async run(...args){const result=await browser.handle(request(...args));assert.equal(result.payload.length,1024);assert.equal(result.writes.length,2);assert.equal(result.writes[0].offset,0x280000);assert.equal(result.writes[0].bytes.length,16384);assert.equal(result.writes[1].offset,0x300000);assert.equal(result.writes[1].bytes.length,2097152);return {result,frame:frames.at(-1),meta:result.writes[0].bytes};}};
}

test('virtual root lists only mounted save/tmp/rom and creates no native API',async()=>{
 let nativeCalls=0;const frames=[];
 const browser=create({nativeFactory:async()=>{nativeCalls++;throw Error('Native must be lazy');},render:async frame=>{frames.push(frame);return ATLAS;}});
 const result=await browser.handle(request());
 assert.equal(result.payload.readUInt32LE(12),0);assert.equal(nativeCalls,0);
 assert.deepEqual(frames[0].entries.map(e=>e.name),['rom','save','tmp']);
});
test('paths are canonicalized within the allowed virtual mount namespace',()=>{
 assert.equal(normalizePath('/save/a/../b'),'/save/b');assert.equal(normalizePath('/save/../../rom'),'/rom');
 assert.equal(normalizePath('/./'),'/' );assert.equal(parentPath('/rom/a/b'),'/rom/a');assert.equal(parentPath('/rom'),'/');assert.equal(parentPath('/'),'/');
 for(const value of ['/sdmc/x','/system','C:/secret','rom/foo','/rom/a\\b','/rom/x\ny','/rom/a\0b','/save/../../system'])assert.throws(()=>normalizePath(value));
});
test('invalid or oversized path requests cannot touch storage',async()=>{
 const f=fixture();
 for(const value of ['/sdmc/x','/rom/evil\nname','/rom/'+ 'x'.repeat(736)]){const {frame}=await f.run(1,value);assert.equal(frame.status,1);assert.equal(frame.entries.length,0);}
 const malformed=request(1,'/rom/a');malformed[32+5]=0xff;
 await f.browser.handle(malformed);assert.equal(f.frames.at(-1).status,1);assert.deepEqual(f.calls,[]);
});
test('directories sort first, with natural ordering, and page count rounds up',async()=>{
 const entries=[{name:'file10',type:'file',size:10},{name:'file2',type:'file',size:2},{name:'z-folder',type:'dir',size:0},...Array.from({length:11},(_,i)=>({name:'file'+(20+i),type:'file',size:i}))];
 const f=fixture({async list(){return entries;}}),{frame,meta}=await f.run(1,'/save');
 assert.equal(frame.totalEntries,14);assert.equal(frame.pageCount,2);assert.equal(frame.entries.length,12);assert.deepEqual(frame.entries.slice(0,3).map(e=>e.name),['z-folder','file2','file10']);
 assert.equal(meta.readUInt32LE(1024),1);assert.equal(meta.readUInt32LE(1024+16),1);assert.equal(meta.readUInt32LE(24),14);
});
test('last directory page clamps oversized requests and unused rows are zero',async()=>{
 const f=fixture({async list(){return Array.from({length:25},(_,i)=>({name:'file'+i,type:'file',size:i}));}});
 const {frame,meta}=await f.run(1,'/rom',0xffffffff);
 assert.equal(frame.page,2);assert.equal(frame.pageCount,3);assert.equal(frame.entries.length,1);assert.equal(frame.entries[0].name,'file24');
 assert.ok(meta.subarray(2048).every(byte=>byte===0));
});
test('empty directories still have a navigable page with no actionable rows',async()=>{
 const f=fixture(),{frame,meta}=await f.run(1,'/tmp',7);assert.equal(frame.page,0);assert.equal(frame.pageCount,1);assert.equal(frame.entries.length,0);assert.equal(meta.readUInt32LE(28),0);assert.equal(meta.readUInt32LE(56),1);
});
test('long Unicode names are preserved exactly and unaddressable paths are disabled',async()=>{
 const name='文件'.repeat(127),f=fixture({async list(){return [{name,type:'file',size:42}];}}),{frame,meta}=await f.run(1,'/rom');
 assert.equal(frame.status,0);assert.equal(frame.entries[0].name,name);assert.equal(frame.entries[0].actionable,false);
 const length=meta.readUInt32LE(1028);assert.equal(meta.subarray(1056,1056+length).toString(),name);assert.equal(meta.readUInt32LE(1040),0);
});
test('invalid native directory entries fail the entire frame without stale rows',async()=>{
 const f=fixture({async list(){return [{name:'good',type:'file',size:1},{name:'../escape',type:'dir',size:0}];}}),{frame,meta}=await f.run(1,'/save');
 assert.equal(frame.status,1);assert.equal(frame.entries.length,0);assert.ok(meta.subarray(1024).every(byte=>byte===0));
});
test('a UTF-8 text preview reports accurate length and always closes its read handle',async()=>{
 const bytes=Buffer.from('你好，Switch 2！\nHello\tworld.'),f=fixture({async openRead(){return {handle:23,size:bytes.length,write:false};},async read(){return bytes;}});
 const {frame,meta}=await f.run(2,'/save/file');
 assert.equal(frame.previewKind,1);assert.equal(frame.previewText,bytes.toString());assert.equal(frame.fileSize,bytes.length);assert.equal(frame.previewLength,bytes.length);assert.equal(meta.readBigUInt64LE(32),BigInt(bytes.length));assert.deepEqual(f.calls.at(-1),['close',23]);
});
test('binary files get hex preview including NUL, control and invalid UTF-8 bytes',async()=>{
 const bytes=Buffer.from([0x41,0,0xff,0x1b,0x42]),f=fixture({async openRead(){return {handle:2,size:5};},async read(){return bytes;}});
 const {frame}=await f.run(2,'/rom/bin');assert.equal(frame.previewKind,2);assert.equal(frame.previewText,null);assert.equal(frame.previewHex,'4100ff1b42');
});
test('explicit hex mode preserves all text bytes and reports mode 3',async()=>{
 const bytes=Buffer.from('a\n'.repeat(100)),f=fixture({async openRead(){return {handle:2,size:bytes.length};},async read(){return bytes;}});
 const {frame,meta}=await f.run(3,'/rom/text');assert.equal(frame.mode,3);assert.equal(frame.previewKind,2);assert.equal(frame.previewHex,bytes.toString('hex'));assert.equal(meta.readUInt32LE(8),3);
});
test('preview pages are 512 bytes and the last page is bounded by the file size',async()=>{
 const reads=[],f=fixture({async openRead(){return {handle:3,size:1029};},async read(file,offset,length){reads.push([offset,length]);return Buffer.alloc(length,65);}});
 const {frame}=await f.run(2,'/rom/data',0xffffffff);assert.equal(frame.page,2);assert.equal(frame.pageCount,3);assert.equal(frame.previewOffset,1024);assert.equal(frame.previewLength,5);assert.deepEqual(reads,[[1024,5]]);
});
test('empty files can be previewed without a zero-byte native read',async()=>{
 const f=fixture(),{frame}=await f.run(2,'/tmp/empty');assert.equal(frame.status,0);assert.equal(frame.previewLength,0);assert.equal(frame.pageCount,1);assert.equal(frame.previewKind,1);assert.equal(f.calls.some(c=>c[0]==='read'),false);assert.equal(f.calls.at(-1)[0],'close');
});
test('read failures and incomplete reads close handles and clear every directory row',async()=>{
 for(const fail of [async()=>{throw Error('read failed');},async()=>Buffer.alloc(3)]){
  const f=fixture({async openRead(){return {handle:77,size:10};},read:fail}),{frame,meta}=await f.run(2,'/rom/bad');
  assert.equal(frame.status,1);assert.equal(frame.entries.length,0);assert.equal(frame.previewLength,0);assert.deepEqual(f.calls.at(-1),['close',77]);assert.ok(meta.subarray(1024).every(byte=>byte===0));
 }
});
test('directory previews and unsafe sizes are rejected without mutating storage',async()=>{
 const d=fixture({async stat(){return {type:'dir',size:0};}}),{frame:directory}=await d.run(2,'/save');assert.equal(directory.status,1);assert.equal(d.calls.some(c=>c[0]==='openRead'),false);
 for(const size of [-1,Number.MAX_SAFE_INTEGER+1,512*0x100000000]){
  const f=fixture({async openRead(){return {handle:5,size};}}),{frame}=await f.run(2,'/rom/huge');assert.equal(frame.status,1);assert.deepEqual(f.calls.at(-1),['close',5]);
 }
});
test('UTF-8 page seams do not misclassify valid text but interior errors stay binary',()=>{
 const text=Buffer.from('好好');assert.equal(previewText(text.subarray(1),1,6),'好');assert.equal(previewText(text.subarray(0,5),0,6),'好');assert.equal(previewText(Buffer.from([65,0xff,66]),0,3),null);assert.equal(previewText(Buffer.from([65,0xff]),0,50),null);
});
test('renderer failures return a fresh error frame and a cleared atlas',async()=>{
 const browser=create({render:async()=>{throw Error('Renderer unavailable');}}),result=await browser.handle(request());
 assert.equal(result.payload.readUInt32LE(12),1);assert.equal(result.payload.readUInt32LE(28),0);assert.ok(result.writes[0].bytes.subarray(1024).every(byte=>byte===0));assert.ok(result.writes[1].bytes.every(byte=>byte===0));
});
