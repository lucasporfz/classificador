// M-042 — deteccao por sessao da ESCADA de Combat Mastery no canal de testemunha de charm,
// e o que ela faz com as tres leituras que consomem esse canal.
//
// Combat Mastery e perk de roda, exclusivo de knight, que soma dano conforme a vida
// FALTANTE do alvo (+1% a cada 14/12/10% faltante; dobrado com arma de duas maos). Ele
// responde ao MESMO gatilho do perk omega (M-039) e por isso o detector de omega o
// confundia: omega e BINARIO (dois niveis, razao x1,06) e Combat Mastery e GRADUADO
// (varios niveis espacados de um degrau). O discriminador e a FORMA da escada.
//
// Os niveis citados vem do LOG BRUTO (contados aqui a partir dos procs de charm) e os
// valores previstos da FORMULA de M-036 recomputada a partir da tabela de mobs — nunca da
// saida do motor.
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js']) {
  vm.runInContext(read(file), ctx, { filename: file });
}
const engine = ctx.UnifiedClassificationEngine;
const F = ctx.UnifiedFormulas;
const { effectiveMod, mitigationMultiplier, getMobMods, combatMasteryCeiling, COMBAT_MASTERY_MAX_STEPS } = F;

const BM_PIERCE = 0.04; // C-012: a unica hipotese positiva de pierce de Battle Momentum.

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) { pass++; console.error(`  ok   ${name}`); } else { fail++; console.error(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); } };

function singleSession(serverFile, localFile) {
  const facts = engine.parseServerFacts(read(serverFile));
  const local = engine.parseLocalChat(read(localFile), { serverFacts: facts });
  const context = {
    sessionDateKey: facts.sessionDateKey,
    mobModsPre: ctx.MOB_ELEMENT_MODS || null,
    mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
    useFloat16Mitigation: true,
    bmPierce: 0,
    gravSanSetup: engine.inferGravSanSetup(facts, local, {}),
    stanceSetup: engine.inferKnightStanceSetup(local),
  };
  context.combatMasteryLadder = engine.inferCombatMasteryLadder(facts, context);
  context.bestiaryClassBonus = engine.inferBestiaryClassDamageBonus(facts, context);
  return { facts, local, context };
}

// ------------------------------------------------ 1) `picture`: escada de 1%, sem omega
const picture = singleSession('logs/picture server log.txt', 'logs/picture local chat.txt');

{
  const ladder = picture.context.combatMasteryLadder;
  check('picture: escada de Combat Mastery detectada', !!(ladder && ladder.active));
  check('picture: degrau de 1% (escudo, nao arma de duas maos)', !!(ladder && ladder.step === 0.01));
  check('picture: teto derivado = x1,09', !!(ladder && Math.abs(ladder.ceiling - combatMasteryCeiling(0.01)) < 1e-12));

  // Evidencia do log: `sabretooth | wound charm` em Blood Rage exibe 927, 936, 954 e 973,
  // cada um com >=3 procs. Eles caem na grade de 1% a partir de 927 em n = 0, 1, 3 e 5.
  const OBSERVED = [927, 936, 954, 973];
  for (const [i, value] of OBSERVED.entries()) {
    const n = [0, 1, 3, 5][i];
    check(`picture: ${value} e o degrau n=${n} da grade de 1% a partir de 927`,
      Math.abs(value - 927 * (1 + 0.01 * n)) <= F.COMBAT_MASTERY_LEVEL_TOLERANCE);
  }
  check('picture: o span 973/927 cabe no teto de 1%',
    973 / 927 <= combatMasteryCeiling(0.01));

  // A linha que prova a escada e essa, e ela e mesmo a testemunha que hoje crava o omega.
  const row = (ladder.rows || []).find(r => r.mob === 'sabretooth' && r.charm === 'wound' && r.ladder);
  check('picture: a linha de sabretooth/wound e reconhecida como escada', !!row);
  check('picture: a linha de escada tem os quatro niveis do log',
    !!row && OBSERVED.every(v => (row.levels || []).includes(v)));
}

