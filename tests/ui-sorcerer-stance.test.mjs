/*
 * Teste de UI da estância elemental do sorcerer (M-043).
 *
 * Roda a página REAL (index.html) num Chromium headless, carrega um par de logs pelos mesmos
 * file inputs que o usuário usa e verifica:
 *
 *   1. `alumnishocks 2` (sorcerer, Master of Thunder inferida pelo dano): o cartão de perks
 *      mostra a estância com a fonte; a legenda da conversão e a linha agregada aparecem;
 *   2. o detalhe de um turno que perdeu a conversão mostra o chip de conversão perdida;
 *   3. um log de knight (`tom`) não mostra linha de estância nem legenda de conversão.
 *
 * Requer `playwright` (já em devDependencies). Sem browser instalado, o teste PULA em vez de
 * falhar — a suíte roda em máquina sem Chromium.
 */
import path from 'node:path';
import process from 'node:process';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('SKIP: playwright nao instalado');
  process.exit(0);
}

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.log('SKIP: chromium indisponivel (' + String(err.message).split('\n')[0] + ')');
  process.exit(0);
}

const fail = [];
const check = (name, ok, detail) => {
  if (ok) console.log('  OK   ' + name);
  else { console.log('  FALHOU ' + name + (detail ? ' — ' + detail : '')); fail.push(name); }
};

const url = 'file:///' + path.resolve('index.html').split(path.sep).join('/');

async function load(server, local) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.setInputFiles('#clsServerFileInput', path.resolve(server));
  await page.setInputFiles('#clsLocalFileInput', path.resolve(local));
  await page.waitForTimeout(700);
  await page.click('#btnClassify');
  await page.waitForSelector('#clsResults', { state: 'visible', timeout: 120000 });
  await page.waitForTimeout(2500);
  return { page, errors };
}

// ------------------------------------------------------------- 1) sorcerer
const sorc = await load('logs/alumnishocks 2 server log.txt', 'logs/alumnishocks 2 localchat.txt');
const s = await sorc.page.evaluate(() => {
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const res = window.__lastClassifierResult || {};
  const trace = res.turnTrace || [];
  return {
    perks: text(document.querySelector('#clsResults .cls-summary-perks')),
    legend: text(document.querySelector('#clsResults .cls-conv-legend')),
    section: text(document.querySelector('#clsResults .cls-conv-section')),
    lostChips: document.querySelectorAll('#clsResults .cls-conv-chips [data-conv-turn]').length,
    bands: (() => {
      const c = document.getElementById('clsTimelineHits');
      if (!c) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 15 && d[i + 1] > 25 && d[i] < 60) n++;
      return n;
    })(),
    lostIndex: trace.findIndex(t => t.stanceConversion && t.stanceConversion.result === 'lost'),
  };
});
check('perks mostra Master of Thunder inferida', /Master of Thunder/.test(s.perks || '') && /inferida|inferred/i.test(s.perks || ''), s.perks);
check('legenda de conversão aparece com aproveitada e perdida',
  /aproveitada|used/i.test(s.legend || '') && /perdida|lost/i.test(s.legend || ''), s.legend);
check('seção de conversão elemental aparece com tabela por magia',
  /Conversão elemental|Elemental conversion/.test(s.section || '') && /Death Echo/.test(s.section || '') && /Hell's Core/.test(s.section || ''), s.section);
check('seção lista os turnos perdidos como chips', s.lostChips === 2, String(s.lostChips));
// As faixas têm de estar desenhadas SEM hover: o gráfico nasce sem animação e desenhava
// antes das marcas existirem.
check('faixas de conversão desenhadas sem passar o mouse', s.bands > 1000, String(s.bands));
check('existe turno com conversão perdida no trace', s.lostIndex >= 0, String(s.lostIndex));

// ------------------------------------------------ 2) chip no detalhe do turno
if (s.lostIndex >= 0) {
  const chip = await sorc.page.evaluate(idx => {
    const res = window.__lastClassifierResult;
    if (typeof renderTurnDetail !== 'function') return 'renderTurnDetail ausente';
    renderTurnDetail(res.turnTrace, res, idx);
    const el = document.querySelector('.cls-turn-detail .cls-conv-pill.is-lost');
    return el ? el.textContent.trim() : null;
  }, s.lostIndex);
  check('detalhe do turno mostra o chip de conversão perdida', /perdida|lost/i.test(chip || ''), chip);
}
check('nenhum erro de página no sorcerer', sorc.errors.length === 0, sorc.errors.slice(0, 3).join(' | '));

// ---------------------------------------------------------------- 3) knight
const knight = await load('logs/tom server log.txt', 'logs/tom local chat.txt');
const k = await knight.page.evaluate(() => {
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  return {
    perks: text(document.querySelector('#clsResults .cls-summary-perks')),
    legend: !!document.querySelector('#clsResults .cls-conv-legend'),
  };
});
check('knight não mostra estância elemental', !/Estância elemental|Elemental stance/.test(k.perks), k.perks);
check('knight não mostra legenda de conversão', k.legend === false);

await browser.close();
if (fail.length) {
  console.log(`\n${fail.length} falha(s)`);
  process.exit(1);
}
console.log('\nui sorcerer stance: ok');
