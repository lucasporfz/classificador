// Glue da UI do Classificador (página standalone). Reusa classifyWithLocalChat
// (classifier.js) e os helpers de gráfico. Sem simulação — só leitura dos dois logs.
const $ = id => document.getElementById(id);

let clsTimelineComponentsChart = null;
let clsTimelineHitsChart = null;
let clsTimelineDamageChart = null;
let clsImpactChart = null;
let clsRowHistCharts = [];
let clsServerSessions = null;
let clsLocalSessions  = null;

function clsSpellNameSafe(text) {
  return typeof clsSpellLabel === 'function' ? clsSpellLabel(text) : text;
}

function clsSplitSessions(text) {
  const headerRe = /^Channel .+ saved /;
  const tsRe = /^(\d{2}:\d{2}:\d{2})/;
  const sessions = [];
  let cur = null;
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (headerRe.test(line)) {
      if (cur) sessions.push(cur);
      cur = { header: line, lines: [line], firstTs: null, lastTs: null };
    } else if (cur) {
      cur.lines.push(line);
      const m = tsRe.exec(line);
      if (m) { if (!cur.firstTs) cur.firstTs = m[1]; cur.lastTs = m[1]; }
    }
  }
  if (cur) sessions.push(cur);
  if (sessions.length === 0) {
    const allLines = text.replace(/^﻿/, '').split(/\r?\n/);
    let firstTs = null, lastTs = null;
    for (const line of allLines) {
      const m = tsRe.exec(line);
      if (m) { if (!firstTs) firstTs = m[1]; lastTs = m[1]; }
    }
    sessions.push({ header: '', lines: allLines, firstTs, lastTs });
  }
  return sessions.map(s => ({ ...s, text: s.lines.join('\n') }));
}

function clsSessionLabel(s) {
  const m = /saved \w+ (\w+) +(\d+) (\d{2}:\d{2}):\d{2} (\d{4})/.exec(s.header);
  if (!m) return s.header;
  const [, mon, day, , year] = m;
  const start = s.firstTs ? s.firstTs.slice(0, 5) : '?';
  const end   = s.lastTs  ? s.lastTs.slice(0, 5)  : '?';
  return `${day.padStart(2, '0')}/${mon}/${year} ${start}–${end}`;
}

function clsParseSessionDate(s) {
  const MONTHS = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  // header: "Channel ... saved Www Mmm DD HH:MM:SS YYYY" — hora = quando o arquivo foi salvo
  const m = /saved \w+ (\w+) +(\d+) (\d{2}):(\d{2}):(\d{2}) (\d{4})/.exec(s.header);
  if (!m) return null;
  const saveSec = +m[3]*3600 + +m[4]*60 + +m[5];
  return { year: +m[6], month: MONTHS[m[1]] || 0, day: +m[2], saveSec };
}

function clsBuildPairs(svSessions, lcSessions) {
  const pairs = [];
  for (const sv of svSessions) {
    const sd = clsParseSessionDate(sv);
    if (!sd) continue;
    let best = null, bestDiff = Infinity;
    for (const lc of lcSessions) {
      const ld = clsParseSessionDate(lc);
      if (!ld || ld.year !== sd.year || ld.month !== sd.month || ld.day !== sd.day) continue;
      const diff = Math.abs(ld.saveSec - sd.saveSec);
      if (diff < bestDiff) { bestDiff = diff; best = lc; }
    }
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best, label: clsSessionLabel(sv) });
  }
  return pairs;
}

function clsUpdatePairPicker() {
  const sel = $('clsPairSelect');
  if (!clsServerSessions || !clsLocalSessions) { sel.style.display = 'none'; return; }
  if (clsServerSessions.length === 1 && clsLocalSessions.length === 1) {
    $('clsServerInput').value = clsServerSessions[0].text;
    $('clsLocalInput').value  = clsLocalSessions[0].text;
    sel.style.display = 'none';
    return;
  }
  const pairs = clsBuildPairs(clsServerSessions, clsLocalSessions);
  sel._pairs = pairs;
  if (pairs.length === 0) {
    sel.style.display = 'none';
    $('clsStatus').textContent = t('cls_status_no_pairs');
    return;
  }
  const applyPair = p => { $('clsServerInput').value = p.sv.text; $('clsLocalInput').value = p.lc.text; };
  applyPair(pairs[0]);
  if (pairs.length === 1) { sel.style.display = 'none'; return; }
  sel.innerHTML = pairs.map((p, i) => `<option value="${i}">${p.label}</option>`).join('');
  sel.style.display = '';
}

