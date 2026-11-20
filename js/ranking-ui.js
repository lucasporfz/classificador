/*
 * ranking-ui.js — seção e janela de aceites do ranking (PREVIEW: só index-ranking.html carrega).
 *
 * Não altera js/app.js nem o motor: embrulha `ClassifyPort.classify` para receber cada resultado
 * completo (sessão inteira, nunca a fatia do gráfico) e cuida do resto: resumo, aceites, envio ao
 * Supabase e leitura da posição. O layout é a porta do protótipo (ranking.proto.html, versão C).
 * Os textos seguem o idioma escolhido no site (PT/EN), lendo a variável LANG do app (js/i18n.js) sem alterá-la.
 */
(function () {
  'use strict';
  const SUPABASE_URL = 'https://uufjudpimzfovzxblsni.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_oiO0_nZHSQzvAlEgma6cPw_UvAI4HA8';   // chave publishable (pública)
  const CUTOFF_KEY = 20260616, MIN_TURNS = 15, MAX_UNRESOLVED = 20;
  const MIN_PERCENTILE_N = 20;   // card de compartilhar: abaixo disso não mostra percentil, mediana nem faixa
  const SPAWNS_URL = 'docs/data/tibiainfo-spawns-2026-11.json';
  const ICONS_URL = 'docs/data/ranking-icons.json';   // opcional: sem o arquivo, cai no ícone genérico

  const RS = window.RankingSessionSummary;
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Idioma: o app guarda o idioma em LANG ('pt' | 'en'); aqui só se lê.
  const L = () => (typeof LANG !== 'undefined' && LANG === 'en') ? 'en' : 'pt';
  const fmtInt = n => String(Math.round(n));   // sem separador de milhar (1706, não 1.706 nem 1,706): vale para a UI inteira
  const fmt2 = n => (+n).toFixed(2);
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const MONTHS_L = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] };
  const MIN_RANK = 3, MIN_CONFIRM = 30;
  // Cortes dos tiers (percentil): fonte única para o cálculo, a nota da página e o critério no card. D = o restante.
  const TIER_CUTS = [['S', 10], ['A', 30], ['B', 70], ['C', 90]];
  const tierOfTop = top => { for (const [tier, cut] of TIER_CUTS) if (top <= cut) return tier; return 'D'; };

  const T = {
    pt: {
      line_aa: 'auto-ataques por hora', line_cast: 'casts de spell e runa por hora', line_carpet: 'tempo com tapete', line_hits: '{s} · hits por cast', line_aa_hits: 'auto-ataque · hits por turno',
      arrow_physical: 'flecha física', arrow_energy: 'Thunderstorm Arrow', arrow_ice: 'Froststorm Arrow', arrow_fire: 'Firestorm Arrow', arrow_earth: 'Terrastorm Arrow',
      arrow_note: ' O auto-ataque do paladino é comparado só com quem usa o mesmo tipo de flecha: a física e cada elemental têm ranking separado.',
      pos_a: '#{r} de {n}', pos_b: ' · top {p}%', you_lc: 'você', tier_lbl: 'TIER', small_sample: 'amostra pequena · sem percentil', small_note: 'Comparação com a mediana só aparece com {n}+ jogadores neste spot.',
      no_date: 'sem data', anon: 'Anônimo', you: 'Você', you_other: 'Você · outra sessão', turns: 'turnos', all_of: 'Todos os {v}s',
      el_multi: 'Este texto tem mais de uma sessão. Escolha uma única sessão no seletor e classifique de novo.',
      el_date: 'Só sessões salvas a partir de 16 Jun 2026 (com o cabeçalho "Channel … saved") entram no ranking.',
      el_char: 'Não foi possível identificar o personagem ou a vocação desta sessão.',
      el_level: 'Não achei o level do personagem no local chat.',
      el_turns: 'Poucos turnos de combate ({n}; são necessários pelo menos {min}).',
      el_unres: '{pct}% dos turnos não puderam ser classificados (limite {max}%).',
      err_class: 'A classificação retornou um erro ({e}).', err_unavail: 'Ranking indisponível: {e}',
      m_maxturn: 'Maior dano em um turno', m_maxhit: 'Maior hit isolado', m_dmg_sfx: ' · maior dano em um turno',
      m_aa: 'Auto-ataques por hora', m_cast: 'Casts de spell e runa por hora', m_carpet: 'Tempo de tapete',
      u_hits: 'hits por cast', u_hits_aa: 'hits por turno', u_aa: 'auto-ataques por hora', u_cast: 'casts por hora', u_carpet: 'do tempo com tapete',
      auto_attack: 'Auto ataque',
      tip_more: '⋮ mais {n}', tip_median: 'Mediana', tip_prov: 'Menos de {n} jogadores: o tier é provisório.',
      tier_need: 'O tier precisa de pelo menos {n} jogadores no grupo', tier_prov: 'Tier provisório (só {p} jogadores; {c} confirmam): ',
      top: 'top', no_cmp: 'sem comparação', pctl: 'Percentil', pctl_prov: 'Percentil provisório ({n}+ jogadores confirmam)',
      strip_none: 'Ainda não há outros jogadores para comparar', strip_aria: 'Você está em #{r} de {n}',
      gap_pass: '▲ faltam {d} para passar #{n}', gap_lead: '★ liderando por {d}',
      share: '⤴ Compartilhar', share_tip: 'Copiar uma imagem deste resultado para compartilhar', share_ok: '✓ Copiado. Cole onde quiser', share_saved: '✓ Imagem salva', share_err: 'Não foi possível criar a imagem',
      idle: 'Classifique uma sessão para ver como você se compara aos outros jogadores. Depois você pode entrar no ranking.',
      classifying: 'Classificando…', inel: 'Esta sessão não pode entrar no ranking: ', loading: 'Carregando seu ranking…',
      lock1: 'Tier geral e score', lock2: 'Posição em cada métrica', lock3: 'Onde estão os outros jogadores', lock4: 'O que falta para subir', lock5: 'Comparar por hunt e faixa de level',
      best_sub: 'Sua melhor métrica neste grupo', join: 'Entrar no ranking', comparing: 'Comparando com os outros jogadores…', not_in: 'Você ainda não está no ranking.',
      prev_head: 'Prévia · você <b>ainda não está no ranking</b>. Nada foi salvo. Comparado com <b>{n}</b> {w} de {v} em {h}.',
      w_one: 'outro jogador', w_many: 'outros jogadores', this_hunt: 'esta hunt',
      your_pos: 'Sua posição', few_players: 'Ainda não há jogadores suficientes neste grupo para comparar (são necessários 3). Entre e seja um dos primeiros.',
      more_one: '+{n} métrica com posição', more_many: '+{n} métricas com posição',
      prev_foot: 'Entre para ver o ranking completo. Envia o resumo da sessão e os logs, com o seu consentimento.',
      sc_hunt: 'Hunt', sc_level: 'Hunt · level {b}', md_all: 'Todas as sessões', md_best: 'Melhor de cada jogador',
      overall: 'Geral', score: 'Score', prov: 'provisório', need3: 'precisa de 3+ jogadores neste grupo',
      aa_off: 'Os auto-ataques quase não aparecem no log desta sessão ({p}% dos turnos), então não entram no ranking.',
      ref_few: 'Só referência · jogadores insuficientes para comparar', ref_cmp: 'Só referência · compare em "Hunt · level"', cmp_lvl: 'Comparado na mesma hunt e faixa de level · sem tier',
      of_all: '{n} turnos · {p}% do total', need10: 'Precisa de pelo menos 10 turnos para comparar',
      sub_dmg: '{n} turnos · média {h} hits · {x}', x_notier: 'sem tier', x_ref: 'só referência', x_cmp: 'compare em "Hunt · level"',
      h_sess: 'Métricas da sessão', h_hits: 'Métricas por spell · média de hits ajustada (grav san)', h_dmg: 'Métricas por spell · maior dano em um turno',
      note: 'Os tiers usam o top % do grupo ({cuts}, D: os demais). Ficam provisórios (tracejados) até o grupo ter {c} ou mais jogadores. O score geral só usa métricas de jogabilidade. O dano só entra no ranking em "Hunt · level" (mesma hunt e faixa de level), sem tier, e não conta no score.{arrow}',
      m_title: 'Ranking', m_first: 'Classifique uma sessão primeiro.', m_close: 'Fechar', m_already: 'Esta sessão já está no ranking.', m_join: 'Entrar no ranking',
      m_review: 'Revise o que será enviado.', kv_char: 'Personagem', kv_voc: 'Vocação', kv_lvl: 'Level', kv_date: 'Data', kv_hunt: 'Hunt', kv_turns: 'Turnos',
      c1: '<b>Enviar minha sessão e os logs completos.</b> Concordo em enviar o resumo desta sessão <b>e o server log e o local chat completos</b> ao servidor do ranking. O local chat pode ter nomes de outros jogadores. Entendo que os dados podem ser reprocessados e apagados a qualquer momento.',
      c2: '<b>Mostrar o nome do meu personagem nesta sessão.</b> Caso contrário, apareço como anônimo. Cada sessão tem a sua escolha, e você pode mudar depois, neste mesmo navegador.',
      vis_label: 'Mostrar meu nome nesta sessão', vis_hint: 'Vale só para esta sessão e funciona neste navegador.', vis_ok: 'Salvo', vis_err: 'Não foi possível salvar',
      m_cancel: 'Cancelar', m_submit: 'Enviar', m_up: 'Enviando…', e_unres: 'Turnos demais sem classificação.', e_impl: 'Os valores de dano parecem implausíveis.',
      crit: '{t} = top {p}%', crit_d: 'D = os demais', pos: '#{r} de {n} · top {p}%', in_scope: 'em {s}', best_res: 'MELHOR RESULTADO', median: 'mediana'
    },
    en: {
      line_aa: 'auto-attacks per hour', line_cast: 'spell & rune casts per hour', line_carpet: 'carpet uptime', line_hits: '{s} · hits per cast', line_aa_hits: 'auto-attack · hits per turn',
      arrow_physical: 'physical arrow', arrow_energy: 'Thunderstorm Arrow', arrow_ice: 'Froststorm Arrow', arrow_fire: 'Firestorm Arrow', arrow_earth: 'Terrastorm Arrow',
      arrow_note: " A paladin's auto-attack is compared only with players using the same arrow type: the physical arrow and each elemental arrow have separate rankings.",
      pos_a: '#{r} of {n}', pos_b: ' · top {p}%', you_lc: 'you', tier_lbl: 'TIER', small_sample: 'small sample · no percentile', small_note: 'Comparison with the median only appears with {n}+ players in this spot.',
      no_date: 'no date', anon: 'Anonymous', you: 'You', you_other: 'You · other session', turns: 'turns', all_of: 'All {v}s',
      el_multi: 'This text has more than one session. Select a single session in the session picker and classify again.',
      el_date: 'Only sessions saved on or after 16 Jun 2026 (with the "Channel … saved" header) can be ranked.',
      el_char: 'Could not identify the character or vocation in this session.',
      el_level: 'Could not find the character level in the local chat.',
      el_turns: 'Too few combat turns ({n}; at least {min} needed).',
      el_unres: '{pct}% of the turns could not be classified (limit {max}%).',
      err_class: 'The classification returned an error ({e}).', err_unavail: 'Ranking unavailable: {e}',
      m_maxturn: 'Highest damage in a turn', m_maxhit: 'Highest single hit', m_dmg_sfx: ' · highest damage in a turn',
      m_aa: 'Auto-attacks per hour', m_cast: 'Spell & rune casts per hour', m_carpet: 'Carpet uptime',
      u_hits: 'hits per cast', u_hits_aa: 'hits per turn', u_aa: 'auto-attacks per hour', u_cast: 'casts per hour', u_carpet: 'of the time under carpet',
      auto_attack: 'Auto attack',
      tip_more: '⋮ {n} more', tip_median: 'Median', tip_prov: 'Fewer than {n} players: the tier is provisional.',
      tier_need: 'A tier needs at least {n} players in the group', tier_prov: 'Provisional tier (only {p} players; {c} confirm it): ',
      top: 'top', no_cmp: 'no comparison', pctl: 'Percentile', pctl_prov: 'Provisional percentile ({n}+ players confirm it)',
      strip_none: 'No other players to compare yet', strip_aria: 'You are #{r} of {n}',
      gap_pass: '▲ {d} to pass #{n}', gap_lead: '★ leading by {d}',
      share: '⤴ Share', share_tip: 'Copy an image of this result to share', share_ok: '✓ Copied. Paste it anywhere', share_saved: '✓ Image saved', share_err: 'Could not create the image',
      idle: 'Classify a session to see how you compare with the other players. You can join the rank afterwards.',
      classifying: 'Classifying…', inel: "This session can't be ranked: ", loading: 'Loading your ranking…',
      lock1: 'Overall tier & score', lock2: 'Rank on every metric', lock3: 'Where the other players are', lock4: 'What it takes to move up', lock5: 'Compare by hunt and level band',
      best_sub: 'Your best metric in this group', join: 'Join the rank', comparing: 'Comparing with the other players…', not_in: 'Not in the rank yet.',
      prev_head: 'Preview · you are <b>not in the rank yet</b>. Nothing was saved. Compared with <b>{n}</b> {w} in {h}.',
      w_one: 'other {v} player', w_many: 'other {v} players', this_hunt: 'this hunt',
      your_pos: 'Your position', few_players: 'Not enough players in this group to compare yet (3 needed). Join and be one of the first.',
      more_one: '+{n} more metric ranked', more_many: '+{n} more metrics ranked',
      prev_foot: 'Join to unlock the full ranking. Sends your session summary and logs, with your consent.',
      sc_hunt: 'Hunt', sc_level: 'Hunt · level {b}', md_all: 'All sessions', md_best: 'Best of each player',
      overall: 'Overall', score: 'Score', prov: 'provisional', need3: 'needs 3+ players in this group',
      aa_off: 'Auto-attacks barely show in the log of this session ({p}% of turns), so it is not ranked.',
      ref_few: 'Reference only · not enough players to compare', ref_cmp: 'Reference only · compare in "Hunt · level"', cmp_lvl: 'Compared in the same hunt and level band · no tier',
      of_all: '{n} turns · {p}% of all', need10: 'Needs at least 10 turns to compare',
      sub_dmg: '{n} turns · avg {h} hits · {x}', x_notier: 'no tier', x_ref: 'reference only', x_cmp: 'compare in "Hunt · level"',
      h_sess: 'Session metrics', h_hits: 'Spell metrics · adjusted average hits (grav san)', h_dmg: 'Spell metrics · highest damage in a turn',
      note: 'Tiers use the top % of the group ({cuts}, D: the rest). They are provisional (dashed) until the group has {c} or more players. The overall score only uses gameplay metrics. Damage is ranked only in "Hunt · level" (same hunt and level band), with no tier, and does not enter the score.{arrow}',
      m_title: 'Ranking', m_first: 'Classify a session first.', m_close: 'Close', m_already: 'This session is already in the ranking.', m_join: 'Join the ranking',
      m_review: 'Review what will be sent.', kv_char: 'Character', kv_voc: 'Vocation', kv_lvl: 'Level', kv_date: 'Date', kv_hunt: 'Hunt', kv_turns: 'Turns',
      c1: "<b>Upload my session and raw logs.</b> I agree to send this session's summary <b>and the full server log and local chat</b> to the ranking server. The local chat may contain other players' names. I understand the data can be reprocessed and deleted at any time.",
      c2: '<b>Show my character name on this session.</b> Otherwise I appear as anonymous. Each session has its own choice, and you can change it later from this same browser.',
      vis_label: 'Show my name on this session', vis_hint: 'Only for this session; works from this browser.', vis_ok: 'Saved', vis_err: 'Could not save',
      m_cancel: 'Cancel', m_submit: 'Submit', m_up: 'Uploading…', e_unres: 'Too many unclassified turns.', e_impl: 'Damage values look implausible.',
      crit: '{t} = top {p}%', crit_d: 'D = the rest', pos: '#{r} of {n} · top {p}%', in_scope: 'in {s}', best_res: 'BEST RESULT', median: 'median'
    }
  };
  // tr('chave', {var: valor}): texto no idioma atual; cai no inglês e, por fim, na própria chave.
  const tr = (k, v) => { let s = T[L()][k] != null ? T[L()][k] : (T.en[k] != null ? T.en[k] : k); if (v) for (const x in v) s = s.split('{' + x + '}').join(v[x]); return s; };
  const rsn = r => Array.isArray(r) ? tr(r[0], r[1]) : String(r || '');   // motivo guardado como [chave, vars]: traduz na hora de desenhar
  const fmtDate = iso => { const p = String(iso || '').split('-'); return p.length === 3 ? (+p[2]) + ' ' + MONTHS_L[L()][+p[1] - 1] + ' ' + p[0] : tr('no_date'); };
  const metricUnit = m => tr(m === 'aa' ? 'u_aa' : m === 'cast' ? 'u_cast' : m === 'carpet' ? 'u_carpet' : 'u_hits');
  const tierCuts = () => TIER_CUTS.map(([t, c]) => t + ': top ' + c + '%').join(', ');

  // run = id crescente: um resultado atrasado de uma classificação antiga não sobrescreve a nova.
  const S = { run: 0, phase: 'idle', summary: null, texts: null, key: null, reason: null, hash: null, sessionId: null, scope: 'hunt', best: false, busy: false, standing: null, icons: null, preview: undefined, isPublic: false, owner: false };

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
    if (headerCount(svText) > 1) return ['el_multi'];
    if (!key || key < CUTOFF_KEY) return ['el_date'];
    if (!s.player || !s.vocation) return ['el_char'];
    if (s.level == null) return ['el_level'];
    if (s.totalTurns < MIN_TURNS) return ['el_turns', { n: s.totalTurns, min: MIN_TURNS }];
    if (s.unresolvedPct > MAX_UNRESOLVED) return ['el_unres', { pct: s.unresolvedPct.toFixed(1), max: MAX_UNRESOLVED }];
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
  const keyHash = async () => sha256Hex(playerSecret() + '|' + String(S.summary.player).toLowerCase());
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
      Object.assign(S, { phase: 'classifying', standing: null, sessionId: null, preview: undefined, scope: 'hunt', best: false, owner: false, isPublic: false }); render();
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
      if (summary.error) { Object.assign(S, { phase: 'ineligible', summary: null, reason: ['err_class', { e: summary.error }] }); return render(); }
      const reason = eligibility(summary, info && info.key, sv);
      Object.assign(S, { phase: reason ? 'ineligible' : 'ready', summary, texts: { sv, lc }, key: info && info.key, reason, sessionId: null,
                         hash: await sha256Hex(sv.trim() + '\n---\n' + lc.trim()) });
      render(); decorateRotation();
      if (!reason) { await lookupExisting(id); if (id === S.run && S.phase === 'ready') loadPreview(id); }
    } catch (e) { if (id === S.run) { Object.assign(S, { phase: 'ineligible', reason: ['err_unavail', { e: e.message }] }); render(); } }
  }

  // Se este mesmo par de logs já foi enviado, mostra a posição sem reenviar (só o hash trafega).
  async function lookupExisting(id) {
    const r = await sb.rpc('ranking_session_by_hash', { p_log_hash: S.hash });
    if (id !== S.run || r.error || !r.data) return;
    S.sessionId = r.data; S.phase = 'submitted';
    const o = await sb.rpc('ranking_session_owner_state', { p_log_hash: S.hash, p_player_key_hash: await keyHash() });
    if (id !== S.run) return;
    S.owner = !o.error && !!(o.data && o.data.length); S.isPublic = S.owner ? !!o.data[0].is_public : false;   // só o dono (mesmo navegador) vê e muda a escolha
    render(); loadStanding();
  }

  // Prévia antes de entrar: só os números do resumo vão ao servidor (nada é gravado) e ele devolve
  // apenas a melhor métrica e contagens. O resto fica travado até o envio.
  async function loadPreview(id) {
    const [r] = await Promise.all([sb.rpc('ranking_preview', { p_summary: S.summary, p_player_key_hash: await sha256Hex(playerSecret() + '|' + String(S.summary.player).toLowerCase()) }), loadIcons()]);
    if (id !== S.run || S.phase !== 'ready') return;
    S.preview = r.error ? null : (r.data && r.data[0]) || null;
    render();
  }

  // ---------- helpers de dados ----------
  const BAND = lvl => { const lo = Math.floor(lvl / 250) * 250; return lo + '–' + (lo + 250); };
  const SCOPES = () => [['hunt', tr('sc_hunt')], ['hunt_level', tr('sc_level', { b: BAND(S.summary.level) })], ['vocation', tr('all_of', { v: S.summary.vocation })]];
  const MODES = () => [[false, tr('md_all')], [true, tr('md_best')]];
  const scopeLabel = () => ({ hunt: S.summary.hunt || tr('sc_hunt'), hunt_level: (S.summary.hunt || tr('sc_hunt')) + ' · level ' + BAND(S.summary.level), vocation: tr('all_of', { v: S.summary.vocation }) }[S.scope]);
  const shortLabel = l => l.replace(/\s*\([^)]*\)\s*$/, '');
  const enLabel = l => l === 'Auto ataque' ? tr('auto_attack') : l;
  const DMG = new Set(['maxturn', 'maxhit', 'dmg']);   // dano: rank só em hunt_level, sem tier e fora do score
  const keyOf = r => r.metric === 'hits' ? r.label : r.metric === 'dmg' ? 'dmg:' + r.label : r.metric;   // hits: "kind|label"
  const fmtFor = metric => metric === 'carpet' ? (v => (v * 100).toFixed(1) + '%') : metric === 'hits' ? fmt2 : fmtInt;
  const fmtGap = (metric, d) => metric === 'carpet' ? (d * 100).toFixed(1) + ' pp' : metric === 'hits' ? fmt2(d) : fmtInt(d);
  const W = { S: 8, A: 5, B: 3, C: 2, D: 1 };
  const ranked = r => r && r.rank != null && r.tier;
  const scored = r => ranked(r) && !r.noTier;

  // ---------- hover: placar com nome (só de quem optou) e valor, top 5 + vizinhos ----------
  const TIPS = [];
  const tipId = h => TIPS.push(h) - 1;
  const quantile = (asc, p) => asc[Math.min(asc.length - 1, Math.max(0, Math.ceil(p * asc.length) - 1))];
  // Royal Paladin: o auto-ataque tem ranking separado por tipo de flecha (physical, energy, ice, fire, earth). O servidor põe o tipo
  // na chave do componente ('arrow|Auto ataque#energy') e no rótulo do auto-ataque por hora; outras vocações não têm tipo.
  const arrowEl = () => S.summary && S.summary.vocation === 'paladin' ? (S.summary.aaElement || 'physical') : null;
  const arrowName = () => tr('arrow_' + arrowEl());
  const rowKey = r => r.kind + '|' + r.label + (r.kind === 'arrow' && arrowEl() ? '#' + arrowEl() : '');
  const rowName = r => r.kind === 'arrow' && arrowEl() ? cap(arrowName()) : enLabel(r.label);
  const aaTitle = () => tr('m_aa') + (arrowEl() ? ' · ' + arrowName() : '');
  // ícone do auto-ataque: o da flecha elemental (ic.arrows[tipo], quando existir) ou o da vocação
  const aaIcon = (ic, voc) => (voc === 'paladin' && arrowEl() && arrowEl() !== 'physical' && ic.arrows && ic.arrows[arrowEl()]) || (ic.aa || {})[voc];
  const lab = r => r.label.split('|').slice(1).join('|').replace(/#[a-z]+$/, '');
  const metricName = r => r.metric === 'maxturn' ? tr('m_maxturn') : r.metric === 'maxhit' ? tr('m_maxhit') : r.metric === 'dmg' ? shortLabel(r.kind === 'arrow' || /^auto at/i.test(lab(r)) ? rowName({ kind: 'arrow', label: lab(r) }) : enLabel(lab(r))) + tr('m_dmg_sfx')
    : r.metric === 'aa' ? aaTitle() : r.metric === 'cast' ? tr('m_cast') : r.metric === 'carpet' ? tr('m_carpet') : shortLabel(enLabel(lab(r)));
  function statTip(r) {
    if (!r || !r.others_values || !r.others_values.length) return null;
    const f = fmtFor(r.metric), vals = r.others_values.map(Number), names = r.others_names || [], mine = r.others_me || [];
    const all = vals.map((v, i) => ({ v, name: mine[i] ? tr('you_other') : (names[i] || tr('anon')) })).concat([{ v: +r.value, name: tr('you'), me: true }]).sort((a, b) => b.v - a.v);
    all.forEach(e => { e.rank = 1 + all.filter(x => x.v > e.v).length; });
    const meIdx = all.findIndex(e => e.me), idxs = [];
    for (let i = 0; i < Math.min(all.length, 5); i++) idxs.push(i);
    if (meIdx >= 5) for (let i = Math.max(5, meIdx - 1); i <= Math.min(all.length - 1, meIdx + 1); i++) idxs.push(i);
    let h = '<div class="cls-chart-tip-title">' + esc(metricName(r)) + '</div>', prev = -1;
    idxs.forEach(i => { const e = all[i]; if (prev >= 0 && i > prev + 1) h += '<div class="plist gap">⋮</div>';
      h += '<div class="plist' + (e.me ? ' me' : '') + '"><span class="pr">#' + e.rank + '</span><span class="pn">' + esc(e.name) + '</span><b>' + f(e.v) + '</b></div>'; prev = i; });
    if (prev < all.length - 1) h += '<div class="plist gap">' + tr('tip_more', { n: all.length - 1 - prev }) + '</div>';
    const asc = all.map(e => e.v).sort((a, b) => a - b), sC = TIER_CUTS[0][1], aC = TIER_CUTS[1][1];
    return h + '<div class="cls-chart-tip-foot">S (top ' + sC + '%) ≥ ' + f(quantile(asc, 1 - sC / 100)) + ' · A (top ' + aC + '%) ≥ ' + f(quantile(asc, 1 - aC / 100)) + ' · ' + tr('tip_median') + ' ' + f(quantile(asc, .5)) +
      (r.players < MIN_CONFIRM ? '<br>' + tr('tip_prov', { n: MIN_CONFIRM }) : '') + '</div>';
  }
  const tipAttr = r => { const h = statTip(r); return h ? ' tabindex="0" data-tip="' + tipId(h) + '"' : ''; };

  function tierBadge(r, cls) {
    if (r && r.noTier) return cls ? '' : '<span></span>';
    if (!ranked(r)) return '<span class="tier none ' + (cls || '') + '" title="' + esc(tr('tier_need', { n: MIN_RANK })) + '">–</span>';
    const prov = r.provisional;
    return '<span class="tier ' + r.tier + (prov ? ' prov' : '') + ' ' + (cls || '') + '" title="' + esc((prov ? tr('tier_prov', { p: r.players, c: MIN_CONFIRM }) : '') + tr('top') + ' ' + Math.max(1, +r.top_pct) + '%') + '">' + r.tier + '</span>';
  }
  function rankRow(r) {
    if (!ranked(r)) return '<div class="rk"><span class="r"><span class="rc"><span class="tier none">–</span><b class="nocmp">' + tr('no_cmp') + '</b></span></span><span class="p"></span></div>';
    const conf = r.players >= MIN_CONFIRM, p = r.percentile == null ? '' : (conf ? '' : '~') + 'p' + Math.round(r.percentile * 100);
    return '<div class="rk"><span class="r"><span class="rc' + (r.others_values && r.others_values.length ? ' tipped' : '') + '"' + tipAttr(r) + '>' + tierBadge(r) + '<b>#' + r.rank + '</b><i>/ ' + (r.others_values ? r.others_values.length + 1 : (r.entries || r.players)) + '</i></span></span><span class="p' + (conf ? '' : ' prov') + '" title="' + esc(conf ? tr('pctl') : tr('pctl_prov', { n: MIN_CONFIRM })) + '">' + p + '</span></div>';
  }
  // Faixa central dos valores: o que passa de 1,5 intervalo interquartil fora dos quartis é outlier. A faixa e o card de
  // compartilhar cortam os outliers na ponta da linha (triângulo + quantidade) para a distribuição do resto aparecer.
  function outlierRange(others, mine) {
    const all = others.concat([mine]).sort((p, q) => p - q);
    const qt = p => all[Math.min(all.length - 1, Math.max(0, Math.ceil(p * all.length) - 1))];
    const iqr = qt(.75) - qt(.25), fLo = iqr > 0 ? qt(.25) - 1.5 * iqr : all[0], fHi = iqr > 0 ? qt(.75) + 1.5 * iqr : all[all.length - 1];
    const inner = all.filter(x => x >= fLo && x <= fHi), lo = Math.min(...inner), hi = Math.max(...inner);
    const nLo = others.filter(x => x < lo).length, nHi = others.filter(x => x > hi).length;
    return { all, lo, hi, nLo, nHi, cutL: nLo > 0 || mine < lo, cutR: nHi > 0 || mine > hi };
  }
  // faixa de dispersão: pontos neutros, você em destaque; linha tracejada = mediana; outliers cortados nas pontas
  function miniStrip(r) {
    const others = (r && r.others_values || []).map(Number);
    if (!others.length) return '<div class="strip empty">' + tr('strip_none') + '</div>';
    const v = +r.value, Wd = 240, H = 28, L0 = 8, R0 = 8, Y = 14, f0 = fmtFor(r.metric), o = outlierRange(others, v), lo = o.lo, hi = o.hi;
    const PX0 = L0 + (o.cutL ? 18 : 0), PX1 = Wd - R0 - (o.cutR ? 18 : 0), pad = (hi - lo) * .05 || .5, a = lo - pad, b = hi + pad;
    const X = x => x < lo ? L0 + 5 : x > hi ? Wd - R0 - 5 : PX0 + (x - a) / (b - a) * (PX1 - PX0), med = X(o.all[Math.floor(o.all.length / 2)]), placed = [];
    const nm = (r.others_names || []), me2 = (r.others_me || []);
    const row = i => '<div class="plist"><span class="pn">' + esc(me2[i] ? tr('you_other') : (nm[i] || tr('anon'))) + '</span><b>' + f0(others[i]) + '</b></div>';
    const dots = others.map((x, i) => { if (x < lo || x > hi) return ''; const px = X(x), k = placed.filter(p => Math.abs(p - px) < 8).length; placed.push(px);
      const dy = (k % 2 ? 1 : -1) * Math.min(Math.ceil(k / 2), 2) * 5;
      return '<circle cx="' + px + '" cy="' + (Y + dy) + '" r="3.5" fill="#7F9CC2" fill-opacity=".55" stroke="#7F9CC2" data-tip="' + tipId(row(i)) + '"></circle>'; }).join('');
    const cut = (dir, n, test) => {   // quebra na linha + triângulo para fora + "×n"; passar o mouse lista os valores cortados
      if (!(n || (dir < 0 ? v < lo : v > hi))) return '';
      const x = dir < 0 ? L0 : Wd - R0, bx = dir < 0 ? PX0 - 4 : PX1 + 4, tip = n ? ' data-tip="' + tipId(others.map((_, i) => i).filter(i => test(others[i])).map(row).join('')) + '"' : '';
      return '<line x1="' + (bx + dir * 2) + '" y1="' + (Y - 4) + '" x2="' + (bx - dir * 2) + '" y2="' + (Y + 4) + '" stroke="#93AAC8" stroke-width="1.2"/>' +
        '<polygon points="' + x + ',' + Y + ' ' + (x - dir * 7) + ',' + (Y - 4.5) + ' ' + (x - dir * 7) + ',' + (Y + 4.5) + '" fill="#9FB6D6"' + tip + '></polygon>' +
        (n ? '<text x="' + (x - dir * 7) + '" y="7" font-size="8" fill="#93AAC8" text-anchor="' + (dir < 0 ? 'start' : 'end') + '">×' + n + '</text>' : '');
    };
    return '<div class="strip"><svg class="mini" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="' + esc(tr('strip_aria', { r: r.rank, n: r.players })) + '">' +
      '<line x1="' + PX0 + '" x2="' + PX1 + '" y1="' + Y + '" y2="' + Y + '" stroke="#1d3350"/><line x1="' + med + '" x2="' + med + '" y1="3" y2="' + (H - 3) + '" stroke="#93AAC8" stroke-dasharray="2 2"/>' +
      dots + cut(-1, o.nLo, x => x < lo) + cut(1, o.nHi, x => x > hi) + '<circle cx="' + X(v) + '" cy="' + Y + '" r="6" fill="#00C49A" stroke="#E6EFF8" stroke-width="2" data-tip="' + tipId(statTip(r)) + '"></circle></svg></div>';
  }
  // o que falta para subir (ou a folga de quem lidera)
  function gapHint(r) {
    if (!ranked(r)) return '';
    const v = +r.value, others = (r.others_values || []).map(Number), f = x => fmtGap(r.metric, x);
    const above = others.filter(x => x > v).sort((a, b) => a - b)[0];
    if (above != null) return '<div class="gap">' + tr('gap_pass', { d: f(above - v), n: r.rank - 1 }) + '</div>';
    const next = others.filter(x => x < v).reduce((m, x) => Math.max(m, x), -Infinity);
    return Number.isFinite(next) ? '<div class="gap lead">' + tr('gap_lead', { d: f(v - next) }) + '</div>' : '';
  }
  const FALLBACK_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="9" fill="none" stroke="#7F9CC2" stroke-width="2"/></svg>');
  function spellIcon(row) {
    const ic = S.icons || { spells: {}, aa: {} };
    let own = ic.spells[row.label];
    if (row.kind === 'arrow' || /^auto at/i.test(row.label)) own = aaIcon(ic, S.summary.vocation) || own;
    return '<img class="sicon' + (own ? '' : ' generic') + '" src="' + (own || FALLBACK_ICON) + '" width="32" height="32" alt="" title="' + esc(rowName(row)) + '">';
  }
  function card(o) {
    return '<div class="cls-metric c2' + (o.first ? ' first' : '') + (o.off ? ' off' : '') + '"><div class="mtop"><div class="sp">' + (o.icon || '') +
      '<div class="sptxt"><div class="cls-metric-label" title="' + esc(o.title || o.label) + '">' + esc(o.label) + '</div><div class="cls-metric-value">' + o.value + '</div></div></div>' + (o.tier || '') + '</div>' +
      (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + (o.rank || '') + (o.strip || '') + (o.gap || '') + (o.share || '') + '</div>';
  }
  const rankedCard = (r, base) => card(Object.assign({ value: fmtFor(r.metric)(+r.value), tier: tierBadge(r, 'bigtier'), rank: rankRow(r), strip: miniStrip(r), gap: gapHint(r), first: ranked(r) && r.rank === 1, share: shareBtn(r) }, base));

  // ---------- compartilhar: card em forma de escudo, 1024×1536 (retrato 2:3), na área de transferência ----------
  // Estrutura (de cima para baixo): letra do tier + nome; número principal; unidade (com ícone, se houver); grupo; posição "#N de M · top X%";
  // mediana; faixa de distribuição (você e mediana); rodapé. Com poucos jogadores (< MIN_PERCENTILE_N): sem percentil, mediana e faixa.
  const SHARES = [];
  const CARD_TIER = { S: '#fbbf24', A: '#c084fc', B: '#60a5fa', C: '#4ade80', D: '#f87171' };   // D não estava na especificação: vermelho do ranking
  const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
  const SHIELD = 'M50 175 Q160 150 205 90 Q330 20 512 20 Q700 20 820 85 Q870 150 972 172 L972 1250 Q972 1330 900 1390 Q760 1470 512 1520 Q260 1470 124 1390 Q50 1330 50 1250 Z';
  const shareBtn = r => scored(r) ? '<div class="shr"><button type="button" class="rk-share" data-share="' + (SHARES.push(r) - 1) + '" title="' + esc(tr('share_tip')) + '">' + tr('share') + '</button></div>' : '';
  const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  // A página só carrega Inter 400–600; o card usa 600–900 no canvas. Carrega os pesos que faltam antes de desenhar.
  let cardFonts = null;
  function loadCardFonts() {
    if (!cardFonts) cardFonts = new Promise(res => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900&display=swap';
      l.onload = l.onerror = () => Promise.all([600, 700, 800, 900].map(w => document.fonts.load(w + ' 20px Inter'))).then(res, res);
      document.head.appendChild(l);
    });
    return cardFonts;
  }
  const hexA = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
  async function shareImage(r) {
    await loadCardFonts();
    const s = S.summary, col = CARD_TIER[r.tier], f = fmtFor(r.metric), ic = await loadIcons();
    const entries = r.others_values ? r.others_values.length + 1 : r.players, top = Math.max(1, Math.round(+r.top_pct)), big = entries >= MIN_PERCENTILE_N;
    const TEXT = '#e8eefc', GREY = '#94a3b8';
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1536; const c = cv.getContext('2d');
    const font = (w, size) => { c.font = w + ' ' + size + 'px ' + FONT; };
    const width = (str, w, size, ls) => { font(w, size); c.letterSpacing = (ls || 0) + 'px'; const m = c.measureText(str).width; c.letterSpacing = '0px'; return m; };
    const fitSize = (str, w, size, maxW, ls, min) => { while (size > (min || 24) && width(str, w, size, ls) > maxW) size -= 2; return size; };
    // texto em partes (peso e opacidade próprios); align 'center' centraliza o conjunto em x
    const parts = (ps, x, y, size, color, align, ls) => {
      const ws = ps.map(p => width(p.t, p.w, size, ls)), total = ws.reduce((a, b) => a + b, 0); let cur = align === 'center' ? x - total / 2 : x;
      ps.forEach((p, i) => { font(p.w, size); c.letterSpacing = (ls || 0) + 'px'; c.globalAlpha = p.a == null ? 1 : p.a; c.fillStyle = p.c || color; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(p.t, cur, y); cur += ws[i]; });
      c.globalAlpha = 1; c.letterSpacing = '0px'; return total;
    };
    // ---- escudo ----
    const shield = new Path2D(SHIELD);
    c.fillStyle = '#121212'; c.fillRect(0, 0, 1024, 1536);
    c.save(); c.globalAlpha = .9; c.translate(0, 6); c.fillStyle = col; c.fill(shield); c.restore();   // sombra de borda
    const norm = new Path2D(); norm.addPath(shield, new DOMMatrix().scale(1 / 922, 1 / 1500).translate(-50, -20));   // gradiente definido sobre a caixa do escudo
    c.save(); c.translate(50, 20); c.scale(922, 1500); const g = c.createLinearGradient(0, 0, 1, 1); g.addColorStop(0, '#101c38'); g.addColorStop(1, '#080f20'); c.fillStyle = g; c.fill(norm); c.restore();
    c.save(); c.clip(shield); c.translate(512, 0); c.scale(921.6, 810);   // brilho radial elíptico no topo, na cor do tier
    const rg = c.createRadialGradient(0, 0, 0, 0, 0, 1); rg.addColorStop(0, hexA(col, .28)); rg.addColorStop(1, hexA(col, 0)); c.fillStyle = rg; c.fillRect(-512 / 921.6, 0, 1024 / 921.6, 900 / 810); c.restore();
    [[[[760, 0], [1024, 0], [1024, 300]], .04], [[[0, 560], [520, 330], [0, 330]], .03], [[[820, 40], [1024, 330], [900, 330]], .02]].forEach(([pts, a]) => {
      c.save(); c.clip(shield); c.globalAlpha = a; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.restore(); });
    c.lineWidth = 8; c.strokeStyle = col; c.stroke(shield);
    const rect = (x, y, w, h, a) => { c.globalAlpha = a; c.fillStyle = '#fff'; c.fillRect(x, y, w, h); c.globalAlpha = 1; };
    rect(358, 215, 2, 190, .35); rect(62, 905, 900, 2, .14); rect(62, 1130, 900, 2, .14);
    // ---- cabeçalho: tier + quem é ----
    parts([{ t: tr('tier_lbl'), w: 800 }], 217, 189, 34, TEXT, 'center', 2);
    parts([{ t: r.tier, w: 900 }], 217, 375, 210, col, 'center');
    const who = S.isPublic ? s.player : tr('anon');
    parts([{ t: who, w: 800 }], 395, 293, fitSize(who, 800, 74, 560), TEXT, 'left');
    const cl = cap(s.vocation) + ' · level ' + s.level; parts([{ t: cl, w: 600 }], 395, 350.7, fitSize(cl, 600, 38, 560), TEXT, 'left');
    // ---- número principal (cor do tier, espaçamento -8) ----
    const val = f(+r.value); parts([{ t: val, w: 900 }], 512, 720, fitSize(val, 900, 290, 840, -8, 150), col, 'center', -8);
    // ---- unidade, com o ícone real da spell/auto-ataque à esquerda quando existir ----
    const nm = r.metric === 'hits' ? lab(r) : '', isAuto = /^auto at/i.test(nm);
    const src = r.metric === 'aa' || isAuto ? aaIcon(ic, s.vocation) : r.metric === 'hits' ? (ic.spells || {})[nm] : null, img = src ? await loadImg(src) : null;
    const line = r.metric === 'hits' ? (isAuto ? (arrowEl() ? arrowName() + ' · ' : '') + tr('line_aa_hits') : tr('line_hits', { s: shortLabel(enLabel(nm)) })) : r.metric === 'aa' ? tr('line_aa') + (arrowEl() ? ' · ' + arrowName() : '') : tr(r.metric === 'cast' ? 'line_cast' : 'line_carpet');
    const iw = img ? 64 : 0, gap = img ? 14 : 0, us = fitSize(line, 700, 44, 800 - iw - gap, 0, 28), tw = width(line, 700, us), x0 = 512 - (iw + gap + tw) / 2;
    if (img) { c.imageSmoothingEnabled = false; c.drawImage(img, x0, 796, 64, 64); }
    parts([{ t: line, w: 700 }], x0 + iw + gap, img ? 840 : 835, us, TEXT, 'left');
    const grp = tr('in_scope', { s: scopeLabel() }); parts([{ t: grp, w: 600, a: .8 }], 512, 879, fitSize(grp, 600, 32, 800), TEXT, 'center');
    // ---- posição (e percentil só com amostra suficiente) ----
    parts(big ? [{ t: tr('pos_a', { r: r.rank, n: entries }) + ' ', w: 900 }, { t: tr('pos_b', { p: top }).trim(), w: 600, a: .72 }] : [{ t: tr('pos_a', { r: r.rank, n: entries }), w: 900 }], 512, 989, 78, TEXT, 'center');
    if (big) {
      const all = (r.others_values || []).map(Number).concat([+r.value]).sort((p, q) => p - q), n = all.length;
      const qt = p => all[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))], med = qt(.5);
      parts([{ t: tr('median') + ' ', w: 600 }, { t: f(med), w: 900 }], 512, 1078, 50, TEXT, 'center');
      // faixa: escala cortada nos percentis 5 e 95 (valores fora ficam presos na ponta da trilha)
      const pq = p => all[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))]; let lo = pq(.05), hi = pq(.95); if (!(hi > lo)) { lo = all[0]; hi = all[n - 1]; } if (!(hi > lo)) { lo -= .5; hi += .5; }
      const X = v => 112 + Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * 800, circ = (cx, rad, color, a) => { c.globalAlpha = a == null ? 1 : a; c.fillStyle = color; c.beginPath(); c.arc(cx, 1215, rad, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; };
      c.globalAlpha = .5; c.fillStyle = GREY; c.beginPath(); c.roundRect(112, 1212, 800, 5, 3); c.fill(); c.globalAlpha = 1;
      (r.others_values || []).map(Number).forEach(v => circ(X(v), 9, GREY, .7));
      const mx = X(med), yx = X(+r.value); circ(mx, 13, GREY); circ(mx, 9, '#fff'); circ(yx, 19, '#fff'); circ(yx, 14, col);
      const wM = width(tr('median'), 700, 30), wY = width(tr('you_lc'), 800, 30), yStart = yx - .82 * wY, mStart = mx - wM / 2;
      const clash = !(yStart + wY < mStart - 8 || mStart + wM < yStart - 8);   // "você" e "mediana" se tocariam: a mediana vai para baixo da trilha
      parts([{ t: tr('median'), w: 700 }], mStart, clash ? 1262 : 1179, 30, TEXT, 'left');
      parts([{ t: tr('you_lc'), w: 800 }], yStart, 1179, 30, TEXT, 'left');
    } else {
      const label = tr('small_sample'), lw = width(label, 700, 28), bw = lw + 44 + 6, bx = 512 - bw / 2;
      c.strokeStyle = TEXT; c.lineWidth = 3; c.beginPath(); c.roundRect(bx, 1044, bw, 52, 26); c.stroke();
      parts([{ t: label, w: 700 }], 512, 1080, 28, TEXT, 'center');
      const words = tr('small_note', { n: MIN_PERCENTILE_N }).split(' '); let ln = '', y = 1203;
      words.forEach(w => { const test = ln ? ln + ' ' + w : w; if (width(test, 600, 28) > 800 && ln) { parts([{ t: ln, w: 600, a: .75 }], 112, y, 28, TEXT, 'left'); ln = w; y += 34; } else ln = test; });
      if (ln) parts([{ t: ln, w: 600, a: .75 }], 112, y, 28, TEXT, 'left');
    }
    parts([{ t: 'Classificador', w: 900 }, { t: ' · lucasporfz.github.io/classificador', w: 700 }], 512, 1374, 30, TEXT, 'center');
    return new Promise(res => cv.toBlob(res, 'image/png'));
  }
  async function doShare(btn) {
    const r = SHARES[+btn.dataset.share]; if (!r) return;
    const old = btn.textContent; btn.disabled = true;
    try {
      const blob = await shareImage(r);
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); btn.textContent = tr('share_ok'); }
      catch (_e) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ranking.png'; a.click(); btn.textContent = tr('share_saved'); }
    } catch (_e) { btn.textContent = tr('share_err'); }
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 2500);
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#rankingSection .rk-share'); if (b) doShare(b); });

  // ---------- render ----------
  function render() {
    const el = $('rankingBody'); if (!el) return;
    if (S.phase === 'idle') { el.innerHTML = '<p class="rk-muted">' + tr('idle') + '</p>'; return; }
    if (S.phase === 'classifying') { el.innerHTML = '<p class="rk-muted">' + tr('classifying') + '</p>'; return; }
    if (S.phase === 'ineligible') { el.innerHTML = '<p class="rk-warn">' + tr('inel') + esc(rsn(S.reason)) + '</p>'; return; }
    if (S.phase === 'ready') { el.innerHTML = previewHtml(); const j = $('rkJoin'); if (j) j.onclick = openModal; return; }
    if (S.phase === 'submitted') {
      el.innerHTML = '<div id="rkStanding"><p class="rk-muted">' + tr('loading') + '</p></div>';
      if (S.standing) renderStanding();
    }
  }

  function bestCard(p) {
    const s = S.summary, m = p.metric, f = fmtFor(m);
    let label, value, icon = '';
    if (m === 'aa') { label = aaTitle(); value = s.aa.perHour; icon = ''; }
    else if (m === 'cast') { label = tr('m_cast'); value = s.spellRune.perHour; }
    else if (m === 'carpet') { label = tr('m_carpet'); value = s.gravSan.uptime; }
    else { const row = s.rows.find(r => rowKey(r) === p.label); if (!row) return ''; label = shortLabel(rowName(row)); value = row.hitsAdj != null ? row.hitsAdj : row.hitsMean; icon = spellIcon(row); }
    return card({ icon, label, value: f(+value), tier: tierBadge(p, 'bigtier'), rank: rankRow(p), sub: tr('best_sub'), first: p.rank === 1 });
  }
  function previewHtml() {
    const s = S.summary, p = S.preview;
    const who = '<p class="rk-muted" style="margin:0 0 10px"><b>' + esc(s.player) + '</b> · ' + esc(cap(s.vocation)) + ' · level ' + s.level + ' · ' + esc(s.hunt || '') + ' · ' + fmtInt(s.totalTurns) + ' ' + tr('turns') + '</p>';
    const join = '<div class="rk-actions" style="justify-content:flex-start;margin:14px 0 0"><button id="rkJoin" class="btn-blue">' + tr('join') + '</button></div>';
    if (p === undefined) return '<div class="rk-box">' + who + '<p class="rk-muted" style="margin:0">' + tr('comparing') + '</p></div>';
    if (p === null) return '<div class="rk-box">' + who + '<p class="rk-muted" style="margin:0">' + tr('not_in') + '</p>' + join + '</div>';
    const n = Math.max(0, p.group_players - 1);   // group_players inclui você
    const head = '<p class="rk-muted" style="margin:0 0 10px">' + tr('prev_head', { n, w: tr(n === 1 ? 'w_one' : 'w_many', { v: esc(s.vocation) }), v: esc(s.vocation), h: esc(s.hunt || tr('this_hunt')) }) + '</p>';
    const open = p.metric ? bestCard(p) : '<div class="cls-metric c2 off"><div class="cls-metric-label">' + tr('your_pos') + '</div><div class="sub">' + tr('few_players') + '</div></div>';
    const locked = [1, 2, 3, 4, 5].map(i => '<div class="cls-metric c2 locked"><div class="cls-metric-label">🔒 ' + esc(tr('lock' + i)) + '</div><div class="lockbar"></div>' + (i === 2 && p.locked > 0 ? '<div class="sub">' + tr(p.locked === 1 ? 'more_one' : 'more_many', { n: p.locked }) + '</div>' : '') + '</div>').join('');
    return '<div class="rk-box">' + who + head + '<div class="cls-metrics">' + open + locked + '</div>' + join +
      '<p class="rk-muted" style="margin:10px 0 0">' + tr('prev_foot') + '</p></div>';
  }

  async function loadStanding() {
    const args = { p_session: S.sessionId, p_scope: S.scope, p_best: S.best };
    const [rows] = await Promise.all([sb.rpc('ranking_standing', args), loadIcons()]);
    const box = $('rkStanding'); if (!box) return;
    if (rows.error) { box.innerHTML = '<p class="rk-err">' + esc(rows.error.message) + '</p>'; return; }
    S.standing = (rows.data || []).map(r => DMG.has(r.metric) ? Object.assign(r, { noTier: true }) : r);
    renderStanding();
  }

  // Score geral: média dos percentis ponderada pelo tier de cada métrica (só as com tier, isto é, 3+ jogadores).
  function overall(rows) {
    const parts = rows.filter(scored).map(r => ({ r, pct: Math.round(r.percentile * 100), w: W[r.tier] }));
    if (!parts.length) return null;
    const score = Math.round(parts.reduce((a, p) => a + p.w * p.pct, 0) / parts.reduce((a, p) => a + p.w, 0)), top = 100 - score;
    return { score, top, c: tierOfTop(top), prov: parts.some(p => p.r.provisional) };
  }

  function renderStanding() {
    const box = $('rkStanding'); if (!box || !S.standing) return;
    TIPS.length = 0; SHARES.length = 0;
    const rows = S.standing, s = S.summary, by = new Map(rows.map(r => [keyOf(r), r]));
    const seg = (items, cur, key) => '<div class="seg">' + items.map(([v, l]) => '<button type="button" data-k="' + key + '" data-v="' + v + '" class="' + (v === cur ? 'active' : '') + '">' + esc(l) + '</button>').join('') + '</div>';
    const ov = overall(rows);
    const ovHtml = ov
      ? '<div class="ov"><span class="tier ' + ov.c + ' xl' + (ov.prov ? ' prov' : '') + '">' + ov.c + '</span><div><div class="ovl">' + tr('overall') + ' · ' + esc(scopeLabel()) + '</div><div class="ovs">' + tr('score') + ' ' + ov.score + ' <span class="ovt">· ' + tr('top') + ' ' + Math.max(1, ov.top) + '%' + (ov.prov ? ' · ' + tr('prov') : '') + '</span></div></div></div>'
      : '<div class="ov"><span class="tier none xl">–</span><div><div class="ovl">' + tr('overall') + ' · ' + esc(scopeLabel()) + '</div><div class="ovs"><span class="ovt">' + tr('need3') + '</span></div></div></div>';
    const hero = '<div class="hero2">' + ovHtml + '<div class="who"><div class="name">' + esc(s.player) + '</div><div class="meta">' + esc(cap(s.vocation)) + ' · level ' + s.level + ' · ' + esc(s.hunt || '') + ' · ' + fmtDate(s.date) + ' · ' + fmtInt(s.totalTurns) + ' ' + tr('turns') + '</div></div></div>';

    // métricas da sessão (ranqueadas) + referências de dano (sem tier)
    const sess = [];
    const aaRow = by.get('aa');
    if (aaRow) sess.push(rankedCard(aaRow, { label: aaTitle() }));
    else sess.push(card({ label: aaTitle(), value: '—', off: true, sub: tr('aa_off', { p: s.aa.pct.toFixed(1) }) }));
    if (by.get('cast')) sess.push(rankedCard(by.get('cast'), { label: tr('m_cast') }));
    if (by.get('carpet')) sess.push(rankedCard(by.get('carpet'), { label: tr('m_carpet') }));
    const refSub = S.scope === 'hunt_level' ? tr('ref_few') : tr('ref_cmp');
    const dmgCard = (r, base) => r ? rankedCard(r, Object.assign({ sub: tr('cmp_lvl') }, base)) : card(Object.assign({ sub: refSub }, base));
    sess.push(dmgCard(by.get('maxturn'), { label: tr('m_maxturn'), value: fmtInt(s.maxTurnDamage) }));
    sess.push(dmgCard(by.get('maxhit'), { label: tr('m_maxhit'), value: fmtInt(s.maxSingleHit) }));

    const tot = s.rows.reduce((a, r) => a + r.turns, 0);
    const spellCards = s.rows.map(r => {
      const st = by.get(rowKey(r)), label = rowName(r), sub = tr('of_all', { n: r.turns, p: (r.turns / tot * 100).toFixed(0) });
      const base = { icon: spellIcon(r), label: shortLabel(label), title: label, sub };
      if (st) return rankedCard(st, base);
      return card(Object.assign({ value: fmt2(r.hitsAdj != null ? r.hitsAdj : r.hitsMean), tier: tierBadge(null, 'bigtier'), rank: rankRow(null), strip: '<div class="strip empty">' + tr('need10') + '</div>' }, base));
    }).join('');
    const dmgCards = s.rows.map(r => { const base = { icon: spellIcon(r), label: shortLabel(rowName(r)), title: rowName(r) }, st = by.get('dmg:' + rowKey(r));
      const sub = tr('sub_dmg', { n: r.turns, h: fmt2(r.hitsAdj != null ? r.hitsAdj : r.hitsMean), x: st ? tr('x_notier') : (S.scope === 'hunt_level' ? tr('x_ref') : tr('x_cmp')) });
      return st ? rankedCard(st, Object.assign({ sub }, base)) : card(Object.assign({ value: fmtInt(r.maxTurnDmg), sub }, base)); }).join('');

    const vis = S.owner ? '<div class="rk-vis"><label><input type="checkbox" id="rkVis"' + (S.isPublic ? ' checked' : '') + '> <b>' + tr('vis_label') + '</b></label><span class="rk-muted">' + tr('vis_hint') + '</span><span id="rkVisMsg" class="rk-muted"></span></div>' : '';
    box.innerHTML = vis + '<div class="ctrl">' + seg(SCOPES(), S.scope, 'scope') + seg(MODES(), S.best, 'best') + '</div>' + hero +
      '<h3 class="cls-h">' + tr('h_sess') + '</h3><div class="cls-metrics">' + sess.join('') + '</div>' +
      '<h3 class="cls-h">' + tr('h_hits') + '</h3><div class="cls-metrics">' + spellCards + '</div>' +
      '<h3 class="cls-h">' + tr('h_dmg') + '</h3><div class="cls-metrics">' + dmgCards + '</div>' +
      '<p class="note">' + tr('note', { cuts: tierCuts(), c: MIN_CONFIRM, arrow: arrowEl() ? tr('arrow_note') : '' }) + '</p>';
    const visBox = $('rkVis');
    if (visBox) visBox.onchange = async () => {
      const want = visBox.checked, msg = $('rkVisMsg'); visBox.disabled = true; msg.textContent = '';
      const r = await sb.rpc('ranking_set_visibility', { p_log_hash: S.hash, p_player_key_hash: await keyHash(), p_is_public: want });
      visBox.disabled = false;
      if (r.error || r.data !== true) { visBox.checked = !want; msg.className = 'rk-err'; msg.textContent = tr('vis_err'); return; }
      S.isPublic = want; msg.className = 'rk-ok'; msg.textContent = tr('vis_ok');
    };
    box.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
      if (b.dataset.k === 'scope') S.scope = b.dataset.v; else S.best = b.dataset.v === 'true';
      loadStanding();
    });
  }

  // ---------- janela dos aceites ----------
  function openModal() {
    const dlg = $('rankingModal'), body = $('rkModalBody'), s = S.summary, close = '<div class="rk-actions"><button class="ghost" id="rkClose">' + tr('m_close') + '</button></div>';
    if (S.phase === 'idle' || S.phase === 'classifying') body.innerHTML = '<h3>' + tr('m_title') + '</h3><p class="rk-muted">' + tr('m_first') + '</p>' + close;
    else if (S.phase === 'ineligible') body.innerHTML = '<h3>' + tr('m_title') + '</h3><p class="rk-warn">' + esc(rsn(S.reason)) + '</p>' + close;
    else if (S.phase === 'submitted') body.innerHTML = '<h3>' + tr('m_title') + '</h3><p class="rk-ok">' + tr('m_already') + '</p>' + close;
    else {
      body.innerHTML = '<h3>' + tr('m_join') + '</h3><div class="rk-muted">' + tr('m_review') + '</div><div class="rk-kv">' +
        [[tr('kv_char'), s.player], [tr('kv_voc'), cap(s.vocation)], [tr('kv_lvl'), s.level], [tr('kv_date'), fmtDate(s.date)], [tr('kv_hunt'), s.hunt || '?'], [tr('kv_turns'), fmtInt(s.totalTurns)]].map(c => '<div><b>' + c[0] + '</b><span>' + esc(c[1]) + '</span></div>').join('') + '</div>' +
        '<label class="rk-check"><input type="checkbox" id="rkConsent"><span>' + tr('c1') + '</span></label>' +
        '<label class="rk-check"><input type="checkbox" id="rkPublic"><span>' + tr('c2') + '</span></label>' +
        '<div id="rkMsg" class="rk-muted"></div><div class="rk-actions"><button class="ghost" id="rkClose">' + tr('m_cancel') + '</button><button class="btn-blue" id="rkSubmit" disabled>' + tr('m_submit') + '</button></div>';
      $('rkConsent').onchange = () => { $('rkSubmit').disabled = !$('rkConsent').checked || S.busy; };
      $('rkSubmit').onclick = submit;
    }
    $('rkClose').onclick = () => dlg.close();
    dlg.showModal();
  }

  async function submit() {
    const msg = $('rkMsg'), btn = $('rkSubmit'); S.busy = true; btn.disabled = true; msg.className = 'rk-muted'; msg.textContent = tr('m_up');
    try {
      const folder = crypto.randomUUID();
      for (const [name, text] of [['server.txt.gz', S.texts.sv], ['local.txt.gz', S.texts.lc]]) {
        const up = await sb.storage.from('ranking-raw-logs').upload(folder + '/' + name, await gzip(text), { contentType: 'application/gzip', upsert: false });
        if (up.error) throw up.error;
      }
      const pub = $('rkPublic').checked; S.isPublic = pub;
      const r = await sb.rpc('ranking_submit_session', { p_player_key_hash: await sha256Hex(playerSecret() + '|' + String(S.summary.player).toLowerCase()), p_character_name: pub ? S.summary.player : null,
        p_is_public: pub, p_log_hash: S.hash, p_raw_log_path: folder + '/', p_summary: S.summary });
      if (r.error) {
        if (/duplicate key|23505/.test(r.error.message + (r.error.code || ''))) { S.busy = false; await lookupExisting(S.run); $('rankingModal').close(); return; }
        throw r.error;
      }
      S.sessionId = r.data; S.phase = 'submitted'; S.standing = null; S.busy = false; S.owner = true;
      $('rankingModal').close(); render(); loadStanding();
      $('rankingSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      S.busy = false; const m = (e && e.message) || String(e);
      msg.className = 'rk-err'; msg.textContent = /too_many_unclassified/.test(m) ? tr('e_unres') : /implausible/.test(m) ? tr('e_impl') : m;
      btn.disabled = !$('rkConsent').checked;
    }
  }

  // Ícones na tabela "rotação" do classificador: o app.js não é tocado; as linhas (tr[data-cls-comp]) ganham o ícone
  // da spell logo depois do ponto de cor, por observação do DOM. Sem ícone para o rótulo, a linha fica como está.
  async function decorateRotation() {
    const rows = document.querySelectorAll('tr[data-cls-comp]:not([data-rk-ic])'); if (!rows.length) return;
    const ic = await loadIcons(), voc = S.summary && S.summary.vocation;
    rows.forEach(tr => {
      if (tr.hasAttribute('data-rk-ic')) return;   // outra execução já tratou esta linha durante o await
      const key = tr.getAttribute('data-cls-comp');
      if (key === 'arrow' && !voc) return;   // vocação ainda desconhecida: tenta de novo no próximo ciclo
      tr.setAttribute('data-rk-ic', '1');
      const src = key === 'arrow' ? aaIcon(ic, voc) : (ic.spells || {})[key], dot = tr.querySelector('.cls-share-dot');
      if (!src || !dot) return;
      const img = document.createElement('img'); img.className = 'rk-ic lg'; img.src = src; img.alt = '';
      dot.replaceWith(img);   // o quadrado colorido sai: o ícone identifica o componente
    });
  }
  // Ícone no título de cada gráfico por componente ("gráficos do log"). O título é desenhado no canvas pelo Chart.js,
  // então o ícone é uma imagem sobreposta, à esquerda do texto centralizado. Sem ícone para o rótulo, nada muda.
  function placeChartIcon(wrap, chart, img) {
    if (!chart.ctx || !chart.canvas || !chart.canvas.isConnected) return;   // gráfico destruído (o app redesenha ao trocar o idioma)
    const ctx = chart.ctx; ctx.save(); ctx.font = '500 12px ' + (Chart.defaults.font.family || 'sans-serif');
    const w = ctx.measureText(chart.options.plugins.title.text).width; ctx.restore();
    img.style.left = Math.max(4, chart.width / 2 - w / 2 - 25) + 'px';
  }
  async function decorateCharts(tries) {
    const canvases = document.querySelectorAll('canvas[id^="clsHist"]'); if (!canvases.length || !window.Chart) return;
    const ic = await loadIcons(), voc = S.summary && S.summary.vocation; let pending = false;
    canvases.forEach(cv => {
      const wrap = cv.parentElement; if (!wrap || wrap.querySelector('img.rk-cic')) return;
      const chart = Chart.getChart(cv);
      if (chart && chart.options.scales && chart.options.scales.y && !chart.$rkAligned) { chart.$rkAligned = true; chart.options.scales.y.afterFit = sc => { sc.width = 74; }; chart.update('none'); }
      const title = chart && chart.options.plugins && chart.options.plugins.title && chart.options.plugins.title.text;
      if (!title) { pending = true; return; }
      const label = title.split(' · n=')[0], isAa = /^auto at/i.test(label);
      if (isAa && !voc) { pending = true; return; }
      const src = isAa ? aaIcon(ic, voc) : (ic.spells || {})[label]; if (!src) return;
      const img = document.createElement('img'); img.className = 'rk-cic'; img.src = src; img.alt = ''; wrap.appendChild(img);
      placeChartIcon(wrap, chart, img); new ResizeObserver(() => placeChartIcon(wrap, chart, img)).observe(wrap);
    });
    if (pending && (tries || 0) < 12) setTimeout(() => decorateCharts((tries || 0) + 1), 200);   // o Chart.js cria os gráficos logo depois do HTML
  }
  // Demais lugares com nome de spell: lista "composição do dano", tabela do grav san e coluna "componente" do detalhe do turno.
  // Casa o texto da célula com o nome da spell (inteiro ou só antes do parêntese); auto-ataque usa o ícone da vocação.
  let nameMap = null;
  function srcFor(text, ic, voc) {
    const k = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase(); if (!k) return null;
    if (/^auto at/.test(k)) return aaIcon(ic, voc) || null;
    if (!nameMap) { nameMap = new Map(); for (const [lab, src] of Object.entries(ic.spells || {})) { nameMap.set(lab.toLowerCase(), src); const b = lab.split(' (')[0].toLowerCase(); if (!nameMap.has(b)) nameMap.set(b, src); } }
    return nameMap.get(k) || null;
  }
  function mkIcon(src, cls, color) {
    const img = document.createElement('img'); img.className = 'rk-ic ' + cls; img.src = src; img.alt = '';
    if (color) img.style.outlineColor = color; return img;
  }
  async function decorateText() {
    const shares = [...document.querySelectorAll('.cls-share-name:not([data-rk-ic])')];
    const cells = [...document.querySelectorAll('table.cls-table tbody tr:not([data-cls-comp]) > td:first-child:not([data-rk-ic]), .cls-turn-detail-table tbody td:nth-child(3):not([data-rk-ic])')];
    if (!shares.length && !cells.length) return;
    const ic = await loadIcons(), voc = S.summary && S.summary.vocation;
    shares.forEach(el => {
      if (el.hasAttribute('data-rk-ic')) return;
      const src = srcFor(el.textContent, ic, voc); if (/^auto at/i.test(el.textContent.trim()) && !voc) return;
      el.setAttribute('data-rk-ic', '1'); if (!src) return;
      const dot = el.querySelector('.cls-share-dot'), img = mkIcon(src, 'md');
      if (dot) dot.replaceWith(img); else el.prepend(img);
    });
    cells.forEach(td => {
      if (td.hasAttribute('data-rk-ic')) return;
      if (/^auto at/i.test(td.textContent.trim()) && !voc) return;
      td.setAttribute('data-rk-ic', '1');
      const src = srcFor(td.textContent, ic, voc); if (src) td.prepend(mkIcon(src, td.closest('.cls-turn-detail-table') ? 'sm' : 'lg'));
    });
  }

  // Legenda do gráfico de componentes por turno: o Chart.js desenha a legenda no canvas, onde não cabe imagem; ela vira HTML
  // (ícone com contorno na cor da linha + nome; clicar liga/desliga a série, como a legenda original).
  async function decorateLegend() {
    const cv = document.getElementById('clsTimelineComponents'); if (!cv || !window.Chart) return;
    const chart = Chart.getChart(cv), wrap = cv.parentElement; if (!chart || !wrap) return;
    if (wrap._rkLegChart === chart) return;   // marca ANTES do await: execuções simultâneas não duplicam a legenda
    wrap._rkLegChart = chart;
    const old = wrap.previousElementSibling && wrap.previousElementSibling.classList.contains('rk-legend') ? wrap.previousElementSibling : null;
    if (old) old.remove();
    const ic = await loadIcons(), voc = S.summary && S.summary.vocation, ds = chart.data.datasets;
    const srcs = ds.map(d => srcFor(d.label, ic, voc)); if (!srcs.some(Boolean) || /^auto at/i.test(ds.map(d => d.label).join(' ')) && !voc) return;
    const box = document.createElement('div'); box.className = 'rk-legend'; box._chart = chart;
    ds.forEach((d, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rk-leg-item' + (chart.isDatasetVisible(i) ? '' : ' off');
      if (srcs[i]) { b.appendChild(mkIcon(srcs[i], 'md')); b.style.borderBottomColor = d.borderColor; } else { const sw = document.createElement('span'); sw.className = 'rk-leg-sw'; sw.style.background = d.borderColor; b.appendChild(sw); }
      const sp = document.createElement('span'); sp.textContent = d.label; b.appendChild(sp);
      b.onclick = () => { chart.setDatasetVisibility(i, !chart.isDatasetVisible(i)); b.classList.toggle('off', !chart.isDatasetVisible(i)); chart.update(); };
      box.appendChild(b);
    });
    wrap.insertAdjacentElement('beforebegin', box);
    chart.options.plugins.legend.display = false; chart.update('none');
  }
  let rotQueued = false;
  new MutationObserver(() => { if (rotQueued) return; rotQueued = true; requestAnimationFrame(() => { rotQueued = false; decorateRotation(); decorateCharts(); decorateText(); decorateLegend(); }); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // tooltip único, posicionado perto do cursor (delegação: funciona para o que for redesenhado)
  const tipEl = document.createElement('div'); tipEl.className = 'cls-chart-tip rk-tip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl);
  function placeTip(x, y) {
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    tipEl.style.left = Math.max(8, Math.min(x + 14, innerWidth - w - 8)) + 'px';
    tipEl.style.top = Math.max(8, y + 18 + h > innerHeight ? y - h - 14 : y + 18) + 'px';
  }
  function tipFor(e) { const t = e.target.closest && e.target.closest('#rankingSection [data-tip]'); return t && TIPS[+t.dataset.tip] != null ? t : null; }
  document.addEventListener('mouseover', e => { const t = tipFor(e); if (!t) return; tipEl.innerHTML = TIPS[+t.dataset.tip]; tipEl.classList.add('on'); placeTip(e.clientX, e.clientY); });
  document.addEventListener('mousemove', e => { if (tipEl.classList.contains('on')) placeTip(e.clientX, e.clientY); });
  document.addEventListener('mouseout', e => { if (tipFor(e)) tipEl.classList.remove('on'); });
  document.addEventListener('focusin', e => { const t = tipFor(e); if (!t) return; tipEl.innerHTML = TIPS[+t.dataset.tip]; tipEl.classList.add('on'); const b = t.getBoundingClientRect(); placeTip(b.left, b.bottom - 18); });
  document.addEventListener('focusout', () => tipEl.classList.remove('on'));

  ['langPt', 'langEn'].forEach(id => { const b = $(id); if (b) b.addEventListener('click', () => { render(); if (S.phase === 'submitted' && S.standing) renderStanding(); if (S.phase === 'ineligible') render(); }); });
  $('btnRanking').addEventListener('click', openModal);
  render();
})();
