// Versão do motor Unified = hash do conteúdo dos arquivos que produzem o resultado.
//
// A constante VERSION de js/unified-formulas.js vai para o ranking (`engine_version`). Escrita
// à mão, ela ficou parada de Jul a Nov/2026 enquanto o motor mudava. Aqui ela é derivada do
// conteúdo: qualquer mudança em ENGINE_FILES ou em js/unified-main.js muda a versão.
//
// O hash ignora BOM, CRLF/LF e a própria linha da constante (senão ela dependeria de si mesma).
//
// Uso:
//   node tools/engine-version.mjs                 # imprime a versão esperada e a gravada
//   node tools/engine-version.mjs --check         # 0 = em dia; 1 = desatualizada (working tree)
//   node tools/engine-version.mjs --check --staged  # idem, sobre o conteúdo staged (hook)
//   node tools/engine-version.mjs --write         # grava a versão esperada em unified-formulas.js
//   node tools/engine-version.mjs --write --staged  # idem, com o hash do conteúdo staged (commit parcial)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ENGINE_FILES } from './unified-corpus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION_FILE = 'js/unified-formulas.js';
export const HASHED_FILES = Object.freeze([...ENGINE_FILES, 'js/unified-main.js']);
const VERSION_LINE = /^(\s*const VERSION = ')([^']*)(';)/m;

function readFile(file, staged) {
  if (!staged) return fs.readFileSync(path.join(ROOT, file), 'utf8');
  return execFileSync('git', ['show', `:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
}

const normalize = text => text.replace(/^﻿/, '').replace(/\r\n/g, '\n');

export function currentVersion(staged = false) {
  const m = normalize(readFile(VERSION_FILE, staged)).match(VERSION_LINE);
  if (!m) throw new Error(`linha "const VERSION = '...'" não encontrada em ${VERSION_FILE}`);
  return m[2];
}

export function expectedVersion(staged = false) {
  const hash = crypto.createHash('sha256');
  for (const file of HASHED_FILES) {
    let text = normalize(readFile(file, staged));
    if (file === VERSION_FILE) text = text.replace(VERSION_LINE, '$1$3');
    hash.update(`${file}\0${text}\0`);
  }
  return `unified-${hash.digest('hex').slice(0, 12)}`;
}

function write(staged) {
  const full = path.join(ROOT, VERSION_FILE);
  const raw = fs.readFileSync(full, 'utf8');
  const next = expectedVersion(staged);
  const out = raw.replace(VERSION_LINE, `$1${next}$3`);
  if (out !== raw) fs.writeFileSync(full, out);
  console.log(next);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const staged = args.includes('--staged');
  if (args.includes('--write')) {
    write(staged);
  } else {
    const expected = expectedVersion(staged);
    const current = currentVersion(staged);
    if (args.includes('--check')) {
      if (expected !== current) {
        console.error(`versão do motor desatualizada: gravada ${current}, esperada ${expected}. Rode: node tools/engine-version.mjs --write`);
        process.exit(1);
      }
    } else {
      console.log(`esperada ${expected}\ngravada  ${current}`);
    }
  }
}
