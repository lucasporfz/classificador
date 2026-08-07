#!/usr/bin/env node

import process from 'node:process';

import { runUnifiedGabarito } from './gabarito-unified.mjs';
import { UnifiedCorpus } from './unified-corpus.mjs';
import { runUnifiedInvariants } from './unified-invariants.mjs';

function parseArgs(argv) {
  const modes = new Set();
  let only = null;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--gabarito' || arg === '--invariants') {
      modes.add(arg.slice(2));
    } else if (arg === '--only') {
      only = argv[++index] || '';
    } else if (!['--cache-stats', '--fingerprints', '--no-cache'].includes(arg)) {
      throw new Error(`Flag desconhecida: ${arg}`);
    }
  }
  if (!modes.size) {
    modes.add('gabarito');
    modes.add('invariants');
  }
  return {
    modes,
    only,
    cacheEnabled: !argv.includes('--no-cache'),
    showCacheStats: argv.includes('--cache-stats'),
    showFingerprints: argv.includes('--fingerprints'),
  };
}

function run(argv) {
  const options = parseArgs(argv);
  const corpus = new UnifiedCorpus({
    cacheEnabled: options.cacheEnabled,
    persistentCacheDir: options.cacheEnabled ? 'reports/unified-cache' : null,
  });
  let failures = 0;
  let empty = true;

  // A porta curada e sempre avaliada antes da varredura exaustiva.
  if (options.modes.has('gabarito')) {
    console.log('=== GABARITO PRIORITARIO ===');
    const result = runUnifiedGabarito({
      corpus,
      only: options.only,
      cacheEnabled: options.cacheEnabled,
      showFingerprints: options.showFingerprints,
      showCacheStats: options.showCacheStats,
    });
    failures += result.fail;
    empty = empty && result.empty;
  }

  if (options.modes.has('invariants')) {
    console.log('\n=== INVARIANTES MECANICAS ===');
    const result = runUnifiedInvariants({ corpus, only: options.only });
    failures += result.fail;
    empty = empty && result.empty;
  }

  if (options.showCacheStats && options.modes.has('invariants')) {
    const stats = corpus.cacheStats();
    console.log(`CACHE-WORKFLOW requests=${stats.requests} classifications=${stats.classifications} memoryHits=${stats.hits} persistentHits=${stats.persistentHits} persistentWrites=${stats.persistentWrites}`);
  }
  if (empty) throw new Error(`Nada corresponde ao filtro: ${options.only || '-'}`);
  process.exitCode = failures ? 1 : 0;
}

try {
  run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
