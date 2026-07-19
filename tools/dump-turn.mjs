#!/usr/bin/env node
// dump-turn.mjs — para um ou mais timestamps, imprime as linhas BRUTAS do
// server log, as linhas BRUTAS do local chat e a classificação parseada.
// Uso: node tools/dump-turn.mjs "<server log>" "<local chat>" --ts HH:MM:SS[,HH:MM:SS,...]
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const read = p => fs.readFileSync(p, 'utf8');

const ctx = { console, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date };
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js',
                 'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
}

const argv = process.argv.slice(2);
const positional = [], flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = (argv[i+1] && !argv[i+1].startsWith('--')) ? argv[++i] : true; }
  else positional.push(argv[i]);
}
const [serverLogPath, localChatPath] = positional;
if (!serverLogPath || !localChatPath || !flags.ts) {
  console.error('Uso: node tools/dump-turn.mjs "<server log>" "<local chat>" --ts HH:MM:SS[,HH:MM:SS,...]');
  process.exit(1);
}
const tsList = String(flags.ts).split(',').map(s => s.trim()).filter(Boolean);

function parseSec(hms) {
  const m = /^(\d{2}):(\d{2}):(\d{2})/.exec(hms);
  return m ? +m[1]*3600 + +m[2]*60 + +m[3] : null;
}
function fmtSec(s) {
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function splitSessions(text) {
  const headerRe = /^Channel .+ saved /;
  const sessions = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (headerRe.test(line)) { if (cur) sessions.push(cur); cur = { header: line, lines: [line] }; }
    else if (cur) cur.lines.push(line);
  }
  if (cur) sessions.push(cur);
  if (sessions.length === 0) sessions.push({ header: '', lines: text.replace(/^﻿/, '').split(/\r?\n/) });
  return sessions.map(s => ({ ...s, text: s.lines.join('\n') }));
}
function parseSessionDate(s) {
  const MONTHS = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(s.header);
  if (!m) return null;
  return { year: +m[6], month: MONTHS[m[1]] || 0, day: +m[2], saveSec: +m[3]*3600 + +m[4]*60 + +m[5] };
}
function buildPairs(svSessions, lcSessions) {
  const pairs = [];
  for (const sv of svSessions) {
    const sd = parseSessionDate(sv); if (!sd) continue;
    let best = null, bestDiff = Infinity;
    for (const lc of lcSessions) {
      const ld = parseSessionDate(lc);
      if (!ld || ld.year !== sd.year || ld.month !== sd.month || ld.day !== sd.day) continue;
      const diff = Math.abs(ld.saveSec - sd.saveSec);
      if (diff < bestDiff) { bestDiff = diff; best = lc; }
    }
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best });
  }
  return pairs;
}
function sessionRange(text) {
  const matches = [...text.matchAll(/^(\d{2}:\d{2}:\d{2})/gm)].map(m => m[1]);
  return matches.length ? `${matches[0]}–${matches[matches.length - 1]}` : '(sem timestamps)';
}

const svSessions = splitSessions(read(serverLogPath));
const lcSessions = splitSessions(read(localChatPath));

function findAllPairs(targetTs) {
  if (svSessions.length === 1 && lcSessions.length === 1)
    return [{ svText: svSessions[0].text, lcText: lcSessions[0].text, label: 'única sessão' }];
  const pairs = buildPairs(svSessions, lcSessions);
  const re = new RegExp(`^${fmtSec(targetTs)}`, 'm');
  return pairs.filter(p => re.test(p.sv.text))
    .map(p => ({ svText: p.sv.text, lcText: p.lc.text, label: sessionRange(p.sv.text) }));
}

const spellLabel = tx => (typeof ctx.clsSpellLabel === 'function' ? ctx.clsSpellLabel(tx) : tx) || tx;

