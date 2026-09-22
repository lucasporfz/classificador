#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Varredura do corpus inteiro:
// N = 0.9/(razao-0.1) do PRIMEIRO hit, contra o que o motor decide hoje.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { splitSessions, pairSessions, filterExcludedSessions, dateKey } from './unified-corpus.mjs';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const ENG=['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'];
function newCtx(){const silent={log(){},warn(){},error(){},info(){},debug(){}};
  const c={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
  c.globalThis=c;c.window=c;vm.createContext(c);
  for(const f of ENG)vm.runInContext(read(path.join(ROOT,f)),c,{filename:f});return c;}
const N=x=>(x!=null&&x>0.1)?0.9/(x-0.1):null;
const TARGET='single_target_aa_all_action_without_positive_aa_evidence';
const G={alvo:{n1:0,nk:0,outro:0,inutil:0},split:{n1:0,nao1:0,inutil:0},fund:{n1:0,nao1:0,inutil:0}};
const perFixture={},flips=[];
const pairs=discoverFixturePairs({logDir:'logs',warn:()=>{}});
for(const p of pairs){
  const sv=splitSessions(read(path.join('logs',p.server))),lc=splitSessions(read(path.join('logs',p.local)));
  let sess=pairSessions(sv,lc).map((x,i)=>({...x,sourceIndex:i}));
  sess=filterExcludedSessions(p.server,sess);
  for(const s of sess){
    const ctx=newCtx();
    let u; try{u=ctx.UnifiedClassificationEngine.classifyUnified(s.sv.text,s.lc.text,{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});}catch(e){continue}
    if(!u||u.error||!u.turns)continue;
    const setup=u.leechSetup; if(!setup||!(setup.lifeBase>0||setup.manaBase>0))continue;
    const rate=(h,ch)=>ch==='life'?setup.lifeBase+((setup.vampiricMob&&String(h.mob).toLowerCase()===String(setup.vampiricMob).toLowerCase())?(setup.vampiricBonus||0):0):setup.manaBase;
    const r=(h,ch)=>{const d=+h.dmg||0,v=ch==='life'?(+h.lifeLeech||0):(+h.manaLeech||0);return (d>0&&v>0)?v/(d*rate(h,ch)):null;};
    const nhat=h=>{if(h.overkill)return null;const v=[N(r(h,'life')),N(r(h,'mana'))].filter(x=>x!=null);return v.length?Math.min(...v):null;};
    for(const t of u.turns){
      if(t.status!=='resolved'&&t.status!=='ok'&&t.status)  { /* segue mesmo assim */ }
      const comps=t.components||[]; if(!comps.length)continue;
      const hits=comps.flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
      hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
      const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
      const k=main.length,f=nhat(main[0]),rf=f==null?null:Math.round(f);
      const isTarget=comps.some(c=>c.reason===TARGET);
      const arrowN=(comps.find(c=>c.comp==='arrow')||{hits:[]}).hits.length;
      const key=p.label;
      perFixture[key]=perFixture[key]||{alvo:0,alvoN1:0,splitOk:0,splitBad:0,fundN1:0,fundNao1:0};
      if(isTarget){
        perFixture[key].alvo++;
        if(f==null)G.alvo.inutil++;
        else if(rf===1){G.alvo.n1++;perFixture[key].alvoN1++;}
        else if(Math.abs(f-k)<1)G.alvo.nk++; else G.alvo.outro++;
      } else if(arrowN===1&&main[0].comp==='arrow'){ // motor ja separou: criterio concorda?
        if(f==null)G.split.inutil++;
        else if(rf===1){G.split.n1++;perFixture[key].splitOk++;}
        else {G.split.nao1++;perFixture[key].splitBad++;flips.push(`DESFARIA  ${p.label} S${s.index??s.sourceIndex} ${t.clock||t.ts} k=${k} N(1o)=${f.toFixed(2)}`);}
      } else if(arrowN===0){ // motor fundiu por outro motivo: criterio criaria AA?
        if(f==null)G.fund.inutil++;
        else if(rf===1){G.fund.n1++;perFixture[key].fundN1++;flips.push(`CRIARIA   ${p.label} S${s.index??s.sourceIndex} ${t.clock||t.ts} k=${k} N(1o)=${f.toFixed(2)}`);}
        else {G.fund.nao1++;perFixture[key].fundNao1++;}
      }
    }
  }
}
console.log('=== ALVO: turnos com '+TARGET+' ===');
console.log(`  1o hit da N=1 (o criterio destrava): ${G.alvo.n1}`);
console.log(`  1o hit da N=k (fusao correta, fica): ${G.alvo.nk}`);
console.log(`  1o hit da outro N:                  ${G.alvo.outro}`);
console.log(`  1o hit inutilizavel (overkill):     ${G.alvo.inutil}`);
console.log('\n=== RISCO 1: turnos que o motor JA separa com AA=1 no 1o hit ===');
console.log(`  criterio concorda (N=1):  ${G.split.n1}`);
console.log(`  criterio DISCORDA:        ${G.split.nao1}   <- desfaria separacao existente`);
console.log(`  inutilizavel:             ${G.split.inutil}`);
console.log('\n=== RISCO 2: turnos sem AA por OUTRO motivo ===');
console.log(`  criterio criaria AA (N=1): ${G.fund.n1}   <- mudanca fora do alvo`);
console.log(`  criterio concorda (nao 1): ${G.fund.nao1}`);
console.log(`  inutilizavel:              ${G.fund.inutil}`);
console.log('\n=== por fixture (alvo / destravados | ja separados ok / discorda | fundidos que viraria AA) ===');
for(const [k,v] of Object.entries(perFixture).sort())
  if(v.alvo||v.splitBad||v.fundN1)console.log(`  ${k.padEnd(22)} alvo=${String(v.alvo).padStart(4)} destrava=${String(v.alvoN1).padStart(4)} | split ok=${String(v.splitOk).padStart(4)} discorda=${String(v.splitBad).padStart(4)} | criaria=${String(v.fundN1).padStart(4)}`);
fs.writeFileSync('reports/wayfinder-15-corpus-flips.txt',flips.join('\n'));
console.log(`\n(${flips.length} linhas de divergencia em reports/wayfinder-15-corpus-flips.txt)`);
