#!/usr/bin/env node
// Extrai uma sessão específica de um arquivo multi-sessão para stdout ou arquivo.
// Uso: node tools/extract-session.mjs "logs/file.txt" N [out.txt]
// N = índice 1-based da sessão (por ordem de aparição no arquivo)
import fs from 'node:fs'; import process from 'node:process'; import path from 'node:path';

const [,, filePath, idxStr, outPath] = process.argv;
if (!filePath || !idxStr) { console.error('Uso: extract-session.mjs <file> <N> [out]'); process.exit(1); }

const HEADER_RE = /^Channel .+ saved /;
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const sessions = [];
let cur = null;
for (const line of lines) {
  if (HEADER_RE.test(line)) {
    if (cur) sessions.push(cur);
    cur = [line];
  } else {
    if (!cur) cur = [line];
    else cur.push(line);
  }
}
if (cur) sessions.push(cur);

const idx = Number(idxStr) - 1;
if (idx < 0 || idx >= sessions.length) {
  console.error(`Sessão ${idxStr} não existe (total: ${sessions.length})`);
  process.exit(1);
}
const text = sessions[idx].join('\n');
if (outPath) { fs.writeFileSync(outPath, text); console.error(`Escrito: ${outPath}`); }
else process.stdout.write(text);
