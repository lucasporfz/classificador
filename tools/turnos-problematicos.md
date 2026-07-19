# Turnos que já deram problema — gabarito (classificação confirmada)

Cada turno abaixo foi alvo de uma regra delicada no `CLAUDE.md`. Para cada um:
o **par de logs**, a **classificação confirmada** (com o porquê), o **resumo
parseado** atual, e — nas seções RAW mais abaixo — **todos os hits do server log
com a linha completa** + **todas as linhas do local chat** da janela do turno.

A classificação parseada de TODOS os 30 turnos da tabela principal confere com o gabarito do `CLAUDE.md`
(os turnos 23-30 são do `barrage`, alvo da regra delicada do **Eixo 2-físico**: AA × Ethereal
Barrage por ordem → interseção de O → razão de leech; os RAW completos deles não estão abaixo —
use `node tools/diag-turn.mjs "logs/barrage Server Log.txt" "logs/barrage local chat.txt" HH:MM:SS`).

| # | Par de logs | Turno | Classificação confirmada | Parse atual (A=arrow/S=spell/R=rune/G=granada) |
|---|-------------|-------|--------------------------|------------------------------------------------|
| 1 | highwin 2 | 08:25:18 | Granada (base holy ≈1028) **+** AA **+** runa, no mesmo bloco — granada explode no g+4 junto do AA+runa do turno novo; só o cluster holy consistente é granada, o AA físico variável fica arrow | A13 S0 R15 G13 |
| 2 | highwin 2 | 08:27:57 | AA variável **+** Divine Caldera (cast :57) **+** explosão da granada do cast :55. O bloco de :59 não herda essa granada | A9 S11 R0 G8 |
| 2b | highwin 2 | 08:27:59 | AA limpo: local chat não tem evidência de spell/granada para esse bloco, e os hits variam | A9 S0 R0 G0 |
| 3 | highwin | 08:47:16 | Granada (base holy ≈980) **+** AA; a runa (12 hits) cai no segundo seguinte | A8 S0 R12 G10 |
| 4 | mk | 05:46:16 | **Runa-only** (great fireball) + AA de prefixo. A explosão real foi em 05:46:15 (holy ≈1000); os hits do g+4 em :16 são nível-AA (≈640) → ficam arrow, **sem granada falsa** | A5 S0 R8 G0 |
| 5 | jaded | 19:59:47 | AA **+** Divine Caldera (exevo mas san, :47) **+** granada (:48) — Caldera e granada separadas por LEVEL de base holy, ambas crit | A9 S12 R0 G9 |
| 6 | jaded | 19:59:49 | AA (espalhado, holy ≈290 = AA da sessão) fica **arrow** **+** Divine Caldera (:50). **Sem granada falsa** (cooldown-shadow rejeitado) | A9 S12 R0 G0 |
| 7 | darklight rp | 09:14:16 | AA (405, 501) **+** Strong Ethereal Spear (exori gran con) no último hit (1067). Fallback de chat single-target: só o último hit vira spell | A2 S1 R0 G0 |
| 8 | Hakka | 21:56:25 | **Partial edge** — hit solitário 504 (explosão GFB cuja linha "Using…runes" está no bloco da sessão anterior). Visível mas **NÃO conta** como Auto ataque | A1 S0 R0 G0 (partialEdge) |
| 9 | bastion | 15:20:27 | AA (517, posição-first) **+** Berserk (exori) nos 8 hits holy ≈900-960. O overkill de 15 dmg **não** pode ser usado na razão de leech p/ derrubar o AA | A1 S8 R0 G0 |
| 10 | bakra (Ichgahal) | 09:20:21 | AA **+** Divine Caldera **+** granada (810 no c+3) | A1 S1 R0 G1 |
| 11 | bakra (Ichgahal) | 09:21:06 | AA (1169) **+** Strong Ethereal Spear exori gran con (1336) **+** granada (940 no c+3) | A1 S1 R0 G1 |
| 12 | bakra (Ichgahal) | 09:23:47 | AA **+** spell **+** granada (917 no c+4) — 917 em :47 não pode ser arrow porque exevo mas san foi lançado em :46 (cooldown 2s) | A1 S1 R0 G1 |
| 13 | bakra (Bakragore) | 09:33:47 | AA (966) **+** Strong Ethereal Spear (1175) **+** granada (885, não 677) | A1 S1 R0 G1 |
| 13b | bakradrone (Ichgahal) | 09:52:47 | AA (1447) **+** Strong Ethereal Spear/exori gran con (1489) **+** explosão de granada (872). O modelo experimental atual erra por favorecer `cast+3` exato sem evidência de dano do mob | A1 S1 R0 G1 |
| 13c | bakradrone (Ichgahal) | 09:51:58 | Boss/unique target com cast `exevo mas san` no mesmo timestamp e dois hits no Ichgahal. A ordem mecânica deve ser AA (971) -> spell (662), não spell -> AA. O hit seguinte em 09:52:00 é outro ciclo de ataque, não segundo AA no mesmo timestamp | A1 S1 R0 G0 |
| 13d | essence (Bakragore) | 00:22:43 | Boss/unique target com AA crítico (2581), spell single-target (1040) e explosão de granada do cast `00:22:41 exevo tempo mas san` (761) no mesmo timestamp. Depois de AA + spell, terceiro hit no mesmo boss não pode virar outro AA | A1 S1 R0 G1 |
| 13e | essence (Bakragore) | 00:25:22 | AA crítico em 00:25:22 (2092) coloca o personagem em cooldown de ataque; os hits em 00:25:23 não podem ser AA. Com `exori gran con` em 00:25:23 e granada castada em 00:25:20, fica granada (965) + spell (843) | A1 S1 R0 G1 |
| 13f | essence (Bakragore) | 00:26:04 | AA em 00:26:04 (914) coloca o personagem em cooldown de ataque; hit em 00:26:05 não pode ser AA. Como há cast `00:26:05 exevo mas san`, 705 é spell | A1 S1 R0 G0 |
| 13g | essence (Bakragore) | 00:32:58 | AA em 00:32:58 (867), `00:32:59 exori gran con` consome o hit 976 como spell, e a granada castada em 00:32:56 fica no hit seguinte compatível (666). Uma única explosão de granada não pode explicar 976 e 666 ao mesmo tempo | A1 S1 R0 G1 |
| 13h | essence (Echo of Ichgahal) | 00:20:35 | Classificação correta AA (705) -> spell (1107), mas a UI não pode mostrar rótulo cru `spell`; precisa carregar `exori gran con` do cast em 00:20:36 | A1 S1 R0 G0 |
| 14 | darklight e vemiath | 22:20:30 | **Runa-only** + AA de prefixo. Explosão real em 22:20:29; hits do g+4 em :30 são nível-AA → arrow, **sem granada falsa** | A7 S0 R8 G0 |
| 15 | darklight e vemiath | 22:22:11 | **NÃO** é grenade_cast_arrow_only falso — é turno normal AA **+** Divine Caldera (marca heurística de granada foi limpa pelo chat) | A3 S5 R0 G0 |
| 16 | darklight e vemiath | 22:41:16 | **NÃO** é partial edge — tem linha de runa "Using" dentro de ±1s → conta como **AA** | A1 S0 R0 G0 |
| 17 | darklight e vemiath | 22:45:34 | Hits ficam **arrow (AA)**; a linha "Using one of N great fireball runes" conta como *execução* do 2º componente p/ uptime, mas o dano não é relabelado como runa | A6 S0 R0 G0 |
| 18 | darklight e vemiath | 23:22:28 | Prefixo AA de leech alto fica **arrow** **+** sufixo Divine Caldera (exevo mas san) | A4 S4 R0 G0 |
| 19 | darklight e vemiath | 23:23:20 | Caldera (887) **+** granada (1123) no **mesmo segundo** → 8 AA + 8 Divine Caldera + 10 granada | A8 S8 R0 G10 |
| 20 | darklight e vemiath | 23:24:39 | Primeiro hit (819 darklight source) é **arrow (AA)**; os seguintes são **Divine Caldera** | A1 S5 R0 G0 |
| 21 | darklight e vemiath | 23:28:34 | **AA 17** (só auto ataque) | A17 S0 R0 G0 |
| 22 | darklight e vemiath | 23:28:36 | Carrega a explosão de granada → AA **+** Divine Caldera **+** granada | A11 S16 R0 G15 |
| 23 | barrage | 18:59:16 | **Turno de Caldera** — o eixo físico PULA (o cast de `exori dir moe` cai noutro segundo). A banda classifica: AA (físico variável, 750-990) **+** Divine Caldera (687/877, holy constante) | A7 S7 R0 G0 |
| 24 | barrage | 18:59:18 | **Barrage, mesmo segundo com crit misto** — a fronteira de seq cai no salto não-crit→crit: AA (8 não-crit, primeiros) **+** Ethereal Barrage (7 crit, depois) | A8 S7 R0 G0 |
| 25 | barrage | 19:00:30 | **Barrage, mesmo segundo, O distinto** — separa pela INTERSEÇÃO de intervalos de O: cyclursus O∈[872,918] (AA) vs O∈[818,864] (Barrage) não se sobrepõem → AA (seq 558-564) **+** Barrage (565-575). Médias quase iguais (Δ~52), mas intervalos disjuntos | A7 S9 R0 G0 |
| 26 | barrage | 19:00:38 | **Barrage, multi-segundo** — fronteira no ts do cast: AA@:38 **+** Ethereal Barrage@:39 | A7 S8 R0 G0 |
| 27 | barrage | 19:01:17 | **Sem granada falsa** — o 400 (cyclursus, AA-crit overkill) NÃO vira granada solta no meio do bloco de AA (o "cluster" que o AA-cooldown achou era a Barrage física). Granada é bloco contíguo, nunca hit solto | A9 S8 R0 G0 |
| 28 | barrage | 19:02:45 | **Sem granada falsa** — bloco de AA-crit no shadow de c+4 (roaming dread 916/939/912 VARIAM por mob) NÃO vira granada; o flip-all é suprimido (`clsSecondLooksLikeAa`: crit do mesmo mob variando = AA) | A8 S5 R0 G0 |
| 29 | barrage | 19:03:32 | **Barrage, mesmo segundo, O distinto** — bloco AA (O alto, seq 1931-1941) **+** bloco Barrage (O baixo, 1942-1948), contíguo, AA primeiro | A9 S7 R0 G0 |
| 30 | barrage | 19:04:40 | **Barrage, mesmo segundo, O SOBREPOSTO (~909)** — O não separa; fallback por razão leech/dano (~0.0955 AA → ~0.120 Barrage), borda em seq 2473: AA 10 (2462-2472) **+** Barrage 9 (2473-2484). leech 0 = HP/mana cheios | A10 S9 R0 G0 |

## Turnos descritos no histórico Unified Comparison

Os turnos abaixo foram extraídos dos arquivos `js/IMPLEMENTACAO_UNIFIED_COMPARISON_V*.md` e complementam a tabela principal acima. Eles registram casos usados nas validações do Unified; quando precisar do RAW, use `node tools/diag-turn.mjs` com o par de logs indicado.

| # | Par de logs | Turno | Classificação/observação descrita | Fonte |
|---|-------------|-------|------------------------------------|-------|
| U1 | bastion | 15:17:13 | A1 S2 | V4 |
| U2 | bastion | 15:17:15 | A1 S5 | V4 |
| U3 | bastion | 15:17:17 | A1 S8 | V4 |
| U4 | bastion | 15:17:21 | A1 S8 | V4 |
| U5 | bastion | 15:17:23 | A1 S8 | V4 |
| U6 | bastion | 15:17:25 | A1 S8 | V4 |
| U7 | bastion | 15:17:27 | A1 S8 | V4 |
| U8 | bastion | 15:17:31 | A1 S6 | V4 |
| U9 | bastion | 15:17:33 | A1 S3; fronteira temporal clara: primeiro hit é AA e o restante é spell alinhada ao cast. | V6/V7 |
| U10 | bastion | 15:17:38 | A1 S0×1; spell virtual de dano zero por charm matando antes do hit principal. | V5/V6/V7/V9/V10/V11/V13/V14/V15 |
| U11 | bastion | 15:19:02 | A1 S6 | V6 |
| U12 | bastion | 15:19:15 | A1 S3 | V7/V9/V10/V11/V13/V14/V15 |
| U13 | bastion | 15:19:17 | A1 S1 | V5/V6 |
| U14 | bastion | 15:20:07 | A1 S1 | V5/V6 |
| U15 | bastion | 15:20:36 | A1 S5 | V7/V9/V10/V11/V13/V14/V15 |
| U16 | bastion | 15:22:49 | A1 S3 | V5/V6 |
| U17 | bastion | 15:23:16 | S4; caso all-spell aceito quando mana-leech absoluto sustenta bloco único. | V5/V6/V7/V9/V10/V11/V13/V14/V15 |
| U18 | bastion | 15:23:36 | A1 S3 | V5/V6 |
| U19 | barrage | 18:59:20 | A6 S9; bloco holy passa por tolerância discreta de original elemental. | V10/V11/V13/V14/V15 |
| U20 | barrage | 18:59:30 | A3 S8; Ethereal Barrage com bônus de +10% Life Leech. | V9/V10/V11/V13/V14/V15 |
| U21 | barrage | 18:59:41 | A9 S7; consenso por bloco preserva o S7 mesmo com canal de mana capado. | V11/V13/V14/V15 |
| U22 | barrage | 18:59:45 | A8 S10 G8; `utevo grav san` e multiplicadores finais explicam o turno. | V15/V17/V18/V19/V20 |
| U23 | barrage | 18:59:47 | A8 S9; Ethereal Barrage fecha com crítico inferido e +10% Life Leech. | V17/V18/V19/V20 |
| U24 | barrage | 18:59:58 | A4 S5 S0×1; hit virtual zero por charm/proc em componente de área. | V12/V13/V14/V15 |
| U25 | barrage | 19:00:45 | A7 S11 G10; passa com leech cap-aware. | V14 |
| U26 | barrage | 19:01:06 | A7 S10; passa com tolerância elemental. | V13/V14/V15 |
| U27 | barrage | 19:01:19 | A9 S12; bloco preservado com leech cap-aware. | V14/V15/V17/V18/V19/V20 |
| U28 | barrage | 19:01:21 | A8 S8; Ethereal Barrage usando +10% Life Leech. | V13/V14/V15 |
| U29 | barrage | 19:02:09 | A7 S11 G9; desempate respeita melhor a fronteira natural de timestamp entre spell e granada. | V16/V17/V18/V19/V20 |
| U30 | barrage | 19:02:22 | A5 S6 | V17/V18 |
| U31 | barrage | 19:02:43 | A7 S7 G6; `utevo grav san` é testado por componente, não aplicado ao turno inteiro. | V18/V19/V20 |
| U32 | barrage | 19:03:00 | A8 S10; tolerância intermediária elemental resolve active prey com arredondamento. | V20 |
| U33 | barrage | 19:04:10 | A1 S2; tolerância adaptativa de leech em bloco pequeno. | V20 |
| U34 | barrage | 19:04:15 | A4 S4; `perfect shot` é removido na reconstrução física determinística. | V19/V20 |
| U35 | uhax 2 | 21:34:13 | A1 R5; `Using one of ... runes` preserva fronteira de runa. | V23/V25/V26 |
| U36 | uhax 2 | 21:34:15 | A1 S9; `exevo ulus tera` fecha após inferência robusta de leech. | V24/V25/V26 |
| U37 | uhax 2 | 21:34:19 | A1 R10; runa confirmada por `Using` e bloco elemental compatível. | V23/V25/V26 |
| U38 | uhax 2 | 21:34:29 | A1 R11; runa confirmada por `Using` e bloco elemental compatível. | V23/V25/V26 |
| U39 | uhax 2 | 21:34:32 | A1 R7; AA antes do `Using` não é absorvido pelo bloco da runa. | V23/V25/V26 |
| U40 | uhax 2 | 21:34:36 | S3 Terra Wave (`exevo tera hur`). | V26/V28 |
| U41 | uhax 2 | 21:34:38 | A1 S7; bloco de `exevo ulus tera` aceito por cluster elemental com ação concreta. | V24/V25/V26 |
| U42 | uhax 2 | 21:35:44 | A1 S8; Terra Burst bonus fecha o bloco de spell concreta. | V26 |
| U43 | uhax 2 | 21:37:09 | S6 Terra Wave (`exevo tera hur`). | V26/V28 |

---

# RAW — hits completos do server log + linhas do local chat, por turno

> Server log filtrado para "seus hits ofensivos" (`… loses N hitpoints due to your …`)
> + execuções (`Using one of N …`); no bastion o leech imediato (`You were healed…` /
> `You gained … mana`) também aparece porque a regra dele é sobre leech.
> Local chat mostrado integral na janela.


==============================================================================
highwin 2 Server Log.txt  +  highwin 2 Local Chat.txt
sessão: única sessão   |   turno alvo: 08:25:18
==============================================================================

