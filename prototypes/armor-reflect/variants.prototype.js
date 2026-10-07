/* PROTOTYPE — descartável. Pergunta: onde e como mostrar o dano de reflect da ARMADURA do knight?
 * Três variantes na página real do classificador, por ?variant=A|B|C&sample=tom|picture|bastion|tom3.
 * Servido só por serve.prototype.mjs; nenhum arquivo de produção importa este arquivo.
 *
 * Fonte do dado: res.unifiedSource.facts.server.events com kind === 'reflect' — o parser já separa
 * `(damage reflection)` dos hits principais (C-008/D-027). É só LEITURA: nada entra em componente,
 * N_leech, rotação ou reversão. O reflect do PARRY CHARM (`damage reflection, parry charm`) fica de
 * fora por construção (o parser o marca como kind 'charm') e por guarda explícita abaixo.
 */
const protoNames = { A: 'Cartão no resumo', B: 'Linha na rotação', C: 'Seção própria', D: 'Coluna + linhas + efetivo/turno' };
const protoSamples = {
  tom: { label: 'Kikaro · tom (raubritter)', server: 'tom server log.txt', local: 'tom local chat.txt', session: 0 },
  tom3: { label: 'Kikaro · tom 3 (com Bounty)', server: 'tom 3 server log.txt', local: 'tom 3 local chat.txt', session: 0 },
  picture: { label: 'Picture · pack variado', server: 'picture server log.txt', local: 'picture local chat.txt', session: 0 },
  bastion: { label: 'Bastion · raubritter', server: 'bastion server log ek.txt', local: 'bastion local chat ek.txt', session: 0 },
};
const protoQs = new URLSearchParams(location.search);
let protoVariant = protoNames[protoQs.get('variant')] ? protoQs.get('variant') : 'A';
let protoSample = protoSamples[protoQs.get('sample')] ? protoQs.get('sample') : 'tom';
let protoResult = null;
let protoRequest = 0;
let protoChart = null;
const protoCache = new Map();
const pesc = s => clsEscapeHtml(String(s));
const pint = n => clsFmtInt(Math.round(+n || 0));
const ppct = n => (100 * (+n || 0)).toFixed(1) + '%';
const pmob = s => String(s).replace(/(^|\s)\w/g, c => c.toUpperCase());

/* ---------- modelo: só o reflect da armadura ---------- */
function protoReflectModel(res) {
  const u = res && res.unifiedSource;
  if (!u || u.error) return null;
  const events = ((u.facts || {}).server || {}).events || [];
  const armor = [];
  let parryIgnored = 0;
  for (const ev of events) {
    const raw = ev.rawLine || '';
    if (!/damage reflection/i.test(raw)) continue;
    if (/charm/i.test(raw)) { parryIgnored++; continue; } // parry charm: fora do escopo
    if (ev.kind === 'reflect') armor.push(ev);
  }
  const byMob = new Map();
  let total = 0, bounty = 0;
  for (const ev of armor) {
    total += ev.dmg;
    if (ev.bountyTalisman) bounty++;
    const m = byMob.get(ev.mob) || { mob: ev.mob, procs: 0, dmg: 0, min: Infinity, max: 0 };
    m.procs++; m.dmg += ev.dmg; m.min = Math.min(m.min, ev.dmg); m.max = Math.max(m.max, ev.dmg);
    byMob.set(ev.mob, m);
  }
  const mobs = [...byMob.values()].sort((a, b) => b.dmg - a.dmg);
  mobs.forEach(m => { m.avg = m.dmg / m.procs; });

  // dano do jogador = mesma soma do painel de composição (charm desligado)
  const playerTotal = (res.rows || []).reduce((s, r) => s + clsRowTotalEff(r), 0);
  const stamps = (u.turns || []).map(t => +t.ts).filter(Number.isFinite);
  const t0 = stamps.length ? Math.min(...stamps) : 0;
  const t1 = stamps.length ? Math.max(...stamps) + 2 : 0;
  const hours = Math.max(t1 - t0, 1) / 3600;

  // série por minuto: reflect e dano principal do jogador (hits dos turnos)
  const minutes = Math.max(1, Math.ceil((t1 - t0) / 60));
  const refMin = new Array(minutes).fill(0), dmgMin = new Array(minutes).fill(0);
  const bucket = ts => Math.min(minutes - 1, Math.max(0, Math.floor((ts - t0) / 60)));
  armor.forEach(ev => { refMin[bucket(ev.ts)] += ev.dmg; });
  (u.turns || []).forEach(t => (t.components || []).forEach(c => (c.hits || []).forEach(h => { dmgMin[bucket(h.ts)] += h.dmg || 0; })));

  return {
    procs: armor.length, total, bounty, parryIgnored, mobs,
    avg: armor.length ? total / armor.length : 0,
    playerTotal, share: total / Math.max(1, playerTotal + total),
    perHour: total / hours, procsPerHour: armor.length / hours,
    sessionTurns: +res.totalTurns || (u.turns || []).length,
    t0, refMin, dmgMin,
  };
}

