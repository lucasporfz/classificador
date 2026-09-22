#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Dump hit-a-hit dos turnos SEM BASE.
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
function chans(h){const d=+h.dmg||0;const L=+h.lifeLeech||0,M=+h.manaLeech||0;
  return {rL:(d&&L>0)?L/(d*lr(h)):null, rM:(d&&M>0)?M/(d*setup.manaBase):null};}
function usable(h){if(h.overkill)return null;const c=chans(h);return (c.rL!=null||c.rM!=null)?[c.rL,c.rM]:null;}
console.log(`leech: vida=${setup.lifeBase} mana=${setup.manaBase}  bonus vampirico em "${setup.vampiricMob}" +${setup.vampiricBonus}\n`);
let n=0;
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  const r1=usable(main[0]);
  const rs=main.slice(1).map(usable).filter(x=>x!=null);
  if(!(r1==null||rs.length<2))continue;
  n++;
  const why = r1==null&&rs.length<2 ? 'nem 1o golpe nem sufixo utilizaveis'
    : r1==null ? '1o golpe sem razao utilizavel (overkill ou canais discordam)'
    : `sufixo com apenas ${rs.length} golpe(s) utilizavel(is)`;
  console.log(`=== ${fmt(t.ts)}  k=${main.length}  -> ${why}`);
  console.log('   #  mob                  dmg  flags   vida   esp   razao |  mana   esp   razao | usavel');
  main.forEach((h,i)=>{
    const d=+h.dmg||0,c=chans(h);
    const eL=Math.ceil(d*lr(h)),eM=Math.ceil(d*setup.manaBase);
    const fl=[h.overkill&&'OK',h.realCrit&&'C',h.onslaught&&'O',h.lowBlow&&'L',h.isPrey&&'P'].filter(Boolean).join('');
    const uu=usable(h);
    console.log(`  ${String(i).padStart(2)}  ${String(h.mob).padEnd(20)} ${String(d).padStart(5)} ${fl.padEnd(6)} ${String(+h.lifeLeech||0).padStart(5)} ${String(eL).padStart(5)} ${(c.rL!=null?c.rL.toFixed(3):'  -  ').padStart(6)} | ${String(+h.manaLeech||0).padStart(5)} ${String(eM).padStart(5)} ${(c.rM!=null?c.rM.toFixed(3):'  -  ').padStart(6)} | ${uu!=null?uu.toFixed(3):'  -'}`);
  });
  console.log('');
}
console.log(`total SEM BASE: ${n}`);
