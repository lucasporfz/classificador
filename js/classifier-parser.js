// ============================================================================
// Parser EXCLUSIVO do Classificador — independente do parseServerLog do validador.
// Diferenças propositais em relação ao parser do validador:
//   • SEM guard de ≥5 kills (aceita boss/luta curta de 1 kill).
//   • artigo "A/An/The" OPCIONAL (boss tem nome próprio sem artigo: "Murcion loses…").
//   • só o necessário p/ classificar (sem XP/h, box, sim params, mage).
// REUSA a lógica de classificação compartilhada (a mesma 38/38 do validador):
//   correctRpComponentsByElement / rpClassifyTurnByBands (parser-rp-helpers.js).
// Nada aqui altera o parser do validador.
//
// Globais usados (já carregados antes): mean (stats.js);
// normalizeRuneName, getRuneElement, rpAmplificationDivisor,
// correctRpComponentsByElement (parser-rp-helpers.js);
// ============================================================================

function parseLogForClassifier(logText) {
  const tsPattern = /^(\d{2}):(\d{2}):(\d{2})\s+(.*)$/;
  // artigo opcional → casa "A dragon loses…" E "Murcion loses…" (boss)
  const attackPattern = /(?:(?:A|An|The)\s+)?([A-Za-z][A-Za-z\s'\-]+?)\s+loses\s+(\d+)\s+hitpoints\s+due to your\s+(critical attack|attack)\b\.?\s*(\([^)]*\))?/i;
  const runeUsePattern = /Using one of \d+\s+(.+?)\s+runes?\b/i;
  const xpPattern = /You gained\s+(\d+)\s+experience(?:\s+points?)?\s*(\([^)]*\))?/;
  const lifeLeechPattern = /^You were healed for\s+(\d+)\s+hitpoints\./i;
  const manaLeechPattern = /^You gained\s+(\d+)\s+mana\./i;
  const CRIT_CHARM_RE = /low blow|savage blow/i;

  const events = [];
  let pendingLeechHit = null;
  for (const line of String(logText || '').split(/\r?\n/)) {
    const m = tsPattern.exec(line); if (!m) continue;
    const ts = +m[1] * 3600 + +m[2] * 60 + +m[3];
    const body = m[4];
    const a = attackPattern.exec(body);
    if (!a) {
      const lh = lifeLeechPattern.exec(body);
      if (lh && pendingLeechHit && pendingLeechHit.ts === ts && pendingLeechHit.lifeLeech == null) {
        pendingLeechHit.lifeLeech = +lh[1];
        continue;
      }
      const ml = manaLeechPattern.exec(body);
      if (ml && pendingLeechHit && pendingLeechHit.ts === ts && pendingLeechHit.manaLeech == null) {
        pendingLeechHit.manaLeech = +ml[1];
        pendingLeechHit = null;
        continue;
      }
      pendingLeechHit = null;
      const ru = runeUsePattern.exec(body);
      if (ru) {
        const rune = normalizeRuneName(ru[1]);
        const element = getRuneElement(rune);
        if (element !== 'unknown') events.push({ ts, type: 'rune', rune, element });
        continue;
      }
      const x = xpPattern.exec(body);
      if (x) events.push({ ts, type: 'xp', xp: +x[1] });
      continue;
    }
    const isCrit = /critical/i.test(a[3]);
    const suffix = a[4] || '';
    const isPrey = /prey/i.test(suffix);
    const isReflection = /damage reflection/i.test(suffix);
    const hasCharm = /charm/i.test(suffix);
    const hasCritCharm = CRIT_CHARM_RE.test(suffix);
    const hasOnslaught = /\bOnslaught\b/i.test(suffix);
    const hasBountyTalisman = /Bounty Talisman/i.test(suffix);
    const mob = a[1].toLowerCase().trim();
    const dmg = +a[2];
    pendingLeechHit = null;
    if (isReflection && !hasCharm) { events.push({ ts, type: 'reflect', mob, dmg }); continue; }
    const isPreyEffective = isPrey || hasBountyTalisman;
    const hasExposeWeakness = /Expose Weakness/i.test(suffix);
    if (hasCritCharm || hasOnslaught) {
      const ev = { ts, type: 'crit', mob, dmg, isPrey: isPreyEffective, onslaught: hasOnslaught, lowBlow: hasCritCharm, realCrit: isCrit || hasCritCharm, exposeWeakness: hasExposeWeakness };
      events.push(ev);
      if (!hasCritCharm) pendingLeechHit = ev;
      continue;
    }
    if (hasCharm) { events.push({ ts, type: 'charm', mob, dmg, isPassive: isReflection }); continue; }
    const ev = { ts, type: isCrit ? 'crit' : 'normal', mob, dmg, isPrey: isPreyEffective, onslaught: false, lowBlow: false, realCrit: isCrit, exposeWeakness: hasExposeWeakness };
    events.push(ev);
    pendingLeechHit = ev;
  }
  events.forEach((e, i) => { e.seq = i; });

  const attackEvents = events.filter(e => e.type === 'normal' || e.type === 'crit');
  const runeEvents = events.filter(e => e.type === 'rune');
  if (attackEvents.length < 4) return { turnStats: [], error: 'log_too_short', attackCount: attackEvents.length };

  // overkill (killing blow, dano capado): o evento seguinte (seq+1) é um XP logado em
  // ≤1s (mesmo turno) — o XP do golpe que mata sai imediato. Um XP vários segundos à
  // frente, com só linhas não-evento (heal/mana/dano de terceiros) no meio, é de OUTRA
  // leva de kills da party: NÃO torna o hit anterior um killing blow. Ex.: uhax 19:52:18
  // (runa que não saiu) era pareado com o XP em 19:52:20 → falso overkill.
  for (const e of attackEvents) {
    let nxt = null;
    for (let j = e.seq + 1; j < events.length; j++) {
      const ev = events[j];
      if (ev.ts - e.ts > 1) break;
      if (ev.type === 'charm' || ev.type === 'reflect') continue;
      nxt = ev; break;
    }
    e.overkill = !!(nxt && nxt.type === 'xp' && nxt.ts - e.ts <= 1);
  }

  // crit/prey (iguais ao parser, só o necessário p/ a normalização da classificação)
  const cleanNormals = attackEvents.filter(e => e.type === 'normal' && !e.isPrey).map(e => e.dmg);
  const cleanCrits = attackEvents.filter(e => e.type === 'crit' && !e.isPrey && !e.onslaught).map(e => e.dmg);
  const preyNormals = attackEvents.filter(e => e.type === 'normal' && e.isPrey).map(e => e.dmg);
  const avgNormal = cleanNormals.length ? mean(cleanNormals) : 0;
  const avgCrit = cleanCrits.length ? mean(cleanCrits) : 0;
  const avgPreyNormal = preyNormals.length ? mean(preyNormals) : 0;
  const preyMult = avgNormal > 0 && avgPreyNormal > 0 ? avgPreyNormal / avgNormal : 1;
  const critMultObserved = avgNormal > 0 && avgCrit > 0 ? avgCrit / avgNormal : 0;

  // turnos mecânicos (mesmo agrupamento de 2s do parser)
  const sortedAttacks = [...attackEvents].sort((a, b) => (a.ts - b.ts) || ((a.seq || 0) - (b.seq || 0)));
  const turns = [];
  if (sortedAttacks.length) {
    const blocks = []; let cur = [sortedAttacks[0]]; let prev = sortedAttacks[0].ts;
    for (let i = 1; i < sortedAttacks.length; i++) { const ev = sortedAttacks[i]; if (ev.ts - prev < 2) cur.push(ev); else { blocks.push(cur); cur = [ev]; } prev = ev.ts; }
    blocks.push(cur);
    for (const block of blocks) {
      let start = block[0].ts; let curTurn = [];
      for (const ev of block) { if (ev.ts - start < 2) curTurn.push(ev); else { turns.push(curTurn); while (ev.ts - start >= 2) start += 2; curTurn = [ev]; } }
      if (curTurn.length) turns.push(curTurn);
    }
  }

  const rawTurnHits = turns.map(t => t.filter(e => e.type === 'normal' || e.type === 'crit').length);

  const turnStats = turns.map((t, idx) => {
    const rawAttackHits = rawTurnHits[idx];
    return {
      ts: t[0].ts,
      rawAttackHits,
      mobsHit: Math.max(0, rawAttackHits),
      rpGrenade: null,
      components: { arrow: 0, spell: 0, rune: 0, grenade: 0 },
      normalHits: t.filter(e => e.type === 'normal').length,
      critHits: t.filter(e => e.type === 'crit').length,
    };
  });

  // classificação RP compartilhada (arrow/spell/runa/granada por assinatura de dano)
  const rpElementalPreyMult = attackEvents.some(e => e.isPrey) ? 1.25 : preyMult;
  correctRpComponentsByElement(turns, turnStats, runeEvents, critMultObserved, rpElementalPreyMult);

  // nº de mobs distintos que tomaram dano (boss = 1) — útil p/ saber o regime
  const mobs = new Set(attackEvents.map(e => e.mob));
  return { turnStats, critMultObserved, preyMult, nTurns: turns.length, distinctMobs: mobs.size, isPaladin: true };
}
