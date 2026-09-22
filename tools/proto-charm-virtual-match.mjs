// PROTOTYPE — throwaway. Os procs de charm que NAO tem hit de dano seguinte no mesmo
// mob/segundo casam com um hit VIRTUAL (dano 0, charm-kill, S-014e) que o motor criou?
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js','js/unified-main.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
function firstSession(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const out = []; let on = false;
  for (const l of lines) { if (HEADER_RE.test(l)) { if (on) break; on = true; } if (on) out.push(l); }
  return out.length ? out.join('\n') : text;
}
const [svP, lcP] = process.argv.slice(2);
const u = ctx.UnifiedMainClassifier.classifyUnified(firstSession(read(svP)), firstSession(read(lcP)));
if (u.error) { console.error(u.error); process.exit(1); }
const evs = u.facts.server.events || [];
const compOf = new Map(); let virtuals = 0;
const virtualKeys = new Set();
for (const t of u.turns || []) for (const c of t.components || []) for (const h of c.hits || []) {
  const label = c.actionLabel || c.label || c.comp;
  compOf.set(h.id, label);
  if (h.virtual) { virtuals++; virtualKeys.add(h.ts + '|' + (h.mob || '')); }
}
let total = 0, viaDamage = 0, viaVirtual = 0, orphan = 0;
const orphans = [];
for (let i = 0; i < evs.length; i++) {
  const e = evs[i]; if (e.kind !== 'charm') continue;
  total++;
  let j = i + 1; while (j < evs.length && evs[j].kind !== 'hit') j++;
  const nx = evs[j];
  if (nx && nx.ts === e.ts && nx.mob === e.mob && compOf.has(nx.id)) { viaDamage++; continue; }
  if (virtualKeys.has(e.ts + '|' + e.mob) || virtualKeys.has(e.ts + '|')) { viaVirtual++; continue; }
  orphan++; orphans.push(e.clock + ' ' + e.mob + ' ' + e.dmg);
}
console.log(path.basename(svP));
console.log('  procs de charm:', total);
console.log('  hits virtuais criados pelo motor (sessao):', virtuals);
console.log('  atribuiveis por hit de dano adjacente:', viaDamage);
console.log('  atribuiveis por hit VIRTUAL no mesmo mob/segundo:', viaVirtual);
console.log('  sem atribuicao:', orphan, orphans.slice(0, 10).join(' | '));
