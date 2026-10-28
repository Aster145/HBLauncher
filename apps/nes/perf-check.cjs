'use strict';
// Compare the same saved NES state and input on the same desktop GPU.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {tool}=require('./build.cjs');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'runs/nes-perf');
const harness=tool('HB_COMPUTE_CHECK','tools/glslang/desktop-tests/game-compute-check.exe','game-compute-check');
function main(){
const args=process.argv.slice(2);
if(args.length<2||args.length>3)throw Error('Usage: node apps/nes/perf-check.cjs <baseline.comp.spv> <initial-state.bin> [optimized.comp.spv]. Supply your own baseline shader and 8 MiB state; historical ROM-containing fixtures are not included.');
const baseline=path.resolve(args[0]),initial=path.resolve(args[1]),optimized=args[2]?path.resolve(args[2]):path.join(__dirname,'app.comp.spv');
for(const file of [baseline,initial,optimized])if(!fs.existsSync(file))throw Error(`Required benchmark input not found: ${file}`);
if(fs.statSync(initial).size!==8*1024*1024)throw Error('Initial benchmark state must be exactly 8 MiB (a full game-compute-check state).');
fs.mkdirSync(dir,{recursive:true});
const frames=300,input=Buffer.alloc(frames*64);
for(let i=0;i<frames;i++)input.writeUInt32LE(1,i*64+32);
fs.writeFileSync(path.join(dir,'inputs.bin'),input);
const results={desktopVulkan:true,consoleBenchmark:false,frames};
for(const [label,shader] of [['baseline',baseline],['optimized',optimized]]){
 const output=execFileSync(harness,[initial,path.join(dir,label+'-out.bin'),shader,path.join(dir,'inputs.bin'),String(frames)],{
  env:{...process.env,HB_FULL_OUTPUT:'1'},encoding:'utf8',stdio:['ignore','pipe','inherit'],windowsHide:true,timeout:180000
 });
 results[label]=JSON.parse(output.trim());
 console.log(label,JSON.stringify(results[label]));
}
assert.ok(fs.readFileSync(path.join(dir,'baseline-out.bin')).equals(fs.readFileSync(path.join(dir,'optimized-out.bin'))),'Emulated state differs after optimization');
results.identicalState=true;
results.computeSpeedup=results.baseline.seconds/results.optimized.seconds;
fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
