import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { console, Math, JSON, Array, Object, Number, String, Map, WeakMap, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
vm.createContext(context);
for (const file of [
  'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
]) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const { eligibleVirtualZeroCharmsForBlock } = context.UnifiedValidation;
const hit = { type: 'normal', dmg: 500, mob: 'darklight matter', ts: 100, seq: 10 };
const eligible = { kind: 'charm', mob: 'darklight matter', ts: 100, seq: 9, overpowerCharm: true, killedTarget: true };
const ineligible = { type: 'damage', mob: 'darklight matter', ts: 100, seq: 8 };
let reads = 0;
const source = new Proxy([ineligible, eligible], {
  get(target, property, receiver) {
    if (typeof property === 'string' && /^\d+$/.test(property)) reads++;
    return Reflect.get(target, property, receiver);
  },
});
const classificationContext = { serverEvents: source };
const turn = { hits: [hit] };
const block = { comp: 'spell', hits: [hit] };

assert.deepEqual(eligibleVirtualZeroCharmsForBlock(turn, block, classificationContext), [eligible]);
const readsAfterFirstCall = reads;
assert.ok(readsAfterFirstCall > 0);
assert.deepEqual(eligibleVirtualZeroCharmsForBlock(turn, block, classificationContext), [eligible]);
assert.equal(reads, readsAfterFirstCall, 'unchanged source must not be rescanned');

const replacement = [{ ...eligible, seq: 7 }];
classificationContext.serverEvents = replacement;
assert.deepEqual(eligibleVirtualZeroCharmsForBlock(turn, block, classificationContext), replacement);

console.log('unified virtual-zero eligibility cache: OK');
