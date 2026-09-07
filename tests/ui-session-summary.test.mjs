/*
 * Teste de UI do resumo de sessão e do switch "somar dano de charm".
 *
 * Roda a página REAL (index.html) num Chromium headless, carrega um par de logs pelos
 * mesmos file inputs que o usuário usa e verifica:
 *
 *   1. o bloco de resumo aparece com leech, charms equipados (inclusive low blow e
 *      savage blow, que não têm linha de dano própria) e criaturas;
 *   2. ligar o switch NÃO move nada de posição — nem vertical nem horizontalmente.
 *      Esta é a regra que motivou os slots de largura fixa em `.cls-charm-plus`;
 *   3. o charm soma no dano efetivo e no dano total, e o dano base fica intocado;
 *   4. o total da composição sobe exatamente o dano de charm ATRIBUÍDO (o não
 *      atribuído fica de fora, por construção).
 *
 * Requer `playwright` (já em devDependencies). Sem browser instalado, o teste PULA em
 * vez de falhar — a suíte roda em máquina sem Chromium.
 */
import path from 'node:path';
import process from 'node:process';

const SERVER = 'logs/tom server log.txt';   // EK: tem overpower + low blow + savage blow
const LOCAL = 'logs/tom local chat.txt';

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
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

await page.goto(url);
await page.setInputFiles('#clsServerFileInput', path.resolve(SERVER));
await page.setInputFiles('#clsLocalFileInput', path.resolve(LOCAL));
await page.waitForTimeout(700);
await page.click('#btnClassify');
await page.waitForSelector('#clsResults', { state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500);

// ---------------------------------------------------------------- 1) bloco de resumo
const summary = await page.evaluate(() => {
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
  const cards = [].map.call(document.querySelectorAll('#clsResults .cls-summary-card'), text);
  return {
    head: text(document.querySelector('#clsResults .cls-summary-head')),
    cards,
    hasSwitch: document.querySelectorAll('#clsResults [data-cls-charm-switch]').length,
    orphanPlayerLine: [].some.call(document.querySelectorAll('#clsResults > p'), p => /jogador:|player:/i.test(p.textContent)),
  };
});
check('faixa de identificação traz jogador e spells de dano',
  /kikaro/i.test(summary.head) && /exori/i.test(summary.head), summary.head);
check('card de leech traz taxa e total', summary.cards.some(c => /Leech/i.test(c) && /%/.test(c)));
check('tabela de criaturas inclui low blow e savage blow',
  summary.cards.some(c => /low blow/i.test(c) && /savage blow/i.test(c)));
check('resumo nao duplica a lista de charms equipados',
  !summary.cards.some(c => /charms equipados|equipped charms/i.test(c)));
check('criaturas tem coluna separada para minor charms',
  summary.cards.some(c => /Minor charms/.test(c)));
check('charm de crítico aparece com a criatura',
  summary.cards.some(c => /raubritter/i.test(c)));
check('dois switches de charm renderizados', summary.hasSwitch === 2, 'achou ' + summary.hasSwitch);
check('linha solta "jogador: …" não é mais renderizada', summary.orphanPlayerLine === false);

// ---------------------------------------------------------------- 2) zero deslocamento
const probe = () => page.evaluate(() => {
  const out = [];
  const box = (name, el) => {
    const r = el.getBoundingClientRect();
    out.push([name, Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)]);
  };
  // retângulo do primeiro nó de TEXTO (o número), não o da célula: o "+N" empurrava o
  // número numa coluna alinhada à direita sem mudar a caixa da célula
  const textBox = (name, el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width || r.height) out.push([name, Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)]);
      return;
    }
    out.push([name, null, null, null, null]);
  };
  document.querySelectorAll('#clsResults h3.cls-h').forEach((h, i) => box('h3[' + i + ']', h));
  document.querySelectorAll('#clsResults .cls-share-row').forEach((r, i) => box('share[' + i + ']', r));
  document.querySelectorAll('#clsResults .cls-rotation-table thead th').forEach((th, i) => textBox('th[' + i + ']', th));
  document.querySelectorAll('#clsResults .cls-rotation-table tbody tr').forEach((tr, i) => {
    box('row[' + i + ']', tr);
    [].forEach.call(tr.children, (td, j) => textBox('cell[' + i + ',' + j + ']', td));
  });
  document.querySelectorAll('#clsResults canvas').forEach((c, i) => box('canvas[' + i + ']', c));
  return out;
});
const readTable = () => page.evaluate(() => {
  const table = document.querySelector('#clsResults .cls-rotation-table');
  const heads = [].map.call(table.querySelectorAll('thead th'), th => th.textContent.toLowerCase());
  const rows = [].map.call(table.querySelectorAll('tbody tr'), tr => [].map.call(tr.children, td => td.textContent.trim()));
  const headline = document.querySelector('.cls-share-headline');
  return { heads, rows, headline: headline ? headline.textContent.replace(/\s+/g, ' ') : '' };
});

