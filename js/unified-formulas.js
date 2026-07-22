/*
 * unified-formulas.js
 *
 * Camada de formulas do UnifiedClassificationEngine: constantes de engine (tabelas de
 * spell/rune, candidatos de leech/crit/gravSan) e matematica pura sem dependencia de
 * evidencia (mitigacao, critico, pierce, reversao de dano original, intervalos). Nada
 * aqui le hits/turnos nem infere setup a partir de evidencia -- isso e unified-setup-inference.js.
 *
 * Exporta globalThis.UnifiedFormulas (+ module.exports quando disponivel). Carregado
 * ANTES de unified-classification-engine.js (ver index.html).
 */
(function(root) {
  'use strict';
  const VERSION = 'unified-v28-ew-bm-pierce-detection';
  const CUTOFF_KEY = 20260616;
  const ELEMENT_KEYS = {
    physical: 'physicalDmgMod',
    holy: 'holyDmgMod',
    fire: 'fireDmgMod',
    ice: 'iceDmgMod',
    energy: 'energyDmgMod',
    earth: 'earthDmgMod',
    death: 'deathDmgMod',
  };
  const ELEMENTS = Object.keys(ELEMENT_KEYS);

  const SINGLE_TARGET_RUNES = new Set(['sudden death', 'icicle', 'holy missile']);
  const IGNORED_RUNE_RE = /\b(wall|bomb|field)\b/i;
  const IGNORED_SPELL_RE = /^adori\b/i;

  // M-031/M-032 (docs/CLASSIFICATION_RULES.md): estas 4 vocaÃ§Ãµes tÃªm AA
  // exclusivamente single-target e cardinalidade zero-ou-um hit de AA por
  // turno â€” RP Ã© a Ãºnica vocaÃ§Ã£o com AA de Ã¡rea e fica fora deste conjunto.
  const SINGLE_TARGET_AA_VOCATIONS = new Set(['knight', 'sorcerer', 'druid', 'monk']);

  const RUNE_PROFILES = {
    'sudden death': { element: 'death', topology: 'single', label: 'Sudden Death' },
    'icicle': { element: 'ice', topology: 'single', label: 'Icicle' },
    'holy missile': { element: 'holy', topology: 'single', label: 'Holy Missile' },
    'stone shower': { element: 'earth', topology: 'area', label: 'Stone Shower' },
    'stoneshower': { element: 'earth', topology: 'area', label: 'Stone Shower' },
    'thunderstorm': { element: 'energy', topology: 'area', label: 'Thunderstorm' },
    'great fireball': { element: 'fire', topology: 'area', label: 'Great Fireball' },
    'avalanche': { element: 'ice', topology: 'area', label: 'Avalanche' },
    'explosion': { element: 'physical', topology: 'area', label: 'Explosion' },
  };

  // Perfis de spells suficientes para a classificaÃ§Ã£o mecÃ¢nica. Spells desconhecidas
  // podem nomear componente como aÃ§Ã£o concreta, mas ficam sem eixo elemental determinÃ­stico.
  const SPELL_PROFILES = {
    // Paladin
    'exori san': { label: 'Divine Missile', type: 'attack', element: 'holy', topology: 'single', vocation: 'paladin' },
    'exori con': { label: 'Ethereal Spear', type: 'attack', element: 'physical', topology: 'single', vocation: 'paladin' },
    'exori infir con': { label: 'Lesser Ethereal Spear', type: 'attack', element: 'physical', topology: 'single', vocation: 'paladin' },
    'exori gran con': { label: 'Strong Ethereal Spear', type: 'attack', element: 'physical', topology: 'single', vocation: 'paladin' },
    'exori dir moe': { label: 'Ethereal Barrage', type: 'attack', element: 'physical', topology: 'area', vocation: 'paladin' },
    'exori dir san': { label: 'Divine Barrage', type: 'attack', element: 'holy', topology: 'area', vocation: 'paladin' },
    'exori kor': { label: 'Sap Strength', type: 'support', element: 'unknown', topology: 'support', vocation: 'paladin', contaminatesLeechChannel: 'mana' },
    'exori moe': { label: 'Expose Weakness', type: 'support', element: 'unknown', topology: 'support', vocation: 'paladin', contaminatesLeechChannel: 'life' },
    'utori san': { label: 'Holy Flash', type: 'attack', element: 'holy', topology: 'area', vocation: 'paladin' },
    'exevo mas san': { label: 'Divine Caldera', type: 'attack', element: 'holy', topology: 'area', vocation: 'paladin' },
    'exevo tempo mas san': { label: 'Divine Grenade', type: 'grenade', element: 'holy', topology: 'area', vocation: 'paladin' },
    'utevo grav san': { label: 'Sharpshooter Damage Buff', type: 'support', element: 'unknown', topology: 'buff', vocation: 'paladin' },

    // Knight
    'exori': { label: 'Berserk', type: 'attack', element: 'physical', topology: 'area', vocation: 'knight' },
    'exori gran': { label: 'Fierce Berserk', type: 'attack', element: 'physical', topology: 'area', vocation: 'knight' },
    'exori mas': { label: 'Groundshaker', type: 'attack', element: 'physical', topology: 'area', vocation: 'knight' },
    'exori min': { label: 'Front Sweep', type: 'attack', element: 'physical', topology: 'area', vocation: 'knight' },
    'exori infir min': { label: 'Lesser Front Sweep', type: 'attack', element: 'physical', topology: 'area', vocation: 'knight' },
    'exori ico': { label: 'Brutal Strike', type: 'attack', element: 'physical', topology: 'single', vocation: 'knight' },
    'exori gran ico': { label: 'Annihilation', type: 'attack', element: 'physical', topology: 'single', vocation: 'knight' },
    'exori hur': { label: 'Whirlwind Throw', type: 'attack', element: 'physical', topology: 'single', vocation: 'knight' },
    'exori amp kor': { label: "Executioner's Throw", type: 'attack', element: 'physical', topology: 'area', vocation: 'knight' },
    'utori kor': { label: 'Inflict Wound', type: 'attack', element: 'physical', topology: 'single', vocation: 'knight' },
    'exori ico scu': { label: 'Shield Bash', type: 'attack', element: 'physical', topology: 'single', vocation: 'knight' },
    'exori scu': { label: 'Shield Slam', type: 'attack', element: 'physical', topology: 'single', vocation: 'knight' },

    // Sorcerer
    'exori vis': { label: 'Energy Strike', type: 'attack', element: 'energy', topology: 'single', vocation: 'sorcerer' },
    'exori gran vis': { label: 'Strong Energy Strike', type: 'attack', element: 'energy', topology: 'single', vocation: 'sorcerer' },
    'exori max vis': { label: 'Ultimate Energy Strike', type: 'attack', element: 'energy', topology: 'single', vocation: 'sorcerer' },
    'exori amp vis': { label: 'Lightning', type: 'attack', element: 'energy', topology: 'single', vocation: 'sorcerer' },
    'exori flam': { label: 'Flame Strike', type: 'attack', element: 'fire', topology: 'single', vocation: 'sorcerer' },
    'exori gran flam': { label: 'Strong Flame Strike', type: 'attack', element: 'fire', topology: 'single', vocation: 'sorcerer' },
    'exori max flam': { label: 'Ultimate Flame Strike', type: 'attack', element: 'fire', topology: 'single', vocation: 'sorcerer' },
    'exori min flam': { label: "Apprentice's Strike", type: 'attack', element: 'fire', topology: 'single', vocation: 'sorcerer' },
    'exori mort': { label: 'Death Strike', type: 'attack', element: 'death', topology: 'single', vocation: 'sorcerer' },
    'exori infir vis': { label: 'Buzz', type: 'attack', element: 'energy', topology: 'single', vocation: 'sorcerer' },
    'exevo vis lux': { label: 'Energy Beam', type: 'attack', element: 'energy', topology: 'area', vocation: 'sorcerer' },
    'exevo gran vis lux': { label: 'Great Energy Beam', type: 'attack', element: 'energy', topology: 'area', vocation: 'sorcerer' },
    'exevo vis hur': { label: 'Energy Wave', type: 'attack', element: 'energy', topology: 'area', vocation: 'sorcerer' },
    'exevo flam hur': { label: 'Fire Wave', type: 'attack', element: 'fire', topology: 'area', vocation: 'sorcerer' },
    'exevo gran flam hur': { label: 'Great Fire Wave', type: 'attack', element: 'fire', topology: 'area', vocation: 'sorcerer' },
    'exevo gran mas flam': { label: "Hell's Core", type: 'attack', element: 'fire', topology: 'area', vocation: 'sorcerer' },
    'exevo gran mas vis': { label: 'Rage of the Skies', type: 'attack', element: 'energy', topology: 'area', vocation: 'sorcerer' },
    'exevo max mort': { label: 'Great Death Beam', type: 'attack', element: 'death', topology: 'area', vocation: 'sorcerer' },
    'exevo mort ora': {
      label: 'Death Echo', type: 'attack', element: 'death', topology: 'area', vocation: 'sorcerer',
      // M-016d: delays candidatos 1s/2s em ordem gulosa (sÃ³ tenta +2 quando +1
      // nÃ£o tem candidatos), e uma Ãºnica fraÃ§Ã£o candidata (1/2) -- mesmo schema
      // declarativo compartilhado com Spiritual Outburst.
      multiStage: {
        confirmation: 'elemental',
        primary: { id: 'primary', powerNumerator: 1, powerDenominator: 1 },
        delayed: { id: 'echo', delays: [1, 2], tiers: [{ numerator: 1, denominator: 2 }] },
      },
    },
    'utori mort': { label: 'Curse', type: 'attack', element: 'death', topology: 'single', vocation: 'sorcerer' },
    'utori vis': { label: 'Electrify', type: 'attack', element: 'energy', topology: 'single', vocation: 'sorcerer' },
    'utori flam': { label: 'Ignite', type: 'attack', element: 'fire', topology: 'single', vocation: 'sorcerer' },

    // Druid
    'exori frigo': { label: 'Ice Strike', type: 'attack', element: 'ice', topology: 'single', vocation: 'druid' },
    'exori gran frigo': { label: 'Strong Ice Strike', type: 'attack', element: 'ice', topology: 'single', vocation: 'druid' },
    'exori max frigo': { label: 'Ultimate Ice Strike', type: 'attack', element: 'ice', topology: 'single', vocation: 'druid' },
    'exori tera': { label: 'Terra Strike', type: 'attack', element: 'earth', topology: 'single', vocation: 'druid' },
    'exori gran tera': { label: 'Strong Terra Strike', type: 'attack', element: 'earth', topology: 'single', vocation: 'druid' },
    'exori max tera': { label: 'Ultimate Terra Strike', type: 'attack', element: 'earth', topology: 'single', vocation: 'druid' },
    'exori moe ico': { label: 'Physical Strike', type: 'attack', element: 'physical', topology: 'single', vocation: 'druid' },
    'exevo frigo hur': { label: 'Ice Wave', type: 'attack', element: 'ice', topology: 'area', vocation: 'druid' },
    'exevo gran frigo hur': { label: 'Strong Ice Wave', type: 'attack', element: 'ice', topology: 'area', vocation: 'druid' },
    'exevo tera hur': { label: 'Terra Wave', type: 'attack', element: 'earth', topology: 'area', vocation: 'druid' },
    'exevo gran mas frigo': { label: 'Eternal Winter', type: 'attack', element: 'ice', topology: 'area', vocation: 'druid' },
    'exevo gran mas tera': { label: 'Wrath of Nature', type: 'attack', element: 'earth', topology: 'area', vocation: 'druid' },
    'exevo ulus frigo': { label: 'Ice Burst', type: 'attack', element: 'ice', topology: 'area', vocation: 'druid' },
    'exevo ulus tera': { label: 'Terra Burst', type: 'attack', element: 'earth', topology: 'area', vocation: 'druid' },
    'exevo fur frigo': { label: 'Forked Glacier', type: 'attack', element: 'ice', topology: 'area', vocation: 'druid' },
    'exevo fur tera': { label: 'Forked Thorns', type: 'attack', element: 'earth', topology: 'area', vocation: 'druid' },
    'exevo infir frigo hur': { label: 'Chill Out', type: 'attack', element: 'ice', topology: 'area', vocation: 'druid' },
    'exori infir tera': { label: 'Mud Attack', type: 'attack', element: 'earth', topology: 'single', vocation: 'druid' },
    'utori pox': { label: 'Envenom', type: 'attack', element: 'earth', topology: 'single', vocation: 'druid' },

    // Monk
    'exori pug': { label: 'Double Jab', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    'exori infir pug': { label: 'Swift Jab', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    'exori mas pug': { label: 'Flurry of Blows', type: 'attack', element: 'physical', topology: 'area', vocation: 'monk' },
    'exori gran pug': { label: 'Forceful Uppercut', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    'exori gran mas pug': { label: 'Greater Flurry of Blows', type: 'attack', element: 'physical', topology: 'area', vocation: 'monk' },
    'exori amp pug': { label: 'Mystic Repulse', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    'exori infir amp pug': { label: 'Lesser Mystic Repulse', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    // Sem nome oficial confirmado â€” `label` deliberadamente omitido para
    // nÃ£o inventar um nome de
    // spell; a exibiÃ§Ã£o cai no fallback de texto (idÃªntico ao comportamento
    // antes deste registro). element/topology/vocation sÃ£o confirmados pelo
    // dano observado em logs/serverlog6..9.txt: sempre fÃ­sico, sempre atingindo
    // 3+ mobs no mesmo turno.
    'exori mas amp pug': { type: 'attack', element: 'physical', topology: 'area', vocation: 'monk' },
    'exori med pug': { label: 'Chained Penance', type: 'attack', element: 'holy', topology: 'area', vocation: 'monk' },
    'exori nia': { label: 'Greater Tiger Clash', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    'exori infir nia': { label: 'Tiger Clash', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    'exori gran nia': { label: 'Devastating Knockout', type: 'attack', element: 'physical', topology: 'single', vocation: 'monk' },
    'exori mas nia': { label: 'Sweeping Takedown', type: 'attack', element: 'physical', topology: 'area', vocation: 'monk' },
    // M-016e: segunda spell multiestÃ¡gio conhecida (apÃ³s Death Echo, M-016d).
    // Blast inicial de potÃªncia integral + estÃ¡gio atrasado com delay candidato
    // 1s ou 2s apÃ³s o tÃ©rmino do blast inicial (tentados em ordem, gulosamente
    // -- monk 2 07:19:35 fecha em +1, 07:19:56/07:19:58 sÃ³ fecha em +2) e
    // potÃªncia candidata Stage 1 (3/8) / Stage 2 (1/2) / Stage 3 (5/8), inferida
    // sÃ³ pela transformaÃ§Ã£o discreta do dano observado -- sem sinal externo.
    // Stage 1/2 nÃ£o tÃªm evidÃªncia de log real nesta mudanÃ§a (ver
    // docs/CLASSIFICATION_RULES.md, risco residual).
    'exori gran mas nia': {
      label: 'Spiritual Outburst', type: 'attack', element: 'holy', topology: 'area', vocation: 'monk',
      multiStage: {
        confirmation: 'leech_cluster',
        primary: { id: 'primary', powerNumerator: 1, powerDenominator: 1 },
        delayed: {
          id: 'echo',
          delays: [1, 2],
          tiers: [
            { stage: 1, numerator: 3, denominator: 8 },
            { stage: 2, numerator: 1, denominator: 2 },
            { stage: 3, numerator: 5, denominator: 8 },
          ],
        },
      },
    },
  };

  const SUPPORT_OR_HEAL_RE = /^(exura|exana|utani|utana|utamo|utito|uteta|utevo|exeta|exiva|exani|adura|adana|adevo)\b/;
  const MAGIC_PREFIX_RE = /^(exori|exevo|exura|exana|exeta|exiva|exomis|utevo|utamo|utani|utura|utito|utgran|adevo|adori|adana|adura|frigo|mort)\b/;

  // D-020 documenta 3 tiers reais de imbuement (Basic/Intricate/Powerful); restrito aqui a
  // Powerful-only por premissa confirmada sobre os personagens deste projeto (nunca usam
  // imbuement Basic/Intricate de leech) â€” nÃ£o Ã© reinterpretaÃ§Ã£o da mecÃ¢nica de jogo. Ver
  // docs/CLASSIFICATION_RULES.md, adendo de D-020, e
  // openspec/changes/fix-leech-charm-detection-turn-local-signal/design.md (D4).
  const LIFE_IMBUEMENT_SLOTS = [0, 0.25];
  const MANA_IMBUEMENT_SLOTS = [0, 0.08];
  // D-020: Conviction Perk (Wheel of Destiny) e perk de arma empilham atÃ© um teto de
  // stacks cada â€” nÃ£o sÃ£o uma escolha binÃ¡ria 0/1. LIFE_CONVICTION/MANA_CONVICTION e
  // LIFE_WEAPON_PERK/MANA_WEAPON_PERK jÃ¡ sÃ£o a lista de TODOS os totais possÃ­veis
  // (0..maxStacks Ã— valor por stack), para somar junto com os slots de imbuement.
  const LIFE_CONVICTION = stackTotals(0.0075, 4);
  const MANA_CONVICTION = stackTotals(0.0025, 4);
  const LIFE_WEAPON_PERK = stackTotals(0.01, 10);
  const MANA_WEAPON_PERK = stackTotals(0.01, 4);
  const LIFE_BASE_CANDIDATES = buildLeechBaseCandidates(LIFE_IMBUEMENT_SLOTS, 2, [LIFE_CONVICTION, LIFE_WEAPON_PERK]);
  const MANA_BASE_CANDIDATES = buildLeechBaseCandidates(MANA_IMBUEMENT_SLOTS, 2, [MANA_CONVICTION, MANA_WEAPON_PERK]);
  const VAMPIRIC_BONUSES = [0, 0.016, 0.024, 0.032];
  const VOIDS_BONUSES = [0, 0.008, 0.012, 0.016];
  const WEAPON_LEECH_BONUS = 0.005;
  const MAX_WEAPON_LEECH_BONUSES = 10;

  // V13: bÃ´nus de leech por spell/perk de Wheel of Destiny.
  // Diferente dos minor charms, estes bÃ´nus pertencem Ã  aÃ§Ã£o concreta, nÃ£o ao mob.
  // Cada entrada Ã© testada como hipÃ³tese discreta: sem bÃ´nus (0) ou com o bÃ´nus listado.
  const SPELL_LEECH_BONUS_CANDIDATES = {
    'exori dir moe': { label: 'Ethereal Barrage', life: [0, 0.10], mana: [0] },
    'exevo tera hur': { label: 'Terra Wave', life: [0, 0.10], mana: [0] },
    'exori scu': { label: 'Shield Slam', life: [0, 0.15], mana: [0] },
  };

  // V15/V18: utevo grav san tem o nÃ­vel de bÃ´nus inferido no nÃ­vel do log,
  // mas a aplicaÃ§Ã£o do bÃ´nus Ã© testada por componente/ataque. O tapete dura 5s,
  // porÃ©m o personagem sÃ³ mantÃ©m o bÃ´nus enquanto estÃ¡ sobre ele; portanto, hits
  // dentro da janela podem ser testados como com ou sem o multiplicador.
  const GRAV_SAN_INCANTATION = 'utevo grav san';
  const GRAV_SAN_DURATION_SECONDS = 5;
  const GRAV_SAN_BONUS_CANDIDATES = [0.08, 0.10, 0.12];

  // Bônus de dano do player contra uma classe de bestiário (ex.: reward "Improved" de
  // Charm Points). Candidatos testados por inferBestiaryClassDamageBonus contra o dano
  // de charm ofensivo (fixo por-mob, sem sorteio), já com Expose Weakness e pierce da
  // sessão (bmPierce) descontados via effectiveMod/pierceForElement — a mesma disciplina
  // do dano normal do player — e fora de qualquer janela de utevo grav san. Confirmado no
  // par logs/ingol ed (17/Jul/2026, ED): harpy/Bird = 0.05, fechado pelo freeze charm.
  const BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30];

  // O crÃ­tico Ã© inferido POR-COMPONENTE por buckets crit/nÃ£o-crit (mean/mean), nÃ£o por
  // uma grade de candidatos global. `criticalMultiplierForHit` aplica o crit do componente
  // do bloco em reversÃ£o; a inferÃªncia estÃ¡ em inferCritByComponent (+ bootstrap
  // inferCoarseGlobalCrit). Amostras mÃ­nimas de cada lado para um bucket (componente,mob):
  const CRIT_BUCKET_MIN_SAMPLES = 6;

  // Teto plausÃ­vel do multiplicador de crÃ­tico (build). Usado sÃ³ para limitar o BOOTSTRAP
  // grosso do pass-1; os multiplicadores finais por-componente vÃªm dos buckets.
  const CRIT_BOOTSTRAP_MAX = 1.9;

  // Etapa 2 da inferÃªncia de crÃ­tico: os multiplicadores reais do build vÃªm de um conjunto
  // discreto e conhecido. A etapa 1 (buckets mean(crit)/mean(noncrit) por componente/mob,
  // inferCritByComponent) nÃ£o muda â€” sÃ³ o valor final por-componente Ã© ajustado ("snap")
  // para o candidato mais prÃ³ximo desta tabela, absorvendo o ruÃ­do da estimativa por
  // amostra pequena. NÃ£o se aplica ao bootstrap grosso do pass-1 (CRIT_BOOTSTRAP_MAX/
  // inferCoarseGlobalCrit), que serve sÃ³ para rotular hits antes do refinamento.
  const CRIT_MULTIPLIER_CANDIDATES = [1.5, 1.54, 1.62, 1.70, 1.72, 1.80, 1.82, 1.92, 2.00, 2.40];
  function snapCritMultiplier(value) {
    if (!(value > 0)) return value;
    let best = CRIT_MULTIPLIER_CANDIDATES[0], bestDist = Math.abs(value - best);
    for (const c of CRIT_MULTIPLIER_CANDIDATES) {
      const d = Math.abs(value - c);
      if (d < bestDist) { best = c; bestDist = d; }
    }
    return best;
  }

  // "Transcendence was triggered." Ã© um bÃ´nus de dano crÃ­tico: todo hit crÃ­tico com
  // ts âˆˆ [T, T+7] (T = timestamp do gatilho) ganha +15 pontos percentuais no multiplicador
  // de crÃ­tico jÃ¡ resolvido (por-componente, jÃ¡ com snap aplicado). Aditivo, nÃ£o
  // multiplicativo â€” 2.00 vira 2.15, nÃ£o 2.00Ã—1.15.
  const TRANSCENDENCE_WINDOW_SECONDS = 7;
  const TRANSCENDENCE_CRIT_BONUS = 0.15;

  // Onslaught: +60% fixo sobre o dano, ADITIVO com o crÃ­tico (nÃ£o multiplicativo).
  // Num hit SEM crÃ­tico o bÃ´nus vira um fator conhecido (Ã·1.6 recupera a base); num hit
  // COM crÃ­tico ele soma ao multiplicador (critMult + 0.6), inseparÃ¡vel sem conhecer o
  // crÃ­tico-base â€” por isso a inferÃªncia de crÃ­tico EXCLUI onslaught+crit dos buckets.
  const ONSLAUGHT_DAMAGE_MULTIPLIER = 1.6;
  function isTranscendenceActiveAt(context, ts) {
    const windows = context && context.transcendenceWindows;
    if (!windows || !windows.length || !Number.isFinite(+ts)) return false;
    for (const w of windows) if (ts >= w[0] && ts <= w[1]) return true;
    return false;
  }

  // V19: Perfect Shot adiciona +20 de dano no valor prÃ©-mitigaÃ§Ã£o do AA.
  // Modelagem atual: aplica depois do crÃ­tico e antes da mitigaÃ§Ã£o; se logs
  // futuros mostrarem que o crÃ­tico tambÃ©m multiplica o +20, este ponto fica
  // isolado para ajuste.
  const PERFECT_SHOT_PREMIT_BONUS = 20;

  // V20: tolerÃ¢ncias pequenas para absorver erro de inferÃªncia/amostragem.
  // Leech pode ficar 1-3 pontos fora por base inferida ligeiramente alta/baixa
  // (ex.: 16.25% inferido vs 16% real). A tolerÃ¢ncia intermediÃ¡ria elemental
  // age antes de desfazer mitigaÃ§Ã£o, quando FLOOR/CEIL pula um valor inteiro.
  const LEECH_VALUE_TOLERANCE_SMALL_BLOCK = 3;
  const LEECH_VALUE_TOLERANCE_LARGE_BLOCK = 1;
  const LEECH_VALUE_TOLERANCE_SMALL_BLOCK_MAX = 5;
  const ELEMENTAL_INTERMEDIATE_TOLERANCE = 1;
  // TolerÃ¢ncia CROSS-HIT (entre hits do mesmo bloco candidato) na interseÃ§Ã£o
  // fÃ­sica de `validatePhysicalBlock`/`intersectIntervals` â€” independente da
  // tolerÃ¢ncia POR-HIT acima (que jÃ¡ se aplica igual a physicalOriginalInterval
  // e elementalOriginalCandidates). Uma tentativa anterior de tolerÃ¢ncia cega
  // aqui foi implementada, medida e REVOGADA (openspec/changes/
  // fix-physical-intersection-reset-bug) porque magnitude de gap sozinha nÃ£o
  // distingue ruÃ­do (gap 42 medido em turno sem quebra real) de quebra
  // genuÃ­na (gap 4 em mazzerinbarrage 23:48:21, bloodjaw). Este valor sÃ³ Ã©
  // vÃ¡lido porque foi validado empiricamente contra esse mesmo caso-prova e
  // contra todos os fixtures do Eixo 2-fÃ­sico (openspec/changes/
  // add-physical-intersection-tolerance) â€” nÃ£o subir sem repetir essa
  // validaÃ§Ã£o.
  const PHYSICAL_INTERSECTION_TOLERANCE = 4;
  const ELEMENTAL_CLUSTER_MIN_TOLERANCE = 8;
  const ELEMENTAL_CLUSTER_MAX_TOLERANCE = 12;
  const ELEMENTAL_CLUSTER_RATIO = 0.004;
  const TERRA_BURST_BONUS_LEVELS = [1.20, 1.40, 1.60];

  function leechValueToleranceForN(n, expectedValue) {
    // V20: em blocos pequenos (A1/S2 etc.) poucos pontos de diferenÃ§a podem ser
    // sÃ³ erro da base inferida (16.25% vs 16%). Em blocos de Ã¡rea grandes, manter
    // Â±1 preserva a cardinalidade e evita Ns vizinhos virarem falsos positivos.
    if (n <= 3) {
      const adaptive = Number.isFinite(+expectedValue) ? Math.ceil(+expectedValue * 0.01) : 0;
      return Math.min(LEECH_VALUE_TOLERANCE_SMALL_BLOCK_MAX, Math.max(LEECH_VALUE_TOLERANCE_SMALL_BLOCK, adaptive));
    }
    return LEECH_VALUE_TOLERANCE_LARGE_BLOCK;
  }

  function sortedUnique(arr) {
    return Array.from(new Set(arr.map(x => Math.round(x * 1e6) / 1e6))).sort((a, b) => a - b);
  }

  function stackTotals(perStack, maxStacks) {
    // D-020: Conviction Perk e perk de arma empilham (atÃ© `maxStacks` vezes) â€” a
    // lista retornada jÃ¡ Ã© TODOS os totais possÃ­veis (0..maxStacks Ã— perStack), nÃ£o
    // uma escolha binÃ¡ria de "tem ou nÃ£o tem".
    const out = [];
    for (let k = 0; k <= (maxStacks || 0); k++) out.push(Math.round(k * perStack * 1e6) / 1e6);
    return out;
  }

  function buildLeechBaseCandidates(slots, maxSlots, extraLists) {
    // D-020: o personagem pode ter mais de uma fonte de leech no set. Para EK/RP
    // com arma + item/fonte adicional, dois Powerful Life/Mana Leech sÃ£o plausÃ­veis.
    // Ainda nÃ£o aceitamos percentual livre: sÃ³ somas discretas de fontes oficiais.
    // `slots` (imbuement) combina atÃ© `maxSlots` vezes com repetiÃ§Ã£o; cada lista em
    // `extraLists` (Conviction Perk, perk de arma, ...) jÃ¡ traz todos os seus totais
    // possÃ­veis e Ã© somada uma vez (nÃ£o repetida) via produto cartesiano.
    const sums = [0];
    const slotList = Array.from(slots || [0]);
    for (let n = 0; n < (maxSlots || 1); n++) {
      const next = [];
      for (const base of sums) for (const slot of slotList) next.push(base + slot);
      sums.splice(0, sums.length, ...next);
    }
    let combos = sums;
    for (const list of (extraLists && extraLists.length ? extraLists : [[0]])) {
      const next = [];
      for (const base of combos) for (const v of list) next.push(base + v);
      combos = next;
    }
    const out = combos.filter(total => total > 0);
    return sortedUnique(out);
  }

  function officialLeechBaseCandidatesWithWeapon(channel) {
    const baseCandidates = channel === 'life' ? LIFE_BASE_CANDIDATES : MANA_BASE_CANDIDATES;
    const out = [];
    const seen = new Set();
    for (const base of baseCandidates || []) {
      if (!(base > 0)) continue;
      for (let weaponCount = 0; weaponCount <= MAX_WEAPON_LEECH_BONUSES; weaponCount++) {
        const total = Math.round((base + weaponCount * WEAPON_LEECH_BONUS) * 1e6) / 1e6;
        const key = total + '|' + weaponCount;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          base: total,
          coreBase: base,
          weaponCount,
          weaponBonus: Math.round((weaponCount * WEAPON_LEECH_BONUS) * 1e6) / 1e6,
          sourceCount: countOfficialLeechSources(base, channel),
        });
      }
    }
    return out.sort((a, b) => a.base - b.base || a.weaponCount - b.weaponCount);
  }

  function normalizeName(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  function elementalStateKey(h) {
    return normalizeName(h.mob) + '|' + (h.exposeWeakness ? 1 : 0) + '|' + (h.isPrey ? 1 : 0) +
      '|' + (h.elementalAmplification ? 1 : 0) + '|' + (h.type || '') + '|' + (h.realCrit ? 1 : 0) +
      '|' + (h.lowBlow ? 1 : 0) + '|' + (h.onslaught ? 1 : 0);
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function tsToClock(ts) {
    ts = ((ts % 86400) + 86400) % 86400;
    const h = Math.floor(ts / 3600), m = Math.floor((ts % 3600) / 60), s = ts % 60;
    return pad2(h) + ':' + pad2(m) + ':' + pad2(s);
  }

  function median(values) {
    const v = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!v.length) return 0;
    const mid = Math.floor(v.length / 2);
    return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  }

  function median(values) {
    if (!values || !values.length) return null;
    const s = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function percentile(values, p) {
    const v = (values || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
    if (!v.length) return 0;
    const i = Math.min(v.length - 1, Math.max(0, Math.ceil(v.length * p) - 1));
    return v[i];
  }

  function mean(values) {
    const v = (values || []).filter(Number.isFinite);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  }

  function halfToFloat(h) {
    const s = (h & 0x8000) ? -1 : 1;
    const e = (h >> 10) & 0x1f;
    const f = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  function f16round(x) {
    if (Math.f16round) return Math.f16round(x);
    const f32 = new Float32Array(1);
    const i32 = new Int32Array(f32.buffer);
    f32[0] = x;
    const bits = i32[0];
    const sign = (bits >> 16) & 0x8000;
    let val = (bits & 0x7fffffff) + 0x1000;
    if (val >= 0x47800000) {
      if ((bits & 0x7fffffff) >= 0x47800000) {
        if (val < 0x7f800000) return sign ? -Infinity : Infinity;
        return NaN;
      }
      return sign ? -65504 : 65504;
    }
    if (val >= 0x38800000) return halfToFloat(sign | ((val - 0x38000000) >> 13));
    if (val < 0x33000000) return sign ? -0 : 0;
    val = (bits & 0x7fffffff) >> 23;
    return halfToFloat(sign | ((((bits & 0x7fffff) | 0x800000) + (0x800000 >> (val - 102))) >> (126 - val)));
  }

  function sessionDateKey(text) {
    const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
    const m = /saved\s+\w+\s+(\w+)\s+(\d+)\s+\d{2}:\d{2}:\d{2}\s+(\d{4})/i.exec(String(text || ''));
    if (!m) return null;
    const month = months[m[1]] || 0;
    return (+m[3]) * 10000 + month * 100 + (+m[2]);
  }

  function effectiveMod(baseMod, pierce) {
    if (!(pierce > 0)) return baseMod;
    if (!(baseMod > 0)) return baseMod;
    const toNeutral = Math.max(0, 1 - baseMod);
    const first = Math.min(toNeutral, pierce);
    const remaining = Math.max(0, pierce - first);
    const second = Math.ceil(Math.round(remaining * 100) / 2) / 100;
    return Math.min(baseMod + first + second, baseMod * 2);
  }

  function invFloor(y, q) {
    if (!(q > 0)) return null;
    return [Math.ceil(y / q), Math.ceil((y + 1) / q) - 1];
  }

  function invCeil(y, q) {
    if (!(q > 0)) return null;
    return [Math.floor((y - 1) / q) + 1, Math.floor(y / q)];
  }

  function intersectInterval(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    const lo = Math.max(a[0], b[0]);
    const hi = Math.min(a[1], b[1]);
    return hi >= lo ? [lo, hi] : null;
  }

  function intersectIntervalTol(a, b, tolerance) {
    if (!a) return b || null;
    if (!b) return a || null;
    const t = tolerance || 0;
    const lo = Math.max(a[0], b[0]) - t;
    const hi = Math.min(a[1], b[1]) + t;
    return hi >= lo ? [lo, hi] : null;
  }

  function intervalWidth(iv) { return iv ? (iv[1] - iv[0] + 1) : Infinity; }

  function rangeArray(lo, hi, cap) {
    const out = [];
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return out;
    const max = cap || 10000;
    for (let v = lo; v <= hi && out.length < max; v++) out.push(v);
    return out;
  }

  function intersectSets(sets, tolerance) {
    const clean = sets.filter(s => s && s.length);
    if (!clean.length) return [];
    let cur = new Set(clean[0]);
    for (let i = 1; i < clean.length; i++) {
      const next = new Set();
      for (const v of clean[i]) {
        for (let d = -(tolerance || 0); d <= (tolerance || 0); d++) {
          if (cur.has(v + d)) { next.add(v); break; }
        }
      }
      cur = next;
      if (!cur.size) return [];
    }
    return Array.from(cur).sort((a, b) => a - b);
  }

  function mitigationMultiplier(mods, opts) {
    const mit = Math.max(0, +(mods && mods.mitigation) || 0) / 100;
    const x = opts && opts.useFloat16Mitigation === false ? mit : f16round(mit);
    return 1 - x;
  }

  function critKeyForBlock(block) {
    if (!block) return null;
    if (block.comp === 'arrow') return 'physical';
    const a = block.action || {};
    const inc = a.incantation || a.text || a.name || a.label || '?';
    if (block.comp === 'spell') return 'spell:' + inc;
    if (block.comp === 'rune') return 'rune:' + inc;
    if (block.comp === 'grenade') return 'grenade:' + inc;
    return null;
  }

  function criticalMultiplierForHit(hit, context) {
    if (!hit) return 1;
    // Onslaught Ã© +60% fixo sobre o dano, ADITIVO com o crÃ­tico (D-009a): num hit
    // SEM crÃ­tico o bÃ´nus Ã© o fator conhecido 1.6 (nÃ£o depende de critSetup); num
    // hit COM crÃ­tico ele soma ao multiplicador de crÃ­tico do componente.
    if (!hit.realCrit) return hit.onslaught ? ONSLAUGHT_DAMAGE_MULTIPLIER : 1;
    const setup = context && context.critSetup;
    if (!setup) return hit.onslaught ? ONSLAUGHT_DAMAGE_MULTIPLIER : 1;
    // PreferÃªncia: crÃ­tico do componente do bloco em validaÃ§Ã£o (transiente
    // `_activeCritKey`, setado por validate*Block); depois a chave jÃ¡ colada no hit;
    // depois o fallback (global grosso da porÃ§Ã£o); por fim 1.
    const key = (context && context._activeCritKey) || (hit && hit._compKey) || null;
    const by = setup.byComponent;
    let base = null;
    if (key && by && by[key] > 1) base = by[key];
    else if (setup.fallback > 1) base = setup.fallback;
    else if (setup.multiplier > 1) base = setup.multiplier;
    if (base == null) base = hit.onslaught ? 1 : null;
    if (base == null) return 1;
    // Transcendence: bÃ´nus ADITIVO de +15pp no multiplicador jÃ¡ resolvido (nÃ£o
    // multiplicativo) para hits crÃ­ticos dentro da janela [T, T+7] do gatilho.
    let mult = isTranscendenceActiveAt(context, hit.ts) ? base + TRANSCENDENCE_CRIT_BONUS : base;
    if (hit.onslaught) mult += (ONSLAUGHT_DAMAGE_MULTIPLIER - 1);
    return mult;
  }

  function inverseCriticalMultiplierIntervals(value, crit) {
    if (!(crit > 1)) return [[value, value]];
    const out = [];
    const add = iv => {
      if (!iv || !Number.isFinite(iv[0]) || !Number.isFinite(iv[1]) || iv[1] < iv[0]) return;
      const lo = Math.max(0, Math.floor(iv[0]));
      const hi = Math.max(lo, Math.floor(iv[1]));
      const key = lo + ':' + hi;
      if (!out.some(x => x.key === key)) out.push({ key, iv: [lo, hi] });
    };
    // Modelo principal: C = FLOOR(preMitigationDamage * critMultiplier).
    // CEIL fica como hipÃ³tese conservadora porque alguns multiplicadores finais
    // observados no client jÃ¡ exigiram dupla hipÃ³tese de arredondamento.
    add(invFloor(value, crit));
    add(invCeil(value, crit));
    return out.map(x => x.iv).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  function postMultiplier(hit, context) {
    // Prey/Bounty Talisman e utevo grav san ampliam o dano final exibido.
    // Para reconstruÃ§Ã£o determinÃ­stica, eles entram como multiplicadores pÃ³s-mit.
    let m = 1;
    if (hit && hit.isPrey) m *= 1.25;
    m *= gravSanMultiplierAtTs(context, hit && hit.ts, hit);
    m *= bestiaryClassMultiplierForHit(hit, context);
    return m;
  }

  function inversePostMultiplierIntervals(displayDamage, post) {
    const out = [];
    const add = iv => {
      if (!iv || !Number.isFinite(iv[0]) || !Number.isFinite(iv[1]) || iv[1] < iv[0]) return;
      const lo = Math.max(0, Math.floor(iv[0]));
      const hi = Math.max(lo, Math.floor(iv[1]));
      const key = lo + ':' + hi;
      if (!out.some(x => x.key === key)) out.push({ key, iv: [lo, hi] });
    };
    add(invFloor(displayDamage, post));
    // V15: active prey/grav podem aparecer com arredondamento por CEIL em alguns
    // pontos do client. A inversÃ£o aceita FLOOR e CEIL como hipÃ³teses discretas.
    add(invCeil(displayDamage, post));
    return out.map(x => x.iv).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  function inverseTerraBurstBonusIntervals(value, multiplier) {
    if (!(multiplier > 1)) return [[value, value]];
    const out = [];
    const add = iv => {
      if (!iv || !Number.isFinite(iv[0]) || !Number.isFinite(iv[1]) || iv[1] < iv[0]) return;
      const lo = Math.max(0, Math.floor(iv[0]));
      const hi = Math.max(lo, Math.floor(iv[1]));
      const key = lo + ':' + hi;
      if (!out.some(x => x.key === key)) out.push({ key, iv: [lo, hi] });
    };
    // Terra Burst bonus is modeled as a pre-mitigation damage bonus. The exact
    // client rounding is CEIL-like in the observed 2497 darklight matter example;
    // FLOOR is accepted as a conservative adjacent hypothesis, as with post mods.
    add(invCeil(value, multiplier));
    add(invFloor(value, multiplier));
    return out.map(x => x.iv).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  const BONUS_TIER_ACTIONS = {
    'exevo ulus tera': { element: 'earth', label: 'terra burst' },
    'exevo ulus frigo': { element: 'ice', label: 'ice burst' },
  };

  function isTerraBurstAction(action) {
    if (!action) return false;
    const words = normalizeName(action.words || action.spell || action.name || '');
    if (BONUS_TIER_ACTIONS[words]) return true;
    const label = normalizeName(action.profile && action.profile.label || '');
    return Object.values(BONUS_TIER_ACTIONS).some(a => a.label === label);
  }

  // Executioner's Throw (`exori amp kor`, EK, fÃ­sico de Ã¡rea) tem um bÃ´nus de dano
  // condicional por vida do alvo (execute): binÃ¡rio por-hit, multiplicador fixo por
  // personagem em EXECUTIONER_BONUS_LEVELS (+100/+125/+150% = Ã—2.0/Ã—2.25/Ã—2.5). Ao
  // contrÃ¡rio do Terra Burst, o tier NÃƒO se resolve por reversÃ£o (dano fÃ­sico com arma
  // possivelmente 0% fÃ­sico nÃ£o reverte); o detector usa leech por-canal por-turno
  // (detectExecutionerTiers) e o dano dos hits limpos sÃ³ pina o multiplicador.
  const EXECUTIONER_BONUS_LEVELS = [2.0, 2.25, 2.5];

  function isExecutionerThrowAction(action) {
    if (!action) return false;
    const words = normalizeName(action.words || action.text || action.spell || action.name || '');
    if (words === 'exori amp kor') return true;
    const label = normalizeName(action.profile && action.profile.label || action.label || '');
    return label === "executioner's throw" || label === 'executioners throw';
  }

  // M-037: Chained Penance (`exori med pug`, monk, holy, area) encadeia entre alvos e
  // perde uma fracao fixa de dano a cada pulo da cadeia. O mesmo mob pode aparecer em
  // posicoes de cadeia diferentes dentro do MESMO cast, com danos distintos — divergencia
  // declarada pela regra, nao contradicao (D-006). O motor NAO reconstroi o fator (mesmo
  // status dos sub-tiers de beam em M-035): a declaracao existe para isentar o bloco do
  // veto duro de exatidao same-mob, nao para reverter dano.
  function isChainedPenanceAction(action) {
    if (!action) return false;
    const words = normalizeName(action.words || action.text || action.spell || action.name || '');
    if (words === 'exori med pug') return true;
    const label = normalizeName(action.profile && action.profile.label || action.label || '');
    return label === 'chained penance';
  }

  function isTerraBurstBlock(block, element) {
    if (!block || block.comp !== 'spell' || !isTerraBurstAction(block.action)) return false;
    const action = block.action;
    const words = normalizeName(action.words || action.spell || action.name || '');
    const label = normalizeName(action.profile && action.profile.label || '');
    const entry = BONUS_TIER_ACTIONS[words] || Object.values(BONUS_TIER_ACTIONS).find(a => a.label === label);
    return !!entry && entry.element === element;
  }

  function pierceForElement(element, hit, context) {
    let p = 0;
    if (hit && hit.exposeWeakness) p += 0.08;
    // D-010c (docs/CLASSIFICATION_RULES.md): "active elemental amplification" no
    // sufixo da linha de dano Ã© um fato observado do hit, +0.16 de pierce antes de
    // effectiveMod. Aplica-se tanto aos eixos elementais quanto ao fÃ­sico.
    if (hit && hit.elementalAmplification) p += 0.16;
    if ((element === 'holy' || element === 'physical') && context && context.bmPierce) p += context.bmPierce;
    return p;
  }

  function explicitBmPierceOption(options) {
    if (!options) return null;
    if (options.bmPierce != null) return Math.max(0, +options.bmPierce || 0);
    if (options.battleMomentumPierce != null) return Math.max(0, +options.battleMomentumPierce || 0);
    return null;
  }

  function distinctMainMobCount(hits) {
    const set = new Set();
    for (const h of hits || []) if (isMainHit(h) && h.mob) set.add(normalizeName(h.mob));
    return set.size;
  }

  function getMobMods(mob, context) {
    const name = normalizeName(mob);
    if (!name) return null;
    // Quando o adapter passa explicitamente a tabela pÃ³s-cutoff, ela Ã© a fonte
    // primÃ¡ria. Muitos pares exportados nÃ£o trazem data na linha do Server Log;
    // nesse caso sessionDateKey fica null, mas nÃ£o devemos cair para tabela antiga
    // ou ausÃªncia de tabela. getMobMods custom sÃ³ Ã© fallback.
    if (context && context.mobModsPost && (context.sessionDateKey == null || context.sessionDateKey >= CUTOFF_KEY)) {
      return context.mobModsPost[name] || null;
    }
    if (context && typeof context.getMobMods === 'function') return context.getMobMods(name, context) || null;
    if (context && context.mobModsPre) return context.mobModsPre[name] || null;
    if (typeof root.getMobElementMods === 'function') return root.getMobElementMods(name) || null;
    if (root.MOB_ELEMENT_MODS) return root.MOB_ELEMENT_MODS[name] || null;
    return null;
  }

  // Bônus de dano do PLAYER contra uma classe de bestiário (ex.: reward "Improved" de
  // +5% contra Aves). Fato do personagem, não da spell/elemento — por isso entra como
  // multiplicador pós-mitigação uniforme (mesmo ponto de prey/utevo grav san), afetando
  // igualmente a reversão física (AA) e elemental (spell/runa/granada) contra mobs da
  // classe detectada. Detectado por sessão em inferBestiaryClassDamageBonus (motor),
  // confirmado pelo dano de charm ofensivo (valor fixo por mob, sem sorteio) usando a
  // MESMA fórmula de pierce/mitigação do dano normal (effectiveMod/pierceForElement/
  // mitigationMultiplier) — ver docs/CLASSIFICATION_RULES.md.
  function bestiaryClassMultiplierForHit(hit, context) {
    const setup = context && context.bestiaryClassBonus;
    if (!setup || !(setup.multiplier > 1) || !setup.class) return 1;
    const mods = getMobMods(hit && hit.mob, context);
    if (!mods || !mods.bestiaryClass) return 1;
    return normalizeName(mods.bestiaryClass) === setup.class ? setup.multiplier : 1;
  }

  function elementalOriginalCandidates(hit, element, context, options) {
    const mods = getMobMods(hit.mob, context);
    if (!mods) return { known: false, originals: [], reason: 'mob_mods_absent' };
    const key = ELEMENT_KEYS[element];
    if (!key || !(mods[key] > 0)) return { known: true, originals: [], reason: 'element_mod_absent_or_zero' };
    const mod = effectiveMod(+mods[key], pierceForElement(element, hit, context));
    const mit = mitigationMultiplier(mods, context);
    const post = postMultiplier(hit, context);
    const terraBurstBonusMultiplier = options && options.terraBurstBonusMultiplier > 1 ? +options.terraBurstBonusMultiplier : 1;
    const crit = criticalMultiplierForHit(hit, context);
    // D-010f: Perfect Shot e bonus ADITIVO em dano, somado depois do critico e antes
    // da mitigation -- a mesma posicao usada por physicalOriginalInterval. Enquanto
    // todo AA de RP foi fisico isto nunca importou aqui (perfect shot so marca AA, e
    // o AA nunca passava pelo eixo elemental, S-007); com municao de area elemental,
    // omitir o termo desloca o hit marcado ~3% e cria fronteira falsa (S-004a).
    const perfectShotBonus = hit && hit.perfectShot ? PERFECT_SHOT_PREMIT_BONUS : 0;
    // MemoizaÃ§Ã£o (sÃ³-desempenho): a reversÃ£o de um hit depende apenas destes
    // escalares resolvidos â€” mod/mit/post/crit jÃ¡ dobram gravSan/crit/pierce/BM/mob â€”
    // e NÃƒO da partiÃ§Ã£o candidata. O mesmo hit Ã© revertido em centenas de partiÃ§Ãµes;
    // o valor Ã© lido apenas (read-only), entÃ£o Ã© seguro compartilhar por referÃªncia.
    // D-010f: perfectShotBonus ENTRA na chave. Sem ele, dois hits de mesmo dano no
    // mesmo mob e mesmo estado -- um marcado, outro nao -- colidiriam e o segundo
    // receberia o original do primeiro (ex.: thunder arrow 18:57:18 tem dois
    // "oozing corpus 595" e dois "mycobiontic beetle 552").
    const revCache = context && (context._revCache || (context._revCache = new Map()));
    const cacheKey = revCache && ('E|' + element + '|' + (+hit.dmg) + '|' + mod + '|' + mit + '|' + post + '|' + crit + '|' + terraBurstBonusMultiplier + '|' + perfectShotBonus);
    if (revCache && revCache.has(cacheKey)) return revCache.get(cacheKey);
    const postIntervals = inversePostMultiplierIntervals(+hit.dmg, post);
    if (!postIntervals.length) { const r = { known: true, originals: [], reason: 'invalid_post_multiplier' }; if (revCache) revCache.set(cacheKey, r); return r; }

    const collectOriginals = (intermediateTolerance) => {
      const out = new Set();
      for (const aIv of postIntervals) {
        for (let a = aIv[0]; a <= aIv[1]; a++) {
          const t = Math.max(0, intermediateTolerance || 0);
          for (let aa = Math.max(1, a - t); aa <= a + t; aa++) {
            const eIv = invFloor(aa, mit);
            if (!eIv) continue;
            for (let c0 = eIv[0]; c0 <= eIv[1]; c0++) {
              // D-010f: subtrai o bonus de Perfect Shot aqui -- logo apos desfazer a
              // mitigation e antes de desfazer o critico -- exatamente onde
              // physicalOriginalInterval faz (`prePerfect = c - perfectShotBonus`).
              // Terra Burst tambem e pre-mitigation, mas a ordem relativa entre os dois
              // e inerte: Terra Burst so existe em `exevo ulus tera` (druid) e Perfect
              // Shot so marca AA de distancia; nenhum hit carrega os dois.
              const c = c0 - perfectShotBonus;
              if (c < 1) continue;
              const terraIntervals = inverseTerraBurstBonusIntervals(c, terraBurstBonusMultiplier);
              for (const terraIv of terraIntervals) {
                for (let tb = terraIv[0]; tb <= terraIv[1]; tb++) {
                  const preCritIntervals = inverseCriticalMultiplierIntervals(tb, crit);
                  for (const preCritIv of preCritIntervals) {
                    for (let e = preCritIv[0]; e <= preCritIv[1]; e++) {
                      // V-caso mazzerinbarrage 03:42:26: a tolerÃ¢ncia intermediÃ¡ria tambÃ©m
                      // cobre a etapa final da cadeia (a inversÃ£o do mod elemental), nÃ£o sÃ³
                      // a etapa inicial (`aa`). Um gap de arredondamento pode existir
                      // especificamente aqui mesmo quando todas as etapas anteriores (mit,
                      // crÃ­tico) tÃªm soluÃ§Ã£o exata e Ãºnica â€” perturbar sÃ³ `aa` nunca alcanÃ§a
                      // esse gap. Ver design.md de extend-elemental-intermediate-tolerance-to-mod-inversion.
                      for (let ee = Math.max(1, e - t); ee <= e + t; ee++) {
                        const oIv = invCeil(ee, mod);
                        if (!oIv) continue;
                        for (let o = oIv[0]; o <= oIv[1]; o++) if (o > 0) out.add(o);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      return out;
    };

    let originals = collectOriginals(0);
    let intermediateToleranceUsed = 0;
    if (!originals.size && ELEMENTAL_INTERMEDIATE_TOLERANCE > 0) {
      originals = collectOriginals(ELEMENTAL_INTERMEDIATE_TOLERANCE);
      if (originals.size) intermediateToleranceUsed = ELEMENTAL_INTERMEDIATE_TOLERANCE;
    }

    const result = { known: true, originals: Array.from(originals).sort((a, b) => a - b), mod, mitigation: mit, post, postIntervals, postInverse: 'floor_or_ceil', terraBurstBonusMultiplier, terraBurstBonusActive: terraBurstBonusMultiplier > 1, crit, critSetup: context && context.critSetup, intermediateToleranceUsed };
    if (revCache) revCache.set(cacheKey, result);
    return result;
  }

  function physicalOriginalInterval(hit, context) {
    const mods = getMobMods(hit.mob, context);
    if (!mods) return { known: false, interval: null, reason: 'mob_mods_absent' };
    if (!(mods.physicalDmgMod > 0)) return { known: true, interval: null, reason: 'physical_mod_absent_or_zero' };
    const mod = effectiveMod(+mods.physicalDmgMod, pierceForElement('physical', hit, context));
    const mit = mitigationMultiplier(mods, context);
    const post = postMultiplier(hit, context);
    const armorEff = Math.round(((+mods.armor) || 0) * (1 - ((context && context.armorPenetration) || 0)));
    const armorLow = Math.max(Math.floor(armorEff / 2), 0);
    const armorHigh = Math.max(Math.floor(armorEff / 2) * 2 - 1, 0);
    const crit = criticalMultiplierForHit(hit, context);
    const perfectShotBonus = hit && hit.perfectShot ? PERFECT_SHOT_PREMIT_BONUS : 0;
    // MemoizaÃ§Ã£o (sÃ³-desempenho): mesma justificativa de elementalOriginalCandidates â€”
    // a reversÃ£o fÃ­sica depende sÃ³ destes escalares resolvidos, nÃ£o da partiÃ§Ã£o.
    const revCache = context && (context._revCache || (context._revCache = new Map()));
    const cacheKey = revCache && ('P|' + (+hit.dmg) + '|' + mod + '|' + mit + '|' + post + '|' + crit + '|' + perfectShotBonus + '|' + armorLow + '|' + armorHigh);
    if (revCache && revCache.has(cacheKey)) return revCache.get(cacheKey);
    const postIntervals = inversePostMultiplierIntervals(+hit.dmg, post);
    if (!postIntervals.length) { const r = { known: true, interval: null, reason: 'invalid_post_multiplier' }; if (revCache) revCache.set(cacheKey, r); return r; }
    // Onslaught soma +0.6 a um crÃ­tico jÃ¡ INFERIDO (mean/mean, nÃ£o exato). Nesse
    // multiplicador combinado, um dano especÃ­fico pode cair num "buraco" do
    // reticulado discreto (FLOOR/CEIL vazios) mesmo sendo um hit real do mesmo
    // bloco â€” mesmo risco que a reversÃ£o elemental jÃ¡ tolera via
    // ELEMENTAL_INTERMEDIATE_TOLERANCE (D-010a). Tenta exato primeiro; sÃ³ se vazio,
    // relaxa Â±1 no valor prÃ©-crÃ­tico.
    const collectPhysical = (tolerance) => {
      let lo = Infinity, hi = -Infinity;
      for (const bIv of postIntervals) {
        for (let b = bIv[0]; b <= bIv[1]; b++) {
          const cIv = invFloor(b, mit);
          if (!cIv) continue;
          for (let c = cIv[0]; c <= cIv[1]; c++) {
            // Perfect Shot entra como +20 prÃ©-mitigaÃ§Ã£o. Para reconstruir o
            // original fÃ­sico, removemos esse bÃ´nus antes de desfazer o crÃ­tico.
            const prePerfect = c - perfectShotBonus;
            if (prePerfect < 0) continue;
            const t = Math.max(0, tolerance || 0);
            for (let pp = Math.max(0, prePerfect - t); pp <= prePerfect + t; pp++) {
              const preCritIntervals = inverseCriticalMultiplierIntervals(pp, crit);
              for (const aIv of preCritIntervals) {
                lo = Math.min(lo, aIv[0]);
                hi = Math.max(hi, aIv[1]);
              }
            }
          }
        }
      }
      return hi >= lo ? [lo, hi] : null;
    };
    let physIv = collectPhysical(0);
    if (!physIv && ELEMENTAL_INTERMEDIATE_TOLERANCE > 0) physIv = collectPhysical(ELEMENTAL_INTERMEDIATE_TOLERANCE);
    if (!physIv) { const r = { known: true, interval: null, reason: 'invalid_mitigation_or_crit_inverse' }; if (revCache) revCache.set(cacheKey, r); return r; }
    const [aMin, aMax] = physIv;

    // Para dano final positivo, A = max(E - armorRoll, 0) precisa estar no intervalo positivo.
    // Caso A=0/dano baixo fica tratado de forma conservadora pelo mesmo intervalo ampliado.
    const eMin = Math.max(1, aMin + armorLow);
    const eMax = Math.max(eMin, aMax + armorHigh);
    const oMin = Math.floor((eMin - 1) / mod) + 1;
    const oMax = Math.floor(eMax / mod);
    const interval = oMax >= oMin ? [oMin, oMax] : null;
    const result = { known: true, interval, mod, mitigation: mit, post, postIntervals, postInverse: 'floor_or_ceil', crit, critSetup: context && context.critSetup, perfectShotBonus, armorEff, armorLow, armorHigh };
    if (revCache) revCache.set(cacheKey, result);
    return result;
  }

  function isMainHit(hit) {
    if (!hit) return false;
    if (hit.damageReflection || hit.woundCharm || hit.overpowerCharm) return false;
    if (hit.type !== 'normal' && hit.type !== 'crit') return false;
    return true;
  }
  function gravSanHitInWindow(context, hitOrTs) {
    const setup = context && context.gravSanSetup;
    const ts = typeof hitOrTs === 'object' && hitOrTs ? +hitOrTs.ts : +hitOrTs;
    if (!setup || !(setup.bonus > 0) || !Number.isFinite(ts)) return false;
    return (setup.windows || []).some(w => ts >= w.start && ts <= w.end);
  }

  function gravSanMultiplierAtTs(context, ts, hit) {
    const setup = context && context.gravSanSetup;
    if (!setup || !(setup.bonus > 0) || !Number.isFinite(+ts)) return 1;
    const inWindow = gravSanHitInWindow(context, hit || ts);
    if (!inWindow) return 1;

    // V18: nÃ­vel do buff Ã© global do log, mas aplicaÃ§Ã£o Ã© por ataque/componente.
    // context.gravSanHitOverride contÃ©m decisÃµes temporÃ¡rias durante a validaÃ§Ã£o
    // de um candidato: hit.id => true/false. Sem override, mantemos o comportamento
    // histÃ³rico como ativo dentro da janela.
    const overrides = context && context.gravSanHitOverride;
    const id = hit && hit.id;
    if (overrides && id != null && Object.prototype.hasOwnProperty.call(overrides, id)) {
      return overrides[id] ? (1 + setup.bonus) : 1;
    }
    return 1 + setup.bonus;
  }

  const API = {
    gravSanHitInWindow,
    gravSanMultiplierAtTs,
    VERSION,
    CUTOFF_KEY,
    ELEMENT_KEYS,
    ELEMENTS,
    SINGLE_TARGET_RUNES,
    IGNORED_RUNE_RE,
    IGNORED_SPELL_RE,
    SINGLE_TARGET_AA_VOCATIONS,
    RUNE_PROFILES,
    SPELL_PROFILES,
    SUPPORT_OR_HEAL_RE,
    MAGIC_PREFIX_RE,
    LIFE_IMBUEMENT_SLOTS,
    MANA_IMBUEMENT_SLOTS,
    LIFE_CONVICTION,
    MANA_CONVICTION,
    LIFE_WEAPON_PERK,
    MANA_WEAPON_PERK,
    LIFE_BASE_CANDIDATES,
    MANA_BASE_CANDIDATES,
    VAMPIRIC_BONUSES,
    VOIDS_BONUSES,
    WEAPON_LEECH_BONUS,
    MAX_WEAPON_LEECH_BONUSES,
    SPELL_LEECH_BONUS_CANDIDATES,
    GRAV_SAN_INCANTATION,
    GRAV_SAN_DURATION_SECONDS,
    GRAV_SAN_BONUS_CANDIDATES,
    BESTIARY_CLASS_DAMAGE_BONUS_CANDIDATES,
    bestiaryClassMultiplierForHit,
    CRIT_BUCKET_MIN_SAMPLES,
    CRIT_BOOTSTRAP_MAX,
    CRIT_MULTIPLIER_CANDIDATES,
    snapCritMultiplier,
    TRANSCENDENCE_WINDOW_SECONDS,
    TRANSCENDENCE_CRIT_BONUS,
    ONSLAUGHT_DAMAGE_MULTIPLIER,
    isTranscendenceActiveAt,
    PERFECT_SHOT_PREMIT_BONUS,
    LEECH_VALUE_TOLERANCE_SMALL_BLOCK,
    LEECH_VALUE_TOLERANCE_LARGE_BLOCK,
    LEECH_VALUE_TOLERANCE_SMALL_BLOCK_MAX,
    ELEMENTAL_INTERMEDIATE_TOLERANCE,
    PHYSICAL_INTERSECTION_TOLERANCE,
    ELEMENTAL_CLUSTER_MIN_TOLERANCE,
    ELEMENTAL_CLUSTER_MAX_TOLERANCE,
    ELEMENTAL_CLUSTER_RATIO,
    TERRA_BURST_BONUS_LEVELS,
    leechValueToleranceForN,
    sortedUnique,
    stackTotals,
    buildLeechBaseCandidates,
    officialLeechBaseCandidatesWithWeapon,
    normalizeName,
    elementalStateKey,
    pad2,
    tsToClock,
    median,
    percentile,
    mean,
    halfToFloat,
    f16round,
    sessionDateKey,
    effectiveMod,
    invFloor,
    invCeil,
    intersectInterval,
    intersectIntervalTol,
    intervalWidth,
    rangeArray,
    intersectSets,
    mitigationMultiplier,
    critKeyForBlock,
    criticalMultiplierForHit,
    inverseCriticalMultiplierIntervals,
    postMultiplier,
    inversePostMultiplierIntervals,
    inverseTerraBurstBonusIntervals,
    BONUS_TIER_ACTIONS,
    isTerraBurstAction,
    isTerraBurstBlock,
    EXECUTIONER_BONUS_LEVELS,
    isExecutionerThrowAction,
    isChainedPenanceAction,
    pierceForElement,
    explicitBmPierceOption,
    distinctMainMobCount,
    getMobMods,
    elementalOriginalCandidates,
    physicalOriginalInterval,
    isMainHit,
  };

  root.UnifiedFormulas = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : window);
