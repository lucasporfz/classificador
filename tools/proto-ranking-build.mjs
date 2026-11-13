#!/usr/bin/env node
// PROTOTYPE — throwaway. Roda proto-ranking-extract.mjs em cada par do corpus (um processo
// por par, por causa do heap) e junta o JSON de sessões. Uso:
//   node tools/proto-ranking-build.mjs <saida.json> [--post-cutoff-only]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { discoverFixturePairs } from './fixture-pairs.mjs';

const [outPath, ...flags] = process.argv.slice(2);
const sessions = [];
for (const p of discoverFixturePairs({ warn: () => {} })) {
  try {
    const raw = execFileSync(process.execPath, ['--max-old-space-size=8000', 'tools/proto-ranking-extract.mjs',
      'logs/' + p.server, 'logs/' + p.local, ...flags], { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 15 * 60 * 1000 });
    for (const s of JSON.parse(raw)) sessions.push({ pair: p.label, ...s });
    console.error('ok   ' + p.label);
  } catch (e) {
    console.error('FALHA ' + p.label + ': ' + String(e.message).split('\n')[0]);
  }
}
fs.writeFileSync(outPath, JSON.stringify(sessions));
console.error(sessions.length + ' sessões -> ' + outPath);
