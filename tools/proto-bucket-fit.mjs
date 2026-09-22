#!/usr/bin/env node
// PROTOTIPO: ajusta o modelo de buckets do tibiatools por personagem/sessao.
//   O(j) = flat + ROUND(step * (Peff - B/2 + j)),  j = 0..B,  step = ml/25 + 0.25
// Le reports/bucket-histogram.json (gerado por proto-bucket-histogram.mjs --json).
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('reports/bucket-histogram.json', 'utf8'));

const bySession = new Map();
for (const r of rows) {
  const k = `${r.fixture} S${r.session}`;
  if (!bySession.has(k)) bySession.set(k, []);
  bySession.get(k).push(r);
}

for (const [k, rs] of bySession) {
  const el = rs.filter(r => r.axis === 'elemental' && r.spec && r.spec.buckets > 0);
  if (!el.length) continue;
  // step: media dos fits com score alto e amostragem boa
  const good = el.filter(r => r.fit && r.fit.score >= 0.45 && r.n >= 100 && r.distinct >= r.spec.buckets * 0.5);
  const step = good.length ? good.reduce((a, r) => a + r.fit.step, 0) / good.length : null;
  console.log(`\n===== ${k} =====`);
  console.log(`step estimado = ${step ? step.toFixed(3) : 'n/d'}  (de ${good.map(r => r.label.replace(/ \(.*/, '')).join(', ') || '-'})  =>  magic level ~ ${step ? Math.round(25*(step-0.25)) : '?'}`);
  console.log(`${'spell'.padEnd(24)} ${'B'.padStart(4)} ${'hits'.padStart(5)} ${'span'.padStart(6)} ${'B_obs'.padStart(6)} ${'cobertura'.padStart(9)}  O observado`);
  for (const r of el.sort((a,b)=>b.n-a.n)) {
    const B = r.spec.buckets;
    const bObs = step ? r.span / step : null;
    const cov = step ? (r.span / (B * step)) : null;
    console.log(`${r.label.replace(/ \(.*/,'').padEnd(24)} ${String(B).padStart(4)} ${String(r.n).padStart(5)} ${String(r.span).padStart(6)} ${(bObs==null?'-':bObs.toFixed(1)).padStart(6)} ${(cov==null?'-':(cov*100).toFixed(0)+'%').padStart(9)}  [${r.min}..${r.max}]`);
  }
}