/* ---------- A: cartão no resumo + coluna na tabela de criaturas ---------- */
function protoVariantA(box, m) {
  const cards = box.querySelector('.cls-summary-cards');
  if (cards) {
    const card = document.createElement('div');
    card.className = 'cls-summary-card p-ref-card';
    card.innerHTML =
      '<div class="cls-summary-lab">Reflect da armadura</div>' +
      '<div class="p-ref-big">' + pint(m.total) + '</div>' +
      '<div class="p-ref-sub">' + ppct(m.share) + ' do dano total (com reflect)</div>' +
      '<div class="cls-kv"><span>Procs</span><b>' + pint(m.procs) + '</b></div>' +
      '<div class="cls-kv"><span>Média por proc</span><b>' + m.avg.toFixed(1) + '</b></div>' +
      '<div class="cls-kv"><span>Por hora</span><b>' + pint(m.perHour) + '</b></div>' +
      (m.bounty ? '<div class="cls-kv"><span>Com Bounty</span><b>' + pint(m.bounty) + '</b></div>' : '');
    cards.appendChild(card);
  }
  protoCreatureColumn(box, m);
}

function protoCreatureColumn(box, m) {
  const table = box.querySelector('.cls-summary-wide table');
  if (table) {
    const headRow = table.querySelector('thead tr');
    const th = document.createElement('th');
    th.style.textAlign = 'right'; th.className = 'p-ref-col'; th.textContent = 'reflect';
    headRow.insertBefore(th, headRow.children[3]);
    const byMob = new Map(m.mobs.map(x => [x.mob, x]));
    table.querySelectorAll('tbody tr').forEach(tr => {
      const td = document.createElement('td');
      td.style.textAlign = 'right'; td.className = 'p-ref-col';
      const r = byMob.get(tr.children[0].textContent);
      td.innerHTML = r ? pint(r.dmg) + ' <span class="cls-dim">(' + r.procs + '×)</span>' : '<span class="cls-dim">—</span>';
      tr.insertBefore(td, tr.children[3]);
    });
  }
}

/* ---------- B: linha na composição e na tabela de rotação ---------- */
function protoVariantB(box, m) {
  protoShareRow(box, m);
  protoRotationRow(box, m, false);
}

function protoShareRow(box, m) {
  const denom = m.playerTotal + m.total;
  const pct = denom > 0 ? (m.total / denom) * 100 : 0;
  const legend = box.querySelector('.cls-share-legend');
  if (legend) {
    const row = document.createElement('div');
    row.innerHTML =
      '<div class="cls-share-row p-ref-share"><div class="cls-share-name"><span class="cls-share-dot p-ref-dot"></span>Reflect da armadura</div>' +
        '<div class="cls-share-turns">—</div><div class="cls-share-arrow">→</div>' +
        '<div class="cls-share-pct">' + pct.toFixed(1) + '%</div>' +
        '<div class="cls-share-total">' + pint(m.total) + '<span class="cls-charm-plus cls-charm-plus-block">&nbsp;</span></div></div>' +
      '<div class="cls-share-bar"><i class="p-ref-bar" style="width:' + pct.toFixed(1) + '%"></i></div>';
    legend.append(...row.children);
  }
}

