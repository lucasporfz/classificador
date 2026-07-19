#!/usr/bin/env node
// barrage-validate.mjs — valida o EIXO 2-FÍSICO (AA × Ethereal Barrage) contra o log REAL
// `barrage` (exori dir moe). Para cada turno de Barrage, separa AA × Barrage pela INTERSEÇÃO do
// original implícito O após reverter a subtração de armadura, e compara com o rótulo do legado.
//   O ∈ [ pO + r/res , pO + R/res ],  pO = physicalOriginal (já reverte crit/prey/mit/res, sem armor),
//   r = floor(armor/2), R = 2r−1, res = physicalDmgMod.  (doc §1/§5; crit cancela na reversão.)
// Uso: node tools/barrage-validate.mjs ["logs/barrage Server Log.txt" "logs/barrage local chat.txt"]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');

const ctx = { console: { log(){}, warn(){}, error(){} }, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date };
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js',
                 'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
}
const argv = process.argv.slice(2);
const svP = argv[0] || 'logs/barrage Server Log.txt';
const lcP = argv[1] || 'logs/barrage local chat.txt';

// roda 1× capturando os inputs crus (lines c/ physicalOriginal) + os rótulos legados (turnTrace).
const cap = [];
const res = ctx.classifyWithLocalChat(read(svP), read(lcP), { trace: true, __captureInputs: cap });
if (!res || res.error) { console.error('erro: ' + (res && res.error)); process.exit(1); }
const inp = cap[0];
const DIR_MOE = 'exori dir moe';
const dirCasts = inp.playerSpellCasts.filter(c => c.text === DIR_MOE);

// O-interval por hit físico
const armorParam = mob => { const m = ctx.getMobElementMods(mob); if (!m) return null; return { r: Math.floor(m.armor / 2), R: 2 * Math.floor(m.armor / 2) - 1, res: m.physicalDmgMod || 1 }; };
function oInterval(l) {
  if (l.overkill) return null; // dano truncado: original não recuperável (doc)
  const p = armorParam(l.mob); if (!p) return null;
  const pO = l.physicalOriginal; if (!(pO > 0)) return null;
  return [pO + p.r / p.res, pO + p.R / p.res];
}
const oCenter = iv => (iv[0] + iv[1]) / 2;
const intersect = (a, b) => { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); return lo <= hi ? [lo, hi] : null; };

// Um turno de Barrage tem ≤2 componentes físicos (AA-area + Barrage). Separa em ≤2 grupos pelo
// MAIOR salto de O onde os intervalos deixam de se sobrepor (níveis distintos). Sem salto distinto
// ⇒ 1 grupo (tudo AA; Barrage errou ou está na zona ambígua do doc §5). Robusto a ruído (não
// fragmenta como a acumulação gulosa). AA = grupo de O MENOR (sempre presente); Barrage = O maior.
function segment(hits) {
  const valid = hits.filter(h => h.iv);
  if (valid.length < 2) return [hits];
  const sorted = valid.slice().sort((a, b) => (a.iv[0] + a.iv[1]) - (b.iv[0] + b.iv[1]));
  let bestGap = -Infinity, splitAt = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].iv[0] - sorted[i].iv[1]; // >0 ⇒ intervalos não se sobrepõem (distinto)
    if (gap > 0 && gap > bestGap) { bestGap = gap; splitAt = i; }
  }
  if (splitAt < 0) return [hits]; // nenhum corte com níveis distintos ⇒ tudo AA
  const loSet = new Set(sorted.slice(0, splitAt + 1)); // O menor = AA
  const aa = [], bar = [];
  for (const h of hits) (h.iv && loSet.has(h) ? aa : (h.iv ? bar : aa)).push(h);
  return [aa, bar];
}

// rótulos legados por linha (ts.seq -> comp)
const legacy = new Map();
const legacyTurnSpell = new Map(); // ts -> spell label
for (const tr of (res.turnTrace || [])) {
  for (const l of tr.lines) legacy.set(l.ts + '.' + (l.seq || 0), l.comp);
  if (tr.spell) legacyTurnSpell.set(tr.ts, tr.spell);
}

const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

let turnsChecked = 0, splitTurns = 0, agree = 0, totalHits = 0, hitAgree = 0;
const aaLevels = [], barLevels = [];
for (const t of inp.turns) {
  const cast = dirCasts.find(c => c.ts >= t.ts - 1 && c.ts <= t.ts + 2);
  if (!cast || legacyTurnSpell.get(t.ts) !== DIR_MOE) continue;
  const phys = (t.lines || [])
    .filter(l => { const c = legacy.get(l.ts + '.' + (l.seq || 0)); return c === 'arrow' || c === 'spell'; })
    .map(l => ({ ...l, iv: oInterval(l), comp: legacy.get(l.ts + '.' + (l.seq || 0)) }))
    .sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
  const clean = phys.filter(h => h.iv);
  if (clean.length < 3) continue;
  turnsChecked++;
  const groups = segment(phys);
  if (groups.length === 2 && groups[1].some(h => h.iv)) {
    splitTurns++;
    aaLevels.push(mean(groups[0].filter(h => h.iv).map(h => oCenter(h.iv))));
    barLevels.push(mean(groups[1].filter(h => h.iv).map(h => oCenter(h.iv))));
  }
  // concordância secundária com o legado (que pode estar errado p/ físico — só referência)
  const fis = new Map();
  groups.forEach((g, gi) => g.forEach(h => fis.set(h.ts + '.' + (h.seq || 0), gi === 0 ? 'arrow' : 'spell')));
  let ok = true;
  for (const h of clean) { totalHits++; if (fis.get(h.ts + '.' + (h.seq || 0)) === h.comp) hitAgree++; else ok = false; }
  if (ok) agree++;
}

console.log(`Barrage: jogador=${res.player}  casts exori dir moe=${dirCasts.length}`);
console.log(`turnos de Barrage analisados: ${turnsChecked}  | com 2 níveis físicos distintos: ${splitTurns}`);
console.log('\n=== VALIDAÇÃO: consistência interna do eixo físico (sem depender do legado) ===');
console.log(`  nível O do AA (diamond arrows): média=${Math.round(mean(aaLevels))}  desvio=${std(aaLevels).toFixed(1)}  (n=${aaLevels.length})`);
console.log(`  nível O do Barrage:             média=${Math.round(mean(barLevels))}  desvio=${std(barLevels).toFixed(1)}  (n=${barLevels.length})`);
console.log(`  separação Barrage/AA: ${(mean(barLevels) - mean(aaLevels)).toFixed(0)} de dano (${(mean(barLevels) / mean(aaLevels)).toFixed(2)}×)`);
const cvAA = std(aaLevels) / mean(aaLevels), cvBar = std(barLevels) / mean(barLevels);
console.log(`  coef. de variação: AA=${(cvAA * 100).toFixed(1)}%  Barrage=${(cvBar * 100).toFixed(1)}%  (níveis estáveis ⇒ separação válida)`);
console.log(`\n  (ref.) concordância c/ legado: turnos ${agree}/${turnsChecked} hits ${hitAgree}/${totalHits} — legado é POUCO confiável aqui (separação por timing falha no mesmo segundo)`);
