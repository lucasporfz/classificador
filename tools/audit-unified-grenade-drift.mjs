#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import process from 'node:process';

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const read = file => fs.readFileSync(file, 'utf8');
const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Sept:9,Oct:10,Nov:11,Dec:12 };
const CUTOFF = { year: 2026, month: 6, day: 16 };

const PAIRS = [
  ['bakradrone', 'bakradrone server log.txt', 'bakradrone local chat.txt'],
  ['barrage', 'barrage Server Log.txt', 'barrage local chat.txt'],
  ['bastion', 'bastion server log ek.txt', 'bastion local chat ek.txt'],
  ['darklight e vemiath', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt'],
  ['darklight rp', 'darklight server log rp.txt', 'darklight local chat rp.txt'],
  ['drome', 'Server Log drome.txt', 'Local Chat drome.txt'],
  ['essence', 'essence server log.txt', 'essence local chat.txt'],
  ['hakka', 'Hakka Server Log.txt', 'Hakka Local Chat.txt'],
  ['highwin', 'highwin Server Log.txt', 'highwin Local Chat.txt'],
  ['highwin 2', 'highwin 2 Server Log.txt', 'highwin 2 Local Chat.txt'],
  ['jaded', 'jaded Server Log.txt', 'jaded Local Chat.txt'],
  ['mazzerinbarrage', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt'],
  ['mk', 'mk server log.txt', 'mk localchat.txt'],
  ['monk', 'monk server log.txt', 'monk localchat.txt'],
  ['monk 2', 'monk 2 server log.txt', 'monk 2 local chat.txt'],
  ['mrowdy', 'Mrowdy Server Log.txt', 'Mrowdy Local Chat.txt'],
  ['mrowdy 2', 'Mrowdy Server Log 2.txt', 'Mrowdy Local Chat 2.txt'],
  ['mrowdy copia', 'Mrowdy Server Log - Copia.txt', 'Mrowdy Local Chat - Copia.txt'],
  ['ms boss', 'ms boss server log.txt', 'ms boss local chat.txt'],
  ['murcion rp', 'murcion server log rp.txt', 'murcion local chat rp.txt'],
  ['night harpy', 'night harpy server log ek.txt', 'night harpy local chat ek.txt'],
  ['rp pack', 'server log rp.txt', 'localchat rp.txt'],
  ['uhax', 'uhax server log ed.txt', 'uhax local chat ed.txt'],
  ['uhax 2', 'uhax 2 server log ed.txt', 'uhax 2 local chat ed.txt'],
  ['uhax 3', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt'],
  ['death echo', 'death echo server log.txt', 'death echo local chat.txt'],
];

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

function clock(ts) {
  const n = Number(ts) || 0;
  const h = Math.floor(n / 3600) % 24;
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function splitSessions(text) {
  const sessions = [];
  let cur = null;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^Channel .+ saved /.test(line)) {
      if (cur) sessions.push(cur);
      cur = { header: line, lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) sessions.push(cur);
  if (!sessions.length) sessions.push({ header: '', lines: text.replace(/^\uFEFF/, '').split(/\r?\n/) });
  return sessions.map(s => ({ ...s, text: s.lines.join('\n'), date: parseSessionDate(s.header) }));
}

function parseSessionDate(header) {
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(header || '');
  if (!m) return null;
  return { year:+m[6], month:MONTHS[m[1]] || 0, day:+m[2], saveSec:+m[3] * 3600 + +m[4] * 60 + +m[5] };
}

function isPostCutoff(date) {
  if (!date) return false;
  if (date.year !== CUTOFF.year) return date.year > CUTOFF.year;
  if (date.month !== CUTOFF.month) return date.month > CUTOFF.month;
  return date.day >= CUTOFF.day;
}

function buildPairs(serverSessions, localSessions) {
  const pairs = [];
  for (const sv of serverSessions) {
    const sd = sv.date;
    if (!sd) continue;
    let best = null, bestDiff = Infinity;
    for (const lc of localSessions) {
      const ld = lc.date;
      if (!ld || ld.year !== sd.year || ld.month !== sd.month || ld.day !== sd.day) continue;
      const diff = Math.abs(ld.saveSec - sd.saveSec);
      if (diff < bestDiff) { best = lc; bestDiff = diff; }
    }
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best });
  }
  return pairs;
}

function sessionsOf(serverText, localText) {
  const sv = splitSessions(serverText);
  const lc = splitSessions(localText);
  if (sv.length === 1 && lc.length === 1) return [{ sv: sv[0], lc: lc[0] }];
  return buildPairs(sv, lc);
}

function loadEngine() {
  const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, Date, isFinite, isNaN, parseInt, parseFloat, Float32Array, Int32Array };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js']) {
    vm.runInContext(read(path.join(ROOT, file)), ctx, { filename: file });
  }
  return ctx;
}

