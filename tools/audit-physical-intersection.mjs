#!/usr/bin/env node
// audit-physical-intersection.mjs — apuracao `physical-intersection-audit`.
//
// Pergunta que esta ferramenta responde: quantos turnos RESOLVIDOS do corpus contem um
// bloco ACEITO cuja intersecao de originais fisicos e VAZIA alem da tolerancia fixa de
// S-007a (`PHYSICAL_INTERSECTION_TOLERANCE = 4`)?
//
// "Vazia alem da tolerancia fixa" e medido do jeito que S-007a le literalmente: sobre o
// CONJUNTO de intervalos do bloco, `gap = max(O_min_i) - min(O_max_i)`. Existe um original
// comum a todos os hits (com folga fixa `t`) se e somente se `gap <= t`. A implementacao
// do motor nao mede isso: `intersectIntervals` aplica a tolerancia PAR A PAR sobre o
// acumulador, que sai inflado de `t` a cada passo, entao a folga efetiva cresce com o
// numero de hits.
//
// Metodo: o motor e instrumentado EM MEMORIA, sem tocar em `js/`. Esta ferramenta le
// `js/unified-validation.js`, injeta por substituicao de texto um registrador logo antes do
// `return { ok: true, ... }` de `validatePhysicalBlockUnderAssignment`, e roda o resultado no
// vm. O registrador anexa `auditGap`/`auditMaxLo`/`auditMinHi`/`auditIntervals` AO PROPRIO
// veredito devolvido, entao `applyBlockResult` os copia para `component.deterministic` junto
// com o resto — o que e lido depois e o veredito do modo de grav san VENCEDOR, nunca um modo
// candidato que perdeu. A ancora de injecao e verificada (tem de casar exatamente uma vez),
// entao a ferramenta falha alto se o motor mudar embaixo dela.
//
// Uso:
//   node tools/audit-physical-intersection.mjs                 # todos os pares (um processo)
//   node tools/audit-physical-intersection.mjs --pair "<nome exato do server log>"
//   node tools/audit-physical-intersection.mjs --all-pairs      # um processo por par
//   node tools/audit-physical-intersection.mjs --self-test      # so a aritmetica do acumulador
//   ... --no-bloodjaw                                            # pula pares cujo server log cita bloodjaw
//   ... --signatures [--gap-max N]                               # 1 linha por turno (status + forma + hits)
//
// CONTRAFACTUAL (`--gap-max N`): o motor continua rodando a cadeia original; quando ela
// aprova, a aprovacao so vale se o gap GLOBAL do bloco for <= N. Assim o conjunto de blocos
// aceitos so ENCOLHE, e todo bloco que continua aceito devolve a MESMA `intersection` de
// hoje — o experimento isola a decisao de aceitacao, sem mexer no valor devolvido (que
// `js/unified-setup-inference.js:1748` usa como largura na pontuacao de setup).
//   --gap-max 4  = leitura estrita de S-007a   (folga TOTAL de 4)
//   --gap-max 8  = leitura permissiva          (+-4 por intervalo)
// Comparar `--signatures` do baseline contra `--signatures --gap-max N` da o drift real.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

import {
  ENGINE_FILES,
  UnifiedCorpus,
  clockForTs,
  dateKey,
  exclusionFor,
} from './unified-corpus.mjs';

const ROOT = process.cwd();
const TOLERANCE = 4;

const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };

