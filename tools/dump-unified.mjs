// dump-unified.mjs — despeja, por turno alinhado, a saída do UnifiedClassificationEngine
// para TODAS as sessões de TODOS os pares de fixture. Artefato estável para diff
// antes/depois de uma mudança SÓ-DESEMPENHO no motor unificado (deve dar diff vazio).
// Uso: node tools/dump-unified.mjs > baseline-unified.txt
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
import { discoverFixturePairs } from './fixture-pairs.mjs';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
function freshCtx() {
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
    vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  return ctx;
}
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
function buildPairs(svS, lcS) {
  const pairs = [];
  for (const sv of svS) {
    if (!sv.header) continue;
    const cands = lcS.filter(lc => lc.header && lc.year===sv.year && lc.month===sv.month && lc.day===sv.day && Math.abs(lc.saveSec-sv.saveSec)<=3600);
    if (!cands.length) continue;
    cands.sort((a,b)=>Math.abs(a.saveSec-sv.saveSec)-Math.abs(b.saveSec-sv.saveSec));
    pairs.push({ sv, lc: cands[0] });
  }
  return pairs;
}
// Descoberto de logs/ (ver tools/fixture-pairs.mjs): par novo na pasta entra sozinho,
// par removido some sozinho. Não voltar a hardcodar a lista aqui.
const PAIRS = discoverFixturePairs().map(p => [p.server, p.local]);
// TEMP (excluído a pedido do usuário até investigação separada): "drome" é o
// mesmo log de "bakra" em arquivo diferente, com um problema conhecido a
// resolver por último; a sessão de jaded salva em 09/Jun/2026 09:30:47
// (conteúdo ~09:18-09:30) tem o mesmo problema. Remover este filtro quando
// resolvido.
const TEMP_EXCLUDE_DROME = true;
const isTempExcludedJadedSession = sv => sv.year === 2026 && sv.month === 5 && sv.day === 9;

// --pair "<serverLogFileName>" / --pairs "<serverLogFileName1>,<serverLogFileName2>,..."
// restringe o dump aos pares cujo nome de arquivo de server log bate exatamente (ou
// como substring, case-insensitive) com um dos valores informados. Sem a flag, dumpa
// os PAIRS inteiros (comportamento original). Uso: validação escopada de uma mudança
// que só pode afetar um subconjunto de fixtures (ex.: mecânica exclusiva de RP), antes
// de rodar o dump completo do corpus como checagem final.
const pairArgIndex = process.argv.indexOf('--pair');
const pairsArgIndex = process.argv.indexOf('--pairs');
const wantedPairs = pairArgIndex >= 0
  ? [String(process.argv[pairArgIndex + 1] || '').toLowerCase()]
  : pairsArgIndex >= 0
    ? String(process.argv[pairsArgIndex + 1] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : null;
if (wantedPairs && !wantedPairs.length) {
  console.error('--pair/--pairs vazio.');
  process.exit(2);
}

if (wantedPairs && !PAIRS.some(([svN]) => wantedPairs.some(w => svN.toLowerCase().includes(w)))) {
  console.error(`Nenhum par bate com --pair/--pairs: ${wantedPairs.join(',')}`);
  console.error(PAIRS.map(([svN]) => `- ${svN}`).join('\n'));
  process.exit(2);
}

const out = [];
for (const [svN, lcN] of PAIRS) {
  if (wantedPairs && !wantedPairs.some(w => svN.toLowerCase().includes(w))) continue;
  if (TEMP_EXCLUDE_DROME && svN === 'Server Log drome.txt') continue;
  const svP = 'logs/'+svN, lcP = 'logs/'+lcN;
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) { out.push(`PAIR=${svN} MISSING`); continue; }
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  let sessions = (svS.length===1 && lcS.length===1) ? [{ sv: svS[0], lc: lcS[0] }] : buildPairs(svS, lcS);
  if (svN === 'jaded Server Log.txt') sessions = sessions.filter(p => !isTempExcludedJadedSession(p.sv));
  if (!sessions.length) { out.push(`PAIR=${svN} NO_PAIRS`); continue; }
  sessions.forEach((pair, si) => {
    const ctx = freshCtx();
    let u;
    try { u = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, { mobModsPre: ctx.MOB_ELEMENT_MODS||null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null }); }
    catch (e) { out.push(`PAIR=${svN} S${si} THROW ${e.message}`); return; }
    if (u.error) { out.push(`PAIR=${svN} S${si} ERR ${u.error}`); return; }
    for (const t of (u.turns || [])) {
      const c = { arrow:0, spell:0, rune:0, grenade:0 };
      let dmg = 0; const labels = [];
      for (const comp of (t.components||[])) {
        const k = comp.comp; if (k in c) c[k] += (comp.hits||[]).length;
        for (const h of (comp.hits||[])) dmg += (+h.dmg||0);
        if (comp.actionLabel && k!=='arrow') labels.push(k+':'+comp.actionLabel);
      }
      out.push(`${svN} S${si} ts=${t.ts} st=${t.status} a=${c.arrow} s=${c.spell} r=${c.rune} g=${c.grenade} dmg=${dmg} ${labels.join('|')||'-'}`);
    }
  });
}
process.stdout.write(out.join('\n') + '\n');
