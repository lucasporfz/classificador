import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

import { splitSessions, pairSessions } from '../tools/unified-corpus.mjs';

const context = {
  console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  Math,
  JSON,
  Array,
  Object,
  Number,
  String,
  Map,
  Set,
  isFinite,
  isNaN,
  parseInt,
  parseFloat,
  Date,
  Float32Array,
  Int32Array,
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
for (const file of ['js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const parse = text => context.UnifiedParsing.parseServerFacts(text);

{
  const facts = parse([
    '12:00:00 A rat loses 100 hitpoints due to your attack.',
    '12:00:00 You were healed for 10 hitpoints.',
    '12:00:00 You gained 3 mana.',
    '12:00:01 You gained 20 experience points.',
  ].join('\n'));
  assert.equal(facts.hits.length, 1);
  assert.equal(facts.hits[0].overkill, true,
    'XP contíguo através apenas de life/mana leech deve preservar overkill');
}

{
  const facts = parse([
    '12:01:00 A rat loses 100 hitpoints due to your attack.',
    '12:01:00 You gained 3 mana.',
    '12:01:00 Using one of 99 ultimate spirit potions...',
    '12:01:00 You gained 200 mana.',
    '12:01:01 You lose 50 hitpoints due to an attack by a rat.',
    '12:01:01 You gained 20 experience points.',
  ].join('\n'));
  assert.equal(facts.hits.length, 1);
  assert.equal(facts.hits[0].overkill, false,
    'poção/dano recebido entre hit e XP deve bloquear a autoria do XP');
}

{
  const facts = parse([
    '12:02:00 A rat loses 10 hitpoints due to your attack. (wound charm)',
    '12:02:01 You gained 20 experience points.',
  ].join('\n'));
  const charm = facts.events.find(event => event.kind === 'charm');
  assert.ok(charm);
  assert.equal(charm.killedTarget, true,
    'XP contíguo deve preservar kill por charm');
}

{
  const facts = parse([
    '12:02:10 A rat loses 10 hitpoints due to your attack. (wound charm)',
    '12:02:10 One or more primal pods have spawned.',
    '12:02:10 You gained 20 experience points.',
  ].join('\n'));
  const charm = facts.events.find(event => event.kind === 'charm');
  assert.ok(charm);
  assert.equal(charm.killedTarget, true,
    'notificação de estado do mundo não pode apagar kill por charm');
}

{
  const facts = parse([
    '12:03:00 A rat loses 10 hitpoints due to your attack. (wound charm)',
    '12:03:00 Using one of 99 ultimate spirit potions...',
    '12:03:01 You lose 50 hitpoints due to an attack by a rat.',
    '12:03:01 You gained 20 experience points.',
  ].join('\n'));
  const charm = facts.events.find(event => event.kind === 'charm');
  assert.ok(charm);
  assert.equal(charm.killedTarget, false,
    'linha incompatível entre charm e XP deve bloquear killedTarget');
}


// D-011a: a XP depois do overpower em skirmisher não pertence ao chastener.
{
  const facts = parse(fs.readFileSync('logs/tom 2 server log.txt', 'utf8'));
  const hit = facts.hits.find(h => h.seq === 6103);
  const charm = facts.events.find(e => e.seq === 6106);
  assert.equal(hit.mob, 'raubritter chastener');
  assert.equal(hit.dmg, 1260);
  assert.equal(charm.mob, 'raubritter skirmisher');
  assert.equal(charm.killedTarget, true, 'kill legítimo do charm continua comprovado');
  assert.equal(hit.overkill, false, 'tom 2 13:04:16: XP de outro mob não prova overkill');
}

// Reflection com o mesmo nome mantém a transparência vigente; outro mob interrompe hit -> XP.
// Charm seguido de XP (fix-tom3-bounty-mana-and-aa-evidence, D3, emenda de D-011a): o charm
// entra antes do hit do ataque que o disparou, então a XP é do charm que matou, com qualquer
// nome de mob, e o hit anterior não é overkill (tom 3 10:00:15: skirmisher 837 -> overpower 4
// em outro skirmisher -> XP).
for (const suffix of ['(wound charm)', '(damage reflection)']) {
  for (const mob of ['rat', 'cave rat']) {
    const facts = parse([
      '12:04:00 A rat loses 100 hitpoints due to your attack.',
      `12:04:00 A ${mob} loses 10 hitpoints due to your attack. ${suffix}`,
      '12:04:00 You gained 20 experience points.',
    ].join('\n'));
    const isCharm = suffix.includes('charm');
    assert.equal(facts.hits[0].overkill, isCharm ? false : mob === 'rat', `${suffix} em ${mob}: autoria da XP`);
    if (isCharm) assert.equal(facts.events.find(e => e.kind === 'charm').killedTarget, true, 'charm seguido de XP matou');
  }
}

// Field é reconhecido pela regra pública: uso de runa, referência com leech e
// três ocorrências do nível baixo. Nada é injetado no vetor interno de eventos.
const fieldReference = [
  '12:05:00 Using one of 99 fire bomb runes...',
  '12:05:01 A rat loses 1000 hitpoints due to your attack.',
  '12:05:01 You were healed for 100 hitpoints.',
  '12:05:02 A cave rat loses 10 hitpoints due to your attack.',
  '12:05:03 A cave rat loses 10 hitpoints due to your attack.',
];
for (const suffix of ['', ' (wound charm)']) {
  for (const mob of ['rat', 'cave rat']) {
    const facts = parse([...fieldReference,
      `12:05:04 A rat loses 100 hitpoints due to your attack.${suffix}`,
      `12:05:04 A ${mob} loses 10 hitpoints due to your attack.`,
      '12:05:04 You gained 20 experience points.',
    ].join('\n'));
    const candidate = facts.events.find(e => e.clock === '12:05:04' && e.dmg === 100);
    assert.ok(facts.events.some(e => e.clock === '12:05:04' && e.kind === 'field'), 'field reconhecido antes de testar XP');
    assert.equal(suffix ? candidate.killedTarget : candidate.overkill, mob === 'rat', 'field em outro mob bloqueia hit/charm -> XP');
  }
}

for (const suffix of ['', ' (wound charm)']) {
  const facts = parse([
    `12:06:00 A rat loses 100 hitpoints due to your attack.${suffix}`,
    '12:06:02 You gained 20 experience points.',
  ].join('\n'));
  assert.equal(suffix ? facts.events[0].killedTarget : facts.hits[0].overkill, false, 'XP depois de 1s não prova kill');
}

// D-011a, emenda de 24/Out/2026 (fix-xp-attribution-across-mobs): dano recebido entre o candidato
// e a XP rompe a autoria, com ou sem atacante nomeado, para hit -> XP e para charm -> XP.
for (const loss of ['You lose 50 hitpoints.', 'You lose 50 mana.', 'You lose 50 hitpoints due to an attack by a rat.']) {
  for (const suffix of ['', ' (wound charm)']) {
    const facts = parse([
      `12:07:00 A rat loses 100 hitpoints due to your attack.${suffix}`,
      `12:07:00 ${loss}`,
      '12:07:00 You gained 20 experience points.',
    ].join('\n'));
    assert.equal(suffix ? facts.events[0].killedTarget : facts.hits[0].overkill, false, `${loss} entre ${suffix ? 'charm' : 'hit'} e XP`);
  }
}

// Logs reais, por sessão (os `seq` são os da sessão, como na classificação).
const sessionFacts = (server, local, index) => {
  const read = name => fs.readFileSync(`logs/${name}`, 'utf8');
  const pair = pairSessions(splitSessions(read(server)), splitSessions(read(local)))[index];
  assert.ok(pair, `sessao ausente: ${server} S${index}`);
  return parse(pair.sv.text);
};
const eventAt = (facts, seq) => facts.events.find(e => e.seq === seq);

// `mazzerinbarrage` S4 23:25:45: `darklight striker 2404` (crítico), `You lose 572 hitpoints.` e XP.
{
  const hit = eventAt(sessionFacts('mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', 4), 5875);
  assert.equal(hit.mob, 'darklight striker');
  assert.equal(hit.dmg, 2404);
  assert.equal(hit.overkill, false, 'mazzerinbarrage S4 seq 5875: dano recebido sem atacante antes da XP');
}

// `hakka` S11 22:03:38 (enflame charm) e S15 22:17:35 (curse charm): dano recebido antes da XP, o
// charm não matou.
{
  const hakka = index => sessionFacts('Hakka Server Log.txt', 'Hakka Local Chat.txt', index);
  for (const [index, seq, mob, dmg] of [[11, 314, 'rootthing nutshell', 758], [15, 655, 'rootthing bug tracker', 639]]) {
    const charm = eventAt(hakka(index), seq);
    assert.equal(charm.kind, 'charm');
    assert.equal(charm.mob, mob);
    assert.equal(charm.dmg, dmg);
    assert.equal(charm.killedTarget, false, `hakka S${index} seq ${seq}: dano recebido entre o charm e a XP`);
  }
}

// `picture` S0 (sem data, party): reflection em mob de outro nome antes da XP (D-011a/D-011b, emenda
// de 24/Out/2026). Os 13 golpes ficam sem overkill.
{
  const facts = sessionFacts('picture server log.txt', 'picture local chat.txt', 0);
  const expected = [[1037, 252], [578, 1179], [997, 1634], [1393, 1050], [1649, 650], [2226, 1699], [2476, 2041],
    [2679, 1138], [2815, 555], [3149, 1122], [3239, 1410], [3509, 453], [4485, 1332]];
  for (const [seq, dmg] of expected) {
    const hit = eventAt(facts, seq);
    assert.equal(hit.dmg, dmg, `picture seq ${seq}`);
    assert.equal(hit.overkill, false, `picture seq ${seq}: reflection em outro mob antes da XP`);
  }
}
console.log('unified overkill XP continuity: OK');
