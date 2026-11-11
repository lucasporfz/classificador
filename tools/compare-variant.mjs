// Compara duas medições do corpus feitas por tools/audit-tolerance-residuals.mjs: turno por
// turno e setup por valor. "0 perdidos" sozinho não prova nada: um turno pode trocar de
// partição sem sair de resolved, e a sessão pode mudar de setup sem mudar nenhum turno.
//
// Uso:
//   node tools/compare-variant.mjs <referência> <variante> [--list] [--max 60] [--pair texto] [--allow-partial]
// Se um lado tem par que o outro não tem, aborta sem resumo (saída 2). --allow-partial compara
// só os pares presentes nos dois lados.
// Cada lado é uma pasta de JSON ou o nome de uma pasta em reports/tolerance-audit.
//
// Turno (a referência é o "antes"):
//   perdido  resolved -> outro status, ou o turno sumiu
//   ganho    outro status -> resolved
//   trocado  resolved -> resolved: partição (muda hit, componente ou status), rótulo ou só omega
//   outro    continua sem resolver, mas mudou
//   novo     turno só na variante
// Setup: "valor" compara os campos que decidem; "só diagnóstico" é hash diferente com esses
// campos iguais; "não comparável" é campo cortado pelo limite de 400 caracteres da medição.
//
// Saída: 0 = iguais; 1 = há diferença; 2 = uso inválido ou medição incompleta.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Campos que decidem, por chave de setup. Chave fora daqui compara o texto inteiro.
export const SETUP_FIELDS = {
  leechSetup: ['lifeBase', 'manaBase', 'lifeBaseKnown', 'manaBaseKnown', 'exposeWeaknessManaPerk', 'vampiricMob', 'voidsMob'],
  bountyTalismanSetup: ['level', 'multiplier'],
  gravSanSetup: ['bonus', 'multiplier'],
  stanceSetup: ['hasStanceCasts'],
  bestiaryClassDamageBonus: ['bonus', 'class'],
  critSetup: ['byComponent', 'fallback'],
  bmPierceDetection: ['pierce', 'active'],
};

function readField(serialized, field) {
  const text = String(serialized ?? '');
  const key = `"${field}":`;
  const at = text.indexOf(key);
  if (at < 0) return { absent: true, cut: text.length >= 400 };
  const from = at + key.length;
  if (text[from] === '{') {
    const close = text.indexOf('}', from);
    return close < 0 ? { cut: true } : { value: text.slice(from, close + 1) };
  }
  const m = /^("[^"]*"|[^,}]*)([,}]?)/.exec(text.slice(from));
  // Sem terminador, o valor pode ter sido cortado no meio.
  return m[2] ? { value: m[1] } : { cut: true };
}

// Objeto (ex.: critSetup.byComponent) compara por valor: a ordem das chaves não decide nada.
function sortedKeys(value) {
  if (value == null || value[0] !== '{') return value;
  try {
    const obj = JSON.parse(value);
    return JSON.stringify(Object.fromEntries(Object.keys(obj).sort().map(k => [k, obj[k]])));
  } catch { return value; }
}

export function compareSetupKey(key, before, after) {
  const fields = SETUP_FIELDS[key];
  if (!fields) return { changes: before === after ? [] : [`${before} -> ${after}`], cut: [] };
  const changes = [];
  const cut = [];
  for (const field of fields) {
    const a = readField(before, field);
    const b = readField(after, field);
    if (a.cut || b.cut) { cut.push(field); continue; }
    if (sortedKeys(a.value) !== sortedKeys(b.value)) changes.push(`${field} ${a.value ?? '—'} -> ${b.value ?? '—'}`);
  }
  return { changes, cut };
}

const parseSig = sig => {
  const [status, ...rest] = String(sig).split('|');
  const body = rest.join('|');
  return { status, comps: body ? body.split(',') : [] };
};
// Forma do sig: status|comp:rótulo:h0.h3w,comp:rótulo:h1 (w = hit com omega).
const hitsOf = comp => comp.slice(comp.lastIndexOf(':') + 1);
const headOf = comp => comp.slice(0, comp.lastIndexOf(':'));
const noOmega = hits => hits.split('.').map(h => h.replace(/w$/, '')).join('.');
const compName = comp => comp.slice(0, comp.indexOf(':'));

