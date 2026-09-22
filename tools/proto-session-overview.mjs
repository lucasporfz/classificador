#!/usr/bin/env node
// PROTOTYPE — throwaway. Extrai um "resumo de sessao" do motor Unified pra alimentar
// prototypes/session-overview.prototype.html. Nao e produto; nao importar de js/.
// Uso: node tools/proto-session-overview.mjs "logs/sv.txt" "logs/lc.txt" [--session N]
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js','js/unified-main.js'])
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,Sept:8 };
function splitSessions(text) {
  const sessions = []; let cur = null; const pre = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(HEADER_RE);
    if (m) {
      if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
      const [, mon, day, time, year] = m; const [h, mi, s] = time.split(':').map(Number);
      cur = { header: line.trim(), year:+year, month: MONTHS[mon] ?? -1, day:+day, saveSec: h*3600+mi*60+s, lines:[line] };
    } else if (cur) cur.lines.push(line); else pre.push(line);
  }
  if (cur) { cur.text = cur.lines.join('\n'); sessions.push(cur); }
  if (!sessions.length) sessions.push({ header:'', year:0, month:0, day:0, saveSec:0, lines: pre, text: pre.join('\n') });
  return sessions;
}
function buildPairsByIndex(svAll, lcAll) {
  const pairs = [];
  for (const sv of svAll) {
    if (!sv.header) continue;
    const c = lcAll.filter(lc => lc.header && lc.year===sv.year && lc.month===sv.month && lc.day===sv.day && Math.abs(lc.saveSec-sv.saveSec) <= 3600);
    if (!c.length) continue;
    c.sort((a,b)=>Math.abs(a.saveSec-sv.saveSec)-Math.abs(b.saveSec-sv.saveSec));
    pairs.push({ sv, lc: c[0] });
  }
  return pairs;
}
const argv = process.argv.slice(2);
const si = argv.indexOf('--session'); const sessionIdx = si >= 0 ? +argv[si+1] : 0;
const pos = argv.filter((a,i)=>a!=='--session' && argv[i-1]!=='--session');
const [svP, lcP] = pos;
const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
const pairs = (svS.length===1 && lcS.length===1) ? [{sv:svS[0], lc:lcS[0]}] : buildPairsByIndex(svS, lcS);
const pair = pairs[sessionIdx];
if (!pair) { console.error(`sessao ${sessionIdx} fora do intervalo (${pairs.length})`); process.exit(1); }

const u = ctx.UnifiedMainClassifier.classifyUnified(pair.sv.text, pair.lc.text);
if (u.error) { console.error('erro: ' + u.error); process.exit(1); }
const ui = ctx.UnifiedMainClassifier.adaptUnifiedForClassifierUi(u);
const server = u.facts.server;

