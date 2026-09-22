import path from 'node:path';

export const MOB_ELEMENT_MODS_CUTOFF = Object.freeze({ year: 2026, month: 6, day: 16 });
export const MOB_ELEMENT_MODS_PATCH_2026_08_25 = Object.freeze({ year: 2026, month: 8, day: 25 });

const PRE_CUTOFF = Object.freeze({
  id: 'pre-2026-06-16',
  status: 'available',
  tablePath: path.join('js', 'mob-element-mods.js'),
  reason: null,
});

const POST_CUTOFF = Object.freeze({
  id: 'post-2026-06-16',
  status: 'available',
  tablePath: path.join('js', 'mob-element-mods-post-2026-06-16.js'),
  reason: null,
});

// Patch "Darklight Core" de 25/Ago/2026: fogo de darklight matter e darklight striker
// 1.25 -> 1.20. A tabela e um OVERLAY sobre a pos-2026-06-16 (ver o proprio arquivo).
const POST_2026_08_25 = Object.freeze({
  id: 'post-2026-08-25',
  status: 'available',
  tablePath: path.join('js', 'mob-element-mods-post-2026-08-25.js'),
  basePath: POST_CUTOFF.tablePath,
  reason: null,
});

const UNKNOWN_DATE = Object.freeze({
  id: 'unknown-date',
  status: 'unavailable',
  tablePath: path.join('js', 'mob-element-mods-post-2026-06-16.js'),
  reason: 'session_date_required_for_mob_element_mod_regime',
});

function dateKey(date) {
  if (!date || !Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) return null;
  return date.year * 10000 + date.month * 100 + date.day;
}

export function selectMobElementModsRegime(sessionDate) {
  const key = dateKey(sessionDate);
  if (key == null) return UNKNOWN_DATE;
  if (key < dateKey(MOB_ELEMENT_MODS_CUTOFF)) return PRE_CUTOFF;
  if (key >= dateKey(MOB_ELEMENT_MODS_PATCH_2026_08_25)) return POST_2026_08_25;
  return POST_CUTOFF;
}
