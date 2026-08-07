#!/usr/bin/env node
// Dump estavel de todos os turnos do corpus Unified.
//
// Uso:
//   node tools/dump-unified.mjs
//   node tools/dump-unified.mjs --pairs "fixture 1,fixture 2"
//   node tools/dump-unified.mjs --write-candidate
//   node tools/dump-unified.mjs --promote-candidate

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  CORPUS_EXCLUSIONS,
  ENGINE_FILES,
  UnifiedCorpus,
  dateKey,
  exclusionFor,
} from './unified-corpus.mjs';

const DEFAULT_ARTIFACTS_DIR = 'reports/unified-dump';
const DUMP_SOURCE_FILES = Object.freeze([
  'tools/dump-unified.mjs',
  'tools/fixture-pairs.mjs',
  'tools/unified-corpus.mjs',
]);

function turnProjection(turn) {
  const counts = { arrow: 0, spell: 0, rune: 0, grenade: 0 };
  let damage = 0;
  const labels = [];
  for (const component of turn.components || []) {
    const kind = component.comp || component.kind;
    if (kind in counts) counts[kind] += (component.hits || []).length;
    for (const hit of component.hits || []) damage += +hit.dmg || 0;
    if (component.actionLabel && kind !== 'arrow') labels.push(`${kind}:${component.actionLabel}`);
  }
  return { counts, damage, labels };
}

function turnLine(serverName, sessionIndex, turn) {
  const { counts, damage, labels } = turnProjection(turn);
  return `${serverName} S${sessionIndex} ts=${turn.ts} st=${turn.status} a=${counts.arrow} s=${counts.spell} r=${counts.rune} g=${counts.grenade} dmg=${damage} ${labels.join('|') || '-'}`;
}

function pairMatches(serverName, wantedPairs) {
  return !wantedPairs || wantedPairs.some(value => serverName.toLowerCase().includes(value));
}

export function parseWantedPairs(argv) {
  const pairIndex = argv.indexOf('--pair');
  const pairsIndex = argv.indexOf('--pairs');
  if (pairIndex >= 0 && pairsIndex >= 0) throw new Error('Use somente --pair ou --pairs.');
  const raw = pairIndex >= 0
    ? [String(argv[pairIndex + 1] || '')]
    : pairsIndex >= 0
      ? String(argv[pairsIndex + 1] || '').split(',')
      : null;
  if (!raw) return null;
  const values = raw.map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!values.length) throw new Error('--pair/--pairs vazio.');
  return values;
}

export function generateUnifiedDump({
  corpus = new UnifiedCorpus({ persistentCacheDir: 'reports/unified-cache' }),
  wantedPairs = null,
} = {}) {
  const pairs = corpus.discoverPairs();
  const selected = pairs.filter(pair => pairMatches(pair.server, wantedPairs));
  if (wantedPairs && !selected.length) {
    throw new Error(`Nenhum par bate com --pair/--pairs: ${wantedPairs.join(',')}`);
  }
  const included = selected.filter(fixture => !exclusionFor(fixture.server, {}));

  const lines = [];
  const turns = [];
  const sessions = [];
  for (const fixture of included) {
    const pairedSessions = corpus.sessionsFor(fixture.server, fixture.local);
    if (pairedSessions === null) {
      lines.push(`PAIR=${fixture.server} MISSING`);
      continue;
    }
    if (!pairedSessions.length) {
      lines.push(`PAIR=${fixture.server} NO_PAIRS`);
      continue;
    }

    for (const pair of pairedSessions) {
      sessions.push({
        fixture: fixture.key,
        server: fixture.server,
        local: fixture.local,
        session: pair.index,
        date: dateKey(pair.sv),
        savedAt: pair.sv.saveSec,
      });
      let result;
      try {
        result = corpus.classify(fixture.server, fixture.local, pair, {
          profile: 'dump',
          throwOnError: true,
        });
      } catch (error) {
        lines.push(`PAIR=${fixture.server} S${pair.index} THROW ${error.message}`);
        continue;
      }
      if (!result) {
        lines.push(`PAIR=${fixture.server} S${pair.index} ERR classification returned no result`);
        continue;
      }
      if (result.error) {
        lines.push(`PAIR=${fixture.server} S${pair.index} ERR ${result.error}`);
        continue;
      }
      for (const turn of result.turns || []) {
        const line = turnLine(fixture.server, pair.index, turn);
        lines.push(line);
        turns.push({
          fixture: fixture.key,
          server: fixture.server,
          session: pair.index,
          date: dateKey(pair.sv),
          ts: turn.ts,
          status: turn.status,
          line,
        });
      }
    }
  }

  const statusCounts = {};
  for (const turn of turns) statusCounts[turn.status] = (statusCounts[turn.status] || 0) + 1;
  const unresolved = turns.filter(turn => turn.status !== 'resolved');
  const summary = {
    schemaVersion: 1,
    scope: wantedPairs ? { pairs: wantedPairs } : { corpus: 'all' },
    fixtureCount: included.length,
    sessionCount: sessions.length,
    turnCount: turns.length,
    statusCounts,
    unclassifiedCount: unresolved.length,
    unclassifiedTurns: unresolved,
    exclusions: CORPUS_EXCLUSIONS,
  };
  return {
    text: `${lines.join('\n')}\n`,
    lines,
    turns,
    sessions,
    summary,
    selectedPairs: included,
  };
}

