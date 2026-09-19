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

Before local turn classification, the engine SHALL compare deterministic charm
procs with and without Bounty while holding mob, charm, EW, Prey, and every
other known damage-modifier state constant. It SHALL use the canonical charm
witness evaluator shared with GravSan and the existing C-012a/M-036 witness
floor. It SHALL accept a Bounty Damage level only when discrete round-trip
comparison yields one unique winner across all valid strata.

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

- **GIVEN** a comparable group contains a repeated dominant proc value
- **AND** isolated lower values are compatible with overkill truncation
- **WHEN** the witness is formed
- **THEN** the deterministic dominant cluster is used
- **AND** an isolated lower proc cannot become the baseline

#### Scenario: Insufficient or conflicting charm evidence remains unknown

- **GIVEN** a comparable side lacks the existing minimum witness count
- **OR** valid strata select different levels
- **WHEN** Damage setup is inferred
- **THEN** charm evidence does not resolve the level
- **AND** candidate order is not used as a tiebreaker

### Requirement: Damage fallback SHALL be candidate-independent

If comparable charm evidence cannot resolve Damage, every fallback SHALL use only evidence frozen independently of the candidate, including a deterministic area component with marked and unmarked hits or Mana Leech whose `N` is already known independently. Candidate-dependent classifications and samples promoted to gold after applying that candidate SHALL NOT vote for it.

For a deterministic area component, the unmarked hits alone SHALL establish the common original before any Bounty candidate is applied. Because the partition was frozen while the marked originals were absent evidence, only the repeated modal value (at least two identical procs) of each marked `(mob, state)` group SHALL vote; a minority value below the modal is capped-low or a misplaced hit and MUST NOT vote, a minority value above the modal or a tied top leaves the whole component without a vote, and an unrepeated marked value MUST NOT vote. Each voting marked hit SHALL then be reversed under the candidate and compared with that frozen original, accepting the per-hit cross-mob rounding residue of S-004a (`ELEMENTAL_INTERMEDIATE_TOLERANCE`, one original point). A marked hit whose original remains unknown MUST NOT disqualify the component and MUST NOT count as a fit; the component votes only when at least one marked hit is usable. A level SHALL be accepted only with at least one fit, zero contradictions, and no other zero-contradiction level.

`overpower charm` MUST NOT be used to infer Bounty Damage because its base is not fixed by mob HP.

#### Scenario: Mixed Terra Wave confirms level 26

- **GIVEN** the Terra Wave at `13:39:15` has unmarked hits that reverse to original 1290
- **AND** its marked 1598 hits reverse to intervals 1292–1293 at level 25, 1289–1290 at level 26, and 1286–1287 at level 27
- **WHEN** the common-original fallback is evaluated
- **THEN** only level 26 is compatible with original 1290

#### Scenario: drone ingol resolves Damage level 25 and Life level 5

- **GIVEN** `drone ingol` S0 has Bounty only on `boar man`, whose only charm is `overpower`
- **AND** BM `+4%` and the `boar man` table are confirmed without Bounty by the Caldera at `18:34:58` (unmarked `boar man 885`, `liodile 927`, `carnivostrich 969`, `harpy 810` share original 744)
- **WHEN** the frozen-component fallback votes with repeated modal marked values and the S-004a residue
- **THEN** level 25 fits 30 components with zero contradictions while levels 24 and 26 are contradicted
- **AND** Bounty Damage is level 25 (`+12.5%`) and the joint life inference yields Bounty Life level 5 (`+5%`)

#### Scenario: Misplaced marked hit does not vote

- **GIVEN** the frozen Caldera at `18:28:23` holds marked `boar man 831 ×3` and a variable AA hit `boar man 708`
- **WHEN** the fallback selects the voting marked hits
- **THEN** only the repeated modal `831` votes and `708` is ignored as below-modal minority

#### Scenario: Candidate-created gold sample is rejected

- **GIVEN** an observation becomes exact only after a candidate changes its classification, cardinality, or eligibility
- **WHEN** that same candidate is scored
- **THEN** the observation cannot vote for the candidate

#### Scenario: Unknown marked original abstains

- **GIVEN** the unmarked hits of a deterministic Caldera or Barrage share one original
- **AND** one marked hit cannot be reversed under a candidate
- **WHEN** that candidate is scored
- **THEN** the unknown marked hit MUST NOT contradict the candidate
- **AND** another usable marked hit is required for the component to vote

#### Scenario: No independent winner preserves unknown

- **GIVEN** neither comparable charm nor candidate-independent fallback yields one unanimous winner
- **WHEN** the session setup is built
- **THEN** Bounty Damage remains `unknown`
- **AND** no historical default or fewest-contradictions candidate is applied

#### Scenario: Overpower is not a Bounty percentage witness

- **GIVEN** all Bounty-marked charm events in `drone ingol` are `overpower charm`
- **WHEN** Bounty Damage is inferred
- **THEN** those events MUST NOT vote for a level
- **AND** only independent deterministic spell evidence may decide the axis

### Requirement: Bounty Life SHALL be inferred only after Damage

The engine SHALL fix or preserve unknown Bounty Damage before evaluating
Bounty Life. With Damage known, it SHALL normalize marked damage and jointly
evaluate base Life Leech, per-mob Vampiric Embrace, and the official Bounty Life
grid. A Damage level SHALL NOT imply a Life level.

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