/* withSessionTurn (só D): a coluna "dano médio efetivo / turno" já existe, então a célula
   "com crítico / turno" do reflect fica vazia em vez de repetir o mesmo número. */
function protoRotationRow(box, m, withSessionTurn) {
  const denom = m.playerTotal + m.total;
  const pct = denom > 0 ? (m.total / denom) * 100 : 0;
  const rot = box.querySelector('.cls-rotation-table');
  if (rot) {
    const cols = rot.querySelectorAll('thead th').length - (withSessionTurn ? 1 : 0);
    const perTurn = clsRotationDamageMetric === 'turn';
    const effCell = perTurn ? (withSessionTurn ? '—' : m.sessionTurns ? (m.total / m.sessionTurns).toFixed(1) : '—') : m.avg.toFixed(1);
    const tr = document.createElement('tr');
    tr.className = 'p-ref-row';
    tr.title = 'Fora da rotação: o reflect vem do ataque do mob, não de um cast seu. Não entra em turnos, hits nem uptime.';
    const cells = ['<td><span class="cls-share-dot p-ref-dot"></span>Reflect da armadura <span class="p-ref-tag">fora da rotação</span></td>',
      '<td style="text-align:right">' + pint(m.procs) + ' <span class="cls-dim">procs</span></td>',
      '<td style="text-align:right">—</td>'];
    if (cols === 7) cells.push('<td></td>'); // coluna de hits ajustados por grav san
    cells.push('<td style="text-align:right">—</td>',
      '<td style="text-align:right">' + effCell + '<span class="cls-charm-plus"></span></td>');
    if (withSessionTurn) cells.push('<td style="text-align:right" class="p-turn-col">' + (m.total / Math.max(1, m.sessionTurns)).toFixed(1) + '</td>');
    cells.push('<td style="text-align:right">' + pint(m.total) + '<span class="cls-pct">(' + pct.toFixed(1) + '%)</span>' +
        '<span class="cls-charm-plus cls-charm-plus-block">&nbsp;</span></td>');
    tr.innerHTML = cells.join('');
    rot.querySelector('tbody').appendChild(tr);
    const note = document.createElement('p');
    note.className = 'cls-share-note p-ref-note';
    note.textContent = 'Reflect: % sobre dano do jogador + reflect (' + pint(denom) + '). As % das linhas de componente continuam sem o reflect. ' +
      (withSessionTurn ? (perTurn ? '' : 'Dano com crítico do reflect = média por proc. ')
        : (perTurn ? 'Dano efetivo do reflect = total ÷ turnos da sessão.' : 'Dano efetivo do reflect = média por proc.'));
    rot.closest('.cls-table-scroll').after(note);
  }
}

/* ---------- D: coluna de criaturas (A) + linhas hachuradas (B) + dano médio efetivo por turno ----------
 * "Dano médio efetivo / turno" = dano total da linha ÷ TODOS os turnos da sessão (res.totalTurns), não
 * só os turnos em que o componente saiu (que é o que o toggle "Turno" já mostra). É a contribuição
 * média de cada linha a um turno qualquer da hunt: a coluna soma o dano médio por turno da sessão,
 * e o reflect entra na mesma régua dos componentes. */
