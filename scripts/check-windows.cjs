// Offline preflight: package validation and the actual runtime catalog renderer.
// No network, serial, console RPC, or native device operations.
const fs=require('node:fs/promises'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {tool}=require('./toolchain.cjs');
const catalogTools=require('../homebrew-launcher/app-catalog.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
 for(const stage of ['vert','frag','comp']){
  execFileSync(tool('SPIRV_VAL','spirv-val'),['--target-env','vulkan1.0',path.join(root,'homebrew-launcher/shaders/launcher.'+stage+'.spv')],{stdio:'pipe'});
 }
 const catalog=await catalogTools.scan();
 if(catalog.rejected.length)throw Error(JSON.stringify(catalog.rejected,null,2));
 for(const id of ['hello-world'])if(!catalog.apps.some(app=>app.id===id))throw Error('Missing required app: '+id);
 const directory=path.join(root,'runs','host-check');
 await fs.mkdir(directory,{recursive:true});
 const bytes=await catalogTools.raster(catalog,directory);
 if(!bytes.some(value=>value!==0))throw Error('Catalog is empty');
 const report={checkedAt:new Date().toISOString(),hostOnly:true,consoleTested:false,node:process.version,
  apps:catalog.apps.map(app=>({id:app.id,version:app.version})),catalogBytes:bytes.length,
  launcherShadersValidated:3,rejected:catalog.rejected};
 await fs.writeFile(path.join(directory,'result.json'),JSON.stringify(report,null,2));
 console.log('OK   Launcher shaders, app shaders, icons and catalog raster');
 console.log('OK   Apps: '+report.apps.map(app=>app.id+' '+app.version).join(', '));
 console.log('Host preparation passed. Console launch and FTP are not tested by this check.');
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
