## 1. Baseline and red tests

- [x] 1.1 Record the pre-edit baseline: 21,287 turns, 125 unresolved, `run-unified-checks` 47/57 with the existing failures preserved
- [x] 1.2 Add a red regression test proving `drone ingol` does not infer `humanoid +2%` from its sole holy line
- [x] 1.3 Add red fallback tests proving controls alone freeze the original, unknown marked hits abstain, and overpower never votes

## 2. Canonical fixes

- [x] 2.1 Update `inferBestiaryClassDamageBonus` so BM-sensitive rows without an immune class witness remain diagnostic but cannot vote
- [x] 2.2 Update `inferBountyDamageFromFrozenComponents` so unmarked controls anchor the original and usable marked hits test each level
- [x] 2.3 Run focused setup tests and diagnose `drone ingol` after both changes

## 3. Gabarito and drift

- [x] 3.1 Add reviewed `drone ingol` setup/turn cases to `tools/gabarito-unified.mjs`
- [x] 3.2 Run the scoped dump and compare every changed `drone ingol` turn against the pre-edit baseline
- [x] 3.3 Run `node tools/run-unified-checks.mjs`; require the same pre-existing failures and no new failure
- [x] 3.4 Write a full dump candidate, compare against the preserved baseline, and do not promote without explicit approval

## 4. Correção do fallback (Bounty conhecido em `drone ingol`)

- [x] 4.1 Diagnosticar as 24 contradições do nível 25: hits variáveis de AA colados à Caldera pela partição congelada e resíduo de 1 ponto entre mobs distintos; BM 4% e tabela do `boar man` confirmados pelo cast sem marca `18:34:58`
- [x] 4.2 Votar só o valor modal repetido de cada `(mob, estado)` marcado e aceitar o resíduo cross-mob de S-004a na comparação marcado × controle
- [x] 4.3 Emendar D-010g em `docs/CLASSIFICATION_RULES.md` com a cláusula e o caso-prova
- [x] 4.4 Trocar as asserções que travavam Bounty desconhecido por Damage 25 / Life 5 e cobrir minoritário e marcado solitário por teste sintético
- [x] 4.5 Aprovação do usuário (18/Sep/2026) para a emenda de D-010g e para o drift de `drone ingol`
