/*
 * unified-validation.js
 *
 * Camada de validation do UnifiedClassificationEngine: dado um candidato de particao
 * de turno (blocos AA/spell/rune/granada) e o setup ja inferido (leech/critico/gravSan/
 * BM), confere se cada bloco e o candidato inteiro sao mecanicamente consistentes com
 * a evidencia observada (reversao exata de dano, cardinalidade de leech, homogeneidade
 * de critico). Nao infere setup -- consome o que unified-setup-inference.js ja decidiu.
 *
 * Exporta globalThis.UnifiedValidation (+ module.exports quando disponivel). Carregado
 * depois de unified-setup-inference.js e antes de unified-classification-engine.js.
 * unified-setup-inference.js chama de volta 3 funcoes daqui (validateElementalBlock,
 * validatePhysicalBlock, withGravSanBlockMode) via lookup tardio em root.UnifiedValidation
 * -- a prova de BM-pierce por evidencia cross-mob precisa rodar validacao de candidato
 * sob cada hipotese de perk pra pontuar qual bate melhor.
 */
(function(root) {
  'use strict';

  const {
    normalizeName,
    isMainHit,
    intersectInterval,
    mean,
    critKeyForBlock,
    physicalOriginalInterval,
    intersectIntervalTol,
    sortedUnique,
    isTerraBurstBlock,
    isChainedPenanceAction,
    elementalOriginalCandidates,
    omegaActiveForHit,
    intersectSets,
    elementalStateKey,
    gravSanHitInWindow,
    tsToClock,
    leechValueToleranceForN,
    ELEMENTAL_CLUSTER_MAX_TOLERANCE,
    ELEMENTAL_CLUSTER_MIN_TOLERANCE,
    ELEMENTAL_CLUSTER_RATIO,
    PHYSICAL_INTERSECTION_TOLERANCE,
    SPELL_LEECH_BONUS_CANDIDATES,
    TERRA_BURST_BONUS_LEVELS,
    ELEMENTS,
    CUTOFF_KEY,
    PRE_CUTOFF_EXPOSE_WEAKNESS_MANA_LEECH_BONUS,
  } = root.UnifiedFormulas;

  const {
    areaFactor,
    realDamageIntervalFromLeech,
    expectedLeech,
    canUseLeechAsHardReject,
    canScoreLeech,
    leechDamageBasis,
    leechSetupConfidence,
  } = root.UnifiedSetupInference;
  function effectiveLifeLeech(hit, setup) {
    const base = setup && setup.lifeBase ? setup.lifeBase : 0;
    const withMinor = setup && setup.vampiricMob
      && normalizeName(hit.mob) === normalizeName(setup.vampiricMob)
      ? base + (setup.vampiricBonus || 0)
      : base;
    const bountyMultiplier = hit && hit.bountyTalisman
      && setup && setup.bountyTalismanLifeConfidence !== 'unknown'
      && setup.bountyTalismanLifeBonus > 0
      ? 1 + setup.bountyTalismanLifeBonus
      : 1;
    return withMinor * bountyMultiplier;
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

  // N-007/N-008 + M-025: uma ação nomeia no máximo um componente, logo no máximo um
  // turno consolidado. O conjunto de ações já consumidas existia só para granada
  // (`consolidatedGrenadeCasts`), porque a janela [c+2,c+4] cruza a fronteira de 2 s
  // de forma óbvia; mas a janela ±1 s de spell (M-012/M-013) e a fronteira `Using` de
  // runa (M-017/M-018a) cruzam essa fronteira do mesmo jeito, e sem o conjunto o
  // turno seguinte reivindica a mesma ação. Cada varredura recomeça com todas livres.
  function resetConsolidatedActions(context) {
    if (!context) return;
    context.consolidatedGrenadeCasts = new Set();
    context.consolidatedSpellCasts = new Set();
    context.consolidatedRuneUses = new Set();
  }

  // Registra as ações do vencedor. Ponto único: só o que foi consolidado num turno
  // resolvido sai da oferta dos turnos seguintes.
  function registerConsolidatedActions(context, blocks) {
    if (!context) return;
    for (const b of blocks || []) {
      if (!b || !b.action) continue;
      if (b.comp === 'grenade' && context.consolidatedGrenadeCasts) context.consolidatedGrenadeCasts.add(b.action);
      if (b.comp === 'spell' && context.consolidatedSpellCasts) context.consolidatedSpellCasts.add(b.action);
      if (b.comp === 'rune' && context.consolidatedRuneUses) context.consolidatedRuneUses.add(b.action);
    }
  }

  function actionsNearTurn(turn, facts, context) {
    const firstTs = Math.min(...turn.hits.map(h => h.ts));
    const lastTs = Math.max(...turn.hits.map(h => h.ts));
    const consumedSpells = context && context.consolidatedSpellCasts;
    const consumedRunes = context && context.consolidatedRuneUses;
    const spellCasts = facts.local.spellCasts.filter(c =>
      c.ts >= firstTs - 1
      && c.ts <= lastTs + 1
      && !(consumedSpells && consumedSpells.has(c)));
    const runeUses = facts.server.runeUses.filter(r =>
      r.ts >= firstTs - 1
      && r.ts <= lastTs + 1
      && !r.ignored
      && r.profile
      && r.profile.element !== 'unknown'
      && (r.profile.topology === 'single' || r.profile.topology === 'area')
      && !(consumedRunes && consumedRunes.has(r)));
    // M-024/M-025: uma granada possui um único evento de impacto (um timestamp ou
    // dois timestamps cronologicamente consecutivos comprovados) e o mesmo cast não
    // pode explicar hits em dois turnos consolidados. Um cast cuja explosão já foi
    // consolidada num turno anterior não é mais oferecido como ação de granada —
    // senão a janela [c+2,c+4] semeia uma granada fantasma no segundo turno.
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

  // Busca guiada por sinal (só-desempenho — openspec/changes/optimize-rp-pack-turn-resolution).
  // Em vez de validar TODA posição de corte (segmentations = C(n-1,k-1); um turno RP-pack
  // de 38 hits gera 666 cortes por shape k=3), propõe só as posições perto de uma ruptura
  // detectável em 5 sinais deriváveis dos hits, ANTES do validateCandidate caro. A busca
  // guiada nunca decide sozinha: se um shape não produzir nenhum candidato válido com os
  // cortes propostos, resolveTurn reescala pra enumeração completa daquele shape (rede de
  // segurança D3 do design). Cobertura validada: 0 falso-negativo em ~250 pares turno/shape
  // dos fixtures `server log rp` e `darklight rp`.
  const GUIDED_MIN_HITS = 6;          // abaixo disso segmentations já é barato; busca guiada nem roda
  const GUIDED_MAG_TOLERANCE = 0.15;  // ruptura de magnitude mesmo-mob: >15% de variação
  const GUIDED_LEECH_TOLERANCE = 0.25;// ruptura da razão (vida+mana)/dano entre vizinhos
  const GUIDED_DETERMINISM_TOLERANCE = 0.01; // par mesmo-mob "idêntico" (holy determinístico)
  const GUIDED_SLACK = 1;             // folga ±1 em volta de cada posição sinalizada

  function componentCritState(h) {
    return !!(h && (h.onslaught || (h.realCrit && !h.lowBlow)));
  }

  function guidedCritStateOf(h) {
    if (h.overkill) return 'overkill'; // dano truncado — não comparável
    return (componentCritState(h) ? 'c' : 'n') + (h.onslaught ? 'O' : '');
  }

  function guidedLeechRatioOf(h) {
    if (h.overkill) return null; // leech sobre dano truncado não é confiável
    const total = (+h.lifeLeech || 0) + (+h.manaLeech || 0);
    if (!(h.dmg > 0) || !(total > 0)) return null;
    return total / h.dmg;
  }

  // Compara dois hits no espaço do DANO ORIGINAL revertido (D-010a), não no dano bruto.
  // Retorna `true` = quebra (originais disjuntos em todo eixo elemental comparável),
  // `false` = compatível (algum eixo intersecta), `null` = não comparável (D-006:
  // evidência ausente dos dois lados no mesmo eixo).
  //
  // Por que revertido e por que CROSS-MOB: a reversão normaliza mitigação, resistência
  // do mob, Expose Weakness, prey e crítico — então hits de mobs DIFERENTES do mesmo
  // componente colapsam no mesmo original, e a comparação passa a ser válida entre
  // vizinhos de array (o dano bruto só permitia comparar dentro do mesmo mob). Prova:
  // `bakra` 19:49:57 — roaming dread 889, cyclursus 1139 e crypt mage 886 revertem
  // todos para holy ~831 (granada), enquanto dread 687, cyclursus 880 e crypt mage 685
  // revertem para holy ~642 (Divine Caldera); no dano bruto esses dois blocos são
  // indistinguíveis de ruído de armadura, no espaço revertido a fronteira é exata.
  // Isto é geração de CANDIDATO, não decisão: validateCandidate continua sendo o árbitro
  // e as duas redes de segurança de resolveTurn continuam valendo.
  function guidedRevertedBreak(a, b) {
    const ea = a && a.evidence && a.evidence.elemental;
    const eb = b && b.evidence && b.evidence.elemental;
    if (!ea || !eb) return null;
    let sawAxis = false;
    for (const el of ELEMENTS) {
      if (el === 'physical') continue;
      const ca = ea[el], cb = eb[el];
      if (!ca || !cb || !ca.known || !cb.known) continue;
      if (!ca.originals || !ca.originals.length || !cb.originals || !cb.originals.length) continue;
      sawAxis = true;
      if (intersectSets([ca.originals, cb.originals], 0).length) return false;
    }
    return sawAxis ? true : null;
  }

  // Retorna as posições de corte candidatas (1..n-1, ordenadas) para o turno, ou null
  // quando o turno é pequeno demais pra busca guiada valer a pena (usa segmentations
  // direto). As posições independem de k — resolveTurn combina (k-1) delas por shape.
  function guidedCutPositions(hits, actions) {
    const n = hits.length;
    if (n < GUIDED_MIN_HITS) return null;
    const positions = new Set();
    const mark = pos => { if (pos >= 1 && pos <= n - 1) positions.add(pos); };

    // Sinais 1 (magnitude mesmo-mob), 2 (estado de crit) e 3 (razão de leech).
    // Magnitude compara cada hit ao ANTERIOR DO MESMO MOB: dano físico varia por
    // armadura/mitigação entre mobs mesmo dentro do mesmo componente — comparar
    // vizinhos de array cegamente marcaria toda troca de mob como ruptura (ruído).
    // Crit e leech comparam vizinhos de array: crit rola uniforme por ataque entre
    // os alvos da AoE, e a taxa de leech é a mesma entre mobs do mesmo componente.
    const lastSeenByMob = new Map();
    for (let i = 0; i < n; i++) {
      const cur = hits[i];
      const mob = normalizeName(cur.mob);
      const prevSameMob = lastSeenByMob.get(mob);
      if (i >= 1) {
        // Sinal 1 no espaço revertido (cross-mob) quando há evidência; senão, fallback
        // para a comparação de magnitude por dano bruto DENTRO do mesmo mob
        // (comportamento anterior, preservado para mob sem mods conhecidos — D-006:
        // boss e mobs fora da tabela do regime da sessão).
        const prevAny = hits[i - 1];
        const revBreak = (!prevAny.overkill && !cur.overkill) ? guidedRevertedBreak(prevAny, cur) : null;
        if (revBreak === true) mark(i);
        else if (revBreak === null && prevSameMob && !prevSameMob.overkill && !cur.overkill) {
          const ma = +prevSameMob.dmg, mb = +cur.dmg;
          if (ma > 0 && mb > 0 && Math.max(ma, mb) / Math.min(ma, mb) - 1 > GUIDED_MAG_TOLERANCE) mark(i);
        }
        const a = hits[i - 1];
        const ca = guidedCritStateOf(a), cb = guidedCritStateOf(cur);
        if (ca !== cb && ca !== 'overkill' && cb !== 'overkill') mark(i);
        const la = guidedLeechRatioOf(a), lb = guidedLeechRatioOf(cur);
        if (la != null && lb != null) {
          const base = Math.max(la, lb);
          if (base > 0 && Math.abs(la - lb) / base > GUIDED_LEECH_TOLERANCE) mark(i);
        }
      }
      lastSeenByMob.set(mob, cur);
    }

    // Sinal 4 (timing de ação concreta): um cast/Using só explica hits DEPOIS dele na
    // ordem do log (seq) — marca a posição onde os hits cruzam o seq de cada ação.
    // Resolve empates exatos dos sinais 1-3 (dois componentes com dano/leech iguais).
    const casts = []
      .concat(actions && actions.spellCasts || [], actions && actions.runeUses || [], actions && actions.grenadeCasts || []);
    for (const cast of casts) {
      const castSeq = +cast.seq || 0;
      if (!(castSeq > 0)) continue;
      for (let i = 0; i < n; i++) {
        if ((+hits[i].seq || 0) > castSeq) { mark(i); break; }
      }
    }

    // Sinal 5 (início de trecho determinístico mesmo-mob): AA físico varia por mob
    // (rolagem de armadura); spell/runa/granada holy é determinístico (mesmo dano pro
    // mesmo mob+estado). Um par consecutivo do MESMO mob com dano ~idêntico marca a
    // fronteira no índice do hit ANTERIOR (ele já pertence ao trecho determinístico,
    // confirmado retroativamente pela repetição). Dispara em TODA repetição, não só na
    // primeira: o motor aceita várias posições de corte empatadas dentro do mesmo
    // trecho determinístico (ex.: `server log rp` 19:49:57, cortes 12..17 todos
    // válidos), e disparar só uma vez perde exatamente essas posições.
    // Com evidência revertida disponível, este sinal é REDUNDANTE: a fronteira de um
    // trecho determinístico é exatamente onde o nível revertido quebra, e o sinal 1
    // (acima) já marca essa posição — enquanto o critério por dano bruto precisava
    // disparar em TODA repetição do trecho (inundando o interior do bloco) porque não
    // enxergava onde o trecho começava. Sem evidência comparável (D-006), o critério
    // antigo continua sendo a única pista e é preservado.
    const lastByMobDet = new Map();
    for (let i = 0; i < n; i++) {
      const cur = hits[i];
      if (cur.overkill) continue; // overkill não conta como par nem quebra o trecho
      const mob = normalizeName(cur.mob);
      const prev = lastByMobDet.get(mob);
      if (prev && guidedRevertedBreak(prev.hit, cur) === null) {
        const ma = +prev.dmg, mb = +cur.dmg;
        if (ma > 0 && mb > 0 && Math.max(ma, mb) / Math.min(ma, mb) - 1 <= GUIDED_DETERMINISM_TOLERANCE) mark(prev.idx);
      }
      lastByMobDet.set(mob, { idx: i, dmg: cur.dmg, overkill: cur.overkill, hit: cur });
    }

    // Overkill deixa a posição sem NENHUM sinal confiável (dano truncado exclui o hit
    // das comparações de magnitude/leech/determinismo). Posições adjacentes a um hit
    // overkill viram candidatas por padrão — não é "há fronteira aqui", é "não sabemos
    // se há, então não descartamos" (ex.: `server log rp` 19:49:23, a fronteira real
    // AA→spell é um hit overkill invisível pros sinais 1-3).
    for (let i = 0; i < n; i++) {
      if (!hits[i].overkill) continue;
      mark(i);
      mark(i + 1);
    }

    // Posições de borda são mecanicamente especiais no domínio e ficam SEMPRE
    // candidatas: corte em 1 = prefixo AA de exatamente 1 hit antes da AoE (regra
    // posicional do AA — ex.: bakra S4 33550, AA 631 indistinguível da Caldera
    // 626-739 com EW por magnitude/leech/crit, e o vencedor real é a=1 por desempate
    // lexicográfico de cutKey); corte em n-1 = spell/runa single-target como último
    // hit (ordem determinística AA→spell, M-006/M-033 — ex.: bakra S4 33734, Strong
    // Ethereal Spear engolido pelo all-arrow sem esta posição).
    mark(1);
    mark(n - 1);

    // Folga ±GUIDED_SLACK em volta de cada posição sinalizada (fronteiras same-second
    // podem cair um hit antes/depois da ruptura visível).
    const withSlack = new Set();
    for (const p of positions) {
      for (let d = -GUIDED_SLACK; d <= GUIDED_SLACK; d++) {
        const q = p + d;
        if (q >= 1 && q <= n - 1) withSlack.add(q);
      }
    }
    return [...withSlack].sort((a, b) => a - b);
  }

  // Combina (k-1) posições candidatas em cortes completos (terminados em n), na MESMA
  // ordem lexicográfica de segmentations — compareValidated tem desempate total
  // (shapeKey/cutKey), então a ordem não muda o vencedor, mas manter a ordem torna a
  // equivalência com o caminho completo trivial de auditar.
  function cutsFromPositions(positions, n, k) {
    if (k <= 1) return [[n]];
    const need = k - 1;
    const out = [];
    (function rec(start, acc) {
      if (acc.length === need) { out.push(acc.concat(n)); return; }
      for (let i = start; i <= positions.length - (need - acc.length); i++) rec(i + 1, acc.concat(positions[i]));
    })(0, []);
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
  // que roça uma janela. Enumerar
  // C(n-1,2) cortes de granada e validar cada um (reversão holy + leech) é o grosso
  // do custo. Este pré-filtro descarta, antes do validateCandidate caro, os cortes
  // cujo bloco de granada NÃO é uma explosão válida (M-023/M-024): sem cast, fora de
  // [cast+2,cast+4], ou fora da forma temporal permitida por M-024. Esses cortes são
  // EXATAMENTE os que validateCandidate já rejeita (grenade_without_cast,
  // grenade_outside_impact_window, grenade_multiple_impact_timestamps, L2554/2558/2559)
  // — nunca entram em `candidates`, logo não alteram best/second/ambiguous. A escolha
  // da ação usa o MESMO chooseActionForComponent do validador, garantindo equivalência.
  function grenadeCandidateWindowInvalid(candidate, actions, context) {
    for (const block of candidate.components) {
      if (block.comp !== 'grenade') continue;
      const action = chooseActionForComponent('grenade', block.hits, actions);
      if (!action) return true;
      const okImpact = block.hits.every(h => h.ts >= action.ts + 2 && h.ts <= action.ts + 4);
      if (!okImpact) return true;
      const timestamps = [...new Set(block.hits.map(h => Number.isFinite(h.ordTs) ? h.ordTs : h.ts))]
        .sort((a, b) => a - b);
      if (!(timestamps.length === 1 || (timestamps.length === 2 && timestamps[1] - timestamps[0] === 1))) return true;
      if (timestamps.length === 2) {
        const setup = context && context.leechSetup;
        if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return true;
      }
      // Poda comportamentalmente neutra: validateCandidate aplica exatamente a
      // mesma homogeneidade de crit-state antes de aceitar o bloco. Antecipá-la
      // evita pagar reversão elemental/leech para rollovers que já são
      // contraditórios por S-008, sem criar um validador concorrente.
      if (!validateCritHomogeneity(block).ok) return true;
    }
    return false;
  }

  function chooseActionForComponent(comp, hits, actions) {
    if (comp === 'spell') {
      // M-016e: um estágio atrasado consolidado carrega o ts do cast originário
      // (multiStageCastTs) mesmo depois de mover hits para o turno de origem. A
      // heurística de "cast mais próximo do centro do bloco" quebra quando o
      // bloco atravessa turno e um cast concreto diferente e legítimo (ex.:
      // Greater Flurry of Blows em :58) fica geometricamente mais perto do
      // centro deslocado do que o cast originário -- preferir o cast originário
      // quando todos os hits do componente concordam nele.
      const stageCastTs = sortedUnique(hits.map(h => h.multiStageCastTs).filter(ts => ts != null));
      if (stageCastTs.length === 1) {
        const originCast = actions.spellCasts.find(a => a.ts === stageCastTs[0]);
        if (originCast) return originCast;
      }
      const centerTs = Math.round(mean(hits.map(h => h.ts)));
      const sorted = actions.spellCasts.slice().sort((a, b) =>
        Math.abs(a.ts - centerTs) - Math.abs(b.ts - centerTs)
        || a.ts - b.ts
        || (a.seq || 0) - (b.seq || 0));
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
      // Desempate igual ao do ramo de spell acima: a mesma distância ao centro
      // resolve para a ação ANTERIOR. Preferir a posterior era uma inconsistência
      // interna deste ramo — nenhuma regra a sustenta, e é ela que faz um turno
      // reivindicar a runa do turno seguinte quando as duas empatam (N-008).
      const sorted = actions.runeUses.slice()
        .sort((a, b) => Math.abs(a.ts - centerTs) - Math.abs(b.ts - centerTs) || a.ts - b.ts);
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
    // truncado), então overkill participa do check de crit-state. Hits virtuais
    // (realCrit sempre false, sem linha real) e dodge de Hazard (zeroDamageDodge —
    // linha "dodged your attack. (Hazard)") ficam de fora: um dodge nunca rola crit,
    // então seu `realCrit: false` não é informativo nem contradiz um bloco
    // uniformemente crítico — mesma exclusão que validateElementalBlock e
    // sameMobStateExactnessForHits já aplicam a esse tipo de hit (D-011/glossário).
    const clean = block.hits.filter(h => !h.virtual && !h.zeroDamageDodge);
    if (clean.length < 2) return { ok: true };
    const first = componentCritState(clean[0]);
    const mixed = clean.some(h => componentCritState(h) !== first);
    return mixed ? { ok: false, rule: 'D-007/S-008', reason: 'mixed_crit_state' } : { ok: true };
  }

  // ------------------------------------------------------------------ M-039 (omega)
  //
  // Omega e um SEGUNDO original candidato por hit (D1), nao um estado livre: por-hit ele
  // e binario, e a escolha entre os dois candidatos NAO e livre — ela e derivada do nivel
  // do proprio bloco, do mesmo jeito que os niveis de spell e granada ja sao derivados dos
  // hits. Por isso omega NAO entra em `elementalStateKey`: la ele DESLIGARIA o gate de
  // exatidao same-mob (hits com e sem omega deixariam de formar grupo), em vez de modelar
  // a mecanica.
  //
  // Em toda sessao sem omega detectado nada disto roda e o resultado e bit a bit o de
  // antes desta regra.
  const EMPTY_OMEGA_SET = Object.freeze(new Set());

  function omegaSessionActive(context) {
    return !!(context && context.omegaSetup && context.omegaSetup.active);
  }

  // Instala a atribuicao SOB TESTE (escopo + marcados) enquanto `fn` roda. `postMultiplier`
  // e `leechDamageBasis` leem dai; fora do escopo continuam lendo `hit.omegaActive`.
  function withOmegaAssignment(context, scope, marked, fn) {
    if (!context) return fn();
    const prev = context._omegaAssignment;
    context._omegaAssignment = { scope, marked };
    try { return fn(); } finally { context._omegaAssignment = prev; }
  }

  // Busca a atribuicao pelo NIVEL do bloco, em O(n x niveis) — sem explosao combinatoria,
  // porque omega tem valor unico e conhecido. Para cada nivel candidato `o`, cada hit e
  // resolvido individualmente: se o candidato SEM omega alcanca `o`, o hit fica sem omega
  // (minimalidade); so quando nao alcanca e o candidato COM omega alcanca e que ele e
  // marcado. Um nivel em que algum hit nao fecha de nenhum dos dois jeitos e descartado.
  //
  // `candidatesOf(hit, marked)` devolve o conjunto/intervalo de originais do hit sob a
  // hipotese; `reaches(candidates, o)` diz se aquele nivel e alcancavel.
  function findOmegaAssignmentByLevel(hits, candidatesOf, reaches, levelsOf) {
    const rows = [];
    for (const h of hits) {
      const no = candidatesOf(h, false);
      if (!no) return null;
      rows.push({ hit: h, no, yes: candidatesOf(h, true) });
    }
    if (!rows.length) return null;
    const levels = new Set();
    for (const r of rows) {
      for (const v of levelsOf(r.no)) levels.add(v);
      if (r.yes) for (const v of levelsOf(r.yes)) levels.add(v);
    }
    const found = [];
    for (const o of [...levels].sort((a, b) => a - b)) {
      const marked = new Set();
      let ok = true;
      for (const r of rows) {
        if (reaches(r.no, o)) continue;
        if (r.yes && reaches(r.yes, o)) { marked.add(r.hit); continue; }
        ok = false; break;
      }
      // Atribuicao de zero marcados nao acrescenta nada: o caminho sem omega ja rodou e
      // falhou antes de chegar aqui.
      if (ok && marked.size) found.push(marked);
    }
    if (!found.length) return null;
    const min = Math.min(...found.map(m => m.size));
    const minimal = found.filter(m => m.size === min);
    const key = m => [...m].map(h => h.seq).sort((a, b) => a - b).join(',');
    const first = key(minimal[0]);
    return { marked: minimal[0], tied: minimal.some(m => key(m) !== first) };
  }

  // D-010/S-004: a tolerancia de intersecao do bloco elemental. Existe so para o residuo
  // discreto (arredondamento de mitigacao/prey/mods pos-cutoff) entre mobs ou entre estados;
  // dentro do mesmo (mob, estado) a comparacao e exata (S-004a). Runa com `Using` explicito
  // ganha um pouco mais de folga porque a linha de execucao e sinal primario (M-017/M-018a).
  function elementalBlockTolerance(block) {
    return (block && block.comp === 'rune' && block.action) ? 4 : 2;
  }

  function validatePhysicalBlock(block, context) {
    const base = validatePhysicalBlockUnderAssignment(block, context);
    if (base.ok || !omegaSessionActive(context)) return base;
    // D3: no eixo fisico omega e ULTIMO RECURSO e MINIMO. O passo de 6% e da mesma ordem
    // de grandeza da variacao legitima de armor (a largura da banda de `O` de um hit e
    // metade do armor: 60 para roaming dread, contra ~30 de deslocamento de omega), entao
    // admitir os dois candidatos por hit sem restricao faria a intersecao quase sempre
    // fechar e esvaziaria `physical_intersection_empty` como discriminador. Por isso:
    // avaliar SEM omega primeiro (acima), so na falha procurar a atribuicao com o MENOR
    // numero de hits marcados, e manter a rejeicao quando duas atribuicoes minimas
    // distintas fecham (D-006 — a evidencia fisica sozinha nao separa as duas).
    if (base.reason !== 'physical_intersection_empty') return base;
    const hits = block.hits.filter(h => !h.overkill && !h.zeroDamageDodge);
    if (hits.length < 2) return base;
    const intervalOf = (hit, marked) => {
      const ev = withOmegaAssignment(context, new Set([hit]), marked ? new Set([hit]) : EMPTY_OMEGA_SET,
        () => physicalOriginalInterval(hit, context));
      return ev && ev.known && ev.interval ? ev.interval : null;
    };
    for (const tolerance of [0, PHYSICAL_INTERSECTION_TOLERANCE]) {
      const found = findOmegaAssignmentByLevel(
        hits,
        intervalOf,
        (iv, o) => o >= iv[0] - tolerance && o <= iv[1] + tolerance,
        iv => [iv[0], iv[1]],
      );
      if (!found) continue;
      if (found.tied) return base;
      const retry = withOmegaAssignment(context, new Set(hits), found.marked,
        () => validatePhysicalBlockUnderAssignment(block, context));
      if (retry.ok) return Object.assign(retry, { omegaHits: found.marked });
    }
    return base;
  }

  function validatePhysicalBlockUnderAssignment(block, context) {
    const prevKey = context && context._activeCritKey;
    if (context) context._activeCritKey = critKeyForBlock(block);
    try {
      const intervals = [];
      let known = 0, unknown = 0;
      for (const h of block.hits.filter(h => !h.overkill)) {
        if (h.zeroDamageDodge) { unknown++; continue; }
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
          let low = 0;
          let high = vals.length;
          while (low < high) {
            const mid = (low + high) >>> 1;
            if (vals[mid] < base) low = mid + 1;
            else high = mid;
          }
          let pick;
          if (low === 0) pick = vals[0];
          else if (low === vals.length) pick = vals[vals.length - 1];
          else {
            const lower = vals[low - 1];
            const upper = vals[low];
            pick = base - lower <= upper - base ? lower : upper;
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

  // S-004a/D-010a: hits do MESMO mob no MESMO estado de modificadores (EW, prey,
  // amplification, crit-flags) tem inversao exata -- mesmo componente => mesmo dano
  // final. `perHit` e uma lista de { hit, originals } (ja filtrada por !overkill, com
  // originals conhecidos). Extraido de validateElementalBlock para reuso: o gate de
  // evidencia positiva mage/druid (H-005c) precisa do MESMO teste aplicado a um bloco
  // fundido hipotetico (AA + spell juntos) antes de decidir se separa o primeiro hit,
  // nao so ao bloco ja escolhido.
  // S-004c: a folga cross-state de omega esta ARMADA so na passada de ultimo recurso
  // (`context._omegaCrossStateTolerance`, ver resolveTurn) e so em sessao com omega. Fora
  // disso nem a marca por hit e calculada — em todo fixture sem omega este caminho e inerte,
  // inclusive em custo.
  function omegaCrossStateArmed(context) {
    return !!(context && context._omegaCrossStateTolerance && omegaSessionActive(context));
  }

  // A folga vale se e so se o grupo MISTURA atribuicoes de omega. Grupo de mesma atribuicao
  // (todos marcados ou nenhum marcado) continua exato, tolerancia 0.
  function omegaCrossStateToleranceFor(group, context) {
    const first = group[0].omegaAssigned;
    return group.some(x => x.omegaAssigned !== first) ? context._omegaCrossStateTolerance : 0;
  }

  function sameMobStateExactnessViolation(perHit, context) {
    const armed = omegaCrossStateArmed(context);
    const stateGroups = new Map();
    for (const ph of perHit) {
      // M-016d/M-016e: uma spell multiestagio produz, do MESMO cast e no MESMO mob,
      // hits de potencia diferente (blast integral + estagio atrasado a 1/2, 3/8 ou
      // 5/8). Comparar cross-estagio quebraria a exatidao same-mob por construcao, o
      // que e o oposto do que S-004a quer dizer -- o estagio faz parte do "estado" do
      // hit, tanto quanto EW/prey/crit. Agrupar por (estado, estagio) mantem a
      // comparacao exata DENTRO de cada estagio e nao inventa contradicao entre eles.
      // Caso-prova: `death echo` 11:06:08 e 11:06:20 (gabarito 35/37, normativos).
      // S-004c: omega NAO entra na chave — separar em grupos DESLIGARIA a comparacao entre
      // hits com e sem omega. Ele entra como marca, para que so o par misto ganhe folga e o
      // par de mesma atribuicao continue exato.
      if (armed) ph.omegaAssigned = !!omegaActiveForHit(ph.hit, context);
      const key = elementalStateKey(ph.hit) + '|' + (ph.hit.multiStageStage || '');
      if (!stateGroups.has(key)) stateGroups.set(key, []);
      stateGroups.get(key).push(ph);
    }
    for (const group of stateGroups.values()) {
      if (group.length < 2) continue;
      const physical = group.every(x => x.interval);
      const tolerance = armed ? omegaCrossStateToleranceFor(group, context) : 0;
      const exact = physical
        ? intersectIntervals(group.map(x => x.interval), tolerance)
        : intersectSets(group.map(x => x.originals), tolerance);
      if (!exact || !exact.length) {
        return {
          violated: true,
          group: group.map(x => ({
            mob: x.hit.mob,
            dmg: x.hit.dmg,
            originals: x.originals,
            interval: x.interval,
          })),
        };
      }
    }
    return { violated: false };
  }

  // Recomputa originais elementais para um conjunto de hits (sem depender de um bloco
  // ja validado) e roda `sameMobStateExactnessViolation` sobre eles. Usado pelo gate de
  // evidencia positiva mage/druid (H-005c) para testar o bloco FUNDIDO (AA + spell)
  // contra o SUFIXO (so spell) sem reimplementar a reconstrucao de original.
  function sameMobStateExactnessForHits(hits, element, context) {
    if (!element || element === 'unknown') return { known: 0, violated: false };
    const perHit = [];
    for (const h of hits || []) {
      if (h.overkill || h.zeroDamageDodge || h.virtual) continue;
      if (element === 'physical') {
        const physical = physicalOriginalInterval(h, context);
        if (!physical || !physical.known || !physical.interval) continue;
        perHit.push({ hit: h, interval: physical.interval });
        continue;
      }
      const ev = elementalOriginalCandidates(h, element, context);
      if (!ev || !ev.known || !ev.originals || !ev.originals.length) continue;
      perHit.push({ hit: h, originals: ev.originals });
    }
    return Object.assign({ known: perHit.length }, sameMobStateExactnessViolation(perHit, context));
  }

  // H-005c: evidencia positiva de AA mage/druid quando o bloco FUNDIDO (AA + spell)
  // viola a exatidao same-mob/same-estado (S-004a) mas o SUFIXO (so spell, sem o
  // primeiro hit) passa a mesma checagem -- ou seja, separar o primeiro hit resolve a
  // quebra. So se aplica a acoes elementais concretas (nao fisicas); sem elemento
  // conhecido nao ha evidencia (nem positiva nem negativa) por este caminho.
  // M-035: beams de sorcerer (Energy Beam, Great Energy Beam, Great Death Beam)
  // tem sub-linhas central/side. O bonus de Beam Mastery por alvo e por sub-linha,
  // entao a fracao observada e 0.70 * bonusSide / bonusCentral.
  const BEAM_ACTION_WORDS = new Set(['exevo vis lux', 'exevo gran vis lux', 'exevo max mort']);
  const BEAM_EFFECTIVE_ELEMENTS = ['death', 'energy', 'fire'];
  const BEAM_BASE_SIDE_FRACTION = 0.70;
  const BEAM_MASTERY_TARGET_RATES = [0, 0.10, 0.12, 0.14];
  function isBeamAction(action) {
    return !!(action && BEAM_ACTION_WORDS.has(normalizeName(action.text || '')));
  }

  function beamMasteryMultiplier(hitCount, rate) {
    return 1 + (+rate || 0) * Math.min(3, Math.max(0, +hitCount || 0));
  }

  function representativeOriginal(originals) {
    const vals = (originals || []).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!vals.length) return null;
    return (vals[0] + vals[vals.length - 1]) / 2;
  }

  // M-035: a menor fracao side/central que a mecanica declarada consegue produzir. O
  // bonus de Beam Mastery e por sub-linha e satura em 3 alvos, entao a razao observada
  // vive em `0,70 x mult(side)/mult(central)`, cujo extremo inferior e o side sem bonus
  // contra o central saturado. Constante DERIVADA das declaradas acima, nao um limiar
  // novo: ~0,493.
  const BEAM_MIN_SUBLINE_FRACTION = BEAM_BASE_SIDE_FRACTION
    / beamMasteryMultiplier(3, Math.max(...BEAM_MASTERY_TARGET_RATES));

  // S-004a/M-035/H-005c: a isencao de beam da exatidao same-mob existe porque central e
  // side sao dois niveis declarados no MESMO mob. Ela so vale quando a divergencia
  // observada cabe na mecanica: uma razao muito abaixo de `BEAM_MIN_SUBLINE_FRACTION`
  // nao e sub-linha nenhuma, e isentar ali apaga evidencia positiva de AA. Caso-prova:
  // `Mrowdy 2`/`ms boss` `17:16:37` — `roaming dread` com 112 e 2448 no mesmo estado
  // (razao 0,046) enquanto o AA da sessao nesse mob tem mediana 124 em 1020 hits; a
  // sub-linha exigiria ~1714. Contra-exemplo que continua isento: `kim` `16:13:26`,
  // `stalking stalk` 1155/1650 = 0,700 exato.
  function beamSublineExplainsSameMobSpread(hits, element, context) {
    const groups = new Map();
    for (const h of hits || []) {
      if (h.overkill || h.zeroDamageDodge || h.virtual) continue;
      const ev = elementalOriginalCandidates(h, element, context);
      if (!ev || !ev.known || !ev.originals || !ev.originals.length) continue;
      const representative = representativeOriginal(ev.originals);
      if (!Number.isFinite(representative) || representative <= 0) continue;
      const key = elementalStateKey(h);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(representative);
    }
    for (const values of groups.values()) {
      if (values.length < 2) continue;
      const min = Math.min(...values);
      const max = Math.max(...values);
      if (!(max > 0)) continue;
      if (min / max < BEAM_MIN_SUBLINE_FRACTION) return false;
    }
    return true;
  }

  function beamSublineLeechOk(hits, action, context) {
    if (!hits || !hits.length) return false;
    const res = validateLeechBlockOfficialRates({ comp: 'spell', hits, action }, context);
    return !res.usable || !!res.ok;
  }

  function validateBeamSublineBlock(block, context) {
    const action = block && block.action;
    if (!isBeamAction(action)) return null;
    const hits = (block.hits || []).filter(isMainHit);
    const visible = hits.filter(h => !h.overkill && !h.zeroDamageDodge && !h.virtual);
    if (visible.length < 3) return { ok: false, beam: true, reason: 'beam_subline_not_enough_hits' };

    const results = [];
    for (const element of BEAM_EFFECTIVE_ELEMENTS) {
      const perHit = [];
      for (const h of visible) {
        const ev = elementalOriginalCandidates(h, element, context);
        if (!ev || !ev.known || !ev.originals || !ev.originals.length) continue;
        const representative = representativeOriginal(ev.originals);
        if (representative == null) continue;
        const state = (h.realCrit ? 1 : 0) + '|' + (h.lowBlow ? 1 : 0) + '|' +
          (h.savageBlow ? 1 : 0) + '|' + (h.onslaught ? 1 : 0);
        perHit.push({ hit: h, originals: ev.originals, representative, state });
      }
      if (perHit.length < 3) {
        results.push({ ok: false, element, known: perHit.length, reason: 'beam_subline_not_enough_known_hits' });
        continue;
      }
      const elementResults = [];
      const anchorGroups = [perHit];
      for (let groupIndex = 0; groupIndex < anchorGroups.length; groupIndex++) {
        const anchors = anchorGroups[groupIndex].slice().sort((a, b) => a.representative - b.representative);
        for (let split = 1; split < anchors.length; split++) {
          const side = anchors.slice(0, split);
          const central = anchors.slice(split);
          const sideCluster = minimalCandidateCluster(side.map(x => x.originals));
          const centralCluster = minimalCandidateCluster(central.map(x => x.originals));
          if (!sideCluster || !centralCluster) continue;
          if (sideCluster.span > elementalClusterTolerance(sideCluster.center)) continue;
          if (centralCluster.span > elementalClusterTolerance(centralCluster.center)) continue;

          // M-035/D-008/D-011/D-019/D-023-D-026: os clusters sao provados apenas
          // pelos hits de estado critico comparavel. Hits de outro estado e overkills
          // continuam hits principais reais; distribua-os entre side/central e deixe
          // a cardinalidade completa por leech eliminar as hipoteses impossiveis.
          const anchored = new Set(anchors.map(x => x.hit));
          const remaining = hits.filter(h => !anchored.has(h));
          let assignments = [{ side: [], central: [] }];
          for (const h of remaining) {
            const next = [];
            for (const assignment of assignments) {
              next.push({ side: assignment.side.concat([h]), central: assignment.central });
              next.push({ side: assignment.side, central: assignment.central.concat([h]) });
            }
            assignments = next;
          }

          for (const assignment of assignments) {
            const sideHits = side.map(x => x.hit).concat(assignment.side);
            const centralHits = central.map(x => x.hit).concat(assignment.central);
            if (!beamSublineLeechOk(sideHits, action, context)) continue;
            if (!beamSublineLeechOk(centralHits, action, context)) continue;
            for (const rate of BEAM_MASTERY_TARGET_RATES) {
              const expectedFraction = BEAM_BASE_SIDE_FRACTION
                * beamMasteryMultiplier(sideHits.length, rate)
                / beamMasteryMultiplier(centralHits.length, rate);
              const expectedSide = centralCluster.center * expectedFraction;
              const tolerance = elementalClusterTolerance(expectedSide);
              const delta = Math.abs(sideCluster.center - expectedSide);
              if (delta > tolerance) continue;
              const sideSet = new Set(sideHits);
              elementResults.push({
                ok: true,
                element,
                rate,
                expectedFraction,
                beamFraction: sideCluster.center / centralCluster.center,
                sideCount: sideHits.length,
                centralCount: centralHits.length,
                sideCluster,
                centralCluster,
                side,
                central,
                sideHits,
                centralHits,
                assignmentSignature: hits.map(h => sideSet.has(h) ? 's' : 'c').join(''),
                delta,
                tolerance,
                reason: 'beam_subline_mastery_cluster',
              });
            }
          }
        }

        // D-008/C-007: se o bloco completo nao fecha porque crit/Low Blow de um
        // subconjunto usa evidencia de critico indisponivel, tente cada estado
        // comparavel como ancora. Os demais hits so entram depois, pela cardinalidade.
        if (groupIndex === 0 && !elementResults.length) {
          const byState = new Map();
          for (const x of perHit) {
            if (!byState.has(x.state)) byState.set(x.state, []);
            byState.get(x.state).push(x);
          }
          for (const group of byState.values()) {
            if (group.length >= 2 && group.length < perHit.length) anchorGroups.push(group);
          }
        }
      }
      results.push(...elementResults);
    }

    const profileElement = action && action.profile && action.profile.element;
    const ok = results.filter(r => r.ok).sort((a, b) =>
      a.delta - b.delta
      || (a.sideCluster.span + a.centralCluster.span) - (b.sideCluster.span + b.centralCluster.span)
      || (a.element === profileElement ? -1 : 0)
      || (b.element === profileElement ? 1 : 0)
    );
    const best = ok[0];
    if (!best) return { ok: false, beam: true, reason: 'beam_subline_no_mastery_cluster', candidates: results };

    // D-006/C-007: mais de uma distribuicao valida nao derruba a prova inteira
    // do beam. Grave somente os hits cujo tier e unanime entre todas as explicacoes
    // mecanicamente validas; os divergentes permanecem sem beamSide e podem ser
    // exibidos como cobertura parcial, sem inventar certeza pelo dano truncado.
    const assignmentSignatures = Array.from(new Set(ok.map(r => r.assignmentSignature)));
    const resolvedSideHits = [];
    const resolvedCentralHits = [];
    const ambiguousHits = [];
    for (let i = 0; i < hits.length; i++) {
      const tiers = new Set(assignmentSignatures.map(signature => signature[i]));
      if (tiers.size !== 1) {
        ambiguousHits.push(hits[i]);
        delete hits[i].beamSide;
        delete hits[i].beamMasteryTargetRate;
        continue;
      }
      const tier = tiers.values().next().value;
      hits[i].beamSide = tier === 's' ? 'side' : 'central';
      hits[i].beamMasteryTargetRate = best.rate;
      if (tier === 's') resolvedSideHits.push(hits[i]);
      else resolvedCentralHits.push(hits[i]);
    }

    return {
      ok: true,
      beam: true,
      element: best.element,
      beamElement: best.element,
      beamFraction: best.beamFraction,
      beamExpectedFraction: best.expectedFraction,
      beamMasteryTargetRate: best.rate,
      beamSideCount: resolvedSideHits.length,
      beamCentralCount: resolvedCentralHits.length,
      beamAmbiguousCount: ambiguousHits.length,
      sideCluster: {
        min: best.sideCluster.min,
        max: best.sideCluster.max,
        span: best.sideCluster.span,
        center: best.sideCluster.center,
        tolerance: elementalClusterTolerance(best.sideCluster.center),
      },
      centralCluster: {
        min: best.centralCluster.min,
        max: best.centralCluster.max,
        span: best.centralCluster.span,
        center: best.centralCluster.center,
        tolerance: elementalClusterTolerance(best.centralCluster.center),
      },
      reason: best.reason,
      rule: 'M-035/D-010a/S-004',
    };
  }

  function firstHitSeparationFixesSameMobExactness(hits, action, context) {
    const element = action && action.profile && action.profile.element;
    if (!element || element === 'unknown') return false;
    if (!hits || hits.length < 2) return false;
    // M-035/M-037: níveis distintos no mesmo mob são parte declarada da
    // mecânica de beam/chain. A exatidão same-mob não pode virar evidência
    // positiva de AA quando a própria ação explica essa diferença — mas só
    // enquanto ela DE FATO explica: no beam, uma razão same-mob abaixo da menor
    // fração que central/side conseguem produzir não é sub-linha, e manter a
    // isenção ali engole o AA de varinha dentro do bloco da spell.
    if (isChainedPenanceAction(action)) return false;
    if (isBeamAction(action) && beamSublineExplainsSameMobSpread(hits, element, context)) return false;
    // Terra/Ice Burst tem 2 niveis de bonus legitimos por-mob (bonus ativo/inativo
    // conforme a vida do alvo) -- a checagem crua same-mob (abaixo) nao sabe disso e
    // trataria 2 tiers reais como mismatch. Reusar validateTerraBurstBonusBlock (o
    // mesmo validador que o bloco final usa) em vez de reimplementar a logica de tier.
    const fusedBlock = { comp: 'spell', hits: hits.slice(), action };
    const terraBurstFused = validateTerraBurstBonusBlock(fusedBlock, element, context);
    if (terraBurstFused) {
      if (terraBurstFused.ok) return false;
      const suffixBlock = { comp: 'spell', hits: hits.slice(1), action };
      const terraBurstSuffix = validateTerraBurstBonusBlock(suffixBlock, element, context);
      return !!(terraBurstSuffix && terraBurstSuffix.ok);
    }
    const fused = sameMobStateExactnessForHits(hits, element, context);
    if (!fused.violated) return false;
    const suffix = sameMobStateExactnessForHits(hits.slice(1), element, context);
    return !suffix.violated;
  }

  // H-005b: fronteira de crit-state entre o primeiro hit e um sufixo uniformemente
  // critico (ou uniformemente nao-critico), independente de setup de leech -- avaliavel
  // no pass-1 (bootstrap), ao contrario de shouldForceA1ByLeech (que exige
  // context.leechSetup e por isso so decide no pass-2). Mesma logica de `critBoundary`
  // dentro de shouldForceA1ByLeech, extraida para reuso direto no gate de evidencia.
  // D-007/D-008/D-009/S-008: o "estado especial" de um hit (crit real, Onslaught ou Low
  // Blow) e o mesmo agrupamento que validateCritHomogeneity usa para vetar bloco misto —
  // fronteira de evidencia (b) precisa enxergar exatamente essa mesma nocao de estado,
  // senao um veto por Onslaught assimetrico (comum: o AA nao tem o proc, o resto do bloco
  // de area tem) nunca vira evidencia positiva de separacao.
  function specialCritState(h) {
    return componentCritState(h);
  }

  function firstHitCritStateBoundary(hits) {
    const main = (hits || []).filter(isMainHit);
    if (main.length < 2) return false;
    const first = main[0];
    const suffix = main.slice(1);
    if (!suffix.length) return false;
    const suffixState = specialCritState(suffix[0]);
    const uniform = suffix.every(h => specialCritState(h) === suffixState);
    return uniform && specialCritState(first) !== suffixState;
  }

  function validateElementalBlock(block, element, context) {
    const base = validateElementalBlockUnderAssignment(block, element, context);
    if (base.ok || !omegaSessionActive(context)) return base;
    if (element === 'physical' || !element || element === 'unknown') return base;
    // Sem candidato calculavel nao ha o que atribuir: o segundo candidato de omega e uma
    // reversao a mais do MESMO hit, nao evidencia nova (D-006).
    if (base.reason === 'elemental_no_candidate') return base;
    const hits = block.hits.filter(h => !h.overkill && !h.zeroDamageDodge);
    if (hits.length < 2) return base;
    const originalsOf = (hit, marked) => {
      const ev = withOmegaAssignment(context, new Set([hit]), marked ? new Set([hit]) : EMPTY_OMEGA_SET,
        () => elementalOriginalCandidates(hit, element, context));
      return ev && ev.known && ev.originals && ev.originals.length ? ev.originals : null;
    };
    // Mesma tolerancia que o proprio bloco usaria na intersecao: ela existe so para o
    // residuo discreto entre mobs (quantizacao da mitigation), nunca para colar dois
    // niveis de verdade — o passo de omega e ~6%, ordens de grandeza acima dela.
    const tolerance = elementalBlockTolerance(block);
    const found = findOmegaAssignmentByLevel(
      hits,
      originalsOf,
      (originals, o) => originals.some(v => Math.abs(v - o) <= tolerance),
      originals => originals,
    );
    if (!found) return base;
    // Mesma disciplina do eixo fisico: duas atribuicoes minimas DISTINTAS que fecham sao
    // duas leituras igualmente apoiadas, e o nivel do bloco — que e quem deveria derivar o
    // rotulo (D1) — fica indeterminado. Escolher uma seria decidir sem evidencia, contra
    // D-006. Medido em `crypt` (unico fixture com omega): 0 empates em 151.634 atribuicoes
    // elementais e 0 em 50.925 fisicas, entao este ramo e guarda, nao caminho quente.
    if (found.tied) return base;
    const retry = withOmegaAssignment(context, new Set(hits), found.marked,
      () => validateElementalBlockUnderAssignment(block, element, context));
    return retry.ok ? Object.assign(retry, { omegaHits: found.marked }) : base;
  }

  function validateElementalBlockUnderAssignment(block, element, context) {
    const prevCritKey = context && context._activeCritKey;
    if (context) context._activeCritKey = critKeyForBlock(block);
    try {
    if (!element || element === 'unknown') return { ok: true, known: 0, unknown: block.hits.length, reason: 'unknown_action_element' };
    if (element === 'physical') return validatePhysicalBlock(block, context);
    // V26: Terra Burst / exevo ulus tera has a global bonus level (+20/+40/+60),
    // but activation is per mob/hit. Test active=false/true per hit under one
    // global level before falling back to generic elemental cluster logic.
    const beam = validateBeamSublineBlock(block, context);
    if (beam && beam.ok) return beam;
    const terraBurst = validateTerraBurstBonusBlock(block, element, context);
    if (terraBurst && terraBurst.ok) return terraBurst;
    const sets = [];
    const perHit = [];
    let known = 0, unknown = 0;
    for (const h of block.hits.filter(h => !h.overkill)) {
      if (h.zeroDamageDodge) { unknown++; continue; }
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
    const sameMob = sameMobStateExactnessViolation(perHit, context);
    if (sameMob.violated) {
      return {
        ok: false,
        rule: 'S-004/S-005/D-010a/H-001',
        reason: 'same_mob_state_exact_original_mismatch',
        element, known, unknown,
        group: sameMob.group,
      };
    }
    // D-010/S-004: a reconstrução elemental é discreta, mas diferenças pequenas
    // podem surgir de arredondamento de mitigação/prey/mods pós-cutoff. Para runa
    // com Using explícito (M-017/M-018a), a linha de execução é sinal primário e
    // aceitamos uma tolerância um pouco maior no original para absorver diferenças
    // discretas entre mobs/mitigação sem transformar quantidade de hits em critério.
    const tolerance = elementalBlockTolerance(block);
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
        // S-004b: dispersão entre mobs distintos é evidência AUSENTE (D-006), não
        // contradição — V-015b/V-015d proíbem rejeitar o bloco por ela, e o resolvedor
        // nunca veta por este motivo. A marcação existe para que quem só lê o
        // diagnóstico (auditoria de invariantes) enxergue a mesma distinção que o
        // resolvedor já faz, sem manter uma segunda lista de motivos benignos.
        return { ok: false, rule: 'S-004/S-005/H-001', reason: 'elemental_cluster_span_too_wide', evidence: 'absent', evidenceReason: 'cross_mob_dispersion', element, known, unknown, tolerance, cluster: { min: cluster.min, max: cluster.max, span: cluster.span, center: cluster.center, tolerance: clusterTolerance, chosenOriginals: cluster.chosen } };
      }
    }

    if (sets.length && !inter.length) return { ok: false, rule: 'S-004/S-005/H-001', reason: 'elemental_intersection_empty', element, known, unknown, tolerance };
    return { ok: true, known, unknown, intersection: inter, element, tolerance };
    } finally {
      if (context) context._activeCritKey = prevCritKey;
    }
  }


  function validateLeechBlock(block, context, turn, allowScoredVirtual) {
    const main = (block.hits || []).filter(isMainHit);
    const k = main.length;
    if (!k) return { ok: true, usable: false, k: 0 };
    const setup = context && context.leechSetup;
    if (leechSetupConfidence(setup) === 'unknown') return { ok: true, usable: false, k, reason: 'leech_setup_unknown' };
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return { ok: true, usable: false, k, reason: 'setup_unknown' };

    // M-016d/D-023: cada explosão de uma ação multiestágio dilui leech pela
    // própria cardinalidade. A agregação pública continua sendo um único spell,
    // mas N_leech nunca é fundido entre primary e echo.
    // `sortedUnique` is numeric-only: applying it to `primary`/`echo`
    // converts both labels to NaN and leaves every stage group empty.
    const stageIds = Array.from(new Set(main.map(h => h.multiStageStage).filter(Boolean)));
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
    // Outside the A0-vs-A1 comparison, preserve conservative ownership: a
    // passing visible block must not claim a charm-kill that may belong to
    // another component in the same turn. The single-target-AA resolver opts
    // into the larger-N test because its area action is the only possible owner.
    if ((base.ok || !base.usable) && !allowScoredVirtual) return base;

    // V12: componente de área pode ter hit principal invisível quando um charm/proc
    // entra antes do dano do hit que o ativou e mata o alvo. Nesse caso os hits
    // visíveis dizem que N_leech é maior que K_visível. Só aceitamos N>K se houver
    // charm/proc elegível explicando cada hit virtual. Ex.: S5 visível, mas leech
    // fecha N=6 e há Overpower Charm no mesmo timestamp => S5 S0×1.
    const virtualEligible = (canUseLeechAsHardReject(context)
      || (allowScoredVirtual && canScoreLeech(context)))
      ? eligibleVirtualZeroCharmsForBlock(turn, block, context)
      : [];
    if (canUseVirtualZeroForBlock(block) && virtualEligible.length) {
      const maxExtra = Math.min(2, virtualEligible.length);
      let winner = null;
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
          // S-014e selects the greatest still-consistent N, including when
          // visible N=k already passes.
          winner = trial;
        }
      }
      if (winner) return winner;
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
        // S-007: o eixo do bloco de AA e fisico POR PADRAO, mas municao de area
        // elemental (regime pos-cutoff) existe. `context.aaElement` e inferido por
        // sessao (inferAaElementForSession) e vale 'physical' em toda sessao sem prova
        // do contrario -- inclusive quando nao ha evidencia nenhuma.
        const aaElement = (context && context.aaElement) || 'physical';
        const det = block.comp === 'arrow'
          ? (aaElement === 'physical' ? validatePhysicalBlock(block, context) : validateElementalBlock(block, aaElement, context))
          : validateElementalBlock(block, element, context);
        // M-039: o leech NAO consome a atribuicao de omega, de proposito. A base de leech e
        // o dano exibido COM omega dentro: ele infla o dano e o leech na mesma proporcao
        // (medido em `crypt`: life 1,0596 e mana 1,0541 para dano 1,060), ao contrario de
        // prey/Bounty/`utevo grav san`, que inflam so o dano e por isso saem do divisor de
        // `leechDamageBasis` (D-030).
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

  // D-011/D-012: um hit de overkill herda o componente do bloco contíguo definido pelos
  // OUTROS hits e "nunca cria fronteira". Quando TODOS os hits principais elegíveis do turno
  // são overkill, não existe "outro hit" — logo nenhuma fronteira pode ser apoiada só na
  // posição deles. Uma partição de 2+ componentes só continua admissível se a fronteira
  // tiver evidência independente do overkill: mudança de segundo (M-005/M-012), mudança de
  // crit-state (D-007/S-008), linha `Using` de runa (M-017) ou janela de granada (M-023).
  //
  // Caso-prova: barrage 19:04:08 — 4 hits, todos CRIT e todos overkill, no MESMO segundo,
  // com `exevo mas san` como único cast. O corte A3|S1 era criado exclusivamente entre hits
  // de overkill; sem ele o turno fecha como componente único (`A0 S4`, Divine Caldera), que
  // é o resultado normativo do gabarito.
  function overkillOnlyBoundaryUnsupported(candidate, turn, actions) {
    if (!candidate || !candidate.components || candidate.components.length < 2) return false;
    const mainHits = (turn.hits || []).filter(isMainHit);
    if (mainHits.length < 2) return false;
    if (!mainHits.every(h => h.overkill)) return false; // sobra hit não-overkill: ele define o bloco

    // Granada tem janela própria (M-023) e é evidência de fronteira por construção.
    if (candidate.shape.indexOf('grenade') !== -1) return false;
    // `Using` de runa é sinal primário (M-017) e sustenta a fronteira sozinho.
    if (candidate.shape.indexOf('rune') !== -1 && actions && actions.runeUses && actions.runeUses.length) return false;

    const critKey = h => (componentCritState(h) ? 'c' : 'n') + (h.onslaught ? 'O' : '');
    for (let i = 1; i < candidate.components.length; i++) {
      const prev = candidate.components[i - 1].hits || [];
      const cur = candidate.components[i].hits || [];
      if (!prev.length || !cur.length) continue;
      const last = prev[prev.length - 1], first = cur[0];
      if (last.ts !== first.ts) return false;              // fronteira temporal: evidência real
      if (critKey(last) !== critKey(first)) return false;  // fronteira de crit-state: evidência real
    }
    return true; // nenhuma fronteira tem apoio fora da posição dos overkills
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
      if (block.comp === 'rune') {
        const profile = block.action && block.action.profile;
        const offensiveProfile = block.action
          && !block.action.ignored
          && profile
          && profile.element !== 'unknown'
          && (profile.topology === 'single' || profile.topology === 'area');
        if (!offensiveProfile) {
          violations.push({
            rule: 'M-018/M-022/N-005',
            reason: block.action ? 'rune_profile_not_offensive' : 'rune_without_eligible_using',
            block,
          });
        } else {
          const runeBoundary = validateRuneUsingBoundary(block, block.action, actions);
          if (!runeBoundary.ok) violations.push(Object.assign({ block }, runeBoundary));
        }
      }
      if (block.comp === 'grenade' && !block.action) violations.push({ rule: 'M-023/N-004', reason: 'grenade_without_cast', block });
      if (block.comp === 'grenade' && block.action) {
        const okImpact = block.hits.every(h => h.ts >= block.action.ts + 2 && h.ts <= block.action.ts + 4);
        const timestamps = [...new Set(block.hits.map(h => Number.isFinite(h.ordTs) ? h.ordTs : h.ts))]
          .sort((a, b) => a - b);
        const oneMechanicalImpact = timestamps.length === 1 ||
          (timestamps.length === 2 && timestamps[1] - timestamps[0] === 1);
        if (!okImpact) violations.push({ rule: 'M-023', reason: 'grenade_outside_impact_window', block });
        if (!oneMechanicalImpact) violations.push({ rule: 'M-024/M-025', reason: 'grenade_multiple_impact_timestamps', block });
      }
    }

    if (candidate.shape.includes('spell') && candidate.shape.includes('rune')) violations.push({ rule: 'T-006/M-019', reason: 'spell_and_rune_same_turn' });

    if (overkillOnlyBoundaryUnsupported(candidate, turn, actions)) {
      violations.push({ rule: 'D-011/D-012', reason: 'overkill_only_boundary_without_independent_evidence' });
    }

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
      // M-039: a atribuicao de omega pertence a ESTE bloco desta particao candidata. Os
      // objetos de hit sao compartilhados entre todas as particoes, entao o rotulo NAO
      // pode ser gravado no hit aqui — so quando a particao vencedora for consolidada.
      block.omegaHits = (det && det.omegaHits) || null;
      diagnostics.push({ kind: 'deterministic', block, result: det, gravSanActive: block.gravSanActive, gravSanTested: block.gravSanTested });
      if (!det.ok) violations.push(Object.assign({ block }, det));

      if (leech && leech.virtualZeroHits && leech.virtualZeroHits.length) {
        block.virtualZeroHits = leech.virtualZeroHits;
        block.hits = block.hits.concat(leech.virtualZeroHits);
      }
      block.leech = leech;
      diagnostics.push({ kind: 'leech', block, result: leech, gravSanActive: block.gravSanActive, gravSanTested: block.gravSanTested });
      if (block.comp === 'grenade') {
        const impactTimestamps = new Set(block.hits.map(h => Number.isFinite(h.ordTs) ? h.ordTs : h.ts));
        if (impactTimestamps.size === 2 && (!leech || !leech.usable || !leech.ok)) {
          violations.push({ rule: 'M-024/D-023/D-024/S-014', reason: 'grenade_rollover_without_usable_leech_proof', block, leech });
        }
      }
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
          // S-014f: em turno integralmente de boss, M-009a/M-010/M-026/V-006 já forçam
          // blocos de 1 hit em TODA partição válida, logo N_leech = 1 e o leech esperado
          // é idêntico entre elas — a evidência não discrimina, só reprova todas juntas.
          // O leech continua calculado e exposto no diagnóstico; só deixa de vetar.
          if (!isBoss) violations.push({ rule: leech.rule, reason: 'leech_cardinality_failed', block, leech });
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
    const critOf = h => componentCritState(h);
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

  // M-012/M-013/M-017/M-018a: o efeito não precede a causa. As janelas normativas
  // toleram um cast/`Using` até 1 s DEPOIS do impacto (defasagem Server Log × Local
  // Chat), mas essa folga é um último recurso, não evidência.
  // A comparação é contra o ÚLTIMO hit do bloco, não o primeiro: uma spell de área
  // atravessa segundos (`t-1`/`t`/`t+1`, M-031), então um bloco começar antes do cast
  // é normal e não torna o cast acausal — o que o torna acausal é ele ser posterior a
  // TODOS os hits que estaria explicando, caso em que não explica nenhum. Medir pelo
  // primeiro hit condenava blocos multi-segundo legítimos (caso-prova negativo:
  // `bakra` `09:23:20`/`09:27:02`, cujo `Divine Caldera` começa 1 s antes do cast).
  // A granada é causal por construção — validateCandidate já exige que todo hit caia
  // em [cast+2, cast+4] (M-023) —, então este sinal nunca a penaliza.
  // Caso-prova: `rpboss` `09:40:31`, onde o hit de `:32` era nomeado pelo
  // `exori gran con` castado em `:33` (posterior ao único hit do bloco) só porque o
  // cast de granada de `:29` perdia o desempate seguinte; o cast de `:33` é do turno
  // `09:40:33` (N-008).
  function acausalActionHits(candidate) {
    let total = 0;
    for (const b of candidate.components || []) {
      if (!b.action || b.comp === 'grenade') continue;
      const main = (b.hits || []).filter(isMainHit);
      if (!main.length) continue;
      const lastTs = Math.max.apply(null, main.map(h => h.ts || 0));
      if ((b.action.ts || 0) > lastTs) total += main.length;
    }
    return total;
  }

  function scoreCandidate(candidate, actions, context) {
    let deterministicHits = 0, unknownHits = 0, leechFits = 0, timing = 0, mechanicalOrder = 0, virtualZeroHits = 0, cappedLowHits = 0, leechContradictions = 0, actionRecencyPenalty = 0, grenadeRolloverPenalty = 0;
    const tsSplitPenalty = timestampSplitPenalty(candidate);
    const acausalHits = acausalActionHits(candidate);
    const comps = candidate.components || [];
    if (comps.length > 1 && comps[0] && comps[0].comp === 'arrow' && comps.slice(1).some(b => b && (b.comp === 'spell' || b.comp === 'rune' || b.comp === 'grenade')) && !arrowPrefixIsAbsorbable(comps, context)) {
      mechanicalOrder = comps.reduce((sum, b) => sum + ((b.hits || []).filter(isMainHit).length), 0);
    }
    const physDegenerate = physicalAxisTimingDegenerate(candidate);
    const timingDemoted = elementalSameSecondTimingDemoted(candidate, actions);
    for (const b of candidate.components) {
      if (b.comp === 'grenade') {
        const impactTimestamps = new Set((b.hits || []).map(h => Number.isFinite(h.ordTs) ? h.ordTs : h.ts));
        if (impactTimestamps.size > 1) grenadeRolloverPenalty++;
      }
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
      grenadeRolloverPenalty,
      acausalHits,
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
    const boundaryLeech = compareTimestampLeechBoundary(a, b);
    if (boundaryLeech) return boundaryLeech;
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
      // M-024: dois timestamps são uma permissão de rollover, não evidência
      // para engolir uma spell concreta que a forma-base de um timestamp
      // preserva. Aplica-se só depois das provas determinística e de leech.
      ['grenadeRolloverPenalty', 1],
      // M-012/M-013/M-017/M-018a: entre partições que empatam em toda a evidência
      // determinística e de leech, a que NÃO precisa de uma ação posterior aos
      // próprios hits vence. A folga de +1 s das janelas é defasagem de relógio,
      // não prova; usá-la como desempate é o que fazia um turno reivindicar o cast
      // do turno seguinte (N-008). Vem antes de `actionRecencyPenalty` porque a
      // distância ao centro é geometria, e esta é ordem causal.
      ['acausalHits', 1],
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

  function compareTimestampLeechBoundary(a, b) {
    const ca = a && a.candidate, cb = b && b.candidate;
    if (!ca || !cb) return 0;
    if ((ca.shape || []).join('>') !== 'arrow>spell') return 0;
    if ((cb.shape || []).join('>') !== 'arrow>spell') return 0;
    if (!ca.cuts || !cb.cuts || ca.cuts.length !== 2 || cb.cuts.length !== 2) return 0;
    if (ca.cuts[1] !== cb.cuts[1]) return 0;
    if (Math.abs(ca.cuts[0] - cb.cuts[0]) !== 1) return 0;

    const spellA = ca.components && ca.components[1];
    const spellB = cb.components && cb.components[1];
    const actionA = spellA && spellA.action;
    const actionB = spellB && spellB.action;
    if (!actionA || !actionB) return 0;
    if (actionA.ts !== actionB.ts || normalizeName(actionA.text || '') !== normalizeName(actionB.text || '')) return 0;
    const profile = actionA.profile || {};
    if (profile.topology !== 'area') return 0;

    const timestampDelta = a.score.timestampSplitPenalty - b.score.timestampSplitPenalty;
    if (!timestampDelta) return 0;
    const cappedDelta = a.score.cappedLowHits - b.score.cappedLowHits;
    if (!cappedDelta || Math.sign(timestampDelta) !== Math.sign(cappedDelta)) return 0;
    if (a.score.leechContradictions > b.score.leechContradictions && timestampDelta < 0) return 0;
    if (b.score.leechContradictions > a.score.leechContradictions && timestampDelta > 0) return 0;
    if (a.score.leechFits < b.score.leechFits && timestampDelta < 0) return 0;
    if (b.score.leechFits < a.score.leechFits && timestampDelta > 0) return 0;

    // T-001/T-002/T-004 + S-018/S-019/H-001/H-003/H-005:
    // when timestamp boundary and leech-cardinality consensus agree, cast
    // alignment must not pull the boundary hit into the neighboring AoE spell.
    return timestampDelta;
  }


  function leechPartitionScore(blocks, context, turn) {
    const out = { usable: 0, clean: 0, bad: 0, details: [] };
    for (const block of blocks || []) {
      // During this resolver's comparison, the charm-kill virtual belongs to
      // the concrete area action, not to a positional AA block without action.
      const leech = validateLeechBlock(
        block,
        context,
        block && block.action ? turn : null,
        !!(block && block.action && turn)
      );
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

  // C-004/M-011: só uma incantação ofensiva do dono, e da vocação do dono, pode
  // nomear componente. O mesmo recorte serve à escolha da ação do turno inteiro
  // (hipótese fundida) e à da ação do componente final, por isso vive aqui em vez
  // de duplicado nos dois pontos de escolha.
  function offensiveSpellCastsForVocation(actions, vocation) {
    return (actions && actions.spellCasts || []).filter(c => {
      if (!c || !c.profile || c.profile.type !== 'attack') return false;
      if (vocation && c.profile.vocation && c.profile.vocation !== vocation) return false;
      return true;
    });
  }

  // Ações oferecidas a um componente de `comp` dentro do turno, com o mesmo
  // recorte de elegibilidade usado para escolher a ação do turno.
  function componentActionPool(comp, actions, vocation) {
    if (comp === 'spell') return { spellCasts: offensiveSpellCastsForVocation(actions, vocation) };
    if (comp === 'rune') return { runeUses: (actions && actions.runeUses) || [] };
    if (comp === 'grenade') return { grenadeCasts: (actions && actions.grenadeCasts) || [] };
    return actions;
  }

  function nearestSpellCastForTurn(turn, actions, vocation) {
    const hits = turn.hits || [];
    if (!hits.length) return null;
    return chooseActionForComponent('spell', hits, componentActionPool('spell', actions, vocation));
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
      savageBlow: false,
      onslaught: false,
      isPrey: false,
      bountyTalisman: false,
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
    const ts = Number.isFinite(impactTs) ? impactTs
      : (charm && Number.isFinite(+charm.ts) ? +charm.ts : v.ts);
    v.id = 'virtual_zero_charm_' + (charm && charm.seq != null ? charm.seq : (index || 0)) + '_' + ((turn && turn.id) || 'turn');
    v.seq = Number.isFinite(lastSeq) ? (lastSeq + 0.01 + (index || 0) / 100)
      : (charm && Number.isFinite(+charm.seq) ? (+charm.seq + 0.01 + (index || 0) / 100) : v.seq);
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

  const eligibleVirtualZeroEventsByContext = new WeakMap();
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

    const sourceEvents = context.serverEvents || [];
    let cachedEligible = eligibleVirtualZeroEventsByContext.get(context);
    if (!cachedEligible || cachedEligible.source !== sourceEvents || cachedEligible.length !== sourceEvents.length) {
      cachedEligible = {
        source: sourceEvents,
        length: sourceEvents.length,
        events: sourceEvents.filter(isEligibleVirtualZeroCharm),
      };
      eligibleVirtualZeroEventsByContext.set(context, cachedEligible);
    }

    return cachedEligible.events
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

  function spellLeechBonusOptionsForBlock(block, channel, resolvedEntry) {
    const entry = arguments.length >= 3 ? resolvedEntry : spellLeechBonusEntryForBlock(block);
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

  function leechEffectiveRateCandidates(setup, channel, block, hit, context) {
    const base = setup && channel === 'mana' ? (+setup.manaBase || 0) : (+setup.lifeBase || 0);
    const minorBonuses = leechMinorBonusOptionsForHit(setup, channel, hit);
    // D-022a: bônus de perk OPCIONAL, inferido por sessão junto com base e minor charm
    // (`setup.exposeWeaknessManaPerk`). Sem perk inferido — inclusive quando o setup é
    // desconhecido — a hipótese neutra é "sem bônus". O gate de data permanece porque o
    // perk só existe no regime pré-cutoff.
    const exposeWeaknessManaBonus = channel === 'mana'
      && hit && hit.exposeWeakness
      && setup && setup.exposeWeaknessManaPerk === true
      && context && context.sessionDateKey > 0
      && context.sessionDateKey < CUTOFF_KEY
      ? PRE_CUTOFF_EXPOSE_WEAKNESS_MANA_LEECH_BONUS
      : 0;
    let spellBonusEntry = null;
    let spellBonuses = [0];
    if (block && block.comp === 'spell') {
      spellBonusEntry = spellLeechBonusEntryForBlock(block);
      spellBonuses = spellLeechBonusOptionsForBlock(block, channel, spellBonusEntry);
    }
    const out = [];
    for (const minorBonus of minorBonuses || [0]) {
      for (const spellBonus of spellBonuses || [0]) {
        const bountyLifeMultiplier = channel === 'life'
          && hit && hit.bountyTalisman
          && setup && setup.bountyTalismanLifeConfidence !== 'unknown'
          && setup.bountyTalismanLifeBonus > 0
          ? 1 + setup.bountyTalismanLifeBonus
          : 1;
        const rate = (base + (+minorBonus || 0)) * bountyLifeMultiplier
          + (+spellBonus || 0)
          + exposeWeaknessManaBonus;
        if (rate > 0) out.push({
          rate: Math.round(rate * 1e6) / 1e6,
          minorBonus: +minorBonus || 0,
          minorMob: +minorBonus ? (channel === 'mana' ? setup.voidsMob : setup.vampiricMob) : null,
          spellBonus: +spellBonus || 0,
          bountyLifeBonus: bountyLifeMultiplier > 1 ? setup.bountyTalismanLifeBonus : 0,
          spellBonusEntry,
        });
      }
    }
    const seen = new Set();
    return out
      .sort((a, b) => a.rate - b.rate || a.spellBonus - b.spellBonus || a.minorBonus - b.minorBonus)
      .filter(x => {
        const key = [x.rate, x.minorBonus, x.spellBonus, x.bountyLifeBonus || 0].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  // Constantes de areaFactor(N) = LEECH_AREA_FLOOR + LEECH_AREA_NUMERATOR / N (D-023).
  // Espelham `areaFactor` de UnifiedSetupInference; a inversão precisa delas explícitas.
  const LEECH_AREA_FLOOR = 0.1;
  const LEECH_AREA_NUMERATOR = 0.9;

  // H-005e: o leech observado DECLARA em quantos alvos a ação bateu.
  //
  // Por D-023, leech = dano × taxa × areaFactor(N) com areaFactor(N) = 0,1 + 0,9/N.
  // A relação inverte sem limiar:  razão = observado / (dano × taxa),
  //                                N     = 0,9 / (razão − 0,1).
  // O hit declara N sozinho, sem comparação com os outros hits do turno.
  //
  // Condições normativas de H-005e implementadas aqui:
  //  - MENOR N entre vida e mana. Um canal capado só pode INFLAR a estimativa (leech
  //    observado menor que o esperado ⇒ razão menor ⇒ N maior), nunca deprimi-la; o
  //    menor dos dois é o piso honesto. Caso-prova: `tom` 12:33:20 — a mana está capada
  //    de verdade (obs 161 vs esp 257) e sozinha daria N=1,71; a vida dá N=1,02.
  //  - OVERKILL NÃO ESTIMA: o dano exibido é truncado e a razão perde o denominador.
  //  - O ARREDONDAMENTO é a tolerância: N é comparado ao inteiro mais próximo.
  //
  // D2 da change: N < 1 é impossível fisicamente. Um N abaixo de 1 significa leech ACIMA
  // do esperado para um alvo, que já é contradição dura no motor — nunca arredonda para 1.
  //
  // Setup ambíguo (mais de um candidato de taxa que não concordam no inteiro) não declara.
  // Isenções (beam M-035, estágio atrasado M-016d/M-016e) NÃO vivem aqui: esta função é
  // aritmética pura e quem decide se pode olhar é o consumidor.
  function leechDeclaredN(hit, setup, block, context) {
    if (!hit || !isMainHit(hit)) return null;
    if (hit.overkill) return null;
    const basis = leechDamageBasis(hit, context);
    if (!(basis > 0)) return null;
    const perChannel = [];
    for (const channel of ['life', 'mana']) {
      const observed = channel === 'mana' ? (+hit.manaLeech || 0) : (+hit.lifeLeech || 0);
      if (!(observed > 0)) continue;
      const rates = leechEffectiveRateCandidates(setup, channel, block, hit, context);
      if (!rates.length) continue;
      let rounded = null;
      let raw = null;
      let ambiguous = false;
      for (const cand of rates) {
        const ratio = observed / (basis * cand.rate);
        if (!(ratio > LEECH_AREA_FLOOR)) return null;
        const n = LEECH_AREA_NUMERATOR / (ratio - LEECH_AREA_FLOOR);
        if (!(n >= 1)) return null; // D2: leech acima do esperado é contradição, não declaração
        const r = Math.round(n);
        if (rounded != null && r !== rounded) { ambiguous = true; break; }
        rounded = r;
        raw = raw == null ? n : Math.min(raw, n);
      }
      if (ambiguous) continue;
      if (rounded != null) perChannel.push({ channel, n: rounded, raw });
    }
    if (!perChannel.length) return null;
    const best = perChannel.reduce((a, b) => (b.raw < a.raw ? b : a));
    return { n: best.n, raw: best.raw, channel: best.channel, channels: perChannel };
  }

  function leechDeclaresN(hit, setup, block, context, n) {
    const declared = leechDeclaredN(hit, setup, block, context);
    return !!(declared && declared.n === n);
  }

  function observedLeechAcceptsN(hit, setup, n, channel, block, context) {
    if (!hit || !isMainHit(hit) || !(n >= 1)) return { usable: false, ok: true, reason: 'not_main_or_invalid_n' };
    const observed = channel === 'mana' ? (+hit.manaLeech || 0) : (+hit.lifeLeech || 0);
    if (!(observed > 0)) return { usable: false, ok: true, reason: 'no_' + channel + '_leech' };
    const rates = leechEffectiveRateCandidates(setup, channel, block, hit, context);
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
        // ATENÇÃO (medido em 22/Jul/2026, fix-overkill-only-turn-boundary): pela letra de
        // D-019/D-025 este ramo DEVERIA ser contradição — em overkill o dano exibido é
        // truncado e o leech incide sobre o dano real cheio, logo o exibido é PISO do real,
        // e D-025 diz "hit inválido se danoMostrado > Dreal_max". O comentário original aqui
        // ("V27: overkill pode exibir dano maior que a vida real restante") afirma o inverso
        // e é refutado por observação: em `bastion 15:21:16` o hit `340 OK` tem `life 431`,
        // leech MAIOR que o dano exibido.
        //
        // Mesmo assim o ramo permanece capped_low/neutro, DE PROPÓSITO: transformá-lo em
        // contradição foi implementado e medido, e o motor não rejeita a partição — ele
        // ESCAPA para um N maior inserindo hit virtual (S-014e), fabricando hits que não
        // existem no log. Medição no escopo bastion/essence/bakradrone/barrage/
        // mazzerinbarrage: 42 turnos ganharam hit virtual, contra 5 reclassificações reais,
        // e o caso normativo `barrage 18:59:58` quebrou (A4 S5 -> A4 S6 virtual).
        // A invalidação correta por D-012 está em `overkillOnlyBoundaryUnsupported`, restrita
        // ao turno 100% overkill — ver docs/CLASSIFICATION_RULES.md e o design do change.
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

  function shouldForceA1ByLeech(hits, context, action, beamSubline) {
    const main = (hits || []).filter(isMainHit);
    if (main.length < 2) return { force: false, reason: 'not_enough_main_hits' };
    const beam = beamSubline || validateBeamSublineBlock({ comp: 'spell', hits: main, action }, context);
    if (beam && beam.ok) return { force: false, reason: 'beam_subline_leech_not_aa_evidence', beam };
    const setup = context && context.leechSetup;
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return { force: false, reason: 'setup_unknown' };
    const first = main[0];
    const suffix = main.slice(1);
    const kAll = main.length;
    const kSuffix = suffix.length;
    const firstN1 = hitAcceptsLeechNAnyOfficialRate(first, setup, 1, null, context);
    const firstAll = hitAcceptsLeechNAnyOfficialRate(first, setup, kAll, null, context);
    const suffixSupport = blockLeechSupportForN(suffix, setup, kSuffix, context);
    // H-005e aditiva no sufixo, com critério ESTRITO (unanimidade).
    //
    // O sufixo é julgado contra `N = k − 1`, que é justamente a faixa em que H-005e declara
    // sua própria estimativa NÃO confiável a ±1 (`k ≳ 6`; o perk alpha infla o dano exibido
    // e superestima N). Por isso a inversão só prova o sufixo quando TODOS os hits com leech
    // utilizável declaram exatamente `kSuffix` — se houver dispersão, a regra não autoriza
    // desempatar e o caminho fica mudo.
    //
    // Medido em `tom`: `12:35:42` (4,4,4,4) e `12:36:50` (5,5,5,5,5) são unânimes e passam;
    // `12:31:30` (4,4,—,5) e `12:33:20` (5,6,5,5,6) estão dispersos e continuam no default.
    const suffixDeclared = suffix.map(h => leechDeclaredN(h, setup, null, context)).filter(Boolean);
    const suffixDeclaredUnanimous = suffixDeclared.length >= Math.min(2, kSuffix)
      && suffixDeclared.every(d => d.n === kSuffix);
    // Dispersão do sufixo APENAS PARA CIMA, na faixa de baixa resolução de H-005e.
    //
    // Exigir que o sufixo crave `k − 1` é exigir justamente a metade do juízo que H-005e
    // declara NÃO confiável: o degrau entre N vizinhos encolhe com k e fica abaixo do perk
    // alpha (declarado e não modelado). Alpha infla o DANO EXIBIDO sem inflar o leech; como
    // o dano está no denominador da razão, ele SUPERESTIMA N — e só para cima.
    //
    // Medido em `tom`: nos 33 turnos que ficavam de fora, o primeiro hit declara N=1 com
    // `raw` entre 1,01 e 1,10 (apertado, e o degrau 1→2 é imune ao alpha por uma ordem de
    // grandeza), e o sufixo dispersa SEMPRE para cima — `kSuffix`, `kSuffix+1`, `kSuffix+2`,
    // NUNCA para baixo. Dispersão para baixo continuaria sendo contradição real e barra.
    //
    // O piso `kSuffix >= 4` mantém o critério estrito onde N ainda discrimina: em sufixo
    // pequeno o degrau é grande demais para o alpha explicar, e uma diferença ali é
    // contradição de verdade. Caso-prova do que o piso barra: `tom` 12:27:56 (k=2, sufixo
    // de 1 hit declarando 2) — um bloco de 1 hit que diz ter batido em 2 alvos contradiz o
    // primeiro hit dizer 1, e o alpha não explica um degrau de 45 %.
    const suffixDeclaredUpward = kSuffix >= 4
      && suffixDeclared.length >= 2
      && suffixDeclared.every(d => d.n >= kSuffix);
    const suffixUsableOk = (suffixSupport.ok >= Math.min(2, kSuffix) && suffixSupport.bad === 0)
      || suffixDeclaredUnanimous
      || suffixDeclaredUpward;
    // H-005e (semântica ADITIVA — ver design da change): a inversão do leech declara
    // a cardinalidade do hit e ACRESCENTA um caminho de prova; nenhum caminho existente
    // é removido. Por construção isto só pode CRIAR evidência de AA, nunca retirá-la.
    //
    // É o que destrava a família `single_target_aa_all_action_without_positive_aa_evidence`:
    // sondados os 8 turnos representativos de `tom`, `N=1` dá `cappedLow` nos DOIS canais
    // (ex. 12:27:15: mana obs 267 vs esp 272, vida obs 887 vs esp 905) e `N=k` dá
    // contradição dura. Hoje `firstSingle` é falso e o turno cai no default — que é o
    // capped-low lido como refutação, exatamente o que S-014e proíbe. Pela inversão,
    // 887/904 = 0,981 ⇒ N = 1,02, que arredonda para 1.
    const firstDeclared = leechDeclaredN(first, setup, null, context);
    const firstRejectsAll = (firstAll.usable && !firstAll.ok)
      || !!(firstDeclared && firstDeclared.n !== kAll);
    const firstSingle = (firstN1.usable && firstN1.ok)
      || !!(firstDeclared && firstDeclared.n === 1);
    // H-005d/M-035: central e side de beam têm cardinalidades independentes.
    // Só teste o sufixo depois que o primeiro hit já provou o contraste N=1 vs N=k.
    const suffixBeam = firstSingle && firstRejectsAll && isBeamAction(action)
      ? validateBeamSublineBlock({ comp: 'spell', hits: suffix, action }, context)
      : null;
    const suffixBeamOk = !!(suffixBeam && suffixBeam.ok);
    const critBoundary = firstHitCritStateBoundary(hits);
    return {
      force: !!(firstSingle && firstRejectsAll && (suffixUsableOk || suffixBeamOk || critBoundary)),
      reason: firstSingle && firstRejectsAll
        ? (suffixBeamOk ? 'first_hit_n1_suffix_validated_beam_sublines' : (suffixUsableOk ? 'first_hit_n1_suffix_accepts_n_minus_1' : (critBoundary ? 'first_hit_n1_plus_crit_boundary' : 'first_hit_n1_but_suffix_weak')))
        : 'no_first_single_target_leech_signature',
      firstN1,
      firstAll,
      suffixSupport,
      suffixBeam,
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
  // Blow/Onslaught) + mesmo dano/leech observado ⇒ mesmo componente observado.
  // Overkill não serve para reconstruir original, mas não apaga uma duplicata
  // textual idêntica usada apenas para bloquear AA posicional fantasma.
  function hitStateKey(h) {
    return normalizeName(h.mob) + '|' + (h.exposeWeakness ? 1 : 0) + '|' + (h.isPrey ? 1 : 0) + '|' +
      (h.bountyTalisman ? 1 : 0) + '|' + (h.realCrit ? 1 : 0) + '|' + (h.onslaught ? 1 : 0) + '|' +
      (h.lowBlow ? 1 : 0) + '|' + (h.savageBlow ? 1 : 0);
  }
  function firstHitSharesExactOriginalWithRest(hits) {
    const first = hits[0];
    if (!first || first.overkill) return false;
    const firstKey = hitStateKey(first);
    return hits.slice(1).some(h => h
      && hitStateKey(h) === firstKey
      && (+h.dmg) === (+first.dmg)
      && (+h.lifeLeech || 0) === (+first.lifeLeech || 0)
      && (+h.manaLeech || 0) === (+first.manaLeech || 0));
  }

  function actionLabel(comp, action) {
    if (comp === 'arrow') return 'Auto ataque';
    if (!action) return null;
    if (comp === 'spell') return (action.profile && action.profile.label ? action.profile.label : action.text) + ' (' + action.text + ')';
    if (comp === 'rune') return action.profile && action.profile.label ? action.profile.label : action.name;
    if (comp === 'grenade') return 'Divine Grenade (' + action.text + ')';
    return null;
  }
  const API = {
    effectiveLifeLeech,
    effectiveManaLeech,
    hitLeechFit,
    actionsNearTurn,
    resetConsolidatedActions,
    registerConsolidatedActions,
    possibleShapes,
    segmentations,
    guidedCutPositions,
    cutsFromPositions,
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
    componentActionPool,
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
    leechDeclaredN,
    leechDeclaresN,
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
    sameMobStateExactnessViolation,
    sameMobStateExactnessForHits,
    firstHitSeparationFixesSameMobExactness,
    firstHitCritStateBoundary,
    isBeamAction,
    validateBeamSublineBlock,
  };

  root.UnifiedValidation = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
