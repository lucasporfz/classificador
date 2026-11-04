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
// herda um teto de heap maior (ver HEAP abaixo).
//
// Uso:
//   node tools/run-unified-checks.mjs           # tudo
//   node tools/run-unified-checks.mjs --gabarito   # so o gabarito curado
//   node tools/run-unified-checks.mjs --invariants # so a varredura de invariantes
//   node tools/run-unified-checks.mjs --tests      # so os tests/*.test.mjs
//   node tools/run-unified-checks.mjs --gabarito --match barrage
//   node tools/run-unified-checks.mjs --engine-dir <pasta> [outros flags]
//     valida OUTRO motor sem tocar em js/: <pasta>/js sobrepõe o js/ numa cópia do repo em
//     reports/engine-dir-root/ (ex.: pasta de `audit-tolerance-residuals.mjs --dump-sources`).
//
// No fim, cada falha e comparada com tools/known-failures.json por assinatura de caso
// (ver tools/known-failures.mjs). Saida: 0 = nada falhou; 1 = so falhas conhecidas;
// 3 = alguma falha NOVA; 2 = uso invalido.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFailures, failureSignatures, loadKnownFailures } from './known-failures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// O gabarito + invariantes com cache frio passa de 8 GB (OOM medido em 07/Out/2026). O flag
// passado ao filho vence o NODE_OPTIONS, entao o teto e ajustavel aqui: UNIFIED_CHECKS_HEAP_MB.
const HEAP = `--max-old-space-size=${process.env.UNIFIED_CHECKS_HEAP_MB || 14336}`;

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

const RULE_INDEX = {
  name: 'indice de regras',
  args: ['tools/rule-index.mjs', '--check'],
  expect: 'indice de regras em dia',
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

// Cópia do que os alvos leem, com o js/ da variante por cima. Fica dentro de reports/ para o
// node ainda achar o node_modules do repo; é refeita a cada chamada, e o cache de
// classificação não vem junto porque a chave depende do motor.
const ENGINE_ROOT_ITEMS = ['app', 'css', 'docs', 'js', 'logs', 'scripts', 'tests', 'tools', 'index.html', 'package.json'];

function runWithEngineDir(engineDir, forwarded) {
  const source = path.resolve(engineDir, 'js');
  if (!fs.existsSync(path.join(source, 'unified-classification-engine.js'))) {
    console.error(`Uso invalido: ${source} nao tem o motor (unified-classification-engine.js).`);
    process.exit(2);
  }
  const root = path.join(ROOT, 'reports', 'engine-dir-root');
  fs.rmSync(root, { recursive: true, force: true });
  for (const item of ENGINE_ROOT_ITEMS) fs.cpSync(path.join(ROOT, item), path.join(root, item), { recursive: true });
  fs.cpSync(source, path.join(root, 'js'), { recursive: true });
  console.log(`Motor de ${source}, em ${root}`);
  const res = spawnSync(process.execPath, ['tools/run-unified-checks.mjs', ...forwarded], { cwd: root, stdio: 'inherit' });
  process.exit(res.status ?? 3);
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
const engineFlag = args.indexOf('--engine-dir');
if (engineFlag >= 0) {
  const [, engineDir] = args.splice(engineFlag, 2);
  if (!engineDir || engineDir.startsWith('--')) {
    console.error('Uso invalido: --engine-dir exige uma pasta.');
    process.exit(2);
  }
  runWithEngineDir(engineDir, args);
}
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
  targets.push(...[RULE_INDEX, ...discoverTests()].filter(target => match === null || target.name.includes(match)));
}

if (!targets.length) {
  console.error(`Nada a rodar${match === null ? '' : ` para o filtro: ${match}`}.`);
  process.exit(2);
}

let failed = 0;
const signaturesByTarget = new Map();
for (const target of targets) {
  process.stdout.write(`▶ ${target.name}\n`);
  const { ok, out } = run(target);
  const signatures = failureSignatures(target.name, out, ok);
  if (signatures.length) signaturesByTarget.set(target.name, signatures);
  if (ok) {
    console.log(`  OK`);
  } else {
    failed += 1;
    console.error(`  FALHOU`);
    console.error(out.split('\n').map(l => `    ${l}`).join('\n'));
  }
}

console.log(`\n${targets.length - failed}/${targets.length} alvos OK`);

const { fresh, stillKnown, gone } = compareFailures({
  signaturesByTarget,
  known: loadKnownFailures(ROOT),
  ran: new Set(targets.map(target => target.name)),
  complete: match === null,
});
console.log(`Falhas conhecidas presentes: ${stillKnown.length}`);
console.log(`FALHAS NOVAS: ${fresh.length}`);
for (const item of fresh) console.log(`  - ${item.signature}`);
if (gone.length) {
  console.log(`CONHECIDAS QUE SUMIRAM: ${gone.length} (atualizar tools/known-failures.json)`);
  for (const entry of gone) console.log(`  - ${entry.signature}`);
}
process.exit(fresh.length ? 3 : failed ? 1 : 0);