{
  const omega = engine.inferOmegaPerk(picture.facts, picture.context);
  check('picture: omega INATIVO', !(omega && omega.active));
  check('picture: o motivo nomeia a escada de Combat Mastery',
    !!(omega && /combat_mastery/.test(omega.source || '')));
}

{
  // Sem a regra do teto, a postura sozinha infere `mammal +3,0%` — medido em 07/Set/2026.
  const b = picture.context.bestiaryClassBonus;
  check('picture: nenhum bonus de classe e inferido', !!(b && b.bonus === 0 && b.class == null));
  const perClass = (b && b.perClass) || [];
  for (const cls of ['mammal', 'reptile', 'giant']) {
    const entry = perClass.find(p => p.class === cls);
    check(`picture: classe ${cls} fica sem bonus POR PROVA (teto abaixo da grade)`,
      !!entry && entry.verdict === 'no_bonus_proved');
  }

  // Nao-regressao dura: `bmPierce` diferente de 0 mudaria TODA reversao holy/fisica da
  // sessao. O valor final vem da classificacao, nao so do atalho por charm — por isso o
  // assert le a sessao classificada, e nao aceita disjuncao.
  const bm = engine.inferBmPierceFromCharmDamage(picture.facts, picture.context);
  check('picture: C-012a nao acusa BM', !!(bm && bm.pierce !== BM_PIERCE), `pierce=${bm && bm.pierce}`);
  const classified = engine.classifyUnified(
    read('logs/picture server log.txt'), read('logs/picture local chat.txt'),
    { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true },
  );
  check('picture: bmPierce da sessao classificada e 0', classified.bmPierce === 0);
  check('picture: a sessao classificada nao ganhou bonus de classe', classified.bestiaryClassDamageBonus.bonus === 0);
}

// ------------------------------------------------ 2) `crypt`: dois niveis, omega intacto
{
  const crypt = singleSession('logs/Crypt Server Log.txt', 'logs/Crypt Local Chat.txt');
  const ladder = crypt.context.combatMasteryLadder;
  check('crypt: NENHUMA escada detectada', !(ladder && ladder.active));

  // `cyclursus | zap` tem exatamente dois niveis (659 x124 e 699 x35): duas populacoes
  // nao formam escada, e a razao 1,0607 e a assinatura binaria do omega.
  check('crypt: 699/659 esta a x1,06 do ancorado', Math.abs(699 / 659 - 1.06) <= 0.002);

  // `crypt mage | freeze` tem TRES niveis (665, 705, 1098), mas o 1098 esta a 1,6511 —
  // fora de toda grade e de todo teto. Contaminacao, nao degrau.
  check('crypt: 1098/665 estoura o maior teto de Combat Mastery',
    1098 / 665 > combatMasteryCeiling(0.02));

  const omega = engine.inferOmegaPerk(crypt.facts, crypt.context);
  check('crypt: omega continua ATIVO', !!(omega && omega.active));
  check('crypt: multiplicador continua 1,06', !!(omega && omega.multiplier === 1.06));
}

