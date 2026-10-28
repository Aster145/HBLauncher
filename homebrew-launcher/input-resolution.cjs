// A lazy import is not a missing SDK function. Resolve only the known handheld
// case through the same fixed SDK signature used by sdk/native/client.cjs.
const handheld = require('../sdk/native/hid-functions.json').padHandheld;
const imports = require('./input-imports.json');
const HANDHELD = '_ZN2nn3hid12GetNpadStateEPNS0_17NpadHandheldStateERKj';
const RESOLVER_OFFSET = 0x29b850;
const check = (value, message) => { if (!value) throw Error(message); };

async function readSlot(rpc, slot) {
  return Number((await rpc.read(rpc.a.main + slot, 8)).readBigUInt64LE());
}

async function inspectImport(rpc, name, slot) {
  const importTarget = await readSlot(rpc, slot);
  check(Number.isSafeInteger(importTarget) && importTarget > 0, 'Invalid input import: ' + name);
  const unresolved = importTarget === rpc.a.main + RESOLVER_OFFSET;
  if (unresolved && name !== HANDHELD) return {slot, target: importTarget, unresolved: true};

  let target = importTarget;
  if (unresolved) {
    check(handheld.symbol === name && slot === imports[HANDHELD].slot, 'Handheld definition differs');
    target = rpc.a.sdk + handheld.offset;
    check(Number.isSafeInteger(target) && target > 0, 'Invalid handheld SDK address');
  }
  const region = await rpc.query(target);
  check(region.permissions === 5 && !region.ipcReferences, 'Input import is not in executable memory: ' + name);
  const remaining = region.address + region.size - target;
  check(target >= region.address && remaining > 0, 'Input address is outside its mapping: ' + name);
  if (unresolved) {
    check(remaining >= handheld.hex.length / 2, 'Handheld signature crosses mapping');
    await rpc.request({command: 'verify-function', address: target, hex: handheld.hex});
  }
  const bytes = await rpc.read(target, Math.min(256, remaining));
  const report = {slot, target, region, bytes: bytes.toString('hex')};
  if (unresolved) {
    check(report.bytes.startsWith(handheld.hex), 'Handheld SDK signature changed');
    Object.assign(report, {importTarget, resolution: 'sdk-signature', sdkOffset: handheld.offset});
  }
  return report;
}

async function verifyHandheld(rpc, input) {
  const importTarget = await readSlot(rpc, input.slot);
  if (input.resolution === 'sdk-signature') {
    check(handheld.symbol === HANDHELD && input.slot === imports[HANDHELD].slot, 'Handheld definition differs');
    check(importTarget === input.importTarget && importTarget === rpc.a.main + RESOLVER_OFFSET, 'Input import changed');
    check(input.sdkOffset === handheld.offset && input.target === rpc.a.sdk + handheld.offset, 'Handheld SDK address changed');
    check(input.bytes.startsWith(handheld.hex), 'Handheld SDK signature changed');
    await rpc.request({command: 'verify-function', address: input.target, hex: handheld.hex});
  } else {
    check(!input.resolution, 'Unknown input resolution');
    check(importTarget === input.target, 'Input function changed');
    await rpc.request({command: 'verify-function', address: input.target, hex: input.bytes.slice(0, 64)});
  }
}

module.exports = {inspectImport, verifyHandheld};
