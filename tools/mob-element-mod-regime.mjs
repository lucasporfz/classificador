import path from 'node:path';

export const MOB_ELEMENT_MODS_CUTOFF = Object.freeze({ year: 2026, month: 6, day: 16 });

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
  const cutoff = dateKey(MOB_ELEMENT_MODS_CUTOFF);
  return key < cutoff ? PRE_CUTOFF : POST_CUTOFF;
}