export function classifySwap(sigBefore, sigAfter) {
  const a = parseSig(sigBefore);
  const b = parseSig(sigAfter);
  const shape = (s, f) => [s.status, ...s.comps.map(f)].join(',');
  const partition = s => shape(s, c => `${compName(c)}:${noOmega(hitsOf(c))}`);
  if (partition(a) !== partition(b)) return 'particao';
  if (shape(a, headOf) !== shape(b, headOf)) return 'rotulo';
  return 'so_omega';
}

const turnKeys = turns => {
  const seen = new Map();
  return turns.map(t => {
    const n = seen.get(t.ts) || 0;
    seen.set(t.ts, n + 1);
    return `${t.ts}#${n}`;
  });
};

const describe = t => {
  if (!t) return '(sumiu)';
  const comps = (t.comps || []).map(c => `${c.comp}${c.n}${c.label ? `(${c.label})` : ''}`).join(' ');
  return `${t.status}${comps ? ` ${comps}` : ''}${t.reason ? ` [${t.reason}]` : ''}`;
};

// `ref` e `other`: Map pair -> JSON da medição.
export function compareDumps(ref, other) {
  const r = {
    iguais: 0,
    turnos: { perdido: [], ganho: [], particao: [], rotulo: [], so_omega: [], outro: [], novo: [] },
    setup: { valor: [], soDiagnostico: {}, naoComparavel: [], soUmLado: {} },
    incompleto: [],
    erros: [],
    mesmoErro: 0,
  };
  const pairs = new Set([...ref.keys(), ...other.keys()]);
  for (const pair of pairs) {
    const a = ref.get(pair);
    const b = other.get(pair);
    if (!a || !b) { r.incompleto.push(`par ${pair} só em ${a ? 'referência' : 'variante'}`); continue; }
    const indexes = new Set([...a.sessions, ...b.sessions].map(s => s.index));
    for (const index of indexes) {
      const s = a.sessions.find(x => x.index === index);
      const v = b.sessions.find(x => x.index === index);
      if (!s || !v) { r.incompleto.push(`${pair} S${index} só em ${s ? 'referência' : 'variante'}`); continue; }
      const where = `${pair} S${index} ${s.date}`;
      // O mesmo erro nos dois lados (ex.: log curto demais) não é diferença entre motores.
      if (s.error !== v.error) r.erros.push(`${where}: ${s.error || '-'} -> ${v.error || '-'}`);
      else if (s.error) r.mesmoErro++;
      compareSetups(r, where, s, v);
      compareTurns(r, where, s, v);
    }
  }
  return r;
}

function compareSetups(r, where, s, v) {
  if (!s.setup || !v.setup) return;
  for (const key of new Set([...Object.keys(s.setup), ...Object.keys(v.setup)])) {
    if (s.setup[key] === v.setup[key]) continue;
    // Medição de versão anterior da ferramenta: a chave não existia, não houve mudança de valor.
    if (!(key in s.setup) || !(key in v.setup)) { r.setup.soUmLado[key] = (r.setup.soUmLado[key] || 0) + 1; continue; }
    const { changes, cut } = compareSetupKey(key, s.setupValues?.[key], v.setupValues?.[key]);
    if (changes.length) r.setup.valor.push(`${where} ${key}: ${changes.join('; ')}`);
    else if (cut.length) r.setup.naoComparavel.push(`${where} ${key}: ${cut.join(', ')}`);
    else r.setup.soDiagnostico[key] = (r.setup.soDiagnostico[key] || 0) + 1;
  }
}

function compareTurns(r, where, s, v) {
  const keysA = turnKeys(s.turns);
  const keysB = turnKeys(v.turns);
  const byKey = new Map(keysB.map((k, i) => [k, v.turns[i]]));
  const inRef = new Set(keysA);
  s.turns.forEach((t, i) => {
    const u = byKey.get(keysA[i]);
    if (u && u.sig === t.sig) { r.iguais++; return; }
    const line = `${where} ${t.clock}: ${describe(t)} -> ${describe(u)}`;
    const wasResolved = t.status === 'resolved';
    const isResolved = !!u && u.status === 'resolved';
    if (wasResolved && !isResolved) r.turnos.perdido.push(line);
    else if (!wasResolved && isResolved) r.turnos.ganho.push(line);
    else if (wasResolved) r.turnos[classifySwap(t.sig, u.sig)].push(line);
    else r.turnos.outro.push(line);
  });
  v.turns.forEach((u, i) => {
    if (!inRef.has(keysB[i])) r.turnos.novo.push(`${where} ${u.clock}: ${describe(u)}`);
  });
}

