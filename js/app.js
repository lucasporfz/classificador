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

// `mode` casa com o hover do gráfico. Os gráficos de turno usam
// CLS_CHART_INDEX_INTERACTION (coluna inteira, qualquer altura do mouse), então o clique
// tem de abrir o mesmo turno que o tooltip está mostrando; os histogramas continuam com
// 'nearest'/intersect, que é o certo para barra.
function clsChartClickHandler(res, resolver, mode) {
  const hitMode = mode || { mode: 'nearest', intersect: true };
  return function(evt, activeEls, chartArg) {
    const chart = chartArg || this;
    if (!chart || typeof chart.getElementsAtEventForMode !== 'function') return;
    const els = chart.getElementsAtEventForMode(evt, hitMode.mode, { intersect: hitMode.intersect }, true);
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

// M-039 (D8): a coluna que mostrava só Expose Weakness virou coluna de ESTADO DO HIT.
// Expose Weakness vem de sufixo do Server Log (fato observado); omega é inferido por
// bloco na validação — os dois são estados do hit e podem coexistir.
function clsDetailHitStateLabel(hit) {
  if (!hit) return '-';
  const parts = [];
  if (hit.exposeWeakness) parts.push('EW');
  if (hit.omegaActive) parts.push('omega');
  return parts.length ? parts.join(' + ') : '-';
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
          '<th>Timestamp</th><th>Dano</th><th>Tipo/Componente</th><th>Crítico/Onslaught</th><th>Estado do hit</th><th>Overkill</th><th>Mob alvo</th>' +
        '</tr></thead><tbody>' +
          hits.map(h =>
            '<tr>' +
              '<td>' + clsEscapeHtml(clsFmtTurnTs(h.ts)) + '</td>' +
              '<td style="text-align:right">' + clsEscapeHtml(h.dmg) + '</td>' +
              '<td>' + clsEscapeHtml(clsDetailComponentLabel(h, turn)) + '</td>' +
              '<td>' + clsEscapeHtml(clsDetailCritLabel(h)) + '</td>' +
              '<td>' + clsEscapeHtml(clsDetailHitStateLabel(h)) + '</td>' +
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

// Paleta compartilhada por TUDO que colore componente: tabela de rotação, donut de
// composição, histogramas por componente e o gráfico de componentes por turno. Antes ela
// existia duplicada em renderClassifier e renderClassifierCharts, cada uma numerando a sua
// própria lista filtrada — o que deixava as cores divergirem entre a tabela e os gráficos.
const CLS_COMP_PALETTE = ['#F59E0B', '#22C55E', '#60A5FA', '#F87171', '#A78BFA', '#FBBF24', '#34D399', '#F472B6', '#38BDF8', '#FB923C', '#C084FC'];

// Dano efetivo TOTAL da linha = soma do damageTimeline (por turno alinhado, já sem os
// turnos partialEdge, que buildRotationRows não inclui). Não vem do motor: é derivado
// aqui, na UI, do array que a UI já recebe.
function clsRowTotalEff(row) {
  return row && Array.isArray(row.damageTimeline)
    ? row.damageTimeline.reduce((sum, v) => sum + (+v || 0), 0)
    : 0;
}

// Separador de milhar seguindo o idioma da UI: sem isto o dano total sairia com ponto
// (2.107.064) mesmo no modo EN. As demais colunas não usam separador, mas os totais de
// sessão chegam à casa dos milhões e ficam ilegíveis sem ele.
function clsFmtInt(n) {
  return Math.round(+n || 0).toLocaleString(LANG === 'en' ? 'en-US' : 'pt-BR');
}

// ---------------------------------------------------------------------------
// Divisão por criatura de cada componente (tooltip da tabela de rotação).
//
// Responde "em quais criaturas meu auto ataque (ou esta spell) caiu?" sem inventar
// nada: só agrupa por `mob` os hits que a classificação já atribuiu ao componente.
// A chave do componente é a mesma da linha da rotação — `arrow` para o auto ataque,
// senão o rótulo da ação — para o `data-cls-comp` da linha casar com este mapa.
// ---------------------------------------------------------------------------
const CLS_TARGET_PALETTE = CLS_COMP_PALETTE;

function clsTargetsByComponent(res) {
  const trace = (res && res.turnTrace) || [];
  const comps = new Map();
  // Charm é ATRIBUIÇÃO, não estatística: Low Blow e Savage Blow ficam colados numa
  // criatura do bestiário. Por isso viram um selo na criatura — não uma coluna de
  // porcentagem, que só mediria a sorte dos procs daquela amostra. O selo vale para a
  // sessão inteira, independente do componente em que o charm procou.
  const charmByMob = new Map();
  let anyLowBlow = false, anySavage = false;

  for (const tr of trace) {
    for (const h of tr.lines || []) {
      const comp = h.component || h.comp;
      const key = comp === 'arrow' ? 'arrow' : (h.actionLabel || comp);
      let c = comps.get(key);
      if (!c) { c = { key, isAa: comp === 'arrow', hits: 0, dmg: 0, mobs: new Map() }; comps.set(key, c); }
      let m = c.mobs.get(h.mob);
      if (!m) { m = { mob: h.mob, hits: 0, dmg: 0, cleanHits: 0, cleanDmg: 0 }; c.mobs.set(h.mob, m); }
      let charm = charmByMob.get(h.mob);
      if (!charm) { charm = { lb: 0, sb: 0 }; charmByMob.set(h.mob, charm); }
      const dmg = +h.dmg || 0;
      c.hits++; c.dmg += dmg;
      m.hits++; m.dmg += dmg;
      if (h.lowBlow) { charm.lb++; anyLowBlow = true; }
      if (h.savageBlow) { charm.sb++; anySavage = true; }
      // Dano médio ignora overkill: o log mostra só o que faltava de vida (D-011),
      // então o golpe que mata puxaria a média para baixo sem significar nada.
      if (!(h.ok || h.overkill)) { m.cleanHits++; m.cleanDmg += dmg; }
    }
  }

  for (const c of comps.values()) {
    c.rows = [...c.mobs.values()].sort((a, b) => b.hits - a.hits || a.mob.localeCompare(b.mob));
    c.rows.forEach((r, i) => {
      r.color = CLS_TARGET_PALETTE[i % CLS_TARGET_PALETTE.length];
      r.hitPct = c.hits ? (100 * r.hits) / c.hits : 0;
      r.dmgPct = c.dmg ? (100 * r.dmg) / c.dmg : 0;
      r.avgDmg = r.cleanHits ? r.cleanDmg / r.cleanHits : 0;
      r.avgAllOverkill = !r.cleanHits;
      r.charm = charmByMob.get(r.mob) || { lb: 0, sb: 0 };
    });
  }
  return { comps, anyLowBlow, anySavage };
}

// Selo do charm ao lado do nome da criatura. O `title` guarda quantos procs
// sustentam a marca, para quem quiser conferir a evidência.
function clsTargetCharmBadges(row) {
  const badge = (cls, label, key, procs) =>
    '<span class="cls-target-badge ' + cls + '" title="' +
      clsEscapeHtml(t(key) + ' — ' + t('cls_targets_charm_procs').replace('{n}', procs)) + '">' + label + '</span>';
  return (row.charm.lb ? badge('cls-target-badge-lb', 'LB', 'cls_targets_charm_low_blow', row.charm.lb) : '') +
    (row.charm.sb ? badge('cls-target-badge-sb', 'SB', 'cls_targets_charm_savage', row.charm.sb) : '');
}

function clsTargetsTooltipHtml(comp, data) {
  const f1 = x => x.toFixed(1);
  const bar = '<div class="cls-target-stack">' + comp.rows
    .map(r => '<i style="width:' + f1(r.hitPct) + '%;background:' + r.color + '" title="' +
      clsEscapeHtml(r.mob) + ' — ' + f1(r.hitPct) + '%"></i>').join('') + '</div>';
  const body = comp.rows.map(r =>
    '<tr><td><span class="cls-share-dot" style="background:' + r.color + '"></span>' +
        clsEscapeHtml(r.mob) + clsTargetCharmBadges(r) + '</td>' +
      '<td>' + clsFmtInt(r.hits) + '</td>' +
      '<td><strong>' + f1(r.hitPct) + '%</strong></td>' +
      '<td>' + f1(r.dmgPct) + '%</td>' +
      '<td>' + (r.avgAllOverkill ? '—' : clsFmtInt(r.avgDmg)) + '</td></tr>').join('');
  const legendParts = [];
  if (data.anyLowBlow) legendParts.push('<span class="cls-target-badge cls-target-badge-lb">LB</span> ' + t('cls_targets_charm_low_blow'));
  if (data.anySavage) legendParts.push('<span class="cls-target-badge cls-target-badge-sb">SB</span> ' + t('cls_targets_charm_savage'));
  const charmLegend = legendParts.length
    ? '<br>' + legendParts.join(' · ') + ' — ' + t('cls_targets_charm_legend')
    : '';
  const title = t('cls_targets_title')
    .replace('{comp}', clsEscapeHtml(comp.isAa ? t('cls_comp_arrow') : comp.key));
  return '<div class="cls-target-title">' + title + '</div>' + bar +
    '<table class="cls-target-table"><thead><tr>' +
      '<th>' + t('cls_targets_th_mob') + '</th><th>' + t('cls_targets_th_hits') + '</th>' +
      '<th>' + t('cls_targets_th_share') + '</th><th>' + t('cls_targets_th_dmg_share') + '</th>' +
      '<th>' + t('cls_targets_th_avg_dmg') + '</th>' +
    '</tr></thead><tbody>' + body + '</tbody></table>' +
    '<div class="cls-target-foot">' + t('cls_targets_foot_avg') + charmLegend + '</div>';
}

// Tooltip que segue o cursor. `pointer-events: none` (no CSS) é o que impede a camada
// de roubar o mouse da própria linha e ficar piscando.
function clsTargetTooltipEl() {
  let el = document.getElementById('clsTargetTip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'clsTargetTip';
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}
function clsHideTargetTooltip() {
  const el = document.getElementById('clsTargetTip');
  if (el) el.style.display = 'none';
}
function clsPlaceTargetTooltip(e) {
  const el = clsTargetTooltipEl(), pad = 14;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = Math.min(e.clientX + pad, window.innerWidth - w - 8);
  let y = e.clientY + pad;
  if (y + h > window.innerHeight - 8) y = Math.max(8, e.clientY - h - pad);
  el.style.left = Math.max(8, x) + 'px';
  el.style.top = y + 'px';
}

// Liga o tooltip nas linhas da rotação recém-renderizadas. As linhas de tier (sub-linhas)
// não têm `data-cls-comp` e ficam de fora — o recorte por criatura é do componente.
function clsWireTargetTooltips(res) {
  clsHideTargetTooltip();
  const table = document.querySelector('#clsResults .cls-rotation-table');
  if (!table || !res || !res.turnTrace) return;
  const data = clsTargetsByComponent(res);
  table.querySelectorAll('tbody tr[data-cls-comp]').forEach(tr => {
    const comp = data.comps.get(tr.getAttribute('data-cls-comp'));
    if (!comp || !comp.rows.length) return;
    tr.classList.add('cls-row-targets');
    tr.addEventListener('mouseenter', e => {
      const el = clsTargetTooltipEl();
      el.innerHTML = clsTargetsTooltipHtml(comp, data);
      el.style.display = 'block';
      clsPlaceTargetTooltip(e);
    });
    tr.addEventListener('mousemove', clsPlaceTargetTooltip);
    tr.addEventListener('mouseleave', clsHideTargetTooltip);
  });
}

// Ordem de exibição = dano efetivo total decrescente, com a cor derivada dessa ordem.
// Função pura de `res`, então renderClassifier e renderClassifierCharts chegam à mesma
// ordem e às mesmas cores sem precisar passar nada entre elas.
function clsRowsByDamage(res) {
  const rows = ((res && res.rows) || []).slice()
    .sort((a, b) => clsRowTotalEff(b) - clsRowTotalEff(a));
  const colors = new Map();
  rows.forEach((row, i) => colors.set(row, CLS_COMP_PALETTE[i % CLS_COMP_PALETTE.length]));
  return { rows, colorOf: row => colors.get(row) || CLS_COMP_PALETTE[0] };
}

// Denominador do uptime por componente: o MESMO das duas métricas do topo da tela —
// auto ataque contra aaUptime, spell/runa/granada contra spellRuneUptime. Logo a linha
// do auto ataque na tabela reproduz o "AA uptime" já exibido acima dela.
function clsTurnUptimeDen(res, row) {
  const metric = row && row.kind === 'arrow' ? res.aaUptime : res.spellRuneUptime;
  return (metric && +metric.expected) || res.totalTurns || 0;
}

// Donut SVG (sem Chart.js: é estático e não precisa de interação).
function clsShareDonut(rows, colorOf, total, size) {
  const R = size / 2, inner = R * 0.60, cx = R, cy = R;
  let angle = -Math.PI / 2;
  const point = (rad, ang) => (cx + rad * Math.cos(ang)).toFixed(2) + ' ' + (cy + rad * Math.sin(ang)).toFixed(2);
  const arcs = rows.map(row => {
    const frac = total > 0 ? clsRowTotalEff(row) / total : 0;
    if (frac <= 0) return '';
    const end = angle + frac * Math.PI * 2;
    const big = frac > 0.5 ? 1 : 0;
    const d = 'M ' + point(R - 1, angle) + ' A ' + (R - 1) + ' ' + (R - 1) + ' 0 ' + big + ' 1 ' + point(R - 1, end) +
      ' L ' + point(inner, end) + ' A ' + inner + ' ' + inner + ' 0 ' + big + ' 0 ' + point(inner, angle) + ' Z';
    angle = end;
    return '<path d="' + d + '" fill="' + colorOf(row) + '" stroke="var(--bg-surface)" stroke-width="1.5">' +
      '<title>' + clsRowLabel(row) + ' — ' + (frac * 100).toFixed(1) + '%</title></path>';
  }).join('');
  const topPct = rows.length && total > 0 ? (clsRowTotalEff(rows[0]) / total) * 100 : 0;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img">' + arcs +
    '<text x="' + cx + '" y="' + (cy - 5) + '" text-anchor="middle" fill="var(--text)" font-size="20" font-weight="600">' +
      topPct.toFixed(1) + '%</text>' +
    '<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" fill="var(--text-muted)" font-size="10">' +
      t('cls_share_biggest') + '</text></svg>';
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
  // Acréscimo de charm que a célula já contém, para ser sinalizado como "+N". O slot é
  // emitido sempre (vazio quando não há charm) — ver a regra de layout em clsCharmPlus.
  const rowCharmTotal = row => {
    if (!clsCharmDamageOn) return null;
    const charm = clsCharmForRow(summary, row);
    return charm ? charm.dmg : null;
  };
  const rowCharmPerMetric = row => {
    const total = rowCharmTotal(row);
    if (!total) return null;
    if (clsRotationDamageMetric === 'turn') return row.turns ? total / row.turns : null;
    const hits = (+row.hitsMean || 0) * (+row.turns || 0);
    return hits ? total / hits : null;
  };
  const gravSanRowDmg = rowDmgFor(clsGravSanDamageMetric);
  const dmgModeSuffix = clsRotationDamageMetric === 'turn' ? t('cls_metric_turn_suffix') : t('cls_metric_hit_suffix');
  const gravSanDmgModeSuffix = clsGravSanDamageMetric === 'turn' ? t('cls_metric_turn_suffix') : t('cls_metric_hit_suffix');
  const gravSanAdjusted = clsGravSanAdjustedHits(res);
  const showAdjustedHits = gravSanAdjusted.showColumn;
  // Resumo de sessão + fold-in opcional do dano de charm (js/session-summary.js).
  // Precisa vir ANTES de `ranked`/`shareTotal`: com o switch ligado o charm entra em
  // `damageTimeline`, que é a fonte da ordem, das cores, do donut e do dano total.
  const summary = clsSessionSummaryModel(res);
  clsCharmApplyToRows(res, summary);
  const ranked = clsRowsByDamage(res);
  const shareTotal = ranked.rows.reduce((sum, row) => sum + clsRowTotalEff(row), 0);
  // Percentual que acompanha um número, em slot de largura fixa (ver .cls-pct no CSS).
  const pctCell = v => '<span class="cls-pct">(' + f1(v) + '%)</span>';
  const pctSpacer = '<span class="cls-pct" aria-hidden="true"></span>';
  // Cabeçalho de coluna numérica. O rótulo vai num span próprio para poder quebrar em
  // duas linhas sem empurrar o slot da % para uma linha só dele — é isso que permite
  // colunas estreitas o bastante para a tabela inteira caber sem rolagem horizontal.
  const charmSpacer = '<span class="cls-charm-plus" aria-hidden="true"></span>';
  const numTh = (label, spacer, charmSlot) =>
    '<th style="text-align:right"><div class="cls-th-inner"><span>' + label + '</span>' +
      (charmSlot ? charmSpacer : '') + (spacer ? pctSpacer : '') + '</div></th>';
  const rowsHtml = ranked.rows.map(r => {
    const adjustedCell = !showAdjustedHits ? '' :
      '<td style="text-align:right">' + f2(gravSanAdjusted.adjustedByKey[clsGravSanRowIdentity(r)] || 0) + '</td>';
    const den = clsTurnUptimeDen(res, r);
    const rowEff = clsRowTotalEff(r);
    // `data-cls-comp` liga a linha ao mapa de clsTargetsByComponent (tooltip por
    // criatura). Mesma chave dos dois lados: 'arrow' para o AA, senão o rótulo da ação.
    const main = '<tr data-cls-comp="' + clsEscapeHtml(r.kind === 'arrow' ? 'arrow' : r.label) +
      '"><td><span class="cls-share-dot" style="background:' + ranked.colorOf(r) + '"></span>' +
      (r.kind === 'arrow' ? t('cls_comp_arrow') : r.label) + '</td><td style="text-align:right">' + r.turns +
      pctCell(den > 0 ? (r.turns / den) * 100 : 0) +
      '</td><td style="text-align:right">' + f2(r.hitsMean) + '</td>' + adjustedCell +
      '<td style="text-align:right"' + (clsCharmDamageOn ? ' class="cls-dim"' : '') + '>' + rowDmg(r, 'base') +
      '</td><td style="text-align:right">' + rowDmg(r, 'eff') + clsCharmPlus(rowCharmPerMetric(r)) + '</td>' +
      '<td style="text-align:right">' + clsFmtInt(rowEff) +
      pctCell(shareTotal > 0 ? (rowEff / shareTotal) * 100 : 0) +
      clsCharmPlusBlock(rowCharmTotal(r)) + '</td></tr>';
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
      // O tier é um recorte dos hits do componente: não tem turnos próprios (célula de
      // turnos vazia) e o seu dano total sai do dano/turno × turnos do componente-pai.
      const tierEff = Math.round((+tier.dmgEffPerTurn || 0) * r.turns);
      // O tier NÃO recebe charm (a atribuição é por componente, não por recorte de tier),
      // mas emite os mesmos slots vazios para não desalinhar das colunas do componente.
      return '<tr style="color:var(--text-muted);font-size:12px"><td style="padding-left:22px">└ ' + tierLabel(tier, r.bonusMult, r.beamFraction) +
        '</td><td></td><td style="text-align:right">' + f2(tier.hitsMean) + '</td>' + tierAdjustedCell +
        '<td style="text-align:right">' + tierBaseCell + '</td>' +
        '<td style="text-align:right">' + rowDmg(tier, 'eff') + clsCharmPlus(null) + '</td>' +
        '<td style="text-align:right">' + clsFmtInt(tierEff) +
        pctCell(shareTotal > 0 ? (tierEff / shareTotal) * 100 : 0) + clsCharmPlusBlock(null) + '</td></tr>';
    }).join('');
    return main + sub;
  }).join('');
  const gravSanRowsHtml = (res.gravSanRows || []).map(r =>
    '<tr><td>' + (r.kind === 'arrow' ? t('cls_comp_arrow') : r.label) + '</td><td style="text-align:right">' + r.turns +
      '</td><td style="text-align:right">' + f2(r.hitsMean) + '</td><td style="text-align:right">' + gravSanRowDmg(r, 'base') +
      '</td><td style="text-align:right">' + gravSanRowDmg(r, 'eff') + '</td></tr>'
  ).join('');
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
  const compDefs = ranked.rows
    .filter(r => Array.isArray(r.hitsPerTurn) && r.hitsPerTurn.some(v => v > 0))
    .map((r, i) => ({
      canvas: 'clsHist' + i,
      row: r,
      vals: r.hitsPerTurn.filter(v => v > 0),
      label: clsRowLabel(r),
      color: ranked.colorOf(r),
    }));
  const hasSeries = (res.temporalSeries || []).length > 0;
  // Larguras travadas: sem isto, trocar Hits<->Turno muda o sufixo do cabeçalho de dano
  // ("/ hit" <-> "/ turno") e a tabela inteira reflui. "componente" fica sem largura e
  // absorve a sobra.
  // Larguras das colunas numéricas + piso para a coluna de nome. A de nome é a única
  // "auto": ela absorve a sobra, mas as colunas fixas somadas podiam espremê-la a ~97px
  // (caso com a coluna de grav san) e o nome do componente saía truncado. O piso vira um
  // min-width na tabela; quando nem ele cabe, quem rola é o container, não o texto.
  const rotationCols = { turns: 150, hits: 74, gravSan: 120, dmgBase: 150, dmgEff: 150, total: 146 };
  const CLS_NAME_COL_MIN = 300;
  const rotationMinWidth = CLS_NAME_COL_MIN + rotationCols.turns + rotationCols.hits +
    (showAdjustedHits ? rotationCols.gravSan : 0) + rotationCols.dmgBase + rotationCols.dmgEff + rotationCols.total;
  const rotationColgroup =
    '<colgroup><col><col style="width:' + rotationCols.turns + 'px"><col style="width:' + rotationCols.hits + 'px">' +
      (showAdjustedHits ? '<col style="width:' + rotationCols.gravSan + 'px">' : '') +
      '<col style="width:' + rotationCols.dmgBase + 'px"><col style="width:' + rotationCols.dmgEff + 'px">' +
      '<col style="width:' + rotationCols.total + 'px"></colgroup>';
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
  // Painel de composição: donut + ranking, na mesma ordem e cor da tabela.
  const shareTop = ranked.rows.slice(0, 3);
  const shareTopPct = shareTotal > 0 ? (shareTop.reduce((sum, row) => sum + clsRowTotalEff(row), 0) / shareTotal) * 100 : 0;
  const shareLegend = ranked.rows.map(row => {
    const eff = clsRowTotalEff(row);
    const p = shareTotal > 0 ? (eff / shareTotal) * 100 : 0;
    const den = clsTurnUptimeDen(res, row);
    const tp = den > 0 ? (row.turns / den) * 100 : 0;
    // Com o charm somado, a barra mostra a parcela dele numa faixa própria — hachurada e
    // fora da paleta de componentes (ver --cls-charm), para não se confundir com o
    // componente vizinho quando este for o vermelho da paleta.
    const charmEff = clsCharmDamageOn ? ((clsCharmForRow(summary, row) || {}).dmg || 0) : 0;
    const charmPct = shareTotal > 0 ? (charmEff / shareTotal) * 100 : 0;
    return '<div class="cls-share-row">' +
        '<div class="cls-share-name"><span class="cls-share-dot" style="background:' + ranked.colorOf(row) + '"></span>' + clsRowLabel(row) + '</div>' +
        '<div class="cls-share-turns">' + f1(tp) + '%</div>' +
        '<div class="cls-share-arrow">→</div>' +
        '<div class="cls-share-pct">' + f1(p) + '%</div>' +
        '<div class="cls-share-total">' + clsFmtInt(eff) + clsCharmPlusBlock(charmEff || null) + '</div>' +
      '</div>' +
      '<div class="cls-share-bar"><i style="width:' + f1(p - charmPct) + '%;background:' + ranked.colorOf(row) + '"></i>' +
        '<i class="cls-share-charm" style="width:' + f1(charmPct) + '%"></i></div>';
  }).join('');
  const shareHtml = !ranked.rows.length || shareTotal <= 0 ? '' :
    clsSectionHeadHtml('cls_h_damage_share', 'clsCharmSwitchShare', summary) +
    '<div class="cls-share">' +
      '<div>' + clsShareDonut(ranked.rows, ranked.colorOf, shareTotal, 190) + '</div>' +
      '<div class="cls-share-legend">' +
        '<p class="cls-share-headline">' + t('cls_share_headline')
          .replace('{n}', shareTop.length)
          .replace('{pct}', '<strong>' + f1(shareTopPct) + '%</strong>')
          .replace('{total}', '<strong>' + clsFmtInt(shareTotal) + '</strong>')
          .replace('{turns}', '<strong>' + res.totalTurns + '</strong>') + '</p>' +
        '<div class="cls-share-row cls-share-head"><div>' + t('cls_th_comp') + '</div>' +
          '<div>' + t('cls_share_leg_turns') + '</div><div></div>' +
          '<div>' + t('cls_share_leg_dmg') + '</div><div>' + t('cls_th_dmg_total') + '</div></div>' +
        shareLegend +
      '</div>' +
    '</div>';

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
    clsBrushHtml(res) +
    '<div style="position:relative;height:240px;margin-bottom:14px"><canvas id="clsTimelineComponents"></canvas></div>' +
    '<div style="position:relative;height:240px;margin-bottom:14px"><canvas id="clsTimelineHits"></canvas></div>' +
    '<div style="position:relative;height:240px;margin-bottom:14px"><canvas id="clsTimelineDamage"></canvas></div>' +
    '<div style="position:relative;height:230px"><canvas id="clsImpactAnalyser"></canvas></div>'
  );

  box.style.display = 'block';
  box.innerHTML =
    // O resumo de sessão absorve a antiga linha solta "jogador · dano do jogador":
    // mesma informação, dentro da faixa de identificação.
    clsSessionSummaryHtml(res, summary) +
    aaMetricHtml +
    shareHtml +
    clsSectionHeadHtml('cls_h_rotation', 'clsCharmSwitchRotation', summary) +
    // A nota é emitida SEMPRE (vazia quando desligado): condicioná-la à existência
    // empurrava a tabela inteira para baixo ao ligar o switch.
    '<p class="cls-share-note cls-charm-note">' + (clsCharmDamageOn ? t('cls_charm_note') : '&nbsp;') + '</p>' +
    rotationMetricHtml +
    '<div class="cls-table-scroll"><table class="cls-table cls-rotation-table" style="min-width:' + rotationMinWidth + 'px">' + rotationColgroup +
      '<thead><tr><th>' + t('cls_th_comp') + '</th>' +
      numTh(t('cls_th_turns_uptime'), true) +
      numTh(t('cls_th_hits'), false) +
      (showAdjustedHits ? numTh(t('cls_th_hits_gravsan_adjusted'), false) : '') +
      numTh(t('cls_th_dmg_base') + dmgModeSuffix, false) +
      numTh(t('cls_th_dmg_eff') + dmgModeSuffix, false, true) +
      numTh(t('cls_th_dmg_total'), true) +
      '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>' +
    '<p class="cls-share-note">' + t('cls_share_note') + '</p>' +
    '<p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">' +
      t('cls_unmatched').replace('{u}', res.excludedTurns).replace('{n}', res.totalTurns) + '</p>' +
    gravSanTableHtml +
    chartsHtml;
  renderClassifierCharts(res, compDefs);
  clsWireBrush(res);
  clsWireTargetTooltips(res);
  // Os dois switches de charm (composição e rotação) compartilham um estado só.
  document.querySelectorAll('#clsResults [data-cls-charm-switch]').forEach(input => {
    input.addEventListener('change', function() {
      clsCharmDamageOn = this.checked;
      renderClassifier(res);
    });
  });
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

// Hover dos gráficos de turno: `interaction/hover` em modo 'index' com `intersect:false`
// casa o hover pela COLUNA (o turno), não pela proximidade do ponto — o tooltip aparece
// com o mouse em qualquer altura da área do gráfico, e não só exatamente em cima da linha.
// O crosshair vertical existe para o olho saber qual turno está sendo lido quando o mouse
// está longe das linhas.
const CLS_CHART_INDEX_INTERACTION = { mode: 'index', intersect: false };

const clsChartCrosshairPlugin = {
  id: 'clsChartCrosshair',
  afterDatasetsDraw(chart) {
    if (!chart.$clsCrosshair) return;
    const active = chart.getActiveElements();
    if (!active.length) return;
    const x = active[0].element.x, area = chart.chartArea, ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(230,239,248,.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
    ctx.restore();
  }
};
if (typeof Chart !== 'undefined' && !Chart.registry.plugins.get('clsChartCrosshair')) {
  Chart.register(clsChartCrosshairPlugin);
}

// Handler do tooltip externo. `opts.hideZeros` esconde componentes que não dispararam no
// turno; `opts.showTotal` soma as séries visíveis (só faz sentido no gráfico de
// componentes). O div vive dentro do wrapper `position:relative` do canvas.
function clsChartExternalTooltip(opts) {
  return ctx => {
    const chart = ctx.chart, tooltip = ctx.tooltip;
    const parent = chart.canvas && chart.canvas.parentNode;
    if (!parent) return;
    let tip = chart.$clsTip;
    if (!tip || !tip.isConnected) {
      tip = document.createElement('div');
      tip.className = 'cls-chart-tip';
      parent.appendChild(tip);
      chart.$clsTip = tip;
    }
    if (tooltip.opacity === 0 || !tooltip.dataPoints || !tooltip.dataPoints.length) {
      tip.style.opacity = 0;
      return;
    }
    const idx = tooltip.dataPoints[0].dataIndex;
    let rows = tooltip.dataPoints.map(dp => ({
      name: dp.dataset.label,
      color: dp.dataset.borderColor,
      value: dp.parsed.y
    }));
    if (opts.hideZeros) rows = rows.filter(r => r.value > 0);
    rows.sort((a, b) => b.value - a.value);
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const fmt = n => Number(n).toLocaleString(LANG === 'pt' ? 'pt-BR' : 'en-US');
    const body = rows.length
      ? rows.map(r =>
          '<div class="cls-chart-tip-row">' +
            '<span class="cls-chart-tip-sw" style="background:' + esc(r.color) + '"></span>' +
            '<span class="cls-chart-tip-name">' + esc(r.name) + '</span>' +
            '<span class="cls-chart-tip-val">' + fmt(r.value) + '</span>' +
          '</div>')
        .join('')
      : '<div class="cls-chart-tip-row"><span class="cls-chart-tip-name">—</span></div>';
    const total = (opts.showTotal && rows.length > 1)
      ? '<div class="cls-chart-tip-row is-total">' +
          '<span class="cls-chart-tip-name">' + esc(t('cls_summary_total')) + '</span>' +
          '<span class="cls-chart-tip-val">' + fmt(rows.reduce((s, r) => s + r.value, 0)) + '</span>' +
        '</div>'
      : '';
    tip.innerHTML =
      '<div class="cls-chart-tip-title">' + esc(t('val_axis_turn')) + ' ' + (idx + 1) + '</div>' +
      body + total;
    // dentro da área do gráfico, virando de lado ao chegar na borda direita
    const w = tip.offsetWidth || 160, area = chart.chartArea, cx = tooltip.caretX;
    const left = (cx + 14 + w > area.right) ? cx - 14 - w : cx + 14;
    tip.style.left = Math.max(area.left, left) + 'px';
    tip.style.top = (area.top + 8) + 'px';
    tip.style.opacity = 1;
  };
}

// ---------------------------------------------------------------------------
// Faixa de turnos (brush) + reclassificação da faixa.
//
// `clsTurnView` é a janela de turnos que os quatro gráficos de turno enxergam; é só
// visão — arrastar o brush NÃO reclassifica nada. Classificar a faixa é uma ação
// separada, com botão: ela recorta o log pelos timestamps da faixa e roda o motor de
// novo, que então infere o setup (leech, referência de AA, perks) SÓ dela.
// ---------------------------------------------------------------------------
let clsTurnView = null;          // { start, end } em índices de turnTrace; null = tudo
let clsBrushCharts = [];         // gráficos de turno que seguem a faixa
let clsBrushWindowWired = false; // listeners de janela são globais: só uma vez
let clsBrushDrag = null;
let clsSliceActive = false;      // o resultado em vigor veio de "classificar a faixa"
let clsBrushSetView = null;      // escritos por clsWireBrush; o zoom por scroll dos
let clsBrushRedraw = null;       // gráficos e o resize da janela precisam deles de fora
const CLS_BRUSH_MIN_SPAN = 8;
const CLS_BRUSH_HANDLE_PX = 6;

// Turno sem classificação: o motor devolve os hits em componentes `unresolved_*`, que
// `buildCounts` soma em `counts.unresolved`.
function clsUnresolvedFlags(res) {
  const tr = (res && res.turnTrace) || [];
  return tr.map(t => !!(t && t.counts && t.counts.unresolved > 0));
}

function clsBrushHtml(res) {
  const n = ((res && res.turnTrace) || []).length;
  if (n < 2) return '';
  const unresolved = clsUnresolvedFlags(res).filter(Boolean).length;
  return '<div class="cls-brush">' +
    '<div class="cls-brush-head">' +
      '<span class="cls-brush-title">' + t('cls_brush_title') + '</span>' +
      '<span class="cls-brush-range" id="clsBrushRange"></span>' +
      (unresolved
        ? '<span class="cls-brush-unresolved">' + t('cls_brush_unresolved').replace('{n}', unresolved) + '</span>'
        : '') +
      '<button type="button" class="cls-brush-btn" id="clsBrushClassify"></button>' +
      '<button type="button" class="cls-brush-btn is-ghost" id="clsBrushReset">' + t('cls_brush_reset') + '</button>' +
      '<span class="cls-brush-hint">' + t('cls_brush_hint') + '</span>' +
    '</div>' +
    '<canvas id="clsBrushCanvas"></canvas>' +
  '</div>';
}

function clsBrushClampView(start, end, n) {
  const span = Math.max(CLS_BRUSH_MIN_SPAN, Math.round(end - start + 1));
  if (span >= n) return null;                       // null = sessão inteira
  let s = Math.max(0, Math.round(start));
  if (s + span - 1 > n - 1) s = n - span;
  return { start: s, end: s + span - 1 };
}

// Recorta o log por timestamp. Linhas sem `HH:MM:SS` no começo (o cabeçalho
// `Channel ... saved ...`, de onde sai a data da sessão e portanto o regime de tabela de
// mob) são SEMPRE preservadas — perdê-las mudaria a tabela de mobs junto com a faixa.
function clsSliceLogByTs(text, tsStart, tsEnd) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^(\d{2}):(\d{2}):(\d{2})/.exec(line);
    if (!m) { out.push(line); continue; }
    const ts = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    if (ts >= tsStart && ts <= tsEnd) out.push(line);
  }
  return out.join('\n');
}

function clsBrushApplyView() {
  for (const c of clsBrushCharts) {
    if (!c || !c.options || !c.options.scales || !c.options.scales.x) continue;
    c.options.scales.x.min = clsTurnView ? clsTurnView.start : undefined;
    c.options.scales.x.max = clsTurnView ? clsTurnView.end : undefined;
    c.update('none');
  }
}

function clsWireBrush(res) {
  // O painel é reconstruído a cada render: solta os ponteiros do render anterior antes
  // de qualquer coisa, para o zoom por scroll nunca escrever numa faixa de outro
  // resultado (acontece quando o novo resultado é curto demais para ter brush).
  clsBrushSetView = null;
  clsBrushRedraw = null;
  const cv = $('clsBrushCanvas');
  const btn = $('clsBrushClassify');
  const resetBtn = $('clsBrushReset');
  if (!cv || !btn) return;
  const tr = res.turnTrace || [];
  const n = tr.length;
  const damage = (res.temporalSeries || []).map(p => p.damage || 0);
  const unresolved = clsUnresolvedFlags(res);
  const ctx = cv.getContext('2d');

  const view = () => clsTurnView || { start: 0, end: n - 1 };
  let hoverZone = null;            // 'left' | 'right' | 'pan' | null

  // Alinhamento com os gráficos: o turno 1 do brush tem de cair na mesma coluna de
  // pixels que o turno 1 dos gráficos de turno. Eles têm o eixo Y à esquerda (74px por
  // `afterFit`) e o brush tem o padding do próprio cartão, então a área útil NÃO é a
  // largura do canvas. Em vez de repetir os números aqui — que sairiam de sincronia na
  // primeira mudança de layout — a faixa lê o `chartArea` de um gráfico vivo e converte
  // para coordenadas do canvas do brush via as duas bounding boxes.
  function plotBounds() {
    const rect = cv.getBoundingClientRect();
    const ref = clsBrushCharts.find(c => c && c.chartArea && c.canvas && c.canvas.isConnected);
    if (!ref) return { l: 0, r: rect.width, w: rect.width };
    const refRect = ref.canvas.getBoundingClientRect();
    const l = refRect.left + ref.chartArea.left - rect.left;
    const r = refRect.left + ref.chartArea.right - rect.left;
    if (!(r > l + 8)) return { l: 0, r: rect.width, w: rect.width };
    return { l: Math.max(0, l), r: Math.min(rect.width, r), w: rect.width };
  }
  const idxToX = (i, p) => p.l + (i / Math.max(1, n - 1)) * (p.r - p.l);
  const xToIdx = (x, p) => Math.max(0, Math.min(n - 1,
    Math.round(((x - p.l) / Math.max(1, p.r - p.l)) * (n - 1))));

  function draw() {
    const rect = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width, h = rect.height;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const p = plotBounds();
    // O texto do cabeçalho começa onde o eixo dos gráficos começa. Fica aqui, e não no
    // syncHead, porque o resize refaz o desenho mas não o cabeçalho.
    const head = cv.parentNode && cv.parentNode.querySelector('.cls-brush-head');
    if (head) head.style.paddingLeft = Math.round(p.l) + 'px';

    // turnos sem classificação, no fundo: o mapa de onde o motor não fechou
    ctx.fillStyle = 'rgba(248,113,113,.32)';
    const barW = Math.max(1, (p.r - p.l) / n);
    for (let i = 0; i < n; i++) if (unresolved[i]) ctx.fillRect(idxToX(i, p) - barW / 2, 0, barW, h);

    // sparkline do dano da sessão inteira
    const max = damage.reduce((a, b) => Math.max(a, b), 0) || 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = idxToX(i, p), y = h - 3 - (damage[i] / max) * (h - 8);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineTo(p.r, h); ctx.lineTo(p.l, h); ctx.closePath();
    ctx.fillStyle = 'rgba(245,158,11,.16)'; ctx.fill();
    ctx.strokeStyle = 'rgba(245,158,11,.55)'; ctx.lineWidth = 1; ctx.stroke();

    // Janela. Os dois gestos se distinguem de propósito: CORTAR mora nas bordas e é uma
    // lâmina de altura cheia que engrossa no alvo; MOVER é o corpo da janela, que acende
    // por inteiro. Antes as duas coisas eram o mesmo retângulo com o mesmo cursor, e não
    // dava para saber o que ia acontecer antes de arrastar.
    const v = view();
    const x0 = idxToX(v.start, p), x1 = idxToX(v.end, p);
    const zone = clsBrushDrag ? clsBrushDrag.kind : hoverZone;

    ctx.fillStyle = 'rgba(8,15,29,.72)';
    ctx.fillRect(p.l, 0, x0 - p.l, h); ctx.fillRect(x1, 0, p.r - x1, h);

    // corpo da janela: acende de leve quando o gesto é mover
    if (zone === 'pan') {
      ctx.fillStyle = 'rgba(0,196,154,.07)';
      ctx.fillRect(x0, 0, x1 - x0, h);
    }
    ctx.strokeStyle = zone === 'pan' ? '#00C49A' : 'rgba(0,196,154,.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + .5, .5, Math.max(1, x1 - x0) - 1, h - 1);

    // alças de corte: lâmina de altura cheia, mais larga e clara quando é o alvo
    const blade = (x, active) => {
      const bw = active ? 4 : 2;
      ctx.fillStyle = active ? '#7CF0D2' : '#00C49A';
      ctx.fillRect(x - bw / 2, 0, bw, h);
    };
    blade(x0, zone === 'left');
    blade(x1, zone === 'right');

  }

  function syncHead() {
    const v = view();
    const rangeEl = $('clsBrushRange');
    if (rangeEl) {
      rangeEl.textContent = t('cls_brush_range')
        .replace('{a}', v.start + 1).replace('{b}', v.end + 1).replace('{n}', n);
    }
    const whole = !clsTurnView;
    btn.disabled = whole;
    btn.textContent = whole
      ? t('cls_brush_same')
      : t('cls_brush_classify').replace('{a}', v.start + 1).replace('{b}', v.end + 1);
    // "Ver tudo" só apaga quando não há nada para desfazer: nem zoom, nem faixa
    // classificada no lugar da sessão.
    if (resetBtn) resetBtn.disabled = whole && !clsSliceActive;
  }

  function setView(start, end) {
    clsTurnView = clsBrushClampView(start, end, n);
    clsBrushApplyView();
    draw();
    syncHead();
  }
  clsBrushSetView = setView;   // o zoom por scroll dos gráficos escreve aqui
  clsBrushRedraw = draw;

  // x do mouse em coordenadas do canvas do brush; a conversão para turno passa pelo
  // mesmo plotBounds do desenho, senão o clique cairia num turno diferente do que a
  // faixa mostra debaixo do cursor.
  const pos = ev => Math.max(0, Math.min(cv.getBoundingClientRect().width,
    ev.clientX - cv.getBoundingClientRect().left));

  // Uma definição só de "que gesto é este x", usada pelo cursor, pelo desenho e pelo
  // mousedown — se divergissem, o cursor prometeria um gesto e o clique faria outro.
  function zoneAt(x) {
    const v = view(), p = plotBounds();
    const x0 = idxToX(v.start, p), x1 = idxToX(v.end, p);
    if (Math.abs(x - x0) <= CLS_BRUSH_HANDLE_PX) return 'left';
    if (Math.abs(x - x1) <= CLS_BRUSH_HANDLE_PX) return 'right';
    if (x > x0 && x < x1) return 'pan';
    return 'new';
  }
  const cursorFor = z => z === 'left' || z === 'right' ? 'ew-resize'
    : z === 'pan' ? 'grab' : 'crosshair';

  cv.addEventListener('mousemove', ev => {
    if (clsBrushDrag) return;          // durante o arrasto quem manda é o cursor do arrasto
    const z = zoneAt(pos(ev));
    cv.style.cursor = cursorFor(z);
    const shown = z === 'new' ? null : z;
    if (shown !== hoverZone) { hoverZone = shown; draw(); }
  });
  cv.addEventListener('mouseleave', () => {
    if (hoverZone !== null) { hoverZone = null; draw(); }
  });

  cv.addEventListener('mousedown', ev => {
    const x = pos(ev), v = view(), p = plotBounds();
    const kind = zoneAt(x);
    const drag = { kind, setView, xToIdx, view, plotBounds, cv };
    if (kind === 'pan') { drag.grabIdx = xToIdx(x, p); drag.start = v.start; drag.end = v.end; }
    else if (kind === 'new') drag.anchor = xToIdx(x, p);
    clsBrushDrag = drag;
    cv.style.cursor = kind === 'pan' ? 'grabbing' : cursorFor(kind);
    draw();
    ev.preventDefault();
  });
  cv.addEventListener('dblclick', () => setView(0, n - 1));

  // listeners de janela são globais e o painel é re-renderizado a cada render:
  // registrá-los uma vez só evita empilhar um por render.
  if (!clsBrushWindowWired) {
    clsBrushWindowWired = true;
    window.addEventListener('mousemove', ev => {
      const d = clsBrushDrag;
      if (!d || !d.cv || !d.cv.isConnected) return;
      const r = d.cv.getBoundingClientRect();
      const x = Math.max(0, Math.min(r.width, ev.clientX - r.left));
      const idx = d.xToIdx(x, d.plotBounds()), v = d.view();
      if (d.kind === 'left') d.setView(Math.min(idx, v.end - CLS_BRUSH_MIN_SPAN + 1), v.end);
      else if (d.kind === 'right') d.setView(v.start, Math.max(idx, v.start + CLS_BRUSH_MIN_SPAN - 1));
      else if (d.kind === 'pan') d.setView(d.start + (idx - d.grabIdx), d.end + (idx - d.grabIdx));
      else if (d.kind === 'new') {
        const a = Math.min(d.anchor, idx), b = Math.max(d.anchor, idx);
        if (b - a + 1 >= CLS_BRUSH_MIN_SPAN) d.setView(a, b);
      }
    });
    window.addEventListener('mouseup', () => {
      const d = clsBrushDrag;
      clsBrushDrag = null;
      if (d && d.cv && d.cv.isConnected) d.cv.style.cursor = '';
      if (clsBrushRedraw) clsBrushRedraw();
    });
    window.addEventListener('resize', () => { if (clsBrushRedraw) clsBrushRedraw(); });
  }

  // classificar só a faixa: recorta o log pelos timestamps dela e roda o motor de novo.
  // O local chat leva uma folga PARA TRÁS porque o cast que produz o dano do primeiro
  // turno pode estar segundos antes dele (a granada explode em [cast+2, cast+4]). No
  // server log a folga não existe: ela criaria turnos fora da faixa pedida.
  btn.addEventListener('click', () => {
    if (!clsTurnView) return;
    const a = tr[clsTurnView.start], b = tr[clsTurnView.end];
    if (!a || !b) return;
    $('clsStatus').textContent = t('cls_brush_running');
    try {
      const sv = clsSliceLogByTs($('clsServerInput').value, a.ts, b.ts + 1);
      const lc = clsSliceLogByTs($('clsLocalInput').value, a.ts - 5, b.ts + 1);
      const sliced = classifyWithLocalChat(sv, lc, { trace: true });
      clsTurnView = null;
      clsSliceActive = true;
      lastClsResult = sliced;
      renderClassifier(sliced);
      $('clsStatus').textContent = t('cls_status_done');
    } catch (err) {
      $('clsStatus').textContent = 'erro: ' + err.message;
      console.error(err);
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!clsSliceActive) { setView(0, n - 1); return; }
      // O resultado em vigor é de uma faixa: voltar ao todo é reclassificar a sessão.
      // Os textareas nunca foram tocados pelo recorte, então ainda têm o log completo.
      $('clsStatus').textContent = t('cls_status_running');
      try {
        const full = classifyWithLocalChat($('clsServerInput').value, $('clsLocalInput').value, { trace: true });
        clsTurnView = null;
        clsSliceActive = false;
        lastClsResult = full;
        renderClassifier(full);
        $('clsStatus').textContent = t('cls_status_done');
      } catch (err) {
        $('clsStatus').textContent = 'erro: ' + err.message;
        console.error(err);
      }
    });
  }

  draw();
  syncHead();
}


// Marca de turno sem classificação, rente ao eixo X dos gráficos de turno.
const clsUnresolvedTicksPlugin = {
  id: 'clsUnresolvedTicks',
  beforeDatasetsDraw(chart) {
    const flags = chart.$clsUnresolved;
    if (!flags || !flags.length) return;
    const area = chart.chartArea, ctx = chart.ctx, xs = chart.scales.x;
    const from = clsTurnView ? clsTurnView.start : 0;
    const to = clsTurnView ? clsTurnView.end : flags.length - 1;
    ctx.save();
    ctx.fillStyle = 'rgba(248,113,113,.75)';
    for (let i = from; i <= to; i++) {
      if (!flags[i]) continue;
      const x = xs.getPixelForValue(i);
      ctx.fillRect(x - 1, area.bottom - 4, 2, 4);
    }
    ctx.restore();
  }
};
if (typeof Chart !== 'undefined' && !Chart.registry.plugins.get('clsUnresolvedTicks')) {
  Chart.register(clsUnresolvedTicksPlugin);
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
  // Labels como STRING de propósito: assim `scales.x.min/max` numérico é lido pelo
  // CategoryScale como ÍNDICE de turno. Com labels numéricos ele procuraria o VALOR no
  // array e a faixa sairia deslocada de um.
  const labels = series.map((_, i) => String(i + 1));
  const gridColor = 'rgba(139,164,194,0.1)';
  const toRgba = (hex, a) => { const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(h => parseInt(h, 16)); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };
  const scales = yTitle => ({
    x: {
      grid: { color: gridColor }, ticks: { color: '#8BA4C2', font: { size: 10 }, maxTicksLimit: 12 },
      title: { display: true, text: t('val_axis_turn'), color: '#8BA4C2' },
      min: clsTurnView ? clsTurnView.start : undefined,
      max: clsTurnView ? clsTurnView.end : undefined
    },
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
      const chart = new Chart(cv, {
        type: 'line',
        data: { labels, datasets: [{ label: title_, data, borderColor: color, backgroundColor: toRgba(color, 0.12), borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4, tension: .25 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: CLS_CHART_INDEX_INTERACTION,
          hover: CLS_CHART_INDEX_INTERACTION,
          onClick: clsChartClickHandler(res, hit => clsTurnByDataIndex(res, hit.index), CLS_CHART_INDEX_INTERACTION),
          plugins: {
            legend: { display: false },
            title: { display: true, text: title_, color: '#DDE6F3' },
            tooltip: { enabled: false, external: clsChartExternalTooltip({}) }
          },
          scales: scales()
        }
      });
      chart.$clsCrosshair = true;
      return chart;
    } catch (err) { console.error('[classifier chart] failed:', canvasId, err); return null; }
  };
  // componentes por turno — uma linha por componente/spell REAL da rotação (das linhas
  // observadas), não o set fixo do validador. Assim pega as spells de qualquer vocação e
  // não inventa runa/granada quando não há. Usa o hitsTimeline alinhado de cada linha.
  const rankedForCharts = clsRowsByDamage(res);
  const compRows = rankedForCharts.rows.filter(r =>
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
        data: { labels, datasets: compRows.map(r => {
          const color = rankedForCharts.colorOf(r);
          return {
            label: clsRowLabel(r),
            data: componentTimeline(r),
            borderColor: color, backgroundColor: color,
            borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.35, fill: false
          };
        }) },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: CLS_CHART_INDEX_INTERACTION,
          hover: CLS_CHART_INDEX_INTERACTION,
          onClick: clsChartClickHandler(res, hit => clsTurnByDataIndex(res, hit.index), CLS_CHART_INDEX_INTERACTION),
          plugins: {
            legend: { labels: { color: '#8BA4C2', font: { size: 11 } } },
            title: { display: true, text: componentTitle, color: '#DDE6F3' },
            tooltip: { enabled: false, external: clsChartExternalTooltip({ hideZeros: true, showTotal: true }) }
          },
          scales: scales(componentMetric === 'damage' ? t('cls_metric_damage') : t('cls_metric_hits'))
        }
      });
      clsTimelineComponentsChart.$clsCrosshair = true;
    } catch (err) { console.error('[classifier chart] failed: clsTimelineComponents', err); }
  }
  clsTimelineHitsChart = lineChart('clsTimelineHits', selectedHits, t('val_timeline_hits'), '#3B82F6');
  clsTimelineDamageChart = lineChart('clsTimelineDamage', selectedDamage, t('val_timeline_damage'), '#F59E0B');
  clsImpactChart = lineChart('clsImpactAnalyser', movingImpact(selectedSeries), t('val_impact_analyser'), '#3B82F6');

  // Os quatro gráficos de turno seguem a mesma faixa e mostram as mesmas marcas de turno
  // sem classificação. O scroll sobre qualquer um deles dá zoom ancorado no turno que
  // está debaixo do cursor.
  const unresolvedFlags = clsUnresolvedFlags(res);
  clsBrushCharts = [clsTimelineComponentsChart, clsTimelineHitsChart, clsTimelineDamageChart, clsImpactChart].filter(Boolean);
  for (const chart of clsBrushCharts) {
    chart.$clsUnresolved = unresolvedFlags;
    chart.canvas.addEventListener('wheel', ev => {
      if (!clsBrushSetView || labels.length < 2) return;
      const area = chart.chartArea;
      const px = ev.clientX - chart.canvas.getBoundingClientRect().left;
      if (px < area.left || px > area.right) return;
      ev.preventDefault();
      const v = clsTurnView || { start: 0, end: labels.length - 1 };
      const span = v.end - v.start + 1;
      const newSpan = Math.max(8, Math.min(labels.length, Math.round(span * (ev.deltaY > 0 ? 1.25 : 0.8))));
      const frac = (px - area.left) / Math.max(1, area.right - area.left);
      const anchor = v.start + frac * (span - 1);
      clsBrushSetView(anchor - frac * (newSpan - 1), anchor - frac * (newSpan - 1) + newSpan - 1);
    }, { passive: false });
  }
  for (const d of (compDefs || [])) {
    renderSmallComponentHistogram(d.canvas, c => { clsRowHistCharts.push(c); }, d.vals, null, d.label, undefined, d.color, {
      onClick: clsChartClickHandler(res, (hit, chart) => {
        const n = Number(chart.data && chart.data.labels ? chart.data.labels[hit.index] : hit.index);
        const row = d.row;
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
    clsTurnView = null;   // classificação nova = faixa volta a ser a sessão inteira
    clsSliceActive = false;
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
