// Dump do corpus inteiro, UM PROCESSO POR PAR, na mesma ordem do dump monolitico.
//
// O dump de um processo so acumula os resultados dos 43 pares e estoura o heap; a
// ordem de `discoverPairs()` e a mesma, entao concatenar par a par reproduz o arquivo.
//
// `--pair` casa por SUBSTRING (`server log rp.txt` puxa `murcion`/`darklight`), por isso
// cada lote e filtrado por nome EXATO.
//
// Uso: node tools/dump-unified-per-pair.mjs [saida.txt] [--engine-root <dir>]
//   --engine-root: carrega o motor (`<dir>/js/...`) de outra pasta, para comparar
//   antes/depois sem `git stash`. Os logs e o cache continuam os deste repositorio (o
//   cache e indexado pelo conteudo do motor, entao nao mistura versoes). Cada par roda
//   num filho que chama generateUnifiedDump com esse motor, em vez de
//   `tools/dump-unified.mjs --pair`: este e o unico arquivo alterado, porque
//   dump-unified.mjs/unified-corpus.mjs entram na assinatura de `--verify-source`.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { UnifiedCorpus, exclusionFor } from './unified-corpus.mjs';
import { generateUnifiedDump } from './dump-unified.mjs';

const argv = process.argv.slice(2);
const FLAGS_WITH_VALUE = new Set(['--engine-root', '--child-pair']);
const valueOf = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const engineRootArg = valueOf('--engine-root');
const engineRoot = engineRootArg ? path.resolve(engineRootArg) : null;
if (engineRoot && !fs.existsSync(path.join(engineRoot, 'js', 'unified-classification-engine.js'))) {
  console.error(`--engine-root: ${engineRoot} nao contem js/unified-classification-engine.js`);
  process.exit(2);
}
const childPair = valueOf('--child-pair');

if (childPair) {
  // Filho: um par com o motor de --engine-root (mesmo texto de `dump-unified.mjs --pair`).
  const corpus = new UnifiedCorpus({
    root: engineRoot,
    logDir: path.resolve('logs'),
    persistentCacheDir: path.resolve('reports/unified-cache'),
  });
  process.stdout.write(generateUnifiedDump({ corpus, wantedPairs: [childPair.trim().toLowerCase()] }).text);
} else {
  const out = argv.find((a, i) => !a.startsWith('--') && !FLAGS_WITH_VALUE.has(argv[i - 1]))
    || 'reports/unified-dump/per-pair/dump-unified.txt';
  const corpus = new UnifiedCorpus({ persistentCacheDir: 'reports/unified-cache' });
  const pairs = corpus.discoverPairs().filter(fixture => !exclusionFor(fixture.server, {}));
  if (engineRoot) console.error(`motor: ${engineRoot}`);

  const chunks = [];
  let index = 0;
  for (const fixture of pairs) {
    index++;
    const started = Date.now();
    let text = '';
    try {
      const args = engineRoot
        ? ['--max-old-space-size=6144', 'tools/dump-unified-per-pair.mjs', '--child-pair', fixture.server, '--engine-root', engineRoot]
        : ['--max-old-space-size=6144', 'tools/dump-unified.mjs', '--pair', fixture.server];
      text = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
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
}
