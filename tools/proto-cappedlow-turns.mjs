#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Razao obs/esp(N=1) do 1o hit vs sufixo.
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
const ratio=h=>{const d=+h.dmg||0;if(!d||h.overkill)return null;const L=+h.lifeLeech||0,M=+h.manaLeech||0;
  const a=L>0?L/(d*lr(h)):null,b=M>0?M/(d*setup.manaBase):null;
  if(a!=null&&b!=null)return{r:(a+b)/2,gap:Math.abs(a-b),n:2};if(a!=null)return{r:a,gap:null,n:1};if(b!=null)return{r:b,gap:null,n:1};return null;};
const med=a=>{if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y);return s[Math.floor(s.length/2)];};
let cSep=0,cSame=0,cUnk=0;
console.log('ts        k  1o hit: mob                dmg   razao(1o)  gap   | sufixo: razao mediana (n)  | leitura');
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  const f=main[0],rf=ratio(f);
  const rs=main.slice(1).map(ratio).filter(Boolean);
  const ms=med(rs.map(x=>x.r));
  let read='?';
  if(rf==null||ms==null){read='sem base (overkill/sem leech)';cUnk++;}
  else if(rf.r>=0.85&&ms<0.5){read='SEPARA: 1o=alvo unico, sufixo=area';cSep++;}
  else if(rf.r<0.5&&ms<0.5){read='mesmo nivel: 1o tambem parece area';cSame++;}
  else {read='misto/indefinido';cUnk++;}
  console.log(`${fmt(t.ts)} ${String(main.length).padStart(2)}  ${String(f.mob).padEnd(20)} ${String(f.dmg).padStart(5)} ${f.overkill?'OK':'  '} ${rf?rf.r.toFixed(3):'  -  '}  ${rf&&rf.gap!=null?rf.gap.toFixed(3):'  -  '} | ${ms!=null?ms.toFixed(3):'  -  '} (${rs.length})           | ${read}`);
}
console.log(`\nSEPARA=${cSep}  mesmo nivel=${cSame}  indefinido/sem base=${cUnk}`);
