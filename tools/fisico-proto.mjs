#!/usr/bin/env node
// fisico-proto.mjs — protótipo + teste sintético do EIXO 2-FÍSICO do modelo unificado:
// separar AA × spell física (Ethereal Barrage, `exori dir moe`) pela INTERSEÇÃO do original
// implícito após reverter a subtração de armadura. NÃO há fixture real de Ethereal Barrage, então
// validamos a MATEMÁTICA com dados sintéticos sobre parâmetros REAIS de mob (armor/res/mit), e
// medimos honestamente o LIMITE DE RESOLUÇÃO (doc §5): |O_aa − O_barrage| ≳ floor(armor/2)/res.
//
// Cadeia forward (doc §1, físico): obs = floor( ceil((O·res − A)·crit) · mit · prey ),
//   A ∈ [r, R], r = floor(armor/2), R = 2r−1   (subtração de armadura, só físico).
// Reversão: M = obs / prey / mit / crit ≈ O·res − A  ⇒  O ∈ [ (M+r)/res , (M+R)/res ].
// Crit CANCELA na divisão ⇒ a largura do intervalo independe de crit (doc §1).

const MOBS = [
  { name: 'darklight striker', res: 0.9, armor: 112, mit: 3.1 },
  { name: 'walking pillar',    res: 1.1, armor: 120, mit: 2.75 },
  { name: 'darklight matter',  res: 1.1, armor: 98,  mit: 3.28 },
  { name: 'darklight source',  res: 1.1, armor: 115, mit: 3.19 },
];
const rOf = m => Math.floor(m.armor / 2);
const Rof = m => 2 * rOf(m) - 1;
const mitMul = m => (1 - m.mit / 100);

function forward(O, m, { crit = 1, prey = 1 } = {}) {
  const r = rOf(m), R = Rof(m);
  const A = r + Math.floor(Math.random() * (R - r + 1)); // A ~ U[r,R]
  let d = O * m.res - A;
  d = Math.ceil(d * crit);
  d = d * mitMul(m) * prey;
  return Math.floor(d);
}
function interval(obs, m, { crit = 1, prey = 1 } = {}) {
  const r = rOf(m), R = Rof(m);
  const M = obs / prey / mitMul(m) / crit; // ≈ O·res − A
  // folga de arredondamento: o floor final e o ceil do crit deixam M incerto em ~±2 (ampliado
  // por 1/mit). Alarga o intervalo de O para não perder o original por resíduo (cf. Stage 0).
  const slack = 2 / mitMul(m);
  return [(M + r - slack) / m.res, (M + R + slack) / m.res]; // [O_lo, O_hi]
}
const intersect = (a, b) => { const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]); return lo <= hi ? [lo, hi] : null; };

// Caminha a sequência (ordem de seq) acumulando a interseção dos intervalos de O. Quando o
// próximo hit NÃO admite o O comum corrente, abre um novo grupo (fronteira AA→Barrage).
function segment(hits) {
  const groups = [];
  let cur = null, acc = null;
  for (const h of hits) {
    if (!cur) { cur = [h]; acc = h.iv; continue; }
    const nx = intersect(acc, h.iv);
    if (nx) { acc = nx; cur.push(h); }
    else { groups.push({ hits: cur, O: acc }); cur = [h]; acc = h.iv; }
  }
  if (cur) groups.push({ hits: cur, O: acc });
  return groups;
}

// ---- testes ----
let pass = 0, fail = 0;
const check = (name, cond, info) => { if (cond) { console.log(`PASS ${name}`); pass++; } else { console.log(`FAIL ${name}  ${info || ''}`); fail++; } };
const widthOf = m => rOf(m) / m.res; // largura do intervalo de O p/ esse mob

// genérico: gera 1 hit por mob para um dado O, opcionalmente crit/prey aleatório.
function genHits(O, opts = {}) {
  return MOBS.map((m, i) => {
    const o = { crit: opts.crit ? 1.5 : 1, prey: opts.prey ? 1.25 : 1 };
    const obs = forward(O, m, o);
    return { mob: m.name, seq: (opts.seq0 || 0) + i, obs, iv: interval(obs, m, o), O };
  });
}

