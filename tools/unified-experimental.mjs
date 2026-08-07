#!/usr/bin/env node
// Thin Node harness for the browser-shared experimental classifier.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { CASES as CANONICAL_CASES, runUnifiedGabarito } from './gabarito-unified.mjs';
import { selectMobElementModsRegime } from './mob-element-mod-regime.mjs';
import { SHARED_UNIFIED_GOLDEN_CASES } from './unified-golden-cases.mjs';
import { runUnifiedInvariants } from './unified-invariants.mjs';

const ROOT = process.cwd();
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const toSec = hms => {
  const m = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hms || '');
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : null;
};
const fmtSec = s => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const sumComp = (lines, comp) => lines.filter(line => line.comp === comp).length;
const hasHit = (lines, comp, dmg) => lines.some(line => line.comp === comp && line.dmg === dmg);
const SINGLE_TARGET_RUNES = new Set(['sudden death', 'icicle', 'holy missile']);
const SINGLE_TARGET_RP_SPELLS = new Set(['exori san', 'exori con', 'exori infir con', 'exori gran con']);
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const isSingleTargetRune = name => SINGLE_TARGET_RUNES.has(norm(name));
const isRpSingleTargetSpell = text => SINGLE_TARGET_RP_SPELLS.has(norm(text));
const DISABLE_GOLDEN_SESSION_FILTER = process.argv.includes('--no-session-filter');
const SHOW_MODEL_STATS = process.argv.includes('--model-stats');
const modelStats = { queries:0, pairingRequests:0, pairingHits:0, classifications:0, classificationHits:0, skippedSessions:0 };
const SESSION_PAIRS_CACHE = new Map();
const SESSION_MODEL_CACHE = new Map();
const SESSION_CLOCK_CACHE = new WeakMap();

function splitSessions(text) {
  const sessions = [];
  let current = null;
  for (const line of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^Channel .+ saved /.test(line)) {
      if (current) sessions.push(current);
      current = { header: line, lines: [line] };
    } else if (current) current.lines.push(line);
  }
  if (current) sessions.push(current);
  if (!sessions.length) sessions.push({ header: '', lines: String(text || '').split(/\r?\n/) });
  return sessions.map(session => ({ ...session, text: session.lines.join('\n') }));
}

function parseSessionDate(session) {
  const months = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(session.header || '');
  if (!m) return null;
  return { year:+m[6], month:months[m[1]] || 0, day:+m[2], saveSec:+m[3] * 3600 + +m[4] * 60 + +m[5] };
}

function sessionPairs(serverPath, localPath) {
  modelStats.pairingRequests++;
  const cacheKey = `${path.resolve(serverPath)}\n${path.resolve(localPath)}`;
  if (SESSION_PAIRS_CACHE.has(cacheKey)) {
    modelStats.pairingHits++;
    return SESSION_PAIRS_CACHE.get(cacheKey);
  }
  const servers = splitSessions(fs.readFileSync(serverPath, 'utf8'));
  const locals = splitSessions(fs.readFileSync(localPath, 'utf8'));
  if (servers.length === 1 && locals.length === 1) {
    const sessionDate = parseSessionDate(servers[0]);
    const pairs = [{ sv: servers[0], lc: locals[0], sessionDate, label: sessionDate ? `${sessionDate.day}/${sessionDate.month}/${sessionDate.year}` : 'undated' }];
    SESSION_PAIRS_CACHE.set(cacheKey, pairs);
    return pairs;
  }
  const pairs = [];
  for (const sv of servers) {
    const sd = parseSessionDate(sv);
    if (!sd) continue;
    let best = null;
    let bestDiff = Infinity;
    for (const lc of locals) {
      const ld = parseSessionDate(lc);
      if (!ld || ld.year !== sd.year || ld.month !== sd.month || ld.day !== sd.day) continue;
      const diff = Math.abs(ld.saveSec - sd.saveSec);
      if (diff < bestDiff) { best = lc; bestDiff = diff; }
    }
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best, sessionDate: sd, label: `${sd.day}/${sd.month}/${sd.year}` });
  }
  SESSION_PAIRS_CACHE.set(cacheKey, pairs);
  return pairs;
}

function freshCtx(regime) {
  const element = () => ({ style:{}, appendChild(){}, insertAdjacentElement(){}, addEventListener(){}, insertBefore(){} });
  const document = { createElement:element, head:{ appendChild(){} }, body:{ appendChild(){} }, querySelector(){ return null; }, querySelectorAll(){ return []; }, getElementById(){ return null; } };
  const ctx = { console:silent, document, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  vm.createContext(ctx);
  for (const file of [
    'js/stats.js',
    'js/mob-element-mods.js',
    'js/mob-element-mods-post-2026-06-16.js',
    'js/unified-formulas.js',
    'js/unified-parsing.js',
    'js/unified-setup-inference.js',
    'js/unified-validation.js',
    'js/unified-turn-resolution.js',
    'js/unified-classification-engine.js',
    'js/unified-main.js',
  ]) vm.runInContext(read(file), ctx, { filename:file });
  return ctx;
}

function resolvedFromTurn(turn) {
  const lines = turn.lines || [];
  const boundaries = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].comp !== lines[i - 1].comp) boundaries.push({ at:lines[i].seq, reason:lines[i].experimentalReason || 'shared_engine_boundary' });
  }
  return {
    lines,
    partition:[...new Set(lines.map(line => line.comp || 'arrow'))],
    boundaries,
    ambiguous:lines.filter(line => String(line.comp || '').startsWith('unresolved_component_')).map(line => line.experimentalReason || 'unresolved component'),
    candidates:[],
  };
}

