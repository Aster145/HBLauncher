'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,validateManifest}=require('../host/runtime.cjs');
const L=require('../host/layout.cjs'),P=require('../../apps/file-browser/protocol.json');
const MAPPED=0x10000000;
const app=(fingerprint='browser-v1',capabilities=['files-read'],id='file-browser')=>({id,fingerprint,manifest:{sdk:{version:1,capabilities}}});
function result(){return {payload:Buffer.from('listed'),writes:[{offset:P.metadata.offset,bytes:Buffer.alloc(P.metadata.bytes,0x41)},{offset:P.atlas.offset,bytes:Buffer.alloc(P.atlas.width*P.atlas.height,0x62)}]};}
async function fixture(implementation={}){
 const memory=Buffer.alloc(8*1024*1024),writes=[];
 const calls={creates:0,handles:0,resets:0,closed:0};
 const rpc={async read(address,size){return Buffer.from(memory.subarray(address-MAPPED,address-MAPPED+size));},async write(address,bytes){assert.ok(address>=MAPPED&&address+bytes.length<=MAPPED+memory.length);writes.push({offset:address-MAPPED,bytes:Buffer.from(bytes)});bytes.copy(memory,address-MAPPED);}};
 const hardware={async poll(){return Buffer.alloc(1024);},async close(){calls.closed++;}};
 const browserFactory=async options=>{calls.creates++;assert.equal(options.rpc,rpc);assert.equal(options.directory,'fake-session');return {async handle(request){calls.handles++;return implementation.handle?implementation.handle(request):result();},async reset(){calls.resets++;}};};
 const runtime=await create({rpc,mapped:MAPPED,directory:'fake-session',hardware,browserFactory});
 const submit=(sequence=1)=>{const request=Buffer.alloc(1056);request.writeUInt32LE(sequence);request.writeUInt32LE(L.OP.filesRead,4);request.writeUInt32LE(P.request.list,8);request.writeUInt32LE(1,16);request.write('/',32);request.copy(memory,L.OFFSET+L.FIELD.request);};
 const response=()=>{const b=memory.subarray(L.OFFSET+L.FIELD.response,L.OFFSET+L.FIELD.response+1056);return {sequence:b.readUInt32LE(),status:b.readUInt32LE(4),payload:Buffer.from(b.subarray(32,32+b.readUInt32LE(8)))};};
 return {runtime,memory,writes,calls,submit,response};
}
test('file browser capability uses reserved operation 5',()=>{
 assert.equal(L.OP.filesRead,5);assert.equal(L.OP.filesRead,P.request.op);
 assert.deepEqual(validateManifest({version:1,capabilities:['files-read','files-read']}).capabilities,['files-read']);
});
test('undeclared, launcher and other app requests never create the file backend',async()=>{
 for(const owner of [null,app('no-cap',[]),app('other',['files-read'],'hello-world')]){
  const f=await fixture();await f.runtime.atBoundary(owner);f.submit();await f.runtime.atBoundary(owner);
  assert.equal(f.response().status,L.STATUS.unsupported);assert.equal(f.calls.creates,0);assert.equal(f.calls.handles,0);
  assert.equal(f.writes.filter(w=>w.offset>=P.metadata.offset&&w.offset<P.atlas.offset+P.atlas.width*P.atlas.height).length,0);
 }
});
test('validated view uploads complete before acknowledgement and a sequence runs once',async()=>{
 const f=await fixture(),owner=app();await f.runtime.atBoundary(owner);f.writes.length=0;f.submit(7);
 await f.runtime.atBoundary(owner);
 assert.deepEqual(f.writes.map(w=>w.offset),[L.OFFSET,P.metadata.offset,P.atlas.offset,L.OFFSET+L.FIELD.response]);
 assert.equal(f.memory[P.metadata.offset],0x41);assert.equal(f.memory[P.atlas.offset+P.atlas.width*P.atlas.height-1],0x62);
 assert.deepEqual(f.response(),{sequence:7,status:L.STATUS.ok,payload:Buffer.from('listed')});
 await f.runtime.atBoundary(owner);assert.equal(f.calls.creates,1);assert.equal(f.calls.handles,1);
});
test('owner changes clear pending requests and reset the retained backend',async()=>{
 const f=await fixture(),first=app(),next=app('browser-v2');
 await f.runtime.atBoundary(first);f.submit(1);await f.runtime.atBoundary(first);
 f.submit(2);await f.runtime.atBoundary(next);
 assert.equal(f.memory.readUInt32LE(L.OFFSET+L.FIELD.request),0);assert.equal(f.memory.readUInt32LE(L.OFFSET+L.FIELD.response),0);
 assert.equal(f.calls.resets,1);assert.equal(f.calls.handles,1);
 f.submit(1);await f.runtime.atBoundary(next);assert.equal(f.calls.handles,2);assert.equal(f.calls.creates,1);
 // The app ID is part of ownership even if a caller reuses a fingerprint.
 await f.runtime.atBoundary(app('browser-v2',['files-read'],'another-app'));assert.equal(f.calls.resets,2);
 f.submit(1);await f.runtime.atBoundary(app('browser-v2',['files-read'],'another-app'));
 assert.equal(f.response().status,L.STATUS.unsupported);assert.equal(f.calls.handles,2);
 await f.runtime.close();assert.equal(f.calls.resets,3);assert.equal(f.calls.closed,1);
});
test('invalid backend result is rejected before any view write',async t=>{
 const cases={
  'oversized reply':()=>({...result(),payload:Buffer.alloc(1025)}),
  'nonbuffer reply':()=>({...result(),payload:'bad'}),
  'metadata end overflow':()=>({...result(),writes:[{offset:P.metadata.offset+P.metadata.bytes-1,bytes:Buffer.alloc(2)}]}),
  'metadata start underflow':()=>({...result(),writes:[{offset:P.metadata.offset-1,bytes:Buffer.alloc(2)}]}),
  'atlas end overflow':()=>({...result(),writes:[{offset:P.atlas.offset+P.atlas.width*P.atlas.height-1,bytes:Buffer.alloc(2)}]}),
  'SDK mailbox address':()=>({...result(),writes:[{offset:L.OFFSET+L.FIELD.request,bytes:Buffer.alloc(4)}]}),
  'noninteger address':()=>({...result(),writes:[{offset:P.metadata.offset+.5,bytes:Buffer.alloc(4)}]}),
  'nonbuffer upload':()=>({...result(),writes:[{offset:P.metadata.offset,bytes:[1,2,3]}]}),
  'second write invalid':()=>({...result(),writes:[result().writes[0],{offset:0,bytes:Buffer.alloc(4)}]}),
 };
 for(const [name,make] of Object.entries(cases))await t.test(name,async()=>{
  const f=await fixture({handle:make}),owner=app();await f.runtime.atBoundary(owner);f.writes.length=0;f.submit();await f.runtime.atBoundary(owner);
  assert.equal(f.response().status,L.STATUS.native);assert.deepEqual(f.writes.map(w=>w.offset),[L.OFFSET,L.OFFSET+L.FIELD.response]);
 });
});
test('backend exceptions become SDK errors instead of losing the acknowledgement',async()=>{
 for(const [error,status] of [[Error('Native listing failed'),L.STATUS.native],[Object.assign(Error('Timed out'),{code:'ETIMEDOUT'}),L.STATUS.timeout]]){
  const f=await fixture({async handle(){throw error;}}),owner=app();await f.runtime.atBoundary(owner);f.submit(12);await f.runtime.atBoundary(owner);
  assert.deepEqual(f.response(),{sequence:12,status,payload:Buffer.from(error.message)});
 }
});
test('backend frame error metadata remains available as a completed view',async()=>{
 const data=result();data.payload.writeUInt32LE(1,0);
 const f=await fixture({handle:()=>data}),owner=app();await f.runtime.atBoundary(owner);f.submit();await f.runtime.atBoundary(owner);
 assert.equal(f.response().status,L.STATUS.ok);assert.equal(f.response().payload.readUInt32LE(),1);
});
