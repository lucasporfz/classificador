#!/usr/bin/env node
// gabarito-unified.mjs — asserts executáveis de turnos-gabarito para o
// UnifiedClassificationEngine (js/unified-classification-engine.js).
//
// Espelha tools/gabarito.mjs, mas roda o engine unificado (classifyUnified) em
// vez do classificador de produção. Cada caso aponta um par de logs + um
// timestamp; o harness varre TODAS as sessões do par e confere a expectativa de
// contagem por componente no turno alinhado.
//
// Uso:
//   node tools/gabarito-unified.mjs            -> roda os asserts (exit 1 se algum falhar)
//   node tools/gabarito-unified.mjs --only <substr>  -> filtra casos cujo id contém <substr>
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { classificationFingerprint } from './unified-classification-fingerprint.mjs';
import { UnifiedCorpus, toSec as parseClock } from './unified-corpus.mjs';
import { SHARED_UNIFIED_GOLDEN_CASES } from './unified-golden-cases.mjs';

const counts = turn => {
  const c = { arrow:0, spell:0, rune:0, grenade:0 };
  for (const comp of turn.components || []) { const k = comp.comp || comp.kind; if (k in c) c[k] += (comp.hits || []).length; }
  return c;
};

const C = (id, sv, lc, ts, check, date) => ({ id, sv, lc, ts: parseClock(ts), tsRaw: ts, check, date });
const CN = (id, sv, lc, ts, date) => ({ id, sv, lc, ts: parseClock(ts), tsRaw: ts, noTurn: true, date });
const sharedCountCheck = expected => turn => {
  const got = counts(turn);
  for (const [component, count] of Object.entries(expected)) {
    if (got[component] !== count) {
      return `esperado ${JSON.stringify(expected)}; got A${got.arrow} S${got.spell} R${got.rune} G${got.grenade}`;
    }
  }
  return null;
};
const beamNoAaCheck = (expectedSpellHits, labelPart) => turn => {
  const c = counts(turn);
  if (!(c.arrow === 0 && c.spell === expectedSpellHits && c.rune === 0 && c.grenade === 0)) {
    return `esperado A0 S${expectedSpellHits}; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
  }
  const spell = (turn.components || []).find(comp => comp.comp === 'spell');
  if (!spell || !String(spell.actionLabel || '').includes(labelPart)) {
    return `esperado ${labelPart}; got ${spell && spell.actionLabel || '-'}`;
  }
  const hits = (spell.hits || []).filter(h => !h.overkill && h.dmg > 0);
  const side = hits.filter(h => h.beamSide === 'side').length;
  const central = hits.filter(h => h.beamSide === 'central').length;
  return side > 0 && central > 0 ? null : `esperado beamSide side+central; got side=${side} central=${central}`;
};
const spellNoAaCheck = (expectedSpellHits, labelPart) => turn => {
  const c = counts(turn);
  if (!(c.arrow === 0 && c.spell === expectedSpellHits && c.rune === 0 && c.grenade === 0)) {
    return `esperado A0 S${expectedSpellHits}; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
  }
  const spell = (turn.components || []).find(comp => comp.comp === 'spell');
  return spell && String(spell.actionLabel || '').includes(labelPart)
    ? null
    : `esperado ${labelPart}; got ${spell && spell.actionLabel || '-'}`;
};
const energyWaveWithoutHealingRuneCheck = turn => {
  const c = counts(turn);
  if (!(c.arrow === 0 && c.spell === 1 && c.rune === 0 && c.grenade === 0)) {
    return `esperado A0 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
  }
  const spell = (turn.components || []).find(comp => comp.comp === 'spell');
  if (!spell || !String(spell.actionLabel || '').includes('Energy Wave (exevo vis hur)')) {
    return `esperado Energy Wave (exevo vis hur); got ${spell && spell.actionLabel || '-'}`;
  }
  const healingRune = (turn.components || []).find(comp =>
    comp.comp === 'rune' && /ultimate healing/i.test(String(comp.actionLabel || '')));
  return healingRune ? 'Ultimate Healing não pode nomear componente de dano' : null;
};
// M-015/N-007/N-008 (change fix-action-reuse-across-turns): contagem sozinha nao pega o
// defeito de reuso de acao — os dois turnos vizinhos tem a contagem certa e mesmo assim
// compartilham a MESMA acao. O assert precisa cravar qual acao concreta nomeia o
// componente, pelo relogio da acao.
const componentActionAtCheck = (expected, comp, expectedActionClock) => turn => {
  const c = counts(turn);
  for (const [component, count] of Object.entries(expected)) {
    if (c[component] !== count) {
      return `esperado ${JSON.stringify(expected)}; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
    }
  }
  const block = (turn.components || []).find(x => (x.comp || x.kind) === comp);
  if (!block) return `esperado componente ${comp} presente; ausente`;
  const clock = block.action && block.action.clock || null;
  return clock === expectedActionClock
    ? null
    : `esperado acao de ${comp} em ${expectedActionClock}; got ${clock || '-'}`;
};
const spellWithAaCheck = (expectedArrowHits, expectedSpellHits, labelPart, expectedBeam = null) => turn => {
  const c = counts(turn);
  if (!(c.arrow === expectedArrowHits && c.spell === expectedSpellHits && c.rune === 0 && c.grenade === 0)) {
    return `esperado A${expectedArrowHits} S${expectedSpellHits}; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
  }
  const spell = (turn.components || []).find(comp => comp.comp === 'spell');
  if (!spell || !String(spell.actionLabel || '').includes(labelPart)) {
    return `esperado ${labelPart}; got ${spell && spell.actionLabel || '-'}`;
  }
  if (expectedBeam) {
    const central = (spell.hits || []).filter(h => h.beamSide === 'central').length;
    const side = (spell.hits || []).filter(h => h.beamSide === 'side').length;
    if (central !== expectedBeam.central || side !== expectedBeam.side) {
      return `esperado beam central=${expectedBeam.central} side=${expectedBeam.side}; got central=${central} side=${side}`;
    }
  }
  return null;
};
const grenadeWithAaSpellCheck = (expectedArrowHits, expectedSpellHits, expectedGrenadeHits, spellLabelPart, expectedGrenadeTimestamps, requiredGrenadeSeqs) => turn => {
  const c = counts(turn);
  if (!(c.arrow === expectedArrowHits && c.spell === expectedSpellHits && c.rune === 0 && c.grenade === expectedGrenadeHits)) {
    return `esperado A${expectedArrowHits} S${expectedSpellHits} G${expectedGrenadeHits}; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
  }
  const spell = (turn.components || []).find(comp => comp.comp === 'spell');
  if (!spell || !String(spell.actionLabel || '').includes(spellLabelPart)) {
    return `esperado ${spellLabelPart}; got ${spell && spell.actionLabel || '-'}`;
  }
  const grenade = (turn.components || []).find(comp => comp.comp === 'grenade');
  if (!grenade || !String(grenade.actionLabel || '').includes('Divine Grenade')) {
    return `esperado Divine Grenade; got ${grenade && grenade.actionLabel || '-'}`;
  }
  const timestamps = [...new Set((grenade.hits || []).filter(h => !h.virtual).map(h => h.ts))].sort((a, b) => a - b);
  if (timestamps.join(',') !== expectedGrenadeTimestamps.join(',')) {
    return `esperado timestamps de granada ${expectedGrenadeTimestamps.join(',')}; got ${timestamps.join(',')}`;
  }
  const seqs = new Set((grenade.hits || []).map(h => h.seq));
  const missingSeqs = requiredGrenadeSeqs.filter(seq => !seqs.has(seq));
  return missingSeqs.length ? `hits de rollover ausentes da granada: seq=${missingSeqs.join(',')}` : null;
};
const savageBlowIdentityCheck = turn => {
  const base = spellWithAaCheck(1, 14, 'Death Echo')(turn);
  if (base) return base;
  const hits = (turn.components || []).flatMap(comp => comp.hits || []);
  const savage = hits.filter(h => h.savageBlow);
  if (savage.length !== 2) return `esperado 2 hits savageBlow; got ${savage.length}`;
  const mislabeled = savage.filter(h => h.lowBlow);
  return mislabeled.length ? `savageBlow marcado tambem como lowBlow em ${mislabeled.length} hits` : null;
};
export const CASES = [
  // ms boss S25: Ultimate Healing é tentativa observada, não ação ofensiva.
  // O cast concreto de Energy Wave no mesmo segundo explica o único hit.
  C('ms boss/22:19:01-energy-wave', 'ms boss server log.txt', 'ms boss local chat.txt', '22:19:01',
    energyWaveWithoutHealingRuneCheck, '13/Jun/2026'),
  // ms boss S25: boss unitario no mesmo segundo de Energy Wave. O boss nao pode
  // receber dois hits da mesma acao concreta; o primeiro hit fica como AA e o
  // segundo como Energy Wave.
  C('ms boss/22:20:35-aa-energy-wave', 'ms boss server log.txt', 'ms boss local chat.txt', '22:20:35',
    spellWithAaCheck(1, 1, 'Energy Wave (exevo vis hur)'), '13/Jun/2026'),
  // ms boss S4: pack multi-mob com Using concreto de Great Fireball. O
  // primeiro cyclursus 1267 ONS é mecanicamente igual a outros hits da runa;
  // posição isolada não prova AA (H-005/V-017/V-018).
  C('ms boss/21:37:09-great-fireball-no-aa', 'ms boss server log.txt', 'ms boss local chat.txt', '21:37:09',
    t => {
      const c = counts(t);
      if (!(c.arrow === 0 && c.spell === 0 && c.rune === 13 && c.grenade === 0)) {
        return `esperado A0 R13; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const rune = (t.components || []).find(component => component.comp === 'rune');
      return rune && String(rune.actionLabel || '').includes('Great Fireball')
        ? null
        : `esperado Great Fireball; got ${rune && rune.actionLabel || '-'}`;
    }, '10/Jun/2026'),
  // D-022a: o +2% de Mana Leech dos hits com EW fecha o bloco inteiro em
  // N_leech=8; o primeiro hit sem EW nao deve virar AA por score parcial.
  C('ms boss/17:10:31-great-fireball-ew-mana-leech', 'ms boss server log.txt', 'ms boss local chat.txt', '17:10:31',
    t => {
      const c = counts(t);
      const rune = (t.components || []).find(component => component.comp === 'rune');
      return c.arrow === 0 && c.spell === 0 && c.rune === 8 && c.grenade === 0
        && rune && String(rune.actionLabel || '').includes('Great Fireball')
        ? null
        : `esperado A0 R8 Great Fireball; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
    }, '11/Jun/2026'),
  // S-014e/C-008/M-031/M-032: com AA visivel, o AA single-target esta saturado
  // e o charm-kill real pertence a acao de area, mesmo quando o leech do bloco
  // nao fecha nenhum N. Sao 7 hits visiveis + 1 virtual = 8.
  C('mrowdy 2/18:26:55-energy-wave-virtual-charm-kill', 'Mrowdy Server Log 2.txt', 'Mrowdy Local Chat 2.txt', '18:26:55',
    t => {
      const c = counts(t);
      const spell = (t.components || []).find(component => component.comp === 'spell');
      const virtuals = ((spell && spell.hits) || []).filter(hit => hit.virtual).length;
      if (!(c.arrow === 1 && c.spell === 8 && c.rune === 0 && c.grenade === 0)) {
        return `esperado A1 S8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      if (virtuals !== 1) return `esperado 1 hit virtual na spell; got ${virtuals}`;
      return String(spell.actionLabel || '').includes('Energy Wave')
        ? null
        : `esperado Energy Wave; got ${spell.actionLabel || '-'}`;
    }, '11/Jun/2026'),
  // Controle positivo: o primeiro hit sem EW confirma N=1 por mana e rejeita
  // N=8; D-022a nao apaga um AA realmente sustentado.
  C('ms boss/17:10:33-aa-great-fireball-ew-mana-leech', 'ms boss server log.txt', 'ms boss local chat.txt', '17:10:33',
    t => {
      const c = counts(t);
      return c.arrow === 1 && c.spell === 0 && c.rune === 7 && c.grenade === 0
        ? null
        : `esperado A1 R7; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
    }, '11/Jun/2026'),
  // Segundo caso real em que o bonus pre-cutoff de EW remove o AA fantasma.
  C('ms boss/19:00:26-great-fireball-ew-mana-leech', 'ms boss server log.txt', 'ms boss local chat.txt', '19:00:26',
    t => {
      const c = counts(t);
      const rune = (t.components || []).find(component => component.comp === 'rune');
      return c.arrow === 0 && c.spell === 0 && c.rune === 6 && c.grenade === 0
        && rune && String(rune.actionLabel || '').includes('Great Fireball')
        ? null
        : `esperado A0 R6 Great Fireball; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
    }, '11/Jun/2026'),
  // H-005/V-018a: D-022a melhora um hit EW do sufixo, mas o primeiro hit
  // continua capped_low e a particao A1 S5 ainda possui quatro contradicoes.
  // Reducao parcial de contradicoes nao e evidencia positiva de AA.
  C('ms boss/18:12:59-energy-wave-ew-mana-no-aa', 'ms boss server log.txt', 'ms boss local chat.txt', '18:12:59',
    t => {
      const c = counts(t);
      const spell = (t.components || []).find(component => component.comp === 'spell');
      return c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0
        && spell && String(spell.actionLabel || '').includes('Energy Wave')
        ? null
        : `esperado A0 S6 Energy Wave; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
    }, '11/Jun/2026'),
  // ===== change fix-action-reuse-across-turns: M-015/N-007/N-008 =====
  // Uma acao nomeia no maximo um componente, em no maximo um turno. Nos casos abaixo o
  // motor dava a MESMA acao a dois turnos vizinhos, deixando sem dono a acao causalmente
  // correta que existe no log. Ver reports/fase2-m015-diagnostico.md.
  //
  // ms boss S25: `Using one of 914 sudden death runes` em 22:19:21 (seq 574) explica o hit
  // 1258 de 22:19:22; `Using one of 913` em 22:19:23 (seq 579) explica o 1075 de 22:19:24.
  // M-017/M-018a: a linha Using imediatamente anterior ao primeiro hit DO COMPONENTE.
  C('ms boss/22:19:21-rune-using-anterior', 'ms boss server log.txt', 'ms boss local chat.txt', '22:19:21',
    componentActionAtCheck({ arrow: 1, spell: 0, rune: 1, grenade: 0 }, 'rune', '22:19:21'), '13/Jun/2026'),
  C('ms boss/22:19:24-rune-nao-compartilhada', 'ms boss server log.txt', 'ms boss local chat.txt', '22:19:24',
    componentActionAtCheck({ arrow: 0, spell: 0, rune: 1, grenade: 0 }, 'rune', '22:19:23'), '13/Jun/2026'),
  // uhax 3 ed S1: Great Fireball em 13:44:06 e 13:44:08 — uma explosao cada.
  C('uhax 3 ed/13:44:07-gfb-using-anterior', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:44:07',
    componentActionAtCheck({ arrow: 0, spell: 0, rune: 9, grenade: 0 }, 'rune', '13:44:06'), '03/Jul/2026'),
  C('uhax 3 ed/13:44:09-gfb-nao-compartilhada', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:44:09',
    componentActionAtCheck({ arrow: 0, spell: 0, rune: 8, grenade: 0 }, 'rune', '13:44:08'), '03/Jul/2026'),
  // uhax 3 ed S1: existe UM so `exevo ulus tera` (13:43:54) para dois blocos. O bloco de
  // 13:43:56 e a runa Great Fireball de 13:43:56, nao um segundo Terra Burst: normalizada
  // por darklight matter, sua assinatura por-mob e 1 : 1,0033 : 0,923 : 0,803, igual a dos
  // blocos GFB de :58 e :07 e distinta da do Terra Burst de :53 (1 : 1,047 : 1,001).
  // Corrige junto a violacao M-012/M-013 (cast de :54 a 2s dos hits de :56).
  C('uhax 3 ed/13:43:53-terra-burst-nao-compartilhado', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:43:53',
    componentActionAtCheck({ arrow: 1, spell: 9, rune: 0, grenade: 0 }, 'spell', '13:43:54'), '03/Jul/2026'),
  C('uhax 3 ed/13:43:55-bloco-e-great-fireball', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:43:55',
    componentActionAtCheck({ arrow: 1, spell: 0, rune: 11, grenade: 0 }, 'rune', '13:43:56'), '03/Jul/2026'),
  // rpboss S2: `exevo tempo mas san` castada em 09:40:29 tem janela de impacto
  // [09:40:31, 09:40:33] (M-023/M-024) e cobre o hit de 09:40:32. O `exori gran con` de
  // 09:40:33 explica o hit de 09:40:33 — a resposta direta do proprio cast.
  C('rpboss/09:40:31-aa-granada', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:40:31',
    componentActionAtCheck({ arrow: 1, spell: 0, rune: 0, grenade: 1 }, 'grenade', '09:40:29'), '17/Jun/2026'),
  C('rpboss/09:40:33-spell-do-proprio-cast', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:40:33',
    componentActionAtCheck({ arrow: 0, spell: 1, rune: 0, grenade: 0 }, 'spell', '09:40:33'), '17/Jun/2026'),
  // bakra/jaded S5 (mesmo log): Divine Caldera e de area e atinge cada mob UMA vez por
  // cast, entao o cast de 09:29:23 nao pode explicar 733 e 565 no mesmo bakragore. O hit
  // de 09:29:24 e auto-ataque.
  C('bakra/09:29:22-caldera-nao-compartilhada', 'Server Log bakra.txt', 'Local Chat bakra.txt', '09:29:22',
    componentActionAtCheck({ arrow: 1, spell: 1, rune: 0, grenade: 0 }, 'spell', '09:29:23'), '10/Jun/2026'),
  C('bakra/09:29:24-aa', 'Server Log bakra.txt', 'Local Chat bakra.txt', '09:29:24',
    sharedCountCheck({ arrow: 1, spell: 0, rune: 0, grenade: 0 }), '10/Jun/2026'),
  C('jaded/09:29:24-aa', 'jaded Server Log.txt', 'jaded Local Chat.txt', '09:29:24',
    sharedCountCheck({ arrow: 1, spell: 0, rune: 0, grenade: 0 }), '10/Jun/2026'),
  // kim S0: M-016d — blast (889 em 16:24:29) e estagio atrasado (172 OK em 16:24:30) do
  // MESMO cast 16:24:29 ficam no MESMO turno. O segundo do eco so tem overkill, entao o
  // gate guloso de M-016d-1 o pulava e o eco virava turno separado com o mesmo cast.
  C('kim/16:24:28-death-echo-blast-e-eco', 'kim server log.txt', 'kim local chat.txt', '16:24:28',
    componentActionAtCheck({ arrow: 1, spell: 2, rune: 0, grenade: 0 }, 'spell', '16:24:29'), '14/Jul/2026'),
  CN('kim/16:24:30-eco-nao-e-turno-proprio', 'kim server log.txt', 'kim local chat.txt', '16:24:30', '14/Jul/2026'),
  // ===== fim change fix-action-reuse-across-turns =====
  // essence/Echo of Ichgahal: boss unitario, sem cast ofensivo e sem Using de
  // runa no turno; o unico hit observado so pode ser AA.
  C('essence/00:21:12', 'essence server log.txt', 'essence local chat.txt', '00:21:12',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('essence/00:21:14', 'essence server log.txt', 'essence local chat.txt', '00:21:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // essence/Bakragore: a granada do cast 00:22:41 ja impactou em 00:22:43.
  // Em 00:22:45 restam AA e spell do cast ofensivo do proprio timestamp.
  C('essence/00:22:45', 'essence server log.txt', 'essence local chat.txt', '00:22:45',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: Eixo 2-físico AA × Ethereal Barrage. AA (7) cai no segundo anterior
  // ao cast `exori dir moe` (:39); a Barrage (8) cai no segundo do cast. O
  // timestamp separa os blocos (leech só seria necessário no mesmo segundo).
  C('barrage/19:00:38', 'barrage Server Log.txt', 'barrage local chat.txt', '19:00:38',
    t => { const c = counts(t); return (c.arrow === 7 && c.spell === 8) ? null : `esperado A7 S8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: cast ofensivo `exevo mas san` com bloco de 4 hits; a cardinalidade
  // por mana leech confirma N_leech=4 para o componente de spell.
  C('barrage/19:04:08', 'barrage Server Log.txt', 'barrage local chat.txt', '19:04:08',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: `exevo mas san` com AA no mesmo turno. O leech cap-aware confirma
  // o bloco S5 e nao contradiz os 4 hits anteriores de AA.
  C('barrage/18:59:58', 'barrage Server Log.txt', 'barrage local chat.txt', '18:59:58',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: AA e Ethereal Barrage têm dano físico muito próximo; a fronteira
  // correta é confirmada pela cardinalidade por leech, A10 antes de S9.
  C('barrage/19:04:40', 'barrage Server Log.txt', 'barrage local chat.txt', '19:04:40',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A10 S9; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: M-024/M-025 cross-turno. O cast `exevo tempo mas san` 19:00:05 explode
  // de fato em 19:00:07 (6 hits). A janela [c+2,c+4] alcança 19:00:09 (c+4), mas o
  // mesmo cast NÃO pode semear uma granada fantasma de 1 hit lá: as 9 linhas de mana
  // provam 4 AA + 5 Ethereal Barrage, todos visíveis (sem hit virtual por charm).
  C('barrage/19:00:09', 'barrage Server Log.txt', 'barrage local chat.txt', '19:00:09',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // barrage: guarda da explosão real do cast 19:00:05 — permanece inteira em
  // 19:00:07 (um único timestamp de impacto): AA 5 + Divine Caldera 4 + Grenade 6.
  C('barrage/19:00:07', 'barrage Server Log.txt', 'barrage local chat.txt', '19:00:07',
    t => { const c = counts(t); return (c.arrow === 5 && c.spell === 4 && c.rune === 0 && c.grenade === 6) ? null : `esperado A5 S4 G6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // gloompillar 08:34:44: o hit 681 OK em wandering pillar tem timestamp e leech
  // (life=118, mana=39) do bloco de AA, nao do bloco Divine Caldera em :45.
  // A fronteira correta respeita o timestamp e fecha leech limpo: A8 S8.
  C('gloompillar/08:34:44', 'gloompillar Server Log.txt', 'gloompillar Local Chat.txt', '08:34:44',
    t => {
      const c = counts(t);
      if (!(c.arrow === 8 && c.spell === 8 && c.rune === 0 && c.grenade === 0)) return `esperado A8 S8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      const arrow = (t.components || []).find(comp => comp.comp === 'arrow');
      const has681 = !!(arrow && (arrow.hits || []).some(h => h.seq === 3377 && h.dmg === 681));
      return has681 ? null : 'esperado hit seq=3377 dmg=681 no componente arrow';
    }),
  // essence/Bakragore: boss unitario com cast `exori gran con` no timestamp.
  // Cada componente fica com um hit: primeiro AA, segundo spell.
  C('essence/00:23:29', 'essence server log.txt', 'essence local chat.txt', '00:23:29',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // essence/Bakragore: mesmo eixo boss unitario + cast ofensivo no timestamp.
  // O bloco S2 e invalido por M-009; a particao valida e AA seguido de spell.
  C('essence/00:26:23', 'essence server log.txt', 'essence local chat.txt', '00:26:23',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 10/Jun/2026 19:49-19:55: sem cast ofensivo; `Using great fireball`
  // fixa a fronteira. Antes da linha de runa: AA critado; depois: runa nao
  // critada compativel, confirmada por N_leech=10.
  C('mk/19:50:08', 'mk server log.txt', 'mk localchat.txt', '19:50:08',
    t => { const c = counts(t); return (c.arrow === 7 && c.spell === 0 && c.rune === 10 && c.grenade === 0) ? null : `esperado A7 R10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 10/Jun/2026 19:49-19:55: cast ofensivo `exevo mas san` no timestamp e
  // nenhuma linha `Using` de runa no turno. Originais fisico e holy separam AA e
  // Caldera em dois blocos contiguos.
  C('mk/19:49:46', 'mk server log.txt', 'mk localchat.txt', '19:49:46',
    t => { const c = counts(t); return (c.arrow === 8 && c.spell === 10 && c.rune === 0 && c.grenade === 0) ? null : `esperado A8 S10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 07/Jun/2026 23:19-23:25: a linha `Using great
  // fireball` cai dentro do timestamp e fixa a fronteira depois dos 6 hits de
  // AA. O leech com/sem `utevo grav san` nao pode podar o corte mecanico A6 R9.
  C('darklight-vemiath/23:21:01', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:21:01',
    t => { const c = counts(t); return (c.arrow === 6 && c.spell === 0 && c.rune === 9 && c.grenade === 0) ? null : `esperado A6 R9; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 07/Jun/2026 22:18-22:24: prefixo de AA com
  // enflame charm matando um alvo antes do dano principal visivel. O AA fecha
  // como A6 visivel + A0 virtual por N_leech=7; o sufixo e Divine Caldera S5.
  C('darklight-vemiath/22:20:24', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '22:20:24',
    t => { const c = counts(t); return (c.arrow === 7 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A7 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // bastion 15:23:16 (S-014e/C-008): o overpower charm mata um skirmisher (charm+XP,
  // killedTarget) que a Fierce Berserk de área também varreu. O hit dessa spell no alvo
  // já morto tem dano 0 e não aparece — hit principal virtual reconhecido leech-free no
  // resolver das 4 vocações single-target (hits.length>=2). => S5 (4 visíveis + 1 virtual).
  C('bastion/15:23:16', 'bastion server log ek.txt', 'bastion local chat ek.txt', '15:23:16',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // M-004/H-005/D-019: com duas hipoteses igualmente compativeis, a acao
  // fisica declarada preserva a ordem mecanica AA -> spell. O overkill impede
  // usar proporcao de leech, mas nao apaga o desempate fisico canonico.
  C('bastion/15:19:17-aa-before-executioners-throw', 'bastion server log ek.txt', 'bastion local chat ek.txt', '15:19:17',
    spellWithAaCheck(1, 1, "Executioner's Throw"), '13/Jun/2026'),
  // monk 2 07:20:18 (S-014e/C-008): o enflame charm mata um skirmisher (killedTarget) que
  // a Flurry of Blows de área varreu; o AA single-target (707) já gastou seu hit visível no
  // marksman, então o alvo varrido a mais pertence à Flurry. => A1 S2 (612 + 1 virtual).
  C('monk2/07:20:18', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:20:18',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // M-037: a diferença entre os originais do primeiro hit e do sufixo não
  // prova AA em Chained Penance, pois a própria ação declara decay por salto.
  C('monk2/07:19:24', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:19:24',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // D-023/S-014: os hits 624 e 711 fecham separadamente em N=1, enquanto
  // o bloco fundido em N=2 é contradito. Área unitária continua válida (M-008).
  C('monk2/07:19:31', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:19:31',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estágio atrasado multiestágio com
  // confirmação por cluster de leech (atribuição tardia). Isento do veto same-mob pela
  // change exempt-late-stage-multistage-from-samemob-veto: o mesmo raubritter leva blast
  // (:35) e eco (:36) com dano distinto no mesmo cast, e isso é o comportamento declarado.
  C('monk2/07:19:35', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:19:35',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 10 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('monk2/07:19:56', 'monk 2 server log.txt', 'monk 2 local chat.txt', '07:19:56',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 11 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S11; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 04/Jun (pré-cutoff): sem os mods do regime, o AA físico que
  // varia (911/883/869) colapsava no Divine Caldera determinístico (815), violando
  // H-001. Com os mods PRE expostos, a borda fica correta: AA 5 + Caldera 9. O cast
  // `exevo mas san` vem em :27; os hits de :26 que variam são AA, não spell.
  C('darklight-vemiath/22:41:26', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '22:41:26',
    t => { const c = counts(t); return (c.arrow === 5 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A5 S9; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // darklight e vemiath 07/Jun 23:19-23:25 (crit-per-component): três componentes AoE no
  // MESMO segundo — 8 AA crit (físico) + 8 Divine Caldera (holy) + 10 granada (holy). O AA
  // crit só reverte (interseção não-vazia cross-mob) com o crit do AA (~1.83) inferido por
  // buckets por-componente; com crit global/1 o bloco AA dava physical_intersection_empty.
  C('darklight-vemiath/23:23:20', 'darklight e vemiath server log.txt', 'darklight e vemiath Local Chat.txt', '23:23:20',
    t => { const c = counts(t); return (c.arrow === 8 && c.spell === 8 && c.rune === 0 && c.grenade === 10) ? null : `esperado A8 S8 G10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 05:42:01 (M-031): a Divine Caldera crit (O_holy 1390) atravessa :01->:02 e é UM
  // componente; não pode ser fatiada em spell+granada só porque há cast de granada na
  // janela (a granada real, nível distinto, está em 05:42:03). O antigo N=13
  // contava o hit virtual da granada rejeitada; os hits reais são AA 9 + Caldera 12.
  C('mk/05:42:01', 'mk server log.txt', 'mk localchat.txt', '05:42:01',
    t => { const c = counts(t); return (c.arrow === 9 && c.spell === 12 && c.rune === 0 && c.grenade === 0) ? null : `esperado A9 S12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mk 05:43:59 (S-014e): granada de 8 hits visíveis; curse/wound charm NÃO matam
  // (seguidos de hit visível), então não geram hit virtual. N_leech=8, um só timestamp
  // de impacto (05:44:00). => AA 12 + Caldera 13 + granada 8, sem virtual.
  C('mk/05:43:59', 'mk server log.txt', 'mk localchat.txt', '05:43:59',
    t => { const c = counts(t); return (c.arrow === 12 && c.spell === 13 && c.rune === 0 && c.grenade === 8) ? null : `esperado A12 S13 G8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // fix-thunder-arrow-perfect-shot-state: Perfect Shot é parte do estado
  // determinístico de S-004a. Os cinco turnos deixam de misturar hits com/sem a
  // marca, preservando a spell concreta e o eixo energy da munição desta sessão.
  C('thunder-arrow-perfect-shot-state/18:51:21', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:51:21',
    spellWithAaCheck(4, 5, 'Divine Caldera'), '21/Jul/2026'),
  C('thunder-arrow-perfect-shot-state/18:53:38', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:53:38',
    spellWithAaCheck(5, 12, 'Divine Caldera'), '21/Jul/2026'),
  // M-024/M-025/T-002: os dois hits de :51 são o rollover cronologicamente
  // contíguo da granada do cast :47. O vizinho resolve A8 S12 sem reutilizar o cast.
  C('thunder-arrow-perfect-shot-state/18:55:49', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:55:49',
    grenadeWithAaSpellCheck(7, 15, 13, 'Divine Caldera', [68150, 68151], [5510, 5513]), '21/Jul/2026'),
  C('thunder-arrow-perfect-shot-state/18:55:51', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:55:51',
    spellWithAaCheck(8, 12, 'Divine Barrage'), '21/Jul/2026'),
  C('thunder-arrow-perfect-shot-state/18:56:11', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:56:11',
    spellWithAaCheck(3, 4, 'Divine Barrage'), '21/Jul/2026'),
  C('thunder-arrow-perfect-shot-state/18:56:35', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:56:35',
    spellWithAaCheck(3, 4, 'Divine Caldera'), '21/Jul/2026'),
  // Segundo rollover: G9 continua um único evento mecânico em :44/:45; o turno
  // :46 perde apenas o prefixo da granada e fecha A7 S11 Divine Barrage, G0.
  C('thunder-arrow-perfect-shot-state/18:56:44', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:56:44',
    grenadeWithAaSpellCheck(6, 9, 9, 'Divine Caldera', [68204, 68205], [6483, 6487]), '21/Jul/2026'),
  C('thunder-arrow-perfect-shot-state/18:56:46', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:56:46',
    spellWithAaCheck(7, 11, 'Divine Barrage'), '21/Jul/2026'),
  C('thunder-arrow-perfect-shot-state/18:57:33', 'thunder arrow Server Log.txt', 'thunder arrow Local Chat.txt', '18:57:33',
    spellWithAaCheck(5, 5, 'Divine Barrage'), '21/Jul/2026'),
  // D-030/D-011a: com Grav San global em 10%, a divisão aprovada é A8 S7 G7.
  // O hit seq 3894 permanece no bloco Caldera e NÃO é overkill: há poção e dano
  // recebido antes do XP posterior. A granada é o nível holy distinto de sete
  // hits em :53.
  C('grav-san-damage-leech/jaded-21:01:52', 'jaded Server Log.txt', 'jaded Local Chat.txt', '21:01:52',
    t => {
      const baseReason = grenadeWithAaSpellCheck(8, 7, 7, 'Divine Caldera', [75713], [])(t);
      if (baseReason) return baseReason;
      const caldera = (t.components || []).find(comp =>
        comp.comp === 'spell' && String(comp.actionLabel || '').includes('Divine Caldera'));
      const hit = caldera && (caldera.hits || []).find(item => item.seq === 3894);
      if (!hit) return 'esperado seq 3894 dentro da Divine Caldera';
      return hit.overkill ? 'seq 3894 não pode ser overkill (D-011a)' : null;
    }, '10/Jun/2026'),
  // Colaterais sem leech_cardinality_failed pré-cutoff, aprovados na mesma
  // revisão humana: fronteiras finais sob o tier global de 10%.
  C('grav-san-damage-leech/jaded-21:02:30', 'jaded Server Log.txt', 'jaded Local Chat.txt', '21:02:30',
    grenadeWithAaSpellCheck(9, 11, 10, 'Divine Caldera', [75751], []), '10/Jun/2026'),
  C('grav-san-damage-leech/jaded-21:04:40', 'jaded Server Log.txt', 'jaded Local Chat.txt', '21:04:40',
    t => {
      const c = counts(t);
      if (!(c.arrow === 8 && c.spell === 0 && c.rune === 9 && c.grenade === 0)) {
        return `esperado A8 R9; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const rune = (t.components || []).find(comp => comp.comp === 'rune');
      return rune && String(rune.actionLabel || '').includes('Thunderstorm')
        ? null
        : `esperado Thunderstorm; got ${rune && rune.actionLabel || '-'}`;
    }, '10/Jun/2026'),
  // REMOVIDOS em 10/Ago/2026 (fix-action-reuse-across-turns), por decisão do usuário:
  // `grenade-rollover-corpus/bakra-09:21:00`, `09:23:20` e `09:27:02`. Os três eram os
  // ÚNICOS casos do gabarito inteiro cuja sessão está em `CORPUS_EXCLUSIONS` — a hunt
  // `09/Jun/2026 09:18-09:30` do `bakra`, que o harness só alcançava por passar
  // `includeExcluded: true`. O usuário declarou a sessão inteira fora de interesse:
  // turno sem classificação, turno reclassificado, nada nela importa por enquanto.
  // Motivo técnico de terem virado vermelho: `09:23:20`/`09:27:02` esperavam um
  // `Divine Caldera` que o mesmo cast (`09:23:19`) já nomeava no turno `09:23:18` —
  // um cast, dois componentes, dois turnos, exatamente o que N-008a proíbe.
  // mazzerinbarrage 09/Jul/2026: granada do cast anterior cai no prefixo do turno
  // seguinte. M-023/M-025 exigem comparar a janela inteira antes de consumir o cast.
  C('mazzerinbarrage/01:20:45', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:20:45',
    t => { const c = counts(t); return (c.arrow === 13 && c.spell === 14 && c.rune === 0 && c.grenade === 12) ? null : `esperado G12 A13 S14; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  C('mazzerinbarrage/01:22:51', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:22:51',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 12 && c.rune === 0 && c.grenade === 10) ? null : `esperado G10 A10 S12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  // openspec/changes/fix-grenade-cast-turn-assignment (caso-prova): dois turnos
  // candidatos (cast+2 e cast+4) resolviam independentemente com o mesmo cast de
  // granada `01:21:19`. Antes desta correção, `buildGrenadeCastAssignments`
  // escolhia por hitCount do bloco granada (14 em :23 > 12 em :21), deixando :21
  // sem classificação e criando uma Divine Caldera órfã de 1 hit em :23 (holy 1262,
  // não bate com nenhum Caldera real da sessão). O teste comparativo de leech
  // (D1, estilo S-020/S-020a) mostra que o hit órfão bate muito melhor com a
  // hipótese "fundido no bloco arrow contíguo" (N=13, esperado life≈111/mana≈33)
  // do que "sozinho" (N=1, esperado life≈654/mana≈197; observado 99/30) — :21 é o
  // candidato sem resíduo e vence. Ver design.md do change pra prova detalhada.
  C('mazzerinbarrage/01:21:21', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:21:21',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 12 && c.rune === 0 && c.grenade === 12) ? null : `esperado A10 S12 G12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  // Guarda: o turno vizinho (:23, cast+4) continua resolvido, agora sem a granada
  // (que pertence a :21) e sem o hit órfão — os 13+14=27 hits fecham como AA+Caldera
  // puro, sem resíduo.
  C('mazzerinbarrage/01:21:23', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '01:21:23',
    t => { const c = counts(t); return (c.arrow === 13 && c.spell === 14 && c.rune === 0 && c.grenade === 0) ? null : `esperado A13 S14 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jul/2026'),
  // jaded 10/Jun/2026 20:00-20:01: mesmo padrão do caso-prova acima, em log e cast
  // diferentes — prova que a correção não é específica de mazzerinbarrage.
  C('jaded/20:00:29', 'jaded Server Log.txt', 'jaded Local Chat.txt', '20:00:29',
    t => { const c = counts(t); return (c.arrow === 10 && c.spell === 12 && c.rune === 0 && c.grenade === 12) ? null : `esperado A10 S12 G12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '10/Jun/2026'),
  // mazzerinbarrage 30/Jun/2026 23:45-23:51 (D-007/S-008 + calibração bloodjaw armor=128):
  // uma única transição não-crit→crit crava a fronteira AA×Ethereal Barrage. Com o armor
  // manual antigo (100), o intervalo de original físico do bloodjaw ficava disjunto dos
  // blockmates (~7-12 de O) e physical_intersection_empty vetava a única partição
  // crit-consistente => no_valid_partition. Corte correto = a transição de crit.
  C('mazzerinbarrage/23:48:31', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:48:31',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('mazzerinbarrage/23:49:35', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:49:35',
    t => { const c = counts(t); return (c.arrow === 3 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A3 S3; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('mazzerinbarrage/23:50:01', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:50:01',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // jaded 10/Jun/2026 21:01:38 (D-007/S-008 em overkill): o hit 348 é overkill NÃO-crit;
  // o flag de crit é legível no overkill, então ele não pode ficar no bloco crit da
  // Divine Caldera. AA 4 (386, 266, 288, 348-OK) + Caldera 5 (crits).
  C('jaded/21:01:38', 'jaded Server Log.txt', 'jaded Local Chat.txt', '21:01:38',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 30/Jun/2026 23:47:21 (S-014e/V12 com divine wrath): AA 2 (970 +
  // 1091-OK não-crit) + Ethereal Barrage crit com 5 hits visíveis + 1 virtual — o
  // `divine wrath charm` (1251 -> XP) matou o 6º darklight source antes da linha da
  // Barrage; o mana leech dos hits limpos fecha exato-ceil em N_leech=6. O hit `1782`
  // logo após o charm é OUTRA instância de source (killedTarget tem precedência sobre
  // o pareamento por nome). Espera S6 contando o hit virtual (mesma convenção do
  // caso darklight-vemiath/22:20:24, A7 = 6 visíveis + 1 virtual).
  C('mazzerinbarrage/23:47:21', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:47:21',
    t => { const c = counts(t); return (c.arrow === 2 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A2 S6(5+1 virtual); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 17/Jun/2026 16:23-16:35 (spec unified-scorer-evidence-combination,
  // "Componente único do eixo físico compete com cortes AA+Barrage por leech"): 6 hits
  // físicos críticos no mesmo segundo do cast `exori dir moe`. O bloco único de Ethereal
  // Barrage (spell[6]) fecha N_leech=6 exato (delta 0 em vida e mana, com o bônus de
  // +10% vida da própria Barrage), enquanto todo corte AA+Barrage mecanicamente válido
  // ([2,6]/[3,6]/[4,6]) e sistematicamente capped_low. mechanicalOrder nao pode mais
  // descartar o componente unico contra cortes leech-piores. Esperado A0 S6.
  C('mazzerinbarrage/16:23:53', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '16:23:53',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 28/Jun/2026 22:07:44 (V-025, mesmo padrao do 16:23:53): 7 hits de
  // Ethereal Barrage com Expose Weakness misto, mesmo segundo do cast. Componente unico
  // fecha leech limpo; cortes AA+Barrage nao. Esperado A0 S7.
  C('mazzerinbarrage/22:07:44', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '22:07:44',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S7; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 28/Jun/2026 22:09:57 (S-020a): ambiguous_equal_best_partitions
  // entre cuts=[2,5] e [3,5]. O hit em disputa (darklight source 772, life=157,
  // mana=51) fica no nucleo baixo de leech do prefixo (147/163 vida, 48/58 mana),
  // nao no nucleo alto dos overkills finais (227/246 vida, 61/66 mana). Esperado A3 S2.
  C('mazzerinbarrage/22:09:57', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '22:09:57',
    t => { const c = counts(t); return (c.arrow === 3 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A3 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // monk 11:55:23 (V-025, prova que a regra nao e especifica de paladin/Ethereal
  // Barrage): Greater Flurry of Blows (exori gran mas pug) e physical/area, mesmo gate.
  // 4 hits (830,712,830,830); corte antigo isolava o 712 como AA (n=1, leech previsto
  // ~0.5, muito acima do observado ~0.1627); componente unico (n=4) preve 0.5*areaFactor(4)
  // =0.1625, quase exato. Esperado A0 S4.
  C('monk/11:55:23', 'monk server log.txt', 'monk localchat.txt', '11:55:23',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // uhax 3 30/Jun/2026 20:49:26: primeiro turno parcial, sem spell ofensiva
  // concreta e sem Using de runa no recorte. A unica hipotese e arrow[7], invalida
  // para druid por M-031/M-032; deve ser diagnosticavel, mas nao virar falha
  // operacional nem classificacao inventada.
  C('uhax3/20:49:26', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '20:49:26',
    t => (t.partialEdge === true && t.partialEdgeMissingEvidence === true && t.reason === 'partial_edge_missing_evidence')
      ? null
      : `esperado partial_edge_missing_evidence; status=${t.status} reason=${t.reason} partialEdge=${t.partialEdge} partialEdgeMissingEvidence=${t.partialEdgeMissingEvidence}`),
  // mazzerinbarrage 09/Jun/2026 23:21:27: mesmo fenomeno de borda do uhax3 acima, mas em
  // Royal Paladin -- a unica vocacao com AA de area (M-031), onde arrow[n] nunca viola
  // multiple_arrow_hits_not_allowed e a hipotese remanescente cai por
  // physical_intersection_empty. O gate de A-009 deixou de exigir vocacao/razao especifica
  // (extend-partial-edge-missing-evidence-to-area-aa).
  // Este caso tambem tranca a ordenacao cronologica
  // (order-hits-chronologically-across-midnight): a sessao vai de 23:21:27 a 00:00:50, e
  // ordenar por segundos-do-dia colocava os turnos pos-meia-noite primeiro, fazendo
  // turns[0].partialEdge cair em 00:00:00 -- o ultimo turno cronologico. Se a ordenacao
  // regredir, este caso falha antes do gate de borda.
  // Confirmacao independente de que a borda levou hits: o leech dos 6 hits visiveis fecha
  // EXATO em N_leech=9 nos dois canais e nos quatro mobs (darklight source 1042 -> 106/34,
  // walking pillar 1047 -> 107/35, darklight matter 1131 -> 115/41 com Void's Call,
  // darklight striker 1133 -> 123/37 com Vampiric Embrace); N=10 e contradito.
  C('mazzerinbarrage/23:21:27', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '23:21:27',
    t => (t.partialEdge === true && t.partialEdgeMissingEvidence === true && t.reason === 'partial_edge_missing_evidence')
      ? null
      : `esperado partial_edge_missing_evidence; status=${t.status} reason=${t.reason} partialEdge=${t.partialEdge} partialEdgeMissingEvidence=${t.partialEdgeMissingEvidence}`,
    '09/Jun/2026'),
  // T-007/A-009: primeiro turno do Server Log começa depois do blast inicial de Death
  // Echo. O estágio atrasado não pode ser confirmado sem contraparte por M-016d-1a, e o
  // cast de Energy Wave em :02 explica apenas o sufixo crítico. Não inventar componente:
  // excluir operacionalmente como informação perdida de borda.
  C('death-echo-partial-edge/11:06:01', 'death echo server log.txt', 'death echo local chat.txt', '11:06:01',
    t => {
      const c = counts(t);
      return (t.partialEdge === true
        && t.partialEdgeMissingEvidence === true
        && t.reason === 'partial_edge_missing_evidence'
        && c.arrow === 0 && c.spell === 0 && c.rune === 0 && c.grenade === 0)
        ? null
        : `esperado partial_edge_missing_evidence sem componentes nomeados; status=${t.status} reason=${t.reason} partialEdge=${t.partialEdge} partialEdgeMissingEvidence=${t.partialEdgeMissingEvidence} A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
    }, '10/Jul/2026'),
  // R-001/R-003/M-017: início de sessão interna colada no mega-log; sem cast ofensivo e
  // sem linha Using preservados. O motor continua unresolved e não inventa a runa que o
  // conhecimento externo diz ter sido usada; só o relatório aceita esta chave.
  C('mrowdy2-accepted-unresolved/17:19:16', 'Mrowdy Server Log 2.txt', 'Mrowdy Local Chat 2.txt', '17:19:16',
    t => {
      const c = counts(t);
      return (t.status === 'unresolved'
        && t.reason === 'no_valid_partition'
        && !t.partialEdgeMissingEvidence
        && c.arrow === 0 && c.spell === 0 && c.rune === 0 && c.grenade === 0)
        ? null
        : `esperado unresolved/no_valid_partition sem runa inventada; status=${t.status} reason=${t.reason} partialEdgeMissingEvidence=${t.partialEdgeMissingEvidence} A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
    }, '11/Jun/2026'),
  // uhax 3 30/Jun/2026 20:51:47 (M-016c): server log tem `Using one of 3558
  // great fireball runes...` no mesmo segundo dos 8 hits (darklight matter,
  // darklight source x2, bloodjaw x2, walking pillar x3), todos revertendo
  // exatamente contra o perfil fogo de Great Fireball. O local chat tem
  // `adori mas frigo` do mesmo jogador em 20:51:48 (1s depois) — incantacao
  // nao catalogada que antes vencia a particao por um artefato de score
  // (mechanicalOrder); `adori` e ignorada e o resultado correto e R8. Este caso
  // tambem preserva o controle de Using de runa observado: uma acao ofensiva
  // concreta deve impedir o filtro de missing evidence.
  C('uhax3/20:51:47', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '20:51:47',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 0 && c.rune === 8 && c.grenade === 0 && !t.partialEdgeMissingEvidence) ? null : `esperado R8 (Great Fireball), sem filtro de borda; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade} partialEdgeMissingEvidence=${t.partialEdgeMissingEvidence}`; }),
  // S-014e/M-004/M-031/M-032: Poison Charm mata um walking pillar antes dos
  // 12 hits visíveis de Wrath. Wrath fecha N=12 e contradiz N=13; portanto o
  // virtual pertence ao único AA single-target do ciclo, não a Wrath.
  C('uhax3/20:54:20-virtual-aa-before-wrath', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '20:54:20',
    t => {
      const c = counts(t);
      if (!(c.arrow === 1 && c.spell === 12 && c.rune === 0 && c.grenade === 0)) {
        return `esperado A1 S12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const arrow = (t.components || []).find(comp => comp.comp === 'arrow');
      const spell = (t.components || []).find(comp => comp.comp === 'spell');
      const virtualArrow = arrow && (arrow.hits || []).length === 1
        && arrow.hits[0].virtual === true && arrow.hits[0].dmg === 0;
      const spellHasVirtual = spell && (spell.hits || []).some(hit => hit.virtual);
      if (!virtualArrow || spellHasVirtual) {
        return `esperado AA virtual de dano zero e Wrath sem virtual; virtualArrow=${virtualArrow} spellHasVirtual=${spellHasVirtual}`;
      }
      const virtual = arrow.hits[0];
      const firstSpellSeq = Math.min(...spell.hits.map(hit => hit.seq));
      if (virtual.clock !== '20:54:20' || !(virtual.seq < firstSpellSeq)) {
        return `esperado virtual em 20:54:20 antes de Wrath; clock=${virtual.clock} seq=${virtual.seq} firstSpellSeq=${firstSpellSeq}`;
      }
      return spell && String(spell.actionLabel || '').includes('Wrath of Nature')
        ? null
        : `esperado Wrath of Nature; got ${spell && spell.actionLabel || '-'}`;
    }, '30/Jun/2026'),
  // M-017/M-018a/M-031/M-032: o hit 110 ocorre antes da linha observada
  // `Using ... great fireball runes`; os nove hits visiveis posteriores formam
  // a runa e o overflux kill confirma o decimo hit virtual. Using e a borda
  // positiva AA -> runa, antes do pruning de leech.
  C('uhax3/13:33:17-using-boundary-aa-rune-virtual', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:33:17',
    t => {
      const c = counts(t);
      if (!(c.arrow === 1 && c.spell === 0 && c.rune === 10 && c.grenade === 0)) {
        return `esperado A1 R10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const arrow = (t.components || []).find(comp => comp.comp === 'arrow');
      const rune = (t.components || []).find(comp => comp.comp === 'rune');
      const arrowHits = arrow && arrow.hits || [];
      const runeHits = rune && rune.hits || [];
      const visibleRuneHits = runeHits.filter(hit => !hit.virtual);
      const virtualRuneHits = runeHits.filter(hit => hit.virtual);
      if (!(arrowHits.length === 1 && !arrowHits[0].virtual && arrowHits[0].dmg === 110)) {
        return `esperado AA visivel unico de 110; got ${arrowHits.map(hit => `${hit.dmg}${hit.virtual ? 'v' : ''}`).join(',')}`;
      }
      if (!(visibleRuneHits.length === 9
        && virtualRuneHits.length === 1
        && virtualRuneHits[0].dmg === 0)) {
        return `esperado runa com 9 hits visiveis + 1 virtual; visible=${visibleRuneHits.length} virtual=${virtualRuneHits.length}`;
      }
      const firstRuneSeq = Math.min(...visibleRuneHits.map(hit => hit.seq));
      const usingSeq = rune && rune.action && rune.action.seq;
      if (!(arrowHits[0].seq < usingSeq && usingSeq < firstRuneSeq)) {
        return `esperado ordem AA -> Using -> runa; aaSeq=${arrowHits[0].seq} usingSeq=${usingSeq} firstRuneSeq=${firstRuneSeq}`;
      }
      // M-036/D-010c: com o bonus fantasma de classe, `darklight matter` recebia
      // postMultiplier 1,06 e revertia para 709 enquanto os demais mobs do mesmo cast
      // revertiam para 750-753, esvaziando a homogeneidade do bloco. A checagem do
      // `post`/originais por hit vive em `tests/unified-charm-witness-pierce-state.test.mjs`
      // (o `evidence` do hit nao sobrevive a projecao de cache que este runner usa);
      // aqui fica o efeito observavel no componente.
      if (rune.deterministic && rune.deterministic.reason === 'elemental_cluster_span_too_wide') {
        return 'bloco de Great Fireball nao deveria falhar por elemental_cluster_span_too_wide';
      }
      return rune && String(rune.actionLabel || '').includes('Great Fireball')
        ? null
        : `esperado Great Fireball; got ${rune && rune.actionLabel || '-'}`;
    }, '03/Jul/2026'),
  // M-017/M-018a/S-014e: o enflame kill seguido de XP ocorre antes do
  // `Using ... great fireball runes` e ocupa o único AA virtual do ciclo. Os
  // sete hits visíveis e o overflux kill posteriores pertencem à runa.
  C('uhax3/13:33:44-using-boundary-virtual-aa-rune-virtual', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:33:44',
    t => {
      const c = counts(t);
      if (!(c.arrow === 1 && c.spell === 0 && c.rune === 8 && c.grenade === 0)) {
        return `esperado A1 R8; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const arrow = (t.components || []).find(comp => comp.comp === 'arrow');
      const rune = (t.components || []).find(comp => comp.comp === 'rune');
      const arrowHits = arrow && arrow.hits || [];
      const runeHits = rune && rune.hits || [];
      const visibleRuneHits = runeHits.filter(hit => !hit.virtual);
      const virtualRuneHits = runeHits.filter(hit => hit.virtual);
      if (!(arrowHits.length === 1 && arrowHits[0].virtual && arrowHits[0].dmg === 0)) {
        return `esperado AA virtual único; hits=${arrowHits.length} virtual=${arrowHits[0] && arrowHits[0].virtual} dmg=${arrowHits[0] && arrowHits[0].dmg}`;
      }
      if (!(visibleRuneHits.length === 7 && virtualRuneHits.length === 1)) {
        return `esperado runa com 7 visíveis + 1 virtual; visíveis=${visibleRuneHits.length} virtuais=${virtualRuneHits.length}`;
      }
      const usingSeq = rune && rune.action && rune.action.seq;
      const arrowSourceSeq = arrowHits[0].sourceCharm && arrowHits[0].sourceCharm.seq;
      const runeSourceSeq = virtualRuneHits[0].sourceCharm && virtualRuneHits[0].sourceCharm.seq;
      if (!(arrowSourceSeq < usingSeq && runeSourceSeq > usingSeq)) {
        return `esperado virtual AA antes e virtual da runa depois do Using; aaSourceSeq=${arrowSourceSeq} usingSeq=${usingSeq} runeSourceSeq=${runeSourceSeq}`;
      }
      return rune && String(rune.actionLabel || '').includes('Great Fireball')
        ? null
        : `esperado Great Fireball; got ${rune && rune.actionLabel || '-'}`;
    }, '03/Jul/2026'),
  // D-010g/D-022b/S-014e: Bounty Talisman e inferido por sessao em dois
  // eixos independentes (dano nivel 26, Life Leech nivel 15). Com esse setup,
  // os 11 hits visiveis de Great Fireball exigem N_leech=12 e o Overflux kill
  // do mesmo bloco explica exatamente um hit virtual.
  C('uhax3/13:34:21-bounty-rune-virtual', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:34:21',
    t => {
      const c = counts(t);
      if (!(c.arrow === 0 && c.spell === 0 && c.rune === 12 && c.grenade === 0)) {
        return `esperado A0 S0 R12 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const rune = (t.components || []).find(comp => comp.comp === 'rune');
      const runeHits = rune && rune.hits || [];
      const visible = runeHits.filter(hit => !hit.virtual);
      const virtual = runeHits.filter(hit => hit.virtual);
      if (!(visible.length === 11 && virtual.length === 1 && virtual[0].dmg === 0)) {
        return `esperado Great Fireball com 11 hits visiveis + 1 virtual; visible=${visible.length} virtual=${virtual.length} virtualDmg=${virtual[0] && virtual[0].dmg}`;
      }
      return rune && String(rune.actionLabel || '').includes('Great Fireball')
        ? null
        : `esperado Great Fireball; got ${rune && rune.actionLabel || '-'}`;
    }, '03/Jul/2026'),
  // exempt-burst-and-chain-from-samemob-veto: Terra Burst (exevo ulus tera) tem bonus
  // condicional por-alvo (x1.6), mecanica declarada -> isenta do veto same-mob. O turno
  // 13:33:14 (darklight striker 3760/2351, razao 1.60) resolve A1 S7.
  C('uhax3/13:33:14', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:33:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // S-014e/M-025/D-021a: o turno tem DOIS charm-kills reais — enflame mata um darklight
  // matter antes do bloco visivel, e poison charm mata um walking pillar dentro dele. Wrath
  // aceita N=10 (k=8 + 2), entao os dois virtuais pertencem a acao e NAO existe auto ataque.
  // Contrasta com 20:54:20 (S0), onde ha UM kill e Wrath contradiz N=13: la o virtual vira o
  // AA unico do ciclo. Testar apenas `k+1`, como o codigo fazia, criava aqui um AA virtual
  // espurio que contava o kill do darklight matter duas vezes (uma no AA, outra na acao).
  // Depende tambem do Vampiric Embrace +3,2% em darklight matter ser inferido em S1.
  C('uhax3/13:33:46-two-charm-kills-belong-to-action', 'uhax 3 server log ed.txt', 'uhax 3 local chat ed.txt', '13:33:46',
    t => {
      const c = counts(t);
      if (!(c.arrow === 0 && c.spell === 10 && c.rune === 0 && c.grenade === 0)) {
        return `esperado A0 S10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const spell = (t.components || []).find(comp => comp.comp === 'spell');
      if (!spell || !String(spell.actionLabel || '').includes('Wrath of Nature')) {
        return `esperado Wrath of Nature; got ${spell && spell.actionLabel || '-'}`;
      }
      const hits = spell.hits || [];
      const virtuals = hits.filter(hit => hit.virtual);
      const visible = hits.filter(hit => !hit.virtual);
      if (visible.length !== 8 || virtuals.length !== 2) {
        return `esperado 8 hits visiveis + 2 virtuais; got ${visible.length} + ${virtuals.length}`;
      }
      if (virtuals.some(hit => hit.dmg !== 0)) {
        return `hits virtuais devem ter dano 0; got ${virtuals.map(h => h.dmg).join(',')}`;
      }
      const virtualMobs = virtuals.map(hit => String(hit.mob)).sort().join('|');
      if (virtualMobs !== 'darklight matter|walking pillar') {
        return `esperado virtuais em darklight matter e walking pillar; got ${virtualMobs}`;
      }
      return null;
    }, '03/Jul/2026'),
  // Chained Penance (M-037): caso representativo com fronteira de timestamp AA->spell.
  C('monk/11:54:44', 'monk server log.txt', 'monk localchat.txt', '11:54:44',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),

  // generalize-single-target-aa-resolver: 58 turnos de Monk (serverlog6..9.txt +
  // localchat6..9.txt) que eram unresolved (multiple_arrow_hits_not_allowed +
  // physical_intersection_empty/same_mob_state_exact_original_mismatch/
  // elemental_cluster_span_too_wide) antes de generalizar resolveEkTurn para
  // knight/sorcerer/druid/monk, mais o contra-exemplo 07:10:57 (já resolvia pelo
  // caminho genérico; veredito congelado para provar que a generalização não o
  // muda).
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:10:55', 'serverlog6.txt', 'localchat6.txt', '07:10:55',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:10:57: contra-exemplo: já resolvia pelo caminho genérico, veredito congelado.
  C('serverlog6/07:10:57', 'serverlog6.txt', 'localchat6.txt', '07:10:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S9 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:00', 'serverlog6.txt', 'localchat6.txt', '07:11:00',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:11:02: o primeiro hit é apenas capped_low em N=1
  // e o sufixo mantém oito contradições; redução parcial não prova AA (H-005).
  C('serverlog6/07:11:02', 'serverlog6.txt', 'localchat6.txt', '07:11:02',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S9 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:06', 'serverlog6.txt', 'localchat6.txt', '07:11:06',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:10', 'serverlog6.txt', 'localchat6.txt', '07:11:10',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog6/07:11:12', 'serverlog6.txt', 'localchat6.txt', '07:11:12',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 16 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S16; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Controle M-037/H-005: dois hits do Chained Penance sem evidência positiva
  // independente de AA permanecem no mesmo componente.
  C('serverlog6/07:11:37', 'serverlog6.txt', 'localchat6.txt', '07:11:37',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:11:14: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog6/07:11:14', 'serverlog6.txt', 'localchat6.txt', '07:11:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:16', 'serverlog6.txt', 'localchat6.txt', '07:11:16',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:20', 'serverlog6.txt', 'localchat6.txt', '07:11:20',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog6/localchat6 07:11:22: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog6/07:11:22', 'serverlog6.txt', 'localchat6.txt', '07:11:22',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 8 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S8 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:27', 'serverlog6.txt', 'localchat6.txt', '07:11:27',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog6/07:11:31', 'serverlog6.txt', 'localchat6.txt', '07:11:31',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:14:51: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:14:51', 'serverlog7.txt', 'localchat7.txt', '07:14:51',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S3 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:14:55', 'serverlog7.txt', 'localchat7.txt', '07:14:55',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:14:57: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:14:57', 'serverlog7.txt', 'localchat7.txt', '07:14:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:02', 'serverlog7.txt', 'localchat7.txt', '07:15:02',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:06', 'serverlog7.txt', 'localchat7.txt', '07:15:06',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog7/07:15:09', 'serverlog7.txt', 'localchat7.txt', '07:15:09',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 16 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S16; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:13', 'serverlog7.txt', 'localchat7.txt', '07:15:13',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:17', 'serverlog7.txt', 'localchat7.txt', '07:15:17',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:15:20: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:15:20', 'serverlog7.txt', 'localchat7.txt', '07:15:20',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 12 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S12 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog7/localchat7 07:15:22: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog7/07:15:22', 'serverlog7.txt', 'localchat7.txt', '07:15:22',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 8 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S8 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:24', 'serverlog7.txt', 'localchat7.txt', '07:15:24',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:29', 'serverlog7.txt', 'localchat7.txt', '07:15:29',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog7/07:15:31', 'serverlog7.txt', 'localchat7.txt', '07:15:31',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 12 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S12; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:35', 'serverlog7.txt', 'localchat7.txt', '07:15:35',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog7/07:15:40', 'serverlog7.txt', 'localchat7.txt', '07:15:40',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S3; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:34', 'serverlog8.txt', 'localchat8.txt', '07:22:34',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:39', 'serverlog8.txt', 'localchat8.txt', '07:22:39',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog8/localchat8 07:22:41: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog8/07:22:41', 'serverlog8.txt', 'localchat8.txt', '07:22:41',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:45', 'serverlog8.txt', 'localchat8.txt', '07:22:45',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:50', 'serverlog8.txt', 'localchat8.txt', '07:22:50',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog8/07:22:52', 'serverlog8.txt', 'localchat8.txt', '07:22:52',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 16 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S16; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:22:57', 'serverlog8.txt', 'localchat8.txt', '07:22:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:01', 'serverlog8.txt', 'localchat8.txt', '07:23:01',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog8/localchat8 07:23:03: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog8/07:23:03', 'serverlog8.txt', 'localchat8.txt', '07:23:03',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 8 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S8 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:08', 'serverlog8.txt', 'localchat8.txt', '07:23:08',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:12', 'serverlog8.txt', 'localchat8.txt', '07:23:12',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog8/07:23:15', 'serverlog8.txt', 'localchat8.txt', '07:23:15',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 10 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S10; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:19', 'serverlog8.txt', 'localchat8.txt', '07:23:19',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog8/07:23:24', 'serverlog8.txt', 'localchat8.txt', '07:23:24',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S3; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // M-037/H-005: os três hits de Chained Penance estão no mesmo segundo e
  // crit-state; o leech é apenas capped_low. A diferença same-mob entre os
  // originais é explicada pelo decay da ação e não constitui prova de AA.
  C('serverlog9/07:48:35', 'serverlog9.txt', 'localchat9.txt', '07:48:35',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 3 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S3 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:48:37: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:48:37', 'serverlog9.txt', 'localchat9.txt', '07:48:37',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:41', 'serverlog9.txt', 'localchat9.txt', '07:48:41',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:45', 'serverlog9.txt', 'localchat9.txt', '07:48:45',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog9/07:48:48', 'serverlog9.txt', 'localchat9.txt', '07:48:48',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 15 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S15; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:48:50: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:48:50', 'serverlog9.txt', 'localchat9.txt', '07:48:50',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:53', 'serverlog9.txt', 'localchat9.txt', '07:48:53',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:48:57', 'serverlog9.txt', 'localchat9.txt', '07:48:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:49:00: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:49:00', 'serverlog9.txt', 'localchat9.txt', '07:49:00',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 11 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S11 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:04', 'serverlog9.txt', 'localchat9.txt', '07:49:04',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:09', 'serverlog9.txt', 'localchat9.txt', '07:49:09',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Spiritual Outburst (exori gran mas nia, M-016e): estagio atrasado multiestagio,
  // isento do veto same-mob pela change exempt-late-stage-multistage-from-samemob-veto
  // (nao por esta change). Ja resolvia antes; caso atualizado aqui so para refletir a
  // realidade do motor.
  C('serverlog9/07:49:11', 'serverlog9.txt', 'localchat9.txt', '07:49:11',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 13 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S13; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Greater Flurry of Blows (exori gran mas pug): spell fisica de area do monge; resolve
  // por posicao do primeiro hit + cardinalidade de leech (V-025), independente do veto
  // same-mob. Ja resolvia antes desta change; caso atualizado so para refletir o motor.
  C('serverlog9/07:49:13', 'serverlog9.txt', 'localchat9.txt', '07:49:13',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:16', 'serverlog9.txt', 'localchat9.txt', '07:49:16',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // Chained Penance (exori med pug, M-037): o decay de cadeia (~5%/pulo) e mecanica
  // DECLARADA, entao a divergencia same-mob nao e contradicao -- a acao e isenta do
  // veto same_mob_state_exact_original_mismatch (exempt-burst-and-chain-from-samemob-veto).
  // O turno RESOLVE; o motor nao reverte o decay, entao o dano base fica enviesado
  // para baixo (limitacao aceita, ver memoria chained-penance-chain-decay-unmodeled).
  C('serverlog9/07:49:20', 'serverlog9.txt', 'localchat9.txt', '07:49:20',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 6 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S6; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:49:22: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:49:22', 'serverlog9.txt', 'localchat9.txt', '07:49:22',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S7 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // serverlog9/localchat9 07:49:27: era unresolved antes de generalize-single-target-aa-resolver.
  C('serverlog9/07:49:27', 'serverlog9.txt', 'localchat9.txt', '07:49:27',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2 R0 G0; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 14/Jul/2026 (sorcerer Ritual): Great Energy Beam sem AA fantasma; dodge
  // Hazard conta como hit principal observado de dano 0 no componente do beam.
  C('kim/16:12:30', 'kim server log.txt', 'kim local chat.txt', '16:12:30',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 4 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:13:26: dois hits de Great Energy Beam no MESMO mob e mesmo estado
  // (stalking stalk 1650 e 1155; razao 0,70 = o F central/side de M-035).
  // EXPECTATIVA ATUALIZADA em 21/Jul/2026: antes esperava `unresolved`, com a
  // justificativa de que sem o detector de tier de M-035 o motor nao conseguiria
  // confirmar homogeneidade. Essa premissa foi superada: `docs/CLASSIFICATION_RULES.md`
  // passou a declarar a familia de isencao do veto same-mob por MECANICA DECLARADA
  // (M-016e-gate, que cita nominalmente M-035 para beams e M-037 para o decay de
  // Chained Penance). E a declaracao da mecanica, nao o detector de tier, que legitima
  // dois niveis do mesmo mob no mesmo bloco. O detector de M-035 continua NAO
  // implementado (beamSide so existe como campo de passagem em js/unified-main.js), e
  // isso segue sendo limitacao de METRICA (sub-linhas central/side), nao de
  // classificacao.
  C('kim/16:13:26', 'kim server log.txt', 'kim local chat.txt', '16:13:26',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S2 (Great Energy Beam); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 14/Jul/2026: blocos pequenos de Great Energy Beam. A cardinalidade de leech
  // primeiro-hit N=1 + sufixo N-1 e compativel com sub-linhas de beam (M-035) e,
  // sem fronteira independente, nao e prova positiva de AA.
  C('kim-ms-beam-small/16:15:13', 'kim server log.txt', 'kim local chat.txt', '16:15:13',
    spellNoAaCheck(3, 'Great Energy Beam')),
  C('kim-ms-beam-small/16:15:20', 'kim server log.txt', 'kim local chat.txt', '16:15:20',
    spellNoAaCheck(3, 'Great Energy Beam')),
  C('kim-ms-beam-small/16:18:06', 'kim server log.txt', 'kim local chat.txt', '16:18:06',
    spellNoAaCheck(4, 'Great Energy Beam')),
  C('kim-ms-beam-small/16:24:54', 'kim server log.txt', 'kim local chat.txt', '16:24:54',
    spellNoAaCheck(3, 'Great Energy Beam')),
  C('kim-ms-beam-small/16:25:23', 'kim server log.txt', 'kim local chat.txt', '16:25:23',
    spellNoAaCheck(4, 'Great Energy Beam')),
  C('kim-ms-beam-small/16:29:53', 'kim server log.txt', 'kim local chat.txt', '16:29:53',
    spellNoAaCheck(4, 'Great Energy Beam')),
  // kim 16:17:14: AA baixo real de sorcerer antes de Sudden Death single-target.
  C('kim/16:17:14', 'kim server log.txt', 'kim local chat.txt', '16:17:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 0 && c.rune === 1 && c.grenade === 0) ? null : `esperado A1 R1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:22:02: Death Echo (exevo mort ora) com delay +2 porque :03 nao tem hit
  // ofensivo. NAO e turno de beam — o comentario anterior aqui era copia colada do
  // bloco de M-035 e descrevia a mecanica errada.
  // EXPECTATIVA ATUALIZADA em 21/Jul/2026: antes esperava `unresolved`. Blast e eco do
  // MESMO mob em dois niveis (integral e 1/2) so colidiam no veto same-mob enquanto o
  // estagio atrasado nao era marcado; `fix-death-echo-delayed-stage-absent-evidence`
  // (M-016d-1a/1b) passou a confirmar o estagio quando ha ao menos um par casado e
  // nenhuma contradicao, e a marcacao de estagio estratifica a comparacao.
  C('kim/16:22:02', 'kim server log.txt', 'kim local chat.txt', '16:22:02',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 9 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S9 (Death Echo); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  CN('kim/16:22:04-no-turn', 'kim server log.txt', 'kim local chat.txt', '16:22:04'),
  // kim 16:22:05: depois de consumir o echo de :04, o beam real do cast :05 fica
  // Great Energy Beam (M-035, sub-linhas central/side) tem um mesmo mob podendo ser
  // atingido pelos dois segmentos do feixe em niveis distintos legitimos, mas essa
  // deteccao NUNCA foi implementada no motor Unified (so existe como campo de
  // passagem em js/unified-main.js). Antes de fix-mage-druid-aa-evidence-gold-leech,
  // o atalho sem validacao elemental (bug corrigido nessa mudanca) mascarava a
  // quebra de exatidao same-mob; com a validacao real, o motor honestamente nao
  // consegue confirmar homogeneidade sem o validador de tier de M-035 (que nao
  // existe). unresolved e o resultado correto ate M-035 ser implementado.
  // EXPECTATIVA ATUALIZADA em 21/Jul/2026 (mesma razao de kim/16:13:26): o mesmo mob em
  // dois niveis (stalking stalk 2059 e 1599) e a mecanica de beam declarada em M-035, e
  // a familia de isencao do veto same-mob por mecanica declarada (M-016e-gate) e o que
  // legitima o bloco unico. O detector de tier continua nao implementado.
  C('kim/16:22:05', 'kim server log.txt', 'kim local chat.txt', '16:22:05',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 7 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S7 (Great Energy Beam); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:22:09: Death Echo de área sem evidência positiva de AA; o hit 993 não é
  // Great Energy Beam (M-035, sub-linhas central/side) tem um mesmo mob podendo ser
  // atingido pelos dois segmentos do feixe em niveis distintos legitimos, mas essa
  // deteccao NUNCA foi implementada no motor Unified (so existe como campo de
  // passagem em js/unified-main.js). Antes de fix-mage-druid-aa-evidence-gold-leech,
  // o atalho sem validacao elemental (bug corrigido nessa mudanca) mascarava a
  // quebra de exatidao same-mob; com a validacao real, o motor honestamente nao
  // consegue confirmar homogeneidade sem o validador de tier de M-035 (que nao
  // existe). unresolved e o resultado correto ate M-035 ser implementado.
  // EXPECTATIVA ATUALIZADA em 21/Jul/2026 (mesma razao de kim/16:22:02): e Death Echo,
  // nao beam — o comentario acima era copia colada do bloco de M-035. Blast + eco
  // consolidados no mesmo componente depois de
  // `fix-death-echo-delayed-stage-absent-evidence` (M-016d-1a/1b).
  C('kim/16:22:09', 'kim server log.txt', 'kim local chat.txt', '16:22:09',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 17 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S17 (Death Echo); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:23:25: Energy Wave com dois hits observados identicos em sulphider
  // (1307 + 58 mana) no mesmo estado; a duplicata bloqueia AA posicional fantasma.
  C('kim/16:23:25', 'kim server log.txt', 'kim local chat.txt', '16:23:25',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 5 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S5; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:29:58: atalho de charm-kill/zero-damage nao pode criar AA alto de
  // sorcerer quando a Energy Wave de area pode explicar o hit visivel.
  C('kim/16:29:58', 'kim server log.txt', 'kim local chat.txt', '16:29:58',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // kim 16:20:51: empate de distancia entre `exevo mort ora` (:51) e beam (:53)
  // deve escolher o cast anterior (M-014), nao o posterior.
  C('kim/16:20:51', 'kim server log.txt', 'kim local chat.txt', '16:20:51',
    t => {
      const c = counts(t);
      if (!(c.arrow === 0 && c.spell === 2 && c.rune === 0 && c.grenade === 0)) return `esperado A0 S2; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      const spell = (t.components || []).find(comp => comp.comp === 'spell');
      return spell && spell.actionLabel === 'Death Echo (exevo mort ora)' ? null : `esperado Death Echo (exevo mort ora); got ${spell && spell.actionLabel || '-'}`;
    }),
  // kim 16:30:47: Death Echo confirmado por M-016d-1a (`undertaker 566 -> 282`).
  // O `sulphider 378` acompanha como sem contraparte, entao o primeiro hit nao e
  // evidência independente de AA apesar da cardinalidade N=1 parecer plausivel.
  C('kim-ms-death-echo-aa/16:30:47', 'kim server log.txt', 'kim local chat.txt', '16:30:47',
    spellNoAaCheck(3, 'Death Echo')),
  // kim 16:30:54: empate de distancia entre `exevo mort ora` (:54) e beam (:56)
  // Death Echo (exevo mort ora, M-016d) tem blast + eco a 1/2 potencia -- mesmo
  // mob pode legitimamente aparecer em 2 niveis (blast e eco). A checagem crua
  // same-mob (usada pela evidencia de separacao de AA e pela validacao final) nao
  // conhece essa relacao 1/2 do jeito que validateTerraBurstBonusBlock conhece o
  // bonus de Terra/Ice Burst -- fix-mage-druid-aa-evidence-gold-leech resolveu o
  // caso geral (kim 16:20:51) mas essa sessao especifica (blast+eco maior, 16 hits)
  // ainda cai no veto duro. unresolved e o resultado correto ate a checagem de
  // exatidao same-mob ganhar a mesma consciencia de tier que ja tem para Terra Burst.
  // EXPECTATIVA ATUALIZADA em 21/Jul/2026: a condicao que o comentario acima aponta como
  // bloqueio ("ate a checagem de exatidao same-mob ganhar consciencia de tier") foi
  // removida por `fix-death-echo-delayed-stage-absent-evidence` — com o estagio atrasado
  // marcado, blast e eco deixam de colidir no veto same-mob. Este mesmo turno ja e
  // afirmado como `spell:16` em tools/unified-experimental.mjs (que roda no runner
  // obrigatorio); as duas expectativas eram contraditorias.
  C('kim/16:30:54', 'kim server log.txt', 'kim local chat.txt', '16:30:54',
    t => { const c = counts(t); return (c.arrow === 0 && c.spell === 16 && c.rune === 0 && c.grenade === 0) ? null : `esperado A0 S16 (Death Echo); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // dlc ms 17/Jul/2026: M-035 implementado para Great Death Beam. Os subníveis
  // central/side explicam os degraus de razão por Beam Mastery nível 3; um cluster
  // central de 1 hit com N_leech=1 não é AA.
  // death echo 10/Jul/2026: Low Blow e crit por mob/hit, nao crit-state global.
  // O roaming dread com Low Blow nao torna o crypt mage sem Low Blow uma contradicao
  // de componente; o turno resolve como AA + Great Death Beam.
  C('death-echo-low-blow-mob-scoped/11:06:15', 'death echo server log.txt', 'death echo local chat.txt', '11:06:15',
    spellWithAaCheck(1, 7, 'Great Death Beam', { central: 2, side: 5 }), '10/Jul/2026'),
  // H-005d/M-035: o primeiro hit fecha N=1 e o sufixo fecha Great Death Beam
  // pelas cardinalidades independentes das sub-linhas central/side.
  C('death-echo-aa-before-beam/11:06:22', 'death echo server log.txt', 'death echo local chat.txt', '11:06:22',
    spellWithAaCheck(1, 8, 'Great Death Beam', { central: 3, side: 5 }), '10/Jul/2026'),
  C('death-echo-aa-before-beam/11:06:31', 'death echo server log.txt', 'death echo local chat.txt', '11:06:31',
    spellWithAaCheck(1, 9, 'Great Death Beam'), '10/Jul/2026'),
  C('death-echo-aa-before-beam/11:06:38', 'death echo server log.txt', 'death echo local chat.txt', '11:06:38',
    spellWithAaCheck(1, 6, 'Great Death Beam'), '10/Jul/2026'),
  // death echo 10/Jul/2026: Savage Blow e modificador de dano critico por mob/hit,
  // nao Low Blow. Os dois cyclursus com `(savage blow charm)` precisam sair como
  // savageBlow sem lowBlow.
  C('death-echo-savage-blow-not-low-blow/11:06:35', 'death echo server log.txt', 'death echo local chat.txt', '11:06:35',
    savageBlowIdentityCheck, '10/Jul/2026'),
  C('dlc-ms-beam/21:41:16-ratio-0562', 'dlc ms Server Log.txt', 'dlc ms Local Chat.txt', '21:41:16',
    beamNoAaCheck(5, 'Great Death Beam'), '17/Jul/2026'),
  C('dlc-ms-beam/21:56:38-ratio-0631', 'dlc ms Server Log.txt', 'dlc ms Local Chat.txt', '21:56:38',
    beamNoAaCheck(5, 'Great Death Beam'), '17/Jul/2026'),
  C('dlc-ms-beam/21:35:10-ratio-0700', 'dlc ms Server Log.txt', 'dlc ms Local Chat.txt', '21:35:10',
    beamNoAaCheck(13, 'Great Death Beam'), '17/Jul/2026'),
  C('dlc-ms-beam/21:36:49-ratio-0777', 'dlc ms Server Log.txt', 'dlc ms Local Chat.txt', '21:36:49',
    beamNoAaCheck(7, 'Great Death Beam'), '17/Jul/2026'),
  C('dlc-ms-beam/21:44:27-ratio-0872', 'dlc ms Server Log.txt', 'dlc ms Local Chat.txt', '21:44:27',
    beamNoAaCheck(6, 'Great Death Beam'), '17/Jul/2026'),
  // M-035/C-007/S-014e: as sub-linhas de beam tem cardinalidades
  // independentes. A ausencia de tres ancoras nao transforma o primeiro hit em
  // AA; o charm-kill observado continua como hit virtual do Great Death Beam.
  C('dlc-ms-beam/21:56:30-virtual-no-aa', 'dlc ms Server Log.txt', 'dlc ms Local Chat.txt', '21:56:30',
    t => {
      const base = spellNoAaCheck(4, 'Great Death Beam')(t);
      if (base) return base;
      const spell = (t.components || []).find(comp => comp.comp === 'spell');
      const virtuals = (spell && spell.hits || []).filter(hit => hit.virtual || hit.type === 'virtual');
      return virtuals.length === 1 && virtuals[0].dmg === 0
        ? null
        : `esperado 1 hit virtual de dano 0 no Great Death Beam; got ${virtuals.length}`;
    }, '17/Jul/2026'),
  // dlc ms 17/Jul/2026 21:41:33: o blast primario de Death Echo atravessa a borda
  // :33 -> :34 (M-005) e o eco em :35 confirma M-016d-1a; a fronteira de timestamp
  // nao e evidência independente de AA.
  C('dlc-ms-death-echo-aa/21:41:33', 'dlc ms Server Log.txt', 'dlc ms Local Chat.txt', '21:41:33',
    spellNoAaCheck(15, 'Death Echo'), '17/Jul/2026'),
  // RPBOSS 17/Jun/2026 (detect-boss-by-articleless-mob): Royal Paladin contra Murcion (boss,
  // sem artigo) com adds. bossNameSet antigo ("sessão tem 1 mob") não detectava boss em sessão
  // multi-boss/com adds, então a leech-cardinalidade fundia 2 hits de casts distintos num
  // componente de área no mesmo boss (viola M-009/S-016). Com detecção por-artigo, cada hit no
  // boss casa 1 cast concreto: AA→spell→granada (M-004).
  C('rpboss/09:00:51', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:00:51',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  C('rpboss/09:01:14', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:01:14',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  C('rpboss/09:01:48', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:01:48',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  // 09:03:05: ordem AA(1096) -> Strong Ethereal Spear(1574) -> Divine Grenade(1048, explosão
  // por último). Contagem A1 S1 G1 (o spell é o Spear, não a Caldera).
  C('rpboss/09:03:05', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '09:03:05',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  // Guarda de não-regressão: AoE atingindo criaturas DISTINTAS (Murcion + an elder bloodjaw)
  // NÃO é boss-turn (bloodjaw tem artigo -> isBoss=false); o spell mantém 2 hits legítimos.
  C('rpboss/08:59:25', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '08:59:25',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2 (multi-criatura); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  C('rpboss/08:59:28', 'RPBOSS Server Log.txt', 'RPBOSS Local Chat.txt', '08:59:28',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 2 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1 S2 (multi-criatura); got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '17/Jun/2026'),
  // essence/Bakragore 00:22:43 (caso 13d): a mesma detecção por-artigo resolve sessões
  // multi-boss (Echo of Ichgahal + Bakragore) — antes bossMobs ficava vazio. AA(2581 crit) +
  // Strong Ethereal Spear(1040) + Divine Grenade(761).
  C('essence/00:22:43', 'essence server log.txt', 'essence local chat.txt', '00:22:43',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  // mazzerinbarrage 14/Jun/2026 21:08:57: era o único turno já-resolvido que mudou — Divine
  // Caldera com 2 hits no bakragore (viola M-009) corrigido para Caldera(1) + Granada(1).
  C('mazzerinbarrage/21:08:57', 'mazzerinbarrage server log.txt', 'mazzerinbarrage local chat.txt', '21:08:57',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 1 && c.rune === 0 && c.grenade === 1) ? null : `esperado A1 S1 G1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '14/Jun/2026'),
  // M-038 (change exclude-field-and-dot-damage-from-main-hits): o dano dos fields deixados
  // pelas 5 `fire bomb runes` de 19:39:09-24 entrava como hit principal. Sao 47 hits, niveis
  // {7,8,9,15,18,19} contra referencia 680, contaminando 38 dos 229 turnos da sessao.
  // `ek boss` nao tem cabecalho `Channel ... saved`: sessao unica, sem filtro de data.
  //
  // Boss `Maior Domus` (sem artigo, M-009a): cada acao produz no maximo 1 hit (M-009). O tick
  // de 7 fazia 3 hits no boss unitario -> 3 quebras da invariante M-009.
  C('ek-boss/19:42:24', 'ek boss server log.txt', 'ek boss local chat.txt', '19:42:24',
    spellWithAaCheck(1, 1, 'Fierce Berserk (exori gran)')),
  C('ek-boss/19:42:41', 'ek boss server log.txt', 'ek boss local chat.txt', '19:42:41',
    spellWithAaCheck(1, 1, 'Front Sweep (exori min)')),
  C('ek-boss/19:43:08', 'ek boss server log.txt', 'ek boss local chat.txt', '19:43:08',
    spellWithAaCheck(1, 1, 'Front Sweep (exori min)')),
  // Turnos que existem SO por causa do tick: sem hit principal, nao ha turno.
  CN('ek-boss/19:40:40-so-field', 'ek boss server log.txt', 'ek boss local chat.txt', '19:40:40'),
  CN('ek-boss/19:41:26-so-field', 'ek boss server log.txt', 'ek boss local chat.txt', '19:41:26'),
  CN('ek-boss/19:42:14-so-field', 'ek boss server log.txt', 'ek boss local chat.txt', '19:42:14'),
  // O tick roubava o slot de AA (M-032: knight tem 0 ou 1 AA por turno).
  C('ek-boss/19:41:28', 'ek boss server log.txt', 'ek boss local chat.txt', '19:41:28',
    t => { const c = counts(t); return (c.arrow === 1 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A1; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }),
  C('ek-boss/19:41:45', 'ek boss server log.txt', 'ek boss local chat.txt', '19:41:45',
    spellWithAaCheck(1, 2, 'Front Sweep (exori min)')),
  // `exori scu` (Shield Slam) e de AREA; a entrada `single` do catalogo estava errada e
  // M-006 proibia bloco multi-hit, empurrando o motor para `A1 R2 Great Fireball`.
  // 19:39:54: com o tick de 8 fora, a fronteira e o estado de crit (D-007/S-008, crit e
  // por-ataque e uniforme na area) — 671 CRIT e o AA, 496/506/496 sao o Shield Slam. Leech
  // confirma: 671 -> 135 mana ~ 20% ~ N=1; cada 496 -> 40 mana ~ 8% ~ N=3.
  C('ek-boss/19:39:54', 'ek boss server log.txt', 'ek boss local chat.txt', '19:39:54',
    spellWithAaCheck(1, 3, 'Shield Slam (exori scu)')),
  C('ek-boss/19:40:14', 'ek boss server log.txt', 'ek boss local chat.txt', '19:40:14',
    spellNoAaCheck(3, 'Shield Slam (exori scu)')),
  // M-038a (23/Ago/2026, `rescue-field-hits-with-impossible-leech`, issue #11): a hunt
  // `Tue Jun 09 09:30:47 2026` saiu de CORPUS_EXCLUSIONS e passa a ser gabaritada.
  // M-038 ja tirava 4.386 ticks de campo dela, mas sobravam 216 nos mesmos niveis provados
  // {9,10,19,21} porque o restauro da ultimate spirit potion chega DEPOIS do tick e era
  // associado a ele como mana leech (`19` com `mana 152`). Os 5 turnos abaixo eram as 5
  // quebras `M-012/M-013: spell fora da janela de +/-1s` da sessao.
  //
  // 09:18:52: com os dois ticks de 19 fora, a fronteira e o estado de crit (D-007/S-008,
  // crit e por-ataque e uniforme na area): 913/820/835/890 CRIT sao o AA, 785/785/785/790
  // sao o Divine Caldera.
  C('drome/09:18:52', 'Server Log drome.txt', 'Local Chat drome.txt', '09:18:52',
    spellWithAaCheck(4, 4, 'Divine Caldera (exevo mas san)'), '09/Jun/2026'),
  // 09:24:47: o unico hit do segundo era um tick de 19 em `scissorion` — turno fantasma.
  CN('drome/09:24:47-so-field', 'Server Log drome.txt', 'Local Chat drome.txt', '09:24:47', '09/Jun/2026'),
  // Os quatro abaixo tinham um componente inteiro (ou o AA) feito de ticks. Sem eles o turno
  // e AA-only: o cast do segundo continua contando como execucao, mas nao tem dano visivel.
  C('drome/09:20:31', 'Server Log drome.txt', 'Local Chat drome.txt', '09:20:31',
    t => { const c = counts(t); return (c.arrow === 3 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A3; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jun/2026'),
  C('drome/09:23:17', 'Server Log drome.txt', 'Local Chat drome.txt', '09:23:17',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jun/2026'),
  // 09:24:39 mantem os dois componentes: os ticks eram o 19 do inicio do AA e o 19 de
  // 09:24:40; sobram 777/777 como AA e o 554 como spell. O rotulo e `Divine Missile
  // (exori san)`, castado em 09:24:39 — o MESMO segundo do hit. Era justamente aqui que o
  // tick de 09:24:40 esticava o bloco e fazia o motor alcancar o `exevo mas san` de
  // 09:24:41, fora da janela de +/-1s: a quebra M-012/M-013 desta sessao.
  C('drome/09:24:39', 'Server Log drome.txt', 'Local Chat drome.txt', '09:24:39',
    spellWithAaCheck(2, 1, 'Divine Missile (exori san)'), '09/Jun/2026'),
  C('drome/09:25:55', 'Server Log drome.txt', 'Local Chat drome.txt', '09:25:55',
    t => { const c = counts(t); return (c.arrow === 4 && c.spell === 0 && c.rune === 0 && c.grenade === 0) ? null : `esperado A4; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`; }, '09/Jun/2026'),
  // M-039 (perk omega, +6% contra alvo com vida baixa). `crypt` e o unico fixture do
  // corpus onde a testemunha de charm exibe o degrau x1,06 (medido nos 36 pares de logs/).
  //
  // Derivacao do turno 07:30:10 pela EVIDENCIA do log, nao pela saida do motor
  // (23 hits principais em dois segundos, T-002):
  //   :10, 8 hits CRIT (864 rd, 908 cyc, 893 rd, 836 rd, 968 cyc, 874 cm, 912 cyc,
  //        854 rd) => AA fisico. O `968 cyclursus` e o `912 cyclursus` estao em razao
  //        1,0614: e o hit omega do bloco (D3 fecha a intersecao com UM marcado).
  //   :10, 8 hits nao-crit (752 rd, 749 cm, 752 rd, 815 cyc, 768 cyc, 752 rd, 752 rd,
  //        768 cyc) => `exevo mas san` castado em 07:30:10 = Divine Caldera. O
  //        `815 cyclursus` contra os dois `768 cyclursus` do MESMO mob e MESMO estado
  //        esta em razao 1,0612 — e a prova direta de omega, e o que hoje mata a
  //        particao por `same_mob_state_exact_original_mismatch` (S-004a).
  //   :11, 7 hits => `exevo tempo mas san` castado em 07:30:08, explodindo em cast+3
  //        (janela [cast+2, cast+4], M-023) = Divine Grenade. Seis normalizam para o
  //        mesmo nivel holy 883 (crypt mage 840, roaming dread 844 x4, cyclursus 863) e
  //        o setimo, `780 cyclursus`, e OVERKILL: dano truncado, sem nivel a respeitar,
  //        herda o bloco contiguo por D-012 — logo o componente tem 7 hits, nao 6.
  //
  // Ordem AA -> spell -> granada (M-004) e combinacao permitida por T-005/U-004.
  C('crypt/07:30:10-omega', 'Crypt Server Log.txt', 'Crypt Local Chat.txt', '07:30:10',
    turn => {
      const c = counts(turn);
      if (!(c.arrow === 8 && c.spell === 8 && c.rune === 0 && c.grenade === 7)) {
        return `esperado A8 S8 G7; got A${c.arrow} S${c.spell} R${c.rune} G${c.grenade}`;
      }
      const spell = (turn.components || []).find(comp => comp.comp === 'spell');
      if (!spell || !String(spell.actionLabel || '').includes('Divine Caldera (exevo mas san)')) {
        return `esperado Divine Caldera (exevo mas san); got ${spell && spell.actionLabel || '-'}`;
      }
      const grenade = (turn.components || []).find(comp => comp.comp === 'grenade');
      if (!grenade || !String(grenade.actionLabel || '').includes('Divine Grenade')) {
        return `esperado Divine Grenade; got ${grenade && grenade.actionLabel || '-'}`;
      }
      // M-039/D1: o rotulo omega e derivado do nivel do bloco, entao no Caldera ele cai
      // em exatamente um hit — o `815 cyclursus`, e em nenhum dos outros sete.
      const omega = (spell.hits || []).filter(h => h.omegaActive);
      if (omega.length !== 1) return `esperado 1 hit omegaActive no Caldera; got ${omega.length}`;
      if (!(omega[0].dmg === 815 && String(omega[0].mob).toLowerCase().includes('cyclursus'))) {
        return `esperado omegaActive no cyclursus 815; got ${omega[0].mob} ${omega[0].dmg}`;
      }
      // M-039: omega fica DENTRO da base de leech — o dano exibido e a base, nada e
      // descontado. Este assert discrimina as duas leituras sem precisar da taxa da
      // sessao: `CEIL(dano x taxa x areaFactor)` (D-023) e monotonico no dano e os tres
      // hits abaixo sao do MESMO mob no MESMO bloco (mesma taxa, mesmo N_leech), entao
      //   - com omega na base  => o leech do 815 fica ~6% acima do leech dos 768;
      //   - com omega descontado => os tres teriam a MESMA base e o MESMO leech.
      // Observado no log: 82 no 815 contra 77 nos dois 768 — razao 1,065 contra a razao
      // de dano 1,061. So a primeira leitura reproduz isso.
      const cyc = (spell.hits || []).filter(h => String(h.mob).toLowerCase().includes('cyclursus'));
      const omegaLife = cyc.filter(h => h.omegaActive).map(h => h.lifeLeech);
      const plainLife = cyc.filter(h => !h.omegaActive).map(h => h.lifeLeech);
      if (!(omegaLife.length === 1 && plainLife.length === 2)) {
        return `esperado 1 cyclursus omega + 2 sem omega no Caldera; got ${omegaLife.length}+${plainLife.length}`;
      }
      if (!plainLife.every(v => v === 77) || omegaLife[0] !== 82) {
        return `esperado life leech 82 (omega) e 77/77 (sem omega); got ${omegaLife[0]} e ${plainLife.join('/')}`;
      }
      return null;
    }),
  ...SHARED_UNIFIED_GOLDEN_CASES.map(c => C(c.id, c.server, c.local, c.ts, sharedCountCheck(c.expected), c.date)),
];

export function runUnifiedGabarito({
  only = null,
  showFingerprints = false,
  showCacheStats = false,
  cacheEnabled = true,
  corpus = new UnifiedCorpus({
    cacheEnabled,
    persistentCacheDir: cacheEnabled ? 'reports/unified-cache' : null,
  }),
  write = line => console.log(line),
} = {}) {
  const cases = CASES.filter(c => !only || c.id.includes(only));
  if (!cases.length) {
    return { pass: 0, fail: 0, skipped: 0, empty: true, corpus };
  }

  let pass = 0;
  let fail = 0;
  let skipped = 0;
  for (const c of cases) {
    const { missing, turns } = corpus.findTurns(c.sv, c.lc, c.ts, c.date, {
      profile: 'gabarito',
      includeExcluded: true,
    });
    if (missing) {
      write(`SKIP ${c.id} (arquivo ausente)`);
      skipped++;
      continue;
    }
    const pick = turns[0];
    if (!pick) {
      if (c.noTurn) {
        write(`PASS ${c.id}`);
        pass++;
        continue;
      }
      write(`FAIL ${c.id}: nenhum turno alinhado em ${c.tsRaw}`);
      fail++;
      continue;
    }
    if (showFingerprints) write(`FINGERPRINT ${c.id} ${classificationFingerprint(pick)}`);
    if (c.noTurn) {
      write(`FAIL ${c.id}: turno alinhado inesperado em ${c.tsRaw}`);
      fail++;
      continue;
    }
    let reason = null;
    try {
      reason = c.check(pick);
    } catch (error) {
      reason = `throw: ${error.message}`;
    }
    if (reason) {
      write(`FAIL ${c.id}: ${reason}`);
      fail++;
    } else {
      write(`PASS ${c.id}`);
      pass++;
    }
  }

  write(`\n${pass}/${pass + fail} gabarito-unified ok${fail ? `  (${fail} falha(s))` : ''}`);
  if (showCacheStats) {
    const stats = corpus.cacheStats();
    write(`CACHE enabled=${cacheEnabled} requests=${stats.requests} classifications=${stats.classifications} hits=${stats.hits} persistentHits=${stats.persistentHits} persistentWrites=${stats.persistentWrites} skippedWithoutTimestamp=${stats.skippedWithoutTimestamp} pairedFixtures=${stats.pairedFixtures}`);
  }
  return { pass, fail, skipped, empty: false, corpus };
}

function parseCli(argv) {
  const onlyIndex = argv.indexOf('--only');
  return {
    only: onlyIndex >= 0 ? (argv[onlyIndex + 1] || '') : null,
    showFingerprints: argv.includes('--fingerprints'),
    showCacheStats: argv.includes('--cache-stats'),
    cacheEnabled: !argv.includes('--no-cache'),
  };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const result = runUnifiedGabarito(parseCli(process.argv.slice(2)));
  if (result.empty) {
    console.error('Nenhum caso de gabarito corresponde ao filtro.');
    process.exit(2);
  }
  process.exit(result.fail ? 1 : 0);
}
