/*
 * classify-port.js — C7: o seam entre a UI e o motor, com duas implementacoes.
 *
 * Antes a UI chamava `classifyWithLocalChat` direto, na mesma tick do clique: o
 * status "classificando…" era escrito e a thread travava antes de o navegador
 * pintar, por 25 a 40 segundos numa sessao de `15 sept`. Sem progresso e sem
 * cancelar.
 *
 * A interface e uma so:
 *
 *   ClassifyPort.classify(serverText, localText, opts, { onProgress })
 *     -> { promise, cancel() }
 *
 * Duas implementacoes por tras dela:
 *
 *   - WORKER (padrao): o motor roda num Worker, a aba continua respondendo e
 *     `cancel()` mata o trabalho de verdade (`terminate`);
 *   - MESMA THREAD (reserva): quando nao ha Worker — `file://` no Chrome bloqueia
 *     worker de script classico, e uma CSP pode bloquear tambem. Ai o
 *     comportamento e o de sempre, a menos de um `requestAnimationFrame` que
 *     deixa o navegador pintar o status antes de travar. `cancel()` nesse caminho
 *     so vale ANTES de comecar: uma vez dentro do motor, nao ha como interromper.
 *
 * Nenhum `js/unified-*.js` muda por causa deste arquivo.
 */
(function(root) {
  'use strict';

  const WORKER_URL = 'js/unified-worker.js';

  function cancelledError() {
    const err = new Error('classification_cancelled');
    err.cancelled = true;
    return err;
  }

  function classify(serverText, localText, opts, handlers) {
    const onProgress = (handlers && handlers.onProgress) || function() {};
    let worker = null;
    let settled = false;
    let cancelled = false;
    let reject = null;

    const promise = new Promise((resolvePromise, rejectPromise) => {
      reject = rejectPromise;

      const finish = fn => { settled = true; fn(); };

      const runOnMainThread = () => {
        onProgress({ phase: 'main_thread' });
        // Duas voltas: o rAF garante um frame pintado, o setTimeout garante que o
        // trabalho so comeca depois dele.
        root.requestAnimationFrame(() => setTimeout(() => {
          if (cancelled) return;
          try {
            const result = root.classifyWithLocalChat(serverText, localText, opts || {});
            finish(() => resolvePromise(result));
          } catch (err) {
            finish(() => rejectPromise(err));
          }
        }, 0));
      };

      const disposeWorker = () => {
        if (!worker) return;
        try { worker.terminate(); } catch (_err) { /* ja morto */ }
        worker = null;
      };

      try {
        worker = new root.Worker(WORKER_URL);
      } catch (_err) {
        worker = null;
      }
      if (!worker) return runOnMainThread();

      worker.onmessage = event => {
        const message = event.data || {};
        if (message.type === 'progress') { onProgress(message); return; }
        disposeWorker();
        if (message.type === 'done') finish(() => resolvePromise(message.result));
        else finish(() => rejectPromise(new Error(message.message || 'worker_failed')));
      };

      // Falha de carga (file://, CSP) chega aqui ANTES de qualquer resultado: cai
      // para a mesma thread em vez de deixar a tela pendurada.
      worker.onerror = event => {
        if (settled || cancelled) return;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        disposeWorker();
        runOnMainThread();
      };

      worker.postMessage({ serverText, localText, opts: opts || {} });
    });

    return {
      promise,
      usesWorker() { return !!worker; },
      cancel() {
        if (settled || cancelled) return false;
        cancelled = true;
        settled = true;
        if (worker) {
          try { worker.terminate(); } catch (_err) { /* ja morto */ }
          worker = null;
        }
        reject(cancelledError());
        return true;
      },
    };
  }

  root.ClassifyPort = Object.freeze({ classify, WORKER_URL });
})(typeof globalThis !== 'undefined' ? globalThis : window);
