#!/usr/bin/env node

import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { UnifiedCorpus } from './unified-corpus.mjs';

const COMPONENTS = Object.freeze(['arrow', 'spell', 'rune', 'grenade']);
const ALLOWED_SHAPES = new Set([
  'arrow',
  'spell',
  'rune',
  'grenade',
  'arrow+spell',
  'arrow+rune',
  'arrow+grenade',
  'spell+grenade',
  'rune+grenade',
  'arrow+spell+grenade',
  'arrow+rune+grenade',
]);
const LIFE_BASE_GRID = new Set();
const MANA_BASE_GRID = new Set();
for (const imbued of [0, 0.25, 0.5]) {
  for (let conviction = 0; conviction <= 4; conviction++) {
    for (let weapon = 0; weapon <= 10; weapon++) {
      LIFE_BASE_GRID.add((imbued + conviction * 0.0075 + weapon * 0.01).toFixed(4));
    }
  }
}
for (const imbued of [0, 0.08, 0.16]) {
  for (let conviction = 0; conviction <= 4; conviction++) {
    for (let weapon = 0; weapon <= 4; weapon++) {
      MANA_BASE_GRID.add((imbued + conviction * 0.0025 + weapon * 0.01).toFixed(4));
    }
  }
}
const VAMPIRIC_BONUSES = new Set(['0.0160', '0.0240', '0.0320']);
const VOIDS_BONUSES = new Set(['0.0080', '0.0120', '0.0160']);

function fmtSec(ts) {
  const normalized = ((+ts % 86400) + 86400) % 86400;
  const hour = Math.floor(normalized / 3600);
  const minute = Math.floor((normalized % 3600) / 60);
  const second = Math.floor(normalized % 60);
  return [hour, minute, second].map(value => String(value).padStart(2, '0')).join(':');
}

function componentCounts(turn) {
  const counts = Object.fromEntries(COMPONENTS.map(component => [component, 0]));
  for (const component of turn.components || []) {
    const kind = component.comp || component.kind;
    if (kind in counts) counts[kind] += (component.hits || []).filter(isMainObservedHit).length;
  }
  return counts;
}

