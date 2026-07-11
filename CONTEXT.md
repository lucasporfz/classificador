# Classificador de logs Tibia

Cruza um server log com um local chat de uma mesma hunt e classifica cada turno de
combate (quais componentes bateram — auto ataque, spell, runa, granada) a partir de
dano observado, sem simulação.

## Language

**Turno**:
Uma janela de 2 segundos de combate contra um ou mais mobs, contendo um ou mais hits
observados no server log. É a unidade que o classificador resolve.

**Turno ouro**:
Um turno "fácil" — resolvível com poucos recursos lógicos, sem precisar ainda saber
leech, perks ou multiplicador de crítico da sessão. Serve de evidência confiável para
inferir esses valores antes de classificar o resto. O termo já é usado no código
("gold observations").
_Avoid_: turno fácil, turno confiável (usar sempre "turno ouro").

**Setup**:
Um valor válido para a sessão inteira, inferido a partir de turnos ouro em vez de
assumido: taxa de leech (vida/mana), multiplicador de crítico por componente, perk
(ex.: BM/pierce), e o estado do gravSan. Todo o resto da classificação consome o
setup já inferido.
_Avoid_: configuração, parâmetros.

**Bootstrap**:
O processo de duas passadas que produz o setup: primeira passada resolve turnos sem
setup informado, colhe os turnos ouro daí, infere o setup, e uma segunda passada
reclassifica tudo já com o setup conhecido.
_Avoid_: warm-up, calibração.

**Perk**:
Uma característica passiva do personagem que não é vocação nem equipamento
diretamente observável, e por isso precisa ser inferida da sessão (ex.: BM, que
adiciona pierce elemental). Tratado como parte do setup.

**Orquestração**:
A camada mais externa: decide sob quais hipóteses de perk rodar o bootstrap (ex.:
com e sem BM), compara a evidência entre elas, e escolhe o resultado final da
classificação da sessão.
_Avoid_: pipeline principal, entrypoint.
