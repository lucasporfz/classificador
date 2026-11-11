#!/usr/bin/env node
// sweep-setup.mjs — setup inferido de TODAS as sessões do corpus, sem resolver turno nenhum.
//
// Roda o Unified com as opções da UI e `stopAfterSetup: true`: o motor para depois do setup
// de sessão (bônus de classe, omega, Combat Mastery, grav san, estância, pierce de arma, ...) e
// antes de `buildTurns`. O corpus inteiro sai em minutos, contra horas da classificação completa.
// Serve para medir uma mudança de detector de sessão antes de mexer no motor.
//
// Limite: sem turnos não há detecção de BM por blocos (C-012); vale o BM do charm (C-012a) ou 0.
// O leech também não é inferido (ele precisa da passada sem leech).
//
// Uso:
//   node tools/sweep-setup.mjs --pick omegaSetup.multiplier,omegaSetup.source
//   node tools/sweep-setup.mjs --pick weaponElementPierce --pair "dlc ms" --include-excluded
//
//   --pick a.b,c      caminhos no contexto do motor (obrigatório); objeto sai inteiro
//   --pair <rótulo>   rótulo EXATO do par; repetível (padrão: todos)
//   --include-excluded  inclui as sessões de CORPUS_EXCLUSIONS
//
// Saída: uma linha JSON por sessão: { pair, s, header, values: { caminho: valor } }.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UnifiedCorpus, createUnifiedContext } from './unified-corpus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pairs = [];
let picks = null;
let includeExcluded = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pick' && args[i + 1]) picks = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (args[i] === '--pair' && args[i + 1]) pairs.push(args[++i]);
  else if (args[i] === '--include-excluded') includeExcluded = true;
  else { console.error(`argumento inválido: ${args[i]}`); process.exit(2); }
}
if (!picks || !picks.length) { console.error('Uso: node tools/sweep-setup.mjs --pick a.b,c [--pair <rótulo>] [--include-excluded]'); process.exit(2); }

const get = (obj, p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x)) ?? 'null');

const corpus = new UnifiedCorpus({ root: ROOT, cacheEnabled: false, persistentCacheDir: null });
const ctx = createUnifiedContext(ROOT);
for (const pair of corpus.discoverPairs()) {
  if (pairs.length && !pairs.includes(pair.label)) continue;
  for (const s of corpus.sessionsFor(pair.server, pair.local, { includeExcluded }) || []) {
    const r = ctx.UnifiedClassificationEngine.classifyUnified(s.sv.text, s.lc.text, {
      mobModsPre: ctx.MOB_ELEMENT_MODS || null,
      mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
      strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
      stopAfterSetup: true,
    });
    const line = { pair: pair.label, s: s.sourceIndex, header: s.sv.header || null };
    if (r.error) line.error = r.error;
    else line.values = Object.fromEntries(picks.map(p => [p, plain(get(r._context, p))]));
    console.log(JSON.stringify(line));
  }
}
