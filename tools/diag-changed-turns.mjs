#!/usr/bin/env node
// diag-changed-turns.mjs — dado um diff entre dois dumps de tools/dump-unified.mjs
// (baseline vs depois de uma mudança), extrai automaticamente quais (fixture, sessão,
// turno) mudaram e imprime o detalhe hit-a-hit completo de cada um: dano original
// físico E holy, leech de vida/mana observado por hit com N_leech aceito e o esperado
// nesse N, e o setup global da sessão (leech base%, minor charms, BM on/off + pierce%,
// bônus de utevo grav san, crit multiplier por componente).
//
// Substitui escrever um script de scratchpad do zero toda vez que uma mudança no motor
// afeta turnos fora do alvo original e precisa de revisão turno a turno (Fase 4 da
// skill classifier-turn-fix).
//
// Uso:
//   node tools/dump-unified.mjs > baseline.txt          # antes da mudança
//   # ...aplica a mudança...
//   node tools/dump-unified.mjs > after.txt              # depois da mudança
//   diff baseline.txt after.txt > diff.txt
//   node tools/diag-changed-turns.mjs --diff diff.txt > depois-detalhado.txt
//   git stash                                            # volta pro código antes
//   node tools/diag-changed-turns.mjs --diff diff.txt > antes-detalhado.txt
//   git stash pop                                        # restaura a mudança
//
// O script sempre roda contra o código ATUALMENTE no disco — por isso o antes/depois
// exige rodar duas vezes (uma antes de editar ou com git stash), igual ao próprio
// dump-unified.mjs já exige para o diff compacto.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
import { UnifiedCorpus } from './unified-corpus.mjs';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
function freshCtx() {
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js'])
    vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  return ctx;
}

