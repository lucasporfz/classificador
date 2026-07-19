#!/usr/bin/env node
// diag-leech-cardinality.mjs — dump do modelo mecanico de leech (D-020..D-027)
// para um turno: setup inferido, por hit life/mana + intervalos de Dreal por N,
// e teste explicito das particoes contiguas por cardinalidade de leech.
// Uso: node tools/diag-leech-cardinality.mjs "logs/sv.txt" "logs/lc.txt" HH:MM:SS
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ctx = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array, globalThis: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['js/experimental-classification-core.js', 'js/stats.js', 'js/mob-element-mods.js',
                 'js/rp-grenade-peak.js', 'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
  vm.runInContext(read(f), ctx, { filename: f });
}
const CORE = ctx.ExperimentalClassificationCore;

const [svP, lcP, tsArg] = process.argv.slice(2);
const toSec = s => { const m = /^(\d\d):(\d\d):(\d\d)$/.exec((s || '').trim()); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null; };
const target = toSec(tsArg);

function splitSessions(text) {
  const sessions = []; let cur = null;
  for (const line of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
    if (/^Channel .+ saved /.test(line)) { if (cur) sessions.push(cur); cur = { lines: [line] }; }
    else if (cur) cur.lines.push(line);
  }
  if (cur) sessions.push(cur);
  if (!sessions.length) sessions.push({ lines: String(text || '').split(/\r?\n/) });
  return sessions.map(s => s.lines.join('\n'));
}
const svSessions = splitSessions(read(svP));
const lcSessions = splitSessions(read(lcP));
let svText = svSessions[0], lcText = lcSessions[0];
for (let i = 0; i < svSessions.length; i++) {
  if (new RegExp('^' + tsArg, 'm').test(svSessions[i])) { svText = svSessions[i]; lcText = lcSessions[Math.min(i, lcSessions.length - 1)]; break; }
}

const cap = [];
ctx.classifyWithLocalChat(svText, lcText, { trace: true, __captureInputs: cap });
const turns = cap[0] ? cap[0].turns : [];
const allRaw = [];
for (const t of turns) for (const l of t.lines || []) allRaw.push(l);
const setup = CORE.inferSessionLeechSetup(allRaw);
console.log('leechSetup inferido (D-020):', JSON.stringify(setup));
console.log('LIFE_BASE_CANDIDATES:', JSON.stringify(CORE.LIFE_BASE_CANDIDATES));
console.log('MANA_BASE_CANDIDATES:', JSON.stringify(CORE.MANA_BASE_CANDIDATES));

const turn = turns.find(t => t.ts === target);
if (!turn) { console.log('turno nao encontrado'); process.exit(1); }
const lines = (turn.lines || []).slice().sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));

function leechHit(raw, voidsBonus, vampiricBonus) {
  const main = CORE.isMainLeechHit(raw);
  const life = CORE.absoluteLeech(raw.lifeLeech, raw.isPrey) || 0;
  const mana = CORE.absoluteLeech(raw.manaLeech, raw.isPrey) || 0;
  return { mob: raw.mob, dmg: +raw.dmg || 0, overkill: !!raw.overkill, life, mana,
    vampiricBonus: vampiricBonus || 0, voidsBonus: voidsBonus || 0, usableLeech: !!(main && (life > 0 || mana > 0)) };
}

console.log('\n=== hits do turno ' + tsArg + ' ===');
const hits = lines.map(l => leechHit(l));
for (let i = 0; i < hits.length; i++) {
  const h = hits[i];
  console.log(`hit[${i}] mob=${h.mob} dmg=${h.dmg} ok=${h.overkill} life=${h.life} mana=${h.mana} L/M=${(h.life / h.mana).toFixed(3)} usable=${h.usableLeech}`);
  for (const n of [1, 2, 3, 4]) {
    const iv = CORE.hitRealInterval(h, setup, n);
    const lifeIv = setup ? intervalOf(h.life, CORE.effectiveLeech(setup.lifeBase, h.vampiricBonus), n) : null;
    const manaIv = setup ? intervalOf(h.mana, CORE.effectiveLeech(setup.manaBase, h.voidsBonus), n) : null;
    console.log(`   N=${n} F=${CORE.areaFactor(n).toFixed(4)}  lifeDreal=${fmtIv(lifeIv)} manaDreal=${fmtIv(manaIv)} cross=${fmtIv(iv)} acceptsN(dmg<=max)=${iv ? (h.dmg <= iv[1]) : false}`);
  }
}

function intervalOf(observed, effLeech, n) {
  if (!(observed > 0) || !(effLeech > 0) || !(n >= 1)) return null;
  const lf = effLeech * CORE.areaFactor(n);
  const min = Math.floor((observed - 1) / lf) + 1;
  const max = Math.floor(observed / lf);
  return max >= min ? [min, max] : null;
}
function fmtIv(iv) { return iv ? `[${iv[0]},${iv[1]}]` : '-'; }

// Veredito do teste geral de cardinalidade por leech.
if (hits.length === 2) {
  const area = CORE.leechBlockFit(hits, setup, [2, 2]);
  const split = CORE.leechBlockFit(hits, setup, [1, 1]);
  console.log('\n=== leechCardinalityPartition ===');
  console.log('area (N=2):', JSON.stringify(area));
  console.log('split(N=1):', JSON.stringify(split));
  for (let i = 0; i < hits.length; i++) {
    console.log(`  cc hit[${i}] N=2:`, JSON.stringify(CORE.leechCrossConsistency(hits[i], setup, 2)));
    console.log(`  cc hit[${i}] N=1:`, JSON.stringify(CORE.leechCrossConsistency(hits[i], setup, 1)));
  }
  console.log('verdict:', JSON.stringify(CORE.leechCardinalityPartition(hits, setup)));
}

// Void's Call: bonus maximo +1.6% — testa se fecha a conta do hit anomalo.
console.log('\n=== teste Void’s Call no hit anomalo (mana) ===');
for (let i = 0; i < hits.length; i++) {
  const h = hits[i];
  for (const vb of CORE.VOIDS_CALL) {
    const manaE = CORE.effectiveLeech(setup.manaBase, vb);
    const manaIv = intervalOf(h.mana, manaE, 1);
    const lifeIv = intervalOf(h.life, setup.lifeBase, 1);
    const cross = manaIv && lifeIv ? (Math.max(manaIv[0], lifeIv[0]) <= Math.min(manaIv[1], lifeIv[1])) : false;
    console.log(`hit[${i}] Void+${vb} manaBase=${manaE.toFixed(4)} manaDreal(N1)=${fmtIv(manaIv)} lifeDreal(N1)=${fmtIv(lifeIv)} life∩mana=${cross}`);
  }
}
