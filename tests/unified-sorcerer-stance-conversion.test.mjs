// M-043 / M-043a / M-016d-1a — estancia de sorcerer inferida ANTES da resolucao e elemento
// convertido na reversao das spells que nao sao beam (change infer-sorcerer-stance-before-resolution).
//
// Os esperados NAO vem da saida do motor:
//   - alumnishocks 2 S0 (21/Sep/2026, estancia energy): o Death Echo de 18:25:47 esta `converted`
//     (Energy Wave 18:25:45 arma); o blast fecha num original so entre mobs distintos SOMENTE em
//     energy (dragolisk 790 e wardragon 828 -> 786/788; em death 717/923) e o eco de :48 e a metade
//     (393/394). Os 5 hits do blast sao a primeira explosao; os 10 de :48, a segunda.
//   - 18:24:39: o 1o hit, wardragon 70 (seq 2300), e o AA de varinha (tem a 2a linha de mana de AA);
//     o blast de :39 (dragolisk 790 x3 e mega dragon 868, original 786 em energy, mais o
//     dragolisk 337 OK) e o eco de :40 (metade) sao um Death Echo so -> A1 + Death Echo 10.
//   - alumnishocks S0 (19/Sep/2026): 19:01:52 e 19:02:06 tem a mesma forma, com o AA
//     dragolisk 82 (seq 447) e dragolisk 83 (seq 638), ambos com a 2a linha de mana de AA.
//   - Guardas (casos que versoes intermediarias do prototipo quebraram; o resultado de hoje e o
//     correto): dlc ms S0 21:37:23 (A0 + Death Echo 18) e 21:43:07 (A0 + Death Echo 15);
//     kim S0 16:25:13 (A1 + Death Echo 9: o nighthunter 61 OK declara N=1 pelo leech);
//     dlc ms S1 21:55:58 (A0 + Death Echo 15: o darklight source 593 de 21:56:00 e o eco, metade
//     do 1184 do blast, e nao um AA).
//   - Estancia e estado por cast: a inferencia movida para antes da resolucao TEM de reproduzir a
//     de antes (decisao do usuario, 26/Set/2026). tests/fixtures/sorcerer-stance-states-2026-09-26.json
//     e a fotografia da inferencia pos-resolucao no commit 43b5e0c, usada como requisito dessa
//     decisao — nao como esperado de alvo.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { splitSessions, pairSessions } from '../tools/unified-corpus.mjs';

