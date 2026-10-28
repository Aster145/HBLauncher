// Start a fresh native session and restore the launcher when the console connects.
const {spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const children=new Set();
let stopping,stopRequested=false;
// Preload this file in child processes so Windows can request the existing
// SIGTERM cleanup handlers via IPC; child.kill('SIGTERM') forcibly terminates
// processes on Windows and would skip FTP save commits and audio cleanup.
function installShutdownChannel() {
 if(!process.send)return;
 const shutdown=()=>{if(!process.emit('SIGTERM'))process.exit(0);};
 process.on('message',message=>{if(message?.type==='hblauncher-stop')shutdown();});
 process.once('disconnect',shutdown);
 process.channel?.unref();
}
function start(script,args=[],readyText){
 // A separate hidden Windows process group keeps console Ctrl+C on the parent,
 // which can then shut down FTP/audio before stopping their RPC connection.
 const child=spawn(process.execPath,['--require',__filename,script,...args],{
  cwd:root,stdio:['ignore','pipe','pipe','ipc'],detached:process.platform==='win32',windowsHide:true
 });
 child.script=script;children.add(child);let output='',stderr='',readyResolve,readyReject;
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 // Some stages only need completion; keep unused readiness rejections handled.
 ready.catch(()=>{});
 child.stdout.on('data',bytes=>{
  process.stdout.write(bytes);output=(output+bytes).slice(-32768);
  if(readyText&&output.includes(readyText))readyResolve(output);
 });
 child.stderr.on('data',bytes=>{process.stderr.write(bytes);stderr=(stderr+bytes).slice(-32768);});
 const done=new Promise((resolve,reject)=>{
  child.once('error',reject);
  child.once('close',(code,signal)=>{
   children.delete(child);
   const detail=stderr.trimEnd(),error=Error(script+' exited: '+(signal||code)+(detail?'\n'+detail:''));
   readyReject(code===0?Error(script+' exited before ready'):error);
   if(code===0)resolve(output);else reject(error);
  });
 });
 done.catch(()=>{});return {child,ready,done};
}
function stop(){
 if(stopping)return stopping;
 stopping=(async()=>{
  async function end(child){
   if(!children.has(child))return;
   await new Promise(resolve=>{
    const timer=setTimeout(()=>{
     console.error('Cleanup timed out; forcibly stopping '+child.script+'. Inspect the session logs before retrying.');
     child.kill('SIGKILL');
    },35000);
    child.once('close',()=>{clearTimeout(timer);resolve();});
    if(child.connected)child.send({type:'hblauncher-stop'},error=>{if(error)child.kill('SIGTERM');});
    else child.kill('SIGTERM');
   });
  }
  // Close file-transfer handles and commit writes while RPC is still available.
  await Promise.all([...children].filter(c=>c.script==='sdk/host/ftp-service.cjs').map(end));
  // Keep RPC alive until the audio owner has stopped its console output.
  await Promise.all([...children].filter(c=>/\/game-audio\.cjs$/.test(c.script)).map(end));
  await Promise.all([...children].filter(c=>c.script!=='smilebasic/host.cjs').map(end));
  await Promise.all([...children].map(end));
 })();return stopping;
}
async function main(){
 const requestStop=()=>{stopRequested=true;void stop();};
 process.on('SIGINT',requestStop);process.on('SIGTERM',requestStop);
 const host=start('smilebasic/host.cjs',process.argv.slice(2),'Qualified native session ready for graphics inspection.');
 try{
  const output=await host.ready;
  if(stopping)return;
  const match=output.match(/Run folder: ([^\r\n]+)/);if(!match)throw Error('Missing fresh run directory');
  const directory=match[1];
  const stages=[['homebrew-launcher/inspect-display.cjs'],['homebrew-launcher/inspect-compatibility.cjs'],['homebrew-launcher/inspect-input.cjs'],['homebrew-launcher/vulkan-copy.cjs','display'],['homebrew-launcher/launcher.cjs','auto'],['homebrew-launcher/launcher-check.cjs','auto']];
  for(const [script,...args] of stages){await start(script,[directory,...args]).done;if(stopping)return;}
  const graphics=start('homebrew-launcher/launcher-loop.cjs',[directory,'auto'],'HBLauncher game event source ready.');
  await graphics.ready;
  if(stopping)return;
  const ftp=start('sdk/host/ftp-service.cjs',[directory],'SDK FTP service ready.');await ftp.ready;
  if(stopping)return;
  const effects=start('homebrew-launcher/game-audio.cjs',[directory],'Game sound effects ready.');await effects.ready;
  if(stopping)return;
  console.log('HBLauncher GPU app runtime and package sound effects are running.');
  await Promise.race([host.done,graphics.done,effects.done,ftp.done]);
 }finally{await stop();}
}
installShutdownChannel();
module.exports={start};
if(require.main===module)main().catch(error=>{if(!stopRequested){console.error(error);process.exitCode=1;}});
