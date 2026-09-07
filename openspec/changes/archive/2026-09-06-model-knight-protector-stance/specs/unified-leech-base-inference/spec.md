## ADDED Requirements

### Requirement: Observacao-ouro de leech desconta a postura do knight

A base de dano de uma observacao-ouro SHALL descontar o multiplicador de Protector quando o
hit estiver em estado `protector`, do mesmo modo que ja desconta prey, Bounty e
`utevo grav san`. Sem esse desconto, a taxa votada e um meio-termo entre dois regimes que
diferem `17,6%` na razao leech/dano, e as observacoes de Protector aparecem como contradicao
sistematica da taxa vencedora.

#### Scenario: Contradicoes concentradas na postura Protector
- **WHEN** a sessao `picture` S0 e votada sem o desconto de Protector
- **THEN** as 4 contradicoes da taxa de vida vencedora sao todas de hits em estado
  `protector`

#### Scenario: Taxa limpa com o desconto aplicado
- **WHEN** a sessao `ek boss` S0 e votada com o desconto de Protector
- **THEN** a taxa de mana vencedora e `0,16` com 103 correspondencias exatas e nenhum
  capped-low, contra `0,19` com 21 exatas e 5 contradicoes sem o desconto

### Requirement: Hit em postura desconhecida nao e observacao-ouro

Um hit em estado de postura `unknown` NAO SHALL ser usado como observacao-ouro na votacao de
rate base de vida ou de mana. O estado `unknown` cobre todo hit anterior ao primeiro cast
exato de postura do dono na sessao. A postura desconhecida e evidencia ausente, e uma
observacao cuja base de dano depende de um multiplicador nao determinado nao pode votar na
taxa.

#### Scenario: Prefixo de sessao sem cast de postura observado
- **WHEN** existem hits ofensivos do dono antes do primeiro cast exato de postura
- **THEN** esses hits sao excluidos do conjunto-ouro dos dois canais
- **AND** a ausencia deles fica registrada no diagnostico da sessao