const fmt = s => `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const pct = v => v == null ? '-' : `${(v*100).toFixed(2)}%`;

// svFileName -> lcFileName, pra resolver o nome de arquivo que aparece nas linhas do
// diff de volta no par de logs certo. Descoberto pela mesma abstração canônica do
// dump, incluindo pareamento, normalização dos índices e exclusões do corpus.
// A lista hardcoded anterior estava atrás do corpus (sem `uhax 3`, `serverlog6..9`,
// `monk 2`, `kim`, `death echo`, `dlc ms`...) e o efeito era SILENCIOSO: turnos desses
// fixtures apareciam no diff mas eram pulados pelo `continue` do loop, produzindo um
// review incompleto sem nenhum aviso. Não voltar a hardcodar.
const corpus = new UnifiedCorpus({ cacheEnabled: false, persistentCacheDir: null });
const PAIRS_BY_SV = Object.fromEntries(
  corpus.discoverPairs().map(p => [p.server, p.local])
);

// Parseia linhas no formato que dump-unified.mjs emite:
// "<svFileName> S<N> ts=<ts> st=..." (aparecem em ambos os lados '<'/'>' de um diff -u
// ou git diff; aceitamos as variantes <, >, + e -, além de listas simples sem
// prefixo. Quando há ao menos um alvo prefixado, linhas sem prefixo são contexto
// do diff e não representam turnos alterados.
const LINE_RE = /^([<>+-]?)\s*(.+?\.txt) S(\d+) ts=(\d+) st=/;
function parseDiffTargets(diffText) {
  const targets = new Map(); // svFileName -> Map(sessionIndex -> Set(ts))
  const lines = diffText.split(/\r?\n/);
  const hasPrefixedTargets = lines.some(line => {
    const match = LINE_RE.exec(line);
    return match && match[1];
  });
  for (const line of lines) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, prefix, svN, sIdx, ts] = m;
    if (hasPrefixedTargets && !prefix) continue;
    if (!PAIRS_BY_SV[svN]) continue;
    if (!targets.has(svN)) targets.set(svN, new Map());
    const bySession = targets.get(svN);
    if (!bySession.has(+sIdx)) bySession.set(+sIdx, new Set());
    bySession.get(+sIdx).add(+ts);
  }
  return targets;
}

function dumpTurn(u, t) {
  console.log(`\n=== turno ${fmt(t.ts)} status=${t.status} reason=${t.reason || '-'} ===`);
  for (const c of (t.components || [])) {
    const leechK = c.leech && c.leech.k;
    console.log(`  comp=${c.comp} label=${c.actionLabel || '-'} hits=${(c.hits || []).length} N_leech_aceito=${leechK ?? '-'} leech.ok=${c.leech ? c.leech.ok : '-'} reason=${c.reason || '-'}`);
    const fitBySeq = new Map();
    for (const f of (c.leech && c.leech.fits) || []) { if (f && f.hit) fitBySeq.set(f.hit.seq, f); }
    for (const h of (c.hits || [])) {
      const p = h.evidence && h.evidence.physical;
      const holy = h.evidence && h.evidence.elemental && h.evidence.elemental.holy;
      const flags = [h.realCrit && 'CRIT', h.onslaught && 'ONS', h.lowBlow && 'LB', h.savageBlow && 'SB', h.overkill && 'OK', h.isPrey && 'prey', h.exposeWeakness && 'EW'].filter(Boolean).join(' ');
      const phys = p && p.interval ? `O_fis=[${p.interval[0]},${p.interval[1]}]` : '';
      const holyStr = holy && holy.known ? `O_holy=[${(holy.originals || []).join(',')}]` : '';
      const fit = fitBySeq.get(h.seq);
      const n = fit && fit.fit ? fit.fit.n : (leechK ?? '-');
      let expLife = '-', expMana = '-';
      const checks = fit && fit.fit && fit.fit.official && fit.fit.official.checks;
      if (checks) {
        const lc2 = checks.find(x => x.channel === 'life');
        const mc = checks.find(x => x.channel === 'mana');
        if (lc2 && lc2.expectations && lc2.expectations[0]) expLife = lc2.expectations[0].expected;
        if (mc && mc.expectations && mc.expectations[0]) expMana = mc.expectations[0].expected;
      }
      console.log(`    ${fmt(h.ts)} seq=${String(h.seq || 0).padStart(5)} ${String(h.mob).padEnd(18)} dmg=${String(h.dmg).padStart(5)} ${flags.padEnd(13)} ${phys.padEnd(20)} ${holyStr.padEnd(16)} life=${String(h.lifeLeech ?? 0).padStart(4)}(N${n} esp.${expLife}) mana=${String(h.manaLeech ?? 0).padStart(4)}(N${n} esp.${expMana})`);
    }
  }
  const rej = t.rejected || [];
  if (rej.length) {
    console.log(`  partições rejeitadas: ${rej.length}`);
    for (const r of rej.slice(0, 40)) {
      const shape = r.candidate ? r.candidate.shape.join('>') : '?';
      const cuts = r.candidate ? r.candidate.cuts.join(',') : '?';
      const viols = (r.violations || []).map(v => v.reason).join('; ') || (r.ok ? 'OK(perdeu desempate)' : '?');
      console.log(`    ${shape} [${cuts}] -> ${viols}`);
    }
  }
}

const diffArgIndex = process.argv.indexOf('--diff');
const diffPath = diffArgIndex >= 0 ? process.argv[diffArgIndex + 1] : null;
if (!diffPath) {
  console.error('Uso: node tools/diag-changed-turns.mjs --diff <arquivo-diff-do-dump-unified>');
  process.exit(1);
}
const targets = parseDiffTargets(read(diffPath));
if (!targets.size) {
  console.error('Nenhuma linha "<arquivo.txt> S<N> ts=<ts> st=..." encontrada no diff.');
  process.exit(1);
}

for (const [svN, bySession] of targets) {
  const lcN = PAIRS_BY_SV[svN];
  const pairs = corpus.sessionsFor(svN, lcN);
  for (const [sIdx, tsSet] of bySession) {
    const pair = pairs[sIdx];
    console.log(`\n################ ${svN} S${sIdx} ################`);
    if (!pair) { console.log('  par não encontrado'); continue; }
    console.log(`sessão: sv=${pair.sv.header.trim()}`);
    const ctx = freshCtx();
    const E = ctx.UnifiedClassificationEngine;
    const opts = { mobModsPre: ctx.MOB_ELEMENT_MODS, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16, strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true };
    const u = E.classifyUnified(pair.sv.text, pair.lc.text, opts);
    if (u.error) { console.log('  ERRO do motor:', u.error); continue; }
    const ls = u.leechSetup || {};
    console.log(`--- setup da sessão ---`);
    console.log(`leech: life=${pct(ls.lifeBase)} mana=${pct(ls.manaBase)} confianca=${ls.confidence || '-'} evidencias=${ls.evidenceCount ?? '-'} contradicoes=${ls.contradictions ?? '-'}`);
    console.log(`  vampiric embrace: ${ls.vampiricMob ? ls.vampiricMob + ' +' + pct(ls.vampiricBonus) : '(nenhum)'}`);
    console.log(`  void's call: ${ls.voidsMob ? ls.voidsMob + ' +' + pct(ls.voidsBonus) : '(nenhum)'}`);
    const bm = u.bmPierceDetection || {};
    console.log(`BM (Battle Momentum): ${bm.active ? 'ON' : 'OFF'} pierce=${pct(bm.pierce)} fonte=${bm.source || '-'}`);
    const gs = u.gravSanSetup || {};
    console.log(`utevo grav san: bonus=${pct(gs.bonus)} (multiplicador ${gs.multiplier ?? '-'}) fonte=${gs.source || '-'}`);
    const cs = u.critSetup || {};
    console.log(`crit multiplier por componente: ${JSON.stringify(cs.byComponent || {})} (fallback ${cs.fallback ? cs.fallback.toFixed(3) : '-'})`);
    for (const t of (u.turns || [])) {
      if (!tsSet.has(t.ts)) continue;
      dumpTurn(u, t);
    }
  }
}
