#!/usr/bin/env node
// Varredura do armor do bloodjaw.
//
// O bloodjaw nao esta no bestiary (mathiasbynens/tibia-json), entao a entrada da
// tabela e manual. O armor 128 vigente saiu de uma varredura de 03/Jul/2026 que
// minimizava turnos sem classificacao em logs/mazzerinbarrage. Em 20/Set/2026 apareceu
// testemunha externa em 100 (kik-tibia/tibiatools src/data/creatures.json, com
// mitigation 5.6 identica a nossa), e desde julho o motor ganhou pierce fisico de arma
// (M-040), omega e outras pecas que podiam estar sendo compensadas pelo armor. Daí a
// re-execucao.
//
// Uso:
//   node tools/sweep-bloodjaw-armor.mjs                       # 96..140 de 2 em 2
//   node tools/sweep-bloodjaw-armor.mjs --from 100 --to 130 --step 1
//   node tools/sweep-bloodjaw-armor.mjs --values 100,128
//   node tools/sweep-bloodjaw-armor.mjs --pairs "mazzerinbarrage,15 sept"
//
// Metrica: turnos sem classificacao (status != 'resolved') nas sessoes que de fato
// TEM hit em bloodjaw. Sessoes sem bloodjaw sao ignoradas — elas nao podem opinar e so
// diluiriam o sinal.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { discoverFixturePairs } from './fixture-pairs.mjs';
import { createUnifiedContext, splitSessions, pairSessions, filterExcludedSessions, dateKey } from './unified-corpus.mjs';

const MOB = 'bloodjaw';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function armorValues() {
  const values = arg('--values');
  if (values) return values.split(',').map(v => +v.trim()).filter(Number.isFinite);
  const from = +arg('--from', 96);
  const to = +arg('--to', 140);
  const step = +arg('--step', 2);
  const out = [];
  for (let a = from; a <= to; a += step) out.push(a);
  return out;
}

const wantedPairs = (arg('--pairs', 'mazzerinbarrage') || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

const context = createUnifiedContext();
const BASE = context.MOB_ELEMENT_MODS_POST_2026_06_16;
const PRE = context.MOB_ELEMENT_MODS;
if (!BASE[MOB]) throw new Error(`${MOB} ausente da tabela pos-cutoff`);

// So o mob varrido ganha objeto novo; o resto da tabela mantem a identidade dos objetos
// congelados, que e o que o cache de reversao por hit espera.
function tableWithArmor(base, armor) {
  return Object.freeze(Object.assign(Object.create(null), base, {
    [MOB]: Object.freeze(Object.assign({}, base[MOB], { armor })),
  }));
}

const pairs = discoverFixturePairs({ warn: () => {} })
  .filter(p => wantedPairs.some(w => p.label.toLowerCase().includes(w) || p.key.toLowerCase().includes(w)));
if (!pairs.length) throw new Error(`nenhum par casou com: ${wantedPairs.join(', ')}`);

// Sessoes elegiveis: pareadas, nao excluidas, e com hit em bloodjaw no server log.
const work = [];
for (const pair of pairs) {
  const sv = splitSessions(fs.readFileSync(path.join('logs', pair.server), 'utf8'));
  const lc = splitSessions(fs.readFileSync(path.join('logs', pair.local), 'utf8'));
  const sessions = filterExcludedSessions(pair.server, pairSessions(sv, lc));
  sessions.forEach((session, index) => {
    if (!new RegExp(MOB, 'i').test(session.sv.text)) return;
    work.push({ label: pair.label, index, session });
  });
}
if (!work.length) throw new Error(`nenhuma sessao com hit em ${MOB}`);

console.log(`${MOB}: ${work.length} sessoes elegiveis em ${pairs.length} par(es) — ${[...new Set(work.map(w => w.label))].join(', ')}`);
console.log(`armor atual na tabela: ${BASE[MOB].armor}, mitigation ${BASE[MOB].mitigation}\n`);

const OPTIONS = { strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true };
const rows = [];
for (const armor of armorValues()) {
  const post = tableWithArmor(BASE, armor);
  const pre = PRE && PRE[MOB] ? tableWithArmor(PRE, armor) : PRE;
  let total = 0;
  let unresolved = 0;
  const perSession = [];
  for (const item of work) {
    let result = null;
    try {
      result = context.UnifiedClassificationEngine.classifyUnified(
        item.session.sv.text, item.session.lc.text,
        { mobModsPre: pre || null, mobModsPost: post, ...OPTIONS },
      );
    } catch (_error) { /* sessao que estoura fica fora da conta, igual no dump */ }
    const turns = (result && result.turns) || [];
    const bad = turns.filter(t => t.status !== 'resolved').length;
    total += turns.length;
    unresolved += bad;
    perSession.push(`${item.label} S${item.index}=${bad}`);
  }
  rows.push({ armor, total, unresolved, perSession });
  console.log(`armor=${String(armor).padStart(3)}  sem classificacao=${String(unresolved).padStart(4)} / ${total}   ${perSession.join(' ')}`);
}

const best = Math.min(...rows.map(r => r.unresolved));
const plateau = rows.filter(r => r.unresolved === best).map(r => r.armor);
console.log(`\nminimo = ${best} turnos sem classificacao; plateau = ${plateau.join(', ')}`);
const current = rows.find(r => r.armor === BASE[MOB].armor);
if (current) console.log(`valor vigente (${BASE[MOB].armor}) = ${current.unresolved}`);
