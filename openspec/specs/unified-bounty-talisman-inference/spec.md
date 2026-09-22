# unified-bounty-talisman-inference Specification

## Purpose
TBD - created by archiving change infer-bounty-talisman-session-effects. Update Purpose after archive.
## Requirements
### Requirement: Bounty facts SHALL remain independent from other modifiers

The Unified parser SHALL preserve the observed
`Bounty Talisman Effect: More Damage Dealt` suffix as one independent per-hit
Bounty fact. It SHALL NOT invent a separate Life Leech suffix, infer either
Bounty level in the parser, or treat Bounty as active Prey, Expose Weakness,
GravSan, Vampiric Embrace, Void's Call, or Bonus Loot.

#### Scenario: Bounty Damage does not activate Prey

- **WHEN** a hit contains `Bounty Talisman Effect: More Damage Dealt`
- **AND** the hit does not contain `active prey bonus`
- **THEN** the hit is marked as Bounty Damage
- **AND** the fixed Prey multiplier is not applied

#### Scenario: Observed fact and inferred axes are independent

- **WHEN** a hit contains the observed Bounty suffix
- **THEN** the parser records one Bounty fact for that hit
- **AND** Damage and Life levels remain independent setup inferences
- **AND** neither inferred level implies or copies the other

### Requirement: Bounty levels SHALL use the official discrete grid

The engine SHALL enumerate each Bounty axis independently from the official
level grid: 2.5% at level 0, plus 0.5 percentage point per level through level
15, then plus 0.25 percentage point per level. It SHALL NOT use a continuous
fit, copy one axis to the other, or select a level by candidate order.

#### Scenario: Known grid points

- **WHEN** the level grid is generated
- **THEN** level 0 is 2.5%
- **AND** level 14 is 9.5%
- **AND** level 15 is 10%
- **AND** level 16 is 10.25%
- **AND** level 25 is 12.5%
- **AND** level 26 is 12.75%

### Requirement: Comparable charm witnesses SHALL be the primary Damage source

The engine SHALL use offensive charm damage as the primary Bounty Damage witness before local turn classification. For each `(mob, charm, pierce state)` row it SHALL model every non-excluded proc as `FLOOR(FLOOR(A × P_bounty) × P_gravsan)` over a shared integer post-mitigation base `A`, with FLOOR/CEIL round-trip hypotheses. It SHALL accept procs with and without Bounty, and procs inside `utevo grav san` windows once the session tier is resolved; it SHALL NOT require a minimum count of unmarked procs in the same state. When table `hitpoints` exist, the predicted `A = FLOOR(ROUND_E(hitpoints × 0.05 × m) × mitigation) × class` SHALL also vote, but only if the mob's bestiary class bonus is known (including proven absence) or the joint enumeration of class candidates `{0} ∪ M-036 grid` × Bounty levels leaves a single pair. The engine SHALL accept a level only when all discriminating rows and readings yield one unanimous unique winner.

#### Scenario: Poison charm without EW selects level 26

- **GIVEN** the dominant comparable poison-charm values are 2089 without
  Bounty and 2355 with Bounty
- **WHEN** the official grid is evaluated by discrete round-trip
- **THEN** level 26 reproduces the marked value
- **AND** levels 25 and 27 do not

#### Scenario: Poison charm with EW independently selects level 26

- **GIVEN** the dominant comparable poison-charm values are 2161 without
  Bounty and 2436 with Bounty
- **WHEN** the official grid is evaluated by discrete round-trip
- **THEN** level 26 reproduces the marked value
- **AND** the EW and non-EW strata agree

#### Scenario: Truncated proc does not replace the dominant witness

- **GIVEN** a row state (marked or not, inside a grav san window or not) whose
  most repeated value is consistent
- **AND** minority values below that modal value
- **WHEN** the witness is formed
- **THEN** only the modal value of the state votes
- **AND** the lower procs are excluded as truncation and cannot become the baseline

#### Scenario: Minority level above the modal value does not veto

- **GIVEN** `uhax 3` S1 `walking pillar | poison | EW` with 39 unmarked procs at
  2161, 177 marked at 2436 and 2 unmarked at 3891
