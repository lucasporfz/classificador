/*
 * unified-turn-resolution.js
 *
 * Camada de turn-resolution do UnifiedClassificationEngine: dado um turno e o contexto
 * (setup ja inferido, casts/runas proximos), gera os candidatos de particao possiveis,
 * valida cada um (unified-validation.js) e escolhe o vencedor -- ou marca o turno como
 * unresolved/partial-edge. aggregateRows soma os turnos resolvidos em linhas por
 * componente/spell pra tabela final.
 *
 * Exporta globalThis.UnifiedTurnResolution (+ module.exports quando disponivel).
 * Carregado depois de unified-validation.js e antes de unified-classification-engine.js.
 */
(function(root) {
  'use strict';

  const {
    physicalOriginalInterval,
    elementalOriginalCandidates,
    normalizeName,
    isMainHit,
    isTerraBurstAction,
    isChainedPenanceAction,
    mean,
    ELEMENTS,
    SINGLE_TARGET_AA_VOCATIONS,
    BONUS_TIER_ACTIONS,
    OMEGA_CROSS_STATE_TOLERANCE,
    leechValueToleranceForN,
  } = root.UnifiedFormulas;

  const {
    actionsNearTurn,
    registerConsolidatedActions,
    nearestSpellCastForTurn,
    nearestRuneUseForTurn,
    componentActionPool,
    chooseActionForComponent,
    detectCharmKilledZeroAction,
    makeVirtualZeroHit,
    makeVirtualZeroHitForCharm,
    canUseVirtualZeroForBlock,
    eligibleVirtualZeroCharmsForBlock,
    finalizeManualTurn,
    leechPartitionScore,
    hasStrongTimestampAaSpellBoundary,
    shouldForceA1ByLeech,
    firstHitSharesExactOriginalWithRest,
    firstHitCritStateBoundary,
    firstHitSeparationFixesSameMobExactness,
    isBeamAction,
    validateBeamSublineBlock,
    isSingleTargetAction,
    validateElementalBlock,
    validatePhysicalBlock,
    validateCritHomogeneity,
    validateLeechBlockForN,
    validateLeechBlockOfficialRates,
    observedLeechAcceptsN,
    possibleShapes,
    segmentations,
    guidedCutPositions,
    cutsFromPositions,
    candidateFromShape,
    grenadeCandidateWindowInvalid,
    validateCandidate,
    promotePhysicalAxisSingleBlockByLeech,
    allSpellManaLeechHomogeneous,
    compareValidated,
    validateTerraBurstBonusBlock,
    actionLabel,
    effectiveLifeLeech,
    effectiveManaLeech,
  } = root.UnifiedValidation;

  const {
    expectedLeech,
  } = root.UnifiedSetupInference;

  // H-005f — jurisdição do veto `h005_merged_leech_exact_blocks_aa_split`.
  // Lista NORMATIVA: só os `reason` que casam aqui podem ser revertidos pelo veto.
  // Qualquer `reason` ausente nasce PROTEGIDO — o veto encolhe por decisão, nunca cresce
  // por omissão. Ver o bloco do veto para o porquê de o default físico estar listado.
  //
  // `ek_positional_aa_confirmed_by_same_mob_exactness_boundary` está SOB jurisdição, ao
  // contrário do que a primeira redação de H-005f supôs. Medido turno a turno: dos 5 turnos
  // em que o veto dispara no corpus, QUATRO vêm desse canal — `night harpy` 15:02:06/:23/:28
  // e `tom` 12:32:31 —, e os quatro têm resultado `A0` declarado correto (os três primeiros
  // são caso-prova de H-005; `tom` 12:32:31 é caso-prova da própria H-005e, "k=6, crit
  // uniforme, N=6,11 → A0 S6"). Protegê-lo transformava os quatro em `A1`, quebrando o que
  // a regra existe para preservar. Só `crit_state_boundary` fica protegido — é o canal do
  // único turno que a jurisdição precisa corrigir (`tom` 12:34:11).
  // H-005g: o primeiro hit e algum hit do sufixo caem sobre o MESMO mob com estado de
  // Low Blow DIFERENTE. Comparação restrita ao mesmo mob de propósito — entre mobs
  // distintos o Low Blow misto é o caso normal e não é fronteira.
  function firstHitLowBlowSameMobBoundary(hits) {
    const main = (hits || []).filter(h => h && !h.charmOnly && !h.damageReflection);
    if (main.length < 2) return false;
    const first = main[0];
    const mob = String(first.mob || '').toLowerCase();
    if (!mob) return false;
    return main.slice(1).some(h => String(h.mob || '').toLowerCase() === mob
      && !!h.lowBlow !== !!first.lowBlow);
  }

  const H005_MERGED_VETO_JURISDICTION = [
    /^ek_a1_forced_by_leech_cardinality_/,
    /^ek_positional_aa_confirmed_by_leech_cardinality$/,
    /^ek_positional_aa_confirmed_by_same_mob_exactness_boundary$/,
    /^single_target_aa_physical_order_tiebreak_after_clean_leech_tie$/,
  ];
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

  function deathEchoExplainsFirstHit(hits, action) {
    if (!hits || hits.length < 2 || !action || !action.profile) return false;
    const multiStage = action.profile.multiStage;
    const primary = multiStage && multiStage.primary;
    const delayed = multiStage && multiStage.delayed;
    if (!primary || !delayed || multiStage.confirmation !== 'elemental') return false;
    const words = normalizeName(action.words || action.spell || action.name || '');
    const label = normalizeName(action.profile.label || '');
    if (words !== 'exevo mort ora' && label !== 'death echo') return false;
    const first = hits[0];
    if (!first || first.multiStageStage !== primary.id || first.multiStageCastTs !== action.ts) return false;
    return hits.slice(1).some(h => h && h.multiStageStage === delayed.id && h.multiStageCastTs === action.ts);
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
    const actionProfile = action && action.profile || {};
    const concreteAreaActionCanExplainTurn = actionProfile.topology === 'area'
      && !isSingleTargetAction(actionComp, action);
    const hits = turn.hits || [];
    if (!hits.length) return null;
    // Mecânica rara: charm/proc entra antes do dano do hit que o ativou. Se a
    // ação concreta existe, mas o dano principal dela é zero e não aparece como
    // linha normal. Representamos como componente virtual de dano 0.
    if (hits.length === 1) {
      const zero = detectCharmKilledZeroAction(turn, action, facts);
      if (zero && action.ts >= hits[0].ts && action.ts <= hits[0].ts + 1) {
        const virtual = makeVirtualZeroHit(turn, action, zero);
        // H-005/V-018: um unico hit visivel seguido do alvo virtual morto pelo
        // charm nao prova AA quando a acao concreta de area pode explicar os
        // dois alvos. A mesma politica vale para as quatro vocacoes nao-RP.
        if (concreteAreaActionCanExplainTurn) {
          const soloDefs = [
            { comp: actionComp, action, hits: [hits[0], virtual], reason: 'single_target_aa_all_action_without_positive_aa_evidence' },
          ];
          registerConsolidatedActions(context, soloDefs);
          return finalizeManualTurn(turn, soloDefs, 'single_target_aa_all_action_without_positive_aa_evidence', context);
        }
        const charmDefs = [
          { comp: 'arrow', hits: [hits[0]], reason: 'ek_single_visible_aa_before_zero_damage_spell' },
          { comp: actionComp, action, hits: [virtual], reason: 'zero_damage_spell_charm_killed_target_before_hit' },
        ];
        registerConsolidatedActions(context, charmDefs);
        return finalizeManualTurn(turn, charmDefs, 'ek_zero_damage_spell_by_charm', context);
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
    // M-017/M-018a/A-005/S-014e: uma linha Using observada ENTRE o único AA
    // (visível ou virtual por charm-kill real) e todo o sufixo cria a borda
    // candidata imediatamente antes da runa. Para confirmá-la, o sufixo ainda
    // precisa ser um bloco determinístico compatível e homogêneo em crit-state.
    // A propriedade vem da ordem observada; a cardinalidade plana não pode
    // mover um virtual através do Using.
    const runeSeq = rune && Number.isFinite(+rune.seq) ? +rune.seq : null;
    const runeUsingVisibleBefore = runeSeq === null
      ? []
      : hits.filter(hit => Number.isFinite(+hit.seq) && +hit.seq < runeSeq);
    const runeUsingVisibleAfter = runeSeq === null
      ? []
      : hits.filter(hit => Number.isFinite(+hit.seq) && +hit.seq > runeSeq);
    const runeUsingAllVisibleOrdered = runeSeq !== null
      && runeUsingVisibleBefore.length + runeUsingVisibleAfter.length === hits.length
      && runeUsingVisibleAfter.length > 0;
    const runeUsingActionBlock = {
      comp: actionComp,
      hits: runeUsingVisibleAfter,
      action,
    };
    const runeUsingVirtualBefore = runeUsingAllVisibleOrdered && runeUsingVisibleBefore.length === 0
      ? eligibleVirtualZeroCharmsForBlock(turn, runeUsingActionBlock, context)
        .filter(charm => Number.isFinite(+charm.seq) && +charm.seq < runeSeq)
      : [];
    const runeUsingHasVisibleAa = runeUsingAllVisibleOrdered
      && runeUsingVisibleBefore.length === 1;
    const runeUsingHasVirtualAa = runeUsingAllVisibleOrdered
      && runeUsingVisibleBefore.length === 0
      && runeUsingVirtualBefore.length === 1;
    const runeUsingBetweenAaAndSuffix = runeUsingHasVisibleAa || runeUsingHasVirtualAa;
    const runeUsingBoundaryCandidate = runeUsingHasVirtualAa
      ? [
        {
          comp: 'arrow',
          hits: [makeVirtualZeroHitForCharm(turn, null, runeUsingVirtualBefore[0], 0, {
            comp: 'arrow',
            hits: [],
          })],
        },
        runeUsingActionBlock,
      ]
      : split;
    const runeUsingSuffixDeterministic = runeUsingBetweenAaAndSuffix
      ? validateElementalBlock(runeUsingBoundaryCandidate[1], actionProfile.element || 'unknown', context)
      : null;
    const runeUsingSuffixCrit = runeUsingBetweenAaAndSuffix
      ? validateCritHomogeneity(runeUsingBoundaryCandidate[1])
      : null;
    // V-015d: dispersão entre mobs distintos é evidência ausente neste
    // resolvedor, não incompatibilidade da runa concreta. Mantemos como veto
    // apenas as contradições determinísticas reais; o hard-veto canônico
    // abaixo continua conferindo same-mob/same-state e crit-state.
    const runeUsingSuffixCrossMobEvidenceAbsent = runeUsingSuffixDeterministic
      && (runeUsingSuffixDeterministic.reason === 'elemental_cluster_span_too_wide'
        || runeUsingSuffixDeterministic.reason === 'elemental_intersection_empty');
    const runeUsingSuffixCompatible = runeUsingSuffixDeterministic
      && (runeUsingSuffixDeterministic.ok || runeUsingSuffixCrossMobEvidenceAbsent);
    const runeUsingBoundaryConfirmed = runeUsingBetweenAaAndSuffix
      && runeUsingSuffixCompatible
      && runeUsingSuffixCrit && runeUsingSuffixCrit.ok;
    const allScore = leechPartitionScore(allSpell, context, turn);
    const splitScore = leechPartitionScore(split, context, turn);
    const runeUsingBoundaryScore = runeUsingBoundaryConfirmed && runeUsingBoundaryCandidate !== split
      ? leechPartitionScore(runeUsingBoundaryCandidate, context, turn)
      : splitScore;
    const allActionLeech = allScore.details.find(detail => detail.block && detail.block.comp === actionComp);
    const splitActionLeech = splitScore.details.find(detail => detail.block && detail.block.comp === actionComp);
    const splitExplainsRequiredVirtualHit = !!(
      !isBeamAction(action)
      && !actionProfile.multiStage
      && splitActionLeech && splitActionLeech.leech
      && splitActionLeech.leech.virtualZeroHits
      && splitActionLeech.leech.virtualZeroHits.length
      && !(allActionLeech && allActionLeech.leech
        && allActionLeech.leech.virtualZeroHits
        && allActionLeech.leech.virtualZeroHits.length)
    );
    const strongTimestampBoundary = hasStrongTimestampAaSpellBoundary(hits, action);
    const beamSubline = isBeamAction(action) ? validateBeamSublineBlock({ comp: actionComp, hits, action }, context) : null;
    const forceA1 = shouldForceA1ByLeech(hits, context, action, beamSubline);
    const deathEchoFirstHitExplained = deathEchoExplainsFirstHit(hits, action);
    // H-005b/H-005c/H-005d: evidência positiva leech-free ou de cardinalidade (b, c, d).
    // Um sufixo de 1 hit (spell/runa restante depois de tirar o 1º) não é discriminativo
    // — leech N=1 vs N=k e exatidão same-mob ficam vazias/triviais com um único hit
    // (mesmo piso de solidez de S-014c/H-003, adaptado ao tamanho do sufixo em vez do
    // bloco inteiro). Sem esse piso, um hit orfão de estágio atrasado não-consolidado
    // (M-016d/M-016e, quando o gate guloso não reconhece o eco por ele ser overkill) ou
    // de sub-tier de beam (M-035, ainda não implementado no motor) parece um "AA" válido
    // por coincidência de N pequeno. Caso-prova negativo: `kim` `16:13:26` (Great Energy
    // Beam, sufixo=1) e `16:20:51` (Death Echo, sufixo=1 = eco órfão) — ambos exigem
    // A0 (sem separação), não A1.
    const suffixSize = hits.length - 1;
    const evidenceHasMinimalSuffix = suffixSize >= 2;
    const critStateBoundary = evidenceHasMinimalSuffix && firstHitCritStateBoundary(hits);
    const sameMobSeparationEvidence = evidenceHasMinimalSuffix && firstHitSeparationFixesSameMobExactness(hits, action, context);
    const beamLeechForceNeutral = isBeamAction(action)
      && forceA1.force
      && forceA1.reason === 'first_hit_n1_suffix_accepts_n_minus_1'
      && !strongTimestampBoundary
      && !critStateBoundary
      && !sameMobSeparationEvidence;
    const timestampBoundaryConfirmed = strongTimestampBoundary && !deathEchoFirstHitExplained;
    // Um sufixo unitário é cardinalidade mecânica válida para uma ação de área
    // (M-008). O piso de dois hits só é necessário para ações multiestágio,
    // onde um hit isolado pode ser um estágio órfão e o N plano não se aplica.
    const forceA1Confirmed = forceA1.force
      && !beamLeechForceNeutral
      && (!actionProfile.multiStage || evidenceHasMinimalSuffix);
    const multiStageFirstHitLeechBoundary = evidenceHasMinimalSuffix
      && actionProfile.multiStage
      && forceA1.firstN1
      && forceA1.firstN1.usable
      && forceA1.firstN1.ok
      && forceA1.firstAll
      && forceA1.firstAll.usable
      && !forceA1.firstAll.ok
      && !forceA1.firstAll.cappedLow;
    // H-005/V-017/V-018: a posição do primeiro hit não prova AA por si só.
    // M-004/H-005/D-019: só existe empate positivo quando as duas hipóteses
    // fecham integralmente pela evidência de leech. Nesse empate, uma ação
    // física preserva a ordem canônica AA -> ação. Ausência/contradição não
    // vira AA apenas por reduzir uma falha, e qualquer prova discriminante
    // abaixo ainda prevalece.
    const physicalActionCleanLeechTie = actionProfile.element === 'physical'
      && allScore.usable > 0
      && splitScore.usable > 0
      && allScore.bad === 0
      && splitScore.bad === 0
      && allScore.clean === allScore.usable
      && splitScore.clean === splitScore.usable;
    let chosen = physicalActionCleanLeechTie ? split : allSpell;
    let reason = physicalActionCleanLeechTie
      ? 'single_target_aa_physical_order_tiebreak_after_clean_leech_tie'
      : 'single_target_aa_all_action_without_positive_aa_evidence';

    if (runeUsingBoundaryConfirmed) {
      chosen = runeUsingBoundaryCandidate;
      reason = 'single_target_aa_rune_using_boundary';
    } else if (timestampBoundaryConfirmed) {
      chosen = split;
      reason = 'ek_timestamp_boundary_aa_then_spell';
    } else if (deathEchoFirstHitExplained) {
      chosen = allSpell;
      reason = 'ms_death_echo_multistage_not_independent_aa_evidence';
    } else if (beamSubline && beamSubline.ok) {
      chosen = allSpell;
      reason = 'ms_beam_subline_validated_no_a1';
    } else if (beamLeechForceNeutral) {
      chosen = allSpell;
      reason = 'ms_beam_leech_cardinality_not_independent_aa_evidence';
    } else if (critStateBoundary) {
      chosen = split;
      reason = 'ek_positional_aa_confirmed_by_crit_state_boundary';
    } else if (sameMobSeparationEvidence) {
      chosen = split;
      reason = 'ek_positional_aa_confirmed_by_same_mob_exactness_boundary';
    } else if (multiStageFirstHitLeechBoundary) {
      // H-005(d)/M-016d/M-016e: o primeiro hit prova N=1 e contradiz a
      // cardinalidade fundida. Em uma acao multiestagio o sufixo nao pode ser
      // exigido como um unico N plano antes de seus estagios internos serem
      // consolidados; essa limitacao da prova do sufixo nao apaga a fronteira.
      chosen = split;
      reason = 'single_target_aa_multistage_action_first_hit_leech_signature';
    } else if (splitExplainsRequiredVirtualHit) {
      // S-014e/C-008: há kill real por charm e somente o sufixo da ação
      // concreta aceita a cardinalidade mecânica N=K_visível+virtual.
      chosen = split;
      reason = 'single_target_aa_split_required_by_virtual_zero_leech_cardinality';
    } else if (forceA1Confirmed) {
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
      } else if (!isBeamAction(action)
        && evidenceHasMinimalSuffix
        && splitHasEvidence
        && splitScore.bad < allScore.bad
        && splitScore.clean > allScore.clean
        // H-005/V-018a: reduzir contradicoes ao isolar o primeiro hit nao
        // confirma AA quando esse hit ficou apenas capped_low e a propria
        // particao continua contradita. O corte por leech precisa de prova
        // positiva N=1 no primeiro hit ou de uma particao inteira sem
        // contradicoes; a regra e a mesma para todas as vocacoes nao-RP.
        && forceA1.firstN1
        && forceA1.firstN1.usable
        && forceA1.firstN1.ok) {
        chosen = split;
        reason = 'ek_positional_aa_confirmed_by_leech_cardinality';
      }
    }

    // Se o candidato a AA (primeiro hit) tem o MESMO mob, MESMO estado de
    // modificadores (EW/prey/crit/Low Blow/Onslaught) e MESMO dano de algum hit
    // que ficaria no bloco do sufixo, esses dois hits são mecanicamente o mesmo
    // componente determinístico (S-004a) e o split é rejeitado.
    if (chosen === split
      && !runeUsingBoundaryConfirmed
      && firstHitSharesExactOriginalWithRest(hits)) {
      chosen = allSpell;
      reason = 'h005_same_mob_state_exact_match_blocks_aa_split';
    }

    // D-023/D-024/H-005: prova positiva do bloco fundido vence evidencia posicional.
    // Um AA single-target tem `areaFactor(1) = 1`, entao seu leech observado precisa
    // fechar EXATO em N=1 por vida e/ou mana. Quando nenhum canal fecha em N=1 mas
    // algum fecha exato em N = total de hits, o primeiro hit nao e AA: ele e mais um
    // alvo do bloco de area, e o corte posicional (exatidao same-mob, fronteira de
    // crit, timestamp, cardinalidade) estava lendo variacao normal como fronteira.
    //
    // Observado ABAIXO do previsto e `capped-low` (V-014/D-025) e NAO discrimina: o
    // personagem nao cura acima do maximo. Por isso a comparacao exige acerto exato
    // dos dois lados, nunca "menor que o esperado". Em knight/monk o dano e fisico e
    // varia por rolagem, entao a exatidao de dano no mesmo mob tambem nao serve de
    // fronteira — o leech e o unico sinal que separa os dois casos.
    //
    // Caso-prova: `night harpy` `15:02:06`/`15:02:23`/`15:02:28` (Groundshaker) — o
    // hit em raubritter marksman fecha N=5 exato por vida E mana, e nao fecha N=1;
    // resultado correto `A0 S5`. Contra-prova: `night harpy` `14:58:44`/`14:59:14`/
    // `14:59:29`, `bastion` `15:17:33`/`15:21:56`, `monk` `11:54:42`/`11:54:47`,
    // `monk 2` `07:19:48`, `serverlog7` `07:15:00`/`07:15:02`, `serverlog8`
    // `07:22:34` — a vida esta fora do setup (imbuement expirado), mas a MANA fecha
    // N=1 exato e o AA e real; estes turnos nao podem mudar.
    // H-005f: o veto tem JURISDIÇÃO — ele não reverte decisão de canal acima do dele na
    // escada. A evidência do veto é cardinalidade por leech, que já tem canal próprio
    // (`forceA1`); quando esse canal perde, a mesma evidência não pode voltar por fora e
    // derrubar um canal que a escada colocou em posição superior.
    //
    // A precedência é POSICIONAL, não por natureza: os canais de estágio atrasado
    // multiestágio e de hit virtual por charm-kill também são leech, mas estão acima do
    // `forceA1` e por isso ficam protegidos.
    //
    // A lista normativa é a de JURISDIÇÃO, não a de protegidos: `reason` ausente dela nasce
    // PROTEGIDO. O veto pode encolher por decisão e nunca cresce por omissão.
    //
    // O default `single_target_aa_physical_order_tiebreak_after_clean_leech_tie` precisa
    // constar explicitamente: o `chosen` pode nascer `split` por ele SEM nenhum degrau
    // disparar, e omiti-lo o tornaria protegido por acidente.
    //
    // NÃO converter em `else if` da escada: um ramo entre o degrau do `forceA1` e o
    // seguinte só é alcançado quando o `forceA1` não dispara, logo deixaria de vetar
    // exatamente o canal que o veto precisa vetar, e quebraria os três casos-prova de
    // `night harpy`.
    const h005VetoHasJurisdiction = H005_MERGED_VETO_JURISDICTION.some(re => re.test(reason));
    if (chosen === split
      && h005VetoHasJurisdiction
      && !runeUsingBoundaryConfirmed
      && hits.length > 1) {
      const aaCandidate = hits[0];
      const setup = context && context.leechSetup;
      const acceptsExactly = (block, n) => ['life', 'mana'].some(channel => {
        const verdict = observedLeechAcceptsN(aaCandidate, setup, n, channel, block, context);
        return !!(verdict && verdict.usable && verdict.ok);
      });
      const mergedProven = acceptsExactly(allSpell[0], hits.length);
      const aaProven = acceptsExactly({ comp: 'arrow', hits: [aaCandidate] }, 1);
      if (mergedProven && !aaProven) {
        chosen = allSpell;
        reason = 'h005_merged_leech_exact_blocks_aa_split';
      }
    }

    // H-005g — Low Blow misto no MESMO mob é fronteira de componente (ÚLTIMO RECURSO).
    //
    // Low Blow é charm de bestiário aplicado POR CRIATURA, e a proc é decidida UMA VEZ POR
    // ATAQUE: se um componente procou Low Blow, todos os hits daquele componente sobre
    // aquela criatura recebem. Pela contrapositiva, dois hits do MESMO mob com estado de
    // Low Blow diferente não pertencem ao mesmo componente.
    //
    // O escopo `same-mob` é CONSTITUTIVO, não precaução. Entre mobs distintos o Low Blow
    // misto é o caso NORMAL e não prova nada — o charm é por criatura. Medido no corpus:
    // 55 componentes já resolvidos têm o misto cross-mob contra 8 same-mob; ler cross-mob
    // como fronteira fatiaria 55 blocos corretos.
    //
    // ÚLTIMO RECURSO: só age quando H-005e é MUDA SOBRE O CORTE. A condição é
    // `!forceA1.force` — a inversão do leech não decidiu —, NÃO `leechDeclaredN(hits[0])
    // == null`, que é mudez sobre o PRIMEIRO HIT. As duas leituras não são equivalentes: a
    // inversão pode declarar `N=1` no primeiro hit e ainda assim não decidir, porque
    // `shouldForceA1ByLeech` exige também suporte do sufixo (`suffixUsableOk`), de beam ou
    // fronteira de crit-state. Com sufixo majoritariamente overkill ou sem leech o suporte
    // não fecha, `force` é false, e H-005e é muda sobre o corte sem ser muda sobre o hit.
    // Quando a inversão DECIDE, ela decide — dois canais disputando o mesmo corte só
    // criariam questão de precedência sem ganho.
    //
    // Alcance medido (27/Ago/2026, corpus inteiro, 2.939 blocos fundidos): 1 turno —
    // `tom 2` `12:58:06`, em que o primeiro hit declara N=1 (vida) e o sufixo tem só 1 hit
    // com leech utilizável, abaixo do piso `min(2, kSuffix)`. Com a guarda anterior o
    // alcance era 0: nenhum turno do corpus tem Low Blow misto same-mob com o primeiro hit
    // sem leech declarado.
    //
    // NÃO entra em H005_MERGED_VETO_JURISDICTION: canal novo nasce protegido.
    if (chosen === allSpell
      && !runeUsingBoundaryConfirmed
      && hits.length > 1
      && firstHitLowBlowSameMobBoundary(hits)
      && !forceA1.force) {
      chosen = split;
      reason = 'ek_positional_aa_confirmed_by_low_blow_same_mob_boundary';
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

    // S-014e/M-004/M-031/M-032/V21: um charm-kill real anterior ao bloco
    // visível não desaparece quando a ação ordinária fecha exatamente em
    // N=K_visível e contradiz N=K+1. Nesse caso o virtual não pertence à ação;
    // sem AA visível, ele ocupa o único AA single-target do ciclo. A decisão
    // reutiliza a ordem observada e os dois trials canônicos de leech, sem
    // limiar ou exceção por vocação/ação/fixture.
    if (chosen === allSpell
      && actionBlock
      && concreteAreaActionCanExplainTurn
      && !actionProfile.multiStage
      && !isBeamAction(action)) {
      const areaBlock = { comp: actionComp, hits: actionBlock.hits, action };
      const visibleMain = actionBlock.hits.filter(hit => isMainHit(hit) && !hit.virtual);
      const firstVisibleSeq = visibleMain.length
        ? Math.min(...visibleMain.map(hit => Number.isFinite(+hit.seq) ? +hit.seq : Infinity))
        : Infinity;
      const blockKills = eligibleVirtualZeroCharmsForBlock(turn, areaBlock, context);
      const precedingKills = blockKills
        .filter(charm => Number.isFinite(+charm.seq) && +charm.seq < firstVisibleSeq);
      const visibleN = allActionLeech && allActionLeech.leech;
      // S-014e: o virtual permanece na ação sempre que a PRÓPRIA ação aceita um N acima dos
      // hits visíveis. O texto da regra diz `k+1` porque descreve o caso de UM charm-kill;
      // com dois ou mais, a ação pode aceitar `k+2`, `k+3`... e continua sendo dona de todos.
      // Testar apenas `k+1` fazia um turno com dois kills criar um AA virtual espúrio que
      // contava o mesmo kill duas vezes — uma no AA, outra na ação (M-025, uma atribuição).
      // Caso-prova: `uhax 3` S1 `13:33:46`, k=8 com 2 kills, aceita N=10 ⇒ A0 + ação(10).
      // Contra-prova preservada: `uhax 3` S0 `20:54:20`, k=12 com 1 kill, N=13 contradito
      // ⇒ A1 virtual + ação(12).
      let higherNUsable = 0;
      let higherNAccepted = 0;
      if (visibleMain.length) {
        const maxN = visibleMain.length + Math.max(1, blockKills.length);
        for (let n = visibleMain.length + 1; n <= maxN; n += 1) {
          const check = validateLeechBlockForN(areaBlock, context, n);
          if (!check || !check.usable) continue;
          higherNUsable += 1;
          if (check.ok) higherNAccepted += 1;
        }
      }
      if (precedingKills.length === 1
        && visibleN && visibleN.usable && visibleN.ok
        && higherNUsable > 0 && higherNAccepted === 0) {
        const virtualAa = makeVirtualZeroHitForCharm(turn, null, precedingKills[0], 0, {
          comp: 'arrow',
          hits: [],
        });
        chosen = [
          { comp: 'arrow', hits: [virtualAa] },
          actionBlock,
        ];
        reason = 'single_target_aa_virtual_charm_kill_before_area_action';
      }
    }

    // Hit principal virtual por charm-kill (fato observado, sem leech): uma linha
    // de dano de charm imediatamente seguida por XP (killedTarget) prova que o
    // charm matou o alvo antes da linha de dano principal daquele ataque aparecer
    // — logo existe um hit de dano 0. Generaliza o atalho hits.length===1 para
    // k>=2. Quando a ação aceita N>K, ela é a dona do virtual; se N>K contradiz
    // e não há AA visível, o ramo anterior preserva o kill como AA virtual. Num
    // split com AA visível, o AA single-target já está saturado e não pode
    // reivindicar outro alvo. Anexa o virtual a block.hits (dump conta
    // hits.length; isMainHit exclui type:'virtual' do leech, sem duplicar). Não
    // toca no caminho RP (validateLeechBlockForNWithVirtual). Regras: S-014e,
    // C-008, T-004.
    if (actionBlock && canUseVirtualZeroForBlock({ comp: actionComp, action })) {
      const chosenScore = runeUsingBoundaryConfirmed && chosen === runeUsingBoundaryCandidate
        ? runeUsingBoundaryScore
        : (chosen === split ? splitScore : allScore);
      const chosenActionLeech = chosenScore.details.find(detail => detail.block && detail.block.comp === actionComp);
      // A borda explícita tem propriedade temporal mais forte que a escolha
      // plana de um único virtual por N=K+1. Recoletar abaixo evita que um kill
      // pré-Using seja anexado à runa e esconda um kill pós-Using.
      let virtuals = runeUsingBoundaryConfirmed
        ? []
        : (chosenActionLeech && chosenActionLeech.leech
          && chosenActionLeech.leech.virtualZeroHits || []);
      // M-031/M-032/S-014e/C-008: com AA VISÍVEL na partição escolhida, o AA
      // single-target já está saturado e não pode reivindicar o alvo varrido a
      // mais. O charm-kill é fato observado (dano de charm + XP), não inferência
      // de leech: o leech decide o DONO do virtual quando existe disputa, nunca
      // se o fato existe. Exigir que o leech aceite `N=K+1` apagava o hit em
      // bloco cujo leech não fecha nenhum N — por exemplo `Mrowdy 2` S0
      // `18:26:55`, que perdia `A1 + Energy Wave 8` para `A1 + Energy Wave 7`.
      // Sem AA visível a decisão continua no ramo anterior (S-014e/V21).
      const chosenAaBlock = chosen.find(def => def.comp === 'arrow');
      const chosenHasVisibleAa = !!(chosenAaBlock
        && chosenAaBlock.hits.some(hit => isMainHit(hit) && !hit.virtual));
      // M-016d/M-016e/M-035: a cardinalidade plana do componente inteiro não
      // se aplica a ações com estágios ou sub-linhas independentes. Enquanto o
      // virtual ainda não é atribuído a um estágio/sub-linha pelo validador,
      // preservar o charm-kill real no componente declarado, como antes.
      if (!virtuals.length
        && (actionProfile.multiStage || isBeamAction(action) || runeUsingBoundaryConfirmed
          || chosenHasVisibleAa)) {
        const areaBlock = { comp: actionComp, hits: actionBlock.hits, action };
        let charms = eligibleVirtualZeroCharmsForBlock(turn, areaBlock, context);
        // M-018a/C-009/T-003: com borda explícita AA -> Using -> runa, um
        // charm-kill real observado depois do Using já tem proprietário
        // temporal inequívoco. V-015d impede que a dispersão cross-mob
        // conhecida desta runa apague esse hit estrutural.
        if (runeUsingBoundaryConfirmed) {
          charms = charms.filter(charm => Number.isFinite(+charm.seq) && +charm.seq > runeSeq);
        }
        virtuals = charms.map((charm, index) => makeVirtualZeroHitForCharm(turn, action, charm, index, areaBlock));
      }
      if (virtuals.length) actionBlock.hits = actionBlock.hits.concat(virtuals);
    }

    // V-015b/V-015d: dispersão cross-mob (elemental_cluster_span_too_wide,
    // elemental_intersection_empty) NUNCA veta — evidência ausente (D-006), não
    // contradição. Só quebra de exatidão same-mob/same-estado não explicada (S-004a —
    // validateTerraBurstBonusBlock já tentou explicar por bônus tier antes de chegar
    // nesse veto) e crit-state misto (S-008/D-007) são vetos duros.
    function violatesUniqueBossSingleAction(def) {
      const mainHits = (def && def.hits || []).filter(hit => isMainHit(hit) && !hit.virtual);
      if (mainHits.length <= 1) return false;
      const mobs = new Set(mainHits.map(hit => normalizeName(hit.mob || '')));
      if (mobs.size !== 1) return false;
      return mainHits.every(hit => hit.articleless === true);
    }

    function buildValidatedDefs(candidateDefs, candidateReason) {
      const built = candidateDefs.map(def => {
        // M-017/M-018a/M-012/M-013: a fronteira que nomeia a ação é definida em
        // relação ao primeiro hit DO COMPONENTE, não do turno. A ação acima foi
        // escolhida sobre o turno inteiro (a hipótese fundida); depois que a
        // partição decidiu o corte `AA + ação`, o bloco da ação é menor e a
        // escolha precisa ser refeita sobre ele. Sem isso o AA envenena o
        // primeiro seq, a fronteira `Using` imediatamente anterior à runa fica
        // invisível, e o desempate por centro pode nomear uma ação POSTERIOR aos
        // próprios hits — que é a legítima do turno seguinte (N-008), deixando a
        // anterior sem dono. Casos-prova: `ms boss` `22:19:21` (runa de `:21`, não
        // a de `:23`) e `uhax 3 ed` `13:44:07` (runa de `:06`, não a de `:08`).
        const componentAction = def.comp === actionComp
          ? (chooseActionForComponent(
            actionComp,
            def.hits.filter(hit => !hit.virtual),
            componentActionPool(actionComp, actions, context.vocation),
          ) || def.action || null)
          : (def.action || null);
        const block = { comp: def.comp, hits: def.hits.slice(), action: componentAction };
        let deterministic;
        let critHomogeneity = { ok: true };
        if (def.comp === actionComp) {
          // Elemental AoE action spells with the target-life bonus (druid Terra/Ice
          // Burst) must run elemental validation here so validateTerraBurstBonusBlock
          // sets the per-hit bonus flags that the rotation table splits into tiers.
          // Physical AoE spells (EK exori mas/gran) keep the non-hard-gated shortcut;
          // spells/runas ELEMENTAIS fora da família Terra/Ice Burst passam a rodar
          // validateElementalBlock de verdade (o atalho era pensado só pra elemento
          // físico, mas a condição original não filtrava por elemento).
          if (isTerraBurstAction(block.action)) {
            const action = block.action || {};
            const words = normalizeName(action.words || action.spell || action.name || '');
            const label = normalizeName(action.profile && action.profile.label || '');
            const entry = BONUS_TIER_ACTIONS[words] || Object.values(BONUS_TIER_ACTIONS).find(a => a.label === label);
            const el = entry ? entry.element : (action.profile && action.profile.element) || 'unknown';
            deterministic = validateElementalBlock(block, el, context);
            critHomogeneity = validateCritHomogeneity(block);
          } else {
            const el = block.action && block.action.profile && block.action.profile.element;
            if (el === 'physical') {
              // Atalho continua exclusivo de elemento físico (comentário original: "EK
              // exori mas/gran"). Nada muda aqui — nem validateElementalBlock nem o novo
              // veto de crit-homogeneidade rodam pra esses blocos.
              deterministic = { ok: true, reason: 'ek_physical_spell_not_hard_gated_by_intersection' };
            } else {
              deterministic = validateElementalBlock(block, el || 'unknown', context);
              critHomogeneity = validateCritHomogeneity(block);
            }
          }
        } else {
          deterministic = validatePhysicalBlock(block);
        }
        return Object.assign({}, def, {
          action: componentAction,
          deterministic,
          critHomogeneity,
          leech: validateLeechBlockOfficialRates(block, context),
          reason: candidateReason,
        });
      });
      const actionDef = built.find(d => d.comp === actionComp);
      // M-035: beams (central/side) sao uma mecanica DECLARADA de multiplos niveis
      // por-mob — o mesmo mob pode ser atingido pelo segmento central e por um lateral
      // (fracao F do central) no mesmo cast. O detector de M-035 ainda nao existe no
      // motor, entao nao ha validador de tier para reusar (como
      // validateTerraBurstBonusBlock e o agrupamento por estagio de M-016d fazem). Sem
      // ele, a quebra de exatidao same-mob nesses blocos e ESPERADA pela propria regra,
      // nao contradicao — vetar aqui inventaria um problema onde a spec ja explica o
      // fenomeno. Caso-prova normativo: `death echo` 11:06:22 (caso-prova de M-035).
      // Isto NAO vale para mecanicas ainda nao declaradas: sem regra em
      // docs/CLASSIFICATION_RULES.md, o veto permanece e o turno fica unresolved.
      // M-016d/M-016e: spells multiestágio também produzem múltiplos níveis por-mob (o
      // mesmo mob leva o blast integral E o estágio atrasado a uma fração declarada). A
      // exatidão same-mob já estratifica por `multiStageStage` — mas só depois que os
      // estágios foram atribuídos. Quando o perfil prova os estágios por CLUSTER DE
      // LEECH (`confirmation: 'leech_cluster'`, Spiritual Outburst), essa atribuição só
      // acontece num passe de correção POSTERIOR, depois do leech real ser inferido:
      // aqui os hits ainda não têm `multiStageStage`, a estratificação é vazia, e blast
      // + eco do mesmo mob colidem. A própria regra M-016e declara que a reversão
      // elemental NÃO fecha para essa spell, então vetar por ela inventa uma contradição
      // onde a spec já explica o fenômeno — mesmo argumento da isenção de beam acima.
      // Death Echo (`confirmation: 'elemental'`) NÃO é isento: seus estágios já estão
      // atribuídos neste ponto e a estratificação funciona.
      // Terra/Ice Burst (`exevo ulus tera`/`exevo ulus frigo`): o bonus condicional e
      // binario POR ALVO com multiplicador global declarado (TERRA_BURST_BONUS_LEVELS),
      // entao o mesmo mob no mesmo estado leva dano base e dano com bonus dentro do MESMO
      // cast — divergencia prevista pela regra, nao contradicao. `validateTerraBurstBonusBlock`
      // continua precedendo o gate; esta isencao so evita que o bloco morra no veto
      // generico quando aquele validador nao fecha sozinho.
      // Chained Penance (`exori med pug`, M-037): decay fixo por pulo de cadeia. Isento
      // pelo mesmo motivo do beam — a mecanica e declarada em docs/CLASSIFICATION_RULES.md
      // mesmo sem o motor reconstruir o fator.
      const ms = actionDef && actionDef.action && actionDef.action.profile && actionDef.action.profile.multiStage;
      const stagesNotYetAssigned = !!(ms && ms.confirmation !== 'elemental');
      const act = actionDef && actionDef.action;
      const declaredMultiLevel = isBeamAction(act) ? 'beam'
        : stagesNotYetAssigned ? 'multi_stage_unassigned'
          : isTerraBurstAction(act) ? 'terra_burst'
            : isChainedPenanceAction(act) ? 'chained_penance'
              : null;
      const declaredMultiLevelAction = !!declaredMultiLevel;
      // S-004b: quando a isenção acima é o motivo de o bloco sobreviver, o veredito
      // reprovado passa a ser evidência AUSENTE (D-006), não contradição — é o que a
      // própria isenção significa. A classe é marcada aqui, no ponto em que a isenção é
      // decidida: o mesmo motivo continua contradição num bloco cuja ação não declara
      // múltiplos níveis por-mob. Cópia, não mutação: o diagnóstico original é
      // compartilhado com outros consumidores.
      if (declaredMultiLevelAction && actionDef && actionDef.deterministic
        && actionDef.deterministic.ok === false
        && actionDef.deterministic.reason === 'same_mob_state_exact_original_mismatch') {
        actionDef.deterministic = Object.assign({}, actionDef.deterministic, {
          evidence: 'absent',
          evidenceReason: 'declared_multi_level_not_yet_labeled',
          declaredMultiLevel,
        });
      }
      const uniqueBossSingleActionViolation = actionDef && violatesUniqueBossSingleAction(actionDef);
      const hardVeto = actionDef && (
        uniqueBossSingleActionViolation
        || (!declaredMultiLevelAction && actionDef.deterministic && actionDef.deterministic.ok === false && actionDef.deterministic.reason === 'same_mob_state_exact_original_mismatch')
        || (actionDef.critHomogeneity && actionDef.critHomogeneity.ok === false)
      );
      const vetoReason = hardVeto
        ? (uniqueBossSingleActionViolation
          ? 'boss_unique_target_single_action_multi_hit'
          : ((actionDef.critHomogeneity && actionDef.critHomogeneity.ok === false) ? actionDef.critHomogeneity.reason : actionDef.deterministic.reason))
        : null;
      return { defs: built, hardVeto, vetoReason };
    }

    let picked = buildValidatedDefs(chosen, reason);
    if (picked.hardVeto) {
      // O ramo escolhido (por heurística de leech/timestamp/evidência) falhou um veto
      // duro. Antes de desistir, testar a partição ALTERNATIVA: se ela validar limpo,
      // a evidência determinística (H-001/H-002) tem prioridade sobre a heurística que
      // escolheu errado — sem isso, um sinal de leech/mana-homogeneidade pré-existente
      // pode travar a escolha errada mesmo quando a partição correta já está disponível
      // e validaria sem contradição (caso-prova: uhax2 21:37:53/21:42:30, onde o ramo
      // de score de leech prefere allSpell por 1 "bad" a menos, mas o sufixo splitado
      // fecha 100% limpo em validateElementalBlock).
      // A alternativa tambem passa pelo mesmo hard-veto canonico. Nao ha excecao
      // por vocacao: sorcerer, druid, knight e monk usam a mesma alternativa mecanica
      // quando a escolha inicial viola uma regra dura.
      const chosenHasAaBoundary = chosen === split
        || (runeUsingBoundaryConfirmed && chosen === runeUsingBoundaryCandidate);
      const alternate = chosenHasAaBoundary ? allSpell : split;
      const alternateReason = (chosenHasAaBoundary ? 'ek_all_spell' : 'ek_positional_aa_first_hit')
        + '_confirmed_by_deterministic_validation_after_hard_veto';
      const altPicked = buildValidatedDefs(alternate, alternateReason);
      if (altPicked && !altPicked.hardVeto) {
        picked = altPicked;
        reason = alternateReason;
      } else {
        return unresolvedTurn(turn, [{ candidate: null, violations: [{ reason: picked.vetoReason, detail: picked.defs.find(d => d.comp === actionComp).deterministic }] }], picked.vetoReason);
      }
    }
    const defs = picked.defs;

    // N-007/N-008: o resolvedor manual também consolida a ação num turno; sem
    // registrar aqui, a spell/runa que ele nomeia continuaria disponível para o
    // turno seguinte e voltaria a nomear dois componentes.
    registerConsolidatedActions(context, defs);

    return finalizeManualTurn(turn, defs, reason, context);
  }

  // S-004c: a folga cross-state de omega e ULTIMO RECURSO por turno — a mesma disciplina
  // que D-010b/S-007 ja impoem a omega no eixo fisico ("ultimo recurso e minimo").
  //
  // A avaliacao ESTRITA (folga desligada, comportamento de antes de S-004c) roda primeiro e
  // sempre. So quando ela nao resolve o turno e que a avaliacao relaxada roda, e o resultado
  // dela so e adotado se ela propria resolver. Nenhuma particao relaxada compete, pontua ou
  // desempata contra uma estrita, entao TODO turno que resolve estrito resolve com a mesma
  // particao e o mesmo rotulo — a regra nao pode reclassificar turno que ja resolve.
  //
  // Isso importa porque o gate de exatidao same-mob tem duplo papel: mata o residuo de 1
  // ponto do modelo de omega E impede que uma particao funda dois componentes elementais
  // cujos niveis se sobrepoem (em `crypt`, Divine Caldera e Divine Barrage estao a 3,2-4,8%
  // no mesmo mob). A guarda separa os dois papeis sem precisar distinguir os casos.
  //
  // `resolveTurn` ja e chamado varias vezes sobre a lista inteira em cada passada do motor
  // (bootstrap sem leech, refino de crit, passada final), entao a segunda chamada por turno
  // nao tem efeito colateral de consumo de acao: o consumo acontece na atribuicao, nao aqui.
  function resolveTurn(turn, facts, context) {
    const strict = resolveTurnInner(turn, facts, context);
    if (!context || !context.omegaSetup || !context.omegaSetup.active) return strict;
    if (strict && strict.status === 'resolved') return strict;
    const previous = context._omegaCrossStateTolerance;
    context._omegaCrossStateTolerance = OMEGA_CROSS_STATE_TOLERANCE;
    try {
      const relaxed = resolveTurnInner(turn, facts, context);
      if (relaxed && relaxed.status === 'resolved') {
        relaxed.omegaCrossStateToleranceUsed = OMEGA_CROSS_STATE_TOLERANCE;
        return relaxed;
      }
    } finally {
      context._omegaCrossStateTolerance = previous;
    }
    // A passada relaxada MUTA `turn` (actions, rotulo de omega por hit, componentId/label
    // dos hits) e o resultado estrito aponta para os MESMOS objetos. Como ela nao resolveu,
    // reconstroi o resultado estrito rodando a passada estrita de novo, para que o turno
    // devolvido e o estado dos hits descrevam a mesma leitura. Custa uma terceira passada
    // apenas nos turnos que falham nas duas (em `crypt`, exatamente 1).
    return resolveTurnInner(turn, facts, context);
  }

  function resolveTurnInner(turn, facts, context) {
    turn.actions = actionsNearTurn(turn, facts, context);
    // M-039: o motor resolve o turno mais de uma vez (bootstrap sem leech, depois com o
    // leech real). O rotulo de omega e DERIVADO da validacao, entao ele precisa ser
    // re-derivado a cada passada: sem limpar, a 2a passada encontraria o bloco ja fechado
    // pelo rotulo da 1a, a busca por atribuicao nem rodaria, e o rotulo seria perdido na
    // consolidacao. Limpar so em sessao com omega mantem o campo inexistente nas outras.
    if (context && context.omegaSetup && context.omegaSetup.active) {
      for (const h of turn.hits) h.omegaActive = false;
    }
    turn.hits.forEach(h => enrichHitEvidence(h, context));

    const singleTargetAaTurn = resolveSingleTargetAaVocationTurn(turn, facts, context);
    if (singleTargetAaTurn) {
      if (singleTargetAaTurn.status === 'unresolved'
        && isPartialEdgeMissingEvidence(turn, singleTargetAaTurn.rejected, context)) {
        return partialEdgeMissingEvidenceTurn(turn, singleTargetAaTurn.rejected);
      }
      return singleTargetAaTurn;
    }

    let candidates = [];
    let rejected = [];
    // Busca guiada por sinal (openspec/changes/optimize-rp-pack-turn-resolution): pra
    // turnos grandes, testa primeiro só os cortes perto de rupturas de sinal
    // (guidedCutPositions). Rede de segurança POR TURNO: se NENHUM shape produzir
    // candidato válido com os cortes guiados, refaz o turno inteiro com a enumeração
    // completa (segmentations), descartando tudo da rodada guiada — assim, um turno que
    // acabe `unresolved` tem exatamente o mesmo `rejected` (conteúdo e ordem) do caminho
    // sem otimização, e isPartialEdgeMissingEvidence/unresolvedTurn veem o mesmo
    // diagnóstico. O fallback NÃO é por shape: um shape sem partição válida é o caso
    // comum e legítimo (a maioria dos shapes não descreve o turno) — reenumerar cada um
    // custaria guiada+completa quase sempre e inverteria o ganho. Pra turnos resolvidos,
    // `rejected` pode ser menor (mesmo precedente da poda de granada abaixo);
    // best/second não dependem da ordem de enumeração porque compareValidated tem
    // desempate total (shapeKey/cutKey).
    // `valCache` remove o pagamento duplo do fallback: validateCandidate é
    // determinístico dentro do turno (nada do contexto muda entre as duas passadas —
    // consolidatedGrenadeCasts só é mutado após a escolha do vencedor), então a
    // passada completa reusa o `val` dos cortes já testados na guiada, preservando a
    // ordem/conteúdo exatos do `rejected` sem revalidar.
    const valCache = new Map();
    const runShapes = useGuided => {
      const outCandidates = [];
      const outRejected = [];
      for (const shape of possibleShapes(turn.actions)) {
        const hasGrenade = shape.indexOf('grenade') !== -1;
        const cutsList = useGuided
          ? cutsFromPositions(useGuided, turn.hits.length, shape.length)
          : segmentations(turn.hits.length, shape.length);
        const shapeKey = shape.join('>');
        for (const cuts of cutsList) {
          const cacheKey = shapeKey + '|' + cuts.join(',');
          let val = valCache.get(cacheKey);
          if (val === undefined) {
            const cand = candidateFromShape(turn, shape, cuts);
            // Poda comportamentalmente neutra: um corte de granada fora da janela de
            // explosão válida seria rejeitado por validateCandidate de qualquer forma.
            if (hasGrenade && grenadeCandidateWindowInvalid(cand, turn.actions, context)) { valCache.set(cacheKey, null); continue; }
            val = validateCandidate(cand, turn, turn.actions, context);
            valCache.set(cacheKey, val);
          } else if (val === null) {
            continue; // já podado pela janela de granada na passada anterior
          }
          if (val.ok) outCandidates.push(val);
          else if (!(context && context.grenadeAssignmentOnly)) outRejected.push(val);
        }
      }
      return { candidates: outCandidates, rejected: outRejected };
    };
    const guidedPositions = guidedCutPositions(turn.hits, turn.actions);
    let usedGuided = !!guidedPositions;
    let pass = runShapes(guidedPositions || null);
    if (usedGuided && !pass.candidates.length) { pass = runShapes(null); usedGuided = false; }
    candidates = pass.candidates;
    rejected = pass.rejected;

    if (!candidates.length) {
      if (isPartialEdgeMissingEvidence(turn, rejected, context)) return partialEdgeMissingEvidenceTurn(turn, rejected);
      return unresolvedTurn(turn, rejected, 'no_valid_partition');
    }
    candidates.sort(compareValidated);
    promotePhysicalAxisSingleBlockByLeech(candidates);
    // Rede de segurança 2 (leech-cardinalidade): uma fronteira pode ser visível SÓ pela
    // cardinalidade de leech dependente de N — invisível pros 5 sinais pré-validação
    // (ex.: barrage S0 19:03:02, corte@8 limpo com leech ratio saltando só ~6% entre
    // vizinhos de mobs diferentes; o corte@7 sobrevivente tinha lc=1/cl=7). Se o melhor
    // candidato guiado carrega contradição de leech ou capped-low, a enumeração completa
    // pode conter um candidato LIMPO que os sinais não propuseram — refaz o turno
    // (barato: valCache reusa as validações da passada guiada). Em pass-1 (sem
    // leechSetup) lc/cl são sempre 0, então isto nunca dispara lá.
    if (usedGuided && ((candidates[0].score.leechContradictions || 0) > 0 || (candidates[0].score.cappedLowHits || 0) > 0)) {
      pass = runShapes(null);
      candidates = pass.candidates;
      rejected = pass.rejected;
      candidates.sort(compareValidated);
      promotePhysicalAxisSingleBlockByLeech(candidates);
    }
    const best = candidates[0];
    const second = candidates[1] || null;

    // Ambiguidade crítica: duas partições empatadas nos eixos fortes mas diferentes em shape/cortes.
    if (second && best.score.timestampSplitPenalty === second.score.timestampSplitPenalty &&
        best.score.mechanicalOrder === second.score.mechanicalOrder &&
        best.score.timing === second.score.timing &&
        best.score.deterministicHits === second.score.deterministicHits &&
        best.score.leechFits === second.score.leechFits &&
        best.score.leechContradictions === second.score.leechContradictions &&
        best.score.grenadeRolloverPenalty === second.score.grenadeRolloverPenalty &&
        best.score.acausalHits === second.score.acausalHits &&
        best.score.actionRecencyPenalty === second.score.actionRecencyPenalty &&
        best.score.virtualZeroHits === second.score.virtualZeroHits &&
        best.score.unknownHits === second.score.unknownHits &&
        best.score.cappedLowHits === second.score.cappedLowHits &&
        best.score.components === second.score.components &&
        (best.candidate.shape.join('>') !== second.candidate.shape.join('>') || best.candidate.cuts.join(',') !== second.candidate.cuts.join(','))) {
      const bracketWinner = sameMobLeechBracketWinner(turn, best, second);
      if (bracketWinner) {
        registerConsolidatedActions(context, bracketWinner.candidate.components);
        return finalizeTurn(turn, bracketWinner, rejected.concat([best, second].filter(c => c !== bracketWinner)), context);
      }
      return unresolvedTurn(turn, rejected.concat([best, second]), 'ambiguous_equal_best_partitions');
    }

    // N-007/N-008/M-024/M-025: registra as ações consolidadas neste turno para que
    // actionsNearTurn não as ofereça a turnos posteriores da mesma janela.
    registerConsolidatedActions(context, best.candidate.components);

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

  // openspec/changes/fix-grenade-cast-turn-assignment: um componente pequeno (< 3 hits
  // principais elegíveis, piso de H-003 que isenta blocos pequenos da prova de
  // cardinalidade) é "resíduo" quando o leech observado bate melhor com a hipótese de
  // estar fundido num componente contíguo do mesmo turno (N = próprio + vizinho) do que
  // com a hipótese de ser um componente sozinho (N = próprio) -- teste comparativo por
  // distância absoluta em todos os canais disponíveis, mesmo método já normativo em
  // S-020/S-020a (sameMobLeechBracketWinner), sem limiar numérico novo. `leech.ok`
  // isolado não serve: uma hipótese de N pequeno sempre prevê leech maior, então o
  // observado sempre aparenta "capped-low" (D-025/S-014e) e nunca "contraditório" só
  // olhando essa hipótese sozinha.
  function componentIsResidue(components, index, setup) {
    const comp = components[index];
    if (!comp) return false;
    const mainHits = (comp.hits || []).filter(h => isMainHit(h) && !h.overkill);
    const k = mainHits.length;
    if (!k || k >= 3) return false;
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return false;
    const neighbors = [components[index - 1], components[index + 1]].filter(Boolean);
    for (const neighbor of neighbors) {
      const n = k + (neighbor.hits || []).filter(isMainHit).length;
      if (n <= k) continue;
      let anyChannel = false;
      let allCloserToFolded = true;
      for (const hit of mainHits) {
        const life = +hit.lifeLeech || 0, mana = +hit.manaLeech || 0;
        const lifeRate = effectiveLifeLeech(hit, setup), manaRate = effectiveManaLeech(hit, setup);
        let hitHasChannel = false, hitAgrees = true;
        if (life > 0 && lifeRate > 0) {
          const expAlone = expectedLeech(hit.dmg, lifeRate, k);
          const expFolded = expectedLeech(hit.dmg, lifeRate, n);
          if (expAlone != null && expFolded != null) {
            hitHasChannel = true;
            if (!(Math.abs(life - expFolded) < Math.abs(life - expAlone))) hitAgrees = false;
          }
        }
        if (mana > 0 && manaRate > 0) {
          const expAlone = expectedLeech(hit.dmg, manaRate, k);
          const expFolded = expectedLeech(hit.dmg, manaRate, n);
          if (expAlone != null && expFolded != null) {
            hitHasChannel = true;
            if (!(Math.abs(mana - expFolded) < Math.abs(mana - expAlone))) hitAgrees = false;
          }
        }
        if (!hitHasChannel) continue;
        anyChannel = true;
        if (!hitAgrees) { allCloserToFolded = false; break; }
      }
      if (anyChannel && allCloserToFolded) return true;
    }
    return false;
  }

  function turnCandidateHasResidue(t, context) {
    const components = (t && t.components) || [];
    const setup = context && context.leechSetup;
    for (let i = 0; i < components.length; i++) {
      if (componentIsResidue(components, i, setup)) return true;
    }
    return false;
  }

  // "O turno resolve SEM este cast de granada?" — reusa o mecanismo que já existe pra negar
  // um cast a um turno (`consolidatedGrenadeCasts`) em vez de inventar flag nova. Só o
  // status interessa; nenhum componente deste resolve auxiliar é aproveitado.
  function turnResolvesWithoutCast(turn, cast, facts, context) {
    if (!context) return true;
    const saved = context.consolidatedGrenadeCasts;
    try {
      context.consolidatedGrenadeCasts = new Set([cast]);
      const t = resolveTurn(turn, facts, context);
      return !!(t && t.status === 'resolved');
    } finally {
      context.consolidatedGrenadeCasts = saved;
    }
  }

  function buildGrenadeCastAssignments(turns, facts, context) {
    const savedConsumed = context && context.consolidatedGrenadeCasts;
    const savedSpells = context && context.consolidatedSpellCasts;
    const savedRunes = context && context.consolidatedRuneUses;
    const savedPreassigned = context && context.preassignedGrenadeCasts;
    if (context) {
      // Passe de sondagem: cada turno é resolvido isolado, fora de ordem e várias
      // vezes. Nenhum consumo (N-007/N-008) vale aqui — `null` desliga os três
      // conjuntos, e o `finally` os devolve.
      context.consolidatedGrenadeCasts = null;
      context.consolidatedSpellCasts = null;
      context.consolidatedRuneUses = null;
      context.preassignedGrenadeCasts = null;
      context.grenadeAssignmentOnly = true;
    }
    // Um cast pode ter mais de um turno candidato (a janela [c+2,c+4] de M-023 cruza a
    // fronteira de turnos de 2s). Guardamos TODOS os candidatos, em vez de dobrar num
    // "melhor" durante o laço, porque o desempate por dependência (T-003, abaixo) precisa
    // reexaminar cada candidato depois que todos forem conhecidos.
    const candidatesByCast = new Map();
    const resolvedAssignmentTurns = new Map();
    const assigned = new Map();
    const winningCandidates = new Map();
    try {
      for (const turn of turns || []) {
        if (!turnHasEligibleGrenadeCast(turn, facts)) continue;
        const t = resolveTurn(turn, facts, context);
        resolvedAssignmentTurns.set(turn, t);
        if (!t || t.status !== 'resolved') continue;
        const hasResidue = turnCandidateHasResidue(t, context);
        for (const b of t.components || []) {
          if (!b || b.comp !== 'grenade' || !b.action) continue;
          if (!candidatesByCast.has(b.action)) candidatesByCast.set(b.action, []);
          candidatesByCast.get(b.action).push({ turn, turnTs: t.ts, hasResidue, rollover: null });
        }
      }

      // M-024/M-025/T-002: o agrupamento de 2s é provisório. Uma explosão no fim de
      // um turno pode continuar no prefixo cronologicamente contíguo do seguinte.
      // A hipótese só existe com setup de leech utilizável e precisa fazer os DOIS
      // turnos resolverem: origem com o prefixo anexado; vizinho sem o prefixo e sem
      // reutilizar o cast. Todos os cortes possíveis são testados e exatamente um
      // deve sobreviver — não há escolha por hit count, dano, fixture ou vocação.
      const leechSetup = context && context.leechSetup;
      const canProveRollover = leechSetup && (leechSetup.lifeBase > 0 || leechSetup.manaBase > 0);
      if (canProveRollover) {
        for (let turnIndex = 0; turnIndex + 1 < (turns || []).length; turnIndex++) {
          const origin = turns[turnIndex], next = turns[turnIndex + 1];
          if (!turnHasEligibleGrenadeCast(origin, facts) || !next || !next.hits || next.hits.length < 2) continue;
          const resolvedOrigin = resolvedAssignmentTurns.get(origin);
          if (!resolvedOrigin || resolvedOrigin.status !== 'resolved') continue;

          for (const grenade of resolvedOrigin.components || []) {
            if (!grenade || grenade.comp !== 'grenade' || !grenade.action) continue;
            const cast = grenade.action;
            const impactOrdTs = [...new Set((grenade.hits || []).map(h => Number.isFinite(h.ordTs) ? h.ordTs : h.ts))]
              .sort((a, b) => a - b);
            if (impactOrdTs.length !== 1) continue;
            const rolloverOrdTs = impactOrdTs[0] + 1;
            let prefixLimit = 0;
            while (prefixLimit < next.hits.length &&
                   (Number.isFinite(next.hits[prefixLimit].ordTs) ? next.hits[prefixLimit].ordTs : next.hits[prefixLimit].ts) === rolloverOrdTs) {
              prefixLimit++;
            }
            if (!prefixLimit) continue;
            // Se o vizinho inteiro já resolve sem este cast, a borda não cria a
            // dependência mecânica que provaria mover qualquer prefixo. Esta prova
            // cara só roda depois das guardas temporais baratas acima.
            if (turnResolvesWithoutCast(next, cast, facts, context)) continue;

            const validPrefixes = [];
            const observedGrenadeHits = (grenade.hits || []).filter(h => origin.hits.includes(h));
            const rolloverActions = actionsNearTurn(
              Object.assign({}, origin, { hits: origin.hits.concat(next.hits.slice(0, 1)) }),
              facts,
              context
            );
            for (let prefixLength = 1; prefixLength <= prefixLimit && prefixLength < next.hits.length; prefixLength++) {
              const prefix = next.hits.slice(0, prefixLength);
              const originWithPrefix = Object.assign({}, origin, { hits: origin.hits.concat(prefix) });
              const nextWithoutPrefix = Object.assign({}, next, { hits: next.hits.slice(prefixLength) });
              // Pré-poda comportamentalmente neutra: antes da resolução combinatória
              // do turno inteiro, o próprio validador canônico testa o bloco de
              // granada observado + prefixo. Uma reprovação aqui também reprovaria
              // esse mesmo bloco em qualquer partição completa; aprovação apenas
              // autoriza a prova cara dos dois turnos, nunca decide o rollover.
              const probeHits = observedGrenadeHits.concat(prefix);
              const probeCandidate = {
                shape: ['grenade'],
                cuts: [probeHits.length],
                components: [{ comp: 'grenade', start: 0, end: probeHits.length, hits: probeHits }],
              };
              const probeValidation = validateCandidate(probeCandidate, originWithPrefix, rolloverActions, context);
              if (!probeValidation.ok) continue;
              const resolvedWithPrefix = resolveTurn(originWithPrefix, facts, context);
              if (!resolvedWithPrefix || resolvedWithPrefix.status !== 'resolved') continue;
              const combinedGrenade = (resolvedWithPrefix.components || []).find(b =>
                b && b.comp === 'grenade' && b.action === cast &&
                prefix.every(h => (b.hits || []).includes(h)) &&
                (grenade.hits || []).filter(h => origin.hits.includes(h)).every(h => (b.hits || []).includes(h))
              );
              if (!combinedGrenade || !turnResolvesWithoutCast(nextWithoutPrefix, cast, facts, context)) continue;
              validPrefixes.push({
                turn: originWithPrefix,
                actualTurn: origin,
                nextTurn: next,
                prefix,
                turnTs: resolvedWithPrefix.ts,
                hasResidue: turnCandidateHasResidue(resolvedWithPrefix, context),
                rollover: { prefixLength },
              });
            }

            if (validPrefixes.length !== 1) continue;
            if (!candidatesByCast.has(cast)) candidatesByCast.set(cast, []);
            candidatesByCast.get(cast).push(validPrefixes[0]);
          }
        }
      }

      for (const [cast, cands] of candidatesByCast) {
        const distinctTs = new Set(cands.map(c => c.turnTs));
        if (distinctTs.size === 1) {
          const turnTs = cands[0].turnTs;
          assigned.set(cast, turnTs);
          const rollovers = cands.filter(c => c.turnTs === turnTs && c.rollover);
          if (rollovers.length === 1) winningCandidates.set(cast, rollovers[0]);
          else if (!rollovers.length) winningCandidates.set(cast, cands[0]);
          continue;
        }

        // D1 — resíduo: um candidato cuja partição não deixa hit inexplicado vence,
        // independente de hitCount/deterministicHits (que reintroduziriam o desempate
        // arbitrário corrigido por fix-grenade-cast-turn-assignment).
        const noResidueTs = new Set(cands.filter(c => !c.hasResidue).map(c => c.turnTs));
        if (noResidueTs.size === 1) {
          const turnTs = [...noResidueTs][0];
          assigned.set(cast, turnTs);
          const winners = cands.filter(c => c.turnTs === turnTs);
          const rollovers = winners.filter(c => c.rollover);
          if (rollovers.length === 1) winningCandidates.set(cast, rollovers[0]);
          else if (!rollovers.length) winningCandidates.set(cast, winners[0]);
          continue;
        }

        // NOVO (prefer-grenade-cast-turn-that-cannot-resolve-without-it) — dependência:
        // quando o resíduo não separa, perguntar qual candidato NÃO resolve sem o cast.
        // Descartar o cast (o fail-safe antigo) deixa TODOS os hits desse turno sem
        // componente, o que T-003 proíbe, enquanto os demais candidatos seguem explicados
        // sem ele — e ainda perde o cast como execução (M-020/A-004). Pela ordem de S-011
        // (critério 1, menos contradições; critério 6, menos evidência desconhecida), a
        // atribuição que explica todos os hits observados de todos os turnos é melhor.
        // Só decide quando EXATAMENTE um candidato depende do cast; caso contrário o
        // fail-safe permanece.
        // Caso-prova: mazzerinbarrage 09/Jul/2026, cast exevo tempo mas san 01:21:02 —
        // 01:21:04 (A8 + Ethereal Barrage 8 + Divine Grenade 9) não tem NENHUMA partição
        // válida sem o cast, enquanto 01:21:06 resolve bem sem ele (A8 + Caldera 13).
        const dependentTs = new Set(
          cands.filter(c => !turnResolvesWithoutCast(c.turn, cast, facts, context)).map(c => c.turnTs)
        );
        if (dependentTs.size === 1) {
          const turnTs = [...dependentTs][0];
          assigned.set(cast, turnTs);
          const winners = cands.filter(c => c.turnTs === turnTs);
          const rollovers = winners.filter(c => c.rollover);
          if (rollovers.length === 1) winningCandidates.set(cast, rollovers[0]);
          else if (!rollovers.length) winningCandidates.set(cast, winners[0]);
          continue;
        }

        // `null` é sentinela pra cast ambíguo: `actionsNearTurn` só oferece o cast ao turno
        // em `preassigned.get(c) === turn.ts`, e nenhum turn.ts real é `null`, então isso
        // exclui o cast de TODOS os turnos candidatos em vez de escolher um vencedor.
        assigned.set(cast, null);
      }

      // A transferência é posterior à escolha global. Se dois casts tentarem consumir
      // qualquer hit do mesmo prefixo, nenhum deles recebe o rollover (fail-safe).
      const claimedRolloverHits = new Map();
      for (const [cast, winner] of winningCandidates) {
        if (!winner.rollover || assigned.get(cast) !== winner.turnTs) continue;
        for (const h of winner.prefix) {
          if (!claimedRolloverHits.has(h)) claimedRolloverHits.set(h, []);
          claimedRolloverHits.get(h).push(cast);
        }
      }
      for (const [cast, winner] of winningCandidates) {
        if (!winner.rollover || assigned.get(cast) !== winner.turnTs) continue;
        const conflicted = winner.prefix.some(h => (claimedRolloverHits.get(h) || []).length !== 1);
        const prefixStillPresent = winner.prefix.every((h, i) => winner.nextTurn.hits[i] === h);
        if (conflicted || !prefixStillPresent) {
          assigned.set(cast, null);
          continue;
        }
        winner.actualTurn.hits.push(...winner.prefix);
        winner.actualTurn.hits.sort((a, b) =>
          ((Number.isFinite(a.ordTs) ? a.ordTs : a.ts) - (Number.isFinite(b.ordTs) ? b.ordTs : b.ts)) ||
          ((a.seq || 0) - (b.seq || 0))
        );
        winner.nextTurn.hits.splice(0, winner.prefix.length);
      }
    } finally {
      if (context) {
        context.consolidatedGrenadeCasts = savedConsumed;
        context.consolidatedSpellCasts = savedSpells;
        context.consolidatedRuneUses = savedRunes;
        context.preassignedGrenadeCasts = savedPreassigned;
        delete context.grenadeAssignmentOnly;
      }
    }
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

    // S-020 exige unanimidade entre "todos os canais disponiveis", mas nao definia quando um
    // canal e grosso demais pra ser evidencia. O comparador era estritamente ordinal: uma
    // diferenca de 1 unidade virava voto de mesmo peso que uma de 20. Como o leech e
    // CEIL(dano x taxa x areaFactor) (D-023), 1 unidade e a propria granularidade do
    // arredondamento -- e leechValueToleranceForN ja e o piso normativo do motor pra esse
    // ruido (1 pra n > 3; 3..5 adaptativo em bloco pequeno, onde a base inferida desloca
    // mais). Um canal cuja MARGEM de voto nao supera essa tolerancia se abstem: e evidencia
    // ausente (D-006), nao contradicao, e nao pode anular um canal que discrimina.
    // Caso-prova: gloompillar 08:36:51 -- vida vota com margem |20-4|=16 e mana "vota" o lado
    // oposto com margem |1-2|=1 (a mana inteira do turno vive entre 26 e 30). Sem a guarda, o
    // turno morre em ambiguous_equal_best_partitions com a fronteira visivel no canal de vida.
    const nDisputed = Math.max(hits.length - lo, hi);
    const channelIsDiscriminating = (db, da, observed) =>
      Math.abs(db - da) > leechValueToleranceForN(nDisputed, observed);

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
        if (!channelIsDiscriminating(db, da, dv)) continue; // canal sem poder de resolucao: abstem (D-006)
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
      // Mesma guarda do ramo S-020: empate exato (margem 0) passa a ser um caso particular de
      // canal nao-discriminante, entao ele abstem em vez de matar a decisao dos outros canais.
      if (!channelIsDiscriminating(db, da, dv)) continue;
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
        // M-039: aqui — e so aqui — a atribuicao de omega do bloco vencedor vira rotulo do
        // hit. Durante a busca ela vive em `context._omegaAssignment`, porque os objetos de
        // hit sao compartilhados entre todas as particoes candidatas e gravar antes
        // vazaria a hipotese de uma para as outras. Depois desta linha o rotulo e o que a
        // base de leech da inferencia de sessao, a agregacao e o trace/UI leem.
        // Sessao sem omega nunca chega aqui com `omegaHits`, e o campo nem existe nela.
        if (b.omegaHits && b.omegaHits.has(h)) {
          h.omegaActive = true;
          // A evidencia do hit foi enriquecida no inicio da resolucao, quando nenhuma
          // atribuicao existia ainda — ela ainda descreve a reversao SEM omega. Agora que
          // a decisao do bloco vencedor e conhecida, re-derivar deixa `O`/`post` do
          // diagnostico e da UI (U-006) coerentes com o rotulo. Mesmo movimento que o
          // bloco de Terra Burst logo abaixo ja faz pelo seu proprio bonus.
          enrichHitEvidence(h, context);
        }
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

  // T-007/A-009: este gate só é chamado DEPOIS que a resolução normal esgotou as
  // hipóteses e terminou unresolved. Nesse ponto, `partialEdge` é a causa operacional:
  // não há evidência suficiente no recorte para distinguir uma contradição real da perda
  // provocada pelo início do Server Log. Isso também cobre uma ação concreta que explique
  // apenas parte do turno; ela não autoriza absorver o prefixo nem confirmar estágio
  // multietapa sem a prova exigida por M-016d.
  //
  // Turnos parciais que resolvem nunca chegam aqui e permanecem classificáveis/auditáveis.
  // Casos-prova: `uhax 3 20:49:26`, `mazzerinbarrage 23:21:27` (09/Jun/2026) e
  // `death echo 11:06:01` (10/Jul/2026).
  function isPartialEdgeMissingEvidence(turn, rejected, context) {
    return !!(turn && turn.partialEdge);
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
        for (const h of c.hits) {
          if (h.countsAsHit !== false && (!h.overkill || c.hits.every(x => x.overkill))) {
          row.dmgEff.push(h.dmg);
          // Base atual: usa menor candidato/interseção disponível; métrica só informativa.
          if (c.comp === 'arrow' && h.evidence && h.evidence.physical && h.evidence.physical.interval) row.dmgBase.push(Math.round((h.evidence.physical.interval[0] + h.evidence.physical.interval[1]) / 2));
          else row.dmgBase.push(h.dmg);
          }
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
  const API = {
    enrichHitEvidence,
    firstHitLowBlowSameMobBoundary,
    H005_MERGED_VETO_JURISDICTION,
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
  };

  root.UnifiedTurnResolution = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
