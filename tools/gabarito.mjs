#!/usr/bin/env node
// gabarito.mjs — asserts executáveis dos turnos-gabarito (pontos fixos do classificador).
// Cada caso aponta um par de logs + um timestamp; o harness varre TODAS as sessões do par,
// acha o(s) turno(s) alinhado(s) naquele ts e confere a expectativa. Discrimina sessões
// ambíguas por uma "fingerprint" de dano (valores de hit esperados no turno).
//
// Uso:
//   node tools/gabarito.mjs            -> roda os asserts (exit 1 se algum falhar)
//   node tools/gabarito.mjs --discover -> imprime os turnos casados hit-a-hit (p/ montar/rever asserts)
//   node tools/gabarito.mjs --only <substr>  -> filtra casos cujo id contém <substr>
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
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best, date: sd });
  }
  return pairs;
}
function sessionsOf(svP, lcP) {
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  if (svS.length === 1 && lcS.length === 1) return [{ sv: svS[0], lc: lcS[0], date: null }];
  return buildPairs(svS, lcS);
}
const toSec = hms => { const m=/^(\d{2}):(\d{2}):(\d{2})$/.exec(hms); return m ? +m[1]*3600+ +m[2]*60+ +m[3] : null; };
const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

// Acha todos os turnos alinhados (de todas as sessões do par) no ts alvo.
function findTurns(svN, lcN, ts) {
  const svP = 'logs/' + svN, lcP = 'logs/' + lcN;
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) return { missing: true, turns: [] };
  const sessions = sessionsOf(svP, lcP);
  const found = [];
  sessions.forEach((pair, si) => {
    const ctx = freshCtx();
    let res; try { res = ctx.classifyWithLocalChat(pair.sv.text, pair.lc.text, { trace: true }); } catch (e) { return; }
    if (!res || res.error) return;
    for (const tr of (res.turnTrace || [])) {
      if (tr.ts === ts) found.push({ si, date: pair.date, tr, res });
    }
  });
  return { missing: false, turns: found };
}

// ---- Casos-gabarito. Cada caso: { id, sv, lc, ts, check?, fp? } ----
// check(turn) -> string|null  (string = motivo da falha; null = ok). turn = objeto turnTrace.
// fp(turn) -> bool  (fingerprint p/ desambiguar sessão; opcional)
const C = (id, sv, lc, ts, check, fp) => ({ id, sv, lc, ts: toSec(ts), tsRaw: ts, check, fp });
const sumComp = (tr, comp) => tr.lines.filter(l => l.comp === comp).length;
const hasHit = (tr, comp, dmg) => tr.lines.some(l => l.comp === comp && l.dmg === dmg);
const nearBase = (tr, comp, target, tol) => tr.lines.some(l => l.comp === comp && Math.abs(Math.round(l.base) - target) <= (tol||25));