// --- charms -------------------------------------------------------------
const CHARM_RE = /\(\s*([a-zA-Z' -]*?)\s*charm/i;
const charms = new Map();
let charmTotal = 0;
for (const ev of server.events || []) {
  if (ev.kind !== 'charm') continue;
  const m = CHARM_RE.exec(ev.rawLine || '');
  const name = (m ? m[1] : 'desconhecido').trim().toLowerCase();
  const c = charms.get(name) || { name, hits: 0, dmg: 0, mobSet: new Set(), byMob: {}, min: Infinity, max: 0 };
  c.hits++; c.dmg += ev.dmg; c.mobSet.add(ev.mob); c.byMob[ev.mob] = (c.byMob[ev.mob] || 0) + ev.dmg;
  c.min = Math.min(c.min, ev.dmg); c.max = Math.max(c.max, ev.dmg);
  charms.set(name, c); charmTotal += ev.dmg;
}

// --- atribuicao de charm ao componente ----------------------------------
// Regra fechada no grill: um proc de charm veio de UM hit, e o log grava o charm
// imediatamente ANTES desse hit. Atribui pelo proximo hit no mesmo mob/segundo,
// incluindo os hits VIRTUAIS (dano 0) que o motor cria por charm-kill (S-014e).
const compOfHit = new Map();
const virtualKeys = new Set();
for (const t of u.turns || []) for (const c of t.components || []) for (const h of c.hits || []) {
  const label = c.actionLabel || c.label || c.comp;
  compOfHit.set(h.id, label);
  if (h.virtual) virtualKeys.set ? null : null;
  if (h.virtual) virtualKeys.add((h.ts) + '|' + (h.mob || '') + '|' + label);
}
const charmByComp = new Map();
let charmUnattributed = 0, charmUnattributedProcs = 0;
{
  const evs2 = server.events || [];
  for (let i = 0; i < evs2.length; i++) {
    const e = evs2[i];
    if (e.kind !== 'charm') continue;
    let j = i + 1; while (j < evs2.length && evs2[j].kind !== 'hit') j++;
    const nx = evs2[j];
    let label = null;
    if (nx && nx.ts === e.ts && nx.mob === e.mob && compOfHit.has(nx.id)) label = compOfHit.get(nx.id);
    if (!label) {
      for (const k of virtualKeys) {
        const parts = k.split('|');
        if (+parts[0] === e.ts && parts[1] === e.mob) { label = parts.slice(2).join('|'); break; }
      }
    }
    if (!label) { charmUnattributed += e.dmg; charmUnattributedProcs++; continue; }
    const cur = charmByComp.get(label) || { dmg: 0, procs: 0 };
    cur.dmg += e.dmg; cur.procs++; charmByComp.set(label, cur);
  }
}

// --- leech + dano -------------------------------------------------------
let life = 0, mana = 0, dmgTotal = 0, hitCount = 0, overkillHits = 0;
let lowBlowHits = 0, savageHits = 0, onslaughtHits = 0, critHits = 0;
const perComp = new Map();
const mobs = new Map();
for (const t of u.turns || []) {
  for (const comp of t.components || []) {
    const key = comp.actionLabel || comp.label || comp.comp;
    const p = perComp.get(key) || { label: key, comp: comp.comp, hits: 0, dmg: 0, life: 0, mana: 0, turnSet: new Set() };
    p.turnSet.add(t.ts);
    for (const h of comp.hits || []) {
      p.hits++; p.dmg += h.dmg || 0; p.life += h.lifeLeech || 0; p.mana += h.manaLeech || 0;
      const mo = mobs.get(h.mob) || { mob: h.mob, hits: 0, dmg: 0 };
      mo.hits++; mo.dmg += h.dmg || 0; mobs.set(h.mob, mo);
    }
    perComp.set(key, p);
  }
}
for (const h of server.hits || []) {
  dmgTotal += h.dmg || 0; hitCount++;
  life += h.lifeLeech || 0; mana += h.manaLeech || 0;
  if (h.overkill) overkillHits++;
  if (h.lowBlow) lowBlowHits++;
  if (h.savageBlow) savageHits++;
  if (h.onslaught) onslaughtHits++;
  if (h.type === 'crit') critHits++;
}
const ts = (u.turns||[]).map(t=>t.ts).filter(Number.isFinite);
const clock = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const statuses = {};
for (const t of u.turns||[]) statuses[t.status] = (statuses[t.status]||0)+1;

function trimVote(v) {
  if (!v) return null;
  return { channel: v.channel, base: v.base, coreBase: v.coreBase, ok: v.ok, exact: v.exact, high: v.high, low: v.low,
    observed: v.observed, independentTurns: v.independentTurns, mobs: v.mobs, contradictions: v.contradictions,
    candidateMob: v.candidateMob, candidateBonus: v.candidateBonus, confidence: v.confidence,
    examples: (v.examples || []).slice(0, 4) };
}
function trimLeech(l) {
  if (!l) return null;
  return { lifeBase: l.lifeBase, manaBase: l.manaBase, lifeCharm: l.lifeCharm || null, manaCharm: l.manaCharm || null,
    minorLifeCharm: l.minorLifeCharm || null, minorManaCharm: l.minorManaCharm || null,
    exposeWeaknessManaPerk: l.exposeWeaknessManaPerk, confidence: l.confidence, inferred: l.inferred,
    source: l.source, evidenceCount: l.evidenceCount, contradictions: l.contradictions,
    lifeVote: trimVote(l.lifeVote), manaVote: trimVote(l.manaVote) };
}
const out = {
  fixture: path.basename(svP).replace(/\.txt$/i,''),
  session: sessionIdx,
  header: pair.sv.header,
  player: u.selectedSpeaker, vocation: u.vocation,
  from: ts.length ? clock(Math.min(...ts)) : null, to: ts.length ? clock(Math.max(...ts)) : null,
  durationSec: ts.length ? Math.max(...ts) - Math.min(...ts) : 0,
  turns: (u.turns||[]).length, statuses,
  mobModsRegime: u.mobModsRegime,
  totals: { dmg: dmgTotal, hits: hitCount, life, mana, overkillHits, critHits, lowBlowHits, savageHits, onslaughtHits, charmDmg: charmTotal },
  charms: [...charms.values()].map(c => ({ name: c.name, hits: c.hits, dmg: c.dmg, mobs: c.mobSet.size, byMob: c.byMob, avg: Math.round(c.dmg/c.hits), min: c.min, max: c.max })).sort((a,b)=>b.dmg-a.dmg),
  components: [...perComp.values()].map(p => ({ label: p.label, comp: p.comp, hits: p.hits, dmg: p.dmg, life: p.life, mana: p.mana, turns: p.turnSet.size })).sort((a,b)=>b.dmg-a.dmg),
  mobs: [...mobs.values()].sort((a,b)=>b.dmg-a.dmg).slice(0,12),
  setup: {
    leech: trimLeech(u.leechSetup),
    bountyTalisman: u.bountyTalismanSetup,
    gravSan: u.gravSanSetup && { source: u.gravSanSetup.source, windows: (u.gravSanSetup.windows||[]).length, bonus: u.gravSanSetup.bonus, confidence: u.gravSanSetup.confidence },
    bmPierce: u.bmPierce, bmPierceDetection: u.bmPierceDetection,
    aaElement: u.aaElement,
    aaElementDetection: u.aaElementDetection && { element: u.aaElementDetection.element, source: u.aaElementDetection.source, eligible: u.aaElementDetection.eligible },
    weaponPhysicalPierce: u.weaponPhysicalPierce,
    weaponPhysicalPierceDetection: u.weaponPhysicalPierceDetection && { pierce: u.weaponPhysicalPierceDetection.pierce, active: u.weaponPhysicalPierceDetection.active, source: u.weaponPhysicalPierceDetection.source },
    bestiaryClassDamageBonus: u.bestiaryClassDamageBonus,
    crit: u.critSetup && { multiplier: u.critSetup.multiplier, source: u.critSetup.source, byComponent: u.critSetup.byComponent },
    omega: u._context && u._context.omegaSetup,
    goldLeechObservationCount: u.goldLeechObservationCount,
  },
  uptime: {
    aa: ui.aaUptime, spellRune: ui.spellRuneUptime,
    totalTurns: ui.totalTurns, excludedTurns: ui.excludedTurns,
  },
  charmByComponent: Object.fromEntries(charmByComp),
  charmUnattributed: { dmg: charmUnattributed, procs: charmUnattributedProcs },
  rows: (ui.rows||[]).map(r => ({ label: r.label, kind: r.kind, turns: r.turns, hitsMean: r.hitsMean,
    dmgBase: r.dmgBase, dmgEff: r.dmgEff, dmgBasePerHit: r.dmgBasePerHit, dmgEffPerHit: r.dmgEffPerHit,
    totalEff: (r.damageTimeline || []).reduce((a, b) => a + (+b || 0), 0),
    hitsTimeline: r.hitsTimeline || [], damageTimeline: r.damageTimeline || [] })),
  clocks: (ui.turnTrace || []).map(t => t.clock),
};
process.stdout.write(JSON.stringify(out, null, 2));