- **WHEN** the common-base reading is evaluated
- **THEN** the 3891 procs are excluded as an unmodeled level and reported
- **AND** level 26 remains the unique level of the row

#### Scenario: Drone bounty common base selects level 25 for any class

- **GIVEN** `drone bounty` S0 wound charm on `converter`: marked 1891 (no EW)
  and 1954 (EW), marked inside grav san 2117 and 2188, unmarked inside grav san
  1882 and 1945, with grav san tier 12% resolved
- **WHEN** the common-base reading is evaluated
- **THEN** only level 25 admits a shared base, `A = 1681` without EW and
  `A = 1737` with EW
- **AND** the result does not depend on the bestiary class bonus

#### Scenario: Drone bounty HP anchor agrees without controls

- **GIVEN** only the marked procs outside grav san, 1891 and 1954, and
  `converter` with `hitpoints 29600`, mitigation 5.31 and physical mod 1.2
- **WHEN** the joint enumeration of class candidates and levels is evaluated
- **THEN** the only compatible pair is class bonus 0 and level 25
- **AND** levels 24 and 26 predict 1887/1950 and 1896/1959

#### Scenario: Class confound without unmarked procs abstains

- **GIVEN** a mob whose charm procs are all marked
- **AND** its class bonus is unknown
- **AND** more than one `(class, level)` pair reproduces the procs
- **WHEN** Damage is inferred
- **THEN** the HP anchor does not vote
- **AND** Bounty Damage remains `unknown` unless another row decides it

#### Scenario: Unresolved grav san tier excludes window procs

- **GIVEN** charm procs inside `utevo grav san` windows
- **AND** the session grav san tier is not resolved
- **WHEN** the witness is formed
- **THEN** those procs do not vote

#### Scenario: Conflicting rows remain unknown

- **GIVEN** valid rows or readings select different levels
- **WHEN** Damage setup is inferred
- **THEN** Bounty Damage remains `unknown`
- **AND** candidate order is not used as a tiebreaker

### Requirement: Damage fallback SHALL be candidate-independent

If the charm witness cannot resolve Damage, every fallback SHALL use only evidence frozen independently of the candidate, including a deterministic area component with marked and unmarked hits or Mana Leech whose `N` is already known independently. Candidate-dependent classifications and samples promoted to gold after applying that candidate SHALL NOT vote for it. A component SHALL vote only when its unmarked hits alone already share a common original with no candidate applied; the unknown originals of its marked hits MUST NOT disqualify it. A level SHALL be accepted only with at least one fit, zero contradictions and no other zero-contradiction level; ranking by fewest contradictions MUST NOT select a level.

#### Scenario: Mixed Terra Wave confirms level 26

- **GIVEN** the Terra Wave at `13:39:15` has unmarked hits that reverse to
  original 1290
- **AND** its marked 1598 hits reverse to intervals 1292–1293 at level 25,
  1289–1290 at level 26, and 1286–1287 at level 27
- **WHEN** the common-original fallback is evaluated
- **THEN** only level 26 is compatible with original 1290

#### Scenario: Candidate-created gold sample is rejected

- **GIVEN** an observation becomes exact only after a candidate changes its
  classification, cardinality, or eligibility
- **WHEN** that same candidate is scored
- **THEN** the observation cannot vote for the candidate

#### Scenario: No independent winner preserves unknown

- **GIVEN** neither the charm witness nor candidate-independent fallback yields
  one winner
- **WHEN** the session setup is built
- **THEN** Bounty Damage remains `unknown`
- **AND** no historical default is applied

#### Scenario: Impure component does not vote

- **GIVEN** a first-pass component whose unmarked hits share no common original,
  such as `drone bounty` `06:57:14` Divine Caldera with `darklight construct`
  818 and 927
- **WHEN** the fallback collects evidence
- **THEN** that component does not vote

#### Scenario: Majority without unanimity preserves unknown

- **GIVEN** the best level fits 40 components and contradicts 35
- **WHEN** the fallback verdict is taken
- **THEN** the fallback does not accept that level
- **AND** the ranked candidates are kept only as diagnostics

### Requirement: Bounty Life SHALL be inferred only after Damage