function protoVariantD(box, m, res) {
  protoCreatureColumn(box, m);
  protoShareRow(box, m);
  const rot = box.querySelector('.cls-rotation-table');
  if (!rot) return;
  const turns = Math.max(1, m.sessionTurns);
  const headRow = rot.querySelector('thead tr');
  const totalIdx = headRow.children.length - 1; // "dano total" é a última coluna
  const th = document.createElement('th');
  th.style.textAlign = 'right';
  th.className = 'p-turn-col';
  th.title = 'Dano total da linha ÷ todos os ' + m.sessionTurns + ' turnos da sessão';
  th.innerHTML = '<div class="cls-th-inner"><span>Dano médio efetivo / turno</span></div>';
  headRow.insertBefore(th, headRow.children[totalIdx]);
  const colgroup = rot.querySelector('colgroup');
  if (colgroup) {
    const col = document.createElement('col');
    col.style.width = '120px';
    colgroup.insertBefore(col, colgroup.children[totalIdx]);
    rot.style.minWidth = (parseInt(rot.style.minWidth, 10) || 0) + 120 + 'px';
  }
  // As <tr> do tbody seguem clsRowsByDamage: linha principal (com data-cls-comp) e, logo depois, os tiers dela.
  const ranked = clsRowsByDamage(res).rows;
  let r = -1, tierIdx = 0;
  let sum = 0;
  rot.querySelectorAll('tbody tr').forEach(tr => {
    let value;
    if (tr.hasAttribute('data-cls-comp')) {
      r++; tierIdx = 0;
      value = clsRowTotalEff(ranked[r]) / turns;
      sum += value;
    } else {
      const row = ranked[r], tier = row && (row.tiers || [])[tierIdx++];
      value = tier ? Math.round((+tier.dmgEffPerTurn || 0) * row.turns) / turns : null;
    }
    const td = document.createElement('td');
    td.style.textAlign = 'right';
    td.className = 'p-turn-col';
    td.textContent = value == null ? '' : value.toFixed(1);
    tr.insertBefore(td, tr.children[totalIdx]);
  });
  protoRotationRow(box, m, true);
  sum += m.total / turns;
  const foot = document.createElement('tfoot');
  const pad = '<td></td>'.repeat(totalIdx - 1);
  foot.innerHTML = '<tr class="p-turn-foot"><td>Total da sessão <span class="cls-dim">(' + m.sessionTurns + ' turnos, com reflect)</span></td>' + pad +
    '<td style="text-align:right" class="p-turn-col">' + sum.toFixed(1) + '</td>' +
    '<td style="text-align:right">' + pint(m.playerTotal + m.total) + '<span class="cls-pct"></span><span class="cls-charm-plus cls-charm-plus-block">&nbsp;</span></td></tr>';
  rot.appendChild(foot);
  protoHeaderTips(box, m);
}

/* ---------- D: tooltip em cada cabeçalho ----------
 * Textos tirados do que o código calcula (buildRotationRows em js/unified-main.js, clsTurnUptimeDen,
 * clsGravSanAdjustedHits e clsSessionSummaryModel em js/app.js e js/session-summary.js). */
