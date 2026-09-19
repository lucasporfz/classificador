// D-010g (emenda de 14/Sep/2026), D-022b, D-006/C-007, D-016/D-017b.
// Change `infer-drone-bounty-talisman`.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ctx = {
  console: silent, Math, JSON, Array, Object, Number, String, Map, Set, Date,
  isFinite, isNaN, parseInt, parseFloat, Float32Array, Int32Array,
};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.createContext(ctx);
for (const file of [
  'js/mob-element-mods.js',
  'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-session-context.js', 'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
  'js/unified-turn-resolution.js',
  'js/unified-classification-engine.js',
]) {
  vm.runInContext(read(file), ctx, { filename: file });
}
const formulas = ctx.UnifiedFormulas;
const setupInference = ctx.UnifiedSetupInference;
const validation = ctx.UnifiedValidation;
const engine = ctx.UnifiedClassificationEngine;
// Arrays vindos do vm têm prototype de outro realm: comparar por string.
const same = (actual, expected, message) =>
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);

// ---------------------------------------------------------------- 2. Sept (D-016)
assert.equal(formulas.sessionDateKey('Channel Server Log saved Mon Sept 14 07:04:22 2026'), 20260914);
assert.equal(formulas.sessionDateKey('Channel Server Log saved Mon Sep 14 07:04:22 2026'), 20260914);
assert.equal(formulas.sessionDateKey('Channel Server Log saved Tue Sept 02 19:15:03 2025'), 20250902);
assert.ok(formulas.sessionDateKey('Channel Server Log saved Fri Sept 06 21:08:54 2024') < formulas.CUTOFF_KEY);

// ------------------------------------------------ 3. testemunha de charm (D-010g)
const levels = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const procs = (dmg, count, marked, gravSanMultiplier = 1) =>
  Array.from({ length: count }, () => ({ dmg, marked, gravSanMultiplier }));

// 3.1 base comum: `drone bounty` S0, converter/wound, sem e com EW.
{
  const ew = formulas.bountyCharmRowVerdict({
    procs: [
      ...procs(1954, 12, true), ...procs(2188, 13, true, 1.12), ...procs(1945, 2, false, 1.12),
      ...procs(1569, 1, true), ...procs(981, 1, true, 1.12), ...procs(910, 1, true, 1.12),
    ],
    hpBaseA0: null,
  }, levels(0, 80));
  same(ew.commonBaseLevels, [25], 'EW: só o nível 25 admite base comum');
  same(ew.commonBases[25], [1737], 'EW: A = 1737');
  same(ew.excluded.map(p => p.dmg).sort((a, b) => a - b), [910, 981, 1569], 'EW: minoritários fora do voto modal');
  same(ew.allowedLevels, [25]);

  const plain = formulas.bountyCharmRowVerdict({
    procs: [...procs(1891, 8, true), ...procs(2117, 1, true, 1.12), ...procs(1882, 1, false, 1.12)],
    hpBaseA0: null,
  }, levels(0, 80));
  same(plain.commonBaseLevels, [25], 'sem EW: só o nível 25 admite base comum');
  same(plain.commonBases[25], [1681], 'sem EW: A = 1681');
  same(plain.excluded, [], 'sem EW: nada excluído');

  // Nível não modelado acima do modal (uhax 3 S1): 3891 fica fora e o 26 continua único.
  const uhax = formulas.bountyCharmRowVerdict({
    procs: [...procs(2161, 39, false), ...procs(2436, 177, true), ...procs(3891, 2, false)],
    hpBaseA0: null,
  }, levels(0, 60));
  same(uhax.commonBaseLevels, [26]);
  same(uhax.excluded.map(p => p.dmg), [3891, 3891]);
}

// 3.2 âncora de HP sem nenhum controle sem marca: par único (classe 0, nível 25).
{
  const classBonuses = [0].concat(Array.from(formulas.BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES));
  const plain = formulas.bountyCharmRowVerdict({
    procs: procs(1891, 8, true), hpBaseA0: [1681], classBonuses,
  }, levels(0, 80));
  assert.equal(plain.commonBaseDiscriminating, false, 'sem controle a base comum não discrimina');
  same(plain.hpAnchorPairs, [{ classBonus: 0, level: 25 }]);
  assert.equal(plain.hpAnchorVote, 'unique');
  same(plain.allowedLevels, [25]);

  const ew = formulas.bountyCharmRowVerdict({
    procs: procs(1954, 12, true), hpBaseA0: [1737, 1738], classBonuses,
  }, levels(0, 80));
  same(ew.hpAnchorPairs, [{ classBonus: 0, level: 25 }]);
  same(ew.allowedLevels, [25]);
}

