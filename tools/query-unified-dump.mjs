#!/usr/bin/env node
// Consulta somente o ultimo dump explicitamente promovido. Este tool nunca
// importa nem executa o classificador.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { discoverFixturePairs } from './fixture-pairs.mjs';
import { computeUnifiedSourceSignature } from './dump-unified.mjs';
import { exclusionFor } from './unified-corpus.mjs';

const DEFAULT_ARTIFACTS_DIR = 'reports/unified-dump';

function valueAfter(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function readLatest(root, artifactsDir) {
  const latest = path.resolve(root, artifactsDir, 'latest');
  const summaryPath = path.join(latest, 'summary.json');
  const manifestPath = path.join(latest, 'manifest.json');
  if (!fs.existsSync(summaryPath) || !fs.existsSync(manifestPath)) {
    throw new Error(`Nao existe dump latest promovido em ${latest}.`);
  }
  return {
    latest,
    summary: JSON.parse(fs.readFileSync(summaryPath, 'utf8')),
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  };
}

function run(argv) {
  const artifactsDir = valueAfter(argv, '--artifacts-dir', DEFAULT_ARTIFACTS_DIR);
  const { latest, summary, manifest } = readLatest(process.cwd(), artifactsDir);
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ latest, summary, manifest }, null, 2)}\n`);
    return;
  }

  console.log(`Ultimo dump aceito: ${manifest.promotedAt || manifest.generatedAt || 'data desconhecida'}`);
  console.log(`Turnos registrados: ${summary.turnCount}`);
  console.log(`Turnos sem classificacao: ${summary.unclassifiedCount}`);
  console.log(`Status: ${Object.entries(summary.statusCounts || {}).map(([status, count]) => `${status}=${count}`).join(', ') || '-'}`);
  console.log(`Assinatura da fonte: ${summary.sourceSignature || manifest.sourceSignature || '-'}`);
  if (argv.includes('--verify-source')) {
    const wantedPairs = summary.scope?.pairs || null;
    const selectedPairs = discoverFixturePairs()
      .filter(pair =>
        !exclusionFor(pair.server, {})
        && (!wantedPairs || wantedPairs.some(value => pair.server.toLowerCase().includes(value))));
    const currentSignature = computeUnifiedSourceSignature(process.cwd(), selectedPairs);
    const acceptedSignature = summary.sourceSignature || manifest.sourceSignature;
    const fresh = currentSignature === acceptedSignature;
    console.log(`Fonte atual: ${fresh ? 'identica ao latest' : 'DIVERGIU do latest'}`);
    if (!fresh) process.exitCode = 3;
  }
  if (argv.includes('--list-unclassified')) {
    for (const turn of summary.unclassifiedTurns || []) console.log(turn.line);
  }
}

try {
  run(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
