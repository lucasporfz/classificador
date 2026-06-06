// Glue da UI do Classificador (página standalone). Reusa classifyWithLocalChat
// (classifier.js) e os helpers de gráfico. Sem simulação — só leitura dos dois logs.
const $ = id => document.getElementById(id);

let clsTimelineComponentsChart = null;
let clsTimelineHitsChart = null;
let clsTimelineDamageChart = null;
let clsImpactChart = null;
let clsRowHistCharts = [];

function clsSpellNameSafe(text) {
  return typeof clsSpellLabel === 'function' ? clsSpellLabel(text) : text;
}

function clsLoadFile(inputId, targetId) {
  const file = $(inputId).files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => { $(targetId).value = ev.target.result; };
  reader.readAsText(file);
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
    .filter(r => Array.isArray(r.hitsPerTurn) && r.hitsPerTurn.some(v => v > 0))
    .map((r, i) => ({
      canvas: 'clsHist' + i,
      vals: r.hitsPerTurn.filter(v => v > 0),
      label: (r.kind === 'arrow' ? t('cls_comp_arrow') : r.label),
      color: kindColor[r.kind] || '#22C55E',
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
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, title: { display: true, text: title_, color: '#DDE6F3' } }, scales: scales() }
      });
    } catch (err) { console.error('[classifier chart] failed:', canvasId, err); return null; }
  };
  // componentes por turno — multi-linha (só log observado).
  const compLabels = ['arrow', 'spell', 'rune', 'grenade'];
  const compNames = [t('cls_comp_arrow'), 'spell', 'rune', t('cls_kind_grenade')];
  const compColors = ['#F59E0B', '#22C55E', '#60A5FA', '#F87171'];
  const compCv = $('clsTimelineComponents');
  if (compCv) {
    try {
      clsTimelineComponentsChart = new Chart(compCv, {
        type: 'line',
        data: { labels, datasets: compLabels.map((key, idx) => ({
          label: compNames[idx],
          data: series.map(p => (p.components && p.components[key]) || 0),
          borderColor: compColors[idx], backgroundColor: compColors[idx],
          borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false
        })) },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#8BA4C2', font: { size: 11 } } }, title: { display: true, text: t('val_timeline_components'), color: '#DDE6F3' } }, scales: scales() }
      });
    } catch (err) { console.error('[classifier chart] failed: clsTimelineComponents', err); }
  }
  clsTimelineHitsChart = lineChart('clsTimelineHits', series.map(p => p.mobsHit), t('val_timeline_hits'), '#3B82F6');
  clsTimelineDamageChart = lineChart('clsTimelineDamage', series.map(p => p.damage), t('val_timeline_damage'), '#F59E0B');
  clsImpactChart = lineChart('clsImpactAnalyser', movingImpact(series), t('val_impact_analyser'), '#3B82F6');
  for (const d of (compDefs || [])) {
    renderSmallComponentHistogram(d.canvas, c => { clsRowHistCharts.push(c); }, d.vals, null, d.label, undefined, d.color);
  }
}

// re-renderiza ao trocar de idioma se já houver resultado
let lastClsResult = null;
function onLangChange() { if (lastClsResult) renderClassifier(lastClsResult); }

// ---- wiring ----
$('btnClsServerFile').addEventListener('click', () => $('clsServerFileInput').click());
$('btnClsLocalFile').addEventListener('click', () => $('clsLocalFileInput').click());
$('clsServerFileInput').addEventListener('change', () => clsLoadFile('clsServerFileInput', 'clsServerInput'));
$('clsLocalFileInput').addEventListener('change', () => clsLoadFile('clsLocalFileInput', 'clsLocalInput'));
$('btnClassify').addEventListener('click', () => {
  const sv = $('clsServerInput').value.trim();
  const lc = $('clsLocalInput').value.trim();
  if (!sv || !lc) { $('clsStatus').textContent = t('cls_status_need_both'); return; }
  $('clsStatus').textContent = t('cls_status_running');
  try {
    const res = classifyWithLocalChat(sv, lc);
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
