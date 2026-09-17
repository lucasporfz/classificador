#!/usr/bin/env node
// diag-session-setup.mjs — dump do SETUP inferido por sessão no motor Unified, com as
// MESMAS opções da UI. Mostra o que diag-unified-turn.mjs não mostra: regime de tabela,
// data da sessão, taxas de leech, BM, bônus de classe de bestiário, omega (com as linhas
// de testemunha de charm e seus níveis), pierce físico de arma, grav san e aaElement.
//
// Uso: node tools/diag-session-setup.mjs "logs/sv.txt" "logs/lc.txt" [--session N]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,Sept:8 };
function splitSessions(text) {
  const sessions = []; let cur = null; const preamble = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else if (cur) cur.lines.push(line);
    else preamble.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  if (!sessions.length) sessions.push({ header:'', year:0, month:0, day:0, saveSec:0, lines: preamble, text: preamble.join('\n') });
  return sessions;
}
function buildPairsByIndex(svAll, lcAll) {
  const pairs = [];
  for (const sv of svAll) {
    if (!sv.header) continue;
    const cands = lcAll.filter(lc => lc.header && lc.year === sv.year && lc.month === sv.month && lc.day === sv.day && Math.abs(lc.saveSec - sv.saveSec) <= 3600);
    if (!cands.length) continue;
    cands.sort((a, b) => Math.abs(a.saveSec - sv.saveSec) - Math.abs(b.saveSec - sv.saveSec));
    pairs.push({ sv, lc: cands[0] });
  }
  return pairs;
}

const argv = process.argv.slice(2);
const sessionArgIndex = argv.indexOf('--session');
const sessionIdx = sessionArgIndex >= 0 ? +argv[sessionArgIndex + 1] : 0;
const positional = argv.filter((a, i) => a !== '--session' && argv[i - 1] !== '--session');
const [svP, lcP] = positional;
if (!svP || !lcP) { console.error('Uso: node tools/diag-session-setup.mjs "logs/sv.txt" "logs/lc.txt" [--session N]'); process.exit(1); }
const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
let pairs = (svS.length === 1 && lcS.length === 1) ? [{ sv: svS[0], lc: lcS[0] }] : buildPairsByIndex(svS, lcS);
const pair = pairs[sessionIdx];
if (!pair) { console.error(`--session ${sessionIdx} fora do intervalo (${pairs.length} pares).`); process.exit(1); }
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
console.log(`sessão S${sessionIdx}: header=${pair.sv.header || '(sem cabeçalho)'}  lc=${pair.lc.header || '(sem cabeçalho)'}`);

const u = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});
if (u.error) { console.error('ERRO do motor:', u.error); process.exit(1); }
const c = u._context || {};
const j = v => JSON.stringify(v, (k, x) => (x instanceof Map ? Object.fromEntries(x) : x), 2);

console.log(`\n--- identidade / regime ---`);
console.log(`player=${u.player || c.player || '?'}  vocação(aaElement)=${c.aaElement}`);
console.log(`sessionDateKey=${JSON.stringify(c.sessionDateKey)}  mobModsRegime=${(u.meta || {}).mobModsRegime || c.mobModsRegime || '(indef)'}`);
console.log(`turnos=${(u.turns || []).length}  primeiro=${(u.turns||[]).length?fmt(u.turns[0].ts):'-'}  último=${(u.turns||[]).length?fmt(u.turns[u.turns.length-1].ts):'-'}`);

console.log(`\n--- leech ---`);
console.log(j({ life: c.lifeLeech ?? c.leechSetup?.life, mana: c.manaLeech ?? c.leechSetup?.mana, setup: c.leechSetup }));

console.log(`\n--- crit / charms / perks ---`);
console.log(`critSetup=${j(c.critSetup)}`);
console.log(`bmSetup=${j(c.bmSetup)}`);
console.log(`bestiaryClassBonus=${j(c.bestiaryClassBonus)}`);
console.log(`weaponPhysicalPierceSetup=${j(c.weaponPhysicalPierceSetup)}`);
console.log(`gravSanSetup(janelas)=${((c.gravSanSetup||{}).windows||[]).length}`);

console.log(`\n--- OMEGA (M-039) ---`);
const om = c.omegaSetup || {};
console.log(`active=${om.active} multiplier=${om.multiplier} source=${om.source} confirmedRows=${om.confirmedRows||0} anchoredRows=${om.anchoredRows||0}`);
for (const r of (om.rows || [])) {
  const lv = (r.levels || []).map(L => `${L.value}x${L.n}`).join(' ');
  console.log(`  ${String(r.mob).padEnd(20)} charm=${String(r.charm).padEnd(12)} elem=${String(r.element).padEnd(8)} ew=${r.ew?1:0} amp=${r.amp?1:0} n=${String(r.n).padStart(3)} esperado=${(+r.expected).toFixed(1)} ancora=${r.baseLevel} omega=${r.omegaLevel} razao=${r.ratio ? (+r.ratio).toFixed(4) : '-'}`);
  console.log(`      níveis(>=3 procs): ${lv || '(nenhum)'}`);
}

console.log(`\n--- mobs vistos vs tabela ---`);
const seen = new Map();
for (const t of (u.turns || [])) for (const comp of (t.components || [])) for (const h of (comp.hits || [])) {
  const m = String(h.mob || '').toLowerCase(); if (!m) continue;
  seen.set(m, (seen.get(m) || 0) + 1);
}
const table = (c.mobModsRegime === 'post-2026-06-16' || ((u.meta||{}).mobModsRegime === 'post-2026-06-16')) ? ctx.MOB_ELEMENT_MODS_POST_2026_06_16 : ctx.MOB_ELEMENT_MODS;
for (const [m, n] of [...seen.entries()].sort((a,b) => b[1]-a[1])) {
  const pre = ctx.MOB_ELEMENT_MODS && ctx.MOB_ELEMENT_MODS[m];
  const post = ctx.MOB_ELEMENT_MODS_POST_2026_06_16 && ctx.MOB_ELEMENT_MODS_POST_2026_06_16[m];
  console.log(`  ${m.padEnd(22)} hits=${String(n).padStart(4)} pre=${pre ? 'hp' + pre.hitpoints + ' arm' + (pre.armor ?? '?') : 'AUSENTE'}  post=${post ? 'hp' + post.hitpoints + ' arm' + (post.armor ?? '?') : 'AUSENTE'}`);
}