const CASES = [
  // bastion EK: 517 fica arrow (não usar overkill p/ no-AA)
  C('bastion/15:20:27', 'bastion server log ek.txt', 'bastion local chat ek.txt', '15:20:27',
    tr => hasHit(tr, 'arrow', 517) ? null : '517 não é arrow', tr => tr.lines.some(l => l.dmg === 517)),

  // darklight rp: 405/501 arrow, 1067 = Strong Ethereal Spear (exori gran con)
  C('darklight-rp/09:14:16', 'darklight server log rp.txt', 'darklight local chat rp.txt', '09:14:16',
    tr => (hasHit(tr,'arrow',405) && hasHit(tr,'arrow',501) && hasHit(tr,'spell',1067) && tr.spell === 'exori gran con')
      ? null : `405/501 arrow + 1067 spell(exori gran con); got spell=${tr.spell}`,
    tr => tr.lines.some(l => l.dmg === 1067)),

  // darklight e vemiath: prefixo AA arrow + sufixo Divine Caldera (não tudo spell)
  C('vemiath/23:22:28', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:22:28',
    tr => (sumComp(tr,'arrow') >= 1 && sumComp(tr,'spell') >= 1 && tr.spell === 'exevo mas san')
      ? null : `precisa arrow prefix + Caldera; got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} sp=${tr.spell}`),

  // darklight e vemiath: 819 arrow + resto Divine Caldera
  C('vemiath/23:24:39', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:24:39',
    tr => (hasHit(tr,'arrow',819) && sumComp(tr,'spell') >= 1 && tr.spell === 'exevo mas san')
      ? null : `819 arrow + Caldera; got 819comp=${(tr.lines.find(l=>l.dmg===819)||{}).comp} sp=${tr.spell}`,
    tr => tr.lines.some(l => l.dmg === 819)),

  // darklight e vemiath: 8 AA + 8 Caldera + 10 grenade (mesmo segundo)
  C('vemiath/23:23:20', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:23:20',
    tr => (sumComp(tr,'arrow')===8 && sumComp(tr,'spell')===8 && sumComp(tr,'grenade')===10)
      ? null : `esperado a8 s8 g10; got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`),

  // darklight e vemiath: AA 17 no :34
  C('vemiath/23:28:34', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:28:34',
    tr => sumComp(tr,'arrow') === 17 ? null : `esperado AA 17; got a=${sumComp(tr,'arrow')}`),
  // ... e granada no :36
  C('vemiath/23:28:36', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:28:36',
    tr => sumComp(tr,'grenade') >= 1 ? null : `esperado granada; got g=${sumComp(tr,'grenade')}`),

  // partial edge 22:41:16 (AA-only visível, não conta) + 22:45:34 (arrow + Using-rune conta uptime)
  C('vemiath/22:41:16', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '22:41:16',
    tr => (sumComp(tr,'arrow') >= 1 && tr.partialEdge !== true) ? null : `22:41:16 deve ser AA visível e NÃO partial-edge; partialEdge=${tr.partialEdge}`),
  C('vemiath/22:45:34', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '22:45:34',
    tr => sumComp(tr,'arrow') >= 1 ? null : `22:45:34 deve manter arrow; got a=${sumComp(tr,'arrow')}`),

  // bakra single-mob grenade (sessões 6/7)
  C('bakra/09:20:21', 'Server Log bakra.txt', 'Local Chat bakra.txt', '09:20:21',
    tr => (sumComp(tr,'arrow')===1 && sumComp(tr,'spell')===1 && sumComp(tr,'grenade')===1 && nearBase(tr,'grenade',810))
      ? null : `AA1 spell1 gren1(810); got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`),
  C('bakra/09:21:06', 'Server Log bakra.txt', 'Local Chat bakra.txt', '09:21:06',
    tr => (sumComp(tr,'arrow')===1 && sumComp(tr,'spell')===1 && sumComp(tr,'grenade')===1 && nearBase(tr,'grenade',940))
      ? null : `AA1 spell1 gren1(940); got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`,
    tr => sumComp(tr,'grenade') >= 1),
  C('bakra/09:23:47', 'Server Log bakra.txt', 'Local Chat bakra.txt', '09:23:47',
    tr => (sumComp(tr,'arrow')===1 && sumComp(tr,'spell')===1 && sumComp(tr,'grenade')===1 && nearBase(tr,'grenade',917))
      ? null : `AA1 spell1 gren1(917@c+4); got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`,
    tr => sumComp(tr,'grenade') >= 1),
  C('bakra/09:33:47', 'Server Log bakra.txt', 'Local Chat bakra.txt', '09:33:47',
    tr => (sumComp(tr,'arrow')===1 && sumComp(tr,'spell')===1 && sumComp(tr,'grenade')===1 && nearBase(tr,'grenade',885))
      ? null : `AA1 spell1 gren1(885); got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`),
  C('bakradrone/09:52:47', 'bakradrone server log.txt', 'bakradrone local chat.txt', '09:52:47',
    tr => (sumComp(tr,'arrow')===1 && sumComp(tr,'spell')===1 && sumComp(tr,'grenade')===1 && hasHit(tr,'arrow',1447) && hasHit(tr,'spell',1489) && hasHit(tr,'grenade',872))
      ? null : `AA 1447 + exori gran con 1489 + granada 872; got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`),

  // highwin 2: split AA-cooldown grenade
  C('highwin2/08:25:18', 'highwin 2 Server Log.txt', 'highwin 2 Local Chat.txt', '08:25:18',
    tr => (sumComp(tr,'grenade')===13 && sumComp(tr,'arrow')===13 && sumComp(tr,'rune')===15)
      ? null : `g13 a13 r15; got a=${sumComp(tr,'arrow')} g=${sumComp(tr,'grenade')} r=${sumComp(tr,'rune')}`),
  C('highwin2/08:27:57', 'highwin 2 Server Log.txt', 'highwin 2 Local Chat.txt', '08:27:57',
    tr => (sumComp(tr,'arrow')===9 && sumComp(tr,'spell')===11 && sumComp(tr,'grenade')===8)
      ? null : `AA9 Caldera11 granada8; got a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`),
  C('highwin2/08:27:59', 'highwin 2 Server Log.txt', 'highwin 2 Local Chat.txt', '08:27:59',
    tr => (sumComp(tr,'arrow')===9 && sumComp(tr,'grenade')===0)
      ? null : `AA9 sem granada; got a=${sumComp(tr,'arrow')} g=${sumComp(tr,'grenade')}`),

  // highwin: 10 grenade + 8 AA
  C('highwin/08:47:16', 'highwin Server Log.txt', 'highwin Local Chat.txt', '08:47:16',
    tr => (sumComp(tr,'grenade')===10 && sumComp(tr,'arrow')===8)
      ? null : `g10 a8; got a=${sumComp(tr,'arrow')} g=${sumComp(tr,'grenade')}`),

  // mk: g+4 AA-level fica arrow (turno só-rune)
  C('mk/05:46:16', 'mk server log.txt', 'mk localchat.txt', '05:46:16',
    tr => sumComp(tr,'grenade')===0 ? null : `não pode ter granada (fake g+4); got g=${sumComp(tr,'grenade')}`),

  // jaded: Caldera 749 + grenade 840 (:47); spread AA fica arrow (:49)
  C('jaded/19:59:47', 'jaded Server Log.txt', 'jaded Local Chat.txt', '19:59:47',
    tr => (sumComp(tr,'spell') >= 1 && sumComp(tr,'grenade') >= 1) ? null : `Caldera+granada; got s=${sumComp(tr,'spell')} g=${sumComp(tr,'grenade')}`),
  C('jaded/19:59:49', 'jaded Server Log.txt', 'jaded Local Chat.txt', '19:59:49',
    tr => sumComp(tr,'grenade')===0 ? null : `spread AA não vira granada; got g=${sumComp(tr,'grenade')}`),

  // vemiath 22:20:30: g+4 AA-level fica arrow (procura no darklight e vemiath)
  C('vemiath/22:20:30', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '22:20:30',
    tr => sumComp(tr,'grenade')===0 ? null : `fake g+4 não pode ser granada; got g=${sumComp(tr,'grenade')}`),

  // Hakka 21:56:25: partial edge, não conta AA
  C('Hakka/21:56:25', 'Hakka Server Log.txt', 'Hakka Local Chat.txt', '21:56:25',
    tr => tr.partialEdge === true ? null : `deve ser partialEdge; partialEdge=${tr.partialEdge}`),
];

