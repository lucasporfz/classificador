/*
 * unified-setup-inference.js
 *
 * Camada de setup-inference do UnifiedClassificationEngine: infere valores validos pra
 * a sessao inteira a partir de "turnos ouro" (turnos faceis, resolvidos sem precisar
 * do setup ainda) -- leech (vida/mana), charms menores, e o perk BM/pierce por evidencia
 * cross-mob. Critico por-componente e gravSan moram no engine (bootstrap), nao aqui.
 *
 * O bloco de BM-pierce PRECISA rodar validacao de candidato sob cada hipotese de perk
 * pra pontuar qual bate com a evidencia -- validateElementalBlock/validatePhysicalBlock/
 * withGravSanBlockMode sao lookups tardios em root.UnifiedValidation (nao destructured
 * no topo do arquivo), porque unified-validation.js so carrega DEPOIS deste arquivo.
 * So resolvem quando a funcao roda de fato (classifyUnified), quando tudo ja carregou.
 *
 * Exporta globalThis.UnifiedSetupInference (+ module.exports quando disponivel).
 * Carregado depois de unified-parsing.js e antes de unified-classification-engine.js.
 */
(function(root) {
  'use strict';

  const {
    CUTOFF_KEY,
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
    PRE_CUTOFF_EXPOSE_WEAKNESS_MANA_LEECH_BONUS,
    bountyTalismanBonusForLevel,
    bountyTalismanLevelsWithinBonus,
    leechValueToleranceForN,
    distinctMainMobCount,
    isMainHit,
    median,
    gravSanMultiplierAtTs,
    normalizeName,
    getMobMods,
    percentile,
    physicalOriginalInterval,
    elementalOriginalCandidates,
    isTerraBurstAction,
    isChainedPenanceAction,
  } = root.UnifiedFormulas;

  const {
    buildTurns,
  } = root.UnifiedParsing;
  function areaFactor(n) { return n >= 1 ? 0.1 + 0.9 / n : 1; }
  function realDamageIntervalFromLeech(observed, effLeech, n) {
    if (!(observed > 0) || !(effLeech > 0) || !(n >= 1)) return null;
    const lf = effLeech * areaFactor(n);
    const min = Math.floor((observed - 1) / lf) + 1;
    const max = Math.floor(observed / lf);
    return max >= min ? [min, max] : null;
  }
  function expectedLeech(damage, effLeech, n) {
    if (!(damage > 0) || !(effLeech > 0)) return null;
    return Math.ceil(damage * effLeech * areaFactor(n));
  }
  function leechDamageBasis(hit, context, preserveUnknownBounty) {
    // Leech é calculado sobre o dano real antes de multiplicadores finais que
    // aumentam dano exibido sem aumentar leech: active prey/Bounty e utevo grav san.
    let dmg = +(hit && hit.dmg) || 0;
    if (!(dmg > 0)) return 0;
    let divisor = 1;
    if (hit && hit.isPrey) divisor *= 1.25;
    if (hit && hit.bountyTalisman) {
      const damage = context && context.bountyTalismanSetup && context.bountyTalismanSetup.damage;
      if (!damage || damage.confidence === 'unknown' || !(damage.multiplier > 1)) {
        if (!preserveUnknownBounty) return 0;
      } else {
        divisor *= damage.multiplier;
      }
    }
    divisor *= gravSanMultiplierAtTs(context, hit && hit.ts, hit);
    // M-039: omega NAO entra neste divisor, DE PROPOSITO. O que sai daqui e so
    // multiplicador que infla o dano exibido SEM inflar o leech (prey, Bounty, grav san --
    // ver D-030). Omega e o contrario: medido em `crypt` sobre pares a x1,060, a razao de
    // life leech e 1,0596 (n=2.884) e a de mana 1,0541 (n=2.908) -- o leech ACOMPANHA o
    // dano inflado, logo o dano inflado E a base. Dividir por 1,06 aqui cobraria do hit
    // uma taxa 6% menor que a real; medido, isso deixava o esperado ~6% abaixo do
    // observado em 100% dos hits omega (`07:30:10` cyclursus 815: observado 82, esperado
    // 77 dividindo, 82 sem dividir), com os vizinhos sem omega batendo exato dos dois
    // jeitos. O vies sobrevivia encostado na tolerancia de D-024 (a mana salvava o hit
    // pelo "e/ou"), entao aparecia como dano base enviesado e nao como turno quebrado.
    return divisor > 0 ? dmg / divisor : dmg;
  }

  function inferLeechSetup(input, context) {
    // V25: inferência robusta de Life/Mana Leech usando componentes confiáveis.
    // Quando temos runas com `Using one of ... runes`, o N_leech do sufixo após
    // o Using é muito mais confiável que votar N=1..20 por hit solto. Usamos esses
    // componentes para inferir base global + no máximo um minor charm por canal.
    const serverFacts = input && !Array.isArray(input) && input.hits ? input : null;
    const hits = Array.isArray(input) ? input : ((input && input.hits) || []);
    const fallback = inferLeechSetupFallback(hits, context);
    if (!serverFacts || !serverFacts.runeUses || !serverFacts.runeUses.length) return fallback;

    const trusted = collectTrustedLeechObservationsFromRuneUses(serverFacts, context);
    const lifeRobust = inferTrustedLeechChannel(trusted.life, 'life', LIFE_BASE_CANDIDATES, VAMPIRIC_BONUSES, context);
    const manaRobust = inferTrustedLeechChannel(trusted.mana, 'mana', MANA_BASE_CANDIDATES, VOIDS_BONUSES, context);

    const useLife = isTrustedLeechVoteCredible(lifeRobust);
    const useMana = isTrustedLeechVoteCredible(manaRobust);
    if (!useLife && !useMana) return fallback;

    const setup = Object.assign({}, fallback, {
      inferred: true,
      confidence: (useLife && lifeRobust.observed >= 20) || (useMana && manaRobust.observed >= 20) ? 'strong' : 'weak',
      source: 'trusted_component_inverse_leech_plus_fallback',
      trustedObservationCounts: { life: trusted.life.length, mana: trusted.mana.length },
      fallbackSetup: fallback,
      lifeVoteFallback: fallback.lifeVote,
      manaVoteFallback: fallback.manaVote,
    });

    if (useLife) {
      setup.lifeBase = lifeRobust.base;
      setup.lifeVote = lifeRobust;
      setup.lifeBaseKnown = true;
      setup.lifeBaseAbstention = null;
    }
    if (useMana) {
      setup.manaBase = manaRobust.base;
      setup.manaVote = manaRobust;
      setup.manaBaseKnown = true;
      setup.manaBaseAbstention = null;
    }

    applyExclusiveTrustedMinorLeechCharms(setup, useLife ? lifeRobust : null, useMana ? manaRobust : null, fallback);
    setup.trustedLeechInference = { life: lifeRobust, mana: manaRobust };
    return setup;
  }

  function unknownLeechSetup(source) {
    return {
      lifeBase: 0,
      manaBase: 0,
      // C-006b: setup desconhecido é abstenção nos DOIS canais, nunca taxa zero medida.
      lifeBaseKnown: false,
      manaBaseKnown: false,
      confidence: 'unknown',
      inferred: false,
      source: source || 'unknown',
      evidenceCount: 0,
      contradictions: 0,
    };
  }

  function unknownBountyTalismanAxis(source) {
    return {
      level: null,
      bonus: null,
      multiplier: null,
      confidence: 'unknown',
      source: source || 'unknown',
      evidenceCount: 0,
      contradictions: 0,
    };
  }

  function unknownBountyTalismanSetup(source) {
    return {
      damage: unknownBountyTalismanAxis(source),
      life: unknownBountyTalismanAxis(source),
    };
  }

  function leechSetupConfidence(setup) {
    const c = setup && setup.confidence;
    if (c === 'strong' || c === 'weak' || c === 'unknown') return c;
    if (setup && setup.source && /multi_n/.test(setup.source)) return 'unknown';
    if (setup && ((setup.lifeBase > 0) || (setup.manaBase > 0))) return 'weak';
    return 'unknown';
  }

  function canUseLeechAsHardReject(context) {
    return leechSetupConfidence(context && context.leechSetup) === 'strong';
  }

  function canScoreLeech(context) {
    const c = leechSetupConfidence(context && context.leechSetup);
    return c === 'strong' || c === 'weak';
  }

  function isLeechChannelContaminated(channel, ts, context) {
    if (!channel || !Number.isFinite(+ts) || !context || context.sessionDateKey == null || context.sessionDateKey >= CUTOFF_KEY) return false;
    const casts = (context.localFacts && context.localFacts.supportCasts) || [];
    return casts.some(c => {
      const profile = c && c.profile;
      if (!profile || profile.contaminatesLeechChannel !== channel) return false;
      return ts >= c.ts && ts <= c.ts + 16;
    });
  }

  function cloneHitForGoldObservation(hit, channel, observed, n, source, context) {
    const bountyDamage = context && context.bountyTalismanSetup
      && context.bountyTalismanSetup.damage;
    const bountyDamageKnown = !hit.bountyTalisman
      || (bountyDamage && bountyDamage.confidence !== 'unknown'
        && bountyDamage.multiplier > 1);
    if (!bountyDamageKnown) return null;
    const damage = leechDamageBasis(hit, context, false);
    if (!(observed > 0) || !(damage > 0)) return null;
    if (isLeechChannelContaminated(channel, hit.ts, context)) return null;
    return {
      channel,
      observed,
      damage,
      dmgBasis: damage,
      mob: normalizeName(hit.mob),
      n,
      isPrey: !!hit.isPrey,
      bountyTalisman: !!hit.bountyTalisman,
      bountyDamageNormalized: bountyDamageKnown,
      exposeWeakness: !!hit.exposeWeakness,
      source,
      confidence: 'gold',
      ts: hit.ts,
      clock: hit.clock,
      seq: hit.seq,
    };
  }

  function componentGoldSource(comp) {
    if (!comp || comp.comp === 'unresolved') return null;
    if (comp.comp === 'arrow') return 'mechanical_arrow_component';
    if ((comp.comp === 'spell' || comp.comp === 'rune' || comp.comp === 'grenade') && comp.action) {
      const profile = comp.action.profile || {};
      if (profile.type === 'support') return null;
      return (comp.comp || 'component') + ':' + (profile.label || comp.action.text || 'concrete_action');
    }
    return null;
  }

  function componentGoldN(comp, turn, context) {
    if (!comp || comp.comp === 'unresolved') return null;
    const main = (comp.hits || []).filter(h => isMainHit(h) && !h.virtual);
    const n = main.length;
    if (!(n > 0)) return null;
    if (main.some(h => h.overkill)) return null;
    if (comp.leech && comp.leech.usable && comp.leech.ok === false) return null;
    const action = comp.action || null;
    const profile = action && action.profile || {};
    const source = componentGoldSource(comp);
    if (!source) return null;
    const eligibleVirtuals = root.UnifiedValidation
      && root.UnifiedValidation.eligibleVirtualZeroCharmsForBlock
      ? root.UnifiedValidation.eligibleVirtualZeroCharmsForBlock(turn, comp, context)
      : [];
    // S-014e/C-006: enquanto um charm-kill real pode aumentar a cardinalidade,
    // a partição corrente não é independente o bastante para virar ouro.
    if (main.some(hit => hit.bountyTalisman) && eligibleVirtuals.length) return null;

    if (comp.comp === 'arrow') {
      if (context && context.vocation === 'paladin') return null;
      if (context && (context.vocation === 'sorcerer' || context.vocation === 'druid')) {
        const reason = String(comp.reason || turn.reason || '');
        const positiveMageDruidAa = reason === 'ek_timestamp_boundary_aa_then_spell'
          || reason === 'ek_positional_aa_confirmed_by_leech_cardinality'
          || reason.indexOf('ek_a1_forced_by_leech_cardinality_') === 0;
        if (!positiveMageDruidAa) return null;
      }
      return n === 1 ? { n, source: source + ':single_target_vocation_aa' } : null;
    }

    if ((comp.comp === 'spell' || comp.comp === 'rune') && profile.topology === 'single') {
      return n === 1 ? { n, source: source + ':concrete_single_target' } : null;
    }

    if (comp.comp === 'grenade' && profile.topology === 'area') {
      const timestamps = new Set(main.map(h => h.ts));
      if (n >= 2 && timestamps.size === 1 && comp.deterministic && comp.deterministic.ok && (comp.deterministic.unknown || 0) === 0) {
        return { n, source: source + ':concrete_area_single_impact' };
      }
    }

    if ((comp.comp === 'spell' || comp.comp === 'rune') && profile.topology === 'area' && profile.element && profile.element !== 'physical') {
      const det = comp.deterministic || {};
      if (n >= 2 && det.ok && (det.known || 0) >= n && (det.unknown || 0) === 0) {
        return { n, source: source + ':concrete_area_deterministic_originals' };
      }
    }

    return null;
  }

  function collectGoldLeechObservations(turns, context) {
    const observations = [];
    const pendingGravSanWindows = context && context.gravSanSetup
      && context.gravSanSetup.pendingDamageLeechFallback
      ? (context.gravSanSetup.windows || [])
      : [];
    for (const turn of turns || []) {
      if (!turn || turn.status !== 'resolved' || turn.partialEdge) continue;
      for (const comp of turn.components || []) {
        const gold = componentGoldN(comp, turn, context);
        if (!gold) continue;
        const main = (comp.hits || []).filter(h => isMainHit(h) && !h.virtual);
        for (const h of main) {
          // D-030: enquanto o tier global está pendente, dano de dentro da janela
          // ainda contém um multiplicador desconhecido e não pode votar no próprio
          // setup de leech que será usado para inferi-lo.
          if (pendingGravSanWindows.some(w => h.ts >= w.start && h.ts <= w.end)) continue;
          const life = cloneHitForGoldObservation(h, 'life', +h.lifeLeech || 0, gold.n, gold.source, context);
          const mana = cloneHitForGoldObservation(h, 'mana', +h.manaLeech || 0, gold.n, gold.source, context);
          if (life) observations.push(life);
          if (mana) observations.push(mana);
        }
      }
    }
    return observations;
  }

  function countOfficialLeechSources(base, channel) {
    const slots = channel === 'life' ? LIFE_IMBUEMENT_SLOTS : MANA_IMBUEMENT_SLOTS;
    const convs = channel === 'life' ? LIFE_CONVICTION : MANA_CONVICTION;
    const weapons = channel === 'life' ? LIFE_WEAPON_PERK : MANA_WEAPON_PERK;
    const convUnit = convs[1] || 0;
    const weaponUnit = weapons[1] || 0;
    let best = 99;
    for (const a of slots) for (const b of slots) for (const c of convs) for (const w of weapons) {
      const sum = Math.round((a + b + c + w) * 1e6) / 1e6;
      if (Math.abs(sum - base) <= 1e-9) {
        const count = (a > 0 ? 1 : 0) + (b > 0 ? 1 : 0)
          + (convUnit > 0 ? Math.round(c / convUnit) : 0)
          + (weaponUnit > 0 ? Math.round(w / weaponUnit) : 0);
        best = Math.min(best, count);
      }
    }
    return best === 99 ? 50 : best;
  }

  function scoreGoldBase(observations, channel, candidate) {
    const base = typeof candidate === 'number' ? candidate : candidate && candidate.base;
    const coreBase = typeof candidate === 'number' ? candidate : candidate && candidate.coreBase;
    const weaponCount = typeof candidate === 'number' ? 0 : (+candidate.weaponCount || 0);
    const weaponBonus = typeof candidate === 'number' ? 0 : (+candidate.weaponBonus || 0);
    let ok = 0, exact = 0, high = 0, low = 0;
    const turns = new Set(), mobs = new Set(), highMobs = new Set(), lowMobs = new Set(), examples = [], contradictions = [];
    for (const o of observations || []) {
      if (!o || o.channel !== channel || !(o.observed > 0) || !(o.damage > 0) || !(o.n >= 1)) continue;
      const expected = expectedLeech(o.damage, base, o.n);
      if (expected == null) continue;
      const delta = o.observed - expected;
      const tolerance = leechValueToleranceForN(o.n);
      turns.add(o.ts + ':' + (o.source || ''));
      if (o.mob) mobs.add(o.mob);
      if (Math.abs(delta) <= tolerance) {
        ok++;
        if (delta === 0) exact++;
        if (examples.length < 8) examples.push({ mob: o.mob, ts: o.ts, observed: o.observed, expected, n: o.n, damage: o.damage, delta });
      } else if (delta > 0) {
        high++;
        if (o.mob) highMobs.add(o.mob);
        if (contradictions.length < 8) contradictions.push({ mob: o.mob, ts: o.ts, observed: o.observed, expected, n: o.n, damage: o.damage, delta });
      } else {
        // capped-low (observado < esperado): sempre consistente, nunca contradição
        // (D-025/S-014e, estendido à votação de rate base pelo adendo de C-006). Contado
        // só para diagnóstico (`lowMobs`), nunca usado para pontuar/desempatar candidatos
        // em compareGoldBaseScores.
        low++;
        if (o.mob) lowMobs.add(o.mob);
      }
    }
    return {
      channel,
      base,
      coreBase: coreBase || base,
      weaponCount,
      weaponBonus,
      ok,
      exact,
      high,
      low,
      highMobs: highMobs.size,
      lowMobs: lowMobs.size,
      observed: (observations || []).filter(o => o && o.channel === channel).length,
      independentTurns: turns.size,
      mobs: mobs.size,
      sourceCount: (candidate && candidate.sourceCount) || countOfficialLeechSources(coreBase || base, channel),
      examples,
      contradictions,
    };
  }

  function compareGoldBaseScores(a, b) {
    if (a.ok !== b.ok) return b.ok - a.ok;
    if (a.exact !== b.exact) return b.exact - a.exact;
    if (a.independentTurns !== b.independentTurns) return b.independentTurns - a.independentTurns;
    if (a.mobs !== b.mobs) return b.mobs - a.mobs;
    if (a.highMobs !== b.highMobs) return a.highMobs - b.highMobs;
    if (a.high !== b.high) return a.high - b.high;
    // `low` (capped-low) MUST NOT desempatar candidatos — ver comentário em scoreGoldBase.
    if (a.weaponCount !== b.weaponCount) return a.weaponCount - b.weaponCount;
    if (a.sourceCount !== b.sourceCount) return a.sourceCount - b.sourceCount;
    return a.base - b.base;
  }

  // Como scoreGoldBase, mas um único mob (`bonusMob`) usa `base + bonusRate` em vez de
  // `base` puro. Usado pra agregar, num único score de sessão, um candidato de base
  // testado JUNTO com o minor charm que o acompanha (ver inferLeechSetupJointBaseAndCharm).
  function goldObservationDamage(o, options) {
    const damage = +(o && o.damage) || 0;
    if (!(damage > 0)) return 0;
    if (o && o.bountyTalisman && !o.bountyDamageNormalized) return 0;
    return damage;
  }

  function goldObservationRate(o, channel, base, bonusMob, bonusRate, options) {
    let rate = base + ((bonusMob && o.mob === bonusMob) ? bonusRate : 0);
    if (channel === 'life' && o.bountyTalisman) {
      const lifeBonus = options && options.bountyLifeBonus;
      if (!(lifeBonus >= 0)) return 0;
      rate *= 1 + lifeBonus;
    }
    if (channel === 'mana'
      && o.exposeWeakness
      && options && options.exposeWeaknessManaPerk
      && options.context
      && options.context.sessionDateKey > 0
      && options.context.sessionDateKey < CUTOFF_KEY) {
      rate += PRE_CUTOFF_EXPOSE_WEAKNESS_MANA_LEECH_BONUS;
    }
    return rate;
  }

  // D-022a: o bônus de Mana Leech em hits com Expose Weakness vem de um perk OPCIONAL,
  // disponível apenas no regime pré-cutoff. Ele não é propriedade da data: existe em
  // sessões cujo personagem pegou o perk e não existe nas demais. Por isso a busca
  // conjunta testa as duas hipóteses e deixa o mesmo comparador de sempre decidir, do
  // mesmo jeito que já decide base e minor charm — sem limiar próprio.
  //
  // A hipótese neutra é "sem perk": leech observado pode ser truncado para baixo, nunca
  // para cima, então só "observado ACIMA do esperado pela base" é prova positiva do
  // bônus. Empate exato mantém o perk desligado.
  function exposeWeaknessManaPerkHypotheses(cfg, options) {
    if (!cfg || cfg.channel !== 'mana') return [false];
    const dateKey = options && options.context ? options.context.sessionDateKey : 0;
    if (!(dateKey > 0) || dateKey >= CUTOFF_KEY) return [false];
    return [false, true];
  }

  function scoreGoldBaseWithMobException(observations, channel, base, bonusMob, bonusRate, options) {
    let ok = 0, exact = 0, high = 0, low = 0;
    const turns = new Set(), mobs = new Set(), highMobs = new Set(), lowMobs = new Set(), examples = [], contradictions = [];
    for (const o of observations || []) {
      if (!o || o.channel !== channel || !(o.observed > 0) || !(o.damage > 0) || !(o.n >= 1)) continue;
      const damage = goldObservationDamage(o, options);
      const rate = goldObservationRate(o, channel, base, bonusMob, bonusRate, options);
      if (!(damage > 0) || !(rate > 0)) continue;
      const expected = expectedLeech(damage, rate, o.n);
      if (expected == null) continue;
      const delta = o.observed - expected;
      const tolerance = leechValueToleranceForN(o.n);
      turns.add(o.ts + ':' + (o.source || ''));
      if (o.mob) mobs.add(o.mob);
      if (Math.abs(delta) <= tolerance) {
        ok++;
        if (delta === 0) exact++;
        if (examples.length < 8) examples.push({ mob: o.mob, ts: o.ts, observed: o.observed, expected, n: o.n, damage, delta });
      } else if (delta > 0) {
        high++;
        if (o.mob) highMobs.add(o.mob);
        if (contradictions.length < 8) contradictions.push({ mob: o.mob, ts: o.ts, observed: o.observed, expected, n: o.n, damage, delta });
      } else {
        // capped-low: sempre consistente, nunca contradição (D-025/S-014e/C-006).
        low++;
        if (o.mob) lowMobs.add(o.mob);
      }
    }
    return {
      channel,
      base,
      coreBase: base,
      weaponCount: 0,
      weaponBonus: 0,
      ok,
      exact,
      high,
      low,
      highMobs: highMobs.size,
      lowMobs: lowMobs.size,
      observed: (observations || []).filter(o => o && o.channel === channel).length,
      independentTurns: turns.size,
      mobs: mobs.size,
      sourceCount: countOfficialLeechSources(base, channel),
      examples,
      contradictions,
      candidateMob: bonusMob || null,
      candidateBonus: bonusMob ? bonusRate : 0,
    };
  }


  // Mob elegível a minor charm (D-021) exige presença na tabela de mods do regime da
  // sessão (D-016) — cobre bosses, que nunca aparecem nessas tabelas (D-006, evidência
  // ausente). `bloodjaw` é excluído explicitamente mesmo estando na tabela pós-cutoff: é
  // uma entrada manual (armor calibrado contra o corpus), não vem do bestiary real.
  function isMobEligibleForMinorCharm(mob, context) {
    const name = normalizeName(mob);
    if (!name || name === 'bloodjaw') return false;
    return !!getMobMods(name, context);
  }

  const CHARM_DETECTOR_MIN_HITS = 20;
  const CHARM_DETECTOR_MIN_TURNS = 3;
  const CHARM_DETECTOR_MIN_DELTA = 0.0015;

  // Detector turn-local de mob candidato a minor charm (D-021): para cada turno já
  // resolvido sem depender de leech (turno-ouro) cujo componente atinge >=2 mobs
  // distintos, compara a razão leech/leechDamageBasis de cada mob contra a mediana dessa
  // razão nos DEMAIS mobs do MESMO turno/componente (leave-one-mob-out). Dentro do mesmo
  // turno/componente, N_leech e a taxa base do personagem são idênticos para todos os
  // hits por construção — a única coisa que pode fazer um mob destoar dos outros ali é um
  // bônus de mob (D-021) ou uma distorção de dano conhecida (Prey Bonus/`utevo grav san`,
  // por isso o uso de `leechDamageBasis`, não dano bruto — ver adendo de D-019/D-025/D-028
  // em docs/CLASSIFICATION_RULES.md). Isso é mais forte que a varredura de base cega a mob
  // da sessão inteira: não depende de acertar `N_leech`/base globalmente antes de comparar.
  // Retorna, por canal, a lista de mobs elegíveis cujo desvio agregado (mediana dos deltas
  // turno-a-turno) é consistente e positivo o bastante — a busca conjunta de base×charm
  // testa bônus D-021 restrita a essa lista, não mais a todo mob presente na sessão.
  function detectCharmCandidateMobsFromColocatedTurns(turns, context) {
    const perChannel = {
      life: { key: 'lifeLeech', deltas: new Map(), turnSets: new Map(), bonusEstimates: new Map() },
      mana: { key: 'manaLeech', deltas: new Map(), turnSets: new Map(), bonusEstimates: new Map() },
    };
    for (const turn of turns || []) {
      if (!turn || turn.status === 'unresolved') continue;
      for (const comp of turn.components || []) {
        if (!comp || comp.comp === 'unresolved') continue;
        // Enquanto o nível de dano Bounty ainda é unknown, a razão leech/dano
        // desse hit não é comparável aos demais mobs do componente.
        const hits = (comp.hits || []).filter(h => isMainHit(h) && !h.overkill && h.dmg > 0 && !h.bountyTalisman);
        if (new Set(hits.map(h => normalizeName(h.mob))).size < 2) continue;
        // D-023: a razão leech/dano de cada hit já vem diluída por areaFactor(N) do
        // componente. Guardar esse N permite converter o delta em bônus por observação
        // (`delta / areaFactor(N)`), com o N REAL de cada componente — um N fixo chega a
        // mover a estimativa de um degrau da grade de D-021 para o vizinho.
        const compMainHits = (comp.hits || []).filter(isMainHit).length;
        for (const channel of ['life', 'mana']) {
          const cfg = perChannel[channel];
          const byMob = new Map();
          for (const h of hits) {
            const leech = +h[cfg.key] || 0;
            if (!(leech > 0)) continue;
            const basis = leechDamageBasis(h, context);
            if (!(basis > 0)) continue;
            const mob = normalizeName(h.mob);
            if (!byMob.has(mob)) byMob.set(mob, []);
            byMob.get(mob).push(leech / basis);
          }
          if (byMob.size < 2) continue;
          for (const [mob, ratios] of byMob) {
            const others = [];
            for (const [otherMob, otherRatios] of byMob) if (otherMob !== mob) others.push(...otherRatios);
            if (!others.length) continue;
            const othersMedian = median(others);
            if (!cfg.deltas.has(mob)) { cfg.deltas.set(mob, []); cfg.turnSets.set(mob, new Set()); cfg.bonusEstimates.set(mob, []); }
            for (const ratio of ratios) cfg.deltas.get(mob).push(ratio - othersMedian);
            if (compMainHits >= 1) {
              const af = areaFactor(compMainHits);
              if (af > 0) for (const ratio of ratios) cfg.bonusEstimates.get(mob).push((ratio - othersMedian) / af);
            }
            cfg.turnSets.get(mob).add(comp);
          }
        }
      }
    }
    const out = { life: [], mana: [], bonusEstimates: { life: {}, mana: {} } };
    for (const channel of ['life', 'mana']) {
      const cfg = perChannel[channel];
      const candidates = [];
      for (const [mob, deltas] of cfg.deltas) {
        if (!isMobEligibleForMinorCharm(mob, context)) continue;
        if (deltas.length < CHARM_DETECTOR_MIN_HITS) continue;
        if (cfg.turnSets.get(mob).size < CHARM_DETECTOR_MIN_TURNS) continue;
        const delta = median(deltas);
        if (!(delta >= CHARM_DETECTOR_MIN_DELTA)) continue;
        candidates.push({ mob, delta, n: deltas.length });
        const estimates = cfg.bonusEstimates.get(mob) || [];
        if (estimates.length) out.bonusEstimates[channel][mob] = median(estimates);
      }
      candidates.sort((a, b) => b.delta - a.delta);
      out[channel] = candidates.map(c => c.mob);
    }
    return out;
  }

  // D-021/D-021a: um candidato aprovado no gate turn-local pode não ter NENHUMA
  // observação-ouro própria na sessão (turnos-ouro são muito mais escassos que
  // componentes co-localizados). Nesse caso a pontuação por observação é cega — todo
  // bônus da grade empata em zero — e o nível precisa vir do próprio delta turn-local,
  // que já é o canal normativo que provou o candidato.
  //
  // A guarda contra chute usa a própria grade, sem constante nova: a fronteira de decisão
  // entre dois valores vizinhos fica no meio deles, então só aceitamos a estimativa quando
  // ela está a no máximo METADE da distância até essa fronteira (|g1-g2|/4). Fora disso o
  // nível fica indeterminado e nenhum charm é fixado.
  function snapMinorCharmBonusToGrid(estimate, bonuses) {
    const grid = (bonuses || []).filter(b => b > 0).sort((a, b) => a - b);
    if (!grid.length || !(estimate > 0)) return { bonus: 0, reason: 'no_grid_or_estimate' };
    let nearest = grid[0];
    for (const g of grid) if (Math.abs(g - estimate) < Math.abs(nearest - estimate)) nearest = g;
    const others = grid.filter(g => g !== nearest);
    if (!others.length) return { bonus: nearest, reason: 'single_grid_value' };
    let second = others[0];
    for (const g of others) if (Math.abs(g - estimate) < Math.abs(second - estimate)) second = g;
    const tolerance = Math.abs(nearest - second) / 4;
    if (Math.abs(estimate - nearest) > tolerance) {
      return { bonus: 0, reason: 'turn_local_bonus_level_undetermined' };
    }
    return { bonus: nearest, reason: 'turn_local_delta' };
  }

  // Piso de evidência por canal: abaixo dele o vencedor do ranking não discrimina de
  // fato (C-006a/D-021a) e o canal abstém em vez de fixar nível. Extraído para constante
  // nomeada só para dar nome ao número que já estava aqui — o valor não mudou.
  const GOLD_CHANNEL_MIN_OK = 3;

  // Base do personagem (D-020) e minor charm por-mob (D-021) são inferidos JUNTOS: para
  // cada candidato de base, busca-se o melhor par (mob, bônus) que essa base sustenta, e o
  // candidato de base é avaliado pelo score da SESSÃO INTEIRA sob essa combinação — não
  // pela base sozinha. Isso evita o círculo fechado do pipeline sequencial antigo: um mob
  // com charm real que domina o volume de observações não pode mais poluir a base votada
  // pros demais mobs, porque a base nunca é escolhida sem já considerar o melhor charm que
  // a acompanha (ver adendo em C-006, docs/CLASSIFICATION_RULES.md). O(s) mob(s) testado(s)
  // como candidato a bônus por canal vêm do detector turn-local
  // (`detectCharmCandidateMobsFromColocatedTurns`), não de toda sessão cega a mob — isso
  // evita que a busca convirja num mob errado por coincidência de arredondamento quando
  // dois mobs têm volume de evidência parecido (ver docs/CLASSIFICATION_RULES.md, D-021).
  function rankGoldChannelCandidates(observations, cfg, charmCandidates, options) {
    const candidateMobs = (charmCandidates && charmCandidates[cfg.channel]) || [];
    const observedMobs = new Set(observations.filter(o => o.channel === cfg.channel && o.mob).map(o => o.mob));
    const mobs = candidateMobs.filter(m => observedMobs.has(m));
    // D-021a: candidato aprovado no gate turn-local que não possui observação-ouro própria
    // NÃO é descartado — a pontuação por observação não consegue vê-lo (todo bônus empata em
    // zero), então o nível vem do delta turn-local mais abaixo. Sem isto, um charm real
    // ficava invisível só porque a sessão produziu poucos turnos-ouro.
    const unobservedCandidates = candidateMobs.filter(m => !observedMobs.has(m));
    const rows = [];
    for (const perk of exposeWeaknessManaPerkHypotheses(cfg, options)) {
      const perkOptions = Object.assign({}, options, { exposeWeaknessManaPerk: perk });
      for (const B of cfg.bases) {
        let bestPick = null;
        for (const mob of mobs) {
          const scoped = observations.filter(o => o.channel === cfg.channel && o.mob === mob);
          const baseScore = scoreGoldBaseWithMobException(scoped, cfg.channel, B, null, 0, perkOptions);
          for (const bonus of cfg.bonuses || []) {
            if (!(bonus > 0)) continue;
            const score = scoreGoldBaseWithMobException(scoped, cfg.channel, B, mob, bonus, perkOptions);
            const candidate = {
              mob,
              bonus,
              baseOk: baseScore.ok,
              baseHigh: baseScore.high,
              baseLow: baseScore.low,
              improvement: score.ok - baseScore.ok,
              fixedHigh: Math.max(0, baseScore.high - score.high),
            };
            if (!bestPick
              || candidate.fixedHigh > bestPick.fixedHigh
              || (candidate.fixedHigh === bestPick.fixedHigh && candidate.improvement > bestPick.improvement)) {
              bestPick = candidate;
            }
          }
        }
        const aggregate = bestPick
          ? scoreGoldBaseWithMobException(observations, cfg.channel, B, bestPick.mob, bestPick.bonus, perkOptions)
          : scoreGoldBaseWithMobException(observations, cfg.channel, B, null, 0, perkOptions);
        aggregate.exposeWeaknessManaPerk = perk;
        rows.push(aggregate);
      }
    }
    // Empate exato entre as duas hipóteses de perk mantém a neutra (sem perk).
    rows.sort((a, b) => compareGoldBaseScores(a, b)
      || (Number(!!a.exposeWeaknessManaPerk) - Number(!!b.exposeWeaknessManaPerk)));
    const best = rows[0] || null;
    if (!best || best.ok < GOLD_CHANNEL_MIN_OK) {
      // C-006b: ABSTENÇÃO, não taxa zero. Abaixo do piso de evidência o canal não tem
      // nível determinável — vários pontos da grade de D-020 explicam as poucas
      // observações e só o desempate por exatidão os separa, que é exatamente a situação
      // em que D-021a/C-006a mandam NÃO fixar nível. O `base: 0` continua aqui porque é o
      // que faz todo consumidor a jusante pular o canal (`leechEffectiveRateCandidates`
      // descarta taxa <= 0, `expectedLeech` devolve null), mas ele deixa de ser a única
      // marca do fato: `baseKnown: false` + `abstention` dizem que o canal ABSTEVE, em vez
      // de afirmar que a taxa medida é zero.
      const tiedBases = best
        ? rows.filter(r => r.ok === best.ok).map(r => r.base).filter((v, i, a) => a.indexOf(v) === i)
        : [];
      return {
        channel: cfg.channel,
        base: 0,
        baseKnown: false,
        confidence: 'unknown',
        observed: best ? best.observed : 0,
        ranked: rows.slice(0, 8),
        contradictions: best ? best.high : 0,
        exposeWeaknessManaPerk: false,
        abstention: {
          reason: 'insufficient_gold_observations',
          usableObservations: best ? best.ok : 0,
          minUsableObservations: GOLD_CHANNEL_MIN_OK,
          collectedObservations: best ? best.observed : 0,
          bestBase: best ? best.base : null,
          bestExact: best ? best.exact : 0,
          tiedBases: tiedBases.length,
        },
      };
    }
    const strong = best.ok >= 30 && best.independentTurns >= 20;
    const result = Object.assign({}, best, {
      baseKnown: true,
      confidence: strong ? 'strong' : 'weak',
      ranked: rows.slice(0, 8),
      contradictions: best.high,
    });
    // Só entra aqui quando a pontuação por observação não elegeu charm neste canal. Um
    // candidato COM observação-ouro sempre tem precedência: ele foi medido contra a sessão,
    // e o delta turn-local é apenas estimativa agregada.
    if (!result.candidateMob && unobservedCandidates.length) {
      const estimates = (charmCandidates && charmCandidates.bonusEstimates
        && charmCandidates.bonusEstimates[cfg.channel]) || {};
      // Os candidatos vêm ordenados por delta decrescente pelo detector; o primeiro com
      // nível determinável vence. Ambiguidade não vira chute: fica registrada como motivo.
      for (const mob of unobservedCandidates) {
        const snapped = snapMinorCharmBonusToGrid(estimates[mob], cfg.bonuses);
        if (snapped.bonus > 0) {
          result.candidateMob = mob;
          result.candidateBonus = snapped.bonus;
          result.candidateSource = snapped.reason;
          result.candidateBonusEstimate = estimates[mob];
          break;
        }
        result.minorCharmAbsenceReason = snapped.reason;
        result.minorCharmAbsenceMob = mob;
        result.minorCharmAbsenceEstimate = estimates[mob];
      }
    }
    if (!result.candidateMob && !result.minorCharmAbsenceReason) {
      result.minorCharmAbsenceReason = candidateMobs.length
        ? 'no_charm_improved_gold_score'
        : 'no_turn_local_candidate';
    }
    return result;
  }

  function maxBountyLevelWithinBonus(maxBonus) {
    if (!(maxBonus >= bountyTalismanBonusForLevel(0))) return null;
    if (maxBonus < bountyTalismanBonusForLevel(15)) {
      return Math.max(0, Math.floor((maxBonus - 0.025 + 1e-12) / 0.005));
    }
    return 15 + Math.max(0, Math.floor((maxBonus - 0.1 + 1e-12) / 0.0025));
  }

  function minBountyLevelAtBonus(minBonus) {
    if (!(minBonus > bountyTalismanBonusForLevel(0))) return 0;
    if (minBonus <= bountyTalismanBonusForLevel(15)) {
      return Math.min(15, Math.max(0, Math.ceil((minBonus - 0.025 - 1e-12) / 0.005)));
    }
    return 15 + Math.max(0, Math.ceil((minBonus - 0.1 - 1e-12) / 0.0025));
  }

  function addBountyLevelsInBonusInterval(target, minBonus, maxBonus) {
    const first = minBountyLevelAtBonus(Math.max(0.025, minBonus));
    const last = maxBountyLevelWithinBonus(maxBonus);
    if (last == null || last < first) return;
    for (let level = first; level <= last; level++) target.add(level);
  }

  function bountyLifeLevelCandidates(observations, baselineLife) {
    const relevant = observations.filter(o => o.channel === 'life'
      && o.bountyTalisman && !o.isPrey
      && o.observed > 0 && o.damage > 0 && o.n >= 1);
    const baselineBase = baselineLife && baselineLife.confidence !== 'unknown'
      ? baselineLife.base
      : 0;
    const positiveRates = Array.from(new Set(VAMPIRIC_BONUSES
      .map(minor => Math.round((baselineBase + minor) * 1e6) / 1e6)
      .filter(rate => rate > 0)));
    if (!relevant.length || !positiveRates.length) return [];
    const levels = new Set();
    for (const o of relevant) {
      const damage = goldObservationDamage(o);
      const tolerance = leechValueToleranceForN(o.n);
      const lowExpected = Math.max(1, o.observed - tolerance);
      const highExpected = o.observed + tolerance;
      for (const rate of positiveRates) {
        const scale = damage * rate * areaFactor(o.n);
        if (!(scale > 0)) continue;
        const minMultiplier = lowExpected > 1 ? (lowExpected - 1) / scale : 0;
        const maxMultiplier = highExpected / scale;
        addBountyLevelsInBonusInterval(
          levels,
          Math.max(0.025, minMultiplier - 1 + 1e-12),
          maxMultiplier - 1,
        );
      }
    }
    return Array.from(levels).sort((a, b) => a - b);
  }

  function compareBountyCandidateEvidence(a, b) {
    const sa = a.channel, sb = b.channel;
    if (sa.high !== sb.high) return sa.high - sb.high;
    if (sa.ok !== sb.ok) return sb.ok - sa.ok;
    if (sa.exact !== sb.exact) return sb.exact - sa.exact;
    if (sa.independentTurns !== sb.independentTurns) return sb.independentTurns - sa.independentTurns;
    if (sa.mobs !== sb.mobs) return sb.mobs - sa.mobs;
    if (sa.highMobs !== sb.highMobs) return sa.highMobs - sb.highMobs;
    return 0;
  }

  // D-010g/C-006: fallback estritamente posterior ao witness de charm. As
  // fronteiras, a ação e N já vêm congelados de uma passada que não usa este
  // candidato; cada nível apenas reverte o dano dos mesmos hits.
  function inferBountyDamageFromFrozenComponents(turns, context) {
    const components = [];
    let maxObservedMultiplier = 0;
    for (const turn of turns || []) {
      if (!turn || turn.status !== 'resolved' || turn.partialEdge) continue;
      for (const comp of turn.components || []) {
        const action = comp && comp.action;
        const profile = action && action.profile || {};
        const element = profile.element;
        const deterministic = comp && comp.deterministic || {};
        const main = (comp && comp.hits || []).filter(hit =>
          isMainHit(hit) && !hit.virtual && !hit.overkill
          && !hit.isPrey && !hit.elementalAmplification
        );
        if (!action || !element || element === 'unknown' || element === 'physical') continue;
        if (isTerraBurstAction(action) || isChainedPenanceAction(action)) continue;
        if (!deterministic.ok || deterministic.unknown > 0) continue;
        const marked = main.filter(hit => hit.bountyTalisman);
        const control = main.filter(hit => !hit.bountyTalisman);
        if (!marked.length || !control.length) continue;
        const maxMarked = Math.max(...marked.map(hit => hit.dmg));
        const minControl = Math.min(...control.map(hit => hit.dmg));
        if (!(minControl > 0)) continue;
        maxObservedMultiplier = Math.max(
          maxObservedMultiplier,
          (maxMarked + 1) / minControl,
        );
        components.push({
          turn: turn.clock || turn.ts,
          comp,
          main,
          element,
          action: profile.label || action.text || action.name || comp.comp,
        });
      }
    }
    if (!components.length || !(maxObservedMultiplier > 1)) {
      return unknownBountyTalismanAxis('no_frozen_deterministic_bounty_component');
    }
    const levels = bountyTalismanLevelsWithinBonus(maxObservedMultiplier - 1);
    const previous = context && context.bountyTalismanSetup;
    const ranked = [];
    try {
      for (const level of levels) {
        const bonus = bountyTalismanBonusForLevel(level);
        if (context) {
          context.bountyTalismanSetup = {
            damage: {
              level,
              bonus,
              multiplier: 1 + bonus,
              confidence: 'weak',
              source: 'frozen_component_candidate',
            },
            life: previous && previous.life
              || unknownBountyTalismanAxis('frozen_component_candidate'),
          };
          if (context._revCache) context._revCache.clear();
        }
        const row = {
          level,
          bonus,
          multiplier: 1 + bonus,
          fits: 0,
          contradictions: 0,
          examples: [],
        };
        for (const evidence of components) {
          const candidates = evidence.main.map(hit =>
            elementalOriginalCandidates(hit, evidence.element, context)
          );
          if (candidates.some(result =>
            !result || !result.known || !result.originals || !result.originals.length
          )) continue;
          let common = new Set(candidates[0].originals);
          for (const result of candidates.slice(1)) {
            common = new Set(result.originals.filter(original => common.has(original)));
          }
          if (common.size) row.fits++;
          else row.contradictions++;
          if (row.examples.length < 8) {
            row.examples.push({
              turn: evidence.turn,
              action: evidence.action,
              markedDamage: evidence.main.filter(hit => hit.bountyTalisman).map(hit => hit.dmg),
              controlDamage: evidence.main.filter(hit => !hit.bountyTalisman).map(hit => hit.dmg),
              commonOriginals: Array.from(common).slice(0, 12),
            });
          }
        }
        ranked.push(row);
      }
    } finally {
      if (context) {
        context.bountyTalismanSetup = previous;
        if (context._revCache) context._revCache.clear();
      }
    }
    ranked.sort((a, b) =>
      a.contradictions - b.contradictions || b.fits - a.fits || a.level - b.level
    );
    const best = ranked[0] || null;
    const tied = best
      ? ranked.filter(candidate =>
        candidate.contradictions === best.contradictions
        && candidate.fits === best.fits
      )
      : [];
    if (!best || best.fits === 0 || tied.length !== 1) {
      return Object.assign(
        unknownBountyTalismanAxis('frozen_component_bounty_tie_or_insufficient_evidence'),
        {
          evidenceCount: components.length,
          contradictions: best ? best.contradictions : 0,
          ranked: ranked.slice(0, 12),
        },
      );
    }
    return {
      level: best.level,
      bonus: best.bonus,
      multiplier: best.multiplier,
      confidence: 'strong',
      source: 'frozen_deterministic_component_original',
      evidenceCount: best.fits,
      contradictions: best.contradictions,
      examples: best.examples,
      ranked: ranked.slice(0, 12),
    };
  }

  function inferBountyLifeAxis(levels, observations, cfg, charmCandidates, context) {
    const ranked = levels.map(level => {
      const bonus = bountyTalismanBonusForLevel(level);
      const options = { bountyLifeBonus: bonus, context };
      const channel = rankGoldChannelCandidates(
        observations,
        cfg,
        charmCandidates,
        options,
      );
      return {
        level,
        bonus,
        multiplier: 1 + bonus,
        channel,
      };
    }).sort((a, b) => compareBountyCandidateEvidence(a, b) || a.level - b.level);
    const channelBest = ranked[0] || null;
    const contenders = channelBest
      ? ranked.filter(candidate => compareBountyCandidateEvidence(channelBest, candidate) === 0)
      : [];
    const best = contenders[0] || channelBest;
    const tied = best
      ? contenders.filter(candidate => compareBountyCandidateEvidence(best, candidate) === 0)
      : [];
    if (!best || best.channel.ok < 3 || tied.length !== 1) {
      return Object.assign(unknownBountyTalismanAxis(
        !levels.length ? 'no_finite_bounty_candidate_interval' : 'bounty_candidate_tie_or_insufficient_evidence',
      ), {
        evidenceCount: observations.filter(o => o.channel === cfg.channel && o.bountyTalisman && !o.isPrey).length,
        contradictions: best ? best.channel.high : 0,
        ranked: ranked.slice(0, 8).map(candidate => ({
          level: candidate.level,
          bonus: candidate.bonus,
          ok: candidate.channel.ok,
          exact: candidate.channel.exact,
          contradictions: candidate.channel.high,
          base: candidate.channel.base,
          candidateMob: candidate.channel.candidateMob || null,
          candidateBonus: candidate.channel.candidateBonus || 0,
        })),
      });
    }
    return {
      level: best.level,
      bonus: best.bonus,
      multiplier: best.multiplier,
      confidence: best.channel.confidence,
      source: 'gold_life_known_n_official_grid',
      evidenceCount: observations.filter(o => o.channel === cfg.channel && o.bountyTalisman && !o.isPrey).length,
      contradictions: best.channel.high,
      channel: best.channel,
      ranked: ranked.slice(0, 8).map(candidate => ({
        level: candidate.level,
        bonus: candidate.bonus,
        ok: candidate.channel.ok,
        exact: candidate.channel.exact,
        contradictions: candidate.channel.high,
        base: candidate.channel.base,
        candidateMob: candidate.channel.candidateMob || null,
        candidateBonus: candidate.channel.candidateBonus || 0,
      })),
    };
  }

  function inferLeechSetupJointBaseAndCharm(goldObservations, charmCandidates, context) {
    const observations = goldObservations || [];
    const minorResult = {};
    const lifeCfg = { channel: 'life', bases: LIFE_BASE_CANDIDATES, bonuses: VAMPIRIC_BONUSES, mobKey: 'vampiricMob', bonusKey: 'vampiricBonus', votesKey: 'vampiricVotes' };
    const manaCfg = { channel: 'mana', bases: MANA_BASE_CANDIDATES, bonuses: VOIDS_BONUSES, mobKey: 'voidsMob', bonusKey: 'voidsBonus', votesKey: 'voidsVotes' };
    const damageAxis = context && context.bountyTalismanSetup
      && context.bountyTalismanSetup.damage
      || unknownBountyTalismanAxis('bounty_damage_axis_not_inferred_before_leech');
    const damageKnown = damageAxis.confidence !== 'unknown';
    const mana = rankGoldChannelCandidates(
      damageKnown ? observations : observations.filter(o => !o.bountyTalisman),
      manaCfg,
      charmCandidates,
      { context },
    );
    const lifeBaseline = rankGoldChannelCandidates(
      observations.filter(o => !o.bountyTalisman),
      lifeCfg,
      charmCandidates,
    );
    const lifeAxis = damageKnown
      ? inferBountyLifeAxis(
        bountyLifeLevelCandidates(observations, lifeBaseline),
        observations,
        lifeCfg,
        charmCandidates,
        context,
      )
      : unknownBountyTalismanAxis('bounty_damage_axis_unknown');
    const life = lifeAxis.confidence !== 'unknown'
      ? lifeAxis.channel
      : lifeBaseline;
    const out = { life, mana };
    for (const cfg of [lifeCfg, manaCfg]) {
      const best = out[cfg.channel];
      if (best && best.candidateMob) {
        minorResult[cfg.mobKey] = best.candidateMob;
        minorResult[cfg.bonusKey] = best.candidateBonus;
        minorResult[cfg.votesKey] = best.ok;
        if (best.candidateSource) minorResult[cfg.channel + 'CharmSource'] = best.candidateSource;
      } else if (best && best.minorCharmAbsenceReason) {
        // Ausência de charm com motivo: distingue "não houve candidato aprovado no gate"
        // de "candidato aprovado, mas sem evidência para fixar o nível". Sem isso, os dois
        // casos ficam indistinguíveis no setup e a próxima investigação repete a confusão.
        minorResult[cfg.channel + 'CharmAbsenceReason'] = best.minorCharmAbsenceReason;
        if (best.minorCharmAbsenceMob) minorResult[cfg.channel + 'CharmAbsenceMob'] = best.minorCharmAbsenceMob;
      }
    }
    if (minorResult.vampiricMob && minorResult.voidsMob && normalizeName(minorResult.vampiricMob) === normalizeName(minorResult.voidsMob)) {
      // D-021: um mob nunca tem os dois bônus ao mesmo tempo; mantém só o canal com mais
      // correspondência (ok) confirmada.
      const lv = (out.life && out.life.ok) || 0;
      const mv = (out.mana && out.mana.ok) || 0;
      if (lv >= mv) {
        delete minorResult.voidsMob; delete minorResult.voidsBonus; delete minorResult.voidsVotes;
      } else {
        delete minorResult.vampiricMob; delete minorResult.vampiricBonus; delete minorResult.vampiricVotes;
      }
      minorResult.minorExclusivityCorrected = true;
    }
    return {
      lifeBase: out.life && out.life.base || 0,
      manaBase: out.mana && out.mana.base || 0,
      // C-006b: a taxa e o CONHECIMENTO da taxa são coisas diferentes. Um canal que
      // abstém devolve `base 0` para desligar-se a jusante, e `baseKnown: false` para
      // que ninguém leia esse zero como "medi e não há leech neste canal".
      lifeBaseKnown: !!(out.life && out.life.baseKnown),
      manaBaseKnown: !!(out.mana && out.mana.baseKnown),
      lifeBaseAbstention: (out.life && out.life.abstention) || null,
      manaBaseAbstention: (out.mana && out.mana.abstention) || null,
      exposeWeaknessManaPerk: !!(out.mana && out.mana.exposeWeaknessManaPerk),
      life: out.life,
      mana: out.mana,
      minor: minorResult,
      bountyTalismanSetup: {
        damage: Object.assign({}, damageAxis),
        life: Object.assign({}, lifeAxis, { channel: undefined }),
      },
    };
  }

  function inferLeechSetupFromGoldObservations(goldObservations, context, charmCandidates, turns) {
    const observations = goldObservations || [];
    const joint = inferLeechSetupJointBaseAndCharm(observations, charmCandidates, context, turns);
    const channelConf = [joint.life && joint.life.confidence, joint.mana && joint.mana.confidence];
    const confidence = channelConf.includes('strong') ? 'strong' : (channelConf.includes('weak') ? 'weak' : 'unknown');
    if (confidence === 'unknown') {
      const diagnostic = inferLeechSetupFallback(context && context.serverFacts ? context.serverFacts.hits : [], context);
      return Object.assign(unknownLeechSetup('gold_observations_insufficient'), {
        evidenceCount: observations.length,
        diagnosticOnly: false,
        multiNDiagnostic: diagnostic,
        lifeBaseAbstention: joint.lifeBaseAbstention,
        manaBaseAbstention: joint.manaBaseAbstention,
        lifeVote: joint.life,
        manaVote: joint.mana,
        bountyTalismanSetup: joint.bountyTalismanSetup,
      });
    }
    const setup = {
      lifeBase: joint.lifeBase,
      manaBase: joint.manaBase,
      lifeBaseKnown: joint.lifeBaseKnown,
      manaBaseKnown: joint.manaBaseKnown,
      lifeBaseAbstention: joint.lifeBaseAbstention,
      manaBaseAbstention: joint.manaBaseAbstention,
      exposeWeaknessManaPerk: joint.exposeWeaknessManaPerk === true,
      confidence,
      inferred: true,
      source: 'gold_observations_known_n_joint',
      evidenceCount: observations.length,
      contradictions: ((joint.life && joint.life.high) || 0) + ((joint.mana && joint.mana.high) || 0),
      lifeVote: joint.life,
      manaVote: joint.mana,
      bountyTalismanSetup: joint.bountyTalismanSetup,
      bountyTalismanLifeBonus: joint.bountyTalismanSetup.life.bonus,
      bountyTalismanLifeConfidence: joint.bountyTalismanSetup.life.confidence,
    };
    Object.assign(setup, joint.minor);
    return setup;
  }

  // ---------------------------------------------------------------------------
  // S-007a-elem / D-016a: eixo do bloco de AA inferido POR SESSAO.
  //
  // O update do regime pos-cutoff introduziu municao de AREA ELEMENTAL pra Royal
  // Paladin. Ate entao todo AA de RP era fisico e S-007 cravava o eixo. A municao
  // e escolha de equipamento: muda entre sessoes, nunca dentro de uma -- por isso a
  // inferencia e por sessao, como o perk BM e o setup de leech.
  //
  // Criterio (usuario, 22/Jul/2026): usar so turnos em que uma spell HOLY DE AREA do
  // dono separa a spell do AA; procurar um corte contiguo AA->spell em que o sufixo
  // feche como holy e o prefixo feche como o eixo testado; vence quem fechar mais
  // turnos. Fisico e o PADRAO e o FALLBACK: empate com fisico e ausencia de evidencia
  // resolvem em fisico, POR REGRA -- nunca pela ordem de iteracao dos candidatos.
  const AA_ELEMENT_CANDIDATES = ['physical', 'energy', 'ice', 'fire', 'earth'];
  // `holy` fica fora por ser CIRCULAR (e o eixo da propria spell de referencia);
  // `death` fica fora porque nao existe municao de area desse elemento.
  const AA_REFERENCE_HOLY_AREA = new Set(['exevo mas san', 'exori dir san']);
  // Ethereal Barrage e spell FISICA: nao separa do AA fisico e enviesaria a contagem.
  const AA_EXCLUDED_PHYSICAL_SPELL = new Set(['exori dir moe']);
  // Granada e holy e tem instante de explosao incerto (M-023): indistinguivel da spell.
  const AA_GRENADE_INCANTATION = new Set(['exevo tempo mas san']);
  const AA_GRENADE_SHADOW_MIN = 1;
  const AA_GRENADE_SHADOW_MAX = 5;
  const AA_TURN_WINDOW_BEFORE = 1;
  const AA_TURN_WINDOW_AFTER = 2;

  function aaOriginalsSet(hit, element, context) {
    if (element === 'physical') {
      const r = physicalOriginalInterval(hit, context);
      if (!r || !r.known || !r.interval) return null;
      const out = new Set();
      for (let v = r.interval[0]; v <= r.interval[1]; v++) out.add(v);
      return out;
    }
    const r = elementalOriginalCandidates(hit, element, context);
    if (!r || !r.known || !r.originals || !r.originals.length) return null;
    return new Set(r.originals);
  }

  // Um bloco "fecha" quando os hits nao-overkill tem interseccao de originais nao
  // vazia sob aquele eixo (S-004). Overkill nao participa de interseccao (D-011).
  function aaBlockCloses(hits, element, context) {
    let inter = null;
    for (const h of hits) {
      if (h.overkill) continue;
      const set = aaOriginalsSet(h, element, context);
      if (!set) return false;
      if (inter === null) inter = set;
      else {
        const next = new Set();
        for (const v of inter) if (set.has(v)) next.add(v);
        inter = next;
      }
      if (!inter.size) return false;
    }
    return !!(inter && inter.size);
  }

  function inferAaElementForSession(turns, localFacts, context) {
    const counts = {};
    for (const e of AA_ELEMENT_CANDIDATES) counts[e] = 0;
    if (!context || context.vocation !== 'paladin') {
      return { element: 'physical', source: 'not_paladin', counts, eligible: 0 };
    }
    // Casts de granada tem `type: 'grenade'`, nao 'attack'. Filtrar por 'attack' aqui
    // tornaria a exclusao de granada INERTE (medido: 0 turnos excluidos em vez de 86).
    const casts = ((localFacts && localFacts.playerCasts) || [])
      .filter(c => c && c.profile && (c.type === 'attack' || c.type === 'grenade'));

    let eligible = 0;
    for (const turn of (turns || [])) {
      const hits = (turn.hits || []).filter(isMainHit);
      if (hits.length < 2) continue;
      let hasHolyArea = false, blocked = false;
      for (const c of casts) {
        const inc = c.profile.incantation;
        const inWindow = c.ts >= turn.ts - AA_TURN_WINDOW_BEFORE && c.ts <= turn.ts + AA_TURN_WINDOW_AFTER;
        if (inWindow && AA_REFERENCE_HOLY_AREA.has(inc)) hasHolyArea = true;
        if (inWindow && AA_EXCLUDED_PHYSICAL_SPELL.has(inc)) blocked = true;
        if (AA_GRENADE_INCANTATION.has(inc)
          && (inWindow || (turn.ts >= c.ts + AA_GRENADE_SHADOW_MIN && turn.ts <= c.ts + AA_GRENADE_SHADOW_MAX))) blocked = true;
        if (blocked) break;
      }
      if (blocked || !hasHolyArea) continue;
      eligible++;
      // O sufixo holy nao depende do eixo testado: calcula uma vez por corte.
      const holySuffixOk = [];
      for (let k = 1; k < hits.length; k++) holySuffixOk[k] = aaBlockCloses(hits.slice(k), 'holy', context);
      for (const el of AA_ELEMENT_CANDIDATES) {
        for (let k = 1; k < hits.length; k++) {
          if (holySuffixOk[k] && aaBlockCloses(hits.slice(0, k), el, context)) { counts[el]++; break; }
        }
      }
    }

    const ranked = AA_ELEMENT_CANDIDATES.map(e => [e, counts[e]]).sort((a, b) => b[1] - a[1]);
    const best = ranked[0][1];
    if (!best) return { element: 'physical', source: 'no_evidence', counts, eligible };
    const winners = ranked.filter(r => r[1] === best).map(r => r[0]);
    if (winners.length > 1) {
      // Empate = eixos indistinguiveis nessa sessao, entao a escolha nao muda a
      // classificacao. Preferir fisico mantem a mudanca neutra em sessao legada.
      if (winners.indexOf('physical') !== -1) return { element: 'physical', source: 'tie_prefers_physical', counts, eligible };
      return { element: winners[0], source: 'tie_any', counts, eligible };
    }
    return { element: winners[0], source: 'evidence', counts, eligible };
  }

  function inferLeechSetupFallback(hits, context) {
    const usable = (hits || []).filter(h => isMainHit(h) && !h.overkill && h.dmg > 0);
    const lifeRatios = usable.filter(h => h.lifeLeech > 0).map(h => h.lifeLeech / h.dmg);
    const manaRatios = usable.filter(h => h.manaLeech > 0).map(h => h.manaLeech / h.dmg);
    const lifeGuess = percentile(lifeRatios, 0.90);
    const manaGuess = percentile(manaRatios, 0.90);

    // V9: inferência multi-N. O ratio bruto leech/dano só é igual ao leech real
    // quando N_leech=1. Em RP/Barrage a maior parte dos hits é área, então o ratio
    // bruto vem reduzido por areaFactor(N) e subestima o setup. Aqui cada hit vota
    // nos setups oficiais testando N=1..20 antes de escolher a base.
    const lifeVote = inferLeechBaseMultiN(usable, 'life', LIFE_BASE_CANDIDATES, VAMPIRIC_BONUSES, context);
    const manaVote = inferLeechBaseMultiN(usable, 'mana', MANA_BASE_CANDIDATES, VOIDS_BONUSES, context);
    return {
      lifeBase: 0,
      manaBase: 0,
      // C-006b: voto multi-N é diagnóstico; nenhum canal fixa nível aqui.
      lifeBaseKnown: false,
      manaBaseKnown: false,
      confidence: 'unknown',
      diagnosticOnly: true,
      inferred: false,
      source: 'multi_n_vote_diagnostic_only',
      lifeGuess,
      manaGuess,
      lifeVote,
      manaVote,
      possibleBases: {
        life: lifeVote.ranked || [],
        mana: manaVote.ranked || [],
      },
    };
  }

  function collectTrustedLeechObservationsFromRuneUses(serverFacts, context) {
    const out = { life: [], mana: [], components: [] };
    if (!serverFacts || !serverFacts.hits || !serverFacts.runeUses) return out;
    const turns = buildTurns(serverFacts.hits);
    for (const turn of turns || []) {
      if (!turn || turn.partialEdge) continue;
      const tHits = (turn.hits || []).filter(isMainHit).slice().sort((a, b) => (a.seq - b.seq) || (a.ts - b.ts));
      if (!tHits.length) continue;
      const firstTs = Math.min.apply(null, tHits.map(h => h.ts));
      const lastTs = Math.max.apply(null, tHits.map(h => h.ts));
      const runes = (serverFacts.runeUses || []).filter(r => r && r.profile && !r.ignored && r.ts >= firstTs - 1 && r.ts <= lastTs + 1);
      // Se houver duas tentativas no mesmo turno, a fronteira fica ambígua para inferência global.
      if (runes.length !== 1) continue;
      const ru = runes[0];
      if (!ru.profile || ru.profile.topology === 'unknown') continue;
      const after = tHits.filter(h => h.seq > ru.seq && h.ts >= ru.ts && h.ts <= lastTs);
      if (!after.length) continue;
      if (ru.profile.topology === 'area' && after.length < 2) continue;
      if (ru.profile.topology === 'single' && after.length !== 1) continue;
      const n = after.length;
      const compInfo = { clock: turn.clock, rune: ru.name, runeLabel: ru.profile.label, n, ts: ru.ts, hitSeqs: after.map(h => h.seq) };
      out.components.push(compInfo);
      for (const h of after) {
        if (!h || h.overkill || !(h.dmg > 0)) continue;
        const basis = leechDamageBasis(h, context);
        if (!(basis > 0)) continue;
        const rowBase = { mob: normalizeName(h.mob), dmg: h.dmg, dmgBasis: basis, n, ts: h.ts, clock: h.clock, seq: h.seq, turnClock: turn.clock, rune: ru.name };
        if ((+h.lifeLeech || 0) > 0) out.life.push(Object.assign({}, rowBase, { observed: +h.lifeLeech, channel: 'life' }));
        if ((+h.manaLeech || 0) > 0) out.mana.push(Object.assign({}, rowBase, { observed: +h.manaLeech, channel: 'mana' }));
      }
    }
    return out;
  }

  function isTrustedLeechVoteCredible(vote) {
    if (!vote || !(vote.observed >= 20) || !(vote.base > 0)) return false;
    if (!vote.best) return false;
    // Contradições para cima são fortes; bases com muitos highs não devem substituir o fallback.
    const maxHigh = Math.max(2, Math.floor(vote.observed * 0.01));
    const minOk = Math.max(10, Math.ceil(vote.observed * 0.25));
    return vote.high <= maxHigh && vote.ok >= minOk;
  }

  function buildEmpiricalLeechBaseCandidates(channel, observations, officialCandidates) {
    const out = new Set((officialCandidates || []).map(x => Math.round((+x || 0) * 1e6) / 1e6).filter(x => x > 0));
    // Grade discreta de 0,25 p.p. Não é percentual livre contínuo; ela permite que
    // o log revele setups ausentes na lista oficial inicial, como 17,25% de mana.
    const max = channel === 'life' ? 0.60 : 0.35;
    for (let v = 0.0025; v <= max + 1e-9; v += 0.0025) out.add(Math.round(v * 1e6) / 1e6);

    // Também adiciona candidatos derivados dos intervalos inversos observados,
    // arredondados à mesma grade, para melhorar score/diagnóstico sem hardcode.
    const minorBonuses = channel === 'life' ? VAMPIRIC_BONUSES : VOIDS_BONUSES;
    for (const o of observations || []) {
      if (!(o.observed > 0) || !(o.dmgBasis > 0) || !(o.n >= 1)) continue;
      const f = areaFactor(o.n);
      const mid = (Math.max(0, o.observed - 0.5)) / (o.dmgBasis * f);
      for (const bonus of minorBonuses || [0]) {
        const b = Math.max(0, mid - (+bonus || 0));
        const snapped = Math.round(b / 0.0025) * 0.0025;
        if (snapped > 0 && snapped <= max) out.add(Math.round(snapped * 1e6) / 1e6);
      }
    }
    return Array.from(out).sort((a, b) => a - b);
  }

  function inferTrustedLeechChannel(observations, channel, officialBases, minorBonuses, context) {
    const obs = (observations || []).filter(o => o && o.observed > 0 && o.dmgBasis > 0 && o.n >= 1);
    if (!obs.length) return { channel, base: 0, observed: 0, source: 'no_trusted_observations' };
    const mobs = Array.from(new Set(obs.map(o => normalizeName(o.mob)).filter(Boolean))).sort();
    const bases = buildEmpiricalLeechBaseCandidates(channel, obs, officialBases);
    const rows = [];
    for (const base of bases) {
      rows.push(scoreTrustedLeechSetup(obs, channel, base, null, 0));
      for (const mob of mobs) {
        for (const bonus of minorBonuses || [0]) {
          if (!(bonus > 0)) continue;
          rows.push(scoreTrustedLeechSetup(obs, channel, base, mob, bonus));
        }
      }
    }
    rows.sort(compareTrustedLeechScores);
    const best = rows[0] || null;
    if (!best) return { channel, base: 0, observed: obs.length, source: 'no_ranked_candidates' };
    const ranked = rows.slice(0, 12);
    return Object.assign({}, best, {
      channel,
      observed: obs.length,
      source: 'trusted_rune_component_inverse_leech_grid',
      best,
      ranked,
      examples: best.examples || [],
      observationsSample: obs.slice(0, 8),
    });
  }

  function compareTrustedLeechScores(a, b) {
    // Primeiro elimina contradição para cima; depois maximiza confirmações. Leech
    // baixo é cap/neutral, então é menos grave que high, mas desempata contra setups
    // que explicam menos do log.
    if (a.high !== b.high) return a.high - b.high;
    if (a.ok !== b.ok) return b.ok - a.ok;
    if (a.low !== b.low) return a.low - b.low;
    if (a.exact !== b.exact) return b.exact - a.exact;
    const aMinor = a.minorMob ? 1 : 0, bMinor = b.minorMob ? 1 : 0;
    if (aMinor !== bMinor) return bMinor - aMinor;
    if ((a.minorBonus || 0) !== (b.minorBonus || 0)) return (b.minorBonus || 0) - (a.minorBonus || 0);
    return b.base - a.base;
  }

  function scoreTrustedLeechSetup(obs, channel, base, minorMob, minorBonus) {
    let ok = 0, exact = 0, low = 0, high = 0;
    const examples = [];
    const byMob = {};
    for (const o of obs || []) {
      const mob = normalizeName(o.mob);
      const rate = (+base || 0) + (minorMob && mob === normalizeName(minorMob) ? (+minorBonus || 0) : 0);
      if (!(rate > 0)) continue;
      const expected = expectedLeech(o.dmgBasis, rate, o.n);
      if (expected == null) continue;
      const tolerance = leechValueToleranceForN(o.n);
      const delta = o.observed - expected;
      let verdict;
      if (Math.abs(delta) <= tolerance) { ok++; verdict = 'ok'; if (delta === 0) exact++; }
      else if (delta < 0) { low++; verdict = 'low_neutral'; }
      else { high++; verdict = 'high_contradiction'; }
      const bm = byMob[mob] || (byMob[mob] = { ok: 0, exact: 0, low: 0, high: 0, observed: 0 });
      bm.observed++;
      if (verdict === 'ok') bm.ok++;
      else if (verdict === 'low_neutral') bm.low++;
      else if (verdict === 'high_contradiction') bm.high++;
      if (delta === 0) bm.exact++;
      if (examples.length < 8 && (verdict === 'ok' || verdict === 'high_contradiction')) {
        examples.push({ turnClock: o.turnClock, clock: o.clock, mob, dmg: o.dmg, dmgBasis: o.dmgBasis, n: o.n, observed: o.observed, expected, delta, verdict, rate });
      }
    }
    return {
      channel,
      base: Math.round((+base || 0) * 1e6) / 1e6,
      minorMob: minorMob ? normalizeName(minorMob) : null,
      minorBonus: +minorBonus || 0,
      ok,
      exact,
      low,
      high,
      observed: (obs || []).length,
      coverage: obs && obs.length ? ok / obs.length : 0,
      byMob,
      examples,
    };
  }

  function applyExclusiveTrustedMinorLeechCharms(setup, lifeRobust, manaRobust, fallback) {
    // Começa limpo para evitar carregar minors do fallback quando a inferência
    // confiável escolheu outro mob/canal.
    delete setup.vampiricMob; delete setup.vampiricBonus; delete setup.vampiricVotes;
    delete setup.voidsMob; delete setup.voidsBonus; delete setup.voidsVotes;

    const lifeRanked = [{ minorMob: null, minorBonus: 0, ok: 0, high: 0, low: 0, observed: 0 }].concat(lifeRobust && lifeRobust.ranked ? lifeRobust.ranked : []);
    const manaRanked = [{ minorMob: null, minorBonus: 0, ok: 0, high: 0, low: 0, observed: 0 }].concat(manaRobust && manaRobust.ranked ? manaRobust.ranked : []);
    let best = null;
    for (const l of lifeRanked) {
      for (const m of manaRanked) {
        const lMob = l && l.minorMob ? normalizeName(l.minorMob) : null;
        const mMob = m && m.minorMob ? normalizeName(m.minorMob) : null;
        if (lMob && mMob && lMob === mMob) continue;
        const high = ((l && l.high) || 0) + ((m && m.high) || 0);
        const ok = ((l && l.ok) || 0) + ((m && m.ok) || 0);
        const low = ((l && l.low) || 0) + ((m && m.low) || 0);
        const exact = ((l && l.exact) || 0) + ((m && m.exact) || 0);
        const nonNull = (lMob ? 1 : 0) + (mMob ? 1 : 0);
        const cand = { life: l, mana: m, high, ok, low, exact, nonNull };
        if (!best || high < best.high ||
            (high === best.high && ok > best.ok) ||
            (high === best.high && ok === best.ok && low < best.low) ||
            (high === best.high && ok === best.ok && low === best.low && exact > best.exact) ||
            (high === best.high && ok === best.ok && low === best.low && exact === best.exact && nonNull > best.nonNull)) {
          best = cand;
        }
      }
    }
    setup.minorCharmDecision = Object.assign({}, setup.minorCharmDecision || {}, { trustedSelected: best });
    if (best && best.life && best.life.minorMob && best.life.minorBonus > 0) {
      setup.vampiricMob = best.life.minorMob;
      setup.vampiricBonus = best.life.minorBonus;
      setup.vampiricVotes = best.life.ok;
    }
    if (best && best.mana && best.mana.minorMob && best.mana.minorBonus > 0) {
      setup.voidsMob = best.mana.minorMob;
      setup.voidsBonus = best.mana.minorBonus;
      setup.voidsVotes = best.mana.ok;
    }
  }

  function applyExclusiveMinorLeechCharms(setup, vamp, voids) {
    // D-021: o mesmo mob não pode ter Vampiric Embrace e Void's Call ao mesmo tempo.
    // A inferência escolhe a melhor combinação global de candidatos vida+mana
    // respeitando essa exclusividade, em vez de aceitar o melhor de cada canal
    // isoladamente. Candidato nulo é permitido quando não há alternativa coerente.
    const vampRanked = [{ mob: null, bonus: 0, votes: 0, examples: [] }].concat((vamp && vamp.ranked) || (vamp ? [vamp] : []));
    const voidRanked = [{ mob: null, bonus: 0, votes: 0, examples: [] }].concat((voids && voids.ranked) || (voids ? [voids] : []));
    let best = null;
    for (const v of vampRanked) {
      for (const m of voidRanked) {
        const vMob = v && v.mob ? normalizeName(v.mob) : null;
        const mMob = m && m.mob ? normalizeName(m.mob) : null;
        if (vMob && mMob && vMob === mMob) continue;
        const score = ((v && v.votes) || 0) + ((m && m.votes) || 0);
        const bonusScore = ((v && v.bonus) || 0) + ((m && m.bonus) || 0);
        const nonNull = (vMob ? 1 : 0) + (mMob ? 1 : 0);
        const cand = { vamp: v, voids: m, score, bonusScore, nonNull };
        if (!best || cand.score > best.score ||
            (cand.score === best.score && cand.nonNull > best.nonNull) ||
            (cand.score === best.score && cand.nonNull === best.nonNull && cand.bonusScore > best.bonusScore)) {
          best = cand;
        }
      }
    }
    setup.minorCharmDecision = { vampiricRanked: vampRanked.slice(1, 8), voidsRanked: voidRanked.slice(1, 8), selected: best };
    if (best && best.vamp && best.vamp.mob && best.vamp.bonus > 0) {
      setup.vampiricMob = best.vamp.mob;
      setup.vampiricBonus = best.vamp.bonus;
      setup.vampiricVotes = best.vamp.votes;
    }
    if (best && best.voids && best.voids.mob && best.voids.bonus > 0) {
      setup.voidsMob = best.voids.mob;
      setup.voidsBonus = best.voids.bonus;
      setup.voidsVotes = best.voids.votes;
    }
    if (setup.vampiricMob && setup.voidsMob && normalizeName(setup.vampiricMob) === normalizeName(setup.voidsMob)) {
      // Defesa final contra regressão: nunca exportar os dois minors no mesmo mob.
      if ((setup.vampiricVotes || 0) >= (setup.voidsVotes || 0)) {
        delete setup.voidsMob; delete setup.voidsBonus; delete setup.voidsVotes;
      } else {
        delete setup.vampiricMob; delete setup.vampiricBonus; delete setup.vampiricVotes;
      }
      setup.minorCharmExclusivityCorrected = true;
    }
  }

  function inferLeechBaseMultiN(hits, channel, baseCandidates, minorBonuses, context) {
    const valueKey = channel === 'life' ? 'lifeLeech' : 'manaLeech';
    const obs = (hits || []).filter(h => isMainHit(h) && !h.overkill && h.dmg > 0 && (+h[valueKey] || 0) > 0);
    if (!obs.length) return { base: 0, votes: 0, observed: 0, source: 'no_observations' };
    const rows = [];
    for (const base of baseCandidates || []) {
      let votes = 0, exact = 0;
      const nVotes = {};
      const examples = [];
      for (const h of obs) {
        const observed = +h[valueKey] || 0;
        const dmgBasis = leechDamageBasis(h, context);
        if (!(dmgBasis > 0)) continue;
        let best = null;
        for (let n = 1; n <= 20; n++) {
          for (const bonus of minorBonuses || [0]) {
            const rate = base + (+bonus || 0);
            if (!(rate > 0)) continue;
            const expected = expectedLeech(dmgBasis, rate, n);
            if (expected == null) continue;
            const delta = Math.abs(expected - observed);
            if (delta <= 1 && (!best || delta < best.delta || (delta === best.delta && n < best.n))) {
              best = { n, bonus: +bonus || 0, rate, expected, observed, delta, mob: normalizeName(h.mob), ts: h.ts, dmg: h.dmg, dmgBasis };
            }
          }
        }
        if (best) {
          votes++;
          if (best.delta === 0) exact++;
          nVotes[best.n] = (nVotes[best.n] || 0) + 1;
          if (examples.length < 6) examples.push(best);
        }
      }
      rows.push({ base, votes, exact, observed: obs.length, coverage: votes / obs.length, nVotes, examples });
    }
    rows.sort((a, b) => b.votes - a.votes || b.exact - a.exact || b.base - a.base);
    if (!rows.length || rows[0].votes <= 0) return { base: 0, votes: 0, observed: obs.length, ranked: [] };
    // Em logs de área, bases altas oficiais podem ter cobertura quase igual à base
    // menor que venceu por poucos votos. Preferimos a maior base oficial quando está
    // muito próxima do melhor score, porque ela explica o ratio diluído por N maior e
    // preserva o setup real do personagem. Isso mantém o EK: nele 16%/50.75% já vencem.
    const bestVotes = rows[0].votes;
    const close = rows.filter(r => r.votes >= bestVotes * 0.985);
    close.sort((a, b) => b.base - a.base || b.votes - a.votes || b.exact - a.exact);
    const chosen = close[0] || rows[0];
    return Object.assign({ ranked: rows.slice(0, 8), closeCandidates: close.slice(0, 8) }, chosen);
  }

  function inferMinorLeechCharm(hits, channel, base, allowedBonuses, context) {
    if (!(base > 0)) return null;
    const valueKey = channel === 'life' ? 'lifeLeech' : 'manaLeech';
    const candidates = new Map();
    for (const h of hits || []) {
      const observed = +h[valueKey] || 0;
      const dmgBasis = leechDamageBasis(h, context);
      if (!(observed > 0) || !(dmgBasis > 0)) continue;
      // Testa N de 1 a 20 porque, nesta fase, ainda não sabemos a cardinalidade
      // real do componente. O resíduo precisa bater em bônus oficial de mob.
      for (let n = 1; n <= 20; n++) {
        const required = observed / (dmgBasis * areaFactor(n));
        const residual = required - base;
        for (const bonus of allowedBonuses || []) {
          if (!(bonus > 0)) continue;
          if (Math.abs(residual - bonus) <= 0.004) {
            const mob = normalizeName(h.mob);
            const key = mob + '|' + bonus;
            const prev = candidates.get(key) || { mob, bonus, votes: 0, examples: [] };
            prev.votes++;
            if (prev.examples.length < 5) prev.examples.push({ ts: h.ts, dmg: h.dmg, observed, n, residual });
            candidates.set(key, prev);
          }
        }
      }
    }
    const ranked = Array.from(candidates.values()).sort((a, b) => b.votes - a.votes || b.bonus - a.bonus || String(a.mob).localeCompare(String(b.mob)));
    if (!ranked.length || ranked[0].votes < 2) return null;
    return Object.assign({}, ranked[0], { alt: ranked[1] || null, ranked });
  }
  function snapToClosest(v, candidates) {
    if (!(v > 0)) return 0;
    let best = 0, dist = Infinity;
    for (const c of candidates) {
      const d = Math.abs(c - v);
      if (d < dist) { dist = d; best = c; }
    }
    return best;
  }

  function isHolyRpPierceProbeBlock(block) {
    if (!block || !(block.hits && block.hits.length >= 2)) return false;
    const action = block.action || {};
    const profile = action.profile || {};
    if (profile.element !== 'holy' || profile.vocation !== 'paladin') return false;
    if (!(block.comp === 'spell' || block.comp === 'grenade')) return false;
    return distinctMainMobCount(block.hits) >= 2;
  }

  function deterministicWidth(det) {
    if (!det) return Infinity;
    if (det.intersection && det.intersection.length) return det.intersection[det.intersection.length - 1] - det.intersection[0] + 1;
    if (det.cluster && Number.isFinite(+det.cluster.span)) return +det.cluster.span + 1;
    return Infinity;
  }

  function bmDeterministicVerdict(block, context, pierce) {
    const previous = context.bmPierce;
    context.bmPierce = pierce;
    try {
      const run = () => root.UnifiedValidation.validateElementalBlock(block, 'holy', context);
      if (block.gravSanActive === true || block.gravSanActive === false) {
        return root.UnifiedValidation.withGravSanBlockMode(context, block, block.gravSanActive, run);
      }
      return run();
    } finally {
      context.bmPierce = previous;
    }
  }

  function scoreBmPierceCandidate(blocks, context, pierce) {
    const score = {
      pierce,
      testedBlocks: 0,
      knownHits: 0,
      okBlocks: 0,
      exactBlocks: 0,
      clusterBlocks: 0,
      failedBlocks: 0,
      noSignalBlocks: 0,
      widthSum: 0,
      examples: [],
    };
    for (const block of blocks || []) {
      const det = bmDeterministicVerdict(block, context, pierce);
      const known = +(det && det.known) || 0;
      if (known < Math.min(2, (block.hits || []).length)) {
        score.noSignalBlocks++;
        continue;
      }
      score.testedBlocks++;
      score.knownHits += known;
      if (det.ok) {
        const width = deterministicWidth(det);
        score.okBlocks++;
        if (det.intersection && det.intersection.length) score.exactBlocks++;
        if (det.elementalCluster) score.clusterBlocks++;
        if (Number.isFinite(width)) score.widthSum += width;
        if (score.examples.length < 8) {
          score.examples.push({
            clock: block.hits && block.hits[0] && block.hits[0].clock,
            action: block.actionLabel || (block.action && block.action.label) || 'holy_rp_action',
            hits: (block.hits || []).length,
            mobs: distinctMainMobCount(block.hits),
            reason: det.reason || (det.intersection && det.intersection.length ? 'intersection' : 'ok'),
            width: Number.isFinite(width) ? width : null,
            intersection: det.intersection && det.intersection.slice ? det.intersection.slice(0, 8) : undefined,
            cluster: det.cluster ? { min: det.cluster.min, max: det.cluster.max, span: det.cluster.span } : undefined,
          });
        }
      } else {
        score.failedBlocks++;
      }
    }
    score.avgWidth = score.okBlocks ? score.widthSum / score.okBlocks : Infinity;
    // Sinal conservador: blocos OK contam mais; falhas pesam forte; largura só desempata.
    score.rank = (score.okBlocks * 100) + (score.exactBlocks * 20) + (score.clusterBlocks * 8) + score.knownHits - (score.failedBlocks * 120) - Math.min(score.avgWidth || 0, 1000) / 10;
    return score;
  }

  function bmProbeBlockKey(block) {
    return ((block.hits || []).map(h => (h && h.seq) || 0).sort((a, b) => a - b)).join(',');
  }

  // Canal FÍSICO de prova para a detecção de BM (add-bm-physical-pierce-channel):
  // paralelo ao canal holy acima. Extrai, de um componente `arrow` RP, o SUBCONJUNTO
  // de hits "limpos" (sem overkill/crit/onslaught/lowBlow/savageBlow/prey/EW — garante post=1 e
  // crit=1 no subconjunto), e usa esse subconjunto como bloco de prova quando tem
  // >=2 hits de >=2 mobs distintos. Não exige que TODO hit do componente seja limpo
  // (validado empiricamente: exigir isso elimina o sinal em turnos RP reais, que quase
  // sempre misturam crit e não-crit no mesmo componente `arrow`) — só o subconjunto
  // limpo precisa ser suficiente. Hits crit/Onslaught/prey ficam de fora do
  // subconjunto, o que já evita reaproveitar a ambiguidade do Eixo 2-físico (AA x
  // Ethereal Barrage) como prova de BM.
  function physicalRpPierceProbeSubset(block) {
    if (!block || block.comp !== 'arrow' || !block.hits) return null;
    const clean = block.hits.filter(h => h && !h.overkill && !h.realCrit && !h.onslaught && !h.lowBlow && !h.savageBlow && !h.isPrey && !h.bountyTalisman && !h.exposeWeakness);
    if (clean.length < 2) return null;
    if (distinctMainMobCount(clean) < 2) return null;
    return { comp: 'arrow', hits: clean };
  }

  function bmPhysicalDeterministicVerdict(block, context, pierce) {
    const previous = context.bmPierce;
    context.bmPierce = pierce;
    try {
      return root.UnifiedValidation.validatePhysicalBlock(block, context);
    } finally {
      context.bmPierce = previous;
    }
  }

  function scorePhysicalBmPierceCandidate(blocks, context, pierce) {
    const score = {
      pierce,
      testedBlocks: 0,
      knownHits: 0,
      okBlocks: 0,
      exactBlocks: 0,
      clusterBlocks: 0,
      failedBlocks: 0,
      noSignalBlocks: 0,
      widthSum: 0,
      examples: [],
    };
    for (const block of blocks || []) {
      const det = bmPhysicalDeterministicVerdict(block, context, pierce);
      const known = +(det && det.known) || 0;
      if (known < Math.min(2, (block.hits || []).length)) {
        score.noSignalBlocks++;
        continue;
      }
      score.testedBlocks++;
      score.knownHits += known;
      if (det.ok) {
        const width = deterministicWidth(det);
        score.okBlocks++;
        if (det.intersection && det.intersection.length) score.exactBlocks++;
        if (Number.isFinite(width)) score.widthSum += width;
        if (score.examples.length < 8) {
          score.examples.push({
            clock: block.hits && block.hits[0] && block.hits[0].clock,
            hits: (block.hits || []).length,
            mobs: distinctMainMobCount(block.hits),
            reason: det.reason || (det.intersection && det.intersection.length ? 'intersection' : 'ok'),
            width: Number.isFinite(width) ? width : null,
            intersection: det.intersection,
          });
        }
      } else {
        score.failedBlocks++;
      }
    }
    score.avgWidth = score.okBlocks ? score.widthSum / score.okBlocks : Infinity;
    score.rank = (score.okBlocks * 100) + (score.exactBlocks * 20) + score.knownHits - (score.failedBlocks * 120) - Math.min(score.avgWidth || 0, 1000) / 10;
    return score;
  }

  // Coleta os blocos físicos "limpos" de base+alt (mesma disciplina base+altOnly do
  // canal holy) e pontua as duas hipóteses de pierce. Exposto em
  // `bmPierceDetection.physicalProbe` — combinado com o canal holy na decisão final
  // de `bmPierce` (ver inferBmPierceFromCrossMobEvidence).
  function collectPhysicalBmProbeData(baseResult, context, altResult) {
    const collectPhysicalBlocks = result => {
      const out = [];
      for (const turn of (result && result.turns) || []) {
        for (const block of turn.components || []) {
          const subset = physicalRpPierceProbeSubset(block);
          if (subset) out.push(subset);
        }
      }
      return out;
    };
    const baseBlocks = collectPhysicalBlocks(baseResult);
    let blocks = baseBlocks;
    if (altResult) {
      const seen = new Set(baseBlocks.map(bmProbeBlockKey));
      const altOnly = collectPhysicalBlocks(altResult).filter(b => !seen.has(bmProbeBlockKey(b)));
      blocks = altOnly.concat(baseBlocks);
    }
    const probeBlocks = blocks.slice(0, 200);
    if (probeBlocks.length < 2) {
      return { probeBlockCount: probeBlocks.length, candidates: [], source: 'insufficient_physical_cross_mob_probe_blocks' };
    }
    const candidates = [0, 0.04].map(p => scorePhysicalBmPierceCandidate(probeBlocks, context, p));
    return { probeBlockCount: probeBlocks.length, candidates };
  }

  function collectHolyBmProbeData(baseResult, context, altResult) {
    const collectHolyBlocks = result => {
      const out = [];
      for (const turn of (result && result.turns) || []) {
        for (const block of turn.components || []) {
          if (isHolyRpPierceProbeBlock(block)) out.push(block);
        }
      }
      return out;
    };
    const baseBlocks = collectHolyBlocks(baseResult);
    // A detecção não pode depender só da classificação BM=0: um cast holy que mistura
    // um mob de holyDmgMod ≠ 1.0 (ex.: striker 0.9) com mobs 1.0 reverte incoerente em
    // BM=0, o turno vira `unresolved` e o bloco — o ÚNICO discriminante de BM — some da
    // amostragem. A hipótese BM=0.04, classificada em paralelo, resolve justamente esses
    // casts; seus blocos holy que NÃO existiam em BM=0 são os discriminantes e entram
    // PRIMEIRO (para não serem cortados pelo limite). scoreBmPierceCandidate os avalia nas
    // duas pierces: um bloco misto mob≠1.0+1.0 falha em pierce 0 e resolve em 0.04 (sinal
    // de BM); um bloco só-mob-1.0 é coerente nas duas (sem sinal, não gera falso-positivo).
    let blocks = baseBlocks;
    if (altResult) {
      const seen = new Set(baseBlocks.map(bmProbeBlockKey));
      const altOnly = collectHolyBlocks(altResult).filter(b => !seen.has(bmProbeBlockKey(b)));
      blocks = altOnly.concat(baseBlocks);
    }
    // Limite para manter a comparação responsiva em logs longos. O detector usa
    // apenas blocos de spell/grenade holy concretos e cross-mob, que são os blocos
    // com maior poder de distinguir BM=0 de BM=+4%.
    const probeBlocks = blocks.slice(0, 40);
    if (probeBlocks.length < 2) {
      return { probeBlockCount: probeBlocks.length, candidates: [], source: 'insufficient_holy_cross_mob_probe_blocks' };
    }
    const candidates = [0, 0.04].map(p => scoreBmPierceCandidate(probeBlocks, context, p));
    return { probeBlockCount: probeBlocks.length, candidates };
  }

  function emptyBmPierceScore(pierce) {
    return { pierce, testedBlocks: 0, knownHits: 0, okBlocks: 0, exactBlocks: 0, clusterBlocks: 0, failedBlocks: 0, noSignalBlocks: 0, widthSum: 0, avgWidth: Infinity, examples: [] };
  }

  // Decisão de BM combinando o canal holy (isHolyRpPierceProbeBlock) e o canal físico
  // (physicalRpPierceProbeSubset) — add-bm-physical-pierce-channel, D2 do design: soma
  // okBlocks/failedBlocks dos dois canais para improvesOk/improvesFailures (mais
  // amostra = mais confiança), mas NUNCA soma avgWidth entre canais (ruído de base em
  // escalas diferentes — físico é estruturalmente mais largo por causa do roll de
  // armadura); improvesTightness é satisfeito se QUALQUER UM dos dois canais,
  // isoladamente, bate seu próprio critério de estreitamento.
  function inferBmPierceFromCrossMobEvidence(baseResult, context, altResult) {
    const facts = baseResult && baseResult.facts || {};
    const server = facts.server || {};
    if (!baseResult || baseResult.vocation !== 'paladin') {
      return { pierce: 0, active: false, source: 'not_paladin', candidates: [] };
    }
    if (distinctMainMobCount(server.hits || []) < 2) {
      return { pierce: 0, active: false, source: 'single_mob_or_no_pack', candidates: [] };
    }

    const holy = collectHolyBmProbeData(baseResult, context, altResult);
    const physical = collectPhysicalBmProbeData(baseResult, context, altResult);
    const holyOk = holy.candidates.length === 2;
    const physicalOk = physical.candidates.length === 2;
    if (!holyOk && !physicalOk) {
      return { pierce: 0, active: false, source: 'insufficient_cross_mob_probe_blocks', holyProbe: holy, physicalProbe: physical, candidates: [] };
    }

    const holyBase = holyOk ? holy.candidates[0] : emptyBmPierceScore(0);
    const holyBm = holyOk ? holy.candidates[1] : emptyBmPierceScore(0.04);
    const physBase = physicalOk ? physical.candidates[0] : emptyBmPierceScore(0);
    const physBm = physicalOk ? physical.candidates[1] : emptyBmPierceScore(0.04);

    const combinedBase = { okBlocks: holyBase.okBlocks + physBase.okBlocks, failedBlocks: holyBase.failedBlocks + physBase.failedBlocks, testedBlocks: holyBase.testedBlocks + physBase.testedBlocks };
    const combinedBm = { okBlocks: holyBm.okBlocks + physBm.okBlocks, failedBlocks: holyBm.failedBlocks + physBm.failedBlocks, testedBlocks: holyBm.testedBlocks + physBm.testedBlocks };

    const improvesOk = combinedBm.okBlocks >= combinedBase.okBlocks + 2;
    const improvesFailures = combinedBm.failedBlocks + 2 <= combinedBase.failedBlocks && combinedBm.okBlocks >= Math.max(2, combinedBase.okBlocks);
    const tightnessFor = (base, bm) => bm.okBlocks >= Math.max(3, base.okBlocks) && bm.failedBlocks <= base.failedBlocks && Number.isFinite(base.avgWidth) && Number.isFinite(bm.avgWidth) && bm.avgWidth + 2 < base.avgWidth;
    const improvesTightnessHoly = holyOk && tightnessFor(holyBase, holyBm);
    const improvesTightnessPhysical = physicalOk && tightnessFor(physBase, physBm);
    const enoughSignal = combinedBm.testedBlocks >= 3 && combinedBm.okBlocks >= 2;
    const active = !!(enoughSignal && (improvesOk || improvesFailures || improvesTightnessHoly || improvesTightnessPhysical));

    return {
      pierce: active ? 0.04 : 0,
      active,
      source: active ? 'inferred_from_holy_and_physical_cross_mob_original_coherence' : 'no_bm_signal_from_holy_or_physical_cross_mob_original_coherence',
      holyProbe: holy,
      physicalProbe: physical,
      combined: { base: combinedBase, bm: combinedBm },
      decision: { improvesOk, improvesFailures, improvesTightnessHoly, improvesTightnessPhysical, enoughSignal },
    };
  }
  const API = {
    areaFactor,
    realDamageIntervalFromLeech,
    expectedLeech,
    leechDamageBasis,
    inferLeechSetup,
    unknownLeechSetup,
    unknownBountyTalismanAxis,
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
    exposeWeaknessManaPerkHypotheses,
    isMobEligibleForMinorCharm,
    detectCharmCandidateMobsFromColocatedTurns,
    inferLeechSetupJointBaseAndCharm,
    inferLeechSetupFromGoldObservations,
    inferBountyDamageFromFrozenComponents,
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
    AA_ELEMENT_CANDIDATES,
    aaBlockCloses,
    inferAaElementForSession,
  };

  root.UnifiedSetupInference = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
