#!/usr/bin/env node
// weapon-perks.mjs — perks de proficiência das armas do jogo, lidos de
// docs/data/weapon-proficiencies-2026-08.json (projeção da base TibiaPal, só campos numéricos).
//
// Uso:
//   node tools/weapon-perks.mjs --weapon "moonsilver bow"   perks nível a nível (casa por substring)
//   node tools/weapon-perks.mjs --totals                    somas possíveis por tipo e elemento
//   node tools/weapon-perks.mjs --totals --json             o mesmo em JSON (usado pelos testes)
//
// Soma de um tipo numa arma: cada nível ativa UM perk, então o total é a soma, sobre os níveis,
// de {0} ∪ valores daquele tipo no nível. É o que M-036c, M-039d e M-040/M-040a/M-040b usam.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_FILE = path.join(ROOT, 'docs/data/weapon-proficiencies-2026-08.json');

// Type: 6 classe de bestiário, 28 alpha, 29 omega, 30 armor penetration, 31 pierce.
export const PERK_TYPE = Object.freeze({ 6: 'class', 28: 'alpha', 29: 'omega', 30: 'armor_penetration', 31: 'pierce' });
export const ELEMENT_ID = Object.freeze({ 1: 'physical', 8: 'fire', 16: 'earth', 32: 'energy', 64: 'ice', 128: 'holy', 256: 'death' });

export function loadWeapons(file = DATA_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8')).weapons;
}

function perkKey(p) {
  const kind = PERK_TYPE[p.type];
  if (!kind || !(p.value > 0)) return null;
  if (kind === 'pierce') return 'pierce:' + (ELEMENT_ID[p.elementId] || p.elementId);
  if (kind === 'class') return 'class:' + String(p.bestiary || '').toLowerCase();
  return kind;
}

const round4 = v => Math.round(v * 10000) / 10000;

// { key: { total: Set(weaponType) } } com as somas > 0 de cada arma.
export function weaponTotals(weapons = loadWeapons()) {
  const out = {};
  for (const w of weapons) {
    const perLevel = {};
    w.levels.forEach((perks, i) => {
      for (const p of perks) {
        const k = perkKey(p);
        if (!k) continue;
        ((perLevel[k] ??= {})[i] ??= new Set([0])).add(p.value);
      }
    });
    for (const [k, levels] of Object.entries(perLevel)) {
      let sums = new Set([0]);
      for (const opts of Object.values(levels)) {
        const next = new Set();
        for (const s of sums) for (const o of opts) next.add(round4(s + o));
        sums = next;
      }
      for (const s of sums) if (s > 0) ((out[k] ??= {})[s] ??= new Set()).add(w.weaponType);
    }
  }
  return out;
}

// Totais de um tipo restritos a tipos de arma (ex.: pierce:energy em Wand), ordenados.
export function totalsFor(totals, key, weaponTypes = null) {
  return Object.entries(totals[key] || {})
    .filter(([, types]) => !weaponTypes || [...types].some(t => weaponTypes.includes(t)))
    .map(([v]) => +v).sort((a, b) => a - b);
}

function describe(p) {
  const kind = PERK_TYPE[p.type] || ('type' + p.type);
  const extra = p.elementId != null ? '/' + (ELEMENT_ID[p.elementId] || p.elementId) : p.bestiary ? '/' + p.bestiary : '';
  return `${kind}${extra}=${p.value}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--weapon');
  if (i >= 0 && args[i + 1]) {
    const q = args[i + 1].toLowerCase();
    const hits = loadWeapons().filter(w => w.name.toLowerCase().includes(q));
    if (!hits.length) { console.error(`nenhuma arma casa "${args[i + 1]}"`); process.exit(1); }
    for (const w of hits) {
      console.log(`== ${w.name} (${w.weaponType})`);
      w.levels.forEach((perks, n) => console.log(`  L${n + 1}  ${perks.map(describe).join('  |  ')}`));
    }
  } else if (args.includes('--totals')) {
    const totals = weaponTotals();
    if (args.includes('--json')) {
      console.log(JSON.stringify(Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([s, t]) => [s, [...t].sort()]))]))));
    } else {
      for (const k of Object.keys(totals).sort()) {
        const row = Object.entries(totals[k]).sort((a, b) => a[0] - b[0])
          .map(([v, t]) => `${round4(v * 100)}%(${[...t].sort().join('/')})`).join('  ');
        console.log(`${k.padEnd(28)} ${row}`);
      }
    }
  } else {
    console.error('Uso: node tools/weapon-perks.mjs --weapon "<nome>" | --totals [--json]');
    process.exit(2);
  }
}
