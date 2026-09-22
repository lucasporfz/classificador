// Regime de modificadores vigente a partir de 2026-08-25.
//
// Patch "Darklight Core" de 25/Ago/2026:
//   - XP -7% de darklight matter, walking pillar, darklight source e darklight striker
//     (irrelevante para o motor: a XP da tabela nunca e lida; o Unified usa a linha
//     "You gained N experience points" do log apenas como marcador de kill);
//   - densidade de monstros reduzida no spawn externo (idem, nao e dado de tabela);
//   - sensibilidade a FOGO de darklight matter e darklight striker: 125 -> 120.
//
// So a terceira linha e fato de tabela, entao este arquivo e um OVERLAY: ele carrega
// apenas os mobs que mudaram. getMobMods consulta o overlay primeiro e cai na tabela
// pos-2026-06-16 para todo o resto. Assim nao ha copia de 800 mobs nem troca de
// identidade de objeto por chamada (o cache de reversao por hit depende de receber
// SEMPRE o mesmo objeto congelado para o mesmo par mob+regime).
//
// Testemunha externa do striker em 1.20: kik-tibia/tibiatools src/data/creatures.json
// (o snapshot de la ainda traz matter em 1.25; o valor usado aqui vem da nota do patch,
// que e a fonte primaria e cita os dois mobs).
//
// Carrega DEPOIS de mob-element-mods-post-2026-06-16.js.
(function(root) {
  'use strict';

  const BASE = root.MOB_ELEMENT_MODS_POST_2026_06_16 || null;
  if (!BASE) throw new Error('mob-element-mods-post-2026-08-25.js requer mob-element-mods-post-2026-06-16.js carregado antes.');

  const PATCH = Object.freeze({
    'darklight matter': { fireDmgMod: 1.2 },
    'darklight striker': { fireDmgMod: 1.2 },
  });

  const OVERLAY = Object.freeze(Object.fromEntries(
    Object.entries(PATCH).map(([name, delta]) => [name, Object.freeze(Object.assign({}, BASE[name], delta))])
  ));

  root.MOB_ELEMENT_MODS_POST_2026_08_25 = OVERLAY;
  root.getMobElementModsPost20260825 = function(name) {
    return OVERLAY[String(name || '').toLowerCase().trim()] || null;
  };

  // Registro de regimes posteriores ao cutoff de 2026-06-16, do mais novo para o mais
  // antigo. getMobMods percorre esta lista e usa o primeiro overlay cujo `from` seja
  // <= sessionDateKey; o que nao estiver no overlay vem da tabela base.
  const REGIMES = (root.MOB_ELEMENT_MODS_REGIMES || []).filter(r => r && r.key !== 'post-2026-08-25');
  REGIMES.push(Object.freeze({ key: 'post-2026-08-25', from: 20260825, table: OVERLAY }));
  REGIMES.sort((a, b) => b.from - a.from);
  root.MOB_ELEMENT_MODS_REGIMES = Object.freeze(REGIMES);
})(typeof globalThis !== 'undefined' ? globalThis : window);