function protoHeaderTips(box, m) {
  const perTurn = clsRotationDamageMetric === 'turn';
  const rot = box.querySelector('.cls-rotation-table');
  if (rot) {
    const ths = [...rot.querySelectorAll('thead th')];
    const withGravSan = ths.length === 8;
    const tips = [
      'Uma linha por componente da rotação: auto ataque e cada spell, runa ou granada pelo nome. As sub-linhas (└) dividem os hits do componente por estágio ou bônus (por exemplo, Executioner\'s Throw com e sem bônus). A linha hachurada é o reflect da armadura: não é um componente, porque vem do ataque do mob e não de uma ação sua.',
      'Em quantos turnos o componente saiu (turnos parciais da borda do log ficam de fora). Entre parênteses fica o uptime: a % sobre os turnos em que ele poderia ter saído, ou seja, os turnos com auto ataque esperado para o AA e os turnos com spell/runa/granada esperada para os demais. Por isso a coluna não fecha 100%. No reflect, mostra quantos procs houve.',
      'Média de hits por turno, contando só os turnos em que o componente saiu. Em AoE, é o número de alvos atingidos.',
    ];
    if (withGravSan) tips.push('Hits médios com o ganho do utevo grav san: hits méd × (1 + bônus do tapete × parcela dos hits deste componente que caíram sob o tapete). Sem nenhum hit sob o tapete, repete o hits méd.');
    tips.push(
      perTurn
        ? 'Dano que o componente daria por turno sem crítico: hits méd × dano médio por hit sem crítico. Por hit, conta só a média dos hits que NÃO foram crítico, com o bônus de prey e o do grav san removidos.'
        : 'Média dos hits que NÃO foram crítico (os críticos ficam fora da média), com o bônus de prey e o do grav san removidos.',
      perTurn
        ? 'Dano observado por turno, com os críticos como saíram, contando só os turnos em que o componente saiu. Mede o tamanho de um turno desse componente. No reflect fica vazio, porque a coluna ao lado já dá o valor por turno.'
        : 'Dano observado por hit: dano total ÷ total de hits, com os críticos como saíram. No reflect, é a média por proc.',
      'Dano total da linha ÷ TODOS os ' + m.sessionTurns + ' turnos da sessão, inclusive os turnos em que ela não saiu. Mostra quanto a linha contribui para um turno qualquer da hunt. A coluna soma o dano médio por turno da sessão (rodapé), e o reflect entra na mesma régua.',
      'Soma do dano observado da linha na sessão. Entre parênteses: a % sobre o dano do jogador (sem o reflect), que fecha 100% entre os componentes. No reflect, a % é sobre jogador + reflect.',
    );
    ths.forEach((th, i) => { if (tips[i]) th.setAttribute('data-p-tip', tips[i]); });
  }

  const creatures = box.querySelector('.cls-summary-wide table');
  if (creatures) {
    const tips = [
      'As 12 criaturas que mais receberam dano dos seus componentes da rotação.',
      'Quantos hits seus de componentes da rotação acertaram essa criatura. Não conta charm, reflect nem field.',
      'Dano observado desses hits, com os críticos como saíram.',
      'Dano total do reflect da armadura nessa criatura. Entre parênteses fica o número de procs. Não inclui o reflect do parry charm.',
      'Charms vistos nessa criatura. Charms de dano (overpower, wound etc.) mostram o dano somado. Low blow e savage blow mostram quantas vezes marcaram um hit seu.',
      'Minor charms de leech (Vampiric Embrace = vida, Void\'s Call = mana), inferidos pelo excesso de leech nessa criatura.',
    ];
    creatures.querySelectorAll('thead th').forEach((th, i) => { if (tips[i]) th.setAttribute('data-p-tip', tips[i]); });
  }

  const shareHead = box.querySelector('.cls-share-head');
  if (shareHead) {
    const tips = [
      'Componentes ordenados por dano observado total, com as mesmas cores da tabela de rotação. A linha hachurada é o reflect da armadura.',
      'Uptime: o mesmo % da coluna "turnos" da rotação. Não fecha 100%.',
      '',
      'Composição: a parcela do dano do jogador que coube a cada componente. Fecha 100% entre os componentes. O reflect é medido sobre jogador + reflect.',
      'Soma do dano observado do componente na sessão.',
    ];
    [...shareHead.children].forEach((el, i) => { if (tips[i]) el.setAttribute('data-p-tip', tips[i]); });
  }
}

/* Uma camada só, position:fixed, para não ser cortada pelo overflow da tabela. */
const protoTip = document.createElement('div');
protoTip.className = 'p-tip';
document.body.append(protoTip);
document.addEventListener('mouseover', e => {
  const el = e.target.closest && e.target.closest('[data-p-tip]');
  if (!el) { protoTip.style.display = 'none'; return; }
  protoTip.textContent = el.getAttribute('data-p-tip');
  protoTip.style.display = 'block';
  const r = el.getBoundingClientRect();
  const w = protoTip.offsetWidth, h = protoTip.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
  const top = r.bottom + 8 + h > innerHeight ? r.top - h - 8 : r.bottom + 8;
  protoTip.style.left = left + 'px';
  protoTip.style.top = top + 'px';
});
addEventListener('scroll', () => { protoTip.style.display = 'none'; }, true);

