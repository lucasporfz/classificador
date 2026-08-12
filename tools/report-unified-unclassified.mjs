#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { CORPUS_EXCLUSIONS } from './unified-corpus.mjs';

const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, 'logs');
const OUT_PATH = path.join(ROOT, 'reports', 'unified_unclassified_report.md');

const read = file => fs.readFileSync(file, 'utf8');

// Split por porção (`Channel … saved`) para inferência de crit/leech por-porção — evita
// contaminação cross-porção que aparecia ao passar o arquivo inteiro num stream só.
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function splitSessions(text) {
  const headerRe = /^Channel .+ saved /;
  const sessions = []; let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (headerRe.test(line)) { if (cur) sessions.push(cur); cur = { header: line, lines: [line] }; }
    else if (cur) cur.lines.push(line);
  }
  if (cur) sessions.push(cur);
  if (!sessions.length) sessions.push({ header: '', lines: text.replace(/^﻿/, '').split(/\r?\n/) });
  return sessions.map(s => ({ ...s, text: s.lines.join('\n') }));
}
function parseSessionDate(s) {
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(s.header);
  if (!m) return null;
  return { year: +m[6], month: MONTHS[m[1]] || 0, day: +m[2], saveSec: +m[3] * 3600 + +m[4] * 60 + +m[5] };
}
function buildPairs(svS, lcS) {
  const pairs = [];
  for (const sv of svS) {
    const sd = parseSessionDate(sv); if (!sd) continue;
    let best = null, bestDiff = Infinity;
    for (const lc of lcS) { const ld = parseSessionDate(lc); if (!ld || ld.year !== sd.year || ld.month !== sd.month || ld.day !== sd.day) continue;
      const diff = Math.abs(ld.saveSec - sd.saveSec); if (diff < bestDiff) { bestDiff = diff; best = lc; } }
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best });
  }
  return pairs;
}
function sessionsOf(svText, lcText) {
  const svS = splitSessions(svText), lcS = splitSessions(lcText);
  if (svS.length === 1 && lcS.length === 1) return [{ sv: svS[0], lc: lcS[0] }];
  return buildPairs(svS, lcS);
}
const clock = ts => {
  const n = Number(ts) || 0;
  const h = Math.floor(n / 3600) % 24;
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
};

// Descoberto de logs/ (ver tools/fixture-pairs.mjs): par novo na pasta entra sozinho,
// par removido some sozinho. Não voltar a hardcodar a lista aqui. Os rótulos antigos
// (`bastion`, `rp pack`, `uhax 2`, `serverlog6`…) seguem estáveis via LABEL_OVERRIDES lá.
const PAIRS = discoverFixturePairs({ logDir: LOG_DIR }).map(p => [p.label, p.server, p.local]);

function loadEngine() {
  const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, Date, isFinite, isNaN, parseInt, parseFloat, Float32Array, Int32Array };
  vm.createContext(ctx);
  for (const file of ['js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js']) {
    vm.runInContext(read(path.join(ROOT, file)), ctx, { filename: file });
  }
  return ctx;
}

function countComponents(turn) {
  const counts = { arrow: 0, spell: 0, rune: 0, grenade: 0, unresolved: 0, total: 0 };
  for (const c of turn.components || []) {
    const comp = c.comp || 'unresolved';
    const n = (c.hits || []).length;
    if (comp in counts) counts[comp] += n;
    else counts.unresolved += n;
    counts.total += n;
  }
  return counts;
}

function hitSummary(hits) {
  return (hits || []).map(h => `${clock(h.ts)}.${h.seq ?? 0} ${h.mob || '-'} dmg=${h.dmg}${h.overkill ? ' overkill' : ''}${h.realCrit ? ' crit' : ''}${h.onslaught ? ' onslaught' : ''}`).join('; ');
}

function componentSummary(block) {
  if (!block) return '-';
  const action = block.action && (block.action.text || block.action.name || block.action.clock) || '-';
  return `${block.comp || '-'} hits=${(block.hits || []).length} action=${action} range=${block.start ?? '?'}..${block.end ?? '?'}`;
}