const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, WeakMap, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const file of ['js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js', 'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js', 'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js']) {
  vm.runInContext(read(file), ctx, { filename: file });
}
const engine = ctx.UnifiedClassificationEngine;

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.error(`  ok   ${name}`); }
  else { fail++; console.error(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const OPTS = {
  mobModsPre: ctx.MOB_ELEMENT_MODS,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
  strictLeech: true, maxOriginal: 6000, useFloat16Mitigation: true,
};
const cache = new Map();
function classify(server, local, index) {
  const key = `${server}|${index}`;
  if (!cache.has(key)) {
    const s = pairSessions(splitSessions(read(path.join('logs', server))), splitSessions(read(path.join('logs', local))))[index];
    cache.set(key, engine.classifyUnified(s.sv.text, s.lc.text, OPTS));
  }
  return cache.get(key);
}
const clockOf = ts => [Math.floor(ts / 3600) % 24, Math.floor(ts / 60) % 60, ts % 60].map(v => String(v).padStart(2, '0')).join(':');
const turnAt = (u, clock) => (u.turns || []).find(t => clockOf(t.ts) === clock) || null;
const countsOf = t => {
  const c = { arrow: 0, spell: 0, rune: 0, grenade: 0 };
  for (const comp of (t && t.components) || []) if (comp.comp in c) c[comp.comp] += (comp.hits || []).length;
  return `A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
};
const spellOf = t => ((t && t.components) || []).find(c => c.comp === 'spell') || null;
const arrowOf = t => ((t && t.components) || []).find(c => c.comp === 'arrow') || null;
const stageSeqs = (comp, stage, withOverkill) => ((comp && comp.hits) || [])
  .filter(h => h.multiStageStage === stage && (withOverkill || !h.overkill)).map(h => h.seq).sort((a, b) => a - b);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ------------------------------------------- 1. estancia inferida antes da resolucao (M-043a)
const SESSIONS = {
  'alumnishocks S0': ['alumnishocks server log.txt', 'alumnishocks localchat.txt', 0],
  'alumnishocks 2 S0': ['alumnishocks 2 server log.txt', 'alumnishocks 2 localchat.txt', 0],
  'kim S0': ['kim server log.txt', 'kim local chat.txt', 0],
  'aquatic S0': ['aquatic Server Log.txt', 'aquatic Local Chat.txt', 0],
  'aquatic S1': ['aquatic Server Log.txt', 'aquatic Local Chat.txt', 1],
  'aquatic S2': ['aquatic Server Log.txt', 'aquatic Local Chat.txt', 2],
  'death echo S0': ['death echo server log.txt', 'death echo local chat.txt', 0],
  'dlc ms S0': ['dlc ms Server Log.txt', 'dlc ms Local Chat.txt', 0],
  'dlc ms S1': ['dlc ms Server Log.txt', 'dlc ms Local Chat.txt', 1],
};
const snapshot = JSON.parse(read('tests/fixtures/sorcerer-stance-states-2026-09-26.json'));
for (const expected of snapshot) {
  const u = classify(...SESSIONS[expected.session]);
  const st = u.sorcererStanceSetup || {};
  const got = (st.casts || []).map(c => [c.ts, c.incantation, c.stance, c.state]);
  const diverging = expected.casts.filter((e, i) => !same(e, got[i]));
  check(`${expected.session}: estancia ${expected.stance} (${expected.source})`, st.stance === expected.stance && st.source === expected.source, `stance=${st.stance} source=${st.source}`);
  check(`${expected.session}: estado de cada cast igual ao de antes (${expected.casts.length} casts)`,
    got.length === expected.casts.length && !diverging.length,
    `${got.length} casts, ${diverging.length} divergentes; 1o: ${JSON.stringify(diverging[0])}`);
}
{
  const u = classify(...SESSIONS['alumnishocks S0']);
  const hc = ((u.sorcererStanceSetup || {}).casts || []).find(c => clockOf(c.ts) === '19:01:38' && c.incantation === 'exevo gran mas flam');
  check('alumnishocks S0: o Hell\'s Core de 19:01:38 vota energy mesmo com o AA mega dragon 102 no segundo',
    !!hc && Array.isArray(hc.observedElements) && hc.observedElements.includes('energy') && !hc.observedElements.includes('fire'),
    JSON.stringify(hc && hc.observedElements));
}

// ---------------------------------- 2. elemento efetivo na reversao das spells que nao sao beam
const alumni2 = classify(...SESSIONS['alumnishocks 2 S0']);
{
  const t = turnAt(alumni2, '18:25:47');
  const spell = spellOf(t);
  check('alumnishocks 2 18:25:47: A0 + Death Echo 15', countsOf(t) === 'A0 S15 R0 G0' && /Death Echo/.test((spell && spell.actionLabel) || ''), countsOf(t));
  check('alumnishocks 2 18:25:47: bloco revertido em energy (convertido)', !!spell && spell.deterministic && spell.deterministic.element === 'energy',
    `element=${spell && spell.deterministic && spell.deterministic.element}`);
  // D-010a: em energy os 5 hits do blast (dragolisk 790 x2, wardragon 828 x3) revertem para o
  // mesmo original entre mobs distintos (786-788); em death seriam 717 e 923.
  const blast = ((spell && spell.hits) || []).filter(h => [3192, 3195, 3198, 3202, 3205].includes(h.seq));
  const energyOriginals = h => (((h.evidence || {}).elemental || {}).energy || {}).originals || [];
  check('alumnishocks 2 18:25:47: os 5 hits do blast revertem para 786-788 em energy',
    blast.length === 5 && blast.every(h => energyOriginals(h).some(o => o >= 786 && o <= 788)),
    JSON.stringify(blast.map(h => [h.mob, h.dmg, energyOriginals(h)])));
}

// ----------------------------------------------- 3. prova de estagio no elemento efetivo
{
  const t = turnAt(alumni2, '18:24:39');
  const spell = spellOf(t), aa = arrowOf(t);
  check('alumnishocks 2 18:24:39: A1 + Death Echo 10', t && t.status === 'resolved' && countsOf(t) === 'A1 S10 R0 G0', `${t && t.status} ${countsOf(t)}`);
  check('alumnishocks 2 18:24:39: o AA e o wardragon 70 (seq 2300)', !!aa && aa.hits.length === 1 && aa.hits[0].seq === 2300, JSON.stringify(aa && aa.hits.map(h => h.seq)));
  check('alumnishocks 2 18:24:39: o dragolisk 337 OK (seq 2304) esta no Death Echo', !!spell && spell.hits.some(h => h.seq === 2304), '');
  check('alumnishocks 2 18:24:39: primeira explosao = os 4 hits nao-overkill do blast', same(stageSeqs(spell, 'primary', false), [2308, 2311, 2314, 2317]), JSON.stringify(stageSeqs(spell, 'primary', false)));
  check('alumnishocks 2 18:24:39: segunda explosao = os 5 hits de :40', same(stageSeqs(spell, 'echo', true), [2320, 2323, 2326, 2329, 2332]), JSON.stringify(stageSeqs(spell, 'echo', true)));
  check('alumnishocks 2 18:24:39: revertido em energy', !!spell && spell.deterministic && spell.deterministic.element === 'energy', `element=${spell && spell.deterministic && spell.deterministic.element}`);
}
{
  const spell = spellOf(turnAt(alumni2, '18:25:47'));
  check('alumnishocks 2 18:25:47: primeira explosao = os 5 hits do blast', same(stageSeqs(spell, 'primary', false), [3192, 3195, 3198, 3202, 3205]), JSON.stringify(stageSeqs(spell, 'primary', false)));
  check('alumnishocks 2 18:25:47: segunda explosao = os 10 hits de :48', stageSeqs(spell, 'echo', true).length === 10, JSON.stringify(stageSeqs(spell, 'echo', true)));
}
{
  const u = classify(...SESSIONS['alumnishocks S0']);
  for (const [clock, spellHits, aaSeq] of [['19:01:52', 16, 447], ['19:02:06', 14, 638]]) {
    const t = turnAt(u, clock), aa = arrowOf(t);
    check(`alumnishocks S0 ${clock}: A1 + Death Echo ${spellHits}`, t && t.status === 'resolved' && countsOf(t) === `A1 S${spellHits} R0 G0`, `${t && t.status} ${countsOf(t)}`);
    check(`alumnishocks S0 ${clock}: o AA e o seq ${aaSeq}`, !!aa && aa.hits.length === 1 && aa.hits[0].seq === aaSeq, JSON.stringify(aa && aa.hits.map(h => h.seq)));
  }
}
// Guardas
{
  const dlc0 = classify(...SESSIONS['dlc ms S0']);
  check('guarda dlc ms S0 21:37:23: A0 + Death Echo 18', countsOf(turnAt(dlc0, '21:37:23')) === 'A0 S18 R0 G0', countsOf(turnAt(dlc0, '21:37:23')));
  // A prova de estagio fecha (pelo elemento alternativo, death: em fire o darklight source
  // 1184 -> 593 da 1048 -> 526, fora da folga de 1 ponto): blast e eco ficam rotulados.
  const d23 = spellOf(turnAt(dlc0, '21:37:23'));
  check('guarda dlc ms S0 21:37:23: blast e eco rotulados (a prova fechou)',
    stageSeqs(d23, 'primary', false).length > 0 && stageSeqs(d23, 'echo', true).length === 9,
    `primary=${stageSeqs(d23, 'primary', false).length} echo=${stageSeqs(d23, 'echo', true).length}`);
  check('guarda dlc ms S0 21:43:07: A0 + Death Echo 15', countsOf(turnAt(dlc0, '21:43:07')) === 'A0 S15 R0 G0', countsOf(turnAt(dlc0, '21:43:07')));
  const kim = classify(...SESSIONS['kim S0']);
  const kt = turnAt(kim, '16:25:13');
  check('guarda kim 16:25:13: A1 + Death Echo 9', countsOf(kt) === 'A1 S9 R0 G0', countsOf(kt));
  const nh = ((kt && kt.components) || []).flatMap(c => c.hits || []).find(h => h.seq === 4589);
  check('guarda kim 16:25:13: o nighthunter 61 OK nao e primeira explosao', !!nh && nh.multiStageStage !== 'primary', nh && nh.multiStageStage);
  const dlc1 = classify(...SESSIONS['dlc ms S1']);
  check('guarda dlc ms S1 21:55:58: A0 + Death Echo 15', countsOf(turnAt(dlc1, '21:55:58')) === 'A0 S15 R0 G0', countsOf(turnAt(dlc1, '21:55:58')));
  check('guarda dlc ms S1: nenhum turno em 21:56:00', !turnAt(dlc1, '21:56:00'), '');
}

console.log(`unified sorcerer stance conversion: ${pass} ok, ${fail} falhas`);
if (fail) process.exit(1);
