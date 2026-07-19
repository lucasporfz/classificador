// Comparativo (task 2 do change infer-bm-pierce-from-charm-damage): para cada sessão de
// cada fixture, imprime o veredito de BM por testemunha de charm (sem classificar) e o
// `bmPierce` que o motor infere hoje (via classificação completa). Divergência é
// bloqueante — o atalho não pode ser ligado enquanto houver uma.
//
// Uso: node tools/bm-charm-vs-current.mjs > reports/bm-charm-vs-current.txt
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import process from 'node:process';
const ROOT = process.cwd();
const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
function freshCtx() {
  const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js','js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'])
    vm.runInContext(read(path.join(ROOT, f)), ctx, { filename: f });
  return ctx;
}
const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d+:\d+:\d+) (\d{4})/;
const MONTHS = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11,Sept:8 };
function splitSessions(text){ const s=[]; let c=null;
  for (const line of text.replace(/^﻿/,'').split(/\r?\n/)) { const m=line.match(HEADER_RE);
    if (m){ if(c){c.text=c.lines.join('\n');s.push(c);} const [,mo,d,t,y]=m; const [h,mi,se]=t.split(':').map(Number);
      c={header:line.trim(),year:+y,month:MONTHS[mo]??-1,day:+d,saveSec:h*3600+mi*60+se,lines:[line]}; }
    else { if(!c) c={header:'',year:0,month:0,day:0,saveSec:0,lines:[]}; c.lines.push(line);} }
  if(c){c.text=c.lines.join('\n');s.push(c);} return s; }
function buildPairs(svS,lcS){ const p=[]; for(const sv of svS){ if(!sv.header) continue;
  const c=lcS.filter(lc=>lc.header&&lc.year===sv.year&&lc.month===sv.month&&lc.day===sv.day&&Math.abs(lc.saveSec-sv.saveSec)<=3600);
  if(!c.length) continue; c.sort((a,b)=>Math.abs(a.saveSec-sv.saveSec)-Math.abs(b.saveSec-sv.saveSec)); p.push({sv,lc:c[0]});} return p; }

// PAIRS do dump-unified.mjs + os fixtures que ele NÃO cobre (ponto cego documentado).
const PAIRS = [
  ['Server Log bakra.txt','Local Chat bakra.txt'],
  ['Mrowdy Server Log.txt','Mrowdy Local Chat.txt'],
  ['Mrowdy Server Log 2.txt','Mrowdy Local Chat 2.txt'],
  ['bastion server log ek.txt','bastion local chat ek.txt'],
  ['darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt'],
  ['darklight server log rp.txt','darklight local chat rp.txt'],
  ['essence server log.txt','essence local chat.txt'],
  ['mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt'],
  ['barrage Server Log.txt','barrage local chat.txt'],
  ['gloompillar Server Log.txt','gloompillar Local Chat.txt'],
  ['highwin Server Log.txt','highwin Local Chat.txt'],
  ['jaded Server Log.txt','jaded Local Chat.txt'],
  ['server log rp.txt','localchat rp.txt'],
  ['monk server log.txt','monk localchat.txt'],
  ['murcion server log rp.txt','murcion local chat rp.txt'],
  ['night harpy server log ek.txt','night harpy local chat ek.txt'],
  ['uhax 2 server log ed.txt','uhax 2 local chat ed.txt'],
  ['uhax server log ed.txt','uhax local chat ed.txt'],
  ['RPBOSS Server Log.txt','RPBOSS Local Chat.txt'],
  ['ingol ed Server Log.txt','ingol ed Local Chat.txt'],
  // fora do PAIRS do dump-unified.mjs:
  ['kim server log.txt','kim local chat.txt'],
  ['serverlog6.txt','localchat6.txt'],
  ['serverlog7.txt','localchat7.txt'],
  ['serverlog8.txt','localchat8.txt'],
  ['serverlog9.txt','localchat9.txt'],
  ['mk server log.txt','mk localchat.txt'],
  ['monk 2 server log.txt','monk 2 local chat.txt'],
  ['uhax 3 server log ed.txt','uhax 3 local chat ed.txt'],
  ['death echo server log.txt','death echo local chat.txt'],
  ['bakradrone server log.txt','bakradrone local chat.txt'],
  ['highwin 2 Server Log.txt','highwin 2 Local Chat.txt'],
];

const out = [];
let nCharmVerdict = 0, nFallback = 0, nDivergent = 0, nSessions = 0;
const fallbackReasons = new Map();
for (const [svN, lcN] of PAIRS) {
  const svP = 'logs/'+svN, lcP = 'logs/'+lcN;
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) { out.push(`PAIR=${svN} MISSING`); continue; }
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  const sessions = (svS.length===1 && lcS.length===1) ? [{ sv: svS[0], lc: lcS[0] }] : buildPairs(svS, lcS);
  sessions.forEach((pair, si) => {
    const ctx = freshCtx();
    let charm = null, current = null, err = null;
    try {
      const server = ctx.UnifiedClassificationEngine.parseServerFacts(pair.sv.text);
      if (!server.hits || server.hits.length < 4) return;
      const local = ctx.UnifiedClassificationEngine.parseLocalChat(pair.lc.text, { serverFacts: server, mobModsPre: ctx.MOB_ELEMENT_MODS||null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null });
      const c = ctx.UnifiedClassificationEngine.buildContext(server, local, { mobModsPre: ctx.MOB_ELEMENT_MODS||null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null });
      charm = ctx.UnifiedClassificationEngine.inferBmPierceFromCharmDamage(server, c);
      const res = ctx.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, { mobModsPre: ctx.MOB_ELEMENT_MODS||null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null });
      current = res && res.error ? null : (+res.bmPierce || 0);
      var dateKey = res && res.sessionDateKey;
    } catch (e) { err = e.message; }
    if (err) { out.push(`${svN} S${si} THROW ${err}`); return; }
    nSessions++;
    const cv = charm ? charm.pierce : null;
    const agree = cv === null ? '-' : (cv === current ? 'OK' : 'DIVERGE');
    if (cv === null) { nFallback++; const k = (charm && charm.source) || 'unknown'; fallbackReasons.set(k, (fallbackReasons.get(k)||0)+1); }
    else { nCharmVerdict++; if (cv !== current) nDivergent++; }
    out.push(`${svN} S${si} [${dateKey}] charm=${cv === null ? 'sem-veredito' : cv} (${charm && charm.source}) atual=${current} ${agree}`);
    for (const r of (charm && charm.rows || [])) {
      if (!r.bmSensitive) continue;
      out.push(`      ${r.mob}/${r.charm}${r.ew?'+EW':''} n=${r.n} obs=${Math.round(r.observed)} noBM=${r.expectedNoBmCorrected!=null?r.expectedNoBmCorrected.toFixed(1):'-'} BM=${r.expectedBmCorrected!=null?r.expectedBmCorrected.toFixed(1):'-'} voto=${r.vote===null?'-':r.vote} (${r.reason})`);
    }
  });
}
out.push('');
out.push(`=== RESUMO ===`);
out.push(`sessões analisadas: ${nSessions}`);
out.push(`com veredito por charm: ${nCharmVerdict}`);
out.push(`sem veredito (fallback): ${nFallback}`);
for (const [k,v] of [...fallbackReasons].sort((a,b)=>b[1]-a[1])) out.push(`   ${k}: ${v}`);
out.push(`DIVERGÊNCIAS (bloqueante se > 0): ${nDivergent}`);
process.stdout.write(out.join('\n') + '\n');
