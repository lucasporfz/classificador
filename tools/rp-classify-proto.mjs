#!/usr/bin/env node
// Oráculo do Classificador: cruza um server log + um local chat e imprime a tabela
// única (Auto ataque · runa · spells por incantação · granada) + a detecção das
// incantações. Carrega os mesmos .js do app num sandbox vm. 1 par de logs por processo.
// Uso: node tools/rp-classify-proto.mjs "logs/<server>.txt" "logs/<localchat>.txt"
//      [--spell "<incant|label>"] [--hits N]   (filtros opcionais imprimem os turnos
//      alinhados que casam, hit a hit)
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd(); const read = p => fs.readFileSync(p, 'utf8');

const ctx = { console, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date };
vm.createContext(ctx);
// mesma ordem de carregamento do index.html (sem histogram/charts/i18n — não usados no CLI)
for (const f of ['js/stats.js', 'js/mob-element-mods.js', 'js/rp-grenade-peak.js',
                 'js/parser-rp-helpers.js', 'js/classifier-parser.js', 'js/classifier.js']) {
  vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
}

const argv = process.argv.slice(2);
const positional = [], flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { flags[argv[i].slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true; }
  else positional.push(argv[i]);
}
const serverLogPath = positional[0] || 'logs/server log rp.txt';
const localChatPath = positional[1] || 'logs/localchat rp.txt';
const wantTrace = flags.spell != null || flags.hits != null;
const res = ctx.classifyWithLocalChat(read(serverLogPath), read(localChatPath), { trace: wantTrace });

console.log('=== ' + serverLogPath.replace(/^logs\//, '') + ' + ' + localChatPath.replace(/^logs\//, '') + ' ===');
if (res.error) { console.log('ERRO: ' + res.error); process.exit(1); }
console.log('jogador: ' + (res.player || '—') + '   | spell: ' + (res.damageSpells.join(', ') || '—') +
  '   | granada: ' + ((res.grenadeSpells || []).join(', ') || '—'));

console.log('\n--- ROTAÇÃO (tabela única) ---');
console.log('  turnos  hits méd  dano base  dano efet  componente/spell');
for (const r of res.rows) {
  console.log('  ' + String(r.turns).padStart(6) + '  ' + r.hitsMean.toFixed(2).padStart(8) +
    '  ' + String(r.dmgBase).padStart(9) + '  ' + String(r.dmgEff).padStart(9) + '  ' + r.label);
  if (r.tiers && r.tiers.length) {
    for (const tier of r.tiers) {
      const tlabel = tier.kind === 'tier_bonus'
        ? 'com bônus' + (r.bonusMult ? ' (×' + r.bonusMult.toFixed(2) + ')' : '')
        : 'sem bônus';
      console.log('  ' + ''.padStart(6) + '  ' + tier.hitsMean.toFixed(2).padStart(8) +
        '  ' + String(tier.dmgBase).padStart(9) + '  ' + String(tier.dmgEff).padStart(9) + '    └ ' + tlabel);
    }
  }
}
console.log('  (' + res.excludedTurns + '/' + res.totalTurns + ' turnos excluídos por não alinhar 100% os 2 logs)');

if (wantTrace) {
  const spellFilter = typeof flags.spell === 'string' ? flags.spell.toLowerCase() : null;
  const hitsFilter = flags.hits != null && flags.hits !== true ? Number(flags.hits) : null;
  const label = tx => (typeof ctx.clsSpellLabel === 'function' ? ctx.clsSpellLabel(tx) : tx) || tx;
  const matchSpell = sp => !spellFilter || (sp && (sp.toLowerCase() === spellFilter || label(sp).toLowerCase() === spellFilter));
  const compCount = tr => tr.spell ? tr.counts.spell : (tr.gren ? tr.counts.grenade : (tr.rune ? tr.counts.rune : tr.counts.arrow));
  const hits = (res.turnTrace || []).filter(tr => matchSpell(tr.spell) && (hitsFilter == null || compCount(tr) === hitsFilter));
  console.log('\n--- TURNOS' +
    (spellFilter ? ' · spell="' + flags.spell + '"' : '') +
    (hitsFilter != null ? ' · hits=' + hitsFilter : '') +
    ' (' + hits.length + ') ---');
  for (const tr of hits) {
    const sp = tr.spell ? (label(tr.spell) + ' [' + tr.spell + ']') : (tr.gren ? 'granada [' + tr.gren + ']' : (tr.rune ? 'runa [' + tr.rune + ']' : 'só AA'));
    console.log('  turno ' + tr.idx + '  ts=' + tr.ts + '  ' + sp +
      '  | comp: arrow=' + tr.counts.arrow + ' spell=' + tr.counts.spell + ' rune=' + tr.counts.rune + ' gren=' + tr.counts.grenade);
    const lns = tr.lines.slice().sort((a, b) => (a.ts - b.ts) || (a.seq - b.seq));
    lns.forEach((l, i) => console.log('      ' + String(i).padStart(2) + '  ts=' + l.ts + '.' + l.seq + '  ' + String(l.mob).padEnd(22) +
      ' dmg=' + String(l.dmg).padStart(5) + '  base=' + String(Math.round(l.base)).padStart(5) + '  ' + (l.comp || '—').padEnd(8) + (l.ok ? ' (overkill)' : '')));
  }
}

console.log('\n--- detecção das incantações (top 8) ---');
console.log('  covered  recall  overcast  total  classe   speaker: incantação');
for (const g of res.ranked.slice(0, 8)) {
  const cls = (g.speaker === res.player && g.kind !== '—') ? ('✔ ' + g.kind) : (g.kind === '—' ? '—' : g.kind);
  console.log('  ' + String(g.covered).padStart(7) + '  ' + (g.recall * 100).toFixed(0).padStart(4) + '%  ' +
    (isFinite(g.overcast) ? g.overcast.toFixed(2) : '  ∞').padStart(7) + '  ' + String(g.total).padStart(5) +
    '  ' + cls.padEnd(9) + '  ' + g.speaker + ': ' + g.text);
}
