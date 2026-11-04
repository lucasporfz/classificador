import assert from 'node:assert/strict';
import { analyzeIndex, lookupRule, refreshIndex } from '../tools/rule-index.mjs';

const doc = (aLine, extra = '') => [
  '<!-- rule-index:start -->',
  '| ID | Tema | Seção | Linha |',
  '|---|---|---|---|',
  `| A-001 | Tema A | [S](#s) | ${aLine} |`,
  '| B-002a | Tema B | [S](#s) | 11, 13 |',
  '<!-- rule-index:end -->',
  '',
  '## S',
  '',
  '**A-001 — tema A.** Texto que cita **B-002a** sem definir.',
  '**B-002a:** primeira.',
  'continuação da primeira',
  '- **B-002a (emenda):** segunda.',
  '',
  '### Outra',
  extra,
].join('\n');

// Em dia.
{
  const r = analyzeIndex(doc(10));
  assert.deepEqual([r.stale, r.undefinedRows, r.missingRows], [[], [], []]);
  assert.equal(r.rowCount, 2);
}

// Linha velha: detectada e corrigida sem mexer no resto da linha.
{
  const text = doc(99);
  assert.deepEqual(analyzeIndex(text).stale.map(s => [s.id, s.listed, s.wanted]), [['A-001', '99', '10']]);
  const { text: fixed, moved } = refreshIndex(text);
  assert.equal(moved, 1);
  assert.equal(fixed, doc(10));
  assert.equal(refreshIndex(fixed).moved, 0);
}

// Linha do índice sem definição e definição sem linha no índice.
{
  const r = analyzeIndex(doc(10).replace('**A-001 — tema A.** Texto', 'Texto'));
  assert.deepEqual(r.undefinedRows, ['A-001']);
  assert.deepEqual(analyzeIndex(doc(10, '**C-003 — nova.** Texto')).missingRows, ['C-003']);
}

// H-005a a H-005d apontam para a definição de H-005.
{
  const text = [
    '<!-- rule-index:start -->', '| H-005 | t | s | 5 |', '| H-005a | t | s | 5 |', '<!-- rule-index:end -->',
    '**H-005 — bloco.** a, b.',
  ].join('\n');
  assert.deepEqual(analyzeIndex(text).undefinedRows, []);
  assert.deepEqual(analyzeIndex(text).stale, []);
}

// Consulta: texto até a próxima definição ou título, em cada definição.
{
  const { known, text } = lookupRule(doc(10), 'B-002a');
  assert.equal(known, true);
  assert.match(text, /\| B-002a \| Tema B/);
  assert.match(text, /primeira\.\ncontinuação da primeira/);
  assert.match(text, /segunda\./);
  assert.doesNotMatch(text, /### Outra/);
  assert.equal(lookupRule(doc(10), 'Z-999').known, false);
}

console.log('rule index: OK');
