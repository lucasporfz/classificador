#!/usr/bin/env node
// Varredura: QUAIS fatos de setup o motor infere por sessao, e quais deles a ficha de
// sessao (js/session-summary.js) ja declara. Diagnostico para a lacuna de declaracao.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { splitSessions, pairSessions } from './unified-corpus.mjs';

const ROOT = process.cwd();
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = ['js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'];
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, Date, isFinite, isNaN, parseInt, parseFloat, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(read(f), ctx, { filename: f });
const engine = ctx.UnifiedClassificationEngine;
const OPTS = { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true };

const only = process.argv[2] || null;
const counts = new Map();
const bump = k => counts.set(k, (counts.get(k) || 0) + 1);
let measured = 0;
for (const pair of discoverFixturePairs({ logDir: path.join(ROOT, 'logs') })) {
  if (only && pair.label !== only) continue;
  const sessions = pairSessions(
    splitSessions(read(path.join('logs', pair.server))),
    splitSessions(read(path.join('logs', pair.local))),
  );
  for (let i = 0; i < sessions.length; i++) {
    let u;
    try { u = engine.classifyUnified(sessions[i].sv.text, sessions[i].lc.text, OPTS); }
    catch (err) { console.log(`${pair.label} S${i}: ERRO ${err.message}`); continue; }
    if (u.error) continue;
    measured++;
    const c = u._context || {};
    const L = u.leechSetup || {};
    const out = [];
    const add = (k, v) => { if (v != null && v !== '' && v !== false) { out.push(`${k}=${v}`); bump(k); } };
    add('bmPierce', u.bmPierce || null);
    add('weaponPierce', u.weaponPhysicalPierce || null);
    add('bestiary', (u.bestiaryClassDamageBonus || {}).bonus ? `${u.bestiaryClassDamageBonus.bonus}/${u.bestiaryClassDamageBonus.class}` : null);
    add('omega', (c.omegaSetup || {}).active ? c.omegaSetup.multiplier : null);
    add('bountyDamage', ((u.bountyTalismanSetup || {}).damage || {}).multiplier || null);
    add('bountyLife', ((u.bountyTalismanSetup || {}).life || {}).level || null);
    add('ewManaPerk', L.exposeWeaknessManaPerk || null);
    add('vampiric', L.vampiricMob ? `${L.vampiricMob}+${L.vampiricBonus}` : null);
    add('voids', L.voidsMob ? `${L.voidsMob}+${L.voidsBonus}` : null);
    add('lifeBase', L.lifeBase || null);
    add('manaBase', L.manaBase || null);
    add('leechConf', L.confidence || null);
    add('combatMastery', (c.combatMasteryLadder || {}).active ? `step=${c.combatMasteryLadder.step} ceil=${c.combatMasteryLadder.ceiling}` : null);
    const st = u.stanceSetup || c.stanceSetup || {};
    add('stance', st.hasStanceCasts ? `${(st.timeline || []).length} trocas` : null);
    add('gravSan', ((u.gravSanSetup || {}).windows || []).length ? `${u.gravSanSetup.windows.length}j/${u.gravSanSetup.source}` : null);
    add('crit', (c.critSetup || {}).multiplier ? `${c.critSetup.multiplier}` : null);
    add('aaElement', u.aaElement && u.aaElement !== 'physical' ? u.aaElement : null);
    add('execTiers', (c.executionerTiers && (c.executionerTiers.size || Object.keys(c.executionerTiers).length)) || null);
    add('terraBurst', (c.terraBurstSetup || {}).level || null);
    console.log(`${pair.label} S${i} [${u.vocation}] ${out.join('  ')}`);
  }
}
console.log(`\n=== ${measured} sessoes ===`);
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
