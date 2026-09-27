# Change B — revisão de código em dois eixos (Fase 4, passo 6)

Data: 27/Set/2026. Ponto fixo: `15d0db7` (working tree). Revisores independentes, um por eixo.

## Standards

| # | Achado | Tipo | Resolução |
|---|---|---|---|
| 1 | `beamSublineLeechOk`, o gabarito e o teste citavam "V27", que não é ID de regra | violação | Resolvido: citam M-035 (o texto de M-035 declara o leech esparso da sub-linha) |
| 2a | Forma A: a regra dizia "interseção", e o código aceita intervalos disjuntos dentro da tolerância | divergência código × regra | Resolvido: M-035b diz "interseção com a tolerância de cluster elemental" |
| 2b | Forma A: a regra pedia "pelo menos um overkill provado"; o código exige prova de todo overkill com leech do mesmo estado posto no central | divergência código × regra | Decisão 6 do usuário: vale o código (protótipo). M-035b, o spec e o design foram alinhados, e há assert (`dlc ms` S0 21:42:47) |
| 2c | Piso de 3 hits da forma A não documentado | divergência | Resolvido: documentado em M-035b |
| 3 | No ramo com setup de leech dado nas opções, o stage sai da primeira passada, que já tem leech | divergência código × regra | Resolvido no texto: é o que o design (D2) e a tarefa 5.2 pedem ("passada sem leech, ou `pass1`"). M-035 agora diz isso |
| 4 | `beamLeechRealDamageRange` é uma segunda inversão leech→dano real, ao lado de `realDamageIntervalFromLeech` | violação branda | Aceito: o contrato é outro. Ele soma a tolerância de D-024, une as taxas candidatas e devolve dano exibido (escala da base de leech). Trocar pela função exata mudaria o arredondamento e tiraria a igualdade com o protótipo aprovado |
| s1 | Duplicated Code: o piso recalculava o limite inferior da faixa de dano real | smell | Resolvido: o piso reusa `beamLeechRealDamageRange` (equivalência verificada: o limite inferior sai da maior taxa) |
| s2 | Duplicated Code: `elementalOriginalCandidates` de clone com `dmg` repetido 4× | smell | Resolvido: helper `beamOriginalsAtDamage` |
| s3 | Mysterious Name: `extra` com dois sentidos | smell | Resolvido: `fields` e `virtualHits` |
| s4 | Primitive Obsession: `plan.free` + `plan.legacy` | smell | Resolvido: `plan.mode` ∈ {`ordered`, `spread`, `legacy`} |
| s5 | Speculative Generality: modo `legacy` só para contexto montado à mão | smell | Aceito: decisão do usuário ("contexto sem setup de estância: comportamento de hoje") |
| s6 | Feature Envy: `leechBasisToShownScale` sonda `leechDamageBasis` com `dmg: 1000` | smell | Aceito: expor o divisor mexeria na API de `unified-setup-inference.js` sem ganho de comportamento |
| s7 | Data Clumps: `(hit, n, element, block, context, memo)`; `tryStages` com 7 parâmetros | smell | Aceito |
| s8 | O comentário de M-016e ficou separado da chamada que descreve | nit | Resolvido |

Limpo, segundo o revisor: nenhum toggle `__B_*` vazou; nenhuma lógica de fixture ou timestamp no motor; fins de linha preservados; nenhum limiar novo.

## Spec

| # | Achado | Resolução |
|---|---|---|
| a1 | Piso real sem assert (`kim` 16:15:34, `dlc ms` S1 21:53:29) | Asserts adicionados |
| a2 | `dlc ms` S0 21:37:37 (N com virtual) só sintético | Assert real adicionado (fire, stage 3, `A0 S11`) |
| a3 | `aquatic` S0 10:44:52 (estado de crítico) sem assert | Assert adicionado |
| a4 | Stage com discordância / "nunca por maioria" sem assert | `inferBeamMasteryStageFromResolved` exportada e teste unitário adicionado |
| a5 | Estância desconhecida (spread primeiro, perfil no empate), pré-cutoff só nativo, sem assert direto | Sintéticos adicionados. Os dois primeiros ficam vermelhos no motor de antes |
| a6 | `dlc ms` S0 21:35:10 sem rótulo (decisão 3) sem assert | Assert adicionado (`2990 OK` e `6432 OK` sem rótulo) |
| a7 | Fração 0,2955 de 18:26:16; elemento/stage de 18:25:16 e `aquatic` S0 10:44:32 | Asserts adicionados. O "≈ 2312" não é exposto pelo resultado e fica só no texto da regra |
| b1 | Frase nova e não medida sobre `Energy Beam` em M-035 | Removida |
| b2 | M-035b se dizia "IMPLEMENTADA" com o gate humano pendente | Corrigido para "implementação em revisão" (vira IMPLEMENTADA no fechamento) |
| c1 | Forma A rotula lateral, por eliminação, um overkill com leech sem prova | Medido: 19 beams de forma A no corpus; 2 rótulos laterais sem prova (`kim` 16:20:13, `dlc ms` S0 21:36:36), e os dois são forçados por outras restrições (não mudam na leitura alternativa). Decisão 6 do usuário: manter |
| c2 | M-035 dizia "overkill sem prova fica sem tier", e o piso rotula sem prova | Resolvido: "que nem a prova nem o piso de M-035b põem numa sub-linha só" |
| c3 | Nível e piso comparam contra o cluster inteiro quando a sub-linha tem âncora do mesmo estado | Resolvido no texto de M-035b (é o que o código e o protótipo fazem) |

## Verificação depois dos ajustes

- `tests/unified-beam-sublines-by-stance.test.mjs`: 46/46.
- O repo é igual ao protótipo completo, hit a hit, nos 12 pares (`final-proto-vs-repo.txt`).
- `run-unified-checks`: 59/66, as mesmas 7 falhas do baseline. Gabarito 344/344.
- Dump completo: 21.981 turnos, 73 sem classificação, diff contra o `latest` vazio.
