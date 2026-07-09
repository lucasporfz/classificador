/*
 * Unified main classifier adapter.
 *
 * This is the single public classification path used by the UI and by the
 * Node harnesses. It converts UnifiedClassificationEngine output to the compact
 * result shape already consumed by app.js charts, tables and drill-downs.
 */
(function(root) {
  'use strict';

  function clockOf(ts) {
    ts = Number(ts) || 0;
    const h = Math.floor(ts / 3600) % 24;
    const m = Math.floor((ts % 3600) / 60);
    const s = Math.floor(ts % 60);
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  }

  function normalizeComp(comp) {
    comp = String(comp || '').toLowerCase();
    if (comp === 'arrow' || comp === 'spell' || comp === 'rune' || comp === 'grenade') return comp;
    if (comp.indexOf('unresolved') === 0) return 'unresolved';
    return comp || 'unresolved';
  }

  function publicLineComp(component) {
    const comp = normalizeComp(component && component.comp);
    return comp === 'unresolved' ? ((component && component.id) || 'unresolved_component_1') : comp;
  }

  // "Dano médio sem crítico": mean SHOWN damage (not the deep pre-mitigation/pre-armor
  // "original" the engine reconstructs internally for classification) over the component's
  // non-crit hits only, normalized solely for prey and utevo grav san — the same
  // known-multiplier cleaning already used by inferCritByComponent's buckets. Onslaught,
  // Expose Weakness, mitigation, armor and elemental mod are intentionally left untouched
  // (explicit product decision, not an oversight).
  function gravSanInWindow(gravSanSetup, ts) {
    if (!gravSanSetup || !(gravSanSetup.bonus > 0) || !Number.isFinite(+ts)) return false;
    return (gravSanSetup.windows || []).some(w => +ts >= w.start && +ts <= w.end);
  }

  function preyGravSanNormalizedDamage(hit, gravSanSetup, gravSanActive) {
    if (!hit) return 0;
    let dmg = +hit.dmg || 0;
    if (hit.isPrey) dmg /= 1.25;
    if (gravSanActive !== false && gravSanInWindow(gravSanSetup, hit.ts)) dmg /= (1 + gravSanSetup.bonus);
    return dmg;
  }

  // Returns null for crit hits: they are excluded from the "sem crítico" average entirely
  // (not summed as zero, which would silently pull the mean down).
  function noCritDamage(hit, gravSanSetup, gravSanActive) {
    if (!hit || hit.realCrit) return null;
    return preyGravSanNormalizedDamage(hit, gravSanSetup, gravSanActive);
  }

  // D3 fallback: when 100% of a component's hits happen to be crit, there is no non-crit
  // sample to average. Borrow the lowest per-component crit multiplier confidently inferred
  // elsewhere in the same session (never the component's own key, which by definition has no
  // reliable inference here) so the column still gets a numeric estimate instead of nothing.
  function critKeyForLine(comp, actionText) {
    if (comp === 'arrow') return 'physical';
    if (!actionText) return null;
    if (comp === 'spell' || comp === 'rune' || comp === 'grenade') return comp + ':' + actionText;
    return null;
  }

  function lowestOtherComponentCritMultiplier(critSetup, ownKey) {
    const byComponent = (critSetup && critSetup.byComponent) || {};
    let min = null;
    for (const key of Object.keys(byComponent)) {
      if (key === ownKey) continue;
      const v = +byComponent[key];
      if (v > 1 && (min == null || v < min)) min = v;
    }
    return min;
  }

  function rowKeyFor(comp, label) {
    comp = normalizeComp(comp);
    if (comp === 'arrow') return 'arrow|Auto ataque';
    return comp + '|' + (label || comp);
  }

  function avg(values) {
    return values.length ? values.reduce((s, v) => s + (+v || 0), 0) / values.length : 0;
  }

  // Terra Burst (exevo ulus tera) and Ice Burst (exevo ulus frigo) are the same
  // target-life conditional-bonus mechanic, differing only by element.
  const BONUS_TIER_ACTIONS = ['exevo ulus tera', 'exevo ulus frigo'];

  function buildTerraBurstTier(kind, hits, parentTurns, context) {
    const totalHits = hits.length;
    const totalEff = hits.reduce((s, l) => s + (+l.dmg || 0), 0);
    let totalBase = 0, baseHits = 0;
    for (const l of hits) if (l.base != null) { totalBase += +l.base || 0; baseHits++; }
    if (baseHits === 0 && totalHits > 0 && context) {
      const gravSanSetup = context.gravSanSetup;
      const critSetup = context.critSetup;
      const first = hits[0] || {};
      const ownKey = critKeyForLine(first.component || first.comp, first.action);
      const fallbackMult = lowestOtherComponentCritMultiplier(critSetup, ownKey) ||
        (critSetup && critSetup.fallback > 1 ? critSetup.fallback : 1);
      for (const l of hits) totalBase += preyGravSanNormalizedDamage(l, gravSanSetup, l.gravSanActive) / fallbackMult;
      baseHits = totalHits;
    }
    // "Sem crítico / turno" is DERIVED (hitsMean × per-hit), not an independent average of
    // each turn's observed non-crit sum: at this component's normal hit frequency (hitsMean,
    // crit hits included), what would it deal if none of those hits had crit? Deriving it
    // this way keeps "hits méd × dano sem crítico/hit" always reconciling with the turn-view
    // cell, which an independently-averaged non-crit-only per-turn sum could not do (a turn
    // where every hit crit would contribute 0 to that average, silently changing the implied
    // hit count away from hitsMean).
    const hitsMeanTier = parentTurns ? totalHits / parentTurns : 0;
    const dmgBasePerHitRaw = baseHits > 0 ? totalBase / baseHits : 0;
    const dmgBasePerTurn = Math.round(hitsMeanTier * dmgBasePerHitRaw);
    const dmgEffPerTurn = parentTurns ? Math.round(totalEff / parentTurns) : 0;
    return {
      kind,
      hitsMean: hitsMeanTier,
      dmgBasePerTurn,
      dmgEffPerTurn,
      dmgBasePerHit: Math.round(dmgBasePerHitRaw),
      dmgEffPerHit: totalHits > 0 ? Math.round(totalEff / totalHits) : 0,
      dmgBase: dmgBasePerTurn,
      dmgEff: dmgEffPerTurn,
    };
  }

  function applyTerraBurstTiers(row, context) {
    if (row.kind !== 'spell' || !row._allHits.length || BONUS_TIER_ACTIONS.indexOf(row._allHits[0].action) === -1) return;
    const baseHits = row._allHits.filter(l => l.terraBurstBonusActive !== true);
    const bonusHits = row._allHits.filter(l => l.terraBurstBonusActive === true);
    if (!baseHits.length || !bonusHits.length) return;
    const tierBase = buildTerraBurstTier('tier_base', baseHits, row.turns, context);
    const tierBonus = buildTerraBurstTier('tier_bonus', bonusHits, row.turns, context);
    row.tiers = [tierBase, tierBonus];

    // A tier-average damage ratio is NOT a reliable proxy for the bonus multiplier: Terra
    // Burst's damage roll varies from cast to cast (hits from the same cast share the same
    // reverted original, e.g. 1401 vs 876 in two different casts), and the two tiers pool
    // hits from all casts with very uneven per-turn weighting. Use the engine's own resolved
    // terraBurstBonusLevel per turn instead — the discrete, high-confidence value it already
    // determined by exact intersection.
    const levelByTurn = new Map();
    for (const l of row._allHits) {
      if (l.terraBurstBonusLevel == null || levelByTurn.has(l.ts)) continue;
      levelByTurn.set(l.ts, l.terraBurstBonusLevel);
    }
    const levelCounts = new Map();
    for (const level of levelByTurn.values()) levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
    const distinctLevels = Array.from(levelCounts.keys());
    if (distinctLevels.length === 1) {
      row.bonusMult = distinctLevels[0];
    } else if (distinctLevels.length > 1) {
      row.bonusMultAmbiguous = true;
      row.bonusMultLevels = distinctLevels.map(level => ({ level, turns: levelCounts.get(level) }));
    }
  }

  function buildCounts() {
    return { arrow: 0, spell: 0, rune: 0, grenade: 0, unresolved: 0 };
  }

  function classifyUnified(serverText, localText, opts) {
    if (!root.UnifiedClassificationEngine || typeof root.UnifiedClassificationEngine.classifyUnified !== 'function') {
      throw new Error('UnifiedClassificationEngine nao esta carregado');
    }
    return root.UnifiedClassificationEngine.classifyUnified(serverText, localText, Object.assign({
      mobModsPre: root.MOB_ELEMENT_MODS || null,
      mobModsPost: root.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
      strictLeech: true,
      maxOriginal: 6000,
      useFloat16Mitigation: true,
    }, opts || {}));
  }

  function buildRotationRows(turnTrace, lineFilter, opts) {
    const withTiers = !opts || opts.tiers !== false;
    const context = opts && opts.context;
    const gravSanSetup = context && context.gravSanSetup;
    const critSetup = context && context.critSetup;
    const rowMap = new Map();
    const ensureRow = (comp, label) => {
      const key = rowKeyFor(comp, label);
      if (!rowMap.has(key)) rowMap.set(key, {
        key,
        label: comp === 'arrow' ? 'Auto ataque' : (label || comp),
        kind: comp,
        turns: 0,
        hitsMean: 0,
        dmgBase: 0,
        dmgEff: 0,
        hitsPerTurn: [],
        hitsTimeline: Array(turnTrace.length).fill(0),
        baseDamageTimeline: Array(turnTrace.length).fill(0),
        damageTimeline: Array(turnTrace.length).fill(0),
        _hits: [],
        _base: [],
        _baseHits: [],
        _eff: [],
        _allHits: [],
      });
      return rowMap.get(key);
    };

    for (let i = 0; i < turnTrace.length; i++) {
      const tr = turnTrace[i];
      if (tr.partialEdge) continue;
      const grouped = new Map();
      for (const line of tr.lines || []) {
        const comp = normalizeComp(line.component || line.comp);
        if (comp === 'unresolved') continue;
        if (lineFilter && !lineFilter(line)) continue;
        const label = comp === 'arrow' ? 'Auto ataque' : line.actionLabel || comp;
        const key = rowKeyFor(comp, label);
        if (!grouped.has(key)) grouped.set(key, { comp, label, hits: [], baseDamage: 0, baseHits: 0, damage: 0 });
        const g = grouped.get(key);
        g.hits.push(line);
        g.damage += +line.dmg || 0;
        if (line.base != null) { g.baseDamage += +line.base || 0; g.baseHits++; }
      }
      for (const g of grouped.values()) {
        const row = ensureRow(g.comp, g.label);
        row.hitsTimeline[i] = g.hits.length;
        row.baseDamageTimeline[i] = g.baseDamage;
        row.damageTimeline[i] = g.damage;
        row.hitsPerTurn.push(g.hits.length);
        row._hits.push(g.hits.length);
        row._base.push(g.baseDamage);
        row._baseHits.push(g.baseHits);
        row._eff.push(g.damage);
        row._allHits.push(...g.hits);
      }
    }

    const rank = { arrow: 0, rune: 1, spell: 2, grenade: 3 };
    return Array.from(rowMap.values()).map(row => {
      row.turns = row._hits.length;
      row.hitsMean = avg(row._hits);
      const totalHits = row._hits.reduce((s, v) => s + (+v || 0), 0);
      let totalBase = row._base.reduce((s, v) => s + (+v || 0), 0);
      let totalBaseHits = row._baseHits.reduce((s, v) => s + (+v || 0), 0);
      const totalEff = row._eff.reduce((s, v) => s + (+v || 0), 0);
      if (totalBaseHits === 0 && row._allHits.length && context) {
        // D3 fallback: every hit of this component happened to crit — borrow the lowest
        // per-component crit multiplier confidently inferred elsewhere in this session.
        const first = row._allHits[0];
        const ownKey = critKeyForLine(first.component || first.comp, first.action);
        const fallbackMult = lowestOtherComponentCritMultiplier(critSetup, ownKey) ||
          (critSetup && critSetup.fallback > 1 ? critSetup.fallback : 1);
        totalBase = row._allHits.reduce((s, l) => s + preyGravSanNormalizedDamage(l, gravSanSetup, l.gravSanActive) / fallbackMult, 0);
        totalBaseHits = row._allHits.length;
      }
      // "Sem crítico / turno" is DERIVED (hitsMean × per-hit), not an independent average of
      // each turn's observed non-crit sum: at this component's normal hit frequency (hitsMean,
      // crit hits included), what would it deal if none of those hits had crit? This keeps
      // "hits méd × dano sem crítico/hit" always reconciling with the turn-view cell, which an
      // independently-averaged non-crit-only per-turn sum could not do (a turn where every hit
      // crit would contribute 0 to that average, silently changing the implied hit count away
      // from hitsMean).
      const dmgBasePerHitRaw = totalBaseHits > 0 ? totalBase / totalBaseHits : 0;
      row.dmgBasePerTurn = Math.round(row.hitsMean * dmgBasePerHitRaw);
      row.dmgEffPerTurn = Math.round(avg(row._eff));
      row.dmgBasePerHit = Math.round(dmgBasePerHitRaw);
      row.dmgEffPerHit = totalHits > 0 ? Math.round(totalEff / totalHits) : 0;
      row.dmgBase = row.dmgBasePerTurn;
      row.dmgEff = row.dmgEffPerTurn;
      if (withTiers) applyTerraBurstTiers(row, context);
      delete row._hits; delete row._base; delete row._baseHits; delete row._eff; delete row._allHits; delete row.key;
      return row;
    }).sort((a, b) => (rank[a.kind] || 9) - (rank[b.kind] || 9) || String(a.label).localeCompare(String(b.label)));
  }

  function buildGravSanRows(turnTrace, context) {
    return buildRotationRows(turnTrace, line => line.gravSanTested && line.gravSanActive === true, { tiers: false, context });
  }

  function buildGravSanComponentStats(turnTrace) {
    // Por (turno, componente): "in window" = gravSanTested (o engine achou pelo menos
    // 1 hit do bloco dentro de uma janela de utevo grav san e testou a hipótese);
    // "aproveitado" = gravSanActive === true (a hipótese ativa venceu para esse bloco).
    let inWindow = 0, active = 0;
    for (const tr of turnTrace) {
      if (tr.partialEdge) continue;
      const seen = new Map();
      for (const line of tr.lines || []) {
        const comp = normalizeComp(line.component || line.comp);
        if (comp === 'unresolved') continue;
        const label = comp === 'arrow' ? 'Auto ataque' : line.actionLabel || comp;
        const key = rowKeyFor(comp, label);
        let entry = seen.get(key);
        if (!entry) { entry = { tested: false, active: false }; seen.set(key, entry); }
        if (line.gravSanTested) entry.tested = true;
        if (line.gravSanTested && line.gravSanActive === true) entry.active = true;
      }
      for (const entry of seen.values()) {
        if (entry.tested) inWindow++;
        if (entry.active) active++;
      }
    }
    return { inWindow, active };
  }

  function adaptUnifiedForClassifierUi(unified) {
    if (!unified || unified.error) {
      return { error: unified && unified.error || 'unified_empty_result', unifiedSource: unified };
    }

    const context = unified._context;
    const gravSanSetup = context && context.gravSanSetup;
    // M-023/M-029: a Divine Grenade explode em [cast+2, cast+4], num turno POSTERIOR ao
    // cast. O turno do cast é AA-only e válido por si só (M-029); ele não deve contar como
    // "spell/rune/granada perdida" só porque a explosão pertence a outro turno já contado.
    const grenadeCastTimestamps = ((unified.facts && unified.facts.local && unified.facts.local.grenadeCasts) || [])
      .map(c => +c.ts).filter(Number.isFinite);
    const turns = unified.turns || [];
    const turnTrace = turns.map((turn, index) => {
      const lines = [];
      const counts = buildCounts();
      let damage = 0;
      let spell = null;
      let rune = null;
      let gren = null;

      for (const component of turn.components || []) {
        const normComp = normalizeComp(component.comp || component.kind);
        const lineComp = publicLineComp(component);
        const label = component.actionLabel || component.label || '';
        if (normComp === 'spell' && !spell) spell = label;
        if (normComp === 'rune' && !rune) rune = label;
        if (normComp === 'grenade' && !gren) gren = label;

        for (const h of component.hits || []) {
          const dmg = +h.dmg || 0;
          damage += dmg;
          if (normComp in counts) counts[normComp]++;
          const reason = component.reason || turn.reason || (turn.chosen && turn.chosen.reason) || null;
          lines.push({
            mob: h.mob,
            dmg,
            base: noCritDamage(h, gravSanSetup, component.gravSanActive),
            isPrey: !!h.isPrey,
            comp: lineComp,
            component: normComp,
            correctedComponent: normComp,
            action: (component.action && component.action.text) || null,
            actionLabel: label,
            ok: !!h.overkill,
            overkill: !!h.overkill,
            ts: Number.isFinite(+h.ts) ? +h.ts : +turn.ts || 0,
            clock: h.clock || clockOf(Number.isFinite(+h.ts) ? +h.ts : +turn.ts || 0),
            seq: Number.isFinite(+h.seq) ? +h.seq : lines.length + 1,
            type: h.realCrit || h.lowBlow ? 'crit' : (h.type || ''),
            lowBlow: !!h.lowBlow,
            realCrit: !!h.realCrit,
            onslaught: !!h.onslaught,
            exposeWeakness: !!h.exposeWeakness,
            terraBurstBonusActive: h.terraBurstBonusActive === undefined ? null : h.terraBurstBonusActive,
            terraBurstBonusLevel: (component.deterministic && component.deterministic.terraBurstBonusLevel) || null,
            gravSanActive: component.gravSanActive === undefined ? null : component.gravSanActive,
            gravSanTested: !!component.gravSanTested,
            reason,
            experimentalReason: reason,
            countsAsHit: h.countsAsHit,
          });
        }
      }

      lines.sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
      const turnTs = Number.isFinite(+turn.ts) ? +turn.ts : (lines[0] ? lines[0].ts : 0);
      // Turno de 2s: [turnTs, turnTs+1], mesma janela usada por buildTurns no motor.
      const grenadeCastInTurn = grenadeCastTimestamps.some(ts => ts >= turnTs && ts <= turnTs + 1);
      return {
        idx: turn.idx || index + 1,
        ts: turnTs,
        clock: turn.clock || clockOf(turn.ts),
        partialEdge: !!turn.partialEdge,
        counts,
        damage,
        mobsHit: lines.length,
        lines,
        rpComponentLines: lines,
        spell,
        rune,
        gren,
        grenadeCastInTurn,
        unifiedStatus: turn.status,
        unifiedReason: turn.reason || null,
        experimentalEvidence: {
          ts: turn.ts,
          lines,
          isRpRegime: unified.vocation === 'paladin',
          uniqueBossTarget: !!((turn.components || []).some(c => c && c.hits && c.hits.some(h => h && h.uniqueBossTarget))),
          spellCast: ((turn.components || []).find(c => c && c.comp === 'spell') || {}).action || null,
          runeUse: ((turn.components || []).find(c => c && c.comp === 'rune') || {}).action || null,
          grenadeCast: ((turn.components || []).find(c => c && c.comp === 'grenade') || {}).action || null,
        },
      };
    });

    const rows = buildRotationRows(turnTrace, null, { tiers: true, context });
    const gravSanRows = buildGravSanRows(turnTrace, context);
    const gravSanComponentStats = buildGravSanComponentStats(turnTrace);

    const temporalSeries = turnTrace.map((tr, i) => ({
      idx: tr.idx || i + 1,
      ts: tr.ts,
      relTime: i,
      mobsHit: tr.mobsHit || 0,
      components: tr.counts || buildCounts(),
      damage: tr.damage || 0,
    }));

    const visibleTurns = turnTrace.filter(t => !t.partialEdge);
    const firstTs = turnTrace.length ? turnTrace[0].ts : 0;
    const lastTs = turnTrace.length ? turnTrace[turnTrace.length - 1].ts : 0;
    const classifiedSeconds = turnTrace.length > 1 ? Math.max(1, lastTs - firstTs) : 2;
    const mkMetric = (expected, hit) => ({
      expected,
      hit,
      lost: Math.max(0, expected - hit),
      pct: expected ? (hit / expected) * 100 : 0,
      perHour: classifiedSeconds ? hit / (classifiedSeconds / 3600) : 0,
      classifiedSeconds,
      firstTs,
      lastTs,
    });

    const aaExpected = visibleTurns.length;
    const aaHit = visibleTurns.filter(t => t.counts && t.counts.arrow > 0).length;
    const srExpected = visibleTurns.length;
    const srHit = visibleTurns.filter(t => t.counts && (t.counts.spell > 0 || t.counts.rune > 0 || t.counts.grenade > 0 || t.grenadeCastInTurn)).length;

    return {
      player: unified.selectedSpeaker || 'Unified',
      damageSpells: rows.filter(r => r.kind === 'spell').map(r => r.label),
      grenadeSpells: rows.filter(r => r.kind === 'grenade').map(r => r.label),
      rows,
      gravSanRows,
      gravSanComponentCount: gravSanComponentStats.inWindow,
      gravSanComponentsUsed: gravSanComponentStats.active,
      turnTrace,
      temporalSeries,
      aaUptime: mkMetric(aaExpected, aaHit),
      spellRuneUptime: mkMetric(srExpected, srHit),
      excludedTurns: turnTrace.filter(t => t.partialEdge).length,
      totalTurns: turnTrace.length,
      unifiedVisual: true,
      unifiedSource: unified,
    };
  }

  function classifyWithLocalChat(serverText, localText, opts) {
    const unified = classifyUnified(serverText, localText, opts);
    const compat = adaptUnifiedForClassifierUi(unified);
    root.__lastUnifiedResult = unified;
    root.__lastClassifierResult = compat;
    return compat;
  }

  function clsDetailComponentLabel(hit, turn) {
    const comp = hit && (hit.component || hit.comp);
    if (String(hit && hit.comp || '').indexOf('unresolved_component_') === 0 || comp === 'unresolved') {
      const id = String(hit && hit.comp || 'unresolved_component_1').replace(/^unresolved_component_/, '') || '1';
      const rawReason = (hit && (hit.reason || hit.experimentalReason)) || (turn && turn.unifiedReason) || 'missing_mechanical_resolution';
      const reason = /^(mechanical_|missing_)/.test(String(rawReason)) ? rawReason : 'missing_mechanical_resolution:' + rawReason;
      return 'Componente não resolvido ' + id + ' (' + reason + ')';
    }
    if (comp === 'arrow') return 'auto ataque';
    if (comp === 'spell') return hit && hit.actionLabel || (turn && turn.spell) || 'spell';
    if (comp === 'rune') return hit && hit.actionLabel || (turn && turn.rune) || 'rune';
    if (comp === 'grenade') return hit && hit.actionLabel || (turn && turn.gren) || 'grenade';
    return comp || '';
  }

  root.UnifiedMainClassifier = Object.freeze({
    classifyUnified,
    adaptUnifiedForClassifierUi,
    classifyWithLocalChat,
    clsDetailComponentLabel,
  });
  root.classifyWithLocalChat = classifyWithLocalChat;
  root.clsDetailComponentLabel = clsDetailComponentLabel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
