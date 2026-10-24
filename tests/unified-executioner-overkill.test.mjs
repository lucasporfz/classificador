// M-034/D-011a: política aprovada de tier, pela API pública do Unified.
// O recorte + sessão abaixo é um fixture COMPOSTO de teste: o Local Chat
// 10:24:56 é declarado aqui e não é apresentado como parte do log real ausente.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = {console: {log(){},warn(){},error(){}}, Math, JSON, Array, Object, Number, String,
  Map, Set, Date, Float32Array, Int32Array, isFinite, isNaN, parseInt, parseFloat};
ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
for (const file of ['stats','mob-element-mods','mob-element-mods-post-2026-06-16',
  'unified-session-context','unified-formulas','unified-parsing','unified-setup-inference','unified-validation',
  'unified-turn-resolution','unified-classification-engine']) {
  vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), ctx, {filename: file});
}
const E = ctx.UnifiedClassificationEngine;
const options = {mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true};
const server = fs.readFileSync('logs/tom server log.txt', 'utf8');
const local = fs.readFileSync('logs/tom local chat.txt', 'utf8');
const actual = E.classifyUnified(server, local, options);
const target = actual.turns.find(t => t.clock === '12:39:38');
assert.equal(target.status, 'resolved');
const spell = target.components.find(c => c.comp === 'spell');
assert.equal(spell.hits.length, 4);
assert.equal(target.components.find(c => c.comp === 'arrow').hits[0].dmg, 787);
assert.equal(spell.hits.find(h => h.seq === 9930).executionerBonusActive, true,
  'tom 12:39:38: overkill 1035 amped apesar de mana capada');
assert.equal(spell.hits.find(h => h.seq === 9930).executionerBonusMultiplier, 2.25);
assert.equal(spell.hits.find(h => h.dmg === 1094).executionerBonusActive, false);
assert.equal(spell.hits.find(h => h.dmg === 1147).executionerBonusActive, false);

const fragment = `10:24:56 A raubritter chastener loses 739 hitpoints due to your attack.
10:24:56 You were healed for 336 hitpoints.
10:24:56 You gained 84 mana.
10:24:56 A raubritter chastener loses 1027 hitpoints due to your attack.
10:24:56 You were healed for 391 hitpoints.
10:24:56 You gained 126 mana.
10:24:56 You gained 22230 experience points (Animus mastery).
10:24:56 A raubritter skirmisher loses 70 hitpoints due to your attack.
10:24:56 You were healed for 365 hitpoints.
10:24:56 You gained 99 mana.
10:24:56 You gained 20007 experience points (Animus mastery).
10:24:56 A raubritter skirmisher loses 617 hitpoints due to your attack.
10:24:56 You were healed for 214 hitpoints.
10:24:56 You gained 20007 experience points (Animus mastery).
10:24:56 A raubritter skirmisher loses 541 hitpoints due to your attack.
10:24:56 You gained 20007 experience points (Animus mastery).`;
const composed = E.classifyUnified(fragment + '\n' + server,
  '10:24:56 Kikaro [1001]: exori amp kor\n' + local, options);
const turn = composed.turns.find(t => t.clock === '10:24:56');
assert.equal(turn.status, 'resolved', 'fixture composto deve isolar a spell antes de testar tier');
assert.equal(turn.components.find(c => c.comp === 'arrow').hits[0].dmg, 739);
const fragmentSpell = turn.components.find(c => c.comp === 'spell');
assert.deepEqual(Array.from(fragmentSpell.hits, h => h.dmg), [1027,70,617,541]);
assert.deepEqual(Array.from(fragmentSpell.hits, h => h.executionerBonusActive), [true,true,true,true]);
assert.deepEqual(Array.from(fragmentSpell.hits, h => h.executionerBonusMultiplier), [2.25,2.25,2.25,2.25]);

// Outra composição sintética: só o recorte é nomeado amp kor, portanto não há
// pares limpos base/amped dessa spell para fixar A. Não inventar mastery.
const noMasteryReference = E.classifyUnified(fragment + '\n' + server,
  '10:24:56 Kikaro [1001]: exori amp kor\n' + local.replaceAll('exori amp kor', 'exori gran'), options);
const noMasteryTurn = noMasteryReference.turns.find(t => t.clock === '10:24:56');
assert.equal(noMasteryTurn.status, 'resolved');
const noMasterySpell = noMasteryTurn.components.find(c => c.comp === 'spell');
assert.deepEqual(Array.from(noMasterySpell.hits, h => h.executionerBonusActive), [true,true,true,true]);
assert.deepEqual(Array.from(noMasterySpell.hits, h => h.executionerBonusMultiplier), [null,null,null,null]);

// Sem a última XP, 541 não comprova morte nem tem leech: continua desconhecido.
const noLastXp = fragment.slice(0, fragment.lastIndexOf('\n'));
const noKillEvidence = E.classifyUnified(noLastXp + '\n' + server,
  '10:24:56 Kikaro [1001]: exori amp kor\n' + local, options);
