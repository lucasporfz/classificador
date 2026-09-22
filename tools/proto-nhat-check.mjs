#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). N=0.9/(razao-0.1) em turnos-prova especificos.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const silent={log(){},warn(){},error(){},info(){},debug(){}};
const ctx={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'])vm.runInContext(read(path.join(ROOT,f)),ctx,{filename:f});
const [svP,lcP,tsArg]=process.argv.slice(2);
const toSec=s=>{const m=/^(\d\d):(\d\d):(\d\d)$/.exec(s.trim());return (+m[1])*3600+(+m[2])*60+(+m[3])};
const W=new Set(tsArg.split(',').map(toSec));
const fmt=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const u=ctx.UnifiedClassificationEngine.classifyUnified(read(svP),read(lcP),{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});
const setup=u.leechSetup;
console.log(`leech: vida=${setup.lifeBase} mana=${setup.manaBase} vampirico=${setup.vampiricMob} +${setup.vampiricBonus}`);
const rate=(h,ch)=>ch==='life'?setup.lifeBase+((setup.vampiricMob&&String(h.mob).toLowerCase()===String(setup.vampiricMob).toLowerCase())?(setup.vampiricBonus||0):0):setup.manaBase;
const r=(h,ch)=>{const d=+h.dmg||0,v=ch==='life'?(+h.lifeLeech||0):(+h.manaLeech||0);return (d>0&&v>0)?v/(d*rate(h,ch)):null;};
const N=x=>(x!=null&&x>0.1)?0.9/(x-0.1):null;
for(const t of u.turns||[]){
  if(!W.has(t.ts))continue;
  console.log(`\n=== ${fmt(t.ts)}  ${(t.components||[]).map(c=>c.comp+':'+(c.hits||[]).length).join(' ')}  ${(t.components||[])[0]?.reason||''}`);
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  hits.filter(h=>!h.charmOnly&&!h.reflect).forEach((h,i)=>{
    const rl=r(h,'life'),rm=r(h,'mana'),nl=N(rl),nm=N(rm);
    console.log(`  ${String(i).padStart(2)} ${String(h.comp).padEnd(6)} ${String(h.mob).padEnd(20)} dmg=${String(h.dmg).padStart(5)} ${h.overkill?'OK':'  '} vida=${String(+h.lifeLeech||0).padStart(5)} mana=${String(+h.manaLeech||0).padStart(5)} | razao ${(rl!=null?rl.toFixed(3):'  -  ')}/${(rm!=null?rm.toFixed(3):'  -  ')} | N ${(nl!=null?nl.toFixed(2):' - ').padStart(6)}/${(nm!=null?nm.toFixed(2):' - ').padStart(6)}`);
  });
}
