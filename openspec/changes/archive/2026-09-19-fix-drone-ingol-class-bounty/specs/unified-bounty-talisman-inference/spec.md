## MODIFIED Requirements

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