// ---- runner ----
const argv = process.argv.slice(2);
const discover = argv.includes('--discover');
const onlyIdx = argv.indexOf('--only');
const onlyStr = onlyIdx >= 0 ? (argv[onlyIdx+1]||'') : null;
const cases = CASES.filter(c => !onlyStr || c.id.includes(onlyStr));

function printTurn(prefix, f) {
  const tr = f.tr;
  const dateStr = f.date ? `${f.date.day}/${f.date.month}/${f.date.year}` : 'single';
  console.log(`${prefix} S${f.si}[${dateStr}] idx=${tr.idx} ts=${fmt(tr.ts)} sp=${tr.spell||tr.gren||tr.rune||'-'} partialEdge=${tr.partialEdge} | a=${sumComp(tr,'arrow')} s=${sumComp(tr,'spell')} r=${sumComp(tr,'rune')} g=${sumComp(tr,'grenade')}`);
  const lns = tr.lines.slice().sort((a,b)=>(a.ts-b.ts)||(a.seq-b.seq));
  for (const l of lns) console.log(`      ts=${l.ts}.${l.seq} ${String(l.mob).padEnd(20)} dmg=${String(l.dmg).padStart(5)} base=${String(Math.round(l.base)).padStart(5)} ${(l.comp||'-').padEnd(8)}${l.ok?' OK':''}${l.realCrit?' crit':''}${l.onslaught?' ons':''}`);
}

let pass = 0, fail = 0;
for (const c of cases) {
  const { missing, turns } = findTurns(c.sv, c.lc, c.ts);
  if (missing) { console.log(`SKIP ${c.id} (arquivo ausente)`); continue; }
  if (discover) {
    console.log(`\n### ${c.id} (${c.tsRaw})  matches=${turns.length}`);
    turns.forEach(f => printTurn('  •', f));
    continue;
  }
  // pick the turn matching the fingerprint if provided, else the first
  const cands = c.fp ? turns.filter(f => { try { return c.fp(f.tr); } catch { return false; } }) : turns;
  const pick = (cands.length ? cands : turns)[0];
  if (!pick) { console.log(`FAIL ${c.id}: nenhum turno alinhado em ${c.tsRaw}`); fail++; continue; }
  let reason = null; try { reason = c.check(pick.tr); } catch (e) { reason = 'throw: ' + e.message; }
  if (reason) { console.log(`FAIL ${c.id}: ${reason}`); fail++; }
  else { console.log(`PASS ${c.id}`); pass++; }
}
if (!discover) {
  console.log(`\n${pass}/${pass+fail} gabarito ok` + (fail ? `  (${fail} falha(s))` : ''));
  process.exit(fail ? 1 : 0);
}