// Ancora: a linha de sucesso de `validatePhysicalBlockUnderAssignment`
// (`js/unified-validation.js`). Unica no arquivo.
const AUDIT_ANCHOR = '      return { ok: true, known, unknown, intersection: inter, physicalToleranceUsed: toleranceUsed };';
const auditHook = gapMax => `      let auditMaxLo = -Infinity, auditMinHi = Infinity;
      for (const iv of intervals) { if (iv[0] > auditMaxLo) auditMaxLo = iv[0]; if (iv[1] < auditMinHi) auditMinHi = iv[1]; }
      if (intervals.length > 1) {
        const auditGap = auditMaxLo - auditMinHi;
        ${gapMax == null ? '' : `if (inter && toleranceUsed > 0 && auditGap > ${gapMax}) {
          return { ok: false, rule: 'S-004/S-005/S-007', reason: 'physical_intersection_empty', known, unknown };
        }`}
        return { ok: true, known, unknown, intersection: inter, physicalToleranceUsed: toleranceUsed,
          auditGap, auditMaxLo, auditMinHi,
          auditIntervals: intervals.map(iv => [iv[0], iv[1]]) };
      }
`;

function engineSource(file, gapMax) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (file !== 'js/unified-validation.js') return source;
  const occurrences = source.split(AUDIT_ANCHOR).length - 1;
  if (occurrences !== 1) {
    throw new Error(`ancora de instrumentacao casou ${occurrences}x em ${file} (esperado 1). `
      + 'O motor mudou: reveja tools/audit-physical-intersection.mjs antes de confiar no resultado.');
  }
  return source.replace(AUDIT_ANCHOR, auditHook(gapMax) + AUDIT_ANCHOR);
}

