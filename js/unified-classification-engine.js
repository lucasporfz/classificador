/*
 * unified-classification-engine.js
 *
 * NÃºcleo Ãºnico e isolado de classificaÃ§Ã£o mecÃ¢nica para logs de Tibia.
 * Objetivo: substituir a pilha histÃ³rica parser â†’ bandas â†’ passes especiais â†’ experimental
 * por um fluxo normativo Ãºnico, auditÃ¡vel e orientado por docs/CLASSIFICATION_RULES.md.
 *
 * Este arquivo NÃƒO altera UI/produÃ§Ã£o por conta prÃ³pria. Ele exporta:
 *   - globalThis.UnifiedClassificationEngine
 *   - module.exports, quando disponÃ­vel
 *
 * API principal:
 *   const result = UnifiedClassificationEngine.classifyUnified(serverLog, localChat, options)
 *
 * Options Ãºteis:
 *   getMobMods(mob, ctx)              // fonte externa de mods
 *   mobModsPre, mobModsPost           // mapas opcionais de mods por regime
 *   vocation                          // 'paladin'|'knight'|'sorcerer'|'druid'|'monk'|null
 *   playerName                        // speaker preferido do local chat
 *   leechSetup                        // { lifeBase, manaBase, vampiricMob?, vampiricBonus?, voidsMob?, voidsBonus? }
 *   maxOriginal                       // limite de busca para candidatos discretos, default 6000
 *   strictLeech                       // default true
 *   useFloat16Mitigation              // default true, para aproximar o comportamento do client/calculadora
 */
