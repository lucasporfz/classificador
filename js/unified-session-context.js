/*
 * unified-session-context.js
 *
 * C2 — parte o saco `context` em tres coisas com lifetime declarado. O objeto
 * `context` continua sendo UM objeto fisico, passado nas mesmas assinaturas de
 * sempre (os arquivos carregam por <script src> em escopo global, sem import/
 * export), mas 21 dos seus 40 campos deixam de ser dados soltos e viram
 * accessors sobre tres records:
 *
 *   context.setup       -> SessionSetup     congelado, substituido INTEIRO,
 *                                           carrega `epoch` (inteiro) que
 *                                           incrementa a cada substituicao;
 *   context.resolution  -> ResolutionState  vive UMA varredura e morre
 *                                           explicitamente (`beginResolutionPass`);
 *   context.hitScope    -> HitScope         escopo dinamico por bloco/hit, com
 *                                           um construtor nomeado por campo.
 *
 * Os 19 campos restantes sao fatos de sessao/opcoes (imutaveis depois de
 * `buildContext`) e continuam dados planos no proprio `context`.
 *
 * ESTE MODULE NAO MOVE ARITMETICA. Nenhuma regra de classificacao muda; `epoch`
 * e um contador que ninguem le ainda. Ele existe porque o que quebrou 90 turnos
 * na primeira tentativa de cache de validacao de bloco nao foi a memoizacao, foi
 * nao existir nenhum valor que diga "o setup mudou".
 *
 * DIVISAO DELIBERADA DENTRO DO HitScope
 * -------------------------------------
 * `gravSanHitOverride` e a UNICA entrada real do validador de bloco: quem chama
 * a validacao decide o modo de grav san ANTES de entrar. Os outros tres
 * (`_activeCritKey`, `_omegaAssignment`, `_omegaCrossStateTolerance`) sao
 * setados de DENTRO da propria validacao — sao derivados, nao entrada. Uma chave
 * de cache de bloco pode conter o primeiro e NAO pode conter os outros tres.
 * Por isso a separacao esta na estrutura (`HIT_SCOPE_INPUT_FIELDS` vs
 * `HIT_SCOPE_DERIVED_FIELDS`) e nao num comentario.
 *
 * O CACHE DE REVERSAO CONTINUA COMO ESTAVA
 * ----------------------------------------
 * `_revCache` mora no ResolutionState mas segue sendo um `Map` limpo nos MESMOS
 * pontos de hoje, via `invalidateReversalCache`. Nao e chaveado por `epoch` de
 * proposito: `bmDeterministicVerdict` e `bmPhysicalDeterministicVerdict`
 * (unified-setup-inference.js) trocam `bmPierce` SEM limpar o cache, ao
 * contrario dos outros tres probes de setup, que limpam. Chavear por `epoch`
 * consertaria essa inconsistencia e portanto MUDARIA resultado — decisao para
 * C1/C3 tomarem de proposito, com medicao, nao de carona num refactor neutro.
 * C3 manteve o `_revCache` intacto como camada 2 e pos na frente dele um memo
 * por hit chaveado pela impressao digital do setup: o probe de `bmPierce` troca
 * o setup, erra a camada 1 e cai na camada 2 exatamente como antes — a
 * inconsistencia continua inofensiva e nenhum resultado muda.
 *
 * Exporta globalThis.UnifiedSessionContext. Carregado ANTES de
 * unified-formulas.js (ver index.html e tools/unified-corpus.mjs).
 */