function observedHitKey(hit) {
  return hit.id ?? `${hit.seq}:${hit.ts}:${hit.mob}:${hit.dmg}`;
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isProcHit(hit) {
  return !!(hit && (
    hit.damageReflection
    || hit.woundCharm
    || hit.overpowerCharm
    || hit.divineWrathCharm
    || hit.kind === 'charm'
    || /\b(?:damage reflection|wound charm|overpower charm|divine wrath charm)\b/i.test(String(hit.rawLine || ''))
  ));
}

function isMainObservedHit(hit) {
  return !!hit && !hit.virtual && !isProcHit(hit);
}

function hitMultiset(hits) {
  const counts = new Map();
  for (const hit of hits || []) {
    const key = observedHitKey(hit);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function circularForwardSeconds(fromTs, toTs) {
  return ((+toTs - +fromTs) % 86400 + 86400) % 86400;
}

function circularDistanceSeconds(leftTs, rightTs) {
  const forward = circularForwardSeconds(leftTs, rightTs);
  return Math.min(forward, 86400 - forward);
}

function actionEligibility(component) {
  const kind = component.comp || component.kind;
  if (!['spell', 'rune', 'grenade'].includes(kind)) return null;
  const action = component.action;
  const profile = action && action.profile;
  if (!action || !profile) return `${kind}_without_concrete_action`;
  if (kind === 'spell') {
    const type = action.type || profile.type;
    if (type !== 'attack'
      || profile.element === 'unknown'
      || !['single', 'area'].includes(profile.topology)
      || /^adori\b/i.test(String(action.text || ''))) {
      return 'spell_profile_not_offensive';
    }
  }
  if (kind === 'rune') {
    if (action.ignored
      || profile.element === 'unknown'
      || !['single', 'area'].includes(profile.topology)) {
      return 'rune_profile_not_offensive';
    }
  }
  if (kind === 'grenade') {
    const type = action.type || profile.type;
    if (type !== 'grenade'
      || profile.element === 'unknown'
      || profile.topology !== 'area') {
      return 'grenade_profile_not_offensive';
    }
  }
  return null;
}

function candidateComponents(turn) {
  return (turn.rejected || [])
    .filter(candidate => candidate && candidate.ok === true)
    .flatMap(candidate => candidate.candidate?.components || candidate.components || []);
}

function grenadeImpactViolations(turns) {
  const byCast = new Map();
  for (const turn of turns) {
    for (const component of turn.components || []) {
      if ((component.comp || component.kind) !== 'grenade') continue;
      const action = component.action || {};
      const key = action.seq ?? action.id ?? `sem-cast@${turn.ts}:${component.id || ''}`;
      if (!byCast.has(key)) {
        byCast.set(key, {
          label: action.ts == null ? String(key) : fmtSec(action.ts),
          turns: new Set(),
          impacts: new Set(),
        });
      }
      const group = byCast.get(key);
      group.turns.add(turn.ts);
      for (const hit of component.hits || []) {
        if (isMainObservedHit(hit)) group.impacts.add(hit.ts);
      }
    }
  }

  const violations = [];
  for (const group of byCast.values()) {
    const turnTimes = [...group.turns].sort((a, b) => a - b);
    const impactTimes = [...group.impacts].sort((a, b) => a - b);
    const anchor = turnTimes[0] ?? impactTimes[0] ?? 0;
    if (turnTimes.length > 1) {
      violations.push({
        ts: anchor,
        rule: 'M-025',
        msg: `cast ${group.label} explica granada em ${turnTimes.length} turnos (${turnTimes.map(fmtSec).join(', ')})`,
      });
    }
    const validRollover = impactTimes.length === 2
      && impactTimes[1] === impactTimes[0] + 1
      && turnTimes.length === 1;
    if (impactTimes.length > 1 && !validRollover) {
      violations.push({
        ts: anchor,
        rule: 'M-024',
        msg: `cast ${group.label} tem timestamps de impacto invalidos (${impactTimes.map(fmtSec).join(', ')})`,
      });
    }
  }
  return violations;
}

function turnInvariantViolations(turn, result) {
  const counts = componentCounts(turn);
  const violations = [];
  const observed = hitMultiset((turn.hits || []).filter(isMainObservedHit));
  const assignedMainHits = (turn.components || [])
    .flatMap(component => component.hits || [])
    .filter(isMainObservedHit);
  const assigned = hitMultiset(assignedMainHits);
  let lost = 0;
  let duplicatedOrPhantom = 0;
  for (const [key, count] of observed) {
    lost += Math.max(0, count - (assigned.get(key) || 0));
  }
  for (const [key, count] of assigned) {
    duplicatedOrPhantom += Math.max(0, count - (observed.get(key) || 0));
  }
  if (lost) {
    violations.push({ ts: turn.ts, rule: 'T-003', msg: `${lost} hit(s) observado(s) sem componente` });
  }
  if (duplicatedOrPhantom) {
    violations.push({
      ts: turn.ts,
      rule: 'R-001/T-004',
      msg: `${duplicatedOrPhantom} atribuicao(oes) duplicada(s) ou hit(s) fantasma(s)`,
    });
  }
  if (result.vocation !== 'paladin' && counts.arrow > 1) {
    violations.push({ ts: turn.ts, rule: 'M-032', msg: `AA=${counts.arrow} fora de RP` });
  }

  const observedHits = (turn.hits || []).filter(isMainObservedHit);
  const mobs = new Set(observedHits.map(hit => hit.mob));
  const uniqueBossTarget = mobs.size === 1 && observedHits.length > 0 && observedHits.every(hit => hit.articleless);
  for (const component of turn.components || []) {
    const kind = component.comp || component.kind;
    const hits = component.hits || [];
    const hitCount = hits.filter(isMainObservedHit).length;
    if (uniqueBossTarget && hitCount > 1) {
      violations.push({ ts: turn.ts, rule: 'M-009', msg: `${kind} com ${hitCount} hits no boss unitario` });
    }
    const eligibility = actionEligibility(component);
    if (eligibility) {
      violations.push({
        ts: turn.ts,
        rule: kind === 'rune' ? 'M-018/M-022/N-005' : 'M-011/M-016/N-003/N-009',
        msg: eligibility,
      });
    }
    if ((kind === 'spell' || kind === 'rune') && component.action?.profile?.topology === 'single' && hitCount > 1) {
      violations.push({
        ts: turn.ts,
        rule: kind === 'spell' ? 'M-006' : 'M-033',
        msg: `${kind} single-target com ${hitCount} hits`,
      });
    }
    if (['spell', 'rune', 'grenade'].includes(kind)) {
      const label = String(component.actionLabel || '').toLowerCase();
      if (!label || ['spell', 'rune', 'grenade'].includes(label)) {
        violations.push({ ts: turn.ts, rule: 'N-010', msg: `rotulo generico/ausente para ${kind}` });
      }
    }
    if (kind === 'spell' && component.action && !component.action.profile?.multiStage) {
      const outside = hits.filter(isMainObservedHit)
        .some(hit => circularDistanceSeconds(component.action.ts, hit.ts) > 1);
      if (outside) {
        violations.push({ ts: turn.ts, rule: 'M-012/M-013', msg: 'spell fora da janela de ±1s' });
      }
    }
    if (kind === 'grenade' && component.action) {
      const outside = hits.filter(isMainObservedHit).some(hit => {
        const delay = circularForwardSeconds(component.action.ts, hit.ts);
        return delay < 2 || delay > 4;
      });
      if (outside) {
        violations.push({ ts: turn.ts, rule: 'M-023/M-028/N-004', msg: 'granada fora da janela cast+2..cast+4' });
      }
    }
    // S-004b: `ok === false` mistura contradicao mecanica com evidencia ausente (D-006).
    // O motor declara a classe do proprio veredito; a auditoria so le. Fail-loud: um
    // motivo novo sem classe declarada continua sendo violacao.
    if (component.deterministic && component.deterministic.ok === false
      && component.deterministic.evidence !== 'absent') {
      violations.push({ ts: turn.ts, rule: 'S-004/H-001/H-002', msg: `${kind} contradiz diagnostico deterministico` });
    }
    if (component.leech && component.leech.usable === true && component.leech.ok === false) {
      const consensus = component.leech.consensus || {};
      const acceptedAbstention = component.leech.neutral
        || component.leech.cappedLow
        || consensus.neutralOnly
        || ((consensus.cappedLowCount || 0) > 0
          && !(consensus.failedCount > 0)
          && !(consensus.contradictionCount > 0));
      if (!acceptedAbstention) {
        violations.push({ ts: turn.ts, rule: 'D-024/S-014/H-003/H-004', msg: `${kind} contradiz diagnostico de leech` });
      }
    }
    for (const hit of hits) {
      if (isProcHit(hit) && !hit.virtual) {
        violations.push({ ts: turn.ts, rule: 'C-008', msg: `proc ${observedHitKey(hit)} virou hit principal de ${kind}` });
      }
      if (hit.virtual && !hit.charmKilledBeforeHit) {
        violations.push({ ts: turn.ts, rule: 'S-014e', msg: `hit virtual ${observedHitKey(hit)} sem prova canonica de kill` });
      }
    }
  }
  for (const component of candidateComponents(turn)) {
    const eligibility = actionEligibility(component);
    if (!eligibility) continue;
    const kind = component.comp || component.kind;
    violations.push({
      ts: turn.ts,
      rule: kind === 'rune' ? 'M-018/M-022/N-005' : 'M-011/M-016/N-003/N-009',
      msg: `candidato valido: ${eligibility}`,
    });
  }
  if (counts.spell > 0 && counts.rune > 0) {
    violations.push({ ts: turn.ts, rule: 'T-006', msg: 'spell e runa coexistem no mesmo turno' });
  }
  const namedComponents = (turn.components || []).filter(component => COMPONENTS.includes(component.comp || component.kind));
  const componentKinds = namedComponents.map(component => component.comp || component.kind);
  const arrowInstances = componentKinds.filter(kind => kind === 'arrow').length;
  const spellInstances = componentKinds.filter(kind => kind === 'spell').length;
  if (arrowInstances > 1) {
    violations.push({ ts: turn.ts, rule: 'M-002/M-003', msg: `${arrowInstances} instancias de AA no ciclo` });
  }
  if (spellInstances > 1) {
    violations.push({ ts: turn.ts, rule: 'U-004', msg: `${spellInstances} spells ofensivas ordinarias no turno` });
  }
  const shape = [...new Set(componentKinds)].sort((a, b) => COMPONENTS.indexOf(a) - COMPONENTS.indexOf(b)).join('+');
  if (shape && !ALLOWED_SHAPES.has(shape)) {
    violations.push({ ts: turn.ts, rule: 'T-005', msg: `combinacao nao permitida: ${shape}` });
  }
  if (turn.status === 'unresolved') {
    if (!turn.reason) violations.push({ ts: turn.ts, rule: 'N-006/U-005', msg: 'unresolved sem razao explicita' });
    if (!(turn.components || []).some(component => (component.comp || component.kind) === 'unresolved')) {
      violations.push({ ts: turn.ts, rule: 'A-002/N-006/U-005', msg: 'unresolved sem componente explicito' });
    }
  }
  if (turn.status === 'resolved' && observed.size > 0 && !(turn.components || []).length) {
    violations.push({ ts: turn.ts, rule: 'A-001/A-003', msg: 'resolved sem componentes preservados' });
  }
  const orderedHits = (turn.hits || []).filter(hit => !hit.virtual);
  for (let index = 1; index < orderedHits.length; index++) {
    const previous = orderedHits[index - 1];
    const current = orderedHits[index];
    if (Number.isFinite(+previous.seq) && Number.isFinite(+current.seq) && +current.seq <= +previous.seq) {
      violations.push({ ts: turn.ts, rule: 'T-001a', msg: 'ordem de seq nao crescente' });
      break;
    }
    if (Number.isFinite(+previous.ordTs) && Number.isFinite(+current.ordTs) && +current.ordTs < +previous.ordTs) {
      violations.push({ ts: turn.ts, rule: 'T-001a', msg: 'ordTs regride na ordem do log' });
      break;
    }
  }
  return violations;
}

function actionReuseViolations(turns) {
  const uses = new Map();
  const violations = [];
  for (const turn of turns) {
    for (const component of turn.components || []) {
      const kind = component.comp || component.kind;
      if (!['spell', 'rune', 'grenade'].includes(kind) || !component.action) continue;
      const action = component.action;
      if (action.id == null && action.seq == null) continue;
      const key = action.id != null ? `id:${action.id}` : `${kind}:seq:${action.seq}`;
      if (!uses.has(key)) {
        uses.set(key, { turnTs: turn.ts, componentId: component.id, kind });
        continue;
      }
      const first = uses.get(key);
      if (first.turnTs === turn.ts && first.componentId === component.id) continue;
      violations.push({
        ts: turn.ts,
        rule: 'M-015/N-007/N-008',
        msg: `acao ${key} reutilizada em ${fmtSec(first.turnTs)} e ${fmtSec(turn.ts)}`,
      });
    }
  }
  return violations;
}

function setupViolations(result) {
  const setup = result?.leechSetup;
  if (!setup) return [];
  const ts = result.turns?.[0]?.ts ?? 0;
  const violations = [];
  if (Number.isFinite(+setup.lifeBase) && !LIFE_BASE_GRID.has((+setup.lifeBase).toFixed(4))) {
    violations.push({ ts, rule: 'D-020/C-006', msg: `lifeBase fora da grade: ${setup.lifeBase}` });
  }
  if (Number.isFinite(+setup.manaBase) && !MANA_BASE_GRID.has((+setup.manaBase).toFixed(4))) {
    violations.push({ ts, rule: 'D-020/C-006', msg: `manaBase fora da grade: ${setup.manaBase}` });
  }
  if (setup.vampiricMob && !VAMPIRIC_BONUSES.has((+setup.vampiricBonus).toFixed(4))) {
    violations.push({ ts, rule: 'D-021/D-022', msg: `bonus Vampiric Embrace invalido: ${setup.vampiricBonus}` });
  }
  if (setup.voidsMob && !VOIDS_BONUSES.has((+setup.voidsBonus).toFixed(4))) {
    violations.push({ ts, rule: 'D-021/D-022', msg: `bonus Void's Call invalido: ${setup.voidsBonus}` });
  }
  if (setup.vampiricMob && setup.voidsMob
    && normalizeName(setup.vampiricMob) === normalizeName(setup.voidsMob)) {
    violations.push({ ts, rule: 'D-021/D-022', msg: 'mesmo mob possui Vampiric Embrace e Void’s Call' });
  }
  return violations;
}

// D-016 vale nos DOIS sentidos: sessao datada antes de 16/Jun/2026 usa a tabela pre-corte,
// sessao datada de 16/Jun/2026 em diante usa exclusivamente a pos-corte. Sessao sem data nao
// pode escolher regime por suposicao, entao nao e auditada aqui (D-006/D-016).
function regimeViolations(result) {
  if (!(result?.sessionDateKey > 0)) return [];
  const expected = result.sessionDateKey < 20260616 ? 'pre-2026-06-16' : 'post-2026-06-16';
  const regime = result.mobModsRegime?.id || result.mobModsRegime;
  return regime === expected
    ? []
    : [{
        ts: result.turns?.[0]?.ts ?? 0,
        rule: 'D-016',
        msg: `sessao ${expected === 'pre-2026-06-16' ? 'pre' : 'pos'}-cutoff usa regime ${regime || 'ausente'}`,
      }];
}

export function checkUnifiedInvariants(result) {
  const turns = result?.turns || [];
  const violations = [
    ...grenadeImpactViolations(turns),
    ...actionReuseViolations(turns),
    ...setupViolations(result),
    ...regimeViolations(result),
  ];
  for (const turn of turns) violations.push(...turnInvariantViolations(turn, result));
  return violations.sort((a, b) => a.ts - b.ts || a.rule.localeCompare(b.rule));
}

export function runUnifiedInvariants({
  only = null,
  corpus = new UnifiedCorpus({ persistentCacheDir: 'reports/unified-cache' }),
  write = line => console.log(line),
} = {}) {
  const fixtures = corpus.discoverPairs()
    .filter(fixture => !only || `invariants/${fixture.key}`.includes(only));
  if (!fixtures.length) return { pass: 0, fail: 0, skipped: 0, empty: true, corpus };

  let pass = 0;
  let fail = 0;
  let skipped = 0;
  for (const fixture of fixtures) {
    const pairs = corpus.sessionsFor(fixture.server, fixture.local);
    if (pairs === null) {
      write(`SKIP invariants/${fixture.key}: arquivos ausentes`);
      skipped++;
      continue;
    }

    // Cobertura TOTAL por decisao do usuario (09/Ago/2026): toda sessao nao-excluida entra,
    // em qualquer regime. O antigo gate de data (D-017) so valia "enquanto o conjunto
    // pos-16-de-junho nao estiver preenchido", condicao ja expirada — e escondia quebras
    // reais em turnos RESOLVIDOS de kim/rpboss/uhax 3 ed. As unicas exclusoes legitimas sao
    // as canonicas de CORPUS_EXCLUSIONS, ja aplicadas por corpus.sessionsFor.
    let scopedTurns = 0;
    const violations = [];
    for (const pair of pairs) {
      const result = corpus.classify(fixture.server, fixture.local, pair, { profile: 'gabarito' });
      if (!result) continue;
      scopedTurns += (result.turns || []).length;
      violations.push(...checkUnifiedInvariants(result));
    }
    violations.sort((a, b) => a.ts - b.ts || a.rule.localeCompare(b.rule));

    if (!scopedTurns) {
      write(`SKIP invariants/${fixture.key}: nenhuma sessao classificavel (todas excluidas ou vazias)`);
      skipped++;
    } else if (violations.length) {
      const shown = violations.slice(0, 6)
        .map(violation => `${fmtSec(violation.ts)} ${violation.rule}: ${violation.msg}`)
        .join('; ');
      write(`FAIL invariants/${fixture.key}: ${shown}${violations.length > 6 ? ` (+${violations.length - 6})` : ''}`);
      fail++;
    } else {
      write(`PASS invariants/${fixture.key}: ${scopedTurns} turnos respeitam M-024/M-025, cardinalidade, T-006 e rotulos concretos`);
      pass++;
    }
  }
  write(`\n${pass}/${pass + fail} fixtures sem violacao de invariante mecanico; ${skipped} sem sessao classificavel`);
  return { pass, fail, skipped, empty: false, corpus };
}

function parseOnly(argv) {
  const index = argv.indexOf('--only');
  return index >= 0 ? (argv[index + 1] || '') : null;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const result = runUnifiedInvariants({ only: parseOnly(process.argv.slice(2)) });
  if (result.empty) {
    console.error('Nenhuma fixture de invariantes corresponde ao filtro.');
    process.exit(2);
  }
  process.exit(result.fail ? 1 : 0);
}
