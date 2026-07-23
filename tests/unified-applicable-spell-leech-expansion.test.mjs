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

const { leechEffectiveRateCandidates } = context.UnifiedValidation;
const hit = { type: 'normal', mob: 'darklight matter' };
const setup = { lifeBase: 0.1 };
const project = candidates => JSON.parse(JSON.stringify(candidates));

assert.deepEqual(project(leechEffectiveRateCandidates(setup, 'life', { comp: 'arrow' }, hit)), [{
  rate: 0.1,
  minorBonus: 0,
  minorMob: null,
  spellBonus: 0,
  spellBonusEntry: null,
}]);

const spellCandidates = leechEffectiveRateCandidates(setup, 'life', {
  comp: 'spell',
  action: { profile: { incantation: 'exori dir moe' } },
}, hit);
assert.deepEqual(project(spellCandidates), [
  {
    rate: 0.1,
    minorBonus: 0,
    minorMob: null,
    spellBonus: 0,
    spellBonusEntry: { incantation: 'exori dir moe', label: 'Ethereal Barrage', life: [0, 0.1], mana: [0] },
  },
  {
    rate: 0.2,
    minorBonus: 0,
    minorMob: null,
    spellBonus: 0.1,
    spellBonusEntry: { incantation: 'exori dir moe', label: 'Ethereal Barrage', life: [0, 0.1], mana: [0] },
  },
]);
assert.strictEqual(spellCandidates[0].spellBonusEntry, spellCandidates[1].spellBonusEntry);

console.log('unified applicable spell leech expansion: OK');