(function(root) {
  'use strict';

  // --- SessionSetup: congelado, substituido inteiro, versionado por `epoch`. ---
  // Tudo que a reversao de dano e o leech leem como "como este personagem estava
  // configurado nesta sessao". Muda entre varreduras e dentro dos probes de
  // hipotese; cada mudanca e uma substituicao.
  const SETUP_FIELDS = Object.freeze([
    'critSetup',
    'leechSetup',
    'gravSanSetup',
    'bountyTalismanSetup',
    'stanceSetup',
    'omegaSetup',
    'combatMasteryLadder',
    'bestiaryClassBonus',
    'aaElement',
    'weaponPhysicalPierce',
    'bmPierce',
  ]);

  // --- ResolutionState: vive uma varredura. ---
  // Acoes ja consumidas por turnos anteriores da MESMA varredura, o mapa
  // cast->turno pre-atribuido, a intencao da varredura e o cache de reversao.
  const RESOLUTION_FIELDS = Object.freeze([
    'preassignedGrenadeCasts',
    'consolidatedGrenadeCasts',
    'consolidatedSpellCasts',
    'consolidatedRuneUses',
    'grenadeAssignmentOnly',
    '_revCache',
    '_blockCache',
  ]);

  // --- HitScope: escopo dinamico por bloco/hit. ---
  const HIT_SCOPE_INPUT_FIELDS = Object.freeze(['gravSanHitOverride']);
  const HIT_SCOPE_DERIVED_FIELDS = Object.freeze([
    '_activeCritKey',
    '_omegaAssignment',
    '_omegaCrossStateTolerance',
  ]);
  const HIT_SCOPE_FIELDS = Object.freeze(
    HIT_SCOPE_INPUT_FIELDS.concat(HIT_SCOPE_DERIVED_FIELDS)
  );

  function freezeSetup(record) {
    return Object.freeze(record);
  }

  function emptySetup(seed) {
    const record = { epoch: 0 };
    for (const field of SETUP_FIELDS) record[field] = seed ? seed[field] : undefined;
    return freezeSetup(record);
  }

  function emptyResolution(seed) {
    const record = {};
    for (const field of RESOLUTION_FIELDS) record[field] = seed ? seed[field] : undefined;
    return record;
  }

  function emptyHitScope(seed) {
    const record = {};
    for (const field of HIT_SCOPE_FIELDS) record[field] = seed ? seed[field] : undefined;
    return record;
  }

  // Substitui o SessionSetup INTEIRO por um novo record congelado com `patch`
  // aplicado, incrementando `epoch`. E o unico caminho pelo qual o setup muda:
  // os setters dos 11 campos chamam isto.
  function replaceSetup(context, patch) {
    if (!context) return null;
    const previous = context.setup || emptySetup(null);
    const next = { epoch: (+previous.epoch || 0) + 1 };
    for (const field of SETUP_FIELDS) {
      next[field] = Object.prototype.hasOwnProperty.call(patch || {}, field)
        ? patch[field]
        : previous[field];
    }
    context.setup = freezeSetup(next);
    return context.setup;
  }

  function setupEpoch(context) {
    return context && context.setup ? (+context.setup.epoch || 0) : 0;
  }

  function defineDelegates(context, fields, recordKey) {
    for (const field of fields) {
      delete context[field];
      Object.defineProperty(context, field, {
        enumerable: true,
        configurable: true,
        get() { return this[recordKey][field]; },
        set(value) { this[recordKey][field] = value; },
      });
    }
  }

  function defineSetupDelegates(context) {
    for (const field of SETUP_FIELDS) {
      delete context[field];
      Object.defineProperty(context, field, {
        enumerable: true,
        configurable: true,
        get() { return this.setup[field]; },
        set(value) { replaceSetup(this, { [field]: value }); },
      });
    }
  }

  // Instala os tres records sobre um objeto semente (o `Object.assign({}, options)`
  // de `buildContext`). Chamado NO TOPO de `buildContext`, nao no fim: as
  // inferencias que rodam dentro dele (grav san, bounty, omega) fazem
  // save/restore de setup e executam validacao de bloco — se os accessors so
  // fossem instalados depois, essas substituicoes ficariam invisiveis ao `epoch`,
  // que e exatamente o furo que C1 herdaria.
  function create(seed) {
    const context = seed || {};
    const setup = emptySetup(context);
    const resolution = emptyResolution(context);
    const hitScope = emptyHitScope(context);
    // Nao-enumeraveis: `Object.assign({}, context)` continua produzindo os mesmos
    // campos planos de antes, sem os tres records.
    Object.defineProperty(context, 'setup', {
      enumerable: false, configurable: true, writable: true, value: setup,
    });
    Object.defineProperty(context, 'resolution', {
      enumerable: false, configurable: true, writable: true, value: resolution,
    });
    Object.defineProperty(context, 'hitScope', {
      enumerable: false, configurable: true, writable: true, value: hitScope,
    });
    defineSetupDelegates(context);
    defineDelegates(context, RESOLUTION_FIELDS, 'resolution');
    defineDelegates(context, HIT_SCOPE_FIELDS, 'hitScope');
    return context;
  }

  // --- ResolutionState: lifecycle explicito. --------------------------------

  // Abre uma varredura: instala o mapa cast->turno e zera as acoes consumidas.
  // Substitui o par `context.preassignedGrenadeCasts = ...; resetConsolidatedActions(...)`
  // que aparecia seis vezes em classifyUnifiedParsed.
  function beginResolutionPass(context, preassignedGrenadeCasts) {
    if (!context) return;
    context.preassignedGrenadeCasts = preassignedGrenadeCasts;
    context.consolidatedGrenadeCasts = new Set();
    context.consolidatedSpellCasts = new Set();
    context.consolidatedRuneUses = new Set();
  }

  // Ponto unico de invalidacao do cache de reversao. Mesma semantica de sempre
  // (`Map.clear()`), nos mesmos pontos de sempre — ver o cabecalho.
  function invalidateReversalCache(context) {
    // C3: o memo por hit aponta para objetos DESTE `_revCache`; morre junto com ele.
    if (context && context._revCache) resetHitReversalMemo(hitReversalMemos.get(context._revCache));
    if (context && context._revCache) context._revCache.clear();
    // C1: o cache de validacao de bloco tem o MESMO lifetime do cache de reversao —
    // ele memoiza exatamente o que a reversao alimenta, e por isso morre nos mesmos
    // pontos, nao num lifetime proprio.
    if (context && context._blockCache) context._blockCache.clear();
  }

  // Passe de SONDAGEM: as acoes da varredura em curso ficam escondidas (nenhum
  // consumo N-007/N-008 vale ali) e a intencao `grenadeAssignmentOnly` liga. E o
  // save/set/restore que `buildGrenadeCastAssignments` fazia campo a campo; o corpo
  // e longo demais para virar callback, entao o par entra/sai fica explicito.
  //
  // `_revCache` NAO entra aqui, de proposito: a sondagem compartilha o cache de
  // reversao da varredura, como sempre compartilhou. Ele e memo puro de entradas
  // identicas, entao compartilhar nao muda valor — mas trocar mudaria custo.
  const PROBE_RESOLUTION_FIELDS = Object.freeze([
    'consolidatedGrenadeCasts',
    'consolidatedSpellCasts',
    'consolidatedRuneUses',
    'preassignedGrenadeCasts',
    'grenadeAssignmentOnly',
  ]);

  function enterProbeResolutionState(context) {
    if (!context) return null;
    const saved = {};
    for (const field of PROBE_RESOLUTION_FIELDS) saved[field] = context[field];
    context.consolidatedGrenadeCasts = null;
    context.consolidatedSpellCasts = null;
    context.consolidatedRuneUses = null;
    context.preassignedGrenadeCasts = null;
    context.grenadeAssignmentOnly = true;
    return saved;
  }

  function exitProbeResolutionState(context, saved) {
    if (!context || !saved) return;
    for (const field of PROBE_RESOLUTION_FIELDS) context[field] = saved[field];
  }

  // Roda `fn` vendo apenas `cast` como granada ja consolidada, sem tocar no
  // resto do ResolutionState.
  function withOnlyConsolidatedGrenadeCast(context, cast, fn) {
    const saved = context.consolidatedGrenadeCasts;
    context.consolidatedGrenadeCasts = new Set([cast]);
    try {
      return fn();
    } finally {
      context.consolidatedGrenadeCasts = saved;
    }
  }

  // Contexto derivado com cache de reversao proprio, para provas pre-formacao
  // que nao devem povoar o cache global da sessao. Mesma forma do
  // `Object.assign({}, context, { _revCache: new Map() })` de sempre.
  function deriveWithFreshReversalCache(context) {
    // O derivado e um objeto PLANO (o Object.assign copia os accessors como valores),
    // entao ele nao tem `setup` e a memoizacao de bloco ja fica desligada nele; o
    // `_blockCache: null` deixa isso explicito em vez de herdar o Map da sessao.
    return Object.assign({}, context || {}, { _revCache: new Map(), _blockCache: null });
  }

  // --- HitScope: um construtor nomeado por campo. ---------------------------

  // Escreve pelo proprio , nao pelo record: num contexto instalado o accessor
  // delega para o HitScope, e num contexto montado a mao (testes, ferramentas de
  // diagnostico, que nunca passam por ) o campo simplesmente mora ali. Os dois
  // formatos precisam funcionar — o motor nao e o unico chamador desta camada.
  function withHitScopeField(context, field, value, fn) {
    if (!context) return fn();
    const previous = context[field];
    context[field] = value;
    try {
      return fn();
    } finally {
      context[field] = previous;
    }
  }

  function gravSanOverrideOf(context) {
    return context ? context.gravSanHitOverride : undefined;
  }

  // --- Identidade: o valor que C1 usa para chavear -------------------------
  //
  // Ids de identidade por objeto (um inteiro por objeto, para a vida do processo).
  // Servem para dizer "e o MESMO turno / a MESMA acao / o MESMO turn.actions" sem
  // depender de campo de dominio: `turn.ts` nao identifica turno (o assignment de
  // granada clona turnos com hits concatenados) e acao nao tem id estavel.
  const identityIds = new WeakMap();
  let nextIdentityId = 1;

  function identityId(value) {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return 0;
    let id = identityIds.get(value);
    if (id === undefined) {
      id = nextIdentityId++;
      identityIds.set(value, id);
    }
    return id;
  }

  // Impressao digital do SessionSetup: a identidade dos 11 campos, memoizada por
  // record (o record e congelado e substituido INTEIRO, entao isto e calculado uma
  // vez por epoch).
  //
  // POR QUE NAO O `epoch`. O epoch e monotonico: todo probe de hipotese de setup faz
  // save/restore, e o restore cria um record NOVO com o MESMO conteudo e um epoch
  // maior. Chavear cache por epoch puro jogaria o cache fora a cada probe — e os
  // probes dominam (o epoch chega a 130 numa sessao de 161 turnos em `murcion`). A
  // impressao digital volta a ser igual no restore, entao o cache sobrevive a sonda.
  //
  // Os dois tem exatamente a mesma exposicao a mutacao ANINHADA de setup (nenhum dos
  // dois a enxerga). O que sustenta os dois e a invariante de C2: setup e substituido,
  // nunca mutado em-lugar.
  const setupFingerprints = new WeakMap();

  function setupFingerprint(context) {
    const record = context && context.setup;
    if (!record) return null;
    let fingerprint = setupFingerprints.get(record);
    if (fingerprint === undefined) {
      const parts = [];
      for (const field of SETUP_FIELDS) {
        const value = record[field];
        parts.push(value !== null && (typeof value === 'object' || typeof value === 'function')
          ? '#' + identityId(value)
          : 'v' + String(value));
      }
      fingerprint = parts.join(',');
      setupFingerprints.set(record, fingerprint);
    }
    return fingerprint;
  }

  // A impressao digital internada como inteiro, para entrar numa chave numerica.
  const setupFingerprintIds = new Map();

  function setupFingerprintId(context) {
    const fingerprint = setupFingerprint(context);
    if (fingerprint === null) return null;
    let id = setupFingerprintIds.get(fingerprint);
    if (id === undefined) {
      id = setupFingerprintIds.size + 1;
      setupFingerprintIds.set(fingerprint, id);
    }
    return id;
  }

  // --- C3: memo da reversao por hit (camada 1 na frente do `_revCache`) -------
  //
  // O `_revCache` (camada 2) e chaveado pelo VALOR dos escalares ja resolvidos
  // (mod, mit, post, crit...), entao o prologo que os resolve rodava ate no acerto.
  // A camada 1 e chaveada pelas ENTRADAS desse prologo (objeto hit + setup + escopo
  // do hit) e guarda o objeto que a camada 2 devolveu. A camada 2 nunca sobrescreve
  // entrada entre duas limpezas, entao um acerto aqui devolve `===` o que a camada 2
  // devolveria: drift zero por construcao.
  //
  // Um memo POR INSTANCIA de `_revCache` (WeakMap): `weaponPierceEvaluateTier` troca
  // o `_revCache` temporariamente por um Map novo e depois restaura, e cada Map fica
  // com o seu memo. Limpo em `invalidateReversalCache`, junto com a camada 2.
  //
  // DESLIGADO sem `context.setup`: teste, ferramenta de diagnostico e o contexto
  // derivado de `deriveWithFreshReversalCache` montam `context` sem os records.
  //
  // Teto: acima dele o memo inteiro e descartado (a camada 2 continua la, entao isso
  // so custa tempo). Tem de ficar ACIMA do conjunto de trabalho de uma varredura.
  const HIT_REVERSAL_MEMO_LIMIT = 1000000;
  const hitReversalMemos = new WeakMap();
  const hitReversalMemoStats = { hits: 0, misses: 0, resets: 0, overflows: 0, maxEntries: 0 };

  function resetHitReversalMemo(memo) {
    if (!memo || !memo.entries) return;
    memo.byHit.clear();
    memo.entries = 0;
    hitReversalMemoStats.resets++;
  }

  function hitReversalMemoFor(context, revCache) {
    if (!context || !context.setup || !revCache) return null;
    let memo = hitReversalMemos.get(revCache);
    if (!memo) {
      memo = { byHit: new Map(), entries: 0 };
      hitReversalMemos.set(revCache, memo);
    }
    return memo;
  }

  function hitReversalMemoGet(memo, hit, key) {
    const byHit = memo.byHit.get(hit);
    const value = byHit === undefined ? undefined : byHit.get(key);
    if (value === undefined) hitReversalMemoStats.misses++;
    else hitReversalMemoStats.hits++;
    return value;
  }

  function hitReversalMemoSet(memo, hit, key, value) {
    if (memo.entries >= HIT_REVERSAL_MEMO_LIMIT) {
      hitReversalMemoStats.overflows++;
      resetHitReversalMemo(memo);
    }
    let byHit = memo.byHit.get(hit);
    if (byHit === undefined) {
      byHit = new Map();
      memo.byHit.set(hit, byHit);
    }
    if (!byHit.has(key)) memo.entries++;
    byHit.set(key, value);
    if (memo.entries > hitReversalMemoStats.maxEntries) hitReversalMemoStats.maxEntries = memo.entries;
  }

  // O cache de bloco mora no ResolutionState, ao lado do `_revCache`.
  function blockCacheFor(context) {
    if (!context) return null;
    let cache = context._blockCache;
    if (!cache) {
      cache = new Map();
      cache.hits = 0;
      cache.misses = 0;
      cache.evictions = 0;
      context._blockCache = cache;
    }
    return cache;
  }

  const API = {
    SETUP_FIELDS,
    RESOLUTION_FIELDS,
    HIT_SCOPE_INPUT_FIELDS,
    HIT_SCOPE_DERIVED_FIELDS,
    create,
    replaceSetup,
    setupEpoch,
    beginResolutionPass,
    invalidateReversalCache,
    enterProbeResolutionState,
    exitProbeResolutionState,
    withOnlyConsolidatedGrenadeCast,
    deriveWithFreshReversalCache,
    withHitScopeField,
    gravSanOverrideOf,
    identityId,
    setupFingerprint,
    setupFingerprintId,
    blockCacheFor,
    HIT_REVERSAL_MEMO_LIMIT,
    hitReversalMemoFor,
    hitReversalMemoGet,
    hitReversalMemoSet,
    hitReversalMemoStats,
  };

  root.UnifiedSessionContext = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