The engine SHALL fix or preserve unknown Bounty Damage before evaluating Bounty Life. With Damage known, it SHALL normalize marked damage and jointly evaluate base Life Leech, per-mob Vampiric Embrace, and the official Bounty Life grid. A Damage level SHALL NOT imply a Life level. When the Vampiric Embrace candidate mob also carries the Bounty mark, the charm SHALL be scored only from that mob's unmarked hits; if they cannot discriminate the charm, Bounty Life SHALL remain `unknown`.

#### Scenario: Uhax 3 S1 resolves independent levels

- **GIVEN** primary Damage witnesses select level 26
- **AND** four independent unit AAs observe `(damage, life)` as
  `(155,47)`, `(246,75)`, `(136,42)`, and `(218,66)`
- **WHEN** damage is normalized and Life candidates 14, 15, and 16 are scored
- **THEN** level 15 is the unique candidate reproducing all four observations
- **AND** the session setup records Damage level 26 and Life level 15

#### Scenario: Session without Bounty does not inherit levels

- **GIVEN** another session has no observed Bounty suffix
- **WHEN** its setup is built
- **THEN** it does not inherit level 26 or level 15 from `uhax 3` S1

#### Scenario: Unknown Damage keeps Life unknown

- **GIVEN** Bounty Damage is `unknown`
- **WHEN** the leech setup is built
- **THEN** Bounty Life remains `unknown` with reason `bounty_damage_axis_unknown`

#### Scenario: Vampiric Embrace on the marked mob uses only unmarked hits

- **GIVEN** `drone bounty` S0 with Damage level 25, where `converter` is both
  the only marked mob (613 of 644 hits) and the Vampiric Embrace candidate
- **WHEN** Life and the charm are scored jointly
- **THEN** marked `converter` hits do not vote for the charm bonus
- **AND** with only 3 unmarked `converter` life observations, below the D-021a
  floor of 20 observations in 3 turns, Bounty Life remains `unknown` with source
  `bounty_life_vampiric_confound`
- **AND** the life channel of marked hits abstains in leech validation while the
  mana channel keeps validating

### Requirement: Inferred effects SHALL apply only to marked hits

Known Bounty Damage SHALL normalize only hits carrying the observed Bounty
mark. Known Bounty Life SHALL augment only those same marked hits, but SHALL use
its independently inferred level. EW, Prey, GravSan, base leech, and minor
charms SHALL remain separate terms.

#### Scenario: Damage level 26 reproduces both charm strata

- **GIVEN** `uhax 3` S1 Damage level 26 is known
- **WHEN** the Bounty multiplier is applied
- **THEN** 2089 maps to displayed 2355 without EW
- **AND** 2161 maps to displayed 2436 with EW
- **AND** unmarked hits receive no Bounty multiplier

#### Scenario: Life level 15 reproduces unit and area evidence

- **GIVEN** Damage level 26 and Life level 15 are known
- **WHEN** Bounty Life is evaluated
- **THEN** the four unit AAs reproduce 47, 75, 42, and 66 exactly
- **AND** the `13:39:15` Terra Wave with independently known `N=7` reproduces
  Life 111
- **AND** its Mana channel remains unchanged

#### Scenario: EW Mana remains a separate capped-low observation

- **GIVEN** the pre-cutoff AA at `13:36:13` has EW
- **WHEN** its Mana observation is evaluated
- **THEN** the pre-cutoff EW adjustment of D-022a is retained
- **AND** observed Mana 24 is treated as capped-low rather than exact 17% proof
- **AND** it cannot decide the Bounty level

### Requirement: Target classification SHALL consume rather than create setup

The session Bounty setup SHALL be resolved from global independent evidence
before classifying `uhax 3` S1 `13:34:21`. The target turn SHALL NOT contribute
candidate-dependent evidence to the setup that is then used to classify itself.

#### Scenario: Great Fireball keeps its virtual hit

- **GIVEN** `uhax 3` S1 setup has Damage level 26 and Life level 15
- **WHEN** turn `13:34:21` is classified
- **THEN** the result is `A0 S0 R12 G0`
- **AND** Great Fireball has 11 observed hits
- **AND** one additional hit is virtual and justified by cardinality

