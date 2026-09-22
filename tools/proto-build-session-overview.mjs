#!/usr/bin/env node
// PROTOTYPE — throwaway. Roda o extrator em N pares de fixture e injeta o JSON no
// template, gerando prototypes/session-overview.prototype.html (abrir com 2 cliques).
// Uso: node tools/proto-build-session-overview.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const FIXTURES = [
  ['logs/moonsilver Server Log.txt', 'logs/moonsilver Local Chat.txt', '0'],
  ['logs/tom server log.txt', 'logs/tom local chat.txt', '0'],
  ['logs/uhax 2 server log ed.txt', 'logs/uhax 2 local chat ed.txt', '0'],
  ['logs/bastion server log ek.txt', 'logs/bastion local chat ek.txt', '0'],
];

const data = FIXTURES.map(([sv, lc, s]) => {
  const out = execFileSync(process.execPath, ['tools/proto-session-overview.mjs', sv, lc, '--session', s], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(out);
});

const tpl = fs.readFileSync('prototypes/_session-overview.template.html', 'utf8');
const json = JSON.stringify(data).replace(/</g, '\\u003c');
fs.writeFileSync('prototypes/session-overview.prototype.html', tpl.replace('__DATA__', json), 'utf8');
console.log('ok: prototypes/session-overview.prototype.html (' + data.length + ' sessoes)');
