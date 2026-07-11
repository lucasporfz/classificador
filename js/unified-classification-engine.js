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
  function leechDamageBasis(hit, context) {
    // Leech é calculado sobre o dano real antes de multiplicadores finais que
    // aumentam dano exibido sem aumentar leech: active prey/Bounty e utevo grav san.
    let dmg = +(hit && hit.dmg) || 0;
    if (!(dmg > 0)) return 0;
    let divisor = 1;
    if (hit && hit.isPrey) divisor *= 1.25;
    divisor *= gravSanMultiplierAtTs(context, hit && hit.ts, hit);
    return divisor > 0 ? dmg / divisor : dmg;
  }


  function effectiveLifeLeech(hit, setup) {
    const base = setup && setup.lifeBase ? setup.lifeBase : 0;
    if (!setup || !setup.vampiricMob) return base;
    return normalizeName(hit.mob) === normalizeName(setup.vampiricMob) ? base + (setup.vampiricBonus || 0) : base;
  }
  function effectiveManaLeech(hit, setup) {
    const base = setup && setup.manaBase ? setup.manaBase : 0;
    if (!setup || !setup.voidsMob) return base;
    return normalizeName(hit.mob) === normalizeName(setup.voidsMob) ? base + (setup.voidsBonus || 0) : base;
  }

  function hitLeechFit(hit, setup, n, block, context) {
    if (!isMainHit(hit)) return { usable: false, ok: true, reason: 'not_main_hit' };
    const life = +hit.lifeLeech || 0;
    const mana = +hit.manaLeech || 0;
    if (!(life > 0) && !(mana > 0)) return { usable: false, ok: true, reason: 'no_positive_leech_or_cap' };
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return { usable: false, ok: true, reason: 'leech_setup_unknown' };

    const officialFit = hitAcceptsLeechNAnyOfficialRate(hit, setup, n, block, context);
    // Hard-gate de cardinalidade com taxa oficial, usando apenas o setup global de
    // minor charm ja inferido.
    if (officialFit.usable) {
      return {
        usable: true,
        ok: !!officialFit.ok,
        cappedLow: !!officialFit.cappedLow,
        neutral: !!officialFit.neutral,
        n,
        official: officialFit,
        reason: officialFit.ok ? 'official_rate_accepts_n' : (officialFit.cappedLow ? 'official_rate_capped_low_neutral' : 'official_rate_rejects_n'),
      };
    }

    const out = { usable: true, ok: true, n, channels: {}, interval: null };
    const lifeRate = effectiveLifeLeech(hit, setup);
    const manaRate = effectiveManaLeech(hit, setup);

    if (life > 0 && lifeRate > 0) {
      if (hit.overkill) out.channels.life = { interval: realDamageIntervalFromLeech(life, lifeRate, n) };
      else {
        const expected = expectedLeech(hit.dmg, lifeRate, n);
        out.channels.life = { expected, observed: life, ok: expected != null && Math.abs(expected - life) <= leechValueToleranceForN(n) };
      }
    }
    if (mana > 0 && manaRate > 0) {
      if (hit.overkill) out.channels.mana = { interval: realDamageIntervalFromLeech(mana, manaRate, n) };
      else {
        const expected = expectedLeech(hit.dmg, manaRate, n);
        out.channels.mana = { expected, observed: mana, ok: expected != null && Math.abs(expected - mana) <= leechValueToleranceForN(n) };
      }
    }

    if (hit.overkill) {
      let iv = null;
      if (out.channels.life && out.channels.life.interval) iv = intersectInterval(iv, out.channels.life.interval);
      if (out.channels.mana && out.channels.mana.interval) iv = intersectInterval(iv, out.channels.mana.interval);
      if (!iv) {
        // Se os dois canais não cruzam, mantemos canal existente como evidência fraca,
        // mas marcamos a falha quando ambos existiam.
        const hadBoth = !!(out.channels.life && out.channels.mana);
        iv = (out.channels.life && out.channels.life.interval) || (out.channels.mana && out.channels.mana.interval) || null;
        if (hadBoth) out.channelIntersectionFailed = true;
      }
      out.interval = iv;
      out.ok = !!iv && (!(hit.dmg > 0) || hit.dmg <= iv[1]) && !out.channelIntersectionFailed;
    } else {
      const checks = [];
      if (out.channels.life && out.channels.life.expected != null) checks.push(out.channels.life.ok);
      if (out.channels.mana && out.channels.mana.expected != null) checks.push(out.channels.mana.ok);
      out.ok = checks.length ? checks.every(Boolean) : true;
    }
    return out;
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
    }
    if (useMana) {
      setup.manaBase = manaRobust.base;
      setup.manaVote = manaRobust;
    }

    applyExclusiveTrustedMinorLeechCharms(setup, useLife ? lifeRobust : null, useMana ? manaRobust : null, fallback);
    setup.trustedLeechInference = { life: lifeRobust, mana: manaRobust };
    return setup;
  }

  function unknownLeechSetup(source) {
    return {
      lifeBase: 0,
      manaBase: 0,
      confidence: 'unknown',
      inferred: false,
      source: source || 'unknown',
      evidenceCount: 0,
      contradictions: 0,
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
    const damage = leechDamageBasis(hit, context);
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

    if (comp.comp === 'arrow') {
      if (context && context.vocation === 'paladin') return null;
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
    for (const turn of turns || []) {
      if (!turn || turn.status !== 'resolved' || turn.partialEdge) continue;
      for (const comp of turn.components || []) {
        const gold = componentGoldN(comp, turn, context);
        if (!gold) continue;
        const main = (comp.hits || []).filter(h => isMainHit(h) && !h.virtual);
        for (const h of main) {
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
  function scoreGoldBaseWithMobException(observations, channel, base, bonusMob, bonusRate) {
    let ok = 0, exact = 0, high = 0, low = 0;
    const turns = new Set(), mobs = new Set(), highMobs = new Set(), lowMobs = new Set(), examples = [], contradictions = [];
    for (const o of observations || []) {
      if (!o || o.channel !== channel || !(o.observed > 0) || !(o.damage > 0) || !(o.n >= 1)) continue;
      const rate = (bonusMob && o.mob === bonusMob) ? base + bonusRate : base;
      const expected = expectedLeech(o.damage, rate, o.n);
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
      life: { key: 'lifeLeech', deltas: new Map(), turnSets: new Map() },
      mana: { key: 'manaLeech', deltas: new Map(), turnSets: new Map() },
    };
    for (const turn of turns || []) {
      if (!turn || turn.status === 'unresolved') continue;
      for (const comp of turn.components || []) {
        if (!comp || comp.comp === 'unresolved') continue;
        const hits = (comp.hits || []).filter(h => isMainHit(h) && !h.overkill && h.dmg > 0);
        if (new Set(hits.map(h => normalizeName(h.mob))).size < 2) continue;
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
            if (!cfg.deltas.has(mob)) { cfg.deltas.set(mob, []); cfg.turnSets.set(mob, new Set()); }
            for (const ratio of ratios) cfg.deltas.get(mob).push(ratio - othersMedian);
            cfg.turnSets.get(mob).add(comp);
          }
        }
      }
    }
    const out = { life: [], mana: [] };
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
      }
      candidates.sort((a, b) => b.delta - a.delta);
      out[channel] = candidates.map(c => c.mob);
    }
    return out;
  }

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
  function inferLeechSetupJointBaseAndCharm(goldObservations, charmCandidates) {
    const observations = goldObservations || [];
    const out = { life: null, mana: null };
    const minorResult = {};
    const byChannel = [
      { channel: 'life', bases: LIFE_BASE_CANDIDATES, bonuses: VAMPIRIC_BONUSES, mobKey: 'vampiricMob', bonusKey: 'vampiricBonus', votesKey: 'vampiricVotes' },
      { channel: 'mana', bases: MANA_BASE_CANDIDATES, bonuses: VOIDS_BONUSES, mobKey: 'voidsMob', bonusKey: 'voidsBonus', votesKey: 'voidsVotes' },
    ];
    for (const cfg of byChannel) {
      const candidateMobs = (charmCandidates && charmCandidates[cfg.channel]) || [];
      const observedMobs = new Set(observations.filter(o => o.channel === cfg.channel && o.mob).map(o => o.mob));
      const mobs = candidateMobs.filter(m => observedMobs.has(m));
      const rows = [];
      for (const B of cfg.bases) {
        let bestPick = null;
        for (const mob of mobs) {
          const scoped = observations.filter(o => o.channel === cfg.channel && o.mob === mob);
          const baseScore = scoreGoldBase(scoped, cfg.channel, B);
          for (const bonus of cfg.bonuses || []) {
            if (!(bonus > 0)) continue;
            const score = scoreGoldBase(scoped, cfg.channel, B + bonus);
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
        const gatePassed = !!(bestPick && bestPick.baseHigh >= 4 && bestPick.fixedHigh >= 4 && bestPick.improvement >= 4);
        const aggregate = gatePassed
          ? scoreGoldBaseWithMobException(observations, cfg.channel, B, bestPick.mob, bestPick.bonus)
          : scoreGoldBaseWithMobException(observations, cfg.channel, B, null, 0);
        rows.push(aggregate);
      }
      rows.sort(compareGoldBaseScores);
      const best = rows[0] || null;
      if (!best || best.ok < 3) {
        out[cfg.channel] = { channel: cfg.channel, base: 0, confidence: 'unknown', observed: best ? best.observed : 0, ranked: rows.slice(0, 8), contradictions: best ? best.high : 0 };
      } else {
        const strong = best.ok >= 30 && best.independentTurns >= 20;
        out[cfg.channel] = Object.assign({}, best, { confidence: strong ? 'strong' : 'weak', ranked: rows.slice(0, 8), contradictions: best.high });
        if (best.candidateMob) {
          minorResult[cfg.mobKey] = best.candidateMob;
          minorResult[cfg.bonusKey] = best.candidateBonus;
          minorResult[cfg.votesKey] = best.ok;
        }
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
      life: out.life,
      mana: out.mana,
      minor: minorResult,
    };
  }

  function inferLeechSetupFromGoldObservations(goldObservations, context, charmCandidates) {
    const observations = goldObservations || [];
    const joint = inferLeechSetupJointBaseAndCharm(observations, charmCandidates);
    const channelConf = [joint.life && joint.life.confidence, joint.mana && joint.mana.confidence];
    const confidence = channelConf.includes('strong') ? 'strong' : (channelConf.includes('weak') ? 'weak' : 'unknown');
    if (confidence === 'unknown') {
      const diagnostic = inferLeechSetupFallback(context && context.serverFacts ? context.serverFacts.hits : [], context);
      return Object.assign(unknownLeechSetup('gold_observations_insufficient'), {
        evidenceCount: observations.length,
        diagnosticOnly: false,
        multiNDiagnostic: diagnostic,
        lifeVote: joint.life,
        manaVote: joint.mana,
      });
    }
    const setup = {
      lifeBase: joint.lifeBase,
      manaBase: joint.manaBase,
      confidence,
      inferred: true,
      source: 'gold_observations_known_n_joint',
      evidenceCount: observations.length,
      contradictions: ((joint.life && joint.life.high) || 0) + ((joint.mana && joint.mana.high) || 0),
      lifeVote: joint.life,
      manaVote: joint.mana,
    };
    Object.assign(setup, joint.minor);
    return setup;
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

  function actionsNearTurn(turn, facts, context) {
    const firstTs = Math.min(...turn.hits.map(h => h.ts));
    const lastTs = Math.max(...turn.hits.map(h => h.ts));
    const spellCasts = facts.local.spellCasts.filter(c => c.ts >= firstTs - 1 && c.ts <= lastTs + 1);
    const runeUses = facts.server.runeUses.filter(r => r.ts >= firstTs - 1 && r.ts <= lastTs + 1);
    // M-024/M-025: uma granada possui um único timestamp de impacto e o mesmo cast
    // não pode explicar hits em dois turnos. Um cast cuja explosão já foi consolidada
    // num turno anterior (em ordem temporal) não é mais oferecido como ação de granada
    // — senão a janela [c+2,c+4] que cruza a fronteira de turno semeia uma granada
    // fantasma no segundo turno (ex.: barrage cast 19:00:05 explode em 19:00:07 e
    // vazaria para 19:00:09).
    const consumed = context && context.consolidatedGrenadeCasts;
    const preassigned = context && context.preassignedGrenadeCasts;
    const grenadeCasts = facts.local.grenadeCasts.filter(c => {
      if (preassigned && preassigned.has(c) && preassigned.get(c) !== turn.ts) return false;
      if (consumed && consumed.has(c)) return false;
      const impactLo = c.ts + 2, impactHi = c.ts + 4;
      return turn.hits.some(h => h.ts >= impactLo && h.ts <= impactHi);
    });
    return { spellCasts, runeUses, grenadeCasts };
  }

  function possibleShapes(actions) {
    const base = [
      ['arrow'], ['spell'], ['rune'], ['grenade'],
      ['arrow', 'spell'], ['arrow', 'rune'], ['arrow', 'grenade'],
      ['grenade', 'spell'], ['grenade', 'rune'],
      ['spell', 'grenade'], ['rune', 'grenade'],
      ['grenade', 'arrow', 'spell'], ['grenade', 'arrow', 'rune'],
      ['arrow', 'spell', 'grenade'], ['arrow', 'rune', 'grenade'],
    ];
    return base.filter(shape => {
      if (shape.includes('spell') && !actions.spellCasts.length) return false;
      if (shape.includes('rune') && !actions.runeUses.length) return false;
      if (shape.includes('grenade') && !actions.grenadeCasts.length) return false;
      return true;
    });
  }

  function segmentations(n, k) {
    const out = [];
    function rec(start, partsLeft, cuts) {
      if (partsLeft === 1) { out.push(cuts.concat(n)); return; }
      for (let end = start + 1; end <= n - partsLeft + 1; end++) rec(end, partsLeft - 1, cuts.concat(end));
    }
    rec(0, k, []);
    return out;
  }

  function candidateFromShape(turn, shape, cuts) {
    let start = 0;
    const components = [];
    for (let i = 0; i < shape.length; i++) {
      const end = cuts[i];
      components.push({ comp: shape[i], start, end, hits: turn.hits.slice(start, end) });
      start = end;
    }
    return { shape, cuts, components };
  }

  // Gate cirúrgico do k=3 (só-desempenho, comportamentalmente neutro): num pack RP
  // a granada faz parte da rotação, então a janela [c+2,c+4] (≈2 turnos por cast)
  // cobre a maioria dos turnos e habilita as formas de 3 componentes em TODO turno
  // que roça uma janela — mas a explosão real está num único segundo. Enumerar
  // C(n-1,2) cortes de granada e validar cada um (reversão holy + leech) é o grosso
  // do custo. Este pré-filtro descarta, antes do validateCandidate caro, os cortes
  // cujo bloco de granada NÃO é uma explosão válida (M-023/M-024): sem cast, fora de
  // [cast+2,cast+4], ou com mais de um timestamp de impacto. Esses cortes são
  // EXATAMENTE os que validateCandidate já rejeita (grenade_without_cast,
  // grenade_outside_impact_window, grenade_multiple_impact_timestamps, L2554/2558/2559)
  // — nunca entram em `candidates`, logo não alteram best/second/ambiguous. A escolha
  // da ação usa o MESMO chooseActionForComponent do validador, garantindo equivalência.
  function grenadeCandidateWindowInvalid(candidate, actions) {
    for (const block of candidate.components) {
      if (block.comp !== 'grenade') continue;
      const action = chooseActionForComponent('grenade', block.hits, actions);
      if (!action) return true;
      const okImpact = block.hits.every(h => h.ts >= action.ts + 2 && h.ts <= action.ts + 4);
      if (!okImpact) return true;
      if (new Set(block.hits.map(h => h.ts)).size > 1) return true;
    }
    return false;
  }

  function chooseActionForComponent(comp, hits, actions) {
    if (comp === 'spell') {
      const centerTs = Math.round(mean(hits.map(h => h.ts)));
      const sorted = actions.spellCasts.slice().sort((a, b) => Math.abs(a.ts - centerTs) - Math.abs(b.ts - centerTs) || b.ts - a.ts);
      return sorted[0] || null;
    }
    if (comp === 'rune') {
      const main = (hits || []).filter(isMainHit);
      const firstSeq = main.length ? Math.min.apply(null, main.map(h => h.seq || 0)) : null;
      const firstTs = main.length ? Math.min.apply(null, main.map(h => h.ts || 0)) : null;
      // M-017/M-018a: a linha "Using one of ... runes" é uma fronteira de
      // execução. Para um componente de runa com hits visíveis, preferimos a
      // tentativa de runa imediatamente anterior ao primeiro hit do componente
      // (mesmo timestamp via seq), não a mais próxima pelo centro do bloco. Isso
      // impede AA anterior ao Using de ser absorvido como R.
      const beforeFirst = firstSeq == null ? [] : actions.runeUses.filter(r => (r.seq || 0) < firstSeq);
      if (beforeFirst.length) {
        beforeFirst.sort((a, b) => (firstSeq - (a.seq || 0)) - (firstSeq - (b.seq || 0)) || Math.abs((a.ts || firstTs) - firstTs) - Math.abs((b.ts || firstTs) - firstTs));
        return beforeFirst[0] || null;
      }
      const centerTs = Math.round(mean((hits || []).map(h => h.ts)));
      const sorted = actions.runeUses.slice().sort((a, b) => Math.abs(a.ts - centerTs) - Math.abs(b.ts - centerTs) || b.ts - a.ts);
      return sorted[0] || null;
    }
    if (comp === 'grenade') {
      const sorted = actions.grenadeCasts.slice().sort((a, b) => {
        const da = Math.min(...hits.map(h => Math.min(Math.abs(h.ts - (a.ts + 2)), Math.abs(h.ts - (a.ts + 3)), Math.abs(h.ts - (a.ts + 4)))));
        const db = Math.min(...hits.map(h => Math.min(Math.abs(h.ts - (b.ts + 2)), Math.abs(h.ts - (b.ts + 3)), Math.abs(h.ts - (b.ts + 4)))));
        return da - db || b.ts - a.ts;
      });
      return sorted[0] || null;
    }
    return null;
  }

  function isSingleTargetAction(comp, action) {
    if (comp === 'rune') return action && action.profile && action.profile.topology === 'single';
    if (comp === 'spell') return action && action.profile && action.profile.topology === 'single';
    if (comp === 'grenade') return false;
    return false;
  }

  function validateRuneUsingBoundary(block, action, actions) {
    if (!block || block.comp !== 'rune' || !action) return { ok: true };
    const main = (block.hits || []).filter(isMainHit);
    if (!main.length) return { ok: true };

    const beforeOrAt = main.filter(h => !((h.seq || 0) > (action.seq || 0)));
    if (beforeOrAt.length) {
      return {
        ok: false,
        rule: 'M-017/M-018/M-018a',
        reason: 'rune_component_contains_hits_before_using_line',
        actionClock: action.clock,
        actionSeq: action.seq,
        beforeCount: beforeOrAt.length,
        firstBeforeClock: beforeOrAt[0] && beforeOrAt[0].clock,
      };
    }

    // Se houver outra tentativa de runa depois da ação escolhida e antes de
    // algum hit do componente, o componente atravessou uma nova fronteira de
    // execução e deve ser reparticionado.
    const lastSeq = Math.max.apply(null, main.map(h => h.seq || 0));
    const crossing = (actions && actions.runeUses || []).filter(r => (r.seq || 0) > (action.seq || 0) && (r.seq || 0) < lastSeq);
    if (crossing.length) {
      return {
        ok: false,
        rule: 'M-017/M-018a',
        reason: 'rune_component_crosses_later_using_line',
        actionClock: action.clock,
        nextRuneClock: crossing[0] && crossing[0].clock,
      };
    }
    return { ok: true };
  }


  function validateCritHomogeneity(block) {
    // D-007/S-008: o FLAG de crit é observável mesmo em hit overkill (só o DANO é
    // truncado), então overkill participa do check de crit-state. Só hits virtuais
    // (realCrit sempre false, sem linha real) ficam de fora.
    const clean = block.hits.filter(h => !h.virtual);
    if (clean.length < 2) return { ok: true };
    const first = !!(clean[0].realCrit || clean[0].onslaught || clean[0].lowBlow);
    const mixed = clean.some(h => !!(h.realCrit || h.onslaught || h.lowBlow) !== first);
    return mixed ? { ok: false, rule: 'D-007/S-008', reason: 'mixed_crit_state' } : { ok: true };
  }

  function validatePhysicalBlock(block, context) {
    const prevKey = context && context._activeCritKey;
    if (context) context._activeCritKey = critKeyForBlock(block);
    try {
      const intervals = [];
      let known = 0, unknown = 0;
      for (const h of block.hits.filter(h => !h.overkill)) {
        const ev = physicalOriginalInterval(h, context);
        if (!ev || !ev.known) { unknown++; continue; }
        if (!ev.interval) return { ok: false, rule: 'D-004/S-007', reason: 'physical_no_candidate', known, unknown };
        intervals.push(ev.interval); known++;
      }
      // Tenta exato primeiro (tolerance 0 — mesmo comportamento terminal/
      // sticky de sempre); só recorre à tolerância cross-hit
      // (PHYSICAL_INTERSECTION_TOLERANCE) se a interseção exata colapsar.
      // Isso preserva rastreabilidade (physicalToleranceUsed) sem mudar o
      // formato consumido por tools/diag-unified-turn.mjs.
      let inter = intersectIntervals(intervals, 0);
      let toleranceUsed = 0;
      if (intervals.length && !inter) {
        inter = intersectIntervals(intervals, PHYSICAL_INTERSECTION_TOLERANCE);
        if (inter) toleranceUsed = PHYSICAL_INTERSECTION_TOLERANCE;
      }
      if (intervals.length && !inter) return { ok: false, rule: 'S-004/S-005/S-007', reason: 'physical_intersection_empty', known, unknown };
      return { ok: true, known, unknown, intersection: inter, physicalToleranceUsed: toleranceUsed };
    } finally {
      if (context) context._activeCritKey = prevKey;
    }
  }

  // `intersectIntervalTol(a, b, tolerance)` trata `a` ausente (`null`) como
  // "sem restrição ainda" — correto na primeira iteração, mas ambíguo com "a
  // interseção já colapsou". Sem o flag `started`, um colapso real no meio da
  // lista seria "revivido" pelo próximo intervalo (que veria o acumulador
  // `null` e o aceitaria livremente), mascarando hits fisicamente
  // incompatíveis em vez de reprovar o bloco inteiro (S-004/S-005). Vazio é
  // terminal: retorna assim que a interseção colapsa, sem esperar o resto da
  // lista. `tolerance` é aplicada par a par (não expande cada intervalo
  // individualmente antes da cadeia), para não acumular folga extra em
  // blocos de 3+ hits.
  function intersectIntervals(intervals, tolerance) {
    let out = null;
    let started = false;
    for (const iv of intervals || []) {
      if (!started) { out = iv; started = true; continue; }
      out = intersectIntervalTol(out, iv, tolerance);
      if (!out) return null;
    }
    return out;
  }

  function elementalClusterTolerance(center) {
    const c = Math.max(1, Math.abs(+center || 0));
    return Math.min(ELEMENTAL_CLUSTER_MAX_TOLERANCE, Math.max(ELEMENTAL_CLUSTER_MIN_TOLERANCE, Math.ceil(c * ELEMENTAL_CLUSTER_RATIO)));
  }

  function minimalCandidateCluster(sets) {
    const clean = (sets || [])
      .map((set, idx) => ({ idx, values: sortedUnique((set || []).filter(v => Number.isFinite(v)).map(v => Math.round(v))) }))
      .filter(x => x.values.length);
    if (!clean.length || clean.length !== (sets || []).length) return null;

    let best = null;
    for (const anchor of clean) {
      for (const base of anchor.values) {
        const chosen = [];
        let min = base, max = base;
        for (const item of clean) {
          const vals = item.values;
          let pick = vals[0];
          let dist = Math.abs(vals[0] - base);
          for (let i = 1; i < vals.length; i++) {
            const d = Math.abs(vals[i] - base);
            if (d < dist || (d === dist && vals[i] < pick)) { pick = vals[i]; dist = d; }
          }
          chosen[item.idx] = pick;
          if (pick < min) min = pick;
          if (pick > max) max = pick;
        }
        const span = max - min;
        const center = (min + max) / 2;
        if (!best || span < best.span || (span === best.span && Math.abs(center - base) < Math.abs(best.center - base))) {
          best = { min, max, span, center, chosen };
        }
      }
    }
    return best;
  }


  function addCandidateOriginalsForMode(map, ev, mode) {
    if (!ev || !ev.known || !ev.originals || !ev.originals.length) return;
    for (const o of ev.originals) {
      const key = Math.round(o);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(mode);
    }
  }

  function validateTerraBurstBonusBlock(block, element, context) {
    if (!isTerraBurstBlock(block, element)) return null;
    const levels = context && context.terraBurstBonusLevel
      ? [+context.terraBurstBonusLevel]
      : TERRA_BURST_BONUS_LEVELS.slice();
    const results = [];

    for (const level of levels) {
      const sets = [];
      const perHit = [];
      let known = 0, unknown = 0, noCandidate = 0;
      for (const h of (block.hits || []).filter(h => !h.overkill)) {
        const off = elementalOriginalCandidates(h, element, context, { terraBurstBonusMultiplier: 1 });
        const on = elementalOriginalCandidates(h, element, context, { terraBurstBonusMultiplier: level });
        if ((!off || !off.known) && (!on || !on.known)) { unknown++; continue; }
        const map = new Map();
        addCandidateOriginalsForMode(map, off, { active: false, multiplier: 1, ev: off });
        addCandidateOriginalsForMode(map, on, { active: true, multiplier: level, ev: on });
        const originals = Array.from(map.keys()).sort((a, b) => a - b);
        if (!originals.length) { noCandidate++; sets.push([]); perHit.push({ hit: h, originals: [], modesByOriginal: map, off, on }); known++; continue; }
        sets.push(originals);
        perHit.push({ hit: h, originals, modesByOriginal: map, off, on });
        known++;
      }

      if (noCandidate || !sets.length || sets.some(s => !s.length)) {
        results.push({ ok: false, level, known, unknown, noCandidate, reason: 'terra_burst_bonus_no_candidate' });
        continue;
      }

      const inter = intersectSets(sets, 2);
      if (inter.length) {
        const chosen = sets.map(set => set.find(o => inter.includes(o)) || set[0]);
        results.push({ ok: true, level, known, unknown, intersection: inter, chosen, perHit, reason: 'terra_burst_bonus_intersection' });
        continue;
      }

      const cluster = minimalCandidateCluster(sets);
      if (cluster) {
        const clusterTolerance = elementalClusterTolerance(cluster.center);
        if (cluster.span <= clusterTolerance) {
          results.push({ ok: true, level, known, unknown, intersection: [], elementalCluster: true, cluster, perHit, reason: 'terra_burst_bonus_cluster' });
        } else {
          results.push({ ok: false, level, known, unknown, reason: 'terra_burst_bonus_cluster_span_too_wide', cluster, tolerance: clusterTolerance, perHit });
        }
      } else {
        results.push({ ok: false, level, known, unknown, reason: 'terra_burst_bonus_no_cluster' });
      }
    }

    const sorted = results.slice().sort((a, b) => {
      if (!!a.ok !== !!b.ok) return a.ok ? -1 : 1;
      const as = a.cluster ? a.cluster.span : (a.intersection && a.intersection.length ? 0 : Infinity);
      const bs = b.cluster ? b.cluster.span : (b.intersection && b.intersection.length ? 0 : Infinity);
      if (as !== bs) return as - bs;
      // Prefer the highest global level if it is the only way to keep a tight cluster;
      // this matches the observed 2497 darklight matter Terra Burst bonus case.
      return (b.level || 0) - (a.level || 0);
    });
    const best = sorted[0];
    if (best && best.ok) {
      const chosenOriginals = best.cluster ? best.cluster.chosen : best.chosen;
      const perHitDiag = (best.perHit || []).map((x, i) => {
        const original = chosenOriginals[i];
        const modes = (x.modesByOriginal && x.modesByOriginal.get(Math.round(original))) || [];
        const preferred = modes.find(m => m.active) || modes[0] || { active: false, multiplier: 1 };
        x.hit.terraBurstBonusActive = !!preferred.active;
        x.hit.terraBurstBonusMultiplier = preferred.multiplier || 1;
        return {
          dmg: x.hit.dmg,
          mob: x.hit.mob,
          original,
          originals: x.originals,
          terraBurstBonusActive: !!preferred.active,
          terraBurstBonusMultiplier: preferred.multiplier || 1,
        };
      });

      // Overkill hits are excluded from the level inference above (their shown damage is
      // truncated by the target's remaining HP, not a real computed step), but they still
      // need a tier assignment for the rotation table. Re-test the off/on hypotheses at the
      // block's already-chosen level: if only one hypothesis yields a valid reversal for the
      // truncated value, that resolves the tier; otherwise leave it unresolved (null) rather
      // than invent confidence the data doesn't support (D2/M-TERRA-BURST-BONUS).
      for (const h of (block.hits || []).filter(h => h.overkill)) {
        const off = elementalOriginalCandidates(h, element, context, { terraBurstBonusMultiplier: 1 });
        const on = elementalOriginalCandidates(h, element, context, { terraBurstBonusMultiplier: best.level });
        const offOk = !!(off && off.known && off.originals && off.originals.length);
        const onOk = !!(on && on.known && on.originals && on.originals.length);
        if (offOk !== onOk) {
          h.terraBurstBonusActive = onOk;
          h.terraBurstBonusMultiplier = onOk ? best.level : 1;
        } else {
          h.terraBurstBonusActive = null;
          h.terraBurstBonusMultiplier = null;
        }
      }

      return {
        ok: true,
        known: best.known,
        unknown: best.unknown,
        intersection: best.intersection || [],
        element,
        tolerance: 2,
        terraBurstBonus: true,
        terraBurstBonusLevel: best.level,
        terraBurstBonusGlobalLevel: best.level,
        elementalCluster: !!best.elementalCluster,
        cluster: best.cluster ? {
          min: best.cluster.min,
          max: best.cluster.max,
          span: best.cluster.span,
          center: best.cluster.center,
          tolerance: elementalClusterTolerance(best.cluster.center),
          chosenOriginals,
          perHit: perHitDiag,
        } : null,
        terraBurstBonusCandidates: sorted.map(r => ({
          level: r.level,
          ok: !!r.ok,
          reason: r.reason,
          span: r.cluster && r.cluster.span,
          min: r.cluster && r.cluster.min,
          max: r.cluster && r.cluster.max,
          tolerance: r.cluster && elementalClusterTolerance(r.cluster.center),
        })),
        reason: best.reason === 'terra_burst_bonus_intersection' ? 'terra_burst_bonus_intersection' : 'terra_burst_bonus_cluster',
        rule: 'M-TERRA-BURST-BONUS/S-004/S-005',
      };
    }
    return {
      ok: false,
      rule: 'M-TERRA-BURST-BONUS/S-004/S-005',
      reason: 'terra_burst_bonus_failed',
      element,
      terraBurstBonusCandidates: sorted.map(r => ({
        level: r.level,
        ok: !!r.ok,
        reason: r.reason,
        span: r.cluster && r.cluster.span,
        min: r.cluster && r.cluster.min,
        max: r.cluster && r.cluster.max,
        tolerance: r.cluster && elementalClusterTolerance(r.cluster.center),
      })),
    };
  }

  function validateElementalBlock(block, element, context) {
    const prevCritKey = context && context._activeCritKey;
    if (context) context._activeCritKey = critKeyForBlock(block);
    try {
    if (!element || element === 'unknown') return { ok: true, known: 0, unknown: block.hits.length, reason: 'unknown_action_element' };
    if (element === 'physical') return validatePhysicalBlock(block, context);
    // V26: Terra Burst / exevo ulus tera has a global bonus level (+20/+40/+60),
    // but activation is per mob/hit. Test active=false/true per hit under one
    // global level before falling back to generic elemental cluster logic.
    const terraBurst = validateTerraBurstBonusBlock(block, element, context);
    if (terraBurst && terraBurst.ok) return terraBurst;
    const sets = [];
    const perHit = [];
    let known = 0, unknown = 0;
    for (const h of block.hits.filter(h => !h.overkill)) {
      const ev = elementalOriginalCandidates(h, element, context);
      if (!ev || !ev.known) { unknown++; continue; }
      if (!ev.originals || !ev.originals.length) return { ok: false, rule: 'D-003/S-004', reason: 'elemental_no_candidate', element, known, unknown };
      sets.push(ev.originals);
      perHit.push({ hit: h, originals: ev.originals, intermediateToleranceUsed: ev.intermediateToleranceUsed || 0, mod: ev.mod, mitigation: ev.mitigation, post: ev.post });
      known++;
    }
    // S-004a/D-010a: hits do MESMO mob no MESMO estado de modificadores (EW, prey,
    // amplification, crit-flags) têm inversão exata — mesmo componente ⇒ mesmo dano
    // final. A tolerância de interseção existe só para o resíduo discreto entre mobs
    // ou entre estados (f16 da mitigation); dentro do mesmo (mob, estado), conjuntos
    // de originais disjuntos são fronteira obrigatória (S-005) e o bloco é inválido —
    // o cluster (V24) não pode resgatá-lo. Caso-prova: mazzerinbarrage 23:46:36,
    // darklight matter+EW F=986 ⇒ O={982} vs F=987 ⇒ O={983} sob P=1.
    const stateGroups = new Map();
    for (const ph of perHit) {
      const h = ph.hit;
      const key = elementalStateKey(h);
      if (!stateGroups.has(key)) stateGroups.set(key, []);
      stateGroups.get(key).push(ph);
    }
    for (const group of stateGroups.values()) {
      if (group.length < 2) continue;
      const exact = intersectSets(group.map(x => x.originals), 0);
      if (!exact.length) {
        return {
          ok: false,
          rule: 'S-004/S-005/D-010a/H-001',
          reason: 'same_mob_state_exact_original_mismatch',
          element, known, unknown,
          group: group.map(x => ({ mob: x.hit.mob, dmg: x.hit.dmg, originals: x.originals })),
        };
      }
    }
    // D-010/S-004: a reconstrução elemental é discreta, mas diferenças pequenas
    // podem surgir de arredondamento de mitigação/prey/mods pós-cutoff. Para runa
    // com Using explícito (M-017/M-018a), a linha de execução é sinal primário e
    // aceitamos uma tolerância um pouco maior no original para absorver diferenças
    // discretas entre mobs/mitigação sem transformar quantidade de hits em critério.
    const tolerance = (block && block.comp === 'rune' && block.action) ? 4 : 2;
    const inter = intersectSets(sets, tolerance);
    if (sets.length && inter.length) return { ok: true, known, unknown, intersection: inter, element, tolerance };

    // V24: cluster elemental controlado. Só entra quando existe ação concreta
    // confirmada (cast do selectedSpeaker ou Using de runa). A interseção exata pode
    // falhar por poucos pontos entre mobs diferentes, mas o bloco ainda precisa formar
    // um intervalo pequeno de originais e todos os hits precisam ter candidato dentro
    // desse intervalo. Sem ação concreta, não há cluster para evitar transformar AA
    // físico variável em spell/runa por semelhança de dano.
    const concreteAction = !!(block && block.action && (block.comp === 'spell' || block.comp === 'rune' || block.comp === 'grenade'));
    if (sets.length && concreteAction) {
      const cluster = minimalCandidateCluster(sets);
      if (cluster) {
        const clusterTolerance = elementalClusterTolerance(cluster.center);
        if (cluster.span <= clusterTolerance) {
          return {
            ok: true,
            known,
            unknown,
            intersection: [],
            element,
            tolerance,
            elementalCluster: true,
            cluster: {
              min: cluster.min,
              max: cluster.max,
              span: cluster.span,
              center: cluster.center,
              tolerance: clusterTolerance,
              chosenOriginals: cluster.chosen,
              perHit: perHit.map((x, i) => ({
                dmg: x.hit.dmg,
                mob: x.hit.mob,
                original: cluster.chosen[i],
                originals: x.originals,
                intermediateToleranceUsed: x.intermediateToleranceUsed,
              })),
            },
            reason: 'elemental_cluster_concrete_action',
            rule: 'S-004/S-005/H-001-cluster',
          };
        }
        return { ok: false, rule: 'S-004/S-005/H-001', reason: 'elemental_cluster_span_too_wide', element, known, unknown, tolerance, cluster: { min: cluster.min, max: cluster.max, span: cluster.span, center: cluster.center, tolerance: clusterTolerance, chosenOriginals: cluster.chosen } };
      }
    }

    if (sets.length && !inter.length) return { ok: false, rule: 'S-004/S-005/H-001', reason: 'elemental_intersection_empty', element, known, unknown, tolerance };
    return { ok: true, known, unknown, intersection: inter, element, tolerance };
    } finally {
      if (context) context._activeCritKey = prevCritKey;
    }
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
      const run = () => validateElementalBlock(block, 'holy', context);
      if (block.gravSanActive === true || block.gravSanActive === false) {
        return withGravSanBlockMode(context, block, block.gravSanActive, run);
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
  // de hits "limpos" (sem overkill/crit/onslaught/lowBlow/prey/EW — garante post=1 e
  // crit=1 no subconjunto), e usa esse subconjunto como bloco de prova quando tem
  // >=2 hits de >=2 mobs distintos. Não exige que TODO hit do componente seja limpo
  // (validado empiricamente: exigir isso elimina o sinal em turnos RP reais, que quase
  // sempre misturam crit e não-crit no mesmo componente `arrow`) — só o subconjunto
  // limpo precisa ser suficiente. Hits crit/Onslaught/prey ficam de fora do
  // subconjunto, o que já evita reaproveitar a ambiguidade do Eixo 2-físico (AA x
  // Ethereal Barrage) como prova de BM.
  function physicalRpPierceProbeSubset(block) {
    if (!block || block.comp !== 'arrow' || !block.hits) return null;
    const clean = block.hits.filter(h => h && !h.overkill && !h.realCrit && !h.onslaught && !h.lowBlow && !h.isPrey && !h.exposeWeakness);
    if (clean.length < 2) return null;
    if (distinctMainMobCount(clean) < 2) return null;
    return { comp: 'arrow', hits: clean };
  }

  function bmPhysicalDeterministicVerdict(block, context, pierce) {
    const previous = context.bmPierce;
    context.bmPierce = pierce;
    try {
      return validatePhysicalBlock(block, context);
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

  function validateLeechBlock(block, context, turn) {
    const main = (block.hits || []).filter(isMainHit);
    const k = main.length;
    if (!k) return { ok: true, usable: false, k: 0 };
    const setup = context && context.leechSetup;
    if (leechSetupConfidence(setup) === 'unknown') return { ok: true, usable: false, k, reason: 'leech_setup_unknown' };
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return { ok: true, usable: false, k, reason: 'setup_unknown' };

    // M-016d/D-023: cada explosão de uma ação multiestágio dilui leech pela
    // própria cardinalidade. A agregação pública continua sendo um único spell,
    // mas N_leech nunca é fundido entre primary e echo.
    const stageIds = sortedUnique(main.map(h => h.multiStageStage).filter(Boolean));
    if (stageIds.length) {
      const groups = [];
      const primaryId = stageIds.includes('primary') ? 'primary' : stageIds[0];
      for (const stageId of stageIds) {
        const stageHits = main.filter(h => h.multiStageStage === stageId || (stageId === primaryId && !h.multiStageStage));
        if (!stageHits.length) continue;
        const stageBlock = Object.assign({}, block, { hits: stageHits });
        groups.push({ stageId, result: validateLeechBlockForN(stageBlock, context, stageHits.length) });
      }
      const fits = groups.flatMap(g => g.result.fits || []);
      const failed = groups.flatMap(g => g.result.failed || []);
      const cappedLow = groups.flatMap(g => g.result.cappedLow || []);
      return {
        ok: groups.every(g => g.result.ok || !g.result.usable),
        usable: groups.some(g => g.result.usable),
        k,
        visibleMainHits: k,
        fits,
        failed,
        cappedLow,
        multiStage: true,
        reason: 'multistage_leech_cardinality_per_explosion',
        rule: groups.every(g => g.result.ok || !g.result.usable) ? null : 'M-016d/D-023/D-024/S-014',
      };
    }

    const base = validateLeechBlockForN(block, context, k);
    if (base.ok || !(base.usable)) return base;

    // V12: componente de área pode ter hit principal invisível quando um charm/proc
    // entra antes do dano do hit que o ativou e mata o alvo. Nesse caso os hits
    // visíveis dizem que N_leech é maior que K_visível. Só aceitamos N>K se houver
    // charm/proc elegível explicando cada hit virtual. Ex.: S5 visível, mas leech
    // fecha N=6 e há Overpower Charm no mesmo timestamp => S5 S0×1.
    const virtualEligible = canUseLeechAsHardReject(context) ? eligibleVirtualZeroCharmsForBlock(turn, block, context) : [];
    if (canUseVirtualZeroForBlock(block) && virtualEligible.length) {
      const maxExtra = Math.min(2, virtualEligible.length);
      for (let extra = 1; extra <= maxExtra; extra++) {
        const nMechanical = k + extra;
        const trial = validateLeechBlockForN(block, context, nMechanical);
        if (trial.usable && trial.ok) {
          const action = block.action || (turn && turn.actions && chooseActionForComponent(block.comp, block.hits, turn.actions));
          const virtuals = virtualEligible.slice(0, extra).map((ch, idx) => makeVirtualZeroHitForCharm(turn, action, ch, idx, block));
          trial.visibleMainHits = k;
          trial.kVisible = k;
          trial.kMechanical = nMechanical;
          trial.virtualZeroHits = virtuals;
          trial.virtualZeroSourceCharms = virtualEligible.slice(0, extra);
          trial.reason = 'leech_requires_virtual_zero_hit_explained_by_charm';
          trial.rule = null;
          return trial;
        }
      }
    }

    return base;
  }

  function validateLeechBlockForN(block, context, n) {
    const main = (block.hits || []).filter(isMainHit);
    const setup = context && context.leechSetup;
    const fits = main.map(h => ({ hit: h, fit: hitLeechFit(h, setup, n, block, context) }));
    const usable = fits.filter(x => x.fit.usable);
    if (!usable.length) return {
      ok: true,
      usable: false,
      k: n,
      visibleMainHits: main.length,
      fits,
      noLeechEvidence: true,
      reason: 'no_leech_evidence_neutral_full_resource_or_no_gain_lines',
    };
    const failed = usable.filter(x => !x.fit.ok && !x.fit.cappedLow);
    const cappedLow = usable.filter(x => !x.fit.ok && x.fit.cappedLow);
    const consensus = leechConsensusVerdictFromFits(fits, n);
    const usedSpellLeechBonuses = sortedUnique(fits.flatMap(x => {
      const checks = x && x.fit && x.fit.official && x.fit.official.checks || [];
      return checks.flatMap(ch => (ch.matches || []).map(m => +m.spellBonus || 0).filter(v => v > 0));
    }));
    return {
      ok: consensus.ok,
      usable: true,
      k: n,
      visibleMainHits: main.length,
      fits,
      failed,
      cappedLow,
      consensus,
      spellLeechBonusEntry: spellLeechBonusEntryForBlock(block),
      spellLeechBonusOptions: {
        life: spellLeechBonusOptionsForBlock(block, 'life'),
        mana: spellLeechBonusOptionsForBlock(block, 'mana'),
      },
      usedSpellLeechBonuses,
      rule: consensus.ok ? null : 'D-023/D-024/D-025/S-014/H-003',
    };
  }



  function gravSanModesForBlock(block, context) {
    const setup = context && context.gravSanSetup;
    if (!setup || !(setup.bonus > 0)) return [null];
    const hits = (block && block.hits || []).filter(isMainHit);
    if (!hits.some(h => gravSanHitInWindow(context, h))) return [null];
    return [true, false];
  }

  function withGravSanBlockMode(context, block, active, fn) {
    if (active == null) return fn();
    const previous = context.gravSanHitOverride;
    const next = Object.assign({}, previous || {});
    for (const h of (block && block.hits || [])) {
      if (h && h.id != null && gravSanHitInWindow(context, h)) next[h.id] = !!active;
    }
    context.gravSanHitOverride = next;
    try { return fn(); }
    finally {
      if (previous === undefined) delete context.gravSanHitOverride;
      else context.gravSanHitOverride = previous;
    }
  }

  function blockValidationScoreForMode(result) {
    const det = result && result.deterministic || {};
    const leech = result && result.leech || {};
    const consensus = leech && leech.consensus || {};
    return {
      ok: (det.ok ? 1 : 0) + ((leech.ok || !leech.usable) ? 1 : 0),
      deterministicKnown: det.known || 0,
      leechOk: consensus.okCount || 0,
      leechContradictions: consensus.failedCount || consensus.contradictionCount || 0,
      cappedLow: consensus.cappedLowCount || 0,
    };
  }

  function compareBlockModeResult(a, b) {
    const A = blockValidationScoreForMode(a), B = blockValidationScoreForMode(b);
    if (A.ok !== B.ok) return B.ok - A.ok;
    if (A.deterministicKnown !== B.deterministicKnown) return B.deterministicKnown - A.deterministicKnown;
    if (A.leechOk !== B.leechOk) return B.leechOk - A.leechOk;
    if (A.leechContradictions !== B.leechContradictions) return A.leechContradictions - B.leechContradictions;
    if (A.cappedLow !== B.cappedLow) return A.cappedLow - B.cappedLow;
    // Preferir sem buff em empate real dentro da janela do cast. Isso evita aplicar
    // utevo grav san a hits que ocorreram antes de o personagem efetivamente ganhar
    // o tapete, especialmente no mesmo segundo do cast.
    if (a.gravSanActive !== b.gravSanActive) {
      if (a.gravSanActive === false) return -1;
      if (b.gravSanActive === false) return 1;
    }
    return 0;
  }

  function validateBlockDeterministicAndLeechWithGravModes(block, element, context, turn) {
    const modes = gravSanModesForBlock(block, context);
    const results = [];
    for (const mode of modes) {
      const result = withGravSanBlockMode(context, block, mode, () => {
        const det = block.comp === 'arrow' ? validatePhysicalBlock(block, context) : validateElementalBlock(block, element, context);
        const leech = validateLeechBlock(block, context, turn);
        return { deterministic: det, leech, gravSanActive: mode, gravSanTested: mode != null };
      });
      results.push(result);
    }
    results.sort(compareBlockModeResult);
    const best = results[0] || { deterministic: { ok: true }, leech: { ok: true, usable: false }, gravSanActive: null, gravSanTested: false };
    best.gravSanModeCandidates = results.map(r => ({
      active: r.gravSanActive,
      deterministic: r.deterministic,
      leech: r.leech ? {
        ok: r.leech.ok,
        usable: r.leech.usable,
        k: r.leech.k,
        consensus: r.leech.consensus,
        usedSpellLeechBonuses: r.leech.usedSpellLeechBonuses,
      } : null,
    }));
    return best;
  }

  function validateLeechBlockOfficialRates(block, context) {
    const main = (block.hits || []).filter(isMainHit);
    const k = main.length;
    if (!k) return { ok: true, usable: false, k: 0, officialRateMode: true };
    const setup = context && context.leechSetup;
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return { ok: true, usable: false, k, reason: 'setup_unknown', officialRateMode: true };
    const fits = main.map(h => ({ hit: h, fit: hitAcceptsLeechNAnyOfficialRate(h, setup, k, block) }));
    const usable = fits.filter(x => x.fit.usable);
    if (!usable.length) return {
      ok: true,
      usable: false,
      k,
      fits,
      officialRateMode: true,
      noLeechEvidence: true,
      reason: 'no_leech_evidence_neutral_full_resource_or_no_gain_lines',
    };
    const failed = usable.filter(x => !x.fit.ok && !x.fit.cappedLow);
    const cappedLow = usable.filter(x => !x.fit.ok && x.fit.cappedLow);
    const consensus = leechConsensusVerdictFromFits(fits, k);
    return {
      ok: consensus.ok,
      usable: true,
      k,
      fits,
      failed,
      cappedLow,
      consensus,
      officialRateMode: true,
      rule: consensus.ok ? null : 'D-023/D-024/D-025/S-014/H-003',
    };
  }

  function validateCandidate(candidate, turn, actions, context) {
    const diagnostics = [];
    const violations = [];
    const vocation = context.vocation;
    const isRp = vocation === 'paladin' || context.isRp;
    const isBoss = context.bossMobs && turn.hits.every(h => context.bossMobs.has(normalizeName(h.mob)));

    // Attach actions.
    for (const block of candidate.components) {
      block.action = chooseActionForComponent(block.comp, block.hits, actions);
      if (block.comp === 'spell' && !block.action) violations.push({ rule: 'M-011/N-003', reason: 'spell_without_concrete_cast', block });
      if (block.comp === 'rune' && !block.action) violations.push({ rule: 'M-017/N-005', reason: 'rune_without_using', block });
      if (block.comp === 'rune' && block.action) {
        const runeBoundary = validateRuneUsingBoundary(block, block.action, actions);
        if (!runeBoundary.ok) violations.push(Object.assign({ block }, runeBoundary));
      }
      if (block.comp === 'grenade' && !block.action) violations.push({ rule: 'M-023/N-004', reason: 'grenade_without_cast', block });
      if (block.comp === 'grenade' && block.action) {
        const okImpact = block.hits.every(h => h.ts >= block.action.ts + 2 && h.ts <= block.action.ts + 4);
        const timestamps = new Set(block.hits.map(h => h.ts));
        if (!okImpact) violations.push({ rule: 'M-023', reason: 'grenade_outside_impact_window', block });
        if (timestamps.size > 1) violations.push({ rule: 'M-024/M-025', reason: 'grenade_multiple_impact_timestamps', block });
      }
    }

    if (candidate.shape.includes('spell') && candidate.shape.includes('rune')) violations.push({ rule: 'T-006/M-019', reason: 'spell_and_rune_same_turn' });

    // Cardinalidade dura.
    for (const block of candidate.components) {
      const count = block.hits.length;
      if (block.comp === 'arrow' && count > 1 && (!isRp || isBoss)) violations.push({ rule: 'M-031/M-032/V-006', reason: 'multiple_arrow_hits_not_allowed', block });
      if (isBoss && block.comp !== 'arrow' && count > 1) violations.push({ rule: 'M-009/V-006', reason: 'boss_multi_hit_single_action', block });
      if (!isBoss && block.comp === 'grenade' && count === 1 && candidate.components.length > 1) violations.push({ rule: 'M-030/M-026', reason: 'grenade_isolated_single_hit_in_pack', block });
      if (isSingleTargetAction(block.comp, block.action) && count > 1) violations.push({ rule: 'M-006/M-033', reason: 'single_target_multi_hit', block });
    }

    // Cooldown AA entre hits classificados como arrow, quando não é uma única instância RP de área.
    const arrowBlocks = candidate.components.filter(b => b.comp === 'arrow');
    if (arrowBlocks.length > 1) violations.push({ rule: 'M-002/M-003', reason: 'two_arrow_components_same_turn' });

    for (const block of candidate.components) {
      const crit = validateCritHomogeneity(block);
      if (!crit.ok) violations.push(Object.assign({ block }, crit));
      const action = block.action;
      let element = 'unknown';
      if (block.comp === 'spell' || block.comp === 'grenade') element = action && action.profile ? action.profile.element : 'unknown';
      if (block.comp === 'rune') element = action && action.profile ? action.profile.element : 'unknown';

      const modeResult = validateBlockDeterministicAndLeechWithGravModes(block, element, context, turn);
      const det = modeResult.deterministic;
      const leech = modeResult.leech;
      block.gravSanActive = modeResult.gravSanActive;
      block.gravSanTested = modeResult.gravSanTested;
      block.gravSanModeCandidates = modeResult.gravSanModeCandidates;
      block.deterministic = det;
      diagnostics.push({ kind: 'deterministic', block, result: det, gravSanActive: block.gravSanActive, gravSanTested: block.gravSanTested });
      if (!det.ok) violations.push(Object.assign({ block }, det));

      if (leech && leech.virtualZeroHits && leech.virtualZeroHits.length) {
        block.virtualZeroHits = leech.virtualZeroHits;
        block.hits = block.hits.concat(leech.virtualZeroHits);
      }
      block.leech = leech;
      diagnostics.push({ kind: 'leech', block, result: leech, gravSanActive: block.gravSanActive, gravSanTested: block.gravSanTested });
      if (context.strictLeech !== false && canUseLeechAsHardReject(context) && leech.usable && !leech.ok) {
        // M-017/M-018a: com Using explícito, fronteira correta e bloco elemental
        // determinístico, a runa tem precedência sobre leitura física coincidente.
        // Leech discordante fica como diagnóstico, não como veto, porque pode vir
        // de cap, setup/minor-charm inferido incorretamente ou recursos cheios.
        if (block.comp === 'rune' && block.action && det.ok) {
          block.leechPrecedenceOverride = true;
          block.leechOverrideReason = 'rune_using_elemental_precedence_over_leech_mismatch';
          leech.overriddenByRuneUsingPrecedence = true;
          leech.overrideReason = block.leechOverrideReason;
        } else if (shouldOverrideSparseLeechForConcreteDeterministicSpell(block, det, leech)) {
          block.leechPrecedenceOverride = true;
          block.leechOverrideReason = 'concrete_deterministic_spell_sparse_leech_without_contradiction';
          leech.overriddenByConcreteSpellSparseLeech = true;
          leech.overrideReason = block.leechOverrideReason;
        } else {
          violations.push({ rule: leech.rule, reason: 'leech_cardinality_failed', block, leech });
        }
      }
    }

    // M-031: um bloco de granada só é válido se seu original holy for DISTINTO do bloco
    // de spell do mesmo turno. Se os originais holy dos dois blocos se sobrepõem, a
    // "granada" é o spell atravessando timestamp (mesmo original = mesmo componente) —
    // ex.: mk 05:42:01, Divine Caldera crit O_holy 1390 fatiado em spell(:01)+granada(:02).
    // Distinção = ranges de original disjuntos (mesma reconstrução do H-001, sem limiar novo).
    const blockElement = b => (b && b.action && b.action.profile) ? b.action.profile.element : 'unknown';
    const blockHolyRange = b => {
      const d = b && b.deterministic;
      if (!d) return null;
      if (Array.isArray(d.intersection) && d.intersection.length) return [d.intersection[0], d.intersection[d.intersection.length - 1]];
      if (d.cluster && Number.isFinite(+d.cluster.min) && Number.isFinite(+d.cluster.max)) return [+d.cluster.min, +d.cluster.max];
      return null;
    };
    const spellBlk = candidate.components.find(b => b.comp === 'spell' && blockElement(b) === 'holy');
    const grenBlk = candidate.components.find(b => b.comp === 'grenade' && blockElement(b) === 'holy');
    if (spellBlk && grenBlk) {
      const sr = blockHolyRange(spellBlk), gr = blockHolyRange(grenBlk);
      if (sr && gr && sr[0] <= gr[1] && gr[0] <= sr[1]) {
        // Override 1 (cast+timestamp): dois casts concretos e distintos, e nenhum hit
        // de um bloco compartilha timestamp com o outro — não há travessia de segundo
        // para o M-031 proteger contra. Prova: barrage 19:02:09 (Caldera cast 19:02:09,
        // hits só em :09; Grenade cast 19:02:07, hits só em :10, dentro de [c+2,c+4]).
        const distinctCasts = !!(spellBlk.action && grenBlk.action && spellBlk.action.ts !== grenBlk.action.ts);
        const spellTsSet = new Set(spellBlk.hits.map(h => h.ts));
        const noSharedTs = distinctCasts && !grenBlk.hits.some(h => spellTsSet.has(h.ts));

        // Override 2 (dano final por mob+estado): só entra quando o override 1 não se
        // aplica (blocos compartilham timestamp, sem borda temporal para apoiar a
        // distinção). Compara dano final (não-overkill) por mob+estado compartilhado
        // entre os dois blocos — precisa de unanimidade: qualquer par compartilhado com
        // dano IDÊNTICO é evidência de que é o mesmo evento (mesmo princípio do caso-prova
        // mk 05:42:01) e mantém o veto; sem nenhuma chave compartilhada, sem override
        // (fail-safe).
        let finalDamageDistinct = false;
        if (!noSharedTs) {
          const byKey = hits => {
            const m = new Map();
            for (const h of hits) { if (h.overkill) continue; const k = elementalStateKey(h); if (!m.has(k)) m.set(k, h.dmg); }
            return m;
          };
          const spellByKey = byKey(spellBlk.hits), grenByKey = byKey(grenBlk.hits);
          const sharedKeys = [...spellByKey.keys()].filter(k => grenByKey.has(k));
          finalDamageDistinct = sharedKeys.length > 0 && sharedKeys.every(k => spellByKey.get(k) !== grenByKey.get(k));
        }

        if (!noSharedTs && !finalDamageDistinct) {
          violations.push({ rule: 'M-031', reason: 'grenade_original_not_distinct_from_spell', block: grenBlk });
        }
      }
    }

    if (violations.length) return { ok: false, violations, diagnostics, candidate };

    const score = scoreCandidate(candidate, actions, context);
    return { ok: true, violations, diagnostics, candidate, score };
  }

  function timestampSplitPenalty(candidate) {
    // Penaliza fronteiras de componente que cortam hits dentro do mesmo timestamp.
    // Ex.: S11 em 19:02:09 e G9 em 19:02:10 => 0.
    //      S12 pegando o primeiro hit de 19:02:10 e G8 pegando o resto => 1.
    let penalty = 0;
    const cuts = candidate && candidate.cuts || [];
    const components = candidate && candidate.components || [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const left = components[i] && components[i].hits && components[i].hits[components[i].hits.length - 1];
      const right = components[i + 1] && components[i + 1].hits && components[i + 1].hits[0];
      if (left && right && left.ts === right.ts) penalty++;
    }
    return penalty;
  }

  // H-005: o prefixo `arrow` é absorvível (sem evidência positiva de AA) quando,
  // unido ao bloco elemental seguinte, ainda forma um bloco holy homogêneo —
  // mesmo segundo, mesmo crit-state e interseção elemental exata. Nesse caso o
  // prior AA-first NÃO deve separar um AA fantasma. Conservador: só dispara para
  // bloco seguinte elemental (não físico/unknown), preservando o eixo físico
  // (Ethereal Barrage) e qualquer evidência distinta.
  function arrowPrefixIsAbsorbable(comps, context) {
    const arrow = comps[0];
    const next = comps[1];
    if (!arrow || !next || arrow.comp !== 'arrow') return false;
    if (!(next.comp === 'spell' || next.comp === 'rune' || next.comp === 'grenade')) return false;
    const element = next.action && next.action.profile ? next.action.profile.element : 'unknown';
    if (!element || element === 'unknown' || element === 'physical') return false;

    const arrowMain = (arrow.hits || []).filter(h => !h.overkill);
    const nextMain = (next.hits || []).filter(h => !h.overkill);
    if (!arrowMain.length || !nextMain.length) return false;

    // (a) timing: prefixo num segundo estritamente anterior => separação => evidência.
    const maxArrowTs = Math.max.apply(null, arrowMain.map(h => h.ts));
    const minNextTs = Math.min.apply(null, nextMain.map(h => h.ts));
    if (maxArrowTs < minNextTs) return false;

    // (b) crit-state distinto na fronteira => componente diferente => evidência.
    const critOf = h => !!(h.realCrit || h.onslaught || h.lowBlow);
    if (critOf(arrowMain[0]) !== critOf(nextMain[0])) return false;

    // (c) dano original: se a fusão prefixo+bloco mantém interseção elemental exata,
    // o prefixo é homogêneo com o bloco (sem original distinto) => absorvível.
    const merged = { comp: next.comp, action: next.action, hits: arrowMain.concat(nextMain), gravSanActive: next.gravSanActive };
    const det = validateElementalBlock(merged, element, context);
    return !!(det && det.ok && det.intersection && det.intersection.length);
  }

  // V-020 (docs/CLASSIFICATION_RULES.md, "Ethereal Barrage"): a fronteira do eixo
  // físico (AA × spell físico DE ÁREA, ex. exori dir moe) segue timestamp,
  // crit-state, intervalo físico e leech — NÃO o sinal genérico `timing`
  // (alinhamento cast↔centro-de-bloco). `timing` degenera quando o cast e todos os
  // hits do turno caem no mesmo segundo: `|action.ts − centerTs| <= 1` fica
  // verdadeiro para QUALQUER ponto de corte do bloco arrow→spell físico, então
  // `timing` deixa de discriminar fronteiras e vira só "tamanho do bloco de
  // spell" — um viés estrutural a favor de maximizar o bloco físico. A checagem é
  // sobre o conjunto de hits COMBINADO (arrow + spell) do candidato: para um dado
  // shape arrow>spell físico, esse conjunto é o mesmo turno inteiro independente de
  // onde o corte cai, então o resultado é idêntico para todo candidato desse shape
  // — não é uma heurística de "mesmo segundo" isolada por bloco. Restrito a
  // `topology === 'area'`: spells físicos single-target (ex. exori gran con,
  // Strong Ethereal Spear) têm ordem AA→spell própria (H-005) e não fazem parte
  // do eixo AA × Barrage — sem essa restrição o gate flipava turnos de
  // single-target físico incorretamente (ex. murcion ts=32155, exori gran con).
  function physicalAxisTimingDegenerate(candidate) {
    const comps = candidate.components || [];
    if (comps.length !== 2 || !comps[0] || comps[0].comp !== 'arrow') return false;
    const spellBlock = comps[1];
    if (!spellBlock || (spellBlock.comp !== 'spell' && spellBlock.comp !== 'rune')) return false;
    const action = spellBlock.action;
    const profile = action && action.profile;
    const element = profile && profile.element;
    const topology = profile && profile.topology;
    if (element !== 'physical' || topology !== 'area' || !action || !(action.ts >= 0)) return false;
    const allHits = (comps[0].hits || []).concat(spellBlock.hits || []);
    if (!allHits.length) return false;
    let minTs = Infinity, maxTs = -Infinity;
    for (const h of allHits) { if (h.ts < minTs) minTs = h.ts; if (h.ts > maxTs) maxTs = h.ts; }
    return minTs === maxTs && minTs === action.ts;
  }

  // docs/CLASSIFICATION_RULES.md S-017/S-018/S-019, H-001/H-003/H-004 (extensão ao
  // eixo físico — spec unified-scorer-evidence-combination, requisito "Componente
  // único do eixo físico compete com cortes AA+Barrage por leech"): `mechanicalOrder`
  // dá vantagem estrutural a QUALQUER corte `arrow>spell` físico sobre a hipótese de
  // componente único (`spell[n]`/`arrow[n]`, todo o turno num bloco só), mesmo quando
  // esse bloco único fecha `N_leech=n` perfeito (sem capped_low/contradição) e todo
  // corte concorrente é sistematicamente pior (leech capped_low em algum hit, para
  // toda fronteira testada). H-003 já exige que um bloco único de >=3 hits prove
  // `N_leech=k`, ou perca para uma partição que feche melhor — a direção simétrica
  // (partição perde para bloco único que feche melhor) está implícita no mesmo
  // enunciado (S-018) mas nunca era testada para o eixo físico porque
  // `mechanicalOrder` decidia antes. `physicalAxisSingleBlockAction`/
  // `physicalAxisSplitIsPhysical` identificam os dois lados da comparação;
  // `promotePhysicalAxisSingleBlockByLeech` reordena `candidates` só quando os dois
  // lados existem e o veredito de leech é unânime.
  function physicalAxisSingleBlockAction(comps) {
    if (!comps || comps.length !== 1) return false;
    const b = comps[0];
    if (b.comp === 'arrow') return true;
    if (b.comp !== 'spell') return false;
    const profile = b.action && b.action.profile;
    return !!(profile && profile.element === 'physical' && profile.topology === 'area');
  }

  function physicalAxisSplitIsPhysical(comps) {
    if (!comps || comps.length !== 2 || !comps[0] || comps[0].comp !== 'arrow') return false;
    const b = comps[1];
    if (!b || (b.comp !== 'spell' && b.comp !== 'rune')) return false;
    const profile = b.action && b.action.profile;
    return !!(profile && profile.element === 'physical' && profile.topology === 'area');
  }

  function promotePhysicalAxisSingleBlockByLeech(candidates) {
    const singleCandidates = candidates.filter(v => physicalAxisSingleBlockAction(v.candidate.components));
    if (!singleCandidates.length) return;
    const splitCandidates = candidates.filter(v => physicalAxisSplitIsPhysical(v.candidate.components));
    if (!splitCandidates.length) return;
    if (!splitCandidates.every(v => (v.score.cappedLowHits || 0) > 0)) return;

    const clean = singleCandidates.find(v => {
      const mainHits = (v.candidate.components[0].hits || []).filter(isMainHit);
      return mainHits.length >= 3 && v.score.leechContradictions === 0 && v.score.cappedLowHits === 0;
    });
    if (!clean) return;

    const idx = candidates.indexOf(clean);
    candidates.splice(idx, 1);
    candidates.unshift(clean);
  }

  // "Escolha da partição" (§5 de docs/CLASSIFICATION_RULES.md): a extensão
  // ELEMENTAL da degeneração de `timing`. Quando o cast de uma spell elemental
  // de área e todos os hits do turno caem no mesmo segundo, `timing` não
  // discrimina fronteiras (vira "tamanho do bloco de spell") e não pode decidir
  // o corte arrow×spell antes da consistência de leech (cappedLowHits).
  // Diferente do eixo físico (zerado acima), aqui o `timing` é REBAIXADO para
  // último desempate em compareValidated — não some: em empate total dos demais
  // sinais ele ainda resolve (evita inundar turnos hoje resolvidos com
  // `ambiguous_equal_best_partitions`). Escopo estreito: só candidato
  // arrow>spell (runa tem `Using` como sinal primário, M-017) e só quando NÃO há
  // ação ofensiva concorrente no turno (sem runa, sem granada, uma única
  // incantação de ataque) — entre AÇÕES diferentes o timing carrega informação
  // real de alinhamento (M-012/M-013) e escolher a ação não é o caso degenerado;
  // rebaixá-lo aí trocava spell↔granada e embaralhava a sessão de druid (uhax).
  // Caso-prova: mazzerinbarrage 23:46:36 — A12 S12 com leech 24/24 exato
  // (cappedLowHits=0) não pode perder para A11 S13 (cappedLowHits=13) só porque
  // o bloco de spell maior conta mais hits no segundo do cast.
  function elementalSameSecondTimingDemoted(candidate, actions) {
    const comps = candidate.components || [];
    if (comps.length !== 2 || !comps[0] || comps[0].comp !== 'arrow') return false;
    const spellBlock = comps[1];
    if (!spellBlock || spellBlock.comp !== 'spell') return false;
    const action = spellBlock.action;
    const profile = action && action.profile;
    const element = profile && profile.element;
    const topology = profile && profile.topology;
    if (!element || element === 'unknown' || element === 'physical' || topology !== 'area') return false;
    if (!action || !(action.ts >= 0)) return false;
    if (!actions || (actions.runeUses && actions.runeUses.length) || (actions.grenadeCasts && actions.grenadeCasts.length)) return false;
    const attackIncants = new Set((actions.spellCasts || [])
      .filter(c => (c.type || (c.profile && c.profile.type)) === 'attack')
      .map(c => normalizeName(c.text)));
    if (attackIncants.size > 1) return false;
    const allHits = (comps[0].hits || []).concat(spellBlock.hits || []);
    if (!allHits.length) return false;
    let minTs = Infinity, maxTs = -Infinity;
    for (const h of allHits) { if (h.ts < minTs) minTs = h.ts; if (h.ts > maxTs) maxTs = h.ts; }
    return minTs === maxTs && minTs === action.ts;
  }

  function scoreCandidate(candidate, actions, context) {
    let deterministicHits = 0, unknownHits = 0, leechFits = 0, timing = 0, mechanicalOrder = 0, virtualZeroHits = 0, cappedLowHits = 0, leechContradictions = 0, actionRecencyPenalty = 0;
    const tsSplitPenalty = timestampSplitPenalty(candidate);
    const comps = candidate.components || [];
    if (comps.length > 1 && comps[0] && comps[0].comp === 'arrow' && comps.slice(1).some(b => b && (b.comp === 'spell' || b.comp === 'rune' || b.comp === 'grenade')) && !arrowPrefixIsAbsorbable(comps, context)) {
      mechanicalOrder = comps.reduce((sum, b) => sum + ((b.hits || []).filter(isMainHit).length), 0);
    }
    const physDegenerate = physicalAxisTimingDegenerate(candidate);
    const timingDemoted = elementalSameSecondTimingDemoted(candidate, actions);
    for (const b of candidate.components) {
      const det = b.deterministic || {};
      deterministicHits += det.known || 0;
      unknownHits += det.unknown || 0;
      if (b.leech && b.leech.usable && canScoreLeech(context)) {
        if (b.leech.ok) leechFits += b.leech.fits.filter(x => x.fit.usable).length;
        cappedLowHits += (b.leech.consensus && b.leech.consensus.cappedLowCount) || 0;
        leechContradictions += (b.leech.consensus && b.leech.consensus.failedCount) || 0;
      }
      if (b.leech && b.leech.virtualZeroHits) virtualZeroHits += b.leech.virtualZeroHits.length;
      if (b.action) {
        const centerTs = Math.round(mean(b.hits.map(h => h.ts)));
        actionRecencyPenalty += Math.abs((b.action.ts || centerTs) - centerTs);
        const physicalBlock = b.action.profile && b.action.profile.element === 'physical';
        const timingApplies = !(physicalBlock && physDegenerate);
        if (timingApplies && b.comp === 'spell' && Math.abs((b.action.ts || centerTs) - centerTs) <= 1) timing += b.hits.length;
        if (timingApplies && b.comp === 'rune' && Math.abs((b.action.ts || centerTs) - centerTs) <= 1) timing += b.hits.length;
        if (b.comp === 'grenade' && b.hits.every(h => h.ts >= b.action.ts + 2 && h.ts <= b.action.ts + 4)) timing += b.hits.length;
      }
    }
    return {
      timing,
      mechanicalOrder,
      timestampSplitPenalty: tsSplitPenalty,
      deterministicHits,
      leechFits,
      leechContradictions,
      actionRecencyPenalty,
      unknownHits,
      virtualZeroHits,
      cappedLowHits,
      components: candidate.components.length,
      timingDemoted,
      shapeKey: candidate.shape.join('>'),
      cutKey: candidate.cuts.join(','),
    };
  }

  function compareValidated(a, b) {
    const A = a.score, B = b.score;
    // Degeneração elemental mesmo-segundo (elementalSameSecondTimingDemoted):
    // `timing` sai da posição 2 e vira o ÚLTIMO desempate antes de shape/cut —
    // a evidência de leech (cappedLowHits) decide antes dele, mas em empate
    // total ele ainda resolve (não cria ambiguidade artificial).
    const demoted = A.timingDemoted || B.timingDemoted;
    const order = [
      ['mechanicalOrder', -1],
      ['timing', demoted ? 0 : -1],
      ['deterministicHits', -1],
      ['leechFits', -1],
      // Sinal mecânico forte de desempate: não cortar um timestamp entre dois
      // componentes quando existe partição válida que põe a fronteira entre segundos.
      ['timestampSplitPenalty', 1],
      ['leechContradictions', 1],
      ['actionRecencyPenalty', 1],
      ['virtualZeroHits', 1],
      ['unknownHits', 1],
      ['cappedLowHits', 1],
      ['components', 1],
      ['timing', demoted ? -1 : 0],
    ];
    for (const [key, dir] of order) {
      if (dir !== 0 && A[key] !== B[key]) return dir * (A[key] - B[key]);
    }
    if (A.shapeKey !== B.shapeKey) return A.shapeKey < B.shapeKey ? -1 : 1;
    if (A.cutKey !== B.cutKey) return A.cutKey < B.cutKey ? -1 : 1;
    return 0;
  }


  function leechPartitionScore(blocks, context) {
    const out = { usable: 0, clean: 0, bad: 0, details: [] };
    for (const block of blocks || []) {
      const leech = validateLeechBlock(block, context);
      const usable = leech && leech.fits ? leech.fits.filter(x => x.fit && x.fit.usable) : [];
      const bad = leech && leech.failed ? leech.failed : [];
      const ok = leech && leech.fits ? leech.fits.filter(x => x.fit && x.fit.usable && x.fit.ok) : [];
      out.usable += usable.length;
      out.bad += bad.length;
      out.clean += ok.length;
      out.details.push({ block, leech });
    }
    return out;
  }

  function nearestSpellCastForTurn(turn, actions, vocation) {
    const hits = turn.hits || [];
    if (!hits.length) return null;
    const center = Math.round(mean(hits.map(h => h.ts)));
    const candidates = (actions.spellCasts || []).filter(c => {
      if (!c || !c.profile || c.profile.type !== 'attack') return false;
      if (vocation && c.profile.vocation && c.profile.vocation !== vocation) return false;
      return true;
    }).sort((a, b) => Math.abs(a.ts - center) - Math.abs(b.ts - center) || b.ts - a.ts);
    return candidates[0] || null;
  }

  // generalize-single-target-aa-resolver-to-runes: mesmo critério de proximidade
  // ao centro do turno já usado por chooseActionForComponent para nomear runa
  // (M-017/M-018), reaproveitado aqui para servir de ação concreta do corte
  // posição+leech quando não houver spell cast compatível.
  function nearestRuneUseForTurn(turn, actions) {
    const hits = turn.hits || [];
    if (!hits.length) return null;
    const center = Math.round(mean(hits.map(h => h.ts)));
    const candidates = (actions.runeUses || []).slice()
      .sort((a, b) => Math.abs(a.ts - center) - Math.abs(b.ts - center) || b.ts - a.ts);
    return candidates[0] || null;
  }

  function detectCharmKilledZeroAction(turn, action, facts) {
    if (!turn || !action || !facts || !facts.server) return null;
    const events = facts.server.events || [];
    const charm = events.find(ev => ev && ev.kind === 'charm' && ev.ts === action.ts && (ev.overpowerCharm || ev.woundCharm || /charm/i.test(ev.rawLine || '')));
    if (!charm) return null;
    const xp = events.find(ev => ev && ev.kind === 'xp' && ev.seq > charm.seq && ev.ts - charm.ts <= 1);
    if (!xp) return null;
    return { charm, xp };
  }

  function makeVirtualZeroHit(turn, action, zeroInfo) {
    const last = (turn.hits || [])[turn.hits.length - 1] || {};
    const charm = zeroInfo && zeroInfo.charm;
    return {
      id: 'virtual_zero_' + (action && action.id || action && action.seq || 'spell') + '_' + (turn.id || 'turn'),
      kind: 'virtual_zero_action',
      virtual: true,
      countsAsHit: false,
      zeroDamageAction: true,
      charmKilledBeforeHit: true,
      sourceCharm: charm || null,
      seq: Number.isFinite(+last.seq) ? (+last.seq + 0.1) : 0.1,
      ts: action.ts,
      clock: tsToClock(action.ts),
      mob: charm && charm.mob ? charm.mob : (last.mob || ''),
      dmg: 0,
      type: 'virtual',
      realCrit: false,
      lowBlow: false,
      onslaught: false,
      isPrey: false,
      exposeWeakness: false,
      overkill: true,
      lifeLeech: 0,
      manaLeech: 0,
      note: 'zero_damage_action_charm_killed_target_before_hit',
    };
  }


  function makeVirtualZeroHitForCharm(turn, action, charm, index, block) {
    const zeroInfo = { charm };
    const v = makeVirtualZeroHit(turn || {}, action || { ts: charm && charm.ts }, zeroInfo);
    // O hit principal invisível pertence à EXPLOSÃO do componente (o impacto), não ao
    // proc do charm que matou o alvo. Seu timestamp/seq devem ser os do bloco (onde os
    // hits reais estão), senão a granada passa a ter 2 timestamps de impacto (M-024) —
    // ex.: mk 05:45:57 charm-kill em :57, granada explode em :58. Usa o ts mais frequente
    // dos hits principais visíveis do bloco (granada = um só impacto).
    const main = ((block && block.hits) || []).filter(h => isMainHit(h) && !h.virtual);
    let impactTs = null, lastSeq = null;
    if (main.length) {
      const counts = new Map();
      for (const h of main) { counts.set(+h.ts, (counts.get(+h.ts) || 0) + 1); lastSeq = Math.max(lastSeq == null ? -Infinity : lastSeq, +h.seq || 0); }
      impactTs = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    }
    const ts = Number.isFinite(+impactTs) ? +impactTs : (Number.isFinite(+(charm && charm.ts)) ? +charm.ts : v.ts);
    v.id = 'virtual_zero_charm_' + (charm && charm.seq != null ? charm.seq : (index || 0)) + '_' + ((turn && turn.id) || 'turn');
    v.seq = Number.isFinite(+lastSeq) ? (+lastSeq + 0.01 + (index || 0) / 100)
      : (Number.isFinite(+(charm && charm.seq)) ? (+charm.seq + 0.01 + (index || 0) / 100) : v.seq);
    v.ts = ts;
    v.clock = tsToClock(ts);
    v.mob = charm && charm.mob ? charm.mob : v.mob;
    v.sourceCharmDamage = charm && charm.dmg;
    v.sourceCharmType = charmTypeName(charm);
    v.note = 'zero_damage_main_hit_explained_by_' + (v.sourceCharmType || 'charm');
    return v;
  }

  function charmTypeName(ev) {
    if (!ev) return 'charm';
    if (ev.overpowerCharm) return 'overpower_charm';
    if (ev.woundCharm) return 'wound_charm';
    const raw = String(ev.rawLine || '').toLowerCase();
    if (raw.indexOf('poison charm') >= 0) return 'poison_charm';
    if (raw.indexOf('curse charm') >= 0) return 'curse_charm';
    if (raw.indexOf('enflame charm') >= 0) return 'enflame_charm';
    if (raw.indexOf('freeze charm') >= 0) return 'freeze_charm';
    if (raw.indexOf('zap charm') >= 0) return 'zap_charm';
    if (raw.indexOf('overflux charm') >= 0) return 'overflux_charm';
    if (raw.indexOf('divine wrath') >= 0) return 'divine_wrath_charm';
    if (raw.indexOf('wound charm') >= 0) return 'wound_charm';
    return 'charm';
  }

  function isEligibleVirtualZeroCharm(ev) {
    if (!ev || ev.kind !== 'charm') return false;
    // S-014e: só um charm que MATOU o alvo (seguido de linha de XP) gera hit principal
    // invisível. Charm de dano seguido de hit visível não mata e não justifica virtual.
    if (!ev.killedTarget) return false;
    const raw = String(ev.rawLine || '').toLowerCase();
    return !!(ev.overpowerCharm || ev.woundCharm || raw.indexOf('poison charm') >= 0 || raw.indexOf('curse charm') >= 0 || raw.indexOf('enflame charm') >= 0 || raw.indexOf('freeze charm') >= 0 || raw.indexOf('zap charm') >= 0 || raw.indexOf('overflux charm') >= 0 || raw.indexOf('divine wrath') >= 0);
  }

  function canUseVirtualZeroForBlock(block) {
    if (!block) return false;
    // V21: a exceção de N_mecânico > hits visíveis também vale para AA.
    // Ex.: curse/overflux/divine wrath mata o alvo antes do dano principal do auto
    // aparecer. Nesse caso o AA existiu mecanicamente e conta no N_leech, mas o
    // dano principal visível é zero: A4 + A0×1.
    if (block.comp === 'arrow') return true;
    if (block.comp !== 'spell' && block.comp !== 'rune' && block.comp !== 'grenade') return false;
    const action = block.action;
    // Para spell/rune/grenade mantemos a restrição original de componentes de área.
    if (action && action.profile && action.profile.topology && action.profile.topology !== 'area') return false;
    return true;
  }

  function eligibleVirtualZeroCharmsForBlock(turn, block, context) {
    if (!turn || !block || !context || !context.serverEvents) return [];
    const main = (block.hits || []).filter(isMainHit);
    if (!main.length) return [];
    const minTs = Math.min.apply(null, main.map(h => h.ts));
    const maxTs = Math.max.apply(null, main.map(h => h.ts));
    const minSeq = Math.min.apply(null, main.map(h => Number.isFinite(+h.seq) ? +h.seq : 0));
    const maxSeq = Math.max.apply(null, main.map(h => Number.isFinite(+h.seq) ? +h.seq : 0));
    const blockMobs = new Set(main.map(h => normalizeName(h.mob)));
    const turnMain = (turn.hits || []).filter(isMainHit);
    const turnMinSeq = turnMain.length ? Math.min.apply(null, turnMain.map(h => Number.isFinite(+h.seq) ? +h.seq : 0)) : minSeq;
    const turnMaxSeq = turnMain.length ? Math.max.apply(null, turnMain.map(h => Number.isFinite(+h.seq) ? +h.seq : 0)) : maxSeq;

    return (context.serverEvents || [])
      .filter(isEligibleVirtualZeroCharm)
      .filter(ev => {
        if (!Number.isFinite(+ev.ts)) return false;
        const evSeq = Number.isFinite(+ev.seq) ? +ev.seq : null;
        const sameTsAsBlock = ev.ts >= minTs && ev.ts <= maxTs;
        const sameTsNearBlock = ev.ts >= minTs - 1 && ev.ts <= maxTs + 1;
        const seqInsideOrAdjacent = evSeq == null || (evSeq >= minSeq - 3 && evSeq <= maxSeq + 3) || (evSeq >= turnMinSeq && evSeq <= turnMaxSeq);
        if (!sameTsNearBlock || !seqInsideOrAdjacent) return false;
        const mob = normalizeName(ev.mob);
        // Se o charm é imediatamente seguido por um dano principal visível no mesmo
        // mob e no mesmo componente, ele pertence a esse hit visível. Não deve criar
        // R0/S0/A0 virtual. Ex.: overflux charm -> 832 no mesmo darklight striker.
        // EXCETO quando a linha de XP está ENTRE o charm e o hit (killedTarget=true,
        // definição em captureServerFacts: o próximo evento relevante após o charm É
        // o XP): o kill é estrutural, e o hit visível posterior no mesmo NOME de mob
        // é outra instância do pack. Ex.: mazzerinbarrage 23:47:21 — `divine wrath
        // 1251` -> XP -> `1782` em OUTRO darklight source; o charm matou o 6º alvo
        // da Ethereal Barrage (mana leech fecha exato em N=6). O guarda contra
        // falso-positivo continua sendo o fit exato do leech em N=k+1 no trial.
        const pairedVisibleMain = !ev.killedTarget && main.some(h =>
          mob && normalizeName(h.mob) === mob && h.ts === ev.ts &&
          Number.isFinite(+evSeq) && Number.isFinite(+h.seq) && +h.seq > +evSeq && (+h.seq - +evSeq) <= 3
        );
        if (pairedVisibleMain) return false;
        if (mob && blockMobs.has(mob)) return true;
        // Para componentes de área, um charm no mesmo segundo entre a sequência do turno
        // ainda pode explicar um alvo invisível mesmo se aquele mob só aparece no componente
        // via charm/proc. Mantemos mais restrito: precisa estar no mesmo timestamp do bloco.
        return sameTsAsBlock;
      })
      .sort((a, b) => {
        // Overpower é a evidência mais clara para hit principal zerado por charm;
        // depois ordena por proximidade sequencial ao bloco.
        const ap = a.overpowerCharm ? 0 : 1;
        const bp = b.overpowerCharm ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const ad = Number.isFinite(+a.seq) ? Math.min(Math.abs(+a.seq - minSeq), Math.abs(+a.seq - maxSeq)) : 9999;
        const bd = Number.isFinite(+b.seq) ? Math.min(Math.abs(+b.seq - minSeq), Math.abs(+b.seq - maxSeq)) : 9999;
        return ad - bd || ((a.seq || 0) - (b.seq || 0));
      });
  }

  function finalizeManualTurn(turn, componentDefs, reason, context) {
    const components = [];
    let componentId = 1;
    for (const def of componentDefs || []) {
      const comp = def.comp;
      const action = def.action || null;
      const label = def.actionLabel || actionLabel(comp, action);
      const id = comp + '_' + componentId;
      const hits = def.hits || [];
      for (const h of hits) {
        h.componentId = id;
        h.component = comp;
        h.actionLabel = label;
      }
      components.push({
        id,
        index: componentId,
        comp,
        action,
        actionLabel: label,
        hits,
        deterministic: def.deterministic || { ok: true, reason: reason || 'manual_resolver' },
        leech: def.leech || null,
        reason: def.reason || reason,
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
      resolver: reason,
      components,
      hits: turn.hits,
      chosen: { resolver: reason, manual: true },
      rejectedCount: 0,
    };
  }


  function allSpellManaLeechHomogeneous(hits) {
    const main = (hits || []).filter(isMainHit);
    const k = main.length;
    if (k < 3) return false;
    const f = areaFactor(k);
    const nonOverManaRates = main
      .filter(h => !h.overkill && h.dmg > 0 && h.manaLeech > 0)
      .map(h => h.manaLeech / (h.dmg * f))
      .filter(Number.isFinite);
    // Sinal seguro: pelo menos dois hits não-overkill do bloco têm a mesma taxa
    // de mana por N=k. Isso identifica turnos como 15:23:16 (S4), onde o
    // primeiro hit baixo é overkill do mesmo componente, não AA.
    if (nonOverManaRates.length < 2) return false;
    const mn = Math.min.apply(null, nonOverManaRates);
    const mx = Math.max.apply(null, nonOverManaRates);
    const mid = (mn + mx) / 2;
    if (!(mid > 0)) return false;
    const spread = (mx - mn) / mid;
    return spread <= 0.06;
  }


  function spellLeechBonusEntryForBlock(block) {
    if (!block || block.comp !== 'spell') return null;
    const action = block.action || null;
    const inc = normalizeName((action && action.profile && action.profile.incantation) || (action && action.text) || '');
    if (!inc) return null;
    const entry = SPELL_LEECH_BONUS_CANDIDATES[inc];
    return entry ? Object.assign({ incantation: inc }, entry) : null;
  }

  function spellLeechBonusOptionsForBlock(block, channel) {
    const entry = spellLeechBonusEntryForBlock(block);
    if (!entry) return [0];
    const values = channel === 'mana' ? entry.mana : entry.life;
    return sortedUnique((values && values.length ? values : [0]).map(x => +x || 0));
  }

  function leechMinorBonusOptionsForHit(setup, channel, hit) {
    if (!setup || !hit) return [0];
    const hitMob = normalizeName(hit.mob);
    if (channel === 'mana') {
      if (!setup.voidsMob || !(setup.voidsBonus > 0)) return [0];
      return hitMob === normalizeName(setup.voidsMob) ? [+setup.voidsBonus || 0] : [0];
    }
    if (!setup.vampiricMob || !(setup.vampiricBonus > 0)) return [0];
    return hitMob === normalizeName(setup.vampiricMob) ? [+setup.vampiricBonus || 0] : [0];
  }

  function leechEffectiveRateCandidates(setup, channel, block, hit) {
    const base = setup && channel === 'mana' ? (+setup.manaBase || 0) : (+setup.lifeBase || 0);
    const minorBonuses = leechMinorBonusOptionsForHit(setup, channel, hit);
    const spellBonuses = spellLeechBonusOptionsForBlock(block, channel);
    const out = [];
    for (const minorBonus of minorBonuses || [0]) {
      for (const spellBonus of spellBonuses || [0]) {
        const rate = base + (+minorBonus || 0) + (+spellBonus || 0);
        if (rate > 0) out.push({
          rate: Math.round(rate * 1e6) / 1e6,
          minorBonus: +minorBonus || 0,
          minorMob: +minorBonus ? (channel === 'mana' ? setup.voidsMob : setup.vampiricMob) : null,
          spellBonus: +spellBonus || 0,
          spellBonusEntry: spellLeechBonusEntryForBlock(block),
        });
      }
    }
    const seen = new Set();
    return out
      .sort((a, b) => a.rate - b.rate || a.spellBonus - b.spellBonus || a.minorBonus - b.minorBonus)
      .filter(x => {
        const key = [x.rate, x.minorBonus, x.spellBonus].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function observedLeechAcceptsN(hit, setup, n, channel, block, context) {
    if (!hit || !isMainHit(hit) || !(n >= 1)) return { usable: false, ok: true, reason: 'not_main_or_invalid_n' };
    const observed = channel === 'mana' ? (+hit.manaLeech || 0) : (+hit.lifeLeech || 0);
    if (!(observed > 0)) return { usable: false, ok: true, reason: 'no_' + channel + '_leech' };
    const rates = leechEffectiveRateCandidates(setup, channel, block, hit);
    if (!rates.length) return { usable: false, ok: true, reason: channel + '_setup_unknown' };
    const matches = [];
    const expectations = [];
    for (const cand of rates) {
      const rate = cand.rate;
      if (hit.overkill) {
        const iv = realDamageIntervalFromLeech(observed, rate, n);
        if (iv) expectations.push(Object.assign({}, cand, { interval: iv }));
        if (iv && (!(leechDamageBasis(hit, context) > 0) || leechDamageBasis(hit, context) <= iv[1])) matches.push(Object.assign({}, cand, { interval: iv }));
      } else if (hit.dmg > 0) {
        const expected = expectedLeech(leechDamageBasis(hit, context), rate, n);
        const tolerance = leechValueToleranceForN(n, expected);
        if (expected != null) expectations.push(Object.assign({}, cand, { expected, observed, delta: observed - expected, tolerance }));
        if (expected != null && Math.abs(expected - observed) <= tolerance) matches.push(Object.assign({}, cand, { expected, observed, delta: observed - expected, tolerance }));
      }
    }

    const out = { usable: true, ok: matches.length > 0, channel, observed, n, matches, expectations };
    if (!out.ok && expectations.length && hit.overkill) {
      const basis = leechDamageBasis(hit, context);
      const intervals = expectations.map(x => x.interval).filter(Boolean);
      const maxIntervalHigh = intervals.length ? Math.max.apply(null, intervals.map(iv => iv[1])) : null;
      const minIntervalLow = intervals.length ? Math.min.apply(null, intervals.map(iv => iv[0])) : null;
      out.damageBasis = basis;
      out.maxIntervalHigh = maxIntervalHigh;
      out.minIntervalLow = minIntervalLow;
      if (basis > 0 && maxIntervalHigh != null && basis > maxIntervalHigh) {
        // V27: overkill pode exibir dano maior que a vida real restante do alvo.
        // Nesse caso o leech observado fica abaixo do esperado pelo dano exibido:
        // isso é capped_low/neutral, não contradição automática de cardinalidade.
        out.cappedLow = true;
        out.neutral = true;
        out.reason = channel + '_overkill_below_expected_cap_aware';
      } else if (basis > 0 && minIntervalLow != null && basis < minIntervalLow) {
        out.tooHigh = true;
        out.reason = channel + '_overkill_above_expected_contradiction';
      } else {
        out.reason = channel + '_overkill_between_discrete_rate_candidates';
      }
    } else if (!out.ok && expectations.length && !hit.overkill) {
      const expectedValues = expectations.map(x => x.expected).filter(Number.isFinite);
      const minExpected = Math.min.apply(null, expectedValues);
      const maxExpected = Math.max.apply(null, expectedValues);
      const tolerance = Math.max.apply(null, expectedValues.map(v => leechValueToleranceForN(n, v)));
      out.minExpected = minExpected;
      out.maxExpected = maxExpected;
      if (observed < minExpected - tolerance) {
        // V14: leech menor que todos os valores oficiais esperados é compatível com
        // cap/truncamento de vida/mana. Isso não confirma o N, mas também não deve
        // contar como contradição dura do bloco.
        out.cappedLow = true;
        out.reason = channel + '_below_expected_cap_aware';
      } else if (observed > maxExpected + tolerance) {
        out.tooHigh = true;
        out.reason = channel + '_above_expected_contradiction';
      } else {
        out.reason = channel + '_between_discrete_rate_candidates';
      }
    }
    return out;
  }

  function hitAcceptsLeechNAnyOfficialRate(hit, setup, n, block, context) {
    const checks = [];
    const mana = observedLeechAcceptsN(hit, setup, n, 'mana', block, context);
    const life = observedLeechAcceptsN(hit, setup, n, 'life', block, context);
    if (mana.usable) checks.push(mana);
    if (life.usable) checks.push(life);
    if (!checks.length) return { usable: false, ok: true, reason: 'no_usable_leech_channel', n };

    // V11/V14: validação por canal não pode deixar um canal capado derrubar o hit
    // quando outro canal fecha. E se todos os canais utilizáveis ficaram abaixo do
    // esperado, o hit vira evidência capped_low: não confirma o N, mas também não
    // contradiz. Leech acima do esperado continua contradição forte.
    const okChannels = checks.filter(c => c.ok);
    const cappedLowChannels = checks.filter(c => !c.ok && c.cappedLow);
    const contradictoryChannels = checks.filter(c => !c.ok && !c.cappedLow);
    const failedChannels = checks.filter(c => !c.ok);
    if (okChannels.length) {
      return {
        usable: true,
        ok: true,
        n,
        checks,
        okChannels,
        cappedLowChannels,
        contradictoryChannels,
        failedChannels,
        reason: failedChannels.length ? 'one_channel_accepts_n_other_channel_ignored_or_capped' : 'channel_accepts_n',
      };
    }

    if (cappedLowChannels.length && !contradictoryChannels.length) {
      return {
        usable: true,
        ok: false,
        cappedLow: true,
        neutral: true,
        n,
        checks,
        okChannels,
        cappedLowChannels,
        contradictoryChannels,
        failedChannels,
        reason: 'all_usable_channels_below_expected_cap_aware',
      };
    }

    return {
      usable: true,
      ok: false,
      n,
      checks,
      okChannels,
      cappedLowChannels,
      contradictoryChannels,
      failedChannels,
      reason: 'no_channel_accepts_n',
    };
  }


  function hasSparseLeechConfirmationWithoutContradiction(leech) {
    const consensus = leech && leech.consensus;
    if (!leech || !leech.usable || !consensus) return false;
    const okCount = +consensus.okCount || 0;
    const contradictions = (+consensus.contradictionCount || 0) + (+consensus.failedCount || 0);
    return okCount >= 1 && contradictions === 0;
  }

  function shouldOverrideSparseLeechForConcreteDeterministicSpell(block, det, leech) {
    // V27: para spell concreta determinística, dano/original válido + pelo menos
    // uma confirmação de leech e zero contradições reais é suficiente. Linhas sem
    // leech ou capped_low/overkill não devem derrubar o componente por "leech esparso".
    return !!(block && block.comp === 'spell' && block.action &&
      det && det.ok && leech && leech.usable && !leech.ok &&
      hasSparseLeechConfirmationWithoutContradiction(leech));
  }

  function leechConsensusVerdictFromFits(fits, k) {
    const usable = (fits || []).filter(x => x.fit && x.fit.usable);
    const okFits = usable.filter(x => x.fit.ok);
    const cappedLowFits = usable.filter(x => !x.fit.ok && x.fit.cappedLow);
    const contradictory = usable.filter(x => !x.fit.ok && !x.fit.cappedLow);
    if (!usable.length) {
      return { ok: true, usable: false, k, okCount: 0, cappedLowCount: 0, contradictionCount: 0, failedCount: 0, minOk: 0, toleratedFailed: 0, reason: 'no_usable_leech' };
    }

    // V14: consenso cap-aware.
    // Leech menor do que o esperado é tratado como capped_low/truncado: ele não
    // confirma o N, mas também não derruba o bloco. Leech maior que o esperado, ou
    // incompatível sem ser baixo, continua contradição. Assim, blocos como A9/S12
    // podem passar com algumas confirmações por mana e vários canais baixos/capados.
    if (k >= 4) {
      const toleratedFailed = Math.max(1, Math.floor(k * 0.15));
      const minOk = Math.max(2, Math.ceil(k * 0.15));
      const noHardContradiction = contradictory.length <= toleratedFailed;
      const confirmed = okFits.length >= minOk && noHardContradiction;
      const neutralCappedLow = okFits.length === 0 && cappedLowFits.length > 0 && contradictory.length === 0;
      const ok = confirmed || neutralCappedLow;
      return {
        ok,
        usable: true,
        k,
        okCount: okFits.length,
        cappedLowCount: cappedLowFits.length,
        contradictionCount: contradictory.length,
        failedCount: contradictory.length,
        neutralLowCount: cappedLowFits.length,
        minOk,
        toleratedFailed,
        neutralOnly: neutralCappedLow,
        reason: confirmed ? 'block_leech_cap_aware_consensus_accepts_n'
          : (neutralCappedLow ? 'block_leech_all_capped_low_neutral_no_hard_contradiction' : 'block_leech_cap_aware_consensus_rejects_n'),
      };
    }

    const confirmed = contradictory.length === 0 && okFits.length >= 1;
    const neutralCappedLow = okFits.length === 0 && cappedLowFits.length > 0 && contradictory.length === 0;
    const ok = confirmed || neutralCappedLow;
    return {
      ok,
      usable: true,
      k,
      okCount: okFits.length,
      cappedLowCount: cappedLowFits.length,
      contradictionCount: contradictory.length,
      failedCount: contradictory.length,
      neutralLowCount: cappedLowFits.length,
      minOk: 1,
      toleratedFailed: 0,
      neutralOnly: neutralCappedLow,
      reason: confirmed ? 'small_block_cap_aware_accepts_n'
        : (neutralCappedLow ? 'block_leech_all_capped_low_neutral_no_hard_contradiction' : 'block_leech_has_hard_contradiction_or_no_confirmation'),
    };
  }

  function hitHasSingleTargetLeechSignature(hit, setup) {
    if (!hit || !isMainHit(hit) || hit.overkill || !(hit.dmg > 0)) return false;
    const n1 = hitAcceptsLeechNAnyOfficialRate(hit, setup, 1);
    return !!(n1.usable && n1.ok);
  }

  function hitRejectsComponentN(hit, setup, n) {
    const fit = hitAcceptsLeechNAnyOfficialRate(hit, setup, n);
    return !!(fit.usable && !fit.ok && !fit.cappedLow);
  }

  function blockLeechSupportForN(hits, setup, n, context) {
    const out = { n, usable: 0, ok: 0, clean: 0, bad: 0, fits: [] };
    for (const h of (hits || []).filter(isMainHit)) {
      const fit = hitAcceptsLeechNAnyOfficialRate(h, setup, n, null, context);
      if (!fit.usable) continue;
      out.usable++;
      if (fit.ok) {
        out.ok++;
        out.clean++;
      } else if (!fit.cappedLow) out.bad++;
      out.fits.push({ hit: h, fit });
    }
    const verdict = leechConsensusVerdictFromFits(out.fits, n);
    out.accepted = !!(verdict.usable && verdict.ok);
    out.consensus = verdict;
    return out;
  }

  function shouldForceA1ByLeech(hits, context) {
    const main = (hits || []).filter(isMainHit);
    if (main.length < 2) return { force: false, reason: 'not_enough_main_hits' };
    const setup = context && context.leechSetup;
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return { force: false, reason: 'setup_unknown' };
    const first = main[0];
    const suffix = main.slice(1);
    const kAll = main.length;
    const kSuffix = suffix.length;
    const firstN1 = hitAcceptsLeechNAnyOfficialRate(first, setup, 1, null, context);
    const firstAll = hitAcceptsLeechNAnyOfficialRate(first, setup, kAll, null, context);
    const suffixSupport = blockLeechSupportForN(suffix, setup, kSuffix, context);
    const suffixUsableOk = suffixSupport.ok >= Math.min(2, kSuffix) && suffixSupport.bad === 0;
    const firstRejectsAll = firstAll.usable && !firstAll.ok;
    const firstSingle = firstN1.usable && firstN1.ok;
    const critBoundary = suffix.length > 0 && suffix.every(h => !!h.realCrit === !!suffix[0].realCrit) && !!first.realCrit !== !!suffix[0].realCrit;
    return {
      force: !!(firstSingle && firstRejectsAll && (suffixUsableOk || critBoundary)),
      reason: firstSingle && firstRejectsAll
        ? (suffixUsableOk ? 'first_hit_n1_suffix_accepts_n_minus_1' : (critBoundary ? 'first_hit_n1_plus_crit_boundary' : 'first_hit_n1_but_suffix_weak'))
        : 'no_first_single_target_leech_signature',
      firstN1,
      firstAll,
      suffixSupport,
      critBoundary,
    };
  }

  // Vocações de AA single-target (knight, sorcerer, druid, monk): se o primeiro
  // hit visível está em timestamp anterior ao bloco seguinte e o cast ofensivo
  // concreto está alinhado ao bloco seguinte, isso é uma fronteira temporal
  // forte AA→spell. Não deixar a validação all-spell por leech apagar essa
  // fronteira. Ex. (EK): 15:17:33, hit 555 em :33 e exori mas com hits em :34
  // => A1 S3, mesmo que S4 consiga parecer homogêneo por leech.
  function hasStrongTimestampAaSpellBoundary(hits, spell) {
    const main = (hits || []).filter(isMainHit);
    if (main.length < 2 || !spell || !Number.isFinite(+spell.ts)) return false;
    const ordered = main.slice().sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
    const first = ordered[0];
    const rest = ordered.slice(1);
    if (!first || !rest.length) return false;
    const restMinTs = Math.min.apply(null, rest.map(h => h.ts));
    const restMaxTs = Math.max.apply(null, rest.map(h => h.ts));
    // A fronteira é forte quando o primeiro hit é o único no timestamp anterior
    // e todos os demais hits principais começam depois.
    if (!(first.ts < restMinTs)) return false;
    if (ordered.some((h, i) => i > 0 && h.ts === first.ts)) return false;
    // O cast deve estar temporalmente compatível com o bloco spell, não com o AA.
    const spellAlignedToRest = Math.abs(spell.ts - restMinTs) <= 1 || (spell.ts >= restMinTs && spell.ts <= restMaxTs);
    const spellNotAlignedToFirst = spell.ts > first.ts || Math.abs(spell.ts - restMinTs) < Math.abs(spell.ts - first.ts);
    return !!(spellAlignedToRest && spellNotAlignedToFirst);
  }

  // H-005/S-004a: mesmo mob + mesmo estado de modificadores (EW/prey/crit/Low
  // Blow/Onslaught) + mesmo dano ⇒ mesmo componente determinístico. Hits de
  // overkill são excluídos (dano truncado não é comparável).
  function hitStateKey(h) {
    return normalizeName(h.mob) + '|' + (h.exposeWeakness ? 1 : 0) + '|' + (h.isPrey ? 1 : 0) + '|' +
      (h.realCrit ? 1 : 0) + '|' + (h.onslaught ? 1 : 0) + '|' + (h.lowBlow ? 1 : 0);
  }
  function firstHitSharesExactOriginalWithRest(hits) {
    const first = hits[0];
    if (!first || first.overkill) return false;
    const firstKey = hitStateKey(first);
    return hits.slice(1).some(h => h && !h.overkill && hitStateKey(h) === firstKey && (+h.dmg) === (+first.dmg));
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

  function actionLabel(comp, action) {
    if (comp === 'arrow') return 'Auto ataque';
    if (!action) return null;
    if (comp === 'spell') return (action.profile && action.profile.label ? action.profile.label : action.text) + ' (' + action.text + ')';
    if (comp === 'rune') return action.profile && action.profile.label ? action.profile.label : action.name;
    if (comp === 'grenade') return 'Divine Grenade (' + action.text + ')';
    return null;
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
