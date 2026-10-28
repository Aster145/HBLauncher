const fs=require('node:fs/promises'),path=require('node:path');
const {existsSync}=require('node:fs'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function localTool(name,relative,fallback){
 if(!process.env[name]){const candidate=path.join(root,relative);process.env[name]=existsSync(candidate)?candidate:fallback;}
}
async function main(){
 localTool('PYTHON','tools/python-env/Scripts/python.exe','python3');
 localTool('GLSLANG','tools/glslang/mingw64/bin/glslangValidator.exe','glslangValidator');
 localTool('SPIRV_VAL','tools/spirv-tools/mingw64/bin/spirv-val.exe','spirv-val');
 process.env.PYTHONUTF8='1';
 await fs.mkdir(path.join(__dirname,'assets'),{recursive:true});
 const state=Buffer.alloc(1024);state.writeFloatLE(1,960);
 await fs.writeFile(path.join(__dirname,'assets/state.bin'),state);
 execFileSync(process.env.PYTHON,[path.join(__dirname,'assets.py')],{stdio:'inherit'});
 await require('../../sdk/build.cjs').buildApp(__dirname);
 console.log('Files built. Requires this local host version with the files-read adapter.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