// TEMP (excluído a pedido do usuário até investigação separada): a sessão de
// jaded salva em 09/Jun/2026 09:30:47 (conteúdo ~09:18-09:30) tem um problema
// conhecido a resolver por último — mesmo log de "bakra"/"drome" em arquivo
// diferente. Escopado ao ARQUIVO + data + saveSec exatos — outras fixtures
// (essence, highwin) também têm sessão datada de 09/Jun/2026, então um filtro
// só por data excluiria fixtures não relacionadas por engano (já aconteceu:
// "no aligned model turn" em essence/highwin inteiros). Remover quando
// resolvido.
const JADED_EXCLUDED_SESSION_SAVESEC = 9 * 3600 + 30 * 60 + 47; // 09:30:47
const isTempExcludedSession = (serverPath, sd) =>
  !!sd && sd.year === 2026 && sd.month === 6 && sd.day === 9 && sd.saveSec === JADED_EXCLUDED_SESSION_SAVESEC &&
  /jaded Server Log\.txt$/.test(serverPath);

function clocksInSession(session) {
  if (!SESSION_CLOCK_CACHE.has(session)) {
    SESSION_CLOCK_CACHE.set(session, new Set(String(session.text || '').match(/\b\d{2}:\d{2}:\d{2}\b/g) || []));
  }
  return SESSION_CLOCK_CACHE.get(session);
}

function modelForSession(serverPath, localPath, pair, pairIndex) {
  const cacheKey = `${path.resolve(serverPath)}\n${path.resolve(localPath)}\n${pairIndex}`;
  if (SESSION_MODEL_CACHE.has(cacheKey)) {
    modelStats.classificationHits++;
    return SESSION_MODEL_CACHE.get(cacheKey);
  }
  const out = [];
  if (isTempExcludedSession(serverPath, pair.sessionDate)) {
    SESSION_MODEL_CACHE.set(cacheKey, out);
    return out;
  }
  const mobElementRegime = selectMobElementModsRegime(pair.sessionDate);
  const ctx = freshCtx(mobElementRegime);
  const res = ctx.classifyWithLocalChat(pair.sv.text, pair.lc.text, { trace:true });
  modelStats.classifications++;
  if (res && !res.error) {
    for (const turn of res.turnTrace || []) {
      const evidence = turn.experimentalEvidence || {};
      const ev = { ...evidence, ts:turn.ts, lines:turn.lines || [] };
      out.push({ pairLabel:pair.label, mobElementRegime, ev, resolved:resolvedFromTurn(turn), res });
    }
  }
  SESSION_MODEL_CACHE.set(cacheKey, out);
  return out;
}

function modelForPair(serverPath, localPath, { timestamps = null } = {}) {
  modelStats.queries++;
  const wanted = timestamps ? [...new Set(timestamps)].sort((a, b) => a - b) : null;
  const wantedClocks = wanted && new Set(wanted.map(fmtSec));
  const out = [];
  for (const [pairIndex, pair] of sessionPairs(serverPath, localPath).entries()) {
    if (wantedClocks) {
      const sessionClocks = clocksInSession(pair.sv);
      let containsWantedClock = false;
      for (const clock of wantedClocks) {
        if (sessionClocks.has(clock)) { containsWantedClock = true; break; }
      }
      if (!containsWantedClock) {
        modelStats.skippedSessions++;
        continue;
      }
    }
    out.push(...modelForSession(serverPath, localPath, pair, pairIndex));
  }
  return out;
}

function lineSummary(row) {
  return Object.fromEntries(['arrow', 'spell', 'rune', 'grenade'].map(comp => [comp, sumComp(row.resolved.lines, comp)]));
}

function findModelTurnInRows(rows, ts, fingerprint) {
  const matching = rows.filter(row => row.ev.ts === ts);
  return (fingerprint && matching.find(row => fingerprint(row.resolved.lines))) || matching[0] || null;
}

const countIs = expected => row => {
  const got = lineSummary(row);
  for (const [comp, count] of Object.entries(expected)) if (got[comp] !== count) return `expected ${JSON.stringify(expected)} got ${JSON.stringify(got)}`;
  return null;
};
const countAtLeast = expected => row => {
  const got = lineSummary(row);
  for (const [comp, count] of Object.entries(expected)) if (got[comp] < count) return `expected at least ${JSON.stringify(expected)} got ${JSON.stringify(got)}`;
  return null;
};
const concreteLabels = row => {
  const invalid = row.resolved.lines.find(line => ['spell','rune','grenade'].includes(line.comp) && (!line.actionLabel || ['spell','rune','grenade'].includes(String(line.actionLabel).toLowerCase())));
  return invalid ? `generic/missing action label for ${invalid.comp} at seq=${invalid.seq}` : null;
};
const C = (id, sv, lc, ts, expect, fp) => ({ id, sv, lc, ts:toSec(ts), tsRaw:ts, expect, fp });
// Caso de CARDINALIDADE POR LEECH (D-019/V-015a/S-014/S-015): a evidencia e o
// leech absoluto + fator de area + reconstrucao de dano real, que NAO dependem da
// tabela de mitigacao/originais holy de mob. Por isso e regime-independente: deve
// ser AVALIADO mesmo numa sessao sem data (D-017 so escopa checagens dependentes
// de mitigacao). O setup de leech do personagem e inferido de fontes oficiais
// (D-020) por sessao, nao de modificadores de mob.
const CL = (id, sv, lc, ts, expect, fp) => ({ ...C(id, sv, lc, ts, expect, fp), regimeIndependent:true });

