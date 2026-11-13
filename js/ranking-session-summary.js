/*
 * ranking-session-summary.js
 *
 * Resumo de sessão para o ranking de jogadores. Módulo PURO: lê o resultado do Unified
 * (e a visão de UI dele) e devolve o que o cliente enviaria. Não altera o motor, não é
 * carregado por index.html e não faz I/O.
 *
 * Exporta globalThis.RankingSessionSummary (+ module.exports quando disponível).
 */
(function(root) {
  'use strict';

  const SUMMARY_VERSION = 1;
  const MIN_CHUNK_TURNS = 10;

  const escapeRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const num = v => (Number.isFinite(+v) ? +v : 0);
  const idOf = r => r.kind + '|' + r.label;

  // Level do Local Chat: toda fala é gravada como "Nome [2600]: ...". Maior level visto.
  function levelFromLocalChat(localText, player) {
    if (!player || !localText) return null;
    const re = new RegExp(escapeRe(player) + ' \\[(\\d+)\\]', 'gi');
    const levels = [...String(localText).matchAll(re)].map(m => +m[1]);
    return levels.length ? Math.max(...levels) : null;
  }

  // Singulariza o nome (plural) que o tibiainfo lista; devolve as variantes candidatas.
  function singulars(plural) {
    const p = String(plural).toLowerCase().trim(), out = new Set([p]);
    if (p.endsWith('men')) out.add(p.slice(0, -3) + 'man');
    if (p.endsWith('ies')) out.add(p.slice(0, -3) + 'y');
    if (/(ses|xes|ches|shes|zes)$/.test(p)) out.add(p.slice(0, -2));
    if (p.endsWith('ves')) out.add(p.slice(0, -3) + 'f').add(p.slice(0, -3) + 'fe');
    if (p.endsWith('s')) out.add(p.slice(0, -1));
    return out;
  }

  // spawns: { "Nome da hunt": ["Monstros Plurais", ...] } (campo `spawns` de docs/data/tibiainfo-spawns-*.json)
  function buildMonsterIndex(spawns) {
    const index = new Map();
    for (const [spawn, mons] of Object.entries(spawns || {})) {
      for (const m of mons) for (const x of singulars(m)) {
        if (!index.has(x)) index.set(x, new Set());
        index.get(x).add(spawn);
      }
    }
    return index;
  }

  // Hunt = spawn com maior soma da fração de mobs da sessão que ele contém. Sem spawn (boss),
  // cai no nome do mob dominante em Title Case; sem mobs, null.
  function huntOf(mobs, spawns) {
    const index = spawns instanceof Map ? spawns : buildMonsterIndex(spawns);
    const score = new Map();
    for (const mob of mobs || []) {
      for (const sp of index.get(String(mob.name).toLowerCase()) || []) score.set(sp, (score.get(sp) || 0) + num(mob.share));
    }
    if (score.size) return [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return mobs && mobs[0] ? String(mobs[0].name).replace(/\b\w/g, c => c.toUpperCase()) : null;
  }

  // Os 3 mobs com mais eventos de dano; window = [t0, t1] restringe (com folga de 1s).
  function dominantMobs(events, window) {
    const count = new Map(); let total = 0;
    for (const ev of events || []) {
      if (!ev || !ev.mob) continue;
      if (window && Number.isFinite(+ev.ts) && (ev.ts < window[0] - 1 || ev.ts > window[1] + 1)) continue;
      count.set(ev.mob, (count.get(ev.mob) || 0) + 1); total++;
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([name, n]) => ({ name, share: +(n / total).toFixed(3) }));
  }

  // Hits médios ajustados pelo tapete (grav san); mesma fórmula de clsGravSanAdjustedHits (js/app.js):
  // hitsMean × (1 + bônus × parcela dos hits do componente que caíram em turnos com tapete).
  function adjustedHits(row, bonus, carpetRow) {
    const total = num(row.hitsMean) * num(row.turns);
    const carpet = carpetRow ? num(carpetRow.hitsMean) * num(carpetRow.turns) : null;
    const share = carpet != null && total > 0 ? carpet / total : 0;
    return num(row.hitsMean) * (1 + num(bonus) * share);
  }

  // `ui` = UnifiedMainClassifier.adaptUnifiedForClassifierUi(u) (ou de uma fatia de u).
  function summarizeUi(u, ui, opts) {
    const bonus = num(ui.gravSanBonus);
    const carpetBy = new Map((ui.gravSanRows || []).map(g => [idOf(g), g]));
    const rows = ui.rows.map(r => ({
      label: r.label, kind: r.kind, turns: r.turns,
      hitsMean: +num(r.hitsMean).toFixed(3),
      hitsAdj: +adjustedHits(r, bonus, carpetBy.get(idOf(r))).toFixed(3),
      maxTurnDmg: Math.max(0, ...(r.damageTimeline || [0])),
    }));
    const den = ui.rows.reduce((a, r) => a + num(r.turns), 0), used = num(ui.gravSanComponentsUsed);
    const trace = (ui.turnTrace || []).filter(t => !t.partialEdge);
    const t0 = ui.turnTrace && ui.turnTrace.length ? ui.turnTrace[0].ts : -Infinity;
    const t1 = ui.turnTrace && ui.turnTrace.length ? ui.turnTrace[ui.turnTrace.length - 1].ts : Infinity;
    const mobs = dominantMobs(u.facts && u.facts.server && u.facts.server.events, opts.windowed ? [t0, t1] : null);
    const unresolved = (ui.turnTrace || []).filter(t => t.unifiedStatus && t.unifiedStatus !== 'ok' && t.unifiedStatus !== 'resolved').length;
    const totalTurns = num(ui.totalTurns);
    const vocation = u.vocation || null;
    return {
      summaryVersion: SUMMARY_VERSION,
      engineVersion: u.version || null,
      player: u.selectedSpeaker || null,
      vocation,
      level: opts.level == null ? null : opts.level,
      date: opts.date || null,
      hunt: huntOf(mobs, opts.spawns),
      mobs,
      totalTurns,
      unresolvedPct: totalTurns > 0 ? +(unresolved / totalTurns * 100).toFixed(2) : 0,
      aa: { pct: num(ui.aaUptime && ui.aaUptime.pct), perHour: num(ui.aaUptime && ui.aaUptime.perHour) },
      spellRune: { perHour: num(ui.spellRuneUptime && ui.spellRuneUptime.perHour) },
      maxTurnDamage: Math.max(0, ...trace.map(t => num(t.damage))),
      maxSingleHit: Math.max(0, ...trace.flatMap(t => (t.lines || []).map(l => num(l.dmg)))),
      gravSan: { bonus, used, den, uptime: den > 0 ? used / den : 0 },
      rows,
    };
  }

  // Resumo a partir do resultado da UI (compat de adaptUnifiedForClassifierUi, que carrega unifiedSource).
  // Usado quando o motor rodou num Worker e só o resultado da UI voltou. opts: { level, date, spawns }.
  function summaryFromUiResult(ui, opts) {
    const u = ui && ui.unifiedSource;
    if (!ui || ui.error || !u || u.error) return { error: (ui && ui.error) || (u && u.error) || 'sem resultado' };
    return summarizeUi(u, ui, opts || {});
  }

  // Resumo da sessão inteira. opts: { level, date: 'YYYY-MM-DD', spawns, adapt }.
  // `adapt` padrão = UnifiedMainClassifier.adaptUnifiedForClassifierUi.
  function buildSessionSummary(u, opts) {
    opts = opts || {};
    if (!u || u.error) return { error: (u && u.error) || 'sem resultado' };
    const adapt = opts.adapt || (root.UnifiedMainClassifier && root.UnifiedMainClassifier.adaptUnifiedForClassifierUi);
    if (typeof adapt !== 'function') throw new Error('adaptUnifiedForClassifierUi indisponível');
    const ui = adapt(u);
    if (ui.error) return { error: ui.error };
    return summarizeUi(u, ui, opts);
  }

  // Só para o protótipo/estudos: fatia os turnos já resolvidos em N partes contíguas.
  // _context não é enumerável (Object.assign o perde): sem ele o bônus do tapete vira 0.
  function buildSessionSummaryParts(u, parts, opts) {
    opts = opts || {};
    if (!u || u.error) return [{ error: (u && u.error) || 'sem resultado' }];
    const adapt = opts.adapt || root.UnifiedMainClassifier.adaptUnifiedForClassifierUi;
    const visible = (u.turns || []).filter(t => t && !t.partialEdgeMissingEvidence);
    const size = Math.ceil(visible.length / parts), out = [];
    for (let k = 0; k < parts; k++) {
      const chunk = visible.slice(k * size, (k + 1) * size);
      if (parts > 1 && chunk.length < MIN_CHUNK_TURNS) continue;
      const slice = Object.assign({}, u, { turns: chunk }); slice._context = u._context;
      const ui = adapt(slice);
      if (ui.error) continue;
      out.push(Object.assign(summarizeUi(u, ui, Object.assign({}, opts, { windowed: parts > 1 })), { part: k + 1, parts }));
    }
    return out;
  }

  const API = { SUMMARY_VERSION, levelFromLocalChat, singulars, buildMonsterIndex, huntOf, dominantMobs, adjustedHits, buildSessionSummary, summaryFromUiResult, buildSessionSummaryParts };
  root.RankingSessionSummary = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
