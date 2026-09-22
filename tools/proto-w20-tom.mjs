#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #20). Os turnos a=0 de tom fora do motivo-alvo.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { splitSessions, pairSessions } from './unified-corpus.mjs';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const ENG=['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'];
function newCtx(){const silent={log(){},warn(){},error(){},info(){},debug(){}};
  const c={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
  c.globalThis=c;c.window=c;vm.createContext(c);
  for(const f of ENG)vm.runInContext(read(path.join(ROOT,f)),c,{filename:f});return c;}
const Nf=x=>(x!=null&&x>0.1)?0.9/(x-0.1):null;
const TARGET='single_target_aa_all_action_without_positive_aa_evidence';
const sv=splitSessions(read('logs/tom server log.txt')),lc=splitSessions(read('logs/tom local chat.txt'));
const sess=pairSessions(sv,lc);
let alvo=0,fora=0; const buckets={n1:[],nk:[],outro:[],onehit:[],inutil:[]}; const reasons={};
for(const s of sess){
  const ctx=newCtx(); let u;
  try{u=ctx.UnifiedClassificationEngine.classifyUnified(s.sv.text,s.lc.text,{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});}catch(e){console.log('ERR',e.message);continue}
  if(!u||u.error||!u.turns)continue;
  const setup=u.leechSetup||{};
  const rate=(h,ch)=>ch==='life'?setup.lifeBase+((setup.vampiricMob&&String(h.mob).toLowerCase()===String(setup.vampiricMob).toLowerCase())?(setup.vampiricBonus||0):0):setup.manaBase;
  const r=(h,ch)=>{const d=+h.dmg||0,v=ch==='life'?(+h.lifeLeech||0):(+h.manaLeech||0);return (d>0&&v>0)?v/(d*rate(h,ch)):null;};
  const nhat=h=>{if(h.overkill)return null;const v=[Nf(r(h,'life')),Nf(r(h,'mana'))].filter(x=>x!=null);return v.length?Math.min(...v):null;};
  for(const t of u.turns){
    const comps=t.components||[]; if(!comps.length)continue;
    const arrowN=(comps.find(c=>c.comp==='arrow')||{hits:[]}).hits.length;
    if(arrowN!==0)continue;
    const isTarget=comps.some(c=>c.reason===TARGET);
    if(isTarget){alvo++;continue;}
    fora++;
    const hits=comps.flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
    hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
    const main=hits.filter(h=>!h.charmOnly&&!h.reflect);
    const rs=[...new Set(comps.map(c=>c.reason).filter(Boolean))].join('|')||'(sem razao)';
    reasons[rs]=(reasons[rs]||0)+1;
    const k=main.length; const f=main.length?nhat(main[0]):null;
    const line=`${t.clock||t.ts} k=${k} N=${f==null?'--':f.toFixed(2)} ok=${main[0]&&main[0].overkill?'OK':'-'} [${rs}]`;
    if(k<=1)buckets.onehit.push(line);
    else if(f==null)buckets.inutil.push(line);
    else if(Math.round(f)===1)buckets.n1.push(line);
    else if(Math.abs(f-k)<1)buckets.nk.push(line);
    else buckets.outro.push(line);
  }
}
console.log(`alvo(motivo ${TARGET}) = ${alvo}`);
console.log(`fora do motivo-alvo, a=0 = ${fora}`);
console.log('\nmotivos:'); for(const [k,v] of Object.entries(reasons).sort((a,b)=>b[1]-a[1]))console.log(`  ${String(v).padStart(3)}  ${k}`);
for(const [k,v] of Object.entries(buckets)){console.log(`\n== ${k} (${v.length}) ==`);v.forEach(l=>console.log('  '+l));}
