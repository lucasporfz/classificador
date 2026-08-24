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

**Omega**:
Nome que este projeto deu a um perk de dano que o jogo não anota em lugar nenhum do
server log: ele multiplica o dano por um fator fixo quando o alvo está com pouca vida.
O nome é nosso porque a mecânica não tem nome observável — nenhum sufixo, nenhuma
linha, nenhuma incantação a revela. O que a revela é o dano de charm, que é fixo por
mob e por isso denuncia qualquer multiplicador oculto como um segundo nível exato.
_Avoid_: bônus de execute, low-hp bonus, perk dos 6%.

**Estado do hit**:
O conjunto de fatos que valem para um hit individual (e não para o componente inteiro
nem para a sessão) e que mudam o dano dele: Expose Weakness, prey, amplification,
Perfect Shot, crítico — e omega. Dois hits do mesmo mob no mesmo estado do hit têm
obrigatoriamente o mesmo dano; é isso que torna a comparação entre eles uma prova, e
não uma estimativa.

Estados do hit se dividem em **observados** e **inferidos**. Observado é o que o
server log escreve no sufixo da própria linha. Inferido é o que só se deduz do nível
do bloco a que o hit pertence — omega é o primeiro do tipo. A distinção importa
porque um estado inferido não pode ser assumido: ele depende de o perk correspondente
ter sido detectado na sessão, e fora disso simplesmente não existe.
_Avoid_: modificador do hit, flag do hit.

**Orquestração**:
A camada mais externa: decide sob quais hipóteses de perk rodar o bootstrap (ex.:
com e sem BM), compara a evidência entre elas, e escolhe o resultado final da
classificação da sessão.
_Avoid_: pipeline principal, entrypoint.
