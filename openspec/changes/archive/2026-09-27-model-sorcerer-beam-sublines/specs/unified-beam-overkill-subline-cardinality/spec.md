## MODIFIED Requirements

### Requirement: Overkill permanece na cardinalidade da sub-linha de beam
O classificador Unified SHALL contar todo hit principal elegível e real atribuído a uma sub-linha `central` ou `side` no `N_leech` dessa sub-linha, inclusive quando o dano exibido estiver truncado por overkill. O dano exibido de overkill MUST NOT participar da formação dos clusters de original ou de razão `leech/danoMostrado`. Ele pode servir apenas como **piso** do dano real, para excluir uma sub-linha cujo nível fica abaixo dele (M-035b).

#### Scenario: Lateral com um hit overkill
- **WHEN** um beam possui quatro hits laterais não-overkill e um hit lateral overkill sustentado por leech absoluto
- **THEN** a lateral SHALL ser validada com `N_leech=5`
- **THEN** o hit overkill SHALL contar exatamente uma vez na cardinalidade lateral
- **THEN** a lateral MUST NOT ser rejeitada por ter sido testada como `N_leech=4`

#### Scenario: Dano truncado não escolhe tier
- **WHEN** um hit overkill possui dano exibido mais próximo do cluster central ou lateral
- **THEN** essa proximidade MUST NOT determinar seu `beamSide`
- **THEN** somente evidência permitida por M-035, M-035b e D-019/D-025 SHALL sustentar sua atribuição

#### Scenario: Dano truncado acima de um nível o exclui
- **WHEN** o dano exibido de um overkill, revertido, já passa do nível lateral mais a tolerância
- **THEN** o overkill MUST NOT ser posto na lateral, porque o dano real não é menor que o exibido

### Requirement: Atribuição de overkill exige distribuição mecanicamente única
Para um split central/lateral sustentado pelos hits não-overkill, ou pelo dano real provado de um overkill central (M-035b), o classificador SHALL avaliar as distribuições possíveis dos hits overkill reais. A avaliação usa vida e mana separadamente, `areaFactor(N_leech)`, reconstrução de dano real, o nível do dano real provado de cada overkill e o piso de cada overkill. O classificador MUST marcar `beamSide` no overkill somente quando uma única distribuição preserva ambos os clusters e aceita as cardinalidades completas.

#### Scenario: Distribuição central dois e lateral cinco
- **WHEN** o turno `death echo 11:06:15` contém `3539×2` com leech `487/312`, `2749×3` com leech `193/124`, `1161` com leech `82/53` e o overkill `2123` com leech `193/124`
- **THEN** o Great Death Beam SHALL ser validado como `central=2` e `side=5`
- **THEN** os dois hits `3539` SHALL receber `beamSide=central`
- **THEN** os hits `2749×3`, `1161` e `2123` overkill SHALL receber `beamSide=side`

#### Scenario: Distribuições empatadas
- **WHEN** duas ou mais distribuições de overkill aceitam as mesmas evidências mecânicas
- **THEN** o classificador MUST NOT escolher por timestamp, posição, mob, média global ou ordem de iteração
- **THEN** o hit sem prova única SHALL permanecer sem tier validado

#### Scenario: Leech ausente
- **WHEN** um overkill não possui canais utilizáveis para reconstruir dano real e nenhuma outra evidência normativa resolve seu tier
- **THEN** a ausência de evidência SHALL NOT ser tratada como confirmação de central ou lateral

#### Scenario: Overkills rotulados pelo nível do dano real
- **WHEN** `alumnishocks 2` S0 18:25:16 contém `wardragon 1656` central, laterais `434` e `396×3`, e os overkills `20 OK`, `1156 OK`, `145 OK`, `94 OK` e `235 OK`
- **THEN** `20 OK` e `1156 OK` SHALL ser `central`
- **THEN** `145 OK`, `94 OK` e `235 OK` SHALL ser `side`

## ADDED Requirements

### Requirement: A sub-linha aceita leech esparso sem contradição
Na validação de leech de cada sub-linha de beam, o classificador SHALL aceitar a sub-linha quando o leech utilizável tem ao menos uma confirmação e nenhuma contradição. É a mesma regra que já vale para a spell concreta determinística (V27). Os hits sem leech, capped-low ou em overkill MUST NOT derrubar a sub-linha só por deixarem a confirmação esparsa.

#### Scenario: Lateral com uma confirmação
- **WHEN** em `dlc ms` S0 21:44:27 a lateral de 5 hits tem uma confirmação de leech, zero contradição e os demais hits com vida e mana cheias
- **THEN** o Great Death Beam SHALL validar em fire, stage 3, fração `≈ 0,8721`
- **THEN** `2420` SHALL ser `central`, e `2111`, `2111`, `2856`, `2865`, `2865` SHALL ser `side`