export function computeUnifiedSourceSignature(root, selectedPairs) {
  const hash = crypto.createHash('sha256');
  const files = [
    ...ENGINE_FILES,
    ...DUMP_SOURCE_FILES,
    ...selectedPairs.flatMap(pair => [
      path.join('logs', pair.server),
      path.join('logs', pair.local),
    ]),
  ].sort();
  for (const relativePath of files) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, relativePath)));
    hash.update('\0');
  }
  hash.update(JSON.stringify(CORPUS_EXCLUSIONS));
  return hash.digest('hex');
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function replaceDirectory(source, target) {
  const next = `${target}.next-${process.pid}`;
  const previous = `${target}.previous-${process.pid}`;
  fs.rmSync(next, { recursive: true, force: true });
  fs.cpSync(source, next, { recursive: true });
  if (fs.existsSync(target)) fs.renameSync(target, previous);
  try {
    fs.renameSync(next, target);
    fs.rmSync(previous, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(previous) && !fs.existsSync(target)) fs.renameSync(previous, target);
    fs.rmSync(next, { recursive: true, force: true });
    throw error;
  }
}

export function writeCandidateArtifacts(result, {
  root = process.cwd(),
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
} = {}) {
  const base = path.resolve(root, artifactsDir);
  const candidate = path.join(base, 'candidate');
  const next = `${candidate}.next-${process.pid}`;
  fs.rmSync(next, { recursive: true, force: true });
  fs.mkdirSync(next, { recursive: true });

  const signature = computeUnifiedSourceSignature(root, result.selectedPairs);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSignature: signature,
    scope: result.summary.scope,
    artifacts: {
      dump: 'dump-unified.txt',
      summary: 'summary.json',
    },
  };
  fs.writeFileSync(path.join(next, 'dump-unified.txt'), result.text, 'utf8');
  writeJson(path.join(next, 'summary.json'), {
    ...result.summary,
    sourceSignature: signature,
  });
  writeJson(path.join(next, 'manifest.json'), manifest);

  fs.mkdirSync(base, { recursive: true });
  if (fs.existsSync(candidate)) fs.rmSync(candidate, { recursive: true, force: true });
  fs.renameSync(next, candidate);
  return { candidate, manifest };
}

export function promoteCandidate({
  root = process.cwd(),
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
} = {}) {
  const base = path.resolve(root, artifactsDir);
  const candidate = path.join(base, 'candidate');
  const latest = path.join(base, 'latest');
  if (!fs.existsSync(path.join(candidate, 'manifest.json'))) {
    throw new Error(`Candidate inexistente: ${candidate}`);
  }
  replaceDirectory(candidate, latest);
  const manifestPath = path.join(latest, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.promotedAt = new Date().toISOString();
  writeJson(manifestPath, manifest);
  return { latest, manifest };
}

function valueAfter(argv, flag, fallback) {
  const index = argv.indexOf(flag);
  return index >= 0 ? (argv[index + 1] || fallback) : fallback;
}

function runCli(argv) {
  const artifactsDir = valueAfter(argv, '--artifacts-dir', DEFAULT_ARTIFACTS_DIR);
  if (argv.includes('--promote-candidate')) {
    if (argv.includes('--write-candidate') || argv.includes('--pair') || argv.includes('--pairs')) {
      throw new Error('--promote-candidate nao classifica e nao aceita flags de geracao.');
    }
    const { latest } = promoteCandidate({ artifactsDir });
    console.error(`Latest promovido de forma explicita: ${latest}`);
    return;
  }

  const wantedPairs = parseWantedPairs(argv);
  if (argv.includes('--write-candidate') && wantedPairs) {
    throw new Error('--write-candidate e reservado ao corpus completo; use --pair/--pairs com stdout para validacao escopada.');
  }
  const result = generateUnifiedDump({ wantedPairs });
  if (argv.includes('--write-candidate')) {
    const { candidate } = writeCandidateArtifacts(result, { artifactsDir });
    console.error(`Candidate gravado: ${candidate}`);
    console.error(`${result.summary.turnCount} turnos; ${result.summary.unclassifiedCount} sem classificacao.`);
  } else {
    process.stdout.write(result.text);
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}
