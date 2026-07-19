#!/usr/bin/env node
// dump-experimental.mjs — despeja contagens por turno (engine EXPERIMENTAL) de
// todas as fixtures. Artefato estavel p/ diff antes/depois de mudanca no engine
// experimental (espelha dump-all.mjs, que cobre so a producao).
import path from 'node:path';
import { modelForPair } from './unified-experimental.mjs';

const FIXTURES = [
  ['bastion', 'bastion server log ek.txt', 'bastion local chat ek.txt'],
  ['night-harpy', 'night harpy server log ek.txt', 'night harpy local chat ek.txt'],
  ['darklight-rp', 'darklight server log rp.txt', 'darklight local chat rp.txt'],
  ['vemiath', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt'],
  ['bakra', 'Server Log bakra.txt', 'Local Chat bakra.txt'],
  ['bakradrone', 'bakradrone server log.txt', 'bakradrone local chat.txt'],
  ['drome', 'Server Log drome.txt', 'Local Chat drome.txt'],
  ['essence', 'essence server log.txt', 'essence local chat.txt'],
  ['highwin', 'highwin Server Log.txt', 'highwin Local Chat.txt'],
  ['highwin2', 'highwin 2 Server Log.txt', 'highwin 2 Local Chat.txt'],
  ['jaded', 'jaded Server Log.txt', 'jaded Local Chat.txt'],
  ['mk', 'mk server log.txt', 'mk localchat.txt'],
  ['monk', 'monk server log.txt', 'monk localchat.txt'],
  ['monk2', 'monk 2 server log.txt', 'monk 2 local chat.txt'],
  ['ms-boss', 'ms boss server log.txt', 'ms boss local chat.txt'],
  ['murcion', 'murcion server log rp.txt', 'murcion local chat rp.txt'],
  ['rp-pack', 'server log rp.txt', 'localchat rp.txt'],
  ['uhax', 'uhax server log ed.txt', 'uhax local chat ed.txt'],
  ['uhax2', 'uhax 2 server log ed.txt', 'uhax 2 local chat ed.txt'],
  ['hakka', 'Hakka Server Log.txt', 'Hakka Local Chat.txt'],
  ['barrage', 'barrage Server Log.txt', 'barrage local chat.txt'],
];

const out = [];
for (const [id, sv, lc] of FIXTURES) {
  let rows;
  try { rows = modelForPair(`logs/${sv}`, `logs/${lc}`); }
  catch (e) { out.push(`${id} THROW ${e.message}`); continue; }
  for (const row of rows) {
    const c = { arrow: 0, spell: 0, rune: 0, grenade: 0, unresolved: 0 };
    for (const l of row.resolved.lines) {
      const comp = l.comp || 'arrow';
      if (String(comp).startsWith('unresolved_component_')) c.unresolved++;
      else if (c[comp] != null) c[comp]++;
    }
    out.push(`${id} ${row.pairLabel} ts=${row.ev.ts} a=${c.arrow} s=${c.spell} r=${c.rune} g=${c.grenade} u=${c.unresolved}`);
  }
}
process.stdout.write(out.join('\n') + '\n');
