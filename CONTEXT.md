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

**Testemunha de charm**:
O dano de um proc de charm ofensivo, usado como prova de fatos da sessão. Ele é fixo
por mob (o jogo não sorteia) e não depende de classificação nenhuma, então qualquer
multiplicador oculto do personagem aparece nele como um segundo nível exato. É o único
canal do motor que mede perk sem depender de turno resolvido.
_Avoid_: proc de charm (que é o evento), dano de charm (que é o número).

**Omega**:
Nome que este projeto deu a um perk de dano que o jogo não anota em lugar nenhum do
server log: ele multiplica o dano por um fator fixo quando o alvo está com pouca vida.
O nome é nosso porque a mecânica não tem nome observável — nenhum sufixo, nenhuma
linha, nenhuma incantação a revela. O que a revela é a testemunha de charm.
Omega é **binário**: o hit tem ou não tem o bônus, e a testemunha exibe exatamente dois
níveis. É isso que o separa do Combat Mastery, que responde ao mesmo gatilho — vida
baixa do alvo — mas de forma graduada.
_Avoid_: bônus de execute, low-hp bonus, perk dos 6%.

**Combat Mastery**:
Perk de roda de habilidade, exclusivo de knight, que soma dano conforme a vida
**faltante** do alvo, em passos discretos. Ao contrário do omega, ele é **graduado**:
uma mesma criatura aparece na testemunha de charm em vários níveis, um por passo. É
mecânica declarada e não revertida — o motor reconhece que ela existe na sessão, mas
não decide em que passo um hit estava, porque o log não mostra a vida das criaturas.
_Avoid_: perk de execute do knight, roda de dano.

**Escada**:
A assinatura de um perk graduado na testemunha de charm: três ou mais níveis de dano
da mesma criatura, espaçados por múltiplos inteiros de um mesmo degrau. A escada é o
que distingue um perk graduado de um binário, e reconhecê-la numa sessão significa que
a testemunha inteira daquela sessão carrega um passo desconhecido — logo deixa de
provar qualquer outro perk.
_Avoid_: níveis do charm, degraus (que é a unidade, não a forma).

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
