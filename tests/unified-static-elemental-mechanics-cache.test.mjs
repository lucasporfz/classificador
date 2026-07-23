import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { console, Math, JSON, Array, Object, Number, String, Map, WeakMap, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/unified-formulas.js', 'utf8'), context, { filename: 'js/unified-formulas.js' });

const mods = { energyDmgMod: 0.8, mitigation: 5 };
const classificationContext = {
  getMobMods: () => mods,
  useFloat16Mitigation: true,
};
const hit = { mob: 'test mob', dmg: 1000, type: 'normal', exposeWeakness: true };
const candidates = () => context.UnifiedFormulas.elementalOriginalCandidates(hit, 'energy', classificationContext);

const first = candidates();
const repeated = candidates();
assert.equal(repeated.mod, first.mod);
assert.equal(repeated.mitigation, first.mitigation);

mods.energyDmgMod = 0.7;
mods.mitigation = 10;
const mutated = candidates();
assert.notEqual(mutated.mod, first.mod);
assert.notEqual(mutated.mitigation, first.mitigation);

classificationContext.useFloat16Mitigation = false;
const noFloat16 = candidates();
assert.equal(noFloat16.mitigation, 0.9);

console.log('unified static elemental mechanics cache: OK');
