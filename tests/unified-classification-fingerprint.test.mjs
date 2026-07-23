import assert from 'node:assert/strict';
import { classificationFingerprint } from '../tools/unified-classification-fingerprint.mjs';

const turn = {
  ts: 123,
  status: 'resolved',
  components: [{
    id: 'spell_1',
    comp: 'spell',
    actionLabel: 'Divine Caldera',
    action: { id: 'c1', seq: 9, ts: 123, text: 'exevo mas san', profile: { incantation: 'exevo mas san' } },
    hits: [{ id: 'h1', seq: 10, ts: 123, mob: 'test mob', dmg: 500, type: 'normal' }],
  }],
};

const clone = structuredClone(turn);
assert.equal(classificationFingerprint(turn), classificationFingerprint(clone));

for (const mutate of [
  value => { value.status = 'unresolved'; },
  value => { value.components[0].comp = 'arrow'; },
  value => { value.components[0].actionLabel = 'Other Action'; },
  value => { value.components[0].action.ts += 1; },
  value => { value.components[0].hits[0].seq += 1; },
]) {
  const changed = structuredClone(turn);
  mutate(changed);
  assert.notEqual(classificationFingerprint(turn), classificationFingerprint(changed));
}

console.log('unified classification fingerprint: OK');
