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
    if (context && context._revCache) context._revCache.clear();
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
    return Object.assign({}, context || {}, { _revCache: new Map() });
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
  };

  root.UnifiedSessionContext = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
