import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';

import { discoverFixturePairs } from './fixture-pairs.mjs';

export const ENGINE_FILES = Object.freeze([
  'js/stats.js',
  'js/mob-element-mods.js',
  'js/mob-element-mods-post-2026-06-16.js',
  'js/unified-formulas.js',
  'js/unified-parsing.js',
  'js/unified-setup-inference.js',
  'js/unified-validation.js',
  'js/unified-turn-resolution.js',
  'js/unified-classification-engine.js',
]);

export const CORPUS_EXCLUSIONS = Object.freeze([
  Object.freeze({
    id: 'temporary-drome-fixture',
    server: 'Server Log drome.txt',
    reason: 'Duplicata de bakra com problema conhecido, excluida a pedido do usuario.',
  }),
  Object.freeze({
    id: 'temporary-jaded-session-2026-06-09-093047',
    server: 'jaded Server Log.txt',
    year: 2026,
    month: 6,
    day: 9,
    saveSec: (9 * 3600) + (30 * 60) + 47,
    reason: 'Sessao de jaded com problema conhecido, excluida a pedido do usuario.',
  }),
]);

const MONTHS = Object.freeze({
  Jan: 1,
  Feb: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Sept: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12,
});

const HEADER_RE = /^Channel .+ saved \w+ (\w+) +(\d+) (\d{1,2}:\d{2}:\d{2}) (\d{4})/;
const CLOCK_RE = /\b\d{2}:\d{2}:\d{2}\b/g;
const silentConsole = Object.freeze({
  log() {},
  warn() {},
  error() {},
  info() {},
  debug() {},
});

export function toSec(hms) {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(hms || ''));
  return match ? (+match[1] * 3600) + (+match[2] * 60) + +match[3] : null;
}

export function clockForTs(ts) {
  const normalized = ((+ts % 86400) + 86400) % 86400;
  const hour = Math.floor(normalized / 3600);
  const minute = Math.floor((normalized % 3600) / 60);
  const second = Math.floor(normalized % 60);
  return [hour, minute, second].map(value => String(value).padStart(2, '0')).join(':');
}

export function parseCaseDate(value) {
  if (!value) return null;
  const match = /^(\d{1,2})\/(\w{3,4})\/(\d{4})$/.exec(value);
  if (!match) return null;
  return `${match[3]}-${String(MONTHS[match[2]] || 0).padStart(2, '0')}-${String(+match[1]).padStart(2, '0')}`;
}

export function dateKey(session) {
  if (!session || !session.year) return null;
  return `${session.year}-${String(session.month).padStart(2, '0')}-${String(session.day).padStart(2, '0')}`;
}

export function parseSessionHeader(header) {
  const match = HEADER_RE.exec(String(header || ''));
  if (!match) return null;
  const [hour, minute, second] = match[3].split(':').map(Number);
  return {
    year: +match[4],
    month: MONTHS[match[1]] || 0,
    day: +match[2],
    saveSec: (hour * 3600) + (minute * 60) + second,
  };
}

