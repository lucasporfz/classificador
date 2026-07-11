/*
 * unified-classification-engine.js
 *
 * Núcleo único e isolado de classificação mecânica para logs de Tibia.
 * Objetivo: substituir a pilha histórica parser → bandas → passes especiais → experimental
 * por um fluxo normativo único, auditável e orientado por docs/CLASSIFICATION_RULES.md.
 *
 * Este arquivo NÃO altera UI/produção por conta própria. Ele exporta:
 *   - globalThis.UnifiedClassificationEngine
 *   - module.exports, quando disponível
 *
 * API principal:
 *   const result = UnifiedClassificationEngine.classifyUnified(serverLog, localChat, options)
 *
 * Options úteis:
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





  // S-004a/D-010a: chave de "mesmo mob no mesmo estado de modificadores" — mesmo mob +
  // mesmas condições que afetam o dano (EW, prey, amplification, tipo de hit, crit,
  // Low Blow, Onslaught) implica mesma rolagem/reversão exata. Compartilhada entre a
  // homogeneidade intra-bloco (validateElementalBlock) e o override por dano final do
  // M-031 (validateCandidate), que usa a mesma noção entre dois blocos diferentes.
  // NÃO renomear para `hitStateKey` — esse nome já existe (mais adiante no arquivo,
  // H-005/S-004a) com um conjunto de campos mais estreito (sem amplification/type);
  // declarações de função com o mesmo nome no mesmo escopo colidem por hoisting.



  // Fórmula normativa do pierce conforme calculadora/regras revisadas.

  // Análogo, para intervalos contínuos, do `intersectSets(sets, tolerance)`
  // do eixo elemental: aceita um par de intervalos que não se tocam
  // exatamente, desde que a lacuna não passe de `tolerance`. Usada SÓ por
  // `intersectIntervals` (o acumulador de `validatePhysicalBlock`) — não
  // substitui `intersectInterval`, cujos outros usos (ex.: interseção de 2
  // canais de leech) fazem uma única chamada isolada e não devem ganhar
  // folga nenhuma.




  // Chave de crítico do bloco: o crítico é POR-COMPONENTE (build). AA/físico → 'physical';
  // spell/rune/grenade → prefixado pela incantation/nome, para que dois spells do mesmo
  // elemento (Caldera vs granada) possam ter críticos distintos. A MESMA função rotula os
  // hits para a inferência (pass-1) e escolhe o multiplicador na reversão (pass-2).







  // Terra Burst (exevo ulus tera, earth) and Ice Burst (exevo ulus frigo, ice) are the
  // same target-life conditional-bonus mechanic, differing only by element — both actions
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
    // Heurística conservadora: se sessão inteira tem um único mob, tratamos turnos como boss/single-target.
    const mobs = new Set((hits || []).filter(isMainHit).map(h => normalizeName(h.mob)));
    return mobs.size === 1 ? mobs : new Set();
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

  // Estimador de crítico POR-COMPONENTE por buckets crit/não-crit.
  // Entrada: hits já rotulados (cada um com `compKey`, `mob`, `dmg`, `realCrit`,
  // `overkill`, `isPrey`, `ts`, `onslaught`, `exposeWeakness`, `gravSanActive`).
  // O crítico é uniforme por-ataque e escala a distribuição inteira, então
  // mean(crit)/mean(noncrit) por estrato estima o multiplicador sem depender do mod do
  // mob (ele cancela na razão). Tira a mediana entre os estratos elegíveis.
  // Não usa min/min (viés de amostra do lado crit, que é mais raro).
  //
  // Limpeza dos buckets (C-005: cada bônus no seu eixo mecânico, nunca ajuste livre):
  //   EXCLUI  — overkill (dano truncado); onslaught+crit e crit em janela de
  //             Transcendence (bônus ADITIVOS sobre o multiplicador sendo medido —
  //             descontar exigiria já conhecer o crítico-base, circular).
  //   NORMALIZA — prey (÷1.25) e utevo grav san (÷(1+bonus), só quando o hit está em
  //             janela E a hipótese por-componente não é `false`); onslaught sem crit
  //             (÷1.6 — sem crítico junto, o bônus aditivo vira fator conhecido).
  //   ESTRATIFICA — Expose Weakness muda o mod efetivo do mob (não é fator fixo
  //             divisível): crit só compara com não-crit do MESMO estado de EW; o
  //             fator de EW cancela na razão dentro do estrato.
  // Low Blow fica como está: o charm dá CHANCE de crítico, não multiplicador.
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
      // `mobs` mantém o nome por compatibilidade de shape; conta ESTRATOS (mob × EW).
      evidence[key] = { multiplier: mult, mobs: ratios.length, spread: ratios.length > 1 ? Math.max.apply(null, ratios) - Math.min.apply(null, ratios) : 0, noncrit: nc, crit: cr };
      allMults.push(mult);
    }
    const fallback = median(allMults) || 1;
    return { byComponent, fallback, evidence, source: allMults.length ? 'bucket_mean_ratio' : 'no_bucket_samples' };
  }

  // Bootstrap crit-independente para o pass-1 (quebra a circularidade rótulo↔crit):
  // razão mean(crit)/mean(noncrit) POR MOB (todos os componentes juntos), mediana entre
  // mobs. Não precisa de rótulo de componente nem de reversão — só do flag realCrit.
  // É um blend (ponderado por dano) dos críticos por-componente, suficiente para os turnos
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
    // Clamp: o coarse é confundido por componente (numa porção onde os crits são
    // predominantemente AA-alto e os não-crits spell/runa-baixo, a razão infla acima do
    // crit real, ~1.5–2.0). Como isto é só o BOOTSTRAP do pass-1, limitá-lo a um teto
    // plausível evita que uma porção patológica (ex.: highwin coarse 2.48) sobre-divida o
    // crit e derrube o pass-1 inteiro (physical_no_candidate) — o que deixaria byComponent
    // vazio e travaria a porção no próprio coarse ruim.
    return Math.min(Math.max(med, 1), CRIT_BOOTSTRAP_MAX);
  }

  // Extrai hits rotulados (compKey por bloco) dos turnos resolvidos de um passe, para
  // alimentar inferCritByComponent. Só componentes reais (não 'unresolved').
  // Além dos campos de bucket, propaga o que a limpeza dos buckets precisa: `ts`
  // (janelas de grav san/Transcendence), `onslaught`, `exposeWeakness` (estratificação)
  // e `gravSanActive` — a hipótese por-componente vencedora da validação (V18: o buff
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
    // Crítico por-componente: aqui só o BOOTSTRAP (pass-1). Se `options.critMultiplier`
    // for dado, respeita como fallback fixo; senão usa o global grosso crit-independente
    // da porção. Os multiplicadores por-componente (`byComponent`) são preenchidos pelo
    // two-pass em classifyUnifiedParsed. `multiplier` fica como espelho do fallback só
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

  function classifyUnifiedParsed(server, local, options, bmDetection) {
    const shouldGoldInferLeech = !(options && options.leechSetup) && !(options && options.disableGoldLeechPipeline);
    const context = buildContext(server, local, Object.assign({}, options || {}, shouldGoldInferLeech ? { deferLeechSetupInference: true } : {}));
    const turns = buildTurns(server.hits, local.spellCasts, context);
    const facts = { server, local };
    let resolvedTurns;
    let resolvedWithoutLeech = null;
    let goldLeechObservations = [];
    // M-024/M-025: a consolidação de granada cross-turno é por-passe e dependente de
    // ordem temporal; o conjunto de casts já explodidos é reiniciado a cada varredura.
    // Crítico por-componente (two-pass): a passada pass-1 (bootstrap crit grosso) rotula os
    // hits; inferimos o crit por-componente e a passada final usa `byComponent`. Reusa a
    // passada `resolvedWithoutLeech` como pass-1 de crit para não pagar uma varredura extra.
    const refineCritByComponent = pass1 => {
      const est = inferCritByComponent(labeledHitsFromTurns(pass1), null, context);
      if (est && est.byComponent && Object.keys(est.byComponent).length) {
        // Etapa 2: o multiplicador por-componente estimado pela etapa 1 (buckets
        // mean(crit)/mean(noncrit), inalterada) é ajustado ("snap") para o candidato
        // mais próximo da tabela conhecida do build (CRIT_MULTIPLIER_CANDIDATES),
        // absorvendo ruído de amostra pequena por (componente, mob).
        for (const key of Object.keys(est.byComponent)) est.byComponent[key] = snapCritMultiplier(est.byComponent[key]);
        // O bucket 'physical' (AA) pode inflar por confusão de componente + viés de
        // cauda-baixa da armadura (numa porção onde o não-crit-AA é raro/baixo). Crits
        // físicos reais ficam ≤ ~1.9; um valor acima disso quebra a reversão do bloco AA
        // (physical_no_candidate). Só o físico é limitado — holy/runa/granada chegam a ~1.99.
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
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      context.consolidatedGrenadeCasts = new Set();
      resolvedTurns = turns.map(t => resolveTurn(t, facts, context));
    } else {
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      context.consolidatedGrenadeCasts = new Set();
      const pass1 = turns.map(t => resolveTurn(t, facts, context));
      refineCritByComponent(pass1);
      context.preassignedGrenadeCasts = buildGrenadeCastAssignments(turns, facts, context);
      context.consolidatedGrenadeCasts = new Set();
      resolvedTurns = turns.map(t => resolveTurn(t, facts, context));
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

    // Se a classificação BM=0 tem turnos `unresolved`, a incoerência pode ser o próprio
    // BM ausente (casts holy mistos mob≠1.0 + mob 1.0). Classifica a hipótese BM=0.04 em
    // paralelo (parse fresco, sem contaminar os hits de baseResult) e alimenta o detector
    // com os blocos holy de AMBAS as hipóteses. Só quando há `unresolved` — sessões limpas
    // seguem o caminho barato de 1 classificação.
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
