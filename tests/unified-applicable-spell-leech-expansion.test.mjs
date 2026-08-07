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
  bountyLifeBonus: 0,
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
    bountyLifeBonus: 0,
    spellBonus: 0,
    spellBonusEntry: { incantation: 'exori dir moe', label: 'Ethereal Barrage', life: [0, 0.1], mana: [0] },
  },
  {
    rate: 0.2,
    minorBonus: 0,
    minorMob: null,
    bountyLifeBonus: 0,
    spellBonus: 0.1,
    spellBonusEntry: { incantation: 'exori dir moe', label: 'Ethereal Barrage', life: [0, 0.1], mana: [0] },
  },
]);
assert.strictEqual(spellCandidates[0].spellBonusEntry, spellCandidates[1].spellBonusEntry);

// D-022a: o bonus de Expose Weakness vem de um perk OPCIONAL, inferido por
// sessao. Ele so vale no canal mana, so pre-cutoff e so quando o setup daquela
// sessao trouxe `exposeWeaknessManaPerk === true`.
const ewHit = { type: 'normal', mob: 'roaming dread', exposeWeakness: true };
const perkSetup = { lifeBase: 0.25, manaBase: 0.17, exposeWeaknessManaPerk: true };
const noPerkSetup = { lifeBase: 0.25, manaBase: 0.17, exposeWeaknessManaPerk: false };
assert.deepEqual(project(leechEffectiveRateCandidates(
  perkSetup,
  'mana',
  { comp: 'rune' },
  ewHit,
  { sessionDateKey: 20260615 },
)), [{
  rate: 0.19,
  minorBonus: 0,
  minorMob: null,
  bountyLifeBonus: 0,
  spellBonus: 0,
  spellBonusEntry: null,
}]);
// Sessao pre-cutoff SEM o perk inferido nao recebe o bonus. Hipotese neutra.
assert.equal(leechEffectiveRateCandidates(
  noPerkSetup,
  'mana',
  { comp: 'rune' },
  ewHit,
  { sessionDateKey: 20260615 },
)[0].rate, 0.17);
// Setup sem o campo (desconhecido/fallback) tambem e hipotese neutra.
assert.equal(leechEffectiveRateCandidates(
  { lifeBase: 0.25, manaBase: 0.17 },
  'mana',
  { comp: 'rune' },
  ewHit,
  { sessionDateKey: 20260615 },
)[0].rate, 0.17);
// O perk nao existe no regime pos-cutoff nem sem data, mesmo se inferido.
assert.equal(leechEffectiveRateCandidates(
  perkSetup,
  'mana',
  { comp: 'rune' },
  ewHit,
  { sessionDateKey: 20260616 },
)[0].rate, 0.17);
assert.equal(leechEffectiveRateCandidates(
  perkSetup,
  'mana',
  { comp: 'rune' },
  ewHit,
  {},
)[0].rate, 0.17);
// Life Leech nunca recebe o bonus.
assert.equal(leechEffectiveRateCandidates(
  perkSetup,
  'life',
  { comp: 'rune' },
  ewHit,
  { sessionDateKey: 20260615 },
)[0].rate, 0.25);

console.log('unified applicable spell leech expansion: OK');
