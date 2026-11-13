#!/usr/bin/env node
// PROTOTYPE — throwaway. Extrai de um par de logs o que o ranking poderia guardar por
// SESSÃO (vocação, level, mob dominante, hits por componente, uptime de AA, AA/h, maior
// dano num turno), rodando o Unified com as opções da UI. Não é produto; não importar de js/.
// Uso: node tools/proto-ranking-extract.mjs "logs/sv.txt" "logs/lc.txt" [--post-cutoff-only] [--split N]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';

const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js','js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js','js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js','js/unified-main.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Sept:8,Oct:9,Nov:10,Dec:11 };
function splitSessions(text) {
  const sessions = []; let cur = null; const pre = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year: +year, month: MONTHS[mon] ?? -1, day: +day, saveSec: h*3600+mi*60+s, lines: [line] };
    } else if (cur) cur.lines.push(line); else pre.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  if (!sessions.length) sessions.push({ header: '', year: 0, month: 0, day: 0, saveSec: 0, lines: pre, text: pre.join('\n') });
  return sessions;
}
function pairSessions(svAll, lcAll) {
  if (svAll.length === 1 && lcAll.length === 1) return [{ sv: svAll[0], lc: lcAll[0] }];
  const pairs = [];
  for (const sv of svAll) {
    if (!sv.header) continue;
    const c = lcAll.filter(lc => lc.header && lc.year === sv.year && lc.month === sv.month && lc.day === sv.day && Math.abs(lc.saveSec - sv.saveSec) <= 3600);
    if (!c.length) continue;
    c.sort((a, b) => Math.abs(a.saveSec - sv.saveSec) - Math.abs(b.saveSec - sv.saveSec));
    pairs.push({ sv, lc: c[0] });
  }
  return pairs;
}
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const argv = process.argv.slice(2);
const [svP, lcP] = argv.filter((a, k) => !a.startsWith('--') && argv[k - 1] !== '--split');
const splitIdx = argv.indexOf('--split');
const splitN = splitIdx >= 0 ? Math.max(1, +argv[splitIdx + 1] || 1) : 1;   // quebra cada sessão em N fatias contíguas de turnos
const MIN_CHUNK_TURNS = 10;
const postOnly = argv.includes('--post-cutoff-only');
const pairs = pairSessions(splitSessions(read(svP)), splitSessions(read(lcP)));
const out = [];

