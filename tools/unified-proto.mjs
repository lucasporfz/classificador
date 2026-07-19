#!/usr/bin/env node
// unified-proto.mjs — protótipo do "modelo unificado" (2 fases) desenvolvido OFFLINE contra
// dados reais via o hook opts.__captureInputs do classifyWithLocalChat. Para cada turno:
//   Fase 1 (buildEvidence): monta evidência imutável (linhas cruas + âncoras de cast/runa/granada).
//   Fase 2 (classifyTurn):  rótulo por linha (Eixo 1 elemento, Eixo 2 elemental por âncora).
// Compara os rótulos do modelo unificado com os do pipeline LEGADO (res.turnTrace) por linha,
// e reporta taxa de concordância + as transições de divergência (legado→unificado).
//
// Uso: node tools/unified-proto.mjs [logs/<server>.txt logs/<localchat>.txt] | (default: conjunto rep.)
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
  return sessions.map(s => s.lines.join('\n'));
}
function parseSessionDate(s) {
  const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(s.split('\n')[0] || '');
  if (!m) return null;
  return { year:+m[6], month:MONTHS[m[1]]||0, day:+m[2], saveSec:+m[3]*3600+ +m[4]*60+ +m[5] };
}
function sessionPairs(svP, lcP) {
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  if (svS.length === 1 && lcS.length === 1) return [{ sv: svS[0], lc: lcS[0] }];
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

const clsMedian = arr => { const s = arr.slice().sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n-1)/2] : (s[n/2-1] + s[n/2]) / 2) : 0; };

// ============ MODELO UNIFICADO (protótipo) ============
// Fase 1: evidência imutável por turno.
function buildEvidence(ctx, cap) {
  const { turns, playerSpellCasts, playerGrenCasts, runeUses, isRpRegime, distinctMobs } = cap;
  const spellCastTss = new Set(playerSpellCasts.map(c => c.ts));
  // AA holy ref da sessão (= clsComputeAaHolyRef): mediana da base holy dos hits físicos (AA).
  // Usada para rejeitar "granada" no nível do próprio AA (G2).
  const aaVals = [];
  for (const t of turns) for (const l of (t.lines || [])) {
    if ((l.inferredElement || 'physical') !== 'physical' || l.overkill) continue;
    const hb = ctx.clsHolyBaseOf(l); if (hb > 0) aaVals.push(hb);
  }
  const aaRef = aaVals.length >= 5 ? clsMedian(aaVals) : 0;
  // EK/melee: vocação cujo ataque é exori* melee (não-RP). AA single-target logado 1º todo turno.
  const spellTexts = playerSpellCasts.map(c => c.text);
  const isMelee = !isRpRegime && spellTexts.length > 0 && spellTexts.every(t => /^exori\b/.test(t));
  return turns.map(t => {
    // âncora de spell: cast do jogador em [ts-1, ts+2] (a spell AoE cai ~1s após o AA).
    const spellCast = playerSpellCasts
      .filter(c => c.ts >= t.ts - 1 && c.ts <= t.ts + 2)
      .sort((a, b) => Math.abs(a.ts - t.ts) - Math.abs(b.ts - t.ts))[0] || null;
    // âncora de granada: cast cuja explosão [c+2, c+4] cobre algum hit deste turno.
    const grenadeCast = playerGrenCasts
      .filter(c => (t.lines || []).some(l => l.ts >= c.ts + 2 && l.ts <= c.ts + 4))
      .sort((a, b) => b.ts - a.ts)[0] || null;
    const ru = runeUses.find(u => u.ts >= t.ts - 1 && u.ts <= t.ts + 2) || null;
    const runeUse = ru ? { ...ru, element: ru.element || ctx.getRuneElement(ru.name) } : null;
    return { ts: t.ts, lines: t.lines, spellCast, grenadeCast, runeUse, aaRef, isMelee,
             cooldownActive: ts => spellCastTss.has(ts - 1) || spellCastTss.has(ts - 2),
             regime: distinctMobs === 1 ? 'single' : (isRpRegime ? 'rp-pack' : 'other'), distinctMobs };
  });
}

// Eixo 1: elemento do hit. Usa inferredElement do parser (já reverte a cauda e testa o mod).
function elementOf(l) { return l.inferredElement || 'physical'; }

