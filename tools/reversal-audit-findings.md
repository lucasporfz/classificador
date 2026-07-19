# Stage 0.3 — Auditoria de exatidão da reversão (gate GO/NO-GO)

Ferramenta: `node tools/reversal-audit.mjs` (fixtures: server log rp, darklight rp, jaded, highwin 2).

## Medidas (TOTAL)

| Grupo | sets/grupos | exato `===` | ≤1 | ≤2 |
|---|---|---|---|---|
| **PURA** (mesmo mob + mesmo EW, não-crit) | 980 | **99.1%** | 99.1% | — |
| cross-mob não-crit | 516 | 15.1% | 74.6% | 82.0% |
| cross-mob crit | 97 | 33.0% | 76.3% | 76.3% |

## Conclusão (gate)

- **A cauda multiplicativa reverte EXATA** para hits do mesmo mob + mesmo EW + não-crit
  (99.1% colapsam no mesmo inteiro). A premissa de **determinismo** do doc é real nesse nível.
  Os ~1% restantes e os `pior_spread` grandes (231/312/489) são **artefato de agrupamento**
  (dois casts diferentes caem no mesmo segundo de relógio), não resíduo de reversão.
- **Cross-mob NÃO colapsa em `===`**: dividir pelo mod elemental e pela mitigação de cada mob
  reintroduz arredondamento fracionário que cai diferente por mob (só 15% exato; ~82% dentro
  de ±2). **Comparar bases de mobs diferentes com `===` literal é inválido.**
- **Crit cross-mob é pior** (33% exato): o crit-mult é a média da sessão
  (`avgCrit/avgNormal`, [classifier-parser.js:112](../js/classifier-parser.js#L112)), não o
  multiplicador exato por hit — adiciona resíduo por cima.

## Decisão de design (afeta a Fase 2 / Eixo 2-elemental)

A aspiração "threshold-free / `===`" do doc é **rebaixada** para **"reversão exata + UMA
tolerância proporcional justificada pelo arredondamento"** — exatamente o que `ewAwareEq` já
faz: `Math.abs(b1-b2) <= max(2, center×0.004)` ([parser-rp-helpers.js:39](../js/parser-rp-helpers.js#L39)).

- Eixo 1 / Eixo 2-elemental usam **base revertida + essa tolerância única**, não igualdade literal.
- Ainda é o ganho central: **1 tolerância derivada do arredondamento** substitui os ~10 cutoffs
  calibrados à mão (`CLS_GRENADE_AA_RATIO=1.12`, `±2`, `≤8% spread`, `≥60 gap`, ...).
- Crit usa raciocínio por intervalo/tolerância (como o eixo físico), nunca `===`.

**Veredito: GO** para o Caminho A, com essa correção registrada.
