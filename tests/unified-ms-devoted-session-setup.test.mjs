// ms devoted (20/Out/2026, sorcerer `Nightt Gaze`): setup inferido por sessao depois que os
// mobs da caca entraram na tabela pos-cutoff (vinham de mathiasbynens/tibia-json bestiary.json).
//
// Os esperados vem do log e de fato do usuario, nao da saida do motor:
//   - leech conhecido nos dois canais, com evidencia forte: no HEAD sem os mobs, S0 nao tinha
//     setup nenhum (0 observacoes-ouro) e S1 so 6. A TAXA nao e travada aqui: os tres mobs sao
//     Human, entao este log nao separa "bonus de classe dentro da base de leech, vida 25%" de
//     "fora da base, vida 25,75%" (o `ingol ed` mede fora: Bird/nao-Bird 0,9532, M-036);
//   - estancia Decay: nenhum `uteta` no chat; o dano decide (M-043a) e o usuario confirmou;
//   - stage 3 de Beam Mastery: em `02:38:36` lateral/central = 0,777 = 0,70 × 1,42 / 1,28;
//   - Human +3% (M-036): curse charm do inquisitor, 2127 ×79 =
//     FLOOR(FLOOR(ROUND(2001 × 1,1) × 0,939) × 1,03);
//   - sem omega (M-039): as tres linhas de charm tem um nivel so (2127 ×79, 2851 ×182, 2963 ×115);
//   - death pierce 0 (M-040a): a arma ainda nao tem o perk (fato do usuario).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js']) {
  vm.runInContext(read(file), ctx, { filename: file });
}
const engine = ctx.UnifiedClassificationEngine;

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.error(`  ok   ${name}`); }
  else { fail++; console.error(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

// ---------------------------------------------------------------- dado de tabela (bestiary.json)
const POST = ctx.MOB_ELEMENT_MODS_POST_2026_06_16;
const EXPECTED_MOBS = {
  'devoted radiant templar': { hitpoints: 42550, armor: 135, mitigation: 5.36, physicalDmgMod: 0.95, holyDmgMod: 0.75, deathDmgMod: 1.05, fireDmgMod: 1.1, energyDmgMod: 0.8, iceDmgMod: 1.1, earthDmgMod: 0.95, bestiaryClass: 'Human' },
  'devoted radiant zealot': { hitpoints: 41980, armor: 106, mitigation: 4.63, physicalDmgMod: 1.15, holyDmgMod: 0.8, deathDmgMod: 1.1, fireDmgMod: 1.05, energyDmgMod: 0.6, iceDmgMod: 1.05, earthDmgMod: 0.9, bestiaryClass: 'Human' },
  'devoted radiant inquisitor': { hitpoints: 40020, armor: 120, mitigation: 6.1, physicalDmgMod: 1.1, holyDmgMod: 0.75, deathDmgMod: 1.1, fireDmgMod: 1.05, energyDmgMod: 0.75, iceDmgMod: 1.05, earthDmgMod: 0.9, bestiaryClass: 'Human' },
};
for (const [mob, expected] of Object.entries(EXPECTED_MOBS)) {
  const got = POST && POST[mob];
  const wrong = got ? Object.keys(expected).filter(k => got[k] !== expected[k]) : ['ausente'];
  check(`tabela pos-cutoff: ${mob}`, wrong.length === 0, wrong.join(','));
}

// ---------------------------------------------------------------------------- setup por sessao
const HEADER_RE = /^Channel .+ saved /;
function splitSessions(text) {
  const out = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (HEADER_RE.test(line)) { if (cur) out.push(cur); cur = [line]; }
    else if (cur) cur.push(line);
  }
  if (cur) out.push(cur);
  return out.map(lines => lines.join('\n'));
}
const sv = splitSessions(read(path.join('logs', 'ms devoted Server Log.txt')));
const lc = splitSessions(read(path.join('logs', 'ms devoted Local Chat.txt')));
const OPTS = {
  mobModsPre: ctx.MOB_ELEMENT_MODS,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
};
check('ms devoted tem duas sessoes', sv.length === 2 && lc.length === 2, `sv=${sv.length} lc=${lc.length}`);

for (let i = 0; i < Math.min(sv.length, 2); i++) {
  const u = engine.classifyUnified(sv[i], lc[i], OPTS);
  const tag = `S${i}`;
  const ls = u.leechSetup || {};
  check(`${tag}: vida e mana conhecidas`, ls.lifeBaseKnown === true && ls.manaBaseKnown === true, `${ls.lifeBaseKnown}/${ls.manaBaseKnown}`);
  check(`${tag}: leech com evidencia forte`, ls.confidence === 'strong' && ls.evidenceCount >= 100 && ls.contradictions === 0,
    `${ls.confidence} evid=${ls.evidenceCount} contr=${ls.contradictions}`);
  const stance = u.sorcererStanceSetup || {};
  check(`${tag}: estancia Decay (death) pelo dano`, stance.stance === 'death', `${stance.stance}/${stance.source}`);
  check(`${tag}: Beam Mastery stage 3`, u.beamMasteryStage === 3, String(u.beamMasteryStage));
  const cls = u.bestiaryClassDamageBonus || {};
  check(`${tag}: bonus de classe Human +3%`, cls.class === 'human' && cls.bonus === 0.03, `${cls.class}/${cls.bonus}/${cls.source}`);
  const omega = (u._context && u._context.omegaSetup) || {};
  check(`${tag}: sem omega`, omega.active !== true, `${omega.active}/${omega.source}`);
  check(`${tag}: death pierce da arma 0`, u.weaponDeathPierce === 0, String(u.weaponDeathPierce));
}

console.error(`\nms devoted session setup: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
