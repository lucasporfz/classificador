// PROTOTYPE — throwaway. Testa a hipotese "o charm e logado imediatamente ANTES do
// hit que o disparou": quao estrita e a adjacencia na ordem crua do log?
import fs from 'node:fs'; import path from 'node:path';
const LINE = /^(\d\d):(\d\d):(\d\d) (.*)$/;
const ATTACK = /^(?:A|An|The )?\s*(.+?) loses (\d+) hitpoints due to your (attack|critical attack)\.?\s*(\(.*\))?/i;
for (const p of process.argv.slice(2)) {
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const evs = [];
  for (const raw of lines) {
    const m = LINE.exec(raw.trim()); if (!m) continue;
    const a = ATTACK.exec(m[4]); if (!a) continue;
    const suffix = a[4] || '';
    const charm = /charm/i.test(suffix) && !/low blow|savage blow/i.test(suffix);
    evs.push({ ts: m[1]+':'+m[2]+':'+m[3], mob: a[1].toLowerCase().trim(), dmg: +a[2], charm });
  }
  let total = 0, strictNext = 0, nextSameSecOtherMob = 0, none = 0, doubleCharm = 0;
  const seenPair = new Map();
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i]; if (!e.charm) continue;
    total++;
    const k = e.ts + '|' + e.mob;
    seenPair.set(k, (seenPair.get(k) || 0) + 1);
    if (seenPair.get(k) > 1) doubleCharm++;
    const nx = evs[i+1];
    if (!nx || nx.ts !== e.ts) { none++; continue; }
    if (nx.mob === e.mob && !nx.charm) strictNext++;
    else nextSameSecOtherMob++;
  }
  console.log(path.basename(p));
  console.log('  procs de charm:', total);
  console.log('  PROXIMO hit de dano e o mesmo mob, mesmo segundo:', strictNext, '(' + (100*strictNext/total).toFixed(1) + '%)');
  console.log('  proximo hit e outro mob (ou outro charm) no mesmo segundo:', nextSameSecOtherMob);
  console.log('  nenhum hit depois no mesmo segundo:', none);
  console.log('  2+ procs no mesmo mob+segundo:', doubleCharm);
}