(function(root) {
  'use strict';

  const {
    VERSION,
    CUTOFF_KEY,
    ELEMENT_KEYS,
    ELEMENTS,
    SINGLE_TARGET_RUNES,
    IGNORED_RUNE_RE,
    IGNORED_SPELL_RE,
    SINGLE_TARGET_AA_VOCATIONS,
    RUNE_PROFILES,
    SPELL_PROFILES,
    SUPPORT_OR_HEAL_RE,
    MAGIC_PREFIX_RE,
    LIFE_IMBUEMENT_SLOTS,
    MANA_IMBUEMENT_SLOTS,
    LIFE_CONVICTION,
    MANA_CONVICTION,
    LIFE_WEAPON_PERK,
    MANA_WEAPON_PERK,
    LIFE_BASE_CANDIDATES,
    MANA_BASE_CANDIDATES,
    VAMPIRIC_BONUSES,
    VOIDS_BONUSES,
    bountyTalismanBonusForLevel,
    bountyTalismanLevelsWithinBonus,
    WEAPON_LEECH_BONUS,
    MAX_WEAPON_LEECH_BONUSES,
    SPELL_LEECH_BONUS_CANDIDATES,
    GRAV_SAN_INCANTATION,
    GRAV_SAN_DURATION_SECONDS,
    GRAV_SAN_BONUS_CANDIDATES,
    BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES,
    bestiaryClassMultiplierForHit,
    OMEGA_MULTIPLIER,
    CRIT_BUCKET_MIN_SAMPLES,
    CRIT_BOOTSTRAP_MAX,
    CRIT_MULTIPLIER_CANDIDATES,
    snapCritMultiplier,
    TRANSCENDENCE_WINDOW_SECONDS,
    TRANSCENDENCE_CRIT_BONUS,
    ONSLAUGHT_DAMAGE_MULTIPLIER,
    isTranscendenceActiveAt,
    PERFECT_SHOT_PREMIT_BONUS,
    LEECH_VALUE_TOLERANCE_SMALL_BLOCK,
    LEECH_VALUE_TOLERANCE_LARGE_BLOCK,
    LEECH_VALUE_TOLERANCE_SMALL_BLOCK_MAX,
    ELEMENTAL_INTERMEDIATE_TOLERANCE,
    PHYSICAL_INTERSECTION_TOLERANCE,
    ELEMENTAL_CLUSTER_MIN_TOLERANCE,
    ELEMENTAL_CLUSTER_MAX_TOLERANCE,
    ELEMENTAL_CLUSTER_RATIO,
    TERRA_BURST_BONUS_LEVELS,
    leechValueToleranceForN,
    sortedUnique,
    stackTotals,
    buildLeechBaseCandidates,
    officialLeechBaseCandidatesWithWeapon,
    normalizeName,
    elementalStateKey,
    pad2,
    tsToClock,
    median,
    percentile,
    mean,
    halfToFloat,
    f16round,
    sessionDateKey,
    effectiveMod,
    invFloor,
    invCeil,
    intersectInterval,
    intersectIntervalTol,
    intervalWidth,
    rangeArray,
    intersectSets,
    mitigationMultiplier,
    critKeyForBlock,
    criticalMultiplierForHit,
    inverseCriticalMultiplierIntervals,
    postMultiplier,
    inversePostMultiplierIntervals,
    inverseTerraBurstBonusIntervals,
    BONUS_TIER_ACTIONS,
    isTerraBurstAction,
    isTerraBurstBlock,
    EXECUTIONER_BONUS_LEVELS,
    isExecutionerThrowAction,
    pierceForElement,
    explicitBmPierceOption,
    distinctMainMobCount,
    getMobMods,
    elementalOriginalCandidates,
    physicalOriginalInterval,
    isMainHit,
      gravSanHitInWindow,
    gravSanMultiplierAtTs,
  } = root.UnifiedFormulas;

  const {
    normalizeRuneName,
    runeProfile,
    spellProfile,
    parseServerFacts,
    extractQuotedTarget,
    isSelfHealCastCandidate,
    inferSelectedSpeakerBySelfHealing,
    parseLocalChat,
    buildTurns,
    reconsolidateMultiStageWithLeech,
  } = root.UnifiedParsing;

  const {
    areaFactor,
    realDamageIntervalFromLeech,
    expectedLeech,
    leechDamageBasis,
    inferLeechSetup,
    unknownLeechSetup,
    unknownBountyTalismanSetup,
    leechSetupConfidence,
    canUseLeechAsHardReject,
    canScoreLeech,
    isLeechChannelContaminated,
    cloneHitForGoldObservation,
    componentGoldSource,
    componentGoldN,
    collectGoldLeechObservations,
    countOfficialLeechSources,
    scoreGoldBase,
    compareGoldBaseScores,
    scoreGoldBaseWithMobException,
    isMobEligibleForMinorCharm,
    detectCharmCandidateMobsFromColocatedTurns,
    inferLeechSetupJointBaseAndCharm,
    inferLeechSetupFromGoldObservations,
    inferBountyDamageFromFrozenComponents,
    inferLeechSetupFallback,
    inferAaElementForSession,
    collectTrustedLeechObservationsFromRuneUses,
    isTrustedLeechVoteCredible,
    buildEmpiricalLeechBaseCandidates,
    inferTrustedLeechChannel,
    compareTrustedLeechScores,
    scoreTrustedLeechSetup,
    applyExclusiveTrustedMinorLeechCharms,
    applyExclusiveMinorLeechCharms,
    inferLeechBaseMultiN,
    inferMinorLeechCharm,
    snapToClosest,
    isHolyRpPierceProbeBlock,
    deterministicWidth,
    bmDeterministicVerdict,
    scoreBmPierceCandidate,
    bmProbeBlockKey,
    physicalRpPierceProbeSubset,
    bmPhysicalDeterministicVerdict,
    scorePhysicalBmPierceCandidate,
    collectPhysicalBmProbeData,
    collectHolyBmProbeData,
    emptyBmPierceScore,
    inferBmPierceFromCrossMobEvidence,
  } = root.UnifiedSetupInference;

  const {
    effectiveLifeLeech,
    effectiveManaLeech,
    hitLeechFit,
    actionsNearTurn,
    resetConsolidatedActions,
    possibleShapes,
    segmentations,
    candidateFromShape,
    grenadeCandidateWindowInvalid,
    chooseActionForComponent,
    isSingleTargetAction,
    validateRuneUsingBoundary,
    validateCritHomogeneity,
    validatePhysicalBlock,
    intersectIntervals,
    elementalClusterTolerance,
    minimalCandidateCluster,
    addCandidateOriginalsForMode,
    validateTerraBurstBonusBlock,
    validateElementalBlock,
    validateLeechBlock,
    validateLeechBlockForN,
    gravSanModesForBlock,
    withGravSanBlockMode,
    blockValidationScoreForMode,
    compareBlockModeResult,
    validateBlockDeterministicAndLeechWithGravModes,
    validateLeechBlockOfficialRates,
    validateCandidate,
    timestampSplitPenalty,
    arrowPrefixIsAbsorbable,
    physicalAxisTimingDegenerate,
    physicalAxisSingleBlockAction,
    physicalAxisSplitIsPhysical,
    promotePhysicalAxisSingleBlockByLeech,
    elementalSameSecondTimingDemoted,
    scoreCandidate,
    compareValidated,
    leechPartitionScore,
    nearestSpellCastForTurn,
    nearestRuneUseForTurn,
    detectCharmKilledZeroAction,
    makeVirtualZeroHit,
    makeVirtualZeroHitForCharm,
    charmTypeName,
    isEligibleVirtualZeroCharm,
    canUseVirtualZeroForBlock,
    eligibleVirtualZeroCharmsForBlock,
    finalizeManualTurn,
    allSpellManaLeechHomogeneous,
    spellLeechBonusEntryForBlock,
    spellLeechBonusOptionsForBlock,
    leechMinorBonusOptionsForHit,
    leechEffectiveRateCandidates,
    observedLeechAcceptsN,
    hitAcceptsLeechNAnyOfficialRate,
    hasSparseLeechConfirmationWithoutContradiction,
    shouldOverrideSparseLeechForConcreteDeterministicSpell,
    leechConsensusVerdictFromFits,
    hitHasSingleTargetLeechSignature,
    hitRejectsComponentN,
    blockLeechSupportForN,
    shouldForceA1ByLeech,
    hasStrongTimestampAaSpellBoundary,
    hitStateKey,
    firstHitSharesExactOriginalWithRest,
    actionLabel,
  } = root.UnifiedValidation;

  const {
    enrichHitEvidence,
    resolveSingleTargetAaVocationTurn,
    resolveTurn,
    turnHasEligibleGrenadeCast,
    buildGrenadeCastAssignments,
    sameMobLeechBracketWinner,
    finalizeTurn,
    unresolvedTurn,
    hasConcreteOffensiveAction,
    isPartialEdgeMissingEvidence,
    partialEdgeMissingEvidenceTurn,
    aggregateRows,
  } = root.UnifiedTurnResolution;





  // S-004a/D-010a: chave de "mesmo mob no mesmo estado de modificadores" â€” mesmo mob +
  // mesmas condiÃ§Ãµes que afetam o dano (EW, prey, amplification, tipo de hit, crit,
  // Low Blow, Onslaught) implica mesma rolagem/reversÃ£o exata. Compartilhada entre a
  // homogeneidade intra-bloco (validateElementalBlock) e o override por dano final do
  // M-031 (validateCandidate), que usa a mesma noÃ§Ã£o entre dois blocos diferentes.
  // NÃƒO renomear para `hitStateKey` â€” esse nome jÃ¡ existe (mais adiante no arquivo,
  // H-005/S-004a) com um conjunto de campos mais estreito (sem amplification/type);
  // declaraÃ§Ãµes de funÃ§Ã£o com o mesmo nome no mesmo escopo colidem por hoisting.



  // FÃ³rmula normativa do pierce conforme calculadora/regras revisadas.

  // AnÃ¡logo, para intervalos contÃ­nuos, do `intersectSets(sets, tolerance)`
  // do eixo elemental: aceita um par de intervalos que nÃ£o se tocam
  // exatamente, desde que a lacuna nÃ£o passe de `tolerance`. Usada SÃ“ por
  // `intersectIntervals` (o acumulador de `validatePhysicalBlock`) â€” nÃ£o
  // substitui `intersectInterval`, cujos outros usos (ex.: interseÃ§Ã£o de 2
  // canais de leech) fazem uma Ãºnica chamada isolada e nÃ£o devem ganhar
  // folga nenhuma.




  // Chave de crÃ­tico do bloco: o crÃ­tico Ã© POR-COMPONENTE (build). AA/fÃ­sico â†’ 'physical';
  // spell/rune/grenade â†’ prefixado pela incantation/nome, para que dois spells do mesmo
  // elemento (Caldera vs granada) possam ter crÃ­ticos distintos. A MESMA funÃ§Ã£o rotula os
  // hits para a inferÃªncia (pass-1) e escolhe o multiplicador na reversÃ£o (pass-2).







  // Terra Burst (exevo ulus tera, earth) and Ice Burst (exevo ulus frigo, ice) are the
  // same target-life conditional-bonus mechanic, differing only by element â€” both actions
  // are recognized here so validateTerraBurstBonusBlock (element-agnostic already) applies
  // to either.















  function inferVocation(context, facts) {
    if (context.options && context.options.vocation) return normalizeName(context.options.vocation);
    const casts = facts.local.spellCasts || [];
    const counts = {};
    for (const c of casts) {
      const v = c.profile && c.profile.vocation;
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }

  function bossNameSet(hits) {
    // M-009: um mob Ã© boss (alvo Ãºnico, sem artigo) se TODAS as suas ocorrÃªncias como hit
    // principal aparecem sem artigo (a/an/the) no Server Log. DetecÃ§Ã£o por-mob (nÃ£o por
    // contagem de mobs distintos na sessÃ£o): uma sessÃ£o pode ter vÃ¡rios bosses + adds, e cada
    // boss Ã© reconhecido individualmente. CritÃ©rio conservador: uma Ãºnica ocorrÃªncia com
    // artigo exclui o mob. Boss de sessÃ£o-Ãºnica continua entrando (todas sem artigo) â†’ zero-drift.
    const seen = new Map(); // mob -> { total, articleless }
    for (const h of (hits || []).filter(isMainHit)) {
      const name = normalizeName(h.mob);
      const e = seen.get(name) || { total: 0, articleless: 0 };
      e.total++;
      if (h.articleless) e.articleless++;
      seen.set(name, e);
    }
    const bosses = new Set();
    for (const [name, e] of seen) {
      if (e.total > 0 && e.articleless === e.total) bosses.add(name);
    }
    return bosses;
  }



  function isWithinAnyWindow(ts, windows) {
    return (windows || []).some(w => Number.isFinite(+ts) && ts >= w.start && ts <= w.end);
  }

  function charmSignature(ev) {
    const raw = normalizeName(ev && ev.rawLine || '');
    if (ev && ev.overpowerCharm || raw.includes('overpower charm')) return 'overpower';
    if (ev && ev.woundCharm || raw.includes('wound charm')) return 'wound';
    if (raw.includes('poison charm')) return 'poison';
    if (raw.includes('enflame charm')) return 'enflame';
    if (raw.includes('freeze charm')) return 'freeze';
    if (raw.includes('zap charm')) return 'zap';
    if (raw.includes('overflux charm')) return 'overflux';
    if (raw.includes('divine wrath')) return 'divine_wrath';
    if (raw.includes('curse charm')) return 'curse';
    if (raw.includes('low blow')) return 'low_blow';
    if (raw.includes('savage blow')) return 'savage_blow';
    return raw.includes('charm') ? 'charm' : 'proc';
  }

  function comparableCharmRepresentative(
    events,
    minimumSamples,
    strategy,
    excludeKilledTarget,
  ) {
    const usable = (events || []).filter(ev =>
      ev && ev.dmg > 0 && (!excludeKilledTarget || !ev.killedTarget)
    );
    if (usable.length < minimumSamples) return null;
    if (strategy === 'median') {
      return {
        damage: median(usable.map(ev => ev.dmg)),
        count: usable.length,
        events: usable,
      };
    }
    const counts = new Map();
    for (const ev of usable) counts.set(ev.dmg, (counts.get(ev.dmg) || 0) + 1);
    const ranked = Array.from(counts, ([damage, count]) => ({ damage, count }))
      .sort((a, b) => b.count - a.count || a.damage - b.damage);
    if (!ranked.length || ranked[0].count < minimumSamples) return null;
    if (ranked[1] && ranked[1].count === ranked[0].count) return null;
    return {
      damage: ranked[0].damage,
      count: ranked[0].count,
      events: usable.filter(ev => ev.dmg === ranked[0].damage),
    };
  }

  // D-010g/D-030: um único avaliador canônico compara o mesmo proc de charm
  // sob dois estados observados. O chamador define apenas qual fato separa os
  // lados e como cada candidato faz o round-trip discreto.
  function evaluateComparableCharmWitnesses(events, {
    keyOf,
    isAffected,
    minimumControlSamples = 1,
    minimumAffectedSamples = 1,
    representative = 'mode',
    excludeKilledTarget = true,
    candidatesForRows,
    matchCandidate,
  }) {
    const groups = new Map();
    for (const ev of events || []) {
      if (!ev || ev.dmg <= 0 || (excludeKilledTarget && ev.killedTarget)) continue;
      const key = keyOf(ev);
      if (!groups.has(key)) groups.set(key, { key, control: [], affected: [] });
      groups.get(key)[isAffected(ev) ? 'affected' : 'control'].push(ev);
    }
    const rows = [];
    for (const group of groups.values()) {
      const control = comparableCharmRepresentative(
        group.control,
        minimumControlSamples,
        representative === 'affected_each' ? 'median' : representative,
        excludeKilledTarget,
      );
      if (representative === 'affected_each') {
        if (!control) continue;
        for (const ev of group.affected.filter(item =>
          item && item.dmg > 0 && (!excludeKilledTarget || !item.killedTarget)
        )) {
          rows.push({
            key: group.key,
            controlDamage: control.damage,
            affectedDamage: ev.dmg,
            controlCount: control.count,
            affectedCount: 1,
            controlEvents: control.events,
            affectedEvents: [ev],
          });
        }
        continue;
      }
      const affected = comparableCharmRepresentative(
        group.affected,
        minimumAffectedSamples,
        representative,
        excludeKilledTarget,
      );
      if (!control || !affected) continue;
      rows.push({
        key: group.key,
        controlDamage: control.damage,
        affectedDamage: affected.damage,
        controlCount: control.count,
        affectedCount: affected.count,
        controlEvents: control.events,
        affectedEvents: affected.events,
      });
    }
    const candidates = candidatesForRows(rows) || [];
    const ranked = candidates.map(candidate => {
      const matches = rows.map(row => matchCandidate(row, candidate));
      return {
        candidate,
        votes: matches.filter(match => match && match.ok).length,
        error: matches.reduce((sum, match) => sum + (match && match.error || 0), 0),
        matches,
      };
    }).sort((a, b) => b.votes - a.votes || a.error - b.error);
    const unanimous = ranked.filter(entry => rows.length > 0 && entry.votes === rows.length);
    return { rows, ranked, unanimous };
  }

  function bountyCharmStateKey(ev) {
    return [
      normalizeName(ev.mob),
      charmSignature(ev),
      ev.exposeWeakness ? 'ew' : 'no_ew',
      ev.isPrey ? 'prey' : 'no_prey',
      ev.elementalAmplification ? 'amplified' : 'not_amplified',
      ev.realCrit ? 'crit' : 'not_crit',
      ev.onslaught ? 'onslaught' : 'no_onslaught',
    ].join('|');
  }

  function inferBountyTalismanDamageSetup(serverFacts, gravSanSetup) {
    const allCharmEvents = ((serverFacts && serverFacts.events) || [])
      .filter(ev => ev && ev.kind === 'charm' && ev.dmg > 0)
      .filter(ev => !ev.killedTarget && !ev.overpowerCharm)
      .filter(ev => !ev.isPrey && !ev.elementalAmplification)
      .filter(ev => !isWithinAnyWindow(ev.ts, gravSanSetup && gravSanSetup.windows));
    if (!allCharmEvents.some(ev => ev.bountyTalisman)) {
      return unknownBountyTalismanSetup('no_bounty_talisman_damage_fact');
    }
    const evaluation = evaluateComparableCharmWitnesses(allCharmEvents, {
      keyOf: bountyCharmStateKey,
      isAffected: ev => !!ev.bountyTalisman,
      minimumControlSamples: 3,
      minimumAffectedSamples: 3,
      representative: 'mode',
      candidatesForRows: rows => {
        if (!rows.length) return [];
        const maxMultiplier = Math.max(...rows.map(row =>
          (row.affectedDamage + 1) / row.controlDamage
        ));
        return bountyTalismanLevelsWithinBonus(maxMultiplier - 1)
          .map(level => ({
            level,
            bonus: bountyTalismanBonusForLevel(level),
            multiplier: 1 + bountyTalismanBonusForLevel(level),
          }));
      },
      matchCandidate: (row, candidate) => {
        const intervals = inversePostMultiplierIntervals(
          row.affectedDamage,
          candidate.multiplier,
        );
        const ok = intervals.some(([lo, hi]) =>
          row.controlDamage >= lo && row.controlDamage <= hi
        );
        const error = Math.min(...intervals.map(([lo, hi]) =>
          row.controlDamage < lo ? lo - row.controlDamage
            : (row.controlDamage > hi ? row.controlDamage - hi : 0)
        ));
        return { ok, error, intervals };
      },
    });
    const winner = evaluation.unanimous.length === 1
      ? evaluation.unanimous[0]
      : null;
    const setup = unknownBountyTalismanSetup(
      evaluation.rows.length
        ? 'comparable_charm_damage_conflict'
        : 'comparable_charm_damage_insufficient',
    );
    if (!winner) {
      setup.damage.evidenceCount = evaluation.rows.length;
      setup.damage.ranked = evaluation.ranked.slice(0, 12).map(entry => ({
        level: entry.candidate.level,
        bonus: entry.candidate.bonus,
        votes: entry.votes,
        witnessCount: evaluation.rows.length,
      }));
      return setup;
    }
    setup.damage = {
      level: winner.candidate.level,
      bonus: winner.candidate.bonus,
      multiplier: winner.candidate.multiplier,
      confidence: 'strong',
      source: 'comparable_charm_damage',
      evidenceCount: evaluation.rows.length,
      contradictions: 0,
      witnesses: evaluation.rows.map(row => ({
        key: row.key,
        controlDamage: row.controlDamage,
        affectedDamage: row.affectedDamage,
        controlCount: row.controlCount,
        affectedCount: row.affectedCount,
      })),
      ranked: evaluation.ranked.slice(0, 12).map(entry => ({
        level: entry.candidate.level,
        bonus: entry.candidate.bonus,
        votes: entry.votes,
        witnessCount: evaluation.rows.length,
      })),
    };
    return setup;
  }

  function inferGravSanSetup(serverFacts, localFacts, options, fallbackState) {
    if (options && options.gravSanBonus != null) {
      const bonus = +options.gravSanBonus || 0;
      const castsOpt = ((localFacts && localFacts.playerCasts) || []).filter(c => normalizeName(c.text) === GRAV_SAN_INCANTATION);
      return {
        bonus,
        multiplier: 1 + bonus,
        source: 'option_gravSanBonus',
        casts: castsOpt,
        windows: castsOpt.map(c => ({ start: c.ts, end: c.ts + GRAV_SAN_DURATION_SECONDS, cast: c })),
      };
    }
    const playerCasts = (localFacts && localFacts.playerCasts) || [];
    const casts = playerCasts.filter(c => normalizeName((c.profile && c.profile.incantation) || c.text) === GRAV_SAN_INCANTATION);
    const windows = casts.map(c => ({ start: c.ts, end: c.ts + GRAV_SAN_DURATION_SECONDS, cast: c }));
    if (!casts.length) return { bonus: 0, multiplier: 1, source: 'no_utevo_grav_san_cast', casts: [], windows: [] };

    const charmEvents = ((serverFacts && serverFacts.events) || [])
      .filter(ev => ev && (ev.kind === 'charm' || ev.kind === 'reflect') && ev.dmg > 0)
      .filter(ev => /charm/i.test(ev.rawLine || '') || ev.overpowerCharm || ev.woundCharm);
    const keyOf = ev => [
      normalizeName(ev.mob),
      ev.isPrey ? 'prey' : 'no_prey',
      ev.bountyTalisman ? 'bounty' : 'no_bounty',
      charmSignature(ev),
    ].join('|');
    const evaluation = evaluateComparableCharmWitnesses(charmEvents, {
      keyOf,
      isAffected: ev => isWithinAnyWindow(ev.ts, windows),
      representative: 'affected_each',
      excludeKilledTarget: false,
      candidatesForRows: () => GRAV_SAN_BONUS_CANDIDATES.map(bonus => ({
        bonus,
        multiplier: 1 + bonus,
      })),
      matchCandidate: (row, candidate) => {
        const expected = row.controlDamage * candidate.multiplier;
        const delta = Math.abs(row.affectedDamage - expected);
        const tolerance = Math.max(2, row.controlDamage * 0.0125);
        const ok = delta <= tolerance;
        return { ok, error: ok ? delta : 0, expected };
      },
    });
    const inside = charmEvents.filter(ev => isWithinAnyWindow(ev.ts, windows));
    const comparableCharmCount = evaluation.rows
      .reduce((sum, row) => sum + row.affectedCount, 0);
    const scores = evaluation.ranked.map(entry => ({
      bonus: entry.candidate.bonus,
      multiplier: entry.candidate.multiplier,
      votes: entry.votes,
      error: entry.error,
      examples: evaluation.rows.flatMap((row, index) => {
        const match = entry.matches[index];
        if (!match || !match.ok) return [];
        const ev = row.affectedEvents[0];
        return [{
          ts: ev.ts,
          clock: ev.clock,
          mob: ev.mob,
          charm: charmSignature(ev),
          prey: !!ev.isPrey,
          observed: row.affectedDamage,
          baseline: row.controlDamage,
          expected: Math.round(match.expected * 1000) / 1000,
          ratio: Math.round((row.affectedDamage / row.controlDamage) * 10000) / 10000,
          rawLine: ev.rawLine,
        }];
      }).slice(0, 8),
    }));
    scores.sort((a, b) => b.votes - a.votes || a.error - b.error || b.bonus - a.bonus);
    const best = scores[0];
    if (comparableCharmCount > 0) {
      const tied = best && best.votes > 0
        ? scores.filter(c => c.votes === best.votes && Math.abs(c.error - best.error) <= Number.EPSILON)
        : [];
      if (!best || best.votes <= 0 || tied.length !== 1) {
        return {
          bonus: 0,
          multiplier: 1,
          source: 'utevo_grav_san_comparable_charm_conflict',
          casts,
          windows,
          ranked: scores,
          insideCharmCount: inside.length,
          comparableCharmCount,
        };
      }
      return {
        bonus: best.bonus,
        multiplier: best.multiplier,
        source: 'inferred_from_charm_damage_in_grav_san_windows',
        casts,
        windows,
        ranked: scores,
        examples: best.examples,
        insideCharmCount: inside.length,
        comparableCharmCount,
      };
    }

    const pending = {
      bonus: 0,
      multiplier: 1,
      source: 'utevo_grav_san_pending_damage_leech_fallback',
      casts,
      windows,
      ranked: scores,
      insideCharmCount: inside.length,
      comparableCharmCount: 0,
      pendingDamageLeechFallback: true,
    };
    const context = fallbackState && fallbackState.context;
    const resolvedTurns = fallbackState && fallbackState.resolvedTurns;
    if (!context || !Array.isArray(resolvedTurns)) return pending;

    // D-030: a mesma função canônica finaliza o estado pendente. Os componentes já
    // vieram resolvidos sem leech; seus hits, ação e N_leech ficam congelados enquanto
    // os três tiers oficiais comparam modo ativo x inativo.
    const ranked = GRAV_SAN_BONUS_CANDIDATES.map(bonus => ({
      bonus,
      multiplier: 1 + bonus,
      votes: 0,
      eligibleComponents: 0,
      fits: 0,
      exact: 0,
      tolerated: 0,
      cappedLow: 0,
      contradictions: 0,
      residual: 0,
      examples: [],
    }));
    const rankedByBonus = new Map(ranked.map(x => [x.bonus, x]));
    const componentVotes = [];
    const abstentions = [];
    const previousSetup = context.gravSanSetup;
    const compareFit = (a, b) => {
      if (a.contradictions !== b.contradictions) return a.contradictions - b.contradictions;
      if (a.fits !== b.fits) return b.fits - a.fits;
      if (a.exact !== b.exact) return b.exact - a.exact;
      return a.residual - b.residual;
    };
    const scoreMode = (comp, main, nLeech, active) => {
      const out = {
        active,
        fits: 0,
        exact: 0,
        tolerated: 0,
        cappedLow: 0,
        contradictions: 0,
        residual: 0,
        absent: 0,
        scoredHitCount: 0,
        exactManaObserved: [],
        examples: [],
      };
      const scoredHits = new Set();
      withGravSanBlockMode(context, comp, active, () => {
        for (const hit of main) {
          if (hit.overkill) continue;
          for (const channel of ['life', 'mana']) {
            const observed = channel === 'mana' ? (+hit.manaLeech || 0) : (+hit.lifeLeech || 0);
            if (!(observed > 0)) {
              out.absent++;
              continue;
            }
            const check = observedLeechAcceptsN(hit, context.leechSetup, nLeech, channel, comp, context);
            if (!check.usable) {
              out.absent++;
              continue;
            }
            scoredHits.add(hit.id);
            if (check.ok) {
              const match = (check.matches || []).slice().sort((a, b) => Math.abs(a.delta || 0) - Math.abs(b.delta || 0))[0];
              const residual = Math.abs(match && match.delta || 0);
              out.fits++;
              out.residual += residual;
              if (residual === 0) {
                out.exact++;
                if (channel === 'mana') out.exactManaObserved.push(observed);
              } else {
                out.tolerated++;
              }
              if (out.examples.length < 12) out.examples.push({
                ts: hit.ts,
                seq: hit.seq,
                mob: hit.mob,
                channel,
                observed,
                expected: match && match.expected,
                delta: match && match.delta,
                nLeech,
              });
            } else if (check.cappedLow) {
              out.cappedLow++;
            } else {
              out.contradictions++;
            }
          }
        }
      });
      out.scoredHitCount = scoredHits.size;
      return out;
    };

    try {
      for (const turn of resolvedTurns) {
        if (!turn || turn.status !== 'resolved' || turn.partialEdge) {
          abstentions.push({ turn: turn && (turn.clock || turn.ts), reason: 'turn_not_resolved_without_leech' });
          continue;
        }
        for (const comp of turn.components || []) {
          const componentRef = {
            turn: turn.clock || turn.ts,
            component: comp.id || comp.comp,
            comp: comp.comp,
            actionLabel: comp.actionLabel || actionLabel(comp.comp, comp.action),
          };
          if (!comp || comp.comp === 'unresolved' || (comp.comp !== 'arrow' && !comp.action)) {
            abstentions.push(Object.assign(componentRef, { reason: 'mechanical_action_not_concrete' }));
            continue;
          }
          const main = (comp.hits || []).filter(h => isMainHit(h) && !h.virtual);
          if (!main.length) {
            abstentions.push(Object.assign(componentRef, { reason: 'no_main_hits' }));
            continue;
          }
          if (!main.some(h => isWithinAnyWindow(h.ts, windows))) {
            abstentions.push(Object.assign(componentRef, { reason: 'outside_grav_san_window' }));
            continue;
          }
          const measurable = main.filter(h => !h.overkill && ((+h.lifeLeech || 0) > 0 || (+h.manaLeech || 0) > 0));
          if (!measurable.length) {
            abstentions.push(Object.assign(componentRef, { reason: 'no_positive_non_overkill_leech' }));
            continue;
          }
          let indeterminateActionBonus = false;
          let setupUnknown = false;
          for (const hit of measurable) {
            for (const channel of ['life', 'mana']) {
              const observed = channel === 'mana' ? (+hit.manaLeech || 0) : (+hit.lifeLeech || 0);
              if (!(observed > 0)) continue;
              const rates = leechEffectiveRateCandidates(context.leechSetup, channel, comp, hit, context);
              if (!rates.length) setupUnknown = true;
              else if (rates.length !== 1) indeterminateActionBonus = true;
            }
          }
          if (setupUnknown) {
            abstentions.push(Object.assign(componentRef, { reason: 'leech_setup_unknown' }));
            continue;
          }
          if (indeterminateActionBonus) {
            abstentions.push(Object.assign(componentRef, { reason: 'indeterminate_action_leech_bonus' }));
            continue;
          }

          const nLeech = main.length;
          const tiers = [];
          for (const aggregate of ranked) {
            context.gravSanSetup = Object.assign({}, pending, {
              bonus: aggregate.bonus,
              multiplier: aggregate.multiplier,
              pendingDamageLeechFallback: false,
            });
            const inactive = scoreMode(comp, main, nLeech, false);
            const active = scoreMode(comp, main, nLeech, true);
            const eligible = active.contradictions === 0 && active.fits > 0 && compareFit(active, inactive) < 0;
            const tier = {
              bonus: aggregate.bonus,
              active,
              inactive,
              eligible,
              exactManaObserved: active.exactManaObserved,
            };
            tiers.push(tier);
            aggregate.eligibleComponents++;
            aggregate.fits += active.fits;
            aggregate.exact += active.exact;
            aggregate.tolerated += active.tolerated;
            aggregate.cappedLow += active.cappedLow;
            aggregate.contradictions += active.contradictions;
            aggregate.residual += active.residual;
            for (const example of active.examples) {
              if (aggregate.examples.length >= 12) break;
              aggregate.examples.push(Object.assign({}, componentRef, example));
            }
          }

          const eligible = tiers.filter(x => x.eligible).sort((a, b) => compareFit(a.active, b.active));
          const winners = eligible.length
            ? eligible.filter(x => compareFit(x.active, eligible[0].active) === 0)
            : [];
          const vote = winners.length === 1 ? winners[0].bonus : null;
          if (vote != null) rankedByBonus.get(vote).votes++;
          const voteRow = Object.assign(componentRef, {
            nLeech,
            scoredHitCount: measurable.length,
            vote,
            reason: vote != null ? 'unique_best_tier' : (winners.length > 1 ? 'local_tier_tie' : 'active_not_better_than_inactive'),
            tiers,
          });
          componentVotes.push(voteRow);
          if (vote == null) abstentions.push(Object.assign({}, componentRef, { reason: voteRow.reason }));
        }
      }
    } finally {
      context.gravSanSetup = previousSetup;
    }

    const discriminatingComponentCount = componentVotes.filter(x => x.vote != null).length;
    const leaders = ranked.slice().sort((a, b) => b.votes - a.votes);
    const winner = leaders[0] && leaders[0].votes > discriminatingComponentCount / 2 ? leaders[0] : null;
    const source = winner
      ? 'inferred_from_damage_leech_in_grav_san_windows'
      : (discriminatingComponentCount ? 'utevo_grav_san_damage_leech_no_majority' : 'utevo_grav_san_damage_leech_no_evidence');
    return {
      bonus: winner ? winner.bonus : 0,
      multiplier: winner ? winner.multiplier : 1,
      source,
      casts,
      windows,
      ranked,
      insideCharmCount: inside.length,
      comparableCharmCount: 0,
      pendingDamageLeechFallback: false,
      discriminatingComponentCount,
      componentVotes,
      abstentions,
    };
  }

  // Mapa elemento <- assinatura de charm ofensivo (charmSignature acima). Charms sem
  // elemento de dano claro (overpower/wound = fisico, ja coberto por
  // physicalOriginalInterval via postMultiplier; overflux e mana, nao dano) ficam de fora
  // dessa lista de elemento — mas wound (fisico) e divine_wrath (holy) SAO usados aqui.
  const CHARM_ELEMENT_MAP = {
    freeze: 'ice',
    enflame: 'fire',
    curse: 'death',
    poison: 'earth',
    zap: 'energy',
    divine_wrath: 'holy',
    overpower: 'physical',
    wound: 'physical',
  };

  // Bonus de dano do player contra uma classe de bestiario (ex.: reward "Improved" de
  // Charm Points, +N% contra uma classe inteira). Nao e fato do mob (nao entra na tabela
  // de mods) nem do elemento (aparece em toda spell/AA contra a classe) - e fato do
  // personagem, constante na sessao inteira. O dano de charm ofensivo e FIXO por mob (sem
  // sorteio), entao serve de testemunha independente da reversao elemental/fisica -- MAS
  // só depois de descontar as duas fontes de contaminação já modeladas em outro lugar do
  // motor: (1) utevo grav san infla o dano de charm igual dano de spell (mesma janela de
  // inferGravSanSetup) — procs dentro da janela são excluídos; (2) Expose Weakness
  // ("increased damage by Expose Weakness" no sufixo) e qualquer pierce já inferido pra
  // sessão (context.bmPierce, só holy/physical) entram na fórmula exatamente como no dano
  // normal do player, via pierceForElement/effectiveMod — sem isso, procs do mesmo mob com
  // e sem EW parecem "dois valores" e o cálculo diverge da tabela mesmo sem bônus real.
  // "due to active charm upgrade" no sufixo NÃO afeta dano (só chance de ativação do
  // charm) e é ignorado.
  // Caso-prova: logs/mazzerinbarrage server log.txt S11 (Sun Jun 28 23:02:16 2026) — sem
  // filtrar grav san/EW/bmPierce, 4 classes divergiam ~3-12% da fórmula bruta (falso
  // positivo "Construct +3%" via walking pillar); com os 3 descontos, as 8 combinações
  // mob×EW fecham em razão 0.9995–1.0003. logs/ingol ed 17/Jul/2026 (druid, sem utevo
  // grav san): harpy (Bird) freeze charm ainda diverge ~1.05 mesmo com a fórmula
  // completa — bônus de classe real, confirmado.
  // Testemunhas do perk BM no dano de charm. O BM soma pierce SO em holy e physical
  // (pierceForElement), entao so os charms desses dois canais testemunham o perk:
  // `wound charm` (fisico) e `divine wrath charm` (holy).
  //
  // `overpower charm` NAO entra: apesar de CHARM_ELEMENT_MAP mapea-lo como 'physical',
  // ele nao e dano fisico. Medida de apoio: incluindo overpower como fisico, as sessoes
  // mazzerinbarrage S8/S9/S10 produziam uma linha que nao fechava com NENHUMA das duas
  // hipoteses de pierce (indeterminada); removendo-o, os indeterminados vao a zero.
  // (O mapeamento em CHARM_ELEMENT_MAP e usado por M-036 e fica para investigacao
  // propria -- este detector nao o altera, so nao usa overpower.)
  const BM_WITNESS_CHARMS = new Set(['wound', 'divine_wrath']);
  const BM_PIERCE_HYPOTHESIS = 0.04;
  const CHARM_EXPECTED_TOLERANCE_RATIO = 0.0125; // mesma tolerancia de M-036
  const CHARM_WITNESS_MIN_PROCS = 3;             // mesmo piso de repeticao de M-036

  // Infere o pierce de BM SO pelo dano de charm, a partir de fatos de parsing -- sem
  // nenhuma resolucao de turno. Ver openspec/changes/infer-bm-pierce-from-charm-damage.
  //
  // Circularidade com M-036 (o bonus de classe de bestiario tambem multiplica o dano de
  // charm, e a deteccao dele depende do bmPierce): quebrada pela assimetria dos dois
  // efeitos -- o BM so afeta holy/physical, o bonus de classe afeta TODOS os elementos
  // daquela classe. Entao os charms de elementos IMUNES ao BM medem o bonus de classe
  // sem contaminacao, e so depois as linhas holy/fisico da mesma classe, corrigidas por
  // ele, testemunham o BM. Classe sem testemunha imune => linha nao-discriminante (nao
  // assume bonus 1).
  //
  // Retorna { pierce, source, rows }. `pierce: null` = sem veredito (o chamador deve
  // usar a deteccao cross-mob existente).
  function inferBmPierceFromCharmDamage(serverFacts, context) {
    const windows = (context && context.gravSanSetup && context.gravSanSetup.windows) || [];
    const events = (serverFacts && serverFacts.events) || [];
    const byKey = new Map();
    for (const ev of events) {
      if (!ev || ev.kind !== 'charm' || !(ev.dmg > 0) || ev.isPrey || ev.bountyTalisman) continue;
      if (isWithinAnyWindow(ev.ts, windows)) continue;
      const sig = charmSignature(ev);
      const element = CHARM_ELEMENT_MAP[sig];
      if (!element) continue;
      // Só wound/divine wrath testemunham o BM; os demais entram para medir o bônus de
      // classe (imunes ao BM). overpower fica de fora dos dois papéis.
      const isWitness = BM_WITNESS_CHARMS.has(sig);
      const bmSensitive = element === 'holy' || element === 'physical';
      if (bmSensitive && !isWitness) continue;
      const mob = normalizeName(ev.mob);
      if (!mob) continue;
      const ew = /expose weakness/i.test(ev.rawLine || '');
      // D-010c: `active elemental amplification` e fonte de pierce observada na propria
      // linha, igual a EW. Ela PRECISA entrar na chave: misturar linhas com e sem
      // amplification na mesma mediana compara o observado de uma populacao contra o
      // esperado da outra, e o residuo (effectiveMod com amp / sem amp) vira bonus
      // fantasma. BM fica de fora daqui de proposito -- ele e a hipotese sob teste.
      const amp = !!ev.elementalAmplification;
      const key = mob + '|' + sig + '|' + element + '|' + (ew ? 1 : 0) + '|' + (amp ? 1 : 0);
      if (!byKey.has(key)) byKey.set(key, { mob, sig, element, ew, amp, bmSensitive, values: [] });
      byKey.get(key).values.push(ev.dmg);
    }

    const rows = [];
    for (const r of byKey.values()) {
      if (r.values.length < CHARM_WITNESS_MIN_PROCS) continue;
      const mods = getMobMods(r.mob, context);
      if (!mods || !(mods.hitpoints > 0)) continue;
      const key = ELEMENT_KEYS[r.element];
      if (!key || !(mods[key] > 0)) continue;
      const mit = mitigationMultiplier(mods, context);
      const base = mods.hitpoints * 0.05 * mit;
      // Pierce OBSERVADO da linha (EW + amplification), pela mesma funcao canonica que o
      // dano normal usa. O contexto vai sem `bmPierce` porque BM e a hipotese testada
      // logo abaixo: somar as duas coisas aqui achataria as hipoteses e as tornaria
      // indistinguiveis.
      const pierceObserved = pierceForElement(
        r.element,
        { exposeWeakness: r.ew, elementalAmplification: r.amp },
        null,
      );
      const expectedNoBm = base * effectiveMod(+mods[key], pierceObserved);
      const expectedBm = r.bmSensitive
        ? base * effectiveMod(+mods[key], pierceObserved + BM_PIERCE_HYPOTHESIS)
        : expectedNoBm;
      if (!(expectedNoBm > 0)) continue;
      rows.push({
        mob: r.mob, charm: r.sig, element: r.element, ew: r.ew, n: r.values.length,
        cls: normalizeName(mods.bestiaryClass || ''), observed: median(r.values),
        expectedNoBm, expectedBm, bmSensitive: r.bmSensitive,
      });
    }
    if (!rows.length) return { pierce: null, source: 'no_charm_witness_rows', rows: [] };

    // Passo 1: bônus de classe medido SÓ pelos elementos imunes ao BM.
    const immuneRatiosByClass = new Map();
    for (const r of rows) {
      if (r.bmSensitive || !r.cls) continue;
      const arr = immuneRatiosByClass.get(r.cls) || [];
      arr.push(r.observed / r.expectedNoBm);
      immuneRatiosByClass.set(r.cls, arr);
    }

    // Passo 2: as linhas holy/físico, corrigidas pelo bônus de classe, votam no pierce.
    let votesNoBm = 0, votesBm = 0;
    const witnesses = [];
    for (const r of rows) {
      if (!r.bmSensitive) continue;
      const immune = r.cls ? immuneRatiosByClass.get(r.cls) : null;
      if (!immune || !immune.length) {
        witnesses.push(Object.assign({}, r, { vote: null, reason: 'class_without_bm_immune_witness' }));
        continue;
      }
      const classMult = median(immune);
      const eNo = r.expectedNoBm * classMult, eBm = r.expectedBm * classMult;
      const fitsNo = Math.abs(r.observed - eNo) <= Math.max(2, eNo * CHARM_EXPECTED_TOLERANCE_RATIO);
      const fitsBm = Math.abs(r.observed - eBm) <= Math.max(2, eBm * CHARM_EXPECTED_TOLERANCE_RATIO);
      let vote = null, reason = 'fits_neither_hypothesis';
      if (fitsNo && !fitsBm) { vote = 0; votesNoBm++; reason = 'fits_no_bm_only'; }
      else if (fitsBm && !fitsNo) { vote = BM_PIERCE_HYPOTHESIS; votesBm++; reason = 'fits_bm_only'; }
      else if (fitsNo && fitsBm) { reason = 'hypotheses_indistinguishable'; }
      witnesses.push(Object.assign({}, r, { vote, reason, classMult, expectedNoBmCorrected: eNo, expectedBmCorrected: eBm }));
    }

    // Unanimidade entre as linhas discriminantes; qualquer conflito => sem veredito.
    if (votesBm > 0 && votesNoBm > 0) return { pierce: null, source: 'charm_witnesses_conflict', rows: witnesses };
    if (votesBm > 0) return { pierce: BM_PIERCE_HYPOTHESIS, source: 'confirmed_by_charm_damage', rows: witnesses };
    if (votesNoBm > 0) return { pierce: 0, source: 'confirmed_by_charm_damage', rows: witnesses };
    return { pierce: null, source: 'no_discriminating_charm_witness', rows: witnesses };
  }

  // M-039 — deteccao por sessao do perk "omega" (+6% de dano quando o alvo esta com vida
  // baixa), pela MESMA testemunha de M-036: o dano de charm ofensivo e fixo por mob (sem
  // sorteio), entao `hitpoints * 0.05 * mitigacao * effectiveMod(mod, pierce)` preve o
  // nivel exato e qualquer multiplicador oculto aparece como um segundo nivel exato.
  //
  // O detector NAO olha para os hits principais (D2): eles sao justamente o que ele vai
  // destravar, e usa-los fecharia laco com a classificacao.
  //
  // Duas condicoes por linha de testemunha, e as duas sao necessarias:
  //   (a) ANCORA -- existe nivel exato com >=3 procs que bate com o previsto pela formula
  //       dentro da tolerancia de M-036. Sem ela nao ha "nivel previsto" observado, so
  //       calculado, e um erro de tabela de ~6% se disfarcaria de omega.
  //   (b) OMEGA  -- existe OUTRO nivel exato com >=3 procs a `x1.06` do nivel ANCORADO.
  //       A razao e medida entre dois niveis OBSERVADOS, entao qualquer multiplicador
  //       uniforme da sessao (bonus de classe de bestiario) cancela nela.
  // Medido sobre os 36 pares de logs/: so `crypt` satisfaz as duas, nos tres mobs
  // (roaming dread/curse 818->867, crypt mage/freeze 665->705, cyclursus/zap 659->699);
  // os outros 35 fixtures, com ~5.000 procs de charm somados, nao produzem uma unica
  // linha confirmada. O drift fora de `crypt` e zero por construcao.
  //
  // Procs dentro de janela de utevo grav san sao excluidos, como em M-036: aquele bonus e
  // um SEGUNDO multiplicador binario (x1.10 nesta sessao) que compoe com omega e
  // contaminaria a escada.
  //
  // Ausencia de testemunha e evidencia ausente (D-006), nao ausencia do perk: a sessao
  // simplesmente nao ganha candidato de original nenhum e o motor se comporta como antes.
  const OMEGA_WITNESS_MIN_PROCS = CHARM_WITNESS_MIN_PROCS;

  function inferOmegaPerk(serverFacts, context) {
    const windows = (context && context.gravSanSetup && context.gravSanSetup.windows) || [];
    const events = (serverFacts && serverFacts.events) || [];
    const byKey = new Map();
    for (const ev of events) {
      if (!ev || ev.kind !== 'charm' || !(ev.dmg > 0) || ev.isPrey || ev.bountyTalisman) continue;
      if (isWithinAnyWindow(ev.ts, windows)) continue;
      const sig = charmSignature(ev);
      const element = CHARM_ELEMENT_MAP[sig];
      if (!element) continue;
      const mob = normalizeName(ev.mob);
      if (!mob) continue;
      // Mesma chave de M-036: linhas com e sem Expose Weakness / amplification sao
      // populacoes de pierce diferentes e nunca podem compartilhar nivel.
      const ew = /expose weakness/i.test(ev.rawLine || '');
      const amp = !!ev.elementalAmplification;
      const key = mob + '|' + sig + '|' + element + '|' + (ew ? 1 : 0) + '|' + (amp ? 1 : 0);
      if (!byKey.has(key)) byKey.set(key, { mob, charm: sig, element, ew, amp, values: [] });
      byKey.get(key).values.push(ev.dmg);
    }
    if (!byKey.size) return { active: false, multiplier: 1, source: 'no_elemental_charm_evidence_outside_grav_san', rows: [] };

    const rows = [];
    for (const r of byKey.values()) {
      if (r.values.length < OMEGA_WITNESS_MIN_PROCS) continue;
      const mods = getMobMods(r.mob, context);
      if (!mods || !(mods.hitpoints > 0)) continue;
      const key = ELEMENT_KEYS[r.element];
      if (!key || !(mods[key] > 0)) continue;
      const pierce = pierceForElement(r.element, { exposeWeakness: r.ew, elementalAmplification: r.amp }, context);
      const mit = mitigationMultiplier(mods, context);
      // O bonus de classe de bestiario tambem multiplica o dano de charm; sem ele a
      // ancora nao fecharia numa sessao que o tenha. Ele cancela na razao (b), entao
      // entra so aqui.
      const classMultiplier = bestiaryClassMultiplierForHit({ mob: r.mob }, context);
      const expected = mods.hitpoints * 0.05 * mit * effectiveMod(+mods[key], pierce) * classMultiplier;
      if (!(expected > 0)) continue;

      const counts = new Map();
      for (const v of r.values) counts.set(v, (counts.get(v) || 0) + 1);
      const levels = [...counts.entries()]
        .filter(([, n]) => n >= OMEGA_WITNESS_MIN_PROCS)
        .map(([value, n]) => ({ value, n }))
        .sort((a, b) => a.value - b.value);

      const anchorTolerance = Math.max(2, expected * CHARM_EXPECTED_TOLERANCE_RATIO);
      const anchor = levels.find(L => Math.abs(L.value - expected) <= anchorTolerance);
      const row = {
        mob: r.mob, charm: r.charm, element: r.element, ew: r.ew, amp: r.amp,
        n: r.values.length, expected, levels,
        baseLevel: anchor ? anchor.value : null, omegaLevel: null,
      };
      if (anchor) {
        const wanted = anchor.value * OMEGA_MULTIPLIER;
        const omegaTolerance = Math.max(2, wanted * CHARM_EXPECTED_TOLERANCE_RATIO);
        const omega = levels.find(L => L.value !== anchor.value && Math.abs(L.value - wanted) <= omegaTolerance);
        if (omega) { row.omegaLevel = omega.value; row.ratio = omega.value / anchor.value; }
      }
      rows.push(row);
    }

    const anchored = rows.filter(r => r.baseLevel != null);
    const confirmed = rows.filter(r => r.omegaLevel != null);
    if (confirmed.length) {
      return { active: true, multiplier: OMEGA_MULTIPLIER, source: 'confirmed_by_charm_damage', rows, confirmedRows: confirmed.length, anchoredRows: anchored.length };
    }
    if (!anchored.length) return { active: false, multiplier: 1, source: 'no_anchored_charm_witness_row', rows };
    return { active: false, multiplier: 1, source: 'charm_witness_without_omega_level', rows, anchoredRows: anchored.length };
  }

  function inferBestiaryClassDamageBonus(serverFacts, context) {
    const windows = (context && context.gravSanSetup && context.gravSanSetup.windows) || [];
    const events = (serverFacts && serverFacts.events) || [];
    const charmEvents = events
      .filter(ev => ev && ev.kind === 'charm' && ev.dmg > 0 && !ev.isPrey && !ev.bountyTalisman)
      .filter(ev => !isWithinAnyWindow(ev.ts, windows))
      .map(ev => ({ ev, element: CHARM_ELEMENT_MAP[charmSignature(ev)], ew: /expose weakness/i.test(ev.rawLine || '') }))
      .filter(x => !!x.element);
    if (!charmEvents.length) return { bonus: 0, multiplier: 1, class: null, source: 'no_elemental_charm_evidence_outside_grav_san' };

    const byKey = new Map();
    for (const { ev, element, ew } of charmEvents) {
      const mob = normalizeName(ev.mob);
      if (!mob) continue;
      // D-010c: mesma razao do detector de BM -- a amplification e estado de pierce da
      // linha observada e separa populacoes que nao podem dividir mediana.
      const amp = !!ev.elementalAmplification;
      const key = mob + '|' + element + '|' + (ew ? 1 : 0) + '|' + (amp ? 1 : 0);
      if (!byKey.has(key)) byKey.set(key, { mob, element, ew, amp, values: [] });
      byKey.get(key).values.push(ev.dmg);
    }

    const rows = [];
    for (const { mob, element, ew, amp, values } of byKey.values()) {
      // Exige repetição: um único proc pode estar truncado pela vida restante do alvo.
      if (values.length < 3) continue;
      const mods = getMobMods(mob, context);
      if (!mods || !mods.bestiaryClass || !(mods.hitpoints > 0)) continue;
      const key = ELEMENT_KEYS[element];
      if (!key || !(mods[key] > 0)) continue;
      // O hit precisa reproduzir TODOS os eixos que `pierceForElement` consome; um
      // sintetico so com EW deixava a amplification de fora e o resto virava "bonus".
      const pierce = pierceForElement(element, { exposeWeakness: ew, elementalAmplification: amp }, context);
      const mod = effectiveMod(+mods[key], pierce);
      const mit = mitigationMultiplier(mods, context);
      const expected = mods.hitpoints * 0.05 * mit * mod;
      if (!(expected > 0)) continue;
      const observed = median(values);
      rows.push({ mob, element, ew, amp, class: normalizeName(mods.bestiaryClass), observed, expected, ratio: observed / expected, n: values.length });
    }
    if (!rows.length) return { bonus: 0, multiplier: 1, class: null, source: 'no_mob_with_bestiary_class_and_hitpoints', rows };

    const byClass = new Map();
    for (const r of rows) {
      const arr = byClass.get(r.class) || [];
      arr.push(r);
      byClass.set(r.class, arr);
    }

    let best = null;
    for (const [cls, clsRows] of byClass) {
      const scores = BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES.map(b => ({ bonus: b, multiplier: 1 + b, votes: 0, error: 0 }));
      for (const r of clsRows) {
        for (const cand of scores) {
          const expected = r.expected * cand.multiplier;
          const delta = Math.abs(r.observed - expected);
          const tolerance = Math.max(2, expected * 0.0125);
          if (delta <= tolerance) { cand.votes++; cand.error += delta; }
        }
      }
      scores.sort((a, b) => b.votes - a.votes || a.error - b.error);
      const top = scores[0];
      // Unanime: toda linha (mob×estado de pierce) testemunha da classe tem que concordar
      // com o mesmo candidato, senao a classe fica sem bonus detectado em vez de arriscar
      // um valor por maioria.
      //
      // Testemunha UNICA e aceita de proposito. Exigir mobs distintos foi testado e
      // rejeitado: `ingol ed` S0 tem `harpy` como unica testemunha da classe `bird`, e o
      // bonus de 5% dali e REAL -- com ele os 251 turnos fecham sem nenhuma violacao de
      // invariante, sem ele 166 blocos passam a contradizer o diagnostico deterministico.
      // O bonus fantasma de `uhax 3` nao vinha de testemunha unica: vinha do esperado
      // ignorar a `active elemental amplification` da linha, corrigido acima.
      if (top && top.votes === clsRows.length && (!best || top.votes > best.votes)) {
        best = { class: cls, bonus: top.bonus, multiplier: top.multiplier, votes: top.votes, rows: clsRows };
      }
    }
    if (!best) return { bonus: 0, multiplier: 1, class: null, source: 'charm_evidence_inconclusive', rows };
    return {
      bonus: best.bonus,
      multiplier: best.multiplier,
      class: best.class,
      source: 'confirmed_by_charm_damage',
      rows: best.rows,
    };
  }

  // Estimador de crÃ­tico POR-COMPONENTE por buckets crit/nÃ£o-crit.
  // Entrada: hits jÃ¡ rotulados (cada um com `compKey`, `mob`, `dmg`, `realCrit`,
  // `overkill`, `isPrey`, `ts`, `onslaught`, `exposeWeakness`, `gravSanActive`).
  // O crÃ­tico Ã© uniforme por-ataque e escala a distribuiÃ§Ã£o inteira, entÃ£o
  // mean(crit)/mean(noncrit) por estrato estima o multiplicador sem depender do mod do
  // mob (ele cancela na razÃ£o). Tira a mediana entre os estratos elegÃ­veis.
  // NÃ£o usa min/min (viÃ©s de amostra do lado crit, que Ã© mais raro).
  //
  // Limpeza dos buckets (C-005: cada bÃ´nus no seu eixo mecÃ¢nico, nunca ajuste livre):
  //   EXCLUI  â€” overkill (dano truncado); onslaught+crit e crit em janela de
  //             Transcendence (bÃ´nus ADITIVOS sobre o multiplicador sendo medido â€”
  //             descontar exigiria jÃ¡ conhecer o crÃ­tico-base, circular).
  //   NORMALIZA â€” prey (Ã·1.25) e utevo grav san (Ã·(1+bonus), sÃ³ quando o hit estÃ¡ em
  //             janela E a hipÃ³tese por-componente nÃ£o Ã© `false`); onslaught sem crit
  //             (Ã·1.6 â€” sem crÃ­tico junto, o bÃ´nus aditivo vira fator conhecido).
  //   ESTRATIFICA â€” Expose Weakness muda o mod efetivo do mob (nÃ£o Ã© fator fixo
  //             divisÃ­vel): crit sÃ³ compara com nÃ£o-crit do MESMO estado de EW; o
  //             fator de EW cancela na razÃ£o dentro do estrato.
  // Low Blow fica como estÃ¡: o charm dÃ¡ CHANCE de crÃ­tico, nÃ£o multiplicador.
  // Savage Blow Ã© dano crÃ­tico aumentado por mob/hit; sem normalizaÃ§Ã£o canÃ´nica
  // do bÃ´nus, ele nÃ£o pode medir o multiplicador base do componente.
  function inferCritByComponent(labeledHits, options, context) {
    const MIN = (options && options.minSamples) || CRIT_BUCKET_MIN_SAMPLES;
    const gravSetup = context && context.gravSanSetup;
    const gravBonus = gravSetup && gravSetup.bonus > 0 ? gravSetup.bonus : 0;
    const groups = new Map(); // compKey -> "mob|ew" -> { crit:[], noncrit:[] }
    for (const h of labeledHits || []) {
      if (!h || h.overkill) continue;
      if (h.savageBlow) continue;
      if (h.onslaught && h.realCrit) continue;
      if (h.realCrit && isTranscendenceActiveAt(context, h.ts)) continue;
      const key = h.compKey;
      let dmg = +h.dmg || 0;
      if (!key || !(dmg > 0)) continue;
      if (h.isPrey) dmg /= 1.25;
      if (h.bountyTalisman) {
        const damage = context && context.bountyTalismanSetup && context.bountyTalismanSetup.damage;
        if (!damage || damage.confidence === 'unknown' || !(damage.multiplier > 1)) continue;
        dmg /= damage.multiplier;
      }
      if (gravBonus > 0 && h.gravSanActive !== false && gravSanHitInWindow(context, h.ts)) dmg /= 1 + gravBonus;
      if (h.onslaught && !h.realCrit) dmg /= ONSLAUGHT_DAMAGE_MULTIPLIER;
      if (!groups.has(key)) groups.set(key, new Map());
      const byStratum = groups.get(key);
      const stratum = (h.mob || '-') + '|' + (h.exposeWeakness ? 'ew' : 'no-ew');
      if (!byStratum.has(stratum)) byStratum.set(stratum, { crit: [], noncrit: [] });
      (h.realCrit ? byStratum.get(stratum).crit : byStratum.get(stratum).noncrit).push(dmg);
    }
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const median = a => {
      if (!a.length) return null;
      const s = a.slice().sort((x, y) => x - y);
      const m = s.length >> 1;
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const byComponent = {};
    const evidence = {};
    const allMults = [];
    for (const [key, byStratum] of groups) {
      const ratios = [];
      let nc = 0, cr = 0;
      for (const [, b] of byStratum) {
        if (b.crit.length < MIN || b.noncrit.length < MIN) continue;
        ratios.push(mean(b.crit) / mean(b.noncrit));
        nc += b.noncrit.length; cr += b.crit.length;
      }
      if (!ratios.length) continue;
      const mult = median(ratios);
      byComponent[key] = mult;
      // `mobs` mantÃ©m o nome por compatibilidade de shape; conta ESTRATOS (mob Ã— EW).
      evidence[key] = { multiplier: mult, mobs: ratios.length, spread: ratios.length > 1 ? Math.max.apply(null, ratios) - Math.min.apply(null, ratios) : 0, noncrit: nc, crit: cr };
      allMults.push(mult);
    }
    const fallback = median(allMults) || 1;
    return { byComponent, fallback, evidence, source: allMults.length ? 'bucket_mean_ratio' : 'no_bucket_samples' };
  }

  // Bootstrap crit-independente para o pass-1 (quebra a circularidade rÃ³tuloâ†”crit):
  // razÃ£o mean(crit)/mean(noncrit) POR MOB (todos os componentes juntos), mediana entre
  // mobs. NÃ£o precisa de rÃ³tulo de componente nem de reversÃ£o â€” sÃ³ do flag realCrit.
  // Ã‰ um blend (ponderado por dano) dos crÃ­ticos por-componente, suficiente para os turnos
  // com crit resolverem no pass-1 e alimentarem os buckets por-componente.
  function inferCoarseGlobalCrit(hits) {
    const byMob = new Map();
    for (const h of hits || []) {
      if (!isMainHit(h) || h.overkill || h.isPrey || h.bountyTalisman) continue;
      if (h.savageBlow) continue;
      const d = +h.dmg || 0; if (!(d > 0)) continue;
      const mob = normalizeName(h.mob);
      if (!byMob.has(mob)) byMob.set(mob, { crit: [], noncrit: [] });
      (h.realCrit ? byMob.get(mob).crit : byMob.get(mob).noncrit).push(d);
    }
    const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    const ratios = [];
    for (const [, b] of byMob) if (b.crit.length >= CRIT_BUCKET_MIN_SAMPLES && b.noncrit.length >= CRIT_BUCKET_MIN_SAMPLES) ratios.push(mean(b.crit) / mean(b.noncrit));
    if (!ratios.length) return 1;
    ratios.sort((a, b) => a - b);
    const m = ratios.length >> 1;
    const med = ratios.length % 2 ? ratios[m] : (ratios[m - 1] + ratios[m]) / 2;
    // Clamp: o coarse Ã© confundido por componente (numa porÃ§Ã£o onde os crits sÃ£o
    // predominantemente AA-alto e os nÃ£o-crits spell/runa-baixo, a razÃ£o infla acima do
    // crit real, ~1.5â€“2.0). Como isto Ã© sÃ³ o BOOTSTRAP do pass-1, limitÃ¡-lo a um teto
    // plausÃ­vel evita que uma porÃ§Ã£o patolÃ³gica (ex.: highwin coarse 2.48) sobre-divida o
    // crit e derrube o pass-1 inteiro (physical_no_candidate) â€” o que deixaria byComponent
    // vazio e travaria a porÃ§Ã£o no prÃ³prio coarse ruim.
    return Math.min(Math.max(med, 1), CRIT_BOOTSTRAP_MAX);
  }

  // Extrai hits rotulados (compKey por bloco) dos turnos resolvidos de um passe, para
  // alimentar inferCritByComponent. SÃ³ componentes reais (nÃ£o 'unresolved').
  // AlÃ©m dos campos de bucket, propaga o que a limpeza dos buckets precisa: `ts`
  // (janelas de grav san/Transcendence), `onslaught`, `exposeWeakness` (estratificaÃ§Ã£o)
  // e `gravSanActive` â€” a hipÃ³tese por-componente vencedora da validaÃ§Ã£o (V18: o buff
  // aplica por componente; `false` significa "dentro da janela mas sem o tapete").
  function labeledHitsFromTurns(resolvedTurns) {
    const out = [];
    for (const t of resolvedTurns || []) {
      for (const comp of (t && t.components) || []) {
        if (!comp || comp.comp === 'unresolved') continue;
        const key = critKeyForBlock(comp);
        if (!key) continue;
        for (const h of comp.hits || []) {
          if (!h) continue;
          out.push({
            compKey: key, mob: h.mob, dmg: h.dmg, realCrit: !!h.realCrit,
            overkill: !!h.overkill, isPrey: !!h.isPrey, bountyTalisman: !!h.bountyTalisman, ts: h.ts,
            onslaught: !!h.onslaught, savageBlow: !!h.savageBlow, exposeWeakness: !!h.exposeWeakness,
            gravSanActive: comp.gravSanActive,
          });
        }
      }
    }
    return out;
  }

  function buildContext(serverFacts, localFacts, options) {
    const context = Object.assign({}, options || {});
    context.options = options || {};
    context.sessionDateKey = serverFacts.sessionDateKey;
    context.mobModsPre = options && options.mobModsPre;
    context.mobModsPost = options && options.mobModsPost;
    context.getMobMods = options && options.getMobMods;
    const explicitBm = explicitBmPierceOption(options);
    context.bmPierce = explicitBm == null ? 0 : explicitBm;
    context.strictLeech = options && options.strictLeech !== undefined ? options.strictLeech : true;
    context.useFloat16Mitigation = options && options.useFloat16Mitigation !== undefined ? options.useFloat16Mitigation : true;
    context.maxOriginal = options && options.maxOriginal ? options.maxOriginal : 6000;
    context.serverEvents = serverFacts.events || [];
    context.serverFacts = serverFacts;
    context.localFacts = localFacts;
    const explicitBountyTalismanSetup = (options && options.bountyTalismanSetup)
      || (options && options.leechSetup && options.leechSetup.bountyTalismanSetup)
      || null;
    context.bountyTalismanSetup = explicitBountyTalismanSetup
      || unknownBountyTalismanSetup('first_pass_without_bounty_setup');
    context.transcendenceWindows = (serverFacts.transcendenceTriggers || []).map(t => [t.ts, t.ts + TRANSCENDENCE_WINDOW_SECONDS]);
    context.gravSanSetup = inferGravSanSetup(serverFacts, localFacts, options || {});
    if (!explicitBountyTalismanSetup) {
      context.bountyTalismanSetup = inferBountyTalismanDamageSetup(
        serverFacts,
        context.gravSanSetup,
      );
    }
    context.bestiaryClassBonus = inferBestiaryClassDamageBonus(serverFacts, context);
    // M-039: depois do bonus de classe, porque a ancora da testemunha de omega precisa
    // dele para bater com o dano de charm observado (a razao x1,06 em si nao depende).
    context.omegaSetup = inferOmegaPerk(serverFacts, context);
    // CrÃ­tico por-componente: aqui sÃ³ o BOOTSTRAP (pass-1). Se `options.critMultiplier`
    // for dado, respeita como fallback fixo; senÃ£o usa o global grosso crit-independente
    // da porÃ§Ã£o. Os multiplicadores por-componente (`byComponent`) sÃ£o preenchidos pelo
    // two-pass em classifyUnifiedParsed. `multiplier` fica como espelho do fallback sÃ³
    // para compatibilidade de leitura (report/telemetria).
    const critOverride = options && options.critMultiplier != null ? (+options.critMultiplier || 1) : null;
    const coarse = critOverride != null ? critOverride : inferCoarseGlobalCrit(serverFacts.hits);
    context.critSetup = { byComponent: {}, fallback: coarse, multiplier: coarse, source: critOverride != null ? 'option_critMultiplier' : 'bootstrap_coarse_global', evidence: {} };
    context.leechSetup = (options && options.leechSetup) ||
      ((options && options.deferLeechSetupInference) ? unknownLeechSetup('first_pass_without_leech') : inferLeechSetup(serverFacts, context));
    context.bossMobs = bossNameSet(serverFacts.hits);
    context.isRp = false;
    const facts = { server: serverFacts, local: localFacts };
    context.vocation = inferVocation(context, facts);
    context.isRp = context.vocation === 'paladin';
    return context;
  }

  function summarizeResolutionStatuses(turns) {
    const out = {
      resolved_without_leech: 0,
      ambiguous_without_leech: 0,
      unresolved_without_leech: 0,
    };
    for (const t of turns || []) {
      if (t && t.status === 'resolved') out.resolved_without_leech++;
      else if (t && t.status === 'ambiguous') out.ambiguous_without_leech++;
      else out.unresolved_without_leech++;
    }
    return out;
  }

  // Split a per-turn Executioner's Throw block into base/amped tiers. PÃ“S-PASSE de
  // sessÃ£o sobre os turnos jÃ¡ resolvidos â€” NÃƒO participa da pontuaÃ§Ã£o de partiÃ§Ã£o.
  // Sinal primÃ¡rio Ã© o LEECH (a maioria dos hits de amp kor Ã© overkill, com dano
  // truncado e inÃºtil). O leech incide sobre o dano real e Ã© bimodal na razÃ£o A do
  // bÃ´nus. Canais avaliados separadamente; mana Ã© o canal PRIMÃRIO (o life leech Ã©
  // capado pela vida faltante e mente quando o jogador estÃ¡ quase cheio). Clusteriza
  // POR TURNO porque o leech carrega o fator de Ã¡rea (0.1+0.9/N) que desliza entre
  // casts. O multiplicador A Ã© fixo por log e vem da razÃ£o de dano de pares limpos do
  // mesmo cast (exato), snap em EXECUTIONER_BONUS_LEVELS.
  const EXEC_LEECH_GAP = 1.55; // gap mÃ­nimo entre base e amped (bÃ´nus ~2Ã—) vs variaÃ§Ã£o intra-tier (~1.3Ã—)

  // Retorna o Set de Ã­ndices no cluster ALTO (amped) se houver um gap >= threshold no
  // maior salto relativo entre valores >0 ordenados; null se nÃ£o houver split (tier Ãºnico).
  function execBimodalHighSet(pairs, threshold) {
    const pts = pairs.filter(p => p.v > 0).sort((a, b) => a.v - b.v);
    if (pts.length < 2) return null;
    let bestRatio = 1, splitAt = -1;
    for (let i = 1; i < pts.length; i++) {
      const r = pts[i].v / pts[i - 1].v;
      if (r > bestRatio) { bestRatio = r; splitAt = i; }
    }
    if (bestRatio < threshold || splitAt < 0) return null;
    const high = new Set();
    for (let i = splitAt; i < pts.length; i++) high.add(pts[i].idx);
    return high;
  }

  function detectExecutionerTiers(turns) {
    const execComps = [];
    for (const turn of turns || []) {
      for (const comp of (turn.components || [])) {
        if (isExecutionerThrowAction(comp.action)) execComps.push(comp);
      }
    }
    if (!execComps.length) return;

    // Pass 1: classificar cada hit por turno (bloco), mana leech primÃ¡rio, life confirmatÃ³rio.
    for (const comp of execComps) {
      const hits = comp.hits || [];
      const manaHigh = execBimodalHighSet(hits.map((h, i) => ({ idx: i, v: +h.manaLeech || 0 })), EXEC_LEECH_GAP);
      const lifeHigh = execBimodalHighSet(hits.map((h, i) => ({ idx: i, v: +h.lifeLeech || 0 })), EXEC_LEECH_GAP);
      hits.forEach((h, i) => {
        const mana = +h.manaLeech || 0;
        const life = +h.lifeLeech || 0;
        let active = null;
        if (manaHigh && mana > 0) {
          active = manaHigh.has(i); // mana Ã© o canal confiÃ¡vel: decide sozinho quando presente
        } else if (lifeHigh && life > 0) {
          active = lifeHigh.has(i); // sem mana utilizÃ¡vel, cai pro life
        }
        h.executionerBonusActive = active;
      });
    }

    // Pass 1.5: fallback de sessÃ£o. Muitos casts sÃ£o de tier Ãºnico (todos os mobs na mesma
    // faixa de HP) e nÃ£o tÃªm gap interno â€” ficam null no pass 1. Como A Ã© fixo por log e o
    // mana leech de base/amped Ã© estÃ¡vel e bem separado na sessÃ£o (o life leech capa por HP
    // faltante, entÃ£o sÃ³ mana serve de fallback), calibra os nÃ­veis com os hits jÃ¡ confiantes
    // e classifica os null por proximidade, deixando null sÃ³ a zona ambÃ­gua do meio.
    const confBaseMana = [], confAmpedMana = [];
    for (const comp of execComps) for (const h of comp.hits || []) {
      const mana = +h.manaLeech || 0;
      if (mana <= 0) continue;
      if (h.executionerBonusActive === false) confBaseMana.push(mana);
      else if (h.executionerBonusActive === true) confAmpedMana.push(mana);
    }
    if (confBaseMana.length >= 2 && confAmpedMana.length >= 2) {
      const baseLvl = median(confBaseMana), ampedLvl = median(confAmpedMana);
      if (baseLvl > 0 && ampedLvl / baseLvl >= EXEC_LEECH_GAP) {
        for (const comp of execComps) for (const h of comp.hits || []) {
          if (h.executionerBonusActive != null) continue;
          const mana = +h.manaLeech || 0;
          if (mana <= 0) continue;
          if (mana <= baseLvl * 1.12) h.executionerBonusActive = false;
          else if (mana >= ampedLvl * 0.88) h.executionerBonusActive = true;
        }
      }
    }

    // Pass 2: A fixo por log â€” razÃ£o de dano de pares limpos (nÃ£o-overkill) do MESMO cast
    // (mesma rolagem â‡’ exato). Fallback: razÃ£o entre mÃ©dias de dano limpo de toda a sessÃ£o.
    const sameCastRatios = [];
    const cleanBase = [], cleanAmped = [];
    for (const comp of execComps) {
      const base = [], amped = [];
      for (const h of comp.hits || []) {
        if (h.overkill) continue;
        const dmg = +h.dmg || 0;
        if (!(dmg > 0)) continue;
        if (h.executionerBonusActive === true) { amped.push(dmg); cleanAmped.push(dmg); }
        else if (h.executionerBonusActive === false) { base.push(dmg); cleanBase.push(dmg); }
      }
      if (base.length && amped.length) sameCastRatios.push(median(amped) / median(base));
    }
    let rawA = null;
    if (sameCastRatios.length) rawA = median(sameCastRatios);
    else if (cleanBase.length && cleanAmped.length) rawA = median(cleanAmped) / median(cleanBase);
    const A = rawA != null
      ? EXECUTIONER_BONUS_LEVELS.reduce((best, lv) => Math.abs(lv - rawA) < Math.abs(best - rawA) ? lv : best, EXECUTIONER_BONUS_LEVELS[0])
      : null;

    // Pass 3: multiplicador por hit + nÃ­vel no componente.
    for (const comp of execComps) {
      let anyResolved = false;
      for (const h of comp.hits || []) {
        h.executionerBonusMultiplier = h.executionerBonusActive === true ? (A || null)
          : (h.executionerBonusActive === false ? 1 : null);
        if (h.executionerBonusActive != null) anyResolved = true;
      }
      if (anyResolved && A != null) {
        comp.deterministic = comp.deterministic || {};
        comp.deterministic.executionerBonusLevel = A;
      }
    }
  }

  function classifyUnifiedParsed(server, local, options, bmDetection) {
    const shouldGoldInferLeech = !(options && options.leechSetup) && !(options && options.disableGoldLeechPipeline);
    const context = buildContext(server, local, Object.assign({}, options || {}, shouldGoldInferLeech ? { deferLeechSetupInference: true } : {}));
    const turns = buildTurns(server.hits, local.spellCasts, context);
    const facts = { server, local };
    let resolvedTurns;
    let resolvedWithoutLeech = null;
    let goldLeechObservations = [];
    let aaElementDetection = null;
    // M-024/M-025: a consolidaÃ§Ã£o de granada cross-turno Ã© por-passe e dependente de
    // ordem temporal; o conjunto de casts jÃ¡ explodidos Ã© reiniciado a cada varredura.
    // CrÃ­tico por-componente (two-pass): a passada pass-1 (bootstrap crit grosso) rotula os
    // hits; inferimos o crit por-componente e a passada final usa `byComponent`. Reusa a
    // passada `resolvedWithoutLeech` como pass-1 de crit para nÃ£o pagar uma varredura extra.
    const refineCritByComponent = pass1 => {
      const est = inferCritByComponent(labeledHitsFromTurns(pass1), null, context);
      if (est && est.byComponent && Object.keys(est.byComponent).length) {
        // Etapa 2: o multiplicador por-componente estimado pela etapa 1 (buckets
        // mean(crit)/mean(noncrit), inalterada) Ã© ajustado ("snap") para o candidato
        // mais prÃ³ximo da tabela conhecida do build (CRIT_MULTIPLIER_CANDIDATES),
        // absorvendo ruÃ­do de amostra pequena por (componente, mob).
        for (const key of Object.keys(est.byComponent)) est.byComponent[key] = snapCritMultiplier(est.byComponent[key]);
        // O bucket 'physical' (AA) pode inflar por confusÃ£o de componente + viÃ©s de
        // cauda-baixa da armadura (numa porÃ§Ã£o onde o nÃ£o-crit-AA Ã© raro/baixo). Crits
        // fÃ­sicos reais ficam â‰¤ ~1.9; um valor acima disso quebra a reversÃ£o do bloco AA
        // (physical_no_candidate). SÃ³ o fÃ­sico Ã© limitado â€” holy/runa/granada chegam a ~1.99.
        if (est.byComponent.physical > CRIT_BOOTSTRAP_MAX) est.byComponent.physical = CRIT_BOOTSTRAP_MAX;
        context.critSetup.byComponent = est.byComponent;
        context.critSetup.evidence = est.evidence;
        context.critSetup.source = 'bucket_two_pass';
      }
    };
    if (shouldGoldInferLeech) {
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      resetConsolidatedActions(context);
      resolvedWithoutLeech = turns.map(t => resolveTurn(t, facts, context));
      refineCritByComponent(resolvedWithoutLeech);
      const frozenBountyDamage = inferBountyDamageFromFrozenComponents(
        resolvedWithoutLeech,
        context,
      );
      if (context.bountyTalismanSetup.damage.confidence === 'unknown'
        && frozenBountyDamage.confidence !== 'unknown') {
        context.bountyTalismanSetup.damage = frozenBountyDamage;
        if (context._revCache) context._revCache.clear();
        context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
        resetConsolidatedActions(context);
        resolvedWithoutLeech = turns.map(t => resolveTurn(t, facts, context));
        refineCritByComponent(resolvedWithoutLeech);
      } else {
        context.bountyTalismanSetup.damage.fallbackConfirmation = frozenBountyDamage;
      }
      goldLeechObservations = collectGoldLeechObservations(resolvedWithoutLeech, context);
      const charmCandidates = detectCharmCandidateMobsFromColocatedTurns(resolvedWithoutLeech, context);
      context.leechSetup = inferLeechSetupFromGoldObservations(
        goldLeechObservations,
        context,
        charmCandidates,
        resolvedWithoutLeech,
      );
      context.bountyTalismanSetup = context.leechSetup.bountyTalismanSetup
        || unknownBountyTalismanSetup('gold_observations_without_bounty_setup');
      if (context._revCache) context._revCache.clear();
      context.gravSanSetup = inferGravSanSetup(server, local, options || {}, {
        context,
        resolvedTurns: resolvedWithoutLeech,
      });
      if (context.gravSanSetup.source === 'inferred_from_damage_leech_in_grav_san_windows') {
        // D-030: depois de fixar o tier global, repete o refinamento que pode depender
        // da reversão do multiplicador. A votação continua apoiada exclusivamente nos
        // componentes congelados da primeira passada.
        context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
        resetConsolidatedActions(context);
        refineCritByComponent(turns.map(t => resolveTurn(t, facts, context)));
      }
      // S-007: eixo do bloco de AA por sessao. Roda DEPOIS do crit por-componente e do
      // leech (usa `crit`/`pierce` na reversao) e ANTES da passada final, que e quem
      // consome `context.aaElement`. Nao usa particao resolvida -- os cortes sao
      // buscados por forca bruta -- entao nao ha circularidade com resolveTurn.
      aaElementDetection = inferAaElementForSession(turns, local, context);
      context.aaElement = aaElementDetection.element;
      // M-016e: sÃ³ depois do leech real (nÃ£o o bootstrap) Ã© que o cluster
      // vida/mana-por-dano Ã© confiÃ¡vel para corrigir um estÃ¡gio atrasado que a
      // 1Âª passada (sem leech) nÃ£o conseguiu provar por reversÃ£o elemental.
      reconsolidateMultiStageWithLeech(turns, local.spellCasts, context);
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      resetConsolidatedActions(context);
      resolvedTurns = turns.map(t => resolveTurn(t, facts, context));
      detectExecutionerTiers(resolvedTurns);
    } else {
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      resetConsolidatedActions(context);
      const pass1 = turns.map(t => resolveTurn(t, facts, context));
      refineCritByComponent(pass1);
      context.gravSanSetup = inferGravSanSetup(server, local, options || {}, {
        context,
        resolvedTurns: pass1,
      });
      if (context.gravSanSetup.source === 'inferred_from_damage_leech_in_grav_san_windows') {
        context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
        resetConsolidatedActions(context);
        refineCritByComponent(turns.map(t => resolveTurn(t, facts, context)));
      }
      aaElementDetection = inferAaElementForSession(turns, local, context);
      context.aaElement = aaElementDetection.element;
      reconsolidateMultiStageWithLeech(turns, local.spellCasts, context);
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      resetConsolidatedActions(context);
      resolvedTurns = turns.map(t => resolveTurn(t, facts, context));
      detectExecutionerTiers(resolvedTurns);
    }
    const result = {
      version: VERSION,
      status: resolvedTurns.some(t => t.status === 'unresolved' && !t.partialEdgeMissingEvidence) ? 'partial' : 'resolved',
      sessionDateKey: server.sessionDateKey,
      selectedSpeaker: local.selectedSpeaker,
      selectedSpeakerMethod: local.selectedSpeakerMethod,
      selectedSpeakerScores: local.selectedSpeakerScores,
      vocation: context.vocation,
      mobModsRegime: context.mobModsRegime || (context.sessionDateKey >= CUTOFF_KEY ? 'post-2026-06-16' : 'pre-2026-06-16'),
      mobModsStats: context.mobModsStats || null,
      bmPierce: context.bmPierce || 0,
      bmPierceDetection: bmDetection || { pierce: context.bmPierce || 0, active: !!(context.bmPierce > 0), source: explicitBmPierceOption(options) == null ? 'not_run' : 'option_bmPierce' },
      leechSetup: context.leechSetup,
      bountyTalismanSetup: context.bountyTalismanSetup,
      resolvedWithoutLeech: resolvedWithoutLeech ? summarizeResolutionStatuses(resolvedWithoutLeech) : null,
      goldLeechObservationCount: goldLeechObservations.length,
      goldLeechObservationTurns: Array.from(new Set(
        goldLeechObservations.map(observation => observation.clock).filter(Boolean),
      )).sort(),
      goldLeechObservationsSample: goldLeechObservations.slice(0, 20),
      gravSanSetup: context.gravSanSetup,
      aaElement: context.aaElement || 'physical',
      aaElementDetection: aaElementDetection || { element: 'physical', source: 'not_run', counts: null, eligible: 0 },
      bestiaryClassDamageBonus: context.bestiaryClassBonus,
      critSetup: context.critSetup,
      spellLeechBonusCandidates: SPELL_LEECH_BONUS_CANDIDATES,
      turns: resolvedTurns,
      rows: aggregateRows(resolvedTurns),
      facts: { server, local },
      formulas: {
        invFloor: 'FLOOR(x*q)=y => [CEIL(y/q), CEIL((y+1)/q)-1]',
        invCeil: 'CEIL(x*q)=y => [FLOOR((y-1)/q)+1, FLOOR(y/q)]',
        elemental: 'F = ROUND_POST(FLOOR(CEIL(O*modEff)*mitigationMultiplier)*postMultiplier), ROUND_POST accepts FLOOR/CEIL hypotheses',
        physical: 'F = ROUND_POST(FLOOR(FLOOR(MAX(CEIL(O*physicalModEff)-armorRoll,0)*critMultiplier)*mitigationMultiplier)*postMultiplier), postMultiplier includes active prey and the selected per-component utevo grav san hypothesis; ROUND_POST accepts FLOOR/CEIL hypotheses',
        critical: 'critical multiplier is inferred per log and inverted before mitigation for original-damage reconstruction',
        leechBasis: 'damage shown divided by active prey and by utevo grav san only when the per-component gravSanActive hypothesis is selected; critical is not divided out for leech',
        areaFactor: '0.1 + 0.9/N_leech',
        leechTolerance: 'individual observed leech accepts expected +/- 3 for N<=3 and +/- 1 for N>=4; overkill below expected is capped_low/neutral; concrete deterministic spell can survive sparse leech with >=1 confirmation and 0 contradictions',
        pierce: 'effectiveMod(baseMod, pierce): fill resistance toward neutral first; remaining pierce is halved upward by 1% steps; Expose Weakness adds +8% to that hit and BM adds +4% to RP holy/physical when inferred',
        elementalIntermediateTolerance: 'if exact elemental inversion has no original, retry post/pre-mitigation intermediate damage at +/- ' + ELEMENTAL_INTERMEDIATE_TOLERANCE,
        elementalCluster: 'concrete spell/rune action may pass with a small original cluster: min ' + ELEMENTAL_CLUSTER_MIN_TOLERANCE + ', ratio ' + ELEMENTAL_CLUSTER_RATIO + ', max ' + ELEMENTAL_CLUSTER_MAX_TOLERANCE,
        terraBurstBonus: 'exevo ulus tera tests one global bonus level from ' + TERRA_BURST_BONUS_LEVELS.join('/') + ' with active/inactive per hit; bonus is modeled as pre-mitigation damage and leech stays on shown damage',
      },
    };
    Object.defineProperty(result, '_context', { value: context, enumerable: false, configurable: true });
    return result;
  }

  function classifyUnified(serverLogText, localChatText, options) {
    const server = parseServerFacts(serverLogText);
    const local = parseLocalChat(localChatText, Object.assign({}, options || {}, { serverFacts: server }));
    if (server.hits.length < 4) {
      return { version: VERSION, error: 'log_too_short', attackCount: server.hits.length, facts: { server, local } };
    }

    const explicitBm = explicitBmPierceOption(options);
    const shouldAutoDetectBm = explicitBm == null && !(options && options.autoDetectBmPierce === false);

    // Atalho por testemunha de charm: o dano de charm e determinístico e independente da
    // classificacao (wound = fisico, divine wrath = holy -- os dois canais que o BM
    // altera), entao quando ele decide o pierce nao ha motivo para classificar a sessao
    // duas vezes so para comparar coerencia cross-mob. Quando nao ha veredito (sessao
    // pre-cutoff sem `hitpoints`, sem charm testemunha, ou evidencia nao-unanime), o
    // fluxo abaixo segue exatamente como antes.
    // Ver openspec/changes/infer-bm-pierce-from-charm-damage (comparativo: 0 divergencias
    // em 74 sessoes; 11 decidem por charm, das quais 5 com veredito 0).
    if (shouldAutoDetectBm) {
      const charmProbeContext = {
        sessionDateKey: server.sessionDateKey,
        mobModsPre: options && options.mobModsPre,
        mobModsPost: options && options.mobModsPost,
        getMobMods: options && options.getMobMods,
        useFloat16Mitigation: options && options.useFloat16Mitigation !== undefined ? options.useFloat16Mitigation : true,
        gravSanSetup: inferGravSanSetup(server, local, options || {}),
      };
      const charmBm = inferBmPierceFromCharmDamage(server, charmProbeContext);
      if (charmBm && charmBm.pierce != null) {
        const detection = {
          pierce: charmBm.pierce,
          active: charmBm.pierce > 0,
          source: 'confirmed_by_charm_damage',
          charmRows: charmBm.rows,
        };
        const charmResult = classifyUnifiedParsed(
          server, local,
          Object.assign({}, options || {}, { bmPierce: charmBm.pierce }),
          detection
        );
        return charmResult;
      }
    }

    const baseOptions = Object.assign({}, options || {}, { bmPierce: explicitBm == null ? 0 : explicitBm });
    const baseResult = classifyUnifiedParsed(server, local, baseOptions, explicitBm == null ? { pierce: 0, active: false, source: 'pending_auto_detection' } : { pierce: explicitBm, active: explicitBm > 0, source: 'option_bmPierce' });

    if (!shouldAutoDetectBm) return baseResult;

    // Se a classificaÃ§Ã£o BM=0 tem turnos `unresolved`, a incoerÃªncia pode ser o prÃ³prio
    // BM ausente (casts holy mistos mobâ‰ 1.0 + mob 1.0). Classifica a hipÃ³tese BM=0.04 em
    // paralelo (parse fresco, sem contaminar os hits de baseResult) e alimenta o detector
    // com os blocos holy de AMBAS as hipÃ³teses. SÃ³ quando hÃ¡ `unresolved` â€” sessÃµes limpas
    // seguem o caminho barato de 1 classificaÃ§Ã£o.
    let altResult = null;
    if ((baseResult.turns || []).some(t => t && t.status === 'unresolved')) {
      const server2 = parseServerFacts(serverLogText);
      const local2 = parseLocalChat(localChatText, Object.assign({}, options || {}, { serverFacts: server2 }));
      altResult = classifyUnifiedParsed(server2, local2, Object.assign({}, options || {}, { bmPierce: 0.04 }), { pierce: 0.04, active: true, source: 'bm_probe_hypothesis' });
    }

    const detection = inferBmPierceFromCrossMobEvidence(baseResult, baseResult._context, altResult);
    if (detection && detection.pierce > 0) {
      if (altResult && Math.abs((altResult.bmPierce || 0) - detection.pierce) < 1e-9) {
        altResult.bmPierceDetection = detection;
        return altResult;
      }
      return classifyUnifiedParsed(server, local, Object.assign({}, options || {}, { bmPierce: detection.pierce }), detection);
    }
    baseResult.bmPierceDetection = detection;
    return baseResult;
  }

  const API = {
    VERSION,
    ELEMENTS,
    SPELL_PROFILES,
    RUNE_PROFILES,
    SPELL_LEECH_BONUS_CANDIDATES,
    LEECH_VALUE_TOLERANCE_SMALL_BLOCK,
    LEECH_VALUE_TOLERANCE_LARGE_BLOCK,
    ELEMENTAL_INTERMEDIATE_TOLERANCE,
    ELEMENTAL_CLUSTER_MIN_TOLERANCE,
    ELEMENTAL_CLUSTER_MAX_TOLERANCE,
    ELEMENTAL_CLUSTER_RATIO,
    TERRA_BURST_BONUS_LEVELS,
    classifyUnified,
    parseServerFacts,
    parseLocalChat,
    inferGravSanSetup,
    inferBestiaryClassDamageBonus,
    inferOmegaPerk,
    // Exportada para diagnóstico/validação. AINDA NÃO ligada ao fluxo de classificação:
    // o gate de controle negativo (task 3 do change infer-bm-pierce-from-charm-damage)
    // precisa fechar antes de ela virar decisão primária de bmPierce.
    inferBmPierceFromCharmDamage,
    inferCritByComponent,
    inferBmPierceFromCrossMobEvidence,
    buildTurns,
    reconsolidateMultiStageWithLeech,
    buildContext,
    resolveTurn,
    formulas: {
      effectiveMod,
      invFloor,
      invCeil,
      elementalOriginalCandidates,
      physicalOriginalInterval,
      areaFactor,
      realDamageIntervalFromLeech,
      expectedLeech,
      hitLeechFit,
      inferLeechSetup,
    },
  };

  root.UnifiedClassificationEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
