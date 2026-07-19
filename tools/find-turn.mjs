#!/usr/bin/env node
// find-turn.mjs — localiza e imprime um turno hit-a-hit pelo timestamp.
// Uso: node tools/find-turn.mjs "<server log>" "<local chat>" --ts HH:MM:SS
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

// --- arg parsing ---
const argv = process.argv.slice(2);
const positional = [], flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = (argv[i+1] && !argv[i+1].startsWith('--')) ? argv[++i] : true; }
  else positional.push(argv[i]);
}
const [serverLogPath, localChatPath] = positional;
const tsArg = flags.ts;

if (!serverLogPath || !localChatPath || !tsArg) {
  console.error('Uso: node tools/find-turn.mjs "<server log>" "<local chat>" --ts HH:MM:SS');
  process.exit(1);
}

function parseSec(hms) {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hms);
  if (!m) return null;
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

const targetTs = parseSec(tsArg);
if (targetTs === null) {
  console.error('Erro: --ts deve ser HH:MM:SS, ex: --ts 21:02:43');
  process.exit(1);
}

// --- session helpers (mesma lógica do oráculo) ---
function splitSessions(text) {
  const headerRe = /^Channel .+ saved /;
  const sessions = [];
  let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (headerRe.test(line)) {
      if (cur) sessions.push(cur);
      cur = { header: line, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
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
    const sd = parseSessionDate(sv);
    if (!sd) continue;
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

// --- find session pair containing the target timestamp ---
const svSessions = splitSessions(read(serverLogPath));
const lcSessions = splitSessions(read(localChatPath));

let svText, lcText, pairLabel;

if (svSessions.length === 1 && lcSessions.length === 1) {
  svText = svSessions[0].text;
  lcText = lcSessions[0].text;
  pairLabel = 'única sessão';
} else {
  const pairs = buildPairs(svSessions, lcSessions);
  if (pairs.length === 0) {
    console.error('Erro: nenhum par de sessões encontrado (datas não batem ou cabeçalhos ausentes)');
    process.exit(1);
  }
  const tsPattern = new RegExp(`^${tsArg}`, 'm');
  const matching = pairs.filter(p => tsPattern.test(p.sv.text));
  if (matching.length === 0) {
    console.log(`Timestamp ${tsArg} não encontrado em nenhuma sessão.`);
    console.log('Sessões disponíveis:');
    pairs.forEach((p, i) => console.log(`  [${i+1}] ${sessionRange(p.sv.text)}`));
    process.exit(1);
  }
  const pair = matching[0];
  svText = pair.sv.text;
  lcText = pair.lc.text;
  pairLabel = sessionRange(svText);
}

// --- classify ---
const res = ctx.classifyWithLocalChat(svText, lcText, { trace: true });
if (res.error) { console.error('Erro: ' + res.error); process.exit(1); }

const turn = (res.turnTrace || []).find(tr => tr.ts === targetTs);
if (!turn) {
  const aligned = (res.turnTrace || []).map(tr => {
    const s = tr.ts, h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  });
  console.log(`Turno ${tsArg} (ts=${targetTs}) não encontrado nos turnos alinhados da sessão ${pairLabel}.`);
  console.log(`Turnos alinhados nessa sessão: ${aligned.join(', ')}`);
  process.exit(1);
}

// --- build EW map from raw parseLogForClassifier call (exposeWeakness not in turnTrace) ---
const ewMap = new Map();
const rawParsed = ctx.parseLogForClassifier(svText);
const rawStat = (rawParsed.turnStats || []).find(s => s.ts === targetTs);
if (rawStat && rawStat.rpComponentLines) {
  for (const l of rawStat.rpComponentLines) ewMap.set(`${l.ts}.${l.seq || 0}`, !!l.exposeWeakness);
}

// --- spell label helper ---
const spellLabel = tx => (typeof ctx.clsSpellLabel === 'function' ? ctx.clsSpellLabel(tx) : tx) || tx;
const spellDesc = turn.spell ? spellLabel(turn.spell)
  : turn.gren ? `granada [${turn.gren}]`
  : turn.rune ? `runa [${turn.rune}]`
  : 'só AA';

// --- flag string for a hit line ---
function hitFlags(l) {
  const flags = [];
  if (l.ok) flags.push('overkill');
  if (ewMap.get(`${l.ts}.${l.seq}`)) flags.push('EW');
  if (l.lowBlow && l.onslaught) flags.push('low blow+onslaught');
  else if (l.lowBlow) flags.push('low blow');
  else if (l.realCrit && l.onslaught) flags.push('crit+onslaught');
  else if (l.realCrit) flags.push('crit');
  else if (l.onslaught) flags.push('onslaught');
  return flags.length ? `(${flags.join(', ')})` : '';
}

// --- print ---
console.log(`=== ${path.basename(serverLogPath)} · sessão ${pairLabel} ===`);
console.log(`turno ${turn.idx}  ts=${turn.ts} (${tsArg})  ${spellDesc}`);
console.log(`comp: arrow=${turn.counts.arrow} spell=${turn.counts.spell} rune=${turn.counts.rune} gren=${turn.counts.grenade}`);
console.log('');

const lines = turn.lines.slice().sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq));
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const flagStr = hitFlags(l);
  console.log(
    '  ' + String(i).padStart(2) + '  ts=' + l.ts + '.' + l.seq +
    '  ' + String(l.mob).padEnd(22) +
    ' dmg=' + String(l.dmg).padStart(5) +
    '  base=' + String(Math.round(l.base)).padStart(5) +
    '  ' + (l.comp || '—').padEnd(8) +
    (flagStr ? ' ' + flagStr : '')
  );
}