// ------------------------------------------------ 3) `tom` / `tom 2`: escada de 2%
for (const label of ['tom', 'tom 2']) {
  const s = singleSession(`logs/${label} server log.txt`, `logs/${label} local chat.txt`);
  const ladder = s.context.combatMasteryLadder;
  check(`${label}: escada detectada`, !!(ladder && ladder.active));
  check(`${label}: degrau de 2% (arma de duas maos)`, !!(ladder && ladder.step === 0.02));
  const omega = engine.inferOmegaPerk(s.facts, s.context);
  check(`${label}: omega continua inativo`, !(omega && omega.active));
  check(`${label}: nenhum bonus de classe inferido`, s.context.bestiaryClassBonus.bonus === 0);

  // O NUMERO final nao muda (era 0 antes), mas o MOTIVO passa a ser correto: a classe
  // `human` nao fica "inconclusiva", ela ABSTEM porque o teto da unica linha
  // (`overpower charm`, que nunca fecha a formula) e largo demais e deixa toda a grade
  // sobreviver. Sem este assert, o alvo 6 nao testa nada que esta change fez.
  const b = s.context.bestiaryClassBonus;
  check(`${label}: o veredito vem da regra do teto sob escada`, b.source === 'charm_ceiling_under_ladder');
  const human = (b.perClass || []).find(p => p.class === 'human');
  check(`${label}: a classe human ABSTEM (nao "sem bonus provado")`, !!human && human.verdict === 'ambiguous');
  check(`${label}: toda a grade sobrevive ao teto de human`,
    !!human && human.surviving.length === F.BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES.length);
  check(`${label}: o teto de human esta acima de 1,4 (a linha nunca fecha a formula)`,
    !!human && human.ceilings.every(c => c > 1.4));
}

// ------------------------------------------------ casos sinteticos (via do teto superior)
const MODS = { 'test drone': { hitpoints: 10000, physicalDmgMod: 1.0, holyDmgMod: 1.0, iceDmgMod: 1.0, mitigation: 3, bestiaryClass: 'TestClass' } };
const synthCtx = () => ({ mobModsPost: MODS, sessionDateKey: 20260701, gravSanSetup: { bonus: 0, windows: [] }, useFloat16Mitigation: true });
const synthLevel = () => {
  const m = MODS['test drone'];
  return Math.floor(m.hitpoints * 0.05 * mitigationMultiplier(m, { useFloat16Mitigation: true }) * effectiveMod(m.iceDmgMod, 0));
};
const proc = (dmg, ts) => ({ kind: 'charm', mob: 'test drone', dmg, ts: ts || 1000, rawLine: `A test drone loses ${dmg} hitpoints due to your attack. (freeze charm)` });
const repeat = (n, f) => Array.from({ length: n }, (_, i) => f(i));

// 4) Escada de 1% SEM nada acima do teto => omega nao confirmado.
{
  const base = synthLevel();
  const evs = [
    ...repeat(4, i => proc(base, 1000 + i)),
    ...repeat(4, i => proc(Math.round(base * 1.03), 2000 + i)),
    ...repeat(4, i => proc(Math.round(base * 1.06), 3000 + i)),
  ];
  const c = synthCtx();
  c.combatMasteryLadder = engine.inferCombatMasteryLadder({ events: evs }, c);
  check('sintetico: tres niveis em grade de 1% formam escada', !!(c.combatMasteryLadder && c.combatMasteryLadder.active));
  const r = engine.inferOmegaPerk({ events: evs }, c);
  check('sintetico: x1,06 dentro da escada NAO confirma omega', !(r && r.active));
}

// 5) Escada de 1% MAIS um nivel acima do teto, na grade estendida (1 + 0,01n) x 1,06.
{
  const base = synthLevel();
  const above = Math.round(base * 1.06 * 1.06); // = (1 + 0,01x6) x 1,06 = x1,1236 > x1,09
  check('sintetico: o nivel de prova esta acima do teto de 1%', above / base > combatMasteryCeiling(0.01));
  const evs = [
    ...repeat(4, i => proc(base, 1000 + i)),
    ...repeat(4, i => proc(Math.round(base * 1.03), 2000 + i)),
    ...repeat(4, i => proc(Math.round(base * 1.06), 3000 + i)),
    ...repeat(4, i => proc(above, 4000 + i)),
  ];
  const c = synthCtx();
  c.combatMasteryLadder = engine.inferCombatMasteryLadder({ events: evs }, c);
  const r = engine.inferOmegaPerk({ events: evs }, c);
  check('sintetico: nivel acima do teto na grade estendida CONFIRMA omega', !!(r && r.active));
}