// 3.3 confundimento classe × Bounty sem proc sem marca: a âncora abstém.
{
  const row = formulas.bountyCharmRowVerdict({
    procs: procs(1122, 3, true), hpBaseA0: [1000], classBonuses: [0, 0.02],
  }, levels(0, 40));
  assert.ok(row.hpAnchorPairs.length > 1, JSON.stringify(row.hpAnchorPairs));
  assert.equal(row.hpAnchorVote, 'abstain');
  assert.equal(row.allowedLevels, null, 'linha sem voto não restringe nível');
}

// 3.4a veredito de sessão: linhas em conflito deixam unknown.
{
  same(formulas.bountyCharmSessionLevels([{ allowedLevels: [24] }, { allowedLevels: [25] }]), []);
  same(formulas.bountyCharmSessionLevels([{ allowedLevels: [24, 25] }, { allowedLevels: [25] }, { allowedLevels: null }]), [25]);
  same(formulas.bountyCharmSessionLevels([{ allowedLevels: null }]), null, 'nenhuma linha discriminante');
}

// 3.4b proc em janela de grav san só vota com tier resolvido.
{
  const events = [
    { kind: 'charm', dmg: 1954, ts: 50, mob: 'converter', woundCharm: true, bountyTalisman: true, exposeWeakness: true, rawLine: 'A converter loses 1954 hitpoints due to your attack. (wound charm, increased damage by Expose Weakness, Bounty Talisman Effect: More Damage Dealt)' },
    { kind: 'charm', dmg: 1945, ts: 102, mob: 'converter', woundCharm: true, bountyTalisman: false, exposeWeakness: true, rawLine: 'A converter loses 1945 hitpoints due to your attack. (wound charm, increased damage by Expose Weakness)' },
  ];
  const windows = [{ start: 100, end: 105 }];
  const unresolved = engine.buildBountyCharmRows(events, { gravSanSetup: { bonus: 0, multiplier: 1, source: 'utevo_grav_san_comparable_charm_conflict', windows } });
  assert.equal(unresolved.reduce((sum, row) => sum + row.procs.length, 0), 1, 'tier não resolvido: proc da janela não vota');
  const resolved = engine.buildBountyCharmRows(events, { gravSanSetup: { bonus: 0.12, multiplier: 1.12, source: 'inferred_from_charm_damage_in_grav_san_windows', windows } });
  const all = resolved.flatMap(row => row.procs);
  assert.equal(all.length, 2);
  assert.equal(all.find(p => p.dmg === 1945).gravSanMultiplier, 1.12);
}

// -------------------------------------- 4. abstenção de Bounty desconhecido (D-006)
{
  const hit = { type: 'normal', dmg: 1067, mob: 'converter', ts: 60, bountyTalisman: true, exposeWeakness: true, lifeLeech: 0, manaLeech: 36 };
  const setup = { lifeBase: 0.5, manaBase: 0.1625, confidence: 'strong' };
  const unknownContext = { bountyTalismanSetup: setupInference.unknownBountyTalismanSetup('test') };
  for (const n of [1, 4, 7, 11]) {
    const fit = validation.observedLeechAcceptsN(hit, setup, n, 'mana', null, unknownContext);
    assert.equal(fit.usable, false, 'N=' + n + ': ' + JSON.stringify(fit));
    assert.equal(fit.ok, true);
    assert.equal(fit.reason, 'bounty_damage_basis_unknown');
    const hitFit = validation.hitLeechFit(hit, setup, n, null, unknownContext);
    assert.equal(hitFit.usable, false, 'hitLeechFit N=' + n + ': ' + JSON.stringify(hitFit));
    assert.equal(hitFit.reason, 'bounty_damage_basis_unknown');
  }
  const knownContext = {
    bountyTalismanSetup: {
      damage: { level: 25, bonus: 0.125, multiplier: 1.125, confidence: 'strong' },
      life: setupInference.unknownBountyTalismanSetup('test').life,
    },
  };
  assert.equal(validation.observedLeechAcceptsN(hit, setup, 7, 'mana', null, knownContext).usable, true,
    'Damage conhecido mantém a validação estrita');

  // D-022b: Life desconhecida abstém só o canal de vida do hit marcado.
  const lifeHit = Object.assign({}, hit, { lifeLeech: 100 });
  const lifeUnknown = validation.observedLeechAcceptsN(lifeHit, setup, 7, 'life', null, knownContext);
  assert.equal(lifeUnknown.usable, false);
  assert.equal(lifeUnknown.reason, 'bounty_life_level_unknown');
  const lifeKnownSetup = Object.assign({}, setup, { bountyTalismanLifeConfidence: 'strong', bountyTalismanLifeBonus: 0.05 });
  assert.equal(validation.observedLeechAcceptsN(lifeHit, lifeKnownSetup, 7, 'life', null, knownContext).usable, true,
    'Life conhecida mantém o canal de vida');
  const unmarkedLife = Object.assign({}, lifeHit, { bountyTalisman: false });
  assert.equal(validation.observedLeechAcceptsN(unmarkedLife, setup, 7, 'life', null, knownContext).usable, true,
    'hit sem marca não é afetado');
}

