#!/usr/bin/env node
// gabarito-unified.mjs — asserts executáveis de turnos-gabarito para o
// UnifiedClassificationEngine (js/unified-classification-engine.js).
//
// Espelha tools/gabarito.mjs, mas roda o engine unificado (classifyUnified) em
// vez do classificador de produção. Cada caso aponta um par de logs + um
// timestamp; o harness varre TODAS as sessões do par e confere a expectativa de
// contagem por componente no turno alinhado.
//
// Uso:
//   node tools/gabarito-unified.mjs            -> roda os asserts (exit 1 se algum falhar)
//   node tools/gabarito-unified.mjs --only <substr>  -> filtra casos cujo id contém <substr>
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');

function freshCtx() {
  const ctx = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
    vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  return ctx;
}
function splitSessions(text) {
  const headerRe = /^Channel .+ saved /; const sessions = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (headerRe.test(line)) { if (cur) sessions.push(cur); cur = { header: line, lines: [line] }; }
    else if (cur) cur.lines.push(line);
  }
  if (cur) sessions.push(cur);
  if (!sessions.length) sessions.push({ header: '', lines: text.replace(/^﻿/, '').split(/\r?\n/) });
  return sessions.map(s => ({ ...s, text: s.lines.join('\n') }));
}
const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
function parseSessionDate(s) {
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(s.header);
  if (!m) return null;
  return { year:+m[6], month:MONTHS[m[1]]||0, day:+m[2], saveSec:+m[3]*3600+ +m[4]*60+ +m[5] };
}
function dateKey(d) {
  if (!d) return null;
  return d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.day).padStart(2, '0');
}
function parseCaseDate(s) {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\w{3})\/(\d{4})$/.exec(s);
  if (!m) return null;
  return +m[3] + '-' + String(MONTHS[m[2]] || 0).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
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
function sessionsOf(svP, lcP) {
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  if (svS.length === 1 && lcS.length === 1) return [{ sv: svS[0], lc: lcS[0] }];
  return buildPairs(svS, lcS);
}
const toSec = hms => { const m=/^(\d{2}):(\d{2}):(\d{2})$/.exec(hms); return m ? (+m[1]*3600)+(+m[2]*60)+(+m[3]) : null; };

function findTurns(svN, lcN, ts, date) {
  const svP = 'logs/' + svN, lcP = 'logs/' + lcN;
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) return { missing: true, turns: [] };
  const found = [];
  for (const pair of sessionsOf(svP, lcP)) {
    const wantedDate = parseCaseDate(date);
    if (wantedDate && dateKey(parseSessionDate(pair.sv)) !== wantedDate) continue;
    const ctx = freshCtx();
    let res; try { res = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true }); } catch (e) { continue; }
    if (!res || !res.turns) continue;
    for (const t of res.turns) if (t.ts === ts) found.push(t);
  }
  return { missing: false, turns: found };
}
const counts = turn => {
  const c = { arrow:0, spell:0, rune:0, grenade:0 };
  for (const comp of turn.components || []) { const k = comp.comp || comp.kind; if (k in c) c[k] += (comp.hits || []).length; }
  return c;
};