--- SERVER LOG (hits + execuções, 08:25:16–08:25:21) ---
08:25:16 A darklight source loses 706 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:16 A walking pillar loses 853 hitpoints due to your attack. (active prey bonus)
08:25:16 A darklight source loses 680 hitpoints due to your attack. 
08:25:16 A darklight striker loses 783 hitpoints due to your attack. (active prey bonus)
08:25:16 A darklight striker loses 2320 hitpoints due to your attack. (active prey bonus, enflame charm, increased damage by Expose Weakness)
08:25:16 A darklight striker loses 842 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:16 A darklight source loses 706 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:16 A darklight striker loses 783 hitpoints due to your attack. (active prey bonus)
08:25:16 A darklight striker loses 842 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:16 A darklight striker loses 842 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:16 A darklight source loses 478 hitpoints due to your attack. 
08:25:16 A darklight striker loses 842 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:16 A walking pillar loses 886 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:16 A darklight matter loses 706 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:16 A darklight striker loses 2247 hitpoints due to your attack. (active prey bonus, enflame charm)
08:25:16 A darklight striker loses 783 hitpoints due to your attack. (active prey bonus)
08:25:16 A darklight matter loses 679 hitpoints due to your attack. 
08:25:16 A darklight striker loses 783 hitpoints due to your attack. (active prey bonus)
08:25:16 Using one of 2727 ultimate spirit potions...
08:25:16 Using one of 2727 ultimate spirit potions...
08:25:17 Using one of 1952 great fireball runes...
08:25:17 Using one of 2726 ultimate spirit potions...
08:25:17 Using one of 2726 ultimate spirit potions...
08:25:17 Using one of 2726 ultimate spirit potions...
08:25:17 Using one of 2726 ultimate spirit potions...
08:25:18 Using one of 2726 ultimate spirit potions...
08:25:18 Using one of 2726 ultimate spirit potions...
08:25:18 Using one of 2726 ultimate spirit potions...
08:25:18 A darklight source loses 1055 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:18 A darklight striker loses 1257 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight source loses 1813 hitpoints due to your attack. (divine wrath charm, increased damage by Expose Weakness)
08:25:18 A darklight source loses 1055 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:18 A darklight striker loses 1257 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight striker loses 1257 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight source loses 1015 hitpoints due to your attack. 
08:25:18 A darklight striker loses 1257 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A walking pillar loses 1324 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight matter loses 1055 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:18 A darklight striker loses 1171 hitpoints due to your attack. (active prey bonus)
08:25:18 A darklight striker loses 1171 hitpoints due to your attack. (active prey bonus)
08:25:18 A darklight striker loses 1171 hitpoints due to your attack. (active prey bonus)
08:25:18 A darklight striker loses 2516 hitpoints due to your attack. (active prey bonus, enflame charm)
08:25:18 A darklight striker loses 1171 hitpoints due to your attack. (active prey bonus)
08:25:18 A darklight source loses 922 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:18 A darklight striker loses 1008 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight source loses 920 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:18 A darklight striker loses 1033 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight striker loses 980 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight source loses 1744 hitpoints due to your attack. (divine wrath charm)
08:25:18 A darklight source loses 876 hitpoints due to your attack. 
08:25:18 A darklight striker loses 1008 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A walking pillar loses 1200 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:18 A darklight matter loses 950 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:18 A darklight striker loses 929 hitpoints due to your attack. (active prey bonus)
08:25:18 A darklight striker loses 937 hitpoints due to your attack. (active prey bonus)
08:25:18 A darklight striker loses 952 hitpoints due to your attack. (active prey bonus)
08:25:18 A darklight striker loses 948 hitpoints due to your attack. (active prey bonus)
08:25:19 Using one of 1952 great fireball runes...
08:25:19 A darklight striker loses 847 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:19 A darklight striker loses 820 hitpoints due to your attack. (active prey bonus)
08:25:19 A darklight striker loses 820 hitpoints due to your attack. (active prey bonus)
08:25:19 A darklight source loses 1813 hitpoints due to your attack. (divine wrath charm, increased damage by Expose Weakness)
08:25:19 A darklight source loses 624 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:19 A darklight striker loses 820 hitpoints due to your attack. (active prey bonus)
08:25:19 A darklight striker loses 847 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:19 A darklight source loses 624 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:19 A darklight source loses 604 hitpoints due to your attack. 
08:25:19 A darklight striker loses 820 hitpoints due to your attack. (active prey bonus)
08:25:19 A darklight matter loses 656 hitpoints due to your attack. 
08:25:19 A darklight striker loses 847 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:19 A walking pillar loses 785 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:19 A darklight matter loses 656 hitpoints due to your attack. 
08:25:19 A darklight striker loses 847 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:19 A walking pillar loses 758 hitpoints due to your attack. (active prey bonus)
08:25:19 Using one of 2725 ultimate spirit potions...
08:25:19 Using one of 2725 ultimate spirit potions...
08:25:19 Using one of 2725 ultimate spirit potions...
08:25:19 Using one of 2725 ultimate spirit potions...
08:25:21 A darklight source loses 1813 hitpoints due to your attack. (divine wrath charm, increased damage by Expose Weakness)
08:25:21 A darklight source loses 596 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:21 A darklight striker loses 591 hitpoints due to your attack. (active prey bonus)
08:25:21 A darklight striker loses 668 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:21 A walking pillar loses 801 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:21 A walking pillar loses 712 hitpoints due to your attack. (active prey bonus)
08:25:21 A darklight source loses 1744 hitpoints due to your attack. (divine wrath charm)
08:25:21 A darklight source loses 600 hitpoints due to your attack. 
08:25:21 A darklight source loses 590 hitpoints due to your attack. 
08:25:21 A darklight striker loses 2516 hitpoints due to your attack. (active prey bonus, enflame charm)
08:25:21 A darklight striker loses 596 hitpoints due to your attack. (active prey bonus)
08:25:21 A darklight striker loses 622 hitpoints due to your attack. (active prey bonus)
08:25:21 A darklight source loses 764 hitpoints due to your attack. 
08:25:21 A darklight striker loses 880 hitpoints due to your attack. (active prey bonus)
08:25:21 A darklight striker loses 880 hitpoints due to your attack. (active prey bonus)
08:25:21 A darklight striker loses 880 hitpoints due to your attack. (active prey bonus)
08:25:21 A darklight source loses 795 hitpoints due to your attack. (increased damage by Expose Weakness)
08:25:21 A darklight striker loses 947 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:21 A darklight source loses 764 hitpoints due to your attack. 
08:25:21 A darklight matter loses 763 hitpoints due to your attack. 
08:25:21 A walking pillar loses 997 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:25:21 A darklight striker loses 880 hitpoints due to your attack. (active prey bonus)
08:25:21 A walking pillar loses 959 hitpoints due to your attack. (active prey bonus)

--- LOCAL CHAT (linhas brutas, 08:25:16–08:25:21) ---
08:25:16 Radizao [2329]: exura med ico
08:25:16 Zapecao [2334]: exura vita
08:25:16 Highwin Egoista [2072]: exura gran san
08:25:16 Highwin Egoista [2072]: exevo mas san
08:25:16 Zapecao [2334]: exevo gran flam hur
08:25:16 Dolerozs [2365]: exura gran mas res
08:25:17 Highwin Egoista [2072]: utevo grav san
08:25:17 Radizao [2329]: exura med ico
08:25:17 Highwin Egoista [2072]: exura gran san
08:25:17 Radizao [2329]: exeta res
08:25:17 Dolerozs [2365]: exura sio "Radizao"
08:25:18 Radizao [2329]: exori gran
08:25:18 Zapecao [2334]: exura vita
08:25:18 Highwin Egoista [2072]: exura gran san
08:25:18 Radizao [2329]: exura med ico
08:25:18 Dolerozs [2365]: exura gran mas res
08:25:19 Dolerozs [2365]: utamo vita
08:25:19 Zapecao [2334]: exura vita
08:25:19 Radizao [2329]: exeta res
08:25:19 Dolerozs [2365]: exura sio "Radizao"
08:25:19 Radizao [2329]: exura med ico
08:25:20 Highwin Egoista [2072]: exura gran san
08:25:20 Radizao [2329]: exori amp kor
08:25:20 Zapecao [2334]: exura vita
08:25:21 Radizao [2329]: exura med ico
08:25:21 Dolerozs [2365]: exura gran mas res
08:25:21 Highwin Egoista [2072]: exura gran san
08:25:21 Highwin Egoista [2072]: exevo mas san
08:25:21 Zapecao [2334]: exura max vita
08:25:21 Radizao [2329]: exeta amp res

--- CLASSIFICAÇÃO PARSEADA (turno 08:25:18) ---
comp: arrow=13 spell=0 rune=15 grenade=13  | granada [exevo tempo mas san]
   0  08:25:18.707  darklight source       dmg= 1055 base= 1055  grenade 
   1  08:25:18.708  darklight striker      dmg= 1257 base= 1006  grenade 
   2  08:25:18.710  darklight source       dmg= 1055 base= 1055  grenade 
   3  08:25:18.711  darklight striker      dmg= 1257 base= 1006  grenade 
   4  08:25:18.712  darklight striker      dmg= 1257 base= 1006  grenade 
   5  08:25:18.713  darklight source       dmg= 1015 base= 1015  grenade 
   6  08:25:18.714  darklight striker      dmg= 1257 base= 1006  grenade 
   7  08:25:18.715  walking pillar         dmg= 1324 base= 1059  grenade 
   8  08:25:18.716  darklight matter       dmg= 1055 base= 1055  grenade 
   9  08:25:18.717  darklight striker      dmg= 1171 base=  937  grenade 
  10  08:25:18.718  darklight striker      dmg= 1171 base=  937  grenade 
  11  08:25:18.719  darklight striker      dmg= 1171 base=  937  grenade 
  12  08:25:18.721  darklight striker      dmg= 1171 base=  937  grenade 
  13  08:25:18.722  darklight source       dmg=  922 base=  922  arrow   
  14  08:25:18.723  darklight striker      dmg= 1008 base=  806  arrow   
  15  08:25:18.724  darklight source       dmg=  920 base=  920  arrow   
  16  08:25:18.725  darklight striker      dmg= 1033 base=  826  arrow   
  17  08:25:18.726  darklight striker      dmg=  980 base=  784  arrow   
  18  08:25:18.728  darklight source       dmg=  876 base=  876  arrow   
  19  08:25:18.729  darklight striker      dmg= 1008 base=  806  arrow   
  20  08:25:18.730  walking pillar         dmg= 1200 base=  960  arrow   
  21  08:25:18.731  darklight matter       dmg=  950 base=  950  arrow   
  22  08:25:18.732  darklight striker      dmg=  929 base=  743  arrow   
  23  08:25:18.733  darklight striker      dmg=  937 base=  750  arrow   
  24  08:25:18.734  darklight striker      dmg=  952 base=  762  arrow   
  25  08:25:18.735  darklight striker      dmg=  948 base=  758  arrow   
  26  08:25:19.737  darklight striker      dmg=  847 base=  678  rune    
  27  08:25:19.738  darklight striker      dmg=  820 base=  656  rune    
  28  08:25:19.739  darklight striker      dmg=  820 base=  656  rune    
  29  08:25:19.741  darklight source       dmg=  624 base=  624  rune    
  30  08:25:19.742  darklight striker      dmg=  820 base=  656  rune    
  31  08:25:19.743  darklight striker      dmg=  847 base=  678  rune    
  32  08:25:19.744  darklight source       dmg=  624 base=  624  rune    
  33  08:25:19.745  darklight source       dmg=  604 base=  604  rune    
  34  08:25:19.746  darklight striker      dmg=  820 base=  656  rune    
  35  08:25:19.747  darklight matter       dmg=  656 base=  656  rune    
  36  08:25:19.748  darklight striker      dmg=  847 base=  678  rune    
  37  08:25:19.749  walking pillar         dmg=  785 base=  628  rune    
  38  08:25:19.750  darklight matter       dmg=  656 base=  656  rune    
  39  08:25:19.751  darklight striker      dmg=  847 base=  678  rune    
  40  08:25:19.752  walking pillar         dmg=  758 base=  606  rune     (overkill)

==============================================================================
highwin 2 Server Log.txt  +  highwin 2 Local Chat.txt
sessão: única sessão   |   turno alvo: 08:27:59
==============================================================================

--- SERVER LOG (hits + execuções, 08:27:57–08:28:01) ---
08:27:57 A darklight matter loses 797 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 777 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A walking pillar loses 991 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:27:57 A darklight matter loses 779 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 795 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 785 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 726 hitpoints due to your attack. 
08:27:57 A darklight source loses 716 hitpoints due to your attack. 
08:27:57 A darklight matter loses 761 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 1893 hitpoints due to your attack. (wound charm, increased damage by Expose Weakness)
08:27:57 A darklight matter loses 857 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 857 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 857 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A walking pillar loses 1078 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:27:57 A darklight matter loses 1893 hitpoints due to your attack. (wound charm, increased damage by Expose Weakness)
08:27:57 A darklight matter loses 857 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 857 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 825 hitpoints due to your attack. 
08:27:57 A darklight source loses 1744 hitpoints due to your attack. (divine wrath charm)
08:27:57 A darklight source loses 826 hitpoints due to your attack. 
08:27:57 A darklight matter loses 857 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:57 A darklight matter loses 825 hitpoints due to your attack. 
08:27:57 A darklight striker loses 953 hitpoints due to your attack. (active prey bonus)
08:27:57 Using one of 2660 ultimate spirit potions...
08:27:57 Using one of 2660 ultimate spirit potions...
08:27:58 Using one of 2660 ultimate spirit potions...
08:27:58 Using one of 2660 ultimate spirit potions...
08:27:58 A walking pillar loses 2492 hitpoints due to your critical attack. (active prey bonus, increased damage by Expose Weakness)
08:27:58 A darklight matter loses 1982 hitpoints due to your critical attack. (increased damage by Expose Weakness)
08:27:58 A darklight matter loses 1982 hitpoints due to your critical attack. (increased damage by Expose Weakness)
08:27:58 A darklight matter loses 1893 hitpoints due to your attack. (wound charm, increased damage by Expose Weakness)
08:27:58 A darklight matter loses 1982 hitpoints due to your critical attack. (increased damage by Expose Weakness)
08:27:58 A darklight matter loses 1982 hitpoints due to your critical attack. (increased damage by Expose Weakness)
08:27:58 A darklight matter loses 1982 hitpoints due to your critical attack. (increased damage by Expose Weakness)
08:27:58 A darklight source loses 1909 hitpoints due to your critical attack. 
08:27:58 A darklight matter loses 1982 hitpoints due to your critical attack. (increased damage by Expose Weakness)
08:27:59 A darklight matter loses 921 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:59 A darklight matter loses 932 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:59 A walking pillar loses 254 hitpoints due to your attack. (active prey bonus, poison charm, increased damage by Expose Weakness)
08:27:59 A darklight matter loses 930 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:59 A darklight matter loses 916 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:59 A darklight matter loses 937 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:59 A darklight matter loses 896 hitpoints due to your attack. 
08:27:59 A darklight source loses 862 hitpoints due to your attack. 
08:27:59 A darklight matter loses 944 hitpoints due to your attack. (increased damage by Expose Weakness)
08:27:59 A darklight matter loses 900 hitpoints due to your attack. 

--- LOCAL CHAT (linhas brutas, 08:27:57–08:28:01) ---
08:27:57 Radizao [2329]: exura med ico
08:27:57 Dolerozs [2365]: exura gran mas res
08:27:57 Highwin Egoista [2072]: exura gran san
08:27:57 Zapecao [2334]: exura max vita
08:27:57 Radizao [2329]: exeta res
08:27:57 Radizao [2329]: exori gran
08:27:57 Highwin Egoista [2072]: exevo mas san
08:27:58 Radizao [2329]: exura med ico
08:27:58 Dolerozs [2365]: exevo tera hur
08:27:58 Highwin Egoista [2072]: exura gran san
08:27:58 Dolerozs [2365]: exura sio "Radizao"
08:27:58 Zapecao [2334]: exevo gran flam hur
08:27:59 Highwin Egoista [2072]: exana amp res
08:27:59 Radizao [2329]: exura med ico
08:27:59 Dolerozs [2365]: exura gran mas res
08:27:59 Highwin Egoista [2072]: exura gran san

--- CLASSIFICAÇÃO PARSEADA (turno 08:27:59) ---
comp: arrow=0 spell=0 rune=0 grenade=9  | granada [exevo tempo mas san]
   0  08:27:59.2031  darklight matter       dmg=  921 base=  921  grenade 
   1  08:27:59.2032  darklight matter       dmg=  932 base=  932  grenade  (overkill)
   2  08:27:59.2035  darklight matter       dmg=  930 base=  930  grenade 
   3  08:27:59.2036  darklight matter       dmg=  916 base=  916  grenade 
   4  08:27:59.2037  darklight matter       dmg=  937 base=  937  grenade 
   5  08:27:59.2038  darklight matter       dmg=  896 base=  896  grenade 
   6  08:27:59.2039  darklight source       dmg=  862 base=  862  grenade 
   7  08:27:59.2040  darklight matter       dmg=  944 base=  944  grenade 
   8  08:27:59.2041  darklight matter       dmg=  900 base=  900  grenade 

==============================================================================
highwin Server Log.txt  +  highwin Local Chat.txt
sessão: única sessão   |   turno alvo: 08:47:16
==============================================================================

--- SERVER LOG (hits + execuções, 08:47:14–08:47:19) ---
08:47:14 A darklight source loses 725 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:14 A walking pillar loses 728 hitpoints due to your attack. 
08:47:14 A walking pillar loses 741 hitpoints due to your attack. 
08:47:14 A darklight matter loses 881 hitpoints due to your attack. (active prey bonus)
08:47:14 A darklight striker loses 2598 hitpoints due to your attack. (active prey bonus, enflame charm, increased damage by Expose Weakness)
08:47:14 A darklight striker loses 798 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:14 A walking pillar loses 724 hitpoints due to your attack. 
08:47:14 A darklight source loses 764 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:14 A walking pillar loses 689 hitpoints due to your attack. 
08:47:14 A darklight striker loses 768 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:14 A darklight source loses 689 hitpoints due to your attack. 
08:47:14 A darklight source loses 1710 hitpoints due to your attack. (divine wrath charm)
08:47:14 A darklight source loses 745 hitpoints due to your attack. 
08:47:14 A walking pillar loses 843 hitpoints due to your attack. 
08:47:14 A darklight matter loses 1048 hitpoints due to your attack. (active prey bonus)
08:47:14 A darklight source loses 873 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:14 A darklight source loses 1778 hitpoints due to your attack. (divine wrath charm, increased damage by Expose Weakness)
08:47:14 A darklight source loses 873 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:14 A walking pillar loses 843 hitpoints due to your attack. 
08:47:14 A walking pillar loses 843 hitpoints due to your attack. 
08:47:14 A darklight matter loses 190 hitpoints due to your attack. (active prey bonus)
08:47:14 A darklight striker loses 1689 hitpoints due to your attack. (active prey bonus, enflame charm, increased damage by Expose Weakness)
08:47:14 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
08:47:14 A walking pillar loses 843 hitpoints due to your attack. 
08:47:14 A walking pillar loses 843 hitpoints due to your attack. 
08:47:14 A darklight striker loses 2516 hitpoints due to your attack. (active prey bonus, enflame charm)
08:47:14 A darklight striker loses 946 hitpoints due to your attack. (active prey bonus)
08:47:14 A darklight striker loses 1030 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:14 A darklight source loses 840 hitpoints due to your attack. 
08:47:14 A darklight source loses 840 hitpoints due to your attack. 
08:47:14 Using one of 3043 ultimate spirit potions...
08:47:14 Using one of 3043 ultimate spirit potions...
08:47:15 Using one of 3043 ultimate spirit potions...
08:47:15 Using one of 3043 ultimate spirit potions...
08:47:15 Using one of 3042 ultimate spirit potions...
08:47:15 Using one of 3042 ultimate spirit potions...
08:47:15 Using one of 3042 ultimate spirit potions...
08:47:15 Using one of 3042 ultimate spirit potions...
08:47:15 Using one of 3042 ultimate spirit potions...
08:47:16 A darklight source loses 1778 hitpoints due to your attack. (divine wrath charm, increased damage by Expose Weakness)
08:47:16 A darklight source loses 596 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A walking pillar loses 992 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A walking pillar loses 992 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A darklight matter loses 1234 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:16 A walking pillar loses 734 hitpoints due to your attack. (poison charm)
08:47:16 A walking pillar loses 992 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A darklight source loses 987 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A walking pillar loses 992 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A darklight striker loses 7 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:16 A darklight source loses 1778 hitpoints due to your attack. (divine wrath charm, increased damage by Expose Weakness)
08:47:16 A darklight source loses 987 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A darklight source loses 987 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A walking pillar loses 720 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A darklight source loses 716 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A darklight striker loses 663 hitpoints due to your attack. (active prey bonus)
08:47:16 A walking pillar loses 677 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:16 A darklight matter loses 2326 hitpoints due to your attack. (active prey bonus, wound charm, increased damage by Expose Weakness)
08:47:16 A darklight matter loses 898 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:16 A darklight striker loses 646 hitpoints due to your attack. (active prey bonus)
08:47:16 A darklight matter loses 2245 hitpoints due to your attack. (active prey bonus, wound charm)
08:47:16 A darklight matter loses 836 hitpoints due to your attack. (active prey bonus)
08:47:16 A walking pillar loses 720 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 Using one of 1475 great fireball runes...
08:47:17 A walking pillar loses 686 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 A walking pillar loses 686 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 A darklight matter loses 925 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:17 A walking pillar loses 686 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 A darklight source loses 1778 hitpoints due to your attack. (divine wrath charm, increased damage by Expose Weakness)
08:47:17 A darklight source loses 683 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 A walking pillar loses 686 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 A darklight source loses 1710 hitpoints due to your attack. (divine wrath charm)
08:47:17 A darklight source loses 660 hitpoints due to your attack. 
08:47:17 A darklight source loses 683 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 A darklight source loses 683 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:17 A darklight striker loses 898 hitpoints due to your attack. (active prey bonus)
08:47:17 A darklight matter loses 897 hitpoints due to your attack. (active prey bonus)
08:47:17 A walking pillar loses 686 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:18 Using one of 3042 ultimate spirit potions...
08:47:18 Using one of 3042 ultimate spirit potions...
08:47:19 A walking pillar loses 2198 hitpoints due to your attack. (poison charm, increased damage by Expose Weakness)
08:47:19 A walking pillar loses 825 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A darklight source loses 135 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A darklight source loses 845 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A darklight matter loses 1081 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:19 A walking pillar loses 827 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A walking pillar loses 824 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A darklight source loses 1527 hitpoints due to your attack. (divine wrath charm)
08:47:19 A darklight source loses 831 hitpoints due to your attack. 
08:47:19 A walking pillar loses 800 hitpoints due to your attack. 
08:47:19 A walking pillar loses 835 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A darklight matter loses 950 hitpoints due to your attack. (active prey bonus, increased damage by Expose Weakness)
08:47:19 A walking pillar loses 764 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A walking pillar loses 764 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A darklight source loses 760 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A walking pillar loses 2124 hitpoints due to your attack. (poison charm)
08:47:19 A walking pillar loses 735 hitpoints due to your attack. 
08:47:19 A darklight striker loses 822 hitpoints due to your attack. (active prey bonus)
08:47:19 A walking pillar loses 764 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A walking pillar loses 764 hitpoints due to your attack. (increased damage by Expose Weakness)
08:47:19 A darklight source loses 731 hitpoints due to your attack. 
08:47:19 A walking pillar loses 735 hitpoints due to your attack. 
08:47:19 Using one of 3041 ultimate spirit potions...
08:47:19 Using one of 3041 ultimate spirit potions...

