// Dump do corpus inteiro, UM PROCESSO POR PAR, na mesma ordem do dump monolitico.
//
// O dump de um processo so acumula os resultados dos 43 pares e estoura o heap; a
// ordem de `discoverPairs()` e a mesma, entao concatenar par a par reproduz o arquivo.
//
// `--pair` casa por SUBSTRING (`server log rp.txt` puxa `murcion`/`darklight`), por isso
// cada lote e filtrado por nome EXATO.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { UnifiedCorpus, exclusionFor } from './unified-corpus.mjs';

const out = process.argv[2] || 'reports/unified-dump/per-pair/dump-unified.txt';
const corpus = new UnifiedCorpus({ persistentCacheDir: 'reports/unified-cache' });
const pairs = corpus.discoverPairs().filter(fixture => !exclusionFor(fixture.server, {}));

const chunks = [];
let index = 0;
for (const fixture of pairs) {
  index++;
  const started = Date.now();
  let text = '';
  try {
    text = execFileSync(process.execPath, [
      '--max-old-space-size=6144', 'tools/dump-unified.mjs', '--pair', fixture.server,
    ], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  } catch (error) {
    console.error(`FALHOU ${fixture.server}: ${error.message.split('\n')[0]}`);
    process.exitCode = 1;
    continue;
  }
  const mine = text.split('\n').filter(line =>
    line.startsWith(`${fixture.server} S`) || line.startsWith(`PAIR=${fixture.server} `));
  chunks.push(...mine);
  console.error(`${index}/${pairs.length} ${fixture.server} ${mine.length} linhas ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${chunks.join('\n')}\n`, 'utf8');
console.error(`total ${chunks.length} linhas -> ${out}`);