const C = (id, sv, lc, ts, check, date) => ({ id, sv, lc, ts: toSec(ts), tsRaw: ts, check, date });
const CN = (id, sv, lc, ts, date) => ({ id, sv, lc, ts: toSec(ts), tsRaw: ts, noTurn: true, date });
const CASES = [
  // essence/Echo of Ichgahal: boss unitario, sem cast ofensivo e sem Using de
  // runa no turno; o unico hit observado so pode ser AA.
  C('essence/00:21:12', 'essence server log.txt', 'essence local chat.txt', '00:21:12',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('essence/00:21:14', 'essence server log.txt', 'essence local chat.txt', '00:21:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // essence/Bakragore: a granada do cast 00:22:41 ja impactou em 00:22:43.
  // Em 00:22:45 restam AA e spell do cast ofensivo do proprio timestamp.
  C('essence/00:22:45', 'essence server log.txt', 'essence local chat.txt', '00:22:45',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: Eixo 2-físico AA × Ethereal Barrage. AA (7) cai no segundo anterior
  // ao cast `exori dir moe` (:39); a Barrage (8) cai no segundo do cast. O
  // timestamp separa os blocos (leech só seria necessário no mesmo segundo).
  C('barrage/19:00:38', 'barrage Server Log.txt', 'barrage local chat.txt', '19:00:38',
    t => { const c = counts(t); return (c.arrow === 7 && c.spell === 8) ? null : `esperado A7 S8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: cast ofensivo `exevo mas san` com bloco de 4 hits; a cardinalidade
  // por mana leech confirma N_leech=4 para o componente de spell.
  C('barrage/19:04:08', 'barrage Server Log.txt', 'barrage local chat.txt', '19:04:08',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: `exevo mas san` com AA no mesmo turno. O leech cap-aware confirma
  // o bloco S5 e nao contradiz os 4 hits anteriores de AA.
  C('barrage/18:59:58', 'barrage Server Log.txt', 'barrage local chat.txt', '18:59:58',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: AA e Ethereal Barrage têm dano físico muito próximo; a fronteira
  // correta é confirmada pela cardinalidade por leech, A10 antes de S9.
  C('barrage/19:04:40', 'barrage Server Log.txt', 'barrage local chat.txt', '19:04:40',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A10 S9; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: M-024/M-025 cross-turno. O cast `exevo tempo mas san` 19:00:05 explode
  // de fato em 19:00:07 (6 hits). A janela [c+2,c+4] alcança 19:00:09 (c+4), mas o
  // mesmo cast NÃO pode semear uma granada fantasma de 1 hit lá: as 9 linhas de mana
  // provam 4 AA + 5 Ethereal Barrage, todos visíveis (sem hit virtual por charm).
  C('barrage/19:00:09', 'barrage Server Log.txt', 'barrage local chat.txt', '19:00:09',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: guarda da explosão real do cast 19:00:05 — permanece inteira em
  // 19:00:07 (um único timestamp de impacto): AA 5 + Divine Caldera 4 + Grenade 6.
  C('barrage/19:00:07', 'barrage Server Log.txt', 'barrage local chat.txt', '19:00:07',
    t => { const c = counts(t); return (c.arrow === 5 && c.spell === 4 && c.rune === 0 && c.grenade === 6) ? null : `esperado A5 S4 G6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // gloompillar 08:34:44: o hit 681 OK em wandering pillar tem timestamp e leech
  // (life=118, mana=39) do bloco de AA, nao do bloco Divine Caldera em :45.
  // A fronteira correta respeita o timestamp e fecha leech limpo: A8 S8.
  C('gloompillar/08:34:44', 'gloompillar Server Log.txt', 'gloompillar Local Chat.txt', '08:34:44',
    t => {
      const c = counts(t);
      if (!(c.arrow === 8 && c.spell === 8 && c.rune === 0 && c.grenade === 0)) return `esperado A8 S8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      const arrow = (t.components || []).find(comp => comp.comp === 'arrow');
      const has681 = !!(arrow && (arrow.hits || []).some(h => h.seq === 3377 && h.dmg === 681));
      return has681 ? null : 'esperado hit seq=3377 dmg=681 no componente arrow';
    }),
  // essence/Bakragore: boss unitario com cast `exori gran con` no timestamp.
  // Cada componente fica com um hit: primeiro AA, segundo spell.
  C('essence/00:23:29', 'essence server log.txt', 'essence local chat.txt', '00:23:29',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // essence/Bakragore: mesmo eixo boss unitario + cast ofensivo no timestamp.
  // O bloco S2 e invalido por M-009; a particao valida e AA seguido de spell.
  C('essence/00:26:23', 'essence server log.txt', 'essence local chat.txt', '00:26:23',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 10/Jun/2026 19:49-19:55: sem cast ofensivo; `Using great fireball`
  // fixa a fronteira. Antes da linha de runa: AA critado; depois: runa nao
  // critada compativel, confirmada por N_leech=10.
  C('mk/19:50:08', 'mk server log.txt', 'mk localchat.txt', '19:50:08',
    t => { const c = counts(t); return (c.arrow === 7 && c.spell === 0 && c.rune === 10 && c.grenade === 0) ? null : `esperado A7 R10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 10/Jun/2026 19:49-19:55: cast ofensivo `exevo mas san` no timestamp e
  // nenhuma linha `Using` de runa no turno. Originais fisico e holy separam AA e
  // Caldera em dois blocos contiguos.
  C('mk/19:49:46', 'mk server log.txt', 'mk localchat.txt', '19:49:46',
    t => { const c = counts(t); return (c.arrow === 8 && c.spell === 10 && c.rune === 0 && c.grenade === 0) ? null : `esperado A8 S10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 07/Jun/2026 23:19-23:25: a linha `Using great
  // fireball` cai dentro do timestamp e fixa a fronteira depois dos 6 hits de
  // AA. O leech com/sem `utevo grav san` nao pode podar o corte mecanico A6 R9.
  C('darklight-vemiath/23:21:01', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:21:01',
    t => { const c = counts(t); return (c.arrow === 6 && c.spell === 0 && c.rune === 9 && c.grenade === 0) ? null : `esperado A6 R9; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 07/Jun/2026 22:18-22:24: prefixo de AA com
  // enflame charm matando um alvo antes do dano principal visivel. O AA fecha
  // como A6 visivel + A0 virtual por N_leech=7; o sufixo e Divine Caldera S5.
  C('darklight-vemiath/22:20:24', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '22:20:24',
    t => { const c = counts(t); return (c.arrow === 7 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A7 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // bastion 15:23:16 (S-014e/C-008): o overpower charm mata um skirmisher (charm+XP,
  // killedTarget) que a Fierce Berserk de área também varreu. O hit dessa spell no alvo
  // já morto tem dano 0 e não aparece — hit principal virtual reconhecido leech-free no
  // resolver das 4 vocações single-target (hits.length>=2). => S5 (4 visíveis + 1 virtual).
  C('bastion/15:23:16', 'bastion server log ek.txt', 'bastion local chat ek.txt', '15:23:16',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // monk 2 07:20:18 (S-014e/C-008): o enflame charm mata um skirmisher (killedTarget) que
  // a Flurry of Blows de área varreu; o AA single-target (707) já gastou seu hit visível no
  // marksman, então o alvo varrido a mais pertence à Flurry. => A1 S2 (612 + 1 virtual).
  C('monk2/07:20:18', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:20:18',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estágio atrasado multiestágio com
  // confirmação por cluster de leech (atribuição tardia). Isento do veto same-mob pela
  // change exempt-late-stage-multistage-from-samemob-veto: o mesmo raubritter leva blast
  // (:35) e eco (:36) com dano distinto no mesmo cast, e isso é o comportamento declarado.
  C('monk2/07:19:35', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:19:35',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 10 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('monk2/07:19:56', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:19:56',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 11 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S11; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 04/Jun (pré-cutoff): sem os mods do regime, o AA físico que
  // varia (911/883/869) colapsava no Divine Caldera determinístico (815), violando
  // H-001. Com os mods PRE expostos, a borda fica correta: AA 5 + Caldera 9. O cast
  // `exevo mas san` vem em :27; os hits de :26 que variam são AA, não spell.
  C('darklight-vemiath/22:41:26', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '22:41:26',
    t => { const c = counts(t); return (c.arrow === 5 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A5 S9; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 07/Jun 23:19-23:25 (crit-per-component): três componentes AoE no
  // MESMO segundo — 8 AA crit (físico) + 8 Divine Caldera (holy) + 10 granada (holy). O AA
  // crit só reverte (interseção não-vazia cross-mob) com o crit do AA (~1.83) inferido por
  // buckets por-componente; com crit global/1 o bloco AA dava physical_intersection_empty.
  C('darklight-vemiath/23:23:20', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:23:20',
    t => { const c = counts(t); return (c.arrow === 8 && c.spell === 8 && c.rune === 0 && c.grenade === 10) ? null : `esperado A8 S8 G10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 05:42:01 (M-031): a Divine Caldera crit (O_holy 1390) atravessa :01->:02 e é UM
  // componente; não pode ser fatiada em spell+granada só porque há cast de granada na
  // janela (a granada real, nível distinto, está em 05:42:03). => AA 9 + Caldera 13.
  C('mk/05:42:01', 'mk server log.txt', 'mk localchat.txt', '05:42:01',
    t => { const c = counts(t); return (c.arrow === 9 && c.spell === 13 && c.rune === 0 && c.grenade === 0) ? null : `esperado A9 S13; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 05:43:59 (S-014e): granada de 8 hits visíveis; curse/wound charm NÃO matam
  // (seguidos de hit visível), então não geram hit virtual. N_leech=8, um só timestamp
  // de impacto (05:44:00). => AA 12 + Caldera 13 + granada 8, sem virtual.
  C('mk/05:43:59', 'mk server log.txt', 'mk localchat.txt', '05:43:59',
    t => { const c = counts(t); return (c.arrow === 12 && c.spell === 13 && c.rune === 0 && c.grenade === 8) ? null : `esperado A12 S13 G8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 09/Jul/2026: granada do cast anterior cai no prefixo do turno
  // seguinte. M-023/M-025 exigem comparar a janela inteira antes de consumir o cast.
  C('mazzerinbarrage/01:20:45', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:20:45',
    t => { const c = counts(t); return (c.arrow === 13 && c.spell === 14 && c.rune === 0 && c.grenade === 12) ? null : `esperado G12 A13 S14; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  C('mazzerinbarrage/01:22:51', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:22:51',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 12 && c.rune === 0 && c.grenade === 10) ? null : `esperado G10 A10 S12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  // openspec/changes/fix-grenade-cast-turn-assignment (caso-prova): dois turnos
  // candidatos (cast+2 e cast+4) resolviam independentemente com o mesmo cast de
  // granada `01:21:19`. Antes desta correção, `buildGrenadeCastAssignments`
  // escolhia por hitCount do bloco granada (14 em :23 > 12 em :21), deixando :21
  // sem classificação e criando uma Divine Caldera órfã de 1 hit em :23 (holy 1262,
  // não bate com nenhum Caldera real da sessão). O teste comparativo de leech
  // (D1, estilo S-020/S-020a) mostra que o hit órfão bate muito melhor com a
  // hipótese "fundido no bloco arrow contíguo" (N=13, esperado life≈111/mana≈33)
  // do que "sozinho" (N=1, esperado life≈654/mana≈197; observado 99/30) — :21 é o
  // candidato sem resíduo e vence. Ver design.md do change pra prova detalhada.
  C('mazzerinbarrage/01:21:21', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:21:21',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 12 && c.rune === 0 && c.grenade === 12) ? null : `esperado A10 S12 G12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  // Guarda: o turno vizinho (:23, cast+4) continua resolvido, agora sem a granada
  // (que pertence a :21) e sem o hit órfão — os 13+14=27 hits fecham como AA+Caldera
  // puro, sem resíduo.
  C('mazzerinbarrage/01:21:23', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:21:23',
    t => { const c = counts(t); return (c.arrow === 13 && c.spell === 14 && c.rune === 0 && c.grenade === 0) ? null : `esperado A13 S14 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  // jaded 10/Jun/2026 20:00-20:01: mesmo padrão do caso-prova acima, em log e cast
  // diferentes — prova que a correção não é específica de mazzerinbarrage.
  C('jaded/20:00:29', 'jaded Server Log.txt', 'jaded Local Chat.txt', '20:00:29',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 12 && c.rune === 0 && c.grenade === 12) ? null : `esperado A10 S12 G12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '10/Jun/2026'),
  // mazzerinbarrage 30/Jun/2026 23:45-23:51 (D-007/S-008 + calibração bloodjaw armor=128):
  // uma única transição não-crit→crit crava a fronteira AA×Ethereal Barrage. Com o armor
  // manual antigo (100), o intervalo de original físico do bloodjaw ficava disjunto dos
  // blockmates (~7-12 de O) e physical_intersection_empty vetava a única partição
  // crit-consistente => no_valid_partition. Corte correto = a transição de crit.
  C('mazzerinbarrage/23:48:31', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:48:31',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('mazzerinbarrage/23:49:35', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:49:35',
    t => { const c = counts(t); return (c.arrow === 3 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A3 S3; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('mazzerinbarrage/23:50:01', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:50:01',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // jaded 10/Jun/2026 21:01:38 (D-007/S-008 em overkill): o hit 348 é overkill NÃO-crit;
  // o flag de crit é legível no overkill, então ele não pode ficar no bloco crit da
  // Divine Caldera. AA 4 (386, 266, 288, 348-OK) + Caldera 5 (crits).
  C('jaded/21:01:38', 'jaded Server Log.txt', 'jaded Local Chat.txt', '21:01:38',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 30/Jun/2026 23:47:21 (S-014e/V12 com divine wrath): AA 2 (970 +
  // 1091-OK não-crit) + Ethereal Barrage crit com 5 hits visíveis + 1 virtual — o
  // `divine wrath charm` (1251 -> XP) matou o 6º darklight source antes da linha da
  // Barrage; o mana leech dos hits limpos fecha exato-ceil em N_leech=6. O hit `1782`
  // logo após o charm é OUTRA instância de source (killedTarget tem precedência sobre
  // o pareamento por nome). Espera S6 contando o hit virtual (mesma convenção do
  // caso darklight-vemiath/22:20:24, A7 = 6 visíveis + 1 virtual).
  C('mazzerinbarrage/23:47:21', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:47:21',
    t => { const c = counts(t); return (c.arrow === 2 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A2 S6(5+1 virtual); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 17/Jun/2026 16:23-16:35 (spec unified-scorer-evidence-combination,
  // "Componente único do eixo físico compete com cortes AA+Barrage por leech"): 6 hits
  // físicos críticos no mesmo segundo do cast `exori dir moe`. O bloco único de Ethereal
  // Barrage (spell[6]) fecha N_leech=6 exato (delta 0 em vida e mana, com o bônus de
  // +10% vida da própria Barrage), enquanto todo corte AA+Barrage mecanicamente válido
  // ([2,6]/[3,6]/[4,6]) e sistematicamente capped_low. mechanicalOrder nao pode mais
  // descartar o componente unico contra cortes leech-piores. Esperado A0 S6.
  C('mazzerinbarrage/16:23:53', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '16:23:53',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 28/Jun/2026 22:07:44 (V-025, mesmo padrao do 16:23:53): 7 hits de
  // Ethereal Barrage com Expose Weakness misto, mesmo segundo do cast. Componente unico
  // fecha leech limpo; cortes AA+Barrage nao. Esperado A0 S7.
  C('mazzerinbarrage/22:07:44', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '22:07:44',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S7; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 28/Jun/2026 22:09:57 (S-020a): ambiguous_equal_best_partitions
  // entre cuts=[2,5] e [3,5]. O hit em disputa (darklight source 772, life=157,
  // mana=51) fica no nucleo baixo de leech do prefixo (147/163 vida, 48/58 mana),
  // nao no nucleo alto dos overkills finais (227/246 vida, 61/66 mana). Esperado A3 S2.
  C('mazzerinbarrage/22:09:57', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '22:09:57',
    t => { const c = counts(t); return (c.arrow === 3 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A3 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // monk 11:55:23 (V-025, prova que a regra nao e especifica de paladin/Ethereal
  // Barrage): Greater Flurry of Blows (exori gran mas pug) e physical/area, mesmo gate.
  // 4 hits (830,712,830,830); corte antigo isolava o 712 como AA (n=1, leech previsto
  // ~0.5, muito acima do observado ~0.1627); componente unico (n=4) preve 0.5*areaFactor(4)
  // =0.1625, quase exato. Esperado A0 S4.
  C('monk/11:55:23', 'monk server log.txt', 'monk localchat.txt', '11:55:23',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // uhax 3 30/Jun/2026 20:49:26: primeiro turno parcial, sem spell ofensiva
  // concreta e sem Using de runa no recorte. A unica hipotese e arrow[7], invalida
  // para druid por M-031/M-032; deve ser diagnosticavel, mas nao virar falha
  // operacional nem classificacao inventada.
  C('uhax3/20:49:26', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '20:49:26',
    t => (t.partialEdge === true && t.partialEdgeMissingEvidence === true && t.reason === 'partial_edge_missing_evidence')
      ? null
      : `esperado partial_edge_missing_evidence; status=${t.status} reason=${t.reason} partialEdge=${t.partialEdge} partialEdgeMissingEvidence=${t.partialEdgeMissingEvidence}`),
  // uhax 3 30/Jun/2026 20:51:47 (M-016c): server log tem `Using one of 3558
  // great fireball runes...` no mesmo segundo dos 8 hits (darklight matter,
  // darklight source x2, bloodjaw x2, walking pillar x3), todos revertendo
  // exatamente contra o perfil fogo de Great Fireball. O local chat tem
  // `adori mas frigo` do mesmo jogador em 20:51:48 (1s depois) — incantacao
  // nao catalogada que antes vencia a particao por um artefato de score
  // (mechanicalOrder); `adori` e ignorada e o resultado correto e R8. Este caso
  // tambem preserva o controle de Using de runa observado: uma acao ofensiva
  // concreta deve impedir o filtro de missing evidence.
  C('uhax3/20:51:47', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '20:51:47',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 0 && c.rune === 8 && c.grenade === 0 && !t.partialEdgeMissingEvidence) ? null : `esperado R8 (Great Fireball), sem filtro de borda; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade} partialEdgeMissingEvidence=${t.partialEdgeMissingEvidence}`; }),
  // exempt-burst-and-chain-from-samemob-veto: Terra Burst (exevo ulus tera) tem bonus
  // condicional por-alvo (x1.6), mecanica declarada -> isenta do veto same-mob. O turno
  // 13:33:14 (darklight striker 3760/2351, razao 1.60) resolve A1 S7.
  C('uhax3/13:33:14', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:33:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (M-037): caso representativo com fronteira de timestamp AA->spell.
  C('monk/11:54:44', 'monk server log.txt', 'monk localchat.txt', '11:54:44',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),

  // generalize-single-target-aa-resolver: 58 turnos de Monk (serverlog6..9.txt +
  // localchat6..9.txt) que eram unresolved (multiple_arrow_hits_not_allowed +
  // physical_intersection_empty/same_mob_state_exact_original_mismatch/
  // elemental_cluster_span_too_wide) antes de generalizar resolveEkTurn para
  // knight/sorcerer/druid/monk, mais o contra-exemplo 07:10:57 (já resolvia pelo
  // caminho genérico; veredito congelado para provar que a generalização não o
  // muda).
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:10:55', 'serverlog6.txt', 'localchat6.txt', '07:10:55',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:10:57: contra-exemplo: já resolvia pelo caminho genérico, veredito congelado.
  C('serverlog6/07:10:57', 'serverlog6.txt', 'localchat6.txt', '07:10:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S9 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:00', 'serverlog6.txt', 'localchat6.txt', '07:11:00',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:11:02: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog6/07:11:02', 'serverlog6.txt', 'localchat6.txt', '07:11:02',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 8 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S8 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:06', 'serverlog6.txt', 'localchat6.txt', '07:11:06',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:10', 'serverlog6.txt', 'localchat6.txt', '07:11:10',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog6/07:11:12', 'serverlog6.txt', 'localchat6.txt', '07:11:12',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 16 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S16; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:11:14: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog6/07:11:14', 'serverlog6.txt', 'localchat6.txt', '07:11:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:16', 'serverlog6.txt', 'localchat6.txt', '07:11:16',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:20', 'serverlog6.txt', 'localchat6.txt', '07:11:20',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:11:22: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog6/07:11:22', 'serverlog6.txt', 'localchat6.txt', '07:11:22',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 8 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S8 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:27', 'serverlog6.txt', 'localchat6.txt', '07:11:27',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:31', 'serverlog6.txt', 'localchat6.txt', '07:11:31',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:14:51: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:14:51', 'serverlog7.txt', 'localchat7.txt', '07:14:51',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S3 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:14:55', 'serverlog7.txt', 'localchat7.txt', '07:14:55',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:14:57: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:14:57', 'serverlog7.txt', 'localchat7.txt', '07:14:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:02', 'serverlog7.txt', 'localchat7.txt', '07:15:02',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:06', 'serverlog7.txt', 'localchat7.txt', '07:15:06',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog7/07:15:09', 'serverlog7.txt', 'localchat7.txt', '07:15:09',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 16 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S16; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:13', 'serverlog7.txt', 'localchat7.txt', '07:15:13',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:17', 'serverlog7.txt', 'localchat7.txt', '07:15:17',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:15:20: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:15:20', 'serverlog7.txt', 'localchat7.txt', '07:15:20',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 12 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S12 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:15:22: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:15:22', 'serverlog7.txt', 'localchat7.txt', '07:15:22',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 8 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S8 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:24', 'serverlog7.txt', 'localchat7.txt', '07:15:24',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:29', 'serverlog7.txt', 'localchat7.txt', '07:15:29',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog7/07:15:31', 'serverlog7.txt', 'localchat7.txt', '07:15:31',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 12 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:35', 'serverlog7.txt', 'localchat7.txt', '07:15:35',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:40', 'serverlog7.txt', 'localchat7.txt', '07:15:40',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S3; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:34', 'serverlog8.txt', 'localchat8.txt', '07:22:34',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:39', 'serverlog8.txt', 'localchat8.txt', '07:22:39',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog8/localchat8 07:22:41: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog8/07:22:41', 'serverlog8.txt', 'localchat8.txt', '07:22:41',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:45', 'serverlog8.txt', 'localchat8.txt', '07:22:45',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:50', 'serverlog8.txt', 'localchat8.txt', '07:22:50',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog8/07:22:52', 'serverlog8.txt', 'localchat8.txt', '07:22:52',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 16 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S16; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:57', 'serverlog8.txt', 'localchat8.txt', '07:22:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:01', 'serverlog8.txt', 'localchat8.txt', '07:23:01',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog8/localchat8 07:23:03: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog8/07:23:03', 'serverlog8.txt', 'localchat8.txt', '07:23:03',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 8 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S8 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:08', 'serverlog8.txt', 'localchat8.txt', '07:23:08',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:12', 'serverlog8.txt', 'localchat8.txt', '07:23:12',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog8/07:23:15', 'serverlog8.txt', 'localchat8.txt', '07:23:15',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 10 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:19', 'serverlog8.txt', 'localchat8.txt', '07:23:19',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:24', 'serverlog8.txt', 'localchat8.txt', '07:23:24',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S3; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:48:35: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:48:35', 'serverlog9.txt', 'localchat9.txt', '07:48:35',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:48:37: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:48:37', 'serverlog9.txt', 'localchat9.txt', '07:48:37',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:41', 'serverlog9.txt', 'localchat9.txt', '07:48:41',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:45', 'serverlog9.txt', 'localchat9.txt', '07:48:45',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog9/07:48:48', 'serverlog9.txt', 'localchat9.txt', '07:48:48',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 15 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S15; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:48:50: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:48:50', 'serverlog9.txt', 'localchat9.txt', '07:48:50',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:53', 'serverlog9.txt', 'localchat9.txt', '07:48:53',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:57', 'serverlog9.txt', 'localchat9.txt', '07:48:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:49:00: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:49:00', 'serverlog9.txt', 'localchat9.txt', '07:49:00',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 11 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S11 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:04', 'serverlog9.txt', 'localchat9.txt', '07:49:04',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:09', 'serverlog9.txt', 'localchat9.txt', '07:49:09',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog9/07:49:11', 'serverlog9.txt', 'localchat9.txt', '07:49:11',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 13 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S13; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Greater Flurry of Blows (exori gran mas pug): spell fisica de area do monge; resolve
  // por posicao do primeiro hit + cardinalidade de leech (V-025), independente do veto
  // same-mob. Ja resolvia antes desta change; caso atualizado so para refletir o motor.
  C('serverlog9/07:49:13', 'serverlog9.txt', 'localchat9.txt', '07:49:13',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:16', 'serverlog9.txt', 'localchat9.txt', '07:49:16',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:20', 'serverlog9.txt', 'localchat9.txt', '07:49:20',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:49:22: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:49:22', 'serverlog9.txt', 'localchat9.txt', '07:49:22',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:49:27: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:49:27', 'serverlog9.txt', 'localchat9.txt', '07:49:27',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 14/Jul/2026 (sorcerer Ritual): Great Energy Beam sem AA fantasma; dodge
  // Hazard conta como hit principal observado de dano 0 no componente do beam.
  C('kim/16:12:30', 'kim server log.txt', 'kim local chat.txt', '16:12:30',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:13:26: dois hits de Great Energy Beam no mesmo mob/estado; leech N=1
  // Great Energy Beam (M-035, sub-linhas central/side) tem um mesmo mob podendo ser
  // atingido pelos dois segmentos do feixe em niveis distintos legitimos, mas essa
  // deteccao NUNCA foi implementada no motor Unified (so existe como campo de
  // passagem em js/unified-main.js). Antes de fix-mage-druid-aa-evidence-gold-leech,
  // o atalho sem validacao elemental (bug corrigido nessa mudanca) mascarava a
  // quebra de exatidao same-mob; com a validacao real, o motor honestamente nao
  // consegue confirmar homogeneidade sem o validador de tier de M-035 (que nao
  // existe). unresolved e o resultado correto ate M-035 ser implementado.
  C('kim/16:13:26', 'kim server log.txt', 'kim local chat.txt', '16:13:26',
    t => (t.status === 'unresolved') ? null : `esperado unresolved; got status=${t.status} reason=${t.reason}`),
  // kim 16:17:14: AA baixo real de sorcerer antes de Sudden Death single-target.
  C('kim/16:17:14', 'kim server log.txt', 'kim local chat.txt', '16:17:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 0 && c.rune === 1 && c.grenade === 0) ? null : `esperado A1 R1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:22:02: Death Echo com delay +2 porque :03 não tem hit ofensivo; os hits
  // Great Energy Beam (M-035, sub-linhas central/side) tem um mesmo mob podendo ser
  // atingido pelos dois segmentos do feixe em niveis distintos legitimos, mas essa
  // deteccao NUNCA foi implementada no motor Unified (so existe como campo de
  // passagem em js/unified-main.js). Antes de fix-mage-druid-aa-evidence-gold-leech,
  // o atalho sem validacao elemental (bug corrigido nessa mudanca) mascarava a
  // quebra de exatidao same-mob; com a validacao real, o motor honestamente nao
  // consegue confirmar homogeneidade sem o validador de tier de M-035 (que nao
  // existe). unresolved e o resultado correto ate M-035 ser implementado.
  C('kim/16:22:02', 'kim server log.txt', 'kim local chat.txt', '16:22:02',
    t => (t.status === 'unresolved') ? null : `esperado unresolved; got status=${t.status} reason=${t.reason}`),
  CN('kim/16:22:04-no-turn', 'kim server log.txt', 'kim local chat.txt', '16:22:04'),
  // kim 16:22:05: depois de consumir o echo de :04, o beam real do cast :05 fica
  // Great Energy Beam (M-035, sub-linhas central/side) tem um mesmo mob podendo ser
  // atingido pelos dois segmentos do feixe em niveis distintos legitimos, mas essa
  // deteccao NUNCA foi implementada no motor Unified (so existe como campo de
  // passagem em js/unified-main.js). Antes de fix-mage-druid-aa-evidence-gold-leech,
  // o atalho sem validacao elemental (bug corrigido nessa mudanca) mascarava a
  // quebra de exatidao same-mob; com a validacao real, o motor honestamente nao
  // consegue confirmar homogeneidade sem o validador de tier de M-035 (que nao
  // existe). unresolved e o resultado correto ate M-035 ser implementado.
  C('kim/16:22:05', 'kim server log.txt', 'kim local chat.txt', '16:22:05',
    t => (t.status === 'unresolved') ? null : `esperado unresolved; got status=${t.status} reason=${t.reason}`),
  // kim 16:22:09: Death Echo de área sem evidência positiva de AA; o hit 993 não é
  // Great Energy Beam (M-035, sub-linhas central/side) tem um mesmo mob podendo ser
  // atingido pelos dois segmentos do feixe em niveis distintos legitimos, mas essa
  // deteccao NUNCA foi implementada no motor Unified (so existe como campo de
  // passagem em js/unified-main.js). Antes de fix-mage-druid-aa-evidence-gold-leech,
  // o atalho sem validacao elemental (bug corrigido nessa mudanca) mascarava a
  // quebra de exatidao same-mob; com a validacao real, o motor honestamente nao
  // consegue confirmar homogeneidade sem o validador de tier de M-035 (que nao
  // existe). unresolved e o resultado correto ate M-035 ser implementado.
  C('kim/16:22:09', 'kim server log.txt', 'kim local chat.txt', '16:22:09',
    t => (t.status === 'unresolved') ? null : `esperado unresolved; got status=${t.status} reason=${t.reason}`),
  // kim 16:23:25: Energy Wave com dois hits observados identicos em sulphider
  // (1307 + 58 mana) no mesmo estado; a duplicata bloqueia AA posicional fantasma.
  C('kim/16:23:25', 'kim server log.txt', 'kim local chat.txt', '16:23:25',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:29:58: atalho de charm-kill/zero-damage nao pode criar AA alto de
  // sorcerer quando a Energy Wave de area pode explicar o hit visivel.
  C('kim/16:29:58', 'kim server log.txt', 'kim local chat.txt', '16:29:58',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:20:51: empate de distancia entre `exevo mort ora` (:51) e beam (:53)
  // deve escolher o cast anterior (M-014), nao o posterior.
  C('kim/16:20:51', 'kim server log.txt', 'kim local chat.txt', '16:20:51',
    t => {
      const c = counts(t);
      if (!(c.arrow === 0 && c.spell === 2 && c.rune === 0 && c.grenade === 0)) return `esperado A0 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      const spell = (t.components || []).find(comp => comp.comp === 'spell');
      return spell && spell.actionLabel === 'Death Echo (exevo mort ora)' ? null : `esperado Death Echo (exevo mort ora); got ${spell && spell.actionLabel || '-'}`;
    }),
  // kim 16:30:54: empate de distancia entre `exevo mort ora` (:54) e beam (:56)
  // Death Echo (exevo mort ora, M-016d) tem blast + eco a 1/2 potencia -- mesmo
  // mob pode legitimamente aparecer em 2 niveis (blast e eco). A checagem crua
  // same-mob (usada pela evidencia de separacao de AA e pela validacao final) nao
  // conhece essa relacao 1/2 do jeito que validateTerraBurstBonusBlock conhece o
  // bonus de Terra/Ice Burst -- fix-mage-druid-aa-evidence-gold-leech resolveu o
  // caso geral (kim 16:20:51) mas essa sessao especifica (blast+eco maior, 16 hits)
  // ainda cai no veto duro. unresolved e o resultado correto ate a checagem de
  // exatidao same-mob ganhar a mesma consciencia de tier que ja tem para Terra Burst.
  C('kim/16:30:54', 'kim server log.txt', 'kim local chat.txt', '16:30:54',
    t => (t.status === 'unresolved') ? null : `esperado unresolved; got status=${t.status} reason=${t.reason}`),
  // RPBOSS 17/Jun/2026 (detect-boss-by-articleless-mob): Royal Paladin contra Murcion (boss,
  // sem artigo) com adds. bossNameSet antigo ("sessão tem 1 mob") não detectava boss em sessão
  // multi-boss/com adds, então a leech-cardinalidade fundia 2 hits de casts distintos num
  // componente de área no mesmo boss (viola M-009/S-016). Com detecção por-artigo, cada hit no
  // boss casa 1 cast concreto: AA→spell→granada (M-004).
  C('rpboss/09:00:51', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:00:51',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  C('rpboss/09:01:14', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:01:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  C('rpboss/09:01:48', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:01:48',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  // 09:03:05: ordem AA(1096) -> Strong Ethereal Spear(1574) -> Divine Grenade(1048, explosão
  // por último). Contagem A1 S1 G1 (o spell é o Spear, não a Caldera).
  C('rpboss/09:03:05', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:03:05',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  // Guarda de não-regressão: AoE atingindo criaturas DISTINTAS (Murcion + an elder bloodjaw)
  // NÃO é boss-turn (bloodjaw tem artigo -> isBoss=false); o spell mantém 2 hits legítimos.
  C('rpboss/08:59:25', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '08:59:25',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2 (multi-criatura); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  C('rpboss/08:59:28', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '08:59:28',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2 (multi-criatura); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  // essence/Bakragore 00:22:43 (caso 13d): a mesma detecção por-artigo resolve sessões
  // multi-boss (Echo of Ichgahal + Bakragore) — antes bossMobs ficava vazio. AA(2581 crit) +
  // Strong Ethereal Spear(1040) + Divine Grenade(761).
  C('essence/00:22:43', 'essence server log.txt', 'essence local chat.txt', '00:22:43',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 14/Jun/2026 21:08:57: era o único turno já-resolvido que mudou — Divine
  // Caldera com 2 hits no bakragore (viola M-009) corrigido para Caldera(1) + Granada(1).
  C('mazzerinbarrage/21:08:57', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '21:08:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '14/Jun/2026'),
];

const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf('--only');
const onlyStr = onlyIdx >= 0 ? (argv[onlyIdx+1]||'') : null;
const cases = CASES.filter(c => !onlyStr || c.id.includes(onlyStr));

let pass = 0, fail = 0;
for (const c of cases) {
  const { missing, turns } = findTurns(c.sv, c.lc, c.ts, c.date);
  if (missing) { console.log(`SKIP ${c.id} (arquivo ausente)`); continue; }
  const pick = turns[0];
  if (!pick) {
    if (c.noTurn) { console.log(`PASS ${c.id}`); pass++; continue; }
    console.log(`FAIL ${c.id}: nenhum turno alinhado em ${c.tsRaw}`); fail++; continue;
  }
  if (c.noTurn) { console.log(`FAIL ${c.id}: turno alinhado inesperado em ${c.tsRaw}`); fail++; continue; }
  let reason = null; try { reason = c.check(pick); } catch (e) { reason = 'throw: ' + e.message; }
  if (reason) { console.log(`FAIL ${c.id}: ${reason}`); fail++; }
  else { console.log(`PASS ${c.id}`); pass++; }
}
console.log(`\n${pass}/${pass+fail} gabarito-unified ok` + (fail ? `  (${fail} falha(s))` : ''));
process.exit(fail ? 1 : 0);