function counts(turn) {
  const out = { arrow:0, spell:0, rune:0, grenade:0, unresolved:0 };
  for (const comp of turn.components || []) {
    const k = comp.comp || 'unresolved';
    const n = (comp.hits || []).length;
    if (k in out) out[k] += n;
    else out.unresolved += n;
  }
  return out;
}

function componentSignature(turn) {
  return (turn.components || []).map(comp => {
    const action = comp.action || {};
    const actionTs = action.ts == null ? '-' : clock(action.ts);
    return `${comp.comp}:${(comp.hits || []).length}:${action.text || comp.actionLabel || '-'}@${actionTs}`;
  }).join('|');
}

function grenadeCastSignature(turn) {
  return (turn.components || [])
    .filter(c => c.comp === 'grenade')
    .map(c => {
      const a = c.action || {};
      return `${a.text || c.actionLabel || 'grenade'}@${a.ts == null ? '-' : clock(a.ts)}:${(c.hits || []).length}`;
    })
    .join('|');
}

function turnSignature(turn) {
  const c = counts(turn);
  return {
    status: turn.status || '-',
    reason: turn.reason || '-',
    partialEdgeMissingEvidence: !!turn.partialEdgeMissingEvidence,
    counts: c,
    components: componentSignature(turn),
    grenadeCasts: grenadeCastSignature(turn),
  };
}

function sameSignature(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function keyOf(row) {
  return `${row.label}|${row.sessionIndex}|${row.date || '-'}|${row.ts}`;
}

function classifyPair(ctx, label, serverName, localName) {
  const serverPath = path.join(LOG_DIR, serverName);
  const localPath = path.join(LOG_DIR, localName);
  if (!fs.existsSync(serverPath) || !fs.existsSync(localPath)) return [];
  const opts = {
    mobModsPre: ctx.MOB_ELEMENT_MODS,
    mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
    strictLeech: true,
    maxOriginal: 6000,
    useFloat16Mitigation: true,
  };
  const rows = [];
  const pairs = sessionsOf(read(serverPath), read(localPath));
  pairs.forEach((pair, sessionIndex) => {
    const result = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, opts);
    if (!result || result.error) return;
    const turns = result.turns || [];
    const grenadeCasts = (result.facts && result.facts.local && result.facts.local.grenadeCasts) || [];
    const touched = new Set();
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const hasGrenade = (turn.components || []).some(c => c.comp === 'grenade');
      const hitsWindow = grenadeCasts.some(c => (turn.hits || []).some(h => h.ts >= c.ts + 2 && h.ts <= c.ts + 4));
      if (hasGrenade || hitsWindow) touched.add(i);
    }
    for (const cast of grenadeCasts) {
      const indices = [];
      for (let i = 0; i < turns.length; i++) {
        if ((turns[i].hits || []).some(h => h.ts >= cast.ts + 2 && h.ts <= cast.ts + 4)) indices.push(i);
      }
      if (new Set(indices.map(i => turns[i].ts)).size > 1) {
        for (const i of indices) {
          touched.add(i);
          if (i > 0) touched.add(i - 1);
          if (i + 1 < turns.length) touched.add(i + 1);
        }
      }
    }
    const date = pair.sv.date ? `${pair.sv.date.year}-${String(pair.sv.date.month).padStart(2, '0')}-${String(pair.sv.date.day).padStart(2, '0')}` : '';
    for (const i of [...touched].sort((a, b) => a - b)) {
      const turn = turns[i];
      rows.push({
        label,
        serverName,
        localName,
        sessionIndex,
        date,
        postCutoff: isPostCutoff(pair.sv.date),
        ts: clock(turn.ts),
        rawTs: turn.ts,
        key: `${label}|${sessionIndex}|${date}|${clock(turn.ts)}`,
        signature: turnSignature(turn),
      });
    }
    for (const turn of turns) {
      rows.push({
        label,
        serverName,
        localName,
        sessionIndex,
        date,
        postCutoff: isPostCutoff(pair.sv.date),
        ts: clock(turn.ts),
        rawTs: turn.ts,
        key: `${label}|${sessionIndex}|${date}|${clock(turn.ts)}`,
        unresolvedProbe: true,
        unresolved: turn.status === 'unresolved' || (turn.components || []).some(c => c.comp === 'unresolved'),
        partialEdgeMissingEvidence: !!turn.partialEdgeMissingEvidence,
      });
    }
  });
  return rows;
}

