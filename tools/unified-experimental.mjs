#!/usr/bin/env node
// Thin Node harness for the browser-shared experimental classifier.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { selectMobElementModsRegime } from './mob-element-mod-regime.mjs';

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
  const servers = splitSessions(fs.readFileSync(serverPath, 'utf8'));
  const locals = splitSessions(fs.readFileSync(localPath, 'utf8'));
  if (servers.length === 1 && locals.length === 1) {
    const sessionDate = parseSessionDate(servers[0]);
    return [{ sv: servers[0], lc: locals[0], sessionDate, label: sessionDate ? `${sessionDate.day}/${sessionDate.month}/${sessionDate.year}` : 'undated' }];
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

const MODEL_CACHE = new Map();
function modelForPair(serverPath, localPath) {
  const cacheKey = `${path.resolve(serverPath)}\n${path.resolve(localPath)}`;
  if (MODEL_CACHE.has(cacheKey)) return MODEL_CACHE.get(cacheKey);
  const out = [];
  for (const pair of sessionPairs(serverPath, localPath)) {
    if (isTempExcludedSession(serverPath, pair.sessionDate)) continue;
    const mobElementRegime = selectMobElementModsRegime(pair.sessionDate);
    const ctx = freshCtx(mobElementRegime);
    const res = ctx.classifyWithLocalChat(pair.sv.text, pair.lc.text, { trace:true });
    if (!res || res.error) continue;
    for (const turn of res.turnTrace || []) {
      const evidence = turn.experimentalEvidence || {};
      const ev = { ...evidence, ts:turn.ts, lines:turn.lines || [] };
      out.push({ pairLabel:pair.label, mobElementRegime, ev, resolved:resolvedFromTurn(turn), res });
    }
  }
  MODEL_CACHE.set(cacheKey, out);
  return out;
}

function lineSummary(row) {
  return Object.fromEntries(['arrow', 'spell', 'rune', 'grenade'].map(comp => [comp, sumComp(row.resolved.lines, comp)]));
}

function findModelTurn(server, local, ts, fingerprint) {
  const rows = modelForPair(`logs/${server}`, `logs/${local}`).filter(row => row.ev.ts === ts);
  return (fingerprint && rows.find(row => fingerprint(row.resolved.lines))) || rows[0] || null;
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

const CASES = [
  // M-016d/T-002: Death Echo é uma única ação com blast integral e echo 1/2.
  // O echo de :10 pertence ao cast de :09 e não ancora o ciclo seguinte.
  CL('death-echo/11:06:08','death echo server log.txt','death echo local chat.txt','11:06:08',countIs({arrow:1,spell:21,rune:0,grenade:0})),
  CL('death-echo/11:06:11','death echo server log.txt','death echo local chat.txt','11:06:11',countIs({arrow:1,spell:10,rune:0,grenade:0})),
  CL('death-echo/11:06:20','death echo server log.txt','death echo local chat.txt','11:06:20',countIs({arrow:1,spell:15,rune:0,grenade:0})),
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
];

function runGabarito() {
  let pass = 0, fail = 0, skipped = 0;
  for (const c of CASES) {
    const row = findModelTurn(c.sv, c.lc, c.ts, c.fp);
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
  for (const [id,sv,lc] of [
    ['bakradrone','logs/bakradrone server log.txt','logs/bakradrone local chat.txt'],
    ['highwin2','logs/highwin 2 Server Log.txt','logs/highwin 2 Local Chat.txt'],
    ['bastion','logs/bastion server log ek.txt','logs/bastion local chat ek.txt'],
  ]) {
    const rows = modelForPair(sv,lc).filter(row => row.mobElementRegime.id === 'pre-2026-06-16');
    if (!rows.length) { console.log(`SKIP audit/${id}: no dated pre-2026-06-16 session; not normatively approved under D-017`); skipped++; continue; }
    const violations = [];
    for (const row of rows) {
      const got = lineSummary(row);
      if (row.resolved.lines.length !== row.ev.lines.length) violations.push(`${fmtSec(row.ev.ts)} lost observed hits`);
      if (!row.ev.isRpRegime && got.arrow > 1) violations.push(`${fmtSec(row.ev.ts)} non-RP AA=${got.arrow}`);
      if (row.ev.uniqueBossTarget && [got.arrow,got.spell,got.rune,got.grenade].some(count => count > 1)) violations.push(`${fmtSec(row.ev.ts)} boss reused a concrete action`);
      if (row.ev.spellCast && isRpSingleTargetSpell(row.ev.spellCast.text) && got.spell > 1) violations.push(`${fmtSec(row.ev.ts)} single-target spell hits=${got.spell}`);
      if (row.ev.runeUse && isSingleTargetRune(row.ev.runeUse.name) && got.rune > 1) violations.push(`${fmtSec(row.ev.ts)} single-target rune hits=${got.rune}`);
      const labelReason = concreteLabels(row); if (labelReason) violations.push(`${fmtSec(row.ev.ts)} ${labelReason}`);
    }
    if (violations.length) { console.log(`FAIL audit/${id}: ${violations.slice(0,5).join('; ')}`); fail++; }
    else { console.log(`PASS audit/${id}: ${rows.length} pre-cutoff turns preserve hits, cardinality and concrete labels`); pass++; }
  }
  console.log(`\n${pass}/${pass + fail} pre-2026-06-16 experimental gabarito/problem turns ok; ${skipped} outside reviewer scope`);
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

// M-024 (uma granada = um timestamp de impacto) e M-025 (o mesmo cast nao
// pode explicar hits em dois timestamps). Invariante CROSS-TURNO: agrupa os
// hits rotulados `grenade` da sessao pelo cast que os explica e exige <=1
// turno e <=1 timestamp de impacto por cast.
function grenadeImpactViolations(rows) {
  const byCast = new Map();
  for (const row of rows) {
    const grenLines = row.resolved.lines.filter(line => line.comp === 'grenade');
    if (!grenLines.length) continue;
    const key = row.ev.grenadeCast ? row.ev.grenadeCast.ts : `sem-cast@${row.ev.ts}`;
    if (!byCast.has(key)) byCast.set(key, { turns: new Set(), impacts: new Set() });
    const group = byCast.get(key);
    group.turns.add(row.ev.ts);
    for (const line of grenLines) group.impacts.add(line.ts);
  }
  const out = [];
  for (const [key, group] of byCast) {
    const castLabel = typeof key === 'number' ? fmtSec(key) : key;
    const anchor = Math.min(...group.turns);
    if (group.turns.size > 1) {
      out.push({ ts: anchor, rule: 'M-025', msg: `cast ${castLabel} explica granada em ${group.turns.size} turnos (${[...group.turns].sort((a, b) => a - b).map(fmtSec).join(', ')})` });
    }
    if (group.impacts.size > 1) {
      out.push({ ts: anchor, rule: 'M-024', msg: `cast ${castLabel} tem ${group.impacts.size} timestamps de impacto (${[...group.impacts].sort((a, b) => a - b).map(fmtSec).join(', ')})` });
    }
  }
  return out;
}

// Invariantes mecanicos por-turno aplicaveis a qualquer turno (nao so aos
// gabaritados): T-003 (nenhum hit perdido), M-032 (AA <=1 fora de RP),
// M-009 (boss nao reusa acao), M-006 (single-target <=1 hit) para spell/runa,
// T-006/V-003 (spell e runa nao coexistem) e N-010 (sem rotulo generico).
function turnInvariantViolations(row) {
  const got = lineSummary(row);
  const out = [];
  if (row.resolved.lines.length !== row.ev.lines.length) out.push({ ts: row.ev.ts, rule: 'T-003', msg: 'hits observados perdidos no turno' });
  if (!row.ev.isRpRegime && got.arrow > 1) out.push({ ts: row.ev.ts, rule: 'M-032', msg: `AA=${got.arrow} fora de RP` });
  if (row.ev.uniqueBossTarget && [got.arrow, got.spell, got.rune, got.grenade].some(count => count > 1)) out.push({ ts: row.ev.ts, rule: 'M-009', msg: 'boss reusou uma acao concreta' });
  if (row.ev.spellCast && isRpSingleTargetSpell(row.ev.spellCast.text) && got.spell > 1) out.push({ ts: row.ev.ts, rule: 'M-006', msg: `spell single-target com ${got.spell} hits` });
  if (row.ev.runeUse && isSingleTargetRune(row.ev.runeUse.name) && got.rune > 1) out.push({ ts: row.ev.ts, rule: 'M-033', msg: `runa single-target com ${got.rune} hits` });
  if (got.spell > 0 && got.rune > 0) out.push({ ts: row.ev.ts, rule: 'T-006', msg: 'spell e runa coexistem no mesmo turno' });
  const labelReason = concreteLabels(row);
  if (labelReason) out.push({ ts: row.ev.ts, rule: 'N-010', msg: labelReason });
  return out;
}

function runInvariants() {
  let pass = 0, fail = 0, skipped = 0;
  for (const [id, sv, lc] of FIXTURES) {
    let rows;
    try {
      rows = modelForPair(`logs/${sv}`, `logs/${lc}`).filter(row => row.mobElementRegime.id === 'pre-2026-06-16');
    } catch (err) {
      console.log(`SKIP invariants/${id}: ${err.message}`);
      skipped++;
      continue;
    }
    if (!rows.length) {
      console.log(`SKIP invariants/${id}: nenhuma sessao pre-2026-06-16 em escopo (D-017)`);
      skipped++;
      continue;
    }
    const violations = grenadeImpactViolations(rows);
    for (const row of rows) violations.push(...turnInvariantViolations(row));
    violations.sort((a, b) => a.ts - b.ts);
    if (violations.length) {
      const shown = violations.slice(0, 6).map(v => `${fmtSec(v.ts)} ${v.rule}: ${v.msg}`).join('; ');
      console.log(`FAIL invariants/${id}: ${shown}${violations.length > 6 ? ` (+${violations.length - 6})` : ''}`);
      fail++;
    } else {
      console.log(`PASS invariants/${id}: ${rows.length} turnos pre-corte respeitam M-024/M-025, cardinalidade, T-006 e rotulos concretos`);
      pass++;
    }
  }
  console.log(`\n${pass}/${pass + fail} fixtures pre-2026-06-16 sem violacao de invariante mecanico; ${skipped} fora do escopo D-017`);
  process.exit(fail ? 1 : 0);
}

// H-001..H-004 (auditoria global). Lista TODOS os turnos com bloco único de
// spell/runa/granada/AA-de-área de 3+ hits aceito e, para cada um, a prova de
// homogeneidade + cardinalidade por leech. STATUS FAIL se qualquer bloco grande foi
// aceito sem prova (suspect). Varre barrage + todas as fixtures (todos os regimes).
function runAudit() {
  let suspects = 0;
  let audited = 0;
  let bigBlocks = 0;
  for (const [id, sv, lc] of FIXTURES) {
    let pairs;
    try { pairs = sessionPairs(`logs/${sv}`, `logs/${lc}`); }
    catch (err) { console.log(`SKIP audit/${id}: ${err.message}`); continue; }
    const seen = new Set();
    const rows = modelForPair(`logs/${sv}`, `logs/${lc}`);
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
  console.log('Usage: node tools/unified-experimental.mjs --gabarito | --invariants | --audit | --compare server local [--ts HH:MM:SS]');
}
