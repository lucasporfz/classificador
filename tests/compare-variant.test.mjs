import assert from 'node:assert/strict';
import { classifySwap, compareDumps, compareSetupKey } from '../tools/compare-variant.mjs';

const turn = (ts, status, sig, comps = []) => ({ ts, clock: `00:00:${ts}`, status, reason: null, sig: `${status}|${sig}`, comps });
const dump = (turns, setup = {}, setupValues = {}) => ({
  pair: 'p',
  sessions: [{ index: 0, date: '2026-07-01', error: null, setup, setupValues, turns }],
});
const pairs = d => new Map([['p', d]]);

// Controle: comparar uma medição com ela mesma não acha nada.
{
  const d = dump([turn(1, 'resolved', 'arrow:AA:h0.h1w')], { a: 'x' }, { a: '1' });
  const r = compareDumps(pairs(d), pairs(d));
  assert.equal(r.iguais, 1);
  assert.deepEqual(Object.values(r.turnos).map(x => x.length), [0, 0, 0, 0, 0, 0, 0]);
  assert.equal(r.setup.valor.length, 0);
}

// Trocado: partição, rótulo e só omega são coisas diferentes.
assert.equal(classifySwap('resolved|arrow:AA:h0.h1w', 'resolved|arrow:AA:h0.h1'), 'so_omega');
assert.equal(classifySwap('resolved|arrow:AA:h0.h1', 'resolved|arrow:AA:h0.h1w'), 'so_omega');
assert.equal(classifySwap('resolved|spell:Beam:h0', 'resolved|spell:Wave:h0'), 'rotulo');
assert.equal(classifySwap('resolved|arrow:AA:h0.h1', 'resolved|arrow:AA:h0'), 'particao');
assert.equal(classifySwap('resolved|arrow:AA:h0', 'resolved|spell:AA:h0'), 'particao');
// Rótulo com dois-pontos não pode confundir a leitura dos hits.
assert.equal(classifySwap('resolved|spell:a:b:h0', 'resolved|spell:a:b:h0w'), 'so_omega');
// Omega e partição juntos contam como partição.
assert.equal(classifySwap('resolved|arrow:AA:h0w.h1', 'resolved|arrow:AA:h0'), 'particao');

// Perdido, ganho, outro, sumido e novo.
{
  const a = dump([
    turn(1, 'resolved', 'arrow:AA:h0'),
    turn(2, 'unresolved', ''),
    turn(3, 'unresolved', 'x:y:h1'),
    turn(4, 'resolved', 'arrow:AA:h2'),
  ]);
  const b = dump([
    turn(1, 'unresolved', ''),
    turn(2, 'resolved', 'arrow:AA:h3'),
    turn(3, 'unresolved', 'x:y:h9'),
    turn(5, 'resolved', 'arrow:AA:h4'),
  ]);
  const { turnos: t } = compareDumps(pairs(a), pairs(b));
  assert.equal(t.perdido.length, 2, 'virou unresolved + sumiu');
  assert.match(t.perdido[1], /\(sumiu\)/);
  assert.equal(t.ganho.length, 1);
  assert.equal(t.outro.length, 1);
  assert.equal(t.novo.length, 1);
}

// Dois turnos no mesmo segundo são pareados pela ordem, não colapsados.
{
  const a = dump([turn(1, 'resolved', 'arrow:AA:h0'), turn(1, 'resolved', 'arrow:AA:h1')]);
  const b = dump([turn(1, 'resolved', 'arrow:AA:h0'), turn(1, 'resolved', 'arrow:AA:h1w')]);
  const r = compareDumps(pairs(a), pairs(b));
  assert.equal(r.iguais, 1);
  assert.equal(r.turnos.so_omega.length, 1);
}

// Setup por valor: hash diferente com os mesmos valores é só diagnóstico.
{
  const value = (life, count) => `{"lifeBase":${life},"manaBase":0.16,"lifeBaseKnown":true,"manaBaseKnown":true,"exposeWeaknessManaPerk":false,"evidenceCount":${count}}`;
  const a = dump([], { leechSetup: 'h1' }, { leechSetup: value(0.5, 10) });
  const same = dump([], { leechSetup: 'h2' }, { leechSetup: value(0.5, 11) });
  const moved = dump([], { leechSetup: 'h3' }, { leechSetup: value(0.51, 10) });
  const r1 = compareDumps(pairs(a), pairs(same));
  assert.equal(r1.setup.valor.length, 0);
  assert.deepEqual(r1.setup.soDiagnostico, { leechSetup: 1 });
  const r2 = compareDumps(pairs(a), pairs(moved));
  assert.equal(r2.setup.valor.length, 1);
  assert.match(r2.setup.valor[0], /lifeBase 0\.5 -> 0\.51/);
}

// `lifeBase` não pode casar `lifeBaseKnown`.
assert.deepEqual(
  compareSetupKey('leechSetup', '{"lifeBaseKnown":true,"lifeBase":0.5,', '{"lifeBaseKnown":false,"lifeBase":0.5,').changes,
  ['lifeBaseKnown true -> false'],
);

// Campo cortado pelo limite de 400 caracteres não vira "só diagnóstico" sem aviso.
{
  const long = `{"pad":"${'x'.repeat(400)}`;
  const { changes, cut } = compareSetupKey('critSetup', long, long);
  assert.deepEqual(changes, []);
  assert.deepEqual(cut, ['byComponent', 'fallback']);
  const short = '{"byComponent":{"physical":1.54},"fallback":1.6';
  assert.deepEqual(compareSetupKey('critSetup', short, short).cut, ['fallback']);
}

// Chave que a medição antiga não tinha não é mudança de valor.
{
  const r = compareDumps(pairs(dump([], {}, {})), pairs(dump([], { novo: 'h' }, { novo: '{"pierce":0}' })));
  assert.equal(r.setup.valor.length, 0);
  assert.deepEqual(r.setup.soUmLado, { novo: 1 });
}

// Mesmo erro nos dois lados não é diferença; erro novo é.
{
  const bad = e => ({ pair: 'p', sessions: [{ index: 0, date: 'd', error: e, setup: null, setupValues: null, turns: [] }] });
  assert.equal(compareDumps(pairs(bad('curto')), pairs(bad('curto'))).erros.length, 0);
  assert.equal(compareDumps(pairs(bad('curto')), pairs(bad('curto'))).mesmoErro, 1);
  assert.equal(compareDumps(pairs(bad(null)), pairs(bad('curto'))).erros.length, 1);
}

// Chave sem campos conhecidos compara o texto inteiro.
assert.equal(compareSetupKey('bmPierce', '0.04', '0.08').changes.length, 1);
assert.equal(compareSetupKey('bmPierce', '0.04', '0.04').changes.length, 0);

// Sessão ou par só de um lado é medição incompleta, não "igual".
{
  const a = new Map([['p', dump([])], ['q', { pair: 'q', sessions: [] }]]);
  const b = new Map([['p', { pair: 'p', sessions: [] }]]);
  const r = compareDumps(a, b);
  assert.equal(r.incompleto.length, 2);
}

console.log('compare variant: OK');
