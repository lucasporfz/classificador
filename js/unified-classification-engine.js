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














  function enrichHitEvidence(hit, context) {
    const physical = physicalOriginalInterval(hit, context);
    const elemental = {};
    for (const el of ELEMENTS) {
      if (el === 'physical') continue;
      elemental[el] = elementalOriginalCandidates(hit, el, context);
    }
    hit.evidence = { physical, elemental };
    return hit;
  }

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


  function resolveSingleTargetAaVocationTurn(turn, facts, context) {
    if (!context || !SINGLE_TARGET_AA_VOCATIONS.has(context.vocation)) return null;
    const actions = turn.actions || actionsNearTurn(turn, facts);
    // generalize-single-target-aa-resolver-to-runes: a ação concreta do turno é
    // buscada primeiro em spellCasts (incantação); só na ausência de spell cast
    // compatível o resolver recorre a runeUses. Nenhum fixture das 4 vocações
    // expõe as duas simultaneamente (T-006/M-019 já impedem spell e runa
    // coexistirem no mesmo turno), mas a prioridade é defensiva.
    const spell = nearestSpellCastForTurn(turn, actions, context.vocation);
    const rune = spell ? null : nearestRuneUseForTurn(turn, actions);
    const action = spell || rune;
    if (!action) return null;
    const actionComp = spell ? 'spell' : 'rune';
    const hits = turn.hits || [];
    if (!hits.length) return null;

    // Mecânica rara: charm/proc entra antes do dano do hit que o ativou. Se a
    // ação concreta existe, mas o dano principal dela é zero e não aparece como
    // linha normal. Representamos como componente virtual de dano 0.
    if (hits.length === 1) {
      const zero = detectCharmKilledZeroAction(turn, action, facts);
      if (zero && action.ts >= hits[0].ts && action.ts <= hits[0].ts + 1) {
        const virtual = makeVirtualZeroHit(turn, action, zero);
        return finalizeManualTurn(turn, [
          { comp: 'arrow', hits: [hits[0]], reason: 'ek_single_visible_aa_before_zero_damage_spell' },
          { comp: actionComp, action, hits: [virtual], reason: 'zero_damage_spell_charm_killed_target_before_hit' },
        ], 'ek_zero_damage_spell_by_charm', context);
      }
      return null;
    }

    // Candidatos principais: todos os hits como componente único, ou AA
    // posicional no primeiro hit + componente no sufixo. Antes de aceitar S(k),
    // o Unified precisa comparar S(k) contra A1+S(k-1) pela cardinalidade de leech.
    const allSpell = [{ comp: actionComp, hits: hits.slice(), action }];
    const split = [
      { comp: 'arrow', hits: [hits[0]] },
      { comp: actionComp, hits: hits.slice(1), action },
    ];
    const allScore = leechPartitionScore(allSpell, context);
    const splitScore = leechPartitionScore(split, context);
    const strongTimestampBoundary = hasStrongTimestampAaSpellBoundary(hits, action);
    const forceA1 = shouldForceA1ByLeech(hits, context);

    let chosen = split;
    let reason = 'ek_positional_aa_first_hit';

    if (strongTimestampBoundary) {
      chosen = split;
      reason = 'ek_timestamp_boundary_aa_then_spell';
    } else if (forceA1.force) {
      chosen = split;
      reason = 'ek_a1_forced_by_leech_cardinality_' + forceA1.reason;
    } else if (allSpellManaLeechHomogeneous(hits)) {
      chosen = allSpell;
      reason = 'ek_all_spell_mana_leech_homogeneous_N_equals_k_no_a1_signature';
    } else {
      const allHasEvidence = allScore.usable >= 2;
      const splitHasEvidence = splitScore.usable >= 2;
      if (allHasEvidence && !forceA1.force && (allScore.bad < splitScore.bad || (allScore.bad === 0 && splitScore.bad > 0))) {
        chosen = allSpell;
        reason = 'ek_all_spell_validated_by_leech_cardinality';
      } else if (allHasEvidence && splitHasEvidence && allScore.bad === 0 && splitScore.bad === 0 && allScore.clean > splitScore.clean + 1) {
        chosen = allSpell;
        reason = 'ek_all_spell_stronger_leech_cardinality';
      } else if (splitHasEvidence && splitScore.bad < allScore.bad) {
        chosen = split;
        reason = 'ek_positional_aa_confirmed_by_leech_cardinality';
      }
    }

    // H-005/S-004a: a ordem AA→componente é desempate em ambiguidade genuína, não
    // um veto que sobreponha evidência positiva. Se o candidato a AA (primeiro hit)
    // tem o MESMO mob, MESMO estado de modificadores (EW/prey/crit/Low
    // Blow/Onslaught) e MESMO dano de algum hit que ficaria no bloco do sufixo,
    // esses dois hits são mecanicamente o mesmo componente determinístico
    // (S-004a): não há evidência positiva de AA (nem separação de timing, nem
    // crit-state distinto, nem dano original distinto, nem salto de leech — H-005),
    // então o split é rejeitado independentemente do que a cardinalidade por leech
    // sozinha sugerir (o "AA" isolado sempre parece leech-limpo em N=1 pelo
    // capped-low de D-023, o que por si só nunca é evidência positiva).
    if (chosen === split && firstHitSharesExactOriginalWithRest(hits)) {
      chosen = allSpell;
      reason = 'h005_same_mob_state_exact_match_blocks_aa_split';
    }

    // M-033: runa single-target (Sudden Death, Icicle, Holy Missile) recebe no
    // máximo um hit por turno, igual a uma spell single-stage. O corte por
    // posição+leech decide ONDE a fronteira cai, não autoriza violar essa
    // cardinalidade — se o bloco escolhido a viola, este resolver recua (null)
    // e deixa o caminho genérico (que já tem essa checagem) decidir.
    const actionBlock = chosen.find(def => def.comp === actionComp);
    if (actionBlock && isSingleTargetAction(actionComp, action) && actionBlock.hits.length > 1) {
      return null;
    }

    const defs = chosen.map(def => {
      const block = { comp: def.comp, hits: def.hits.slice(), action: def.action || null };
      let deterministic;
      if (def.comp === actionComp) {
        // Elemental AoE action spells with the target-life bonus (druid Terra/Ice
        // Burst) must run elemental validation here so validateTerraBurstBonusBlock
        // sets the per-hit bonus flags that the rotation table splits into tiers.
        // Physical AoE spells (EK exori mas/gran) keep the non-hard-gated shortcut.
        if (isTerraBurstAction(block.action)) {
          const action = block.action || {};
          const words = normalizeName(action.words || action.spell || action.name || '');
          const label = normalizeName(action.profile && action.profile.label || '');
          const entry = BONUS_TIER_ACTIONS[words] || Object.values(BONUS_TIER_ACTIONS).find(a => a.label === label);
          const el = entry ? entry.element : (action.profile && action.profile.element) || 'unknown';
          deterministic = validateElementalBlock(block, el, context);
        } else {
          deterministic = { ok: true, reason: 'ek_physical_spell_not_hard_gated_by_intersection' };
        }
      } else {
        deterministic = validatePhysicalBlock(block);
      }
      return Object.assign({}, def, {
        deterministic,
        leech: validateLeechBlockOfficialRates(block, context),
        reason,
      });
    });
    return finalizeManualTurn(turn, defs, reason, context);
  }

  function resolveTurn(turn, facts, context) {
    turn.actions = actionsNearTurn(turn, facts, context);
    turn.hits.forEach(h => enrichHitEvidence(h, context));

    const singleTargetAaTurn = resolveSingleTargetAaVocationTurn(turn, facts, context);
    if (singleTargetAaTurn) return singleTargetAaTurn;

    const candidates = [];
    const rejected = [];
    for (const shape of possibleShapes(turn.actions)) {
      const hasGrenade = shape.indexOf('grenade') !== -1;
      for (const cuts of segmentations(turn.hits.length, shape.length)) {
        const cand = candidateFromShape(turn, shape, cuts);
        // Poda comportamentalmente neutra: um corte de granada fora da janela de
        // explosão válida seria rejeitado por validateCandidate de qualquer forma.
        if (hasGrenade && grenadeCandidateWindowInvalid(cand, turn.actions)) continue;
        const val = validateCandidate(cand, turn, turn.actions, context);
        if (val.ok) candidates.push(val);
        else if (!(context && context.grenadeAssignmentOnly)) rejected.push(val);
      }
    }

    if (!candidates.length) {
      if (isPartialEdgeMissingEvidence(turn, rejected, context)) return partialEdgeMissingEvidenceTurn(turn, rejected);
      return unresolvedTurn(turn, rejected, 'no_valid_partition');
    }
    candidates.sort(compareValidated);
    promotePhysicalAxisSingleBlockByLeech(candidates);
    const best = candidates[0];
    const second = candidates[1] || null;

    // Ambiguidade crítica: duas partições empatadas nos eixos fortes mas diferentes em shape/cortes.
    if (second && best.score.timestampSplitPenalty === second.score.timestampSplitPenalty &&
        best.score.mechanicalOrder === second.score.mechanicalOrder &&
        best.score.timing === second.score.timing &&
        best.score.deterministicHits === second.score.deterministicHits &&
        best.score.leechFits === second.score.leechFits &&
        best.score.leechContradictions === second.score.leechContradictions &&
        best.score.actionRecencyPenalty === second.score.actionRecencyPenalty &&
        best.score.virtualZeroHits === second.score.virtualZeroHits &&
        best.score.unknownHits === second.score.unknownHits &&
        best.score.cappedLowHits === second.score.cappedLowHits &&
        best.score.components === second.score.components &&
        (best.candidate.shape.join('>') !== second.candidate.shape.join('>') || best.candidate.cuts.join(',') !== second.candidate.cuts.join(','))) {
      const bracketWinner = sameMobLeechBracketWinner(turn, best, second);
      if (bracketWinner) {
        if (context && context.consolidatedGrenadeCasts) {
          for (const b of bracketWinner.candidate.components) {
            if (b.comp === 'grenade' && b.action) context.consolidatedGrenadeCasts.add(b.action);
          }
        }
        return finalizeTurn(turn, bracketWinner, rejected.concat([best, second].filter(c => c !== bracketWinner)), context);
      }
      return unresolvedTurn(turn, rejected.concat([best, second]), 'ambiguous_equal_best_partitions');
    }

    // M-024/M-025: registra o cast de granada que explodiu neste turno para que
    // actionsNearTurn não o ofereça a turnos posteriores da janela [c+2,c+4].
    if (context && context.consolidatedGrenadeCasts) {
      for (const b of best.candidate.components) {
        if (b.comp === 'grenade' && b.action) context.consolidatedGrenadeCasts.add(b.action);
      }
    }

    return finalizeTurn(turn, best, rejected, context);
  }

  function turnHasEligibleGrenadeCast(turn, facts) {
    const casts = facts && facts.local && facts.local.grenadeCasts || [];
    if (!casts.length || !turn || !turn.hits || !turn.hits.length) return false;
    const firstTs = Math.min(...turn.hits.map(h => h.ts));
    const lastTs = Math.max(...turn.hits.map(h => h.ts));
    return casts.some(c => {
      const impactLo = c.ts + 2, impactHi = c.ts + 4;
      return lastTs >= impactLo && firstTs <= impactHi;
    });
  }

  function buildGrenadeCastAssignments(turns, facts, context) {
    const savedConsumed = context && context.consolidatedGrenadeCasts;
    const savedPreassigned = context && context.preassignedGrenadeCasts;
    if (context) {
      context.consolidatedGrenadeCasts = null;
      context.preassignedGrenadeCasts = null;
      context.grenadeAssignmentOnly = true;
    }
    const bestByCast = new Map();
    try {
      for (const turn of turns || []) {
        if (!turnHasEligibleGrenadeCast(turn, facts)) continue;
        const t = resolveTurn(turn, facts, context);
        if (!t || t.status !== 'resolved') continue;
        for (const b of t.components || []) {
          if (!b || b.comp !== 'grenade' || !b.action) continue;
          const det = b.deterministic || {};
          const leech = b.leech || {};
          const score = {
            turnTs: t.ts,
            hitCount: (b.hits || []).filter(isMainHit).length,
            deterministicHits: det.known || 0,
            leechFits: leech.ok && leech.fits ? leech.fits.filter(x => x.fit && x.fit.usable).length : 0,
            leechContradictions: leech.consensus ? (leech.consensus.failedCount || 0) : 0,
          };
          const prev = bestByCast.get(b.action);
          if (!prev
            || score.hitCount > prev.hitCount
            || (score.hitCount === prev.hitCount && score.deterministicHits > prev.deterministicHits)
            || (score.hitCount === prev.hitCount && score.deterministicHits === prev.deterministicHits && score.leechFits > prev.leechFits)
            || (score.hitCount === prev.hitCount && score.deterministicHits === prev.deterministicHits && score.leechFits === prev.leechFits && score.leechContradictions < prev.leechContradictions)) {
            bestByCast.set(b.action, score);
          }
        }
      }
    } finally {
      if (context) {
        context.consolidatedGrenadeCasts = savedConsumed;
        context.preassignedGrenadeCasts = savedPreassigned;
        delete context.grenadeAssignmentOnly;
      }
    }
    const assigned = new Map();
    for (const [cast, score] of bestByCast) assigned.set(cast, score.turnTs);
    return assigned;
  }

  // openspec/changes/leech-bracket-ambiguous-partition-tiebreak: quando `best` e
  // `second` empatam em TODAS as chaves de compareValidated e diferem por exatamente
  // um hit num shape de 2 componentes, o hit que muda de lado costuma ser overkill
  // (dano exibido truncado, sem razão leech/dano confiável) — mas o valor ABSOLUTO de
  // leech dele continua válido (não foi capado por HP/mana cheios). Busca a instância
  // do MESMO mob mais próxima antes e depois desse hit no turno (âncoras — podem ser
  // overkill também, só a razão leech/dano é que é inválida em overkill, não o valor)
  // e decide pelo lado cuja âncora está mais perto do leech do hit em disputa, em
  // TODOS os canais disponíveis (vida e/ou mana) sem contradição entre eles. Sem
  // âncora dos dois lados, ou com canais discordando, não decide (mantém
  // ambiguous_equal_best_partitions). Caso-prova: mazzerinbarrage 23:47:17.
  function sameMobLeechBracketWinner(turn, best, second) {
    if (!best || !second) return null;
    const shapeA = best.candidate.shape, shapeB = second.candidate.shape;
    if (shapeA.length !== 2 || shapeB.length !== 2 || shapeA.join('>') !== shapeB.join('>')) return null;
    const cutA = best.candidate.cuts[0], cutB = second.candidate.cuts[0];
    if (Math.abs(cutA - cutB) !== 1) return null;
    const lo = Math.min(cutA, cutB), hi = Math.max(cutA, cutB);
    const hits = turn.hits || [];
    const d = hits[lo];
    if (!d || !isMainHit(d)) return null;

    const channels = ['lifeLeech', 'manaLeech'];
    const dVals = {};
    for (const ch of channels) { const v = +d[ch] || 0; if (v > 0) dVals[ch] = v; }
    if (!Object.keys(dVals).length) return null;

    const mob = normalizeName(d.mob);
    const ew = !!d.exposeWeakness;
    function findAnchor(list) {
      let fallback = null;
      for (const h of list) {
        if (!h || !isMainHit(h)) continue;
        if (normalizeName(h.mob) !== mob) continue;
        if (!((+h.lifeLeech || 0) > 0) && !((+h.manaLeech || 0) > 0)) continue;
        if (!!h.exposeWeakness === ew) return h;
        if (!fallback) fallback = h;
      }
      return fallback;
    }
    const afterCandidate = cutA === lo ? best : second;
    const beforeCandidate = cutA === lo ? second : best;
    function voteToCandidate(voteBefore, voteAfter) {
      if (voteBefore === 0 && voteAfter === 0) return null;
      if (voteBefore > 0 && voteAfter > 0) return null;
      return voteAfter > 0 ? afterCandidate : beforeCandidate;
    }

    const anchorBefore = findAnchor(hits.slice(0, lo).slice().reverse());
    const anchorAfter = findAnchor(hits.slice(hi));
    if (anchorBefore && anchorAfter) {
      let voteBefore = 0, voteAfter = 0;
      for (const ch of channels) {
        const dv = dVals[ch];
        if (!(dv > 0)) continue;
        const bv = +anchorBefore[ch] || 0, av = +anchorAfter[ch] || 0;
        if (!(bv > 0) || !(av > 0)) continue;
        const db = Math.abs(dv - bv), da = Math.abs(dv - av);
        if (db < da) voteBefore++;
        else if (da < db) voteAfter++;
      }
      return voteToCandidate(voteBefore, voteAfter);
    }

    // S-020a: se a ancora same-mob falta em um dos lados, compara o hit em
    // disputa com os nucleos estaveis dos dois componentes sem usar razao leech/dano.
    const beforeCore = hits.slice(0, lo).filter(h => h && isMainHit(h));
    const afterCore = hits.slice(hi).filter(h => h && isMainHit(h));
    let voteBefore = 0, voteAfter = 0;
    for (const ch of channels) {
      const dv = dVals[ch];
      if (!(dv > 0)) continue;
      const beforeVals = beforeCore.map(h => +h[ch] || 0).filter(v => v > 0);
      const afterVals = afterCore.map(h => +h[ch] || 0).filter(v => v > 0);
      if (!beforeVals.length || !afterVals.length) continue;
      const db = Math.min(...beforeVals.map(v => Math.abs(dv - v)));
      const da = Math.min(...afterVals.map(v => Math.abs(dv - v)));
      if (db === da) return null;
      if (db < da) voteBefore++;
      else voteAfter++;
    }
    return voteToCandidate(voteBefore, voteAfter);
  }


  function finalizeTurn(turn, validated, rejected, context) {
    const keepRejected = context && context.options && context.options.includeResolvedRejected;
    const components = [];
    let componentId = 1;
    for (const b of validated.candidate.components) {
      const label = actionLabel(b.comp, b.action);
      const unresolved = (b.comp !== 'arrow' && !label) ? true : false;
      const id = unresolved ? 'unresolved_component_' + componentId : b.comp + '_' + componentId;
      for (const h of b.hits) {
        h.componentId = id;
        h.component = unresolved ? 'unresolved' : b.comp;
        h.actionLabel = unresolved ? ('Componente não resolvido ' + componentId) : label;
      }
      // Terra Burst/Ice Burst hits are enriched once, up front (`enrichHitEvidence`), before
      // any partition/bonus decision exists, always assuming multiplier 1. Now that the
      // winning block's per-hit bonus decision is known (`h.terraBurstBonusActive`/
      // `terraBurstBonusMultiplier`, set by validateTerraBurstBonusBlock), re-derive the
      // block's real element evidence with the real multiplier so "com bônus" hits aren't
      // left reverted as if the bonus never applied.
      if (b.comp === 'spell' && isTerraBurstAction(b.action)) {
        const bWords = normalizeName(b.action.words || b.action.spell || b.action.name || '');
        const bonusEntry = BONUS_TIER_ACTIONS[bWords] ||
          Object.values(BONUS_TIER_ACTIONS).find(a => a.label === normalizeName(b.action.profile && b.action.profile.label || ''));
        const bonusElement = bonusEntry && bonusEntry.element;
        if (bonusElement) {
          for (const h of b.hits) {
            if (!h.evidence || !h.evidence.elemental) continue;
            h.evidence.elemental[bonusElement] = elementalOriginalCandidates(h, bonusElement, context, {
              terraBurstBonusMultiplier: h.terraBurstBonusMultiplier || 1,
            });
          }
        }
      }
      components.push({
        id,
        index: componentId,
        comp: unresolved ? 'unresolved' : b.comp,
        action: b.action || null,
        actionLabel: unresolved ? ('Componente não resolvido ' + componentId) : label,
        hits: b.hits,
        deterministic: b.deterministic,
        leech: b.leech,
        gravSanActive: b.gravSanActive,
        gravSanTested: b.gravSanTested,
        gravSanModeCandidates: b.gravSanModeCandidates,
      });
      componentId++;
    }
    return {
      id: turn.id,
      idx: turn.idx,
      ts: turn.ts,
      clock: turn.clock,
      partialEdge: !!turn.partialEdge,
      status: 'resolved',
      components,
      hits: turn.hits,
      chosen: validated.score,
      rejectedCount: rejected.length,
      rejected: keepRejected ? rejected : [],
    };
  }

  function unresolvedTurn(turn, rejected, reason) {
    const components = [{
      id: 'unresolved_component_1',
      index: 1,
      comp: 'unresolved',
      actionLabel: 'Componente não resolvido 1',
      hits: turn.hits,
      reason,
    }];
    for (const h of turn.hits) {
      h.componentId = 'unresolved_component_1';
      h.component = 'unresolved';
      h.actionLabel = 'Componente não resolvido 1';
    }
    return { id: turn.id, idx: turn.idx, ts: turn.ts, clock: turn.clock, partialEdge: !!turn.partialEdge, status: 'unresolved', reason, components, hits: turn.hits, rejected };
  }

  function hasConcreteOffensiveAction(actions) {
    return !!(actions && (
      (actions.spellCasts && actions.spellCasts.length) ||
      (actions.runeUses && actions.runeUses.length) ||
      (actions.grenadeCasts && actions.grenadeCasts.length)
    ));
  }

  function isPartialEdgeMissingEvidence(turn, rejected, context) {
    if (!turn || !turn.partialEdge) return false;
    if (hasConcreteOffensiveAction(turn.actions)) return false;
    if (!turn.hits || turn.hits.length <= 1) return false;
    const vocation = normalizeName(context && context.vocation || '');
    if (!['knight', 'druid', 'sorcerer', 'monk'].includes(vocation)) return false;
    const rejectedList = rejected || [];
    if (!rejectedList.length) return false;
    const allowedReasons = new Set(['multiple_arrow_hits_not_allowed', 'physical_intersection_empty']);
    return rejectedList.every(val => {
      const cand = val && val.candidate;
      if (!cand || cand.shape.join('>') !== 'arrow' || cand.cuts.join(',') !== String(turn.hits.length)) return false;
      const reasons = (val.violations || []).map(v => v && v.reason).filter(Boolean);
      if (!reasons.includes('multiple_arrow_hits_not_allowed')) return false;
      return reasons.every(r => allowedReasons.has(r));
    });
  }

  function partialEdgeMissingEvidenceTurn(turn, rejected) {
    const reason = 'partial_edge_missing_evidence';
    const result = unresolvedTurn(turn, rejected, reason);
    result.partialEdgeMissingEvidence = true;
    result.status = 'unresolved';
    for (const c of result.components || []) {
      c.reason = reason;
      c.partialEdgeMissingEvidence = true;
    }
    for (const h of result.hits || []) h.partialEdgeMissingEvidence = true;
    return result;
  }

  function aggregateRows(resolvedTurns) {
    const map = new Map();
    for (const t of resolvedTurns || []) {
      // Turnos na borda do arquivo podem estar incompletos porque o Server Log
      // começou ou terminou no meio de um turno. Mantemos disponíveis para abrir,
      // mas não entram nas médias por componente.
      if (t && t.partialEdge) continue;
      for (const c of t.components || []) {
        if (c.comp === 'unresolved') continue;
        const key = c.comp + '|' + c.actionLabel;
        if (!map.has(key)) map.set(key, { label: c.actionLabel, kind: c.comp, turns: 0, hits: [], dmgBase: [], dmgEff: [] });
        const row = map.get(key);
        row.turns++;
        row.hits.push(c.hits.length);
        for (const h of c.hits) if (h.countsAsHit !== false && (!h.overkill || c.hits.every(x => x.overkill))) {
          row.dmgEff.push(h.dmg);
          // Base atual: usa menor candidato/interseção disponível; métrica só informativa.
          if (c.comp === 'arrow' && h.evidence && h.evidence.physical && h.evidence.physical.interval) row.dmgBase.push(Math.round((h.evidence.physical.interval[0] + h.evidence.physical.interval[1]) / 2));
          else row.dmgBase.push(h.dmg);
        }
      }
    }
    return Array.from(map.values()).map(r => ({
      label: r.label,
      kind: r.kind,
      turns: r.turns,
      hitsMean: mean(r.hits),
      dmgBase: Math.round(mean(r.dmgBase)),
      dmgEff: Math.round(mean(r.dmgEff)),
      hitsPerTurn: r.hits,
    }));
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
