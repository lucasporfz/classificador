// Fonte única dos pares de fixture do corpus: varre logs/ e pareia cada server log
// com seu local chat pela "chave" do arquivo (o nome sem o marcador server/local).
//
// Antes disso cada tool carregava seu próprio array hardcoded, e as listas divergiam:
// um par novo em logs/ não entrava em lugar nenhum (ex.: "death echo" existia no
// report e não no dump), e entradas apontando para arquivos já removidos viravam
// MISSING silencioso — igual no baseline e no after, então o diff dava vazio e a
// cobertura caía sem ninguém ver. Agora largar o par em logs/ basta.
import fs from 'node:fs';
import path from 'node:path';

const SERVER_RE = /server\s*log/i;
const LOCAL_RE = /local\s*chat/i;

// "uhax 2 server log ed.txt" -> "uhax 2 ed"; "Local Chat bakra.txt" -> "bakra";
// "localchat6.txt" -> "6"; "Mrowdy Server Log - Copia.txt" -> "mrowdy copia".
export function fixtureKey(fileName) {
  return path.basename(fileName, path.extname(fileName))
    .replace(SERVER_RE, ' ')
    .replace(LOCAL_RE, ' ')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

// Rótulos já em uso em relatórios e em chaves de caso conhecido
// (`isKnownAcceptedUnresolved`, `isKnownMultiLeechSetupSession`) e citados na skill.
// Sem override, o rótulo é a própria chave derivada — fixture novo não precisa entrar aqui.
const LABEL_OVERRIDES = {
  'bastion ek': 'bastion',
  'night harpy ek': 'night harpy',
  'rp': 'rp pack',
  'uhax 2 ed': 'uhax 2',
  'uhax 3 ed': 'uhax 3',
  '6': 'serverlog6',
  '7': 'serverlog7',
  '8': 'serverlog8',
  '9': 'serverlog9',
};

// Retorna [{ key, label, server, local }] ordenado por chave (ordem estável entre runs).
// Arquivo solto, sem marcador, ou chave duplicada vira aviso no stderr — nunca sumiço mudo.
export function discoverFixturePairs({ logDir = 'logs', warn = msg => console.error(msg) } = {}) {
  const byKey = new Map();
  for (const file of fs.readdirSync(logDir).filter(f => f.toLowerCase().endsWith('.txt'))) {
    const isServer = SERVER_RE.test(file);
    const isLocal = LOCAL_RE.test(file);
    if (isServer === isLocal) { warn(`[fixtures] ignorado (nem server log nem local chat): ${file}`); continue; }
    const key = fixtureKey(file);
    const slot = isServer ? 'server' : 'local';
    const entry = byKey.get(key) || { key, server: null, local: null };
    if (entry[slot]) { warn(`[fixtures] chave duplicada "${key}": ${entry[slot]} e ${file}`); continue; }
    entry[slot] = file;
    byKey.set(key, entry);
  }
  const pairs = [];
  for (const entry of [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))) {
    if (!entry.server || !entry.local) {
      warn(`[fixtures] par incompleto "${entry.key}": falta o ${entry.server ? 'local chat' : 'server log'}`);
      continue;
    }
    pairs.push({ key: entry.key, label: LABEL_OVERRIDES[entry.key] || entry.key, server: entry.server, local: entry.local });
  }
  return pairs;
}
