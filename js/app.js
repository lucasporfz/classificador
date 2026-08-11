// Glue da UI do Classificador (página standalone). Reusa classifyWithLocalChat
// (js/unified-main.js) e os helpers de gráfico. Sem simulação — só leitura dos dois logs.
const $ = id => document.getElementById(id);

let clsTimelineComponentsChart = null;
let clsTimelineHitsChart = null;
let clsTimelineDamageChart = null;
let clsImpactChart = null;
let clsRowHistCharts = [];
let clsServerSessions = null;
let clsLocalSessions  = null;
let clsTurnDetailPosition = null;
let clsComponentChartMetric = 'hits';
let clsRotationDamageMetric = 'hit';
let clsGravSanDamageMetric = 'hit';

function clsClampTurnDetailPosition(panel, left, top) {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop)
  };
}

function clsApplyTurnDetailPosition(panel) {
  if (!clsTurnDetailPosition) return;
  const pos = clsClampTurnDetailPosition(panel, clsTurnDetailPosition.left, clsTurnDetailPosition.top);
  clsTurnDetailPosition = pos;
  panel.style.left = pos.left + 'px';
  panel.style.top = pos.top + 'px';
  panel.style.transform = 'none';
}

function clsEnableTurnDetailDrag(panel) {
  const head = panel.querySelector('.cls-turn-detail-head');
  if (!head) return;
  head.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    if (ev.target.closest('button, a, input, select, textarea, .cls-turn-detail-nav')) return;
    const rect = panel.getBoundingClientRect();
    const startX = ev.clientX;
    const startY = ev.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    panel.classList.add('is-dragging');
    panel.style.transform = 'none';
    panel.style.left = startLeft + 'px';
    panel.style.top = startTop + 'px';
    ev.preventDefault();

    const move = moveEv => {
      const pos = clsClampTurnDetailPosition(
        panel,
        startLeft + moveEv.clientX - startX,
        startTop + moveEv.clientY - startY
      );
      clsTurnDetailPosition = pos;
      panel.style.left = pos.left + 'px';
      panel.style.top = pos.top + 'px';
    };
    const up = () => {
      panel.classList.remove('is-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

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

function clsApplySelectedPairs(sel, pairs) {
  const selected = [...sel.selectedOptions].map(o => pairs[+o.value]);
  if (!selected.length) return;
  $('clsServerInput').value = selected.map(p => p.sv.text).join('\n');
  $('clsLocalInput').value  = selected.map(p => p.lc.text).join('\n');
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
  if (pairs.length === 1) {
    $('clsServerInput').value = pairs[0].sv.text;
    $('clsLocalInput').value  = pairs[0].lc.text;
    sel.style.display = 'none';
    return;
  }
  sel.innerHTML = pairs.map((p, i) => `<option value="${i}">${p.label}</option>`).join('');
  sel.size = Math.min(pairs.length, 6);
  sel.options[0].selected = true;
  clsApplySelectedPairs(sel, pairs);
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
  if (String(comp || '').indexOf('unresolved_component_') === 0 || (hit && hit.component === 'unresolved')) {
    const id = String(comp || 'unresolved_component_1').replace(/^unresolved_component_/, '') || '1';
    const rawReason = (hit && (hit.reason || hit.experimentalReason)) || (turn && turn.unifiedReason) || 'missing_mechanical_resolution';
    const reason = /^(mechanical_|missing_)/.test(String(rawReason)) ? rawReason : 'missing_mechanical_resolution:' + rawReason;
    return 'Componente não resolvido ' + id + ' (' + reason + ')';
  }
  if (comp === 'arrow') return 'auto ataque';
  if (comp === 'spell') return turn && turn.spell ? clsSpellNameSafe(turn.spell) : 'spell';
  if (comp === 'rune') return turn && turn.rune ? turn.rune : 'rune';
  if (comp === 'grenade') return turn && turn.gren ? clsSpellNameSafe(turn.gren) : 'grenade';
  return comp || '';
}

function clsDetailCritLabel(hit) {
  if (!hit) return '-';
  if (hit.onslaught) return (hit.realCrit || hit.lowBlow) ? (hit.savageBlow ? 'Crítico savage blow e Onslaught' : 'Crítico e Onslaught') : 'Onslaught';
  if (hit.type === 'crit' || hit.realCrit || hit.lowBlow) {
    if (hit.lowBlow) return 'crítico low blow';
    if (hit.savageBlow) return 'crítico savage blow';
    return 'crítico';
  }
  return '-';
}

function clsRowLabel(row) {
  return row && row.kind === 'arrow' ? t('cls_comp_arrow') : (row && row.label) || '';
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
          '<th>Timestamp</th><th>Dano</th><th>Tipo/Componente</th><th>Crítico/Onslaught</th><th>EW</th><th>Overkill</th><th>Mob alvo</th>' +
        '</tr></thead><tbody>' +
          hits.map(h =>
            '<tr>' +
              '<td>' + clsEscapeHtml(clsFmtTurnTs(h.ts)) + '</td>' +
              '<td style="text-align:right">' + clsEscapeHtml(h.dmg) + '</td>' +
              '<td>' + clsEscapeHtml(clsDetailComponentLabel(h, turn)) + '</td>' +
              '<td>' + clsEscapeHtml(clsDetailCritLabel(h)) + '</td>' +
              '<td>' + (h.exposeWeakness ? 'sim' : '-') + '</td>' +
              '<td>' + (h.ok ? 'sim' : '-') + '</td>' +
              '<td>' + clsEscapeHtml(h.mob || '') + '</td>' +
            '</tr>'
          ).join('') +
        '</tbody></table>' +
      '</div>';
  }

  document.body.appendChild(panel);
  clsApplyTurnDetailPosition(panel);
  clsEnableTurnDetailDrag(panel);
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

// Hits médios ajustados pelo ganho de `utevo grav san` que a sessão de fato colheu.
// Derivação PURA sobre saídas já publicadas pelo motor (`rows`, `gravSanRows`,
// `gravSanComponentsUsed`, `gravSanBonus`) — não relê hits nem reclassifica nada, e a
// `res.rows` primária não é modificada.
//
//   share_c     = hits do componente sob tapete / hits totais do MESMO componente
//                 = (carpet.hitsMean * carpet.turns) / (row.hitsMean * row.turns)
//                 (0 quando o componente nunca apareceu num turno de tapete)
//   ajustado_c  = hits méd_c * (1 + bônus * share_c)
//
// O PESO É POR COMPONENTE, NÃO GLOBAL. A versão anterior multiplicava por um `uptime` da
// sessão inteira (aproveitados / soma dos turnos de TODAS as rows), idêntico em toda linha:
// um componente que caiu sob tapete uma única vez recebia o mesmo fator de um que esteve
// sob tapete a hunt inteira. `share_c` decompõe esse uptime — ele vale exatamente
// `uptime_c * razao_c`, onde `uptime_c = carpet.turns / row.turns` é a frequência que
// faltava e `razao_c = carpet.hitsMean / row.hitsMean` é a intensidade que já existia.
// Medido no log `barrage`: a Divine Grenade tem 7 dos 9 turnos sob tapete (77,8%, 5,1x o
// uptime global de 15,2%) e recebia o MENOR ganho da tabela (+1,8%) porque sua razão é
// levemente abaixo de 1; com o share recebe o maior (+9,2%). Os ganhos das 4 linhas saíam
// todos entre +1,8% e +2,4% enquanto a exposição real ia de 9,3% a 77,8% — era o uptime
// global comprimindo tudo. Ver `prototypes/grav-san-share-hits.prototype.html`.
//
// Contar HITS (e não turnos) trata certo o turno em que só parte dos hits caiu sob tapete:
// 3 de 10 hits dão 30%, enquanto uma frequência por turnos daria 1/1 = 100%.
//
// `uptime`/`uptimeNumerator`/`uptimeDenominator` saem da fórmula mas continuam sendo
// computados e retornados: a seção do grav san segue exibindo o uptime global, que
// permanece honesto por ser a média dos `uptime_c` ponderada por turnos. A coluna continua
// reconstruível a partir da tela — `turnos` e `hits méd` estão nas DUAS tabelas e o bônus
// na linha de parâmetro.
// Identidade da linha para casar rotação x grav san. NÃO usar `row.key`: o builder
// (`buildRotationRows` em unified-main.js) faz `delete row.key` antes de publicar, então
// `row.key` é undefined em TODAS as linhas — casar por ele colapsa a rotação inteira num
// bucket só e emparelha a última linha com a primeira do grav san. `kind` + `label`
// reproduz exatamente o `rowKeyFor` do builder (arrow tem label fixo 'Auto ataque'), e as
// duas tabelas saem do mesmo builder, então a identidade é a mesma dos dois lados.
function clsGravSanRowIdentity(row) {
  return String(row && row.kind) + '|' + String(row && row.label);
}

function clsGravSanAdjustedHits(res) {
  const rows = (res && res.rows) || [];
  const gravSanRows = (res && res.gravSanRows) || [];
  const carpetBonus = +(res && res.gravSanBonus) || 0;
  const componentCount = +(res && res.gravSanComponentCount) || 0;

  const uptimeDenominator = rows.reduce((sum, r) => sum + (+r.turns || 0), 0);
  const uptimeNumerator = +(res && res.gravSanComponentsUsed) || 0;
  const uptime = uptimeDenominator > 0 ? uptimeNumerator / uptimeDenominator : 0;

  const carpetByIdentity = new Map();
  gravSanRows.forEach(g => carpetByIdentity.set(clsGravSanRowIdentity(g), g));

  const adjustedByKey = {};
  rows.forEach(r => {
    const hitsMean = +r.hitsMean || 0;
    const totalHits = hitsMean * (+r.turns || 0);
    const carpet = carpetByIdentity.get(clsGravSanRowIdentity(r));
    const carpetHits = carpet ? (+carpet.hitsMean || 0) * (+carpet.turns || 0) : null;
    // sem turno de tapete => share 0 => a coluna repete o hits méd (decisão do autor)
    const share = (carpetHits != null && totalHits > 0) ? carpetHits / totalHits : 0;
    adjustedByKey[clsGravSanRowIdentity(r)] = hitsMean * (1 + carpetBonus * share);
  });

  return {
    uptime,
    uptimeNumerator,
    uptimeDenominator,
    carpetBonus,
    // sem tapete confirmado ou sem bônus, a coluna seria cópia idêntica de "hits méd"
    showColumn: componentCount > 0 && carpetBonus > 0,
    adjustedByKey,
  };
}

function renderClassifier(res) {
  const box = $('clsResults');
  if (!res || res.error) {
    box.style.display = 'block';
    box.innerHTML = '<p style="color:var(--red)">' + t('cls_no_turns') + '</p>';
    return;
  }
  const f2 = x => x.toFixed(2);
  const f1 = x => x.toFixed(1);
  const tierLabel = (tier, mult, frac) => {
    if (tier.kind === 'tier_primary') return t('cls_tier_death_echo_primary');
    if (tier.kind === 'tier_echo') {
      // M-016e: Spiritual Outburst's delayed stage resolves to one of three candidate
      // power tiers; Death Echo's echo never carries a resolved stage, so it keeps the
      // plain label.
      return tier.stage != null
        ? t('cls_tier_death_echo_echo') + ' (' + t('cls_tier_stage_' + tier.stage) + ')'
        : t('cls_tier_death_echo_echo');
    }
    // M-035: beam central/side. O lateral mostra a fração F resolvida (fixa por log).
    if (tier.kind === 'tier_central') return t('cls_tier_beam_central');
    if (tier.kind === 'tier_side') return t('cls_tier_beam_side') + (frac ? ' (×' + f2(frac) + ')' : '');
    return tier.kind === 'tier_bonus'
      ? t('cls_tier_bonus') + (mult ? ' (×' + f2(mult) + ')' : '')
      : t('cls_tier_base');
  };
  const rowDmgFor = metric => (row, field) => {
    const cap = field === 'base' ? 'Base' : 'Eff';
    if (metric === 'turn') {
      const perTurn = row['dmg' + cap + 'PerTurn'];
      if (Number.isFinite(+perTurn)) return Math.round(+perTurn);
      return field === 'base' ? row.dmgBase : row.dmgEff;
    }
    const perHit = row['dmg' + cap + 'PerHit'];
    if (Number.isFinite(+perHit)) return Math.round(+perHit);
    const value = field === 'base' ? row.dmgBase : row.dmgEff;
    return row.hitsMean > 0 ? Math.round(value / row.hitsMean) : 0;
  };
  const rowDmg = rowDmgFor(clsRotationDamageMetric);
  const gravSanRowDmg = rowDmgFor(clsGravSanDamageMetric);
  const dmgModeSuffix = clsRotationDamageMetric === 'turn' ? t('cls_metric_turn_suffix') : t('cls_metric_hit_suffix');
  const gravSanDmgModeSuffix = clsGravSanDamageMetric === 'turn' ? t('cls_metric_turn_suffix') : t('cls_metric_hit_suffix');
  const gravSanAdjusted = clsGravSanAdjustedHits(res);
  const showAdjustedHits = gravSanAdjusted.showColumn;
  const rowsHtml = res.rows.map(r => {
    const adjustedCell = !showAdjustedHits ? '' :
      '<td style="text-align:right">' + f2(gravSanAdjusted.adjustedByKey[clsGravSanRowIdentity(r)] || 0) + '</td>';
    const main = '<tr><td>' + (r.kind === 'arrow' ? t('cls_comp_arrow') : r.label) + '</td><td style="text-align:right">' + r.turns +
      '</td><td style="text-align:right">' + f2(r.hitsMean) + '</td>' + adjustedCell + '<td style="text-align:right">' + rowDmg(r, 'base') +
      '</td><td style="text-align:right">' + rowDmg(r, 'eff') + '</td></tr>';
    if (!r.tiers || !r.tiers.length) return main;
    const sub = r.tiers.map(tier => {
      // "Dano médio sem crítico" pools non-crit hits across many different casts (Terra
      // Burst's underlying damage roll varies cast to cast), which can misleadingly show the
      // no-bonus tier averaging higher than the bonus tier even when the resolved bonus is
      // real. Suppress it for these two tiers specifically; "Dano médio com crítico" pools
      // raw shown damage (not cast-roll-sensitive in the same way) and already shows the
      // expected order.
      const tierBaseCell = (tier.kind === 'tier_base' || tier.kind === 'tier_bonus' || tier.kind === 'tier_primary' || tier.kind === 'tier_echo' || tier.kind === 'tier_central' || tier.kind === 'tier_side') ? '—' : rowDmg(tier, 'base');
      // A coluna ajustada é por COMPONENTE (a razão vem de `gravSanRows`, que não se
      // subdivide em tiers), então a sub-linha emite uma célula vazia — mas emite, senão
      // o tier desalinha das colunas de dano.
      const tierAdjustedCell = showAdjustedHits ? '<td></td>' : '';
      return '<tr style="color:var(--text-muted);font-size:12px"><td style="padding-left:22px">└ ' + tierLabel(tier, r.bonusMult, r.beamFraction) +
        '</td><td></td><td style="text-align:right">' + f2(tier.hitsMean) + '</td>' + tierAdjustedCell +
        '<td style="text-align:right">' + tierBaseCell + '</td><td style="text-align:right">' + rowDmg(tier, 'eff') + '</td></tr>';
    }).join('');
    return main + sub;
  }).join('');
  const gravSanRowsHtml = (res.gravSanRows || []).map(r =>
    '<tr><td>' + (r.kind === 'arrow' ? t('cls_comp_arrow') : r.label) + '</td><td style="text-align:right">' + r.turns +
      '</td><td style="text-align:right">' + f2(r.hitsMean) + '</td><td style="text-align:right">' + gravSanRowDmg(r, 'base') +
      '</td><td style="text-align:right">' + gravSanRowDmg(r, 'eff') + '</td></tr>'
  ).join('');
  const dmgSummary = res.damageSpells.map(clsSpellNameSafe)
    .concat((res.grenadeSpells || []).map(x => clsSpellNameSafe(x) + ' (' + t('cls_kind_grenade') + ')'));
  const aa = res.aaUptime || { expected: 0, hit: 0, lost: 0, pct: 0, perHour: 0 };
  const sr = res.spellRuneUptime || { expected: 0, hit: 0, lost: 0, pct: 0, perHour: 0 };
  const aaMetricHtml =
    '<section class="cls-metrics" aria-label="' + t('cls_h_aa_uptime') + '">' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_aa_lost') + '</div><div class="cls-metric-value">' + aa.lost + '</div></div>' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_aa_hit') + '</div><div class="cls-metric-value">' + aa.hit + ' / ' + aa.expected + '</div></div>' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_aa_pct') + '</div><div class="cls-metric-value">' + f1(aa.pct) + '%</div></div>' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_aa_per_hour') + '</div><div class="cls-metric-value">' + Math.round(aa.perHour) + '</div></div>' +
    '</section>' +
    '<section class="cls-metrics" aria-label="' + t('cls_h_spell_rune_uptime') + '">' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_spell_rune_lost') + '</div><div class="cls-metric-value">' + sr.lost + '</div></div>' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_spell_rune_hit') + '</div><div class="cls-metric-value">' + sr.hit + ' / ' + sr.expected + '</div></div>' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_spell_rune_pct') + '</div><div class="cls-metric-value">' + f1(sr.pct) + '%</div></div>' +
      '<div class="cls-metric"><div class="cls-metric-label">' + t('cls_spell_rune_per_hour') + '</div><div class="cls-metric-value">' + Math.round(sr.perHour) + '</div></div>' +
    '</section>';

  // gráficos do log (só dados observados, sem simulação) — um histograma de hits por
  // LINHA da rotação (cada spell/componente: AA, cada spell nominal, runa, granada).
  // compPalette compartilhado com o gráfico de componentes por turno — índice i = mesma cor.
  const compPalette = ['#F59E0B', '#22C55E', '#60A5FA', '#F87171', '#A78BFA', '#FBBF24', '#34D399', '#F472B6', '#38BDF8', '#FB923C', '#C084FC'];
  const compDefs = (res.rows || [])
    .map((r, rowIndex) => ({ r, rowIndex }))
    .filter(x => Array.isArray(x.r.hitsPerTurn) && x.r.hitsPerTurn.some(v => v > 0))
    .map((r, i) => ({
      canvas: 'clsHist' + i,
      rowIndex: r.rowIndex,
      vals: r.r.hitsPerTurn.filter(v => v > 0),
      label: clsRowLabel(r.r),
      color: compPalette[i % compPalette.length],
    }));
  const hasSeries = (res.temporalSeries || []).length > 0;
  // Larguras travadas: sem isto, trocar Hits<->Turno muda o sufixo do cabeçalho de dano
  // ("/ hit" <-> "/ turno") e a tabela inteira reflui. "componente" fica sem largura e
  // absorve a sobra.
  const rotationColgroup =
    '<colgroup><col><col style="width:70px"><col style="width:80px">' +
      (showAdjustedHits ? '<col style="width:200px">' : '') +
      '<col style="width:185px"><col style="width:195px"></colgroup>';
  const rotationMetricHtml =
    '<div class="cls-component-chart-tools">' +
      '<div class="cls-chart-metric cls-rotation-damage-metric" role="group" aria-label="' + t('cls_rotation_damage_metric') + '">' +
        '<button type="button" data-rotation-damage="hit" class="' + (clsRotationDamageMetric === 'hit' ? 'active' : '') + '">' + t('cls_metric_hits') + '</button>' +
        '<button type="button" data-rotation-damage="turn" class="' + (clsRotationDamageMetric === 'turn' ? 'active' : '') + '">' + t('cls_metric_turn') + '</button>' +
      '</div>' +
    '</div>';
  const gravSanComponentTotal = res.gravSanComponentCount || 0;
  const gravSanComponentUsed = res.gravSanComponentsUsed || 0;
  const gravSanComponentPct = gravSanComponentTotal > 0 ? Math.round((gravSanComponentUsed / gravSanComponentTotal) * 100) : 0;
  // Turnos + hits méd (presentes nas DUAS tabelas) e o bônus tornam a coluna "hits médios
  // ajustados" reconstruível a partir da tela. O uptime global é exibido como métrica da
  // sessão: desde que o peso passou a ser por componente ele não entra mais na coluna, mas
  // segue honesto por ser a média dos uptime por componente ponderada por turnos.
  const gsParam = 'font-size:11.5px;color:var(--text-muted);margin:2px 0';
  const gravSanCastsHtml = gravSanComponentTotal > 0 ?
    '<p style="' + gsParam + '">' +
      t('cls_gravsan_components').replace('{used}', gravSanComponentUsed).replace('{total}', gravSanComponentTotal).replace('{pct}', gravSanComponentPct) +
    '</p>' +
    '<p style="' + gsParam + '">' + t('cls_gravsan_uptime') +
      ' <strong style="color:var(--text)">' + f2(gravSanAdjusted.uptime * 100) + '%</strong> ' +
      '<span style="color:var(--text-dim)">' + t('cls_gravsan_uptime_detail')
        .replace('{num}', gravSanAdjusted.uptimeNumerator)
        .replace('{den}', gravSanAdjusted.uptimeDenominator)
        .replace('{basis}', t('cls_gravsan_uptime_basis_used')) + '</span></p>' +
    '<p style="' + gsParam + ';margin-bottom:8px">' + t('cls_gravsan_bonus') +
      ' <strong style="color:var(--text)">' + f2(gravSanAdjusted.carpetBonus * 100) + '%</strong></p>' : '';
  const gravSanMetricHtml =
    '<div class="cls-component-chart-tools">' +
      '<div class="cls-chart-metric cls-gravsan-damage-metric" role="group" aria-label="' + t('cls_rotation_damage_metric') + '">' +
        '<button type="button" data-gravsan-damage="hit" class="' + (clsGravSanDamageMetric === 'hit' ? 'active' : '') + '">' + t('cls_metric_hits') + '</button>' +
        '<button type="button" data-gravsan-damage="turn" class="' + (clsGravSanDamageMetric === 'turn' ? 'active' : '') + '">' + t('cls_metric_turn') + '</button>' +
      '</div>' +
    '</div>';
  const gravSanTableHtml = gravSanComponentTotal <= 0 ? '' :
    '<h3 class="cls-h">' + t('cls_h_gravsan_rotation') + '</h3>' +
    gravSanCastsHtml +
    (!(res.gravSanRows || []).length ?
      '<p style="font-size:12.5px;color:var(--text-muted)">' + t('cls_gravsan_no_rows') + '</p>' :
      gravSanMetricHtml +
      '<table class="cls-table"><thead><tr><th>' + t('cls_th_comp') + '</th><th style="text-align:right">' + t('cls_th_turns') +
        '</th><th style="text-align:right">' + t('cls_th_hits') + '</th><th style="text-align:right">' + t('cls_th_dmg_base') + gravSanDmgModeSuffix +
        '</th><th style="text-align:right">' + t('cls_th_dmg_eff') + gravSanDmgModeSuffix + '</th></tr></thead><tbody>' + gravSanRowsHtml + '</tbody></table>');
  const metricHtml = !hasSeries || !compDefs.length ? '' :
    '<div class="cls-component-chart-tools">' +
      '<div class="cls-chart-metric" role="group" aria-label="' + t('cls_component_chart_metric') + '">' +
        '<button type="button" data-metric="hits" class="' + (clsComponentChartMetric === 'hits' ? 'active' : '') + '">' + t('cls_metric_hits') + '</button>' +
        '<button type="button" data-metric="damage" class="' + (clsComponentChartMetric === 'damage' ? 'active' : '') + '">' + t('cls_metric_damage') + '</button>' +
      '</div>' +
    '</div>';
  const chartsHtml = !hasSeries ? '' : (
    '<h3 class="cls-h">' + t('cls_h_charts') + '</h3>' +
    (compDefs.length ? '<div class="cls-hist-grid">' +
      compDefs
        .map(d => '<div style="position:relative;height:220px"><canvas id="' + d.canvas + '"></canvas></div>').join('') +
      '</div>' : '') +
    metricHtml +
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
    aaMetricHtml +
    '<h3 class="cls-h">' + t('cls_h_rotation') + '</h3>' +
    rotationMetricHtml +
    '<table class="cls-table cls-rotation-table">' + rotationColgroup +
      '<thead><tr><th>' + t('cls_th_comp') + '</th><th style="text-align:right">' + t('cls_th_turns') +
      '</th><th style="text-align:right">' + t('cls_th_hits') + '</th>' +
      (showAdjustedHits ? '<th style="text-align:right">' + t('cls_th_hits_gravsan_adjusted') + '</th>' : '') +
      '<th style="text-align:right">' + t('cls_th_dmg_base') + dmgModeSuffix +
      '</th><th style="text-align:right">' + t('cls_th_dmg_eff') + dmgModeSuffix + '</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
    '<p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">' +
      t('cls_unmatched').replace('{u}', res.excludedTurns).replace('{n}', res.totalTurns) + '</p>' +
    gravSanTableHtml +
    chartsHtml;
  renderClassifierCharts(res, compDefs);
  document.querySelectorAll('.cls-chart-metric button').forEach(btn => {
    btn.addEventListener('click', function() {
      const metric = this.getAttribute('data-metric');
      if (metric !== 'hits' && metric !== 'damage') return;
      clsComponentChartMetric = metric;
      renderClassifier(res);
    });
  });
  document.querySelectorAll('.cls-rotation-damage-metric button').forEach(btn => {
    btn.addEventListener('click', function() {
      const metric = this.getAttribute('data-rotation-damage');
      if (metric !== 'hit' && metric !== 'turn') return;
      clsRotationDamageMetric = metric;
      renderClassifier(res);
    });
  });
  document.querySelectorAll('.cls-gravsan-damage-metric button').forEach(btn => {
    btn.addEventListener('click', function() {
      const metric = this.getAttribute('data-gravsan-damage');
      if (metric !== 'hit' && metric !== 'turn') return;
      clsGravSanDamageMetric = metric;
      renderClassifier(res);
    });
  });
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
  const scales = yTitle => ({
    x: { grid: { color: gridColor }, ticks: { color: '#8BA4C2', font: { size: 10 }, maxTicksLimit: 12 }, title: { display: true, text: t('val_axis_turn'), color: '#8BA4C2' } },
    y: {
      grid: { color: gridColor },
      ticks: { color: '#8BA4C2', font: { size: 11 } },
      beginAtZero: true,
      title: { display: !!yTitle, text: yTitle || '', color: '#8BA4C2' },
      afterFit: scale => { scale.width = 74; }
    }
  });
  const selectedHits = series.map(p => p.mobsHit);
  const selectedDamage = series.map(p => p.damage);
  const selectedSeries = series.map((p, i) => ({ relTime: p.relTime, damage: selectedDamage[i] || 0 }));
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
  const compRows = (res.rows || []).filter((r, rowIndex) =>
    Array.isArray(r.hitsTimeline) &&
    r.hitsTimeline.some(v => v > 0)
  );
  const componentMetric = clsComponentChartMetric === 'damage' ? 'damage' : 'hits';
  const componentTimeline = row => componentMetric === 'damage' && Array.isArray(row.damageTimeline)
    ? row.damageTimeline
    : row.hitsTimeline;
  const componentTitle = componentMetric === 'damage' ? t('val_timeline_component_damage') : t('val_timeline_components');
  const compCv = $('clsTimelineComponents');
  if (compCv && compRows.length) {
    try {
      clsTimelineComponentsChart = new Chart(compCv, {
        type: 'line',
        data: { labels, datasets: compRows.map((r, idx) => {
          const color = compPalette[idx % compPalette.length];
          return {
            label: clsRowLabel(r),
            data: componentTimeline(r),
            borderColor: color, backgroundColor: color,
            borderWidth: 2, pointRadius: 0, tension: 0.35, fill: false
          };
        }) },
        options: { responsive: true, maintainAspectRatio: false, animation: false, onClick: clsChartClickHandler(res, hit => clsTurnByDataIndex(res, hit.index)), plugins: { legend: { labels: { color: '#8BA4C2', font: { size: 11 } } }, title: { display: true, text: componentTitle, color: '#DDE6F3' } }, scales: scales(componentMetric === 'damage' ? t('cls_metric_damage') : t('cls_metric_hits')) }
      });
    } catch (err) { console.error('[classifier chart] failed: clsTimelineComponents', err); }
  }
  clsTimelineHitsChart = lineChart('clsTimelineHits', selectedHits, t('val_timeline_hits'), '#3B82F6');
  clsTimelineDamageChart = lineChart('clsTimelineDamage', selectedDamage, t('val_timeline_damage'), '#F59E0B');
  clsImpactChart = lineChart('clsImpactAnalyser', movingImpact(selectedSeries), t('val_impact_analyser'), '#3B82F6');
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
function setLastClassifierResult(res) { lastClsResult = res; }
function onLangChange() { if (lastClsResult) renderClassifier(lastClsResult); }

// ---- wiring ----
$('btnClsServerFile').addEventListener('click', () => { $('clsServerFileInput').value = ''; $('clsServerFileInput').click(); });
$('btnClsLocalFile').addEventListener('click',  () => { $('clsLocalFileInput').value  = ''; $('clsLocalFileInput').click(); });
$('clsServerFileInput').addEventListener('change', () => clsLoadFile('clsServerFileInput', true));
$('clsLocalFileInput').addEventListener('change',  () => clsLoadFile('clsLocalFileInput',  false));
$('clsPairSelect').addEventListener('change', function() {
  clsApplySelectedPairs(this, this._pairs);
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