/* ---------- C: seção própria com métricas, gráfico por minuto e criaturas ---------- */
function protoVariantC(box, m) {
  const scroll = box.querySelector('.cls-rotation-table') && box.querySelector('.cls-rotation-table').closest('.cls-table-scroll');
  if (!scroll) return;
  let anchor = scroll;
  while (anchor.nextElementSibling && anchor.nextElementSibling.tagName === 'P') anchor = anchor.nextElementSibling;
  const sec = document.createElement('section');
  sec.className = 'p-ref-section';
  sec.innerHTML =
    '<h3 class="cls-h">Reflect da armadura <span class="p-ref-tag">fora da rotação</span></h3>' +
    '<section class="cls-metrics">' +
      [['Dano total', pint(m.total)], ['% do dano (com reflect)', ppct(m.share)], ['Procs · média', pint(m.procs) + ' · ' + m.avg.toFixed(1)], ['Por hora', pint(m.perHour)]]
        .map(([k, v]) => '<div class="cls-metric"><div class="cls-metric-label">' + k + '</div><div class="cls-metric-value">' + v + '</div></div>').join('') +
    '</section>' +
    '<div style="position:relative;height:220px;margin-bottom:12px"><canvas id="protoReflectChart"></canvas></div>' +
    '<table class="cls-table"><thead><tr><th>Criatura</th><th style="text-align:right">Procs</th><th style="text-align:right">Média</th>' +
      '<th style="text-align:right">Mín–máx</th><th style="text-align:right">Total</th><th style="text-align:right">% do reflect</th></tr></thead><tbody>' +
      m.mobs.map(x => '<tr><td>' + pesc(pmob(x.mob)) + '</td><td style="text-align:right">' + pint(x.procs) + '</td>' +
        '<td style="text-align:right">' + x.avg.toFixed(1) + '</td><td style="text-align:right">' + x.min + '–' + x.max + '</td>' +
        '<td style="text-align:right">' + pint(x.dmg) + '</td><td style="text-align:right">' + ppct(x.dmg / Math.max(1, m.total)) + '</td></tr>').join('') +
    '</tbody></table>' +
    '<p class="cls-share-note">Mín baixo = reflect que matou o mob (linha seguida de XP; dano truncado). ' + (m.bounty ? m.bounty + ' procs com Bounty Talisman. ' : '') + '</p>';
  anchor.after(sec);
  if (protoChart) { protoChart.destroy(); protoChart = null; }
  const labels = m.refMin.map((_, i) => clsCharmClock(m.t0 + i * 60).slice(0, 5));
  const sharePerMin = m.refMin.map((r, i) => (r + m.dmgMin[i]) > 0 ? (100 * r) / (r + m.dmgMin[i]) : null);
  protoChart = new Chart(document.getElementById('protoReflectChart'), {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'Reflect por minuto', data: m.refMin, backgroundColor: 'rgba(245,158,11,.55)', yAxisID: 'y' },
        { type: 'line', label: '% do dano no minuto', data: sharePerMin, borderColor: '#7edcc0', pointRadius: 0, borderWidth: 1.5, yAxisID: 'y1', spanGaps: true },
      ],
    },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: '#a9bccf', boxWidth: 12 } } },
      scales: {
        x: { ticks: { color: '#7d93a8', maxTicksLimit: 14 }, grid: { color: 'rgba(40,60,85,.4)' } },
        y: { ticks: { color: '#c79a4a' }, grid: { color: 'rgba(40,60,85,.4)' }, title: { display: true, text: 'reflect', color: '#c79a4a' } },
        y1: { position: 'right', ticks: { color: '#7edcc0', callback: v => (+v).toFixed(1) + '%' }, grid: { display: false } },
      },
    },
  });
}

/* ---------- gancho na renderização real ---------- */
const protoOriginalRender = renderClassifier;
renderClassifier = function(res) {
  protoOriginalRender(res);
  const box = document.getElementById('clsResults');
  const m = protoReflectModel(res);
  if (!m) return;
  if (!m.procs) {
    box.insertAdjacentHTML('afterbegin', '<p class="p-ref-empty">Sem reflect de armadura nesta sessão.</p>');
  } else {
    ({ A: protoVariantA, B: protoVariantB, C: protoVariantC, D: protoVariantD })[protoVariant](box, m, res);
  }
  const state = {
    amostra: protoSamples[protoSample].label, variante: protoVariant,
    procs: m.procs, total: m.total, mediaPorProc: +m.avg.toFixed(2), comBounty: m.bounty,
    danoDoJogador: Math.round(m.playerTotal), parcela: +m.share.toFixed(4), porHora: Math.round(m.perHour),
    parryCharmIgnorado: m.parryIgnored,
    porCriatura: m.mobs.map(x => ({ mob: x.mob, procs: x.procs, total: x.dmg, media: +x.avg.toFixed(2), min: x.min, max: x.max })),
  };
  box.insertAdjacentHTML('beforeend', '<details class="p-ref-state"><summary>Dados usados nesta proposta (iguais nas três variantes)</summary><pre>' +
    pesc(JSON.stringify(state, null, 2)) + '</pre></details>');
};

