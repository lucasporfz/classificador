#!/usr/bin/env node
// diag-turn.mjs — dump detalhado de turnos por ts: por hit mostra dmg, revertedDmg, holyOriginal,
// physicalOriginal (e O físico armor-revertido), crit/overkill, mob, e o rótulo final + razão.
// Uso: node tools/diag-turn.mjs "logs/sv.txt" "logs/lc.txt" HH:MM:SS[,HH:MM:SS,...]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const ctx = { console: { log(){}, warn(){}, error(){} }, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date };
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js',
                 'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
}
const [svP, lcP, tsArg] = process.argv.slice(2);
const targets = (tsArg || '').split(',').map(s => { const m = /^(\d\d):(\d\d):(\d\d)$/.exec(s.trim()); return m ? +m[1]*3600 + +m[2]*60 + +m[3] : null; }).filter(x => x != null);

// rótulos FINAIS de produção (turnTrace) + originais crus (capture, pré-passes mas com holyO/physO).
const cap = [];
const res = ctx.classifyWithLocalChat(read(svP), read(lcP), { trace: true, __captureInputs: cap });
const rawByKey = new Map();
for (const t of (cap[0] ? cap[0].turns : [])) for (const l of t.lines) rawByKey.set(l.ts + '.' + (l.seq||0), l);

const armorParam = mob => { const m = ctx.getMobElementMods(mob); return m ? { r: Math.floor((m.armor||0)/2), R: 2*Math.floor((m.armor||0)/2)-1, res: m.physicalDmgMod||1, holyMod: m.holyDmgMod, mit: m.mitigation } : null; };
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
function halfToFloat(h) {
  const s = (h & 0x8000) ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}
function f16(x) {
  if (Math.f16round) return Math.f16round(x);
  const f32 = new Float32Array(1);
  const i32 = new Int32Array(f32.buffer);
  f32[0] = x;
  const bits = i32[0];
  const sign = (bits >> 16) & 0x8000;
  let val = (bits & 0x7fffffff) + 0x1000;
  if (val >= 0x47800000) {
    if ((bits & 0x7fffffff) >= 0x47800000) {
      if (val < 0x7f800000) return sign ? -Infinity : Infinity;
      return NaN;
    }
    return sign ? -65504 : 65504;
  }
  if (val >= 0x38800000) return halfToFloat(sign | ((val - 0x38000000) >> 13));
  if (val < 0x33000000) return sign ? -0 : 0;
  val = (bits & 0x7fffffff) >> 23;
  return halfToFloat(sign | ((((bits & 0x7fffff) | 0x800000) + (0x800000 >> (val - 102))) >> (126 - val)));
}
function physicalCandidates(raw) {
  if (!raw || raw.overkill) return [];
  const m = ctx.getMobElementMods(raw.mob);
  if (!m || !(m.physicalDmgMod > 0)) return [];
  const res = ctx.rpPiercedMod ? ctx.rpPiercedMod(m.physicalDmgMod, ctx.rpBmForElement ? ctx.rpBmForElement('physicalDmgMod') : 0) : m.physicalDmgMod;
  const r = Math.floor((m.armor || 0) / 2);
  const R = 2 * r - 1;
  const prey = raw.isPrey ? 1.25 : 1;
  const amp = (raw.realCrit || raw.onslaught) && ctx.rpAmplificationDivisor ? ctx.rpAmplificationDivisor(raw, 0) : 1;
  const forward = (O, armorRoll) => {
    let x = Math.floor(O * amp * res);
    x = Math.max(0, x - armorRoll);
    x = Math.floor(x * (1 - f16((m.mitigation || 0) / 100)));
    if (prey !== 1) x = Math.floor(x * prey);
    return x;
  };
  let lo = null, hi = null;
  for (let O = 1; O <= 5000; O++) {
    const withMinArmor = forward(O, r);
    if (lo == null && withMinArmor >= raw.dmg) lo = O;
    const withMaxArmor = forward(O, R);
    if (withMaxArmor <= raw.dmg) hi = O;
    if (lo != null && withMinArmor > raw.dmg + 100 && withMaxArmor > raw.dmg) break;
  }
  return lo != null && hi != null && lo <= hi ? [lo, hi] : [];
}
const fmtCandidates = xs => {
  if (!xs.length) return '-';
  const contiguous = xs.every((v, i) => i === 0 || v === xs[i - 1] + 1);
  if (contiguous) return `[${xs[0]},${xs[xs.length - 1]}]`;
  if (xs.length <= 12) return xs.join(',');
  return `[${xs[0]},${xs[xs.length - 1]}]*`;
};

for (const tgt of targets) {
  const tr = (res.turnTrace || []).find(t => t.ts === tgt);
  console.log(`\n=== turno ${fmt(tgt)} (ts=${tgt}) ===`);
  if (!tr) { console.log('  (turno não alinhado)'); continue; }
  console.log(`  rótulo PROD: AA=${tr.counts.arrow} spell=${tr.counts.spell} rune=${tr.counts.rune} gren=${tr.counts.grenade}  spell=${tr.spell||'-'}`);
  console.log('  ' + 'ts.seq'.padEnd(11) + 'mob'.padEnd(18) + 'dmg'.padStart(6) + 'revDmg'.padStart(7) + 'holyO'.padStart(7) + 'physO'.padStart(7) + 'O_fis_disc'.padStart(14) + '  flags   comp(PROD)');
  const lines = tr.lines.slice().sort((a, b) => (a.ts - b.ts) || ((a.seq||0)-(b.seq||0)));
  for (const l of lines) {
    const raw = rawByKey.get(l.ts + '.' + (l.seq||0)) || {};
    const oFis = fmtCandidates(physicalCandidates(raw));
    const flags = (l.realCrit?'crit ':'') + (l.onslaught?'ons ':'') + (l.ok?'OK ':'');
    console.log('  ' + (fmt(l.ts)+'.'+(l.seq||0)).padEnd(11) + String(l.mob).padEnd(15) +
      String(l.dmg).padStart(6) +
      String(Math.round(l.base||l.dmg)).padStart(7) +
      String(raw.holyOriginal>0?Math.round(raw.holyOriginal):'-').padStart(7) +
      String(raw.physicalOriginal>0?Math.round(raw.physicalOriginal):'-').padStart(7) +
      oFis.padStart(12) +
      '  ' + flags.padEnd(8) + (l.comp||'-'));
  }
}