--- LOCAL CHAT (linhas brutas, 08:47:14–08:47:19) ---
08:47:14 Radizao [2324]: exura med ico
08:47:14 Zapecao [2329]: exura vita
08:47:14 Highwin Egoista [2065]: exura gran san
08:47:14 Dolerozs [2359]: exura gran mas res
08:47:14 Highwin Egoista [2065]: exevo mas san
08:47:15 Zapecao [2329]: exura vita
08:47:15 Radizao [2324]: exura med ico
08:47:15 Highwin Egoista [2065]: exura gran san
08:47:15 Radizao [2324]: exeta res
08:47:15 Radizao [2324]: exori
08:47:15 Dolerozs [2359]: exura sio "Radizao"
08:47:15 Zapecao [2329]: exori moe
08:47:16 Zapecao [2329]: exura max vita
08:47:16 Radizao [2324]: exura med ico
08:47:16 Dolerozs [2359]: exura gran mas res
08:47:17 Radizao [2324]: exura gran ico
08:47:17 Radizao [2324]: exori amp kor
08:47:17 Dolerozs [2359]: exura sio "Radizao"
08:47:18 Highwin Egoista [2065]: exura gran san
08:47:18 Radizao [2324]: exura med ico
08:47:18 Dolerozs [2359]: exana vita
08:47:19 Dolerozs [2359]: exura gran mas res
08:47:19 Radizao [2324]: exeta res
08:47:19 Highwin Egoista [2065]: exevo mas san
08:47:19 Radizao [2324]: exura med ico
08:47:19 Highwin Egoista [2065]: exura gran san

--- CLASSIFICAÇÃO PARSEADA (turno 08:47:16) ---
comp: arrow=8 spell=0 rune=12 grenade=10  | granada [exevo tempo mas san]
   0  08:47:16.120  darklight source       dmg=  596 base=  596  grenade  (overkill)
   1  08:47:16.122  walking pillar         dmg=  992 base=  992  grenade 
   2  08:47:16.123  walking pillar         dmg=  992 base=  992  grenade 
   3  08:47:16.124  darklight matter       dmg= 1234 base=  987  grenade  (overkill)
   4  08:47:16.127  walking pillar         dmg=  992 base=  992  grenade 
   5  08:47:16.128  darklight source       dmg=  987 base=  987  grenade 
   6  08:47:16.129  walking pillar         dmg=  992 base=  992  grenade 
   7  08:47:16.130  darklight striker      dmg=    7 base=    6  grenade  (overkill)
   8  08:47:16.133  darklight source       dmg=  987 base=  987  grenade 
   9  08:47:16.134  darklight source       dmg=  987 base=  987  grenade 
  10  08:47:16.135  walking pillar         dmg=  720 base=  720  arrow   
  11  08:47:16.136  darklight source       dmg=  716 base=  716  arrow   
  12  08:47:16.137  darklight striker      dmg=  663 base=  530  arrow   
  13  08:47:16.138  walking pillar         dmg=  677 base=  677  arrow   
  14  08:47:16.140  darklight matter       dmg=  898 base=  718  arrow   
  15  08:47:16.141  darklight striker      dmg=  646 base=  517  arrow   
  16  08:47:16.143  darklight matter       dmg=  836 base=  669  arrow   
  17  08:47:16.144  walking pillar         dmg=  720 base=  720  arrow   
  18  08:47:17.146  walking pillar         dmg=  686 base=  686  rune    
  19  08:47:17.147  walking pillar         dmg=  686 base=  686  rune    
  20  08:47:17.148  darklight matter       dmg=  925 base=  740  rune    
  21  08:47:17.149  walking pillar         dmg=  686 base=  686  rune    
  22  08:47:17.151  darklight source       dmg=  683 base=  683  rune    
  23  08:47:17.152  walking pillar         dmg=  686 base=  686  rune    
  24  08:47:17.154  darklight source       dmg=  660 base=  660  rune    
  25  08:47:17.155  darklight source       dmg=  683 base=  683  rune    
  26  08:47:17.156  darklight source       dmg=  683 base=  683  rune    
  27  08:47:17.157  darklight striker      dmg=  898 base=  718  rune    
  28  08:47:17.158  darklight matter       dmg=  897 base=  718  rune    
  29  08:47:17.159  walking pillar         dmg=  686 base=  686  rune     (overkill)

==============================================================================
mk server log.txt  +  mk localchat.txt
sessão: 05:41:59–05:47:55   |   turno alvo: 05:46:16
==============================================================================

--- SERVER LOG (hits + execuções, 05:46:14–05:46:19) ---
05:46:14 A darklight striker loses 2247 hitpoints due to your attack. (active prey bonus, enflame charm due to active charm upgrade)
05:46:14 A darklight striker loses 648 hitpoints due to your attack. (active prey bonus)
05:46:14 A walking pillar loses 2124 hitpoints due to your attack. (poison charm due to active charm upgrade)
05:46:14 A walking pillar loses 622 hitpoints due to your attack. 
05:46:14 A walking pillar loses 2124 hitpoints due to your attack. (poison charm)
05:46:14 A walking pillar loses 613 hitpoints due to your attack. 
05:46:14 A darklight striker loses 667 hitpoints due to your attack. (active prey bonus)
05:46:14 A darklight matter loses 630 hitpoints due to your attack. 
05:46:14 A walking pillar loses 643 hitpoints due to your attack. 
05:46:14 A darklight matter loses 627 hitpoints due to your attack. 
05:46:14 A walking pillar loses 664 hitpoints due to your attack. 
05:46:14 A darklight matter loses 634 hitpoints due to your attack. 
05:46:14 A walking pillar loses 678 hitpoints due to your attack. 
05:46:14 A darklight matter loses 675 hitpoints due to your attack. 
05:46:14 A darklight striker loses 2247 hitpoints due to your attack. (active prey bonus, enflame charm)
05:46:14 A darklight striker loses 760 hitpoints due to your attack. (active prey bonus)
05:46:14 A darklight matter loses 1604 hitpoints due to your attack. (wound charm due to active charm upgrade)
05:46:14 A darklight matter loses 675 hitpoints due to your attack. 
05:46:14 A walking pillar loses 678 hitpoints due to your attack. 
05:46:14 A walking pillar loses 678 hitpoints due to your attack. 
05:46:14 A walking pillar loses 678 hitpoints due to your attack. 
05:46:14 A darklight striker loses 760 hitpoints due to your attack. (active prey bonus)
05:46:14 A darklight matter loses 675 hitpoints due to your attack. 
05:46:14 A darklight matter loses 675 hitpoints due to your attack. 
05:46:15 A darklight striker loses 2247 hitpoints due to your attack. (active prey bonus, enflame charm)
05:46:15 A darklight striker loses 1121 hitpoints due to your attack. (active prey bonus)
05:46:15 A walking pillar loses 1000 hitpoints due to your attack. 
05:46:15 A walking pillar loses 1000 hitpoints due to your attack. 
05:46:15 A darklight source loses 996 hitpoints due to your attack. 
05:46:15 A darklight striker loses 1121 hitpoints due to your attack. (active prey bonus)
05:46:15 A darklight matter loses 1604 hitpoints due to your attack. (wound charm due to active charm upgrade)
05:46:15 A darklight matter loses 995 hitpoints due to your attack. 
05:46:15 A walking pillar loses 1000 hitpoints due to your attack. 
05:46:15 A darklight matter loses 995 hitpoints due to your attack. 
05:46:15 A walking pillar loses 1000 hitpoints due to your attack. 
05:46:15 A darklight matter loses 995 hitpoints due to your attack. 
05:46:15 Using one of 5464 ultimate spirit potions...
05:46:15 Using one of 5463 ultimate spirit potions...
05:46:16 A walking pillar loses 620 hitpoints due to your attack. 
05:46:16 A walking pillar loses 639 hitpoints due to your attack. 
05:46:16 A darklight matter loses 634 hitpoints due to your attack. 
05:46:16 A darklight matter loses 1604 hitpoints due to your attack. (wound charm)
05:46:16 A darklight matter loses 643 hitpoints due to your attack. 
05:46:16 A walking pillar loses 611 hitpoints due to your attack. 
05:46:17 Using one of 2740 great fireball runes...
05:46:17 A darklight matter loses 1022 hitpoints due to your critical attack. 
05:46:17 A walking pillar loses 945 hitpoints due to your critical attack. 
05:46:17 A darklight matter loses 1022 hitpoints due to your critical attack. 
05:46:17 A darklight striker loses 1280 hitpoints due to your critical attack. (active prey bonus)
05:46:17 A walking pillar loses 945 hitpoints due to your critical attack. 
05:46:17 A walking pillar loses 945 hitpoints due to your critical attack. 
05:46:17 A walking pillar loses 945 hitpoints due to your critical attack. 
05:46:17 A darklight matter loses 1022 hitpoints due to your critical attack. 
05:46:17 Using one of 5463 ultimate spirit potions...
05:46:17 Using one of 5463 ultimate spirit potions...
05:46:18 Using one of 5463 ultimate spirit potions...
05:46:18 Using one of 5462 ultimate spirit potions...
05:46:19 A walking pillar loses 654 hitpoints due to your attack. 
05:46:19 A darklight striker loses 697 hitpoints due to your attack. (active prey bonus)
05:46:19 A walking pillar loses 661 hitpoints due to your attack. 
05:46:19 A darklight matter loses 713 hitpoints due to your attack. 
05:46:19 A darklight matter loses 675 hitpoints due to your attack. 
05:46:19 A darklight source loses 706 hitpoints due to your attack. 
05:46:19 A walking pillar loses 663 hitpoints due to your attack. 
05:46:19 A darklight matter loses 683 hitpoints due to your attack. 
05:46:19 A darklight striker loses 690 hitpoints due to your attack. (active prey bonus)
05:46:19 A walking pillar loses 682 hitpoints due to your attack. 
05:46:19 A darklight matter loses 678 hitpoints due to your attack. 
05:46:19 A darklight matter loses 1117 hitpoints due to your attack. (wound charm)
05:46:19 A walking pillar loses 2124 hitpoints due to your attack. (poison charm)
05:46:19 A walking pillar loses 682 hitpoints due to your attack. 
05:46:19 A walking pillar loses 682 hitpoints due to your attack. 
05:46:19 A darklight striker loses 765 hitpoints due to your attack. (active prey bonus)
05:46:19 A darklight source loses 1527 hitpoints due to your attack. (curse charm)
05:46:19 A darklight source loses 679 hitpoints due to your attack. 
05:46:19 A darklight striker loses 1529 hitpoints due to your attack. (active prey bonus, enflame charm due to active charm upgrade)
05:46:19 A darklight matter loses 678 hitpoints due to your attack. 
05:46:19 A walking pillar loses 682 hitpoints due to your attack. 
05:46:19 Using one of 5462 ultimate spirit potions...
05:46:19 Using one of 5461 ultimate spirit potions...

--- LOCAL CHAT (linhas brutas, 05:46:14–05:46:19) ---
05:46:14 El Agonysta [1740]: exura max vita
05:46:14 Monarkito [1927]: exura gran san
05:46:14 Bhaerion [1984]: exura sio "Vicyous"
05:46:14 Bhaerion [1984]: exevo tera hur
05:46:14 Vicyous [1746]: exeta amp res
05:46:14 Vicyous [1746]: exura med ico
05:46:14 Monarkito [1927]: exevo mas san
05:46:15 Monarkito [1927]: exura gran san
05:46:15 El Agonysta [1740]: exura vita
05:46:15 Bhaerion [1984]: exura gran mas res
05:46:15 Vicyous [1746]: exori mas
05:46:15 Vicyous [1746]: exura med ico
05:46:16 El Agonysta [1740]: exevo gran flam hur
05:46:16 Bhaerion [1984]: exura sio "Vicyous"
05:46:16 Monarkito [1927]: exura gran san
05:46:16 Vicyous [1746]: exeta amp res
05:46:16 El Agonysta [1740]: exura vita
05:46:16 Vicyous [1746]: exura med ico
05:46:17 Bhaerion [1984]: exura gran mas res
05:46:17 Vicyous [1746]: exori gran
05:46:17 Monarkito [1927]: exura gran san
05:46:17 Vicyous [1746]: exura med ico
05:46:18 Bhaerion [1984]: exura sio "Vicyous"
05:46:18 Monarkito [1927]: exura gran san
05:46:18 Vicyous [1746]: exura med ico
05:46:19 Monarkito [1927]: exevo mas san
05:46:19 Monarkito [1927]: exura gran san
05:46:19 Bhaerion [1984]: exura gran mas res
05:46:19 Vicyous [1746]: exura med ico

--- CLASSIFICAÇÃO PARSEADA (turno 05:46:16) ---
comp: arrow=5 spell=0 rune=8 grenade=0  | runa [great fireball]
   0  05:46:16.2206  walking pillar         dmg=  620 base=  620  arrow   
   1  05:46:16.2207  walking pillar         dmg=  639 base=  639  arrow   
   2  05:46:16.2208  darklight matter       dmg=  634 base=  634  arrow   
   3  05:46:16.2210  darklight matter       dmg=  643 base=  643  arrow   
   4  05:46:16.2211  walking pillar         dmg=  611 base=  611  arrow   
   5  05:46:17.2213  darklight matter       dmg= 1022 base=  568  rune     (crit)
   6  05:46:17.2214  walking pillar         dmg=  945 base=  525  rune     (crit)
   7  05:46:17.2215  darklight matter       dmg= 1022 base=  568  rune     (crit)
   8  05:46:17.2216  darklight striker      dmg= 1280 base=  569  rune     (crit)
   9  05:46:17.2217  walking pillar         dmg=  945 base=  525  rune     (crit)
  10  05:46:17.2218  walking pillar         dmg=  945 base=  525  rune     (crit)
  11  05:46:17.2219  walking pillar         dmg=  945 base=  525  rune     (crit)
  12  05:46:17.2220  darklight matter       dmg= 1022 base=  568  rune     (crit)

==============================================================================
jaded Server Log.txt  +  jaded Local Chat.txt
sessão: 19:59:25–20:07:41   |   turno alvo: 19:59:47
==============================================================================

--- SERVER LOG (hits + execuções, 19:59:45–19:59:50) ---
19:59:45 A mycobiontic beetle loses 482 hitpoints due to your attack. (perfect shot, increased damage by Expose Weakness)
19:59:45 An oozing corpus loses 430 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:45 A sopping corpus loses 315 hitpoints due to your attack. 
19:59:45 An oozing corpus loses 414 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:45 A bloated man-maggot loses 352 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:45 An oozing corpus loses 436 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:45 An oozing corpus loses 347 hitpoints due to your attack. 
19:59:45 An oozing corpus loses 383 hitpoints due to your attack. 
19:59:45 A bloated man-maggot loses 276 hitpoints due to your attack. 
19:59:46 Using one of 3173 ultimate spirit potions...
19:59:47 Using one of 3172 ultimate spirit potions...
19:59:47 A mycobiontic beetle loses 379 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 356 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 261 hitpoints due to your attack. 
19:59:47 An oozing corpus loses 329 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 A bloated man-maggot loses 245 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 243 hitpoints due to your attack. 
19:59:47 An oozing corpus loses 341 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 292 hitpoints due to your attack. 
19:59:47 An oozing corpus loses 292 hitpoints due to your attack. 
19:59:47 A sopping corpus loses 1286 hitpoints due to your critical attack. 
19:59:47 A mycobiontic beetle loses 1341 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 1397 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 1286 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1349 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1397 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A mycobiontic beetle loses 1341 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A bloated man-maggot loses 1338 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 1397 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 1286 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1349 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1349 hitpoints due to your critical attack. 
19:59:48 Using one of 3171 ultimate spirit potions...
19:59:48 A mycobiontic beetle loses 1502 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 An oozing corpus loses 1566 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 A sopping corpus loses 1442 hitpoints due to your critical attack. 
19:59:48 A sopping corpus loses 1442 hitpoints due to your critical attack. 
19:59:48 A bloated man-maggot loses 1499 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 A mycobiontic beetle loses 1447 hitpoints due to your critical attack. 
19:59:48 An oozing corpus loses 1566 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 An oozing corpus loses 1511 hitpoints due to your critical attack. 
19:59:48 An oozing corpus loses 1511 hitpoints due to your critical attack. 
19:59:49 Using one of 3170 ultimate spirit potions...
19:59:49 A mycobiontic beetle loses 361 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 An oozing corpus loses 305 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 A sopping corpus loses 247 hitpoints due to your attack. 
19:59:49 An oozing corpus loses 308 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 A bloated man-maggot loses 257 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 A sopping corpus loses 212 hitpoints due to your attack. 
19:59:49 An oozing corpus loses 277 hitpoints due to your attack. 
19:59:49 A sopping corpus loses 215 hitpoints due to your attack. 
19:59:49 An oozing corpus loses 272 hitpoints due to your attack. 
19:59:49 A sopping corpus loses 208 hitpoints due to your attack. 
19:59:50 An oozing corpus loses 738 hitpoints due to your attack. 
19:59:50 A mycobiontic beetle loses 733 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 An oozing corpus loses 765 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 A mycobiontic beetle loses 707 hitpoints due to your attack. 
19:59:50 A bloated man-maggot loses 732 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A mycobiontic beetle loses 733 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 An oozing corpus loses 738 hitpoints due to your attack. 
19:59:50 Using one of 3169 ultimate spirit potions...

