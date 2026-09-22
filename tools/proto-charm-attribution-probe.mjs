// PROTOTYPE — throwaway. Mede se da pra atribuir dano de charm ao componente que o
// disparou: o charm vem logo apos um hit no mesmo mob? esse mob levou hits de mais de
// um componente no mesmo turno (ambiguidade)?
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js','js/unified-main.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,Sept:8 };
function splitSessions(text) {
  const sessions = []; let cur = null; const pre = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) { if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else if (cur) cur.lines.push(line); else pre.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  if (!sessions.length) sessions.push({ header:'', text: pre.join('\n') });
  return sessions;
}
const [svP, lcP] = process.argv.slice(2);
const sv = splitSessions(read(svP))[0], lc = splitSessions(read(lcP))[0];
const u = ctx.UnifiedMainClassifier.classifyUnified(sv.text, lc.text);
if (u.error) { console.error(u.error); process.exit(1); }
const server = u.facts.server;

// mapa hit.id -> componente resolvido
const compOf = new Map();
for (const t of u.turns || []) for (const c of t.components || []) for (const h of c.hits || [])
  compOf.set(h.id, c.actionLabel || c.label || c.comp);

const evs = server.events || [];
let total = 0, prevIsHitSameMob = 0, prevHitResolved = 0, ambiguous = 0, noPrev = 0;
const byComp = new Map();
for (let i = 0; i < evs.length; i++) {
  const e = evs[i];
  if (e.kind !== 'charm') continue;
  total++;
  // hit SEGUINTE (o charm e logado ANTES do hit que o disparou)
  let j = i + 1; while (j < evs.length && evs[j].kind !== 'hit') j++;
  if (j >= evs.length) { noPrev++; continue; }
  const prev = evs[j];
  if (prev.mob !== e.mob || prev.ts !== e.ts) { noPrev++; continue; }
  prevIsHitSameMob++;
  const comp = compOf.get(prev.id);
  if (!comp) continue;
  prevHitResolved++;
  byComp.set(comp, (byComp.get(comp) || 0) + e.dmg);
  // ambiguidade: esse mob levou hits de >1 componente nesse mesmo segundo?
  const comps = new Set();
  for (const k of evs) if (k.kind === 'hit' && k.ts === e.ts && k.mob === e.mob && compOf.has(k.id)) comps.add(compOf.get(k.id));
  if (comps.size > 1) ambiguous++;
}
console.log(path.basename(svP));
console.log('  procs de charm:', total);
console.log('  hit anterior no mesmo mob/segundo:', prevIsHitSameMob, '(' + (100*prevIsHitSameMob/total).toFixed(1) + '%)');
console.log('  sem hit anterior compativel:', noPrev);
console.log('  hit anterior tem componente resolvido:', prevHitResolved);
console.log('  AMBIGUO (mob levou >1 componente no mesmo segundo):', ambiguous, '(' + (100*ambiguous/Math.max(1,prevHitResolved)).toFixed(1) + '% dos atribuiveis)');
console.log('  atribuicao por componente:', JSON.stringify(Object.fromEntries(byComp)));