const noKillTurn = noKillEvidence.turns.find(t => t.clock === '10:24:56');
assert.equal(noKillTurn.status, 'resolved');
const noKillHit = noKillTurn.components.find(c => c.comp === 'spell').hits.find(h => h.dmg === 541);
assert.equal(noKillHit.overkill, false);
assert.equal(noKillHit.executionerBonusActive, null);

const tom2 = E.classifyUnified(fs.readFileSync('logs/tom 2 server log.txt','utf8'),
  fs.readFileSync('logs/tom 2 local chat.txt','utf8'),options);
const otherTarget = tom2.turns.find(t => t.clock === '13:04:16');
const otherSpell = otherTarget.components.find(c => c.comp === 'spell');
assert.equal(otherSpell.hits.length,4);
// O overpower no skirmisher matou e fica com a XP (D-011b): o chastener 1260 (seq6103) não é
// overkill e a precedência do overkill (M-034) não o promove.
const chastener = otherSpell.hits.find(h => h.seq === 6103);
assert.equal(chastener.dmg, 1260);
assert.equal(chastener.overkill, false, 'tom 2 13:04:16: XP do charm que matou não prova overkill do chastener');
assert.notEqual(chastener.executionerBonusActive, true, 'tom 2 13:04:16: chastener 1260 não promovido a amped');
const virtual = otherSpell.hits.filter(h => h.virtual);
assert.equal(virtual.length,1);
assert.equal(virtual[0].executionerBonusActive,null,'virtual não é hit observado fatal da spell');

// M-034c (fix-xp-attribution-across-mobs): golpe sem overkill e sem linha de mana recebe o tier
// do golpe do mesmo mob e estado, no mesmo cast, com dano real exato pelo leech. Esperados
// aprovados no gate da Fase 3 (22/Out/2026), pelo leech dos golpes do mesmo lançamento.
const tom3 = E.classifyUnified(fs.readFileSync('logs/tom 3 server log.txt','utf8'),
  fs.readFileSync('logs/tom 3 local chat.txt','utf8'),options);
const execHit = (result, clock, seq) => {
  const turn = result.turns.find(t => t.clock === clock);
  assert.ok(turn, `turno ${clock} ausente`);
  const hit = turn.components.find(c => c.comp === 'spell').hits.find(h => h.seq === seq);
  assert.ok(hit, `${clock}: seq ${seq} fora da spell`);
  return hit;
};
// tom 12:26:25: os dois marksman cortados (809 OK e 1524 OK, vida 423 / mana 128) têm dano real
// exato 2443-2446 a N = 4; o marksman 2681 (vida 190, sem mana, sem overkill) está no mesmo nível.
const marksman = execHit(actual, '12:26:25', 895);
assert.equal(marksman.dmg, 2681);
assert.equal(marksman.overkill, false, 'tom 12:26:25: reflection em outro mob e dano recebido antes da XP');
assert.equal(marksman.executionerBonusActive, true, 'tom 12:26:25: 2681 amped pelo par do mesmo mob');
assert.equal(marksman.executionerBonusMultiplier, 2.25);
for (const [result, name, clock, seq, dmg, amped] of [
  [tom2, 'tom 2', '13:08:53', 9327, 2873, true],  // o chastener 2865 amped do mesmo cast
  [tom2, 'tom 2', '13:05:14', 6834, 1293, false], // metade do chastener 1139 OK (dano real 2725)
  [tom3, 'tom 3', '09:49:12', 747, 2690, true],   // igual ao skirmisher 2686 amped
  [tom3, 'tom 3', '09:52:49', 2920, 2450, true],  // os três skirmishers cortados têm dano real ~2230
]) {
  const hit = execHit(result, clock, seq);
  assert.equal(hit.dmg, dmg, `${name} ${clock} seq ${seq}`);
  assert.equal(hit.manaLeech, 0, `${name} ${clock} seq ${seq}: sem linha de mana`);
  assert.equal(hit.executionerBonusActive, amped, `${name} ${clock} seq ${seq}: tier pelo par do mesmo mob`);
}
// Irmão sem dano real exato não vota: em tom 12:36:19 o único outro marksman é o 1230 OK, com vida
// 427 e mana 77 discordantes. O marksman 1105 (vida 184, sem mana) fica no tier que a própria vida
// dá, base (o nível baixo do bloco, contra 383-427 dos outros três).
{
  const hit = execHit(actual, '12:36:19', 7512);
  assert.equal(hit.dmg, 1105);
  assert.equal(hit.manaLeech, 0);
  assert.equal(hit.executionerBonusActive, false, 'tom 12:36:19: marksman 1105 sem par exato conserva base');
}
console.log('unified executioner overkill: real targets and composed fragment OK');
