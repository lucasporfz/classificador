/*
 * ranking-ui.js — seção e janela de aceites do ranking (PREVIEW: só index-ranking.html carrega).
 *
 * Não altera js/app.js nem o motor: embrulha `ClassifyPort.classify` para receber cada resultado
 * completo (sessão inteira, nunca a fatia do gráfico) e cuida do resto: resumo, aceites, envio ao
 * Supabase e leitura da posição. O layout é a porta do protótipo (ranking.proto.html, versão C).
 * A UI é em inglês de propósito (decisão do usuário).
 */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://uufjudpimzfovzxblsni.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_oiO0_nZHSQzvAlEgma6cPw_UvAI4HA8';   // chave publishable (pública)
  const CUTOFF_KEY = 20260616, MIN_TURNS = 50, MAX_UNRESOLVED = 20;
  const SPAWNS_URL = 'docs/data/tibiainfo-spawns-2026-11.json';
  const ICONS_URL = 'docs/data/ranking-icons.json';   // opcional: sem o arquivo, cai no ícone genérico

  const RS = window.RankingSessionSummary;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtInt = n => Math.round(n).toLocaleString('en-US');
  const fmt2 = n => (+n).toFixed(2);
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = iso => { const p = String(iso || '').split('-'); return p.length === 3 ? (+p[2]) + ' ' + MON[+p[1] - 1] + ' ' + p[0] : 'no date'; };
  const MIN_RANK = 3, MIN_CONFIRM = 30;
  const PAL = ['#F59E0B', '#22C55E', '#4A90F7', '#F87171', '#A78BFA', '#FACC15', '#22D3EE', '#FB923C', '#E879F9'];

  // run = id crescente: um resultado atrasado de uma classificação antiga não sobrescreve a nova.
  const S = { run: 0, phase: 'idle', summary: null, texts: null, key: null, reason: null, hash: null, sessionId: null, scope: 'hunt', best: false, busy: false, standing: null, icons: null, preview: undefined };

  // ---------- cabeçalho do log ----------
  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Sept: 9, Oct: 10, Nov: 11, Dec: 12 };
  function headerInfo(text) {
    const m = /^Channel .+ saved \w+ (\w+) +(\d+) \d{2}:\d{2}:\d{2} (\d{4})/m.exec(text || '');
    if (!m) return null;
    const mo = MONTHS[m[1]] || 0;
    return { key: +m[3] * 10000 + mo * 100 + +m[2], iso: m[3] + '-' + String(mo).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0') };
  }
  const headerCount = text => (String(text).match(/^Channel .+ saved /gm) || []).length;

  function eligibility(s, key, svText) {
    if (headerCount(svText) > 1) return 'This text has more than one session. Select a single session in the session picker and classify again.';
    if (!key || key < CUTOFF_KEY) return 'Only sessions saved on or after 16 Jun 2026 (with the "Channel … saved" header) can be ranked.';
    if (!s.player || !s.vocation) return 'Could not identify the character or vocation in this session.';
    if (s.level == null) return 'Could not find the character level in the local chat.';
    if (s.totalTurns < MIN_TURNS) return 'Too few combat turns (' + s.totalTurns + '; at least ' + MIN_TURNS + ' needed).';
    if (s.unresolvedPct > MAX_UNRESOLVED) return s.unresolvedPct.toFixed(1) + '% of the turns could not be classified (limit ' + MAX_UNRESOLVED + '%).';
    return null;
  }

  // ---------- util ----------
  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const gzip = text => new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  function playerSecret() {
    try { let s = localStorage.getItem('rankingSecret'); if (!s) { s = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('rankingSecret', s); } return s; }
    catch (_e) { return crypto.randomUUID() + crypto.randomUUID(); }
  }
  let spawnsCache = null;
  async function spawns() { if (!spawnsCache) spawnsCache = (await (await fetch(SPAWNS_URL)).json()).spawns; return spawnsCache; }
  async function loadIcons() {
    if (S.icons) return S.icons;
    try { const r = await fetch(ICONS_URL); S.icons = r.ok ? await r.json() : { spells: {}, aa: {} }; } catch (_e) { S.icons = { spells: {}, aa: {} }; }
    return S.icons;
  }

  // ---------- recebe cada classificação da UI ----------
  const orig = window.ClassifyPort;
  window.ClassifyPort = Object.freeze(Object.assign({}, orig, {
    classify(sv, lc, opts, handlers) {
      const run = orig.classify(sv, lc, opts, handlers);
      const id = ++S.run;
      Object.assign(S, { phase: 'classifying', standing: null, sessionId: null, preview: undefined }); render();
      run.promise.then(res => onClassified(id, sv, lc, res), () => { if (id === S.run) { S.phase = 'idle'; render(); } });
      return run;
    },
  }));

  async function onClassified(id, sv, lc, res) {
    try {
      const speaker = res && res.unifiedSource && res.unifiedSource.selectedSpeaker;
      const info = headerInfo(sv);
      const summary = RS.summaryFromUiResult(res, { level: RS.levelFromLocalChat(lc, speaker), date: info ? info.iso : null, spawns: await spawns() });
      if (id !== S.run) return;
      if (summary.error) { Object.assign(S, { phase: 'ineligible', summary: null, reason: 'The classification returned an error (' + summary.error + ').' }); return render(); }
      const reason = eligibility(summary, info && info.key, sv);
      Object.assign(S, { phase: reason ? 'ineligible' : 'ready', summary, texts: { sv, lc }, key: info && info.key, reason, sessionId: null,
                         hash: await sha256Hex(sv.trim() + '\n---\n' + lc.trim()) });
      render();
      if (!reason) { await lookupExisting(id); if (id === S.run && S.phase === 'ready') loadPreview(id); }
    } catch (e) { if (id === S.run) { Object.assign(S, { phase: 'ineligible', reason: 'Ranking unavailable: ' + e.message }); render(); } }
  }

  // Se este mesmo par de logs já foi enviado, mostra a posição sem reenviar (só o hash trafega).
  async function lookupExisting(id) {
    const r = await sb.rpc('ranking_session_by_hash', { p_log_hash: S.hash });
    if (id !== S.run || r.error || !r.data) return;
    S.sessionId = r.data; S.phase = 'submitted'; render(); loadStanding();
  }

  // Prévia antes de entrar: só os números do resumo vão ao servidor (nada é gravado) e ele devolve
  // apenas a melhor métrica e contagens. O resto fica travado até o envio.
  async function loadPreview(id) {
    const [r] = await Promise.all([sb.rpc('ranking_preview', { p_summary: S.summary }), loadIcons()]);
    if (id !== S.run || S.phase !== 'ready') return;
    S.preview = r.error ? null : (r.data && r.data[0]) || null;
    render();
  }

  // ---------- helpers de dados ----------
  const BAND = lvl => { const lo = Math.floor(lvl / 250) * 250; return lo + '–' + (lo + 250); };
  const SCOPES = () => [['hunt', 'Hunt'], ['hunt_level', 'Hunt · level ' + BAND(S.summary.level)], ['vocation', 'All ' + S.summary.vocation + 's']];
  const MODES = [[false, 'All sessions'], [true, 'Best of each player']];
  const scopeLabel = () => ({ hunt: S.summary.hunt || 'Hunt', hunt_level: (S.summary.hunt || 'Hunt') + ' · level ' + BAND(S.summary.level), vocation: 'All ' + S.summary.vocation + 's' }[S.scope]);
  const shortLabel = l => l.replace(/\s*\([^)]*\)\s*$/, '');
  const enLabel = l => l === 'Auto ataque' ? 'Auto attack' : l;
  const keyOf = r => r.metric === 'hits' ? r.label : r.metric;   // hits: "kind|label"
  const fmtFor = metric => metric === 'carpet' ? (v => (v * 100).toFixed(1) + '%') : metric === 'hits' ? fmt2 : fmtInt;
  const fmtGap = (metric, d) => metric === 'carpet' ? (d * 100).toFixed(1) + ' pp' : metric === 'hits' ? fmt2(d) : fmtInt(d);
  const tierOfTop = top => top <= 5 ? 'S' : top <= 10 ? 'A' : top <= 50 ? 'B' : top <= 90 ? 'C' : 'D';
  const W = { S: 8, A: 5, B: 3, C: 2, D: 1 };
  const ranked = r => r && r.rank != null && r.tier;

  function tierBadge(r, cls) {
    if (!ranked(r)) return '<span class="tier none ' + (cls || '') + '" title="A tier needs at least ' + MIN_RANK + ' players in the group">–</span>';
    const prov = r.provisional;
    return '<span class="tier ' + r.tier + (prov ? ' prov' : '') + ' ' + (cls || '') + '" title="' + (prov ? 'Provisional tier (only ' + r.players + ' players; ' + MIN_CONFIRM + ' confirm it): ' : '') + 'top ' + Math.max(1, +r.top_pct) + '%">' + r.tier + '</span>';
  }
  function rankRow(r) {
    if (!ranked(r)) return '<div class="rk"><span class="r"><span class="rc"><span class="tier none">–</span><b class="nocmp">no comparison</b></span></span><span class="p"></span></div>';
    const p = r.players >= MIN_CONFIRM ? 'p' + Math.round(r.percentile * 100) : '';
    return '<div class="rk"><span class="r"><span class="rc">' + tierBadge(r) + '<b>#' + r.rank + '</b><i>/ ' + r.players + '</i></span></span><span class="p">' + p + '</span></div>';
  }
  // faixa de dispersão: pontos neutros, você em destaque; linha tracejada = mediana
  function miniStrip(r) {
    const others = (r && r.others_values || []).map(Number);
    if (!others.length) return '<div class="strip empty">No other players to compare yet</div>';
    const v = +r.value, Wd = 240, H = 28, L = 8, R = 8, Y = 14, all = others.concat([v]), lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * .08 || .5, a = lo - pad, b = hi + pad;
    const X = x => L + (x - a) / (b - a) * (Wd - L - R), sorted = [...others].sort((p, q) => p - q), med = X(sorted[Math.floor(sorted.length / 2)]), placed = [];
    const dots = others.map(x => { const px = X(x), k = placed.filter(p => Math.abs(p - px) < 8).length; placed.push(px);
      const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 5;
      return '<circle cx="' + px + '" cy="' + (Y + dy) + '" r="3.5" fill="#7F9CC2" fill-opacity=".55" stroke="#7F9CC2"></circle>'; }).join('');
    return '<div class="strip"><svg class="mini" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="You are #' + r.rank + ' of ' + r.players + '">' +
      '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y + '" y2="' + Y + '" stroke="#1d3350"/><line x1="' + med + '" x2="' + med + '" y1="3" y2="' + (H - 3) + '" stroke="#93AAC8" stroke-dasharray="2 2"/>' +
      dots + '<circle cx="' + X(v) + '" cy="' + Y + '" r="6" fill="#00C49A" stroke="#E6EFF8" stroke-width="2"></circle></svg></div>';
  }
  // o que falta para subir (ou a folga de quem lidera)
  function gapHint(r) {
    if (!ranked(r)) return '';
    const v = +r.value, others = (r.others_values || []).map(Number), f = x => fmtGap(r.metric, x);
    const above = others.filter(x => x > v).sort((a, b) => a - b)[0];
    if (above != null) return '<div class="gap">▲ ' + f(above - v) + ' to pass #' + (r.rank - 1) + '</div>';
    const next = others.filter(x => x < v).reduce((m, x) => Math.max(m, x), -Infinity);
    return Number.isFinite(next) ? '<div class="gap lead">★ leading by ' + f(v - next) + '</div>' : '';
  }
  const FALLBACK_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="9" fill="none" stroke="#7F9CC2" stroke-width="2"/></svg>');
  function spellIcon(row) {
    const ic = S.icons || { spells: {}, aa: {} };
    let own = ic.spells[row.label];
    if (!own && /^auto at/i.test(row.label)) own = ic.aa[S.summary.vocation];
    return '<img class="sicon' + (own ? '' : ' generic') + '" src="' + (own || FALLBACK_ICON) + '" width="32" height="32" alt="" title="' + esc(enLabel(row.label)) + '">';
  }
  function card(o) {
    return '<div class="cls-metric c2' + (o.first ? ' first' : '') + (o.off ? ' off' : '') + '"><div class="mtop"><div class="sp">' + (o.icon || '') +
      '<div class="sptxt"><div class="cls-metric-label" title="' + esc(o.title || o.label) + '">' + esc(o.label) + '</div><div class="cls-metric-value">' + o.value + '</div></div></div>' + (o.tier || '') + '</div>' +
      (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + (o.rank || '') + (o.strip || '') + (o.gap || '') + '</div>';
  }
  const rankedCard = (r, base) => card(Object.assign({ value: fmtFor(r.metric)(+r.value), tier: tierBadge(r, 'bigtier'), rank: rankRow(r), strip: miniStrip(r), gap: gapHint(r), first: ranked(r) && r.rank === 1 }, base));

  // ---------- render ----------
  function render() {
    const el = $('rankingBody'); if (!el) return;
    if (S.phase === 'idle') { el.innerHTML = '<p class="rk-muted">Classify a session to see how you compare with the other players. You can join the rank afterwards.</p>'; return; }
    if (S.phase === 'classifying') { el.innerHTML = '<p class="rk-muted">Classifying…</p>'; return; }
    if (S.phase === 'ineligible') { el.innerHTML = '<p class="rk-warn">This session can\'t be ranked: ' + esc(S.reason) + '</p>'; return; }
    if (S.phase === 'ready') { el.innerHTML = previewHtml(); const j = $('rkJoin'); if (j) j.onclick = openModal; return; }
    if (S.phase === 'submitted') {
      el.innerHTML = '<div id="rkStanding"><p class="rk-muted">Loading your ranking…</p></div>';
      if (S.standing) renderStanding();
    }
  }

  const LOCKS = ['Overall tier & score', 'Rank on every metric', 'Where the other players are', 'What it takes to move up', 'Compare by hunt and level band'];
  function bestCard(p) {
    const s = S.summary, m = p.metric, f = fmtFor(m);
    let label, value, icon = '';
    if (m === 'aa') { label = 'Auto-attacks per hour'; value = s.aa.perHour; }
    else if (m === 'cast') { label = 'Spell & rune casts per hour'; value = s.spellRune.perHour; }
    else if (m === 'carpet') { label = 'Carpet uptime'; value = s.gravSan.uptime; }
    else { const row = s.rows.find(r => r.kind + '|' + r.label === p.label); if (!row) return ''; label = shortLabel(enLabel(row.label)); value = row.hitsAdj != null ? row.hitsAdj : row.hitsMean; icon = spellIcon(row); }
    return card({ icon, label, value: f(+value), tier: tierBadge(p, 'bigtier'), rank: rankRow(p), sub: 'Your best metric in this group', first: p.rank === 1 });
  }
  function previewHtml() {
    const s = S.summary, p = S.preview;
    const who = '<p class="rk-muted" style="margin:0 0 10px"><b>' + esc(s.player) + '</b> · ' + esc(cap(s.vocation)) + ' · level ' + s.level + ' · ' + esc(s.hunt || '') + ' · ' + fmtInt(s.totalTurns) + ' turns</p>';
    const join = '<div class="rk-actions" style="justify-content:flex-start;margin:14px 0 0"><button id="rkJoin" class="btn-blue">Join the rank</button></div>';
    if (p === undefined) return '<div class="rk-box">' + who + '<p class="rk-muted" style="margin:0">Comparing with the other players…</p></div>';
    if (p === null) return '<div class="rk-box">' + who + '<p class="rk-muted" style="margin:0">Not in the rank yet.</p>' + join + '</div>';
    const n = p.group_players;
    const head = '<p class="rk-muted" style="margin:0 0 10px">Preview · you are <b>not in the rank yet</b>. Nothing was saved. Compared with <b>' + n + '</b> other ' + esc(s.vocation) + ' player' + (n === 1 ? '' : 's') + ' in ' + esc(s.hunt || 'this hunt') + '.</p>';
    const open = p.metric ? bestCard(p) : '<div class="cls-metric c2 off"><div class="cls-metric-label">Your position</div><div class="sub">Not enough players in this group to compare yet (3 needed). Join and be one of the first.</div></div>';
    const locked = LOCKS.map((l, i) => '<div class="cls-metric c2 locked"><div class="cls-metric-label">🔒 ' + esc(l) + '</div><div class="lockbar"></div>' + (i === 1 && p.locked > 0 ? '<div class="sub">+' + p.locked + ' more metric' + (p.locked === 1 ? '' : 's') + ' ranked</div>' : '') + '</div>').join('');
    return '<div class="rk-box">' + who + head + '<div class="cls-metrics">' + open + locked + '</div>' + join +
      '<p class="rk-muted" style="margin:10px 0 0">Join to unlock the full ranking. Sends your session summary and logs, with your consent.</p></div>';
  }

  async function loadStanding() {
    const args = { p_session: S.sessionId, p_scope: S.scope, p_best: S.best };
    const [rows] = await Promise.all([sb.rpc('ranking_standing', args), loadIcons()]);
    const box = $('rkStanding'); if (!box) return;
    if (rows.error) { box.innerHTML = '<p class="rk-err">' + esc(rows.error.message) + '</p>'; return; }
    S.standing = rows.data || [];
    renderStanding();
  }

  // Score geral: média dos percentis ponderada pelo tier de cada métrica (só as com tier, isto é, 3+ jogadores).
  function overall(rows) {
    const parts = rows.filter(ranked).map(r => ({ r, pct: Math.round(r.percentile * 100), w: W[r.tier] }));
    if (!parts.length) return null;
    const score = Math.round(parts.reduce((a, p) => a + p.w * p.pct, 0) / parts.reduce((a, p) => a + p.w, 0)), top = 100 - score;
    return { score, top, c: tierOfTop(top), prov: parts.some(p => p.r.provisional) };
  }

  function renderStanding() {
    const box = $('rkStanding'); if (!box || !S.standing) return;
    const rows = S.standing, s = S.summary, by = new Map(rows.map(r => [keyOf(r), r]));
    const seg = (items, cur, key) => '<div class="seg">' + items.map(([v, l]) => '<button type="button" data-k="' + key + '" data-v="' + v + '" class="' + (v === cur ? 'active' : '') + '">' + esc(l) + '</button>').join('') + '</div>';
    const ov = overall(rows);
    const ovHtml = ov
      ? '<div class="ov"><span class="tier ' + ov.c + ' xl' + (ov.prov ? ' prov' : '') + '">' + ov.c + '</span><div><div class="ovl">Overall · ' + esc(scopeLabel()) + '</div><div class="ovs">Score ' + ov.score + ' <span class="ovt">· top ' + Math.max(1, ov.top) + '%' + (ov.prov ? ' · provisional' : '') + '</span></div></div></div>'
      : '<div class="ov"><span class="tier none xl">–</span><div><div class="ovl">Overall · ' + esc(scopeLabel()) + '</div><div class="ovs"><span class="ovt">needs 3+ players in this group</span></div></div></div>';
    const hero = '<div class="hero2">' + ovHtml + '<div class="who"><div class="name">' + esc(s.player) + '</div><div class="meta">' + esc(cap(s.vocation)) + ' · level ' + s.level + ' · ' + esc(s.hunt || '') + ' · ' + fmtDate(s.date) + ' · ' + fmtInt(s.totalTurns) + ' turns</div></div></div>';

    // métricas da sessão (ranqueadas) + referências de dano (sem rank)
    const sess = [];
    const aaRow = by.get('aa');
    if (aaRow) sess.push(rankedCard(aaRow, { label: 'Auto-attacks per hour' }));
    else sess.push(card({ label: 'Auto-attacks per hour', value: '—', off: true, sub: 'Auto-attacks barely show in the log of this session (' + s.aa.pct.toFixed(1) + '% of turns), so it is not ranked.' }));
    if (by.get('cast')) sess.push(rankedCard(by.get('cast'), { label: 'Spell & rune casts per hour' }));
    if (by.get('carpet')) sess.push(rankedCard(by.get('carpet'), { label: 'Carpet uptime' }));
    sess.push(card({ label: 'Highest damage in a turn', value: fmtInt(s.maxTurnDamage), sub: 'Reference only · not ranked' }));
    sess.push(card({ label: 'Highest single hit', value: fmtInt(s.maxSingleHit), sub: 'Reference only · not ranked' }));

    const tot = s.rows.reduce((a, r) => a + r.turns, 0);
    const spellCards = s.rows.map(r => {
      const st = by.get(r.kind + '|' + r.label), label = enLabel(r.label), sub = r.turns + ' turns · ' + (r.turns / tot * 100).toFixed(0) + '% of all';
      const base = { icon: spellIcon(r), label: shortLabel(label), title: label, sub };
      if (st) return rankedCard(st, base);
      return card(Object.assign({ value: fmt2(r.hitsAdj != null ? r.hitsAdj : r.hitsMean), tier: tierBadge(null, 'bigtier'), rank: rankRow(null), strip: '<div class="strip empty">Needs at least 10 turns to compare</div>' }, base));
    }).join('');
    const dmgCards = s.rows.map(r => card({ icon: spellIcon(r), label: shortLabel(enLabel(r.label)), title: enLabel(r.label), value: fmtInt(r.maxTurnDmg),
      sub: r.turns + ' turns · avg ' + fmt2(r.hitsAdj != null ? r.hitsAdj : r.hitsMean) + ' hits · reference only' })).join('');

    const tableRows = s.rows.map((r, i) => { const st = by.get(r.kind + '|' + r.label);
      return '<tr><td><span class="cls-share-dot" style="background:' + PAL[i % PAL.length] + '"></span>' + esc(enLabel(r.label)) + '</td><td class="num">' + r.turns + '<span class="cls-pct">(' + (r.turns / tot * 100).toFixed(1) + '%)</span></td>' +
        '<td class="num">' + fmt2(r.hitsAdj != null ? r.hitsAdj : r.hitsMean) + '</td><td class="rank">' + (st ? rankRow(st).replace(/^<div class="rk">/, '<span>').replace(/<\/div>$/, '</span>') : '<span class="rk-muted">–</span>') + '</td><td class="strip-cell">' + (st ? miniStrip(st) : '') + '</td></tr>'; }).join('');

    box.innerHTML = '<div class="ctrl">' + seg(SCOPES(), S.scope, 'scope') + seg(MODES, S.best, 'best') + '</div>' + hero +
      '<h3 class="cls-h">Session metrics</h3><div class="cls-metrics">' + sess.join('') + '</div>' +
      '<h3 class="cls-h">Spell metrics · adjusted average hits (grav san)</h3><div class="cls-metrics">' + spellCards + '</div>' +
      '<h3 class="cls-h">Spell metrics · highest damage in a turn</h3><div class="cls-metrics">' + dmgCards + '</div>' +
      '<h3 class="cls-h">Components</h3><table class="cls-table"><thead><tr><th>component</th><th class="num">turns</th><th class="num">hits avg</th><th class="rank">rank</th><th>group</th></tr></thead><tbody>' + tableRows + '</tbody></table>' +
      '<p class="note">Tiers use the top % of the group (S ≤5, A ≤10, B ≤50, C ≤90). They are provisional (dashed) until the group has ' + MIN_CONFIRM + ' or more players. The overall score only uses gameplay metrics; damage is shown for reference and does not enter the score.</p>';
    box.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      if (b.dataset.k === 'scope') S.scope = b.dataset.v; else S.best = b.dataset.v === 'true';
      loadStanding();
    });
  }

  // ---------- janela dos aceites ----------
  function openModal() {
    const dlg = $('rankingModal'), body = $('rkModalBody'), s = S.summary;
    if (S.phase === 'idle' || S.phase === 'classifying') body.innerHTML = '<h3>Ranking</h3><p class="rk-muted">Classify a session first.</p><div class="rk-actions"><button class="ghost" id="rkClose">Close</button></div>';
    else if (S.phase === 'ineligible') body.innerHTML = '<h3>Ranking</h3><p class="rk-warn">' + esc(S.reason) + '</p><div class="rk-actions"><button class="ghost" id="rkClose">Close</button></div>';
    else if (S.phase === 'submitted') body.innerHTML = '<h3>Ranking</h3><p class="rk-ok">This session is already in the ranking.</p><div class="rk-actions"><button class="ghost" id="rkClose">Close</button></div>';
    else {
      body.innerHTML = '<h3>Join the ranking</h3><div class="rk-muted">Review what will be sent.</div><div class="rk-kv">' +
        [['Character', s.player], ['Vocation', cap(s.vocation)], ['Level', s.level], ['Date', fmtDate(s.date)], ['Hunt', s.hunt || '?'], ['Turns', fmtInt(s.totalTurns)]].map(c => '<div><b>' + c[0] + '</b><span>' + esc(c[1]) + '</span></div>').join('') + '</div>' +
        '<label class="rk-check"><input type="checkbox" id="rkConsent"><span><b>Upload my session and raw logs.</b> I agree to send this session\'s summary <b>and the full server log and local chat</b> to the ranking server. The local chat may contain other players\' names. I understand the data can be reprocessed and deleted at any time.</span></label>' +
        '<label class="rk-check"><input type="checkbox" id="rkPublic"><span><b>Show my character name.</b> Otherwise I appear as anonymous in the ranking.</span></label>' +
        '<div id="rkMsg" class="rk-muted"></div><div class="rk-actions"><button class="ghost" id="rkClose">Cancel</button><button class="btn-blue" id="rkSubmit" disabled>Submit</button></div>';
      $('rkConsent').onchange = () => { $('rkSubmit').disabled = !$('rkConsent').checked || S.busy; };
      $('rkSubmit').onclick = submit;
    }
    $('rkClose').onclick = () => dlg.close();
    dlg.showModal();
  }

  async function submit() {
    const msg = $('rkMsg'), btn = $('rkSubmit'); S.busy = true; btn.disabled = true; msg.className = 'rk-muted'; msg.textContent = 'Uploading…';
    try {
      const folder = crypto.randomUUID();
      for (const [name, text] of [['server.txt.gz', S.texts.sv], ['local.txt.gz', S.texts.lc]]) {
        const up = await sb.storage.from('ranking-raw-logs').upload(folder + '/' + name, await gzip(text), { contentType: 'application/gzip', upsert: false });
        if (up.error) throw up.error;
      }
      const pub = $('rkPublic').checked;
      const r = await sb.rpc('ranking_submit_session', { p_player_key_hash: await sha256Hex(playerSecret()), p_character_name: pub ? S.summary.player : null,
        p_is_public: pub, p_log_hash: S.hash, p_raw_log_path: folder + '/', p_summary: S.summary });
      if (r.error) {
        if (/duplicate key|23505/.test(r.error.message + (r.error.code || ''))) { S.busy = false; await lookupExisting(S.run); $('rankingModal').close(); return; }
        throw r.error;
      }
      S.sessionId = r.data; S.phase = 'submitted'; S.standing = null; S.busy = false;
      $('rankingModal').close(); render(); loadStanding();
      $('rankingSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      S.busy = false; const m = (e && e.message) || String(e);
      msg.className = 'rk-err'; msg.textContent = /too_many_unclassified/.test(m) ? 'Too many unclassified turns.' : /implausible/.test(m) ? 'Damage values look implausible.' : m;
      btn.disabled = !$('rkConsent').checked;
    }
  }

  $('btnRanking').addEventListener('click', openModal);
  render();
})();
