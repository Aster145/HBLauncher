'use strict';
// Execute the same compiled shaders shipped to HBLauncher. No console access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {C}=require('./rom.cjs');
const {tool}=require('./build.cjs');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'runs/nes-check');fs.mkdirSync(out,{recursive:true});
const harness=tool('HB_COMPUTE_CHECK','tools/glslang/desktop-tests/game-compute-check.exe','game-compute-check');
const renderer=tool('HB_RENDER','tools/glslang/desktop-tests/game-render.exe','game-render');
const B={A:1,B:2,X:4,Y:8,L:64,R:128,PLUS:1024,MINUS:2048,LEFT:4096,UP:8192,RIGHT:16384,DOWN:32768};
let serial=0;
function input(buttons=0,connected=true,x=0,y=0){const b=Buffer.alloc(64);b.writeUInt32LE(buttons,8);b.writeInt32LE(x,16);b.writeInt32LE(y,20);b.writeUInt32LE(connected?1:0,32);return b;}
function initial(app=__dirname){const b=Buffer.alloc(8*1024*1024);fs.readFileSync(path.join(app,'assets/state.bin')).copy(b);fs.readFileSync(path.join(app,'assets/data.bin')).copy(b,1024);return b;}
function reg(b,i){return b.readUInt32LE(1024+(C.REG+i)*4);}
function ram(b,a){return b.readUInt32LE(1024+(C.RAM+(a&2047))*4);}
function summary(b){return {frame:reg(b,32),pc:reg(b,6).toString(16),fault:reg(b,11),badpc:reg(b,12).toString(16),cycles:reg(b,8),status:reg(b,18),mask:reg(b,17),v:reg(b,20).toString(16),t:reg(b,21).toString(16),mode:ram(b,0x770),modeTask:ram(b,0x772),engine:ram(b,14),playerX:ram(b,0x86),playerPage:ram(b,0x6d),playerY:ram(b,0xce),scrollX:ram(b,0x71c),world:ram(b,0x75f),level:ram(b,0x75c)};}
function step(state,frames,buttons=0,label='step'){
 const prefix=path.join(out,`${++serial}-${label}`),ins=prefix+'-inputs.bin',ini=prefix+'-in.bin',result=prefix+'-out.bin';
 fs.writeFileSync(ini,state);fs.writeFileSync(ins,Buffer.concat(Array.isArray(frames)?frames:Array.from({length:frames},()=>input(buttons))));
 const count=Array.isArray(frames)?frames.length:frames;
 const log=execFileSync(harness,[ini,result,path.join(__dirname,'app.comp.spv'),ins,String(count)],{env:{...process.env,HB_FULL_OUTPUT:'1'},encoding:'utf8',stdio:['ignore','pipe','inherit'],windowsHide:true,timeout:180000});
 const data=fs.readFileSync(result);const stateInfo=summary(data);console.log(label,log.trim(),JSON.stringify(stateInfo));
 assert.equal(data.length,8*1024*1024);assert.equal(reg(data,11),0,`Unsupported CPU opcode: ${JSON.stringify(stateInfo)}`);return data;
}
function render(state,name){
 const s=path.join(out,name+'-state.bin'),a=path.join(out,name+'-atlas.bin'),rgba=path.join(out,name+'.rgba');
 fs.writeFileSync(s,state.subarray(0,1024));fs.writeFileSync(a,state.subarray(1024,1024+1024*1024));
 execFileSync(renderer,[s,a,__dirname,rgba],{env:{...process.env,HB_SHADER_PREFIX:'app'},stdio:'inherit',windowsHide:true,timeout:60000});
 console.log('Preview RGBA:',rgba);return rgba;
}
function main(){
 for(const app of [__dirname,path.join(root,'apps/nes-2')]){
  for(const file of ['assets/state.bin','assets/data.bin','app.comp.spv','app.vert.spv','app.frag.spv']){
   if(!fs.existsSync(path.join(app,file)))throw Error('NES integration packages are missing. Build with two locally supplied Super Mario Bros. compatible NROM ROMs: node apps/nes/build.cjs <first.nes> <second.nes>. ROMs and generated packages are not included in this repository. CPU/PPU unit tests do not require ROMs.');
  }
 }
 const checks=[];const check=(name,fn)=>{fn();checks.push(name);console.log('PASS',name);};
 const startImage=initial();startImage.fill(0xa5,0x7f0000);
 let state=step(startImage,180,0,'title-1');render(state,'title-1');
 check('ROM 1 reaches its title without a CPU fault',()=>{assert.equal(ram(state,0x770),0);assert.equal(ram(state,0x772),3);assert.ok(reg(state,17)&8);});
 state=step(state,[input(B.PLUS),...Array.from({length:200},()=>input())],0,'world-1');render(state,'world-1');
 check('Start opens 1-1 in active play',()=>{assert.equal(ram(state,0x770),1);assert.equal(ram(state,0x772),3);assert.equal(ram(state,14),8);});
 const originalX=ram(state,0x6d)*256+ram(state,0x86),groundY=ram(state,0xce);
 state=step(state,20,B.RIGHT|B.B,'run-1');
 check('Right + B moves the player',()=>assert.ok(ram(state,0x6d)*256+ram(state,0x86)>originalX));
 state=step(state,18,B.RIGHT|B.B|B.A,'jump-1');render(state,'jump-1');
 check('A makes the player jump',()=>assert.ok(ram(state,0xce)<groundY));
 state=step(state,45,B.RIGHT|B.B,'scroll-1');render(state,'scroll-1');
 check('Movement advances the scrolling viewport',()=>assert.ok(ram(state,0x71c)>0||ram(state,0x71a)>0));
 fs.writeFileSync(path.join(out,'latest.bin'),state);const first=summary(state);
 const pause=step(state,[input(B.X),...Array.from({length:12},()=>input())],0,'pause');
 check('Pause freezes emulated CPU and frame counters',()=>{assert.equal(reg(pause,33),1);assert.equal(reg(pause,8),reg(state,8));assert.equal(reg(pause,32),reg(state,32));});
 const resume=step(pause,[input(B.X),input()],0,'resume');
 check('X resumes',()=>{assert.equal(reg(resume,33),0);assert.ok(reg(resume,32)>reg(pause,32));});
 const unplug=step(resume,[input(0,false),input()],0,'disconnect');
 check('Disconnect pauses until explicitly resumed',()=>{assert.equal(reg(unplug,33),1);assert.equal(reg(unplug,8),reg(resume,8));});
 const quit=step(state,[input(B.MINUS)],0,'exit');
 check('Minus requests launcher return without executing another NES frame',()=>{assert.equal(quit.readUInt32LE(1016),1);assert.equal(reg(quit,8),reg(state,8));});
 const reset=step(state,[input(B.R),...Array.from({length:179},()=>input())],0,'reset');
 check('R resets back to title',()=>{assert.equal(ram(reset,0x770),0);assert.equal(ram(reset,0x772),3);assert.equal(reg(reset,32),180);});
 check('ROM, UI and SDK extension remain unchanged',()=>{
  assert.ok(state.subarray(1024,1024+C.RAM*4).equals(startImage.subarray(1024,1024+C.RAM*4)));
  assert.ok(state.subarray(1024+C.UI*4,1024+1024*1024).equals(startImage.subarray(1024+C.UI*4,1024+1024*1024)));
  assert.ok(state.subarray(0x7f0000).equals(startImage.subarray(0x7f0000)));
 });
 let second=step(initial(path.join(root,'apps/nes-2')),180,0,'title-2');render(second,'title-2');
 second=step(second,[input(B.PLUS),...Array.from({length:200},()=>input())],0,'world-2');render(second,'world-2');
 check('ROM 2 also reaches 1-1',()=>{assert.equal(ram(second,0x770),1);assert.equal(ram(second,0x772),3);assert.equal(ram(second,14),8);});
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:true,desktopVulkan:true,consoleTested:false,checks,rom1:first,rom2:summary(second)},null,2)+'\n');
 console.log(`PASS ${checks.length} ROM integration checks`);
}
if(require.main===module)main();
module.exports={initial,reg,ram,step,render,input,B,summary,out};
