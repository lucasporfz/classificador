#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Hit-a-hit dos turnos que o contraste
// por canal (faixa so de nao-overkill) NAO consegue julgar.
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
console.log(`leech: vida=${setup.lifeBase}  mana=${setup.manaBase}  bonus vampirico em "${setup.vampiricMob}" +${setup.vampiricBonus}`);
console.log('razao = leech observado / leech esperado se o golpe tivesse batido em 1 alvo so\n');
let n=0;
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  const f=main[0]; let sep=false,judged=false;
  for(const ch of ['life','mana']){
    if(f.overkill)continue; const r1=r(f,ch); if(r1==null)continue;
    const rs=main.slice(1).filter(h=>!h.overkill).map(h=>r(h,ch)).filter(x=>x!=null);
    if(rs.length<2)continue; judged=true;
    const hi=Math.max(...rs),w=hi-Math.min(...rs); if(r1>hi+w)sep=true;
  }
  if(judged)continue;
  n++;
  const okCount=main.slice(1).filter(h=>h.overkill).length;
  const why=f.overkill?'1o golpe e overkill (razao inflada, inutilizavel)'
    :main.length===2?'sufixo tem 1 golpe so (nao existe faixa)'
    :okCount===main.length-1?`sufixo inteiro e overkill (${okCount} golpes)`
    :'menos de 2 golpes utilizaveis no sufixo';
  console.log(`=== ${fmt(t.ts)}  k=${main.length}  -> ${why}`);
  console.log('   #  mob                  dmg  flag   vida   esp  razao |  mana   esp  razao');
  main.forEach((h,i)=>{
    const d=+h.dmg||0;
    const eL=Math.ceil(d*rate(h,'life')),eM=Math.ceil(d*rate(h,'mana'));
    const rL=r(h,'life'),rM=r(h,'mana');
    const fl=[h.overkill&&'OK',h.realCrit&&'C',h.onslaught&&'O',h.lowBlow&&'L'].filter(Boolean).join('');
    console.log(`  ${String(i).padStart(2)}  ${String(h.mob).padEnd(20)} ${String(d).padStart(5)} ${fl.padEnd(5)} ${String(+h.lifeLeech||0).padStart(5)} ${String(eL).padStart(5)} ${(rL!=null?rL.toFixed(3):'   -  ').padStart(6)} | ${String(+h.manaLeech||0).padStart(5)} ${String(eM).padStart(5)} ${(rM!=null?rM.toFixed(3):'   -  ').padStart(6)}`);
  });
  console.log('');
}
console.log(`total sem julgamento: ${n}`);
