// M-040a — perk de death pierce da arma (+0,04), inferido por sessao.
//
// Testemunha: alcancabilidade EXATA. O dano F de um hit death nao-critico com P = 1 tem de vir
// de algum inteiro O' com FLOOR(ROUND(O' × m) × M) = F; com m > 1 o ROUND pula valores, e um tier
// de pierce errado deixa hits observados sem solucao. Os numeros esperados vem desse canal
// (prototipo da Fase 1, reports/omega-before-resistance-2026-10-14.md), nao da saida do motor:
//   - `italian` S0 (02/Out/2026, arma com o perk, fato do usuario): tier 0 contradito por 176
//     hits em 3 mobs; tier 0,04 por nenhum  => 0,04;
//   - `death echo` S0 (mesmo personagem, 10/Jul/2026): os dois tiers contraditos => abstem;
//   - `kim` S0: nada discrimina => abstem.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js']) {
  vm.runInContext(read(file), ctx, { filename: file });
}
const engine = ctx.UnifiedClassificationEngine;
const F = ctx.UnifiedFormulas;

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.error(`  ok   ${name}`); }
  else { fail++; console.error(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};

const HEADER_RE = /^Channel .+ saved /;
function splitSessions(text) {
  const out = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (HEADER_RE.test(line)) { if (cur) out.push(cur); cur = { header: line, lines: [line] }; }
    else if (cur) cur.lines.push(line);
  }
  if (cur) out.push(cur);
  if (!out.length) out.push({ header: '', lines: text.replace(/^﻿/, '').split(/\r?\n/) });
  return out.map(s => ({ header: s.header, text: s.lines.join('\n') }));
}
function session(server, local, index) {
  const sv = splitSessions(read(path.join('logs', server)));
  const lc = splitSessions(read(path.join('logs', local)));
  return { sv: sv[index].text, lc: lc[index].text };
}
const OPTS = {
  mobModsPre: ctx.MOB_ELEMENT_MODS,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
};
const classify = s => engine.classifyUnified(s.sv, s.lc, OPTS);

// ------------------------------------------------------------------ italian: 0,04
const it = classify(session('italian Server Log.txt', 'italian Local Chat.txt', 0));
const det = it.weaponDeathPierceDetection || {};
check('italian: detector seleciona 0.04', it.weaponDeathPierce === 0.04, `obtido ${it.weaponDeathPierce}`);
check('italian: tier 0 contradito com corroboracao', det.tiers && det.tiers.some(t => t.tier === 0 && t.contradictions >= 3 && t.mobs >= 2 && t.seconds >= 2),
  JSON.stringify(det.tiers));
check('italian: tier 0.04 sem contradicao', det.tiers && det.tiers.some(t => t.tier === 0.04 && t.contradictions === 0), JSON.stringify(det.tiers));

// O par de omega do caso-prova de M-039b fecha exato com o pierce e o omega antes da resistencia.
const turn = (it.turns || []).find(t => t.clock === '18:49:09');
const deathO = h => (h.evidence && h.evidence.elemental && h.evidence.elemental.death && h.evidence.elemental.death.originals) || [];
const hits = turn ? turn.components.flatMap(c => c.hits) : [];
const small = hits.find(h => h.mob === 'cyclursus' && h.dmg === 829);
const big = hits.find(h => h.mob === 'cyclursus' && h.dmg === 879);
check('italian 18:49:09: cyclursus 829 e 879 (omega) com o mesmo original',
  small && big && big.omegaActive && deathO(small).some(o => deathO(big).includes(o)),
  `829=${small && deathO(small)} 879=${big && deathO(big)} omega=${big && big.omegaActive}`);

// ------------------------------------------------- mesmo personagem sem o perk; outro sorcerer
const de = classify(session('death echo server log.txt', 'death echo local chat.txt', 0));
check('death echo: abstem em 0', de.weaponDeathPierce === 0, `obtido ${de.weaponDeathPierce}`);
const kim = classify(session('kim server log.txt', 'kim local chat.txt', 0));
check('kim: abstem em 0', kim.weaponDeathPierce === 0, `obtido ${kim.weaponDeathPierce}`);

// -------------------------------------------- o perk nao alcanca a testemunha de charm (sem dmg)
const ctxPerk = { weaponDeathPierce: 0.04 };
check('charm (literal sem dmg) nao recebe o perk', F.pierceForElement('death', { exposeWeakness: false, elementalAmplification: false }, ctxPerk) === 0);
check('hit real recebe o perk', Math.abs(F.pierceForElement('death', { dmg: 829 }, ctxPerk) - 0.04) < 1e-12);
check('outro elemento nao recebe o perk', F.pierceForElement('energy', { dmg: 829 }, ctxPerk) === 0);

console.error(`\n${pass} ok, ${fail} falha(s)`);
if (fail) process.exit(1);
