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
    const runeUsePattern = /Using one of\s+\d+\s+(.+?)\s+runes?\b/i;
    const xpPattern = /You gained\s+(\d+)\s+experience(?:\s+points?)?/i;
    const transcendencePattern = /^Transcendence was triggered\.?/i;
    const lifeLeechPattern = /^You were healed for\s+(\d+)\s+hitpoints\./i;
    const manaLeechPattern = /^You gained\s+(\d+)\s+mana\./i;
    const selfHealPattern = /^You healed yourself for\s+(\d+)\s+hitpoints\./i;
    const externalHealPattern = /^You were healed by\s+(.+?)\s+for\s+(\d+)\s+hitpoints\./i;
    const potionUsePattern = /^Using one of\s+\d+\s+.+?\s+potions?\b/i;
    const CRIT_CHARM_RE = /low blow|savage blow/i;
    let pendingLeechHit = null;
    let lastPotionTs = null;
    let seq = 0;

    for (const rawLine of String(serverText || '').split(/\r?\n/)) {
      const m = tsPattern.exec(rawLine);
      if (!m) continue;
      const ts = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      const body = m[4];
      if (potionUsePattern.test(body)) { lastPotionTs = ts; continue; }
      const a = attackPattern.exec(body);
      if (a) {
        const suffix = a[4] || '';
        const hasCharm = /charm/i.test(suffix);
        const hasCritCharm = CRIT_CHARM_RE.test(suffix);
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
          dmg: +a[2],
          type: isCrit || hasCritCharm || hasOnslaught ? 'crit' : 'normal',
          realCrit: isCrit || hasCritCharm,
          lowBlow: hasCritCharm,
          onslaught: hasOnslaught,
          perfectShot: /perfect shot/i.test(suffix),
          isPrey: /prey|Bounty Talisman/i.test(suffix),
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
        events.push(ev); xpLines.push(ev);
      }
    }

    // Overkill: próximo evento relevante em até 1s é XP.
    for (const h of hits) {
      let next = null;
      for (const ev of events) {
        if ((ev.seq || 0) <= h.seq) continue;
        if (ev.ts - h.ts > 1) break;
        if (ev.kind === 'charm' || ev.kind === 'reflect' || ev.kind === 'lifeLeech' || ev.kind === 'manaLeech') continue;
        next = ev; break;
      }
      h.overkill = !!(next && next.kind === 'xp' && next.ts - h.ts <= 1);
    }

    // Charm-kill (S-014e): um charm cujo próximo evento relevante (fora leech) é XP
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
        if (ev.kind === 'lifeLeech' || ev.kind === 'manaLeech') continue;
        next = ev; break;
      }
      cev.killedTarget = !!(next && next.kind === 'xp' && next.ts - cev.ts <= 1);
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

  function buildTurns(hits, spellCasts, context) {
    const sorted = (hits || []).filter(isMainHit).slice().sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
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
      if (!delayed || !(delayed.delayAfterPrimaryTerminal >= 1) || !(delayed.powerDenominator > 0)) continue;
      const primaryWindow = [cast.ts - 1, cast.ts]
        .flatMap(ts => hitsByTs.get(ts) || [])
        .filter(h => !delayedByHit.has(h.id) && !h.overkill);
      if (!primaryWindow.length) continue;
      const primaryTerminal = Math.max(...primaryWindow.map(h => h.ts));
      const echoTs = primaryTerminal + delayed.delayAfterPrimaryTerminal;
      const echoBlock = (hitsByTs.get(echoTs) || []).filter(h => !delayedByHit.has(h.id));
      const echoCandidates = echoBlock.filter(h => !h.overkill);
      if (!echoCandidates.length) continue;
      // Esta prova é pré-formação e não deve povoar o cache global de reversão
      // usado por todas as partições da sessão (logs longos têm muitos casts).
      const stageContext = Object.assign({}, context || {}, { _revCache: new Map() });
      const primaryEvidence = new Map(primaryWindow.map(h => [h.id, elementalOriginalCandidates(h, profile.element, stageContext)]));
      const echoEvidence = new Map(echoCandidates.map(h => [h.id, elementalOriginalCandidates(h, profile.element, stageContext)]));
      const matchedPrimary = new Set();
      const matchedEcho = [];
      for (const echoHit of echoCandidates) {
        const e = echoEvidence.get(echoHit.id);
        if (!e || !e.known || !e.originals.length) continue;
        const primaryHit = primaryWindow.find(p => {
          if (elementalStateKey(p) !== elementalStateKey(echoHit)) return false;
          const pe = primaryEvidence.get(p.id);
          if (!pe || !pe.known || !pe.originals.length) return false;
          return pe.originals.some(po => e.originals.some(eo => {
            const lo = Math.floor(po * delayed.powerNumerator / delayed.powerDenominator);
            const hi = Math.ceil(po * delayed.powerNumerator / delayed.powerDenominator);
            // Reusa a tolerância intermediária já normativa do pipeline D-010a;
            // não introduz epsilon próprio da spell. Ex.: 820 -> 409 reverte
            // para O 772 -> 385, um vizinho discreto do O esperado 386.
            return Math.abs(eo - lo) <= ELEMENTAL_INTERMEDIATE_TOLERANCE ||
              Math.abs(eo - hi) <= ELEMENTAL_INTERMEDIATE_TOLERANCE;
          }));
        });
        if (!primaryHit) continue;
        matchedPrimary.add(primaryHit);
        matchedEcho.push(echoHit);
      }
      // A queda de um par isolado não prova uma explosão de área inteira. Todos
      // os hits não-overkill comparáveis do timestamp precisam fechar contra o
      // blast primário; overkills podem acompanhar, mas nunca servem de prova.
      if (!matchedEcho.length || matchedEcho.length !== echoCandidates.length) continue;
      // Uma vez que pares comparáveis provam timing + potência, a explosão de
      // área inteira no mesmo timestamp é o estágio atrasado. Isso preserva hits
      // cujo original não é calculável e overkills, sem usá-los como prova.
      const consolidatedEcho = echoBlock;
      for (const h of matchedPrimary) {
        h.multiStageStage = stages.primary.id;
        h.multiStageCastTs = cast.ts;
      }
      for (const h of consolidatedEcho) {
        h.multiStageStage = delayed.id;
        h.multiStageCastTs = cast.ts;
        delayedByHit.set(h.id, cast);
      }
      assignments.push({ cast, primaryHits: Array.from(matchedPrimary), delayedHits: consolidatedEcho });
    }
    const turnEligible = sorted.filter(h => !delayedByHit.has(h.id));
    const blocks = [];
    let cur = [turnEligible[0]], prevTs = turnEligible[0].ts;
    for (let i = 1; i < turnEligible.length; i++) {
      const h = turnEligible[i];
      if (h.ts - prevTs < 2) cur.push(h);
      else { blocks.push(cur); cur = [h]; }
      prevTs = h.ts;
    }
    blocks.push(cur);
    let idx = 0;
    for (const block of blocks) {
      let start = block[0].ts;
      let turnHits = [];
      for (const h of block) {
        if (h.ts - start < 2) turnHits.push(h);
        else {
          turns.push({ id: 't' + idx++, idx, ts: start, clock: tsToClock(start), hits: turnHits });
          while (h.ts - start >= 2) start += 2;
          turnHits = [h];
        }
      }
      if (turnHits.length) turns.push({ id: 't' + idx++, idx, ts: start, clock: tsToClock(start), hits: turnHits });
    }
    for (const assignment of assignments) {
      const origin = turns.find(t => assignment.primaryHits.some(h => t.hits.includes(h)));
      if (!origin) continue;
      origin.hits.push(...assignment.delayedHits);
      origin.hits.sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
    }
    if (turns.length) turns[0].partialEdge = true;
    return turns;
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
  };

  root.UnifiedParsing = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
