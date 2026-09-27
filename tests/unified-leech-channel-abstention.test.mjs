// C-006b: abstencao de canal de leech e explicita, nao taxa zero.
//
// Caso-prova HISTORICO: `aquatic` tem tres sessoes do MESMO personagem (`Stingz`, sorcerer) no
// mesmo dia, contra o mesmo pack de quara. Antes de M-043 entrar na reversao, o conjunto-ouro de
// S0 tinha 4 componentes / 11 observacoes, e 7 dos 9 hits estavam no cap de vida (`lifeLeech = 0`,
// jogador cheio). Sobravam 2 observacoes de vida, explicadas dentro da tolerancia por 15 pontos
// distintos da grade de D-020 — nenhum nivel determinavel (mesma recusa de C-006a (2) / D-021a).
// O resultado correto era ABSTENCAO, marcada: `lifeBaseKnown: false` mais o motivo. O
// `lifeBase: 0` continua desligando o canal a jusante, mas nao pode ser a unica marca do fato.
//
// Desde 26/Set/2026 (change infer-sorcerer-stance-before-resolution, aceito pelo usuario), os Death
// Echo de S0 convertidos para energy fecham entre mobs e viram observacao-ouro: S0 fecha a vida
// em 0,27 com observacoes PROPRIAS. O mecanismo de abstencao continua coberto pelas 11 observacoes
// de S0 de antes da conversao, congeladas em
// tests/fixtures/aquatic-s0-gold-observations-before-stance-conversion.json (dado real, nao
// inventado) e reprocessadas pela inferencia atual.
//
// C-006 continua proibindo herdar a taxa de S1/S2 para S0, mesmo sendo o mesmo personagem
// no mesmo dia: cada sessao e classificada so com o proprio texto, e a taxa de S0 tem de vir de
// observacoes da propria S0.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const context = {
  console: silent, Math, JSON, Array, Object, Number, String, Map, WeakMap, Set,
  isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array,
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
for (const file of [
  'js/stats.js',
  'js/mob-element-mods.js',
  'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-session-context.js', 'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
  'js/unified-turn-resolution.js',
  'js/unified-classification-engine.js',
]) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function splitSessions(text) {
  const sessions = [];
  let current = null;
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(HEADER_RE);
    if (match) {
      if (current) { current.text = current.lines.join('\n'); sessions.push(current); }
      const [, month, day, time, year] = match;
      const [h, mi, s] = time.split(':').map(Number);
      current = { year: +year, month: MONTHS[month], day: +day, saveSec: h * 3600 + mi * 60 + s, lines: [line] };
    } else if (current) current.lines.push(line);
  }
  if (current) { current.text = current.lines.join('\n'); sessions.push(current); }
  return sessions;
}

const serverSessions = splitSessions(fs.readFileSync('logs/aquatic Server Log.txt', 'utf8'));
const localSessions = splitSessions(fs.readFileSync('logs/aquatic Local Chat.txt', 'utf8'));
const pairs = [];
for (const server of serverSessions) {
  const candidates = localSessions.filter(local => local.year === server.year
    && local.month === server.month && local.day === server.day
    && Math.abs(local.saveSec - server.saveSec) <= 3600);
  if (!candidates.length) continue;
  candidates.sort((a, b) => Math.abs(a.saveSec - server.saveSec) - Math.abs(b.saveSec - server.saveSec));
  pairs.push({ server, local: candidates[0] });
}

const options = {
  mobModsPre: context.MOB_ELEMENT_MODS,
  mobModsPost: context.MOB_ELEMENT_MODS_POST_2026_06_16,
  strictLeech: true,
  maxOriginal: 6000,
  useFloat16Mitigation: true,
};

const results = pairs.map(pair => {
  const result = context.UnifiedClassificationEngine.classifyUnified(pair.server.text, pair.local.text, options);
  assert.ok(!result.error, `aquatic deve classificar sem erro: ${result.error || ''}`);
  return result;
});
const setups = results.map(result => result.leechSetup);

test('aquatic tem tres sessoes pareadas', () => {
  assert.equal(pairs.length, 3);
});

test('C-006b: abstencao explicita com as observacoes-ouro de S0 de antes da conversao', () => {
  const observations = JSON.parse(fs.readFileSync('tests/fixtures/aquatic-s0-gold-observations-before-stance-conversion.json', 'utf8'));
  assert.equal(observations.length, 11);
  assert.equal(observations.filter(o => o.channel === 'life').length, 2);
  const setup = context.UnifiedSetupInference.inferLeechSetupFromGoldObservations(
    observations, results[0]._context, { life: [], mana: [] }, results[0].turns);
  assert.equal(setup.lifeBase, 0, 'a taxa continua 0 para desligar o canal a jusante');
  assert.equal(setup.lifeBaseKnown, false, 'e a abstencao precisa estar marcada');
  assert.ok(setup.lifeBaseAbstention, 'a abstencao precisa carregar o motivo');
  assert.equal(setup.lifeBaseAbstention.reason, 'insufficient_gold_observations');
  assert.equal(setup.lifeBaseAbstention.usableObservations, 2);
  assert.equal(setup.lifeBaseAbstention.minUsableObservations, 3);
  assert.ok(setup.lifeBaseAbstention.tiedBases > 1, 'a abstencao existe porque a grade empata');
  assert.equal(setup.manaBaseKnown, true, 'o canal de mana dos mesmos hits fecha');
});

test('M-043: aquatic S0 fecha a vida pela propria sessao desde a conversao', () => {
  const s0 = setups[0];
  assert.equal(s0.lifeBaseKnown, true);
  assert.equal(s0.lifeBase, 0.27);
  assert.equal(s0.lifeBaseAbstention, null);
});

test('C-006b: o canal de mana da mesma sessao fecha normalmente', () => {
  const s0 = setups[0];
  assert.equal(s0.manaBaseKnown, true);
  assert.equal(s0.manaBase, 0.175);
  assert.equal(s0.manaBaseAbstention, null);
});

test('C-006b: canal com evidencia suficiente e marcado como conhecido', () => {
  assert.equal(setups[1].lifeBaseKnown, true);
  assert.equal(setups[1].lifeBase, 0.27);
  assert.equal(setups[1].lifeBaseAbstention, null);
  assert.equal(setups[2].lifeBaseKnown, true);
  assert.equal(setups[2].lifeBase, 0.2725);
  assert.equal(setups[2].lifeBaseAbstention, null);
});

test('C-006: S0 nao herda a taxa de vida das outras sessoes do mesmo arquivo', () => {
  // A taxa de S0 coincide com a de S1 (mesmo personagem), mas tem de vir de observacoes proprias:
  // o voto de vida de S0 precisa de pelo menos o piso de observacoes utilizaveis de C-006b.
  assert.ok(setups[0].lifeVote && setups[0].lifeVote.ok >= 3, `voto de vida de S0: ${JSON.stringify(setups[0].lifeVote && { ok: setups[0].lifeVote.ok })}`);
});
