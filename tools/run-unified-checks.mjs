// Roda a validacao obrigatoria do motor Unified apos qualquer mudanca no classificador.
//
// Substitui os antigos wrappers Python (`tools/run_classifier_evals.py`,
// `tests/test_classifier_golden.py`, `tests/test_classification_rules.py`), que nao
// continham logica propria: eram `subprocess.run(["node", ...])` sobre estes mesmos
// alvos. Este repo e 100% Unified/JS, entao a camada Python so adicionava uma
// dependencia (python/pytest no PATH) sem cobrir nada a mais — na verdade cobria
// MENOS: os testes unified-bm-charm-witness / unified-minor-charm-global /
// unified-owner-selection nunca eram chamados pelo pytest.
//
// O heap padrao do V8 (~4 GB) estoura ao classificar todas as fixtures pre-cutoff num
// unico processo (reconstrucao holy + deteccao de BM em 2 passes), entao cada alvo
// herda --max-old-space-size=8192 (era o papel do tests/conftest.py).
//
// Uso:
//   node tools/run-unified-checks.mjs           # tudo
//   node tools/run-unified-checks.mjs --gabarito   # so o gabarito curado
//   node tools/run-unified-checks.mjs --invariants # so a varredura de invariantes
//   node tools/run-unified-checks.mjs --tests      # so os tests/*.test.mjs
//   node tools/run-unified-checks.mjs --gabarito --match barrage

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HEAP = '--max-old-space-size=8192';

const WORKFLOW = {
  name: 'gabarito prioritario + invariantes mecanicas',
  args: ['tools/unified-validation-workflow.mjs', '--gabarito', '--invariants'],
  expect: 'sem violacao de invariante mecanico',
};

const GABARITO = {
  name: 'gabarito curado prioritario',
  args: ['tools/unified-validation-workflow.mjs', '--gabarito'],
  expect: 'gabarito-unified ok',
};

const INVARIANTS = {
  name: 'invariantes mecanicas (corpus completo, todos os regimes)',
  args: ['tools/unified-validation-workflow.mjs', '--invariants'],
  expect: 'sem violacao de invariante mecanico',
};

// Todo tests/*.test.mjs, descoberto do disco em vez de lista fixa — era assim que o
// pytest perdia testes novos silenciosamente.
function discoverTests() {
  return fs
    .readdirSync(path.join(ROOT, 'tests'))
    .filter(f => f.endsWith('.test.mjs'))
    .sort()
    .map(f => ({ name: `tests/${f}`, args: [`tests/${f}`] }));
}

function run(target) {
  const res = spawnSync(process.execPath, [HEAP, ...target.args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  const out = (res.stdout || '') + (res.stderr || '');
  let ok = res.status === 0;
  if (ok && target.expect && !out.includes(target.expect)) {
    ok = false;
    console.error(`  esperava a marca "${target.expect}" na saida, nao encontrada`);
  }
  return { ok, out };
}

const args = process.argv.slice(2);
const validModes = new Set(['--gabarito', '--invariants', '--tests']);
const modes = new Set();
let match = null;

for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--match') {
    const value = args[++index];
    if (match !== null || !value || value.startsWith('--')) {
      console.error('Uso invalido: --match exige exatamente um substring.');
      process.exit(2);
    }
    match = value;
  } else if (validModes.has(arg)) {
    modes.add(arg.slice(2));
  } else {
    console.error(`Flag desconhecida: ${arg}`);
    process.exit(2);
  }
}

if (match !== null && modes.size !== 1) {
  console.error('Uso invalido: --match exige exatamente um modo: --gabarito, --invariants ou --tests.');
  process.exit(2);
}

const all = modes.size === 0;
const scoped = target => match === null ? target : { ...target, args: [...target.args, '--only', match] };

const targets = [];
if (all || (modes.has('gabarito') && modes.has('invariants'))) {
  targets.push(scoped(WORKFLOW));
} else if (modes.has('gabarito')) {
  targets.push(scoped(GABARITO));
} else if (modes.has('invariants')) {
  targets.push(scoped(INVARIANTS));
}
if (all || modes.has('tests')) {
  targets.push(...discoverTests().filter(target => match === null || target.name.includes(match)));
}

if (!targets.length) {
  console.error(`Nada a rodar${match === null ? '' : ` para o filtro: ${match}`}.`);
  process.exit(2);
}

let failed = 0;
for (const target of targets) {
  process.stdout.write(`▶ ${target.name}\n`);
  const { ok, out } = run(target);
  if (ok) {
    console.log(`  OK`);
  } else {
    failed += 1;
    console.error(`  FALHOU`);
    console.error(out.split('\n').map(l => `    ${l}`).join('\n'));
  }
}

console.log(`\n${targets.length - failed}/${targets.length} alvos OK`);
process.exit(failed ? 1 : 0);
