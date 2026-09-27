## MODIFIED Requirements

### Requirement: O elemento efetivo reverte o dano das spells de sorcerer que não são beam

Para cada cast ofensivo de magia do dono com estância conhecida, o motor SHALL reverter o dano
do bloco da spell (D-010a) no **elemento efetivo** previsto pela máquina de conversão, e não no
elemento do perfil:

- `converted` → primeiro a estância, depois o nativo;
- `arm` / `rearm` → só a estância (que é o próprio elemento da magia);
- `native` ou carga desconhecida (`unknown`) → primeiro o nativo, depois a estância.

O segundo elemento SHALL ser usado **só** quando o primeiro não fecha entre mobs distintos do
mesmo segundo e o segundo fecha (o mesmo critério de M-043a). Quando o dano não separa os dois, ou
nenhum fecha, vale o primeiro. Um terceiro elemento MUST NOT ser usado.

Com estância `unknown`, `not_applicable` (sessão anterior a 16/Jun/2026), ou vocação diferente de
sorcerer, o elemento SHALL ser o do perfil, como antes desta mudança.

Beams (`exevo vis lux`, `exevo gran vis lux`, `exevo max mort`) seguem o requisito "O elemento do
beam segue a ordem da máquina de conversão". Quando o validador de sub-linhas não fecha, o bloco
genérico de um beam SHALL ser revertido no **primeiro** elemento da máquina.

#### Scenario: Death Echo convertido reverte em energy

- **WHEN** `alumnishocks 2` S0 (`21/Sep/2026`, estância `energy`) é classificada e o Death Echo de
  `18:25:47` está `converted`
- **THEN** o bloco SHALL ser revertido em `energy` (blast `786/788`, eco `393/394`) e o turno SHALL
  continuar `A0 + Death Echo 15`

#### Scenario: fora de sorcerer pós-update nada muda

- **WHEN** `Mrowdy`, `Mrowdy 2` e `ms boss` (sorcerer, pré-update), `uhax 3` e `ingol ed` (druid)
  e `barrage` (paladin) são classificados
- **THEN** todos os turnos SHALL sair idênticos aos de antes desta mudança

## ADDED Requirements

### Requirement: O elemento do beam segue a ordem da máquina de conversão

O validador de sub-linhas (M-035) SHALL testar o elemento de um beam na ordem da máquina de M-043:
`converted` → [estância, nativo]; `arm`/`rearm` → [estância]; `native`/`unknown` → [nativo,
estância]. O segundo elemento SHALL entrar só quando nenhuma distribuição de central e lateral
fecha no primeiro. Um terceiro elemento MUST NOT ser usado, e o elemento MUST NOT ser escolhido pelo
menor desvio da fração entre elementos.

Em sessão anterior a 16/Jun/2026 (`not_applicable`), o beam SHALL usar só o elemento nativo. Com a
estância desconhecida, o validador SHALL testar os três elementos e escolher o de **menor spread**
dentro dos níveis, usando o perfil só no empate, como o texto de M-035 manda. As distribuições que
decidem o rótulo `central`/`side` SHALL vir só do elemento escolhido.

#### Scenario: beam armado sai no elemento da estância

- **WHEN** `alumnishocks 2` S0 18:30:18 (Great Energy Beam `arm`, estância energy) é classificado
- **THEN** o beam SHALL validar em `energy`, stage 1, com `1320` central e `389`, `389`,
  `121 OK` laterais, e não em fire

#### Scenario: beam na estância death

- **WHEN** `death echo` S0 11:06:22 (Great Death Beam `rearm`, estância death) é classificado
- **THEN** o beam SHALL validar em `death`, e não em energy
- **AND** `504 OK`, `1700` e `1805` SHALL ser `central`, e `1189` e `1263`×4 SHALL ser `side`

#### Scenario: beam convertido tenta a estância primeiro

- **WHEN** `dlc ms` S1 21:52:46 (Great Death Beam `converted`, estância fire) é classificado, e o
  dano fecha igual em death e em fire
- **THEN** o beam SHALL validar em `fire`, com os mesmos rótulos de hoje

#### Scenario: pré-cutoff usa o nativo

- **WHEN** `Mrowdy 2` S0 e `ms boss` S14 17:16:37 (11/Jun/2026) são classificados
- **THEN** o turno SHALL continuar `A1 + Great Energy Beam 5`, sem sub-linha, idêntico ao de hoje