// 6) Nivel fora das duas grades (a forma do 1098 de `crypt`) nao confirma nada.
{
  const base = synthLevel();
  const evs = [
    ...repeat(4, i => proc(base, 1000 + i)),
    ...repeat(4, i => proc(Math.round(base * 1.03), 2000 + i)),
    ...repeat(4, i => proc(Math.round(base * 1.06), 3000 + i)),
    ...repeat(4, i => proc(Math.round(base * 1.65), 4000 + i)),
  ];
  const c = synthCtx();
  c.combatMasteryLadder = engine.inferCombatMasteryLadder({ events: evs }, c);
  check('sintetico: o nivel a x1,65 NAO desqualifica a linha como escada',
    !!(c.combatMasteryLadder && c.combatMasteryLadder.active));
  const r = engine.inferOmegaPerk({ events: evs }, c);
  check('sintetico: nivel a x1,65 nao confirma omega', !(r && r.active));
}

// 6b) ...e ele tambem nao IMPEDE outra linha da mesma sessao de confirmar. Segunda metade
//     da regra ("nao cai em nenhuma das duas grades ... e nao impede que outra linha da
//     mesma sessao confirme"), com um segundo mob que exibe o nivel acima do teto.
{
  const base = synthLevel();
  const above = Math.round(base * 1.06 * 1.06);
  const MODS2 = Object.assign({}, MODS, { 'other drone': MODS['test drone'] });
  const c = { mobModsPost: MODS2, sessionDateKey: 20260701, gravSanSetup: { bonus: 0, windows: [] }, useFloat16Mitigation: true };
  const proc2 = (mob, dmg, ts) => ({ kind: 'charm', mob, dmg, ts, rawLine: `A ${mob} loses ${dmg} hitpoints due to your attack. (freeze charm)` });
  const evs = [
    // linha 1: escada limpa + contaminacao a x1,65 (nao confirma nada)
    ...repeat(4, i => proc2('test drone', base, 1000 + i)),
    ...repeat(4, i => proc2('test drone', Math.round(base * 1.03), 2000 + i)),
    ...repeat(4, i => proc2('test drone', Math.round(base * 1.06), 3000 + i)),
    ...repeat(4, i => proc2('test drone', Math.round(base * 1.65), 4000 + i)),
    // linha 2: escada + nivel acima do teto na grade estendida (confirma omega)
    ...repeat(4, i => proc2('other drone', base, 5000 + i)),
    ...repeat(4, i => proc2('other drone', Math.round(base * 1.03), 6000 + i)),
    ...repeat(4, i => proc2('other drone', Math.round(base * 1.06), 7000 + i)),
    ...repeat(4, i => proc2('other drone', above, 8000 + i)),
  ];
  c.combatMasteryLadder = engine.inferCombatMasteryLadder({ events: evs }, c);
  const r = engine.inferOmegaPerk({ events: evs }, c);
  check('sintetico: a contaminacao de uma linha nao impede a outra de confirmar omega', !!(r && r.active));
}

// 7) Bonus de classe REAL sob escada continua detectavel: a linha que exibe o degrau zero
//    poe o teto exatamente num ponto da grade e so ele sobrevive.
{
  const base = synthLevel();
  const boosted = Math.round(base * 1.02);
  const evs = [
    ...repeat(4, i => proc(boosted, 1000 + i)),
    ...repeat(4, i => proc(Math.round(boosted * 1.03), 2000 + i)),
    ...repeat(4, i => proc(Math.round(boosted * 1.05), 3000 + i)),
  ];
  const c = synthCtx();
  c.combatMasteryLadder = engine.inferCombatMasteryLadder({ events: evs }, c);
  check('sintetico: a escada e detectada mesmo com bonus de classe por cima', !!(c.combatMasteryLadder && c.combatMasteryLadder.active));
  const b = engine.inferBestiaryClassDamageBonus({ events: evs }, c);
  check('sintetico: bonus de classe de +2% e cravado pelo teto', b && b.bonus === 0.02);
}

console.error(`\n${pass} ok, ${fail} FAIL`);
if (fail) process.exit(1);