// ------------------------------------ 5. fallback: pureza e unanimidade (D-010g)
{
  assert.equal(setupInference.bountyFallbackVerdict([
    { level: 25, fits: 40, contradictions: 35 }, { level: 24, fits: 30, contradictions: 45 },
  ]), null, 'maioria sem unanimidade não aceita');
  assert.equal(setupInference.bountyFallbackVerdict([
    { level: 25, fits: 5, contradictions: 0 }, { level: 24, fits: 3, contradictions: 2 },
  ]).level, 25);
  assert.equal(setupInference.bountyFallbackVerdict([
    { level: 25, fits: 5, contradictions: 0 }, { level: 26, fits: 2, contradictions: 0 },
  ]), null, 'dois níveis sem contradição = empate');
  assert.equal(setupInference.bountyFallbackVerdict([
    { level: 25, fits: 0, contradictions: 0 },
  ]), null, 'sem encaixe não crava');

  // O controle conhecido fixa O=1000. O hit marcado conhecido fecha apenas no
  // nível 25; o segundo marcado não tem mob na tabela e deve abster, não apagar
  // a evidência independente do primeiro.
  const sessionContext = ctx.UnifiedSessionContext.create({});
  Object.assign(sessionContext, {
    sessionDateKey: 20260701,
    mobModsPost: {
      control: { holyDmgMod: 1, mitigation: 0, bestiaryClass: 'test' },
      marked: { holyDmgMod: 1, mitigation: 0, bestiaryClass: 'test' },
    },
    useFloat16Mitigation: true,
    bmPierce: 0,
    gravSanSetup: { bonus: 0, windows: [] },
    stanceSetup: { hasStanceCasts: false },
    bestiaryClassBonus: { bonus: 0, multiplier: 1, class: null },
    omegaSetup: { active: false, multiplier: 1 },
    bountyTalismanSetup: setupInference.unknownBountyTalismanSetup('test'),
    critSetup: { byComponent: {}, fallback: 1, multiplier: 1 },
  });
  const hit = (id, mob, dmg, marked) => ({
    id, type: 'normal', mob, dmg, ts: 100, bountyTalisman: marked,
    exposeWeakness: false, elementalAmplification: false,
  });
  const synthetic = setupInference.inferBountyDamageFromFrozenComponents([{
    status: 'resolved', clock: '00:01:40', components: [{
      comp: 'spell',
      action: { text: 'synthetic', profile: { label: 'Synthetic Holy', element: 'holy', topology: 'area' } },
      deterministic: { ok: true },
      hits: [
        hit(1, 'control', 1000, false),
        // D-010g (fallback): só o valor modal repetido de cada (mob, estado) vota.
        hit(2, 'marked', 1125, true),
        hit(4, 'marked', 1125, true),
        hit(3, 'missing mob', 9999, true),
        hit(5, 'missing mob', 9999, true),
      ],
    }],
  }], sessionContext);
  assert.equal(synthetic.level, 25, JSON.stringify(synthetic));
  assert.equal(synthetic.source, 'frozen_deterministic_component_original');
  assert.equal(synthetic.contradictions, 0);

  // Minoritário abaixo do modal (capped-low ou hit de outro componente colado pela
  // partição congelada) não vota; marcado solitário também não; minoritário ACIMA do
  // modal deixa o componente inteiro sem voto.
  const turnWith = (clock, hits) => ({
    status: 'resolved', clock, components: [{
      comp: 'spell',
      action: { text: 'synthetic', profile: { label: 'Synthetic Holy', element: 'holy', topology: 'area' } },
      deterministic: { ok: true },
      hits,
    }],
  });
  const minority = setupInference.inferBountyDamageFromFrozenComponents([
    turnWith('00:01:40', [
      hit(1, 'control', 1000, false),
      hit(2, 'marked', 1125, true), hit(4, 'marked', 1125, true), hit(6, 'marked', 900, true),
    ]),
    turnWith('00:01:42', [hit(7, 'control', 1000, false), hit(8, 'marked', 1100, true)]),
    turnWith('00:01:44', [
      hit(9, 'control', 1000, false),
      hit(10, 'marked', 1100, true), hit(11, 'marked', 1100, true), hit(12, 'marked', 1150, true),
    ]),
  ], sessionContext);
  assert.equal(minority.level, 25, JSON.stringify(minority));
  assert.equal(minority.evidenceCount, 1);
  assert.equal(minority.contradictions, 0);
}

