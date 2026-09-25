// M-043 / M-043a — estancia elemental de sorcerer e conversao do proximo cast.
//
// Com a estancia E (uteta flam = fire, uteta mort = death, uteta vis = energy), cada magia
// ofensiva de elemento E arma a carga; a proxima magia ofensiva de elemento diferente sai
// convertida para E. Outra magia de E com a carga armada DESPERDICA a conversao.
//
// Os estados esperados abaixo NAO vem da saida do motor. Vem do local chat (a ordem dos
// casts) e do dano observado (o elemento em que o bloco fecha entre mobs distintos, D-010a):
//   - alumnishocks 2: Great Energy Beam 18:21:16 arma; Energy Wave 18:21:19 so rearma (nada
//     se perde: a carga segue armada);
//     Hell's Core 18:21:21 converte (antes do server log comecar, que e em 18:21:24);
//     Death Echo 18:21:26 sai em death nativo (carga ja consumida). Energy Wave 18:30:38 arma;
//     Hell's Core 18:30:42 sai em energy (convertido); Death Echo 18:30:46 sai em death.
//   - dlc ms S0: o dono lanca `uteta flam` em 21:20:23.
//   - death echo S0: os Energy Wave saem em death -> Master of Decay.
//   - kim S0 e aquatic S2: Death Echo/Hell's Core saem em energy -> Master of Thunder.
//   - aquatic S1: 7 Death Echo e 2 Hell's Core fecham em energy entre mobs distintos -> Thunder
//     pelos proprios blocos da sessao (nao herdado de S2).
//   - alumnishocks S0: Hell's Core 19:01:38 sai em energy — impossivel sob Master of Flames,
//     onde fire e sempre nativo -> Thunder.
//   - mrowdy 2 S0 (11/Jun/2026): antes do update de 16/Jun/2026 que criou as estancias.
//
// A inferencia NAO pode mudar classificacao: o dump do corpus inteiro tem de sair
// byte-identico (gate de dump, fora deste teste).
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
function classify(server, local, index) {
  const sessions = pairSessions(splitSessions(read(path.join('logs', server))), splitSessions(read(path.join('logs', local))));
  const s = sessions[index];
  return engine.classifyUnified(s.sv.text, s.lc.text, OPTS);
}
const clockOf = ts => [Math.floor(ts / 3600) % 24, Math.floor(ts / 60) % 60, ts % 60].map(v => String(v).padStart(2, '0')).join(':');
const castState = (u, clock, incantation) => {
  const c = ((u.sorcererStanceSetup || {}).casts || []).find(x => clockOf(x.ts) === clock && x.incantation === incantation);
  return c ? c.state : `(cast ${clock} ${incantation} ausente)`;
};

// -------------------------------------------------- alumnishocks 2: Thunder, inferida
const alumni = classify('alumnishocks 2 server log.txt', 'alumnishocks 2 localchat.txt', 0);
const as = alumni.sorcererStanceSetup || {};
check('alumnishocks 2: estancia energy (Master of Thunder)', as.stance === 'energy', `stance=${as.stance}`);
check('alumnishocks 2: fonte e o dano', as.source === 'inferred_from_damage', `source=${as.source}`);
check('alumnishocks 2: fire e death contradizem o dano',
  (as.candidates || []).filter(c => c.stance !== 'energy').every(c => c.contradictions > 0)
    && ((as.candidates || []).find(c => c.stance === 'energy') || {}).contradictions === 0,
  JSON.stringify((as.candidates || []).map(c => [c.stance, c.contradictions])));
check('alumnishocks 2: 18:21:16 Great Energy Beam arma', castState(alumni, '18:21:16', 'exevo gran vis lux') === 'arm', castState(alumni, '18:21:16', 'exevo gran vis lux'));
check('alumnishocks 2: 18:21:19 Energy Wave so rearma', castState(alumni, '18:21:19', 'exevo vis hur') === 'rearm', castState(alumni, '18:21:19', 'exevo vis hur'));
check('alumnishocks 2: 18:21:21 Hell\'s Core converte (antes do server log)', castState(alumni, '18:21:21', 'exevo gran mas flam') === 'converted', castState(alumni, '18:21:21', 'exevo gran mas flam'));
check('alumnishocks 2: 18:21:26 Death Echo nativo', castState(alumni, '18:21:26', 'exevo mort ora') === 'native', castState(alumni, '18:21:26', 'exevo mort ora'));
check('alumnishocks 2: 18:30:38 Energy Wave arma', castState(alumni, '18:30:38', 'exevo vis hur') === 'arm', castState(alumni, '18:30:38', 'exevo vis hur'));
check('alumnishocks 2: 18:30:42 Hell\'s Core converte', castState(alumni, '18:30:42', 'exevo gran mas flam') === 'converted', castState(alumni, '18:30:42', 'exevo gran mas flam'));
check('alumnishocks 2: 18:30:46 Death Echo nativo', castState(alumni, '18:30:46', 'exevo mort ora') === 'native', castState(alumni, '18:30:46', 'exevo mort ora'));

