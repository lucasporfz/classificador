#!/usr/bin/env node
// PROTOTIPO JOGA-FORA (wayfinder #15). Igual ao proto-nhat-corpus, mas a razao
// usa o ESPERADO DO PROPRIO MOTOR (observedLeechAcceptsN -> expectations),
// que ja cobre bounty/gravsan/EW/minor charm, em vez de taxa na mao.
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path';
import { discoverFixturePairs } from './fixture-pairs.mjs';
import { splitSessions, pairSessions, filterExcludedSessions } from './unified-corpus.mjs';
const ROOT=process.cwd(); const read=p=>fs.readFileSync(p,'utf8');
const ENG=['js/stats.js','js/mob-element-mods.js','js/mob-element-mods-post-2026-06-16.js', 'js/mob-element-mods-post-2026-08-25.js','js/unified-session-context.js', 'js/unified-formulas.js','js/unified-parsing.js','js/unified-setup-inference.js','js/unified-validation.js','js/unified-turn-resolution.js','js/unified-classification-engine.js'];
const SRC=ENG.map(f=>({f,code:read(path.join(ROOT,f))}));
function newCtx(){const silent={log(){},warn(){},error(){},info(){},debug(){}};
  const c={console:silent,Math,JSON,Array,Object,Number,String,Map,Set,isFinite,isNaN,parseInt,parseFloat,Date,Float32Array,Int32Array};
  c.globalThis=c;c.window=c;vm.createContext(c);
  for(const s of SRC)vm.runInContext(s.code,c,{filename:s.f});return c;}
const N=x=>(x!=null&&x>0.1)?0.9/(x-0.1):null;
const TARGET='single_target_aa_all_action_without_positive_aa_evidence';
const only=(process.argv.slice(2).find(a=>a.startsWith('--pairs='))||'').slice(8);
const want=only?only.split(','):null;
const G={fora:0,alvo:{n1:0,nk:0,outro:0,inutil:0},split:{n1:0,nao1:0,inutil:0},fund:{n1:0,nao1:0,inutil:0}};
const perFixture={},flips=[];
for(const p of discoverFixturePairs({logDir:'logs',warn:()=>{}})){
  if(want&&!want.some(w=>p.label.includes(w)))continue;
  const sv=splitSessions(read(path.join('logs',p.server))),lc=splitSessions(read(path.join('logs',p.local)));
  let sess=filterExcludedSessions(p.server,pairSessions(sv,lc).map((x,i)=>({...x,sourceIndex:i})));
  for(const s of sess){
    const ctx=newCtx(); const V=ctx.UnifiedValidation;
    let u; try{u=ctx.UnifiedClassificationEngine.classifyUnified(s.sv.text,s.lc.text,{mobModsPre:ctx.MOB_ELEMENT_MODS||null,mobModsPost:ctx.MOB_ELEMENT_MODS_POST_2026_06_16||null,strictLeech:true,maxOriginal:6000,useFloat16Mitigation:true});}catch(e){continue}
    if(!u||u.error||!u.turns)continue;
    const setup=u.leechSetup; if(!setup||!(setup.lifeBase>0||setup.manaBase>0))continue;
    const cx={leechSetup:setup};
    const ratio=(h,ch)=>{const v=V.observedLeechAcceptsN(h,setup,1,ch,null,cx);
      if(!v||!v.usable||!v.expectations||!v.expectations.length)return null;
      const es=v.expectations.map(x=>x.expected).filter(Number.isFinite); if(!es.length)return null;
      // maior esperado = razao MENOR = N maior: escolha conservadora contra falso N=1
      return v.observed/Math.max(...es);};
    const nhat=h=>{if(h.overkill)return null;const a=[N(ratio(h,'life')),N(ratio(h,'mana'))].filter(x=>x!=null);return a.length?Math.min(...a):null;};
    for(const t of u.turns){
      const comps=t.components||[]; if(!comps.length)continue;
      const hits=comps.flatMap(c=>(c.hits||[]).map(h=>({...h,comp:c.comp})));
      hits.sort((a,b)=>(a.ts-b.ts)||((a.seq||0)-(b.seq||0)));
      const main=hits.filter(h=>!h.charmOnly&&!h.reflect); if(main.length<2)continue;
      const k=main.length,f=nhat(main[0]),rf=f==null?null:Math.round(f);
      const isTarget=comps.some(c=>c.reason===TARGET);
      const arrowN=(comps.find(c=>c.comp==='arrow')||{hits:[]}).hits.length;
      const key=p.label; perFixture[key]=perFixture[key]||{alvo:0,alvoN1:0,splitOk:0,splitBad:0,fundN1:0};
      if(isTarget){perFixture[key].alvo++;
        if(f==null)G.alvo.inutil++; else if(rf===1){G.alvo.n1++;perFixture[key].alvoN1++;}
        else if(Math.abs(f-k)<1)G.alvo.nk++; else G.alvo.outro++;
      } else if(arrowN===1&&main[0].comp==='arrow'){
        // ESCOPO: so o resolvedor de alvo unico (knight/sorcerer/druid/monk).
        // Em RP o AA e de area (varios hits), entao N=1 nao se aplica.
        const rsn=(comps.find(c=>c.comp==='arrow')||{}).reason||'';
        if(!/^(ek_|single_target|h005)/.test(rsn)){G.fora++;continue;}
        if(f==null)G.split.inutil++; else if(rf===1){G.split.n1++;perFixture[key].splitOk++;}
        else {G.split.nao1++;perFixture[key].splitBad++;flips.push(`DESFARIA ${p.label} ${t.clock||t.ts} k=${k} N=${f.toFixed(2)}`);}
      } else if(arrowN===0){
        if(f==null)G.fund.inutil++; else if(rf===1){G.fund.n1++;perFixture[key].fundN1++;flips.push(`CRIARIA  ${p.label} ${t.clock||t.ts} k=${k} N=${f.toFixed(2)}`);}
        else G.fund.nao1++;
      }
    }
  }
}
console.log(`ALVO: N=1 -> ${G.alvo.n1} | N=k -> ${G.alvo.nk} | outro N -> ${G.alvo.outro} | inutil -> ${G.alvo.inutil}`);
console.log(`RISCO1 (ja separados, SO alvo unico): concorda ${G.split.n1} | DISCORDA ${G.split.nao1} | inutil ${G.split.inutil}   (fora de escopo: ${G.fora})`);
console.log(`RISCO2 (sem AA por outro motivo): criaria AA ${G.fund.n1} | concorda ${G.fund.nao1} | inutil ${G.fund.inutil}`);
console.log('\npor fixture:');
for(const [k,v] of Object.entries(perFixture).sort())
  if(v.alvo||v.splitBad||v.fundN1)console.log(`  ${k.padEnd(22)} alvo=${String(v.alvo).padStart(4)} destrava=${String(v.alvoN1).padStart(4)} | split ok=${String(v.splitOk).padStart(5)} discorda=${String(v.splitBad).padStart(4)} | criaria=${String(v.fundN1).padStart(4)}`);
fs.writeFileSync('reports/wayfinder-15-corpus-flips.txt',flips.join('\n'));
