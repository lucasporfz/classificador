#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Nao entra no runner.
// Dump do comportamento de leech nos turnos travados por
// single_target_aa_all_action_without_positive_aa_evidence.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const [svP, lcP] = process.argv.slice(2);
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const u = ctx.UnifiedClassificationEngine.classifyUnified(read(svP), read(lcP), {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});
if (u.error) { console.error('ERRO', u.error); process.exit(1); }
const V = ctx.UnifiedValidation;
const setup = u.leechSetup;
console.log('leechSetup: life='+setup.lifeBase+' mana='+setup.manaBase+' vampiricMob='+setup.vampiricMob+' +'+setup.vampiricBonus);
const cx = { leechSetup: setup };

const TARGET = 'single_target_aa_all_action_without_positive_aa_evidence';
const turns = (u.turns||[]).filter(t => (t.components||[]).some(c => c.reason === TARGET));
console.log(`turnos com reason=${TARGET}: ${turns.length} de ${(u.turns||[]).length}\n`);

function verdict(hit, n, ch) {
  const v = V.observedLeechAcceptsN(hit, setup, n, ch, null, cx);
  if (!v || !v.usable) return null;
  const exps = (v.expectations||[]).map(x => x.expected).filter(Number.isFinite);
  return { ok: !!v.ok, cappedLow: !!v.cappedLow, tooHigh: !!v.tooHigh, obs: v.observed,
           exp: exps.length ? [Math.min(...exps), Math.max(...exps)] : null, reason: v.reason };
}
function cell(hit, n, ch) {
  const v = verdict(hit, n, ch);
  if (!v) return '   -   ';
  const tag = v.ok ? 'OK ' : v.cappedLow ? 'LOW' : v.tooHigh ? 'HIGH' : '?? ';
  const e = v.exp ? (v.exp[0] === v.exp[1] ? String(v.exp[0]) : `${v.exp[0]}-${v.exp[1]}`) : '?';
  return `${tag} ${v.obs}/${e}`;
}

const stats = { total: 0, firstLowLife: 0, firstLowMana: 0, firstLowBoth: 0, firstOkN1: 0, firstNoLeech: 0, allLow: 0 };
for (const t of turns) {
  const hits = (t.components||[]).flatMap(c => (c.hits||[]).map(h => ({ ...h, comp: c.comp })));
  hits.sort((a,b) => (a.ts-b.ts) || ((a.seq||0)-(b.seq||0)));
  const main = hits.filter(h => !h.charmOnly && !h.reflect);
  if (main.length < 2) continue;
  stats.total++;
  const k = main.length;
  const f = main[0];
  const fl = verdict(f,1,'life'), fm = verdict(f,1,'mana');
  if (!fl && !fm) stats.firstNoLeech++;
  else if ((fl&&fl.ok)||(fm&&fm.ok)) stats.firstOkN1++;
  else {
    if (fl&&fl.cappedLow && fm&&fm.cappedLow) stats.firstLowBoth++;
    else if (fl&&fl.cappedLow) stats.firstLowLife++;
    else if (fm&&fm.cappedLow) stats.firstLowMana++;
  }
  const restLow = main.slice(1).every(h => { const a=verdict(h,k,'life'),b=verdict(h,k,'mana'); return (!a||a.cappedLow)&&(!b||b.cappedLow); });
  if (restLow) stats.allLow++;

  console.log(`=== ${fmt(t.ts)}  k=${k}  comps=${(t.components||[]).map(c=>c.comp+':'+(c.hits||[]).length).join(' ')} ===`);
  console.log('  #  mob                dmg   flags        life  mana | N=1 life      N=1 mana     | N=k life      N=k mana');
  main.forEach((h,i) => {
    const flags = [h.realCrit&&'C',h.onslaught&&'O',h.lowBlow&&'L',h.overkill&&'OK',h.isPrey&&'P',h.exposeWeakness&&'E'].filter(Boolean).join('');
    console.log(`  ${String(i).padStart(2)} ${String(h.mob).padEnd(18)} ${String(h.dmg).padStart(5)} ${flags.padEnd(6)} ${String(h.lifeLeech||0).padStart(5)} ${String(h.manaLeech||0).padStart(5)} | ${cell(h,1,'life').padEnd(13)} ${cell(h,1,'mana').padEnd(13)}| ${cell(h,k,'life').padEnd(13)} ${cell(h,k,'mana').padEnd(13)}`);
  });
  console.log('');
}
console.log('--- resumo ---'); console.log(JSON.stringify(stats, null, 2));
