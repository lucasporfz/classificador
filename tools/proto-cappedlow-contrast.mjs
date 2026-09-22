#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Criterio de contraste SEM limiar absoluto:
// o 1o hit se separa quando sua razao de leech cai fora da faixa observada do
// sufixo por mais que a propria largura dessa faixa.
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
const lr=h=>setup.lifeBase+((setup.vampiricMob&&String(h.mob).toLowerCase()===String(setup.vampiricMob).toLowerCase())?(setup.vampiricBonus||0):0);
function ratio(h){const d=+h.dmg||0;if(!d||h.overkill)return null;const L=+h.lifeLeech||0,M=+h.manaLeech||0;
  const a=L>0?L/(d*lr(h)):null,b=M>0?M/(d*setup.manaBase):null;
  if(a!=null&&b!=null){if(Math.abs(a-b)>0.02)return null;return (a+b)/2;} // canais discordam => cap real, inutil
  return a!=null?a:b;}
let sep=0,noSep=0,noBase=0;const lines=[];
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  const r1=ratio(main[0]);
  const rs=main.slice(1).map(ratio).filter(x=>x!=null);
  let verd,detail='';
  if(r1==null||rs.length<2){verd='SEM BASE';noBase++;detail=`r1=${r1==null?'-':r1.toFixed(3)} sufixo utilizavel=${rs.length}`;}
  else{
    const lo=Math.min(...rs),hi=Math.max(...rs),w=hi-lo;
    const ok=r1>hi+w;
    if(ok){sep++;verd='SEPARA ';}else{noSep++;verd='FUNDE  ';}
    detail=`r1=${r1.toFixed(3)} sufixo=[${lo.toFixed(3)},${hi.toFixed(3)}] largura=${w.toFixed(3)} corte=${(hi+w).toFixed(3)}`;
  }
  lines.push(`${fmt(t.ts)} k=${String(main.length).padStart(2)} ${verd} ${detail}`);
}
console.log(lines.join('\n'));
console.log(`\nSEPARA=${sep}  FUNDE=${noSep}  SEM BASE=${noBase}   (total 93)`);
