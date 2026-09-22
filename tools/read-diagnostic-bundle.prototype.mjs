#!/usr/bin/env node
// PROTÓTIPO DESCARTÁVEL — leitor offline do pacote de diagnóstico (nível 1).
//
// Recebe o .json que o usuário baixou do site e mandou por Discord, roda o motor
// Unified com as MESMAS opções da UI sobre os logs embutidos e diz:
//   - o setup que o motor infere AGORA (aqui, nesta cópia do repo);
//   - o resumo recalculado vs o resumo gravado no pacote (reproduz idêntico ou não);
//   - os turnos sem classificação, com o motivo.
//
// Uso:
//   node tools/read-diagnostic-bundle.prototype.mjs pacote.json
//   node tools/read-diagnostic-bundle.prototype.mjs pacote.json --write-logs out/
//     -> grava out/<nome>-server.txt e out/<nome>-local.txt para você seguir com
//        tools/diag-unified-turn.mjs no turno que o usuário reclamou.
//
// A lógica de formato (resumo, comparação, validação) NÃO está aqui: vem de
// prototypes/export-bundle/diagnostic-bundle.proto.js, o mesmo módulo que a página
// usa pra gerar. Se as duas pontas tivessem cópias diferentes, o "reproduz idêntico"
// não provaria nada.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const read = (p) => fs.readFileSync(p, 'utf8');

const argv = process.argv.slice(2);
const bundlePath = argv.find((a) => !a.startsWith('--'));
const writeIdx = argv.indexOf('--write-logs');
const writeDir = writeIdx >= 0 ? argv[writeIdx + 1] : null;
if (!bundlePath) {
  console.error('Uso: node tools/read-diagnostic-bundle.prototype.mjs pacote.json [--write-logs DIR]');
  process.exit(1);
}

// mesma sandbox de tools/diag-unified-turn.mjs
const silent = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
const ctx = {
  console: silent, Math, JSON, Array, Object, Number, String, Map, Set,
  isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array, TextEncoder,
};
ctx.globalThis = ctx; ctx.window = ctx;
vm.createContext(ctx);
for (const f of [
  'js/stats.js', 'js/mob-element-mods.js', 'js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js',
  'js/unified-session-context.js', 'js/unified-formulas.js', 'js/unified-parsing.js', 'js/unified-setup-inference.js',
  'js/unified-validation.js', 'js/unified-turn-resolution.js', 'js/unified-classification-engine.js',
  'prototypes/export-bundle/diagnostic-bundle.proto.js',
]) vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });

const DB = ctx.DiagnosticBundleProto;

let bundle;
try { bundle = JSON.parse(read(bundlePath)); }
catch (err) { console.error('json inválido:', err.message); process.exit(1); }

const problems = DB.validateBundle(bundle);
console.log('=== pacote ===');
console.log(`arquivo      : ${bundlePath}`);
console.log(`gerado em    : ${bundle.createdAt || '?'}`);
console.log(`sessão       : ${(bundle.session && bundle.session.label) || '?'}`);
console.log(`motor (lá)   : ${(bundle.engine && bundle.engine.version) || '?'}`);
console.log(`anonimizado  : ${bundle.anonymized ? 'sim (' + (bundle.anonymizedAliases || []).join(', ') + ')' : 'não'}`);
console.log(`tamanho      : ${(fs.statSync(bundlePath).size / 1024).toFixed(1)} KB`);
if (bundle.client) console.log(`cliente      : ${bundle.client.userAgent || '?'}`);
if (bundle.note) console.log(`\nreclamação do usuário:\n  ${String(bundle.note).split('\n').join('\n  ')}`);
if (problems.length) console.log(`\n! avisos de formato: ${problems.join(' | ')}`);

if (!bundle.logs || !bundle.logs.server || !bundle.logs.local) {
  console.error('\npacote sem os dois logs — não dá pra reproduzir.');
  process.exit(2);
}

