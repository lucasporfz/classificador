#!/usr/bin/env node
// mob-info.mjs — imprime os mods elementais de um mob por nome.
// Uso: node tools/mob-info.mjs "<nome do mob>"
// Matching: case-insensitive exact → substring → fuzzy (Levenshtein palavra a palavra).
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();

// --- parse MOB_ELEMENT_MODS sem eval: strip JS wrapper, JSON.parse o objeto ---
const raw = fs.readFileSync(path.join(ROOT, 'js/mob-element-mods.js'), 'utf8')
  .replace(/^﻿/, '');                           // BOM
const jsonStr = raw
  .replace(/^\/\/[^\n]*\n/, '')                      // comentário inicial
  .trim()
  .replace(/^const MOB_ELEMENT_MODS\s*=\s*/, '')    // declaração
  .replace(/;\s*$/, '');                             // ponto-e-vírgula final
const MOBS = JSON.parse(jsonStr);
const MOB_NAMES = Object.keys(MOBS);                 // já em lowercase no arquivo

// --- Levenshtein clássico O(n·m) ---
function lev(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const cur = Math.min(prev + 1, row[j] + 1, row[j - 1] + cost);
      row[j - 1] = prev;
      prev = cur;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

// distância mínima entre query e qualquer palavra do nome, ou o nome completo
function mobScore(query, name) {
  return Math.min(lev(query, name), ...name.split(' ').map(w => lev(query, w)));
}

// --- arg ---
const query = process.argv.slice(2).join(' ').trim();
if (!query) {
  console.error('Uso: node tools/mob-info.mjs "<nome do mob>"');
  process.exit(1);
}
const q = query.toLowerCase();

// 1. exact (case-insensitive)
if (MOBS[q]) {
  console.log(`"${q}"`);
  console.log(JSON.stringify(MOBS[q], null, 2));
  process.exit(0);
}

// 2. substring: mob name contains query, or query contains mob name (partial input)
const subMatches = MOB_NAMES.filter(n => n.includes(q) || q.includes(n));
if (subMatches.length === 1) {
  console.log(`"${subMatches[0]}"  (substring match para "${query}")`);
  console.log(JSON.stringify(MOBS[subMatches[0]], null, 2));
  process.exit(0);
}
if (subMatches.length > 1) {
  console.log(`"${query}" casa com ${subMatches.length} nomes (seja mais específico):`);
  subMatches.forEach(n => console.log(`  ${n}`));
  process.exit(1);
}

// 3. fuzzy: top 5 por Levenshtein palavra a palavra
const ranked = MOB_NAMES
  .map(n => ({ n, d: mobScore(q, n) }))
  .sort((a, b) => a.d - b.d)
  .slice(0, 5);

console.log(`"${query}" não encontrado. Mais próximos:`);
ranked.forEach(({ n, d }) => console.log(`  ${n}  (dist=${d})`));
process.exit(1);