function violationKey(v) {
  const block = v.block ? `${v.block.comp}:${(v.block.hits || []).length}` : '-';
  return `${v.rule || 'sem_regra'}|${v.reason || 'sem_motivo'}|${block}`;
}

function formatViolation(v) {
  const parts = [
    `regra=${v.rule || 'sem_regra'}`,
    `motivo=${v.reason || 'sem_motivo'}`,
  ];
  if (v.block) parts.push(`bloco=${componentSummary(v.block)}`);
  if (v.leech) {
    parts.push(`leech=${v.leech.reason || (v.leech.consensus && v.leech.consensus.reason) || 'falhou'}`);
    if (v.leech.k != null) parts.push(`N=${v.leech.k}`);
    if (v.leech.consensus) parts.push(`ok=${v.leech.consensus.okCount ?? '-'} fail=${v.leech.consensus.failedCount ?? '-'}`);
  }
  if (v.element) parts.push(`elemento=${v.element}`);
  if (v.known != null || v.unknown != null) parts.push(`known=${v.known ?? '-'} unknown=${v.unknown ?? '-'}`);
  return parts.join('; ');
}

function rejectedSummary(turn) {
  const rejected = turn.rejected || [];
  const grouped = new Map();
  for (const r of rejected) {
    for (const v of r.violations || []) {
      const key = violationKey(v);
      if (!grouped.has(key)) grouped.set(key, { count: 0, v });
      grouped.get(key).count++;
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.count - a.count || formatViolation(a.v).localeCompare(formatViolation(b.v)));
}

function unresolvedCategory(turn) {
  const reason = turn && turn.reason || '';
  const violations = (turn && turn.rejected || []).flatMap(r => r.violations || []);
  const violationReasons = violations.map(v => String(v.reason || v.rule || '')).join(' ');
  const leechReasons = violations.map(v => String((v.leech && (v.leech.reason || (v.leech.consensus && v.leech.consensus.reason))) || '')).join(' ');
  const haystack = `${reason} ${violationReasons} ${leechReasons}`;
  if (/leech_setup_unknown|missing_leech_setup|gold_observations_insufficient/.test(haystack)) return 'unresolved_by_missing_leech_setup';
  if (/leech|cardinality/.test(haystack) && /contradiction|failed|above_expected|below_expected|between_discrete/.test(haystack)) return 'unresolved_by_leech_contradiction';
  if (/ambiguous/.test(reason)) return 'unresolved_by_ambiguous_partition';
  if (/mob_mod|unknown_mob|missing_mob/.test(haystack)) return 'unresolved_by_missing_mob_mods';
  if (/original|deterministic|physical|elemental|intersection|damage/.test(haystack)) return 'unresolved_by_damage_original';
  if (/no_valid_partition/.test(reason)) return 'unresolved_by_true_mechanical_conflict';
  return reason || 'unresolved_by_true_mechanical_conflict';
}

function formatLeechSetup(setup) {
  if (!setup) return '-';
  const pct = v => v == null ? '-' : `${Math.round(Number(v) * 10000) / 100}%`;
  const parts = [
    `conf=${setup.confidence || 'unknown'}`,
    `life=${pct(setup.lifeBase)}`,
    `mana=${pct(setup.manaBase)}`,
    `evid=${setup.evidenceCount ?? 0}`,
    `contr=${setup.contradictions ?? 0}`,
  ];
  if (setup.vampiricMob) parts.push(`vamp=${setup.vampiricMob} ${pct(setup.vampiricBonus)}`);
  if (setup.voidsMob) parts.push(`void=${setup.voidsMob} ${pct(setup.voidsBonus)}`);
  return parts.join('; ');
}

function topRejectedCandidates(turn, limit = 8) {
  return (turn.rejected || []).slice(0, limit).map((r, idx) => {
    const shape = r.candidate && r.candidate.shape ? r.candidate.shape.join('>') : '-';
    const cuts = r.candidate && r.candidate.cuts ? r.candidate.cuts.join(',') : '-';
    const violations = (r.violations || []).map(formatViolation).join(' || ');
    return `${idx + 1}. shape=${shape} cuts=${cuts}: ${violations || 'sem violações listadas'}`;
  });
}

function sessionMatchesWindowDate(pair, windowFilter) {
  if (!windowFilter || !windowFilter.date) return true;
  const sd = parseSessionDate(pair.sv);
  if (!sd) return true; // sem cabeçalho (fixture de sessão única) — não dá pra descartar por data
  return sd.year === windowFilter.date.year && sd.month === windowFilter.date.month && sd.day === windowFilter.date.day;
}

// D-016: sessões >= 16/Jun/2026 usam js/mob-element-mods-post-2026-06-16.js. Decisão do
// usuário em 12/Jul/2026: escopo de investigação (--post-cutoff-only) restrito a essas
// sessões — pré-cutoff tinha uma mecânica de bônus de leech que não existe mais no jogo
// atual, então gastar energia validando contradições de leech ali não compensa.
const CUTOFF = { year: 2026, month: 6, day: 16 };
function isPostCutoffSession(sv) {
  const sd = parseSessionDate(sv);
  if (!sd) return false;
  if (sd.year !== CUTOFF.year) return sd.year > CUTOFF.year;
  if (sd.month !== CUTOFF.month) return sd.month > CUTOFF.month;
  return sd.day >= CUTOFF.day;
}

// As exclusões vivem em DOIS níveis, e eles não se misturam:
//
// - Nível CORPUS (`CORPUS_EXCLUSIONS`, em tools/unified-corpus.mjs): o par/sessão não é
//   classificado por ferramenta nenhuma. É o catálogo canônico, citado por
//   docs/CLASSIFICATION_RULES.md e pelo hash de identidade do dump. Este relatório o
//   CONSOME em vez de manter uma cópia própria — a cópia divergia (deixava `drome` inteiro
//   entrar aqui e sair do dump, inflando o total em 25 turnos que são duplicata de bakra).
// - Nível ESCOPO DE INVESTIGAÇÃO (abaixo): a sessão/turno É classificada, mas seus
//   `unresolved` não contam como pendência acionável. Não entra em `CORPUS_EXCLUSIONS`
//   porque isso apagaria a sessão do dump aceito, perdendo classificações válidas.
function isCorpusExcludedSession(serverName, sv) {
  const sd = parseSessionDate(sv);
  return CORPUS_EXCLUSIONS.some(exclusion => {
    if (exclusion.server !== serverName) return false;
    if (exclusion.year == null) return true; // arquivo inteiro
    return !!sd
      && exclusion.year === sd.year
      && exclusion.month === sd.month
      && exclusion.day === sd.day
      && exclusion.saveSec === sd.saveSec;
  });
}

// ESCOPO DE INVESTIGAÇÃO. A sessão `mazzerinbarrage` salva 28/Jun/2026 23:02:16 tem
// múltiplos setups de leech dentro da MESMA sessão (troca de arma no meio da caçada) —
// confirmado por revisão manual do usuário em 12/Jul/2026. A inferência de leech do motor é
// única por sessão (C-006); detectar múltiplos setups intra-sessão é fora de escopo (já
// difícil o suficiente com um só). Pulada incondicionalmente, não só sob
// --post-cutoff-only; o total de sessões puladas aparece no cabeçalho do relatório.
function isKnownMultiLeechSetupSession(label, sv) {
  if (label !== 'mazzerinbarrage') return false;
  const sd = parseSessionDate(sv);
  return !!sd && sd.year === 2026 && sd.month === 6 && sd.day === 28;
}

// Turnos com comportamento conhecido e escolhido não trabalhar (docs/CLASSIFICATION_RULES.md,
// D-010c-nota): `active elemental amplification` está bugada no jogo (pierce 0%), mas a spec
// modela 0,16 de propósito. Isso só quebra reconstrução holy de mob resistente + amplification.
// Decisão do usuário (13/Jul/2026): não modelar (sem regra por data pré/pós), marcar como
// conhecido. Chave: `label|YYYY-MM-DD|HH:MM:SS`.
const KNOWN_ACCEPTED_UNRESOLVED = new Set([
  'mrowdy 2|2026-06-11|17:19:16',
  'mazzerinbarrage|2026-07-09|01:25:57',
  'mazzerinbarrage|2026-07-09|01:26:06',
]);
function isKnownAcceptedUnresolved(label, sv, ts) {
  const sd = parseSessionDate(sv);
  if (!sd) return false;
  const key = `${label}|${sd.year}-${String(sd.month).padStart(2, '0')}-${String(sd.day).padStart(2, '0')}|${clock(ts)}`;
  return KNOWN_ACCEPTED_UNRESOLVED.has(key);
}

// REVOGADO. A decisão do usuário de 19/Jul/2026 tirava do escopo de investigação todo turno
// sem classificação cuja causa fosse leech no regime PRÉ-cutoff ("a mecânica de bônus de leech
// daquele regime não existe mais no jogo, não há o que corrigir"). Ela foi revogada em
// 11/Ago/2026 e a família foi de fato fechada em 12/Ago/2026 por `S-014f` (o problema era o
// VETO por leech em turno de boss, não a mecânica extinta): 246 -> 52 turnos sem classificação.
// Manter o filtro ligado por padrão escondia, sem flag nenhuma, metade do resíduo restante.
//
// O que sobrou é só CONTAGEM: os turnos entram normalmente na pendência acionável, e a coluna
// diz quantos deles são dessa causa nesse regime — útil porque é onde mora a maior parte do
// resíduo. Nada é excluído aqui, e não existe mais flag de opt-in/opt-out (`--post-cutoff-only`
// continua existindo, e é outra coisa: derruba TODO o pré-cutoff, leech ou não).
const LEECH_CAUSED_CATEGORIES = new Set([
  'unresolved_by_leech_contradiction',
  'unresolved_by_missing_leech_setup',
]);
function isPreCutoffLeech(turn, sv) {
  return !isPostCutoffSession(sv) && LEECH_CAUSED_CATEGORIES.has(unresolvedCategory(turn));
}

function runPair(ctx, label, serverName, localName, windowFilter, postCutoffOnly) {
  const serverPath = path.join(LOG_DIR, serverName);
  const localPath = path.join(LOG_DIR, localName);
  if (!fs.existsSync(serverPath) || !fs.existsSync(localPath)) {
    return { label, serverName, localName, missing: true, turns: [] };
  }
  // Classifica CADA porção separadamente (crit/leech por-porção); agrega os turnos
  // sem classificação de todas as porções.
  const pairs = sessionsOf(read(serverPath), read(localPath));
  const opts = {
    mobModsPre: ctx.MOB_ELEMENT_MODS,
    mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
    strictLeech: true,
    maxOriginal: 6000,
    useFloat16Mitigation: true,
  };
  const allUnresolved = [];
  let version, status = 'resolved', totalTurns = 0, goldObs = 0, leechSetup = null, lastError = null, knownAccepted = 0, preCutoffLeech = 0, partialEdge = 0, scopeSkippedSessions = 0;
  pairs.forEach((pair, sessionIndex) => {
    // Pula sessões de data diferente da janela pedida — evita classificar sessões
    // que já sabemos que não vão contribuir com nenhum turno filtrado.
    if (!sessionMatchesWindowDate(pair, windowFilter)) return;
    if (postCutoffOnly && !isPostCutoffSession(pair.sv)) return;
    if (isCorpusExcludedSession(serverName, pair.sv)) return;
    if (isKnownMultiLeechSetupSession(label, pair.sv)) { scopeSkippedSessions++; return; }
    const result = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, opts);
    if (result.error) { lastError = result.error; return; }
    version = result.version;
    if (result.status === 'partial') status = 'partial';
    totalTurns += (result.turns || []).length;
    goldObs += result.goldLeechObservationCount || 0;
    leechSetup = result.leechSetup || leechSetup;
    for (const t of (result.turns || [])) {
      if (windowFilter && (t.ts < windowFilter.start || t.ts > windowFilter.end)) continue;
      // T-007/A-009: turno parcial sem evidência fica FORA da contagem de sem classificação
      // por regra — mas contado, não pulado em silêncio. Sem esta coluna a categoria some
      // da fotografia e o bruto observado não fecha com o dump.
      if (t && t.partialEdgeMissingEvidence) { partialEdge++; continue; }
      if (isKnownAcceptedUnresolved(label, pair.sv, t.ts)) { knownAccepted++; continue; }
      if (t.status === 'unresolved' || (t.components || []).some(c => c.comp === 'unresolved')) {
        if (isPreCutoffLeech(t, pair.sv)) preCutoffLeech++; // só conta; não exclui (ver acima)
        t.sessionIndex = sessionIndex;
        allUnresolved.push(t);
      }
    }
  });
  if (!pairs.length || (!totalTurns && lastError)) return { label, serverName, localName, error: lastError || 'no_sessions', turns: [] };
  return {
    label,
    serverName,
    localName,
    version,
    status,
    sessionCount: pairs.length,
    totalTurns,
    unresolvedTurns: allUnresolved.length,
    knownAcceptedUnresolved: knownAccepted,
    preCutoffLeechCounted: preCutoffLeech,
    partialEdgeExcluded: partialEdge,
    scopeSkippedSessions,
    resolvedWithoutLeech: null,
    leechSetup,
    goldLeechObservationCount: goldObs,
    turns: allUnresolved,
  };
}

