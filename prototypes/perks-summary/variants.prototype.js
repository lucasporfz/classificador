/* PROTOTYPE — three structurally different summaries on the actual classifier route.
 * Question: which hierarchy makes inferred perks and charms easiest to read?
 * URL: ?variant=A|B|C&sample=uhax|picture|ingol. Data is real, held only in memory.
 * Served only by serve.prototype.mjs; no production entry point imports this file.
 */
const prototypeNames = { A:'Ficha de equipamento', B:'Por criatura', C:'Resumo compacto', D:'UI atual ajustada' };
const prototypeSamples = {
  uhax: { label:'Uhaacz · charms + Bounty', server:'uhax 3 server log ed.txt', local:'uhax 3 local chat ed.txt', session:1 },
  picture: { label:'Picture · Combat Mastery', server:'picture server log.txt', local:'picture local chat.txt', session:0 },
  ingol: { label:'Ingol ED · charm + bestiário', server:'ingol ed Server Log.txt', local:'ingol ed Local Chat.txt', session:0 },
};
let prototypeVariant = new URLSearchParams(location.search).get('variant') || 'A';
if (!prototypeNames[prototypeVariant]) prototypeVariant='A';
let prototypeSample = new URLSearchParams(location.search).get('sample') || 'uhax';
if (!prototypeSamples[prototypeSample]) prototypeSample='uhax';
let prototypeTopic='leech';
let prototypeResult=null;
let prototypeRequest=0;
const prototypeCache=new Map();
const originalSummary=clsSessionSummaryHtml;
const pe=clsEscapeHtml;
const pnum=n=>Number(n||0).toLocaleString('pt-BR');
const ppct=n=>(100*n).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
const ppoint=n=>(100*n).toLocaleString('pt-BR',{maximumFractionDigits:2})+' p.p.';
const pname=n=>String(n).replace(/(^|\s)\w/g,c=>c.toUpperCase());
const pbadge=observed=>'<span class="p-badge '+(observed?'observed':'')+'">'+(observed?'Observado':'Inferido')+'</span>';

