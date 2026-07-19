// dump-all.mjs — despeja contagens por turno alinhado de TODAS as sessões de TODOS os
// pares. Artefato estável p/ diff antes/depois de uma mudança no classificador.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');

const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
function freshCtx() {
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date };
  vm.createContext(ctx);
  for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js',
                   'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
    vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  }
  return ctx;
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
  const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(s.header);
  if (!m) return null;
  return { year:+m[6], month:MONTHS[m[1]]||0, day:+m[2], saveSec:+m[3]*3600+ +m[4]*60+ +m[5] };
}
function buildPairs(svS, lcS) {
  const pairs = [];
  for (const sv of svS) {
    const sd = parseSessionDate(sv); if (!sd) continue;
    let best = null, bestDiff = Infinity;
    for (const lc of lcS) { const ld = parseSessionDate(lc); if (!ld || ld.year!==sd.year||ld.month!==sd.month||ld.day!==sd.day) continue;
      const diff = Math.abs(ld.saveSec - sd.saveSec); if (diff < bestDiff) { bestDiff = diff; best = lc; } }
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best });
  }
  return pairs;
}

const PAIRS = [
  ['Hakka Server Log.txt','Hakka Local Chat.txt'],
  ['Server Log bakra.txt','Local Chat bakra.txt'],
  ['Server Log drome.txt','Local Chat drome.txt'],
  ['Mrowdy Server Log.txt','Mrowdy Local Chat.txt'],
  ['Mrowdy Server Log 2.txt','Mrowdy Local Chat 2.txt'],
  ['bastion server log ek.txt','bastion local chat ek.txt'],
  ['darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt'],
  ['darklight server log rp.txt','darklight local chat rp.txt'],
  ['essence server log.txt','essence local chat.txt'],
  ['highwin Server Log.txt','highwin Local Chat.txt'],
  ['jaded Server Log.txt','jaded Local Chat.txt'],
  ['server log rp.txt','localchat rp.txt'],
  ['monk server log.txt','monk localchat.txt'],
  ['murcion server log rp.txt','murcion local chat rp.txt'],
  ['night harpy server log ek.txt','night harpy local chat ek.txt'],
  ['uhax 2 server log ed.txt','uhax 2 local chat ed.txt'],
  ['uhax server log ed.txt','uhax local chat ed.txt'],
];

const out = [];
for (const [svN, lcN] of PAIRS) {
  const svP = 'logs/' + svN, lcP = 'logs/' + lcN;
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) { out.push(`PAIR=${svN} MISSING`); continue; }
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  let sessions;
  if (svS.length === 1 && lcS.length === 1) sessions = [{ sv: svS[0], lc: lcS[0] }];
  else sessions = buildPairs(svS, lcS);
  if (!sessions.length) { out.push(`PAIR=${svN} NO_PAIRS`); continue; }
  sessions.forEach((pair, si) => {
    const ctx = freshCtx(); // processo fresco lógico p/ não contaminar estado de parser
    let res;
    try { res = ctx.classifyWithLocalChat(pair.sv.text, pair.lc.text, { trace: true }); }
    catch (e) { out.push(`PAIR=${svN} S${si} THROW ${e.message}`); return; }
    if (res.error) { out.push(`PAIR=${svN} S${si} ERR ${res.error}`); return; }
    for (const tr of (res.turnTrace || [])) {
      out.push(`${svN} S${si} ts=${tr.ts} a=${tr.counts.arrow} s=${tr.counts.spell} r=${tr.counts.rune} g=${tr.counts.grenade} sp=${tr.spell||tr.gren||tr.rune||'-'}`);
    }
  });
}
process.stdout.write(out.join('\n') + '\n');
