/*
 * ranking-ui.js — seção e janela de aceites do ranking (PREVIEW: só index-ranking.html carrega).
 *
 * Não altera js/app.js nem o motor: embrulha `ClassifyPort.classify` para receber cada resultado
 * completo (sessão inteira, nunca a fatia do gráfico) e cuida do resto: resumo, aceites, envio ao
 * Supabase e leitura da posição. A UI é em inglês de propósito (decisão do usuário).
 */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://uufjudpimzfovzxblsni.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_oiO0_nZHSQzvAlEgma6cPw_UvAI4HA8';   // chave publishable (pública)
  const CUTOFF_KEY = 20260616, MIN_TURNS = 50, MAX_UNRESOLVED = 20;
  const SPAWNS_URL = 'docs/data/tibiainfo-spawns-2026-11.json';

  const RS = window.RankingSessionSummary;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');

  // run = id crescente: um resultado atrasado de uma classificação antiga não sobrescreve a nova.
  const S = { run: 0, phase: 'idle', summary: null, texts: null, key: null, reason: null, hash: null, sessionId: null, scope: 'hunt', best: false, busy: false };

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

  // ---------- recebe cada classificação da UI ----------
  const orig = window.ClassifyPort;
  window.ClassifyPort = Object.freeze(Object.assign({}, orig, {
    classify(sv, lc, opts, handlers) {
      const run = orig.classify(sv, lc, opts, handlers);
      const id = ++S.run;
      S.phase = 'classifying'; render();
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
      if (!reason) await lookupExisting(id);
    } catch (e) { if (id === S.run) { Object.assign(S, { phase: 'ineligible', reason: 'Ranking unavailable: ' + e.message }); render(); } }
  }

  // Se este mesmo par de logs já foi enviado, mostra a posição sem reenviar (só o hash trafega).
  async function lookupExisting(id) {
    const r = await sb.rpc('ranking_session_by_hash', { p_log_hash: S.hash });
    if (id !== S.run || r.error || !r.data) return;
    S.sessionId = r.data; S.phase = 'submitted'; render(); loadStanding();
  }

  // ---------- render ----------
  const BAND = lvl => { const lo = Math.floor(lvl / 250) * 250; return lo + '–' + (lo + 250); };
  const SCOPES = () => [['hunt', 'Hunt'], ['hunt_level', 'Hunt · level ' + (S.summary ? BAND(S.summary.level) : '')], ['vocation', 'All ' + (S.summary ? S.summary.vocation : '') + 's']];
  const MODES = [[false, 'All sessions'], [true, 'Best of each player']];

  function render() {
    const el = $('rankingBody'); if (!el) return;
    const btn = $('btnRanking');
    if (S.phase === 'idle') { el.innerHTML = '<p class="rk-muted">Classify a session, then press <b>Ranking</b> to join. Your position among the other players appears here.</p>'; return; }
    if (S.phase === 'classifying') { el.innerHTML = '<p class="rk-muted">Classifying…</p>'; return; }
    if (S.phase === 'ineligible') { el.innerHTML = '<p class="rk-warn">This session can\'t be ranked: ' + esc(S.reason) + '</p>'; return; }
    if (S.phase === 'ready') {
      const s = S.summary;
      el.innerHTML = '<p class="rk-muted"><b>' + esc(s.player) + '</b> · ' + esc(s.vocation) + ' · level ' + s.level + ' · ' + esc(s.hunt || '') + ' · ' + fmt(s.totalTurns) + ' turns. Not in the ranking yet.</p>' +
        '<div class="rk-actions" style="justify-content:flex-start"><button id="rkJoin" class="btn-blue">Join the ranking</button></div>';
      $('rkJoin').onclick = openModal; return;
    }
    if (S.phase === 'submitted') {
      el.innerHTML = '<div id="rkStanding"><p class="rk-muted">Loading your ranking…</p></div>';
      if (S.standing) renderStanding();
    }
  }

  async function loadStanding() {
    const args = { p_session: S.sessionId, p_scope: S.scope, p_best: S.best };
    const [rows, score] = await Promise.all([sb.rpc('ranking_standing', args), sb.rpc('ranking_score', args)]);
    const box = $('rkStanding'); if (!box) return;
    if (rows.error || score.error) { box.innerHTML = '<p class="rk-err">' + esc((rows.error || score.error).message) + '</p>'; return; }
    S.standing = { rows: rows.data || [], score: score.data && score.data[0] };
    renderStanding();
  }

  function metricName(m) {
    if (m.metric === 'aa') return 'Auto-attacks per hour';
    if (m.metric === 'cast') return 'Spell & rune casts per hour';
    if (m.metric === 'carpet') return 'Carpet uptime';
    return m.label.split('|').slice(1).join('|') + ' — avg hits (carpet-adjusted)';
  }
  const fmtVal = (m, v) => m.metric === 'carpet' ? (v * 100).toFixed(1) + '%' : m.metric === 'hits' ? v.toFixed(2) : fmt(v);
  const fmtDelta = (m, d) => m.metric === 'carpet' ? (d * 100).toFixed(1) + ' pp' : m.metric === 'hits' ? d.toFixed(2) : fmt(d);

  function cardHtml(m) {
    const v = +m.value, others = (m.others_values || []).map(Number);
    const higher = others.filter(x => x > v), lower = others.filter(x => x < v);
    let delta = '';
    if (higher.length) delta = '<div class="rk-delta up">▲ ' + fmtDelta(m, Math.min(...higher) - v) + ' to pass #' + (m.rank != null ? m.rank - 1 : higher.length) + '</div>';
    else if (lower.length) delta = '<div class="rk-delta lead">★ leading by ' + fmtDelta(m, v - Math.max(...lower)) + '</div>';
    const all = others.concat([v]), lo = Math.min(...all), hi = Math.max(...all), pos = x => hi === lo ? 50 : (x - lo) / (hi - lo) * 100;
    const strip = '<div class="rk-strip">' + others.map(x => '<i class="rk-dot" style="left:' + pos(x).toFixed(1) + '%"></i>').join('') + '<i class="rk-dot me" style="left:' + pos(v).toFixed(1) + '%"></i></div>';
    const badge = m.tier ? '<span class="rk-badge rk-' + m.tier + (m.provisional ? ' prov' : '') + '" title="' + (m.provisional ? 'Provisional: fewer than 30 players in this group' : '') + '">' + m.tier + '</span>' : '';
    const rank = m.rank != null ? '<b>#' + m.rank + '</b> of ' + m.players : 'needs 3+ players';
    const top = m.top_pct != null ? ' · top <b>' + (+m.top_pct).toFixed(1) + '%</b>' : '';
    return '<div class="rk-card"><div class="rk-card-top"><div class="rk-card-name">' + esc(metricName(m)) + '</div>' + badge + '</div>' +
      '<div class="rk-card-val">' + fmtVal(m, v) + '</div><div class="rk-card-line">' + rank + top + '</div>' + delta + strip + '</div>';
  }

  function renderStanding() {
    const box = $('rkStanding'); if (!box || !S.standing) return;
    const { rows, score } = S.standing, s = S.summary;
    const players = rows.reduce((a, r) => Math.max(a, r.players), 1);
    const tabs = (items, cur, key) => '<div class="rk-tabs">' + items.map(([val, label]) => '<button data-k="' + key + '" data-v="' + val + '" class="' + (val === cur ? 'on' : '') + '">' + esc(label) + '</button>').join('') + '</div>';
    box.innerHTML = tabs(SCOPES(), S.scope, 'scope') + tabs(MODES, S.best, 'best') +
      '<div class="rk-hero"><div class="rk-score">' + (score && score.score != null ? score.score : '–') + '<small>Overall score (0–100)' + (score && score.provisional ? ' · provisional' : '') + '</small></div>' +
      '<div class="rk-id"><b>' + esc(s.player) + '</b><div>' + esc(s.vocation) + ' · level ' + s.level + '</div><div>' + esc(s.hunt || '') + ' · ' + players + ' player' + (players === 1 ? '' : 's') + ' in this group</div></div></div>' +
      '<div class="rk-cards">' + (rows.length ? rows.map(cardHtml).join('') : '<p class="rk-muted">No comparable players in this group yet.</p>') + '</div>' +
      (players < 30 ? '<p class="rk-muted">Tiers are provisional (dashed) until there are 30 or more players in the group.</p>' : '') +
      '<div class="rk-info"><div class="cls-metric"><div class="cls-metric-label">Highest damage in a turn</div><div class="cls-metric-value">' + fmt(s.maxTurnDamage) + '</div></div>' +
      '<div class="cls-metric"><div class="cls-metric-label">Highest single hit</div><div class="cls-metric-value">' + fmt(s.maxSingleHit) + '</div></div></div>' +
      '<p class="rk-muted">Damage numbers are for reference only; they are not ranked and do not enter the score.</p>';
    box.querySelectorAll('.rk-tabs button').forEach(b => b.onclick = () => {
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
        [['Character', s.player], ['Vocation', s.vocation], ['Level', s.level], ['Date', s.date], ['Hunt', s.hunt || '?'], ['Turns', fmt(s.totalTurns)]].map(c => '<div><b>' + c[0] + '</b><span>' + esc(c[1]) + '</span></div>').join('') + '</div>' +
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
        if (/duplicate key|23505/.test(r.error.message + (r.error.code || ''))) { await lookupExisting(S.run); $('rankingModal').close(); S.busy = false; return; }
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
