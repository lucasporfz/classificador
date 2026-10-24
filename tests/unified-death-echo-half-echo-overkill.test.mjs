import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import { createUnifiedContext, splitSessions, pairSessions } from '../tools/unified-corpus.mjs';

// D-011c (fix-xp-attribution-across-mobs): golpe do blast do Death Echo marcado overkill cujo eco,
// no mesmo mob e estado, tem a metade exata (+-1) do dano mostrado nao e overkill. A marca sai ao
// fim da prova de estagio do mesmo cast. Os 57 golpes abaixo sao os de
// `reports/fix-xp-attribution-fase2/echo-list-HEAD.json`: [seq, dano do blast, dano do eco]. Saem
// do HEAD f4b1e7b, que nao tinha a regra: golpe marcado overkill no mesmo componente de um eco
// (rotulado pela prova de estagio do HEAD) do mesmo mob e estado com a metade exata do dano
// mostrado. A lista foi revista na Fase 2 e aprovada como esperado no gate da Fase 3; ela usa os
// rotulos do HEAD e nao o codigo desta change, que acha o eco pelo segundo do eco no parser.
// O parser (`parseServerFacts`) nao conhece a regra, entao todo golpe que ele marca e a
// classificacao desmarca saiu por ela; esse conjunto tem de ser exatamente a lista, menos os
// golpes que o parser ja nao marca (dano recebido antes da XP, D-011a: 14 dos 57).

const ROOT = process.cwd();
const EXPECTED = [
  ['dlc ms Server Log.txt', 'dlc ms Local Chat.txt', 0, [[1572, 1568, 785], [1760, 1184, 593], [2067, 1460, 731],
    [2403, 2765, 1383], [4403, 1001, 500], [4701, 2765, 1383], [5057, 1460, 731], [5136, 1468, 733], [5696, 1001, 500],
    [6233, 1468, 733], [6534, 1601, 801], [6878, 1176, 588]]],
  ['dlc ms Server Log.txt', 'dlc ms Local Chat.txt', 1, [[2082, 1014, 507], [2135, 1596, 797], [3102, 1758, 880],
    [3656, 2023, 1012], [4664, 1601, 801], [4900, 1159, 580], [5569, 1191, 596], [6201, 1591, 795]]],
  ['italian Server Log.txt', 'italian Local Chat.txt', 0, [[6720, 901, 451]]],
  ['kim server log.txt', 'kim local chat.txt', 0, [[462, 1002, 501], [2280, 1070, 535], [2537, 889, 444], [3928, 1032, 516],
    [4249, 1011, 505], [4786, 948, 473], [6100, 1662, 831], [6445, 1011, 505]]],
  ['ms devoted Server Log.txt', 'ms devoted Local Chat.txt', 0, [[340, 1349, 674], [545, 1099, 550], [888, 2851, 1426],
    [1290, 1321, 660], [1976, 1114, 556], [3099, 1371, 685], [3827, 1334, 666], [4760, 1354, 677], [6313, 1371, 685],
    [8506, 1334, 666]]],
  ['ms devoted Server Log.txt', 'ms devoted Local Chat.txt', 1, [[128, 1114, 556], [686, 1099, 550], [822, 1432, 715],
    [921, 1114, 556], [1113, 1114, 556], [1501, 1122, 561], [1832, 1349, 674], [2381, 1321, 660], [2581, 1357, 679],
    [2639, 1099, 550], [2871, 1414, 706], [3404, 1340, 669], [4890, 2534, 1267], [5085, 1403, 702], [6565, 1349, 674],
    [6885, 1357, 679], [8157, 1118, 559], [8598, 3061, 1531]]],
  // As outras 6 sessoes das 8 fixtures em que o dono lanca `exevo mort ora`: nenhum golpe sai.
  ['alumnishocks server log.txt', 'alumnishocks localchat.txt', 0, []],
  ['alumnishocks 2 server log.txt', 'alumnishocks 2 localchat.txt', 0, []],
  ['aquatic Server Log.txt', 'aquatic Local Chat.txt', 0, []],
  ['aquatic Server Log.txt', 'aquatic Local Chat.txt', 1, []],
  ['aquatic Server Log.txt', 'aquatic Local Chat.txt', 2, []],
  ['death echo server log.txt', 'death echo local chat.txt', 0, []],
];
// "A XP caiu entre o blast e o eco" sozinho nao desmarca: `alumnishocks 2` S0 18:21:52, o
// `wardragon 68 OK` (seq 293) tem XP logo depois, e o wardragon do segundo do eco e o `93 OK`, que
// nao e a metade de 68.
const KEEPS_MARK = [['alumnishocks 2 server log.txt', 0, 293, 68]];