export const EXPERIMENTAL_CASES = [
  // M-016d/T-002: Death Echo é uma única ação com blast integral e echo 1/2.
  // O echo de :10 pertence ao cast de :09 e não ancora o ciclo seguinte.
  CL('death-echo/11:06:08','death echo server log.txt','death echo local chat.txt','11:06:08',countIs({arrow:1,spell:21,rune:0,grenade:0})),
  CL('death-echo/11:06:11','death echo server log.txt','death echo local chat.txt','11:06:11',countIs({arrow:1,spell:10,rune:0,grenade:0})),
  CL('death-echo/11:06:20','death echo server log.txt','death echo local chat.txt','11:06:20',countIs({arrow:1,spell:15,rune:0,grenade:0})),
  // M-016d-1/D-006 (fix-death-echo-delayed-stage-absent-evidence): a confirmacao do
  // estagio atrasado rejeita a fracao apenas por CONTRADICAO (hit de eco com contraparte
  // comparavel no blast que nao fecha a 1/2), nunca por EVIDENCIA AUSENTE (mob do eco sem
  // contraparte no blast). O gate antigo exigia 100% dos candidatos casando, entao um unico
  // mob que o blast nao acertou derrubava tudo: blast+eco ficavam fundidos e o turno morria
  // no veto same-mob de S-004a com o mesmo mob em dois niveis (integral e 1/2).
  // 11:06:04: blast :04 + eco :05 (crypt mage 1771->885, roaming dread 1926->965).
  CL('death-echo/11:06:04','death echo server log.txt','death echo local chat.txt','11:06:04',countIs({arrow:1,spell:20,rune:0,grenade:0})),
  // kim (sorcerer `ritual`, 14/Jul/2026): o segundo do eco traz mobs que o blast nao
  // acertou. 16:22:16 e o caso canonico -- undertaker 1070 -> 535 (1/2 exato) casa, mas
  // stalking stalk 449 nao tem contraparte (o unico outro mob do blast entrou como dodge 0).
  CL('kim/16:22:16','kim server log.txt','kim local chat.txt','16:22:16',countIs({arrow:0,spell:5,rune:0,grenade:0})),
  CL('kim/16:23:31','kim server log.txt','kim local chat.txt','16:23:31',countIs({arrow:0,spell:5,rune:0,grenade:0})),
  CL('kim/16:30:54','kim server log.txt','kim local chat.txt','16:30:54',countIs({arrow:0,spell:16,rune:0,grenade:0})),
  // Colaterais aprovados: o eco volta ao cast de origem e o turno vizinho re-ancora,
  // ficando com bloco homogeneo no proprio nivel. Antes, hits em nivel de eco (~440-790)
  // estavam alojados em turnos cujo bloco real e 1500-1900.
  // kim 16:25:20: nighthunter 1011->505, sulphider 966->482 (2 mobs confirmam 1/2);
  // o vizinho 16:25:23 fica AA 1808 + Great Energy Beam 1506x2.
  CL('kim/16:25:20','kim server log.txt','kim local chat.txt','16:25:20',countIs({arrow:0,spell:6,rune:0,grenade:0})),
  // kim 16:30:35: o "AA" anterior (undertaker 530 prey, O_fis [415,447]) esta no nivel de
  // eco da sessao -- identico ao eco confirmado em 16:22:16 (535 prey, O_fis [419,451]).
  CL('kim/16:30:35','kim server log.txt','kim local chat.txt','16:30:35',countIs({arrow:0,spell:5,rune:0,grenade:0})),
  // dlc ms (sorcerer `nightt gaze`, 17/Jul/2026), S0: tres mobs confirmam 1/2 exato.
  // 21:42:51 -> walking pillar 1450->725, darklight matter 1557->778, bloodjaw 1001->500.
  CL('dlc-ms/21:42:51','dlc ms Server Log.txt','dlc ms Local Chat.txt','21:42:51',countIs({arrow:0,spell:8,rune:0,grenade:0})),
  // 21:43:27 -> bloodjaw 1014->507, darklight matter 1578->788, walking pillar 1468->733;
  // o vizinho 21:43:30 fica com o Great Fire Wave homogeneo (1225-1911).
  CL('dlc-ms/21:43:27','dlc ms Server Log.txt','dlc ms Local Chat.txt','21:43:27',countIs({arrow:0,spell:12,rune:0,grenade:0})),
  // M-016e: Spiritual Outburst (exori gran mas nia) e a segunda spell multiestagio
  // conhecida (delay candidato 1 ou 2s, tier candidato 3/8 | 1/2 | 5/8). Sessao sem
  // cabecalho/data (monk 2); a prova nao depende de mitigacao/tabela de mob.
  // 07:19:35: os dois blasts caem no MESMO turno mecanico (delay=1, Stage 3).
  CL('monk2/07:19:35','monk 2 server log.txt','monk 2 local chat.txt','07:19:35',countIs({arrow:1,spell:10,rune:0,grenade:0})),
  // 07:19:56: o blast inicial fica sozinho em :56 (delay=1/:57 nao tem hits); o
  // estagio atrasado so fecha em :58 (delay=2, Stage 3) e e consolidado de volta
  // ao turno de origem -- MESMO SEGUNDO tambem tem um cast real e distinto
  // (Greater Flurry of Blows) convivendo na janela do echo.
  CL('monk2/07:19:56','monk 2 server log.txt','monk 2 local chat.txt','07:19:56',countIs({arrow:1,spell:11,rune:0,grenade:0})),
  // 07:19:58: o turno independente seguinte preserva seu proprio AA (781, nao
  // 906) e o Greater Flurry of Blows real (6 hits) sem o estagio atrasado
  // orfao do cast de :56.
  CL('monk2/07:19:58','monk 2 server log.txt','monk 2 local chat.txt','07:19:58',row => countIs({arrow:1,spell:6,rune:0,grenade:0})(row) || (hasHit(row.resolved.lines,'arrow',781) ? null : '781 is not the AA of this turn')),
  // §10 caso 9 (D-019): hit 517 e AA posicional/N=1; hit 15 e overkill e nao
  // participa do cluster (D-011/D-012). Cardinalidade por leech separa A1 S8.
  CL('bastion/15:20:27','bastion server log ek.txt','bastion local chat ek.txt','15:20:27',row => countIs({arrow:1,spell:8,rune:0,grenade:0})(row) || (hasHit(row.resolved.lines,'arrow',517) ? null : '517 is not the AA outlier')),
  // §10 caso 9c (D-019/V-015a): turno EK sem data dominado por overkill. Os
  // quatro hits de Executioner's Throw (exori amp kor) formam cluster de dano
  // real reconstruido (N=4); o hit 264 (chastener) aceita N=1 e e o AA outlier.
  // Razao de leech bloqueada por overkill (D-026) e original holy indisponivel
  // (sessao sem data) -> cardinalidade por leech e o unico separador mecanico.
  CL('bastion/15:21:37','bastion server log ek.txt','bastion local chat ek.txt','15:21:37',row => countIs({arrow:1,spell:4,rune:0,grenade:0})(row) || (hasHit(row.resolved.lines,'arrow',264) ? null : '264 is not the AA outlier')),
  // §10 caso 9b (D-019): cluster de dano real reconstruido (N=4); hit 242 aceita
  // N=1 e e o AA outlier.
  CL('bastion/15:24:22','bastion server log ek.txt','bastion local chat ek.txt','15:24:22',row => countIs({arrow:1,spell:4,rune:0,grenade:0})(row) || (hasHit(row.resolved.lines,'arrow',242) ? null : '242 is not the AA outlier')),
  C('darklight-rp/09:14:16','darklight server log rp.txt','darklight local chat rp.txt','09:14:16',row => hasHit(row.resolved.lines,'arrow',405) && hasHit(row.resolved.lines,'arrow',501) && hasHit(row.resolved.lines,'spell',1067) ? null : '405/501 arrow + 1067 spell failed'),
  C('vemiath/23:22:28','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','23:22:28',countAtLeast({arrow:1,spell:1})),
  C('vemiath/23:24:39','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','23:24:39',row => hasHit(row.resolved.lines,'arrow',819) && sumComp(row.resolved.lines,'spell') >= 1 ? null : '819 arrow + spell suffix failed'),
  C('vemiath/23:23:20','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','23:23:20',countIs({arrow:8,spell:8,grenade:10})),
  C('vemiath/23:28:34','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','23:28:34',countIs({arrow:17})),
  C('vemiath/23:28:36','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','23:28:36',countAtLeast({grenade:1})),
  C('vemiath/22:41:16','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','22:41:16',countAtLeast({arrow:1})),
  C('vemiath/22:45:34','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','22:45:34',countIs({arrow:6,spell:0,rune:0,grenade:0})),
  C('bakra/09:20:21','Server Log bakra.txt','Local Chat bakra.txt','09:20:21',countIs({arrow:1,spell:1,grenade:1})),
  C('bakra/09:21:06','Server Log bakra.txt','Local Chat bakra.txt','09:21:06',countIs({arrow:1,spell:1,grenade:1}),lines => sumComp(lines,'grenade') >= 1),
  C('bakra/09:23:47','Server Log bakra.txt','Local Chat bakra.txt','09:23:47',countIs({arrow:1,spell:1,grenade:1}),lines => sumComp(lines,'grenade') >= 1),
  C('bakra/09:33:47','Server Log bakra.txt','Local Chat bakra.txt','09:33:47',countIs({arrow:1,spell:1,grenade:1})),
  // §10 caso novo "Bakragore 09:30:13": no maximo um AA por ciclo (M-002/M-032) e
  // um hit para Strong Ethereal Spear (exori gran con, single-target M-006/V-006).
  C('bakra/09:30:13','Server Log bakra.txt','Local Chat bakra.txt','09:30:13',countIs({arrow:1,spell:1,grenade:1})),
  // §10 caso novo "Chagorz": Sudden Death recebe exatamente um hit (M-033) e o
  // segundo hit (AA) forma outro componente, em vez de virar uma segunda runa.
  C('bakradrone/09:15:01','bakradrone server log.txt','bakradrone local chat.txt','09:15:01',countIs({arrow:1,rune:1}),lines => sumComp(lines,'rune') === 1),
  C('bakradrone/09:52:47','bakradrone server log.txt','bakradrone local chat.txt','09:52:47',countIs({arrow:1,spell:1,grenade:1})),
  C('bakradrone/09:51:58','bakradrone server log.txt','bakradrone local chat.txt','09:51:58',countIs({arrow:1,spell:1,grenade:0})),
  C('bakradrone/09:31:02','bakradrone server log.txt','bakradrone local chat.txt','09:31:02',countIs({arrow:1,rune:1})),
  C('bakradrone/09:22:43','bakradrone server log.txt','bakradrone local chat.txt','09:22:43',countIs({spell:1})),
  C('bakradrone/09:59:53','bakradrone server log.txt','bakradrone local chat.txt','09:59:53',countIs({spell:1,grenade:1})),
  C('bakradrone/10:01:08','bakradrone server log.txt','bakradrone local chat.txt','10:01:08',concreteLabels),
  C('essence/00:21:12','essence server log.txt','essence local chat.txt','00:21:12',countIs({arrow:1,spell:0,rune:0,grenade:0})),
  C('essence/00:21:14','essence server log.txt','essence local chat.txt','00:21:14',countIs({arrow:1,spell:0,rune:0,grenade:0})),
  C('essence/00:22:43','essence server log.txt','essence local chat.txt','00:22:43',countIs({arrow:1,spell:1,grenade:1})),
  C('essence/00:22:45','essence server log.txt','essence local chat.txt','00:22:45',countIs({arrow:1,spell:1,grenade:0})),
  C('essence/00:23:29','essence server log.txt','essence local chat.txt','00:23:29',countIs({arrow:1,spell:1,grenade:0})),
  C('essence/00:25:22','essence server log.txt','essence local chat.txt','00:25:22',countIs({arrow:1,spell:1,grenade:1})),
  C('essence/00:26:23','essence server log.txt','essence local chat.txt','00:26:23',countIs({arrow:1,spell:1,grenade:0})),
  C('essence/00:26:04','essence server log.txt','essence local chat.txt','00:26:04',countIs({arrow:1,spell:1,grenade:0})),
  C('mazzerinbarrage/01:20:45','mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt','01:20:45',countIs({arrow:13,spell:14,rune:0,grenade:12})),
  C('mazzerinbarrage/01:22:51','mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt','01:22:51',countIs({arrow:10,spell:12,rune:0,grenade:10})),
  C('highwin2/08:25:18','highwin 2 Server Log.txt','highwin 2 Local Chat.txt','08:25:18',countIs({arrow:13,rune:15,grenade:13})),
  C('highwin2/08:27:57','highwin 2 Server Log.txt','highwin 2 Local Chat.txt','08:27:57',countIs({arrow:9,spell:11,grenade:8})),
  C('highwin2/08:27:59','highwin 2 Server Log.txt','highwin 2 Local Chat.txt','08:27:59',countIs({arrow:9,grenade:0})),
  // 'highwin Server Log.txt'/'highwin Local Chat.txt' foram excluidos do repo (mantido
  // apenas 'highwin 2'); caso de gabarito removido junto.
  C('mk/05:46:16','mk server log.txt','mk localchat.txt','05:46:16',countIs({grenade:0})),
  C('mk/20:00:44','mk server log.txt','mk localchat.txt','20:00:44',row => hasHit(row.resolved.lines,'arrow',1174) && hasHit(row.resolved.lines,'spell',837) && hasHit(row.resolved.lines,'grenade',1041) && countIs({arrow:9,spell:9,grenade:9})(row) == null ? null : 'AA + Caldera + grenade timing failed'),
  C('mk/19:50:08','mk server log.txt','mk localchat.txt','19:50:08',countIs({arrow:7,spell:0,rune:10,grenade:0})),
  C('mk/19:50:23','mk server log.txt','mk localchat.txt','19:50:23',countIs({arrow:9,spell:10,grenade:9})),
  C('jaded/19:59:47','jaded Server Log.txt','jaded Local Chat.txt','19:59:47',countAtLeast({spell:1,grenade:1})),
  C('jaded/19:59:49','jaded Server Log.txt','jaded Local Chat.txt','19:59:49',countIs({grenade:0})),
  // §10 caso novo "Turno 20:58:38": o hit 521 (fisico variavel) nao pode virar
  // runa apenas pela linha `Using ... avalanche runes` (M-017/M-018a/A-005). Sem
  // bloco deterministico ice compativel, `Using` permanece execucao/uptime e o
  // hit segue AA.
  C('jaded/20:58:38','jaded Server Log.txt','jaded Local Chat.txt','20:58:38',row => hasHit(row.resolved.lines,'arrow',521) && sumComp(row.resolved.lines,'rune') === 0 ? null : '521 must stay arrow, no rune from Using'),
  C('vemiath/22:20:30','darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt','22:20:30',countIs({grenade:0})),
  C('Hakka/21:56:25','Hakka Server Log.txt','Hakka Local Chat.txt','21:56:25',countAtLeast({arrow:1})),
  // Ethereal Barrage (`exori dir moe`) no regime pos-corte (16/Jun/2026): sem mob
  // mods fisicos, o eixo AA × Barrage e separado por timing/cast (V-020) e, em
  // empate, pela cardinalidade por leech (D-028/S-017) — dois eixos que NAO dependem
  // da tabela de mitigacao, logo regime-independentes (CL). 18:59:47 e o caso
  // mandatorio: cast `exori dir moe` em :48, segundo limpo => A8 S9 (server_ts_cast).
  // 19:00:15 (S-018/D-029): turno de Divine Caldera (`exevo mas san`, sem cast
  // `exori dir moe`) que a particao global colapsava em A0 S11. A FRONTEIRA GERAL
  // por leech de vida separa os 5 hits de AA de area (sem life-leech) dos 6 hits de
  // Caldera (life-leech presente, decaindo por cap de HP nos 2 ultimos) => A5 S6.
  // Regime-independente (CL): so usa life-leech absoluto, sem mob mods pos-corte.
  // 19:00:24 (H-001/H-003/D-029): turno de Divine Caldera (`exevo mas san`, sem cast
  // `exori dir moe`) que a particao global colapsava em A0 S11. Ao contrario de
  // 19:00:15 (AA sem life-leech, separado por onset S-018), aqui o AA TEM life-leech
  // — onset nao dispara. A homogeneidade por CARDINALIDADE DE LEECH separa os dois
  // niveis de razao: AA de area N_leech=4 (razao ~0.276) vs Caldera N_leech=7 (razao
  // ~0.18) => A4 S7. Bloco unico S11 viola homogeneidade (duas razoes distintas) e e
  // rejeitado mesmo havendo cast concreto de exevo mas san (H-002).
  ...[
    ['18:59:18',8,7],['18:59:39',7,8],['18:59:41',9,7],['18:59:47',8,9],['18:59:58',4,5],['19:00:15',5,6],
    ['19:00:24',4,7],['19:00:38',7,8],['19:01:00',7,7],['19:01:17',9,8],['19:02:04',4,7],['19:02:45',8,5],
    ['19:03:32',9,7],['19:03:45',10,8],['19:04:08',0,4],['19:04:40',10,9],
  ].map(([ts,arrow,spell]) => CL(`barrage/${ts}`,'barrage Server Log.txt','barrage local chat.txt',ts,countIs({arrow,spell}))),
  // mazzerinbarrage 23:48:57 (V-020/V-022, mudanca unified-scorer-timing-tiebreak-bias):
  // cast `exori dir moe` cai no MESMO segundo que todos os 17 hits do turno, entao
  // `timing` (proximidade cast<->centro-de-bloco) fica identico para qualquer corte
  // candidato e degenera em "tamanho do bloco de spell" — sem essa correcao o scorer
  // maximizava o bloco de Barrage (A6 S11) so por timing, antes de leech ser
  // consultado. Com `timing` neutralizado nesse caso, os intervalos fisicos (D-004/
  // D-010b) mostram dois niveis limpos (~785-820 vs ~1000-1090) e a cardinalidade de
  // leech (`cappedLowHits`) fecha em N=8 para o bloco AA, N=9 para Barrage => A8 S9.
  // walking pillar 1148 (seq 4606) e darklight matter 900 (seq 4609) pertencem ao
  // AA, nao a Barrage. Regime-independente (CL): a evidencia decisiva e leech.
  CL('mazzerinbarrage/23:48:57','mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt','23:48:57',countIs({arrow:8,spell:9})),
  // mazzerinbarrage 23:46:36 (S-004a + degeneracao de alinhamento, mudanca
  // unified-exactness-timing-gates): cast `exevo mas san` no MESMO segundo dos 24
  // hits. darklight matter+EW 986/986 sao Divine Caldera (O={982} sob P=1) e 987 e
  // AA (O={983}, disjunto — mesmo mob + mesmo estado exige F identico, S-004a);
  // alem disso o corte 12,24 fecha leech 24/24 exato (cappedLowHits=0) contra 13
  // capped-low do corte 11,24, e `timing` degenerado (todos os hits no segundo do
  // cast) nao pode decidir maximizando o bloco de spell => A12 S12, nunca A11 S13.
  // Regime-independente (CL): a evidencia decisiva do desempate e leech.
  // Fingerprint: hits 1245 (walking pillar prey+EW) e 987 (darklight matter EW).
  CL('mazzerinbarrage/23:46:36','mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt','23:46:36',countIs({arrow:12,spell:12}),lines => lines.some(l => l.dmg === 1245) && lines.some(l => l.dmg === 987)),
  // 19:00:30 permanece FORA do escopo regime-independente (C, skip pos-corte): a
  // producao separa A7 S9 por intervalos fisicos O DISJUNTOS no mesmo segundo
  // (cyclursus O∈[872,918] AA vs O∈[818,864] Barrage). Sem mob mods fisicos pos-corte
  // esse eixo nao existe; timing/leech colocam a fronteira um hit adiante (A8 S8). E o
  // limite de resolucao do eixo fisico (zona ambigua ~½ armor-width, ver memoria
  // fisico-axis-resolution-limit), nao um erro de leech-cardinalidade.
  C('barrage/19:00:30','barrage Server Log.txt','barrage local chat.txt','19:00:30',countIs({arrow:7,spell:9})),
  // S-020/D-006 (require-discriminating-leech-channel-in-bracket): o desempate por
  // bracketing same-mob exige unanimidade entre os canais, mas um canal so pode votar se
  // for DISCRIMINANTE -- a margem entre as duas distancias precisa superar
  // leechValueToleranceForN, que e a granularidade do CEIL de D-023.
  // 08:36:51 (Ethereal Barrage, 16 hits, sessao 14/Jul/2026): as particoes [8,16] e [9,16]
  // empatam em todas as chaves de compareValidated. O hit em disputa (darklight emitter,
  // seq 5594, life=100 mana=27) tem ancoras same-mob life=80/mana=26 antes e
  // life=104/mana=29 depois. Vida vota "depois" com margem |20-4|=16; mana votava "antes"
  // com margem |1-2|=1 -- ruido puro (a mana do turno inteiro vive entre 26 e 30). Antes,
  // essa divergencia matava o turno em ambiguous_equal_best_partitions com a fronteira
  // visivel no canal de vida (salto 85->100 exatamente no indice 8, S-018/D-029).
  // Regime-independente (CL): a evidencia e leech absoluto, nao tabela de mob.
  CL('gloompillar/08:36:51','gloompillar Server Log.txt','gloompillar Local Chat.txt','08:36:51',countIs({arrow:8,spell:8,rune:0,grenade:0})),
  // T-005/U-004 + T-003 (prefer-grenade-cast-turn-that-cannot-resolve-without-it):
  // AA + Ethereal Barrage + Divine Grenade e uma combinacao PERMITIDA (T-005), e a unica
  // forma prevista de duas acoes com natureza de spell no mesmo turno (U-004).
  // mazzerinbarrage 09/Jul/2026 01:21:04 tem tres blocos coerentes: 8 hits nao-crit
  // (AA, interseccao fisica [854,856]), 8 crit (Barrage, [981,983]) e 9 em :05 com
  // O_holy homogeneo [1012,1013] em QUATRO mobs distintos (granada do cast 01:21:02,
  // explodindo em cast+3, dentro da janela de M-023). O leech confirma: N=8/8/9 com 18
  // de 18 encaixes exatos no bloco de granada (life 105/104/98, mana 32/34/30/37).
  // Antes, o cast era disputado por 01:21:04 e 01:21:06; o desempate por residuo nao
  // separava e o fail-safe entregava o cast a NINGUEM -- 01:21:04 ficava unresolved com
  // os 25 hits sem componente (T-003) e o cast sumia ate como execucao (M-020/A-004).
  // O criterio novo pergunta qual candidato NAO resolve sem o cast: 01:21:06 resolve bem
  // sem ele (A8 + Caldera 13), 01:21:04 nao resolve de jeito nenhum.
  CL('mazzerinbarrage/01:21:04','mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt','01:21:04',countIs({arrow:8,spell:8,rune:0,grenade:9})),
  // D-011/D-012 (fix-overkill-only-turn-boundary): overkill herda o componente do bloco
  // definido pelos OUTROS hits e nunca cria fronteira. Com TODOS os hits principais em
  // overkill, no mesmo segundo e mesmo crit-state, nao existe "outro hit" -- entao nenhum
  // corte de 2+ componentes e admissivel sem evidencia independente (segundo, crit-state,
  // `Using` de runa ou janela de granada).
  // mazzerinbarrage 17/Jun/2026 16:24:10: 2 hits, ambos OK, mesmo segundo, nao-crit, cast
  // `exori dir moe`. Era A1 S1 -- corte cravado so entre overkills. O leech confirma dano
  // real parecido apesar dos exibidos 284 e 702: life 220/232, mana 71/75. => A0 S2.
  // Regime-independente (CL): o criterio e estrutural, nao depende de tabela de mob.
  CL('mazzerinbarrage/16:24:10','mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt','16:24:10',countIs({arrow:0,spell:2,rune:0,grenade:0})),

  // thunder arrow 21/Jul/2026 -- unico fixture com MUNICAO DE AREA ELEMENTAL (S-007b).
  // O eixo do bloco de AA e inferido por sessao e da `energy` (64 turnos contra 29 do
  // fisico, em 121 elegiveis). Antes de S-007b, 166 dos 210 turnos ficavam sem
  // classificacao porque o AA era validado contra intervalo FISICO.
  // Regime-independentes (CL): a sessao e pos-cutoff.

  // 18:52:46 -- prova de que a municao e elemental E de que a granada explode aqui.
  // Tres blocos contiguos e limpos: granada 11 hits TODOS CRIT com dano identico por mob
  // (oozing 1775 x6, sopping 1698 x2, myco 1707 x2, maggot 1700), AA 8 hits nao-crit
  // (628-679) e Divine Barrage 11 hits (823-862). Antes ficava `unresolved`.
  ...SHARED_UNIFIED_GOLDEN_CASES.map(c => CL(c.id, c.server, c.local, c.ts, countIs(c.expected))),
];