// Granada por NÍVEL (Eixo 2-elemental / G3+G2): dentro da janela [c+2,c+4], a granada é o
// nível holy DISTINTO mais alto (clsHolyBaseOf = reversão exata), acima da Caldera e do AA da
// sessão (clsLevelsDistinct com a folga de arredondamento). Não claima o segundo inteiro.
// Retorna um Set das linhas-granada (chave ts.seq).
function grenadeLinesByLevel(ctx, ev) {
  const key = l => l.ts + '.' + (l.seq || 0);
  if (!ev.grenadeCast) return new Set();
  // Candidatos = hits da janela menos a runa (componente à parte). NÃO filtra por elemento do
  // parser: na sombra de cooldown a banda marca a granada como 'arrow' (físico), mas ela é holy
  // DETERMINÍSTICA. O discriminador real (Eixo 1) é determinismo PER-MOB: holy reverte idêntico
  // por mob; físico (AA) varia por mob.
  const runeEl = ev.runeUse ? (ev.runeUse.element || 'holy') : null;
  const win = ev.lines.filter(l => l.ts >= ev.grenadeCast.ts + 2 && l.ts <= ev.grenadeCast.ts + 4
    && !l.overkill && !(runeEl && elementOf(l) === runeEl));
  const hits = [];
  for (const l of win) { const hb = ctx.clsHolyBaseOf(l); if (hb > 0) hits.push({ l, hb }); }
  if (hits.length < 3) return new Set();
  const sorted = hits.slice().sort((a, b) => b.hb - a.hb);
  const avg = a => a.reduce((s, h) => s + h.hb, 0) / a.length;
  const aaRef = ev.aaRef || 0;
  // determinístico = todo mob com ≥2 hits no grupo tem hb (quase) idêntico (folga de arredondamento).
  const deterministic = grp => {
    const byMob = new Map();
    for (const h of grp) { if (!byMob.has(h.l.mob)) byMob.set(h.l.mob, []); byMob.get(h.l.mob).push(h.hb); }
    for (const vals of byMob.values()) if (vals.length >= 2 && Math.max(...vals) - Math.min(...vals) > 3) return false;
    return new Set(grp.map(h => h.l.mob)).size >= 2;
  };
  // Granada = NÍVEL mais alto, separado pelo MAIOR salto (gap); grupo de cima DETERMINÍSTICO e
  // distinto acima do resto E acima do AA da sessão (G2/G3). Crit alarga o spread cross-mob, mas
  // o per-mob continua determinístico — por isso a checagem é por mob, não pelo spread do grupo.
  let best = null;
  for (let k = 3; k < sorted.length; k++) {
    const top = sorted.slice(0, k), bot = sorted.slice(k);
    if (!deterministic(top)) continue;
    const topLevel = avg(top), botLevel = avg(bot);
    if (!ctx.clsLevelsDistinct(topLevel, botLevel, 1.10)) continue;
    if (aaRef > 0 && !ctx.clsLevelsDistinct(topLevel, aaRef, 1.12)) continue;
    const gap = sorted[k - 1].hb - sorted[k].hb;
    if (!best || gap > best.gap) best = { set: new Set(top.map(h => key(h.l))), gap };
  }
  return best ? best.set : new Set();
}

const SINGLE_TGT = new Set(['exori gran con', 'exori san', 'exori con', 'exori infir con']);

// Banda holy do spell AoE (Caldera/exevo mas san): o cluster holy DETERMINÍSTICO mais populoso
// (clsHolyBaseOf consistente cross-mob), distinto acima do AA da sessão. Substitui o per-hit
// inferredElement pela banda real → cobre o fallback all-arrow→spell e o prefixo-AA (G4) de uma vez.
function aoeHolyBand(ctx, ev, grenKeys) {
  const key = l => l.ts + '.' + (l.seq || 0);
  const cand = ev.lines.filter(l => !grenKeys.has(key(l)) && !l.overkill);
  const hits = [];
  for (const l of cand) { const hb = ctx.clsHolyBaseOf(l); if (hb > 0) hits.push({ l, hb }); }
  if (hits.length < 3) return new Set();
  let best = null;
  for (const c of hits) {
    const tol = Math.max(8, c.hb * 0.01);
    const members = hits.filter(h => Math.abs(h.hb - c.hb) <= tol);
    if (members.length < 3 || new Set(members.map(h => h.l.mob)).size < 2) continue;
    const level = members.reduce((s, h) => s + h.hb, 0) / members.length;
    if (ev.aaRef > 0 && !ctx.clsLevelsDistinct(level, ev.aaRef, 1.12)) continue; // banda acima do AA
    if (!best || members.length > best.n) best = { set: new Set(members.map(h => key(h.l))), n: members.length };
  }
  return best ? best.set : new Set();
}