function createInstrumentedContext(gapMax) {
  const context = {
    console: silent,
    Math, JSON, Array, Object, Number, String, Map, Set,
    isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array,
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  for (const file of ENGINE_FILES) {
    vm.runInContext(engineSource(file, gapMax), context, { filename: file });
  }
  return context;
}

// Qual componente aceito esta SUJEITO ao teste fisico? Bloco `arrow` so quando o eixo do AA
// da sessao e fisico (S-007b); spell/runa so quando a acao e fisica (Ethereal Barrage,
// Explosion, `exori gran mas pug`, `exori mas amp pug`). Granada e holy e nunca entra.
function physicalAxisComponent(component, aaElement) {
  const comp = component.comp || component.kind;
  if (comp === 'arrow') return (aaElement || 'physical') === 'physical';
  if (comp === 'spell' || comp === 'rune') {
    const profile = (component.action && component.action.profile) || null;
    return !!profile && profile.element === 'physical';
  }
  return false;
}

function selfTest() {
  function intersectIntervalTol(a, b, t) {
    if (!a) return b || null;
    if (!b) return a || null;
    const lo = Math.max(a[0], b[0]) - t;
    const hi = Math.min(a[1], b[1]) + t;
    return hi >= lo ? [lo, hi] : null;
  }
  function chain(intervals, t) {
    let out = null;
    let started = false;
    for (const iv of intervals) {
      if (!started) { out = iv; started = true; continue; }
      out = intersectIntervalTol(out, iv, t);
      if (!out) return null;
    }
    return out;
  }
  const gapOf = ivs => Math.max(...ivs.map(iv => iv[0])) - Math.min(...ivs.map(iv => iv[1]));

  const pair = [[783, 842], [867, 926]];
  const bridged = [[783, 842], [793, 852], [803, 862], [813, 872],
    [823, 882], [833, 892], [843, 902], [853, 912], [867, 926]];
  console.log('=== aritmetica de intersectIntervals (S-007a) ===');
  console.log(`2 hits, gap real ${gapOf(pair)}, t=4 -> ${JSON.stringify(chain(pair, 4))}`);
  console.log(`9 hits em ponte, gap real ${gapOf(bridged)}, t=0 -> ${JSON.stringify(chain(bridged, 0))}`);
  console.log(`9 hits em ponte, gap real ${gapOf(bridged)}, t=4 -> ${JSON.stringify(chain(bridged, 4))}`);
  const acc = chain(bridged, 4);
  if (acc) {
    const inFirst = acc[0] <= bridged[0][1] && acc[1] >= bridged[0][0];
    const inLast = acc[0] <= bridged[8][1] && acc[1] >= bridged[8][0];
    console.log(`o acumulador devolvido intersecta o 1o intervalo? ${inFirst}; o ultimo? ${inLast}`);
  }

  // Intersecao e comutativa; a cadeia com tolerancia NAO e. O veredito de um bloco
  // depende da ORDEM dos hits, que S-003/S-004 nao tornam relevante.
  const extremesFirst = [bridged[0], bridged[8], ...bridged.slice(1, 8)];
  console.log(`MESMO conjunto, extremos primeiro, t=4 -> ${JSON.stringify(chain(extremesFirst, 4))}`);

  // Folga efetiva por tamanho de bloco: maior gap aceito com t=4, hits deslizando.
  // Construcao: k intervalos de largura 61 (a banda tipica de um AA), deslizando `step`.
  console.log('=== maior gap aceito com t=4, por tamanho de bloco (hits deslizando) ===');
  for (const k of [2, 3, 4, 5, 6, 7, 8, 10, 12]) {
    let worst = -Infinity;
    for (let step = 0; step <= 400; step++) {
      const ivs = [];
      for (let i = 0; i < k; i++) ivs.push([800 + step * i, 860 + step * i]);
      if (chain(ivs, 4)) worst = Math.max(worst, gapOf(ivs));
    }
    console.log(`  k=${String(k).padStart(2)}  gap maximo aceito = ${worst}   (uma folga FIXA de 4 aceitaria no maximo 4)`);
  }
}

// Assinatura de um turno: tudo que uma reclassificacao mudaria. Usada para o diff
// baseline x contrafactual.
function turnSignature(fixture, session, turn) {
  const shape = (turn.components || [])
    .map(c => `${c.comp}:${(c.hits || []).filter(h => h && !h.virtual).length}:${(c.actionLabel || '-').replace(/\s+/g, '_')}`)
    .join('+') || '-';
  // M-039 expoe `omegaActive` por hit no diagnostico e na UI. Uma reclassificacao pode
  // preservar a particao e ainda assim mudar esse rotulo (o caminho de omega no eixo fisico
  // so e procurado QUANDO a intersecao falha), entao ele entra na assinatura.
  const omega = (turn.hits || []).filter(h => h && h.omegaActive).map(h => h.seq).sort((a, b) => a - b);
  const tol = (turn.components || [])
    .map(c => (c.deterministic && c.deterministic.physicalToleranceUsed) || 0).join(',');
  return [
    `${fixture.label} S${session.index}`,
    clockForTs(turn.ts),
    turn.status,
    turn.reason || '-',
    shape,
    `omega=[${omega.join(',')}]`,
    `tol=[${tol}]`,
  ].join(' ');
}

function auditPair(fixture, corpus, write, { gapMax = null, signatures = false } = {}) {
  const sessions = corpus.sessionsFor(fixture.server, fixture.local);
  if (!sessions) return { turns: 0, flagged: 0 };
  let turnsSeen = 0;
  let flagged = 0;
  for (const session of sessions) {
    if (exclusionFor(fixture.server, session)) continue;
    const context = createInstrumentedContext(gapMax);
    let result = null;
    try {
      result = context.UnifiedClassificationEngine.classifyUnified(session.sv.text, session.lc.text, {
        mobModsPre: context.MOB_ELEMENT_MODS || null,
        mobModsPost: context.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
        strictLeech: true,
        maxOriginal: 6000,
        useFloat16Mitigation: true,
      });
    } catch (error) {
      write(`ERRO ${fixture.label} S${session.index}: ${String(error && error.message).split('\n')[0]}`);
      continue;
    }
    if (!result || !result.turns) continue;
    const aaElement = result.aaElement || (result.setup && result.setup.aaElement) || 'physical';
    for (const turn of result.turns) {
      if (signatures) { turnsSeen++; write(turnSignature(fixture, session, turn)); continue; }
      if (turn.status !== 'resolved') continue;
      turnsSeen++;
      for (const component of turn.components || []) {
        if (!physicalAxisComponent(component, aaElement)) continue;
        // O veredito APLICADO no bloco (o modo de grav san vencedor), nao um modo
        // candidato que perdeu: `applyBlockResult` copia o objeto do modo escolhido.
        const det = component.deterministic;
        if (!det || !det.ok || !Number.isFinite(det.auditGap)) continue;
        if (det.auditGap <= TOLERANCE) continue;
        flagged++;
        const label = component.actionLabel || component.comp;
        write([
          `${fixture.label} S${session.index}`,
          `${clockForTs(turn.ts)}`,
          `${dateKey(session.sv) || 'sem-data'}`,
          `comp=${component.comp}`,
          `acao=${label}`,
          `hits=${(component.hits || []).length}`,
          `gap=${det.auditGap}`,
          `maxLo=${det.auditMaxLo}`,
          `minHi=${det.auditMinHi}`,
          `tolUsada=${det.physicalToleranceUsed}`,
          `gravSan=${component.gravSanActive == null ? '-' : component.gravSanActive}`,
          `acumulador=${det.intersection ? `[${det.intersection[0]},${det.intersection[1]}]` : 'null'}`,
          `intervalos=${(det.auditIntervals || []).map(iv => `[${iv[0]},${iv[1]}]`).join('')}`,
        ].join(' '));
      }
    }
  }
  return { turns: turnsSeen, flagged };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) { selfTest(); return; }

  const gapIndex = argv.indexOf('--gap-max');
  const gapMax = gapIndex >= 0 ? Number(argv[gapIndex + 1]) : null;
  if (gapIndex >= 0 && !Number.isFinite(gapMax)) {
    console.error('--gap-max precisa de um numero');
    process.exit(1);
  }
  const signatures = argv.includes('--signatures');
  const noBloodjaw = argv.includes('--no-bloodjaw');

  const corpus = new UnifiedCorpus({ cacheEnabled: false, warn: () => {} });
  let all = corpus.discoverPairs().filter(f => !exclusionFor(f.server, {}));
  if (noBloodjaw) {
    // A entrada `bloodjaw` da tabela pos-cutoff e manual (fora do bestiary) e o armor dela
    // esta sob suspeita de calibracao (CLAUDE.md). Um armor errado desloca o intervalo de `O`
    // e produziria gap que nao e do defeito de tolerancia — esses pares saem da medicao.
    all = all.filter(f => !/bloodjaw/i.test(fs.readFileSync(path.join(ROOT, 'logs', f.server), 'utf8')));
  }

  if (argv.includes('--all-pairs')) {
    let total = 0;
    let turns = 0;
    for (const fixture of all) {
      const childArgs = ['--max-old-space-size=6144', 'tools/audit-physical-intersection.mjs',
        '--pair', fixture.server];
      if (gapMax != null) childArgs.push('--gap-max', String(gapMax));
      if (signatures) childArgs.push('--signatures');
      const text = execFileSync(process.execPath, childArgs,
        { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
      for (const line of text.split('\n')) {
        if (!line) continue;
        if (line.startsWith('TOTAL ')) {
          const m = /^TOTAL turnos=(\d+) marcados=(\d+)/.exec(line);
          if (m) { turns += +m[1]; total += +m[2]; }
          continue;
        }
        console.log(line);
      }
      console.error(`${fixture.label} ok`);
    }
    console.log(`TOTAL turnos=${turns} marcados=${total}`);
    return;
  }

  const pairIndex = argv.indexOf('--pair');
  const wanted = pairIndex >= 0 ? argv[pairIndex + 1] : null;
  const fixtures = wanted ? all.filter(f => f.server === wanted) : all;
  if (wanted && !fixtures.length) {
    console.error(`par nao encontrado (nome EXATO do server log): ${wanted}`);
    process.exit(1);
  }

  let turns = 0;
  let flagged = 0;
  for (const fixture of fixtures) {
    const stats = auditPair(fixture, corpus, line => console.log(line), { gapMax, signatures });
    turns += stats.turns;
    flagged += stats.flagged;
  }
  console.log(`TOTAL turnos=${turns} marcados=${flagged}`);
}

main();
