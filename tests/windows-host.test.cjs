// Local-only coverage: no console, keyboard, serial, OBS or native RPC calls.
const test=require('node:test'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net'),path=require('node:path'),fs=require('node:fs/promises');
const {hostOptions,connectCommand}=require('../smilebasic/connection.cjs');
const root=path.resolve(__dirname,'..'),launcher=path.join(root,'homebrew-launcher/start-launcher.cjs');

function child(args){
 const process=spawn(global.process.execPath,args,{cwd:root,stdio:['ignore','pipe','pipe','ipc']});
 let output='',error='';
 process.stdout.on('data',bytes=>output+=bytes);process.stderr.on('data',bytes=>error+=bytes);
 const closed=new Promise((resolve,reject)=>{process.once('error',reject);process.once('close',(code,signal)=>resolve({code,signal,output,error}));});
 async function until(pattern){
  const until=Date.now()+7000;
  while(!pattern.test(output+error)){
   if(process.exitCode!==null||process.signalCode!==null)throw Error('Child exited before expected output: '+output+error);
   if(Date.now()>until)throw Error('Timed out waiting for output: '+output+error);
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  return output+error;
 }
 return {process,closed,until};
}
function bind(port){
 const server=net.createServer(socket=>socket.destroy());
 return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
const close=server=>new Promise(resolve=>server.close(resolve));
async function removeTestRun(output){
 const match=output.match(/Run folder: ([^\r\n]+)/);if(!match)return;
 const directory=path.resolve(match[1]);
 assert.equal(path.dirname(directory),path.join(root,'runs'));
 assert.match(path.basename(directory),/^launcher-/);
 const command=output.match(/^V=START\([0-9,]+\)$/m);assert.ok(command);
 const connectFile=path.join(directory,'connect.txt');
 assert.equal(await fs.readFile(connectFile,'utf8'),command[0]+'\n');
 // Remove only the verified command file from this test's run. Never recursively remove.
 await fs.unlink(connectFile);
 await fs.rmdir(directory);
}

test('manual option accepts either position and retains the default Pico mode',()=>{
 assert.deepEqual(hostOptions(['192.168.1.18']),{manual:false,args:['192.168.1.18']});
 assert.deepEqual(hostOptions(['--manual','192.168.1.18']),{manual:true,args:['192.168.1.18']});
 assert.deepEqual(hostOptions(['192.168.1.18','--manual']),{manual:true,args:['192.168.1.18']});
 assert.throws(()=>hostOptions(['--manual','--manual']),/only once/);
 assert.equal(connectCommand('127.0.0.1',[1,2,3,4]),'V=START(39380,127,0,0,1,1,2,3,4)');
});

test('IPC invokes a child cleanup handler and permits natural completion',{timeout:10000},async t=>{
 const worker=child(['--require',launcher,'-e',`
  const timer=setInterval(()=>{},1000);
  process.once('SIGTERM',()=>setTimeout(()=>{console.log('CLEANED');clearInterval(timer);},50));
  console.log('READY');
 `]);
 t.after(()=>{if(worker.process.exitCode===null)worker.process.kill('SIGKILL');});
 await worker.until(/READY/);worker.process.send({type:'hblauncher-stop'});
 const result=await worker.closed;assert.equal(result.code,0);assert.match(result.output,/CLEANED/);
});

test('preloaded finite child exits without waiting for the IPC channel',{timeout:10000},async t=>{
 const worker=child(['--require',launcher,'-e','console.log("DONE")']);
 t.after(()=>{if(worker.process.exitCode===null)worker.process.kill('SIGKILL');});
 const result=await worker.closed;assert.equal(result.code,0);assert.match(result.output,/DONE/);
});

test('launcher still reports invalid startup arguments as failure',{timeout:10000},async t=>{
 const worker=child([launcher,'--manual','invalid-address']);
 t.after(()=>{if(worker.process.exitCode===null)worker.process.kill('SIGKILL');});
 const result=await worker.closed;assert.equal(result.code,1);assert.match(result.error,/Usage:/);
});

test('start forwards detached child stderr and retains it in the stage failure',{timeout:10000},async t=>{
 const source=`
  const {start}=require(${JSON.stringify(launcher)});
  start('-e',['console.error("STAGE_DIAGNOSTIC");process.exitCode=7;']).done
   .catch(error=>console.log('CAPTURED_FAILURE:'+JSON.stringify(error.message)));
 `;
 const worker=child(['-e',source]);
 t.after(()=>{if(worker.process.exitCode===null)worker.process.kill('SIGKILL');});
 const result=await worker.closed;assert.equal(result.code,0);
 assert.match(result.error,/STAGE_DIAGNOSTIC/);
 assert.match(result.output,/CAPTURED_FAILURE:"-e exited: 7\\nSTAGE_DIAGNOSTIC"/);
});

test('manual launcher listens only on the local graphics port and stops its waiting child',{timeout:15000},async t=>{
 // Reserving the Pico port makes any accidental Pico startup fail immediately.
 const picoPort=await bind(39381);t.after(()=>close(picoPort));
 const worker=child([launcher,'--manual','127.0.0.1']);
 t.after(()=>{if(worker.process.exitCode===null)worker.process.send({type:'hblauncher-stop'});});
 const output=await worker.until(/Run folder:/);
 const command=output.match(/^V=START\(([0-9,]+)\)$/m);assert.ok(command);
 const run=output.match(/Run folder: ([^\r\n]+)/);assert.ok(run);
 assert.equal(await fs.readFile(path.join(run[1],'connect.txt'),'utf8'),command[0]+'\n');
 const words=command[1].split(',').map(Number);assert.deepEqual(words.slice(0,5),[39380,127,0,0,1]);
 assert.equal(words.length,9);assert.ok(words.slice(5).every(value=>Number.isSafeInteger(value)&&value>=0&&value<2**48));
 assert.match(output,/Manual \/ external keyboard mode/);
 assert.match(output,/LOAD "TXT:NS2"[\r\n]+RUN[\r\n]+REMOVE NSR,&H60000000,&H3FFFFFFF/);
 // Reject an invalid local greeting without reaching qualification/native calls.
 const socket=net.createConnection({host:'127.0.0.1',port:39380});
 socket.on('error',()=>{});socket.on('connect',()=>socket.write(Buffer.alloc(128)));
 t.after(()=>socket.destroy());
 await worker.until(/Wrong launcher protocol or console type/);
 worker.process.send({type:'hblauncher-stop'});
 const result=await worker.closed;assert.equal(result.code,0);assert.doesNotMatch(result.output,/Qualified native session/);
 const released=await bind(39380);await close(released);
 await removeTestRun(result.output);
});