// Fase 2 (protótipo): rótulo por linha, ramificado por regime.
function classifyTurn(ctx, ev) {
  const out = new Map(); // ts.seq -> comp
  const key = l => l.ts + '.' + (l.seq || 0);
  const ordered = ev.lines.slice().sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
  const mobCount = new Set(ev.lines.map(l => l.mob).filter(Boolean)).size;

  // (A0) EK/melee pack: AA melee single-target logado 1º; resto do turno = spell AoE (exori).
  // Sem assinatura elemental (golpe físico); posição manda: hit[0]=arrow, resto=spell.
  if (ev.isMelee) {
    ordered.forEach((l, i) => out.set(key(l), (i > 0 && ev.spellCast) ? 'spell' : 'arrow'));
    return out;
  }

  // (A) POSICIONAL — single-target boss / single-mob: ordem AA → spell → granada (G5).
  // Só 1 criatura ⇒ cada hit é um componente distinto. Granada = hit da janela [c+2,c+4]
  // (3º cronológico, ou o último quando faltam AA/spell). 1º = AA; do meio = spell.
  if (ev.distinctMobs === 1 || mobCount === 1) {
    const grenSet = new Set();
    if (ev.grenadeCast) {
      const win = ordered.filter(l => l.ts >= ev.grenadeCast.ts + 2 && l.ts <= ev.grenadeCast.ts + 4);
      if (win.length) grenSet.add(key(win[Math.min(2, win.length - 1)]));
    }
    const nonGren = ordered.filter(l => !grenSet.has(key(l)));
    nonGren.forEach((l, i) => out.set(key(l), (i > 0 && ev.spellCast) ? 'spell' : 'arrow'));
    for (const k of grenSet) out.set(k, 'grenade');
    return out;
  }

  const grenKeys = grenadeLinesByLevel(ctx, ev);

  // (B) PACK single-target spell (exori gran con/san/con/infir con): ordem AA → spell.
  // O hit da spell é o ÚLTIMO (após o AoE arrow); granada por nível à parte.
  if (ev.spellCast && SINGLE_TGT.has(ev.spellCast.text)) {
    const nonGren = ordered.filter(l => !grenKeys.has(key(l)));
    nonGren.forEach((l, i) => out.set(key(l), i === nonGren.length - 1 ? 'spell' : 'arrow'));
    for (const l of ev.lines) if (grenKeys.has(key(l))) out.set(key(l), 'grenade');
    return out;
  }

  // (C) PACK AoE: Eixo 1 = elemento do parser (banda validada 38/38). físico → arrow;
  // holy → granada (nível) / spell / runa por âncora. + fallback all-arrow→spell (G-rule):
  // se a banda marcou TODOS arrow (físico) mas há cast AoE alinhado, promove a banda holy
  // determinística (suffix) a spell — sem mexer no prefixo físico.
  const allPhysical = ev.lines.every(l => elementOf(l) === 'physical');
  const fallbackSpell = (allPhysical && ev.spellCast && !ev.runeUse && !ev.grenadeCast)
    ? aoeHolyBand(ctx, ev, grenKeys) : new Set();
  for (const l of ev.lines) {
    const k = key(l);
    const el = elementOf(l);
    let comp = 'arrow';
    // granada PRIMEIRO: a sombra de cooldown deixa a granada marcada físico pela banda, mas o
    // detector per-mob já a identificou em grenKeys — independe do elemento do parser.
    if (grenKeys.has(k)) comp = 'grenade';
    else if (el !== 'physical') {
      if (ev.runeUse && el === (ev.runeUse.element || 'holy')) comp = 'rune';
      else if (ev.spellCast) comp = 'spell';
      else comp = 'arrow';
    } else if (fallbackSpell.has(k)) comp = 'spell';
    out.set(k, comp);
  }
  // G4 prefixo-AA por leech: se TODO o turno virou spell, o 1º hit (cronológico) com razão de
  // leech ≥1.5× a média dos demais é o AA de varinha (não bate no nível holy da spell) → arrow.
  if (ordered.length >= 3 && ordered.every(l => out.get(key(l)) === 'spell')) {
    const ratio = l => { const lc = (+l.lifeLeech || 0) + (+l.manaLeech || 0), d = +l.dmg || 0; return lc > 0 && d > 0 ? lc / d : null; };
    const first = ordered[0];
    const fr = !first.overkill ? ratio(first) : null;
    const others = ordered.slice(1).filter(l => !l.overkill).map(ratio).filter(Number.isFinite);
    if (Number.isFinite(fr) && others.length >= 2) {
      const avgOther = others.reduce((s, x) => s + x, 0) / others.length;
      if (avgOther > 0 && fr >= avgOther * 1.5) out.set(key(first), 'arrow');
    }
  }
  return out;
}