### Requirement: Unknown Bounty Damage SHALL abstain in leech validation

Leech validation SHALL treat the **Life** channel of a Bounty-marked hit as absent evidence (D-006/C-007) when Bounty Damage is `unknown`, and SHALL NOT validate or reject `N_leech` using the displayed damage as the base. The **Mana** channel of such a hit SHALL be used only as an upper bound: every Bounty level grants at least `bountyBonus(0) = 2,5%`, which only divides the leech basis, and Bounty Life never affects Mana. A candidate `N` SHALL be refuted when the observed Mana exceeds `CEIL(displayedDamage / 1,025 × manaRate × areaFactor(N))` beyond the D-023 tolerance; otherwise the Mana channel SHALL be neutral. The upper bound SHALL NEVER report `ok` for any `N`. This applies to `observedLeechAcceptsN`, `hitLeechFit` and `leechDeclaredN`. Unmarked hits and marked hits with known Bounty Damage keep their current validation.

#### Scenario: Life stays non-usable

- **GIVEN** a marked hit with Bounty Damage `unknown`
- **WHEN** the Life channel is evaluated for any `N`
- **THEN** it returns non-usable evidence
- **AND** it does not return `ok:false`

#### Scenario: Mana ceiling refutes N greater than one

- **GIVEN** `tom 3` S0 `09:48:42`, `raubritter chastener` 997 marked, Mana 145, Bounty Damage `unknown`, `manaBase` 0,16
- **WHEN** `N = 2` is evaluated
- **THEN** the Mana ceiling `CEIL(997/1,025 × 0,16 × 0,55) = 86` is exceeded and `N = 2` is refuted
- **AND** `N = 1` is neutral, not `ok`

#### Scenario: No raw-damage fallback

- **GIVEN** the official fit for a marked hit uses the Mana ceiling because Bounty Damage is `unknown`
- **WHEN** `hitLeechFit` is evaluated
- **THEN** it never computes an accepting expected leech from `hit.dmg`

#### Scenario: Known Bounty keeps strict validation

- **GIVEN** `uhax 3` S1 with Damage level 26 and Life level 15 known
- **WHEN** marked hits are validated
- **THEN** they are validated against the Bounty-normalized basis
- **AND** the `13:34:21` result remains `A0 S0 R12 G0` with one justified virtual hit

### Requirement: Damage fallback SHALL accept Mana Leech with candidate-independent N

When neither the charm witness nor the deterministic-component fallback resolves Bounty Damage, the fallback SHALL collect marked, non-overkill hits with positive Mana whose `N_leech = 1` is proved by the Mana ceiling of the unknown-Bounty requirement (independent of level and partition). The Mana rate SHALL come from the unmarked hits. For each hit, a level fits when `CEIL(basis / (1 + bountyBonus(L)) × manaRate)` equals the observed Mana, and is admissible when it is at least the observed Mana. Because the known unmodeled noise (alpha perk, capped Mana) only raises the implied level, the verdict SHALL be: `ceiling` = the minimum over hits of each hit's highest admissible level; `level` = the level `≤ ceiling` with the most exact fits (ties → the higher level), requiring at least 3 fits. Otherwise Damage SHALL remain `unknown`. When the level comes from this branch, the leech-free pass SHALL be re-resolved and the leech setup re-inferred, so Bounty Life is measured with the Damage known.

#### Scenario: tom 3 infers level 18

- **GIVEN** `tom 3` S0 `09/Sep/2026`, with no charm proc on the marked mob and only physical spells
- **WHEN** the Mana fallback runs over the marked first hits with `N = 1` proved by the ceiling
- **THEN** the ceiling is 18, exact fits are L16=10, L17=14, L18=17
- **AND** Bounty Damage is level 18 (`+10,75%`) with source `frozen_mana_leech_ceiling`
- **AND** Bounty Life is then inferred as level 13 (`+9%`)

#### Scenario: Insufficient fits keep unknown

- **GIVEN** fewer than 3 marked hits fit exactly any level at or below the ceiling
- **WHEN** the Mana fallback verdict is taken
- **THEN** Bounty Damage remains `unknown`
