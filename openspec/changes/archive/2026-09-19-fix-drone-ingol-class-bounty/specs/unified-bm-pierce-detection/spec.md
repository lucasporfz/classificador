## MODIFIED Requirements

### Requirement: A testemunha de charm desconta o bônus de classe de bestiário pelos elementos imunes ao BM

O motor Unified SHALL descontar o bônus de classe de bestiário (M-036) antes de usar uma linha de charm como testemunha do BM. Existe circularidade — o dano de charm é multiplicado pelo bônus de classe, e a detecção desse bônus por sua vez depende de `bmPierce` — e o motor SHALL quebrá-la pela assimetria dos dois efeitos: o BM afeta apenas `holy`/`physical`, enquanto o bônus de classe afeta todos os elementos daquela classe. Os charms de elementos imunes ao BM (`fire`, `ice`, `death`, `earth`, `energy`) SHALL ser usados para medir o bônus de classe, e só então as linhas `holy`/`physical` da mesma classe, corrigidas por ele, SHALL testemunhar o BM.

Uma linha `holy`/`physical` cuja classe de bestiário não tem nenhuma testemunha imune MUST ser tratada como não-discriminante tanto para a inferência do bônus de classe quanto para a inferência de BM. O motor MUST NOT assumir bônus de classe igual a 1 nem atribuir o excesso observado ao perk de classe para tornar a linha utilizável.

Sob escada de Combat Mastery, essas linhas MAY continuar participando dos tetos conservadores e do diagnóstico de ausência definido em M-042, mas MUST NOT, sozinhas, confirmar um bônus positivo de classe. Um veredito positivo continua exigindo ao menos uma testemunha imune ao BM para a mesma classe.

#### Scenario: classe sem testemunha imune não decide nenhum dos perks

- **WHEN** a única evidência de charm de uma classe de bestiário é holy ou física, sem nenhum charm de elemento imune ao BM na mesma classe
- **THEN** essa linha MUST NOT confirmar bônus de classe nem `bmPierce`
- **AND** os dois eixos SHALL permanecer desconhecidos ou ser decididos por evidência independente

#### Scenario: repetição da mesma linha não remove o confundimento

- **GIVEN** `drone ingol` possui 42 procs na linha `liodile | holy`
- **AND** não possui testemunha imune que meça a classe `humanoid`
- **WHEN** o bônus de classe é inferido
- **THEN** a repetição SHALL confirmar apenas o valor observado
- **AND** o motor MUST NOT inferir `humanoid +2%`

#### Scenario: escada não transforma linha sensível em prova positiva

- **GIVEN** uma classe possui apenas linhas `holy`/`physical`
- **AND** Combat Mastery produz uma escada ativa
- **WHEN** o teto de M-042 deixa um único candidato positivo
- **THEN** esse candidato MUST NOT ser confirmado como perk de classe sem uma testemunha imune ao BM
