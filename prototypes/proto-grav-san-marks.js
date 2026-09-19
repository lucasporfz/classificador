// PROTÓTIPO DESCARTÁVEL — marcas de grav san nos gráficos de turno e no detalhe do turno.
// "Três variantes de marcação de grav san, trocáveis por ?variant=, na página real do
// classificador." Nada daqui entra em js/ sem uma change própria.
//
// Fonte do dado (já publicada pelo motor, nada é recalculado): cada linha de
// res.turnTrace[i].lines carrega `gravSanActive` (true = o bloco foi inferido COM o bônus)
// e `gravSanTested` (o bloco caiu numa janela de utevo grav san e a hipótese foi testada).
// O bônus é res.gravSanBonus. "Dano sem bônus" = dmg / (1 + bônus), só para exibição.
(function () {
  const GS = '#E879F9';
  const GS_SOFT = 'rgba(232,121,249,.16)';
  const GS_MID = 'rgba(232,121,249,.60)';

  const VARIANTS = [
    { key: 'A', name: 'Faixa de janela + losango' },
    { key: 'B', name: 'Trilha por componente + área' },
    { key: 'C', name: 'Marca-texto na série + resumo' },
    { key: 'D', name: 'Faixa de janela, só linha lateral' },
  ];
  const params = new URLSearchParams(location.search);
  let variant = (params.get('variant') || 'A').toUpperCase();
  if (!VARIANTS.some(v => v.key === variant)) variant = 'A';

  const pct = b => (b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
  const fmt = n => Math.round(n).toLocaleString('pt-BR');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- modelo: grav san por turno, por componente ----------
  function gsTurn(turn) {
    const comps = new Map();
    for (const l of (turn && turn.lines) || []) {
      if (l.component === 'unresolved') continue;
      if (!comps.has(l.componentIdx)) {
        comps.set(l.componentIdx, {
          idx: l.componentIdx, kind: l.component, actionLabel: l.actionLabel,
          label: clsDetailComponentLabel(l, turn),
          active: l.gravSanActive === true, tested: !!l.gravSanTested,
          hits: 0, dmg: 0,
        });
      }
      const c = comps.get(l.componentIdx);
      c.hits++; c.dmg += +l.dmg || 0;
    }
    const arr = [...comps.values()];
    return {
      comps: arr,
      anyActive: arr.some(c => c.active),
      anyTested: arr.some(c => c.tested),
      hitsActive: arr.filter(c => c.active).reduce((s, c) => s + c.hits, 0),
      dmgActive: arr.filter(c => c.active).reduce((s, c) => s + c.dmg, 0),
    };
  }
  const rowMatches = (row, c) => row.kind === c.kind && (row.kind === 'arrow' ||
    String(row.label) === String(c.actionLabel || c.kind) ||
    String(row.label).indexOf(String(c.actionLabel) + ' ') === 0);
  const rowState = (row, info) => {
    const c = info.comps.find(x => rowMatches(row, x));
    return !c ? null : c.active ? 'on' : c.tested ? 'off' : 'fired';
  };

  // ---------- plugin de desenho ----------
  let hatch = null;
  function hatchPattern(ctx) {
    if (hatch) return hatch;
    const c = document.createElement('canvas'); c.width = c.height = 6;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(232,121,249,.30)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(6, 0); g.stroke();
    hatch = ctx.createPattern(c, 'repeat');
    return hatch;
  }
  const visibleRange = (chart, n) => {
    const xs = chart.scales.x;
    return [Math.max(0, Math.floor(xs.min || 0)), Math.min(n - 1, Math.ceil(xs.max == null ? n - 1 : xs.max))];
  };
  const colW = chart => {
    const xs = chart.scales.x;
    const a = xs.getPixelForValue(0), b = xs.getPixelForValue(1);
    return Math.max(1, Math.abs(b - a));
  };
  function diamond(ctx, x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke();
  }

  const LANE_H = 9, LANE_GAP = 3;

  const plugin = {
    id: 'protoGravSan',
    beforeDatasetsDraw(chart) {
      const g = chart.$gs; if (!g) return;
      const { info } = g, area = chart.chartArea, ctx = chart.ctx, xs = chart.scales.x;
      const [from, to] = visibleRange(chart, info.length);
      const w = colW(chart);
      ctx.save();
      if (g.variant === 'A' || g.variant === 'D') {
        for (let i = from; i <= to; i++) {
          const x = xs.getPixelForValue(i) - w / 2;
          if (info[i].anyActive) { ctx.fillStyle = GS_SOFT; ctx.fillRect(x, area.top, w, area.bottom - area.top); }
          else if (info[i].anyTested) { ctx.fillStyle = hatchPattern(ctx); ctx.fillRect(x, area.top, w, area.bottom - area.top); }
        }
      }
      if (g.variant === 'C' && g.role === 'components') {
        // marca-texto: traço largo translúcido sob os trechos da série com bônus
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        chart.data.datasets.forEach((ds, di) => {
          const row = g.rows[di]; if (!row) return;
          const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
          const on = i => rowState(row, info[i]) === 'on';
          ctx.strokeStyle = GS_MID; ctx.fillStyle = GS_MID; ctx.lineWidth = 11;
          for (let i = from; i <= to; i++) {
            if (!on(i)) continue;
            const p = meta.data[i]; if (!p) continue;
            const prevOn = i > from && on(i - 1), nextOn = i < to && on(i + 1);
            if (!prevOn && !nextOn) { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill(); continue; }
            if (nextOn) { const q = meta.data[i + 1]; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
          }
        });
      }
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const g = chart.$gs; if (!g) return;
      const { info } = g, area = chart.chartArea, ctx = chart.ctx, xs = chart.scales.x;
      const [from, to] = visibleRange(chart, info.length);
      ctx.save();
      if (g.variant === 'A' && g.role === 'components') {
        chart.data.datasets.forEach((ds, di) => {
          const row = g.rows[di]; if (!row) return;
          const meta = chart.getDatasetMeta(di); if (meta.hidden) return;
          for (let i = from; i <= to; i++) {
            const st = rowState(row, info[i]);
            const p = meta.data[i]; if (!p || !(ds.data[i] > 0)) continue;
            if (st === 'on') diamond(ctx, p.x, p.y, 5, GS, ds.borderColor);
            else if (st === 'off') diamond(ctx, p.x, p.y, 4, 'rgba(8,15,29,.9)', GS);
          }
        });
      }
      if (g.variant === 'B' && g.lanes) {
        // trilhas abaixo do título do eixo X: uma por componente que já caiu em janela
        const w = colW(chart);
        const top0 = chart.height - g.lanes.length * (LANE_H + LANE_GAP) - 2;
        ctx.font = '10px Inter, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
        g.lanes.forEach((lane, li) => {
          const y = top0 + li * (LANE_H + LANE_GAP);
          ctx.fillStyle = 'rgba(139,164,194,.07)';
          ctx.fillRect(area.left, y, area.right - area.left, LANE_H);
          ctx.fillStyle = lane.color;
          ctx.fillText(lane.short, area.left - 6, y + LANE_H / 2);
          for (let i = from; i <= to; i++) {
            const st = lane.state(i); if (!st) continue;
            const x = xs.getPixelForValue(i) - w / 2, cw = Math.max(1, w - (w > 4 ? 1 : 0));
            if (st === 'on') { ctx.fillStyle = GS; ctx.fillRect(x, y, cw, LANE_H); }
            else if (st === 'off') { ctx.strokeStyle = GS; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, Math.max(1, cw - 1), LANE_H - 1); }
            else { ctx.fillStyle = lane.color; ctx.globalAlpha = .35; ctx.fillRect(x, y + LANE_H / 2 - 1, cw, 2); ctx.globalAlpha = 1; }
          }
        });
      }
      ctx.restore();
    },
  };
  Chart.register(plugin);

  // ---------- decoração dos gráficos ----------
  function legendHtml(res) {
    const b = pct(res.gravSanBonus || 0);
    const parts = {
      A: '<span><span class="gs-sw fill"></span>turno com componente inferido <b>com grav san (+' + b + ')</b></span>' +
         '<span><span class="gs-sw hatch"></span>janela de grav san, <b>sem</b> bônus inferido</span>' +
         '<span><span class="gs-sw dia"></span>ponto do componente com bônus (componentes por turno)</span>',
      D: '<span><span class="gs-sw fill"></span>turno com componente inferido <b>com grav san (+' + b + ')</b></span>' +
         '<span><span class="gs-sw hatch"></span>janela de grav san, <b>sem</b> bônus inferido</span>',
      B: '<span><span class="gs-sw fill"></span>área: hits/dano dos componentes <b>com grav san (+' + b + ')</b></span>' +
         '<span>trilhas: <span class="gs-sw line" style="width:14px;height:8px"></span>com bônus · ' +
         '<span class="gs-sw" style="border:1px solid #E879F9;height:8px"></span>janela sem bônus · ' +
         '<span class="gs-sw" style="background:#8BA4C2;opacity:.4;height:2px"></span>disparou fora de janela</span>',
      C: '<span><span class="gs-sw glow"></span>trecho da série <b>com grav san (+' + b + ')</b></span>' +
         '<span><span class="gs-sw line"></span>turno com algum componente com bônus (hits/dano/impact)</span>' +
         '<span>passe o mouse: o tooltip diz quais componentes tiveram o bônus</span>',
    };
    return '<b style="color:#E879F9">grav san</b>' + parts[variant];
  }

  function decorateCharts(res) {
    const trace = res.turnTrace || [];
    const info = trace.map(gsTurn);
    const hasAny = info.some(x => x.anyTested);
    // legenda
    const compCv = document.getElementById('clsTimelineComponents');
    document.querySelectorAll('.gs-legend').forEach(e => e.remove());
    if (compCv && hasAny) {
      const lg = document.createElement('div');
      lg.className = 'gs-legend';
      lg.innerHTML = legendHtml(res);
      compCv.parentNode.parentNode.insertBefore(lg, compCv.parentNode);
    }
    if (!hasAny) return;

    const ranked = clsRowsByDamage(res);
    const compRows = ranked.rows.filter(r => Array.isArray(r.hitsTimeline) && r.hitsTimeline.some(v => v > 0));

    const setup = (chart, role) => {
      if (!chart) return;
      chart.$gs = { variant, role, info, rows: role === 'components' ? compRows : [] };
    };
    setup(clsTimelineComponentsChart, 'components');
    setup(clsTimelineHitsChart, 'hits');
    setup(clsTimelineDamageChart, 'damage');
    setup(clsImpactChart, 'impact');

    if (variant === 'B') {
      const lanesFor = rows => rows
        .filter(r => info.some(x => { const s = rowState(r, x); return s === 'on' || s === 'off'; }))
        .map(r => ({
          color: ranked.colorOf(r),
          short: (r.kind === 'arrow' ? 'AA' : String(clsRowLabel(r)).replace(/\s*\(.*$/, '')).slice(0, 10),
          state: i => rowState(r, info[i]),
        }));
      const addLanes = (chart, lanes) => {
        if (!chart || !lanes.length) return;
        chart.$gs.lanes = lanes;
        chart.options.layout.padding = { bottom: lanes.length * (LANE_H + LANE_GAP) + 6 };
        chart.canvas.parentNode.style.height = (240 + lanes.length * (LANE_H + LANE_GAP) + 6) + 'px';
        chart.resize();
      };
      addLanes(clsTimelineComponentsChart, lanesFor(compRows));
      addLanes(clsImpactChart, [{ color: GS, short: 'grav san', state: i => info[i].anyActive ? 'on' : info[i].anyTested ? 'off' : null }]);
      const addArea = (chart, data, label) => {
        if (!chart) return;
        chart.data.datasets.push({ label, data, borderColor: GS, backgroundColor: 'rgba(232,121,249,.28)',
          borderWidth: 1, pointRadius: 0, pointHoverRadius: 3, fill: 'origin', stepped: 'middle' });
        chart.update('none');
      };
      addArea(clsTimelineHitsChart, info.map(x => x.hitsActive), 'dos quais com grav san');
      addArea(clsTimelineDamageChart, info.map(x => x.dmgActive), 'dos quais com grav san');
    }

    if (variant === 'C') {
      for (const chart of [clsTimelineHitsChart, clsTimelineDamageChart, clsImpactChart]) {
        if (!chart) continue;
        const base = chart.data.datasets[0].borderColor;
        chart.data.datasets[0].segment = {
          borderColor: c => info[c.p1DataIndex] && info[c.p1DataIndex].anyActive ? GS : base,
          borderWidth: c => info[c.p1DataIndex] && info[c.p1DataIndex].anyActive ? 2.5 : 1.5,
        };
        chart.update('none');
      }
      for (const chart of [clsTimelineComponentsChart, clsTimelineHitsChart, clsTimelineDamageChart, clsImpactChart]) {
        if (!chart) continue;
        const orig = chart.options.plugins.tooltip.external;
        chart.options.plugins.tooltip.external = ctx => {
          orig(ctx);
          const tip = chart.$clsTip, tt = ctx.tooltip;
          if (!tip || tt.opacity === 0 || !tt.dataPoints || !tt.dataPoints.length) return;
          const x = info[tt.dataPoints[0].dataIndex];
          if (!x || !x.anyTested) return;
          const html = x.comps.filter(c => c.tested).map(c =>
            '<div class="cls-chart-tip-row"><span class="cls-chart-tip-sw" style="background:' + (c.active ? GS : 'transparent') +
            ';border:1px ' + (c.active ? 'solid' : 'dashed') + ' ' + GS + '"></span><span class="cls-chart-tip-name">' +
            esc(c.kind === 'arrow' ? 'AA' : c.label) + '</span><span class="cls-chart-tip-val" style="color:' + GS + '">' +
            (c.active ? '+' + pct(res.gravSanBonus || 0) : 'sem bônus') + '</span></div>').join('');
          tip.insertAdjacentHTML('beforeend', '<div style="border-top:1px solid rgba(232,121,249,.4);margin-top:4px;padding-top:4px">' +
            '<div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:' + GS + '">grav san</div>' + html + '</div>');
        };
      }
    }
    for (const c of [clsTimelineComponentsChart, clsTimelineHitsChart, clsTimelineDamageChart, clsImpactChart]) if (c) c.draw();
  }

  const origCharts = renderClassifierCharts;
  renderClassifierCharts = function (res, compDefs) {
    origCharts(res, compDefs);
    try { decorateCharts(res); } catch (e) { console.error('[proto grav san] charts', e); }
  };

  // ---------- decoração do detalhe do turno ----------
  let lastDetail = null;
  function decorateDetail(turn, res) {
    const panel = document.getElementById('clsTurnDetail');
    const table = panel && panel.querySelector('.cls-turn-detail-table');
    if (!table || !turn) return;
    const bonus = +res.gravSanBonus || 0;
    const info = gsTurn(turn);
    const lines = turn.lines || [];
    const trs = [...table.tBodies[0].rows];
    const compOf = l => info.comps.find(c => c.idx === l.componentIdx) || { active: false, tested: false };
    const pill = c => c.active ? '<span class="gs-pill on">▲ grav san +' + pct(bonus) + '</span>'
      : c.tested ? '<span class="gs-pill off">janela · sem bônus</span>' : '<span class="gs-pill none">—</span>';

    if (variant === 'A' || variant === 'D') {
      // D = A sem a coluna "Grav san": fica só a linha lateral e o resumo do cabeçalho
      const ths = table.tHead.rows[0].cells;
      if (variant === 'A') ths[4].insertAdjacentHTML('afterend', '<th>Grav san</th>');
      trs.forEach((tr, i) => {
        const c = compOf(lines[i] || {});
        if (variant === 'A') tr.cells[4].insertAdjacentHTML('afterend', '<td>' + pill(c) + '</td>');
        if (c.active) tr.classList.add('gsA-on'); else if (c.tested) tr.classList.add('gsA-off');
      });
      const meta = panel.querySelector('.cls-turn-detail-meta');
      if (meta && info.anyTested) meta.insertAdjacentHTML('beforeend', ' &nbsp;·&nbsp; ' +
        (info.anyActive ? '<span class="gs-pill on">grav san em ' + info.comps.filter(c => c.active).length + '/' + info.comps.length + ' componentes</span>'
          : '<span class="gs-pill off">janela de grav san, nenhum com bônus</span>'));
    }

    if (variant === 'B') {
      const tbody = table.tBodies[0];
      const cols = table.tHead.rows[0].cells.length;
      const frag = document.createDocumentFragment();
      for (const c of info.comps) {
        const noBonus = c.dmg / (1 + bonus);
        const g = document.createElement('tr');
        g.className = 'gsB-group' + (c.active ? ' on' : c.tested ? ' off' : '');
        g.innerHTML = '<td colspan="' + cols + '">' +
          '<span class="gsB-gname">' + esc(c.label) + '</span>' +
          '<span class="gsB-gmeta">' + c.hits + ' hits · dano ' + fmt(c.dmg) + '</span>' +
          '<span class="gsB-gright">' +
            (c.active ? '<span class="gsB-nobonus">sem o bônus ≈ ' + fmt(noBonus) + ' (−' + fmt(c.dmg - noBonus) + ')</span>' : '') +
            pill(c) +
          '</span></td>';
        frag.appendChild(g);
        trs.forEach((tr, i) => { if (lines[i] && lines[i].componentIdx === c.idx) { tr.classList.add('gsB-hit'); frag.appendChild(tr); } });
      }
      trs.forEach((tr, i) => { if (!tr.classList.contains('gsB-hit')) frag.appendChild(tr); }); // não resolvidos
      tbody.appendChild(frag);
    }

    if (variant === 'C') {
      const tested = info.comps;
      const bonusDmg = info.dmgActive - info.dmgActive / (1 + bonus);
      const card = document.createElement('div');
      card.className = 'gsC-card';
      card.innerHTML = '<span class="t">grav san:</span>' + tested.map(c =>
        '<span class="gsC-chip ' + (c.active ? 'on' : c.tested ? 'off' : '') + '">' +
          '<span class="d" style="background:' + (c.active ? GS : c.tested ? 'transparent' : '#415E7A') + ';border:1px solid ' + (c.tested ? GS : '#415E7A') + '"></span>' +
          esc(c.kind === 'arrow' ? 'auto ataque' : c.label) +
          (c.active ? ' <b>+' + pct(bonus) + '</b>' : c.tested ? ' <span>sem bônus</span>' : ' <span style="color:var(--text-dim)">fora da janela</span>') +
        '</span>').join('') +
        (info.anyActive ? '<span class="t" style="margin-left:auto">dano atribuível ao tapete ≈ <b style="color:' + GS + '">' + fmt(bonusDmg) + '</b></span>' : '');
      table.parentNode.insertBefore(card, table);
      trs.forEach((tr, i) => {
        const c = compOf(lines[i] || {});
        if (!c.active) return;
        tr.classList.add('gsC-on');
        const d = +lines[i].dmg || 0;
        tr.cells[1].insertAdjacentHTML('beforeend', '<span class="gsC-sub">sem gs ≈ ' + fmt(d / (1 + bonus)) + '</span>');
      });
    }
  }

  const origDetail = renderTurnDetail;
  renderTurnDetail = function (turns, res, selectedIndex) {
    origDetail(turns, res, selectedIndex);
    lastDetail = { turns, res, selectedIndex };
    const list = Array.isArray(turns) ? turns.filter(Boolean) : [];
    const idx = Math.max(0, Math.min(Number.isFinite(selectedIndex) ? selectedIndex : 0, Math.max(0, list.length - 1)));
    try { decorateDetail(list[idx], res); } catch (e) { console.error('[proto grav san] detail', e); }
  };

  // ---------- barra de variantes ----------
  function syncBar() {
    const v = VARIANTS.find(x => x.key === variant);
    document.getElementById('protoLabel').textContent = v.key + ' — ' + v.name;
  }
  function setVariant(k) {
    variant = k;
    const p = new URLSearchParams(location.search); p.set('variant', k);
    history.replaceState(null, '', location.pathname + '?' + p.toString());
    syncBar();
    if (lastClsResult) {
      const detailOpen = !!document.getElementById('clsTurnDetail');
      renderClassifier(lastClsResult);
      if (detailOpen && lastDetail) renderTurnDetail(lastDetail.turns, lastDetail.res, lastDetail.selectedIndex);
    }
  }
  const step = d => {
    const i = VARIANTS.findIndex(x => x.key === variant);
    setVariant(VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length].key);
  };
  document.getElementById('protoPrev').addEventListener('click', () => step(-1));
  document.getElementById('protoNext').addEventListener('click', () => step(1));
  document.addEventListener('keydown', e => {
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
  syncBar();

  // ---------- atalho: ?sv=&lc=[&pair=N] carrega ../logs e classifica ----------
  const sv = params.get('sv'), lc = params.get('lc');
  if (sv && lc) {
    document.getElementById('clsStatus').textContent = 'protótipo: carregando logs…';
    Promise.all([sv, lc].map(f => fetch('../logs/' + encodeURIComponent(f)).then(r => r.text())))
      .then(([svText, lcText]) => {
        clsServerSessions = clsSplitSessions(svText);
        clsLocalSessions = clsSplitSessions(lcText);
        clsUpdatePairPicker();
        const sel = document.getElementById('clsPairSelect');
        const pair = +params.get('pair');
        if (sel._pairs && sel._pairs.length > 1 && pair > 0 && pair < sel._pairs.length) {
          [...sel.options].forEach((o, i) => { o.selected = i === pair; });
          clsApplySelectedPairs(sel, sel._pairs);
        }
        setTimeout(() => document.getElementById('btnClassify').click(), 30);
      })
      .catch(e => { document.getElementById('clsStatus').textContent = 'protótipo: falha ao carregar logs — ' + e.message; });
  }
})();
