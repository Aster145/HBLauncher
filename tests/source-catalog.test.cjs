const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {scan}=require('../homebrew-launcher/app-catalog.cjs');

test('unbuilt source examples are skipped, but broken app packages remain visible as errors',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'hb-source-catalog-'));
 try{
  const folder=path.join(root,'example');await fs.mkdir(folder);
  assert.equal((await scan(root)).rejected.length,1);
  await fs.writeFile(path.join(folder,'.source-only'),'Build locally to generate app.json.\n');
  assert.equal((await scan(root)).rejected.length,0);
  await fs.writeFile(path.join(folder,'app.json'),'{}');
  assert.equal((await scan(root)).rejected.length,1);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
