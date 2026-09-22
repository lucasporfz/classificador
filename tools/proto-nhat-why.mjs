#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Motivo dos turnos "CRIARIA AA".
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { splitSessions, pairSessions, filterExcludedSessions } from './unified-corpus.mjs';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const ENG=['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'];
const SRC=ENG.map(f=>({f,code:read(path.join(ROOT,f))}));
function newCtx(){const silent={log(){},warn(){},error(){},info(){},debug(){}};
  const c={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
  c.globalThis=c;c.window=c;vm.createContext(c);for(const s of SRC)vm.runInContext(s.code,c,{filename:s.f});return c;}
const N=x=>(x!=null&&x>0.1)?0.9/(x-0.1):null;
const reasons={},beam={sim:0,nao:0};
for(const p of discoverFixturePairs({logDir:'logs',warn:()=>{}})){
  const sv=splitSessions(read(path.join('logs',p.server))),lc=splitSessions(read(path.join('logs',p.local)));
  for(const s of filterExcludedSessions(p.server,pairSessions(sv,lc).map((x,i)=>({...x,sourceIndex:i})))){
    const ctx=newCtx(); const V=ctx.UnifiedValidation;
    let u; try{u=ctx.UnifiedClassificationEngine.classifyUnified(s.sv.text,s.lc.text,{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});}catch(e){continue}
    if(!u||u.error||!u.turns)continue; const setup=u.leechSetup; if(!setup)continue; const cx={leechSetup:setup};
    const ratio=(h,ch)=>{const v=V.observedLeechAcceptsN(h,setup,1,ch,null,cx);
      if(!v||!v.usable||!v.expectations||!v.expectations.length)return null;
      const es=v.expectations.map(x=>x.expected).filter(Number.isFinite); return es.length?v.observed/Math.max(...es):null;};
    const nhat=h=>{if(h.overkill)return null;const a=[N(ratio(h,'life')),N(ratio(h,'mana'))].filter(x=>x!=null);return a.length?Math.min(...a):null;};
    for(const t of u.turns){
      const comps=t.components||[]; if(!comps.length)continue;
      if((comps.find(c=>c.comp==='arrow')||{hits:[]}).hits.length!==0)continue;
      const hits=comps.flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
      hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
      const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
      const f=nhat(main[0]); if(f==null||Math.round(f)!==1)continue;
      const c0=comps[0]||{}; const rsn=c0.reason||'-';
      reasons[`${p.label} :: ${rsn}`]=(reasons[`${p.label} :: ${rsn}`]||0)+1;
      const lbl=String(c0.actionLabel||'');
      if(/beam|Beam/.test(lbl)||/beam/i.test(rsn))beam.sim++;else beam.nao++;
    }
  }
}
console.log('turnos "CRIARIA AA", por fixture e motivo do motor:');
for(const [k,v] of Object.entries(reasons).sort((a,b)=>b[1]-a[1]))console.log(`  ${String(v).padStart(3)}  ${k}`);
console.log(`\nsao BEAM: ${beam.sim}   nao-beam: ${beam.nao}`);