--- LOCAL CHAT (linhas brutas, 19:59:45–19:59:50) ---
19:59:45 Womolu [1905]: exeta res
19:59:45 Burkzin [1762]: exura sio "Royal'Drone"
19:59:45 Cybres Jack [1737]: exura vita
19:59:45 Womolu [1905]: exori mas
19:59:45 Royal'Drone [1701]: exevo tempo mas san
19:59:45 Cybres Jack [1737]: exevo vis hur
19:59:45 Womolu [1905]: exura med ico
19:59:45 Royal'Drone [1701]: exura gran san
19:59:46 Luszckyn [1516]: exura vita
19:59:46 Luszckyn [1516]: exevo vis hur
19:59:46 Cybres Jack [1737]: exura max vita
19:59:46 Burkzin [1762]: exura gran mas res
19:59:46 Womolu [1905]: exura med ico
19:59:46 Royal'Drone [1701]: exura gran san
19:59:47 Burkzin [1762]: utamo vita
19:59:47 Cybres Jack [1737]: exura vita
19:59:47 Womolu [1905]: exori gran
19:59:47 Luszckyn [1516]: utamo vita
19:59:47 Womolu [1905]: exura med ico
19:59:47 Royal'Drone [1701]: exevo mas san
19:59:47 Burkzin [1762]: exura sio "Womolu"
19:59:47 Cybres Jack [1737]: exevo gran mas vis
19:59:48 Royal'Drone [1701]: exura gran san
19:59:48 Burkzin [1762]: exevo ulus frigo
19:59:48 Luszckyn [1516]: exevo vis lux
19:59:48 Womolu [1905]: exura med ico
19:59:49 Royal'Drone [1701]: exura gran san
19:59:49 Luszckyn [1516]: exura vita
19:59:49 Burkzin [1762]: exura gran mas res
19:59:49 Womolu [1905]: exura med ico
19:59:50 Royal'Drone [1701]: exevo mas san
19:59:50 Royal'Drone [1701]: exura gran san
19:59:50 Womolu [1905]: exeta amp res
19:59:50 Womolu [1905]: exori
19:59:50 Burkzin [1762]: exura sio "Womolu"
19:59:50 Luszckyn [1516]: exevo vis hur
19:59:50 Womolu [1905]: exura med ico

--- CLASSIFICAÇÃO PARSEADA (turno 19:59:47) ---
comp: arrow=9 spell=12 rune=0 grenade=9  | Divine Caldera (exevo mas san)
   0  19:59:47.97  mycobiontic beetle     dmg=  379 base=  379  arrow   
   1  19:59:47.98  oozing corpus          dmg=  356 base=  356  arrow   
   2  19:59:47.99  sopping corpus         dmg=  261 base=  261  arrow   
   3  19:59:47.100  oozing corpus          dmg=  329 base=  329  arrow   
   4  19:59:47.101  bloated man-maggot     dmg=  245 base=  245  arrow   
   5  19:59:47.102  sopping corpus         dmg=  243 base=  243  arrow   
   6  19:59:47.103  oozing corpus          dmg=  341 base=  341  arrow   
   7  19:59:47.104  oozing corpus          dmg=  292 base=  292  arrow   
   8  19:59:47.105  oozing corpus          dmg=  292 base=  292  arrow   
   9  19:59:47.106  sopping corpus         dmg= 1286 base=  760  spell    (crit)
  10  19:59:47.107  mycobiontic beetle     dmg= 1341 base=  793  spell    (crit)
  11  19:59:47.108  oozing corpus          dmg= 1397 base=  826  spell    (crit)
  12  19:59:47.109  sopping corpus         dmg= 1286 base=  760  spell    (crit)
  13  19:59:47.110  oozing corpus          dmg= 1349 base=  798  spell    (crit)
  14  19:59:47.111  oozing corpus          dmg= 1397 base=  826  spell    (crit)
  15  19:59:47.112  mycobiontic beetle     dmg= 1341 base=  793  spell    (crit)
  16  19:59:47.113  bloated man-maggot     dmg= 1338 base=  791  spell    (crit)
  17  19:59:47.114  oozing corpus          dmg= 1397 base=  826  spell    (crit)
  18  19:59:47.115  sopping corpus         dmg= 1286 base=  760  spell    (crit)
  19  19:59:47.116  oozing corpus          dmg= 1349 base=  798  spell    (crit)
  20  19:59:47.117  oozing corpus          dmg= 1349 base=  798  spell    (overkill, crit)
  21  19:59:48.120  mycobiontic beetle     dmg= 1502 base=  888  grenade  (crit)
  22  19:59:48.121  oozing corpus          dmg= 1566 base=  926  grenade  (crit)
  23  19:59:48.122  sopping corpus         dmg= 1442 base=  853  grenade  (crit)
  24  19:59:48.123  sopping corpus         dmg= 1442 base=  853  grenade  (crit)
  25  19:59:48.124  bloated man-maggot     dmg= 1499 base=  886  grenade  (crit)
  26  19:59:48.125  mycobiontic beetle     dmg= 1447 base=  856  grenade  (crit)
  27  19:59:48.126  oozing corpus          dmg= 1566 base=  926  grenade  (crit)
  28  19:59:48.127  oozing corpus          dmg= 1511 base=  893  grenade  (crit)
  29  19:59:48.128  oozing corpus          dmg= 1511 base=  893  grenade  (crit)

==============================================================================
jaded Server Log.txt  +  jaded Local Chat.txt
sessão: 19:59:25–20:07:41   |   turno alvo: 19:59:49
==============================================================================

--- SERVER LOG (hits + execuções, 19:59:47–19:59:52) ---
19:59:47 Using one of 3172 ultimate spirit potions...
19:59:47 A mycobiontic beetle loses 379 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 356 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 261 hitpoints due to your attack. 
19:59:47 An oozing corpus loses 329 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 A bloated man-maggot loses 245 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 243 hitpoints due to your attack. 
19:59:47 An oozing corpus loses 341 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 292 hitpoints due to your attack. 
19:59:47 An oozing corpus loses 292 hitpoints due to your attack. 
19:59:47 A sopping corpus loses 1286 hitpoints due to your critical attack. 
19:59:47 A mycobiontic beetle loses 1341 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 1397 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 1286 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1349 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1397 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A mycobiontic beetle loses 1341 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A bloated man-maggot loses 1338 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 An oozing corpus loses 1397 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:47 A sopping corpus loses 1286 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1349 hitpoints due to your critical attack. 
19:59:47 An oozing corpus loses 1349 hitpoints due to your critical attack. 
19:59:48 Using one of 3171 ultimate spirit potions...
19:59:48 A mycobiontic beetle loses 1502 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 An oozing corpus loses 1566 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 A sopping corpus loses 1442 hitpoints due to your critical attack. 
19:59:48 A sopping corpus loses 1442 hitpoints due to your critical attack. 
19:59:48 A bloated man-maggot loses 1499 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 A mycobiontic beetle loses 1447 hitpoints due to your critical attack. 
19:59:48 An oozing corpus loses 1566 hitpoints due to your critical attack. (increased damage by Expose Weakness)
19:59:48 An oozing corpus loses 1511 hitpoints due to your critical attack. 
19:59:48 An oozing corpus loses 1511 hitpoints due to your critical attack. 
19:59:49 Using one of 3170 ultimate spirit potions...
19:59:49 A mycobiontic beetle loses 361 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 An oozing corpus loses 305 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 A sopping corpus loses 247 hitpoints due to your attack. 
19:59:49 An oozing corpus loses 308 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 A bloated man-maggot loses 257 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:49 A sopping corpus loses 212 hitpoints due to your attack. 
19:59:49 An oozing corpus loses 277 hitpoints due to your attack. 
19:59:49 A sopping corpus loses 215 hitpoints due to your attack. 
19:59:49 An oozing corpus loses 272 hitpoints due to your attack. 
19:59:49 A sopping corpus loses 208 hitpoints due to your attack. 
19:59:50 An oozing corpus loses 738 hitpoints due to your attack. 
19:59:50 A mycobiontic beetle loses 733 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 An oozing corpus loses 765 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 A mycobiontic beetle loses 707 hitpoints due to your attack. 
19:59:50 A bloated man-maggot loses 732 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A mycobiontic beetle loses 733 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:50 A sopping corpus loses 705 hitpoints due to your attack. 
19:59:50 An oozing corpus loses 738 hitpoints due to your attack. 
19:59:50 Using one of 3169 ultimate spirit potions...
19:59:52 A sopping corpus loses 294 hitpoints due to your attack. 
19:59:52 A sopping corpus loses 285 hitpoints due to your attack. 
19:59:52 An oozing corpus loses 375 hitpoints due to your attack. 
19:59:52 A mycobiontic beetle loses 375 hitpoints due to your attack. 
19:59:52 A mycobiontic beetle loses 444 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:52 A sopping corpus loses 324 hitpoints due to your attack. 
19:59:52 Using one of 1290 thunderstorm runes...
19:59:52 An oozing corpus loses 510 hitpoints due to your attack. 
19:59:52 A sopping corpus loses 489 hitpoints due to your attack. 
19:59:52 A mycobiontic beetle loses 470 hitpoints due to your attack. 
19:59:52 A sopping corpus loses 489 hitpoints due to your attack. 
19:59:52 A mycobiontic beetle loses 487 hitpoints due to your attack. (increased damage by Expose Weakness)
19:59:52 A sopping corpus loses 489 hitpoints due to your attack. 
19:59:52 A mycobiontic beetle loses 470 hitpoints due to your attack. 
19:59:52 An oozing corpus loses 510 hitpoints due to your attack. 
19:59:52 Using one of 3168 ultimate spirit potions...

--- LOCAL CHAT (linhas brutas, 19:59:47–19:59:52) ---
19:59:47 Burkzin [1762]: utamo vita
19:59:47 Cybres Jack [1737]: exura vita
19:59:47 Womolu [1905]: exori gran
19:59:47 Luszckyn [1516]: utamo vita
19:59:47 Womolu [1905]: exura med ico
19:59:47 Royal'Drone [1701]: exevo mas san
19:59:47 Burkzin [1762]: exura sio "Womolu"
19:59:47 Cybres Jack [1737]: exevo gran mas vis
19:59:48 Royal'Drone [1701]: exura gran san
19:59:48 Burkzin [1762]: exevo ulus frigo
19:59:48 Luszckyn [1516]: exevo vis lux
19:59:48 Womolu [1905]: exura med ico
19:59:49 Royal'Drone [1701]: exura gran san
19:59:49 Luszckyn [1516]: exura vita
19:59:49 Burkzin [1762]: exura gran mas res
19:59:49 Womolu [1905]: exura med ico
19:59:50 Royal'Drone [1701]: exevo mas san
19:59:50 Royal'Drone [1701]: exura gran san
19:59:50 Womolu [1905]: exeta amp res
19:59:50 Womolu [1905]: exori
19:59:50 Burkzin [1762]: exura sio "Womolu"
19:59:50 Luszckyn [1516]: exevo vis hur
19:59:50 Womolu [1905]: exura med ico
19:59:51 Royal'Drone [1701]: exura gran san
19:59:51 Cybres Jack [1737]: utamo vita
19:59:52 Burkzin [1762]: exura sio "Royal'Drone"
19:59:52 Womolu [1905]: exura med ico
19:59:52 Cybres Jack [1737]: exevo vis hur
19:59:52 Royal'Drone [1701]: exura gran san
19:59:52 Womolu [1905]: exori mas
19:59:52 Luszckyn [1516]: exevo gran vis lux

--- CLASSIFICAÇÃO PARSEADA (turno 19:59:49) ---
comp: arrow=9 spell=12 rune=0 grenade=0  | Divine Caldera (exevo mas san)
   0  19:59:49.129  mycobiontic beetle     dmg=  361 base=  361  arrow   
   1  19:59:49.130  oozing corpus          dmg=  305 base=  305  arrow   
   2  19:59:49.131  sopping corpus         dmg=  247 base=  247  arrow   
   3  19:59:49.132  oozing corpus          dmg=  308 base=  308  arrow   
   4  19:59:49.133  bloated man-maggot     dmg=  257 base=  257  arrow   
   5  19:59:49.134  sopping corpus         dmg=  212 base=  212  arrow   
   6  19:59:49.135  oozing corpus          dmg=  277 base=  277  arrow   
   7  19:59:49.136  sopping corpus         dmg=  215 base=  215  arrow   
   8  19:59:49.137  oozing corpus          dmg=  272 base=  272  arrow   
   9  19:59:49.138  sopping corpus         dmg=  208 base=  208  spell    (overkill)
  10  19:59:50.140  oozing corpus          dmg=  738 base=  738  spell   
  11  19:59:50.141  mycobiontic beetle     dmg=  733 base=  733  spell   
  12  19:59:50.142  sopping corpus         dmg=  705 base=  705  spell   
  13  19:59:50.143  oozing corpus          dmg=  765 base=  765  spell   
  14  19:59:50.144  sopping corpus         dmg=  705 base=  705  spell   
  15  19:59:50.145  sopping corpus         dmg=  705 base=  705  spell   
  16  19:59:50.146  mycobiontic beetle     dmg=  707 base=  707  spell   
  17  19:59:50.147  bloated man-maggot     dmg=  732 base=  732  spell   
  18  19:59:50.148  mycobiontic beetle     dmg=  733 base=  733  spell   
  19  19:59:50.149  sopping corpus         dmg=  705 base=  705  spell   
  20  19:59:50.150  oozing corpus          dmg=  738 base=  738  spell    (overkill)

==============================================================================
darklight server log rp.txt  +  darklight local chat rp.txt
sessão: única sessão   |   turno alvo: 09:14:16
==============================================================================

--- SERVER LOG (hits + execuções, 09:14:14–09:14:19) ---
09:14:14 A darklight source loses 498 hitpoints due to your attack. 
09:14:14 A darklight source loses 488 hitpoints due to your attack. 
09:14:14 A darklight striker loses 375 hitpoints due to your attack. 
09:14:14 A darklight matter loses 521 hitpoints due to your attack. 
09:14:14 A walking pillar loses 509 hitpoints due to your attack. 
09:14:14 A darklight matter loses 503 hitpoints due to your attack. 
09:14:14 A darklight striker loses 393 hitpoints due to your attack. 
09:14:14 A darklight matter loses 475 hitpoints due to your attack. 
09:14:14 Using one of 464 great fireball runes...
09:14:14 A darklight source loses 452 hitpoints due to your attack. 
09:14:14 A darklight matter loses 491 hitpoints due to your attack. 
09:14:14 A darklight matter loses 491 hitpoints due to your attack. 
09:14:14 A darklight striker loses 492 hitpoints due to your attack. 
09:14:14 A darklight source loses 452 hitpoints due to your attack. 
09:14:14 A darklight matter loses 491 hitpoints due to your attack. 
09:14:14 A darklight striker loses 492 hitpoints due to your attack. 
09:14:14 A walking pillar loses 454 hitpoints due to your attack. 
09:14:16 A darklight striker loses 405 hitpoints due to your attack. 
09:14:16 A darklight source loses 501 hitpoints due to your attack. 
09:14:17 A darklight striker loses 1067 hitpoints due to your attack. 
09:14:19 A darklight striker loses 458 hitpoints due to your attack. 
09:14:19 A darklight source loses 569 hitpoints due to your attack. 
09:14:19 A darklight source loses 1194 hitpoints due to your critical attack. 
09:14:19 A darklight striker loses 1798 hitpoints due to your attack. (enflame charm)
09:14:19 A darklight striker loses 1075 hitpoints due to your critical attack. 

--- LOCAL CHAT (linhas brutas, 09:14:14–09:14:19) ---
09:14:14 Womolu [1904]: exura med ico
09:14:14 Izeekao [1921]: exevo tempo mas san
09:14:14 Izeekao [1921]: utevo grav san
09:14:14 Womolu [1904]: exori mas
09:14:14 Womolu [1904]: exeta amp res
09:14:14 Izeekao [1921]: exura gran san
09:14:15 Royal'Drone [1700]: exura gran san
09:14:17 Royal'Drone [1700]: exori gran con
09:14:17 Royal'Drone [1700]: exura gran san
09:14:19 Royal'Drone [1700]: exevo mas san
09:14:19 Royal'Drone [1700]: exura gran san

--- CLASSIFICAÇÃO PARSEADA (turno 09:14:16) ---
comp: arrow=2 spell=1 rune=0 grenade=0  | Strong Ethereal Spear (exori gran con)
   0  09:14:16.49  darklight striker      dmg=  405 base=  405  arrow   
   1  09:14:16.50  darklight source       dmg=  501 base=  501  arrow   
   2  09:14:17.51  darklight striker      dmg= 1067 base= 1067  spell   

==============================================================================
Hakka Server Log.txt  +  Hakka Local Chat.txt
sessão: 21:56:25–21:57:41   |   turno alvo: 21:56:25
==============================================================================

--- SERVER LOG (hits + execuções, 21:56:23–21:56:27) ---
21:56:25 A rootthing bug tracker loses 504 hitpoints due to your attack. 
21:56:26 Using one of 895 ultimate mana potions...
21:56:26 Using one of 894 ultimate mana potions...
21:56:26 Using one of 894 ultimate mana potions...
21:56:27 Using one of 2110 great fireball runes...
21:56:27 A rootthing nutshell loses 492 hitpoints due to your attack. 
21:56:27 A rootthing nutshell loses 492 hitpoints due to your attack. 
21:56:27 A rootthing bug tracker loses 491 hitpoints due to your attack. 
21:56:27 A rootthing nutshell loses 492 hitpoints due to your attack. 
21:56:27 A rootthing nutshell loses 492 hitpoints due to your attack. 
21:56:27 A rootthing nutshell loses 492 hitpoints due to your attack. 
21:56:27 A rootthing nutshell loses 492 hitpoints due to your attack. 

--- LOCAL CHAT (linhas brutas, 21:56:23–21:56:27) ---
21:56:25 Shelodon [951]: exevo mas san
21:56:25 Deruna Gran [949]: exura gran mas res
21:56:26 Deruna Gran [949]: utani hur
21:56:27 Deruna Gran [949]: exura vita

--- CLASSIFICAÇÃO PARSEADA (turno 21:56:25) ---
comp: arrow=1 spell=0 rune=0 grenade=0  | só AA  [partialEdge]
   0  21:56:25.0  rootthing bug tracker  dmg=  504 base=  504  arrow   

==============================================================================
bastion server log ek.txt  +  bastion local chat ek.txt
sessão: única sessão   |   turno alvo: 15:20:27
==============================================================================

