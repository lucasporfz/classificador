#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Contraste POR CANAL, overkill como cota superior.
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
let sep=0,fund=0,none=0;const det=[];
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  const f=main[0]; const per=[]; let verdict='SEM BASE';
  for(const ch of ['life','mana']){
    // 1o golpe: overkill infla a razao (leech sobre dano real, dano exibido truncado) => inutil
    if(f.overkill){per.push(`${ch}: 1o overkill`);continue;}
    const r1=r(f,ch); if(r1==null){per.push(`${ch}: 1o sem leech`);continue;}
    // sufixo: overkill vira COTA SUPERIOR (razao observada >= razao real) => conservador
    const rs=main.slice(1).filter(h=>!h.overkill).map(h=>r(h,ch)).filter(x=>x!=null);
    if(rs.length<2){per.push(`${ch}: sufixo ${rs.length}`);continue;}
    const lo=Math.min(...rs),hi=Math.max(...rs),w=hi-lo;
    per.push(`${ch}: r1=${r1.toFixed(3)} sufixo=[${lo.toFixed(3)},${hi.toFixed(3)}] corte=${(hi+w).toFixed(3)} ${r1>hi+w?'SEPARA':'nao'}`);
    if(r1>hi+w)verdict='SEPARA'; else if(verdict!=='SEPARA')verdict='FUNDE';
  }
  if(verdict==='SEPARA')sep++;else if(verdict==='FUNDE')fund++;else none++;
  det.push(`${fmt(t.ts)} k=${String(main.length).padStart(2)} ${verdict.padEnd(8)} | ${per.join('  |  ')}`);
}
console.log(det.join('\n'));
console.log(`\nSEPARA=${sep}  FUNDE=${fund}  SEM BASE=${none}   (total 93)`);