const engine = createUnifiedContext(ROOT);
const read = name => fs.readFileSync(path.join(ROOT, 'logs', name), 'utf8');
function classifySession(server, local, index) {
  const pair = pairSessions(splitSessions(read(server)), splitSessions(read(local)))[index];
  assert.ok(pair, `sessao ausente: ${server} S${index}`);
  const parsed = engine.UnifiedParsing.parseServerFacts(pair.sv.text);
  const result = engine.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
    mobModsPre: engine.MOB_ELEMENT_MODS, mobModsPost: engine.MOB_ELEMENT_MODS_POST_2026_06_16,
    strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
  });
  assert.ok(result && !result.error, `sessao nao classificou: ${server} S${index}`);
  return { parsed, result };
}
function finalHits(result) {
  const bySeq = new Map();
  for (const turn of result.turns || []) {
    for (const h of [...(turn.hits || []), ...(turn.components || []).flatMap(c => c.hits || [])]) {
      if (!h.virtual && h.seq != null) bySeq.set(h.seq, h);
    }
  }
  return bySeq;
}

let msDevotedS1 = null;
for (const [server, local, index, blasts] of EXPECTED) {
  test(`D-011c: ${server} S${index} desmarca exatamente ${blasts.length} golpe(s) do blast com eco na metade exata`, () => {
    const { parsed, result } = classifySession(server, local, index);
    if (server.startsWith('ms devoted') && index === 1) msDevotedS1 = result;
    const parsedBySeq = new Map(parsed.hits.map(h => [h.seq, h]));
    const final = finalHits(result);
    for (const [seq, dmg] of blasts) {
      const h = parsedBySeq.get(seq);
      assert.ok(h && h.dmg === dmg, `seq ${seq}: esperado golpe de ${dmg}; got ${h && h.dmg}`);
      assert.ok(final.has(seq), `seq ${seq} fora dos turnos`);
      assert.equal(final.get(seq).overkill, false, `seq ${seq}: blast com eco na metade exata`);
    }
    const unmarked = [];
    for (const [seq, h] of final) {
      const p = parsedBySeq.get(seq);
      if (p && p.overkill && h.overkill === false) unmarked.push(seq);
    }
    const byThisRule = blasts.map(b => b[0]).filter(seq => parsedBySeq.get(seq).overkill);
    assert.equal(unmarked.sort((a, b) => a - b).join(','), byThisRule.sort((a, b) => a - b).join(','));
    for (const [keepServer, keepIndex, seq, dmg] of KEEPS_MARK) {
      if (keepServer !== server || keepIndex !== index) continue;
      assert.equal(parsedBySeq.get(seq).dmg, dmg);
      assert.equal(final.get(seq).overkill, true, `seq ${seq}: sem eco na metade exata, continua overkill`);
    }
  });
}

// ms devoted S1 03:06:25: o `templar 1349` (seq 1832) perde a marca DEPOIS da prova de estagio, e
// o rotulo 2/1 (`zealot 1424` e `templar 1349` no blast, `templar 674` no eco) vem da prova.
test('D-011c: ms devoted S1 03:06:25 fica A0 + Death Echo 3, blast 2 / eco 1, com o 1349 sem overkill', () => {
  const result = msDevotedS1 || classifySession('ms devoted Server Log.txt', 'ms devoted Local Chat.txt', 1).result;
  const turn = (result.turns || []).find(t => t.clock === '03:06:25');
  assert.ok(turn, 'turno 03:06:25 ausente');
  const spell = (turn.components || []).find(c => c.comp === 'spell');
  assert.ok(spell && String(spell.actionLabel || '').includes('Death Echo'), `spell: ${spell && spell.actionLabel}`);
  assert.equal((turn.components || []).filter(c => c.comp !== 'spell').reduce((n, c) => n + (c.hits || []).length, 0), 0);
  const label = h => `${h.mob} ${h.dmg} ${h.multiStageStage || '-'}`;
  assert.equal(spell.hits.map(label).sort().join(' | '), [
    'devoted radiant templar 1349 primary', 'devoted radiant templar 674 echo', 'devoted radiant zealot 1424 primary',
  ].sort().join(' | '));
  assert.equal(spell.hits.find(h => h.seq === 1832).overkill, false);
});