--- SERVER LOG (hits + execuções, 15:20:25–15:20:29) ---
15:20:25 A raubritter marksman loses 1423 hitpoints due to your critical attack. (low blow charm)
15:20:25 You were healed for 768 hitpoints.
15:20:25 You gained 228 mana.
15:20:25 A raubritter chastener loses 2073 hitpoints due to your attack. 
15:20:25 You were healed for 224 hitpoints.
15:20:25 You gained 78 mana.
15:20:25 A raubritter marksman loses 2001 hitpoints due to your attack. 
15:20:25 You were healed for 230 hitpoints.
15:20:25 You gained 69 mana.
15:20:25 A raubritter skirmisher loses 777 hitpoints due to your attack. (overpower charm)
15:20:25 A raubritter skirmisher loses 1913 hitpoints due to your attack. 
15:20:25 You were healed for 207 hitpoints.
15:20:25 You gained 66 mana.
15:20:25 A raubritter marksman loses 1993 hitpoints due to your attack. 
15:20:25 You were healed for 229 hitpoints.
15:20:25 You gained 68 mana.
15:20:25 A raubritter skirmisher loses 1910 hitpoints due to your attack. 
15:20:25 You were healed for 207 hitpoints.
15:20:25 You gained 66 mana.
15:20:25 A raubritter skirmisher loses 1913 hitpoints due to your attack. 
15:20:25 You were healed for 207 hitpoints.
15:20:25 You gained 66 mana.
15:20:25 A raubritter skirmisher loses 1930 hitpoints due to your attack. 
15:20:25 You were healed for 209 hitpoints.
15:20:25 You gained 66 mana.
15:20:25 A raubritter marksman loses 2008 hitpoints due to your attack. 
15:20:25 You were healed for 231 hitpoints.
15:20:25 You gained 69 mana.
15:20:25 Using one of 1731 ultimate health potions...
15:20:25 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:26 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:26 A raubritter marksman loses 32 hitpoints due to your attack. (damage reflection)
15:20:26 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:26 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:26 A raubritter chastener loses 32 hitpoints due to your attack. (damage reflection)
15:20:26 Using one of 1730 ultimate health potions...
15:20:26 A raubritter marksman loses 32 hitpoints due to your attack. (damage reflection)
15:20:26 A raubritter marksman loses 32 hitpoints due to your attack. (damage reflection)
15:20:27 A raubritter skirmisher loses 517 hitpoints due to your attack. 
15:20:27 You were healed for 263 hitpoints.
15:20:27 You gained 83 mana.
15:20:27 A raubritter chastener loses 15 hitpoints due to your attack. 
15:20:27 You were healed for 110 hitpoints.
15:20:27 You gained 39 mana.
15:20:27 A raubritter marksman loses 962 hitpoints due to your attack. 
15:20:27 You were healed for 111 hitpoints.
15:20:27 You gained 33 mana.
15:20:27 A raubritter skirmisher loses 935 hitpoints due to your attack. 
15:20:27 You were healed for 101 hitpoints.
15:20:27 You gained 32 mana.
15:20:27 A raubritter marksman loses 982 hitpoints due to your attack. 
15:20:27 You were healed for 113 hitpoints.
15:20:27 You gained 34 mana.
15:20:27 A raubritter skirmisher loses 931 hitpoints due to your attack. 
15:20:27 You were healed for 101 hitpoints.
15:20:27 You gained 32 mana.
15:20:27 A raubritter skirmisher loses 933 hitpoints due to your attack. 
15:20:27 You were healed for 101 hitpoints.
15:20:27 You gained 32 mana.
15:20:27 A raubritter skirmisher loses 921 hitpoints due to your attack. 
15:20:27 You were healed for 100 hitpoints.
15:20:27 You gained 32 mana.
15:20:27 A raubritter marksman loses 906 hitpoints due to your attack. 
15:20:27 You were healed for 113 hitpoints.
15:20:27 You gained 34 mana.
15:20:27 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:27 Using one of 1729 ultimate health potions...
15:20:28 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:28 A raubritter marksman loses 32 hitpoints due to your attack. (damage reflection)
15:20:28 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:28 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:28 A raubritter marksman loses 32 hitpoints due to your attack. (damage reflection)
15:20:28 Using one of 1728 ultimate health potions...
15:20:29 A raubritter skirmisher loses 35 hitpoints due to your attack. (damage reflection)
15:20:29 A raubritter skirmisher loses 883 hitpoints due to your attack. 
15:20:29 You were healed for 449 hitpoints.
15:20:29 You gained 142 mana.
15:20:29 A raubritter marksman loses 831 hitpoints due to your attack. 
15:20:29 You were healed for 90 hitpoints.
15:20:29 You gained 27 mana.
15:20:29 A raubritter skirmisher loses 774 hitpoints due to your attack. 
15:20:29 You were healed for 79 hitpoints.
15:20:29 You gained 25 mana.
15:20:29 A raubritter skirmisher loses 859 hitpoints due to your attack. 
15:20:29 You were healed for 88 hitpoints.
15:20:29 You gained 28 mana.
15:20:29 A raubritter skirmisher loses 53 hitpoints due to your attack. 
15:20:29 You were healed for 81 hitpoints.
15:20:29 You gained 26 mana.
15:20:29 A raubritter skirmisher loses 792 hitpoints due to your attack. 
15:20:29 You were healed for 81 hitpoints.
15:20:29 You gained 26 mana.
15:20:29 A raubritter skirmisher loses 791 hitpoints due to your attack. 
15:20:29 You were healed for 81 hitpoints.
15:20:29 You gained 26 mana.
15:20:29 A raubritter marksman loses 814 hitpoints due to your attack. 
15:20:29 You were healed for 88 hitpoints.
15:20:29 You gained 27 mana.
15:20:29 A raubritter skirmisher loses 777 hitpoints due to your attack. (overpower charm)
15:20:29 A raubritter skirmisher loses 776 hitpoints due to your attack. 
15:20:29 You were healed for 79 hitpoints.
15:20:29 You gained 25 mana.
15:20:29 A raubritter skirmisher loses 800 hitpoints due to your attack. 
15:20:29 You were healed for 82 hitpoints.
15:20:29 You gained 26 mana.
15:20:29 A raubritter skirmisher loses 32 hitpoints due to your attack. (damage reflection)
15:20:29 Using one of 1727 ultimate health potions...

--- LOCAL CHAT (linhas brutas, 15:20:25–15:20:29) ---
15:20:25 Kikaro [962]: exori gran
15:20:25 Kikaro [962]: exura med ico
15:20:26 Kikaro [962]: exura med ico
15:20:27 Kikaro [962]: utito tempo
15:20:27 Kikaro [962]: exori
15:20:27 Kikaro [962]: exura med ico
15:20:29 Kikaro [962]: exura med ico
15:20:29 Kikaro [962]: exeta amp res
15:20:29 Kikaro [962]: exori mas

--- CLASSIFICAÇÃO PARSEADA (turno 15:20:27) ---
comp: arrow=1 spell=8 rune=0 grenade=0  | Berserk (exori)
   0  15:20:27.1273  raubritter skirmisher  dmg=  517 base=  517  arrow   
   1  15:20:27.1274  raubritter chastener   dmg=   15 base=   15  spell    (overkill)
   2  15:20:27.1276  raubritter marksman    dmg=  962 base=  962  spell   
   3  15:20:27.1277  raubritter skirmisher  dmg=  935 base=  935  spell   
   4  15:20:27.1278  raubritter marksman    dmg=  982 base=  982  spell   
   5  15:20:27.1279  raubritter skirmisher  dmg=  931 base=  931  spell   
   6  15:20:27.1280  raubritter skirmisher  dmg=  933 base=  933  spell   
   7  15:20:27.1281  raubritter skirmisher  dmg=  921 base=  921  spell   
   8  15:20:27.1282  raubritter marksman    dmg=  906 base=  906  spell    (overkill)

==============================================================================
Server Log bakra.txt  +  Local Chat bakra.txt
sessão: 09:19:52–09:24:58   |   turno alvo: 09:20:21   (escolhida entre 3 sessões c/ esse horário)
==============================================================================

--- SERVER LOG (hits + execuções, 09:20:19–09:20:24) ---
09:20:19 Ichgahal loses 998 hitpoints due to your attack. 
09:20:20 Using one of 1098 great mana potions...
09:20:20 Using one of 1097 great mana potions...
09:20:21 Ichgahal loses 618 hitpoints due to your attack. (increased damage by Expose Weakness)
09:20:21 Ichgahal loses 723 hitpoints due to your attack. (increased damage by Expose Weakness)
09:20:22 Using one of 1096 great mana potions...
09:20:22 Ichgahal loses 810 hitpoints due to your attack. (increased damage by Expose Weakness)
09:20:22 Using one of 1095 great mana potions...
09:20:23 Ichgahal loses 1218 hitpoints due to your attack. (increased damage by Expose Weakness)
09:20:24 Ichgahal loses 1472 hitpoints due to your attack. (increased damage by Expose Weakness)
09:20:24 Using one of 1094 great mana potions...
09:20:24 Using one of 1093 great mana potions...

--- LOCAL CHAT (linhas brutas, 09:20:19–09:20:24) ---
09:20:19 Izeekao [1922]: utito tempo san
09:20:19 Royal'Drone [1700]: utito tempo san
09:20:19 Burkzin [1761]: exura sio "Royal'Drone"
09:20:19 Royal'Drone [1700]: exevo tempo mas san
09:20:19 Laflamez [1451]: exura vita
09:20:20 Burkzin [1761]: exura sio "Royal'Drone"
09:20:20 Laflamez [1451]: exori moe
09:20:21 Laflamez [1451]: exura vita
09:20:21 Burkzin [1761]: exura sio "Royal'Drone"
09:20:21 Royal'Drone [1700]: exevo mas san
09:20:22 Izeekao [1922]: exori san
09:20:22 Laflamez [1451]: exura vita
09:20:22 Burkzin [1761]: exura sio "Royal'Drone"
09:20:23 Burkzin [1761]: exura sio "Royal'Drone"
09:20:24 Royal'Drone [1700]: exori gran con
09:20:24 Izeekao [1922]: exori gran con
09:20:24 Womolu [1904]: exeta res

--- CLASSIFICAÇÃO PARSEADA (turno 09:20:21) ---
comp: arrow=1 spell=1 rune=0 grenade=1  | Divine Caldera (exevo mas san)
   0  09:20:21.15  ichgahal               dmg=  618 base=  618  arrow   
   1  09:20:21.16  ichgahal               dmg=  723 base=  723  spell   
   2  09:20:22.17  ichgahal               dmg=  810 base=  810  grenade 

==============================================================================
Server Log bakra.txt  +  Local Chat bakra.txt
sessão: 09:19:52–09:24:58   |   turno alvo: 09:21:06   (escolhida entre 3 sessões c/ esse horário)
==============================================================================

--- SERVER LOG (hits + execuções, 09:21:04–09:21:08) ---
09:21:04 Using one of 1064 great mana potions...
09:21:04 Using one of 1063 great mana potions...
09:21:06 Ichgahal loses 1169 hitpoints due to your attack. (increased damage by Expose Weakness)
09:21:06 Ichgahal loses 1336 hitpoints due to your attack. (increased damage by Expose Weakness)
09:21:06 Ichgahal loses 940 hitpoints due to your attack. (increased damage by Expose Weakness)
09:21:06 Using one of 1062 great mana potions...
09:21:07 Using one of 1061 great mana potions...
09:21:08 Ichgahal loses 903 hitpoints due to your attack. (increased damage by Expose Weakness)
09:21:08 Ichgahal loses 731 hitpoints due to your attack. (increased damage by Expose Weakness)
09:21:08 Using one of 1060 great mana potions...

--- LOCAL CHAT (linhas brutas, 09:21:04–09:21:08) ---
09:21:04 Laflamez [1451]: exura vita
09:21:04 Burkzin [1761]: exura vita
09:21:05 Laflamez [1451]: exura vita
09:21:06 Burkzin [1761]: exura sio "Royal'Drone"
09:21:06 Royal'Drone [1700]: exori gran con
09:21:06 Izeekao [1922]: exori gran con
09:21:06 Izeekao [1922]: utani hur
09:21:06 Laflamez [1451]: exura vita
09:21:07 Burkzin [1761]: exura sio "Royal'Drone"
09:21:07 Laflamez [1451]: exura vita
09:21:08 Burkzin [1761]: exura gran mas res
09:21:08 Royal'Drone [1700]: exevo mas san
09:21:08 Izeekao [1922]: exori san

--- CLASSIFICAÇÃO PARSEADA (turno 09:21:06) ---
comp: arrow=1 spell=1 rune=0 grenade=1  | Strong Ethereal Spear (exori gran con)
   0  09:21:06.55  ichgahal               dmg= 1169 base= 1169  arrow   
   1  09:21:06.56  ichgahal               dmg= 1336 base= 1336  spell   
   2  09:21:06.57  ichgahal               dmg=  940 base=  940  grenade 

==============================================================================
Server Log bakra.txt  +  Local Chat bakra.txt
sessão: 09:19:52–09:24:58   |   turno alvo: 09:23:47   (escolhida entre 2 sessões c/ esse horário)
==============================================================================

--- SERVER LOG (hits + execuções, 09:23:45–09:23:50) ---
09:23:45 Ichgahal loses 1213 hitpoints due to your attack. (increased damage by Expose Weakness)
09:23:46 Ichgahal loses 681 hitpoints due to your attack. (increased damage by Expose Weakness)
09:23:47 Ichgahal loses 917 hitpoints due to your attack. (increased damage by Expose Weakness)
09:23:48 Ichgahal loses 3047 hitpoints due to your critical attack. (increased damage by Expose Weakness)
09:23:48 Ichgahal loses 1493 hitpoints due to your attack. (increased damage by Expose Weakness)
09:23:50 Ichgahal loses 1138 hitpoints due to your attack. (increased damage by Expose Weakness)
09:23:50 Ichgahal loses 696 hitpoints due to your attack. (increased damage by Expose Weakness)

--- LOCAL CHAT (linhas brutas, 09:23:45–09:23:50) ---
09:23:45 Burkzin [1761]: exura vita
09:23:45 Izeekao [1922]: exori gran con
09:23:46 Izeekao [1922]: utani hur
09:23:46 Laflamez [1451]: exura vita
09:23:46 Royal'Drone [1700]: exevo mas san
09:23:46 Burkzin [1761]: exura vita
09:23:47 Burkzin [1761]: exura vita
09:23:47 Izeekao [1922]: exori san
09:23:48 Royal'Drone [1700]: exori gran con
09:23:48 Burkzin [1761]: exura vita
09:23:49 Royal'Drone [1700]: utito tempo san
09:23:50 Izeekao [1922]: exori san
09:23:50 Laflamez [1451]: exori moe
09:23:50 Royal'Drone [1700]: exevo mas san

--- CLASSIFICAÇÃO PARSEADA (turno 09:23:47) ---
comp: arrow=1 spell=1 rune=0 grenade=1  | Strong Ethereal Spear (exori gran con)
   0  09:23:47.196  ichgahal               dmg=  917 base=  917  grenade 
   1  09:23:48.197  ichgahal               dmg= 3047 base= 1215  arrow    (crit)
   2  09:23:48.198  ichgahal               dmg= 1493 base= 1493  spell   

==============================================================================
Server Log bakra.txt  +  Local Chat bakra.txt
sessão: 09:26:58–09:35:31   |   turno alvo: 09:33:47
==============================================================================

--- SERVER LOG (hits + execuções, 09:33:45–09:33:50) ---
09:33:45 Bakragore loses 742 hitpoints due to your attack. 
09:33:45 You lose 641 hitpoints due to your own attack. 
09:33:45 Using one of 3196 ultimate spirit potions...
09:33:46 You lose 641 hitpoints due to your own attack. 
09:33:46 Using one of 3195 ultimate spirit potions...
09:33:46 You lose 641 hitpoints due to your own attack. 
09:33:47 Bakragore loses 966 hitpoints due to your attack. 
09:33:47 Bakragore loses 1175 hitpoints due to your attack. 
09:33:48 Using one of 3194 ultimate spirit potions...
09:33:48 Bakragore loses 885 hitpoints due to your attack. 
09:33:48 You lose 692 hitpoints due to your own attack. 
09:33:48 Using one of 3193 ultimate spirit potions...
09:33:48 You lose 692 hitpoints due to your own attack. 
09:33:48 You lose 641 hitpoints due to your own attack. 
09:33:48 You lose 641 hitpoints due to your own attack. 
09:33:49 Bakragore loses 677 hitpoints due to your attack. 
09:33:50 Bakragore loses 712 hitpoints due to your attack. 
09:33:50 Using one of 3192 ultimate spirit potions...
09:33:50 You lose 641 hitpoints due to your own attack. 
09:33:50 Using one of 3191 ultimate spirit potions...

--- LOCAL CHAT (linhas brutas, 09:33:45–09:33:50) ---
09:33:45 Royal'Drone [1700]: exevo tempo mas san
09:33:45 Burkzin [1761]: exura sio "Royal'Drone"
09:33:46 Burkzin [1761]: exura sio "Royal'Drone"
09:33:47 Royal'Drone [1700]: utevo grav san
09:33:47 Burkzin [1761]: exura sio "Royal'Drone"
09:33:47 Royal'Drone [1700]: exori gran con
09:33:47 Izeekao [1922]: exura gran san
09:33:48 Burkzin [1761]: exura sio "Royal'Drone"
09:33:49 Burkzin [1761]: exura sio "Royal'Drone"
09:33:50 Royal'Drone [1700]: exevo mas san
09:33:50 Izeekao [1922]: exura gran san
09:33:50 Burkzin [1761]: exura max vita

--- CLASSIFICAÇÃO PARSEADA (turno 09:33:47) ---
comp: arrow=1 spell=1 rune=0 grenade=1  | Strong Ethereal Spear (exori gran con)
   0  09:33:47.252  bakragore              dmg=  966 base=  966  arrow   
   1  09:33:47.253  bakragore              dmg= 1175 base= 1175  spell   
   2  09:33:48.254  bakragore              dmg=  885 base=  885  grenade 

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 22:18:05–22:24:01   |   turno alvo: 22:20:30
==============================================================================