function prototypeData(model) {
  const u=model.unified,l=u.leechSetup||{},ladder=(u._context||{}).combatMasteryLadder||{},b=u.bountyTalismanSetup||{};
  const perks=[];
  if(ladder.active) perks.push({name:'Combat Mastery',value:ppct(ladder.step)+' por degrau',note:'Escada detectada · nível do perk indeterminado',short:ppct(ladder.step)+' / degrau'});
  for(const [axis,label] of [['damage','Dano'],['life','Life Leech']]) {
    const v=b[axis];
    if(v && v.level!=null && v.confidence!=='unknown') perks.push({name:'Bounty Talisman · '+label,value:'+'+ppct(v.bonus),note:'Nível '+v.level+' · '+(axis==='damage'?'dano contra criaturas da task':'bônus sobre a taxa de Life Leech'),short:'Nv. '+v.level+' · +'+ppct(v.bonus)});
  }
  const best=u.bestiaryClassDamageBonus;
  if(best?.bonus) perks.push({name:'Classe de bestiário',value:'+'+ppct(best.bonus),note:pname(best.class),short:'+'+ppct(best.bonus)+' · '+pname(best.class)});
  if(u.bmPierce) perks.push({name:'Battle Momentum',value:'+'+ppct(u.bmPierce),note:'Pierce holy e físico',short:'+'+ppct(u.bmPierce)});
  if(u.weaponPhysicalPierce) perks.push({name:'Pierce físico da arma',value:'+'+ppct(u.weaponPhysicalPierce),note:'Inferido nesta sessão',short:'+'+ppct(u.weaponPhysicalPierce)});
  if(u._context?.omegaSetup?.active) perks.push({name:'Omega',value:'×'+u._context.omegaSetup.multiplier,note:'Bônus condicional por hit',short:'×'+u._context.omegaSetup.multiplier});
  if(l.exposeWeaknessManaPerk) perks.push({name:'Expose Weakness → Mana',value:'+2 p.p.',note:'Mana Leech nos hits com Expose Weakness',short:'+2 p.p.'});
  return {model,perks,life:l.lifeBase,mana:l.manaBase,minor:model.charms.filter(c=>c.kind==='leech'),observed:model.charms.filter(c=>c.kind!=='leech')};
}
function prototypePerks(d) {
  return d.perks.map(p=>'<div class="p-perk"><div class="p-perk-head"><h4>'+pe(p.name)+'</h4>'+pbadge(false)+'</div><div class="p-perk-value p-mono p-mint">'+pe(p.value)+'</div><p class="p-muted" style="margin-top:7px">'+pe(p.note)+'</p></div>').join('')||'<p class="p-muted">Nenhum perk confirmado nesta sessão.</p>';
}
function VariantA(d) {
  return '<div class="p-a"><section class="p-panel"><div class="p-title"><h3>Recuperação por ataque</h3>'+pbadge(false)+'</div><div class="p-leech-duo">'+['Life','Mana'].map(channel=>{
    const charm=d.minor.find(c=>c.channel===channel),rate=channel==='Life'?d.life:d.mana,total=channel==='Life'?d.model.life:d.model.mana;
    return '<div><span class="p-eyebrow">'+channel+' Leech</span><div class="p-rate p-mono p-'+channel.toLowerCase()+'">'+ppct(rate)+'</div><p class="p-muted">Taxa base · '+pnum(total)+' recuperados</p><div class="p-mini-charm">'+(charm?'<strong>'+pe(pname(charm.name))+'</strong><span class="p-mono p-'+channel.toLowerCase()+'">+'+ppoint(charm.bonus)+'</span><p class="p-muted">em '+pe(charm.mob)+'</p>':'<p class="p-muted">Nenhum minor charm confirmado</p>')+'</div></div>';
  }).join('')+'</div></section><section class="p-panel"><div class="p-title"><h3>Perks da sessão</h3><small>'+d.perks.length+' identificados</small></div>'+prototypePerks(d)+'</section><section class="p-panel p-wide"><div class="p-title"><h3>Charms observados</h3><small>'+pnum(d.model.charmTotal)+' de dano</small></div><div class="p-charm-chips">'+d.observed.map(c=>'<div class="p-charm-chip"><strong><i class="p-dot" style="background:'+c.color+'"></i>'+pe(pname(c.name))+'</strong><p class="p-muted">'+pe(c.mob)+'</p></div>').join('')+'</div></section></div>';
}
function VariantB(d) {
  const mobs=[...new Set(d.model.charms.flatMap(c=>[...c.byMob.keys()]))];
  return '<div class="p-b-top"><div><span class="p-eyebrow">Life · taxa base</span><div class="p-rate p-life p-mono">'+ppct(d.life)+'</div><p class="p-muted">'+pnum(d.model.life)+' recuperados</p></div><div><span class="p-eyebrow">Mana · taxa base</span><div class="p-rate p-mana p-mono">'+ppct(d.mana)+'</div><p class="p-muted">'+pnum(d.model.mana)+' recuperados</p></div><div><span class="p-eyebrow">Perks do personagem</span><div style="margin-top:12px">'+d.perks.map(p=>'<div class="p-perk"><h4>'+pe(p.name)+'</h4><p class="p-mono p-mint" style="margin-top:8px;font-size:13px">'+pe(p.short)+'</p></div>').join('')+'</div></div></div><div class="p-title"><h3>O que está equipado em cada criatura</h3><small>Charms de dano e leech no mesmo lugar</small></div><div class="p-table-wrap"><table class="p-table"><thead><tr><th>Criatura</th><th>Charm observado</th><th class="p-life">Life Leech extra</th><th class="p-mana">Mana Leech extra</th></tr></thead><tbody>'+mobs.map(m=>{
    const charms=d.model.charms.filter(c=>c.byMob.has(m));
    return '<tr><td>'+pe(m)+'</td><td>'+charms.filter(c=>c.kind!=='leech').map(c=>'<i class="p-dot" style="background:'+c.color+'"></i>'+pe(pname(c.name))).join('<br>')+'</td>'+['Life','Mana'].map(channel=>{
      const c=charms.find(c=>c.kind==='leech'&&c.channel===channel);
      return '<td>'+(c?'<span class="p-mono p-'+channel.toLowerCase()+'">+'+ppoint(c.bonus)+'</span><small>'+pe(pname(c.name))+'</small>':'<span class="p-empty">—</span>')+'</td>';
    }).join('')+'</tr>';
  }).join('')+'</tbody></table></div><div class="p-foot"><span>Os bônus de leech são inferidos e se aplicam apenas à criatura indicada.</span><span>Dano de charm <b class="p-mono">'+pnum(d.model.charmTotal)+'</b></span></div>';
}
function VariantC(d) {
  let body='';
  if(prototypeTopic==='leech') body='<div class="p-title"><h3>Leech por criatura</h3>'+pbadge(false)+'</div><p class="p-muted">Os bônus abaixo somam pontos percentuais à taxa base.</p>'+d.minor.map(c=>'<div class="p-detail-row"><div><h4>'+pe(pname(c.name))+'</h4><small>'+pe(c.mob)+'</small></div><div><strong class="p-mono p-'+c.channel.toLowerCase()+'">+'+ppoint(c.bonus)+'</strong><small>'+c.channel+' Leech</small></div></div>').join('')+(!d.minor.length?'<p class="p-muted" style="margin-top:25px">Nenhum minor charm confirmado nesta sessão.</p>':'');
  if(prototypeTopic==='charms') body='<div class="p-title"><h3>Charms observados</h3>'+pbadge(true)+'</div>'+d.observed.map(c=>'<div class="p-detail-row"><div><h4><i class="p-dot" style="background:'+c.color+'"></i>'+pe(pname(c.name))+'</h4><small>'+pe(c.mob)+'</small></div><strong class="p-mono">'+(c.dmg?pnum(c.dmg):pnum(c.procs)+' procs')+'</strong></div>').join('');
  if(prototypeTopic==='perks') body='<div class="p-title"><h3>Perks e níveis</h3>'+pbadge(false)+'</div>'+prototypePerks(d);
  return '<div class="p-c"><div class="p-c-header"><h3>Setup da sessão</h3><div><span class="p-eyebrow">Life base</span><div class="p-mono p-life">'+ppct(d.life)+'</div></div><div><span class="p-eyebrow">Mana base</span><div class="p-mono p-mana">'+ppct(d.mana)+'</div></div><div><span class="p-eyebrow">Dano de charm</span><div class="p-mono">'+pnum(d.model.charmTotal)+'</div></div></div><div class="p-c-body"><nav class="p-c-nav">'+[['leech','Charms de leech',d.minor.length],['charms','Charms observados',d.observed.length],['perks','Perks e níveis',d.perks.length]].map(([key,label,n])=>'<button class="p-topic '+(key===prototypeTopic?'active':'')+'" data-topic="'+key+'">'+label+' <small>'+n+'</small></button>').join('')+'</nav><section class="p-c-detail">'+body+'</section></div></div>';
}
function VariantD(res, model) {
  return '<div id="prototype-summary" class="p-d">'+originalSummary(res,model)+'</div>';
}
clsSessionSummaryHtml=function(res,model) {
  if(prototypeVariant==='D')return VariantD(res,model);
  const temp=document.createElement('div');temp.innerHTML=originalSummary(res,model);
  const d=prototypeData(model);
  const state={sessao:prototypeSamples[prototypeSample].label,lifeBase:d.life,manaBase:d.mana,charms:d.model.charms.map(c=>({nome:c.name,criatura:c.mob,bonus:c.bonus,tipo:c.kind})),perks:d.perks};
  return temp.querySelector('.cls-summary-head').outerHTML+'<div id="prototype-summary" class="p-shell">'+({A:VariantA,B:VariantB,C:VariantC}[prototypeVariant])(d)+'</div><details class="p-state"><summary>Dados usados nesta proposta · mesma sessão nas três opções</summary><pre>'+pe(JSON.stringify(state,null,2))+'</pre></details>'+temp.querySelector('.cls-summary-wide').outerHTML;
};
const lab=document.createElement('div');lab.className='p-lab';
document.querySelector('.topbar').after(lab);
const switcher=document.createElement('nav');switcher.className='p-switch';switcher.setAttribute('aria-label','Propostas visuais');document.body.append(switcher);
function prototypeControls() {
  lab.innerHTML='<div><small>Protótipo visual · 4 propostas</small><h2>'+prototypeVariant+' — '+prototypeNames[prototypeVariant]+'</h2><p>'+({A:'Separar taxas base, bônus condicionais e charms observados.',B:'Encontrar todos os efeitos de uma criatura sem repetir informação.',C:'Manter o resumo curto e abrir os detalhes por assunto.',D:'Layout atual, minor charms por criatura e Bounty com alvo explícito.'}[prototypeVariant])+'</p></div><label><span class="p-eyebrow" style="display:block;margin-bottom:7px">Exemplo real</span><select id="prototype-sample">'+Object.entries(prototypeSamples).map(([k,v])=>'<option value="'+k+'" '+(k===prototypeSample?'selected':'')+'>'+v.label+'</option>').join('')+'</select></label>';
  switcher.innerHTML='<button class="p-arrow" data-cycle="-1" aria-label="Proposta anterior">←</button>'+Object.entries(prototypeNames).map(([k,name])=>'<button data-variant="'+k+'" class="'+(prototypeVariant===k?'active':'')+'" aria-pressed="'+(prototypeVariant===k)+'">'+k+' · '+name+'</button>').join('')+'<button class="p-arrow" data-cycle="1" aria-label="Próxima proposta">→</button>';
  document.getElementById('prototype-sample').onchange=e=>{prototypeSample=e.target.value;prototypeUrl();prototypeLoad();};
}
function prototypeUrl(){const u=new URL(location);u.searchParams.set('variant',prototypeVariant);u.searchParams.set('sample',prototypeSample);history.replaceState(null,'',u);}
function prototypeRender(){prototypeControls();if(prototypeResult)renderClassifier(prototypeResult);}
function prototypeChoose(v){prototypeVariant=v;prototypeUrl();prototypeRender();}
switcher.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.variant)prototypeChoose(b.dataset.variant);else prototypeCycle(+b.dataset.cycle);};
function prototypeCycle(n){const keys=Object.keys(prototypeNames);prototypeChoose(keys[(keys.indexOf(prototypeVariant)+n+keys.length)%keys.length]);}
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();prototypeCycle(e.key==='ArrowLeft'?-1:1);}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-topic]');if(b){prototypeTopic=b.dataset.topic;prototypeRender();}});
function prototypeSession(text,i){const chunks=text.replace(/^\uFEFF/,'').split(/(?=^Channel .+ saved )/m).filter(x=>/^Channel .+ saved /m.test(x));return chunks.length?chunks[i]:text;}
async function prototypeLoad(){
  const request=++prototypeRequest;prototypeResult=null;prototypeControls();
  const el=document.getElementById('clsResults');el.style.display='block';el.innerHTML='<div class="p-loading">Carregando a sessão real…</div>';
  const key=prototypeSample,s=prototypeSamples[key];
  if(!prototypeCache.has(key)){
    const [sv,lc]=await Promise.all([s.server,s.local].map(f=>fetch('/logs/'+encodeURIComponent(f)).then(r=>r.text())));
    if(request!==prototypeRequest)return;
    await new Promise(r=>setTimeout(r,30));
    prototypeCache.set(key,classifyWithLocalChat(prototypeSession(sv,s.session),prototypeSession(lc,s.session),{trace:true}));
  }
  if(request!==prototypeRequest)return;
  prototypeResult=prototypeCache.get(key);setLastClassifierResult(prototypeResult);prototypeRender();
}
prototypeLoad();