function clsLoadFile(inputId, isServer) {
  const file = $(inputId).files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const sessions = clsSplitSessions(ev.target.result);
    if (isServer) {
      clsServerSessions = sessions;
      $('clsServerInput').value = sessions[0].text;
      if (clsLocalSessions) $('clsLocalInput').value = clsLocalSessions[0].text;
    } else {
      clsLocalSessions = sessions;
      $('clsLocalInput').value = sessions[0].text;
      if (clsServerSessions) $('clsServerInput').value = clsServerSessions[0].text;
    }
    clsUpdatePairPicker();
  };
  reader.readAsText(file);
}

function clsChartClickHandler(res, resolver) {
  return function(evt, activeEls, chartArg) {
    const chart = chartArg || this;
    if (!chart || typeof chart.getElementsAtEventForMode !== 'function') return;
    const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
    if (!els || !els.length) return;
    const turns = typeof resolver === 'function' ? resolver(els[0], chart) : null;
    renderTurnDetail(turns && turns.length ? turns : null, res, 0);
  };
}

function clsTurnByDataIndex(res, dataIndex) {
  return res && res.turnTrace && res.turnTrace[dataIndex] ? [res.turnTrace[dataIndex]] : null;
}

function clsFmtTurnTs(ts) {
  if (!Number.isFinite(ts)) return '-';
  const h = Math.floor(ts / 3600);
  const m = Math.floor((ts % 3600) / 60);
  const s = Math.floor(ts % 60);
  return [h, m, s].map(x => String(x).padStart(2, '0')).join(':');
}

function clsEscapeHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function clsDetailComponentLabel(hit, turn) {
  const comp = hit && hit.comp;
  if (comp === 'arrow') return 'auto ataque';
  if (comp === 'spell') return turn && turn.spell ? clsSpellNameSafe(turn.spell) : 'spell';
  if (comp === 'rune') return turn && turn.rune ? turn.rune : 'rune';
  if (comp === 'grenade') return turn && turn.gren ? clsSpellNameSafe(turn.gren) : 'grenade';
  return comp || '';
}

function clsDetailCritLabel(hit) {
  if (!hit) return '-';
  if (hit.onslaught) return (hit.realCrit || hit.lowBlow) ? 'Crítico e Onslaught' : 'Onslaught';
  if (hit.type === 'crit') return hit.lowBlow ? 'crítico low blow' : 'crítico';
  return '-';
}

