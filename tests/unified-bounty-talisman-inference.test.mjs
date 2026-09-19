import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ctx = {
  console: silent,
  Math,
  JSON,
  Array,
  Object,
  Number,
  String,
  Map,
  Set,
  Date,
  isFinite,
  isNaN,
  parseInt,
  parseFloat,
  Float32Array,
  Int32Array,
};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  'js/mob-element-mods.js',
  'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-session-context.js', 'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
  'js/unified-turn-resolution.js',
  'js/unified-classification-engine.js',
]) {
  vm.runInContext(read(file), ctx, { filename: file });
}

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Sept: 8, Oct: 9, Nov: 10, Dec: 11,
};
function splitSessions(text) {
  const sessions = [];
  let current = null;
  for (const line of text.replace(/^ï»¿/, '').split(/\r?\n/)) {
    const match = line.match(HEADER_RE);
    if (match) {
      if (current) {
        current.text = current.lines.join('\n');
        sessions.push(current);
      }
      const [, month, day, time, year] = match;
      const [hour, minute, second] = time.split(':').map(Number);
      current = {
        year: +year,
        month: MONTHS[month],
        day: +day,
        saveSec: hour * 3600 + minute * 60 + second,
        dateKey: +year * 10000 + (MONTHS[month] + 1) * 100 + (+day),
        lines: [line],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) {
    current.text = current.lines.join('\n');
    sessions.push(current);
  }
  return sessions;
}

function matchingLocalSession(server, localSessions) {
  return localSessions
    .filter(local => local.dateKey === server.dateKey)
    .sort((a, b) => Math.abs(a.saveSec - server.saveSec) - Math.abs(b.saveSec - server.saveSec))[0];
}

const formulas = ctx.UnifiedFormulas;
const parse = text => ctx.UnifiedParsing.parseServerFacts(text);
const engine = ctx.UnifiedClassificationEngine;

assert.equal(formulas.bountyTalismanBonusForLevel(0), 0.025);
assert.equal(formulas.bountyTalismanBonusForLevel(14), 0.095);
assert.equal(formulas.bountyTalismanBonusForLevel(15), 0.1);
assert.equal(formulas.bountyTalismanBonusForLevel(16), 0.1025);
assert.equal(formulas.bountyTalismanBonusForLevel(25), 0.125);
assert.equal(formulas.bountyTalismanBonusForLevel(26), 0.1275);
assert.equal(formulas.bountyTalismanBonusForLevel(27), 0.13);

{
  const facts = parse([
    '12:00:00 A rat loses 100 hitpoints due to your attack. (active prey bonus)',
    '12:00:01 A rat loses 100 hitpoints due to your attack. (Bounty Talisman Effect: More Damage Dealt)',
    '12:00:02 A rat loses 100 hitpoints due to your attack.',
    '12:00:03 A rat loses 100 hitpoints due to your attack. (active prey bonus, Bounty Talisman Effect: More Damage Dealt)',
  ].join('\n'));
  assert.deepEqual(
    Array.from(facts.hits, hit => [hit.isPrey, hit.bountyTalisman]),
    [[true, false], [false, true], [false, false], [true, true]],
    'Prey e Bounty devem permanecer fatos observados independentes',
  );
}

const serverSessions = splitSessions(read('logs/uhax 3 server log ed.txt'));
const localSessions = splitSessions(read('logs/uhax 3 local chat ed.txt'));
const session1 = serverSessions.find(session => session.dateKey === 20260703);
assert.ok(session1, 'uhax 3 S1 de 03/Jul/2026 deve existir');
const local1 = matchingLocalSession(session1, localSessions);
assert.ok(local1, 'local chat correspondente a uhax 3 S1 deve existir');

const options = {
  mobModsPre: ctx.MOB_ELEMENT_MODS,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
  strictLeech: true,
  maxOriginal: 6000,
  useFloat16Mitigation: true,
};
const result1 = engine.classifyUnified(session1.text, local1.text, options);
assert.ok(!result1.error, 'uhax 3 S1 deve classificar sem erro: ' + (result1.error || ''));
assert.equal(result1.leechSetup.lifeBase, 0.31);
assert.equal(result1.leechSetup.manaBase, 0.17);
// D-021/D-021a: o que este caso fixa e que `walking pillar` NAO tem Vampiric Embrace — o
// mob marcado por Bounty nao pode ser convertido em minor charm falso. A assercao anterior
// exigia `vampiricMob === null`, ou seja, que NENHUM mob tivesse o charm; isso era mais
// forte que a intencao declarada na propria mensagem e codificava um bug de inferencia:
// `darklight matter` tem Vampiric Embrace +3,2% nas duas sessoes deste log, e S1 so nao o
// detectava por ter poucos turnos ouro (ver change infer-minor-charm-in-low-gold-turn-sessions).
assert.notEqual(result1.leechSetup.vampiricMob || null, 'walking pillar', 'walking pillar nao tem Vampiric Embrace');
assert.equal(result1.leechSetup.vampiricMob || null, 'darklight matter', 'darklight matter tem Vampiric Embrace');
assert.equal(result1.leechSetup.vampiricBonus, 0.032);
assert.equal(result1.leechSetup.voidsMob, 'darklight striker');
assert.equal(result1.leechSetup.voidsBonus, 0.016);
assert.equal(result1.bountyTalismanSetup.damage.level, 26);
assert.equal(result1.bountyTalismanSetup.damage.bonus, 0.1275);
assert.equal(result1.bountyTalismanSetup.damage.source, 'comparable_charm_damage');
// D-010g exige unanimidade também no fallback por componentes congelados. Até 14/Sep/2026
// este teste exigia `fallbackConfirmation.level === 26`, mas o fallback do uhax 3 S1 dá
// 26 com 9 encaixes e 3 contradições (ex.: Terra Wave `13:35:28`) — o nível só "vencia"
// por ter menos contradições, que a regra proíbe. A troca desta asserção foi decidida pelo
// usuário na change `infer-drone-bounty-talisman`; o Damage 26 continua cravado pela
// testemunha de charm (asserções acima e abaixo).
{
  const fallback = result1.bountyTalismanSetup.damage.fallbackConfirmation;
  assert.ok(fallback, 'o fallback continua avaliado como confirmação diagnóstica');
  if (fallback.confidence !== 'unknown') {
    assert.equal(fallback.contradictions, 0, 'fallback só é aceito com unanimidade: ' + JSON.stringify(fallback));
    assert.equal(fallback.level, 26);
  }
}
assert.equal(result1.bountyTalismanSetup.life.level, 15);
assert.equal(result1.bountyTalismanSetup.life.bonus, 0.1);

const clock = ts => [
  Math.floor(ts / 3600) % 24,
  Math.floor((ts % 3600) / 60),
  ts % 60,
].map(value => String(value).padStart(2, '0')).join(':');
const target = (result1.turns || []).find(turn => clock(turn.ts) === '13:34:21');
assert.ok(target, 'turno 13:34:21 deve existir');
const counts = Object.fromEntries(['arrow', 'spell', 'rune', 'grenade'].map(comp => [
  comp,
  (target.components || [])
    .filter(component => component.comp === comp)
    .reduce((sum, component) => sum + (component.hits || []).length, 0),
]));
assert.deepEqual(counts, { arrow: 0, spell: 0, rune: 12, grenade: 0 });
assert.equal(
  result1.goldLeechObservationTurns.includes('13:34:21'),
  false,
  'o alvo com cardinalidade virtual ainda pendente não pode criar evidência para o próprio setup',
);
const targetRune = target.components.find(component => component.comp === 'rune');
assert.equal(targetRune.hits.filter(hit => !hit.virtual).length, 11);
assert.equal(targetRune.hits.filter(hit => hit.virtual).length, 1);

const poisonPairs = result1.bountyTalismanSetup.damage.witnesses || [];
for (const [plain, bounty] of [[2089, 2355], [2161, 2436]]) {
  assert.ok(
    poisonPairs.some(witness => witness.controlDamage === plain && witness.affectedDamage === bounty),
    `par de Poison Charm ${plain}->${bounty} deve votar no nível de dano`,
  );
  const supports = level => formulas
    .inversePostMultiplierIntervals(bounty, 1 + formulas.bountyTalismanBonusForLevel(level))
    .some(([lo, hi]) => plain >= lo && plain <= hi);
  assert.equal(supports(25), false, `nível 25 não pode reproduzir ${plain}->${bounty}`);
  assert.equal(supports(26), true, `nível 26 deve reproduzir ${plain}->${bounty}`);
  assert.equal(supports(27), false, `nível 27 não pode reproduzir ${plain}->${bounty}`);
}

const unitAaEvidence = [
  [155, 47],
  [246, 75],
  [136, 42],
  [218, 66],
];
const expectedBountyLife = (damage, level) => Math.ceil(
  (damage / 1.1275) * 0.31 * (1 + formulas.bountyTalismanBonusForLevel(level)),
);
assert.deepEqual(unitAaEvidence.map(([damage]) => expectedBountyLife(damage, 14)), [47, 75, 41, 66]);
assert.deepEqual(unitAaEvidence.map(([damage]) => expectedBountyLife(damage, 15)), [47, 75, 42, 66]);
assert.deepEqual(unitAaEvidence.map(([damage]) => expectedBountyLife(damage, 16)), [47, 75, 42, 67]);
assert.deepEqual(unitAaEvidence.map(([, observed]) => observed), [47, 75, 42, 66]);

const ewAa = (result1.turns || []).find(turn => clock(turn.ts) === '13:36:13');
const ewAaHit = ewAa.components.find(component => component.comp === 'arrow').hits[0];
assert.equal(ewAaHit.exposeWeakness, true);
assert.equal(ewAaHit.manaLeech, 24);
assert.equal(Math.ceil((155 / 1.1275) * 0.19), 27);

const terra = (result1.turns || []).find(turn => clock(turn.ts) === '13:39:15');
assert.ok(terra, 'turno Terra Wave 13:39:15 deve existir');
const terraComponent = terra.components.find(component =>
  String(component.actionLabel || '').includes('Terra Wave'),
);
assert.ok(terraComponent, 'Terra Wave 13:39:15 deve estar classificado');
assert.equal(terraComponent.hits.filter(hit => !hit.virtual).length, 7);
assert.ok(
  terraComponent.hits.some(hit => hit.bountyTalisman && hit.dmg === 1598
    && hit.lifeLeech === 111 && hit.manaLeech === 56),
  'Terra Wave misto deve preservar o witness marcado 1598/L111/M56',
);

const session0 = serverSessions.find(session => session.dateKey === 20260630);
assert.ok(session0, 'uhax 3 S0 de 30/Jun/2026 deve existir');
const local0 = matchingLocalSession(session0, localSessions);
const result0 = engine.classifyUnified(session0.text, local0.text, options);
assert.ok(!result0.error, 'uhax 3 S0 deve classificar sem erro: ' + (result0.error || ''));
assert.equal(result0.bountyTalismanSetup.damage.confidence, 'unknown');
assert.equal(result0.bountyTalismanSetup.life.confidence, 'unknown');

// M-036/C-012a: repetição da mesma linha holy mede o valor com precisão, mas não
// separa bonus de classe de BM. `drone ingol` só tem liodile|holy para humanoid;
// sem uma linha fire/ice/death/earth/energy da classe, o perk precisa abster.
const droneIngol = engine.classifyUnified(
  read('logs/drone ingol Server Log.txt'),
  read('logs/drone ingol Local Chat.txt'),
  options,
);
assert.ok(!droneIngol.error, 'drone ingol deve classificar sem erro: ' + (droneIngol.error || ''));
assert.equal(droneIngol.bestiaryClassDamageBonus.class, null);
assert.equal(droneIngol.bestiaryClassDamageBonus.bonus, 0);
assert.notEqual(
  droneIngol.bestiaryClassDamageBonus.source,
  'confirmed_by_charm_damage',
  'uma unica linha holy nao pode confirmar perk de classe confundido com BM',
);
// D-010g (fallback): o único charm do boar man é overpower, então o dano sai dos
// componentes holy congelados. Só o valor modal repetido dos marcados vota, e a
// comparação marcado x controle (mobs distintos) aceita o resíduo de 1 ponto de S-004a:
// nível 25 fecha todos os componentes; 24 e 26 são contraditos. Com o dano conhecido,
// a vida cai no nível 5 pela inferência conjunta de D-022b.
const ingolDamage = droneIngol.bountyTalismanSetup.damage;
assert.equal(ingolDamage.source, 'frozen_deterministic_component_original');
assert.equal(ingolDamage.level, 25);
assert.equal(ingolDamage.contradictions, 0);
assert.ok(ingolDamage.evidenceCount >= 20, 'nível 25 precisa de evidência de vários casts');
const ingolRanked = new Map(ingolDamage.ranked.map(row => [row.level, row]));
assert.ok(ingolRanked.get(24).contradictions > 0, 'nível 24 precisa ser contradito');
assert.ok(ingolRanked.get(26).contradictions > 0, 'nível 26 precisa ser contradito');
assert.equal(droneIngol.bountyTalismanSetup.life.level, 5);
assert.equal(droneIngol.bountyTalismanSetup.life.bonus, 0.05);

console.log('OK: Bounty Talisman separado de Prey e inferido por sessao em dano/Life');
