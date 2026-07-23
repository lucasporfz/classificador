## ADDED Requirements

### Requirement: Elemental candidate clustering uses bounded nearest-value search

The Unified engine SHALL locate the nearest value in each normalized sorted
candidate set without scanning values that binary search can exclude, while
preserving repeated-anchor order, the selected cluster and its lower-value tie
break.

#### Scenario: Candidate sets share anchor values

- **WHEN** the same candidate value occurs in multiple hit sets
- **THEN** the engine MUST preserve every occurrence in its historical evaluation
  order

#### Scenario: Anchor is equidistant between two candidates

- **WHEN** the nearest lower and higher candidates have equal distance from an
  anchor
- **THEN** the engine MUST select the lower candidate exactly as before

#### Scenario: Full corpus is classified

- **WHEN** the optimized cluster search processes all Unified fixtures
- **THEN** its dump MUST be byte-identical to rollback point `1c65154`