const onlyIndex = process.argv.indexOf('--only');
const onlyFilter = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
if (onlyIndex >= 0 && !onlyFilter) {
  console.error('Uso: node tools/unified-experimental.mjs --gabarito --only <substring>');
  process.exit(2);
}
const selectedByFilter = id => !onlyFilter || id.includes(onlyFilter);
const fixtureKey = (server, local) => `${server}\n${local}`;

function printModelStats() {
  if (!SHOW_MODEL_STATS) return;
  console.log(`MODEL queries=${modelStats.queries} pairingRequests=${modelStats.pairingRequests} pairingHits=${modelStats.pairingHits} classifications=${modelStats.classifications} classificationHits=${modelStats.classificationHits} skippedSessions=${modelStats.skippedSessions}`);
}

function runGabarito() {
  let pass = 0, fail = 0, skipped = 0;
  const canonicalTurns = new Set(CANONICAL_CASES.map(c => `${c.sv}\n${c.lc}\n${c.ts}`.toLowerCase()));
  const selectedCases = EXPERIMENTAL_CASES.filter(c => {
    const key = `${c.sv}\n${c.lc}\n${c.ts}`.toLowerCase();
    return !canonicalTurns.has(key) && selectedByFilter(c.id);
  });
  if (!selectedCases.length) {
    if (onlyFilter && CANONICAL_CASES.some(c => c.id.includes(onlyFilter))) {
      const result = runUnifiedGabarito({ only: onlyFilter });
      process.exit(result.fail ? 1 : 0);
    }
    console.error(`Nenhum caso de gabarito corresponde a: ${onlyFilter}`);
    process.exit(2);
  }
  const casesByFixture = new Map();
  for (const c of selectedCases) {
    const key = fixtureKey(c.sv, c.lc);
    if (!casesByFixture.has(key)) casesByFixture.set(key, []);
    casesByFixture.get(key).push(c);
  }
  const rowsByFixture = new Map();
  for (const [key, fixtureCases] of casesByFixture) {
    const [server, local] = key.split('\n');
    const timestamps = DISABLE_GOLDEN_SESSION_FILTER ? null : fixtureCases.map(c => c.ts);
    rowsByFixture.set(key, modelForPair(`logs/${server}`, `logs/${local}`, { timestamps }));
  }
  for (const c of selectedCases) {
    const row = findModelTurnInRows(rowsByFixture.get(fixtureKey(c.sv, c.lc)), c.ts, c.fp);
    if (!row) { console.log(`FAIL ${c.id}: no aligned model turn at ${c.tsRaw}`); fail++; continue; }
    // Casos de cardinalidade por leech sao regime-independentes (D-019/V-015a):
    // o leech absoluto + fator de area nao usam a tabela de mob, entao o D-017
    // (escopo de mitigacao) nao os exclui. Demais casos so sao avaliados em
    // sessoes pre-corte (mitigacao disponivel).
    if (!c.regimeIndependent && row.mobElementRegime.id !== 'pre-2026-06-16') { console.log(`SKIP ${c.id}: reviewer scope is pre-2026-06-16; regime=${row.mobElementRegime.id} reason=${row.mobElementRegime.reason || '-'}`); skipped++; continue; }
    const reason = c.expect(row) || concreteLabels(row);
    if (reason) { console.log(`FAIL ${c.id}: ${reason}`); fail++; }
    else { const got = lineSummary(row); console.log(`PASS ${c.id}: A${got.arrow} S${got.spell} R${got.rune} G${got.grenade}${row.resolved.ambiguous.length ? ` ambiguous=${row.resolved.ambiguous.length}` : ''}`); pass++; }
  }
  console.log(`\n${pass}/${pass + fail} pre-2026-06-16 experimental gabarito/problem turns ok; ${skipped} outside reviewer scope`);
  printModelStats();
  process.exit(fail ? 1 : 0);
}