const unified = ctx.UnifiedClassificationEngine.classifyUnified(bundle.logs.server, bundle.logs.local, {
  mobModsPre: ctx.MOB_ELEMENT_MODS || null,
  mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
  ...DB.UI_ENGINE_OPTIONS,
});

console.log(`\nmotor (aqui) : ${unified.version || '?'}` +
  (bundle.engine && bundle.engine.version && bundle.engine.version !== unified.version ? '   << VERSÃO DIFERENTE' : ''));

if (unified.error) {
  console.log(`\n=== motor falhou: ${unified.error} ===`);
  console.log('(isso pode ser exatamente o bug — o pacote continua sendo a evidência)');
}

const setup = DB.extractSetup(unified);
console.log('\n=== setup inferido agora ===');
for (const [k, v] of Object.entries({
  vocação: setup.vocation, personagem: setup.selectedSpeaker + ' (' + setup.selectedSpeakerMethod + ')',
  'tabela de mobs': setup.mobModsRegime, 'elemento do AA': setup.aaElement,
  'BM pierce': setup.bmPierce + ' (' + (setup.bmPierceDetection && setup.bmPierceDetection.source) + ')',
  leech: setup.leechSetup ? `life ${setup.leechSetup.lifeBase} / mana ${setup.leechSetup.manaBase} (${setup.leechSetup.source}, ${setup.leechSetup.confidence})` : null,
  'utevo grav san': setup.gravSanSetup ? `bonus ${setup.gravSanSetup.bonus} (${setup.gravSanSetup.source})` : null,
  'bônus de classe': setup.bestiaryClassDamageBonus ? `${setup.bestiaryClassDamageBonus.bonus} ${setup.bestiaryClassDamageBonus.class || ''}`.trim() : null,
})) if (v != null && v !== 'undefined') console.log(`  ${k.padEnd(16)}: ${v}`);

const recomputed = DB.summarizeUnified(unified);
const cmp = DB.compareSummaries(bundle.summary, recomputed);

console.log('\n=== resumo recalculado ===');
console.log(`  turnos            : ${recomputed.totalTurns}`);
console.log(`  hits              : ${recomputed.totalHits}`);
console.log(`  sem classificação : ${recomputed.unresolvedCount}`);
console.log(`  partial edge      : ${recomputed.partialEdge} (${recomputed.edgeUnresolved} deles unresolved de borda, não contam)`);
console.log(`  componentes       : ${Object.entries(recomputed.components || {}).map(([k, v]) => `${k} ${v}`).join(', ')}`);

console.log(`\n=== reproduz o que ele viu? ${cmp.same ? 'SIM' : 'NÃO'} ===`);
if (!cmp.same) {
  for (const d of cmp.diffs) console.log(`  ${d.field}: no pacote=${JSON.stringify(d.recorded)}  aqui=${JSON.stringify(d.recomputed)}`);
  console.log('  (esperado se o motor mudou desde que ele exportou — compare com a versão acima)');
}

if (recomputed.unresolved && recomputed.unresolved.length) {
  console.log('\n=== turnos sem classificação ===');
  for (const u of recomputed.unresolved.slice(0, 40)) console.log(`  ${u.clock}  hits=${String(u.hits).padStart(3)}  ${u.reason || '-'}`);
  if (recomputed.unresolved.length > 40) console.log(`  ... e mais ${recomputed.unresolved.length - 40}`);
}

if (writeDir) {
  fs.mkdirSync(writeDir, { recursive: true });
  const base = path.basename(bundlePath).replace(/\.json$/i, '');
  const sv = path.join(writeDir, base + '-server.txt');
  const lc = path.join(writeDir, base + '-local.txt');
  fs.writeFileSync(sv, bundle.logs.server);
  fs.writeFileSync(lc, bundle.logs.local);
  console.log(`\nlogs gravados:\n  ${sv}\n  ${lc}`);
  console.log(`próximo passo:\n  node tools/diag-unified-turn.mjs "${sv}" "${lc}" HH:MM:SS`);
}