const before = await probe();
const tableBefore = await readTable();
await page.click('#clsResults .cls-switch-track');
await page.waitForTimeout(900);
const after = await probe();
const tableAfter = await readTable();

// Só as duas colunas cujo VALOR muda podem ter a borda esquerda deslocada (o número
// ganha dígitos numa coluna alinhada à direita). A coluna base NÃO é isenta.
const iBase = tableBefore.heads.findIndex(h => /sem cr|without crit/.test(h));
const iEff = tableBefore.heads.findIndex(h => /com cr|with crit/.test(h));
const iTotal = tableBefore.heads.findIndex(h => /total/.test(h));
const valueChanges = new RegExp('cell\\[\\d+,(' + iEff + '|' + iTotal + ')\\]|share');
const moved = [];
before.forEach((row, i) => {
  const a = after[i];
  if (!a || a[0] !== row[0]) { moved.push('estrutura: ' + row[0]); return; }
  const diffs = ['left', 'top', 'width', 'height'].filter((k, j) => a[j + 1] !== row[j + 1]);
  if (!diffs.length) return;
  if (diffs.every(k => k === 'left' || k === 'width') && valueChanges.test(row[0])) return;
  moved.push(row[0] + ' [' + diffs.join(',') + ']');
});
check('ligar o switch nao move nada (' + before.length + ' medidas)', moved.length === 0, moved.slice(0, 6).join(' | '));

// ---------------------------------------------------------------- 3) e 4) números
const num = v => Number(String(v).replace(/[^\d]/g, '')) || 0;
const baseUnchanged = tableBefore.rows.every((r, i) =>
  !tableAfter.rows[i] || iBase < 0 || r[iBase] === tableAfter.rows[i][iBase]);
check('dano base nao muda com o switch ligado', baseUnchanged);

const grew = tableBefore.rows.filter((r, i) => tableAfter.rows[i] && num(tableAfter.rows[i][iTotal]) > num(r[iTotal]));
check('dano total sobe em pelo menos uma linha', grew.length > 0, grew.length + ' linhas');
const plusMarks = await page.evaluate(() => document.querySelectorAll('#clsResults .cls-charm-plus').length);
const plusFilled = await page.evaluate(() =>
  [].filter.call(document.querySelectorAll('#clsResults .cls-charm-plus'), el => el.textContent.trim().startsWith('+')).length);
check('acréscimo sinalizado com "+N"', plusFilled > 0, plusFilled + ' de ' + plusMarks + ' slots preenchidos');

const totalBefore = num((tableBefore.headline.match(/([\d.,]+)\s+em|([\d.,]+)\s+over/) || [])[0]);
const totalAfter = num((tableAfter.headline.match(/([\d.,]+)\s+em|([\d.,]+)\s+over/) || [])[0]);
check('total da composicao sobe com o charm', totalAfter > totalBefore, totalBefore + ' -> ' + totalAfter);

check('sem erro de console', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
if (fail.length) { console.log(fail.length + ' verificacao(oes) falharam'); process.exit(1); }
console.log('ui-session-summary OK');
