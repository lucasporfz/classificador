#!/usr/bin/env node
// Trava do classificador durante o beta do ranking: confere que index.html, css/ e js/ (menos o
// módulo novo do ranking) estão idênticos ao estado gravado em tools/classifier-lock.json.
//   node tools/classifier-lock.mjs --write   grava o estado atual como referência
//   node tools/classifier-lock.mjs           confere (exit 1 se algo mudou)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LOCK = path.join(ROOT, 'tools', 'classifier-lock.json');
const EXCLUDE = new Set(['js/ranking-session-summary.js', 'js/ranking-ui.js', 'css/ranking.css']);   // arquivos novos do ranking, fora da trava

function files() {
  const out = ['index.html'];
  for (const dir of ['css', 'js']) {
    const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach(e => {
      const rel = d + '/' + e.name;
      if (e.isDirectory()) walk(rel); else out.push(rel);
    });
    walk(dir);
  }
  return out.filter(f => !EXCLUDE.has(f)).sort();
}
// Normaliza fim de linha: CRLF/LF não conta como mudança.
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')).digest('hex');
const now = Object.fromEntries(files().map(f => [f, hash(f)]));

if (process.argv.includes('--write')) {
  fs.writeFileSync(LOCK, JSON.stringify(now, null, 2) + '\n');
  console.log('trava gravada: ' + Object.keys(now).length + ' arquivos');
  process.exit(0);
}
const ref = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
const diffs = [];
for (const f of new Set([...Object.keys(ref), ...Object.keys(now)])) {
  if (!(f in now)) diffs.push('removido: ' + f); else if (!(f in ref)) diffs.push('novo: ' + f); else if (ref[f] !== now[f]) diffs.push('alterado: ' + f);
}
if (diffs.length) { console.error('CLASSIFICADOR ALTERADO:\n  ' + diffs.join('\n  ')); process.exit(1); }
console.log('classificador intacto (' + Object.keys(ref).length + ' arquivos)');