function loadDump(arg) {
  const dir = fs.existsSync(arg) ? arg : path.join(ROOT, 'reports', 'tolerance-audit', arg);
  if (!fs.existsSync(dir)) throw new Error(`pasta não encontrada: ${arg}`);
  const dumps = new Map();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    dumps.set(json.pair, json);
  }
  if (!dumps.size) throw new Error(`pasta sem medição: ${dir}`);
  return dumps;
}

function main() {
  const args = process.argv.slice(2);
  const take = flag => {
    const i = args.indexOf(flag);
    return i < 0 ? null : args.splice(i, 2)[1];
  };
  const list = args.includes('--list');
  if (list) args.splice(args.indexOf('--list'), 1);
  const max = +(take('--max') || 60);
  const pairFilter = take('--pair');
  const allowPartial = args.includes('--allow-partial');
  if (allowPartial) args.splice(args.indexOf('--allow-partial'), 1);
  if (args.length !== 2 || args.some(a => a.startsWith('--'))) {
    console.error('Uso: node tools/compare-variant.mjs <referência> <variante> [--list] [--max 60] [--pair texto] [--allow-partial]');
    return 2;
  }
  let ref;
  let other;
  try {
    [ref, other] = args.map(loadDump);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  if (pairFilter) {
    for (const map of [ref, other]) for (const key of [...map.keys()]) if (!key.includes(pairFilter)) map.delete(key);
  }
  const onlyOne = [...new Set([...ref.keys(), ...other.keys()])].filter(k => !ref.has(k) || !other.has(k));
  if (onlyOne.length && !allowPartial) {
    console.error(`MEDIÇÃO INCOMPLETA: ${onlyOne.length} par(es) só num lado (${onlyOne.slice(0, 5).join(', ')}${onlyOne.length > 5 ? ', ...' : ''}). Nada comparado. Use --pair ou --allow-partial.`);
    return 2;
  }
  for (const k of onlyOne) { ref.delete(k); other.delete(k); }
  const r = compareDumps(ref, other);
  const t = r.turnos;
  const swaps = t.particao.length + t.rotulo.length + t.so_omega.length;
  console.log(`${args[0]} -> ${args[1]}: ${ref.size} pares`);
  console.log(`turnos: iguais ${r.iguais}, perdidos ${t.perdido.length}, ganhos ${t.ganho.length}, trocados ${swaps} (partição ${t.particao.length}, rótulo ${t.rotulo.length}, só omega ${t.so_omega.length}), outros ${t.outro.length}, novos ${t.novo.length}`);
  console.log(`setup: valor ${r.setup.valor.length}, só diagnóstico ${JSON.stringify(r.setup.soDiagnostico)}, não comparável ${r.setup.naoComparavel.length}, chave só de um lado ${JSON.stringify(r.setup.soUmLado)}`);
  if (r.mesmoErro) console.log(`sessões com o mesmo erro nos dois lados: ${r.mesmoErro}`);
  for (const line of r.incompleto) console.log(`INCOMPLETO ${line}`);
  for (const line of r.erros) console.log(`ERRO ${line}`);
  // Mudança de setup e partição sempre aparecem; --list abre o resto.
  const show = (name, rows) => {
    for (const row of rows.slice(0, max)) console.log(`  ${name}: ${row.slice(0, 320)}`);
    if (rows.length > max) console.log(`  ${name}: ... mais ${rows.length - max}`);
  };
  show('perdido', t.perdido);
  show('partição', t.particao);
  show('setup', r.setup.valor);
  show('não comparável', r.setup.naoComparavel);
  if (list) for (const [name, rows] of [['ganho', t.ganho], ['rótulo', t.rotulo], ['só omega', t.so_omega], ['outro', t.outro], ['novo', t.novo]]) show(name, rows);
  if (r.incompleto.length || r.erros.length) return 2;
  const differs = swaps || t.perdido.length || t.ganho.length || t.outro.length || t.novo.length
    || r.setup.valor.length || r.setup.naoComparavel.length;
  return differs ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