function writeReport(results, windowFilter) {
  const totalTurns = results.reduce((s, r) => s + (r.totalTurns || 0), 0);
  const totalUnresolved = results.reduce((s, r) => s + (r.unresolvedTurns || 0), 0);
  const lines = [];
  lines.push('# Relatório de Turnos sem Classificação pelo Unified');
  lines.push('');
  lines.push(`Gerado em: ${new Date().toISOString()}`);
  lines.push(`Motor: ${results.find(r => r.version)?.version || 'UnifiedClassificationEngine'}`);
  if (windowFilter) {
    const dateStr = windowFilter.date ? `${String(windowFilter.date.day).padStart(2, '0')}/${windowFilter.date.monthLabel}/${windowFilter.date.year} ` : '';
    lines.push(`Janela filtrada: ${dateStr}${clock(windowFilter.start)}-${clock(windowFilter.end)}`);
  }
  lines.push('');
  lines.push('Fonte normativa lida antes da execução: `docs/CLASSIFICATION_RULES.md`.');
  lines.push('');
  const totalPreCutoffLeech = results.reduce((s, r) => s + (r.preCutoffLeechCounted || 0), 0);
  const totalPartialEdge = results.reduce((s, r) => s + (r.partialEdgeExcluded || 0), 0);
  const totalKnownAccepted = results.reduce((s, r) => s + (r.knownAcceptedUnresolved || 0), 0);
  const totalScopeSkipped = results.reduce((s, r) => s + (r.scopeSkippedSessions || 0), 0);
  lines.push(`Resumo geral: ${totalUnresolved} turnos sem classificação em ${totalTurns} turnos processados, ${results.length} pares de logs varridos.`);
  lines.push('');
  lines.push('Bruto observado = pendência acionável + as duas categorias excluídas abaixo. Elas não se somam à acionável nem entre si.');
  lines.push('');
  lines.push(`- Leech pré-cutoff (**informativo, já contado na acionável**): **${totalPreCutoffLeech}** — quantos dos turnos acima têm causa de leech em sessão pré-cutoff (D-016). A decisão de 19/Jul/2026 que os excluía por padrão foi **revogada** (11/Ago/2026) e a família foi fechada por \`S-014f\` (12/Ago/2026); a coluna virou contagem, não exclusão, e a flag \`--include-pre-cutoff-leech\` deixou de existir.`);
  lines.push(`- Partial edge (T-007/A-009): **${totalPartialEdge}** — primeiro turno cortado pela borda da sessão, sem evidência para classificar; fora da contagem por regra.`);
  lines.push(`- Irresolúvel aceito (catálogo do relatório): **${totalKnownAccepted}**.`);
  if (totalScopeSkipped) {
    lines.push(`- Sessões puladas por escopo de investigação: **${totalScopeSkipped}** (setup de leech múltiplo intra-sessão, C-006).`);
  }
  lines.push('');
  lines.push('Exclusões de nível corpus (`CORPUS_EXCLUSIONS`) não aparecem aqui: o par/sessão não é classificado por ferramenta nenhuma.');
  lines.push('');
  lines.push('## Resumo por log');
  lines.push('');
  lines.push('| Log | Turnos | Sem classificacao | Leech pre-cutoff (informativo, ja contado) | Partial edge (T-007/A-009) | Irresoluvel aceito | Sem N_leech | Gold | Leech setup | Status |');
  lines.push('|---|---:|---:|---:|---:|---:|---|---:|---|---|');
  for (const r of results) {
    const status = r.missing ? 'arquivo ausente' : (r.error ? `erro: ${r.error}` : (r.status || '-'));
    const without = r.resolvedWithoutLeech
      ? `R${r.resolvedWithoutLeech.resolved_without_leech}/A${r.resolvedWithoutLeech.ambiguous_without_leech}/U${r.resolvedWithoutLeech.unresolved_without_leech}`
      : '-';
    lines.push(`| ${r.label} | ${r.totalTurns || 0} | ${r.unresolvedTurns || 0} | ${r.preCutoffLeechCounted || 0} | ${r.partialEdgeExcluded || 0} | ${r.knownAcceptedUnresolved || 0} | ${without} | ${r.goldLeechObservationCount || 0} | ${formatLeechSetup(r.leechSetup)} | ${status} |`);
  }
  lines.push('');
  lines.push('## Turnos sem classificação');
  lines.push('');
  lines.push('## Leech setup por log');
  lines.push('');
  for (const r of results) {
    if (r.missing || r.error) continue;
    lines.push(`- ${r.label}: ${formatLeechSetup(r.leechSetup)}`);
  }
  lines.push('');
  lines.push('## Motivos agregados');
  lines.push('');
  const categories = new Map();
  for (const r of results) {
    for (const turn of r.turns || []) {
      const key = unresolvedCategory(turn);
      categories.set(key, (categories.get(key) || 0) + 1);
    }
  }
  for (const [key, count] of [...categories.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`- ${key}: ${count}`);
  }
  lines.push('');
  for (const r of results) {
    if (!r.turns.length) continue;
    lines.push(`### ${r.label}`);
    lines.push('');
    lines.push(`Arquivos: \`${r.serverName}\` + \`${r.localName}\`.`);
    lines.push('');
    for (const turn of r.turns) {
      const counts = countComponents(turn);
      const session = turn.sessionIndex != null ? ` sessão ${turn.sessionIndex}` : '';
      lines.push(`#### ${clock(turn.ts)}${session} (${counts.total} hits)`);
      lines.push('');
      lines.push(`Motivo final do unified: \`${unresolvedCategory(turn)}\` (raw: \`${turn.reason || 'sem_motivo'}\`).`);
      lines.push('');
      lines.push(`Hits: ${hitSummary(turn.hits) || '-'}`);
      lines.push('');
      const grouped = rejectedSummary(turn);
      if (grouped.length) {
        lines.push('Lógicas atuais que falharam:');
        for (const item of grouped) lines.push(`- ${item.count}x ${formatViolation(item.v)}`);
      } else {
        lines.push('Lógicas atuais que falharam: nenhuma violação detalhada foi exposta pelo engine; o turno ficou sem partição válida/sem nomeação pública.');
      }
      const top = topRejectedCandidates(turn);
      if (top.length) {
        lines.push('');
        lines.push('Candidatos rejeitados pelo unified:');
        for (const row of top) lines.push(`- ${row}`);
      }
      lines.push('');
    }
  }
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, lines.join('\n'), 'utf8');
  return { totalTurns, totalUnresolved, outPath: OUT_PATH };
}

