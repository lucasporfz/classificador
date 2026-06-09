#!/usr/bin/env node
// Roda o classificador nos pares de sessão casados entre um server log e um local chat
// acumulados (multi-sessão). Mesma lógica de pareamento da UI (clsBuildPairs).
// Uso: node tools/run-session-pairs.mjs "logs/server.txt" "logs/chat.txt"
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');

const ctx = { console, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date };
vm.createContext(ctx);
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js',
                 'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
}

const argv = process.argv.slice(2);
const serverPath = argv[0] || 'logs/server log rp.txt';
const chatPath   = argv[1] || 'logs/localchat rp.txt';

// --- split sessions (mesma lógica do app.js) ---
const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11, Sept:8 };

function splitSessions(text) {
  const lines = text.split('\n');
  const sessions = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m;
      const [h, min, s] = time.split(':').map(Number);
      const month = MONTHS[mon] ?? -1;
      const saveSec = h * 3600 + min * 60 + s;
      cur = { header: line.trim(), year: +year, month, day: +day, saveSec, lines: [line] };
    } else {
      if (!cur) cur = { header: '', year: 0, month: 0, day: 0, saveSec: 0, lines: [] };
      cur.lines.push(line);
    }
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  return sessions;
}

function sessionLabel(s) {
  if (!s.header) return '(sem cabeçalho)';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = Math.floor(s.saveSec / 3600);
  const min = String(Math.floor((s.saveSec % 3600) / 60)).padStart(2,'0');
  return `${String(s.day).padStart(2,'0')}/${months[s.month] ?? '?'}/${s.year} ${String(h).padStart(2,'0')}:${min}`;
}

function buildPairs(svSessions, lcSessions) {
  const pairs = [];
  for (const sv of svSessions) {
    if (!sv.header) continue;
    const candidates = lcSessions.filter(lc =>
      lc.header &&
      lc.year === sv.year && lc.month === sv.month && lc.day === sv.day &&
      Math.abs(lc.saveSec - sv.saveSec) <= 3600
    );
    if (!candidates.length) continue;
    candidates.sort((a, b) => Math.abs(a.saveSec - sv.saveSec) - Math.abs(b.saveSec - sv.saveSec));
    pairs.push({ sv, lc: candidates[0], diff: Math.abs(candidates[0].saveSec - sv.saveSec) });
  }
  return pairs;
}

const svSessions = splitSessions(read(serverPath));
const lcSessions = splitSessions(read(chatPath));
const pairs = buildPairs(svSessions, lcSessions);

if (!pairs.length) { console.log('Nenhum par encontrado.'); process.exit(1); }
console.log(`${pairs.length} par(es) encontrado(s).\n`);

for (let i = 0; i < pairs.length; i++) {
  const { sv, lc, diff } = pairs[i];
  console.log(`${'='.repeat(72)}`);
  console.log(`PAR ${i + 1}/${pairs.length}  server: ${sessionLabel(sv)}  |  chat: ${sessionLabel(lc)}  (diff ${diff}s)`);
  console.log(`${'='.repeat(72)}`);

  const res = ctx.classifyWithLocalChat(sv.text, lc.text, {});
  if (res.error) { console.log('ERRO: ' + res.error); continue; }

  console.log('jogador: ' + (res.player || '—') +
    '   | spell: ' + (res.damageSpells.join(', ') || '—') +
    '   | granada: ' + ((res.grenadeSpells || []).join(', ') || '—'));
  console.log('\n  turnos  hits méd  dano base  dano efet  componente/spell');
  for (const r of res.rows) {
    console.log('  ' + String(r.turns).padStart(6) + '  ' + r.hitsMean.toFixed(2).padStart(8) +
      '  ' + String(r.dmgBase).padStart(9) + '  ' + String(r.dmgEff).padStart(9) + '  ' + r.label);
    if (r.tiers && r.tiers.length) {
      for (const tier of r.tiers) {
        const tlabel = tier.kind === 'tier_bonus'
          ? 'com bônus' + (r.bonusMult ? ' (×' + r.bonusMult.toFixed(2) + ')' : '')
          : 'sem bônus';
        console.log('  ' + ''.padStart(6) + '  ' + tier.hitsMean.toFixed(2).padStart(8) +
          '  ' + String(tier.dmgBase).padStart(9) + '  ' + String(tier.dmgEff).padStart(9) + '    └ ' + tlabel);
      }
    }
  }
  console.log('  (' + res.excludedTurns + '/' + res.totalTurns + ' turnos excluídos)');

  console.log('\n  incantações detectadas (top 6):');
  console.log('  covered  recall  overcast  total  classe   speaker: incantação');
  for (const g of res.ranked.slice(0, 6)) {
    const cls = (g.speaker === res.player && g.kind !== '—') ? ('✔ ' + g.kind) : (g.kind === '—' ? '—' : g.kind);
    console.log('  ' + String(g.covered).padStart(7) + '  ' + (g.recall * 100).toFixed(0).padStart(4) + '%  ' +
      (isFinite(g.overcast) ? g.overcast.toFixed(2) : '  ∞').padStart(7) + '  ' + String(g.total).padStart(5) +
      '  ' + cls.padEnd(9) + '  ' + g.speaker + ': ' + g.text);
  }
  console.log('');
}
