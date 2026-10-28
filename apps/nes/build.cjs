'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {parseRom,dataImage}=require('./rom.cjs');
const root=path.resolve(__dirname,'../..');
function tool(environment,relative,fallback){
 const local=path.join(root,relative);
 return process.env[environment]||(fs.existsSync(local)?local:fallback);
}
function setup(){
 process.env.PYTHON=tool('PYTHON','tools/python-env/Scripts/python.exe',process.platform==='win32'?'python':'python3');
 process.env.GLSLANG=tool('GLSLANG','tools/glslang/mingw64/bin/glslangValidator.exe','glslangValidator');
 process.env.SPIRV_VAL=tool('SPIRV_VAL','tools/spirv-tools/mingw64/bin/spirv-val.exe','spirv-val');process.env.PYTHONUTF8='1';
}
async function main(){
 const paths=process.argv.slice(2);if(paths.length<1||paths.length>2)throw Error('Usage: node apps/nes/build.cjs <first.nes> [second.nes]');
 // Validate every input before writing any package.
 const roms=paths.map(p=>({source:path.resolve(p),rom:parseRom(fs.readFileSync(p))}));
 setup();execFileSync(process.env.PYTHON,[path.join(__dirname,'assets.py')],{stdio:'inherit',windowsHide:true});
 await require('../../sdk/build.cjs').headers(path.join(__dirname,'shaders'));
 // Keep function calls in SPIR-V. -Os force-inlines the nested CPU bus/PPU
 // helpers at every call site and expands this interpreter beyond the
 // launcher's 1 MiB per-shader limit. The GPU driver performs final lowering.
 for(const stage of ['vert','frag','comp']){
  const output=path.join(__dirname,`app.${stage}.spv`);
  execFileSync(process.env.GLSLANG,['-V','-g0','--target-env','vulkan1.0',path.join(__dirname,`shaders/app.${stage}`),'-o',output],{stdio:'inherit',windowsHide:true});
  execFileSync(process.env.SPIRV_VAL,['--target-env','vulkan1.0',output],{stdio:'inherit',windowsHide:true});
  if(fs.statSync(output).size>1048576)throw Error(`${stage} exceeds HBLauncher shader size limit`);
 }
 const ui=fs.readFileSync(path.join(__dirname,'assets/ui.bin'));
 for(let i=0;i<roms.length;i++){
  const dest=i?path.join(root,'apps/nes-2'):__dirname;fs.mkdirSync(path.join(dest,'assets'),{recursive:true});
  if(i){for(const name of ['app.vert.spv','app.frag.spv','app.comp.spv','assets/icon.png'])fs.copyFileSync(path.join(__dirname,name),path.join(dest,name));}
  fs.writeFileSync(path.join(dest,'assets/state.bin'),Buffer.alloc(1024));
  fs.writeFileSync(path.join(dest,'assets/data.bin'),dataImage(roms[i].rom,ui));
  const manifest={format:'hblauncher.gpu-app',abi:1,id:i?'nes-2':'nes',name:`NES ${i+1} (Test)`,version:'0.1.0',description:`${path.basename(roms[i].source)} | A: jump, B: run, +: start, -: menu. No audio.`,icon:'assets/icon.png',initialState:'assets/state.bin',data:'assets/data.bin',shaders:{vertex:'app.vert.spv',fragment:'app.frag.spv',compute:'app.comp.spv'},transition:'none',sdk:{version:1,capabilities:[]}};
  fs.writeFileSync(path.join(dest,'app.json'),JSON.stringify(manifest,null,2)+'\n');
  const {prg,chr,...meta}=roms[i].rom;fs.writeFileSync(path.join(dest,'rom-info.json'),JSON.stringify({file:path.basename(roms[i].source),...meta},null,2)+'\n');
  console.log(`Prepared ${manifest.name}: ${path.basename(roms[i].source)}`);
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={setup,tool};
