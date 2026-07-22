#!/usr/bin/env node
// Sonda de diagnóstico (Fase 2) — NÃO é ferramenta de validação.
// Para cada turno alvo, testa se algum ELEMENTO fecha o bloco de AA, usando a
// mesma reversão elemental do motor (UnifiedFormulas.elementalOriginalCandidates)
// e o mesmo contexto que a validação usa. Responde: "o AA deste log é físico?"
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const [svP, lcP] = process.argv.slice(2);
if (!svP || !lcP) { console.error('Uso: node tools/probe-thunder-element.mjs "logs/sv.txt" "logs/lc.txt"'); process.exit(1); }
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

const u = ctx.UnifiedClassificationEngine.classifyUnified(read(svP), read(lcP), {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});
if (u.error) { console.error('ERRO do motor:', u.error); process.exit(1); }

const ELEMENTS = ['physical', 'holy', 'ice', 'fire', 'energy', 'earth', 'death'];
const F = ctx.UnifiedFormulas;
const context = u._context || null;
if (!context) { console.error('motor não expôs contexto; keys=' + Object.keys(u).join(',')); process.exit(1); }

// Turnos "família A": unresolved cujo único bloco candidato é um arrow único
// (sem cast na janela) — a hipótese testada só faz sentido nesses.
const targets = (u.turns || []).filter(t => t.status !== 'resolved'
  && (t.rejected || []).length === 1
  && (t.rejected[0].violations || []).every(v => v.reason === 'physical_intersection_empty'));

console.log(`turnos família A: ${targets.length}\n`);
const tally = Object.fromEntries(ELEMENTS.map(e => [e, 0]));

for (const t of targets) {
  const hits = (t.components || []).flatMap(c => c.hits || []);
  const row = [];
  for (const el of ELEMENTS) {
    let inter = null, known = true;
    for (const h of hits) {
      let set;
      if (el === 'physical') {
        const r = F.physicalOriginalInterval(h, context);
        if (!r.known || !r.interval) { known = false; break; }
        set = new Set(); for (let v = r.interval[0]; v <= r.interval[1]; v++) set.add(v);
      } else {
        const r = F.elementalOriginalCandidates(h, el, context, null);
        if (!r.known || !r.originals || !r.originals.length) { known = false; break; }
        set = new Set(r.originals);
      }
      inter = inter === null ? set : new Set([...inter].filter(v => set.has(v)));
      if (!inter.size) break;
    }
    const ok = known && inter && inter.size > 0;
    if (ok) tally[el]++;
    row.push(`${el}=${!known ? '?' : (ok ? `OK(${inter.size})` : 'vazio')}`);
  }
  console.log(`${fmt(t.ts)} hits=${hits.length}  ${row.join('  ')}`);
}

console.log('\n-- em quantos turnos cada elemento FECHA o bloco --');
for (const el of ELEMENTS) console.log(`${String(tally[el]).padStart(4)}/${targets.length}  ${el}`);

// Reversão elemental COM o termo de Perfect Shot (+20 pós-crit, pré-mitigação),
// espelhando o que physicalOriginalInterval já faz e elementalOriginalCandidates
// não faz. Só para verificar a hipótese — não é código de produção.
function elementalOriginalsWithPerfectShot(hit, element, ctx2) {
  const mods = F.getMobMods(hit.mob, ctx2);
  const KEY = { holy: 'holyDmgMod', ice: 'iceDmgMod', fire: 'fireDmgMod', energy: 'energyDmgMod', earth: 'earthDmgMod', death: 'deathDmgMod' }[element];
  if (!mods || !(mods[KEY] > 0)) return [];
  const mod = F.effectiveMod(+mods[KEY], F.pierceForElement(element, hit, ctx2));
  const mit = F.mitigationMultiplier(mods, ctx2);
  const post = F.postMultiplier(hit, ctx2);
  const crit = F.criticalMultiplierForHit(hit, ctx2);
  const ps = hit && hit.perfectShot ? F.PERFECT_SHOT_PREMIT_BONUS : 0;
  // Mesma estrutura de elementalOriginalCandidates: exato primeiro, e só se
  // vazio relaxa ELEMENTAL_INTERMEDIATE_TOLERANCE nas duas pontas (aa e ee).
  const collect = (tol) => {
    const t = Math.max(0, tol || 0);
    const out = new Set();
    for (const aIv of F.inversePostMultiplierIntervals(+hit.dmg, post)) {
      for (let a0 = aIv[0]; a0 <= aIv[1]; a0++) {
        for (let a = Math.max(1, a0 - t); a <= a0 + t; a++) {
          const eIv = F.invFloor(a, mit);
          if (!eIv) continue;
          for (let c = eIv[0]; c <= eIv[1]; c++) {
            const prePerfect = c - ps;
            if (prePerfect < 1) continue;
            for (const pcIv of F.inverseCriticalMultiplierIntervals(prePerfect, crit)) {
              for (let e = pcIv[0]; e <= pcIv[1]; e++) {
                for (let ee = Math.max(1, e - t); ee <= e + t; ee++) {
                  const oIv = F.invCeil(ee, mod);
                  if (!oIv) continue;
                  for (let o = oIv[0]; o <= oIv[1]; o++) if (o > 0) out.add(o);
                }
              }
            }
          }
        }
      }
    }
    return out;
  };
  let out = collect(0);
  if (!out.size && F.ELEMENTAL_INTERMEDIATE_TOLERANCE > 0) out = collect(F.ELEMENTAL_INTERMEDIATE_TOLERANCE);
  return Array.from(out).sort((a, b) => a - b);
}

