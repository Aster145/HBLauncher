'use strict';
// Execute the shipped compute SPIR-V on a desktop Vulkan device. These are
// input/state fixtures and assertions, not a JavaScript copy of the game rules.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const harness=process.env.HB_COMPUTE_CHECK||path.join(root,'tools/glslang/desktop-tests/game-compute-check.exe');
const shader=path.join(__dirname,'app.comp.spv');
const outDir=path.join(root,'runs','snake-check');fs.mkdirSync(outDir,{recursive:true});
const initial=path.join(outDir,'initial.bin'),inputFile=path.join(outDir,'inputs.bin'),output=path.join(outDir,'output.bin');
const BASE=1024+600000*4,OCC=BASE+32*4,BODY=OCC+600*4,EXT=0x7f0000;
const M={magic:0,status:1,head:2,tail:3,length:4,direction:5,queued:6,lock:7,food:8,score:9,best:10,credit:11,rng:12,connected:13,pauseReason:14};
const B={A:1,B:2,X:4,PLUS:1024,MINUS:2048,LEFT:4096,UP:8192,RIGHT:16384,DOWN:32768};
const read=(s,k)=>s.readUInt32LE(BASE+M[k]*4);
const write=(s,k,v)=>s.writeUInt32LE(v>>>0,BASE+M[k]*4);
const head=s=>s.readUInt32LE(BODY+read(s,'head')*4);
const occupied=(s,cell)=>s.readUInt32LE(OCC+cell*4)!==0;
let device='',dispatches=0;const results=[];
function frame(buttons=0,connected=true,x=0,y=0){
 const b=Buffer.alloc(64);b.writeUInt32LE(buttons,8);b.writeInt32LE(x,16);b.writeInt32LE(y,20);b.writeUInt32LE(connected?1:0,32);return b;
}
function step(state,frames=[frame()]){
 fs.writeFileSync(initial,state);fs.writeFileSync(inputFile,Buffer.concat(frames));
 const r=execFileSync(harness,[initial,output,shader,inputFile,String(frames.length)],{env:{...process.env,HB_FULL_OUTPUT:'1'},encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
 dispatches+=frames.length;assert.match(r,/"consoleExecuted":false/);
 const data=fs.readFileSync(output);assert.equal(data.length,8*1024*1024);return data;
}
function repeat(count,buttons=0,connected=true){return Array.from({length:count},()=>frame(buttons,connected));}
function fixture(base,cells,direction=0,food=500,credit=52){
 const s=Buffer.from(base);s.fill(0,OCC,BODY+600*4);
 cells.forEach((cell,i)=>{s.writeUInt32LE(cell,BODY+i*4);s.writeUInt32LE(1,OCC+cell*4);});
 for(const [key,value] of Object.entries({status:1,head:cells.length-1,tail:0,length:cells.length,direction,queued:direction,lock:0,food,credit,score:0,best:0,pauseReason:0}))write(s,key,value);
 s.writeUInt32LE(0,84);s.writeUInt32LE(0,1016);return s;
}
function test(name,fn){fn();results.push({name,passed:true});console.log(`PASS ${name}`);}

try{
 // First execution also proves that the local Vulkan loader and the actual
 // generated SPIR-V can initialize the app with its full-size state buffer.
 let blank=Buffer.alloc(8*1024*1024);blank.fill(0xa5,EXT);
 const ready=step(blank);
 test('initialization: ready, four connected cells, food outside body',()=>{
  assert.equal(read(ready,'magic'),0x534e4b31);assert.equal(read(ready,'status'),0);
  assert.equal(read(ready,'length'),4);assert.equal(head(ready),315);
  for(const cell of [312,313,314,315])assert.ok(occupied(ready,cell));
  assert.ok(read(ready,'food')<600);assert.ok(!occupied(ready,read(ready,'food')));
 });
 test('app leaves SDK extension and texture bytes unchanged',()=>{
  assert.ok(ready.subarray(EXT).equals(blank.subarray(EXT)));
  assert.ok(ready.subarray(1024,2*1024*1024).equals(blank.subarray(1024,2*1024*1024)));
 });
 const running=step(ready,[frame(B.A)]);write(running,'food',500);
 test('A starts without an immediate move',()=>{assert.equal(read(running,'status'),1);assert.equal(head(running),315);});
 test('eight moves in sixty dispatches at initial speed',()=>{
  const s=step(running,repeat(60));assert.equal(head(s),323);assert.equal(read(s,'length'),4);assert.equal(read(s,'credit'),0);
 });
 test('opposite direction is rejected',()=>{
  const s=step(running,repeat(8,B.LEFT));assert.equal(head(s),316);assert.equal(read(s,'direction'),0);
 });
 test('two rapid turns cannot reverse before the next move',()=>{
  const s=step(running,[frame(B.UP),frame(B.LEFT),...repeat(6)]);
  assert.equal(head(s),285);assert.equal(read(s,'direction'),3);assert.equal(read(s,'lock'),0);
 });
 test('left stick changes direction',()=>{
  const s=step(running,Array.from({length:8},()=>frame(0,true,0,-32767)));
  assert.equal(head(s),345);assert.equal(read(s,'direction'),1);
 });
 test('food grows the snake, increments score and never respawns on its body',()=>{
  const initial=Buffer.from(running);write(initial,'food',316);write(initial,'credit',52);
  const s=step(initial);assert.equal(head(s),316);assert.equal(read(s,'length'),5);
  assert.equal(read(s,'score'),10);assert.equal(read(s,'best'),10);assert.ok(occupied(s,312));
  assert.ok(!occupied(s,read(s,'food')));
 });
 test('speed increases every three foods and is capped at twenty',()=>{
  const fast=Buffer.from(running);write(fast,'score',30);
  let s=step(fast,repeat(7));assert.equal(head(s),316);assert.equal(read(s,'credit'),3);
  write(fast,'score',360);s=step(fast,repeat(3));assert.equal(head(s),316);assert.equal(read(s,'credit'),0);
  write(fast,'score',5000);s=step(fast,repeat(3));assert.equal(head(s),316);assert.equal(read(s,'credit'),0);
 });
 test('wall collision ends the game without moving body',()=>{
  const s=step(fixture(running,[326,327,328,329]));assert.equal(read(s,'status'),3);assert.equal(head(s),329);assert.equal(read(s,'length'),4);
 });
 test('collision with non-tail body ends the game',()=>{
  const s=step(fixture(running,[302,303,333,332,331,301,300,330]));
  assert.equal(read(s,'status'),3);assert.equal(head(s),330);
 });
 test('moving into the cell vacated by the tail is legal',()=>{
  const s=step(fixture(running,[300,301,331,330],3));assert.equal(read(s,'status'),1);assert.equal(head(s),300);
  assert.equal(read(s,'length'),4);assert.ok(occupied(s,300));assert.equal(read(s,'tail'),1);
 });
 test('body ring wraps safely at index 599',()=>{
  const f=fixture(running,[312,313,314,315]);f.fill(0,BODY,BODY+600*4);
  [312,313,314,315].forEach((cell,i)=>f.writeUInt32LE(cell,BODY+(596+i)*4));write(f,'tail',596);write(f,'head',599);
  const s=step(f);assert.equal(read(s,'head'),0);assert.equal(head(s),316);assert.equal(read(s,'tail'),597);
  assert.ok(!occupied(s,312));assert.ok(occupied(s,316));
 });
 test('Plus pauses, time does not advance, A resumes without catch-up',()=>{
  let s=step(running,[frame(B.PLUS)]);assert.equal(read(s,'status'),2);assert.equal(read(s,'pauseReason'),0);
  s=step(s,repeat(120));assert.equal(head(s),315);assert.equal(read(s,'credit'),0);
  s=step(s,[frame(B.A)]);assert.equal(read(s,'status'),1);assert.equal(head(s),315);assert.equal(read(s,'credit'),0);
  s=step(s,repeat(8));assert.equal(head(s),316);
 });
 test('X toggles pause and resume only on button edges',()=>{
  let s=step(running,repeat(5,B.X));assert.equal(read(s,'status'),2);
  s=step(s,[frame(),frame(B.X)]);assert.equal(read(s,'status'),1);
 });
 test('disconnect pauses and reconnect alone does not resume',()=>{
  let s=step(running,[frame(0,false)]);assert.equal(read(s,'status'),2);assert.equal(read(s,'pauseReason'),1);assert.equal(read(s,'connected'),0);
  s=step(s,repeat(30));assert.equal(read(s,'status'),2);assert.equal(read(s,'connected'),1);assert.equal(head(s),315);
  s=step(s,[frame(B.A)]);assert.equal(read(s,'status'),1);
 });
 test('secondary JoyDual buttons and stick work without the selected pad',()=>{
  const f=Buffer.from(running);f.fill(0,EXT);f.writeUInt32LE(0x48425344,EXT);f.writeUInt32LE(1,EXT+4);f.writeUInt32LE(64,EXT+12);
  const source=EXT+640+2*64;f.writeUInt32LE(1,source+32);f.writeUInt32LE(B.UP,source+8);
  let s=step(f,repeat(8,0,false));assert.equal(read(s,'status'),1);assert.equal(read(s,'connected'),1);assert.equal(head(s),285);
  f.writeUInt32LE(0,source+8);f.writeInt32LE(-32767,source+20);
  s=step(f,repeat(8,0,false));assert.equal(head(s),345);
  f.writeUInt32LE(0,source+32);s=step(f,[frame(0,false)]);assert.equal(read(s,'status'),2);
 });
 test('B and Minus request return to the launcher',()=>{
  for(const button of [B.B,B.MINUS]){const s=step(running,[frame(button)]);assert.equal(s.readUInt32LE(1016),1);assert.equal(head(s),315);}
 });
 test('A restarts after death and preserves the session best',()=>{
  const f=fixture(running,[326,327,328,329]);write(f,'score',70);write(f,'best',90);
  let s=step(f);assert.equal(read(s,'status'),3);s=step(s,[frame(B.A)]);
  assert.equal(read(s,'status'),1);assert.equal(read(s,'length'),4);assert.equal(read(s,'score'),0);assert.equal(read(s,'best'),90);assert.equal(head(s),315);
 });
 test('last empty cell yields a full-board win with no food-placement loop',()=>{
  // A valid Hamiltonian cycle, minus cell 0, provides a reachable 599-cell
  // snake whose head at cell 1 can eat its last food by moving left.
  const cycle=[0];for(let y=1;y<20;y++)cycle.push(y*30);
  for(let x=1;x<30;x++)if(x%2)for(let y=19;y>=1;y--)cycle.push(y*30+x);else for(let y=1;y<20;y++)cycle.push(y*30+x);
  for(let x=29;x>=1;x--)cycle.push(x);
  assert.equal(cycle.length,600);assert.equal(new Set(cycle).size,600);
  const f=fixture(running,cycle.slice(1),2,0,40);write(f,'score',5950);write(f,'best',5950);
  const s=step(f);assert.equal(read(s,'status'),4);assert.equal(read(s,'length'),600);assert.equal(read(s,'food'),600);assert.equal(head(s),0);
  assert.equal(read(s,'score'),5960);assert.equal(read(s,'best'),5960);
  for(let cell=0;cell<600;cell++)assert.ok(occupied(s,cell));
 });
 const report={passed:true,tests:results.length,dispatches,shader:path.relative(root,shader),harness:path.relative(root,harness),execution:'actual SPIR-V on desktop Vulkan; not a console test',results};
 fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`${results.length}/${results.length} actual GPU tests passed (${dispatches} dispatches).`);
}catch(error){
 fs.writeFileSync(path.join(outDir,'result.json'),JSON.stringify({passed:false,completed:results,error:error.stack},null,2)+'\n');
 console.error(error);process.exitCode=1;
}
