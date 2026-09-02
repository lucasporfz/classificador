/*
 * Resumo de sessão: leech inferido, charms equipados, perks e dano de charm.
 *
 * Tudo aqui é LEITURA do resultado que o motor Unified já produziu (`res.unifiedSource`).
 * Nenhuma decisão de classificação é tomada neste arquivo — ele não infere componente,
 * não reverte dano e não altera turno. É camada de exibição.
 *
 * A única coisa que ele ESCREVE é o fold-in opcional do dano de charm nas linhas da
 * rotação (`clsCharmApplyToRows`), e mesmo essa escrita é reversível a partir de um
 * snapshot: com o switch desligado, `res.rows` volta byte a byte ao que o adaptador
 * entregou. Ver a regra de layout em `clsCharmPlus`.
 *
 * Carrega ANTES de js/app.js (escopo global compartilhado, ver index.html).
 */

/* Charm de dano é logado com o nome dentro do parêntese, mas nem sempre no começo dele:
   "(active prey bonus, overflux charm, increased damage by Expose Weakness)". Ancorar no
   "(" perdia o nome nesses casos, então ancoramos no separador imediatamente anterior. */
const CLS_CHARM_NAME_RE = /(?:^|[(,]\s*)([a-zA-Z' -]+?)\s+charm/i;

/* Cores dos charms na ficha: identificam o charm, não o componente. */
const CLS_CHARM_PALETTE = ['#F87171', '#F59E0B', '#A78BFA', '#38BDF8', '#34D399', '#F472B6'];

/* Estado do switch "somar dano de charm ao componente". Off por padrão: a tabela de
   rotação é a mesma que valida o motor, e o default tem de ser o número do motor. */
let clsCharmDamageOn = false;

function clsCharmClock(ts) {
  ts = Number(ts) || 0;
  return [Math.floor(ts / 3600) % 24, Math.floor((ts % 3600) / 60), Math.floor(ts % 60)]
    .map(v => String(v).padStart(2, '0')).join(':');
}

/*
 * Atribuição do dano de charm ao componente que o disparou.
 *
 * Um proc de charm vem de UM hit, e o servidor grava a linha do charm IMEDIATAMENTE ANTES
 * da linha do hit que o disparou (mesmo mob, mesmo segundo). Quando o proc mata o alvo não
 * existe linha de dano visível — nesse caso o hit existe como hit VIRTUAL de dano zero
 * criado pelo motor por charm-kill (S-014e), e é ele que nomeia o componente.
 *
 * Medido no corpus: `tom` 92/92 e `uhax 2` 420/420 procs atribuídos (89+3 e 401+19).
 * `moonsilver` deixa 9 de 150 sem atribuição porque o motor só criou 1 hit virtual na
 * sessão — é lacuna de cobertura de S-014e, não ambiguidade da regra, e esses procs
 * aparecem como "charm sem hit correspondente" em vez de sumirem da soma.
 */
function clsCharmAttribution(unified) {
  const server = (unified && unified.facts && unified.facts.server) || {};
  const events = server.events || [];
  const compOfHit = new Map();
  const virtuals = [];
  (unified.turns || []).forEach(turn => {
    (turn.components || []).forEach(comp => {
      const label = comp.actionLabel || comp.label || comp.comp;
      (comp.hits || []).forEach(hit => {
        compOfHit.set(hit.id, label);
        if (hit.virtual) virtuals.push({ ts: hit.ts, mob: hit.mob, label });
      });
    });
  });

  const byComponent = new Map();
  const unattributed = { dmg: 0, procs: 0 };
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind !== 'charm') continue;
    let j = i + 1;
    while (j < events.length && events[j].kind !== 'hit') j++;
    const next = events[j];
    let label = null;
    if (next && next.ts === ev.ts && next.mob === ev.mob && compOfHit.has(next.id)) {
      label = compOfHit.get(next.id);
    }
    if (!label) {
      const virtual = virtuals.find(v => v.ts === ev.ts && v.mob === ev.mob);
      if (virtual) label = virtual.label;
    }
    if (!label) { unattributed.dmg += ev.dmg; unattributed.procs++; continue; }
    const cur = byComponent.get(label) || { dmg: 0, procs: 0 };
    cur.dmg += ev.dmg; cur.procs++;
    byComponent.set(label, cur);
  }
  return { byComponent, unattributed };
}

/* Charms equipados: os de dano têm linha própria (kind 'charm'); low blow e savage blow
   NÃO têm — marcam o próprio hit principal, então são lidos das flags do hit. */
function clsCharmsEquipped(unified) {
  const server = (unified && unified.facts && unified.facts.server) || {};
  const charms = [];
  const byName = new Map();
  let total = 0;
  (server.events || []).forEach(ev => {
    if (ev.kind !== 'charm') return;
    const match = CLS_CHARM_NAME_RE.exec(ev.rawLine || '');
    const name = (match ? match[1] : '?').trim().toLowerCase();
    let charm = byName.get(name);
    if (!charm) { charm = { name, procs: 0, dmg: 0, byMob: new Map(), kind: 'damage' }; byName.set(name, charm); charms.push(charm); }
    charm.procs++; charm.dmg += ev.dmg;
    charm.byMob.set(ev.mob, (charm.byMob.get(ev.mob) || 0) + ev.dmg);
    total += ev.dmg;
  });

  const critCharms = { 'low blow': new Map(), 'savage blow': new Map() };
  (server.hits || []).forEach(hit => {
    if (hit.lowBlow) critCharms['low blow'].set(hit.mob, (critCharms['low blow'].get(hit.mob) || 0) + 1);
    if (hit.savageBlow) critCharms['savage blow'].set(hit.mob, (critCharms['savage blow'].get(hit.mob) || 0) + 1);
  });
  Object.keys(critCharms).forEach(name => {
    const byMob = critCharms[name];
    let procs = 0;
    byMob.forEach(v => { procs += v; });
    if (procs) charms.push({ name, procs, dmg: 0, byMob, kind: 'crit' });
  });

  charms.sort((a, b) => (b.dmg - a.dmg) || (b.procs - a.procs));
  charms.forEach((charm, i) => {
    charm.color = CLS_CHARM_PALETTE[i % CLS_CHARM_PALETTE.length];
    let best = null, bestValue = -1;
    charm.byMob.forEach((value, mob) => { if (value > bestValue) { bestValue = value; best = mob; } });
    charm.mob = best || '—';
  });
  return { charms, total };
}

function clsSessionSummaryModel(res) {
  const unified = res && res.unifiedSource;
  if (!unified || unified.error) return null;
  const server = (unified.facts && unified.facts.server) || {};

  const { charms, total: charmTotal } = clsCharmsEquipped(unified);
  const { byComponent, unattributed } = clsCharmAttribution(unified);

  const mobMap = new Map();
  (unified.turns || []).forEach(turn => {
    (turn.components || []).forEach(comp => {
      (comp.hits || []).forEach(hit => {
        const mob = mobMap.get(hit.mob) || { mob: hit.mob, hits: 0, dmg: 0 };
        mob.hits++; mob.dmg += hit.dmg || 0;
        mobMap.set(hit.mob, mob);
      });
    });
  });

  let life = 0, mana = 0;
  (server.hits || []).forEach(hit => { life += hit.lifeLeech || 0; mana += hit.manaLeech || 0; });

  const stamps = (unified.turns || []).map(turn => +turn.ts).filter(Number.isFinite);
  return {
    unified,
    player: unified.selectedSpeaker || res.player || '—',
    vocation: unified.vocation || '—',
    from: stamps.length ? clsCharmClock(Math.min(...stamps)) : '—',
    to: stamps.length ? clsCharmClock(Math.max(...stamps)) : '—',
    turns: (unified.turns || []).length,
    charms,
    charmTotal,
    charmByComponent: byComponent,
    charmUnattributed: unattributed,
    mobs: [...mobMap.values()].sort((a, b) => b.dmg - a.dmg).slice(0, 12),
    life,
    mana,
  };
}

function clsCharmForRow(model, row) {
  if (!model || !row) return null;
  return model.charmByComponent.get(row.label) || null;
}

/*
 * Fold-in do charm nas linhas da rotação, ANTES de app.js montar tabelas e gráficos —
 * assim donut, composição, rotação, dano total e séries saem coerentes entre si, sem
 * remendo de DOM. Só o dano EFETIVO recebe o charm:
 *   - dano BASE não muda (charm não passa por reversão: não crita, não sofre pierce);
 *   - hits médios não mudam (um proc de charm não é um hit a mais).
 * `damageTimeline` recebe o charm rateado pelo próprio perfil de dano da linha, o que
 * mantém os gráficos por turno consistentes com os totais.
 */
function clsCharmApplyToRows(res, model) {
  (res.rows || []).forEach(row => {
    if (!row._clsCharmOriginal) {
      row._clsCharmOriginal = {
        damageTimeline: (row.damageTimeline || []).slice(),
        dmgEff: row.dmgEff,
        dmgEffPerTurn: row.dmgEffPerTurn,
        dmgEffPerHit: row.dmgEffPerHit,
      };
    }
    const original = row._clsCharmOriginal;
    row.damageTimeline = original.damageTimeline.slice();
    row.dmgEff = original.dmgEff;
    row.dmgEffPerTurn = original.dmgEffPerTurn;
    row.dmgEffPerHit = original.dmgEffPerHit;
    if (!clsCharmDamageOn) return;

    const charm = clsCharmForRow(model, row);
    if (!charm || !charm.dmg) return;
    const sum = row.damageTimeline.reduce((acc, v) => acc + (+v || 0), 0);
    if (sum > 0) row.damageTimeline = row.damageTimeline.map(v => (+v || 0) + charm.dmg * (+v || 0) / sum);
    const hits = (+row.hitsMean || 0) * (+row.turns || 0);
    if (row.turns) {
      if (Number.isFinite(+row.dmgEffPerTurn)) row.dmgEffPerTurn = +row.dmgEffPerTurn + charm.dmg / row.turns;
      if (Number.isFinite(+row.dmgEff)) row.dmgEff = +row.dmgEff + charm.dmg / row.turns;
    }
    if (hits && Number.isFinite(+row.dmgEffPerHit)) row.dmgEffPerHit = +row.dmgEffPerHit + charm.dmg / hits;
  });
}

/*
 * REGRA DE LAYOUT: ligar/desligar o switch não pode mover NADA de posição.
 * Por isso o slot do "+N" é emitido sempre — vazio quando não há acréscimo — e tem
 * largura fixa (`.cls-charm-plus`, espelhando o slot da % em `.cls-pct`). Sem isso o
 * span aparecia/sumia e empurrava horizontalmente o número numa coluna alinhada à
 * direita, e a segunda linha do dano total mudava a altura da linha da tabela.
 * Coberto por tests/ui-session-summary.test.mjs.
 */
function clsCharmPlus(value) {
  const text = (value == null || !(value >= 0.5)) ? '' : '+' + clsFmtInt(value);
  return '<span class="cls-charm-plus">' + text + '</span>';
}
function clsCharmPlusBlock(value) {
  const text = (value == null || !(value >= 0.5)) ? '&nbsp;' : '+' + clsFmtInt(value);
  return '<span class="cls-charm-plus cls-charm-plus-block">' + text + '</span>';
}

function clsCharmSwitchHtml(id, model) {
  if (!model) return '';
  let attributed = 0;
  model.charmByComponent.forEach(v => { attributed += v.dmg; });
  if (!attributed) return '';
  return '<label class="cls-switch" for="' + id + '">' +
    '<input type="checkbox" id="' + id + '" class="cls-switch-input" data-cls-charm-switch="1"' +
      (clsCharmDamageOn ? ' checked' : '') + '>' +
    '<span class="cls-switch-track"><span class="cls-switch-knob"></span></span>' +
    '<span class="cls-switch-text">' + t('cls_charm_toggle') +
      ' <b>+' + clsFmtInt(attributed) + '</b></span></label>';
}

/* Cabeçalho de seção que hospeda o switch à direita. */
function clsSectionHeadHtml(labelKey, switchId, model) {
  const tools = clsCharmSwitchHtml(switchId, model);
  return '<h3 class="cls-h' + (tools ? ' cls-h-tools' : '') + '">' + t(labelKey) +
    (tools ? '<span class="cls-headtools">' + tools + '</span>' : '') + '</h3>';
}

function clsSessionSummaryHtml(res, model) {
  if (!model) return '';
  const unified = model.unified;
  const leech = unified.leechSetup || {};
  const esc = clsEscapeHtml;
  const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
  // f2 é local a renderClassifier em app.js; o resumo formata o seu próprio percentual
  const pct = v => (v == null ? '—' : (v * 100).toFixed(2) + '%');

  const spells = (res.damageSpells || []).map(clsSpellNameSafe)
    .concat((res.grenadeSpells || []).map(x => clsSpellNameSafe(x) + ' (' + t('cls_kind_grenade') + ')'));

  const head =
    '<div class="cls-summary-head">' +
      '<div><div class="cls-summary-name">' + esc(model.player) + '</div>' +
      '<div class="cls-summary-sub">' + esc(cap(model.vocation)) + ' · ' + model.from + '–' + model.to +
        ' · ' + model.turns + ' ' + t('cls_summary_turns') + '</div></div>' +
      (spells.length ? '<div class="cls-summary-spells"><div class="cls-summary-lab">' + t('cls_dmg_spell') + '</div>' +
        '<div class="cls-summary-spell-list">' + spells.map(esc).join(' · ') + '</div></div>' : '') +
    '</div>';

  // taxa inferida e total observado do leech na MESMA linha: são o mesmo assunto.
  const leechCard =
    '<div class="cls-summary-card"><div class="cls-summary-lab">' + t('cls_summary_leech') + '</div>' +
      '<div class="cls-kv cls-kv-head"><span></span><b>' + t('cls_summary_rate') + '</b><b>' + t('cls_summary_total') + '</b></div>' +
      '<div class="cls-kv cls-kv3"><span>' + t('cls_summary_life') + '</span>' +
        '<b class="cls-life">' + pct(leech.lifeBase) + '</b><b class="cls-life">' + clsFmtInt(model.life) + '</b></div>' +
      '<div class="cls-kv cls-kv3"><span>' + t('cls_summary_mana') + '</span>' +
        '<b class="cls-mana">' + pct(leech.manaBase) + '</b><b class="cls-mana">' + clsFmtInt(model.mana) + '</b></div>' +
      ((leech.minorLifeCharm || leech.minorManaCharm) ?
        '<div class="cls-kv"><span>' + t('cls_summary_minor_charm') + '</span><b>' +
        esc([leech.minorLifeCharm, leech.minorManaCharm].filter(Boolean)
          .map(c => c.mob + ' +' + pct(c.bonus)).join(' · ')) + '</b></div>' : '') +
    '</div>';

  const charmsCard =
    '<div class="cls-summary-card"><div class="cls-summary-lab">' + t('cls_summary_charms') + '</div>' +
      (model.charms.length ? model.charms.map(charm =>
        '<div class="cls-kv"><span><i class="cls-charm-dot" style="background:' + charm.color + '"></i>' +
          esc(cap(charm.name)) + (charm.kind === 'crit' ? ' <span class="cls-dim">(' + t('cls_summary_crit_charm') + ')</span>' : '') +
        '</span><b class="cls-muted">' + esc(charm.mob) + '</b></div>').join('')
        : '<div class="cls-dim">' + t('cls_summary_none') + '</div>') +
      (model.charmTotal ? '<div class="cls-kv cls-kv-sum"><span>' + t('cls_summary_charm_damage') + '</span>' +
        '<b class="cls-charm">' + clsFmtInt(model.charmTotal) + '</b></div>' : '') +
    '</div>';

  const perks = [
    ['BM (' + t('cls_summary_elem_pierce') + ')', unified.bmPierce ? '+' + pct(unified.bmPierce) : null],
    [t('cls_summary_weapon_pierce'), unified.weaponPhysicalPierce ? '+' + pct(unified.weaponPhysicalPierce) : null],
    [t('cls_summary_bestiary'), (unified.bestiaryClassDamageBonus || {}).bonus
      ? '+' + pct(unified.bestiaryClassDamageBonus.bonus) + ' (' + (unified.bestiaryClassDamageBonus.class || '?') + ')' : null],
    // omegaSetup vive no contexto do motor, não na raiz do resultado
    ['Omega', ((unified._context || {}).omegaSetup || {}).active ? '×' + unified._context.omegaSetup.multiplier : null],
    ['Bounty Talisman', (((unified.bountyTalismanSetup || {}).damage) || {}).multiplier
      ? '×' + unified.bountyTalismanSetup.damage.multiplier : null],
    ['Expose Weakness → mana', leech.exposeWeaknessManaPerk ? t('cls_summary_yes') : null],
  ].filter(p => p[1]);
  // O elemento do auto ataque só é inferido (e só faz diferença) no regime RP.
  if (model.vocation === 'paladin') perks.push([t('cls_summary_aa_element'), cap(unified.aaElement || '—')]);
  const perksCard = !perks.length ? '' :
    '<div class="cls-summary-card"><div class="cls-summary-lab">' + t('cls_summary_perks') + '</div>' +
      perks.map(p => '<div class="cls-kv"><span>' + esc(p[0]) + '</span><b>' + esc(p[1]) + '</b></div>').join('') +
    '</div>';

  const creatures =
    '<div class="cls-summary-card cls-summary-wide"><div class="cls-summary-lab">' + t('cls_summary_creatures') + '</div>' +
      '<table class="cls-table"><thead><tr><th>' + t('cls_summary_creature') + '</th>' +
        '<th style="text-align:right">' + t('cls_summary_hits') + '</th>' +
        '<th style="text-align:right">' + t('cls_summary_damage') + '</th>' +
        '<th style="text-align:right">' + t('cls_summary_charm') + '</th></tr></thead><tbody>' +
      model.mobs.map(mob => {
        const list = model.charms.filter(charm => charm.byMob.get(mob.mob));
        return '<tr><td>' + esc(mob.mob) + '</td>' +
          '<td style="text-align:right">' + clsFmtInt(mob.hits) + '</td>' +
          '<td style="text-align:right">' + clsFmtInt(mob.dmg) + '</td>' +
          '<td style="text-align:right">' + (list.length ? list.map(charm =>
            '<i class="cls-charm-dot" style="background:' + charm.color + '"></i>' + esc(charm.name) +
            (charm.dmg ? ' · ' + clsFmtInt(charm.byMob.get(mob.mob)) : ' <span class="cls-dim">' + charm.byMob.get(mob.mob) + '×</span>')
          ).join(' &nbsp; ') : '<span class="cls-dim">—</span>') + '</td></tr>';
      }).join('') +
      (model.charmUnattributed.procs ?
        '<tr><td class="cls-dim">' + t('cls_summary_charm_orphan') + '</td><td></td><td></td>' +
        '<td style="text-align:right" class="cls-dim">' + clsFmtInt(model.charmUnattributed.dmg) +
        ' (' + model.charmUnattributed.procs + ' ' + t('cls_summary_procs') + ')</td></tr>' : '') +
      '</tbody></table></div>';

  return head + '<div class="cls-summary-cards">' + leechCard + charmsCard + perksCard + '</div>' + creatures;
}