// ============ HARNESS ============
const argv = process.argv.slice(2);
const PAIRS = argv.length >= 2 ? [[argv[0], argv[1]]] : [
  ['logs/server log rp.txt', 'logs/localchat rp.txt'],
  ['logs/darklight server log rp.txt', 'logs/darklight local chat rp.txt'],
  ['logs/murcion server log rp.txt', 'logs/murcion local chat rp.txt'],
  ['logs/highwin Server Log.txt', 'logs/highwin Local Chat.txt'],
];

const showPair = argv.includes('--by-pair');
const dumpTsIdx = argv.indexOf('--dump-ts');
const dumpTs = dumpTsIdx >= 0 ? (() => { const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(argv[dumpTsIdx+1]||''); return m ? +m[1]*3600+ +m[2]*60+ +m[3] : null; })() : null;
const divIdx = argv.indexOf('--div');           // ex: --div grenade->spell  (lista ts dos turnos)
const divKind = divIdx >= 0 ? argv[divIdx+1] : null;
const divTurns = new Map();                       // ts -> count
const fmtSec = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
let total = 0, match = 0;
const trans = new Map(); // "legacy->unified" -> count
for (const [svP, lcP] of PAIRS) {
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) { console.log(`MISSING ${svP}`); continue; }
  let pTotal = 0, pMatch = 0;
  for (const pair of sessionPairs(svP, lcP)) {
    const ctx = freshCtx();
    const cap = [];
    let res; try { res = ctx.classifyWithLocalChat(pair.sv, pair.lc, { trace: true, __captureInputs: cap }); }
    catch (e) { console.log(`THROW ${svP}: ${e.message}`); continue; }
    if (!res || res.error || !cap.length) continue;
    // legacy labels por linha
    const legacy = new Map();
    for (const tr of (res.turnTrace || [])) for (const l of tr.lines) legacy.set(l.ts + '.' + (l.seq || 0), l.comp);
    // unified
    const evs = buildEvidence(ctx, cap[0]);
    for (const ev of evs) {
      const labels = classifyTurn(ctx, ev);
      if (dumpTs != null && ev.ts === dumpTs && legacy.size) {
        const someKey = (ev.lines[0] || {}); const k0 = someKey.ts + '.' + (someKey.seq || 0);
        if (legacy.has(k0)) {
          console.log(`\n[dump ${svP.replace(/^logs\//,'')}] turno ts=${dumpTs} spellCast=${ev.spellCast&&ev.spellCast.text} grenCast=${ev.grenadeCast&&ev.grenadeCast.ts} aaRef=${Math.round(ev.aaRef)}`);
          for (const l of ev.lines.slice().sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)))) {
            const k = l.ts + '.' + (l.seq || 0); const hb = ctx.clsHolyBaseOf(l);
            console.log(`   ${String(l.mob).padEnd(18)} dmg=${String(l.dmg).padStart(5)} hb=${hb?Math.round(hb):'-'} inferEl=${(l.inferredElement||'-').padEnd(9)} legacy=${(legacy.get(k)||'-').padEnd(8)} unif=${(labels.get(k)||'-').padEnd(8)}${l.realCrit?' crit':''}${l.overkill?' OK':''}`);
          }
        }
      }
      for (const l of ev.lines) {
        const k = l.ts + '.' + (l.seq || 0);
        if (!legacy.has(k)) continue; // só compara linhas que entraram em turno alinhado
        total++; pTotal++;
        const u = labels.get(k), g = legacy.get(k);
        if (u === g) { match++; pMatch++; }
        else { const t = `${g}->${u}`; trans.set(t, (trans.get(t) || 0) + 1);
          if (divKind && t === divKind) divTurns.set(ev.ts, (divTurns.get(ev.ts) || 0) + 1); }
      }
    }
  }
  if (showPair) console.log(`  ${(100*pMatch/Math.max(1,pTotal)).toFixed(1).padStart(5)}%  ${pMatch}/${pTotal}  ${svP.replace(/^logs\//,'')}`);
}
console.log(`\nconcordância por linha: ${match}/${total} = ${total ? (100*match/total).toFixed(2) : 0}%`);
console.log('divergências (legado->unificado):');
[...trans.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${String(n).padStart(5)}  ${t}`));
if (divKind) {
  console.log(`\nturnos com "${divKind}" (top 12):`);
  [...divTurns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([ts, n]) => console.log(`  ${fmtSec(ts)}  x${n}`));
}
