#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Matriz N=1 x N=k do PRIMEIRO hit.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const silent={log(){},warn(){},error(){},info(){},debug(){}};
const ctx={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
ctx.globalThis=ctx;ctx.window=ctx;vm.createContext(ctx);
for(const f of ['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'])vm.runInContext(read(path.join(ROOT,f)),ctx,{filename:f});
const [svP,lcP]=process.argv.slice(2);
const fmt=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const u=ctx.UnifiedClassificationEngine.classifyUnified(read(svP),read(lcP),{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});
const V=ctx.UnifiedValidation,setup=u.leechSetup,cx={leechSetup:setup};
const T='single_target_aa_all_action_without_positive_aa_evidence';
const tag=(h,n,ch)=>{const v=V.observedLeechAcceptsN(h,setup,n,ch,null,cx);if(!v||!v.usable)return '-';return v.ok?'OK':v.cappedLow?'LOW':v.tooHigh?'HIGH':'MID';};
const comb=(h,n)=>{const l=tag(h,n,'life'),m=tag(h,n,'mana');if(l==='OK'||m==='OK')return 'OK';if(l==='HIGH'||m==='HIGH')return 'HIGH';if(l==='LOW'||m==='LOW')return 'LOW';if(l==='-'&&m==='-')return '-';return 'MID';};
const M={},rows=[];
for(const t of u.turns||[]){
  if(!(t.components||[]).some(c=>c.reason===T))continue;
  const hits=(t.components||[]).flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
  hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
  const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
  const k=main.length,f=main[0];
  const key=comb(f,1)+' @N=1  x  '+comb(f,k)+' @N=k';
  M[key]=(M[key]||0)+1;
  const sup=V.blockLeechSupportForN(main.slice(1),setup,k-1,cx);
  rows.push({ts:t.ts,k,mob:f.mob,dmg:f.dmg,ok:f.overkill?'OK':'',life:f.lifeLeech||0,mana:f.manaLeech||0,
    n1l:tag(f,1,'life'),n1m:tag(f,1,'mana'),nkl:tag(f,k,'life'),nkm:tag(f,k,'mana'),
    sufOk:sup.ok,sufBad:sup.bad,sufUsable:sup.usable,key});
}
console.log('leech: life='+setup.lifeBase+' mana='+setup.manaBase+' vampiric='+setup.vampiricMob+' +'+setup.vampiricBonus);
console.log('\n=== MATRIZ do PRIMEIRO hit (93 turnos travados) ===');
for(const [k2,v] of Object.entries(M).sort((a,b)=>b[1]-a[1]))console.log(String(v).padStart(4)+'  '+k2);
console.log('\n=== por turno ===');
console.log('ts        k  mob                 dmg   ok  life  mana | N=1 L/M   | N=k L/M   | sufixo N=k-1 (ok/bad/usable)');
for(const r of rows)console.log(`${fmt(r.ts)} ${String(r.k).padStart(2)}  ${String(r.mob).padEnd(20)} ${String(r.dmg).padStart(5)} ${r.ok.padEnd(3)} ${String(r.life).padStart(5)} ${String(r.mana).padStart(5)} | ${(r.n1l+'/'+r.n1m).padEnd(10)}| ${(r.nkl+'/'+r.nkm).padEnd(10)}| ${r.sufOk}/${r.sufBad}/${r.sufUsable}`);