// Marca no turno: o turno do Death Echo de 18:21:26 e o primeiro do server log (18:21:25).
const firstTurn = (alumni.turns || []).find(t => t.clock === '18:21:25');
check('alumnishocks 2: turno 18:21:25 marca conversao PERDIDA (Death Echo provado em death)',
  firstTurn && firstTurn.stanceConversion && firstTurn.stanceConversion.result === 'lost' && firstTurn.stanceConversion.proven === true,
  JSON.stringify(firstTurn && firstTurn.stanceConversion));
// Contagem no trecho coberto pelo server log: so casts cujo turno existe.
check('alumnishocks 2: agregado conta aproveitadas e perdidas dentro do server log',
  as.summary && as.summary.used > 0 && as.summary.lost > 0
    && as.summary.opportunities === as.summary.used + as.summary.lost,
  JSON.stringify(as.summary));

// ------------------------------------------------ dlc ms S0: Flames, pelo cast do dono
const dlc = classify('dlc ms Server Log.txt', 'dlc ms Local Chat.txt', 0);
const ds = dlc.sorcererStanceSetup || {};
check('dlc ms S0: estancia fire pelo cast do dono', ds.stance === 'fire' && ds.source === 'owner_cast_timeline', `stance=${ds.stance} source=${ds.source}`);
check('dlc ms S0: linha do tempo registra uteta flam 21:20:23',
  (ds.timeline || []).some(e => e.incantation === 'uteta flam' && clockOf(e.ts) === '21:20:23'), JSON.stringify(ds.timeline));

// ------------------------------------------------------------ death echo S0: Decay
const echo = classify('death echo server log.txt', 'death echo local chat.txt', 0);
check('death echo S0: estancia death (Master of Decay) pelo dano',
  (echo.sorcererStanceSetup || {}).stance === 'death' && (echo.sorcererStanceSetup || {}).source === 'inferred_from_damage',
  JSON.stringify({ stance: (echo.sorcererStanceSetup || {}).stance, source: (echo.sorcererStanceSetup || {}).source }));

// --------------------------------------------------------------- kim S0: Thunder
const kim = classify('kim server log.txt', 'kim local chat.txt', 0);
check('kim S0: estancia energy pelo dano', (kim.sorcererStanceSetup || {}).stance === 'energy', `stance=${(kim.sorcererStanceSetup || {}).stance}`);
// Casos que o usuario apontou na UI (25/Set/2026): a SEQUENCIA decide a marca; o dano so
// reforca (selo `proven`) ou veta.
//   16:13:35 Energy Wave com a carga armada: sai em energy, que ja e o elemento dele -> nada se
//            perde (a carga segue armada) -> SEM marca.
//   16:13:37 Death Echo: fecha em energy entre mobs distintos -> conversao APROVEITADA.
const kimTurn = clock => (kim.turns || []).find(t => t.clock === clock);
check('kim 16:13:35: Energy Wave com carga armada nao marca perda', kimTurn('16:13:35') && !kimTurn('16:13:35').stanceConversion,
  JSON.stringify(kimTurn('16:13:35') && kimTurn('16:13:35').stanceConversion));
check('kim 16:13:37: Death Echo em energy marca conversao aproveitada',
  kimTurn('16:13:37') && kimTurn('16:13:37').stanceConversion && kimTurn('16:13:37').stanceConversion.result === 'used',
  JSON.stringify(kimTurn('16:13:37') && kimTurn('16:13:37').stanceConversion));
//   16:22:20 Death Echo logo apos o Great Energy Beam de 16:22:18: acerta UM mob so (undertaker),
//            entao o dano nao discrimina o elemento; a sequencia decide -> aproveitada, sem selo.
check('kim 16:22:20: Death Echo apos energy marca aproveitada pela sequencia (sem prova de dano)',
  kimTurn('16:22:20') && kimTurn('16:22:20').stanceConversion && kimTurn('16:22:20').stanceConversion.result === 'used'
    && kimTurn('16:22:20').stanceConversion.proven === false,
  JSON.stringify(kimTurn('16:22:20') && kimTurn('16:22:20').stanceConversion));
// O dano so veta: nenhuma marca contradiz o bloco quando ele e mensuravel.
check('kim: nenhuma marca contradiz o dano',
  ((kim.sorcererStanceSetup || {}).casts || []).filter(c => c.result && c.observedElements)
    .every(c => c.observedElements.includes(c.result === 'used' ? c.stance : c.nativeElement)), '');