/* ---------- controles do protótipo ---------- */
const protoLab = document.createElement('div');
protoLab.className = 'p-ref-lab';
document.querySelector('.topbar').after(protoLab);
const protoSwitch = document.createElement('nav');
protoSwitch.className = 'p-ref-switch';
document.body.append(protoSwitch);
function protoControls() {
  protoLab.innerHTML =
    '<div><small>Protótipo descartável · reflect da armadura (sem parry charm)</small><h2>' + protoVariant + ' — ' + protoNames[protoVariant] + '</h2>' +
    '<p>' + ({ A: 'Um cartão a mais no resumo da sessão e uma coluna “reflect” na tabela de criaturas.',
      B: 'O reflect aparece como uma linha à parte na composição e na rotação, marcada como fora da rotação.',
      C: 'Seção própria abaixo da rotação: métricas, reflect por minuto e detalhamento por criatura.',
      D: 'Coluna “reflect” nas criaturas (A), linha hachurada na composição e na rotação (B) e a coluna “dano médio efetivo / turno” (total ÷ todos os turnos da sessão).' })[protoVariant] + '</p></div>' +
    '<label><small style="display:block;margin-bottom:6px">Sessão real</small><select id="protoSample">' +
      Object.entries(protoSamples).map(([k, v]) => '<option value="' + k + '"' + (k === protoSample ? ' selected' : '') + '>' + v.label + '</option>').join('') +
    '</select></label>';
  protoSwitch.innerHTML = '<button data-cycle="-1">←</button>' +
    Object.entries(protoNames).map(([k, n]) => '<button data-variant="' + k + '" class="' + (k === protoVariant ? 'active' : '') + '">' + k + ' · ' + n + '</button>').join('') +
    '<button data-cycle="1">→</button>';
  document.getElementById('protoSample').onchange = e => { protoSample = e.target.value; protoUrl(); protoLoad(); };
}
function protoUrl() { const u = new URL(location); u.searchParams.set('variant', protoVariant); u.searchParams.set('sample', protoSample); history.replaceState(null, '', u); }
function protoChoose(v) { protoVariant = v; protoUrl(); protoControls(); if (protoResult) renderClassifier(protoResult); }
function protoCycle(n) { const k = Object.keys(protoNames); protoChoose(k[(k.indexOf(protoVariant) + n + k.length) % k.length]); }
protoSwitch.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.variant) protoChoose(b.dataset.variant); else protoCycle(+b.dataset.cycle); };
document.addEventListener('keydown', e => {
  if (e.target.closest('input,textarea,select')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); protoCycle(e.key === 'ArrowLeft' ? -1 : 1); }
});

async function protoLoad() {
  const request = ++protoRequest;
  protoResult = null;
  protoControls();
  const box = document.getElementById('clsResults');
  box.style.display = 'block';
  const s = protoSamples[protoSample];
  if (!protoCache.has(protoSample)) {
    const started = Date.now();
    const tick = setInterval(() => { box.innerHTML = '<p class="p-ref-empty">Classificando a sessão real… ' + Math.round((Date.now() - started) / 1000) + 's</p>'; }, 500);
    try {
      const [sv, lc] = await Promise.all([s.server, s.local].map(f => fetch('/logs/' + encodeURIComponent(f)).then(r => r.text())));
      const svText = clsSplitSessions(sv)[s.session].text, lcText = clsSplitSessions(lc)[s.session].text;
      const res = await ClassifyPort.classify(svText, lcText, { trace: true }).promise;
      protoCache.set(protoSample, res);
    } finally { clearInterval(tick); }
  }
  if (request !== protoRequest) return;
  protoResult = protoCache.get(protoSample);
  setLastClassifierResult(protoResult);
  renderClassifier(protoResult);
}
protoLoad();
