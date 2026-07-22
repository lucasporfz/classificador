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
    leechValueToleranceForN,
  } = root.UnifiedFormulas;

  const {
    actionsNearTurn,
    nearestSpellCastForTurn,
    nearestRuneUseForTurn,
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
    isSingleTargetAction,
    validateElementalBlock,
    validatePhysicalBlock,
    validateCritHomogeneity,
    validateLeechBlockOfficialRates,
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
    const profile = action && action.profile || {};
    const isMageDruid = context.vocation === 'sorcerer' || context.vocation === 'druid';
    const concreteAreaActionCanExplainTurn = profile.topology === 'area' && !isSingleTargetAction(actionComp, action);

    // Mecânica rara: charm/proc entra antes do dano do hit que o ativou. Se a
    // ação concreta existe, mas o dano principal dela é zero e não aparece como
    // linha normal. Representamos como componente virtual de dano 0.
    if (hits.length === 1) {
      const zero = detectCharmKilledZeroAction(turn, action, facts);
      if (zero && action.ts >= hits[0].ts && action.ts <= hits[0].ts + 1) {
        const virtual = makeVirtualZeroHit(turn, action, zero);
        if (isMageDruid && concreteAreaActionCanExplainTurn) {
          return finalizeManualTurn(turn, [
            { comp: actionComp, action, hits: [hits[0], virtual], reason: 'h005_mage_druid_area_action_without_positive_aa_evidence' },
          ], 'h005_mage_druid_area_action_without_positive_aa_evidence', context);
        }
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
    const forceA1Confirmed = evidenceHasMinimalSuffix && forceA1.force;
    const mageDruidHasPositiveAaEvidence = !isMageDruid || !concreteAreaActionCanExplainTurn
      || strongTimestampBoundary || critStateBoundary || sameMobSeparationEvidence || forceA1Confirmed;
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
      } else if (splitHasEvidence && splitScore.bad < allScore.bad && splitScore.clean > allScore.clean) {
        chosen = split;
        reason = 'ek_positional_aa_confirmed_by_leech_cardinality';
      }
    }

    // Se o candidato a AA (primeiro hit) tem o MESMO mob, MESMO estado de
    // modificadores (EW/prey/crit/Low Blow/Onslaught) e MESMO dano de algum hit
    // que ficaria no bloco do sufixo, esses dois hits são mecanicamente o mesmo
    // componente determinístico (S-004a) e o split é rejeitado.
    if (chosen === split && firstHitSharesExactOriginalWithRest(hits)) {
      chosen = allSpell;
      reason = 'h005_same_mob_state_exact_match_blocks_aa_split';
    }

    if (chosen === split
      && isMageDruid
      && concreteAreaActionCanExplainTurn
      && !mageDruidHasPositiveAaEvidence) {
      chosen = allSpell;
      reason = 'h005_mage_druid_area_action_without_positive_aa_evidence';
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

    // Hit principal virtual por charm-kill (fato observado, sem leech): uma linha
    // de dano de charm imediatamente seguida por XP (killedTarget) prova que o
    // charm matou o alvo antes da linha de dano principal daquele ataque aparecer
    // — logo existe um hit de dano 0 daquela ação. Generaliza o atalho
    // hits.length===1 para k>=2. O dono é o componente de ÁREA do turno: o AA
    // single-target já saturado por seu hit visível não pode reivindicar um alvo
    // varrido a mais (canUseVirtualZeroForBlock só habilita spell/rune de área e
    // arrow). Anexa o virtual a block.hits (dump conta hits.length; isMainHit
    // exclui type:'virtual' do leech, sem duplicar). Não toca no caminho RP
    // (validateLeechBlockForNWithVirtual). Regras: S-014e, C-008, T-004.
    if (actionBlock && canUseVirtualZeroForBlock({ comp: actionComp, action })) {
      const areaBlock = { comp: actionComp, hits: actionBlock.hits, action };
      const charms = eligibleVirtualZeroCharmsForBlock(turn, areaBlock, context);
      if (charms.length) {
        const virtuals = charms.map((ch, idx) => makeVirtualZeroHitForCharm(turn, action, ch, idx, areaBlock));
        actionBlock.hits = actionBlock.hits.concat(virtuals);
      }
    }

    // V-015b/V-015d: dispersão cross-mob (elemental_cluster_span_too_wide,
    // elemental_intersection_empty) NUNCA veta — evidência ausente (D-006), não
    // contradição. Só quebra de exatidão same-mob/same-estado não explicada (S-004a —
    // validateTerraBurstBonusBlock já tentou explicar por bônus tier antes de chegar
    // nesse veto) e crit-state misto (S-008/D-007) são vetos duros.
    function buildValidatedDefs(candidateDefs, candidateReason) {
      const built = candidateDefs.map(def => {
        const block = { comp: def.comp, hits: def.hits.slice(), action: def.action || null };
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
      // Isto NAO vale para mecanicas ainda nao declaradas (ex.: chain decay de Chained
      // Penance): sem regra em docs/CLASSIFICATION_RULES.md, o veto permanece e o turno
      // fica unresolved, que e o comportamento pedido.
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
      const declaredMultiLevelAction = isBeamAction(act) || stagesNotYetAssigned
        || isTerraBurstAction(act) || isChainedPenanceAction(act);
      const hardVeto = actionDef && (
        (!declaredMultiLevelAction && actionDef.deterministic && actionDef.deterministic.ok === false && actionDef.deterministic.reason === 'same_mob_state_exact_original_mismatch')
        || (actionDef.critHomogeneity && actionDef.critHomogeneity.ok === false)
      );
      const vetoReason = hardVeto
        ? ((actionDef.critHomogeneity && actionDef.critHomogeneity.ok === false) ? actionDef.critHomogeneity.reason : actionDef.deterministic.reason)
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
      // Assimétrico por H-005: resgatar MESCLANDO de volta (chosen=split -> allSpell)
      // é sempre seguro, é só desfazer uma separação sem justificativa. Resgatar
      // SEPARANDO (chosen=allSpell -> split) só é permitido quando já havia evidência
      // positiva de AA (mageDruidHasPositiveAaEvidence) — sem isso, "a partição
      // alternativa validou" não é evidência de AA, é só um subconjunto menor que
      // escapa por coincidência de uma mecânica ainda não modelada (ex.: M-035 beam
      // central/side). Caso-prova negativo: `kim` `16:13:26`/`16:22:05` (Great Energy
      // Beam) — sem essa guarda, o resgate por eliminação separava um "AA" fantasma
      // porque o sufixo menor validava, mesmo com a evidência (c) desativada de
      // propósito pra beam.
      const rescueBySplitting = chosen !== split && mageDruidHasPositiveAaEvidence;
      const canRescue = chosen === split || rescueBySplitting;
      const alternate = chosen === split ? allSpell : split;
      const alternateReason = (chosen === split ? 'ek_all_spell' : 'ek_positional_aa_first_hit')
        + '_confirmed_by_deterministic_validation_after_hard_veto';
      const altPicked = canRescue ? buildValidatedDefs(alternate, alternateReason) : null;
      if (altPicked && !altPicked.hardVeto) {
        picked = altPicked;
        reason = alternateReason;
      } else {
        return unresolvedTurn(turn, [{ candidate: null, violations: [{ reason: picked.vetoReason, detail: picked.defs.find(d => d.comp === actionComp).deterministic }] }], picked.vetoReason);
      }
    }
    const defs = picked.defs;

    return finalizeManualTurn(turn, defs, reason, context);
  }

  function resolveTurn(turn, facts, context) {
    turn.actions = actionsNearTurn(turn, facts, context);
    turn.hits.forEach(h => enrichHitEvidence(h, context));

    const singleTargetAaTurn = resolveSingleTargetAaVocationTurn(turn, facts, context);
    if (singleTargetAaTurn) return singleTargetAaTurn;

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
            if (hasGrenade && grenadeCandidateWindowInvalid(cand, turn.actions)) { valCache.set(cacheKey, null); continue; }
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
    const savedPreassigned = context && context.preassignedGrenadeCasts;
    if (context) {
      context.consolidatedGrenadeCasts = null;
      context.preassignedGrenadeCasts = null;
      context.grenadeAssignmentOnly = true;
    }
    // Um cast pode ter mais de um turno candidato (a janela [c+2,c+4] de M-023 cruza a
    // fronteira de turnos de 2s). Guardamos TODOS os candidatos, em vez de dobrar num
    // "melhor" durante o laço, porque o desempate por dependência (T-003, abaixo) precisa
    // reexaminar cada candidato depois que todos forem conhecidos.
    const candidatesByCast = new Map();
    const assigned = new Map();
    try {
      for (const turn of turns || []) {
        if (!turnHasEligibleGrenadeCast(turn, facts)) continue;
        const t = resolveTurn(turn, facts, context);
        if (!t || t.status !== 'resolved') continue;
        const hasResidue = turnCandidateHasResidue(t, context);
        for (const b of t.components || []) {
          if (!b || b.comp !== 'grenade' || !b.action) continue;
          if (!candidatesByCast.has(b.action)) candidatesByCast.set(b.action, []);
          candidatesByCast.get(b.action).push({ turn, turnTs: t.ts, hasResidue });
        }
      }

      for (const [cast, cands] of candidatesByCast) {
        const distinctTs = new Set(cands.map(c => c.turnTs));
        if (distinctTs.size === 1) { assigned.set(cast, cands[0].turnTs); continue; }

        // D1 — resíduo: um candidato cuja partição não deixa hit inexplicado vence,
        // independente de hitCount/deterministicHits (que reintroduziriam o desempate
        // arbitrário corrigido por fix-grenade-cast-turn-assignment).
        const noResidueTs = new Set(cands.filter(c => !c.hasResidue).map(c => c.turnTs));
        if (noResidueTs.size === 1) { assigned.set(cast, [...noResidueTs][0]); continue; }

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
        if (dependentTs.size === 1) { assigned.set(cast, [...dependentTs][0]); continue; }

        // `null` é sentinela pra cast ambíguo: `actionsNearTurn` só oferece o cast ao turno
        // em `preassigned.get(c) === turn.ts`, e nenhum turn.ts real é `null`, então isso
        // exclui o cast de TODOS os turnos candidatos em vez de escolher um vencedor.
        assigned.set(cast, null);
      }
    } finally {
      if (context) {
        context.consolidatedGrenadeCasts = savedConsumed;
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

  // T-007/A-009: o critério é a CAUSA (a borda inicial removeu a ação concreta que
  // explicaria os hits), não a razão de rejeição específica de cada vocação. Sem ação
  // ofensiva concreta no recorte, `possibleShapes` só consegue gerar o bloco único
  // `arrow[n]`; quando ele cai, não existe classificação derivável da evidência visível.
  //
  // Antes o gate exigia vocação de AA single-target E a razão
  // `multiple_arrow_hits_not_allowed`. As duas eram a mesma restrição escrita duas vezes:
  // essa razão só pode ocorrer nessas vocações, porque M-031 dá AA de área
  // exclusivamente ao Royal Paladin. Isso deixava de fora o mesmo fenômeno em RP, onde a
  // hipótese remanescente cai por incoerência do eixo físico.
  // Casos-prova: `uhax 3 20:49:26` (druid, `multiple_arrow_hits_not_allowed`) e
  // `mazzerinbarrage 23:21:27` sessão 09/Jun/2026 (RP, `physical_intersection_empty`;
  // o leech dos 6 hits visíveis fecha exato em N_leech=9 nos dois canais e nos quatro
  // mobs, confirmando que a borda levou 3 hits do bloco).
  function isPartialEdgeMissingEvidence(turn, rejected, context) {
    if (!turn || !turn.partialEdge) return false;
    if (hasConcreteOffensiveAction(turn.actions)) return false;
    if (!turn.hits || turn.hits.length <= 1) return false;
    const rejectedList = rejected || [];
    if (!rejectedList.length) return false;
    // Conjunto fechado de propósito: um `arrow[n]` rejeitado por, por exemplo,
    // `leech_cardinality_failed` significa que HÁ evidência utilizável no recorte
    // contradizendo a hipótese — isso é `unresolved` legítimo, não informação perdida.
    const allowedReasons = new Set(['multiple_arrow_hits_not_allowed', 'physical_intersection_empty']);
    return rejectedList.every(val => {
      const cand = val && val.candidate;
      if (!cand || cand.shape.join('>') !== 'arrow' || cand.cuts.join(',') !== String(turn.hits.length)) return false;
      const reasons = (val.violations || []).map(v => v && v.reason).filter(Boolean);
      if (!reasons.length) return false;
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