// Varredura exaustiva de invariantes mecanicos sobre TODAS as fixtures
// pre-2026-06-16 (D-017), nao so os turnos nomeados do gabarito. Cada
// violacao cita o RULE-ID de docs/CLASSIFICATION_RULES.md.
const FIXTURES = [
  ['bastion', 'bastion server log ek.txt', 'bastion local chat ek.txt'],
  ['night-harpy', 'night harpy server log ek.txt', 'night harpy local chat ek.txt'],
  ['darklight-rp', 'darklight server log rp.txt', 'darklight local chat rp.txt'],
  ['vemiath', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt'],
  ['bakra', 'Server Log bakra.txt', 'Local Chat bakra.txt'],
  ['bakradrone', 'bakradrone server log.txt', 'bakradrone local chat.txt'],
  // TEMP (excluído a pedido do usuário): "drome" é o mesmo log de "bakra" em
  // arquivo diferente, com um problema conhecido a resolver por último.
  // ['drome', 'Server Log drome.txt', 'Local Chat drome.txt'],
  ['essence', 'essence server log.txt', 'essence local chat.txt'],
  // 'highwin Server Log.txt'/'highwin Local Chat.txt' foram excluidos do repo; mantido
  // apenas 'highwin 2'.
  ['highwin2', 'highwin 2 Server Log.txt', 'highwin 2 Local Chat.txt'],
  ['jaded', 'jaded Server Log.txt', 'jaded Local Chat.txt'],
  ['mk', 'mk server log.txt', 'mk localchat.txt'],
  ['monk', 'monk server log.txt', 'monk localchat.txt'],
  ['monk2', 'monk 2 server log.txt', 'monk 2 local chat.txt'],
  ['ms-boss', 'ms boss server log.txt', 'ms boss local chat.txt'],
  ['murcion', 'murcion server log rp.txt', 'murcion local chat rp.txt'],
  ['rp-pack', 'server log rp.txt', 'localchat rp.txt'],
  ['uhax', 'uhax server log ed.txt', 'uhax local chat ed.txt'],
  ['uhax2', 'uhax 2 server log ed.txt', 'uhax 2 local chat ed.txt'],
  ['hakka', 'Hakka Server Log.txt', 'Hakka Local Chat.txt'],
  ['barrage', 'barrage Server Log.txt', 'barrage local chat.txt'],
];

function runInvariants() {
  const result = runUnifiedInvariants({ only: onlyFilter });
  if (result.empty) process.exit(2);
  process.exit(result.fail ? 1 : 0);
}

// H-001..H-004 (auditoria global). Lista TODOS os turnos com bloco único de
// spell/runa/granada/AA-de-área de 3+ hits aceito e, para cada um, a prova de
// homogeneidade + cardinalidade por leech. STATUS FAIL se qualquer bloco grande foi
// aceito sem prova (suspect). Varre barrage + todas as fixtures (todos os regimes).
function runAudit() {
  let suspects = 0;
  let audited = 0;
  let bigBlocks = 0;
  const selectedFixtures = FIXTURES.filter(([id]) => selectedByFilter(`audit/${id}`));
  if (!selectedFixtures.length) {
    console.error(`Nenhuma fixture de auditoria corresponde a: ${onlyFilter}`);
    process.exit(2);
  }
  for (const [id, sv, lc] of selectedFixtures) {
    let rows;
    try { rows = modelForPair(`logs/${sv}`, `logs/${lc}`); }
    catch (err) { console.log(`SKIP audit/${id}: ${err.message}`); continue; }
    const seen = new Set();
    audited++;
    for (const row of rows) {
      if (seen.has(row.res)) continue;
      seen.add(row.res);
      for (const a of row.res.experimentalAudit || []) {
        bigBlocks++;
        if (a.suspect) {
          suspects++;
          console.log(`SUSPECT ${id} ${fmtSec(a.ts)} ${a.comp} hits=${a.hits} usableLeech=${a.usableLeech} nLeechCloses=${a.nLeechCloses} betterCut=${a.betterCut} homogeneous=${a.homogeneous} aaOutlier=${a.aaOutlier} :: ${a.reason}`);
        }
      }
    }
  }
  console.log(`\nAUDIT: ${bigBlocks} blocos únicos de 3+ hits aceitos em ${audited} fixtures; ${suspects} SUSPECT.`);
  console.log(suspects ? 'STATUS: FAIL' : 'STATUS: PASS (nenhum bloco único grande aceito sem prova de homogeneidade + N_leech)');
  printModelStats();
  process.exit(suspects ? 1 : 0);
}

function printCompare(serverPath, localPath, ts) {
  for (const row of modelForPair(serverPath, localPath).filter(row => ts == null || row.ev.ts === ts)) {
    const got = lineSummary(row);
    console.log(`\n=== ${path.basename(serverPath)} ${row.pairLabel} ${fmtSec(row.ev.ts)} ===`);
    console.log(`mobElementRegime=${row.mobElementRegime.id} status=${row.mobElementRegime.status} reason=${row.mobElementRegime.reason || '-'}`);
    console.log(`partition=${row.resolved.partition.join(' -> ')} A${got.arrow} S${got.spell} R${got.rune} G${got.grenade}`);
    for (const line of row.resolved.lines) console.log(`  ${fmtSec(line.ts)}.${line.seq || 0} dmg=${line.dmg} ${line.comp} action=${line.actionLabel || '-'} ${line.experimentalReason || ''}`);
  }
}

export { lineSummary, modelForPair, toSec };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--gabarito')) runGabarito();
  if (argv.includes('--invariants')) runInvariants();
  if (argv.includes('--audit')) runAudit();
  const compare = argv.indexOf('--compare');
  if (compare >= 0) {
    const server = argv[compare + 1], local = argv[compare + 2];
    if (!server || !local) { console.error('Usage: node tools/unified-experimental.mjs --compare server local [--ts HH:MM:SS]'); process.exit(1); }
    const tsIndex = argv.indexOf('--ts');
    printCompare(server, local, tsIndex >= 0 ? toSec(argv[tsIndex + 1]) : null);
    process.exit(0);
  }
  console.log('Usage: node tools/unified-experimental.mjs --gabarito | --invariants | --audit [--only substring] | --compare server local [--ts HH:MM:SS]');
}