function renderTurnDetail(turns, res, selectedIndex) {
  const old = document.getElementById('clsTurnDetail');
  if (old) old.remove();

  const panel = document.createElement('div');
  panel.id = 'clsTurnDetail';
  panel.className = 'cls-turn-detail';
  const close = () => {
    document.removeEventListener('mousedown', onOutside);
    panel.remove();
  };
  const onOutside = ev => { if (!panel.contains(ev.target)) close(); };

  const list = Array.isArray(turns) ? turns.filter(Boolean) : [];
  const trace = res && Array.isArray(res.turnTrace) ? res.turnTrace.filter(Boolean) : [];
  const activeIndex = Math.max(0, Math.min(Number.isFinite(selectedIndex) ? selectedIndex : 0, Math.max(0, list.length - 1)));
  const activeTurn = list[activeIndex] || null;
  const traceIndex = activeTurn && trace.length
    ? trace.findIndex(t => t === activeTurn || (t.idx != null && t.idx === activeTurn.idx))
    : -1;
  const navList = list.length > 1 ? list : trace;
  const navIndex = list.length > 1 ? activeIndex : traceIndex;
  const canNav = navList.length > 1 && navIndex >= 0;
  const canPrev = canNav && navIndex > 0;
  const canNext = canNav && navIndex < navList.length - 1;
  const navLabel = canNav
    ? (String(navIndex + 1) + ' / ' + String(navList.length))
    : (list.length > 1 ? (String(activeIndex + 1) + ' / ' + String(list.length)) : '');
  const headerHtml =
    '<div class="cls-turn-detail-head">' +
      '<h3 class="cls-h">Detalhes do turno</h3>' +
      '<div class="cls-turn-detail-nav">' +
        '<button type="button" class="cls-turn-detail-prev" ' + (canPrev ? '' : 'disabled') + '>&lt;-- turno anterior</button>' +
        '<span class="cls-turn-detail-index">' + clsEscapeHtml(navLabel) + '</span>' +
        '<button type="button" class="cls-turn-detail-next" ' + (canNext ? '' : 'disabled') + '>proximo turno --&gt;</button>' +
      '</div>' +
      '<button type="button" class="cls-turn-detail-close" aria-label="Fechar">x</button>' +
    '</div>';

  if (!list.length) {
    panel.innerHTML =
      headerHtml +
      '<p class="cls-turn-detail-empty">Dados individuais não disponíveis para este gráfico</p>';
  } else {
    const turn = activeTurn;
    const counts = turn.counts || {};
    const hits = turn.lines || [];
    panel.innerHTML =
      headerHtml +
      '<div class="cls-turn-detail-block">' +
        '<p class="cls-turn-detail-meta"><strong>Turno:</strong> ' + clsFmtTurnTs(turn.ts) +
          ' &nbsp;·&nbsp; <strong>Componentes:</strong> ' +
          'AA ' + (counts.arrow || 0) + ', spell ' + (counts.spell || 0) +
          ', rune ' + (counts.rune || 0) + ', grenade ' + (counts.grenade || 0) +
        '</p>' +
        '<table class="cls-table cls-turn-detail-table"><thead><tr>' +
          '<th>Timestamp</th><th>Dano</th><th>Tipo/Componente</th><th>Crítico/Onslaught</th><th>Overkill</th><th>Mob alvo</th>' +
        '</tr></thead><tbody>' +
          hits.map(h =>
            '<tr>' +
              '<td>' + clsEscapeHtml(clsFmtTurnTs(h.ts)) + '</td>' +
              '<td style="text-align:right">' + clsEscapeHtml(h.dmg) + '</td>' +
              '<td>' + clsEscapeHtml(clsDetailComponentLabel(h, turn)) + '</td>' +
              '<td>' + clsEscapeHtml(clsDetailCritLabel(h)) + '</td>' +
              '<td>' + (h.ok ? 'sim' : '-') + '</td>' +
              '<td>' + clsEscapeHtml(h.mob || '') + '</td>' +
            '</tr>'
          ).join('') +
        '</tbody></table>' +
      '</div>';
  }

  document.body.appendChild(panel);
  panel.querySelector('.cls-turn-detail-close').addEventListener('click', close);
  const go = dir => {
    if (!canNav) return;
    const nextIndex = Math.max(0, Math.min(navIndex + dir, navList.length - 1));
    if (nextIndex === navIndex) return;
    if (list.length > 1) renderTurnDetail(list, res, nextIndex);
    else renderTurnDetail([navList[nextIndex]], res, 0);
  };
  const prevBtn = panel.querySelector('.cls-turn-detail-prev');
  const nextBtn = panel.querySelector('.cls-turn-detail-next');
  if (prevBtn) prevBtn.addEventListener('click', () => go(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => go(1));
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
}

function renderClassifier(res) {
  const box = $('clsResults');
  if (!res || res.error) {
    box.style.display = 'block';
    box.innerHTML = '<p style="color:var(--red)">' + t('cls_no_turns') + '</p>';
    return;
  }
  const f2 = x => x.toFixed(2);
  const tierLabel = (tier, mult) => tier.kind === 'tier_bonus'
    ? t('cls_tier_bonus') + (mult ? ' (×' + f2(mult) + ')' : '')
    : t('cls_tier_base');
  const rowsHtml = res.rows.map(r => {
    const main = '<tr><td>' + (r.kind === 'arrow' ? t('cls_comp_arrow') : r.label) + '</td><td style="text-align:right">' + r.turns +
      '</td><td style="text-align:right">' + f2(r.hitsMean) + '</td><td style="text-align:right">' + r.dmgBase +
      '</td><td style="text-align:right">' + r.dmgEff + '</td></tr>';
    if (!r.tiers || !r.tiers.length) return main;
    const sub = r.tiers.map(tier =>
      '<tr style="color:var(--text-muted);font-size:12px"><td style="padding-left:22px">└ ' + tierLabel(tier, r.bonusMult) +
      '</td><td></td><td style="text-align:right">' + f2(tier.hitsMean) +
      '</td><td style="text-align:right">' + tier.dmgBase + '</td><td style="text-align:right">' + tier.dmgEff + '</td></tr>'
    ).join('');
    return main + sub;
  }).join('');
  const dmgSummary = res.damageSpells.map(clsSpellNameSafe)
    .concat((res.grenadeSpells || []).map(x => clsSpellNameSafe(x) + ' (' + t('cls_kind_grenade') + ')'));

  // gráficos do log (só dados observados, sem simulação) — um histograma de hits por
  // LINHA da rotação (cada spell/componente: AA, cada spell nominal, runa, granada).
  const kindColor = { arrow: '#F59E0B', spell: '#22C55E', rune: '#60A5FA', grenade: '#F87171' };
  const compDefs = (res.rows || [])
    .map((r, rowIndex) => ({ r, rowIndex }))
    .filter(x => Array.isArray(x.r.hitsPerTurn) && x.r.hitsPerTurn.some(v => v > 0))
    .map((r, i) => ({
      canvas: 'clsHist' + i,
      rowIndex: r.rowIndex,
      vals: r.r.hitsPerTurn.filter(v => v > 0),
      label: (r.r.kind === 'arrow' ? t('cls_comp_arrow') : r.r.label),
      color: kindColor[r.r.kind] || '#22C55E',
    }));
  const hasSeries = (res.temporalSeries || []).length > 0;
  const chartsHtml = !hasSeries ? '' : (
    '<h3 class="cls-h">' + t('cls_h_charts') + '</h3>' +
    (compDefs.length ? '<div class="cls-hist-grid">' +
      compDefs.map(d => '<div style="position:relative;height:220px"><canvas id="' + d.canvas + '"></canvas></div>').join('') +
      '</div>' : '') +
    '<div style="position:relative;height:240px;margin-bottom:14px"><canvas id="clsTimelineComponents"></canvas></div>' +
    '<div style="position:relative;height:240px;margin-bottom:14px"><canvas id="clsTimelineHits"></canvas></div>' +
    '<div style="position:relative;height:240px;margin-bottom:14px"><canvas id="clsTimelineDamage"></canvas></div>' +
    '<div style="position:relative;height:230px"><canvas id="clsImpactAnalyser"></canvas></div>'
  );

  box.style.display = 'block';
  box.innerHTML =
    '<p style="font-size:12.5px;margin:6px 0 14px"><strong>' + t('cls_player') + ':</strong> ' +
      (res.player || '—') + ' &nbsp;·&nbsp; <strong>' + t('cls_dmg_spell') + ':</strong> ' +
      (dmgSummary.join(', ') || '—') + '</p>' +
    '<h3 class="cls-h">' + t('cls_h_rotation') + '</h3>' +
    '<table class="cls-table"><thead><tr><th>' + t('cls_th_comp') + '</th><th style="text-align:right">' + t('cls_th_turns') +
      '</th><th style="text-align:right">' + t('cls_th_hits') + '</th><th style="text-align:right">' + t('cls_th_dmg_base') +
      '</th><th style="text-align:right">' + t('cls_th_dmg_eff') + '</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">' +
      t('cls_unmatched').replace('{u}', res.excludedTurns).replace('{n}', res.totalTurns) + '</p>' +
    chartsHtml;
  renderClassifierCharts(res, compDefs);
}

// Gráficos do classificador (só log observado, sem linha de simulação): componentes por
// turno, hits/turno, dano/turno, Impact Analyser e histograma por componente.
function renderClassifierCharts(res, compDefs) {
  const destroy = c => { try { if (c && typeof c.destroy === 'function') c.destroy(); } catch (e) {} };
  destroy(clsTimelineComponentsChart); destroy(clsTimelineHitsChart); destroy(clsTimelineDamageChart); destroy(clsImpactChart);
  clsRowHistCharts.forEach(destroy); clsRowHistCharts = [];
  clsTimelineComponentsChart = clsTimelineHitsChart = clsTimelineDamageChart = clsImpactChart = null;
  const series = res.temporalSeries || [];
  if (typeof Chart === 'undefined' || !series.length) return;
  const labels = series.map((_, i) => i + 1);
  const gridColor = 'rgba(139,164,194,0.1)';
  const toRgba = (hex, a) => { const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(h => parseInt(h, 16)); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
  const scales = () => ({
    x: { grid: { color: gridColor }, ticks: { color: '#8BA4C2', font: { size: 10 }, maxTicksLimit: 12 }, title: { display: true, text: t('val_axis_turn'), color: '#8BA4C2' } },
    y: { grid: { color: gridColor }, ticks: { color: '#8BA4C2', font: { size: 11 } }, beginAtZero: true }
  });
  const lineChart = (canvasId, data, title_, color) => {
    const cv = $(canvasId);
    if (!cv) return null;
    try {
      return new Chart(cv, {
        type: 'line',
        data: { labels, datasets: [{ label: t('val_timeline_real'), data, borderColor: color, backgroundColor: toRgba(color, 0.12), borderWidth: 1.5, pointRadius: 0, tension: .25 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, onClick: clsChartClickHandler(res, hit => clsTurnByDataIndex(res, hit.index)), plugins: { legend: { display: false }, title: { display: true, text: title_, color: '#DDE6F3' } }, scales: scales() }
      });
    } catch (err) { console.error('[classifier chart] failed:', canvasId, err); return null; }
  };
  // componentes por turno — uma linha por componente/spell REAL da rotação (das linhas
  // observadas), não o set fixo do validador. Assim pega as spells de qualquer vocação e
  // não inventa runa/granada quando não há. Usa o hitsTimeline alinhado de cada linha.
  const compPalette = ['#F59E0B', '#22C55E', '#60A5FA', '#F87171', '#A78BFA', '#FBBF24', '#34D399', '#F472B6', '#38BDF8', '#FB923C', '#C084FC'];
  const compRows = (res.rows || []).filter(r => Array.isArray(r.hitsTimeline) && r.hitsTimeline.some(v => v > 0));
  const compCv = $('clsTimelineComponents');
  if (compCv && compRows.length) {
    try {
      clsTimelineComponentsChart = new Chart(compCv, {
        type: 'line',
        data: { labels, datasets: compRows.map((r, idx) => {
          const color = compPalette[idx % compPalette.length];
          return {
            label: r.kind === 'arrow' ? t('cls_comp_arrow') : r.label,
            data: r.hitsTimeline,
            borderColor: color, backgroundColor: color,
            borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false
          };
        }) },
        options: { responsive: true, maintainAspectRatio: false, animation: false, onClick: clsChartClickHandler(res, hit => clsTurnByDataIndex(res, hit.index)), plugins: { legend: { labels: { color: '#8BA4C2', font: { size: 11 } } }, title: { display: true, text: t('val_timeline_components'), color: '#DDE6F3' } }, scales: scales() }
      });
    } catch (err) { console.error('[classifier chart] failed: clsTimelineComponents', err); }
  }
  clsTimelineHitsChart = lineChart('clsTimelineHits', series.map(p => p.mobsHit), t('val_timeline_hits'), '#3B82F6');
  clsTimelineDamageChart = lineChart('clsTimelineDamage', series.map(p => p.damage), t('val_timeline_damage'), '#F59E0B');
  clsImpactChart = lineChart('clsImpactAnalyser', movingImpact(series), t('val_impact_analyser'), '#3B82F6');
  for (const d of (compDefs || [])) {
    renderSmallComponentHistogram(d.canvas, c => { clsRowHistCharts.push(c); }, d.vals, null, d.label, undefined, d.color, {
      onClick: clsChartClickHandler(res, (hit, chart) => {
        const n = Number(chart.data && chart.data.labels ? chart.data.labels[hit.index] : hit.index);
        const row = (res.rows || [])[d.rowIndex];
        if (!row || !Array.isArray(row.hitsTimeline) || !Array.isArray(res.turnTrace)) return null;
        return res.turnTrace.filter((_, i) => Math.round(row.hitsTimeline[i] || 0) === n);
      })
    });
  }
}

// re-renderiza ao trocar de idioma se já houver resultado
let lastClsResult = null;
function onLangChange() { if (lastClsResult) renderClassifier(lastClsResult); }

// ---- wiring ----
$('btnClsServerFile').addEventListener('click', () => { $('clsServerFileInput').value = ''; $('clsServerFileInput').click(); });
$('btnClsLocalFile').addEventListener('click',  () => { $('clsLocalFileInput').value  = ''; $('clsLocalFileInput').click(); });
$('clsServerFileInput').addEventListener('change', () => clsLoadFile('clsServerFileInput', true));
$('clsLocalFileInput').addEventListener('change',  () => clsLoadFile('clsLocalFileInput',  false));
$('clsPairSelect').addEventListener('change', function() {
  const p = this._pairs[+this.value];
  $('clsServerInput').value = p.sv.text;
  $('clsLocalInput').value  = p.lc.text;
});
$('btnClassify').addEventListener('click', () => {
  const sv = $('clsServerInput').value.trim();
  const lc = $('clsLocalInput').value.trim();
  if (!sv || !lc) { $('clsStatus').textContent = t('cls_status_need_both'); return; }
  $('clsStatus').textContent = t('cls_status_running');
  try {
    const res = classifyWithLocalChat(sv, lc, { trace: true });
    lastClsResult = res;
    renderClassifier(res);
    $('clsStatus').textContent = t('cls_status_done');
  } catch (err) {
    $('clsStatus').textContent = 'erro: ' + err.message;
    console.error(err);
  }
});
$('langPt').addEventListener('click', () => { LANG = 'pt'; applyI18n(); });
$('langEn').addEventListener('click', () => { LANG = 'en'; applyI18n(); });

applyI18n();
