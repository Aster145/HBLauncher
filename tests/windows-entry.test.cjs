// Exercise the real batch entries in a disposable project with inert stage
// scripts. No listeners, keyboard input, console RPC or device calls are made.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),windows=process.platform==='win32';
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hb-windows-entry-'));
 t.after(()=>{
  assert.equal(path.dirname(directory),os.tmpdir());
  assert.match(path.basename(directory),/^hb-windows-entry-/);
  fs.rmSync(directory,{recursive:true,force:true});
 });
 for(const name of ['windows-env.cmd','Start-Windows.cmd','Check-Windows.cmd'])
  fs.copyFileSync(path.join(root,name),path.join(directory,name));
 for(const name of ['scripts','smilebasic','homebrew-launcher'])fs.mkdirSync(path.join(directory,name));
 fs.copyFileSync(path.join(root,'smilebasic/connection.cjs'),path.join(directory,'smilebasic/connection.cjs'));
 const stage=`const fs=require('node:fs'),path=require('node:path');
 const file=path.relative(process.cwd(),__filename).replaceAll('\\\\','/');
 const env=Object.fromEntries(['NODE','PYTHON','HB_FONT','GLSLANG','SPIRV_VAL','HB_PC_IP'].map(k=>[k,process.env[k]||'']));
 fs.appendFileSync('calls.jsonl',JSON.stringify({file,args:process.argv.slice(2),env})+'\\n');
 process.exitCode=process.env.HB_TEST_FAIL===file?9:0;`;
 for(const name of ['scripts/doctor.cjs','scripts/check-windows.cjs','homebrew-launcher/start-launcher.cjs'])
  fs.writeFileSync(path.join(directory,name),stage);
 const env={...process.env};
 for(const key of ['NODE','PYTHON','HB_FONT','GLSLANG','SPIRV_VAL','HB_PC_IP','HB_TEST_FAIL','NODE_OPTIONS'])delete env[key];
 env.NODE=process.execPath;
 function run(entry,args=[],overrides={},input=''){
  const result=spawnSync(process.env.ComSpec||'cmd.exe',['/d','/c',entry,...args],{
   cwd:directory,env:{...env,...overrides},input,encoding:'utf8',timeout:15000,windowsHide:true
  });
  assert.ifError(result.error);
  const log=path.join(directory,'calls.jsonl');
  const calls=fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse):[];
  if(fs.existsSync(log))fs.unlinkSync(log);
  return {...result,calls};
 }
 return {directory,run};
}
test('Windows preflight uses PATH fallbacks and never starts a host',{skip:!windows},t=>{
 const f=fixture(t),r=f.run('Check-Windows.cmd',['--no-pause']);
 assert.equal(r.status,0,r.stdout+r.stderr);
 assert.deepEqual(r.calls.map(c=>c.file),['scripts/doctor.cjs','scripts/check-windows.cjs']);
 assert.deepEqual(r.calls[0].args,['--host-only']);
 assert.equal(r.calls[0].env.PYTHON,'python');
 assert.equal(r.calls[0].env.GLSLANG,'glslangValidator');
 assert.equal(r.calls[0].env.SPIRV_VAL,'spirv-val');
 assert.equal(r.calls[0].env.HB_PC_IP,'');
});
test('Windows entries preserve explicit tool paths and environment IP',{skip:!windows},t=>{
 const f=fixture(t),overrides={PYTHON:'C:\\Custom tools\\python.exe',HB_FONT:'C:\\Fonts\\user!.ttf',GLSLANG:'custom-glslang',SPIRV_VAL:'custom-val',HB_PC_IP:'192.0.2.20'};
 const r=f.run('Start-Windows.cmd',[],overrides);
 assert.equal(r.status,0,r.stdout+r.stderr);
 for(const [key,value] of Object.entries(overrides))assert.equal(r.calls[0].env[key],value);
 assert.deepEqual(r.calls.at(-1).args,['--manual','192.0.2.20']);
});
test('Windows start selects command-line IP before environment and prompts otherwise',{skip:!windows},t=>{
 const f=fixture(t);
 const explicit=f.run('Start-Windows.cmd',['192.0.2.30'],{HB_PC_IP:'192.0.2.20'});
 assert.equal(explicit.status,0,explicit.stdout+explicit.stderr);
 assert.deepEqual(explicit.calls.at(-1).args,['--manual','192.0.2.30']);
 const prompt=f.run('Start-Windows.cmd',[],{},'192.0.2.40\r\n');
 assert.equal(prompt.status,0,prompt.stdout+prompt.stderr);
 assert.match(prompt.stdout,/Enter this computer/);
 assert.deepEqual(prompt.calls.at(-1).args,['--manual','192.0.2.40']);
});
test('Windows start rejects invalid or absent IPv4 before preflight or host startup',{skip:!windows},t=>{
 const f=fixture(t);
 for(const args of [['invalid-address'],['999.1.1.1'],[]]){
  const r=f.run('Start-Windows.cmd',args);
  assert.equal(r.status,1,r.stdout+r.stderr);
  assert.deepEqual(r.calls,[]);
 }
});
test('Windows local tool selection requires existing files',{skip:!windows},t=>{
 const f=fixture(t),files={PYTHON:'tools/python-env/Scripts/python.exe',HB_FONT:'tools/fonts/DejaVuSans.ttf',GLSLANG:'tools/glslang/mingw64/bin/glslangValidator.exe',SPIRV_VAL:'tools/spirv-tools/mingw64/bin/spirv-val.exe'};
 for(const file of Object.values(files)){
  const full=path.join(f.directory,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,'');
 }
 const r=f.run('Check-Windows.cmd',['--no-pause']);
 assert.equal(r.status,0,r.stdout+r.stderr);
 for(const [key,file] of Object.entries(files))assert.equal(r.calls[0].env[key],path.join(f.directory,file));
});
test('Windows start stops when either local preflight stage fails',{skip:!windows},t=>{
 const f=fixture(t);
 for(const [file,count] of [['scripts/doctor.cjs',1],['scripts/check-windows.cjs',2]]){
  const r=f.run('Start-Windows.cmd',['192.0.2.30'],{HB_TEST_FAIL:file});
  assert.equal(r.status,1,r.stdout+r.stderr);
  assert.equal(r.calls.length,count);
  assert.ok(r.calls.every(c=>c.file!=='homebrew-launcher/start-launcher.cjs'));
 }
});
