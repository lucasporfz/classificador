// S-004c — a folga cross-state de omega e ULTIMO RECURSO por turno.
//
// Turnos-prova, todos em `crypt` (sessao unica, o unico fixture do corpus com omega):
//
//   07:32:06  residuo de 1 ponto no par misto (cyclursus 761/808, O={764} vs O={765,766})
//             -> resolve pela folga, e carrega o sinal dela
//   07:54:02  antes: unresolved com 31 hits
//             -> resolve como AA 10 | Divine Caldera 12 | Divine Grenade 9, devolvendo a
//                granada do cast 07:54:00 ao turno em que ela explode (c+2)
//   07:54:04  antes: AA 8 | Divine Barrage 1 | Divine Grenade 9
//             -> AA 9 | Divine Barrage 9: some o `Divine Barrage` de 1 hit a 464, que e
//                dano de AA (a mediana de AA da sessao e 572), e a granada vai para 07:54:02
//   07:53:57, 07:54:06, 07:54:08, 07:54:10  vizinhos que ja resolviam
//             -> IDENTICOS, e sem o sinal da folga
//
// Diagnostico completo: reports/crypt-omega-1-nivel.md
import assert from 'node:assert/strict';
import test from 'node:test';

import { UnifiedCorpus } from '../tools/unified-corpus.mjs';

const corpus = new UnifiedCorpus({ persistentCacheDir: 'reports/unified-cache', warn: () => {} });

let cached = null;
function crypt() {
  if (cached) return cached;
  const pairs = corpus.sessionsFor('Crypt Server Log.txt', 'Crypt Local Chat.txt');
  assert.ok(pairs && pairs.length === 1, 'crypt e sessao unica (sem cabecalho)');
  const result = corpus.classify('Crypt Server Log.txt', 'Crypt Local Chat.txt', pairs[0], { profile: 'gabarito' });
  assert.ok(result && (result.turns || []).length === 832, 'crypt tem 832 turnos');
  cached = result;
  return cached;
}

const turnAt = clock => (crypt().turns || []).find(t => t.clock === clock);
const shape = turn => (turn.components || [])
  .map(c => `${c.comp}:${c.actionLabel || '-'}:${(c.hits || []).length}`)
  .join(' | ');

test('S-004c: a folga destrava a familia de 1 ponto de `crypt`', () => {
  const unresolved = (crypt().turns || []).filter(t => t.status !== 'resolved');
  assert.equal(unresolved.length, 1,
    `crypt sai de 118 para 1 turno sem classificacao (sobrou: ${unresolved.map(t => t.clock).join(' ')})`);
  assert.equal(unresolved[0].clock, '07:52:37', 'o unico resto conhecido e 07:52:37 (pendencia declarada)');
});

test('S-004c: 07:32:06 resolve pela folga e carrega o sinal', () => {
  const turn = turnAt('07:32:06');
  assert.ok(turn, 'turno existe');
  assert.equal(turn.status, 'resolved');
  assert.equal(turn.omegaCrossStateToleranceUsed, 1, 'o turno declara que usou a folga de 1 ponto');
});

test('S-004c: a granada volta para o turno em que explode (07:54:02 / 07:54:04)', () => {
  const cast = turnAt('07:54:02');
  const next = turnAt('07:54:04');
  assert.ok(cast && next, 'os dois turnos existem');
  assert.equal(cast.status, 'resolved', '07:54:02 deixa de ser unresolved');
  assert.equal(shape(cast),
    'arrow:Auto ataque:10 | spell:Divine Caldera (exevo mas san):12 | grenade:Divine Grenade (exevo tempo mas san):9');
  assert.equal(shape(next),
    'arrow:Auto ataque:9 | spell:Divine Barrage (exori dir san):9',
    '07:54:04 perde o Divine Barrage de 1 hit e devolve a granada');
});

test('S-004c: os vizinhos que ja resolviam ficam identicos e sem a folga', () => {
  const expected = {
    '07:53:57': 'arrow:Auto ataque:5 | spell:Divine Barrage (exori dir san):5',
    '07:54:06': 'arrow:Auto ataque:9 | spell:Divine Caldera (exevo mas san):11',
    '07:54:08': 'arrow:Auto ataque:7 | spell:Divine Barrage (exori dir san):7',
    '07:54:10': 'arrow:Auto ataque:8 | spell:Divine Caldera (exevo mas san):8',
  };
  for (const [clock, sig] of Object.entries(expected)) {
    const turn = turnAt(clock);
    assert.ok(turn, `turno ${clock} existe`);
    assert.equal(shape(turn), sig, `${clock} continua identico ao baseline`);
    assert.ok(!turn.omegaCrossStateToleranceUsed, `${clock} resolve estrito, sem a folga`);
  }
});

test('S-004c: a folga so aparece em turno que a avaliacao estrita nao resolvia', () => {
  const used = (crypt().turns || []).filter(t => t.omegaCrossStateToleranceUsed);
  assert.equal(used.length, 117, '117 dos 118 turnos antes sem classificacao passam pela folga');
  for (const turn of used) assert.equal(turn.status, 'resolved', 'a folga so e adotada quando resolve');
});
