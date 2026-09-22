#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #14) — agrega o CSV de proto-samemob-dispersion.mjs.
import fs from 'node:fs';

const files = process.argv.slice(2);
const rows = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').trim().split(/\r?\n/);
  const cols = lines[0].split(',');
  for (const l of lines.slice(1)) {
    const v = l.split(',');
    const o = {};
    cols.forEach((c, i) => { const n = Number(v[i]); o[c] = (v[i] !== '' && !Number.isNaN(n)) ? n : v[i]; });
    rows.push(o);
  }
}

const med = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

function table(title, sel) {
  const r = rows.filter(sel);
  console.log(`\n### ${title} — ${r.length} grupos`);
  if (!r.length) return;
  const nz = r.filter(x => x.residual > 0);
  console.log(`  residual>0: ${nz.length} (${(100 * nz.length / r.length).toFixed(1)}%)  | residual mediano(nz)=${med(nz.map(x => x.residual))}  p90=${pct(nz.map(x => x.residual), 0.9)}`);
  const byMob = new Map();
  for (const x of r) {
    if (!byMob.has(x.mob)) byMob.set(x.mob, []);
    byMob.get(x.mob).push(x);
  }
  const out = [];
  for (const [mob, g] of byMob) {
    if (g.length < 8) continue;
    const z = g.filter(x => x.residual > 0);
    out.push({
      mob, n: g.length, armorWO: g[0].armorWO, viol: z.length,
      pctViol: +(100 * z.length / g.length).toFixed(1),
      medRes: med(z.map(x => x.residual)),
      resOverArmor: z.length ? +(med(z.map(x => x.residual)) / g[0].armorWO).toFixed(3) : 0,
      medDmg: med(g.map(x => x.medDmg)),
      resOverDmgPct: z.length ? +(100 * med(z.map(x => x.residual / x.medDmg))).toFixed(2) : 0,
    });
  }
  out.sort((a, b) => a.armorWO - b.armorWO);
  console.log('  mob                        n   armorW(O)  viol%   medResid  resid/armorW  medDmg  resid/dmg%');
  for (const o of out) {
    console.log(`  ${o.mob.padEnd(26)} ${String(o.n).padStart(4)}  ${String(o.armorWO).padStart(8)}  ${String(o.pctViol).padStart(5)}  ${String(o.medRes).padStart(8)}  ${String(o.resOverArmor).padStart(12)}  ${String(o.medDmg).padStart(6)}  ${String(o.resOverDmgPct).padStart(9)}`);
  }
}

table('FISICO k>=3 (isencao de AA aplicada)', x => x.axis === 'physical' && x.k >= 3);
table('FISICO k==2 (a familia — AA nao separavel)', x => x.axis === 'physical' && x.k === 2);
table('FISICO k>=3 PURO (1 acao no turno, mesmo segundo)', x => x.axis === 'physical' && x.k >= 3 && x.nActions === 1 && x.oneSecond === 1);
table('FISICO k>=3, 1 acao no turno (qualquer segundo)', x => x.axis === 'physical' && x.k >= 3 && x.nActions === 1);
table('FISICO k>=4 PURO (1 acao, mesmo segundo)', x => x.axis === 'physical' && x.k >= 4 && x.nActions === 1 && x.oneSecond === 1);
table('ELEMENTAL k>=3 (controle)', x => x.axis === 'elemental' && x.k >= 3);
table('ELEMENTAL k==2 (controle)', x => x.axis === 'elemental' && x.k === 2);

// correlacao: residual vs armorWO e residual vs medDmg (so fisico, k>=3, residual>0)
const s = rows.filter(x => x.axis === 'physical' && x.k >= 3 && x.residual > 0);
function corr(a, b) {
  const n = a.length; if (n < 3) return 0;
  const ma = a.reduce((p, c) => p + c, 0) / n, mb = b.reduce((p, c) => p + c, 0) / n;
  let sab = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; sa += da * da; sb += db * db; }
  return sa && sb ? +(sab / Math.sqrt(sa * sb)).toFixed(3) : 0;
}
console.log(`\n### correlacao (fisico, k>=3, residual>0, n=${s.length})`);
console.log(`  r(residual, armorW_O) = ${corr(s.map(x => x.residual), s.map(x => x.armorWO))}`);
console.log(`  r(residual, medDmg)   = ${corr(s.map(x => x.residual), s.map(x => x.medDmg))}`);

// quanto de armor extra fecharia tudo?
const need = rows.filter(x => x.axis === 'physical' && x.k >= 3).map(x => x.residual);
console.log(`\n### largura extra de armor (em O) que fecharia o residual, fisico k>=3`);
for (const p of [0.5, 0.75, 0.9, 0.95, 0.99]) console.log(`  p${(p * 100).toFixed(0)} = ${pct(need, p)}`);
console.log(`  max = ${Math.max(...need)}`);