// ----------------------------------------------- aquatic S2 energy; S1 desconhecida
const aq2 = classify('aquatic Server Log.txt', 'aquatic Local Chat.txt', 2);
check('aquatic S2: estancia energy pelo dano', (aq2.sorcererStanceSetup || {}).stance === 'energy', `stance=${(aq2.sorcererStanceSetup || {}).stance}`);
const aq1 = classify('aquatic Server Log.txt', 'aquatic Local Chat.txt', 1);
const a1 = aq1.sorcererStanceSetup || {};
check('aquatic S1: energy pelos proprios blocos', a1.stance === 'energy' && a1.source === 'inferred_from_damage', `stance=${a1.stance} source=${a1.source}`);

// ---------------------------------- alumnishocks S0: cast de fire observado em energy
const alumni1 = classify('alumnishocks server log.txt', 'alumnishocks localchat.txt', 0);
const al1 = alumni1.sorcererStanceSetup || {};
check('alumnishocks S0: energy — Hell\'s Core 19:01:38 em energy contradiz Flames', al1.stance === 'energy',
  `stance=${al1.stance} candidatas=${JSON.stringify((al1.candidates || []).map(c => [c.stance, c.contradictions]))}`);
check('alumnishocks S0: Master of Flames tem contradicao',
  ((al1.candidates || []).find(c => c.stance === 'fire') || {}).contradictions > 0, JSON.stringify(al1.candidates));

// ------------------------------------------ desconhecida: sem bloco que discrimine
// Sessao sintetica minima: sorcerer pos-update com casts ofensivos mas um mob so por
// segundo. Nenhum bloco discrimina, entao nao ha estancia a adotar (D-006).
{
  const sv = [
    'Channel Server Log saved Mon Sept 21 10:00:30 2026',
    '10:00:00 You healed yourself for 900 hitpoints.',
    '10:00:02 You healed yourself for 910 hitpoints.',
    '10:00:05 You healed yourself for 905 hitpoints.',
    '10:00:08 You healed yourself for 899 hitpoints.',
    '10:00:11 You healed yourself for 903 hitpoints.',
    '10:00:14 You healed yourself for 907 hitpoints.',
    '10:00:01 A dragolisk loses 700 hitpoints due to your attack.',
    '10:00:01 You gained 10 mana.',
    '10:00:04 A dragolisk loses 710 hitpoints due to your attack.',
    '10:00:04 You gained 10 mana.',
    '10:00:07 A dragolisk loses 690 hitpoints due to your attack.',
    '10:00:07 You gained 10 mana.',
    '10:00:10 A dragolisk loses 705 hitpoints due to your attack.',
    '10:00:10 You gained 10 mana.',
    '10:00:13 A dragolisk loses 698 hitpoints due to your attack.',
    '10:00:13 You gained 10 mana.',
  ].join('\n');
  const lc = [
    'Channel Local Chat saved Mon Sept 21 10:00:30 2026',
    '10:00:00 Tester [900]: exura vita',
    '10:00:01 Tester [900]: exevo vis hur',
    '10:00:02 Tester [900]: exura vita',
    '10:00:04 Tester [900]: exevo mort ora',
    '10:00:05 Tester [900]: exura vita',
    '10:00:07 Tester [900]: exevo vis hur',
    '10:00:08 Tester [900]: exura vita',
    '10:00:10 Tester [900]: exevo mort ora',
    '10:00:11 Tester [900]: exura vita',
    '10:00:13 Tester [900]: exevo vis hur',
    '10:00:14 Tester [900]: exura vita',
  ].join('\n');
  const syn = engine.classifyUnified(sv, lc, OPTS);
  const ss = syn.sorcererStanceSetup || {};
  check('sintetico (1 mob por segundo): estancia desconhecida', !syn.error && syn.vocation === 'sorcerer' && ss.stance === 'unknown',
    `error=${syn.error} vocation=${syn.vocation} stance=${ss.stance} source=${ss.source}`);
  check('sintetico: nenhum turno marcado', !syn.error && (syn.turns || []).every(t => !t.stanceConversion), '');
}

// ------------------------------------------------- mrowdy 2 S0: antes do update
const mrowdy = classify('Mrowdy Server Log 2.txt', 'Mrowdy Local Chat 2.txt', 0);
const ms = mrowdy.sorcererStanceSetup || {};
check('mrowdy 2 S0: estancia nao se aplica (antes de 16/Jun/2026)', ms.stance === 'not_applicable', `stance=${ms.stance}`);
check('mrowdy 2 S0: nenhum turno marcado', (mrowdy.turns || []).every(t => !t.stanceConversion), '');

// -------------------------------------------------------- vocacao nao-sorcerer
const moon = classify('moonsilver Server Log.txt', 'moonsilver Local Chat.txt', 0);
check('moonsilver (paladino): sem estancia de sorcerer',
  (moon.sorcererStanceSetup || {}).stance === 'not_applicable' && (moon.turns || []).every(t => !t.stanceConversion),
  `stance=${(moon.sorcererStanceSetup || {}).stance}`);

console.log(`unified sorcerer stance: ${pass} ok, ${fail} falhas`);
if (fail) process.exit(1);
