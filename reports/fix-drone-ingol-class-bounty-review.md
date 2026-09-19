# Revisão — `drone ingol`: perk de classe e Bounty

## Diagnóstico

- O perk falso `humanoid +2%` vinha de 42 repetições da mesma linha `liodile | holy`.
- Essa linha não separa bônus de classe de Bestiário e BM: ambos podem aumentar dano holy.
- Todos os 47 eventos de charm marcados como Bounty no log são `overpower charm`; eles não votam em percentual de Bounty.
- O fallback determinístico de Divine Caldera/Ethereal Barrage encontra evidência utilizável, mas ela é contraditória: nível 25 tem 18 encaixes e 24 contradições; nível 24 tem 14 encaixes e 28 contradições. D-010g proíbe escolher por maioria, portanto o Bounty permanece desconhecido.

## Correção canônica

- `inferBestiaryClassDamageBonus`: linhas físicas/holy continuam disponíveis para diagnóstico, mas não confirmam perk positivo de classe sem ao menos uma testemunha de elemento imune a BM. A mesma proteção vale sob escada de Combat Mastery.
- `inferBountyDamageFromFrozenComponents`: os controles sem marca congelam o dano original; somente hits marcados utilizáveis testam cada nível. Hit marcado não reversível abstém. O estado Grav San do componente é preservado na reversão.
- Nenhuma função concorrente, limiar novo, constante mágica ou caso especial por personagem foi adicionado.

## Resultado em `drone ingol`

- Antes: 189 turnos, 64 sem classificação.
- Depois: 189 turnos, 1 sem classificação.
- O turno de gabarito `18:28:15` resolve como 7 ataques + 7 Divine Caldera.
- O BM passa a ser inferido por evidência independente como ativo em 4%.
- O perk de classe fica neutro/desconhecido, em vez de `humanoid +2%`.
- O Bounty fica desconhecido porque Caldera/Barrage contradizem todos os candidatos; overpower não foi usado.
- O único turno ainda sem classificação é `18:31:57`, por interseção física vazia em um bloco misto de 30 hits.

## Drift e validação

- Baseline preservado: 21.287 turnos, 125 sem classificação.
- Candidate final: 21.287 turnos, 62 sem classificação.
- Diff integral: 72 linhas removidas e 72 adicionadas, todas exclusivamente em `drone ingol Server Log.txt`.
- Testes focados: Bounty, witness de `drone ingol`, BM, Combat Mastery e gabarito `drone ingol` passaram.
- Runner completo: 48/57 alvos OK. Nenhum teste relacionado à mudança falhou; permanecem as falhas preexistentes. Nesta última execução, o alvo combinado de gabarito/invariantes também estourou o heap de 8 GB durante a recomputação, embora o gabarito focado tenha passado.
- O candidate não foi promovido.

## Revisão Standards / Spec

- **Standards:** alteração mínima dentro das duas funções canônicas; sem UI, sem classificador paralelo e sem afrouxar testes.
- **Spec:** atende M-036/C-012a ao impedir atribuição positiva sob confundimento de BM e atende D-010g ao manter Bounty desconhecido quando a evidência determinística é contraditória.
- **Achados bloqueantes:** nenhum.

## Correção (18/Sep/2026) — Bounty conhecido

A conclusão "Bounty desconhecido" estava errada. As 24 contradições do nível 25 vinham de dois defeitos do fallback, não do log:

- **Hits marcados mal particionados:** a partição foi congelada com o Bounty desconhecido, então hits variáveis de AA do `boar man` ficaram colados à Caldera (`18:28:23`: `708` ao lado de `831 ×3`; `18:28:36`: `682/670` ao lado de `812 ×4`). Agora só o valor modal repetido de cada `(mob, estado)` marcado vota.
- **Comparação exata entre mobs distintos:** marcado (`boar man`) × controle (`liodile`/`carnivostrich`) é cross-mob e a reversão tem resíduo de 1 ponto no arredondamento do `mod` (S-004a). Agora aceita `ELEMENTAL_INTERMEDIATE_TOLERANCE`.

Controle independente: o cast `18:34:58` (task já concluída, `boar man 885` **sem marca**) fecha BM 4%, grav san 1,10 e a tabela do `boar man` num original comum 744.

Resultado: **Damage nível 25 (+12,5%)**, 30 componentes, 0 contradições (24: 5; 26: 16). **Life nível 5 (+5%)** pela inferência conjunta. `drone ingol` 0 sem classificação (era 1); corpus 125 → 61; drift de 77 linhas, todas em `drone ingol`, contra o baseline pré-correção. `run-unified-checks` 49/57, com as 8 falhas pré-existentes. D-010g emendada em `docs/CLASSIFICATION_RULES.md`.
