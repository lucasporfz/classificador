// Índice de docs/CLASSIFICATION_RULES.md: confere, atualiza e consulta.
//
// A tabela entre os marcadores rule-index é navegação, não regra: a coluna Linha precisa
// apontar para a definição, senão quem lê só o trecho de uma regra cai no lugar errado.
//
// Uso:
//   node tools/rule-index.mjs --check     # 0 = em dia; 1 = linha velha, regra sem linha no índice etc.
//   node tools/rule-index.mjs --write     # atualiza a coluna Linha e cria a linha de regra nova
//   node tools/rule-index.mjs --refs D-010i  # linhas que citam a regra, fora a definição
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
// Para achar regra fora do índice vale também o item de lista recuado (ex.: M-036b dentro de M-036).
const DEFINITION_NESTED = new RegExp(`^\\s*(?:[-*] |\\d+\\. |> )?\\*\\*(${ID})(?: —|:\\*\\*| \\()`);
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
    const m = DEFINITION_NESTED.exec(line);
    if (m && !rows.has(m[1]) && !missingRows.includes(m[1])) missingRows.push(m[1]);
  });
  return { lines, rowCount: rows.size, rows, stale, undefinedRows, missingRows, end, byId };
}

const idKey = id => { const m = /^([A-Z])-(\d+)(.*)$/.exec(id); return [m[1], +m[2], m[3]]; };
const idBefore = (a, b) => { const x = idKey(a), y = idKey(b); return x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0); };
const slug = s => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

// Tema e seção de uma regra nova, tirados da definição: `**ID — tema (data):**` dá o tema;
// `**ID:** texto` dá a primeira frase. Seção = título mais próximo acima da definição.
function newRow(lines, id, defLine) {
  const line = lines[defLine - 1].replace(/\r$/, '');
  const after = line.slice(line.indexOf(`**${id}`) + id.length + 2);
  let head;
  if (after.startsWith(' —')) head = after.slice(2).split(/ \(|:\*\*|\*\*/)[0];
  else head = after.replace(/^:\*\*\s*|^ \([^)]*\)[^*]*\*\*\s*/, '').split(/\.(?: |$)/)[0];
  head = head.replace(/\*\*/g, '').replace(/\|/g, '\\|').trim();
  let k = defLine - 1;
  while (k >= 0 && !/^#{2,6} /.test(lines[k])) k--;
  const title = lines[k].replace(/^#+ /, '').replace(/\r$/, '');
  return `| ${id} | ${head} | [${title}](#${slug(title)}) | ${defLine} |`;
}

export function refreshIndex(text) {
  const { lines, stale, missingRows, rows, byId } = analyzeIndex(text);
  for (const s of stale) lines[s.k] = `| ${s.id} | ${s.head} | ${s.wanted} |`;
  // Regra nova: linha na ordem do ID, dentro do grupo da mesma letra. Inserir antes das
  // definições não desloca a coluna Linha (o índice fica acima de todas).
  const added = [];
  for (const id of missingRows) {
    const same = [...rows.entries()].filter(([r]) => r[0] === id[0]).sort((a, b) => a[1] - b[1]);
    if (!same.length) continue;
    const prev = same.filter(([r]) => idBefore(r, id) < 0).pop();
    const at = prev ? prev[1] + 1 : same[0][1];
    added.push({ id, at, row: newRow(lines, id, byId.get(id)[0]) });
  }
  added.sort((a, b) => b.at - a.at || idBefore(b.id, a.id));
  for (const a of added) lines.splice(a.at, 0, a.row);
  let next = lines.join('\n');
  // As linhas inseridas deslocam as definições para baixo: atualiza a coluna Linha de novo.
  if (added.length) next = refreshIndex(next).text;
  return { text: next, moved: stale.length, added: added.map(a => a.id) };
}

// Linhas das regras que citam o ID (fora a tabela e a própria definição), com a regra em
// que cada citação está.
export function findRefs(text, id) {
  const { lines, end, byId } = analyzeIndex(text);
  const own = new Set(byId.get(id) || []);
  const esc = id.replace(/[-]/g, '\\-');
  const cite = new RegExp(`(?<![A-Za-z0-9-])${esc}(?![a-z0-9]|-[a-z0-9])`);
  const out = [];
  let owner = null;
  lines.forEach((raw, k) => {
    if (k <= end) return;
    const line = raw.replace(/\r$/, '');
    const d = DEFINITION_NESTED.exec(line);
    if (d) owner = d[1];
    else if (/^#{1,6} /.test(line)) owner = null;
    if (own.has(k + 1)) return;
    const m = cite.exec(line);
    if (!m) return;
    const from = Math.max(0, m.index - 120);
    const snip = (from ? '…' : '') + line.slice(from, m.index + id.length + 120) + (m.index + id.length + 120 < line.length ? '…' : '');
    out.push({ line: k + 1, owner, snip });
  });
  return out;
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
    console.error('Uso: node tools/rule-index.mjs --check | --write | --refs <ID>... | <ID> [<ID>...]');
    return 2;
  }
  const text = fs.readFileSync(DOC, 'utf8');
  if (args[0] === '--write') {
    const { text: next, moved, added } = refreshIndex(text);
    if (moved || added.length) fs.writeFileSync(DOC, next);
    console.log(`índice de regras: ${moved} linhas atualizadas, ${added.length} criadas${added.length ? ': ' + added.join(' ') : ''}`);
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
  if (args[0] === '--refs') {
    let code = 0;
    for (const id of args.slice(1)) {
      const refs = findRefs(text, id);
      const owners = [...new Set(refs.map(r => r.owner).filter(o => o && o !== id))];
      console.log(`${id}: ${refs.length} citações${owners.length ? `; regras que citam: ${owners.join(' ')}` : ''}`);
      for (const r of refs) console.log(`  linha ${r.line}${r.owner ? ` [${r.owner}]` : ''}: ${r.snip}`);
      if (!lookupRule(text, id).known) { console.log(`${id}: não encontrada`); code = 1; }
    }
    return code;
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