for (const tsArg of tsList) {
  const targetTs = parseSec(tsArg);
  if (targetTs === null) { console.log(`\n!! ts inválido: ${tsArg}`); continue; }
  const candidates = findAllPairs(targetTs);
  if (!candidates.length) { console.log(`\n!! ${tsArg}: sessão não encontrada`); continue; }

  // classifica cada sessão candidata, escolhe a melhor (turno alinhado + classificação mais rica)
  const _log = ctx.console.log, _warn = ctx.console.warn, _err = ctx.console.error;
  ctx.console.log = ctx.console.warn = ctx.console.error = () => {};
  let pair = null, res = null, turn = null, best = -1;
  for (const c of candidates) {
    const r = ctx.classifyWithLocalChat(c.svText, c.lcText, { trace: true });
    const t = (r.turnTrace || []).find(tr => tr.ts === targetTs);
    const score = t ? (t.counts.spell + t.counts.grenade) * 100 + t.counts.rune + t.counts.arrow : -1;
    if (score > best) { best = score; pair = c; res = r; turn = t; }
  }
  ctx.console.log = _log; ctx.console.warn = _warn; ctx.console.error = _err;

  console.log('\n' + '='.repeat(78));
  console.log(`${path.basename(serverLogPath)}  +  ${path.basename(localChatPath)}`);
  console.log(`sessão: ${pair.label}   |   turno alvo: ${tsArg}${candidates.length > 1 ? `   (escolhida entre ${candidates.length} sessões c/ esse horário)` : ''}`);
  console.log('='.repeat(78));

  // janela de timestamps do turno (em segundos)
  let lo = targetTs, hi = targetTs + 1;
  if (turn && turn.lines && turn.lines.length) {
    lo = Math.min(...turn.lines.map(l => l.ts));
    hi = Math.max(...turn.lines.map(l => l.ts));
  }
  // amplia 2s p/ cada lado para capturar cast/explosão e contexto
  const loW = lo - 2, hiW = hi + 2;

  // filtro: só linhas relevantes — seus hits ofensivos, leech imediato, e execução de runa/granada
  const keepSv = txt => /due to your |Using one of \d+/.test(txt)
    || (flags.leech && /(You were healed for \d+ hitpoints\.|You gained \d+ mana\.)/.test(txt));

  console.log(`\n--- SERVER LOG (hits + execuções, ${fmtSec(loW)}–${fmtSec(hiW)}) ---`);
  for (const line of pair.svText.split(/\r?\n/)) {
    const s = parseSec(line);
    if (s !== null && s >= loW && s <= hiW && keepSv(line)) console.log(line);
  }

  console.log(`\n--- LOCAL CHAT (linhas brutas, ${fmtSec(loW)}–${fmtSec(hiW)}) ---`);
  for (const line of pair.lcText.split(/\r?\n/)) {
    const s = parseSec(line);
    if (s !== null && s >= loW && s <= hiW) console.log(line);
  }

  console.log(`\n--- CLASSIFICAÇÃO PARSEADA (turno ${tsArg}) ---`);
  if (!turn) {
    console.log('(timestamp não está entre os turnos alinhados desta sessão — ver regra/contexto)');
    continue;
  }
  const spellDesc = turn.spell ? spellLabel(turn.spell)
    : turn.gren ? `granada [${turn.gren}]` : turn.rune ? `runa [${turn.rune}]` : 'só AA';
  console.log(`comp: arrow=${turn.counts.arrow} spell=${turn.counts.spell} rune=${turn.counts.rune} grenade=${turn.counts.grenade}  | ${spellDesc}${turn.partialEdge ? '  [partialEdge]' : ''}`);
  const lines = turn.lines.slice().sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq));
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fl = [];
    if (l.ok) fl.push('overkill');
    if (l.lowBlow && l.onslaught) fl.push('low blow+onslaught');
    else if (l.lowBlow) fl.push('low blow');
    else if (l.realCrit && l.onslaught) fl.push('crit+onslaught');
    else if (l.realCrit) fl.push('crit');
    else if (l.onslaught) fl.push('onslaught');
    console.log('  ' + String(i).padStart(2) + '  ' + fmtSec(l.ts) + '.' + l.seq +
      '  ' + String(l.mob).padEnd(22) + ' dmg=' + String(l.dmg).padStart(5) +
      ' base=' + String(Math.round(l.base)).padStart(5) + '  ' + (l.comp || '—').padEnd(8) +
      (fl.length ? ' (' + fl.join(', ') + ')' : ''));
  }
}
