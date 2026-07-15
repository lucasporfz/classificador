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
    WEAPON_LEECH_BONUS,
    MAX_WEAPON_LEECH_BONUSES,
    SPELL_LEECH_BONUS_CANDIDATES,
    GRAV_SAN_INCANTATION,
    GRAV_SAN_DURATION_SECONDS,
    GRAV_SAN_BONUS_CANDIDATES,
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
    inferLeechSetupFallback,
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

  function inferGravSanSetup(serverFacts, localFacts, options) {
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
    const keyOf = ev => [normalizeName(ev.mob), ev.isPrey ? 'prey' : 'no_prey', charmSignature(ev)].join('|');
    const outsideByKey = new Map();
    for (const ev of charmEvents) {
      if (isWithinAnyWindow(ev.ts, windows)) continue;
      const key = keyOf(ev);
      const arr = outsideByKey.get(key) || [];
      arr.push(ev.dmg);
      outsideByKey.set(key, arr);
    }
    const baselines = new Map();
    for (const [key, arr] of outsideByKey.entries()) {
      if (arr.length) baselines.set(key, median(arr));
    }

    const scores = GRAV_SAN_BONUS_CANDIDATES.map(b => ({ bonus: b, multiplier: 1 + b, votes: 0, error: 0, examples: [] }));
    const inside = charmEvents.filter(ev => isWithinAnyWindow(ev.ts, windows));
    for (const ev of inside) {
      const key = keyOf(ev);
      const baseline = baselines.get(key);
      if (!(baseline > 0)) continue;
      for (const cand of scores) {
        const expected = baseline * cand.multiplier;
        const delta = Math.abs(ev.dmg - expected);
        const tolerance = Math.max(2, baseline * 0.0125);
        if (delta <= tolerance) {
          cand.votes++;
          cand.error += delta;
          if (cand.examples.length < 8) cand.examples.push({
            ts: ev.ts,
            clock: ev.clock,
            mob: ev.mob,
            charm: charmSignature(ev),
            prey: !!ev.isPrey,
            observed: ev.dmg,
            baseline,
            expected: Math.round(expected * 1000) / 1000,
            ratio: Math.round((ev.dmg / baseline) * 10000) / 10000,
            rawLine: ev.rawLine,
          });
        }
      }
    }
    scores.sort((a, b) => b.votes - a.votes || a.error - b.error || b.bonus - a.bonus);
    const best = scores[0];
    if (!best || best.votes <= 0) {
      return { bonus: 0, multiplier: 1, source: 'utevo_grav_san_cast_without_charm_inference', casts, windows, ranked: scores, insideCharmCount: inside.length };
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
  function inferCritByComponent(labeledHits, options, context) {
    const MIN = (options && options.minSamples) || CRIT_BUCKET_MIN_SAMPLES;
    const gravSetup = context && context.gravSanSetup;
    const gravBonus = gravSetup && gravSetup.bonus > 0 ? gravSetup.bonus : 0;
    const groups = new Map(); // compKey -> "mob|ew" -> { crit:[], noncrit:[] }
    for (const h of labeledHits || []) {
      if (!h || h.overkill) continue;
      if (h.onslaught && h.realCrit) continue;
      if (h.realCrit && isTranscendenceActiveAt(context, h.ts)) continue;
      const key = h.compKey;
      let dmg = +h.dmg || 0;
      if (!key || !(dmg > 0)) continue;
      if (h.isPrey) dmg /= 1.25;
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
      if (!isMainHit(h) || h.overkill || h.isPrey) continue;
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
            overkill: !!h.overkill, isPrey: !!h.isPrey, ts: h.ts,
            onslaught: !!h.onslaught, exposeWeakness: !!h.exposeWeakness,
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
    context.transcendenceWindows = (serverFacts.transcendenceTriggers || []).map(t => [t.ts, t.ts + TRANSCENDENCE_WINDOW_SECONDS]);
    context.gravSanSetup = inferGravSanSetup(serverFacts, localFacts, options || {});
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
      context.consolidatedGrenadeCasts = new Set();
      resolvedWithoutLeech = turns.map(t => resolveTurn(t, facts, context));
      refineCritByComponent(resolvedWithoutLeech);
      goldLeechObservations = collectGoldLeechObservations(resolvedWithoutLeech, context);
      const charmCandidates = detectCharmCandidateMobsFromColocatedTurns(resolvedWithoutLeech, context);
      context.leechSetup = inferLeechSetupFromGoldObservations(goldLeechObservations, context, charmCandidates);
      // M-016e: sÃ³ depois do leech real (nÃ£o o bootstrap) Ã© que o cluster
      // vida/mana-por-dano Ã© confiÃ¡vel para corrigir um estÃ¡gio atrasado que a
      // 1Âª passada (sem leech) nÃ£o conseguiu provar por reversÃ£o elemental.
      reconsolidateMultiStageWithLeech(turns, local.spellCasts, context);
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      context.consolidatedGrenadeCasts = new Set();
      resolvedTurns = turns.map(t => resolveTurn(t, facts, context));
      detectExecutionerTiers(resolvedTurns);
    } else {
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      context.consolidatedGrenadeCasts = new Set();
      const pass1 = turns.map(t => resolveTurn(t, facts, context));
      refineCritByComponent(pass1);
      reconsolidateMultiStageWithLeech(turns, local.spellCasts, context);
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      context.consolidatedGrenadeCasts = new Set();
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
      resolvedWithoutLeech: resolvedWithoutLeech ? summarizeResolutionStatuses(resolvedWithoutLeech) : null,
      goldLeechObservationCount: goldLeechObservations.length,
      goldLeechObservationsSample: goldLeechObservations.slice(0, 20),
      gravSanSetup: context.gravSanSetup,
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
