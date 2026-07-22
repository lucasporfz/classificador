#!/usr/bin/env node
// Sonda de viabilidade (Fase 3) — NÃO é ferramenta de validação, não entra no runner.
//
// Testa o critério de detecção do ELEMENTO DO AA proposto pelo usuário em 22/Jul/2026:
//   - usar só turnos com cast de spell holy de área do dono (`exevo mas san`,
//     `exori dir san`);
//   - excluir turnos com Ethereal Barrage (`exori dir moe`, spell FÍSICA — não
//     separa do AA físico) e turnos na janela de explosão de granada
//     (`exevo tempo mas san`, tempo de explosão incerto);
//   - em cada turno, procurar um corte contíguo AA→spell em que o sufixo feche
//     como holy e o prefixo feche como o elemento E testado;
//   - o elemento do AA é o E que fecha mais turnos. Empate ⇒ qualquer um.
//
// Uso: node tools/probe-aa-element.mjs "logs/sv.txt" "logs/lc.txt" [--session N]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
const F = ctx.UnifiedFormulas;

const [svP, lcP] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!svP || !lcP) { console.error('Uso: node tools/probe-aa-element.mjs "logs/sv.txt" "logs/lc.txt"'); process.exit(1); }

const u = ctx.UnifiedClassificationEngine.classifyUnified(read(svP), read(lcP), {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});
if (u.error) { console.error('ERRO do motor:', u.error); process.exit(1); }
const context = u._context;
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

const HOLY_AREA = new Set(['exevo mas san', 'exori dir san']);
const PHYSICAL_SPELL = new Set(['exori dir moe']);
const GRENADE = new Set(['exevo tempo mas san']);
const ELEMENTS = ['physical', 'holy', 'ice', 'fire', 'energy', 'earth', 'death'];
const KEY = { holy: 'holyDmgMod', ice: 'iceDmgMod', fire: 'fireDmgMod', energy: 'energyDmgMod', earth: 'earthDmgMod', death: 'deathDmgMod' };

// Reversão elemental com o termo de Perfect Shot (+20 pós-crit, pré-mitigação),
// que hoje só existe no eixo físico. Sem isso o hit de perfect shot desloca ~3%
// e vira falsa fronteira.
function elementalOriginals(hit, element) {
  const mods = F.getMobMods(hit.mob, context);
  const k = KEY[element];
  if (!mods || !(mods[k] > 0)) return [];
  const mod = F.effectiveMod(+mods[k], F.pierceForElement(element, hit, context));
  const mit = F.mitigationMultiplier(mods, context);
  const post = F.postMultiplier(hit, context);
  const crit = F.criticalMultiplierForHit(hit, context);
  const ps = hit && hit.perfectShot ? F.PERFECT_SHOT_PREMIT_BONUS : 0;
  const collect = (tol) => {
    const t = Math.max(0, tol || 0); const out = new Set();
    for (const aIv of F.inversePostMultiplierIntervals(+hit.dmg, post))
      for (let a0 = aIv[0]; a0 <= aIv[1]; a0++)
        for (let a = Math.max(1, a0 - t); a <= a0 + t; a++) {
          const eIv = F.invFloor(a, mit); if (!eIv) continue;
          for (let c = eIv[0]; c <= eIv[1]; c++) {
            const pre = c - ps; if (pre < 1) continue;
            for (const pcIv of F.inverseCriticalMultiplierIntervals(pre, crit))
              for (let e = pcIv[0]; e <= pcIv[1]; e++)
                for (let ee = Math.max(1, e - t); ee <= e + t; ee++) {
                  const oIv = F.invCeil(ee, mod); if (!oIv) continue;
                  for (let o = oIv[0]; o <= oIv[1]; o++) if (o > 0) out.add(o);
                }
          }
        }
    return out;
  };
  let out = collect(0);
  if (!out.size && F.ELEMENTAL_INTERMEDIATE_TOLERANCE > 0) out = collect(F.ELEMENTAL_INTERMEDIATE_TOLERANCE);
  return Array.from(out).sort((a, b) => a - b);
}

function blockCloses(hits, element) {
  if (!hits.length) return false;
  let inter = null;
  for (const h of hits) {
    if (h.overkill) continue;
    let set;
    if (element === 'physical') {
      const r = F.physicalOriginalInterval(h, context);
      if (!r.known || !r.interval) return false;
      set = new Set(); for (let v = r.interval[0]; v <= r.interval[1]; v++) set.add(v);
    } else {
      const os = elementalOriginals(h, element);
      if (!os.length) return false;
      set = new Set(os);
    }
    inter = inter === null ? set : new Set([...inter].filter(v => set.has(v)));
    if (!inter.size) return false;
  }
  return !!(inter && inter.size);
}

// Casts de granada têm type 'grenade' (não 'attack'); filtrar por 'attack' aqui
// deixaria a exclusão de granada inerte.
const casts = (u.facts.local.playerCasts || []).filter(c => c.type === 'attack' || c.type === 'grenade');
const near = (ts, lo, hi) => casts.filter(c => c.ts >= ts + lo && c.ts <= ts + hi);

let qualifying = 0, excludedBarrage = 0, excludedGrenade = 0, noSpell = 0;
const tally = Object.fromEntries(ELEMENTS.map(e => [e, 0]));

for (const t of (u.turns || [])) {
  const hits = (t.hits || []).filter(h => F.isMainHit(h));
  if (hits.length < 2) continue;
  const window = near(t.ts, -1, 2);
  const inc = new Set(window.map(c => c.profile && c.profile.incantation));
  // granada: explosão cai em [cast+2, cast+4] — turno dentro dessa janela sai
  const grenadeShadow = casts.some(c => GRENADE.has(c.profile && c.profile.incantation) && t.ts >= c.ts + 1 && t.ts <= c.ts + 5);
  if ([...inc].some(i => PHYSICAL_SPELL.has(i))) { excludedBarrage++; continue; }
  if (grenadeShadow || [...inc].some(i => GRENADE.has(i))) { excludedGrenade++; continue; }
  if (![...inc].some(i => HOLY_AREA.has(i))) { noSpell++; continue; }
  qualifying++;
  for (const el of ELEMENTS) {
    let ok = false;
    for (let k = 1; k < hits.length && !ok; k++) {
      const prefix = hits.slice(0, k), suffix = hits.slice(k);
      if (blockCloses(suffix, 'holy') && blockCloses(prefix, el)) ok = true;
    }
    if (ok) tally[el]++;
  }
}

console.log(`turnos elegíveis: ${qualifying}   (excluídos: barrage físico ${excludedBarrage}, granada ${excludedGrenade}, sem spell holy ${noSpell})`);
console.log('\n-- em quantos turnos elegíveis o PREFIXO fecha como cada elemento (sufixo fechando holy) --');
const ranked = ELEMENTS.map(e => [e, tally[e]]).sort((a, b) => b[1] - a[1]);
for (const [el, n] of ranked) console.log(`${String(n).padStart(4)}/${qualifying}  ${el}`);
console.log(`\nvencedor: ${ranked[0][0]}${ranked[1] && ranked[1][1] === ranked[0][1] ? ' (EMPATE com ' + ranked.filter(r => r[1] === ranked[0][1]).map(r => r[0]).join(', ') + ')' : ''}`);