export function splitSessions(text) {
  const cleanText = String(text || '').replace(/^\uFEFF/, '').replace(/^ï»¿/, '');
  const sessions = [];
  let current = null;

  for (const line of cleanText.split(/\r?\n/)) {
    const parsed = parseSessionHeader(line);
    if (parsed) {
      if (current) sessions.push(current);
      current = { header: line.trim(), ...parsed, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) sessions.push(current);
  if (!sessions.length) {
    sessions.push({ header: '', year: 0, month: 0, day: 0, saveSec: 0, lines: cleanText.split(/\r?\n/) });
  }
  return sessions.map(session => ({ ...session, text: session.lines.join('\n') }));
}

export function pairSessions(serverSessions, localSessions) {
  if (serverSessions.length === 1 && localSessions.length === 1) {
    return [{ sv: serverSessions[0], lc: localSessions[0] }];
  }

  const pairs = [];
  for (const sv of serverSessions) {
    if (!sv.header) continue;
    let best = null;
    let bestDiff = Infinity;
    for (const lc of localSessions) {
      if (!lc.header || lc.year !== sv.year || lc.month !== sv.month || lc.day !== sv.day) continue;
      const diff = Math.abs(lc.saveSec - sv.saveSec);
      if (diff < bestDiff) {
        best = lc;
        bestDiff = diff;
      }
    }
    if (best && bestDiff <= 3600) pairs.push({ sv, lc: best });
  }
  return pairs;
}

export function exclusionFor(serverName, session) {
  return CORPUS_EXCLUSIONS.find(exclusion => {
    if (exclusion.server !== serverName) return false;
    if (exclusion.year == null) return true;
    return exclusion.year === session.year
      && exclusion.month === session.month
      && exclusion.day === session.day
      && exclusion.saveSec === session.saveSec;
  }) || null;
}

export function filterExcludedSessions(serverName, pairs) {
  return pairs.filter(pair => !exclusionFor(serverName, pair.sv));
}

export function createUnifiedContext(root = process.cwd()) {
  const context = {
    console: silentConsole,
    Math,
    JSON,
    Array,
    Object,
    Number,
    String,
    Map,
    Set,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
    Date,
    Float32Array,
    Int32Array,
  };
  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  for (const file of ENGINE_FILES) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return context;
}

const CLASSIFICATION_PROFILES = Object.freeze({
  dump: Object.freeze({}),
  gabarito: Object.freeze({
    strictLeech: true,
    maxOriginal: 6000,
    useFloat16Mitigation: true,
  }),
});

function compactHit(hit) {
  const { evidence: _evidence, rawLine: _rawLine, ...compact } = hit || {};
  return compact;
}

function compactAction(action) {
  if (!action) return null;
  const { rawLine: _rawLine, ...compact } = action;
  return compact;
}

function compactDeterministic(deterministic) {
  if (!deterministic) return null;
  return {
    ok: deterministic.ok ?? null,
    known: deterministic.known ?? null,
    unknown: deterministic.unknown ?? null,
    reason: deterministic.reason ?? null,
  };
}

function compactLeech(leech) {
  if (!leech) return null;
  return {
    ok: leech.ok ?? null,
    usable: leech.usable ?? null,
    neutral: leech.neutral ?? null,
    cappedLow: leech.cappedLow ?? null,
    consensus: leech.consensus ? {
      ok: leech.consensus.ok ?? null,
      usable: leech.consensus.usable ?? null,
      cappedLowCount: leech.consensus.cappedLowCount ?? 0,
      contradictionCount: leech.consensus.contradictionCount ?? 0,
      failedCount: leech.consensus.failedCount ?? 0,
      neutralOnly: leech.consensus.neutralOnly ?? false,
      reason: leech.consensus.reason ?? null,
    } : null,
  };
}

function compactComponent(component) {
  return {
    id: component.id ?? null,
    index: component.index ?? null,
    comp: component.comp ?? component.kind ?? null,
    kind: component.kind ?? null,
    action: compactAction(component.action),
    actionLabel: component.actionLabel ?? null,
    hits: (component.hits || []).map(compactHit),
    deterministic: compactDeterministic(component.deterministic),
    leech: compactLeech(component.leech),
  };
}

function compactValidCandidate(candidate) {
  if (!candidate || candidate.ok !== true) return null;
  return {
    ok: true,
    candidate: {
      shape: candidate.candidate?.shape ?? [],
      cuts: candidate.candidate?.cuts ?? [],
      components: (candidate.candidate?.components || []).map(compactComponent),
    },
  };
}

function compactTurn(turn) {
  return {
    id: turn.id ?? null,
    idx: turn.idx ?? null,
    ts: turn.ts ?? null,
    clock: turn.clock ?? null,
    partialEdge: turn.partialEdge ?? false,
    partialEdgeMissingEvidence: turn.partialEdgeMissingEvidence ?? false,
    status: turn.status ?? null,
    reason: turn.reason ?? null,
    resolver: turn.resolver ?? null,
    components: (turn.components || []).map(compactComponent),
    hits: (turn.hits || []).map(compactHit),
    rejected: (turn.rejected || []).map(compactValidCandidate).filter(Boolean),
  };
}

export function compactUnifiedValidationResult(result) {
  if (!result) return result;
  return {
    version: result.version ?? null,
    status: result.status ?? null,
    error: result.error ?? null,
    sessionDateKey: result.sessionDateKey ?? null,
    vocation: result.vocation ?? null,
    mobModsRegime: result.mobModsRegime ?? null,
    leechSetup: result.leechSetup ?? null,
    turns: (result.turns || []).map(compactTurn),
  };
}

export class UnifiedCorpus {
  constructor({
    root = process.cwd(),
    logDir = 'logs',
    cacheEnabled = true,
    persistentCacheDir = null,
    applyExclusions = true,
    warn = message => console.error(message),
  } = {}) {
    this.root = root;
    this.logDir = path.resolve(root, logDir);
    this.cacheEnabled = cacheEnabled;
    this.persistentCacheDir = persistentCacheDir ? path.resolve(root, persistentCacheDir) : null;
    this.applyExclusions = applyExclusions;
    this.warn = warn;
    this.pairCache = new Map();
    this.classificationCache = new Map();
    this.sessionClockCache = new WeakMap();
    this.stats = {
      requests: 0,
      classifications: 0,
      hits: 0,
      persistentHits: 0,
      persistentWrites: 0,
      skippedWithoutTimestamp: 0,
      pairedFixtures: 0,
    };
  }

  discoverPairs() {
    return discoverFixturePairs({ logDir: this.logDir, warn: this.warn });
  }

  sessionsFor(serverName, localName, { includeExcluded = !this.applyExclusions } = {}) {
    const key = `${path.resolve(this.logDir, serverName)}\n${path.resolve(this.logDir, localName)}\n${includeExcluded}`;
    if (this.pairCache.has(key)) return this.pairCache.get(key);

    const serverPath = path.resolve(this.logDir, serverName);
    const localPath = path.resolve(this.logDir, localName);
    if (!fs.existsSync(serverPath) || !fs.existsSync(localPath)) return null;

    const serverSessions = splitSessions(fs.readFileSync(serverPath, 'utf8'));
    const localSessions = splitSessions(fs.readFileSync(localPath, 'utf8'));
    let pairs = pairSessions(serverSessions, localSessions)
      .map((pair, sourceIndex) => ({ ...pair, sourceIndex }));
    if (!includeExcluded) pairs = filterExcludedSessions(serverName, pairs);
    pairs = pairs.map((pair, index) => ({ ...pair, index }));
    this.pairCache.set(key, pairs);
    this.stats.pairedFixtures = this.pairCache.size;
    return pairs;
  }

  sessionContainsClock(session, clock) {
    if (!this.sessionClockCache.has(session)) {
      this.sessionClockCache.set(session, new Set(String(session.text || '').match(CLOCK_RE) || []));
    }
    return this.sessionClockCache.get(session).has(clock);
  }

  classify(serverName, localName, pair, {
    profile = 'dump',
    trace = false,
    cacheKey = pair.sourceIndex ?? pair.index,
    throwOnError = false,
  } = {}) {
    this.stats.requests++;
    const profileOptions = CLASSIFICATION_PROFILES[profile] || CLASSIFICATION_PROFILES.dump;
    const optionsKey = JSON.stringify({
      strictLeech: profileOptions.strictLeech ?? true,
      maxOriginal: profileOptions.maxOriginal ?? 6000,
      useFloat16Mitigation: profileOptions.useFloat16Mitigation ?? true,
      trace,
    });
    const key = `${serverName}\n${localName}\n${cacheKey}\n${optionsKey}`;
    if (this.cacheEnabled && this.classificationCache.has(key)) {
      this.stats.hits++;
      return this.classificationCache.get(key);
    }

    const persistentPath = this.persistentCacheDir
      ? path.join(this.persistentCacheDir, `${this.persistentClassificationKey(pair, optionsKey)}.bin`)
      : null;
    if (this.cacheEnabled && persistentPath && fs.existsSync(persistentPath)) {
      try {
        const result = v8.deserialize(fs.readFileSync(persistentPath));
        this.classificationCache.set(key, result);
        this.stats.persistentHits++;
        return result;
      } catch (_error) {
        // Cache corrompido ou de uma versao incompativel do Node: recalcula.
        fs.rmSync(persistentPath, { force: true });
      }
    }

    const context = createUnifiedContext(this.root);
    let result = null;
    try {
      result = context.UnifiedClassificationEngine.classifyUnified(pair.sv.text, pair.lc.text, {
        mobModsPre: context.MOB_ELEMENT_MODS || null,
        mobModsPost: context.MOB_ELEMENT_MODS_POST_2026_06_16 || null,
        ...profileOptions,
        ...(trace ? { trace: true } : {}),
      });
    } catch (error) {
      if (throwOnError) throw error;
      result = null;
    }
    this.stats.classifications++;
    if (this.cacheEnabled) this.classificationCache.set(key, result);
    if (this.cacheEnabled && persistentPath && result) {
      fs.mkdirSync(this.persistentCacheDir, { recursive: true });
      const temporaryPath = `${persistentPath}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(temporaryPath, v8.serialize(compactUnifiedValidationResult(result)));
        fs.renameSync(temporaryPath, persistentPath);
        this.stats.persistentWrites++;
      } catch (_error) {
        fs.rmSync(temporaryPath, { force: true });
      }
    }
    return result;
  }

  persistentClassificationKey(pair, optionsKey) {
    if (!this.engineSignature) {
      const engineHash = crypto.createHash('sha256');
      for (const file of ENGINE_FILES) {
        engineHash.update(file);
        engineHash.update('\0');
        engineHash.update(fs.readFileSync(path.join(this.root, file)));
        engineHash.update('\0');
      }
      engineHash.update(fs.readFileSync(new URL(import.meta.url)));
      this.engineSignature = engineHash.digest('hex');
    }
    const hash = crypto.createHash('sha256');
    hash.update(this.engineSignature);
    hash.update('\0');
    hash.update(optionsKey);
    hash.update('\0');
    hash.update(pair.sv.text);
    hash.update('\0');
    hash.update(pair.lc.text);
    return hash.digest('hex');
  }

  findTurns(serverName, localName, ts, date, { profile = 'gabarito', includeExcluded } = {}) {
    const pairs = this.sessionsFor(serverName, localName, { includeExcluded });
    if (pairs === null) return { missing: true, turns: [] };

    const wantedDate = parseCaseDate(date);
    const wantedClock = clockForTs(ts);
    const turns = [];
    for (const pair of pairs) {
      if (wantedDate && dateKey(pair.sv) !== wantedDate) continue;
      if (!this.sessionContainsClock(pair.sv, wantedClock)) {
        this.stats.skippedWithoutTimestamp++;
        continue;
      }
      const result = this.classify(serverName, localName, pair, { profile });
      if (!result || !result.turns) continue;
      for (const turn of result.turns) {
        if (turn.ts === ts) turns.push(turn);
      }
    }
    return { missing: false, turns };
  }

  cacheStats() {
    return { ...this.stats };
  }
}
