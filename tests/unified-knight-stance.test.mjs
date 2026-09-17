// Postura de knight (change model-knight-protector-stance).
//
// Tres estados dirigidos pelos casts do DONO do log, com casamento EXATO de
// `utamo tempo` e `utito tempo`. Protector = x0.85 pos-mitigacao E divisor da base de
// leech; Blood Rage e neutra nao mexem em nada; antes do primeiro cast o estado e
// `unknown` e o hit nao vota em taxa de leech nem serve de testemunha de charm.
//
// Os asserts abaixo vem da mecanica declarada, nao de rodar o motor e copiar a saida.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js']) {
  vm.runInContext(read(file), ctx, { filename: file });
}
const engine = ctx.UnifiedClassificationEngine;
const { knightStanceAtTs, knightStanceMultiplierAtTs, isKnightStanceKnownAt, postMultiplier } = ctx.UnifiedFormulas;
const { leechDamageBasis } = ctx.UnifiedSetupInference;

const cast = (ts, text) => ({ ts, text });
const setupOf = casts => engine.inferKnightStanceSetup({ playerCasts: casts });
const ctxOf = casts => ({ stanceSetup: setupOf(casts) });

// --- 1. maquina de estados -------------------------------------------------------------

{
  // De neutra/desconhecida, `utamo tempo` liga o Protector.
  const c = ctxOf([cast(100, 'utamo tempo')]);
  assert.equal(knightStanceAtTs(c, 101), 'protector');
}

{
  // Recast de `utamo tempo` DESLIGA o Protector e cai na neutra.
  const c = ctxOf([cast(100, 'utamo tempo'), cast(200, 'utamo tempo')]);
  assert.equal(knightStanceAtTs(c, 150), 'protector');
  assert.equal(knightStanceAtTs(c, 250), 'neutral');
}

{
  // `utito tempo` sempre leva a Blood Rage, saindo de qualquer estado.
  const c = ctxOf([cast(100, 'utamo tempo'), cast(200, 'utito tempo')]);
  assert.equal(knightStanceAtTs(c, 250), 'blood_rage');
}

{
  // `utamo tempo` saindo de Blood Rage liga o Protector (nao cai na neutra).
  const c = ctxOf([cast(100, 'utito tempo'), cast(200, 'utamo tempo')]);
  assert.equal(knightStanceAtTs(c, 250), 'protector');
}

// --- 2. fronteira de segundo -----------------------------------------------------------

{
  // A troca vale a partir do segundo SEGUINTE: o hit no mesmo segundo do cast pertence
  // a postura ANTIGA. Dentro de um segundo nao ha ordem observavel entre a fala do Local
  // Chat e a linha do Server Log.
  const c = ctxOf([cast(100, 'utamo tempo'), cast(200, 'utito tempo')]);
  assert.equal(knightStanceAtTs(c, 199), 'protector');
  assert.equal(knightStanceAtTs(c, 200), 'protector', 'o segundo do cast ainda e da postura antiga');
  assert.equal(knightStanceAtTs(c, 201), 'blood_rage');
}

{
  // Vale tambem para o PRIMEIRO cast: o segundo dele ainda e `unknown`.
  const c = ctxOf([cast(100, 'utamo tempo')]);
  assert.equal(knightStanceAtTs(c, 100), 'unknown');
  assert.equal(knightStanceAtTs(c, 101), 'protector');
}

// --- 3. postura desconhecida antes do primeiro cast -------------------------------------

{
  const c = ctxOf([cast(100, 'utito tempo')]);
  assert.equal(knightStanceAtTs(c, 50), 'unknown');
  assert.equal(knightStanceMultiplierAtTs(c, 50), 1, 'postura desconhecida nao aplica multiplicador');
}

// --- 4. incantacoes de paladino nao participam ------------------------------------------

{
  // `utamo tempo san` e `utito tempo san` sao spells de paladino. Casamento por substring
  // as pegaria e daria -15% de dano fantasma a um paladino.
  const setup = setupOf([cast(100, 'utamo tempo san'), cast(200, 'utito tempo san')]);
  assert.equal(setup.hasStanceCasts, false);
  assert.equal(knightStanceAtTs({ stanceSetup: setup }, 300), 'unknown');
  assert.equal(knightStanceMultiplierAtTs({ stanceSetup: setup }, 300), 1);
}

{
  // Sessao sem cast de postura nenhum: setup inerte.
  const setup = setupOf([cast(100, 'exori'), cast(200, 'exura ico')]);
  assert.equal(setup.hasStanceCasts, false);
  assert.equal(knightStanceMultiplierAtTs({ stanceSetup: setup }, 300), 1);
}

// --- 5. multiplicador por estado --------------------------------------------------------

{
  const c = ctxOf([cast(100, 'utamo tempo'), cast(300, 'utito tempo')]);
  assert.equal(knightStanceMultiplierAtTs(c, 200), 0.85, 'Protector reduz o dano causado em 15%');
  assert.equal(knightStanceMultiplierAtTs(c, 400), 1, 'Blood Rage nao e revertido');
}

// --- 6. os dois pontos da formula -------------------------------------------------------

{
  const c = ctxOf([cast(100, 'utamo tempo'), cast(300, 'utito tempo')]);
  const prot = { ts: 200, dmg: 850 };
  const rage = { ts: 400, dmg: 850 };

  // Protector entra em postMultiplier, junto de prey/grav san/bonus de classe.
  assert.equal(postMultiplier(prot, c), 0.85);
  assert.equal(postMultiplier(rage, c), 1);

  // E sai do divisor da base de leech: o leech e creditado sobre o dano de ANTES do -15%.
  assert.equal(leechDamageBasis(prot, c), 850 / 0.85);
  assert.equal(leechDamageBasis(rage, c), 850);
}

// --- 7. hit em postura desconhecida nao vira observacao-ouro de leech --------------------

{
  const stanceSetup = setupOf([cast(100, 'utamo tempo')]);
  const c = { stanceSetup };
  assert.equal(isKnightStanceKnownAt(c, 50), false, 'antes do primeiro cast, postura desconhecida');
  assert.equal(isKnightStanceKnownAt(c, 150), true);
  // Sessao sem postura nenhuma: nada e desconhecido, senao toda sessao do corpus perderia
  // suas observacoes-ouro.
  const inert = { stanceSetup: setupOf([cast(100, 'exori')]) };
  assert.equal(isKnightStanceKnownAt(inert, 50), true);
}

console.log('OK unified-knight-stance');
