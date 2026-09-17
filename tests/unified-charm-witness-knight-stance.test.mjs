// M-041 (emendada) — a POSTURA do knight e parte do estado do proc de dano de charm.
//
// O Protector reduz o dano causado em 15% e essa reducao alcanca o dano de charm (medido
// em `picture`: razao charm Protector/neutra = 0,850). Logo a postura e estado observado
// do proc, exatamente como Expose Weakness e `active elemental amplification` ja sao, e as
// tres leituras que consomem o canal (M-036 classe de bestiario, M-039 omega, C-012a
// pierce de BM) precisam agrupar por ela e descontar o 0,85 do valor previsto.
//
// Todos os valores esperados abaixo vem da FORMULA de M-036 recomputada aqui a partir da
// tabela de mobs (`hitpoints x 0,05 x mitigacao x effectiveMod(mod, pierce) x postura`),
// nunca da saida do motor.
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
const { effectiveMod, mitigationMultiplier, getMobMods, KNIGHT_PROTECTOR_MULTIPLIER } = F;

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.error(`  ok   ${name}`); } else { fail++; console.error(`  FAIL ${name}`); } };

// `picture` e `tom` nao tem cabecalho `Channel ... saved`: sessao unica, sem data.
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
  return { facts, local, context };
}

// Nivel previsto por M-036 para um proc, com a postura ja descontada.
function m036Level(mob, elementKey, context, stance) {
  const mods = getMobMods(mob, context);
  const stanceMult = stance === 'protector' ? KNIGHT_PROTECTOR_MULTIPLIER : 1;
  return mods.hitpoints * 0.05 * mitigationMultiplier(mods, context) * effectiveMod(+mods[elementKey], 0) * stanceMult;
}

// ---------------------------------------------------------------- picture S0
const picture = singleSession('logs/picture server log.txt', 'logs/picture local chat.txt');

check('picture: a sessao tem linha do tempo de postura', !!(picture.context.stanceSetup && picture.context.stanceSetup.hasStanceCasts));

// 1) A formula com o 0,85 do Protector preve os niveis observados em Protector.
//    Evidencia (log bruto): gorerilla/freeze observa 728, hulking prehemoth/divine wrath
//    observa 971 e gore horn/enflame observa 928, todos com >=3 procs em Protector.
for (const [mob, key, stance, observed] of [
  ['gorerilla', 'iceDmgMod', 'protector', 728],
  ['hulking prehemoth', 'holyDmgMod', 'protector', 971],
  ['gore horn', 'fireDmgMod', 'protector', 928],
  ['sabretooth', 'physicalDmgMod', 'blood_rage', 927],
]) {
  const level = m036Level(mob, key, picture.context, stance);
  check(`picture: M-036 com postura preve ~${observed} para ${mob} em ${stance} (${level.toFixed(1)})`,
    Math.abs(level - observed) <= 1);
}

// 2) O previsto do Protector e exatamente 0,85 do previsto fora dele.
{
  const neutral = m036Level('gorerilla', 'iceDmgMod', picture.context, 'neutral');
  const protector = m036Level('gorerilla', 'iceDmgMod', picture.context, 'protector');
  check('picture: previsto do Protector = 0,85 do previsto neutro',
    Math.abs(protector - neutral * KNIGHT_PROTECTOR_MULTIPLIER) < 1e-9);
}

// 3) O detector de omega precisa AGRUPAR por postura: com a postura na chave, o mesmo
//    `sabretooth` aparece em DUAS linhas (Protector observa 819, Blood Rage observa 927+),
//    e nenhuma delas mistura as duas populacoes.
{
  const r = engine.inferOmegaPerk(picture.facts, picture.context);
  const rows = (r && r.rows) || [];
  const sabre = rows.filter(x => x.mob === 'sabretooth');
  check('picture: sabretooth vira DUAS linhas-testemunha (uma por postura)', sabre.length === 2);
  check('picture: existe linha de sabretooth em Protector com previsto ~787,9',
    sabre.some(x => x.stance === 'protector' && Math.abs(x.expected - 787.9) <= 1));
  check('picture: existe linha de sabretooth fora do Protector com previsto ~926,9',
    sabre.some(x => x.stance !== 'protector' && Math.abs(x.expected - 926.9) <= 1));
  check('picture: nenhuma linha mistura o nivel 819 (Protector) com o 927 (Blood Rage)',
    !sabre.some(x => (x.levels || []).some(L => L.value === 819) && (x.levels || []).some(L => L.value === 927)));

  // As linhas de Protector passam a ANCORAR, o que nao acontecia sem o desconto.
  const anchored = rows.filter(x => x.stance === 'protector' && x.baseLevel != null);
  check('picture: pelo menos 3 linhas de Protector ancoram na formula', anchored.length >= 3);
}

// 4) `M-036` e `C-012a` tambem agrupam por postura.
{
  const bestiary = engine.inferBestiaryClassDamageBonus(picture.facts, picture.context);
  const rows = (bestiary && bestiary.rows) || [];
  check('picture: as linhas de M-036 carregam a postura', rows.length > 0 && rows.every(r => typeof r.stance === 'string'));
  check('picture: M-036 tem linha de gorerilla em Protector com previsto ~728,1',
    rows.some(r => r.mob === 'gorerilla' && r.stance === 'protector' && Math.abs(r.expected - 728.1) <= 1));

  const bm = engine.inferBmPierceFromCharmDamage(picture.facts, picture.context);
  const bmRows = (bm && bm.rows) || [];
  check('picture: as linhas de C-012a carregam a postura', bmRows.length > 0 && bmRows.every(r => typeof r.stance === 'string'));
}

// ---------------------------------------------------------------- nao-regressao
// `crypt` nao tem cast de postura: as chaves e os previstos ficam identicos.
{
  const facts = engine.parseServerFacts(read('logs/Crypt Server Log.txt'));
  const local = engine.parseLocalChat(read('logs/Crypt Local Chat.txt'), { serverFacts: facts });
  const context = {
    sessionDateKey: facts.sessionDateKey,
    mobModsPre: ctx.MOB_ELEMENT_MODS || null,
    mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
    useFloat16Mitigation: true, bmPierce: 0,
    gravSanSetup: engine.inferGravSanSetup(facts, local, {}),
    stanceSetup: engine.inferKnightStanceSetup(local),
  };
  check('crypt: sessao sem cast de postura', !(context.stanceSetup && context.stanceSetup.hasStanceCasts));
  const r = engine.inferOmegaPerk(facts, context);
  check('crypt: omega continua ativo', !!(r && r.active));
  // Os tres niveis previstos por M-036 continuam os mesmos (nenhum multiplicador entra).
  for (const [mob, key, base] of [['roaming dread', 'deathDmgMod', 818], ['crypt mage', 'iceDmgMod', 665], ['cyclursus', 'energyDmgMod', 659]]) {
    const level = m036Level(mob, key, context, 'unknown');
    check(`crypt: previsto de ${mob} inalterado (~${base})`, Math.abs(level - base) <= Math.max(2, level * 0.0125));
  }
}

console.error(`\n${pass} ok, ${fail} FAIL`);
if (fail) process.exit(1);
