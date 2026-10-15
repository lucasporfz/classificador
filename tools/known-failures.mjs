// Falhas conhecidas do `run-unified-checks` e comparação com uma rodada.
//
// O critério da validação é "não piorar": as mesmas falhas de antes, nenhuma nova. Comparar
// por ALVO não basta, porque o alvo do gabarito + invariantes já falha no baseline
// (`bakradrone 09:57:20`), e uma falha nova de gabarito dentro dele ficava invisível. Aqui a
// comparação é por ASSINATURA de caso:
//   - gabarito/invariantes: cada linha `FAIL <caso>: ...`;
//   - tests/*.test.mjs: cada subteste `✖ <nome>`;
//   - alvo que falha sem nenhuma das duas marcas: `<alvo> (falha sem caso identificado)`.
// Uma entrada de `tools/known-failures.json` casa uma assinatura por PREFIXO, então pode fixar
// só o começo estável da linha (o `got ...` varia).

import fs from 'node:fs';
import path from 'node:path';

const FAIL_LINE = /^\s*FAIL (.+?)\s*$/;
const TEST_FAIL_LINE = /^\s*✖ (.+?) \(\d+(?:\.\d+)?ms\)\s*$/;
const ERROR_LINE = /^\s*(\w*Error(?: \[[A-Z_]+\])?): (.+?)\s*$/;
const CRASH_LINE = /^\s*FATAL ERROR: (.+?)\s*$/;

// Assinaturas, nesta ordem:
//   - crash do processo (`FATAL ERROR`, ex.: heap): sempre listado, mesmo com casos `FAIL`
//     antes dele, porque o que vinha depois nunca rodou;
//   - casos `FAIL` e subtestes `✖`;
//   - sem nenhum dos dois (script de teste sem node:test): a primeira linha de erro.
export function failureSignatures(targetName, output, ok) {
  if (ok) return [];
  const signatures = new Set();
  let firstError = null;
  for (const line of String(output || '').split(/\r?\n/)) {
    const crash = CRASH_LINE.exec(line);
    if (crash) { signatures.add(`${targetName} FATAL ERROR: ${crash[1]}`); continue; }
    const fail = FAIL_LINE.exec(line);
    if (fail) { signatures.add(`FAIL ${fail[1]}`); continue; }
    const testFail = TEST_FAIL_LINE.exec(line);
    if (testFail) { signatures.add(`${targetName} ✖ ${testFail[1]}`); continue; }
    const error = ERROR_LINE.exec(line);
    if (error && !firstError) firstError = `${targetName} ${error[1]}: ${error[2]}`;
  }
  if (!signatures.size) signatures.add(firstError || `${targetName} (falha sem caso identificado)`);
  return [...signatures];
}

export function loadKnownFailures(root) {
  const file = path.join(root, 'tools', 'known-failures.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// `ran`: nomes dos alvos que rodaram. `complete`: a rodada cobriu cada alvo inteiro (sem
// `--match`); só então uma conhecida que não apareceu conta como "sumiu".
export function compareFailures({ signaturesByTarget, known, ran, complete }) {
  const isKnown = signature => known.find(entry => signature.startsWith(entry.signature)) || null;
  const fresh = [];
  const stillKnown = [];
  for (const [target, signatures] of signaturesByTarget) {
    for (const signature of signatures) {
      const entry = isKnown(signature);
      if (entry) stillKnown.push({ target, signature, entry });
      else fresh.push({ target, signature });
    }
  }
  const seen = new Set(stillKnown.map(item => item.entry));
  const gone = complete
    ? known.filter(entry => ran.has(entry.target) && !seen.has(entry))
    : [];
  return { fresh, stillKnown, gone };
}