--- SERVER LOG (hits + execuções, 22:20:28–22:20:33) ---
22:20:28 A darklight matter loses 1633 hitpoints due to your attack. (wound charm, active elemental amplification)
22:20:28 A darklight matter loses 847 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight striker loses 687 hitpoints due to your attack. (active elemental amplification)
22:20:28 A walking pillar loses 813 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight striker loses 677 hitpoints due to your attack. (active elemental amplification)
22:20:28 A walking pillar loses 800 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight striker loses 965 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight striker loses 965 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight matter loses 1010 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight matter loses 1010 hitpoints due to your attack. (active elemental amplification)
22:20:28 A walking pillar loses 2378 hitpoints due to your attack. (poison charm, active elemental amplification)
22:20:28 A walking pillar loses 1015 hitpoints due to your attack. (active elemental amplification)
22:20:28 A walking pillar loses 1015 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight striker loses 965 hitpoints due to your attack. (active elemental amplification)
22:20:28 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm due to active charm upgrade, active elemental amplification)
22:20:28 A darklight striker loses 965 hitpoints due to your attack. (active elemental amplification)
22:20:28 A walking pillar loses 2378 hitpoints due to your attack. (poison charm, active elemental amplification)
22:20:28 A walking pillar loses 1015 hitpoints due to your attack. (active elemental amplification)
22:20:28 Using one of 2260 great mana potions...
22:20:29 A darklight striker loses 1124 hitpoints due to your attack. (active elemental amplification)
22:20:29 A darklight matter loses 1177 hitpoints due to your attack. (active elemental amplification)
22:20:29 A darklight matter loses 641 hitpoints due to your attack. (active elemental amplification)
22:20:29 A walking pillar loses 1183 hitpoints due to your attack. (active elemental amplification)
22:20:29 A darklight striker loses 1124 hitpoints due to your attack. (active elemental amplification)
22:20:29 A walking pillar loses 1183 hitpoints due to your attack. (active elemental amplification)
22:20:29 A darklight striker loses 1124 hitpoints due to your attack. (active elemental amplification)
22:20:29 A darklight striker loses 1124 hitpoints due to your attack. (active elemental amplification)
22:20:29 A walking pillar loses 1183 hitpoints due to your attack. (active elemental amplification)
22:20:30 A darklight striker loses 953 hitpoints due to your attack. (active elemental amplification)
22:20:30 A darklight striker loses 977 hitpoints due to your attack. (active elemental amplification)
22:20:30 A walking pillar loses 1118 hitpoints due to your attack. (active elemental amplification)
22:20:30 A walking pillar loses 1128 hitpoints due to your attack. (active elemental amplification)
22:20:30 A darklight matter loses 1134 hitpoints due to your attack. (active elemental amplification)
22:20:30 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm due to active charm upgrade, active elemental amplification)
22:20:30 A darklight striker loses 954 hitpoints due to your attack. (active elemental amplification)
22:20:30 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm, active elemental amplification)
22:20:30 A darklight striker loses 1005 hitpoints due to your attack. (active elemental amplification)
22:20:30 Using one of 1798 great fireball runes...
22:20:31 A walking pillar loses 752 hitpoints due to your attack. (active elemental amplification)
22:20:31 A darklight striker loses 816 hitpoints due to your attack. (active elemental amplification)
22:20:31 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm, active elemental amplification)
22:20:31 A darklight striker loses 816 hitpoints due to your attack. (active elemental amplification)
22:20:31 A darklight matter loses 815 hitpoints due to your attack. (active elemental amplification)
22:20:31 A darklight striker loses 816 hitpoints due to your attack. (active elemental amplification)
22:20:31 A walking pillar loses 752 hitpoints due to your attack. (active elemental amplification)
22:20:31 A walking pillar loses 752 hitpoints due to your attack. (active elemental amplification)
22:20:31 A darklight striker loses 3927 hitpoints due to your attack. (enflame charm, active elemental amplification)
22:20:31 A darklight striker loses 816 hitpoints due to your attack. (active elemental amplification)
22:20:31 Using one of 2259 great mana potions...
22:20:31 Using one of 2259 great mana potions...
22:20:31 Using one of 2259 great mana potions...
22:20:33 A darklight striker loses 680 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm, active elemental amplification)
22:20:33 A darklight striker loses 712 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight striker loses 1049 hitpoints due to your attack. (enflame charm due to active charm upgrade, active elemental amplification)
22:20:33 A walking pillar loses 828 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight matter loses 805 hitpoints due to your attack. (active elemental amplification)
22:20:33 A walking pillar loses 834 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm, active elemental amplification)
22:20:33 A darklight striker loses 735 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight striker loses 985 hitpoints due to your attack. (active elemental amplification)
22:20:33 A walking pillar loses 1037 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight striker loses 985 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight matter loses 1031 hitpoints due to your attack. (active elemental amplification)
22:20:33 A darklight striker loses 985 hitpoints due to your attack. (active elemental amplification)
22:20:33 A walking pillar loses 1037 hitpoints due to your attack. (active elemental amplification)
22:20:33 A walking pillar loses 1037 hitpoints due to your attack. (active elemental amplification)

--- LOCAL CHAT (linhas brutas, 22:20:28–22:20:33) ---
22:20:28 Uhaacz [2573]: exevo ulus tera
22:20:28 Mazzeriin [2609]: exura gran san
22:20:28 Uhaacz [2573]: exura gran mas res
22:20:28 Mazzeriin [2609]: utevo grav san
22:20:28 Mazzeriin [2609]: exevo mas san
22:20:28 Majorowa [2480]: exeta amp res
22:20:28 Majorowa [2480]: exura med ico
22:20:29 Mazzeriin [2609]: exura gran san
22:20:29 Uhaacz [2573]: exura sio "Majorowa"
22:20:29 Nightt Gaze [2391]: exevo gran flam hur
22:20:29 Majorowa [2480]: exori mas
22:20:29 Majorowa [2480]: exura med ico
22:20:30 Nightt Gaze [2391]: utani gran hur
22:20:30 Mazzeriin [2609]: exura gran san
22:20:30 Uhaacz [2573]: exura gran mas res
22:20:31 Majorowa [2480]: exura med ico
22:20:31 Majorowa [2480]: exeta amp res
22:20:31 Mazzeriin [2609]: exura gran san
22:20:31 Uhaacz [2573]: exura sio "Majorowa"
22:20:31 Majorowa [2480]: exori gran
22:20:32 Majorowa [2480]: exura med ico
22:20:32 Uhaacz [2573]: exura gran mas res
22:20:32 Mazzeriin [2609]: exura gran san
22:20:33 Majorowa [2480]: exura med ico
22:20:33 Mazzeriin [2609]: exevo mas san
22:20:33 Majorowa [2480]: exeta amp res
22:20:33 Mazzeriin [2609]: exura gran san
22:20:33 Nightt Gaze [2391]: exevo gran flam hur
22:20:33 Uhaacz [2573]: exura sio "Majorowa"

--- CLASSIFICAÇÃO PARSEADA (turno 22:20:30) ---
comp: arrow=7 spell=0 rune=8 grenade=0  | runa [great fireball]
   0  22:20:30.1367  darklight striker      dmg=  953 base=  953  arrow   
   1  22:20:30.1368  darklight striker      dmg=  977 base=  977  arrow   
   2  22:20:30.1369  walking pillar         dmg= 1118 base= 1118  arrow   
   3  22:20:30.1370  walking pillar         dmg= 1128 base= 1128  arrow   
   4  22:20:30.1371  darklight matter       dmg= 1134 base= 1134  arrow   
   5  22:20:30.1373  darklight striker      dmg=  954 base=  954  arrow   
   6  22:20:30.1375  darklight striker      dmg= 1005 base= 1005  arrow   
   7  22:20:31.1377  walking pillar         dmg=  752 base=  752  rune    
   8  22:20:31.1378  darklight striker      dmg=  816 base=  816  rune    
   9  22:20:31.1380  darklight striker      dmg=  816 base=  816  rune    
  10  22:20:31.1381  darklight matter       dmg=  815 base=  815  rune    
  11  22:20:31.1382  darklight striker      dmg=  816 base=  816  rune    
  12  22:20:31.1383  walking pillar         dmg=  752 base=  752  rune    
  13  22:20:31.1384  walking pillar         dmg=  752 base=  752  rune    
  14  22:20:31.1386  darklight striker      dmg=  816 base=  816  rune    

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 22:18:05–22:24:01   |   turno alvo: 22:22:11
==============================================================================

--- SERVER LOG (hits + execuções, 22:22:09–22:22:13) ---
22:22:09 A darklight source loses 955 hitpoints due to your attack. (active elemental amplification)
22:22:09 A darklight matter loses 1633 hitpoints due to your attack. (wound charm, active elemental amplification)
22:22:09 A darklight matter loses 948 hitpoints due to your attack. (active elemental amplification)
22:22:09 A darklight striker loses 829 hitpoints due to your attack. (active elemental amplification)
22:22:09 A darklight striker loses 835 hitpoints due to your attack. (active elemental amplification)
22:22:09 A darklight source loses 935 hitpoints due to your attack. (active elemental amplification)
22:22:09 Using one of 1779 great fireball runes...
22:22:09 A darklight striker loses 1798 hitpoints due to your attack. (enflame charm due to active charm upgrade, active elemental amplification)
22:22:09 A darklight striker loses 1119 hitpoints due to your critical attack. (active elemental amplification)
22:22:09 A darklight source loses 1680 hitpoints due to your attack. (divine wrath charm, active elemental amplification)
22:22:09 A darklight source loses 1029 hitpoints due to your critical attack. (active elemental amplification)
22:22:09 A darklight matter loses 1117 hitpoints due to your critical attack. (active elemental amplification)
22:22:09 A darklight matter loses 1117 hitpoints due to your critical attack. (active elemental amplification)
22:22:09 A darklight striker loses 1119 hitpoints due to your critical attack. (active elemental amplification)
22:22:09 A walking pillar loses 1033 hitpoints due to your critical attack. (active elemental amplification)
22:22:09 A darklight source loses 1029 hitpoints due to your critical attack. (active elemental amplification)
22:22:11 A darklight matter loses 816 hitpoints due to your attack. (active elemental amplification)
22:22:11 A darklight striker loses 656 hitpoints due to your attack. (active elemental amplification)
22:22:11 A darklight matter loses 800 hitpoints due to your attack. (active elemental amplification)
22:22:11 A darklight source loses 774 hitpoints due to your attack. (active elemental amplification)
22:22:11 A darklight matter loses 1633 hitpoints due to your attack. (wound charm due to active charm upgrade, active elemental amplification)
22:22:11 A darklight matter loses 917 hitpoints due to your attack. (active elemental amplification)
22:22:11 A darklight striker loses 1798 hitpoints due to your attack. (enflame charm, active elemental amplification)
22:22:11 A darklight striker loses 877 hitpoints due to your attack. (active elemental amplification)
22:22:11 A darklight matter loses 917 hitpoints due to your attack. (active elemental amplification)
22:22:11 A darklight source loses 1680 hitpoints due to your attack. (divine wrath charm due to active charm upgrade, active elemental amplification)
22:22:11 A darklight source loses 432 hitpoints due to your attack. (active elemental amplification)
22:22:13 A darklight source loses 1542 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A walking pillar loses 2124 hitpoints due to your attack. (poison charm, active elemental amplification)
22:22:13 A walking pillar loses 1516 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A darklight striker loses 1357 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A walking pillar loses 2124 hitpoints due to your attack. (poison charm due to active charm upgrade, active elemental amplification)
22:22:13 A walking pillar loses 1532 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A darklight source loses 1514 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A darklight source loses 1507 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A darklight source loses 1546 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A darklight source loses 1581 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 A darklight matter loses 1574 hitpoints due to your critical attack. (active elemental amplification)
22:22:13 Using one of 1778 great fireball runes...
22:22:13 A darklight source loses 665 hitpoints due to your attack. (active elemental amplification)
22:22:13 A walking pillar loses 668 hitpoints due to your attack. (active elemental amplification)
22:22:13 A darklight striker loses 722 hitpoints due to your attack. (active elemental amplification)
22:22:13 A walking pillar loses 668 hitpoints due to your attack. (active elemental amplification)
22:22:13 A darklight source loses 665 hitpoints due to your attack. (active elemental amplification)
22:22:13 A darklight source loses 665 hitpoints due to your attack. (active elemental amplification)
22:22:13 A darklight source loses 665 hitpoints due to your attack. (active elemental amplification)
22:22:13 A darklight source loses 665 hitpoints due to your attack. (active elemental amplification)
22:22:13 A darklight matter loses 721 hitpoints due to your attack. (active elemental amplification)

--- LOCAL CHAT (linhas brutas, 22:22:09–22:22:13) ---
22:22:09 Nightt Gaze [2391]: exura vita
22:22:09 Uhaacz [2573]: exura sio "Nightt Gaze"
22:22:10 Nightt Gaze [2391]: exura vita
22:22:10 Uhaacz [2573]: exura gran mas res
22:22:10 Mazzeriin [2609]: exana amp res
22:22:11 Uhaacz [2573]: exura sio "Mazzeriin"
22:22:11 Mazzeriin [2609]: exevo mas san
22:22:11 Nightt Gaze [2391]: exura vita
22:22:12 Uhaacz [2573]: exura sio "Majorowa"
22:22:13 Majorowa [2480]: exura med ico
22:22:13 Majorowa [2480]: exeta amp res
22:22:13 Nightt Gaze [2391]: exevo gran flam hur
22:22:13 Nightt Gaze [2391]: exori kor

--- CLASSIFICAÇÃO PARSEADA (turno 22:22:11) ---
comp: arrow=3 spell=5 rune=0 grenade=0  | Divine Caldera (exevo mas san)
   0  22:22:11.2287  darklight matter       dmg=  816 base=  816  arrow   
   1  22:22:11.2288  darklight striker      dmg=  656 base=  656  arrow   
   2  22:22:11.2289  darklight matter       dmg=  800 base=  800  arrow   
   3  22:22:11.2290  darklight source       dmg=  774 base=  774  spell   
   4  22:22:11.2292  darklight matter       dmg=  917 base=  917  spell   
   5  22:22:11.2294  darklight striker      dmg=  877 base=  877  spell   
   6  22:22:11.2295  darklight matter       dmg=  917 base=  917  spell   
   7  22:22:11.2297  darklight source       dmg=  432 base=  432  spell    (overkill)

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 22:41:16–22:46:46   |   turno alvo: 22:41:16
==============================================================================

--- SERVER LOG (hits + execuções, 22:41:14–22:41:18) ---
22:41:16 A darklight striker loses 782 hitpoints due to your attack. 
22:41:16 Using one of 1942 ultimate spirit potions...
22:41:18 A darklight matter loses 777 hitpoints due to your attack. 
22:41:18 A darklight source loses 741 hitpoints due to your attack. 
22:41:18 A darklight matter loses 739 hitpoints due to your attack. 
22:41:18 A darklight source loses 720 hitpoints due to your attack. 
22:41:18 A darklight source loses 776 hitpoints due to your attack. 
22:41:18 A darklight matter loses 780 hitpoints due to your attack. 
22:41:18 A darklight matter loses 758 hitpoints due to your attack. 
22:41:18 A walking pillar loses 916 hitpoints due to your attack. (active prey bonus)
22:41:18 A darklight striker loses 637 hitpoints due to your attack. 
22:41:18 A darklight matter loses 751 hitpoints due to your attack. 
22:41:18 A walking pillar loses 890 hitpoints due to your attack. (active prey bonus)
22:41:18 A darklight matter loses 953 hitpoints due to your attack. 
22:41:18 A darklight matter loses 953 hitpoints due to your attack. 
22:41:18 A darklight source loses 953 hitpoints due to your attack. 
22:41:18 A darklight matter loses 953 hitpoints due to your attack. 
22:41:18 A walking pillar loses 1196 hitpoints due to your attack. (active prey bonus)
22:41:18 A darklight source loses 953 hitpoints due to your attack. 
22:41:18 A darklight source loses 953 hitpoints due to your attack. 
22:41:18 A darklight matter loses 953 hitpoints due to your attack. 
22:41:18 A darklight matter loses 953 hitpoints due to your attack. 
22:41:18 A darklight striker loses 879 hitpoints due to your attack. 
22:41:18 A darklight matter loses 953 hitpoints due to your attack. 
22:41:18 A walking pillar loses 1196 hitpoints due to your attack. (active prey bonus)
22:41:18 A darklight striker loses 879 hitpoints due to your attack. 
22:41:18 A walking pillar loses 1196 hitpoints due to your attack. (active prey bonus)
22:41:18 Using one of 1941 ultimate spirit potions...

--- LOCAL CHAT (linhas brutas, 22:41:14–22:41:18) ---
22:41:14 Uhaacz [2571]: exura sio "Majorowa"
22:41:14 Nightt Gaze [2388]: exevo gran flam hur
22:41:14 Mazzeriin [2606]: utani hur
22:41:14 Mazzeriin [2606]: exura gran san
22:41:14 Nightt Gaze [2388]: exori kor
22:41:15 Uhaacz [2571]: exevo tera hur
22:41:15 Majorowa [2477]: exura med ico
22:41:15 Uhaacz [2571]: exura gran mas res
22:41:15 Majorowa [2477]: exori
22:41:15 Mazzeriin [2606]: exura gran san
22:41:16 Mazzeriin [2606]: exevo tempo mas san
22:41:16 Uhaacz [2571]: exura sio "Majorowa"
22:41:16 Mazzeriin [2606]: exura gran san
22:41:16 Majorowa [2477]: exura med ico
22:41:17 Majorowa [2477]: utani tempo hur
22:41:17 Uhaacz [2571]: exevo ulus tera
22:41:17 Mazzeriin [2606]: exura gran san
22:41:17 Majorowa [2477]: exori mas
22:41:17 Uhaacz [2571]: exura gran mas res
22:41:17 Majorowa [2477]: exura med ico
22:41:18 Mazzeriin [2606]: utevo grav san
22:41:18 Mazzeriin [2606]: exevo mas san
22:41:18 Uhaacz [2571]: exura sio "Majorowa"
22:41:18 Mazzeriin [2606]: exura gran san
22:41:18 Nightt Gaze [2388]: exevo gran flam hur
22:41:18 Majorowa [2477]: exura med ico

--- CLASSIFICAÇÃO PARSEADA (turno 22:41:16) ---
comp: arrow=1 spell=0 rune=0 grenade=0  | só AA
   0  22:41:16.0  darklight striker      dmg=  782 base=  782  arrow   

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 22:41:16–22:46:46   |   turno alvo: 22:45:34
==============================================================================

--- SERVER LOG (hits + execuções, 22:45:32–22:45:36) ---
22:45:32 A darklight striker loses 584 hitpoints due to your attack. 
22:45:32 A walking pillar loses 860 hitpoints due to your attack. (active prey bonus)
22:45:32 A walking pillar loses 2655 hitpoints due to your attack. (active prey bonus, poison charm)
22:45:32 A walking pillar loses 860 hitpoints due to your attack. (active prey bonus)
22:45:32 A darklight matter loses 714 hitpoints due to your attack. 
22:45:32 A walking pillar loses 885 hitpoints due to your attack. (active prey bonus)
22:45:32 A darklight source loses 664 hitpoints due to your attack. 
22:45:32 A darklight matter loses 714 hitpoints due to your attack. 
22:45:32 A walking pillar loses 1041 hitpoints due to your attack. (active prey bonus)
22:45:32 A walking pillar loses 2655 hitpoints due to your attack. (active prey bonus, poison charm)
22:45:32 A walking pillar loses 1041 hitpoints due to your attack. (active prey bonus)
22:45:32 A darklight striker loses 765 hitpoints due to your attack. 
22:45:32 A darklight source loses 829 hitpoints due to your attack. 
22:45:32 A darklight source loses 140 hitpoints due to your attack. 
22:45:32 A darklight matter loses 828 hitpoints due to your attack. 
22:45:34 A walking pillar loses 1002 hitpoints due to your attack. (active prey bonus, perfect shot)
22:45:34 A walking pillar loses 267 hitpoints due to your attack. (active prey bonus)
22:45:34 A darklight source loses 800 hitpoints due to your attack. 
22:45:34 A darklight striker loses 645 hitpoints due to your attack. 
22:45:34 A darklight matter loses 1633 hitpoints due to your attack. (wound charm)
22:45:34 A darklight matter loses 774 hitpoints due to your attack. 
22:45:34 A walking pillar loses 982 hitpoints due to your attack. (active prey bonus)
22:45:34 Using one of 1058 great fireball runes...
22:45:36 A walking pillar loses 1208 hitpoints due to your attack. (active prey bonus)
22:45:36 A darklight striker loses 788 hitpoints due to your attack. 
22:45:36 A darklight source loses 921 hitpoints due to your attack. 
22:45:36 A walking pillar loses 1153 hitpoints due to your attack. (active prey bonus)
22:45:36 A darklight matter loses 960 hitpoints due to your attack. 
22:45:36 A darklight source loses 807 hitpoints due to your attack. 
22:45:36 A walking pillar loses 1013 hitpoints due to your attack. (active prey bonus)
22:45:36 A walking pillar loses 1013 hitpoints due to your attack. (active prey bonus)
22:45:36 A darklight matter loses 806 hitpoints due to your attack. 
22:45:36 A darklight striker loses 745 hitpoints due to your attack. 
22:45:36 A darklight source loses 1558 hitpoints due to your attack. (divine wrath charm)
22:45:36 A darklight source loses 807 hitpoints due to your attack. 

