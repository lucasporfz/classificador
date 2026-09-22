// PROTOTYPE — throwaway. Mede se clicar no switch move algo — vertical OU horizontal.
// Para cada célula das tabelas mede o retângulo do PRIMEIRO NÓ DE TEXTO (o número em si,
// não a célula), porque o "+N" inline empurrava o número numa coluna alinhada à direita
// sem mudar a caixa da célula. Qualquer delta != 0 é regressão de layout.
import { chromium } from 'playwright';
import path from 'node:path';
const [sv, lc] = process.argv.slice(2);
const url = 'file:///' + path.resolve('prototypes/full-ui.prototype.html').split(path.sep).join('/');
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.goto(url);
await page.setInputFiles('#clsServerFileInput', path.resolve(sv));
await page.setInputFiles('#clsLocalFileInput', path.resolve(lc));
await page.waitForTimeout(800);
await page.click('#btnClassify');
await page.waitForSelector('#clsResults', { state: 'visible', timeout: 60000 });
await page.waitForTimeout(2500);

const probe = () => page.evaluate(() => {
  const out = [];
  const box = (name, el) => {
    const r = el.getBoundingClientRect();
    out.push([name, Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)]);
  };
  // retângulo do primeiro nó de texto não vazio (o número), não o da célula
  const textBox = (name, el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width || r.height) {
        out.push([name, Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)]);
      }
      return;
    }
    out.push([name, null, null, null, null]);
  };
  document.querySelectorAll('#clsResults h3.cls-h').forEach((h, i) => box('h3[' + i + '] ' + h.textContent.trim().slice(0, 24), h));
  document.querySelectorAll('#clsResults .cls-share-row').forEach((r, i) => box('share[' + i + ']', r));
  document.querySelectorAll('#clsResults .cls-rotation-table thead th').forEach((th, i) => textBox('rotTh[' + i + ']', th));
  document.querySelectorAll('#clsResults .cls-rotation-table tbody tr').forEach((tr, i) => {
    box('rotRow[' + i + ']', tr);
    [].forEach.call(tr.children, (td, j) => textBox('rotCell[' + i + ',' + j + ']', td));
  });
  document.querySelectorAll('#clsResults canvas').forEach((c, i) => box('canvas[' + i + ']', c));
  box('documentHeight', document.body);
  return out;
});

const before = await probe();
await page.click('.proto-switch-track');
await page.waitForTimeout(900);
const after = await probe();

// só as células cujo VALOR realmente muda: dano com crítico e dano total.
// A coluna 'sem crítico' NÃO entra: se ela se mexer, é bug.
const NUMERIC_CHANGES = /rotCell\[\d+,(5|6)\]|share/;
let bad = 0;
before.forEach((row, i) => {
  const a = after[i];
  if (!a || a[0] !== row[0]) { console.log('  ESTRUTURA MUDOU: ' + row[0] + ' -> ' + (a && a[0])); bad++; return; }
  const moved = ['left', 'top', 'width', 'height'].filter((k, j) => a[j + 1] !== row[j + 1]);
  if (!moved.length) return;
  // o número em si cresce de dígitos quando o charm entra (972.491 -> 1.067.024): numa
  // coluna alinhada à direita a borda ESQUERDA muda por isso, e não por layout.
  const onlyWidthGrowth = moved.every(k => k === 'left' || k === 'width') && NUMERIC_CHANGES.test(row[0]);
  if (onlyWidthGrowth) return;
  console.log('  MOVEU: ' + row[0] + '  [' + moved.join(',') + ']  ' +
    row.slice(1).join('/') + '  ->  ' + a.slice(1).join('/'));
  bad++;
});
console.log(bad ? '\n' + bad + ' elemento(s) mudaram de posicao' : 'OK: nada moveu ao ligar o switch (' + before.length + ' medidas)');
if (errs.length) console.log('ERROS:\n' + errs.join('\n'));
await b.close();
process.exit(bad ? 1 : 0);
