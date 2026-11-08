// Auditoria de resíduos das folgas tipo B (mapa "Manutenção do motor Unified", tickets
// "Folgas: como a auditoria troca o valor de cada folga" e "... rodar a auditoria").
//
// Para cada folga, carrega o motor no vm com o TEXTO da definição trocado por zero (antes
// do carregamento: os módulos desestruturam UnifiedFormulas na carga, trocar depois não
// tem efeito) e compara o corpus inteiro com o motor intacto. Motor de produção intocado.
// Cada troca precisa casar o texto exatamente 1 vez, senão a ferramenta para.
//
// A passada de referência ("baseline") roda o motor intacto com SONDAS só de leitura nos
// pontos de uso: quando uma comparação passa só por causa da folga (exata falharia), a
// sonda grava a sobra com sinal e os multiplicadores do hit. Os casos salvos (turno que
// muda quando a folga é zerada) recebem as sobras dos hits do seu componente.
//
// Opções da UI (strictLeech, maxOriginal 6000, float16), corpus inteiro sem recorte por
// data (só CORPUS_EXCLUSIONS), um processo por par e por variante.
//
// Uso: node tools/audit-tolerance-residuals.mjs [--out reports/tolerance-audit]
//        [--variants baseline,omega,...] [--pairs chave1,chave2] [--jobs 3] [--report-only]
//        [--no-report]  (só as medições, para comparar com tools/compare-variant.mjs)
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ENGINE_FILES, UnifiedCorpus, exclusionFor, clockForTs } from './unified-corpus.mjs';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const valueOf = flag => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
const OUT = path.resolve(valueOf('--out') || 'reports/tolerance-audit');
const HEAP_MB = +(process.env.UNIFIED_CHECKS_HEAP_MB || 14336);