--- LOCAL CHAT (linhas brutas, 22:45:32–22:45:36) ---
22:45:32 Mazzeriin [2606]: exevo mas san
22:45:32 Mazzeriin [2606]: exura gran san
22:45:34 Mazzeriin [2606]: utani hur
22:45:35 Mazzeriin [2606]: exura gran san
22:45:36 Mazzeriin [2606]: exura gran san
22:45:36 Mazzeriin [2606]: exevo mas san
22:45:36 Nightt Gaze [2388]: exori kor

--- CLASSIFICAÇÃO PARSEADA (turno 22:45:34) ---
comp: arrow=6 spell=0 rune=0 grenade=0  | só AA
   0  22:45:34.2378  walking pillar         dmg= 1002 base=  802  arrow   
   1  22:45:34.2379  walking pillar         dmg=  267 base=  214  arrow    (overkill)
   2  22:45:34.2381  darklight source       dmg=  800 base=  800  arrow   
   3  22:45:34.2382  darklight striker      dmg=  645 base=  645  arrow   
   4  22:45:34.2384  darklight matter       dmg=  774 base=  774  arrow   
   5  22:45:34.2385  walking pillar         dmg=  982 base=  786  arrow   

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 23:19:51–23:25:33   |   turno alvo: 23:22:28
==============================================================================

--- SERVER LOG (hits + execuções, 23:22:26–23:22:30) ---
23:22:26 A darklight striker loses 854 hitpoints due to your attack. 
23:22:26 A darklight source loses 1071 hitpoints due to your attack. 
23:22:26 A darklight matter loses 1079 hitpoints due to your attack. 
23:22:26 A darklight striker loses 840 hitpoints due to your attack. 
23:22:26 A darklight striker loses 635 hitpoints due to your attack. 
23:22:26 Using one of 1134 great fireball runes...
23:22:26 A darklight striker loses 822 hitpoints due to your attack. 
23:22:26 A darklight matter loses 5 hitpoints due to your attack. 
23:22:26 A darklight striker loses 822 hitpoints due to your attack. 
23:22:26 A darklight matter loses 820 hitpoints due to your attack. 
23:22:26 A darklight source loses 754 hitpoints due to your attack. 
23:22:26 A darklight source loses 754 hitpoints due to your attack. 
23:22:26 A walking pillar loses 758 hitpoints due to your attack. 
23:22:26 A darklight matter loses 1828 hitpoints due to your attack. (wound charm)
23:22:26 A darklight matter loses 820 hitpoints due to your attack. 
23:22:26 A darklight striker loses 906 hitpoints due to your attack. (enflame charm)
23:22:28 A darklight source loses 901 hitpoints due to your attack. 
23:22:28 A darklight striker loses 636 hitpoints due to your attack. 
23:22:28 A darklight matter loses 574 hitpoints due to your attack. 
23:22:28 A darklight striker loses 740 hitpoints due to your attack. 
23:22:28 A darklight striker loses 752 hitpoints due to your attack. 
23:22:28 A walking pillar loses 746 hitpoints due to your attack. 
23:22:28 A darklight source loses 817 hitpoints due to your attack. 
23:22:28 A darklight matter loses 816 hitpoints due to your attack. 
23:22:28 A darklight source loses 414 hitpoints due to your attack. (divine wrath charm)
23:22:30 A darklight source loses 1558 hitpoints due to your attack. (divine wrath charm)
23:22:30 A darklight source loses 855 hitpoints due to your attack. 
23:22:30 A darklight matter loses 891 hitpoints due to your attack. 
23:22:30 A darklight source loses 862 hitpoints due to your attack. 
23:22:30 A darklight source loses 872 hitpoints due to your attack. 
23:22:30 Using one of 1133 great fireball runes...
23:22:30 A darklight matter loses 102 hitpoints due to your attack. 
23:22:30 A darklight source loses 632 hitpoints due to your attack. 
23:22:30 A darklight source loses 632 hitpoints due to your attack. 
23:22:30 A darklight striker loses 687 hitpoints due to your attack. 
23:22:30 A darklight source loses 632 hitpoints due to your attack. 
23:22:30 A darklight striker loses 687 hitpoints due to your attack. 
23:22:30 A darklight striker loses 687 hitpoints due to your attack. 

--- LOCAL CHAT (linhas brutas, 23:22:26–23:22:30) ---
23:22:26 Uhaacz [2574]: exura sio "Majorowa"
23:22:26 Majorowa [2480]: exeta amp res
23:22:26 Majorowa [2480]: exura med ico
23:22:26 Nightt Gaze [2391]: exura max vita
23:22:27 Majorowa [2480]: exori amp kor
23:22:27 Mazzeriin [2609]: exura gran san
23:22:27 Uhaacz [2574]: exura gran mas res
23:22:27 Majorowa [2480]: exura med ico
23:22:27 Nightt Gaze [2391]: exura vita
23:22:28 Uhaacz [2574]: exura sio "Majorowa"
23:22:28 Majorowa [2480]: utani tempo hur
23:22:28 Majorowa [2480]: exura med ico
23:22:28 Mazzeriin [2609]: exevo mas san
23:22:28 Nightt Gaze [2391]: exura vita
23:22:29 Mazzeriin [2609]: exura gran san
23:22:29 Uhaacz [2574]: exura gran mas res
23:22:29 Mazzeriin [2609]: utani hur
23:22:29 Nightt Gaze [2391]: exura vita
23:22:30 Uhaacz [2574]: utani gran hur
23:22:30 Mazzeriin [2609]: exura gran san
23:22:30 Uhaacz [2574]: exura sio "Mazzeriin"

--- CLASSIFICAÇÃO PARSEADA (turno 23:22:28) ---
comp: arrow=4 spell=4 rune=0 grenade=0  | Divine Caldera (exevo mas san)
   0  23:22:28.1346  darklight source       dmg=  901 base=  901  arrow   
   1  23:22:28.1347  darklight striker      dmg=  636 base=  636  arrow    (overkill)
   2  23:22:28.1349  darklight matter       dmg=  574 base=  574  arrow    (overkill)
   3  23:22:28.1351  darklight striker      dmg=  740 base=  740  arrow   
   4  23:22:28.1352  darklight striker      dmg=  752 base=  752  spell   
   5  23:22:28.1353  walking pillar         dmg=  746 base=  746  spell    (overkill)
   6  23:22:28.1355  darklight source       dmg=  817 base=  817  spell   
   7  23:22:28.1356  darklight matter       dmg=  816 base=  816  spell    (overkill)

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 23:19:51–23:25:33   |   turno alvo: 23:23:20
==============================================================================

--- SERVER LOG (hits + execuções, 23:23:18–23:23:22) ---
23:23:18 A darklight striker loses 666 hitpoints due to your attack. 
23:23:18 A darklight striker loses 1798 hitpoints due to your attack. (enflame charm)
23:23:18 A darklight striker loses 644 hitpoints due to your attack. 
23:23:18 A darklight matter loses 816 hitpoints due to your attack. 
23:23:18 A walking pillar loses 788 hitpoints due to your attack. 
23:23:18 A darklight striker loses 693 hitpoints due to your attack. 
23:23:18 A darklight striker loses 686 hitpoints due to your attack. 
23:23:18 A darklight source loses 830 hitpoints due to your attack. 
23:23:18 Using one of 1895 great mana potions...
23:23:20 A walking pillar loses 1538 hitpoints due to your critical attack. 
23:23:20 A darklight striker loses 1212 hitpoints due to your critical attack. 
23:23:20 A darklight striker loses 1201 hitpoints due to your critical attack. 
23:23:20 A walking pillar loses 1542 hitpoints due to your critical attack. 
23:23:20 A darklight striker loses 1193 hitpoints due to your critical attack. 
23:23:20 A darklight striker loses 1246 hitpoints due to your critical attack. 
23:23:20 A darklight striker loses 1215 hitpoints due to your critical attack. 
23:23:20 A darklight matter loses 1828 hitpoints due to your attack. (wound charm)
23:23:20 A darklight matter loses 1517 hitpoints due to your critical attack. 
23:23:20 A walking pillar loses 880 hitpoints due to your attack. 
23:23:20 A darklight striker loses 807 hitpoints due to your attack. 
23:23:20 A darklight striker loses 807 hitpoints due to your attack. 
23:23:20 A walking pillar loses 880 hitpoints due to your attack. 
23:23:20 A darklight striker loses 807 hitpoints due to your attack. 
23:23:20 A darklight striker loses 807 hitpoints due to your attack. 
23:23:20 A darklight striker loses 807 hitpoints due to your attack. 
23:23:20 A darklight matter loses 875 hitpoints due to your attack. 
23:23:20 Using one of 1894 great mana potions...
23:23:20 A darklight striker loses 1023 hitpoints due to your attack. 
23:23:20 A darklight striker loses 1023 hitpoints due to your attack. 
23:23:20 A darklight matter loses 1108 hitpoints due to your attack. 
23:23:20 A walking pillar loses 1114 hitpoints due to your attack. 
23:23:20 A darklight striker loses 1023 hitpoints due to your attack. 
23:23:20 A darklight striker loses 1023 hitpoints due to your attack. 
23:23:20 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:23:20 A walking pillar loses 1114 hitpoints due to your attack. 
23:23:20 A darklight striker loses 1023 hitpoints due to your attack. 
23:23:20 A darklight striker loses 1023 hitpoints due to your attack. 
23:23:20 A darklight striker loses 1023 hitpoints due to your attack. 
23:23:22 A walking pillar loses 950 hitpoints due to your attack. 
23:23:22 A darklight striker loses 796 hitpoints due to your attack. 
23:23:22 A darklight striker loses 801 hitpoints due to your attack. 
23:23:22 A darklight source loses 965 hitpoints due to your attack. 
23:23:22 A darklight striker loses 787 hitpoints due to your attack. 
23:23:22 A walking pillar loses 931 hitpoints due to your attack. 
23:23:22 A darklight striker loses 768 hitpoints due to your attack. 
23:23:22 A darklight source loses 976 hitpoints due to your attack. 
23:23:22 A darklight striker loses 806 hitpoints due to your attack. 
23:23:22 A darklight striker loses 806 hitpoints due to your attack. 
23:23:22 A darklight striker loses 792 hitpoints due to your attack. 
23:23:22 A darklight matter loses 965 hitpoints due to your attack. 
23:23:22 A darklight source loses 882 hitpoints due to your attack. 
23:23:22 A darklight striker loses 813 hitpoints due to your attack. 
23:23:22 A walking pillar loses 885 hitpoints due to your attack. 
23:23:22 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm)
23:23:22 A darklight striker loses 813 hitpoints due to your attack. 
23:23:22 A darklight striker loses 813 hitpoints due to your attack. 
23:23:22 A darklight source loses 882 hitpoints due to your attack. 
23:23:22 A darklight striker loses 74 hitpoints due to your attack. 
23:23:22 A walking pillar loses 885 hitpoints due to your attack. 
23:23:22 A darklight striker loses 813 hitpoints due to your attack. 
23:23:22 A darklight striker loses 813 hitpoints due to your attack. 
23:23:22 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm)
23:23:22 A darklight striker loses 813 hitpoints due to your attack. 
23:23:22 A darklight matter loses 881 hitpoints due to your attack. 
23:23:22 Using one of 1893 great mana potions...

--- LOCAL CHAT (linhas brutas, 23:23:18–23:23:22) ---
23:23:18 Mazzeriin [2609]: exevo tempo mas san
23:23:18 Majorowa [2480]: exura med ico
23:23:18 Uhaacz [2574]: exura gran mas res
23:23:18 Majorowa [2480]: exori gran
23:23:18 Mazzeriin [2609]: exura gran san
23:23:19 Majorowa [2480]: exura med ico
23:23:19 Uhaacz [2574]: exura sio "Majorowa"
23:23:20 Mazzeriin [2609]: utevo grav san
23:23:20 Majorowa [2480]: exura med ico
23:23:20 Mazzeriin [2609]: exevo mas san
23:23:20 Uhaacz [2574]: exura gran mas res
23:23:20 Mazzeriin [2609]: exura gran san
23:23:20 Nightt Gaze [2391]: exevo gran flam hur
23:23:20 Majorowa [2480]: exori
23:23:21 Majorowa [2480]: exura med ico
23:23:21 Uhaacz [2574]: exura max vita
23:23:22 Nightt Gaze [2391]: exura max vita
23:23:22 Majorowa [2480]: exeta amp res
23:23:22 Mazzeriin [2609]: exevo mas san
23:23:22 Majorowa [2480]: exura med ico
23:23:22 Uhaacz [2574]: exura sio "Majorowa"
23:23:22 Mazzeriin [2609]: exura gran san
23:23:22 Majorowa [2480]: exori mas

--- CLASSIFICAÇÃO PARSEADA (turno 23:23:20) ---
comp: arrow=8 spell=8 rune=0 grenade=10  | Divine Caldera (exevo mas san)
   0  23:23:20.1774  walking pillar         dmg= 1538 base=  835  arrow    (crit)
   1  23:23:20.1775  darklight striker      dmg= 1212 base=  658  arrow    (crit)
   2  23:23:20.1776  darklight striker      dmg= 1201 base=  652  arrow    (crit)
   3  23:23:20.1777  walking pillar         dmg= 1542 base=  837  arrow    (crit)
   4  23:23:20.1778  darklight striker      dmg= 1193 base=  648  arrow    (crit)
   5  23:23:20.1779  darklight striker      dmg= 1246 base=  676  arrow    (crit)
   6  23:23:20.1780  darklight striker      dmg= 1215 base=  659  arrow    (crit)
   7  23:23:20.1782  darklight matter       dmg= 1517 base=  823  arrow    (crit)
   8  23:23:20.1783  walking pillar         dmg=  880 base=  880  spell   
   9  23:23:20.1784  darklight striker      dmg=  807 base=  807  spell   
  10  23:23:20.1785  darklight striker      dmg=  807 base=  807  spell   
  11  23:23:20.1786  walking pillar         dmg=  880 base=  880  spell   
  12  23:23:20.1787  darklight striker      dmg=  807 base=  807  spell   
  13  23:23:20.1788  darklight striker      dmg=  807 base=  807  spell   
  14  23:23:20.1789  darklight striker      dmg=  807 base=  807  spell   
  15  23:23:20.1790  darklight matter       dmg=  875 base=  875  spell   
  16  23:23:20.1791  darklight striker      dmg= 1023 base= 1023  grenade 
  17  23:23:20.1792  darklight striker      dmg= 1023 base= 1023  grenade 
  18  23:23:20.1793  darklight matter       dmg= 1108 base= 1108  grenade 
  19  23:23:20.1794  walking pillar         dmg= 1114 base= 1114  grenade 
  20  23:23:20.1795  darklight striker      dmg= 1023 base= 1023  grenade 
  21  23:23:20.1796  darklight striker      dmg= 1023 base= 1023  grenade 
  22  23:23:20.1798  walking pillar         dmg= 1114 base= 1114  grenade 
  23  23:23:20.1799  darklight striker      dmg= 1023 base= 1023  grenade 
  24  23:23:20.1800  darklight striker      dmg= 1023 base= 1023  grenade 
  25  23:23:20.1801  darklight striker      dmg= 1023 base= 1023  grenade 

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 23:19:51–23:25:33   |   turno alvo: 23:24:39
==============================================================================

--- SERVER LOG (hits + execuções, 23:24:37–23:24:41) ---
23:24:37 A walking pillar loses 628 hitpoints due to your attack. 
23:24:37 A walking pillar loses 2124 hitpoints due to your attack. (poison charm)
23:24:37 A walking pillar loses 628 hitpoints due to your attack. 
23:24:37 A darklight striker loses 1798 hitpoints due to your attack. (enflame charm)
23:24:37 A darklight striker loses 681 hitpoints due to your attack. 
23:24:37 A darklight source loses 625 hitpoints due to your attack. 
23:24:37 A darklight matter loses 679 hitpoints due to your attack. 
23:24:37 A darklight source loses 625 hitpoints due to your attack. 
23:24:37 A walking pillar loses 628 hitpoints due to your attack. 
23:24:39 A darklight source loses 819 hitpoints due to your attack. (perfect shot)
23:24:39 A darklight matter loses 718 hitpoints due to your attack. 
23:24:39 A walking pillar loses 826 hitpoints due to your attack. 
23:24:39 A walking pillar loses 826 hitpoints due to your attack. 
23:24:39 A darklight source loses 822 hitpoints due to your attack. 
23:24:39 A darklight striker loses 1378 hitpoints due to your attack. (enflame charm)
23:24:39 A walking pillar loses 826 hitpoints due to your attack. 
23:24:41 A darklight source loses 1475 hitpoints due to your critical attack. 
23:24:41 Using one of 1111 great fireball runes...
23:24:41 A walking pillar loses 687 hitpoints due to your attack. 
23:24:41 A darklight source loses 684 hitpoints due to your attack. 
23:24:41 A walking pillar loses 687 hitpoints due to your attack. 
23:24:41 A darklight matter loses 743 hitpoints due to your attack. 

--- LOCAL CHAT (linhas brutas, 23:24:37–23:24:41) ---
23:24:37 Mazzeriin [2609]: exura gran san
23:24:37 Nightt Gaze [2391]: exura vita
23:24:37 Majorowa [2480]: exura med ico
23:24:37 Uhaacz [2574]: exura gran mas res
23:24:37 Mazzeriin [2609]: utani hur
23:24:37 Uhaacz [2574]: utani gran hur
23:24:38 Nightt Gaze [2391]: exura vita
23:24:38 Uhaacz [2574]: exura max vita
23:24:38 Mazzeriin [2609]: exura gran san
23:24:39 Mazzeriin [2609]: exevo mas san
23:24:39 Uhaacz [2574]: exura gran mas res
23:24:39 Mazzeriin [2609]: exura gran san
23:24:40 Uhaacz [2574]: exura sio "Mazzeriin"
23:24:41 Uhaacz [2574]: exura sio "Majorowa"

--- CLASSIFICAÇÃO PARSEADA (turno 23:24:39) ---
comp: arrow=1 spell=5 rune=0 grenade=0  | Divine Caldera (exevo mas san)
   0  23:24:39.2542  darklight source       dmg=  819 base=  819  arrow   
   1  23:24:39.2543  darklight matter       dmg=  718 base=  718  spell    (overkill)
   2  23:24:39.2545  walking pillar         dmg=  826 base=  826  spell   
   3  23:24:39.2546  walking pillar         dmg=  826 base=  826  spell   
   4  23:24:39.2547  darklight source       dmg=  822 base=  822  spell    (overkill)
   5  23:24:39.2550  walking pillar         dmg=  826 base=  826  spell    (overkill)

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 23:28:05–23:51:09   |   turno alvo: 23:28:34
==============================================================================

