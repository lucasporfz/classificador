/*
 * unified-parsing.js
 *
 * Camada de parsing do UnifiedClassificationEngine: server log + local chat -> hits
 * estruturados, casts, e turnos de 2s (buildTurns). Mecanico e deterministico -- nao
 * infere setup nem valida candidatos, isso e unified-setup-inference.js/unified-validation.js.
 *
 * Exporta globalThis.UnifiedParsing (+ module.exports quando disponivel). Carregado
 * depois de unified-formulas.js e antes de unified-classification-engine.js.
 */
(function(root) {
  'use strict';

  const {
    normalizeName,
    tsToClock,
    sessionDateKey,
    distinctMainMobCount,
    isMainHit,
    elementalOriginalCandidates,
    elementalStateKey,
    ELEMENTAL_INTERMEDIATE_TOLERANCE,
    IGNORED_RUNE_RE,
    fieldDamageLevels,
    isFieldDamageHit,
    RUNE_PROFILES,
    IGNORED_SPELL_RE,
    SPELL_PROFILES,
    SUPPORT_OR_HEAL_RE,
    MAGIC_PREFIX_RE,
  } = root.UnifiedFormulas;
  function normalizeRuneName(name) {
    return normalizeName(String(name || '').replace(/\s+rune$/, ''));
  }
  function runeProfile(name) {
    const n = normalizeRuneName(name);
    if (IGNORED_RUNE_RE.test(n)) return null;
    if (RUNE_PROFILES[n]) return RUNE_PROFILES[n];
    if (/avalanche|icicle|great icicle/.test(n)) return RUNE_PROFILES[n.includes('icicle') ? 'icicle' : 'avalanche'];
    if (/great fireball|fireball/.test(n)) return RUNE_PROFILES['great fireball'];
    if (/thunderstorm/.test(n)) return RUNE_PROFILES.thunderstorm;
    if (/stone\s*shower|stoneshower/.test(n)) return RUNE_PROFILES['stone shower'];
    if (/sudden death/.test(n)) return RUNE_PROFILES['sudden death'];
    if (/holy missile/.test(n)) return RUNE_PROFILES['holy missile'];
    if (/explosion/.test(n)) return RUNE_PROFILES.explosion;
    return { element: 'unknown', topology: 'unknown', label: name || 'Unknown Rune' };
  }

  function spellProfile(text) {
    const key = normalizeName(text).replace(/"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
    if (IGNORED_SPELL_RE.test(key)) return null;
    if (SPELL_PROFILES[key]) return Object.assign({ incantation: key }, SPELL_PROFILES[key]);
    if (SUPPORT_OR_HEAL_RE.test(key) && !/^exori\b|^exevo\b/.test(key)) return { incantation: key, label: key, type: 'support', element: 'unknown', topology: 'unknown' };
    if (MAGIC_PREFIX_RE.test(key)) return { incantation: key, label: key, type: 'attack', element: 'unknown', topology: 'unknown' };
    return null;
  }

  function parseServerFacts(serverText) {
    const events = [];
    const hits = [];
    const runeUses = [];
    const xpLines = [];
    const leechLines = [];
    const selfHealLines = [];
    const externalHealLines = [];
    const transcendenceTriggers = [];
    const tsPattern = /^(\d{2}):(\d{2}):(\d{2})\s+(.*)$/;
    const attackPattern = /(?:(?:A|An|The)\s+)?([A-Za-z][A-Za-z\s'\-]+?)\s+loses\s+(\d+)\s+hitpoints\s+due to your\s+(critical attack|attack)\b\.?\s*(\([^)]*\))?/i;
    const hazardDodgePattern = /(?:(?:A|An|The)\s+)?([A-Za-z][A-Za-z\s'\-]+?)\s+dodged your attack\.\s*(\([^)]*\))?/i;
    const runeUsePattern = /Using one of\s+\d+\s+(.+?)\s+runes?\b/i;
    const xpPattern = /You gained\s+(\d+)\s+experience(?:\s+points?)?/i;
    const transcendencePattern = /^Transcendence was triggered\.?/i;
    const lifeLeechPattern = /^You were healed for\s+(\d+)\s+hitpoints\./i;
    const manaLeechPattern = /^You gained\s+(\d+)\s+mana\./i;
    const selfHealPattern = /^You healed yourself for\s+(\d+)\s+hitpoints\./i;
    const externalHealPattern = /^You were healed by\s+(.+?)\s+for\s+(\d+)\s+hitpoints\./i;
    const potionUsePattern = /^Using one of\s+\d+\s+.+?\s+potions?\b/i;
    let pendingLeechHit = null;
    let lastPotionTs = null;
    let hasFieldRuneUse = false;
    let seq = 0;
    // D-011a: `seq` enumera somente fatos modelados e, portanto, não preserva
    // sozinho a continuidade causal hit/charm -> XP. Mantemos a ordem bruta em
    // um mapa interno, sem renumerar nem expor eventos. `barrierEpoch` avança
    // quando outra ação explícita do jogador foi omitida de `events`; épocas
    // diferentes provam que houve uma barreira entre os fatos.
    const rawOrderByEvent = new Map();
    let rawLineOrdinal = 0;
    let barrierEpoch = 0;

    for (const rawLine of String(serverText || '').split(/\r?\n/)) {
      const m = tsPattern.exec(rawLine);
      if (!m) continue;
      const lineOrdinal = rawLineOrdinal++;
      const ts = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      const body = m[4];
      if (potionUsePattern.test(body)) {
        lastPotionTs = ts;
        barrierEpoch++;
        continue;
      }
      const a = attackPattern.exec(body);
      if (a) {
        const suffix = a[4] || '';
        const hasCharm = /charm/i.test(suffix);
        const hasLowBlow = /low blow/i.test(suffix);
        const hasSavageBlow = /savage blow/i.test(suffix);
        const hasCritCharm = hasLowBlow || hasSavageBlow;
        const hasOnslaught = /\bOnslaught\b/i.test(suffix);
        const isReflection = /damage reflection/i.test(suffix);
        const isCrit = /critical/i.test(a[3]);
        const ev = {
          id: 'h' + seq,
          kind: 'hit',
          seq: seq++,
          ts,
          clock: tsToClock(ts),
          mob: normalizeName(a[1]),
          // M-009: fato observado — o nome do mob veio SEM artigo (a/an/the) no Server Log.
          // Sinal textual direto de boss; a agregação por-mob é feita em bossNameSet (engine).
          articleless: !/^\s*(?:A|An|The)\s/i.test(body),
          dmg: +a[2],
          type: isCrit || hasCritCharm || hasOnslaught ? 'crit' : 'normal',
          realCrit: isCrit || hasLowBlow,
          lowBlow: hasLowBlow,
          savageBlow: hasSavageBlow,
          onslaught: hasOnslaught,
          perfectShot: /perfect shot/i.test(suffix),
          isPrey: /\bactive prey bonus\b/i.test(suffix),
          bountyTalisman: /Bounty Talisman Effect:\s*More Damage Dealt/i.test(suffix),
          exposeWeakness: /Expose Weakness/i.test(suffix),
          elementalAmplification: /active elemental amplification/i.test(suffix),
          damageReflection: isReflection && !hasCharm,
          woundCharm: hasCharm && /wound/i.test(suffix),
          overpowerCharm: hasCharm && /overpower/i.test(suffix),
          rawLine,
          lifeLeech: 0,
          manaLeech: 0,
          overkill: false,
        };
        rawOrderByEvent.set(ev, { lineOrdinal, barrierEpoch });
        events.push(ev);
        if (ev.damageReflection || (hasCharm && !hasCritCharm && !hasOnslaught)) {
          ev.kind = ev.damageReflection ? 'reflect' : 'charm';
          pendingLeechHit = null;
        } else {
          hits.push(ev);
          pendingLeechHit = ev; // Low Blow/Savage Blow continuam sendo hits principais com leech
        }
        continue;
      }

      const hd = hazardDodgePattern.exec(body);
      if (hd) {
        const suffix = hd[2] || '';
        const ev = {
          id: 'h' + seq,
          kind: 'hit',
          seq: seq++,
          ts,
          clock: tsToClock(ts),
          mob: normalizeName(hd[1]),
          articleless: !/^\s*(?:A|An|The)\s/i.test(body),
          dmg: 0,
          type: 'normal',
          realCrit: false,
          lowBlow: false,
          savageBlow: false,
          onslaught: false,
          perfectShot: false,
          isPrey: /\bactive prey bonus\b/i.test(suffix),
          bountyTalisman: /Bounty Talisman Effect:\s*More Damage Dealt/i.test(suffix),
          exposeWeakness: /Expose Weakness/i.test(suffix),
          elementalAmplification: /active elemental amplification/i.test(suffix),
          hazardDodge: true,
          zeroDamageDodge: true,
          rawLine,
          lifeLeech: 0,
          manaLeech: 0,
          overkill: false,
        };
        rawOrderByEvent.set(ev, { lineOrdinal, barrierEpoch });
        events.push(ev);
        hits.push(ev);
        pendingLeechHit = null;
        continue;
      }

      const lh = lifeLeechPattern.exec(body);
      if (lh) {
        const line = { kind: 'lifeLeech', seq: seq++, ts, clock: tsToClock(ts), value: +lh[1], rawLine };
        events.push(line); leechLines.push(line);
        if (pendingLeechHit && pendingLeechHit.ts === ts && !(pendingLeechHit.lifeLeech > 0)) pendingLeechHit.lifeLeech = +lh[1];
        continue;
      }
      const ml = manaLeechPattern.exec(body);
      if (ml) {
        const line = { kind: 'manaLeech', seq: seq++, ts, clock: tsToClock(ts), value: +ml[1], rawLine };
        events.push(line); leechLines.push(line);
        if (pendingLeechHit && pendingLeechHit.ts === ts && !(pendingLeechHit.manaLeech > 0)) pendingLeechHit.manaLeech = +ml[1];
        pendingLeechHit = null;
        continue;
      }

      const sh = selfHealPattern.exec(body);
      if (sh) {
        pendingLeechHit = null;
        const line = { kind: 'selfHeal', seq: seq++, ts, clock: tsToClock(ts), value: +sh[1], sharedConservation: /\bShared Conservation\b/i.test(body), potionInduced: lastPotionTs === ts, rawLine };
        events.push(line); selfHealLines.push(line);
        continue;
      }
      const eh = externalHealPattern.exec(body);
      if (eh) {
        pendingLeechHit = null;
        const line = { kind: 'externalHeal', seq: seq++, ts, clock: tsToClock(ts), healer: String(eh[1] || '').trim(), healerKey: normalizeName(eh[1]), value: +eh[2], sharedConservation: /\bShared Conservation\b/i.test(body), rawLine };
        events.push(line); externalHealLines.push(line);
        continue;
      }
      pendingLeechHit = null;

      const ru = runeUsePattern.exec(body);
      if (ru) {
        const name = normalizeRuneName(ru[1]);
        const profile = runeProfile(name);
        const ev = { kind: 'runeUse', seq: seq++, ts, clock: tsToClock(ts), name, profile, ignored: !profile, rawLine };
        // M-021/M-038: a runa ignorada nao classifica, mas o campo que ela deixa no chao
        // produz dano. Registrar o uso e o gate do detector de field.
        if (IGNORED_RUNE_RE.test(name)) hasFieldRuneUse = true;
        events.push(ev); if (profile) runeUses.push(ev);
        continue;
      }
      if (transcendencePattern.test(body)) {
        const ev = { kind: 'transcendence', seq: seq++, ts, clock: tsToClock(ts), rawLine };
        events.push(ev); transcendenceTriggers.push(ev);
        continue;
      }
      const xp = xpPattern.exec(body);
      if (xp) {
        const ev = { kind: 'xp', seq: seq++, ts, clock: tsToClock(ts), xp: +xp[1], rawLine };
        rawOrderByEvent.set(ev, { lineOrdinal, barrierEpoch });
        events.push(ev); xpLines.push(ev);
        continue;
      }
      // D-011a: notificações de estado do mundo e dano recebido podem ser
      // intercalados pelo servidor e não são, sozinhos, nova autoria do XP.
      // A barreira oculta canônica é a ação de poção tratada no início do loop;
      // fatos modelados já bloqueiam pelo próprio "próximo evento relevante".
    }

    // M-038: dano de campo (`wall`/`bomb`/`field`, M-021) e proc anexo, da mesma familia de
    // `damage reflection`/`wound charm`/`overpower charm` (C-008/D-027). Sai de `hits` AQUI,
    // antes do passe de overkill e antes de qualquer inferencia de setup de sessao: na hunt
    // de `drome` esses hits sao 41% de todos e contaminam crit, leech e o tier de grav san.
    const fieldLevels = fieldDamageLevels(hits, { hasFieldRuneUse });
    if (fieldLevels.size) {
      const remaining = [];
      for (const h of hits) {
        if (isFieldDamageHit(h, fieldLevels)) h.kind = 'field';
        else remaining.push(h);
      }
      hits.length = 0;
      for (const h of remaining) hits.push(h);
    }

    // D-011/D-011a: o próximo evento relevante em até 1s só prova overkill se
    // nenhuma ação explícita incompatível tiver sido omitida de `events`.
    for (const h of hits) {
      let next = null;
      for (const ev of events) {
        if ((ev.seq || 0) <= h.seq) continue;
        if (ev.ts - h.ts > 1) break;
        if (ev.kind === 'charm' || ev.kind === 'reflect' || ev.kind === 'field' || ev.kind === 'lifeLeech' || ev.kind === 'manaLeech') continue;
        next = ev; break;
      }
      const hOrder = rawOrderByEvent.get(h);
      const nextOrder = rawOrderByEvent.get(next);
      const causallyContinuous = !!(hOrder && nextOrder && hOrder.barrierEpoch === nextOrder.barrierEpoch);
      h.overkill = !!(next && next.kind === 'xp' && next.ts - h.ts <= 1 && causallyContinuous);
    }

    // Charm-kill (S-014e/D-011a): um charm cujo próximo evento relevante (fora leech)
    // é XP e cuja ordem bruta permanece contínua
    // MATOU o alvo — o hit principal daquele componente nesse mob fica invisível
    // (dano 0). Charm seguido de hit visível => o alvo sobreviveu, sem hit invisível.
    // Estrutura: mk 05:43:59 `curse/wound charm` -> hit visível (não mata);
    // 22:20:24 `enflame charm` -> `You gained ... experience points` (mata).
    for (const cev of events) {
      if (cev.kind !== 'charm') continue;
      let next = null;
      for (const ev of events) {
        if ((ev.seq || 0) <= cev.seq) continue;
        if (ev.ts - cev.ts > 1) break;
        if (ev.kind === 'field' || ev.kind === 'lifeLeech' || ev.kind === 'manaLeech') continue;
        next = ev; break;
      }
      const charmOrder = rawOrderByEvent.get(cev);
      const nextOrder = rawOrderByEvent.get(next);
      const causallyContinuous = !!(charmOrder && nextOrder && charmOrder.barrierEpoch === nextOrder.barrierEpoch);
      cev.killedTarget = !!(next && next.kind === 'xp' && next.ts - cev.ts <= 1 && causallyContinuous);
    }

    return { events, hits, runeUses, xpLines, leechLines, selfHealLines, externalHealLines, transcendenceTriggers, sessionDateKey: sessionDateKey(serverText), distinctMobs: distinctMainMobCount(hits) };
  }

  function extractQuotedTarget(rawLine) {
    const m = /"([^"]+)"/.exec(String(rawLine || ''));
    return m ? normalizeName(m[1]) : null;
  }

  function isSelfHealCastCandidate(c) {
    if (!c || !c.profile || c.profile.type !== 'support') return false;
    const text = normalizeName(c.text || '');
    if (!/^exura\b/.test(text)) return false;
    // Exura sio com alvo explícito em outro jogador não é cura própria do speaker.
    if (/^exura\s+sio\b/.test(text)) {
      const target = extractQuotedTarget(c.rawLine || '');
      if (!target) return false;
      return target === normalizeName(c.speaker);
    }
    return true;
  }

  function inferSelectedSpeakerBySelfHealing(casts, serverFacts) {
    const scores = new Map();
    const details = new Map();
    const add = (speaker, delta, reason, ev, cast) => {
      const k = normalizeName(speaker);
      if (!k) return;
      scores.set(k, (scores.get(k) || 0) + delta);
      const d = details.get(k) || { speaker: k, score: 0, positive: 0, negative: 0, examples: [] };
      d.score += delta;
      if (delta > 0) d.positive += delta;
      if (delta < 0) d.negative += delta;
      if (d.examples.length < 8) d.examples.push({ reason, delta, clock: ev && ev.clock, castClock: cast && cast.clock, cast: cast && cast.text, line: ev && ev.rawLine, local: cast && cast.rawLine });
      details.set(k, d);
    };

    const healCasts = (casts || []).filter(isSelfHealCastCandidate);
    const selfHeals = (serverFacts && serverFacts.selfHealLines) || [];
    const selfSharedHeals = selfHeals.filter(h => h.sharedConservation && !h.potionInduced);
    if (selfSharedHeals.length) {
      const ownerSignal = selfSharedHeals[0];
      for (const c of (casts || [])) {
        if (!c || !c.profile || c.profile.vocation !== 'druid') continue;
        add(c.speaker, 1, 'druid_spell_evidence_after_self_shared_conservation', ownerSignal, c);
      }
      const ranked = Array.from(details.values()).sort((a, b) => b.score - a.score || b.positive - a.positive || a.speaker.localeCompare(b.speaker));
      const best = ranked.find(r => r.score > 0 && r.positive > 0) || null;
      const tied = best && ranked.some(r => r !== best && r.score === best.score && r.positive === best.positive);
      if (tied) return { selectedSpeaker: null, method: 'self_shared_conservation_ambiguous_druid_candidate', ranked };
      return { selectedSpeaker: best ? best.speaker : null, method: best ? 'self_shared_conservation_druid_identity' : 'self_shared_conservation_no_druid_candidate', ranked };
    }

    for (const h of selfHeals) {
      if (h.potionInduced) continue;
      const exact = healCasts.filter(c => c.ts === h.ts);
      const candidates = exact.length ? exact : healCasts.filter(c => Math.abs(c.ts - h.ts) <= 1);
      const weight = exact.length ? 10 : 3;
      const reason = exact.length ? 'self_heal_exact_second' : 'self_heal_nearby_second';
      for (const c of candidates) add(c.speaker, weight, reason, h, c);
    }

    for (const h of ((serverFacts && serverFacts.externalHealLines) || [])) {
      if (h.healerKey) add(h.healerKey, -20, h.sharedConservation ? 'external_shared_conservation_healer_not_owner' : 'external_heal_negative', h, null);
    }

    const ranked = Array.from(details.values()).sort((a, b) => b.score - a.score || b.positive - a.positive || a.speaker.localeCompare(b.speaker));
    const best = ranked.find(r => r.score > 0 && r.positive > 0) || null;
    return { selectedSpeaker: best ? best.speaker : null, method: best ? 'self_heal_score' : 'self_heal_score_no_positive_candidate', ranked };
  }

  function parseLocalChat(localText, options) {
    const casts = [];
    const chatRe = /^(\d{2}):(\d{2}):(\d{2})\s+(.+?)(?:\s+\[(\d+)\])?:\s?(.*)$/;
    let seq = 0;
    for (const rawLine of String(localText || '').split(/\r?\n/)) {
      const m = chatRe.exec(rawLine);
      if (!m) continue;
      const ts = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      const speaker = String(m[4] || '').trim();
      const text = normalizeName(m[6]);
      const prof = spellProfile(text);
      if (!prof) continue;
      casts.push({
        id: 'c' + seq,
        seq: seq++,
        ts,
        clock: tsToClock(ts),
        speaker,
        text: prof.incantation || text,
        profile: prof,
        type: prof.type,
        rawLine,
      });
    }
    const playerName = options && options.playerName ? normalizeName(options.playerName) : null;
    const speakerInference = playerName
      ? { selectedSpeaker: playerName, method: 'manual_playerName', ranked: [] }
      : inferSelectedSpeakerBySelfHealing(casts, options && options.serverFacts);
    const selectedSpeaker = speakerInference.selectedSpeaker || null;
    // V22: sem fallback por volume de casts ofensivos. Se não houver dono inferido
    // por cura própria, não usamos casts de outro jogador para explicar "your attack".
    const playerCasts = selectedSpeaker ? casts.filter(c => normalizeName(c.speaker) === selectedSpeaker) : [];
    return {
      casts,
      selectedSpeaker,
      selectedSpeakerMethod: speakerInference.method,
      selectedSpeakerScores: speakerInference.ranked,
      playerCasts,
      spellCasts: playerCasts.filter(c => c.type === 'attack'),
      grenadeCasts: playerCasts.filter(c => c.type === 'grenade'),
      supportCasts: playerCasts.filter(c => c.type === 'support'),
    };
  }

  // T-001/T-002: `ts` é SEGUNDOS DO DIA, então ele volta a zero quando a sessão atravessa a
  // meia-noite — ordenar por ele coloca os hits de depois da virada ANTES dos de antes dela,
  // e faz `h.ts - prevTs` ficar fortemente negativo na emenda (o que satisfaz `< 2` e funde
  // hits separados por quase 24h no mesmo turno). A ordem cronológica real é a ordem do log:
  // o parser varre o Server Log linha a linha atribuindo `seq` crescente, então a ordem do
  // array de entrada já é a ordem dos eventos. `ordTs` deriva dela uma chave absoluta
  // (`ts + 86400 × dias`), usada SÓ para ordenar e para a aritmética de fronteira de turno —
  // `ts` continua em segundos do dia em toda a saída pública (turnos, hits, clock, UI).
  // Medido no corpus: 3 de 367 sessões cruzam a meia-noite (`mazzerinbarrage` S39/S98,
  // `darklight e vemiath` S39); nas demais o offset fica 0 e nada muda.
  const CLOCK_WRAP_MIN_DROP = 300; // margem: uma virada real cai ~86400s; isso ignora ruído de ordenação local
  function assignOrderingTs(hits) {
    let dayOffset = 0, prevTs = null;
    for (const h of hits || []) {
      if (prevTs != null && h.ts < prevTs - CLOCK_WRAP_MIN_DROP) dayOffset++;
      h.ordTs = h.ts + 86400 * dayOffset;
      prevTs = h.ts;
    }
  }

  function buildTurns(hits, spellCasts, context) {
    assignOrderingTs(hits);
    const sorted = (hits || []).filter(isMainHit).slice().sort((a, b) => (a.ordTs - b.ordTs) || ((a.seq || 0) - (b.seq || 0)));
    const turns = [];
    if (!sorted.length) return turns;
    // M-016d/T-002: efeitos atrasados declarados no perfil são consolidados antes
    // de escolher a próxima âncora independente. O gate é inteiramente orientado
    // pelo perfil; spells comuns seguem exatamente pelo caminho anterior.
    const delayedByHit = new Map();
    const assignments = [];
    const casts = (spellCasts || []).filter(c => c && c.profile && c.profile.multiStage).slice().sort((a, b) => a.ts - b.ts);
    const hitsByTs = new Map();
    for (const h of sorted) {
      if (!hitsByTs.has(h.ts)) hitsByTs.set(h.ts, []);
      hitsByTs.get(h.ts).push(h);
    }
    for (const cast of casts) {
      const profile = cast.profile;
      const stages = profile.multiStage;
      const delayed = stages && stages.delayed;
      const delays = delayed && Array.isArray(delayed.delays) ? delayed.delays.filter(d => d >= 1) : null;
      const tiers = delayed && Array.isArray(delayed.tiers) ? delayed.tiers.filter(tier => tier && tier.denominator > 0) : null;
      if (!delayed || !delays || !delays.length || !tiers || !tiers.length) continue;
      // M-016e: esta via confirma o estágio pela transformação elemental discreta
      // (D-010a), então ela pertence só a perfis que DECLARAM essa confirmação —
      // hoje Death Echo. Spiritual Outburst declara `leech_cluster` porque a
      // reversão elemental não fecha para ela; sua consolidação acontece no passe
      // posterior `reconsolidateMultiStageWithLeech`, com o leech real já inferido.
      // Antes a separação era acidental (a reversão simplesmente nunca fechava para
      // 100% dos candidatos); com o gate abaixo aceitando "nenhuma contradição + ao
      // menos um par casado", um par coincidente bastaria e a via elemental poderia
      // preemptar a via de leech. A guarda torna explícito o que o perfil já declara.
      if (!stages || stages.confirmation !== 'elemental') continue;
      const primaryWindow = [cast.ts - 1, cast.ts]
        .flatMap(ts => hitsByTs.get(ts) || [])
        .filter(h => !delayedByHit.has(h.id) && !h.overkill && !h.zeroDamageDodge);
      if (!primaryWindow.length) continue;
      const primaryTerminal = Math.max(...primaryWindow.map(h => h.ts));
      // M-016d/M-016e: delays candidatos são tentados em ordem; o primeiro
      // segundo com pelo menos um hit não-overkill do jogador é o único
      // avaliado -- o motor não cai para um delay maior só porque a prova de
      // potência falhar nesse segundo (evidência insuficiente permanece não
      // resolvida, não vira uma busca ampla).
      let echoTs = null, echoBlock = null, echoCandidates = null;
      let overkillOnlyEcho = null;
      for (const delayCandidate of delays) {
        const ts = primaryTerminal + delayCandidate;
        const block = (hitsByTs.get(ts) || []).filter(h => !delayedByHit.has(h.id));
        const candidates = block.filter(h => !h.overkill && !h.zeroDamageDodge);
        if (candidates.length) { echoTs = ts; echoBlock = block; echoCandidates = candidates; break; }
        // M-016d-1a/D-011/D-012a: dano de overkill é truncado — não prova nem
        // contradiz a transformação de potência. Um segundo composto SÓ de overkill
        // é, então, evidência ausente (D-006), e o gate guloso o pulava por não ter
        // candidato avaliável. O efeito não era neutro: o eco virava âncora de um
        // turno próprio e o MESMO cast passava a nomear dois turnos consolidados,
        // que é exatamente o que M-016d/N-008 proíbem. A regra já manda os overkills
        // "acompanharem a explosão" no segundo confirmado; aqui eles são tudo o que
        // o segundo tem. Guardado abaixo e só usado se nenhum delay trouxer prova.
        if (!overkillOnlyEcho && block.length && block.every(h => h.overkill)) {
          overkillOnlyEcho = { ts, block };
        }
      }
      if (echoTs == null && overkillOnlyEcho) {
        echoTs = overkillOnlyEcho.ts;
        echoBlock = overkillOnlyEcho.block;
        echoCandidates = [];
      }
      if (echoTs == null) continue;
      // T-002/M-016d-1a: o segundo do estágio atrasado pode conter, legitimamente, a
      // explosão de OUTRO cast concreto do dono — T-002 declara exatamente esse caso.
      // Quando ele existe, um hit que não fecha sob a fração é evidência DAQUELE cast,
      // não prova contra a fração: sem outro cast, nada além do eco poderia ter produzido
      // aquele hit, e a contradição é real (regra inalterada); com outro cast cuja janela
      // (M-012/M-013) cobre o segundo, a alternativa existe e a contradição some.
      // Nesse caso, a consolidação exclui do estágio atrasado SÓ os hits com evidência
      // contrária — os comparáveis que não fecham, que são justamente os do outro cast.
      // Hits sem contraparte e overkills continuam acompanhando a explosão, como no
      // segundo exclusivo: excluí-los também deixaria pedaços do eco no segundo, que
      // viram âncora de um turno órfão. Caso-prova: `dlc ms` `21:35:29`, onde o eco `1/2`
      // do `exevo mort ora` de `:27` (`583`/`788`/`733`) divide o segundo com o
      // `exevo gran flam hur` de `:29` (`1546`/`2092`/`1947`).
      const echoSecondSharedWithOtherCast = (spellCasts || []).some(other => other !== cast
        && other && other.profile && other.profile.type === 'attack'
        && Number.isFinite(+other.ts) && Math.abs(other.ts - echoTs) <= 1);
      // Esta prova é pré-formação e não deve povoar o cache global de reversão
      // usado por todas as partições da sessão (logs longos têm muitos casts).
      const stageContext = Object.assign({}, context || {}, { _revCache: new Map() });
      const primaryEvidence = new Map(primaryWindow.map(h => [h.id, elementalOriginalCandidates(h, profile.element, stageContext)]));
      const echoEvidence = new Map(echoCandidates.map(h => [h.id, elementalOriginalCandidates(h, profile.element, stageContext)]));
      // M-016d-1/D-006: por fração candidata, cada hit não-overkill do segundo do
      // eco cai em UMA de três categorias:
      //   CASADO          -- existe hit comparável no blast (mesmo mob/estado, com
      //                      original calculável dos dois lados) e a transformação
      //                      discreta fecha sob a fração;
      //   CONTRADITÓRIO   -- existe hit comparável e ele NÃO fecha;
      //   SEM CONTRAPARTE -- não há hit comparável no blast, ou o original não é
      //                      calculável de algum dos lados.
      // Só CONTRADITÓRIO rejeita a fração. "Sem contraparte" é evidência ausente
      // (D-006), não prova de que a relação de potência falhou: o gate anterior
      // exigia 100% de casados (`me.length === echoCandidates.length`) e portanto
      // tratava os dois casos igual, derrubando a confirmação inteira por um único
      // mob de eco que o blast não acertou. Sem a marcação de estágio, blast e eco
      // ficavam fundidos no mesmo bloco elemental e o turno morria no veto same-mob
      // de S-004a, com o mesmo mob em dois níveis (integral e 1/2).
      // Casos-prova: kim 16:22:16 (blast só acerta `undertaker`; o `stalking stalk`
      // do segundo do eco não tem contraparte) e dlc ms 21:36:13.
      // Os pares casados continuam tendo de fechar todos sob a MESMA fração (uma
      // explosão tem uma única potência); overkills acompanham, mas nunca provam.
      let winningTier = null, matchedPrimary = null, matchedEcho = null, otherCastHits = null;
      for (const tier of tiers) {
        const mp = new Set();
        const me = [];
        const other = new Set();
        let contradicted = false;
        for (const echoHit of echoCandidates) {
          const e = echoEvidence.get(echoHit.id);
          if (!e || !e.known || !e.originals.length) continue; // sem contraparte (D-006)
          const comparable = primaryWindow.filter(p => {
            if (elementalStateKey(p) !== elementalStateKey(echoHit)) return false;
            const pe = primaryEvidence.get(p.id);
            return !!(pe && pe.known && pe.originals.length);
          });
          if (!comparable.length) continue; // sem contraparte (D-006)
          const primaryHit = comparable.find(p => {
            const pe = primaryEvidence.get(p.id);
            return pe.originals.some(po => e.originals.some(eo => {
              const lo = Math.floor(po * tier.numerator / tier.denominator);
              const hi = Math.ceil(po * tier.numerator / tier.denominator);
              // Reusa a tolerância intermediária já normativa do pipeline D-010a;
              // não introduz epsilon próprio da spell. Ex.: 820 -> 409 reverte
              // para O 772 -> 385, um vizinho discreto do O esperado 386.
              return Math.abs(eo - lo) <= ELEMENTAL_INTERMEDIATE_TOLERANCE ||
                Math.abs(eo - hi) <= ELEMENTAL_INTERMEDIATE_TOLERANCE;
            }));
          });
          if (!primaryHit) {
            if (!echoSecondSharedWithOtherCast) { contradicted = true; break; } // contradição real
            other.add(echoHit); // explicável pelo outro cast concreto do segundo (T-002)
            continue;
          }
          mp.add(primaryHit);
          me.push(echoHit);
        }
        // A queda de um bloco sem nenhum par comparável não prova explosão alguma:
        // exige-se ao menos um par casado, além de nenhuma contradição.
        if (!contradicted && me.length) { winningTier = tier; matchedPrimary = mp; matchedEcho = me; otherCastHits = other; break; }
      }
      // Segundo só-overkill: não há par para casar nem para contradizer. A
      // consolidação NÃO afirma potência alguma sobre o bloco — nenhum hit recebe
      // `multiStageTierStage` e nenhum dano é inventado (D-006); ela apenas mantém
      // os dois estágios do mesmo cast no mesmo turno. Se o perfil declarasse mais
      // de uma fração haveria uma escolha real a fazer sem evidência, e aí o motor
      // continua não decidindo.
      const echoProvenByPower = !!winningTier;
      if (!winningTier && !echoCandidates.length && tiers.length === 1) {
        winningTier = tiers[0];
        matchedPrimary = new Set();
        matchedEcho = [];
        otherCastHits = new Set();
      }
      if (!winningTier) continue;
      // Uma vez que pares comparáveis provam timing + potência, a explosão de
      // área inteira no mesmo timestamp é o estágio atrasado. Isso preserva hits
      // cujo original não é calculável e overkills, sem usá-los como prova.
      const consolidatedEcho = (otherCastHits && otherCastHits.size)
        ? echoBlock.filter(h => !otherCastHits.has(h))
        : echoBlock;
      for (const h of matchedPrimary) {
        h.multiStageStage = stages.primary.id;
        h.multiStageCastTs = cast.ts;
      }
      for (const h of consolidatedEcho) {
        h.multiStageStage = delayed.id;
        h.multiStageCastTs = cast.ts;
        if (echoProvenByPower && winningTier.stage != null) h.multiStageTierStage = winningTier.stage;
        delayedByHit.set(h.id, cast);
      }
      // `anchorHits` localiza o turno de origem. Normalmente são os próprios hits
      // casados do blast; no segundo só-overkill não há par casado, e a âncora passa
      // a ser a janela do blast (T-003: sem âncora o eco não seria reanexado a turno
      // nenhum e o hit sumiria).
      assignments.push({
        cast,
        anchorHits: matchedPrimary.size ? Array.from(matchedPrimary) : primaryWindow.slice(),
        delayedHits: consolidatedEcho,
      });
    }
    const turnEligible = sorted.filter(h => !delayedByHit.has(h.id));
    const blocks = [];
    // A aritmética de fronteira usa `ordTs` (absoluto); o turno gravado volta a segundos do
    // dia via `% 86400`, para `clock` e para o casamento por HH:MM:SS das ferramentas.
    let cur = [turnEligible[0]], prevTs = turnEligible[0].ordTs;
    for (let i = 1; i < turnEligible.length; i++) {
      const h = turnEligible[i];
      if (h.ordTs - prevTs < 2) cur.push(h);
      else { blocks.push(cur); cur = [h]; }
      prevTs = h.ordTs;
    }
    blocks.push(cur);
    let idx = 0;
    const pushTurn = (start, turnHits) => {
      const ts = ((start % 86400) + 86400) % 86400;
      turns.push({ id: 't' + idx++, idx, ts, clock: tsToClock(ts), hits: turnHits });
    };
    for (const block of blocks) {
      let start = block[0].ordTs;
      let turnHits = [];
      for (const h of block) {
        if (h.ordTs - start < 2) turnHits.push(h);
        else {
          pushTurn(start, turnHits);
          while (h.ordTs - start >= 2) start += 2;
          turnHits = [h];
        }
      }
      if (turnHits.length) pushTurn(start, turnHits);
    }
    for (const assignment of assignments) {
      const origin = turns.find(t => assignment.anchorHits.some(h => t.hits.includes(h)));
      if (!origin) continue;
      origin.hits.push(...assignment.delayedHits);
      origin.hits.sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
    }
    if (turns.length) turns[0].partialEdge = true;
    return turns;
  }

  const LEECH_RATIO_CLUSTER_TOLERANCE = 0.15;
  const TIER_MAGNITUDE_TOLERANCE = 0.2;

  function leechRatiosForHit(h) {
    const dmg = +h.dmg || 0;
    const life = +h.lifeLeech || 0;
    const mana = +h.manaLeech || 0;
    if (!(dmg > 0) || (!(life > 0) && !(mana > 0))) return null;
    return { life: life > 0 ? life / dmg : null, mana: mana > 0 ? mana / dmg : null };
  }

  function leechRatiosClose(a, b) {
    if (a == null || b == null) return true;
    if (a === 0 && b === 0) return true;
    const denom = Math.max(a, b);
    return denom > 0 && Math.abs(a - b) / denom <= LEECH_RATIO_CLUSTER_TOLERANCE;
  }

  function clusterHitsByLeechRatio(hits) {
    const withRatio = hits.map(h => ({ h, ratio: leechRatiosForHit(h) })).filter(x => x.ratio);
    const clusters = [];
    for (const item of withRatio) {
      const target = clusters.find(c => leechRatiosClose(c.life, item.ratio.life) && leechRatiosClose(c.mana, item.ratio.mana));
      if (target) {
        target.members.push(item.h);
        if (target.life == null) target.life = item.ratio.life;
        if (target.mana == null) target.mana = item.ratio.mana;
      } else {
        clusters.push({ members: [item.h], life: item.ratio.life, mana: item.ratio.mana });
      }
    }
    return clusters;
  }

  // M-016e: quando buildTurns não consegue provar o estágio atrasado porque o
  // segundo candidato mistura hits de um cast concreto diferente (ex.: Greater
  // Flurry of Blows aterrissando no mesmo segundo do echo de Spiritual Outburst),
  // a reversão elemental de dano bruto não é confiável -- a arma/elemento variam
  // por jogador e por hit, e um componente físico misturado torna o dano não
  // determinístico (roll de armadura). Depois que o leech setup real é inferido
  // (2ª passada), a razão vida/dano e mana/dano observada é o sinal independente
  // de arma/armadura: um estágio atrasado real forma um cluster interno
  // consistente (D-019 já usa a mesma ideia para separar AA de spell dentro de um
  // turno); a magnitude bruta do cluster contra as frações candidatas do perfil só
  // escolhe o rótulo de tier, nunca decide se o cluster pertence ao estágio.
  // Só corrige casts que a 1ª passada deixou sem estágio atrasado consolidado;
  // nunca reabre um cast já consumido (M-015/T-004/N-007/N-008).
  function reconsolidateMultiStageWithLeech(turns, spellCasts, context) {
    const setup = context && context.leechSetup;
    if (!setup || (!(setup.lifeBase > 0) && !(setup.manaBase > 0))) return;
    const casts = (spellCasts || []).filter(c => c && c.profile && c.profile.multiStage).slice().sort((a, b) => a.ts - b.ts);
    if (!casts.length) return;
    const consumedCastTs = new Set();
    for (const t of turns) for (const h of t.hits) if (h.multiStageStage && h.multiStageCastTs != null) consumedCastTs.add(h.multiStageCastTs);

    for (const cast of casts) {
      if (consumedCastTs.has(cast.ts)) continue;
      const profile = cast.profile;
      const stages = profile.multiStage;
      const delayed = stages && stages.delayed;
      const delays = delayed && Array.isArray(delayed.delays) ? delayed.delays.filter(d => d >= 1) : null;
      const tiers = delayed && Array.isArray(delayed.tiers) ? delayed.tiers.filter(tier => tier && tier.denominator > 0) : null;
      if (!delayed || !delays || !delays.length || !tiers || !tiers.length) continue;
      // M-016d-1b, simétrico: a via de cluster de leech pertence a quem DECLARA essa
      // confirmação — hoje só Spiritual Outburst. Death Echo declara confirmação
      // elemental; deixá-lo cair aqui quando a via elemental falha é pior do que não
      // consolidar, porque o cluster de leech separa mobs com e sem prey e consolida
      // só PARTE do eco: o resto fica no turno seguinte, no mesmo mob e em dois níveis,
      // e mata o turno no veto same-mob de S-004a. Caso-prova: `dlc ms` `21:35:29`, em
      // que só os dois `darklight source 583` viraram eco e os `788`/`733` ficaram para
      // trás.
      if (stages.confirmation !== 'leech_cluster') continue;

      const originTurn = turns.find(t => t.hits.some(h => h.ts === cast.ts || h.ts === cast.ts - 1));
      if (!originTurn) continue;
      const primaryWindow = originTurn.hits.filter(h => (h.ts === cast.ts || h.ts === cast.ts - 1) && isMainHit(h) && !h.overkill && !h.multiStageStage && !h.zeroDamageDodge);
      if (!primaryWindow.length) continue;
      const primaryTerminal = Math.max(...primaryWindow.map(h => h.ts));
      const primaryAvg = primaryWindow.reduce((s, h) => s + (+h.dmg || 0), 0) / primaryWindow.length;
      if (!(primaryAvg > 0)) continue;

      // M-016d/M-016e: mesmo gate guloso de buildTurns -- o primeiro delay
      // candidato com pelo menos um hit não-overkill é o único avaliado; não
      // cai para o próximo delay só porque a prova de cluster falhar nesse
      // segundo. O estágio atrasado pode cair no MESMO turno mecânico do
      // blast inicial (ex.: :35→:36, gap<2 -- nada precisa ser movido, só
      // marcado) ou num turno independente diferente (ex.: :56→:58).
      let echoTs = null, targetTurn = null, block = null;
      for (const delayCandidate of delays) {
        const ts = primaryTerminal + delayCandidate;
        const t = turns.find(tt => tt.hits.some(h => h.ts === ts));
        if (!t) continue;
        const b = t.hits.filter(h => h.ts === ts && isMainHit(h) && !h.overkill && !h.multiStageStage && !h.zeroDamageDodge);
        if (b.length) { echoTs = ts; targetTurn = t; block = b; break; }
      }
      if (echoTs == null) continue;
      // A queda de um par isolado não prova uma explosão de área inteira.
      if (block.length < 2) continue;
      const clusters = clusterHitsByLeechRatio(block).filter(c => c.members.length >= 2);
      if (!clusters.length) continue;
      let best = null;
      for (const cluster of clusters) {
        const clusterAvg = cluster.members.reduce((s, h) => s + (+h.dmg || 0), 0) / cluster.members.length;
        if (!(clusterAvg > 0)) continue;
        const ratio = clusterAvg / primaryAvg;
        let nearestTier = null, nearestDiff = Infinity;
        for (const tier of tiers) {
          const frac = tier.numerator / tier.denominator;
          const diff = Math.abs(ratio - frac) / frac;
          if (diff < nearestDiff) { nearestDiff = diff; nearestTier = tier; }
        }
        if (nearestTier && nearestDiff <= TIER_MAGNITUDE_TOLERANCE && (!best || cluster.members.length > best.cluster.members.length)) {
          best = { cluster, tier: nearestTier };
        }
      }
      if (!best) continue;
      for (const h of best.cluster.members) {
        h.multiStageStage = delayed.id;
        h.multiStageCastTs = cast.ts;
        if (best.tier.stage != null) h.multiStageTierStage = best.tier.stage;
      }
      for (const h of primaryWindow) {
        h.multiStageStage = stages.primary.id;
        h.multiStageCastTs = cast.ts;
      }
      if (targetTurn !== originTurn) {
        targetTurn.hits = targetTurn.hits.filter(h => best.cluster.members.indexOf(h) === -1);
        originTurn.hits.push(...best.cluster.members);
        originTurn.hits.sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
      }
      consumedCastTs.add(cast.ts);
    }
    // M-001/T-002: se um turno perder todos os hits para o estágio atrasado
    // originário, ele deixa de existir como ciclo independente.
    for (let i = turns.length - 1; i >= 0; i--) if (!turns[i].hits.length) turns.splice(i, 1);
  }

  const API = {
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
  };

  root.UnifiedParsing = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
