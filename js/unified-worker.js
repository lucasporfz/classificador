/*
 * unified-worker.js — C7: o motor Unified rodando FORA da thread da UI.
 *
 * Este arquivo nao e carregado por <script src>; ele e o entry point de um
 * Worker (`new Worker('js/unified-worker.js')`, ver js/classify-port.js). Os
 * arquivos do motor sao IIFEs sobre `globalThis`, sem import/export, entao
 * carregam aqui com `importScripts` na MESMA ORDEM de index.html — nenhum
 * `js/unified-*.js` precisou mudar.
 *
 * A ordem e a mesma de `ENGINE_FILES` (tools/unified-corpus.mjs) mais
 * `unified-main.js`, que e quem monta o resultado no formato da UI. Os caminhos
 * sao relativos a ESTE arquivo, que vive em js/.
 */
/* global importScripts, postMessage */
'use strict';

importScripts(
  'stats.js',
  'mob-element-mods.js',
  'mob-element-mods-post-2026-06-16.js',
  'mob-element-mods-post-2026-08-25.js',
  'unified-session-context.js',
  'unified-formulas.js',
  'unified-parsing.js',
  'unified-setup-inference.js',
  'unified-validation.js',
  'unified-turn-resolution.js',
  'unified-classification-engine.js',
  'unified-main.js'
);

// O `_context` do resultado tem 42 campos, entre eles o cache de reversao e os
// fatos do log inteiro — megabytes que a UI nao le. Ela le exatamente estes dois
// (js/session-summary.js). A lista e travada por tests/ui-worker-port.test.mjs:
// se a UI passar a ler um terceiro campo, o teste falha em vez de a tela ficar
// silenciosamente vazia.
const CONTEXT_FIELDS_FOR_UI = ['combatMasteryLadder', 'omegaSetup'];

function forPostMessage(compat) {
  const unified = compat && compat.unifiedSource;
  if (!unified || !unified._context) return compat;
  const context = {};
  for (const field of CONTEXT_FIELDS_FOR_UI) context[field] = unified._context[field];
  return Object.assign({}, compat, {
    unifiedSource: Object.assign({}, unified, { _context: context }),
  });
}

self.onmessage = function(event) {
  const message = event.data || {};
  try {
    postMessage({ type: 'progress', phase: 'classifying' });
    const result = self.classifyWithLocalChat(message.serverText, message.localText, message.opts || {});
    postMessage({ type: 'done', result: forPostMessage(result) });
  } catch (err) {
    postMessage({ type: 'error', message: (err && err.message) || String(err) });
  }
};

postMessage({ type: 'progress', phase: 'ready' });