--- SERVER LOG (hits + execuções, 23:28:32–23:28:36) ---
23:28:32 A walking pillar loses 902 hitpoints due to your attack. 
23:28:32 A darklight striker loses 770 hitpoints due to your attack. 
23:28:32 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:28:32 A walking pillar loses 931 hitpoints due to your attack. 
23:28:32 A darklight matter loses 946 hitpoints due to your attack. 
23:28:32 A darklight matter loses 945 hitpoints due to your attack. 
23:28:32 A darklight striker loses 743 hitpoints due to your attack. 
23:28:32 A darklight striker loses 768 hitpoints due to your attack. 
23:28:32 A darklight source loses 898 hitpoints due to your attack. 
23:28:32 A darklight source loses 904 hitpoints due to your attack. 
23:28:32 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:28:32 A walking pillar loses 927 hitpoints due to your attack. 
23:28:32 A walking pillar loses 935 hitpoints due to your attack. 
23:28:32 A darklight matter loses 873 hitpoints due to your attack. 
23:28:32 A walking pillar loses 878 hitpoints due to your attack. 
23:28:32 A darklight striker loses 806 hitpoints due to your attack. 
23:28:32 A darklight source loses 874 hitpoints due to your attack. 
23:28:32 A darklight striker loses 806 hitpoints due to your attack. 
23:28:32 A darklight source loses 874 hitpoints due to your attack. 
23:28:32 A darklight striker loses 806 hitpoints due to your attack. 
23:28:32 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm)
23:28:32 A darklight striker loses 806 hitpoints due to your attack. 
23:28:32 A darklight matter loses 1828 hitpoints due to your attack. (wound charm)
23:28:32 A darklight matter loses 873 hitpoints due to your attack. 
23:28:32 A walking pillar loses 878 hitpoints due to your attack. 
23:28:32 A darklight striker loses 806 hitpoints due to your attack. 
23:28:32 A darklight striker loses 806 hitpoints due to your attack. 
23:28:32 A darklight source loses 874 hitpoints due to your attack. 
23:28:32 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:28:32 A walking pillar loses 878 hitpoints due to your attack. 
23:28:32 A walking pillar loses 878 hitpoints due to your attack. 
23:28:32 Using one of 1363 strong health potions...
23:28:33 Using one of 1362 strong health potions...
23:28:34 Using one of 2515 ultimate spirit potions...
23:28:34 A walking pillar loses 1088 hitpoints due to your attack. 
23:28:34 A darklight striker loses 856 hitpoints due to your attack. 
23:28:34 A darklight striker loses 915 hitpoints due to your attack. 
23:28:34 A walking pillar loses 1097 hitpoints due to your attack. 
23:28:34 A darklight striker loses 913 hitpoints due to your attack. 
23:28:34 A darklight striker loses 860 hitpoints due to your attack. 
23:28:34 A darklight matter loses 1089 hitpoints due to your attack. 
23:28:34 A darklight striker loses 915 hitpoints due to your attack. 
23:28:34 A darklight striker loses 863 hitpoints due to your attack. 
23:28:34 A darklight source loses 1076 hitpoints due to your attack. 
23:28:34 A darklight source loses 1059 hitpoints due to your attack. 
23:28:34 A darklight striker loses 910 hitpoints due to your attack. 
23:28:34 A darklight matter loses 1828 hitpoints due to your attack. (wound charm)
23:28:34 A darklight matter loses 1056 hitpoints due to your attack. 
23:28:34 A darklight striker loses 864 hitpoints due to your attack. 
23:28:34 A darklight source loses 1069 hitpoints due to your attack. 
23:28:34 A walking pillar loses 1079 hitpoints due to your attack. 
23:28:34 A walking pillar loses 1041 hitpoints due to your attack. 
23:28:35 Using one of 2514 ultimate spirit potions...
23:28:35 Using one of 2513 ultimate spirit potions...
23:28:36 A darklight striker loses 747 hitpoints due to your attack. 
23:28:36 A darklight striker loses 778 hitpoints due to your attack. 
23:28:36 A darklight striker loses 777 hitpoints due to your attack. 
23:28:36 A darklight striker loses 769 hitpoints due to your attack. 
23:28:36 A darklight source loses 930 hitpoints due to your attack. 
23:28:36 A walking pillar loses 925 hitpoints due to your attack. 
23:28:36 A darklight source loses 913 hitpoints due to your attack. 
23:28:36 A darklight striker loses 800 hitpoints due to your attack. 
23:28:36 A darklight striker loses 524 hitpoints due to your attack. 
23:28:36 A darklight matter loses 967 hitpoints due to your attack. 
23:28:36 A walking pillar loses 962 hitpoints due to your attack. 

--- LOCAL CHAT (linhas brutas, 23:28:32–23:28:36) ---
23:28:32 Mazzeriin [2609]: exura gran san
23:28:32 Mazzeriin [2609]: utevo grav san
23:28:32 Uhaacz [2574]: exura gran mas res
23:28:32 Mazzeriin [2609]: exevo mas san
23:28:32 Majorowa [2480]: exura med ico
23:28:33 Mazzeriin [2609]: exura gran san
23:28:33 Nightt Gaze [2391]: exura vita
23:28:33 Uhaacz [2574]: exevo ulus tera
23:28:33 Uhaacz [2574]: exura sio "Majorowa"
23:28:33 Majorowa [2480]: exori gran
23:28:33 Majorowa [2480]: exura med ico
23:28:34 Mazzeriin [2609]: exura gran san
23:28:34 Uhaacz [2574]: exura gran mas res
23:28:34 Mazzeriin [2609]: exevo tempo mas san
23:28:35 Majorowa [2480]: exura med ico
23:28:35 Mazzeriin [2609]: exura gran san
23:28:35 Nightt Gaze [2391]: exevo gran flam hur
23:28:35 Majorowa [2480]: exori
23:28:35 Uhaacz [2574]: exura sio "Majorowa"
23:28:36 Majorowa [2480]: exura med ico
23:28:36 Mazzeriin [2609]: exura gran san

--- CLASSIFICAÇÃO PARSEADA (turno 23:28:34) ---
comp: arrow=17 spell=0 rune=0 grenade=0  | só AA
   0  23:28:34.252  walking pillar         dmg= 1088 base= 1088  arrow   
   1  23:28:34.253  darklight striker      dmg=  856 base=  856  arrow   
   2  23:28:34.254  darklight striker      dmg=  915 base=  915  arrow   
   3  23:28:34.255  walking pillar         dmg= 1097 base= 1097  arrow   
   4  23:28:34.256  darklight striker      dmg=  913 base=  913  arrow   
   5  23:28:34.257  darklight striker      dmg=  860 base=  860  arrow   
   6  23:28:34.258  darklight matter       dmg= 1089 base= 1089  arrow   
   7  23:28:34.259  darklight striker      dmg=  915 base=  915  arrow   
   8  23:28:34.260  darklight striker      dmg=  863 base=  863  arrow   
   9  23:28:34.261  darklight source       dmg= 1076 base= 1076  arrow   
  10  23:28:34.262  darklight source       dmg= 1059 base= 1059  arrow   
  11  23:28:34.263  darklight striker      dmg=  910 base=  910  arrow   
  12  23:28:34.265  darklight matter       dmg= 1056 base= 1056  arrow   
  13  23:28:34.266  darklight striker      dmg=  864 base=  864  arrow   
  14  23:28:34.267  darklight source       dmg= 1069 base= 1069  arrow   
  15  23:28:34.268  walking pillar         dmg= 1079 base= 1079  arrow   
  16  23:28:34.269  walking pillar         dmg= 1041 base= 1041  arrow   

==============================================================================
darklight e vemiath server log.txt  +  darklight e vemiath Local Chat.txt
sessão: 23:28:05–23:51:09   |   turno alvo: 23:28:36
==============================================================================

--- SERVER LOG (hits + execuções, 23:28:34–23:28:39) ---
23:28:34 Using one of 2515 ultimate spirit potions...
23:28:34 A walking pillar loses 1088 hitpoints due to your attack. 
23:28:34 A darklight striker loses 856 hitpoints due to your attack. 
23:28:34 A darklight striker loses 915 hitpoints due to your attack. 
23:28:34 A walking pillar loses 1097 hitpoints due to your attack. 
23:28:34 A darklight striker loses 913 hitpoints due to your attack. 
23:28:34 A darklight striker loses 860 hitpoints due to your attack. 
23:28:34 A darklight matter loses 1089 hitpoints due to your attack. 
23:28:34 A darklight striker loses 915 hitpoints due to your attack. 
23:28:34 A darklight striker loses 863 hitpoints due to your attack. 
23:28:34 A darklight source loses 1076 hitpoints due to your attack. 
23:28:34 A darklight source loses 1059 hitpoints due to your attack. 
23:28:34 A darklight striker loses 910 hitpoints due to your attack. 
23:28:34 A darklight matter loses 1828 hitpoints due to your attack. (wound charm)
23:28:34 A darklight matter loses 1056 hitpoints due to your attack. 
23:28:34 A darklight striker loses 864 hitpoints due to your attack. 
23:28:34 A darklight source loses 1069 hitpoints due to your attack. 
23:28:34 A walking pillar loses 1079 hitpoints due to your attack. 
23:28:34 A walking pillar loses 1041 hitpoints due to your attack. 
23:28:35 Using one of 2514 ultimate spirit potions...
23:28:35 Using one of 2513 ultimate spirit potions...
23:28:36 A darklight striker loses 747 hitpoints due to your attack. 
23:28:36 A darklight striker loses 778 hitpoints due to your attack. 
23:28:36 A darklight striker loses 777 hitpoints due to your attack. 
23:28:36 A darklight striker loses 769 hitpoints due to your attack. 
23:28:36 A darklight source loses 930 hitpoints due to your attack. 
23:28:36 A walking pillar loses 925 hitpoints due to your attack. 
23:28:36 A darklight source loses 913 hitpoints due to your attack. 
23:28:36 A darklight striker loses 800 hitpoints due to your attack. 
23:28:36 A darklight striker loses 524 hitpoints due to your attack. 
23:28:36 A darklight matter loses 967 hitpoints due to your attack. 
23:28:36 A walking pillar loses 962 hitpoints due to your attack. 
23:28:37 A darklight source loses 872 hitpoints due to your attack. 
23:28:37 A darklight striker loses 804 hitpoints due to your attack. 
23:28:37 A darklight striker loses 2013 hitpoints due to your attack. (enflame charm)
23:28:37 A darklight striker loses 804 hitpoints due to your attack. 
23:28:37 A walking pillar loses 875 hitpoints due to your attack. 
23:28:37 A darklight striker loses 804 hitpoints due to your attack. 
23:28:37 A darklight source loses 872 hitpoints due to your attack. 
23:28:37 A darklight striker loses 804 hitpoints due to your attack. 
23:28:37 A darklight striker loses 804 hitpoints due to your attack. 
23:28:37 A darklight matter loses 871 hitpoints due to your attack. 
23:28:37 A darklight matter loses 871 hitpoints due to your attack. 
23:28:37 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:28:37 A walking pillar loses 875 hitpoints due to your attack. 
23:28:37 A darklight striker loses 804 hitpoints due to your attack. 
23:28:37 A darklight source loses 872 hitpoints due to your attack. 
23:28:37 A darklight source loses 872 hitpoints due to your attack. 
23:28:37 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:28:37 A walking pillar loses 875 hitpoints due to your attack. 
23:28:37 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:28:37 A walking pillar loses 875 hitpoints due to your attack. 
23:28:37 Using one of 2513 ultimate spirit potions...
23:28:37 A walking pillar loses 1154 hitpoints due to your attack. 
23:28:37 A darklight striker loses 1060 hitpoints due to your attack. 
23:28:37 A walking pillar loses 1154 hitpoints due to your attack. 
23:28:37 A darklight striker loses 1060 hitpoints due to your attack. 
23:28:37 A darklight striker loses 1060 hitpoints due to your attack. 
23:28:37 A darklight matter loses 1149 hitpoints due to your attack. 
23:28:37 A darklight striker loses 1060 hitpoints due to your attack. 
23:28:37 A darklight striker loses 1060 hitpoints due to your attack. 
23:28:37 A darklight source loses 519 hitpoints due to your attack. 
23:28:37 A darklight source loses 1150 hitpoints due to your attack. 
23:28:37 A darklight matter loses 1149 hitpoints due to your attack. 
23:28:37 A darklight matter loses 1828 hitpoints due to your attack. (wound charm)
23:28:37 A darklight matter loses 1149 hitpoints due to your attack. 
23:28:37 A darklight source loses 1150 hitpoints due to your attack. 
23:28:37 A walking pillar loses 2378 hitpoints due to your attack. (poison charm)
23:28:37 A walking pillar loses 1154 hitpoints due to your attack. 
23:28:37 A walking pillar loses 1154 hitpoints due to your attack. 
23:28:39 A darklight matter loses 738 hitpoints due to your attack. 
23:28:39 A darklight striker loses 609 hitpoints due to your attack. 
23:28:39 A walking pillar loses 738 hitpoints due to your attack. 
23:28:39 A darklight matter loses 736 hitpoints due to your attack. 
23:28:39 A darklight striker loses 617 hitpoints due to your attack. 
23:28:39 A darklight source loses 705 hitpoints due to your attack. 
23:28:39 A darklight striker loses 605 hitpoints due to your attack. 
23:28:39 A darklight striker loses 605 hitpoints due to your attack. 
23:28:39 A walking pillar loses 1858 hitpoints due to your attack. (poison charm)
23:28:39 Using one of 1070 great fireball runes...
23:28:39 A darklight striker loses 720 hitpoints due to your attack. 
23:28:39 A darklight striker loses 1798 hitpoints due to your attack. (enflame charm)
23:28:39 A darklight striker loses 720 hitpoints due to your attack. 
23:28:39 A darklight striker loses 720 hitpoints due to your attack. 
23:28:39 A walking pillar loses 613 hitpoints due to your attack. 
23:28:39 A darklight source loses 662 hitpoints due to your attack. 
23:28:39 A darklight striker loses 720 hitpoints due to your attack. 
23:28:39 A darklight matter loses 719 hitpoints due to your attack. 
23:28:39 A darklight striker loses 720 hitpoints due to your attack. 
23:28:39 A darklight matter loses 719 hitpoints due to your attack. 
23:28:39 A darklight source loses 662 hitpoints due to your attack. 
23:28:39 A darklight source loses 662 hitpoints due to your attack. 
23:28:39 Using one of 2512 ultimate spirit potions...
23:28:39 Using one of 2512 ultimate spirit potions...

--- LOCAL CHAT (linhas brutas, 23:28:34–23:28:39) ---
23:28:34 Mazzeriin [2609]: exura gran san
23:28:34 Uhaacz [2574]: exura gran mas res
23:28:34 Mazzeriin [2609]: exevo tempo mas san
23:28:35 Majorowa [2480]: exura med ico
23:28:35 Mazzeriin [2609]: exura gran san
23:28:35 Nightt Gaze [2391]: exevo gran flam hur
23:28:35 Majorowa [2480]: exori
23:28:35 Uhaacz [2574]: exura sio "Majorowa"
23:28:36 Majorowa [2480]: exura med ico
23:28:36 Mazzeriin [2609]: exura gran san
23:28:37 Uhaacz [2574]: exura sio "Majorowa"
23:28:37 Majorowa [2480]: exura med ico
23:28:37 Mazzeriin [2609]: exevo mas san
23:28:37 Majorowa [2480]: exeta amp res
23:28:37 Uhaacz [2574]: utamo vita
23:28:37 Mazzeriin [2609]: exura gran san
23:28:37 Nightt Gaze [2391]: exevo vis hur
23:28:37 Majorowa [2480]: exori mas
23:28:38 Majorowa [2480]: exura med ico
23:28:38 Uhaacz [2574]: exura gran mas res
23:28:38 Mazzeriin [2609]: exura gran san
23:28:39 Majorowa [2480]: exura med ico
23:28:39 Uhaacz [2574]: exura sio "Majorowa"
23:28:39 Majorowa [2480]: exeta amp res
23:28:39 Mazzeriin [2609]: exura gran san
23:28:39 Nightt Gaze [2391]: exevo gran flam hur
23:28:39 Majorowa [2480]: exori amp kor

--- CLASSIFICAÇÃO PARSEADA (turno 23:28:36) ---
comp: arrow=11 spell=16 rune=0 grenade=15  | Divine Caldera (exevo mas san)
   0  23:28:36.270  darklight striker      dmg=  747 base=  747  arrow   
   1  23:28:36.271  darklight striker      dmg=  778 base=  778  arrow   
   2  23:28:36.272  darklight striker      dmg=  777 base=  777  arrow   
   3  23:28:36.273  darklight striker      dmg=  769 base=  769  arrow   
   4  23:28:36.274  darklight source       dmg=  930 base=  930  arrow   
   5  23:28:36.275  walking pillar         dmg=  925 base=  925  arrow   
   6  23:28:36.276  darklight source       dmg=  913 base=  913  arrow   
   7  23:28:36.277  darklight striker      dmg=  800 base=  800  arrow   
   8  23:28:36.278  darklight striker      dmg=  524 base=  524  arrow    (overkill)
   9  23:28:36.280  darklight matter       dmg=  967 base=  967  arrow   
  10  23:28:36.281  walking pillar         dmg=  962 base=  962  arrow   
  11  23:28:37.282  darklight source       dmg=  872 base=  872  spell   
  12  23:28:37.283  darklight striker      dmg=  804 base=  804  spell   
  13  23:28:37.285  darklight striker      dmg=  804 base=  804  spell   
  14  23:28:37.286  walking pillar         dmg=  875 base=  875  spell   
  15  23:28:37.287  darklight striker      dmg=  804 base=  804  spell   
  16  23:28:37.288  darklight source       dmg=  872 base=  872  spell   
  17  23:28:37.289  darklight striker      dmg=  804 base=  804  spell   
  18  23:28:37.290  darklight striker      dmg=  804 base=  804  spell   
  19  23:28:37.291  darklight matter       dmg=  871 base=  871  spell   
  20  23:28:37.292  darklight matter       dmg=  871 base=  871  spell   
  21  23:28:37.294  walking pillar         dmg=  875 base=  875  spell   
  22  23:28:37.295  darklight striker      dmg=  804 base=  804  spell   
  23  23:28:37.296  darklight source       dmg=  872 base=  872  spell   
  24  23:28:37.297  darklight source       dmg=  872 base=  872  spell   
  25  23:28:37.299  walking pillar         dmg=  875 base=  875  spell   
  26  23:28:37.301  walking pillar         dmg=  875 base=  875  spell   
  27  23:28:37.302  walking pillar         dmg= 1154 base= 1154  grenade 
  28  23:28:37.303  darklight striker      dmg= 1060 base= 1060  grenade 
  29  23:28:37.304  walking pillar         dmg= 1154 base= 1154  grenade 
  30  23:28:37.305  darklight striker      dmg= 1060 base= 1060  grenade 
  31  23:28:37.306  darklight striker      dmg= 1060 base= 1060  grenade 
  32  23:28:37.307  darklight matter       dmg= 1149 base= 1149  grenade 
  33  23:28:37.308  darklight striker      dmg= 1060 base= 1060  grenade 
  34  23:28:37.309  darklight striker      dmg= 1060 base= 1060  grenade 
  35  23:28:37.310  darklight source       dmg=  519 base=  519  grenade  (overkill)
  36  23:28:37.312  darklight source       dmg= 1150 base= 1150  grenade 
  37  23:28:37.313  darklight matter       dmg= 1149 base= 1149  grenade 
  38  23:28:37.315  darklight matter       dmg= 1149 base= 1149  grenade 
  39  23:28:37.316  darklight source       dmg= 1150 base= 1150  grenade 
  40  23:28:37.318  walking pillar         dmg= 1154 base= 1154  grenade 
  41  23:28:37.319  walking pillar         dmg= 1154 base= 1154  grenade  (overkill)