const ctx = loadEngine();
const pairArgIndex = process.argv.indexOf('--pair');
const onlyPair = pairArgIndex >= 0 ? String(process.argv[pairArgIndex + 1] || '').toLowerCase() : '';
const pairsArgIndex = process.argv.indexOf('--pairs');
const onlyPairs = pairsArgIndex >= 0
  ? new Set(String(process.argv[pairsArgIndex + 1] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
  : null;
const selectedPairs = onlyPair
  ? PAIRS.filter(([label]) => label.toLowerCase() === onlyPair)
  : onlyPairs
    ? PAIRS.filter(([label]) => onlyPairs.has(label.toLowerCase()))
  : PAIRS;
if ((onlyPair || onlyPairs) && !selectedPairs.length) {
  console.error(`Par não encontrado: ${onlyPair}`);
  console.error(PAIRS.map(([label]) => `- ${label}`).join('\n'));
  process.exit(2);
}

// --window "HH:MM(:SS)-HH:MM(:SS)" ou "DD/Mon/YYYY HH:MM(:SS)-HH:MM(:SS)" — filtra os
// turnos sem classificação pra uma janela de horário (e opcionalmente uma data de sessão),
// em vez de precisar mapear janela->sessionIndex manualmente depois com um script à parte.
const windowArgIndex = process.argv.indexOf('--window');
const windowArg = windowArgIndex >= 0 ? String(process.argv[windowArgIndex + 1] || '') : '';
let windowFilter = null;
if (windowArg) {
  const m = /^(?:(\d{1,2})\/(\w{3})\/(\d{4})\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?-(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(windowArg.trim());
  if (!m) {
    console.error(`--window invalida: "${windowArg}". Use "HH:MM-HH:MM" ou "DD/Mon/YYYY HH:MM-HH:MM" (ex.: "09/Jul/2026 01:20-01:26").`);
    process.exit(2);
  }
  const [, day, mon, year, h1, mi1, s1, h2, mi2, s2] = m;
  const toSec = (h, mi, s) => (+h) * 3600 + (+mi) * 60 + (+(s || 0));
  windowFilter = {
    date: day ? { day: +day, month: MONTHS[mon] || 0, monthLabel: mon, year: +year } : null,
    start: toSec(h1, mi1, s1),
    end: toSec(h2, mi2, s2),
  };
  if (windowFilter.date && !windowFilter.date.month) {
    console.error(`Mes desconhecido em --window: "${mon}".`);
    process.exit(2);
  }
}

const postCutoffOnly = process.argv.includes('--post-cutoff-only');

const results = [];
for (const [label, sv, lc] of selectedPairs) {
  console.error(`[unified-report] processando ${label}...`);
  const row = runPair(ctx, label, sv, lc, windowFilter, postCutoffOnly);
  results.push(row);
  const skipped = row.preCutoffLeechCounted ? `, ${row.preCutoffLeechCounted} deles leech pré-cutoff` : '';
  const edge = row.partialEdgeExcluded ? `, ${row.partialEdgeExcluded} partial edge` : '';
  console.error(`[unified-report] ${label}: ${row.unresolvedTurns || 0}/${row.totalTurns || 0} sem classificação${skipped}${edge} (${row.error || row.status || 'ok'})`);
}
const summary = writeReport(results, windowFilter);

console.log(JSON.stringify({
  output: summary.outPath,
  window: windowFilter ? windowArg : null,
  totalTurns: summary.totalTurns,
  totalUnresolved: summary.totalUnresolved,
  knownAcceptedUnresolved: results.reduce((s, r) => s + (r.knownAcceptedUnresolved || 0), 0),
  preCutoffLeechCounted: results.reduce((s, r) => s + (r.preCutoffLeechCounted || 0), 0),
  partialEdgeExcluded: results.reduce((s, r) => s + (r.partialEdgeExcluded || 0), 0),
  scopeSkippedSessions: results.reduce((s, r) => s + (r.scopeSkippedSessions || 0), 0),
  pairs: results.map(r => ({
    label: r.label,
    totalTurns: r.totalTurns || 0,
    unresolvedTurns: r.unresolvedTurns || 0,
    knownAcceptedUnresolved: r.knownAcceptedUnresolved || 0,
    preCutoffLeechCounted: r.preCutoffLeechCounted || 0,
    partialEdgeExcluded: r.partialEdgeExcluded || 0,
    status: r.missing ? 'missing' : (r.error || r.status || 'ok'),
  })),
}, null, 2));