pairs.forEach((pair, idx) => {
  const { sv, lc } = pair;
  const dated = sv.header ? new Date(Date.UTC(sv.year, sv.month, sv.day)) : null;
  const iso = dated ? dated.toISOString().slice(0, 10) : null;
  if (postOnly && iso && iso < '2026-06-16') return;
  const u = ctx.UnifiedMainClassifier.classifyUnified(sv.text, lc.text);
  if (!u || u.error) { out.push({ file: path.basename(svP), session: idx, date: iso, error: u && u.error || 'sem resultado' }); return; }
  const speaker = u.selectedSpeaker || null;

  // level: o Local Chat grava "Nome [2600]: ..." em toda fala
  let level = null;
  if (speaker) {
    const lv = [...lc.text.matchAll(new RegExp(escapeRe(speaker) + ' \\[(\\d+)\\]', 'gi'))].map(m => +m[1]);
    if (lv.length) level = Math.max(...lv);
  }

  // A sessão é classificada UMA vez (setup de leech, crit etc. inferidos no log inteiro); as fatias só dividem os turnos já resolvidos.
  const visible = (u.turns || []).filter(t => t && !t.partialEdgeMissingEvidence);
  const size = Math.ceil(visible.length / splitN);
  for (let part = 0; part < splitN; part++) {
    const chunk = splitN === 1 ? u.turns : visible.slice(part * size, (part + 1) * size);
    if (splitN > 1 && chunk.length < MIN_CHUNK_TURNS) continue;
    // _context não é enumerável: Object.assign o perde, e sem ele o bônus do tapete (grav san) e os setups sumiriam da fatia
    const part_u = Object.assign({}, u, { turns: chunk }); part_u._context = u._context;
    const ui = ctx.UnifiedMainClassifier.adaptUnifiedForClassifierUi(part_u);
    if (ui.error) continue;

    // mob dominante (proxy de "hunt"): quem recebeu mais eventos de dano do jogador, dentro da fatia
    const t0 = ui.turnTrace.length ? ui.turnTrace[0].ts : -Infinity, t1 = ui.turnTrace.length ? ui.turnTrace[ui.turnTrace.length - 1].ts : Infinity;
    const mobCount = new Map(); let mobTotal = 0;
    for (const ev of (u.facts && u.facts.server && u.facts.server.events) || []) {
      if (!ev || !ev.mob) continue;
      if (splitN > 1 && Number.isFinite(+ev.ts) && (ev.ts < t0 - 1 || ev.ts > t1 + 1)) continue;
      mobCount.set(ev.mob, (mobCount.get(ev.mob) || 0) + 1); mobTotal++;
    }
    const mobs = [...mobCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => ({ name, share: +(n / mobTotal).toFixed(3) }));

    // Hits médios ajustados (grav san), mesma fórmula da UI (clsGravSanAdjustedHits em js/app.js): hitsMean × (1 + bônus do tapete × parcela dos hits do componente em turnos com tapete ativo)
    const bonus = +ui.gravSanBonus || 0, idOf = r => r.kind + '|' + r.label, carpetBy = new Map((ui.gravSanRows || []).map(g => [idOf(g), g]));
    const hitsAdj = new Map(ui.rows.map(r => { const tot = (+r.hitsMean || 0) * (+r.turns || 0), g = carpetBy.get(idOf(r)), ch = g ? (+g.hitsMean || 0) * (+g.turns || 0) : null, share = (ch != null && tot > 0) ? ch / tot : 0; return [idOf(r), (+r.hitsMean || 0) * (1 + bonus * share)]; }));
    const carpetDen = ui.rows.reduce((a, r) => a + (+r.turns || 0), 0), carpetUsed = +ui.gravSanComponentsUsed || 0;
    const maxTurnDamage = Math.max(0, ...ui.turnTrace.filter(t => !t.partialEdge).map(t => +t.damage || 0));
    // maior dano somado numa única criatura dentro de um único turno (burst de alvo único, não cresce com AoE)
    // maior hit isolado numa criatura (cada linha do log é um hit; o log não distingue criaturas de mesmo nome, então a soma por mob não serve)
    const maxSingleHit = Math.max(0, ...ui.turnTrace.filter(t => !t.partialEdge).flatMap(t => (t.lines || []).map(l => +l.dmg || 0)));
    const maxMobTurnDamage = Math.max(0, ...ui.turnTrace.filter(t => !t.partialEdge).map(t => { const by = new Map(); for (const l of t.lines || []) by.set(l.mob, (by.get(l.mob) || 0) + (+l.dmg || 0)); return Math.max(0, ...by.values()); }));
    out.push({
      file: path.basename(svP), session: idx, part: splitN > 1 ? part + 1 : null, parts: splitN, date: iso,
      player: speaker, vocation: u.vocation || null, level, mobs,
      totalTurns: ui.totalTurns, unresolvedTurns: (ui.turnTrace || []).filter(t => t.unifiedStatus && t.unifiedStatus !== 'ok' && t.unifiedStatus !== 'resolved').length,
      classifiedSeconds: ui.aaUptime.classifiedSeconds,
      aa: { pct: ui.aaUptime.pct, perHour: ui.aaUptime.perHour, hit: ui.aaUptime.hit, expected: ui.aaUptime.expected },
      spellRune: { pct: ui.spellRuneUptime.pct, perHour: ui.spellRuneUptime.perHour },
      maxTurnDamage, maxMobTurnDamage, maxSingleHit,
      gravSan: { bonus, used: carpetUsed, inWindow: +ui.gravSanComponentCount || 0, den: carpetDen, uptime: carpetDen > 0 ? carpetUsed / carpetDen : 0 },
      rows: ui.rows.map(r => ({
        label: r.label, kind: r.kind, turns: r.turns, hitsMean: +r.hitsMean.toFixed(3), hitsAdj: +hitsAdj.get(idOf(r)).toFixed(3),
        maxTurnDmg: Math.max(0, ...(r.damageTimeline || [0])), dmgEffPerTurn: r.dmgEffPerTurn,
      })),
    });
  }
});
process.stdout.write(JSON.stringify(out));
