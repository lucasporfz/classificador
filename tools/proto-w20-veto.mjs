#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #20). Alcance do veto h005 no corpus:
// quantos turnos ele funde APESAR de fronteira de crit-state, e com 1o hit overkill.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { splitSessions, pairSessions, filterExcludedSessions } from './unified-corpus.mjs';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const ENG=['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'];
function newCtx(){const silent={log(){},warn(){},error(){},info(){},debug(){}};
  const c={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
  c.globalThis=c;c.window=c;vm.createContext(c);
  for(const f of ENG)vm.runInContext(read(path.join(ROOT,f)),c,{filename:f});return c;}
const VETO='h005_merged_leech_exact_blocks_aa_split';
let total=0,critB=0,critBok=0,critBclean=0; const lines=[];
for(const p of discoverFixturePairs({logDir:'logs',warn:()=>{}})){
  const sv=splitSessions(read(path.join('logs',p.server))),lc=splitSessions(read(path.join('logs',p.local)));
  let sess=pairSessions(sv,lc).map((x,i)=>({...x,sourceIndex:i}));
  sess=filterExcludedSessions(p.server,sess);
  for(const s of sess){
    const ctx=newCtx(); let u;
    try{u=ctx.UnifiedClassificationEngine.classifyUnified(s.sv.text,s.lc.text,{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});}catch(e){continue}
    if(!u||u.error||!u.turns)continue;
    const V=ctx.UnifiedValidation;
    for(const t of u.turns){
      const comps=t.components||[]; if(!comps.some(c=>c.reason===VETO))continue;
      total++;
      const hits=comps.flatMap(c=>(c.hits||[])).sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
      const cb=V.firstHitCritStateBoundary(hits);
      const sm=(()=>{try{return !!V.firstHitSeparationFixesSameMobExactness(hits,null,null)}catch(e){return 'erro'}})();
      const ts2=(()=>{try{return !!V.hasStrongTimestampAaSpellBoundary(hits)}catch(e){return 'erro'}})();
      const ok=!!hits[0].overkill;
      if(cb){critB++; if(ok)critBok++; else critBclean++;}
      lines.push(`${p.label.padEnd(20)} ${t.clock||t.ts} k=${hits.length} 1oOK=${ok?'sim':'nao'} critState=${cb} sameMob=${sm} timestamp=${ts2}`);
    }
  }
}
console.log(`turnos com veto h005 no corpus: ${total}`);
console.log(`  dos quais com fronteira de crit-state: ${critB}  (1o hit overkill: ${critBok}, sem overkill: ${critBclean})`);
lines.forEach(l=>console.log('  '+l));
