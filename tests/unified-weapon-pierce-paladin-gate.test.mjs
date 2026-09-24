// M-040 (emendada) — o detector do perk de pierce fisico da arma so roda em sessao de
// Royal Paladin.
//
// O gate de `aaElement` sozinho NAO protege as outras vocacoes: para quem nao e paladino,
// `inferAaElementForSession` devolve `physical` por DEFAULT (`source: 'not_paladin'`,
// `eligible: 0`), entao o gate passa sem ter medido nada.
//
// Caso-prova negativo: `alumnishocks 2` (sorcerer `Alumni Shocks`, `Sept 21 2026`). Os blocos
// que o detector elege sao o 1o estagio do Death Echo (`exevo mort ora`, multiestagio
// M-016d-1) — sorcerer nao tem AA de area fisica (V-016). O dano deles e elemental (fecha
// exato no eixo energy), e revertido no eixo fisico so fecha com `+0,09`, porque esse e o
// pierce que alinha o unico mob com `physicalDmgMod < 1` (dragolisk, 0,85) aos mobs de 1,0.
//
// Controle positivo: `moonsilver` S0 (Royal Paladin) continua selecionando 0,09.
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

// -------------------------------------------- alumnishocks 2: sorcerer, detector barrado
const alumni = classify(session('alumnishocks 2 server log.txt', 'alumnishocks 2 localchat.txt', 0));
const alumniDet = alumni.weaponPhysicalPierceDetection || {};
check('alumnishocks 2: vocacao inferida e sorcerer', alumni.vocation === 'sorcerer', `vocation=${alumni.vocation}`);
check('alumnishocks 2: o gate de aaElement sozinho passaria (default not_paladin)',
  alumni.aaElement === 'physical' && (alumni.aaElementDetection || {}).source === 'not_paladin',
  `aaElement=${alumni.aaElement} source=${(alumni.aaElementDetection || {}).source}`);
check('alumnishocks 2: detector nao roda (gate de vocacao)', alumni.weaponPhysicalPierce === 0,
  `obtido ${alumni.weaponPhysicalPierce}`);
check('alumnishocks 2: fonte declara o gate de vocacao',
  alumniDet.source === 'vocation_not_paladin', `source=${alumniDet.source}`);
check('alumnishocks 2: detector nao avaliou bloco nenhum', alumniDet.corroboration == null,
  JSON.stringify(alumniDet.corroboration));

// ------------------------------------------------ moonsilver: controle positivo (paladino)
const moon = classify(session('moonsilver Server Log.txt', 'moonsilver Local Chat.txt', 0));
const moonDet = moon.weaponPhysicalPierceDetection || {};
check('moonsilver: vocacao inferida e paladin', moon.vocation === 'paladin', `vocation=${moon.vocation}`);
check('moonsilver: detector continua selecionando 0.09', moon.weaponPhysicalPierce === 0.09,
  `obtido ${moon.weaponPhysicalPierce}`);
check('moonsilver: fonte continua sendo a evidencia de tier unico',
  moonDet.source === 'evidence_unique_tier_without_empty_physical_block', `source=${moonDet.source}`);

console.log(`unified weapon pierce paladin gate: ${pass} ok, ${fail} falhas`);
if (fail) process.exit(1);
