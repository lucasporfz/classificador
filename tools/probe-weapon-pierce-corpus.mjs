#!/usr/bin/env node
// Varredura de M-040 por sessao: em QUAIS sessoes do corpus o detector seleciona 0,09, e
// com que corroboracao. Existe porque "zero drift fora de moonsilver" NAO prova que
// nenhuma outra sessao selecionou o perk -- uma sessao pode seleciona-lo e classificar
// igual. E o risco declarado em M-040 (tier unico com so dois tiers).
//
// Usa o pareamento CANONICO do corpus (`pairSessions`, por data + saveSec), o mesmo do
// dump. Parear por indice descarta 30 sessoes com `log_too_short` nos fixtures cujo numero
// de sessoes de server e local difere (bakra, drome, jaded, mazzerinbarrage, darklight).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { splitSessions, pairSessions } from './unified-corpus.mjs';

const ROOT = process.cwd();
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const FILES = ['js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'];
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, Date, isFinite, isNaN, parseInt, parseFloat, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of FILES) vm.runInContext(read(f), ctx, { filename: f });
const engine = ctx.UnifiedClassificationEngine;
const OPTS = { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true };

const bySource = new Map();
const selected = [];
let measured = 0, errors = 0;
for (const pair of discoverFixturePairs({ logDir: path.join(ROOT, 'logs') })) {
  const sessions = pairSessions(
    splitSessions(read(path.join('logs', pair.server))),
    splitSessions(read(path.join('logs', pair.local))),
  );
  for (let i = 0; i < sessions.length; i++) {
    let u;
    try { u = engine.classifyUnified(sessions[i].sv.text, sessions[i].lc.text, OPTS); }
    catch (err) { errors++; console.log(`${pair.label} S${i}: ERRO ${err.message}`); continue; }
    if (u.error) { errors++; console.log(`${pair.label} S${i}: ERRO ${u.error}`); continue; }
    measured++;
    const d = u.weaponPhysicalPierceDetection || {};
    bySource.set(d.source, (bySource.get(d.source) || 0) + 1);
    if (u.weaponPhysicalPierce > 0) {
      const c = d.corroboration || {};
      selected.push(`${pair.label} S${i}: pierce=${u.weaponPhysicalPierce} blocos=${c.blocks} turnos=${c.turns} mobs=${c.mobs} (de ${c.eligibleBlocks} elegiveis)`);
      console.log('SELECIONOU  ' + selected[selected.length - 1]);
    }
  }
}
console.log(`\n=== ${measured} sessoes medidas, ${errors} com erro ===`);
for (const [k, v] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\nsessoes com perk selecionado: ${selected.length}`);
for (const s of selected) console.log('  ' + s);
