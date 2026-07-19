#!/usr/bin/env node
// find-fixtures-by-owner-cast.mjs — lista, dentre os pares de fixture do corpus, quais
// têm o DONO do log (o jogador cuja identidade o motor já infere via
// inferSelectedSpeakerBySelfHealing — não qualquer participante do chat) lançando uma
// incantação específica em pelo menos uma sessão. Serve pra escopar baseline/gabarito
// numa mudança que só pode afetar fixtures onde o dono exerce a mecânica em questão
// (ex.: granada é exclusiva de Royal Paladin — bastion/uhax/monk nunca são afetados
// por uma correção em buildGrenadeCastAssignments).
//
// Por que não grep no texto do local chat: logs de pack/party mostram TODOS os
// participantes falando no mesmo chat. Um log cujo dono é Elite Knight pode ter outro
// jogador (Royal Paladin) castando "exevo tempo mas san" no mesmo chat — grep cego
// marcaria esse fixture como relevante por engano. `parseLocalChat` já filtra por
// `selectedSpeaker` (o dono) antes de expor `playerCasts`; usamos exatamente isso.
//
// Uso: node tools/find-fixtures-by-owner-cast.mjs "<substring da incantação>"
//   ex.: node tools/find-fixtures-by-owner-cast.mjs "exevo tempo mas san"
// Saída: uma linha por fixture, "SIM"/"NAO", e em quais sessões (S<N>) o dono lança.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
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
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Sept:8,Oct:9,Nov:10,Dec:11 };
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
    if (!sv.header) { if (svS.length === 1) pairs.push({ sv, lc: lcS[0] }); continue; }
    const cands = lcS.filter(lc => lc.header && lc.year===sv.year && lc.month===sv.month && lc.day===sv.day && Math.abs(lc.saveSec-sv.saveSec)<=3600);
    if (!cands.length) continue;
    cands.sort((a,b)=>Math.abs(a.saveSec-sv.saveSec)-Math.abs(b.saveSec-sv.saveSec));
    pairs.push({ sv, lc: cands[0] });
  }
  return pairs;
}

// Mesma lista que tools/dump-unified.mjs (label curto, arquivo sv, arquivo lc).
const PAIRS = [
  ['bakra', 'Server Log bakra.txt', 'Local Chat bakra.txt'],
  ['drome', 'Server Log drome.txt', 'Local Chat drome.txt'],
  ['mrowdy', 'Mrowdy Server Log.txt', 'Mrowdy Local Chat.txt'],
  ['mrowdy 2', 'Mrowdy Server Log 2.txt', 'Mrowdy Local Chat 2.txt'],
  ['bastion', 'bastion server log ek.txt', 'bastion local chat ek.txt'],
  ['darklight e vemiath', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt'],
  ['darklight rp', 'darklight server log rp.txt', 'darklight local chat rp.txt'],
  ['essence', 'essence server log.txt', 'essence local chat.txt'],
  ['mazzerinbarrage', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt'],
  ['barrage', 'barrage Server Log.txt', 'barrage local chat.txt'],
  ['gloompillar', 'gloompillar Server Log.txt', 'gloompillar Local Chat.txt'],
  ['highwin', 'highwin Server Log.txt', 'highwin Local Chat.txt'],
  ['jaded', 'jaded Server Log.txt', 'jaded Local Chat.txt'],
  ['rp pack', 'server log rp.txt', 'localchat rp.txt'],
  ['monk', 'monk server log.txt', 'monk localchat.txt'],
  ['murcion rp', 'murcion server log rp.txt', 'murcion local chat rp.txt'],
  ['night harpy', 'night harpy server log ek.txt', 'night harpy local chat ek.txt'],
  ['uhax 2', 'uhax 2 server log ed.txt', 'uhax 2 local chat ed.txt'],
  ['uhax', 'uhax server log ed.txt', 'uhax local chat ed.txt'],
];

const needle = String(process.argv[2] || '').toLowerCase().trim();
if (!needle) {
  console.error('Uso: node tools/find-fixtures-by-owner-cast.mjs "<substring da incantação>"');
  console.error('Ex.: node tools/find-fixtures-by-owner-cast.mjs "exevo tempo mas san"');
  process.exit(1);
}

const relevant = [];
const irrelevant = [];
for (const [label, svN, lcN] of PAIRS) {
  const svP = path.join(ROOT, 'logs', svN), lcP = path.join(ROOT, 'logs', lcN);
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) { irrelevant.push(`${label} (arquivo ausente)`); continue; }
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  const pairs = (svS.length === 1 && lcS.length === 1) ? [{ sv: svS[0], lc: lcS[0] }] : buildPairs(svS, lcS);
  const hitSessions = [];
  pairs.forEach((pair, si) => {
    const ctx = freshCtx();
    const E = ctx.UnifiedClassificationEngine;
    let server, local;
    try {
      server = E.parseServerFacts(pair.sv.text);
      local = E.parseLocalChat(pair.lc.text, { serverFacts: server });
    } catch (e) { return; }
    const ownerCasts = local.playerCasts || [];
    if (ownerCasts.some(c => (c.text || '').toLowerCase().includes(needle))) hitSessions.push(si);
  });
  if (hitSessions.length) relevant.push(`${label}: SIM (dono lança em S${hitSessions.join(', S')})`);
  else irrelevant.push(label);
}

console.log(`Fixtures onde o DONO do log lança "${needle}":\n`);
console.log(relevant.length ? relevant.join('\n') : '(nenhum)');
console.log(`\nFixtures irrelevantes (dono não lança essa incantação em nenhuma sessão): ${irrelevant.length}`);
console.log(irrelevant.join(', '));
console.log(`\nPra rodar dump/gabarito escopados:`);
const labels = relevant.map(l => l.split(':')[0]);
console.log(`  node tools/dump-unified.mjs --pairs "${labels.join(',')}"`);