console.log('\n== energy COM reversão de Perfect Shot ==');
let closes = 0;
for (const t of targets) {
  const hits = (t.components || []).flatMap(c => c.hits || []);
  let inter = null, ok = true;
  for (const h of hits) {
    const os = elementalOriginalsWithPerfectShot(h, 'energy', context);
    if (!os.length) { ok = false; break; }
    const set = new Set(os);
    inter = inter === null ? set : new Set([...inter].filter(v => set.has(v)));
    if (!inter.size) break;
  }
  const good = ok && inter && inter.size > 0;
  if (good) closes++;
  const ps = hits.filter(h => h.perfectShot).length;
  console.log(`${fmt(t.ts)} hits=${String(hits.length).padStart(2)} perfectShot=${ps} -> ${good ? `FECHA O=${[...inter].join(',')}` : 'vazio'}`);
}
console.log(`\nenergy + Perfect Shot fecha em ${closes}/${targets.length} turnos.`);

// Dispersão do original energy por turno: separa resíduo de arredondamento
// cross-mob (S-004a permite tolerância entre mobs distintos) de quebra real.
console.log('\n== dispersão do original energy por turno ==');
for (const t of targets) {
  const hits = (t.components || []).flatMap(c => c.hits || []);
  let lo = Infinity, hi = -Infinity, unknown = 0;
  for (const h of hits) {
    const r = F.elementalOriginalCandidates(h, 'energy', context, null);
    const os = (r && r.originals) || [];
    if (!os.length) { unknown++; continue; }
    lo = Math.min(lo, os[0]); hi = Math.max(hi, os[os.length - 1]);
  }
  const spread = hi >= lo ? hi - lo : -1;
  console.log(`${fmt(t.ts)} hits=${String(hits.length).padStart(2)} O_energy=[${lo}..${hi}] spread=${String(spread).padStart(3)}${unknown ? ` unknown=${unknown}` : ''}`);
}

// Detalhe energy por hit, para entender os turnos em que energy NÃO fecha.
console.log('\n== detalhe energy por hit ==');
for (const t of targets) {
  const hits = (t.components || []).flatMap(c => c.hits || []);
  console.log(`\n${fmt(t.ts)} (${hits.length} hits)`);
  for (const h of hits) {
    const r = F.elementalOriginalCandidates(h, 'energy', context, null);
    const os = (r && r.originals) || [];
    const flags = [h.realCrit && 'CRIT', h.onslaught && 'ONS', h.lowBlow && 'LB', h.overkill && 'OK', h.isPrey && 'prey', h.exposeWeakness && 'EW'].filter(Boolean).join(' ');
    const span = os.length ? `[${os[0]}..${os[os.length - 1]}]` : '-';
    console.log(`  seq=${String(h.seq || 0).padStart(5)} ${String(h.mob).padEnd(19)} dmg=${String(h.dmg).padStart(5)} ${flags.padEnd(14)} mod=${r && r.mod != null ? +(+r.mod).toFixed(4) : '?'} O_energy=${span} n=${os.length}`);
  }
}
