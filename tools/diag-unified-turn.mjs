#!/usr/bin/env node
// diag-unified-turn.mjs — diagnóstico de turno no MOTOR UNIFIED (o que a UI roda),
// com as MESMAS opções da UI (unified-main.js: tabela pós por data da sessão,
// strictLeech, maxOriginal 6000, float16 mitigation).
//
// Este é o diagnóstico canônico de turno deste projeto. NÃO use tools/diag-turn.mjs
// (classificador legado + só tabela pré-cutoff) para explicar o que a UI mostra.
//
// Uso: node tools/diag-unified-turn.mjs "logs/sv.txt" "logs/lc.txt" HH:MM:SS[,HH:MM:SS...] [DD/Mon/YYYY]
//   - Sem data: usa a sessão única (ou o 1º par sv↔lc por horário de save).
//   - Com data: restringe às sessões daquele dia (par sv↔lc de save mais próximo).
// Saída por turno alvo: status final, componentes/hits (com crit/overkill/EW/prey),
// evidence.physical (intervalo de O e escalares) e, se unresolved, as violações
// de cada partição candidata rejeitada.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,Sept:8 };
function splitSessions(text) {
  const sessions = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else { if (!cur) cur = { header:'', year:0, month:0, day:0, saveSec:0, lines:[] }; cur.lines.push(line); }
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  return sessions;
}

const argv = process.argv.slice(2);
const sessionArgIndex = argv.indexOf('--session');
const sessionIdx = sessionArgIndex >= 0 ? +argv[sessionArgIndex + 1] : null;
const positional = argv.filter((a, i) => a !== '--session' && argv[i - 1] !== '--session');
const [svP, lcP, tsArg, dateArg] = positional;
if (!svP || !lcP || !tsArg) {
  console.error('Uso: node tools/diag-unified-turn.mjs "logs/sv.txt" "logs/lc.txt" HH:MM:SS[,...] [DD/Mon/YYYY] [--session N]');
  process.exit(1);
}
const targets = new Set(tsArg.split(',').map(s => { const m = /^(\d\d):(\d\d):(\d\d)$/.exec(s.trim()); return m ? +m[1]*3600 + +m[2]*60 + +m[3] : null; }).filter(x => x != null));
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

// buildPairsByIndex replica EXATAMENTE a indexação S<N> usada por tools/dump-unified.mjs
// e tools/report-unified-unclassified.mjs (itera as sessões de sv na ordem do arquivo,
// casando cada uma com a sessão de lc de saveSec mais próxima no mesmo dia). Isso é
// diferente do algoritmo "melhor par global" usado abaixo pra --date: quando duas
// sessões caem no mesmo dia, --date pode escolher a errada. Use --session <N> pra
// mirar exatamente o par que apareceu como "S<N>" no diff de dump-unified.mjs.
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
// tools/dump-unified.mjs exclui uma sessão específica de "jaded Server Log.txt"
// (09/Jun/2026, problema conhecido à parte) ANTES de numerar S0/S1/S2... — sem
// replicar esse filtro aqui, --session N diverge da indexação real pra esse fixture.
// Se outro fixture ganhar um filtro ad-hoc parecido em dump-unified.mjs no futuro,
// replicar aqui também (ou, melhor, extrair esse filtro pra um módulo compartilhado).
const isTempExcludedJadedSession = sv => sv.year === 2026 && sv.month === 5 && sv.day === 9;
function applyKnownFixtureExclusions(svPath, pairs) {
  if (path.basename(svPath) === 'jaded Server Log.txt') return pairs.filter(p => !isTempExcludedJadedSession(p.sv));
  return pairs;
}

let svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
let pair = null;
if (sessionIdx != null) {
  if (!Number.isInteger(sessionIdx) || sessionIdx < 0) { console.error('--session precisa ser um inteiro >= 0.'); process.exit(1); }
  let pairs = (svS.length === 1 && lcS.length === 1) ? [{ sv: svS[0], lc: lcS[0] }] : buildPairsByIndex(svS, lcS);
  pairs = applyKnownFixtureExclusions(svP, pairs);
  pair = pairs[sessionIdx] || null;
  if (!pair) {
    console.error(`--session ${sessionIdx} fora do intervalo (${pairs.length} pares encontrados: S0..S${pairs.length - 1}).`);
    process.exit(1);
  }
} else {
  if (dateArg) {
    const dm = /^(\d+)\/(\w+)\/(\d+)$/.exec(dateArg);
    if (!dm) { console.error('Data inválida (esperado DD/Mon/YYYY, ex.: 30/Jun/2026)'); process.exit(1); }
    const want = { day:+dm[1], month: MONTHS[dm[2]], year:+dm[3] };
    svS = svS.filter(s => s.year===want.year && s.month===want.month && s.day===want.day);
    lcS = lcS.filter(s => s.year===want.year && s.month===want.month && s.day===want.day);
  }
  if (svS.length === 1 && lcS.length === 1) pair = { sv: svS[0], lc: lcS[0] };
  else for (const sv of svS) for (const lc of lcS) {
    // Um preâmbulo sem header (linha em branco antes do primeiro "Channel ... saved")
    // vira uma sessão fantasma com header:'' e saveSec:0; sem este filtro, ela empata
    // consigo mesma (diff 0) e vence a sessão real, dando log_too_short.
    if (!sv.header || !lc.header) continue;
    if (Math.abs(lc.saveSec - sv.saveSec) > 3600) continue;
    if (!pair || Math.abs(lc.saveSec - sv.saveSec) < Math.abs(pair.lc.saveSec - pair.sv.saveSec)) pair = { sv, lc };
  }
  if (!pair) { console.error('Nenhum par de sessão sv↔lc encontrado (verifique a data, ou use --session N pra mirar por índice).'); process.exit(1); }
}
console.log(`sessão: sv save=${fmt(pair.sv.saveSec)}  lc save=${fmt(pair.lc.saveSec)}${pair.sv.header ? '  (' + pair.sv.header + ')' : ''}`);

const u = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
});
if (u.error) { console.error('ERRO do motor:', u.error); process.exit(1); }

for (const t of (u.turns || [])) {
  if (!targets.has(t.ts)) continue;
  console.log(`\n=== turno ${fmt(t.ts)} status=${t.status} reason=${t.reason || '-'} ===`);
  for (const c of (t.components || [])) {
    console.log(`  comp=${c.comp} label=${c.actionLabel || '-'} hits=${(c.hits || []).length} reason=${c.reason || '-'}`);
    for (const h of (c.hits || [])) {
      const p = h.evidence && h.evidence.physical;
      const flags = [h.realCrit && 'CRIT', h.onslaught && 'ONS', h.lowBlow && 'LB', h.overkill && 'OK', h.isPrey && 'prey', h.exposeWeakness && 'EW'].filter(Boolean).join(' ');
      const phys = p && p.interval ? ` O_fis=[${p.interval[0]},${p.interval[1]}] mod=${+(+p.mod).toFixed(4)} mit=${+(+p.mitigation).toFixed(6)} post=${p.post} armor=[${p.armorLow},${p.armorHigh}]` : '';
      console.log(`    ${fmt(h.ts)} seq=${String(h.seq || 0).padStart(5)} ${String(h.mob).padEnd(18)} dmg=${String(h.dmg).padStart(5)} ${flags.padEnd(16)}${phys}`);
    }
  }
  const rej = t.rejected || [];
  if (rej.length) {
    console.log(`  partições rejeitadas: ${rej.length}`);
    for (const r of rej) {
      const shape = r.candidate ? r.candidate.shape.join('>') : '?';
      const cuts = r.candidate ? r.candidate.cuts.join(',') : '?';
      const viols = (r.violations || []).map(v => v.reason).join('; ') || (r.ok ? 'OK(perdeu desempate)' : '?');
      console.log(`    ${shape} [${cuts}] -> ${viols}`);
    }
  }
}