// TESTE 1 — AA-only: os intervalos de O de todos os mobs têm que CRUZAR num valor comum ~O_aa.
(() => {
  const O_aa = 1000;
  let ok = 0, n = 50;
  for (let t = 0; t < n; t++) {
    const hits = genHits(O_aa, { crit: t % 2 === 0 });
    let acc = hits[0].iv;
    for (const h of hits.slice(1)) acc = acc && intersect(acc, h.iv);
    if (acc && acc[0] <= O_aa && O_aa <= acc[1]) ok++;
  }
  check('AA-only: interseção comum contém O_aa', ok === n, `${ok}/${n}`);
})();

// TESTE 2 — AA + Barrage SEPARÁVEIS quando |ΔO| >> largura. Sequência AA×4 → Barrage×4.
(() => {
  const O_aa = 1000, O_bar = 1300; // ΔO=300, largura máx ~ 60/0.9≈67
  let ok = 0, n = 50;
  for (let t = 0; t < n; t++) {
    const aa = genHits(O_aa, { seq0: 0, crit: false });
    const bar = genHits(O_bar, { seq0: 10, crit: true }); // Barrage saiu crit (coincidência) — não deve atrapalhar
    const groups = segment([...aa, ...bar].sort((a, b) => a.seq - b.seq));
    // espera 2 grupos: o 1º (sempre presente) = AA, o 2º = Barrage
    if (groups.length === 2 && groups[0].hits.length === 4 && groups[1].hits.length === 4) ok++;
  }
  check('AA+Barrage separáveis (ΔO=300)', ok >= n * 0.9, `${ok}/${n} (≥90%)`);
})();

// TESTE 3 — LIMITE DE RESOLUÇÃO (honesto, doc §5): a separabilidade DEGRADA quando ΔO encolhe
// rumo à largura do intervalo. Não é um corte seco (acumular hits afia a interseção), mas a
// confiabilidade cai claramente na zona de sobreposição. Reporta a taxa por ΔO e exige
// monotonicidade (perto=confiável, zona de overlap=não-confiável).
(() => {
  const wMax = Math.max(...MOBS.map(widthOf));
  const sepRate = dO => {
    let ok = 0, n = 80;
    for (let t = 0; t < n; t++) {
      const aa = genHits(1000, { seq0: 0 });
      const bar = genHits(1000 + dO, { seq0: 10 });
      const g = segment([...aa, ...bar].sort((a, b) => a.seq - b.seq));
      if (g.length === 2 && g[0].hits.length === 4 && g[1].hits.length === 4) ok++;
    }
    return ok / n;
  };
  const deltas = [4, 2, 1, 0.5, 0.25].map(f => Math.round(wMax * f));
  const rates = deltas.map(sepRate);
  console.log(`  larguras de O por mob: ${MOBS.map(m => m.name.split(' ')[1] + '=' + widthOf(m).toFixed(0)).join(', ')}`);
  console.log('  ΔO → taxa de separação correta:');
  deltas.forEach((d, i) => console.log(`    ΔO=${String(d).padStart(4)} (${(d / wMax).toFixed(2)}×largura): ${(rates[i] * 100).toFixed(0)}%`));
  // longe (ΔO≥2×largura) deve ser ~confiável; na zona de overlap (ΔO≤0.5×largura) deve cair.
  check('limite de resolução: confiável longe, degrada no overlap',
    rates[0] >= 0.95 && rates[rates.length - 1] <= 0.8 && rates[0] > rates[rates.length - 1],
    `longe=${(rates[0] * 100).toFixed(0)}% overlap=${(rates[rates.length - 1] * 100).toFixed(0)}%`);
})();

console.log(`\n${pass}/${pass + fail} testes do eixo físico ok`);
process.exit(fail ? 1 : 0);
