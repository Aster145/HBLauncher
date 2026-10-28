const test = require('node:test');
const assert = require('node:assert/strict');
const {inspectImport, verifyHandheld} = require('../homebrew-launcher/input-resolution.cjs');
const definitions = require('../sdk/native/hid-functions.json');
const imports = require('../homebrew-launcher/input-imports.json');
const name = definitions.padHandheld.symbol;
const slot = imports[name].slot;

function fixture(options = {}) {
  const a = {main: 0x10000000, sdk: 0x40000000};
  const target = a.sdk + definitions.padHandheld.offset;
  const state = {
    importTarget: a.main + 0x29b850,
    region: {address: a.sdk, size: 0x600000, permissions: 5, ipcReferences: 0},
    code: Buffer.concat([Buffer.from(definitions.padHandheld.hex, 'hex'), Buffer.alloc(192)]),
    ...options
  };
  const requests = [], reads = [];
  // No call/write/allocation API is available: discovery must remain read-only.
  const rpc = {a,
    async read(address, length) {
      reads.push({address, length});
      if (address === a.main + slot && length === 8) {
        const pointer = Buffer.alloc(8);
        pointer.writeBigUInt64LE(BigInt(state.importTarget));
        return pointer;
      }
      assert.equal(address, target);
      return Buffer.from(state.code.subarray(0, length));
    },
    async query(address) { assert.equal(address, target); return state.region; },
    async request(request) {
      requests.push(request);
      assert.equal(request.command, 'verify-function');
      assert.equal(request.address, target);
      const expected = Buffer.from(request.hex, 'hex');
      assert.ok(state.code.subarray(0, expected.length).equals(expected), 'Actual signature mismatch');
    }
  };
  return {rpc, state, requests, reads, target};
}

test('unbound handheld resolves by static SDK signature without changing the import', async () => {
  const f = fixture();
  const input = await inspectImport(f.rpc, name, slot);
  assert.equal(input.resolution, 'sdk-signature');
  assert.equal(input.importTarget, f.state.importTarget);
  assert.notEqual(input.target, input.importTarget);
  assert.equal(input.target, f.target);
  assert.equal(input.sdkOffset, definitions.padHandheld.offset);
  await verifyHandheld(f.rpc, input);
  assert.equal(f.requests.length, 2);
  assert.ok(f.requests.every(r => r.hex === definitions.padHandheld.hex));
});

test('already bound handheld keeps the existing import path', async () => {
  const f = fixture(); f.state.importTarget = f.target;
  const input = await inspectImport(f.rpc, name, slot);
  assert.equal(input.resolution, undefined);
  assert.equal(input.target, f.target);
  assert.equal(f.requests.length, 0);
  await verifyHandheld(f.rpc, input);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].hex, input.bytes.slice(0, 64));
});

test('unbound non-handheld imports remain unresolved', async () => {
  const f = fixture();
  const touch = Object.keys(imports).find(n => n.includes('Touch'));
  const result = await inspectImport(f.rpc, touch, slot);
  assert.equal(result.unresolved, true);
  assert.equal(result.bytes, undefined);
  assert.equal(f.requests.length, 0);
});

test('wrong instructions cannot qualify the fallback', async () => {
  const f = fixture(); f.state.code[0] ^= 1;
  await assert.rejects(inspectImport(f.rpc, name, slot), /signature mismatch/);
});

test('non-executable, IPC-referenced and truncated mappings are rejected', async () => {
  for (const change of [{permissions: 3}, {ipcReferences: 1}, {size: definitions.padHandheld.offset + 32}]) {
    const f = fixture(); Object.assign(f.state.region, change);
    await assert.rejects(inspectImport(f.rpc, name, slot), /executable memory|crosses mapping/);
    assert.equal(f.requests.length, 0);
  }
});

test('an unknown import address never switches to the fixed fallback', async () => {
  const f = fixture(); f.state.importTarget += 4;
  const queried = [];
  f.rpc.query = async address => { queried.push(address); return {permissions: 0}; };
  await assert.rejects(inspectImport(f.rpc, name, slot), /executable memory/);
  assert.deepEqual(queried, [f.state.importTarget]);
  assert.equal(f.requests.length, 0);
});

test('loop rejects changed import, SDK base, report target or signature', async () => {
  for (const change of [
    (f, input) => { f.state.importTarget = input.target; },
    f => { f.rpc.a.sdk += 4096; },
    (f, input) => { input.target += 4; },
    (f, input) => { input.sdkOffset += 4; },
    (f, input) => { input.bytes = '00' + input.bytes.slice(2); }
  ]) {
    const f = fixture(), input = await inspectImport(f.rpc, name, slot);
    change(f, input);
    await assert.rejects(verifyHandheld(f.rpc, input), /changed/);
    assert.equal(f.requests.length, 1);
  }
});

test('loop rechecks actual instructions even when the report is unchanged', async () => {
  const f = fixture(), input = await inspectImport(f.rpc, name, slot);
  f.state.code[0] ^= 1;
  await assert.rejects(verifyHandheld(f.rpc, input), /signature mismatch/);
});
