// Protótipo: inferir BM pierce SÓ pelo dano de charm (fato de parsing), sem nenhuma
// classificação. Ideia do usuário: charm é fixo por mob (hitpoints*0.05*mit*mod), e o BM
// só mexe em holy/physical (pierceForElement) -> wound/overpower (físico) e divine wrath
// (holy) são testemunhas diretas do perk. Charms de OUTROS elementos são imunes ao BM e
// servem pra isolar o bônus de classe de bestiário (M-036) antes do teste.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const REPO = 'C:\\Users\\Lucas\\Desktop\\classificador - claude';
const read = p => fs.readFileSync(p, 'utf8');
const silent = { log(){}, warn(){}, error(){}, info(){}, debug(){} };
const ctx = { console: silent, Math, JSON, Array, Object, Number, String, Map, Set, isFinite, isNaN, parseInt, parseFloat, Date, Float32Array, Int32Array };
ctx.globalThis = ctx; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js','js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'])
  vm.runInContext(read(path.join(REPO, f)), ctx, { filename: f });

const E = ctx.UnifiedClassificationEngine, F = ctx.UnifiedFormulas;
const { getMobMods, effectiveMod, mitigationMultiplier, ELEMENT_KEYS, normalizeName } = F;
// Só wound (físico) e divine wrath (holy) testemunham o BM. `overpower` NÃO é físico
// (correção do usuário) e fica fora, apesar de o CHARM_ELEMENT_MAP do motor mapeá-lo
// como 'physical'. Os demais elementos entram só para medir o bônus de classe (M-036),
// já que são imunes ao BM.
const CHARM_ELEMENT = { freeze:'ice', enflame:'fire', curse:'death', poison:'earth', zap:'energy', divine_wrath:'holy', wound:'physical' };
function charmSig(raw) {
  const r = String(raw||'').toLowerCase();
  for (const k of ['wound','poison','enflame','freeze','zap','divine wrath','curse'])
    if (r.includes(k + ' charm')) return k.replace(' ','_');
  return null;
}
const median = a => { const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
const inWindow = (ts, wins) => (wins||[]).some(w => ts >= w.start && ts <= w.end);

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

const PAIRS = [
  ['Server Log bakra.txt','Local Chat bakra.txt'],['Mrowdy Server Log.txt','Mrowdy Local Chat.txt'],
  ['Mrowdy Server Log 2.txt','Mrowdy Local Chat 2.txt'],['bastion server log ek.txt','bastion local chat ek.txt'],
  ['darklight e vemiath server log.txt','darklight e vemiath Local Chat.txt'],['darklight server log rp.txt','darklight local chat rp.txt'],
  ['essence server log.txt','essence local chat.txt'],['mazzerinbarrage server log.txt','mazzerinbarrage local chat.txt'],
  ['barrage Server Log.txt','barrage local chat.txt'],['gloompillar Server Log.txt','gloompillar Local Chat.txt'],
  ['highwin Server Log.txt','highwin Local Chat.txt'],['jaded Server Log.txt','jaded Local Chat.txt'],
  ['server log rp.txt','localchat rp.txt'],['monk server log.txt','monk localchat.txt'],
  ['murcion server log rp.txt','murcion local chat rp.txt'],['night harpy server log ek.txt','night harpy local chat ek.txt'],
  ['uhax 2 server log ed.txt','uhax 2 local chat ed.txt'],['uhax server log ed.txt','uhax local chat ed.txt'],
  ['RPBOSS Server Log.txt','RPBOSS Local Chat.txt'],['ingol ed Server Log.txt','ingol ed Local Chat.txt'],
];
const OPTS = { mobModsPre: ctx.MOB_ELEMENT_MODS||null, mobModsPost: ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null };
const BM = 0.04;

for (const [svN, lcN] of PAIRS) {
  const svP = path.join(REPO,'logs',svN), lcP = path.join(REPO,'logs',lcN);
  if (!fs.existsSync(svP) || !fs.existsSync(lcP)) continue;
  const svS = splitSessions(read(svP)), lcS = splitSessions(read(lcP));
  const sessions = (svS.length===1 && lcS.length===1) ? [{sv:svS[0],lc:lcS[0]}] : buildPairs(svS,lcS);
  sessions.forEach((pair, si) => {
    let server, local, context;
    try {
      server = E.parseServerFacts(pair.sv.text);
      local = E.parseLocalChat(pair.lc.text, Object.assign({}, OPTS, { serverFacts: server }));
      if (!server.hits || server.hits.length < 4) return;
      context = E.buildContext(server, local, OPTS);
    } catch (e) { return; }
    const wins = (context.gravSanSetup && context.gravSanSetup.windows) || [];

    // linhas de charm: mob | elemento | EW, exigindo repetição (>=3), fora de grav san
    const byKey = new Map();
    for (const ev of (server.events||[])) {
      if (!ev || ev.kind !== 'charm' || !(ev.dmg > 0) || ev.isPrey) continue;
      if (inWindow(ev.ts, wins)) continue;
      const el = CHARM_ELEMENT[charmSig(ev.rawLine)];
      if (!el) continue;
      const mob = normalizeName(ev.mob); if (!mob) continue;
      const ew = /expose weakness/i.test(ev.rawLine||'');
      const k = mob+'|'+el+'|'+(ew?1:0);
      if (!byKey.has(k)) byKey.set(k,{mob,el,ew,vals:[]});
      byKey.get(k).vals.push(ev.dmg);
    }
    const rows = [];
    for (const r of byKey.values()) {
      if (r.vals.length < 3) continue;
      const mods = getMobMods(r.mob, context);
      if (!mods || !(mods.hitpoints > 0)) continue;
      const key = ELEMENT_KEYS[r.el];
      if (!key || !(mods[key] > 0)) continue;
      const mit = mitigationMultiplier(mods, context);
      const basePierce = r.ew ? 0.08 : 0;
      const expNoBm = mods.hitpoints * 0.05 * mit * effectiveMod(+mods[key], basePierce);
      const expBm   = mods.hitpoints * 0.05 * mit * effectiveMod(+mods[key], basePierce + BM);
      rows.push({ ...r, cls: normalizeName(mods.bestiaryClass||''), n:r.vals.length, obs: median(r.vals), expNoBm, expBm,
                  bmSensitive: (r.el==='holy'||r.el==='physical') });
    }
    if (!rows.length) return;

    // Passo 1: elementos IMUNES ao BM isolam o bônus de classe de bestiário (M-036).
    const clsBonus = new Map();
    for (const r of rows.filter(x => !x.bmSensitive)) {
      const ratio = r.obs / r.expNoBm;
      const arr = clsBonus.get(r.cls) || []; arr.push(ratio); clsBonus.set(r.cls, arr);
    }
    const clsMult = c => { const a = clsBonus.get(c); if (!a || !a.length) return null; return median(a); };

    // Passo 2: testar BM só nas linhas holy/physical, corrigidas pelo bônus de classe.
    const sens = rows.filter(x => x.bmSensitive);
    let votesNo = 0, votesBm = 0, undecided = 0; const detail = [];
    for (const r of sens) {
      const m = clsMult(r.cls);
      const corr = m == null ? 1 : m;               // sem testemunha imune: assume 1
      const eNo = r.expNoBm * corr, eBm = r.expBm * corr;
      const tol = v => Math.max(2, v * 0.0125);
      const okNo = Math.abs(r.obs - eNo) <= tol(eNo);
      const okBm = Math.abs(r.obs - eBm) <= tol(eBm);
      if (okNo && !okBm) votesNo++; else if (okBm && !okNo) votesBm++; else undecided++;
      detail.push(`${r.mob}/${r.el}${r.ew?'+EW':''} n=${r.n} obs=${r.obs.toFixed(0)} noBM=${eNo.toFixed(1)}${okNo?'*':''} BM=${eBm.toFixed(1)}${okBm?'*':''}${m==null?'':' clsx'+m.toFixed(3)}`);
    }
    const verdict = votesBm > 0 && votesNo === 0 ? 'BM=0.04' : votesNo > 0 && votesBm === 0 ? 'BM=0' : (votesBm||votesNo) ? 'CONFLITO' : 'sem sinal';
    process.stdout.write(`\n${svN} S${si} [${server.sessionDateKey}] -> ${verdict} (bm:${votesBm} nobm:${votesNo} indef:${undecided}) imunes:${rows.length-sens.length}\n`);
    for (const d of detail.slice(0, 6)) process.stdout.write(`    ${d}\n`);
  });
}
