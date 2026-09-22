#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). O truncamento e cap ou multiplicador?
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
const lifeRate=h=>setup.lifeBase+((setup.vampiricMob&&String(h.mob).toLowerCase()===String(setup.vampiricMob).toLowerCase())?(setup.vampiricBonus||0):0);
const manaRate=h=>setup.manaBase;
const rows=[];
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  main.forEach((h,i)=>{
    const d=+h.dmg||0,L=+h.lifeLeech||0,Mn=+h.manaLeech||0; if(!d)return;
    const eL=d*lifeRate(h),eM=d*manaRate(h);
    rows.push({ts:t.ts,i,first:i===0,k:main.length,mob:h.mob,d,ok:!!h.overkill,crit:!!h.realCrit,L,Mn,
      rL:L>0&&eL>0?L/eL:null,rM:Mn>0&&eM>0?Mn/eM:null});
  });
}
const both=rows.filter(r=>r.rL!=null&&r.rM!=null&&!r.ok);
console.log(`hits com os DOIS canais (sem overkill): ${both.length} de ${rows.length}`);
const diffs=both.map(r=>Math.abs(r.rL-r.rM));
const q=p=>{const s=diffs.slice().sort((a,b)=>a-b);return s[Math.floor(p*(s.length-1))];};
console.log(`|razao_vida - razao_mana|:  p50=${q(.5).toFixed(4)}  p90=${q(.9).toFixed(4)}  p99=${q(.99).toFixed(4)}  max=${q(1).toFixed(4)}`);
console.log(`fracao com diferenca < 0.02 (canais truncam JUNTOS na mesma proporcao): ${(diffs.filter(x=>x<0.02).length/diffs.length*100).toFixed(1)}%`);
const bins={};
for(const r of both){const b=(Math.round(((r.rL+r.rM)/2)*50)/50).toFixed(2);bins[b]=(bins[b]||0)+1;}
console.log('\nhistograma da razao media observado/esperado(N=1), passo 0.02:');
for(const [b,n] of Object.entries(bins).sort((a,b)=>+a[0]-+b[0]))console.log('  '+b+'  '+'#'.repeat(Math.ceil(n/3)).padEnd(30)+' '+n);
console.log('\namostra (primeiro hit de cada turno, sem overkill):');
console.log('ts        k  mob                  dmg  crit  life  mana | rL     rM     |rL-rM|');
for(const r of both.filter(x=>x.first).slice(0,40))
  console.log(`${fmt(r.ts)} ${String(r.k).padStart(2)}  ${String(r.mob).padEnd(20)} ${String(r.d).padStart(5)} ${(r.crit?'C':'').padEnd(4)} ${String(r.L).padStart(5)} ${String(r.Mn).padStart(5)} | ${r.rL.toFixed(4)} ${r.rM.toFixed(4)} ${Math.abs(r.rL-r.rM).toFixed(4)}`);