// --- variantes: cada folga zerada pelo texto da definição --------------------------------
const BM_OVERRIDE = { 'jaded#7': 0, 'jaded#8': 0, 'barrage#0': 0.04, 'darklight e vemiath#1': 0.04, 'mazzerinbarrage#1': 0.04, 'moonsilver#0': 0.08 };
const VARIANTS = {
  baseline: { label: 'motor intacto + sondas', edits: [], probes: true },
  // Motor intacto SEM sondas: prova que as sondas não mudam nenhum turno.
  plain: { label: 'motor intacto sem sondas', edits: [] },
  omega: {
    label: 'omega cross-state ±1',
    edits: [['js/unified-formulas.js', 'const OMEGA_CROSS_STATE_TOLERANCE = 1;', 'const OMEGA_CROSS_STATE_TOLERANCE = 0;']],
  },
  leech: {
    label: 'valor de leech 3/1/5',
    edits: [
      ['js/unified-formulas.js', 'const LEECH_VALUE_TOLERANCE_SMALL_BLOCK = 3;', 'const LEECH_VALUE_TOLERANCE_SMALL_BLOCK = 0;'],
      ['js/unified-formulas.js', 'const LEECH_VALUE_TOLERANCE_LARGE_BLOCK = 1;', 'const LEECH_VALUE_TOLERANCE_LARGE_BLOCK = 0;'],
      ['js/unified-formulas.js', 'const LEECH_VALUE_TOLERANCE_SMALL_BLOCK_MAX = 5;', 'const LEECH_VALUE_TOLERANCE_SMALL_BLOCK_MAX = 0;'],
    ],
  },
  physical: {
    label: 'interseção física 4',
    edits: [['js/unified-formulas.js', 'const PHYSICAL_INTERSECTION_TOLERANCE = 4;', 'const PHYSICAL_INTERSECTION_TOLERANCE = 0;']],
  },
  cluster: {
    label: 'cluster elemental 8/12/0,004',
    edits: [
      ['js/unified-formulas.js', 'const ELEMENTAL_CLUSTER_MIN_TOLERANCE = 8;', 'const ELEMENTAL_CLUSTER_MIN_TOLERANCE = 0;'],
      ['js/unified-formulas.js', 'const ELEMENTAL_CLUSTER_MAX_TOLERANCE = 12;', 'const ELEMENTAL_CLUSTER_MAX_TOLERANCE = 0;'],
      ['js/unified-formulas.js', 'const ELEMENTAL_CLUSTER_RATIO = 0.004;', 'const ELEMENTAL_CLUSTER_RATIO = 0;'],
    ],
  },
  charm: {
    label: 'charm esperado 1,25% (o piso de 2 fica)',
    edits: [['js/unified-classification-engine.js', 'const CHARM_EXPECTED_TOLERANCE_RATIO = 0.0125;', 'const CHARM_EXPECTED_TOLERANCE_RATIO = 0;']],
  },
  combatMastery: {
    label: 'nível de Combat Mastery ±1 (só medir)',
    edits: [['js/unified-formulas.js', 'const COMBAT_MASTERY_LEVEL_TOLERANCE = 1;', 'const COMBAT_MASTERY_LEVEL_TOLERANCE = 0;']],
  },
  elementalBlock: {
    label: 'bloco elemental 2 (runa 4)',
    edits: [['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "return (block && block.comp === 'rune' && block.action) ? 0 : 0;"]],
  },
  leechRate: {
    label: 'taxa de leech delta <= 1',
    edits: [['js/unified-setup-inference.js', 'if (delta <= 1 && (!best || delta < best.delta', 'if (delta <= 0 && (!best || delta < best.delta']],
  },
  // Ticket "Multiplicadores finais um por um, cada um com FLOOR": hipóteses de ordem dos
  // multiplicadores finais. Medição com sondas; fora do relatório de folgas.
  postFloorOnly: { label: 'produto único, só FLOOR (sem CEIL)', probes: true, report: false,
    edits: [['js/unified-formulas.js', 'add(invCeil(displayDamage, post));', '']] },
  ...Object.fromEntries(Object.entries({
    seqPreyFirst: ['prey', 'bounty', 'grav', 'cls', 'stance'],
    seqPreyLast: ['bounty', 'grav', 'prey', 'cls', 'stance'],
    seqClsFirst: ['cls', 'prey', 'bounty', 'grav', 'stance'],
    seqGravFirst: ['prey', 'grav', 'bounty', 'cls', 'stance'],
  }).map(([name, order]) => [name, { label: 'em sequência com FLOOR: ' + order.join(' → '), probes: true, report: false, edits: sequentialPostEdits(order) }])),
  // Mesma conta em inteiros (fator × 10^6): FLOOR(x × q) em ponto flutuante erra quando
  // x × q cai logo abaixo de um inteiro (100 × 1,15 = 114,999…).
  ...Object.fromEntries(Object.entries({
    seqClsFirstExact: ['cls', 'prey', 'bounty', 'grav', 'stance'],
    seqPreyClsExact: ['prey', 'cls', 'bounty', 'grav', 'stance'],
  }).map(([name, order]) => [name, { label: 'em sequência com FLOOR inteiro: ' + order.join(' → '), probes: true, report: false, edits: sequentialPostEdits(order, true) }])),
  // Mesma ordem, outro arredondamento por passo.
  seqPreyClsRound: { label: 'em sequência com ROUND', probes: true, report: false, edits: sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'round') },
  seqPreyClsCeil: { label: 'em sequência com CEIL', probes: true, report: false, edits: sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'ceil') },
  // Ticket "Perfect shot: o +20 entra depois dos bônus finais?": posição do +20 por cima
  // de seqPreyClsExact. A chave do cache de reversão continua com o bônus (sem colisão).
  psAfterPost: { label: 'perfect shot +20 depois de todos os bônus finais', probes: true, report: false,
    edits: [...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'floor', 'post'), ...psPremitOff()] },
  // Ticket "Folga do bloco elemental": folga zerada por cima de psAfterPost (sem sondas).
  psBlock0: { label: 'psAfterPost com o bloco elemental em 0', report: false,
    edits: [...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'floor', 'post'), ...psPremitOff(),
      ['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "return (block && block.comp === 'rune' && block.action) ? 0 : 0;"]] },
  // Mitigação da tabela tem 2 casas: o valor real está em ±0,005 p.p. (janela na inversão elemental).
  psWin: { label: 'psAfterPost com a janela de mitigação', report: false, edits: psWindowEdits() },
  psWin0: { label: 'janela de mitigação, bloco elemental em 0', report: false,
    edits: [...psWindowEdits(), ['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "return 0;"]] },
  psWin0nc: { label: 'janela de mitigação, bloco elemental em 0 sem crítico', report: false,
    edits: [...psWindowEdits(), ['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "if (!(block && block.hits && block.hits.some(h => h.realCrit))) return 0; return (block && block.comp === 'rune' && block.action) ? 4 : 2;"]] },
  // Medição: pierce de sessão forçado onde o censo por bloco pede outro valor (só estes pares).
  psWinBm: { label: 'janela + BM forçado, folga mantida', report: false, bmOverride: BM_OVERRIDE, edits: psWindowEdits() },
  psWin0Bm: { label: 'janela + BM forçado, bloco em 0', report: false, bmOverride: BM_OVERRIDE,
    edits: [...psWindowEdits(), ['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "return 0;"]] },
  psWin0ncBm: { label: 'janela + BM forçado, bloco em 0 sem crítico', report: false, bmOverride: BM_OVERRIDE,
    edits: [...psWindowEdits(), ['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "if (!(block && block.hits && block.hits.some(h => h.realCrit))) return 0; return (block && block.comp === 'rune' && block.action) ? 4 : 2;"]] },
  // Medição: +4% de holy pierce (perk de M-040-nota) só em hit real, no lugar do BM forçado.
  psWin0ncHoly: { label: 'janela + holy pierce de arma, bloco em 0 sem crítico', report: false, holyExtra: { 'moonsilver#0': 0.04, 'barrage#0': 0.04, 'darklight e vemiath#1': 0.04, 'mazzerinbarrage#1': 0.04 },
    edits: [...psWindowEdits(), ['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "if (!(block && block.hits && block.hits.some(h => h.realCrit))) return 0; return (block && block.comp === 'rune' && block.action) ? 4 : 2;"],
      ['js/unified-formulas.js', "if (element === 'death' && hit && hit.dmg != null && context && context.weaponDeathPierce) {", "if (element === 'holy' && hit && hit.dmg != null && globalThis.__holyExtra) p += globalThis.__holyExtra; if (element === 'death' && hit && hit.dmg != null && context && context.weaponDeathPierce) {"]] },
  // Estudo da escada de mitigação: valor real no degrau inteiro, sem margem e sem float16.
  ladderKeep: { label: 'escada, folga mantida', report: false, edits: [...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'floor', 'post'), ...psPremitOff(), ladderEdit()] },
  ladder0nc: { label: 'escada, bloco elemental em 0 sem crítico', report: false, edits: [...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'floor', 'post'), ...psPremitOff(), ladderEdit(), ["js/unified-validation.js", "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "if (!(block && block.hits && block.hits.some(h => h.realCrit))) return 0; return (block && block.comp === 'rune' && block.action) ? 4 : 2;"]] },
  ladder0ncHoly: { label: 'escada + holy pierce de arma, bloco em 0 sem crítico', report: false, holyExtra: { 'moonsilver#0': 0.04, 'barrage#0': 0.04, 'darklight e vemiath#1': 0.04, 'mazzerinbarrage#1': 0.04 }, edits: [...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'floor', 'post'), ...psPremitOff(), ladderEdit(), ["js/unified-validation.js", "return (block && block.comp === 'rune' && block.action) ? 4 : 2;", "if (!(block && block.hits && block.hits.some(h => h.realCrit))) return 0; return (block && block.comp === 'rune' && block.action) ? 4 : 2;"], ["js/unified-formulas.js", "if (element === 'death' && hit && hit.dmg != null && context && context.weaponDeathPierce) {", "if (element === 'holy' && hit && hit.dmg != null && globalThis.__holyExtra) p += globalThis.__holyExtra;\n    if (element === 'death' && hit && hit.dmg != null && context && context.weaponDeathPierce) {"]] },
  // Crítico: C = CEIL(E × k), k varrido por componente, sobre o motor de 7d10d60.
  win: { label: 'janela de mitigação, folga mantida', report: false, edits: [mitigationWindowEdit()] },
  critK: { label: 'crítico CEIL + k exato, folga mantida', report: false, edits: critExactEdits({ rounding: 'ceil', scan: true }) },
  critK0c: { label: 'crítico CEIL + k exato, bloco com crítico em 0', report: false, edits: critExactEdits({ rounding: 'ceil', scan: true, crit0: true }) },
  critKS0c: { label: 'crítico CEIL + k exato + Savage +0,40, bloco com crítico em 0', report: false, edits: critExactEdits({ rounding: 'ceil', scan: true, crit0: true, savage: 0.4 }) },
  critKO0: { label: 'crítico CEIL + k exato, omega cross-state em 0 (a folga ainda é usada?)', report: false, edits: [...critExactEdits({ rounding: 'ceil', scan: true }), ['js/unified-formulas.js', 'const OMEGA_CROSS_STATE_TOLERANCE = 1;', 'const OMEGA_CROSS_STATE_TOLERANCE = 0;']] },
  critRand0c: { label: 'controle: k aleatório por componente, bloco com crítico em 0', report: false, edits: critExactEdits({ rounding: 'ceil', scan: true, crit0: true, random: true }) },
  // Sobre o motor de 3c3fa69 (D-010j já em js/): Savage Blow somado ao k, folga zero no bloco
  // crítico, folga de omega em 0 e o controle de k aleatório.
  sav40: { label: 'Savage +0,40, folga mantida', report: false, edits: currentCritEdits({ savage: 0.4 }) },
  sav40O0: { label: 'Savage +0,40, omega cross-state em 0', report: false, edits: currentCritEdits({ savage: 0.4, omega0: true }) },
  cur0c: { label: 'bloco com crítico em 0', report: false, edits: currentCritEdits({ crit0: true }) },
  sav40c0: { label: 'Savage +0,40, bloco com crítico em 0', report: false, edits: currentCritEdits({ savage: 0.4, crit0: true }) },
  sav40c0O0: { label: 'Savage +0,40, bloco com crítico em 0, omega em 0', report: false, edits: currentCritEdits({ savage: 0.4, crit0: true, omega0: true }) },
  savVote: { label: 'Savage por nível votado na sessão (D-008b), bloco crítico e omega em 0', report: false, edits: savageVoteEdits() },
  curRand0c: { label: 'controle: k aleatório por componente, bloco com crítico em 0', report: false, edits: currentCritEdits({ crit0: true, random: true }) },
  psAfterMit: { label: 'perfect shot +20 entre a mitigação e o prey', probes: true, report: false,
    edits: [...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'floor', 'mit'), ...psPremitOff()] },
  psBeforeCrit: { label: 'perfect shot +20 antes do crítico (pré-mitigação)', probes: true, report: false,
    edits: [...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true), ...psPremitOff(),
      ['js/unified-formulas.js', 'const oIv = invRound(ee, mod);', 'const oIv = ee - perfectShotBonus < 1 ? null : invRound(ee - perfectShotBonus, mod);'],
      ['js/unified-formulas.js', 'lo = Math.min(lo, aIv[0]);', 'if (aIv[1] - perfectShotBonus < 0) continue; lo = Math.min(lo, Math.max(0, aIv[0] - perfectShotBonus));'],
      ['js/unified-formulas.js', 'hi = Math.max(hi, aIv[1]);', 'hi = Math.max(hi, aIv[1] - perfectShotBonus);']] },
};

// Inversão em sequência: y_i = FLOOR(y_{i-1} × f_i) na ordem dada, só FLOOR. Cada passo é
// monótono, então a pré-imagem de um intervalo é um intervalo (aparada pela conta direta).
function ladderEdit() { return ['js/unified-formulas.js', 'const x = opts && opts.useFloat16Mitigation === false ? mit : f16round(mit);',
  `const __reg = opts && opts.mobModsPost && (opts.sessionDateKey == null || opts.sessionDateKey >= CUTOFF_KEY) ? 'post' : 'pre'; const __L = n => { const x = n / 100; return __reg === 'post' ? x * (3.5834597809667854 + 0.9241853565584408 * Math.log(x + 1.4)) : x * (2.3234588580865547 + 0.4840450910784542 * Math.log(x + 1.4)); }; let __n = 0, __e = 1e9; if (mit > 0) for (let n = 1; n <= 220; n++) { const d = Math.abs(__L(n) - mit * 100); if (d < __e) { __e = d; __n = n; } } const x = mit > 0 ? __L(__n) / 100 : 0;`]; }
function psWindowEdits() { return [
  ...sequentialPostEdits(['prey', 'cls', 'bounty', 'grav', 'stance'], true, 'floor', 'post'), ...psPremitOff(),
  ['js/unified-formulas.js', 'const eIv = invFloor(aa, mit);', 'const eIv = rawMitigation > 0 ? [Math.ceil(aa / (1 - (rawMitigation - 0.005) / 100)), Math.ceil((aa + 1) / (1 - (rawMitigation + 0.005) / 100)) - 1] : invFloor(aa, mit);'],
]; }
// Janela de mitigação sobre o motor de 7d10d60 (a fila de bônus finais já está em js/).
function mitigationWindowEdit() {
  return ['js/unified-formulas.js', 'const eIv = invFloor(aa, mit);', 'const eIv = rawMitigation > 0 ? [Math.ceil(aa / (1 - (rawMitigation - 0.005) / 100)), Math.ceil((aa + 1) / (1 - (rawMitigation + 0.005) / 100)) - 1] : invFloor(aa, mit);'];
}
function critExactEdits({ rounding, scan, crit0 = false, nc0 = false, shift = 0, random = false, fixKey = true, savage = 0 }) {
  const edits = [mitigationWindowEdit()];
  if (fixKey) {
    edits.push(['js/unified-validation.js', '() => physicalOriginalInterval(hit, context));',
      "() => SessionContext.withHitScopeField(context, '_activeCritKey', critKeyForBlock(block), () => physicalOriginalInterval(hit, context)));"]);
    edits.push(['js/unified-validation.js', '() => elementalOriginalCandidates(hit, element, context));',
      "() => SessionContext.withHitScopeField(context, '_activeCritKey', critKeyForBlock(block), () => elementalOriginalCandidates(hit, element, context)));"]);
  }
  if (savage) edits.push(['js/unified-formulas.js', 'if (hit.onslaught) mult += (ONSLAUGHT_DAMAGE_MULTIPLIER - 1);', `if (hit.onslaught) mult += (ONSLAUGHT_DAMAGE_MULTIPLIER - 1);\n    if (hit.savageBlow) mult += ${savage};`]);
  const helper = `const __CRIT_ROUNDING = ${JSON.stringify(rounding)};
  function __critFinal(context) { return !!(context && context.critSetup && context.critSetup.source === 'bucket_two_pass'); }
  function __critInv(y, k) {
    const q = Math.round(k * 1e6);
    if (__CRIT_ROUNDING === 'ceil') return [Math.floor((y - 1) * 1e6 / q) + 1, Math.floor(y * 1e6 / q)];
    return [Math.ceil(y * 1e6 / q), Math.ceil((y + 1) * 1e6 / q) - 1];
  }
  function __critInvScan(y, k) {
    const q = Math.round(k * 1e6);
    if (__CRIT_ROUNDING === 'floor') return [Math.ceil(y * 1e6 / q), Math.ceil((y + 1) * 1e6 / q) - 1];
    return [Math.floor((y - 1) * 1e6 / q) + 1, Math.floor(y * 1e6 / q)];
  }
  function __scanExactCrit(turns, context, estimates) {
    const SC = sessionContextApi();
    const groups = new Map();
    for (const t of turns || []) for (const comp of (t && t.components) || []) {
      if (!comp || comp.comp === 'unresolved') continue;
      const key = critKeyForBlock(comp);
      const a = comp.action || {};
      const el = (comp.deterministic && comp.deterministic.element) || (a.profile && a.profile.element);
      if (!key || !el || el === 'physical' || !ELEMENT_KEYS[el]) continue;
      const words = normalizeName(a.incantation || a.words || a.text || a.spell || a.name || '');
      if (isChainedPenanceAction(a) || isExecutionerThrowAction(a) || isTerraBurstAction(a) || /^(exevo gran vis lux|exevo vis lux|exevo max mort)$/.test(words)) continue;
      const stages = new Map();
      for (const h of comp.hits || []) {
        if (!isMainHit(h) || h.overkill || h.zeroDamageDodge || h.savageBlow || !(+h.dmg > 0)) continue;
        const sk = h.multiStageStage ? h.multiStageStage + '@' + h.multiStageCastTs : '';
        if (!stages.has(sk)) stages.set(sk, []);
        stages.get(sk).push(h);
      }
      const next = comp.gravSanActive == null ? null : Object.assign({}, context.gravSanHitOverride || {});
      if (next) for (const h of comp.hits || []) if (h && h.id != null && gravSanHitInWindow(context, h)) next[h.id] = !!comp.gravSanActive;
      const readRows = () => {
        const out = [];
        for (const hits of stages.values()) {
          if (!hits.some(h => h.realCrit)) continue;
          const seen = new Set(), rows = [];
          for (const h of hits) {
            const mods = getMobMods(h.mob, context);
            const raw = mods && +mods[ELEMENT_KEYS[el]];
            if (!(raw > 0)) continue;
            const mit = +(mods.mitigation) || 0;
            const mod = effectiveMod(raw, pierceForElement(el, h, context));
            const iv = inverseFinalBonusIntervals(+h.dmg, h, context);
            if (!iv.length) continue;
            const [aLo, aHi] = iv[0];
            const cLo = mit > 0 ? Math.ceil(aLo / (1 - (mit - 0.005) / 100)) : aLo;
            const cHi = mit > 0 ? Math.ceil((aHi + 1) / (1 - (mit + 0.005) / 100)) - 1 : aHi;
            const omega = omegaActiveForHit(h, context);
            const add = h.realCrit ? (isTranscendenceActiveAt(context, transcendenceTsForHit(h)) ? TRANSCENDENCE_CRIT_BONUS : 0) + (h.onslaught ? ONSLAUGHT_DAMAGE_MULTIPLIER - 1 : 0) : 0;
            const sig = [h.mob, h.dmg, mod, omega, add, h.realCrit, h.perfectShot, cLo, cHi].join('|');
            if (seen.has(sig)) continue;
            seen.add(sig);
            rows.push({ crit: !!h.realCrit, ons: !!h.onslaught, cLo, cHi, mod, omega, add });
          }
          if (rows.length >= 2) out.push(rows);
        }
        return out;
      };
      const blocks = next ? SC.withHitScopeField(context, 'gravSanHitOverride', next, readRows) : readRows();
      if (!blocks.length) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(...blocks);
    }
    const closes = (rows, k) => {
      let lo = -Infinity, hi = Infinity;
      for (const r of rows) {
        let eLo = r.cLo, eHi = r.cHi;
        const kk = r.crit ? k + r.add : (r.ons ? ONSLAUGHT_DAMAGE_MULTIPLIER : 1);
        if (kk > 1) { eLo = __critInvScan(r.cLo, kk)[0]; eHi = __critInvScan(r.cHi, kk)[1]; }
        if (eHi < eLo) return false;
        let [oLo, oHi] = invRoundRange(eLo, eHi, r.mod);
        if (oHi < oLo) return false;
        if (r.omega) { [oLo, oHi] = invRoundRange(oLo, oHi, OMEGA_MULTIPLIER); if (oHi < oLo) return false; }
        if (oLo > lo) lo = oLo;
        if (oHi < hi) hi = oHi;
        if (hi < lo) return false;
      }
      return true;
    };
    const found = new Map();
    for (const [key, blocks] of groups) {
      let best = 0, ks = [];
      for (let g = 1300; g <= 2600; g += 5) {
        const k = g / 1000;
        let n = 0;
        for (const rows of blocks) if (closes(rows, k)) n++;
        if (n > best) { best = n; ks = [k]; } else if (n === best && n > 0) ks.push(k);
      }
      if (best > 0) found.set(key, { best, ks, n: blocks.length });
    }
    const strong = new Set();
    for (const v of found.values()) if (v.best >= 3 && v.ks.length <= 3) for (const k of v.ks) strong.add(k);
    const out = {};
    for (const [key, v] of found) {
      const est = estimates && estimates[key] > 1 ? estimates[key] : (context.critSetup && context.critSetup.fallback) || 1.6;
      const pool = v.ks.filter(k => strong.has(k));
      out[key] = (pool.length ? pool : v.ks).slice().sort((a, b) => Math.abs(a - est) - Math.abs(b - est))[0];
    }
    return { out, found };
  }
  function isMainHit(hit) {`;
  edits.push(['js/unified-formulas.js', 'function isMainHit(hit) {', helper]);
  edits.push(['js/unified-formulas.js', 'root.UnifiedFormulas = API;', 'API.__scanExactCrit = __scanExactCrit; root.UnifiedFormulas = API;']);
  if (rounding !== 'both') {
    edits.push(['js/unified-formulas.js', 'const preCritIntervals = inverseCriticalMultiplierIntervals(tb, crit);',
      'const preCritIntervals = crit > 1 && __critFinal(context) ? [__critInv(tb, crit)] : inverseCriticalMultiplierIntervals(tb, crit);']);
  }
  if (scan) {
    const post = random
      ? 'for (const k of Object.keys(__exact.out)) { let s = 0; for (const c of k) s = (s * 31 + c.charCodeAt(0)) >>> 0; est.byComponent[k] = 1.5 + (s % 21) * 0.03; }'
      : `for (const k of Object.keys(__exact.out)) est.byComponent[k] = Math.round((__exact.out[k] + ${shift}) * 1000) / 1000;`;
    edits.push(['js/unified-classification-engine.js', 'const est = inferCritByComponent(labeledHitsFromTurns(pass1), null, context);',
      'const est = inferCritByComponent(labeledHitsFromTurns(pass1), null, context);\n      const __raw = Object.assign({}, est.byComponent);\n      const __exact = globalThis.UnifiedFormulas.__scanExactCrit(pass1, context, __raw);\n      for (const k of Object.keys(__exact.out)) if (!est.byComponent[k]) est.byComponent[k] = __exact.out[k];']);
    edits.push(['js/unified-classification-engine.js', 'if (est.byComponent.physical > CRIT_BOOTSTRAP_MAX) est.byComponent.physical = CRIT_BOOTSTRAP_MAX;',
      `if (est.byComponent.physical > CRIT_BOOTSTRAP_MAX) est.byComponent.physical = CRIT_BOOTSTRAP_MAX;\n        ${post}`]);
    // O eixo do AA (S-007) só é conhecido depois do refino: as passadas até ali seguem com a
    // inversão e a folga de hoje; uma varredura final com o eixo do AA fixa o k, e só a
    // passada seguinte, a última, usa a conta exata.
    edits.push(['js/unified-classification-engine.js', "source: 'bucket_two_pass',", "source: 'bucket_scan_prelim',"]);
    const finalPost = random
      ? 'let s = 0; for (const c of k) s = (s * 31 + c.charCodeAt(0)) >>> 0; const __v = 1.5 + (s % 21) * 0.03;'
      : `const __v = Math.round((__ex.out[k] + ${shift}) * 1000) / 1000;`;
    edits.push(['js/unified-classification-engine.js', 'resolvedTurns = resolveWithExecutionerTier(turns.map(t => resolveTurn(t, facts, context)));',
      `resolvedTurns = resolveWithExecutionerTier(turns.map(t => resolveTurn(t, facts, context)));
      if (context.critSetup && context.critSetup.source === 'bucket_scan_prelim') {
        const __ex = globalThis.UnifiedFormulas.__scanExactCrit(resolvedTurns, context, context.critSetup.byComponent);
        const __by = Object.assign({}, context.critSetup.byComponent);
        for (const k of Object.keys(__ex.out)) { ${finalPost} __by[k] = __v; }
        SessionContext.replaceSetup(context, { critSetup: Object.assign({}, context.critSetup, { byComponent: __by, source: 'bucket_two_pass' }) });
        SessionContext.invalidateReversalCache(context);
        SessionContext.beginResolutionPass(context, buildGrenadeCastAssignments(turns, facts, context));
        resolvedTurns = resolveWithExecutionerTier(turns.map(t => resolveTurn(t, facts, context)));
      }`, 2]);
  }
  if (crit0 || nc0) {
    edits.push(['js/unified-validation.js', 'function elementalBlockTolerance(block) {', 'function elementalBlockTolerance(block, context) {']);
    edits.push(['js/unified-validation.js', 'const tolerance = elementalBlockTolerance(block);', 'const tolerance = elementalBlockTolerance(block, context);', 2]);
    edits.push(['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;",
      `const __hasCrit = !!(block && block.hits && block.hits.some(h => h.realCrit));\n    const __boot = !(context && context.critSetup && context.critSetup.source === 'bucket_two_pass');\n    if (__hasCrit ? (${crit0} && !__boot) : ${nc0}) return 0;\n    return (block && block.comp === 'rune' && block.action) ? 4 : 2;`]);
  }
  return edits;
}
// D-008b: nível do Savage Blow votado por sessão na varredura final de k (texto final, pronto
// para portar), com o bloco crítico e a folga de omega em 0.
function savageVoteEdits() {
  return [
    ['js/unified-formulas.js', `    if (hit.onslaught) mult += (ONSLAUGHT_DAMAGE_MULTIPLIER - 1);
    return mult;`, `    if (hit.onslaught) mult += (ONSLAUGHT_DAMAGE_MULTIPLIER - 1);
    // D-008b: Savage Blow soma o bônus do nível do charm, quando a sessão o conhece.
    if (hit.savageBlow && setup.savageBonus > 0) mult += setup.savageBonus;
    return mult;`],
    ['js/unified-formulas.js', `      const stages = new Map();
      for (const h of comp.hits || []) {
        if (!isMainHit(h) || h.overkill || h.zeroDamageDodge || h.savageBlow || !(+h.dmg > 0)) continue;
        const sk = h.multiStageStage ? h.multiStageStage + '@' + h.multiStageCastTs : '';
        if (!stages.has(sk)) stages.set(sk, []);
        stages.get(sk).push(h);
      }`, `      const stages = new Map(), allStages = new Map();
      for (const h of comp.hits || []) {
        if (!isMainHit(h) || h.overkill || h.zeroDamageDodge || !(+h.dmg > 0)) continue;
        const sk = h.multiStageStage ? h.multiStageStage + '@' + h.multiStageCastTs : '';
        // D-008b: o estágio com hit crítico de Savage Blow e hit crítico sem ele vota o nível.
        if (!allStages.has(sk)) allStages.set(sk, []);
        allStages.get(sk).push(h);
        if (h.savageBlow) continue;
        if (!stages.has(sk)) stages.set(sk, []);
        stages.get(sk).push(h);
      }
      const hasSavage = (comp.hits || []).some(h => h && h.savageBlow && h.realCrit);`],
    ['js/unified-formulas.js', `      const readRows = () => {
        const out = [];
        for (const hits of stages.values()) {
          if (!hits.some(h => h.realCrit)) continue;`, `      const readRows = (src, savage) => {
        const out = [];
        for (const hits of src.values()) {
          if (!hits.some(h => h.realCrit)) continue;
          if (savage && !(hits.some(h => h.realCrit && h.savageBlow) && hits.some(h => h.realCrit && !h.savageBlow))) continue;`],
    ['js/unified-formulas.js', `            const sig = [h.mob, h.dmg, mod, omega, add, h.realCrit, h.perfectShot, cLo, cHi].join('|');
            if (seen.has(sig)) continue;
            seen.add(sig);
            rows.push({ crit: !!h.realCrit, ons: !!h.onslaught, cLo, cHi, mod, omega, add });`, `            const sb = !!(h.savageBlow && h.realCrit);
            const sig = [h.mob, h.dmg, mod, omega, add, h.realCrit, h.perfectShot, cLo, cHi, sb].join('|');
            if (seen.has(sig)) continue;
            seen.add(sig);
            rows.push({ crit: !!h.realCrit, ons: !!h.onslaught, cLo, cHi, mod, omega, add, sb });`],
    ['js/unified-formulas.js', `      const blocks = next ? SC.withHitScopeField(context, 'gravSanHitOverride', next, readRows) : readRows();
      if (!blocks.length) continue;`, `      const read = () => ({ blocks: readRows(stages, false), savage: hasSavage ? readRows(allStages, true) : [] });
      const got = next ? SC.withHitScopeField(context, 'gravSanHitOverride', next, read) : read();
      if (got.savage.length) {
        if (!savageGroups.has(key)) savageGroups.set(key, []);
        savageGroups.get(key).push(...got.savage);
      }
      const blocks = got.blocks;
      if (!blocks.length) continue;`],
    ['js/unified-formulas.js', `    const SC = sessionContextApi();
    const groups = new Map();
    for (const t of turns || []) for (const comp of (t && t.components) || []) {`, `    const SC = sessionContextApi();
    const groups = new Map(), savageGroups = new Map();
    for (const t of turns || []) for (const comp of (t && t.components) || []) {`],
    ['js/unified-formulas.js', `    const closes = (rows, k) => {
      let lo = -Infinity, hi = Infinity;
      for (const r of rows) {
        let eLo = r.cLo, eHi = r.cHi;
        const kk = r.crit ? k + r.add : (r.ons ? ONSLAUGHT_DAMAGE_MULTIPLIER : 1);`, `    const closes = (rows, k, savage = 0) => {
      let lo = -Infinity, hi = Infinity;
      for (const r of rows) {
        let eLo = r.cLo, eHi = r.cHi;
        const kk = r.crit ? k + r.add + (r.sb ? savage : 0) : (r.ons ? ONSLAUGHT_DAMAGE_MULTIPLIER : 1);`],
    ['js/unified-formulas.js', `      out[key] = (pool.length ? pool : v.ks).slice().sort((a, b) => Math.abs(a - est) - Math.abs(b - est))[0];
    }
    return { out, found };`, `      out[key] = (pool.length ? pool : v.ks).slice().sort((a, b) => Math.abs(a - est) - Math.abs(b - est))[0];
    }
    // D-008b: cada nível do Savage Blow é testado sem folga com o k do componente; vence o que
    // fecha mais estágios, e empate ou nenhum deixa o nível desconhecido.
    const savageVotes = new Map();
    for (const [key, blocks] of savageGroups) {
      const k = key in out ? Math.round(out[key] * 1000) / 1000 : (estimates && estimates[key] > 1 ? estimates[key] : null);
      if (!k) continue;
      for (const rows of blocks) for (const s of SAVAGE_BLOW_LEVELS) if (closes(rows, k, s)) savageVotes.set(s, (savageVotes.get(s) || 0) + 1);
    }
    let savageBonus = null, savageBest = 0, savageTie = false;
    for (const [s, n] of savageVotes) {
      if (n > savageBest) { savageBest = n; savageBonus = s; savageTie = false; } else if (n === savageBest) savageTie = true;
    }
    if (savageTie) savageBonus = null;
    return { out, found, savageBonus, savageVotes: Object.fromEntries(savageVotes) };`],
    ['js/unified-formulas.js', `  const TRANSCENDENCE_CRIT_BONUS = 0.15;`, `  const TRANSCENDENCE_CRIT_BONUS = 0.15;
  // D-008b: bônus do Savage Blow no multiplicador crítico, por nível do charm.
  const SAVAGE_BLOW_LEVELS = [0.20, 0.40, 0.44];`],
    ['js/unified-classification-engine.js', `SessionContext.replaceSetup(context, { critSetup: Object.assign({}, context.critSetup, { byComponent, source: 'bucket_two_pass' }) });`,
      `SessionContext.replaceSetup(context, { critSetup: Object.assign({}, context.critSetup, { byComponent, source: 'bucket_two_pass', savageBonus: finalCrit.savageBonus, savageVotes: finalCrit.savageVotes }) });`, 2],
    ['js/unified-formulas.js', 'const OMEGA_CROSS_STATE_TOLERANCE = 1;', 'const OMEGA_CROSS_STATE_TOLERANCE = 0;'],
    ['js/unified-validation.js', 'function elementalBlockTolerance(block) {', 'function elementalBlockTolerance(block, context) {'],
    ['js/unified-validation.js', 'const tolerance = elementalBlockTolerance(block);', 'const tolerance = elementalBlockTolerance(block, context);', 2],
    ['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;",
      "// D-010j: na passada final, bloco com hit crítico não tem folga entre mobs.\n    if (block && block.hits && block.hits.some(h => h.realCrit) && context && context.critSetup && context.critSetup.source === 'bucket_two_pass') return 0;\n    return (block && block.comp === 'rune' && block.action) ? 4 : 2;"],
  ];
}
function currentCritEdits({ savage = 0, crit0 = false, omega0 = false, random = false }) {
  const edits = [];
  if (savage) edits.push(['js/unified-formulas.js', 'if (hit.onslaught) mult += (ONSLAUGHT_DAMAGE_MULTIPLIER - 1);', `if (hit.onslaught) mult += (ONSLAUGHT_DAMAGE_MULTIPLIER - 1);\n    if (hit.savageBlow) mult += ${savage};`]);
  if (omega0) edits.push(['js/unified-formulas.js', 'const OMEGA_CROSS_STATE_TOLERANCE = 1;', 'const OMEGA_CROSS_STATE_TOLERANCE = 0;']);
  if (crit0) {
    edits.push(['js/unified-validation.js', 'function elementalBlockTolerance(block) {', 'function elementalBlockTolerance(block, context) {']);
    edits.push(['js/unified-validation.js', 'const tolerance = elementalBlockTolerance(block);', 'const tolerance = elementalBlockTolerance(block, context);', 2]);
    edits.push(['js/unified-validation.js', "return (block && block.comp === 'rune' && block.action) ? 4 : 2;",
      "if (block && block.hits && block.hits.some(h => h.realCrit) && context && context.critSetup && context.critSetup.source === 'bucket_two_pass') return 0;\n    return (block && block.comp === 'rune' && block.action) ? 4 : 2;"]);
  }
  if (random) edits.push(['js/unified-classification-engine.js', 'for (const k of Object.keys(finalCrit.out)) byComponent[k] = Math.round(finalCrit.out[k] * 1000) / 1000;',
    'for (const k of Object.keys(finalCrit.out)) { let s = 0; for (const c of k) s = (s * 31 + c.charCodeAt(0)) >>> 0; byComponent[k] = 1.5 + (s % 21) * 0.03; }', 2]);
  return edits;
}
// Desliga a subtração pré-mitigação do +20 (D-010f) nos dois eixos.
function psPremitOff() { return [
  ['js/unified-formulas.js', 'const c = c0 - perfectShotBonus;', 'const c = c0;'],
  ['js/unified-formulas.js', 'const prePerfect = c - perfectShotBonus;', 'const prePerfect = c;'],
]; }

// psAt: onde o +20 do perfect shot sai na inversão ('post' = antes de desfazer os bônus
// finais, 'mit' = depois de desfazê-los, antes da mitigação); null = fora daqui.
function sequentialPostEdits(order, exact = false, rounding = 'floor', psAt = null) {
  const mul = exact ? `(x, q) => Math.${rounding}(x * Math.round(q * 1e6) / 1e6)` : `(x, q) => Math.${rounding}(x * q)`;
  const helper = `const __POST_ORDER = ${JSON.stringify(order)};
  function __postFactors(hit, context) {
    const out = [];
    if (!hit) return out;
    for (const k of __POST_ORDER) {
      let m = 1;
      if (k === 'prey') m = hit.isPrey ? 1.25 : 1;
      else if (k === 'bounty') {
        const d = hit.bountyTalisman && context && context.bountyTalismanSetup && context.bountyTalismanSetup.damage;
        m = d && d.multiplier > 1 ? d.multiplier : 1;
      } else if (k === 'grav') m = gravSanMultiplierAtTs(context, hit.ts, hit);
      else if (k === 'stance') m = knightStanceMultiplierAtTs(context, hit.ts);
      else if (k === 'cls') m = bestiaryClassMultiplierForHit(hit, context);
      if (m !== 1) out.push(m);
    }
    return out;
  }
  const __mul = ${mul};
  function __postSig(hit, context) { return __postFactors(hit, context).join('*'); }
  function inversePostMultiplierIntervals(displayDamage, post, hit, context) {
    if (hit !== undefined) {
      const factors = __postFactors(hit, context);
      const __ps = hit && hit.perfectShot ? PERFECT_SHOT_PREMIT_BONUS : 0;
      let lo = displayDamage, hi = displayDamage;
      ${psAt === 'post' ? 'lo -= __ps; hi -= __ps; if (hi < 1) return [];' : ''}
      for (let i = factors.length - 1; i >= 0; i--) {
        const q = factors[i];
        let a = Math.max(0, Math.floor(lo / q) - 2), b = Math.ceil((hi + 1) / q) + 2;
        while (a <= b && __mul(a, q) < lo) a++;
        while (b >= a && __mul(b, q) > hi) b--;
        if (a > b) return [];
        lo = a; hi = b;
      }
      ${psAt === 'mit' ? 'lo -= __ps; hi -= __ps; if (hi < 1) return [];' : ''}
      return [[lo, hi]];
    }`;
  return [
    ['js/unified-formulas.js', 'function inversePostMultiplierIntervals(displayDamage, post) {', helper],
    ['js/unified-formulas.js', 'inversePostMultiplierIntervals(+hit.dmg, post);', 'inversePostMultiplierIntervals(+hit.dmg, post, hit, context);', 2],
    ['js/unified-formulas.js', "'|' + post + '|' + crit", "'|' + post + '|' + __postSig(hit, context) + '|' + crit", 2],
  ];
}

// --- sondas (só na baseline): gravam, não decidem ---------------------------------------
const PROBES = [
  ['js/unified-validation.js',
    'const inter = intersectSets(sets, tolerance);\n',
    'const inter = intersectSets(sets, tolerance);\n    if (globalThis.__audit && sets.length && inter.length) globalThis.__audit.sets(\'elementalBlock\', perHit, context, { comp: block.comp, element, tolerance });\n'],
  ['js/unified-validation.js',
    'if (cluster.span <= clusterTolerance) {\n          return {',
    'if (cluster.span <= clusterTolerance) {\n          if (globalThis.__audit) globalThis.__audit.cluster(perHit, cluster, context, { comp: block.comp, element, tolerance: clusterTolerance });\n          return {'],
  ['js/unified-validation.js',
    'intervals.push(ev.interval); known++;',
    'intervals.push(ev.interval); (intervals.__hits || (intervals.__hits = [])).push(h); known++;'],
  ['js/unified-validation.js',
    'if (inter) toleranceUsed = PHYSICAL_INTERSECTION_TOLERANCE;',
    'if (inter) toleranceUsed = PHYSICAL_INTERSECTION_TOLERANCE;\n        if (inter && globalThis.__audit) globalThis.__audit.intervals(\'physical\', intervals.__hits, intervals, context, { comp: block.comp, tolerance: PHYSICAL_INTERSECTION_TOLERANCE });'],
  ['js/unified-validation.js',
    'const tolerance = armed ? omegaCrossStateToleranceFor(group, context) : 0;\n      const exact = physical\n        ? intersectIntervals(group.map(x => x.interval), tolerance)\n        : intersectSets(group.map(x => x.originals), tolerance);\n',
    'const tolerance = armed ? omegaCrossStateToleranceFor(group, context) : 0;\n      const exact = physical\n        ? intersectIntervals(group.map(x => x.interval), tolerance)\n        : intersectSets(group.map(x => x.originals), tolerance);\n      if (globalThis.__audit && tolerance && exact && (physical || exact.length)) {\n        if (physical) globalThis.__audit.intervals(\'omega\', group.map(x => x.hit), group.map(x => x.interval), context, { tolerance });\n        else globalThis.__audit.sets(\'omega\', group, context, { tolerance });\n      }\n'],
  ['js/unified-setup-inference.js',
    '        if (best) {\n          votes++;',
    '        if (best) {\n          if (globalThis.__audit && best.delta > 0) globalThis.__audit.session(\'leechRate\', { channel, base, rate: best.rate, n: best.n, residual: best.observed - best.expected, expected: best.expected, observed: best.observed, mob: best.mob, dmg: best.dmg, clock: best.ts });\n          votes++;'],
];

// Comparações de sessão (charm e Combat Mastery) viram chamada que devolve o MESMO booleano.
const ENGINE_COMPARISONS = [
  // charm: |a - b| <= max(2, c * RATIO) — a folga só compra o que passa de 2.
  [/Math\.abs\(([^()]+?) - ([^()]+?)\) <=\s*Math\.max\(2, ([^()]+?) \* CHARM_EXPECTED_TOLERANCE_RATIO\)/g,
    (m, a, b, c) => `globalThis.__auditCmp('charm', ${a}, ${b}, Math.max(2, ${c} * CHARM_EXPECTED_TOLERANCE_RATIO), 2)`, 5],
  [/Math\.abs\(L\.value - expected\) <= anchorTolerance/g,
    () => "globalThis.__auditCmp('charm', L.value, expected, anchorTolerance, 2)", 1],
  [/Math\.abs\(L\.value - wanted\) <= omegaTolerance/g,
    () => "globalThis.__auditCmp('charm', L.value, wanted, omegaTolerance, 2)", 1],
  [/Math\.abs\(([^()]+?) - ([^()]+?(?:\([^()]*\))?)\) <= COMBAT_MASTERY_LEVEL_TOLERANCE/g,
    (m, a, b) => `globalThis.__auditCmp('combatMastery', ${a}, ${b}, COMBAT_MASTERY_LEVEL_TOLERANCE, 0)`, 2],
  [/([A-Za-z.()*+ 1]+?) <= r\.minLevel \+ COMBAT_MASTERY_LEVEL_TOLERANCE/g,
    (m, a) => `globalThis.__auditLe('combatMastery', ${a.trim()}, r.minLevel, COMBAT_MASTERY_LEVEL_TOLERANCE)`, 3],
];

function replaceOnce(text, find, repl, where, expected = 1) {
  const count = text.split(find).length - 1;
  if (count !== expected) throw new Error(`${where}: texto aparece ${count} vezes (esperado ${expected}): ${JSON.stringify(find.slice(0, 80))}`);
  return text.split(find).join(repl);
}

function engineSources(variant) {
  // CRLF -> LF para os textos de troca casarem (o vm não liga para o fim de linha).
  const sources = new Map(ENGINE_FILES.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')]));
  for (const [file, find, repl, expected] of VARIANTS[variant].edits) {
    sources.set(file, replaceOnce(sources.get(file), find, repl, `${variant} ${file}`, expected));
  }
  if (VARIANTS[variant].probes && argv[0] !== '--dump-sources') {
    for (const [file, find, repl] of PROBES) sources.set(file, replaceOnce(sources.get(file), find, repl, `sonda ${file}`));
    let engine = sources.get('js/unified-classification-engine.js');
    for (const [re, fn, expected] of ENGINE_COMPARISONS) {
      const count = (engine.match(re) || []).length;
      if (count !== expected) throw new Error(`sonda de sessão: ${re} casou ${count} vezes (esperado ${expected})`);
      engine = engine.replace(re, fn);
    }
    if (/Math\.abs\([^\n]*(CHARM_EXPECTED_TOLERANCE_RATIO|COMBAT_MASTERY_LEVEL_TOLERANCE)/.test(engine.replace(/__auditCmp\([^\n]*/g, ''))) {
      throw new Error('sonda de sessão: sobrou comparação de charm/Combat Mastery sem sonda');
    }
    sources.set('js/unified-classification-engine.js', engine);
  }
  return sources;
}

// --- sondas: cálculo da sobra -----------------------------------------------------------
function createAudit(context) {
  const events = [];
  const sessionEvents = new Map();
  const seen = new Set();
  const F = () => context.UnifiedFormulas;
  const hitInfo = (hit, ctx, extra = {}) => {
    const f = F();
    let gravSan = null, stance = null, cls = null, omega = null;
    try { gravSan = f.gravSanMultiplierAtTs(ctx, hit.ts, hit); } catch { /* sem contexto */ }
    try { stance = f.knightStanceMultiplierAtTs(ctx, hit.ts); } catch { /* idem */ }
    try { cls = f.bestiaryClassMultiplierForHit(hit, ctx); } catch { /* idem */ }
    try { omega = !!f.omegaActiveForHit(hit, ctx); } catch { /* idem */ }
    const bounty = hit.bountyTalisman
      ? (ctx && ctx.bountyTalismanSetup && ctx.bountyTalismanSetup.damage && ctx.bountyTalismanSetup.damage.multiplier) || 'unknown'
      : null;
    return {
      id: hit.id, clock: hit.clock, mob: hit.mob, dmg: hit.dmg, type: hit.type,
      crit: !!hit.realCrit, omega, prey: !!hit.isPrey, bounty, gravSan, stance, cls,
      ew: !!hit.exposeWeakness, amp: !!hit.elementalAmplification,
      ...extra,
    };
  };
  const push = (folga, hits, meta) => {
    const key = folga + '|' + hits.map(h => h.id + ':' + h.residual).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    events.push({ folga, hits, meta });
  };
  const nearest = (values, o) => {
    let best = null;
    for (const v of values) if (best == null || Math.abs(v - o) < Math.abs(best - o) || (Math.abs(v - o) === Math.abs(best - o) && v < best)) best = v;
    return best;
  };
  return {
    events,
    sessionEvents,
    // Conjuntos discretos de originais: a referência é o original que mais hits têm exato.
    sets(folga, perHit, ctx, meta) {
      const sets = perHit.map(x => x.originals);
      if (F().intersectSets(sets, 0).length) return;
      const counts = new Map();
      for (const s of sets) for (const v of new Set(s)) counts.set(v, (counts.get(v) || 0) + 1);
      let ref = null, refScore = null;
      for (const [v, c] of counts) {
        const spread = Math.max(...sets.map(s => Math.abs(nearest(s, v) - v)));
        const score = [c, -spread, -v];
        if (!refScore || score[0] > refScore[0] || (score[0] === refScore[0] && (score[1] > refScore[1] || (score[1] === refScore[1] && score[2] > refScore[2])))) { ref = v; refScore = score; }
      }
      push(folga, perHit.map(x => hitInfo(x.hit, ctx, {
        residual: nearest(x.originals, ref) - ref,
        nOriginals: x.originals.length,
        mod: x.mod ?? null, mitigation: x.mitigation ?? null, post: x.post ?? null,
      })), { ...meta, ref });
    },
    // Intervalos (físico): a referência é o ponto coberto pelo maior número de intervalos.
    intervals(folga, hits, intervals, ctx, meta) {
      if (!hits || hits.length !== intervals.length) return;
      if (context.UnifiedFormulas.intersectIntervalTol && (() => {
        let out = intervals[0];
        for (let i = 1; i < intervals.length && out; i++) out = F().intersectIntervalTol(out, intervals[i], 0);
        return !!out;
      })()) return;
      const points = intervals.flatMap(iv => [iv[0], iv[1]]);
      let ref = null, best = -1;
      for (const p of points) {
        const c = intervals.filter(iv => iv[0] <= p && p <= iv[1]).length;
        if (c > best) { best = c; ref = p; }
      }
      push(folga, hits.map((h, i) => {
        const [lo, hi] = intervals[i];
        const residual = ref < lo ? lo - ref : ref > hi ? hi - ref : 0;
        const ev = h.evidence && h.evidence.physical;
        return hitInfo(h, ctx, { residual, interval: [lo, hi], mod: ev ? ev.mod : null, post: ev ? ev.post : null });
      }), { ...meta, ref });
    },
    cluster(perHit, cluster, ctx, meta) {
      const chosen = cluster.chosen || [];
      const counts = new Map();
      for (const v of chosen) counts.set(v, (counts.get(v) || 0) + 1);
      const ref = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      push('cluster', perHit.map((x, i) => hitInfo(x.hit, ctx, {
        residual: chosen[i] - ref, mod: x.mod ?? null, mitigation: x.mitigation ?? null, post: x.post ?? null,
      })), { ...meta, ref, span: cluster.span });
    },
    session(folga, row) {
      const key = folga + '|' + JSON.stringify(row);
      if (!sessionEvents.has(key)) sessionEvents.set(key, { folga, ...row });
    },
  };
}

function staticHitInfo(hit, extra) {
  const ev = (hit.evidence && (hit.evidence.physical || hit.evidence.elemental)) || {};
  return {
    id: hit.id, clock: hit.clock, mob: hit.mob, dmg: hit.dmg, type: hit.type,
    crit: !!hit.realCrit, omega: !!hit.omegaActive, prey: !!hit.isPrey, bounty: hit.bountyTalisman ? 'yes' : null,
    post: ev.post ?? null, ew: !!hit.exposeWeakness, amp: !!hit.elementalAmplification,
    ...extra,
  };
}

// --- filho: um par, uma variante --------------------------------------------------------
function hashOf(value) {
  return crypto.createHash('sha1').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 12);
}

function runChild(variant, pairKey, outFile) {
  const corpus = new UnifiedCorpus({ cacheEnabled: false, warn: () => {} });
  const fixture = corpus.discoverPairs().find(p => p.key === pairKey);
  if (!fixture) throw new Error(`par ${pairKey} nao encontrado`);
  const sessions = corpus.sessionsFor(fixture.server, fixture.local) || [];
  const sources = engineSources(variant);
  const out = { variant, pair: pairKey, label: fixture.label, server: fixture.server, sessions: [] };
  for (const session of sessions) {
    const context = {
      console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
      Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array,
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    let audit = null;
    if (VARIANTS[variant].probes) {
      audit = createAudit(context);
      context.__audit = audit;
      context.__auditCmp = (folga, a, b, tol, floor) => {
        const d = Math.abs(a - b);
        if (d > floor && d <= tol) audit.session(folga, { residual: +(a - b).toFixed(3), observed: +(+a).toFixed(3), expected: +(+b).toFixed(3), tolerance: +(+tol).toFixed(3) });
        return d <= tol;
      };
      context.__auditLe = (folga, a, b, tol) => {
        if (a > b && a <= b + tol) audit.session(folga, { residual: +(a - b).toFixed(3), observed: +(+a).toFixed(3), expected: +(+b).toFixed(3), tolerance: tol, oneSided: true });
        return a <= b + tol;
      };
    }
    if (VARIANTS[variant].holyExtra) context.__holyExtra = VARIANTS[variant].holyExtra[`${pairKey}#${session.index}`] || 0;
    for (const file of ENGINE_FILES) vm.runInContext(sources.get(file), context, { filename: file });
    const started = Date.now();
    let result = null, error = null;
    try {
      result = context.UnifiedClassificationEngine.classifyUnified(session.sv.text, session.lc.text, {
        mobModsPre: context.MOB_ELEMENT_MODS || null,
        mobModsPost: context.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
        strictLeech: true,
        maxOriginal: 6000,
        useFloat16Mitigation: true,
        ...(VARIANTS[variant].bmOverride && VARIANTS[variant].bmOverride[`${pairKey}#${session.index}`] != null ? { bmPierce: VARIANTS[variant].bmOverride[`${pairKey}#${session.index}`] } : {}),
      });
    } catch (e) { error = String(e && e.stack || e).slice(0, 500); }
    const setupKeys = ['leechSetup', 'bountyTalismanSetup', 'gravSanSetup', 'stanceSetup', 'bestiaryClassDamageBonus', 'bmPierce', 'critSetup', 'weaponPhysicalPierce', 'weaponDeathPierce', 'aaElement', 'beamMasteryStage', 'bmPierce', 'bmPierceDetection'];
    const rec = {
      index: session.index,
      date: `${session.sv.year}-${String(session.sv.month).padStart(2, '0')}-${String(session.sv.day).padStart(2, '0')}`,
      save: clockForTs(session.sv.saveSec),
      ms: Date.now() - started,
      error: error || (result && result.error) || null,
      setup: result ? Object.fromEntries(setupKeys.map(k => [k, hashOf(result[k])])) : null,
      // Os charms menores vêm na frente: o corte de 400 caracteres os escondia do compare-variant.
      setupValues: result ? Object.fromEntries(setupKeys.map(k => [k, JSON.stringify((k === 'leechSetup' && result[k] ? { vampiricMob: result[k].vampiricMob ?? null, voidsMob: result[k].voidsMob ?? null, ...result[k] } : result[k]) ?? null).slice(0, 400)])) : null,
      turns: [],
    };
    const hitComponent = new Map();
    for (const turn of (result && result.turns) || []) {
      const comps = (turn.components || []).map(c => ({ comp: c.comp, label: c.actionLabel || (c.action && (c.action.label || c.action.spell)) || null, n: (c.hits || []).length }));
      const sig = (turn.status || '') + '|' + (turn.components || []).map(c => `${c.comp}:${c.actionLabel || ''}:${(c.hits || []).map(h => h.id + (h.omegaActive ? 'w' : '')).join('.')}`).join(',');
      const t = { ts: turn.ts, clock: turn.clock, status: turn.status, reason: turn.reason || null, sig, comps };
      if (audit) Object.defineProperty(t, '__turn', { value: turn, enumerable: false });
      if (audit) {
        (turn.components || []).forEach((c, ci) => (c.hits || []).forEach(h => hitComponent.set(h.id, { t, ci })));
      }
      rec.turns.push(t);
    }
    if (audit) {
      // Uma sobra pertence ao turno quando TODOS os seus hits caem num mesmo componente final.
      for (const ev of audit.events) {
        const owners = ev.hits.map(h => hitComponent.get(h.id));
        if (!owners.length || owners.some(o => !o)) continue;
        if (owners.some(o => o.t !== owners[0].t || o.ci !== owners[0].ci)) continue;
        const t = owners[0].t;
        (t.events || (t.events = [])).push({ ...ev, component: owners[0].ci, comp: t.comps[owners[0].ci].comp, compLabel: t.comps[owners[0].ci].label });
      }
      // Leech: lido do N ACEITO de cada componente final (uma sonda veria todo N testado).
      for (const t of rec.turns) {
        const push = (ci, meta, hit, extra) => (t.events || (t.events = [])).push({
          folga: 'leech', component: ci, comp: t.comps[ci].comp, compLabel: t.comps[ci].label, meta, hits: [staticHitInfo(hit, extra)],
        });
        (t.__turn.components || []).forEach((c, ci) => {
          for (const f of (c.leech && c.leech.fits) || []) {
            const fit = f.fit || {};
            if (!fit.ok || !f.hit) continue;
            for (const ch of (fit.official && fit.official.checks) || []) {
              const ms = (ch.matches || []).filter(m => Number.isFinite(m.delta));
              if (!ch.ok || !ms.length || ms.some(m => m.delta === 0)) continue;
              const m = ms.slice().sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
              push(ci, { n: fit.n, channel: ch.channel }, f.hit,
                { residual: m.delta, n: fit.n, channel: ch.channel, expected: m.expected, observed: m.observed, rate: m.rate, tolerance: m.tolerance });
            }
            for (const channel of ['life', 'mana']) {
              const ch = fit.channels && fit.channels[channel];
              if (!ch || !ch.ok || !Number.isFinite(ch.expected) || ch.expected === ch.observed) continue;
              push(ci, { n: fit.n, channel, fallback: true }, f.hit,
                { residual: ch.observed - ch.expected, n: fit.n, channel, expected: ch.expected, observed: ch.observed });
            }
          }
        });
      }
      rec.sessionEvents = [...audit.sessionEvents.values()];
      rec.unattachedEvents = audit.events.length;
    }
    out.sessions.push(rec);
  }
  fs.writeFileSync(outFile, JSON.stringify(out));
}

// --- pai --------------------------------------------------------------------------------
async function runAll() {
  const wantedVariants = (valueOf('--variants') || Object.keys(VARIANTS).join(',')).split(',');
  for (const v of wantedVariants) if (!VARIANTS[v]) throw new Error(`variante desconhecida ${v}`);
  for (const v of wantedVariants) engineSources(v); // falha alto antes de gastar tempo
  const corpus = new UnifiedCorpus({ cacheEnabled: false });
  let pairs = corpus.discoverPairs().filter(f => !exclusionFor(f.server, {}));
  const wantedPairs = valueOf('--pairs');
  if (wantedPairs) {
    const set = new Set(wantedPairs.split(','));
    pairs = pairs.filter(p => set.has(p.key));
  }
  const jobs = [];
  for (const v of wantedVariants) {
    fs.mkdirSync(path.join(OUT, v), { recursive: true });
    for (const p of pairs) {
      const file = path.join(OUT, v, `${p.key.replace(/[^a-z0-9]+/g, '_')}.json`);
      if (!fs.existsSync(file)) jobs.push({ v, p, file });
    }
  }
  const total = jobs.length;
  let done = 0, failed = 0;
  const parallel = +(valueOf('--jobs') || 3);
  const worker = async () => {
    while (jobs.length) {
      const job = jobs.shift();
      const started = Date.now();
      const code = await new Promise(resolve => {
        const child = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, 'tools/audit-tolerance-residuals.mjs', '--child', job.v, job.p.key, job.file], { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        child.stderr.on('data', d => { err += d; });
        child.on('close', c => { if (c) console.error(`FALHOU ${job.v} ${job.p.key}: ${err.split('\n').slice(0, 5).join(' | ')}`); resolve(c); });
      });
      done++;
      if (code) failed++;
      console.error(`${done}/${total} ${job.v} ${job.p.key} ${((Date.now() - started) / 1000).toFixed(0)}s${code ? ' FALHOU' : ''}`);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  if (failed) process.exitCode = 1;
}

// --- relatório --------------------------------------------------------------------------
// Folga de sessão (charm, Combat Mastery, taxa de leech): a sobra vem da sessão, não do turno.
const EVENT_FOLGA = {
  omega: 'omega', leech: 'leech', physical: 'physical', cluster: 'cluster', elementalBlock: 'elementalBlock',
  charm: 'charm', combatMastery: 'combatMastery', leechRate: 'leechRate',
};
const SESSION_FOLGAS = new Set(['charm', 'combatMastery', 'leechRate']);

function loadVariant(variant) {
  const dir = path.join(OUT, variant);
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    map.set(data.pair, data);
  }
  return map;
}

function turnKey(turns) {
  const seen = new Map();
  return turns.map(t => {
    const n = seen.get(t.ts) || 0;
    seen.set(t.ts, n + 1);
    return `${t.ts}#${n}`;
  });
}

const multKey = h => [
  h.prey ? 'prey' : null,
  h.bounty ? 'bounty' : null,
  h.gravSan && h.gravSan !== 1 ? `grav${h.gravSan}` : null,
  h.stance && h.stance !== 1 ? `postura${h.stance}` : null,
  h.cls && h.cls !== 1 ? `classe${h.cls}` : null,
  h.omega ? 'omega' : null,
  h.crit ? 'crit' : null,
  h.ew ? 'EW' : null,
].filter(Boolean).join('+') || 'nenhum';

// Por componente, uma sobra por hit: a do evento que cobre mais hits do componente.
function mergeComponentEvents(events) {
  const byComp = new Map();
  for (const ev of events) {
    const k = ev.component;
    if (!byComp.has(k)) byComp.set(k, { component: k, comp: ev.comp, compLabel: ev.compLabel, meta: ev.meta, hits: new Map(), size: new Map() });
    const slot = byComp.get(k);
    for (const h of ev.hits) {
      if ((slot.size.get(h.id) || 0) > ev.hits.length) continue;
      slot.hits.set(h.id, h);
      slot.size.set(h.id, ev.hits.length);
    }
  }
  return [...byComp.values()].map(s => ({ component: s.component, comp: s.comp, compLabel: s.compLabel, meta: s.meta, hits: [...s.hits.values()] }));
}

function histogram(values) {
  const out = new Map();
  for (const v of values) out.set(v, (out.get(v) || 0) + 1);
  return [...out.entries()].sort((a, b) => b[1] - a[1]);
}

function shapeOf(hits) {
  const nz = hits.filter(h => Number.isFinite(h.residual) && h.residual !== 0);
  if (!nz.length) return { shape: 'sem sobra', detail: '' };
  const abs = histogram(nz.map(h => Math.abs(h.residual)));
  const topShare = abs[0][1] / nz.length;
  // Degraus: a sobra é função do conjunto de multiplicadores do hit?
  const byKey = new Map();
  for (const h of nz) {
    const k = multKey(h);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(h.residual);
  }
  let pure = 0;
  for (const vals of byKey.values()) pure += histogram(vals)[0][1];
  const purity = pure / nz.length;
  const distinct = new Set(nz.map(h => h.residual)).size;
  // Proporcional: correlação entre |sobra| e dano.
  const xs = nz.map(h => +h.dmg || 0), ys = nz.map(h => Math.abs(h.residual));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const corr = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
  const detail = `|sobra| mais comum ${abs[0][0]} (${(topShare * 100).toFixed(0)}%), ${distinct} valores, pureza por multiplicadores ${(purity * 100).toFixed(0)}%, corr(|sobra|, dano) ${corr.toFixed(2)}`;
  if (topShare >= 0.8) return { shape: 'fixo', detail };
  if (distinct >= 3 && corr >= 0.6) return { shape: 'proporcional', detail };
  if (byKey.size >= 2 && purity >= 0.9) return { shape: 'degraus', detail };
  return { shape: 'espalhado', detail };
}

function report() {
  const variants = Object.keys(VARIANTS).filter(v => v !== 'baseline' && v !== 'plain' && VARIANTS[v].report !== false);
  const base = loadVariant('baseline');
  const plain = loadVariant('plain');
  const lines = [];
  const casesOut = {};
  lines.push('# Auditoria de resíduos das folgas B', '');
  lines.push(`Gerado por \`tools/audit-tolerance-residuals.mjs\` em ${new Date().toISOString().slice(0, 10)}. Opções da UI, corpus inteiro (só CORPUS_EXCLUSIONS), um processo por par.`, '');

  // Sondas inertes?
  let same = 0, diff = 0, missing = 0, totalTurns = 0, resolved = 0, errors = [];
  for (const [pair, b] of base) {
    for (const s of b.sessions) {
      totalTurns += s.turns.length;
      resolved += s.turns.filter(t => t.status === 'resolved').length;
      if (s.error) errors.push(`${pair} S${s.index}: ${s.error.slice(0, 120)}`);
    }
    const p = plain.get(pair);
    if (!p) { missing++; continue; }
    b.sessions.forEach((s, i) => s.turns.forEach((t, j) => {
      const q = p.sessions[i] && p.sessions[i].turns[j];
      if (q && q.sig === t.sig) same++; else diff++;
    }));
  }
  lines.push(`**Corpus:** ${base.size} pares, ${totalTurns} turnos, ${resolved} resolvidos na referência. Erros do motor: ${errors.length}${errors.length ? ' (' + errors.join('; ') + ')' : ''}.`, '');
  lines.push(`**Sondas inertes:** ${same} turnos idênticos ao motor sem sondas, ${diff} diferentes, ${missing} pares sem a passada sem sondas.`, '');

  lines.push('## Resumo por folga', '');
  lines.push('| folga | turnos salvos | trocados | ganhos com zero | sessões com setup mudado | forma da sobra | detalhe |');
  lines.push('|---|---:|---:|---:|---:|---|---|');
  const sections = [];
  for (const v of variants) {
    const runs = loadVariant(v);
    const cases = [];
    const setupChanges = [];
    let ganhos = 0, salvos = 0, trocados = 0;
    for (const [pair, b] of base) {
      const r = runs.get(pair);
      if (!r) continue;
      b.sessions.forEach((s, si) => {
        const rs = r.sessions[si];
        if (!rs) return;
        const changedSetup = s.setup && rs.setup ? Object.keys(s.setup).filter(k => s.setup[k] !== rs.setup[k]) : [];
        if (changedSetup.length) setupChanges.push({ pair, session: s.index, date: s.date, keys: changedSetup, before: Object.fromEntries(changedSetup.map(k => [k, s.setupValues[k]])), after: Object.fromEntries(changedSetup.map(k => [k, rs.setupValues[k]])) });
        const bk = turnKey(s.turns), rk = new Map(turnKey(rs.turns).map((k, i) => [k, rs.turns[i]]));
        s.turns.forEach((t, ti) => {
          const u = rk.get(bk[ti]);
          if (u && u.sig === t.sig) return;
          let kind;
          if (t.status === 'resolved' && (!u || u.status !== 'resolved')) { kind = 'salvo'; salvos++; }
          else if (t.status === 'resolved') { kind = 'trocado'; trocados++; }
          else if (u && u.status === 'resolved') { kind = 'ganho'; ganhos++; }
          else kind = 'outro';
          const folga = EVENT_FOLGA[v];
          const events = SESSION_FOLGAS.has(folga) ? [] : mergeComponentEvents((t.events || []).filter(e => e.folga === folga));
          cases.push({
            pair, label: b.label, session: s.index, date: s.date, clock: t.clock, kind,
            before: { status: t.status, comps: t.comps }, after: u ? { status: u.status, reason: u.reason, comps: u.comps } : null,
            residuals: events,
          });
        });
      });
    }
    const folga = EVENT_FOLGA[v];
    let hits;
    let sessionRows = [];
    if (SESSION_FOLGAS.has(folga)) {
      const touched = new Set(setupChanges.map(c => `${c.pair}#${c.session}`));
      for (const [pair, b] of base) for (const s of b.sessions) {
        if (!touched.has(`${pair}#${s.index}`)) continue;
        for (const ev of (s.sessionEvents || []).filter(e => e.folga === folga)) sessionRows.push({ pair, session: s.index, date: s.date, ...ev });
      }
      hits = sessionRows.map(r => ({ residual: Math.round(r.residual * 1000) / 1000, dmg: r.expected }));
    } else {
      hits = cases.filter(c => c.kind === 'salvo' || c.kind === 'trocado').flatMap(c => c.residuals.flatMap(e => e.hits));
    }
    const shape = shapeOf(hits);
    lines.push(`| ${v} (${VARIANTS[v].label}) | ${salvos} | ${trocados} | ${ganhos} | ${setupChanges.length} | ${shape.shape} | ${shape.detail} |`);
    casesOut[v] = { cases, setupChanges, sessionRows };

    const sec = [`## ${v}: ${VARIANTS[v].label}`, ''];
    sec.push(`Turnos que mudam com a folga zerada: ${cases.length} (salvos ${salvos}, trocados ${trocados}, ganhos ${ganhos}). Sessões com setup mudado: ${setupChanges.length}.`, '');
    if (setupChanges.length) {
      sec.push('Setup mudado:', '');
      for (const c of setupChanges.slice(0, 12)) sec.push(`- ${c.pair} S${c.session} (${c.date}): ${c.keys.join(', ')}`);
      if (setupChanges.length > 12) sec.push(`- … mais ${setupChanges.length - 12}`);
      sec.push('');
    }
    const nz = hits.filter(h => Number.isFinite(h.residual) && h.residual !== 0);
    sec.push(`Sobras (hits com sobra ≠ 0 nos casos salvos/trocados): ${nz.length}. Histograma com sinal: ${histogram(nz.map(h => h.residual)).slice(0, 12).map(([k, n]) => `${k}: ${n}`).join(', ') || '—'}.`, '');
    if (!SESSION_FOLGAS.has(folga) && nz.length) {
      const byKey = new Map();
      for (const h of nz) { const k = multKey(h); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(h.residual); }
      sec.push('| multiplicadores do hit | hits | sobras |', '|---|---:|---|');
      for (const [k, vals] of [...byKey.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
        sec.push(`| ${k} | ${vals.length} | ${histogram(vals).slice(0, 6).map(([x, n]) => `${x}×${n}`).join(' ')} |`);
      }
      sec.push('');
      const byComp = histogram(cases.flatMap(c => c.residuals.map(e => e.comp)));
      sec.push(`Por componente: ${byComp.map(([k, n]) => `${k} ${n}`).join(', ')}.`, '');
      const byMob = histogram(nz.map(h => h.mob));
      sec.push(`Mobs mais frequentes: ${byMob.slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', ')}.`, '');
    }
    if (sessionRows.length) {
      sec.push('Linhas de sessão onde a folga decidiu (sessões com setup mudado):', '');
      for (const r of sessionRows.slice(0, 15)) sec.push(`- ${r.pair} S${r.session}: ${JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['pair', 'session', 'folga'].includes(k))))}`);
      sec.push('');
    }
    const byPair = histogram(cases.map(c => `${c.pair} S${c.session}`));
    sec.push(`Por sessão: ${byPair.slice(0, 12).map(([k, n]) => `${k} ${n}`).join(', ') || '—'}.`, '');
    sec.push('Exemplos:', '');
    for (const c of cases.slice(0, 8)) {
      const res = c.residuals.map(e => `${e.comp}: ${e.hits.filter(h => h.residual).map(h => `${h.mob} ${h.dmg} → ${h.residual > 0 ? '+' : ''}${h.residual} [${multKey(h)}]`).join('; ')}`).join(' | ');
      const fmt = x => x ? `${x.status} ${x.comps.map(k => `${k.comp}${k.n}`).join(' ')}` : '—';
      sec.push(`- ${c.label} S${c.session} ${c.date} ${c.clock} (${c.kind}): ${fmt(c.before)} → ${fmt(c.after)}${c.after && c.after.reason ? ` (${c.after.reason})` : ''}${res ? `; sobra ${res}` : ''}`);
    }
    sec.push('');
    sections.push(...sec);
  }
  lines.push('', ...sections);
  fs.writeFileSync(path.join(OUT, 'report.md'), lines.join('\n'));
  fs.writeFileSync(path.join(OUT, 'cases.json'), JSON.stringify(casesOut, null, 1));
  console.error(`relatório -> ${path.join(OUT, 'report.md')}`);
}

if (argv[0] === '--child') {
  runChild(argv[1], argv[2], argv[3]);
} else if (argv[0] === '--dump-sources') {
  // Grava o motor da variante (sem sondas) numa pasta, para diagnosticar um turno com ele.
  const sources = engineSources(argv[1]);
  for (const [file, text] of sources) { const out = path.join(argv[2], file); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, text); }
} else {
  if (!argv.includes('--report-only')) await runAll();
  if (!argv.includes('--no-report')) report();
}
