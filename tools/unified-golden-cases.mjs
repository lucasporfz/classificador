export const SHARED_UNIFIED_GOLDEN_CASES = Object.freeze([
  Object.freeze({
    id: 'thunder-arrow/18:52:46',
    server: 'thunder arrow Server Log.txt',
    local: 'thunder arrow Local Chat.txt',
    ts: '18:52:46',
    // S-014e (emenda de 25/Out/2026): o virtual do zap charm de seq 2118 fica entre
    // seq 2115 e 2120, ambos da Divine Barrage, e sai do AA (7 visiveis) para ela
    // (11 visiveis + 1 virtual). Era arrow 8 / spell 11.
    expected: Object.freeze({ arrow: 7, spell: 12, rune: 0, grenade: 11 }),
    regimeIndependent: true,
  }),
  Object.freeze({
    id: 'thunder-arrow/18:52:44',
    server: 'thunder arrow Server Log.txt',
    local: 'thunder arrow Local Chat.txt',
    ts: '18:52:44',
    expected: Object.freeze({ arrow: 4, spell: 12, rune: 0, grenade: 0 }),
    regimeIndependent: true,
  }),
  Object.freeze({
    id: 'thunder-arrow/18:52:42',
    server: 'thunder arrow Server Log.txt',
    local: 'thunder arrow Local Chat.txt',
    ts: '18:52:42',
    expected: Object.freeze({ arrow: 2, spell: 0, rune: 0, grenade: 0 }),
    regimeIndependent: true,
  }),
]);
