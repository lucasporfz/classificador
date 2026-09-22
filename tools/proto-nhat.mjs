#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Inversao: N = 0.9/(razao-0.1).
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const silent={log(){},warn(){},error(){},info(){},debug(){}};
const ctx={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'])vm.runInContext(read(path.join(ROOT,f)),ctx,{filename:f});
const [svP,lcP]=process.argv.slice(2);
const fmt=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const u=ctx.UnifiedClassificationEngine.classifyUnified(read(svP),read(lcP),{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});
const setup=u.leechSetup;
const T='single_target_aa_all_action_without_positive_aa_evidence';
const rate=(h,ch)=>ch==='life'?setup.lifeBase+((setup.vampiricMob&&String(h.mob).toLowerCase()===String(setup.vampiricMob).toLowerCase())?(setup.vampiricBonus||0):0):setup.manaBase;
const r=(h,ch)=>{const d=+h.dmg||0,v=ch==='life'?(+h.lifeLeech||0):(+h.manaLeech||0);return (d>0&&v>0)?v/(d*rate(h,ch)):null;};
const N=x=>(x!=null&&x>0.1)?0.9/(x-0.1):null;
// cap so pode DIMINUIR o leech observado, logo so pode AUMENTAR o N estimado.
// O menor N entre os canais e a estimativa menos truncada.
function nhat(h){if(h.overkill)return null;const v=[N(r(h,'life')),N(r(h,'mana'))].filter(x=>x!=null);return v.length?Math.min(...v):null;}
const lines=[];let n1=0,nk=0,other=0,skip=0;const errs=[];
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  const k=main.length,f=nhat(main[0]);
  const sufAll=main.slice(1).map(nhat).filter(x=>x!=null);
  const suf=sufAll.length?sufAll.reduce((a,b)=>a+b,0)/sufAll.length:null;
  let v;
  if(f==null){v='1o inutil';skip++;}
  else if(Math.round(f)===1){v='1o -> N=1';n1++; if(suf!=null)errs.push(suf-(k-1));}
  else if(Math.round(f)===k||Math.abs(f-k)<1){v=`1o -> N=${Math.round(f)} = k`;nk++;}
  else {v=`1o -> N=${f.toFixed(1)}`;other++;}
  lines.push(`${fmt(t.ts)} k=${String(k).padStart(2)}  N(1o)=${f!=null?f.toFixed(2).padStart(6):'   -  '}  N(sufixo medio)=${suf!=null?suf.toFixed(2).padStart(6):'   -  '} (esperado ${k-1})  | ${v}`);
}
console.log(lines.join('\n'));
console.log(`\n1o hit da N=1 (arredondado): ${n1}    da N=k: ${nk}    da outro N: ${other}    inutilizavel: ${skip}`);
const q=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(p*(s.length-1))];};
if(errs.length)console.log(`erro do sufixo (N estimado - (k-1)) nos casos N=1:  min=${q(errs,0).toFixed(2)} p25=${q(errs,.25).toFixed(2)} mediana=${q(errs,.5).toFixed(2)} p75=${q(errs,.75).toFixed(2)} max=${q(errs,1).toFixed(2)}`);
