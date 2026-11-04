// Índice de docs/CLASSIFICATION_RULES.md: confere, atualiza e consulta.
//
// A tabela entre os marcadores rule-index é navegação, não regra: a coluna Linha precisa
// apontar para a definição, senão quem lê só o trecho de uma regra cai no lugar errado.
//
// Uso:
//   node tools/rule-index.mjs --check     # 0 = em dia; 1 = linha velha, regra sem linha no índice etc.
//   node tools/rule-index.mjs --write     # atualiza só a coluna Linha
//   node tools/rule-index.mjs D-010i ...  # mostra a linha da tabela e o texto de cada definição

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs', 'CLASSIFICATION_RULES.md');

const ID = '[A-Z]-\\d+[a-z0-9-]*';
const ROW = new RegExp(`^\\| (${ID}) \\| (.*) \\| (\\d+(?:, ?\\d+)*) \\|$`);
// Definição: `**ID — tema**`, `**ID:** texto` ou `**ID (data)...`, no começo do parágrafo ou
// de um item de lista. Citação no meio do texto não é definição.
const DEFINITION = new RegExp(`^(?:[-*] |\\d+\\. |> )?\\*\\*(${ID})(?: —|:\\*\\*| \\()`);
// H-005a a H-005d são definidas dentro do bloco de H-005.
const inheritsFrom = id => (/^H-005[a-d]$/.test(id) ? 'H-005' : null);

function indexBounds(lines) {
  const start = lines.findIndex(l => l.includes('rule-index:start'));
  const end = lines.findIndex(l => l.includes('rule-index:end'));
  if (start < 0 || end < start) throw new Error('marcadores rule-index não encontrados');
  return { start, end };
}

// Linhas (base 1) onde cada ID é definido fora da tabela. Citações no corpo do texto contam
// só com a mesma forma em negrito usada pela definição, como sempre contou o índice.
function definitionLines(lines, end) {
  const byId = new Map();
  const add = (id, k) => { if (!byId.has(id)) byId.set(id, []); byId.get(id).push(k + 1); };
  lines.forEach((line, k) => {
    if (k <= end) return;
    for (const m of line.matchAll(new RegExp(`\\*\\*(${ID})(?: —|:\\*\\*| \\()`, 'g'))) add(m[1], k);
  });
  return byId;
}

function linesFor(id, byId) {
  return byId.get(id) || byId.get(inheritsFrom(id)) || [];
}

export function analyzeIndex(text) {
  const lines = text.split('\n');
  const { start, end } = indexBounds(lines);
  const byId = definitionLines(lines, end);
  const rows = new Map();
  const stale = [];
  const undefinedRows = [];
  for (let k = start; k < end; k++) {
    const m = ROW.exec(lines[k]);
    if (!m) continue;
    rows.set(m[1], k);
    const found = linesFor(m[1], byId);
    if (!found.length) { undefinedRows.push(m[1]); continue; }
    const wanted = found.join(', ');
    if (wanted !== m[3]) stale.push({ id: m[1], k, listed: m[3], wanted, head: m[2] });
  }
  const missingRows = [];
  lines.forEach((line, k) => {
    if (k <= end) return;
    const m = DEFINITION.exec(line);
    if (m && !rows.has(m[1]) && !missingRows.includes(m[1])) missingRows.push(m[1]);
  });
  return { lines, rowCount: rows.size, rows, stale, undefinedRows, missingRows, end, byId };
}

export function refreshIndex(text) {
  const { lines, stale } = analyzeIndex(text);
  for (const s of stale) lines[s.k] = `| ${s.id} | ${s.head} | ${s.wanted} |`;
  return { text: lines.join('\n'), moved: stale.length };
}

// Texto da definição: da linha dela até a próxima definição, o próximo título ou o fim.
export function lookupRule(text, id) {
  const { lines, rows, byId } = analyzeIndex(text);
  const out = [];
  if (rows.has(id)) out.push(lines[rows.get(id)]);
  for (const line of byId.get(id) || []) {
    let k = line;
    while (k < lines.length && !/^#{1,6} /.test(lines[k]) && !DEFINITION.test(lines[k])) k++;
    out.push(`\n--- linha ${line}\n${lines.slice(line - 1, k).join('\n').trimEnd()}`);
  }
  return { text: out.join('\n'), known: out.length > 0 };
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Uso: node tools/rule-index.mjs --check | --write | <ID> [<ID>...]');
    return 2;
  }
  const text = fs.readFileSync(DOC, 'utf8');
  if (args[0] === '--write') {
    const { text: next, moved } = refreshIndex(text);
    if (moved) fs.writeFileSync(DOC, next);
    console.log(`índice de regras: ${moved} linhas atualizadas`);
    const after = analyzeIndex(next);
    if (after.undefinedRows.length) console.log(`no índice, sem definição: ${after.undefinedRows.join(' ')}`);
    if (after.missingRows.length) console.log(`definidas, fora do índice: ${after.missingRows.join(' ')}`);
    return 0;
  }
  if (args[0] === '--check') {
    const { rowCount, stale, undefinedRows, missingRows } = analyzeIndex(text);
    for (const s of stale) console.log(`FAIL índice de regras: ${s.id} aponta para ${s.listed}, definição em ${s.wanted}`);
    for (const id of undefinedRows) console.log(`FAIL índice de regras: ${id} sem definição`);
    for (const id of missingRows) console.log(`FAIL índice de regras: ${id} definida e fora do índice`);
    if (stale.length || undefinedRows.length || missingRows.length) {
      console.log(`índice de regras: ${stale.length} linhas velhas, ${undefinedRows.length} sem definição, ${missingRows.length} fora do índice. Linha velha: node tools/rule-index.mjs --write`);
      return 1;
    }
    console.log(`indice de regras em dia (${rowCount} regras)`);
    return 0;
  }
  let code = 0;
  for (const id of args) {
    const { known, text: shown } = lookupRule(text, id);
    if (!known) { console.log(`${id}: não encontrada`); code = 1; continue; }
    console.log(shown);
  }
  return code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