// ---------------------------- 6. Vampiric Embrace no mob marcado (D-022b, emenda)
// Sintético: hits sem marca de `converter` medem +2,4%; os marcados só fecham +3,2% se
// forem contados junto com o Bounty Life. O charm tem de sair dos sem marca.
{
  const obs = [];
  let ts = 1000;
  const push = (observed, marked) => obs.push({
    channel: 'life', observed, damage: 1000, dmgBasis: 1000, mob: 'converter', n: 1,
    isPrey: false, bountyTalisman: marked, bountyDamageNormalized: true,
    exposeWeakness: false, source: 'synthetic', confidence: 'gold', ts: ts++,
  });
  for (let i = 0; i < 3; i++) push(Math.ceil(1000 * 0.524), false);
  for (let i = 0; i < 10; i++) push(Math.ceil(1000 * 0.532 * 1.1725), true);
  const ranked = setupInference.rankGoldChannelCandidates(
    obs,
    { channel: 'life', bases: [0.5], bonuses: [0, 0.016, 0.024, 0.032], mobKey: 'vampiricMob', bonusKey: 'vampiricBonus', votesKey: 'vampiricVotes' },
    { life: ['converter'], mana: [], bonusEstimates: { life: {}, mana: {} } },
    { bountyLifeBonus: 0.1725 },
  );
  assert.equal(ranked.candidateMob, 'converter');
  assert.equal(ranked.candidateBonus, 0.024, 'o charm vem só dos hits sem marca: ' + JSON.stringify(ranked.candidateBonus));
}

// ------------------------------------------------ integração: `drone bounty` S0
{
  const result = engine.classifyUnified(
    read('logs/drone bounty Server Log.txt'),
    read('logs/drone bounty Local Chat.txt'),
    {
      mobModsPre: ctx.MOB_ELEMENT_MODS,
      mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16,
      strictLeech: true,
      maxOriginal: 6000,
      useFloat16Mitigation: true,
    },
  );
  assert.ok(!result.error, result.error);
  assert.equal(result.sessionDateKey, 20260914);
  assert.equal(result.mobModsRegime, 'post-2026-06-16');
  const damage = result.bountyTalismanSetup.damage;
  assert.equal(damage.level, 25, JSON.stringify(damage));
  assert.equal(damage.confidence, 'strong');
  assert.equal(damage.source, 'comparable_charm_damage');
  const life = result.bountyTalismanSetup.life;
  assert.equal(life.confidence, 'unknown', 'Life não é cravável com 3 hits sem marca: ' + JSON.stringify(Object.assign({}, life, { ranked: undefined })));
  assert.equal(life.source, 'bounty_life_vampiric_confound');
  assert.equal(life.confound.mob, 'converter');
  const fallback = damage.fallbackConfirmation;
  if (fallback && fallback.confidence !== 'unknown') {
    assert.equal(fallback.contradictions, 0, 'fallback só confirma com unanimidade');
  }
}

console.log('OK: drone bounty — testemunha de charm, abstenção, fallback e Sept');