function makeSnapshot() {
  const ctx = loadEngine();
  const grenadeRows = [];
  const unresolvedRows = [];
  for (const [label, sv, lc] of PAIRS) {
    console.error(`[grenade-audit] ${label}`);
    for (const row of classifyPair(ctx, label, sv, lc)) {
      if (row.unresolvedProbe) unresolvedRows.push(row);
      else grenadeRows.push(row);
    }
  }
  const postCutoffUnresolved = unresolvedRows.filter(r => r.postCutoff && r.unresolved && !r.partialEdgeMissingEvidence).length;
  return {
    generatedAt: new Date().toISOString(),
    grenadeEligibleTurns: grenadeRows,
    summary: {
      grenadeEligibleCount: grenadeRows.length,
      postCutoffUnresolved,
      postCutoffTurns: unresolvedRows.filter(r => r.postCutoff).length,
    },
  };
}

function compareSnapshots(before, after) {
  const beforeMap = new Map(before.grenadeEligibleTurns.map(r => [keyOf(r), r]));
  const afterMap = new Map(after.grenadeEligibleTurns.map(r => [keyOf(r), r]));
  const keys = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  const changed = [];
  const added = [];
  const removed = [];
  for (const key of [...keys].sort()) {
    const a = beforeMap.get(key);
    const b = afterMap.get(key);
    if (!a) added.push(b);
    else if (!b) removed.push(a);
    else if (!sameSignature(a.signature, b.signature)) changed.push({ key, before: a, after: b });
  }
  return {
    beforeSummary: before.summary,
    afterSummary: after.summary,
    unchanged: before.grenadeEligibleTurns.length - changed.length - removed.length,
    changed,
    added,
    removed,
  };
}

const outPath = argValue('--out');
const comparePath = argValue('--compare');
const onlyPair = argValue('--only');
const skipPair = argValue('--skip');
if (onlyPair) {
  const keep = onlyPair.toLowerCase();
  PAIRS.splice(0, PAIRS.length, ...PAIRS.filter(([label]) => label.toLowerCase().includes(keep)));
}
if (skipPair) {
  const skip = skipPair.toLowerCase();
  PAIRS.splice(0, PAIRS.length, ...PAIRS.filter(([label]) => !label.toLowerCase().includes(skip)));
}
const snapshot = makeSnapshot();
if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');
}
if (comparePath) {
  const before = JSON.parse(read(comparePath));
  const comparison = compareSnapshots(before, snapshot);
  console.log(JSON.stringify(comparison, null, 2));
} else {
  console.log(JSON.stringify(snapshot.summary, null, 2));
}
