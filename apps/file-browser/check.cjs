'use strict';
// Dispatch the app's real SPIR-V on desktop Vulkan. Fake host acknowledgements
// below are fixtures only; navigation logic is never mirrored in JavaScript.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {metadata,protocol:P}=require('../../sdk/host/file-browser.cjs');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'runs/file-browser-check');
const harness=process.env.HB_COMPUTE_CHECK||path.join(root,'tools/glslang/desktop-tests/game-compute-check.exe');
const shader=path.join(__dirname,'app.comp.spv');fs.mkdirSync(dir,{recursive:true});
const EXT=0x7f0000,C=P.controlOffset,M=P.metadata.offset,Q=EXT+2048,R=EXT+4096;
const B={A:1,B:2,X:4,Y:8,L:64,R:128,MINUS:2048,LEFT:4096,UP:8192,RIGHT:16384,DOWN:32768};
const K={magic:0,selection:1,pending:2,started:3,nav:4,repeat:5,mode:6,returnPage:7,returnSelection:8,page:9,haveMeta:10,waiting:11,error:12,ack:13,waitFrames:14,connected:15};
const word=(s,k)=>s.readUInt32LE(C+K[k]*4),set=(s,k,n)=>s.writeUInt32LE(n>>>0,C+K[k]*4);
let dispatches=0;const results=[];
function input(buttons=0,connected=true,x=0,y=0){const b=Buffer.alloc(64);b.writeUInt32LE(buttons,8);b.writeInt32LE(x,16);b.writeInt32LE(y,20);b.writeUInt32LE(connected?1:0,32);return b;}
function inputs(count,buttons=0){return Array.from({length:count},()=>input(buttons));}
function step(state,frames=[input()]){
 const initial=path.join(dir,'initial.bin'),events=path.join(dir,'inputs.bin'),output=path.join(dir,'output.bin');
 fs.writeFileSync(initial,state);fs.writeFileSync(events,Buffer.concat(frames));
 const report=execFileSync(harness,[initial,output,shader,events,String(frames.length)],{env:{...process.env,HB_FULL_OUTPUT:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
 assert.match(report,/"consoleExecuted":false/);dispatches+=frames.length;
 const out=fs.readFileSync(output);assert.equal(out.length,8*1024*1024);return out;
}
function sdk(s){s.writeUInt32LE(0x48425344,EXT);s.writeUInt32LE(1,EXT+4);return s;}
function req(s){return {sequence:s.readUInt32LE(Q),op:s.readUInt32LE(Q+4),mode:s.readUInt32LE(Q+8),page:s.readUInt32LE(Q+12),length:s.readUInt32LE(Q+16),path:s.subarray(Q+32,Q+32+s.readUInt32LE(Q+16)).toString('utf8')};}
function entry(name,type='file',size=1,actionable=true){return {name,type,size,actionable};}
function hostFrame(fields={}){return {mode:1,status:0,path:'/',page:0,pageCount:1,totalEntries:3,entries:[entry('rom','dir',0),entry('save','dir',0),entry('tmp','dir',0)],fileSize:0,previewOffset:0,previewLength:0,previewKind:0,error:'',...fields};}
function acknowledge(s,fields={},frames=[input()],result=0){
 const f=Buffer.from(s),query=req(f),meta=metadata(hostFrame({mode:query.mode,path:query.path,page:query.page,...fields}));
 meta.copy(f,M);f.writeUInt32LE(query.sequence,R);f.writeUInt32LE(result,R+4);return step(f,frames);
}
function ready(fields={},selection=0){
 const f=Buffer.from(rootRequest),frame=hostFrame(fields),bytes=Buffer.from(frame.path);
 f.fill(0,Q+32,Q+32+1024);bytes.copy(f,Q+32);f.writeUInt32LE(bytes.length,Q+16);
 f.writeUInt32LE(frame.mode,Q+8);f.writeUInt32LE(frame.page,Q+12);set(f,'mode',frame.mode);set(f,'page',frame.page);set(f,'selection',selection);
 return acknowledge(f,frame);
}
function press(s,button){return step(s,[input(),input(button)]);}
function test(name,fn){fn();results.push({name,passed:true});console.log('PASS '+name);}
let rootRequest;
try{
 const blank=Buffer.alloc(8*1024*1024);blank.fill(0x5a,1024,0x200000);blank.fill(0x73,0x300000,0x500000);
 const waiting=step(blank);
 test('initial state waits for SDK without issuing a request',()=>{assert.equal(word(waiting,'magic'),0x46424331);assert.equal(word(waiting,'waiting'),1);assert.equal(waiting.readUInt32LE(Q),0);});
 test('Minus exits even without an SDK or a working host',()=>{assert.equal(step(waiting,[input(B.MINUS)]).readUInt32LE(1016),1);});
 rootRequest=step(sdk(Buffer.from(waiting)));
 test('first compatible frame requests only virtual root with exact payload length',()=>{assert.deepEqual(req(rootRequest),{sequence:1,op:5,mode:1,page:0,length:1,path:'/'});assert.equal(word(rootRequest,'pending'),1);assert.equal(word(rootRequest,'haveMeta'),0);});
 const rootReady=acknowledge(rootRequest);
 test('initial fade reaches zero and clocks advance while SDK is waiting or active',()=>{
  for(const base of [waiting,rootReady]){
   const f=Buffer.from(base);f.writeFloatLE(1,960);f.writeFloatLE(0,64);f.writeUInt32LE(0,88);
   const s=step(f,inputs(16));assert.equal(s.readFloatLE(960),0);assert.equal(s.readUInt32LE(88),16);assert.ok(Math.abs(s.readFloatLE(64)-16/60)<0.00001);
  }
 });
 test('matching host acknowledgement enables root entries',()=>{assert.equal(word(rootReady,'pending'),0);assert.equal(word(rootReady,'haveMeta'),1);assert.equal(word(rootReady,'error'),0);assert.equal(word(rootReady,'selection'),0);});
 test('compute never writes metadata or either text atlas',()=>{const after=step(rootReady,[input(B.DOWN)]);assert.ok(after.subarray(M,M+P.metadata.bytes).equals(rootReady.subarray(M,M+P.metadata.bytes)));assert.ok(after.subarray(1024,0x200000).equals(rootReady.subarray(1024,0x200000)));assert.ok(after.subarray(0x300000,0x500000).equals(rootReady.subarray(0x300000,0x500000)));});
 test('pending requests ignore A/B/X/Y/navigation, while Minus still exits',()=>{
  const s=step(rootRequest,[input(B.A),input(B.B),input(B.X),input(B.Y),input(B.R),input(B.DOWN)]);assert.deepEqual(req(s),req(rootRequest));assert.equal(word(s,'selection'),0);
  assert.equal(step(s,[input(B.MINUS)]).readUInt32LE(1016),1);
 });
 test('request waiting indicator appears after five seconds without blind retry',()=>{const s=step(rootRequest,inputs(300));assert.equal(word(s,'waiting'),2);assert.deepEqual(req(s),req(rootRequest));});
 test('buttons held during acknowledgement do not open newly received rows',()=>{const s=acknowledge(rootRequest,{},[input(B.A),input(B.A)]);assert.equal(word(s,'pending'),0);assert.equal(req(s).sequence,1);});
 test('down/up select only valid rows and clamp at both ends',()=>{let s=step(rootReady,inputs(60,B.DOWN));assert.equal(word(s,'selection'),2);s=step(s,inputs(60,B.UP));assert.equal(word(s,'selection'),0);});
 const many=ready({path:'/rom',page:1,pageCount:4,totalEntries:40,entries:Array.from({length:12},(_,i)=>entry('file'+i))});
 test('held navigation repeats after 24 frames, then every 6 frames',()=>{let s=step(many,inputs(24,B.DOWN));assert.equal(word(s,'selection'),1);s=step(s,[input(B.DOWN)]);assert.equal(word(s,'selection'),2);s=step(s,inputs(6,B.DOWN));assert.equal(word(s,'selection'),3);});
 test('opposite directions cancel and left stick selects rows',()=>{let s=step(rootReady,[input(B.UP|B.DOWN)]);assert.equal(word(s,'selection'),0);s=step(s,[input(0,true,0,-32767)]);assert.equal(word(s,'selection'),1);});
 test('secondary pad works when selected primary pad is disconnected',()=>{const f=Buffer.from(rootReady),source=EXT+640+2*64;f.writeUInt32LE(64,EXT+12);f.writeUInt32LE(1,source+32);f.writeInt32LE(-32767,source+20);const s=step(f,[input(0,false)]);assert.equal(word(s,'connected'),1);assert.equal(word(s,'selection'),1);});
 test('A enters a root directory without a double slash',()=>{const s=press(rootReady,B.A);assert.equal(req(s).path,'/rom');assert.equal(req(s).mode,1);assert.equal(req(s).page,0);});
 test('UTF-8 child names are copied byte-for-byte',()=>{const name='中文文件.bas',f=ready({path:'/save',totalEntries:1,entries:[entry(name)]}),s=press(f,B.A);assert.equal(req(s).path,'/save/'+name);assert.equal(req(s).length,Buffer.byteLength('/save/'+name));assert.equal(req(s).mode,2);});
 test('files open in auto preview and B restores directory page and selection',()=>{let f=Buffer.from(many);set(f,'selection',7);let s=press(f,B.A);assert.equal(req(s).path,'/rom/file7');assert.equal(req(s).mode,2);assert.equal(word(s,'returnPage'),1);assert.equal(word(s,'returnSelection'),7);s=acknowledge(s,{entries:[],totalEntries:0,fileSize:1400,pageCount:3,previewLength:512,previewKind:1});s=press(s,B.B);assert.equal(req(s).path,'/rom');assert.equal(req(s).page,1);assert.equal(word(s,'selection'),7);s=acknowledge(s,{pageCount:4,totalEntries:40,entries:Array.from({length:12},(_,i)=>entry('file'+i))});assert.equal(word(s,'selection'),7);});
 test('B moves directory parent and keeps root within namespace',()=>{let s=press(ready({path:'/rom/folder'}),B.B);assert.equal(req(s).path,'/rom');s=press(rootReady,B.B);assert.equal(req(s).path,'/');assert.equal(req(s).length,1);});
 test('L/R pages use current path and never underflow or overflow',()=>{const next=press(many,B.R);assert.equal(req(next).page,2);assert.equal(req(next).path,'/rom');assert.equal(word(next,'selection'),0);const prev=press(many,B.L);assert.equal(req(prev).page,0);assert.equal(req(press(rootReady,B.L)).sequence,req(rootReady).sequence);assert.equal(req(press(rootReady,B.R)).sequence,req(rootReady).sequence);});
 test('Y toggles preview representation preserving offset page',()=>{const preview=ready({mode:2,path:'/rom/data',page:2,pageCount:4,entries:[],totalEntries:0,fileSize:1800,previewKind:1});let s=press(preview,B.Y);assert.equal(req(s).mode,3);assert.equal(req(s).page,2);s=acknowledge(s,{pageCount:4,entries:[],totalEntries:0,fileSize:1800,previewKind:2});s=press(s,B.Y);assert.equal(req(s).mode,2);assert.equal(req(s).page,2);});
 test('refresh repeats current path/mode/page without changing selection',()=>{const f=Buffer.from(many);set(f,'selection',6);const s=press(f,B.X);assert.equal(req(s).page,1);assert.equal(req(s).path,'/rom');assert.equal(req(s).mode,1);assert.equal(word(s,'selection'),6);});
 test('empty directories ignore A and navigation but still allow B',()=>{const empty=ready({path:'/tmp',entries:[],totalEntries:0});let s=step(empty,[input(B.A),input(B.DOWN)]);assert.equal(req(s).sequence,req(empty).sequence);assert.equal(word(s,'selection'),0);s=press(s,B.B);assert.equal(req(s).path,'/');});
 test('error response disables every stale row while B and X remain available',()=>{const failed=ready({path:'/rom/bad',status:1,entries:[],totalEntries:0,error:'Read failed'});let s=press(failed,B.A);assert.equal(req(s).sequence,req(failed).sequence);s=press(failed,B.X);assert.equal(req(s).path,'/rom/bad');s=press(failed,B.B);assert.equal(req(s).path,'/rom');});
 test('unsupported SDK operation cannot expose stale metadata as a ready listing',()=>{const s=acknowledge(rootRequest,{},[input()],1);assert.equal(word(s,'error'),3);assert.equal(word(s,'haveMeta'),0);assert.equal(req(press(s,B.A)).sequence,1);assert.equal(req(press(s,B.X)).sequence,2);});
 test('wrong metadata path is rejected even if SDK sequence matches',()=>{const f=Buffer.from(rootRequest);metadata(hostFrame({path:'/save'})).copy(f,M);f.writeUInt32LE(1,R);const s=step(f);assert.equal(word(s,'error'),2);assert.equal(word(s,'haveMeta'),0);});
 test('too-long child paths never issue a truncated request',()=>{const f=ready({path:'/rom',entries:[entry('x'.repeat(736),'file',1,false)],totalEntries:1}),s=press(f,B.A);assert.equal(req(s).sequence,req(f).sequence);assert.equal(word(s,'error'),4);assert.equal(req(s).path,'/rom');});
 test('request sequence wraps from uint32 maximum to nonzero one',()=>{const f=Buffer.from(rootReady);f.writeUInt32LE(0xffffffff,Q);f.writeUInt32LE(0xffffffff,R);const s=press(f,B.X);assert.equal(req(s).sequence,1);assert.equal(word(s,'pending'),1);});
 const report={passed:true,tests:results.length,dispatches,execution:'actual SPIR-V on desktop Vulkan; mocked host metadata; not a console test',results};
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`${results.length}/${results.length} actual GPU tests passed (${dispatches} dispatches).`);
}catch(error){fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({passed:false,completed:results,error:error.stack},null,2)+'\n');console.error(error);process.exitCode=1;}
