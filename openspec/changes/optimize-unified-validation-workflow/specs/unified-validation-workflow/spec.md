## ADDED Requirements

### Requirement: Canonical shared golden cases
The validation workflow SHALL expose shared Unified golden cases from a side-effect-free catalog so every mandatory golden executor can discover the same mechanics without duplicating expected classification data.

#### Scenario: New mechanic is registered once
- **WHEN** a golden case for a new classifier mechanic is added to the shared catalog
- **THEN** every mandatory golden executor discovers and runs that case through its existing result adapter

### Requirement: Classify each session once per execution
Each Unified golden harness SHALL classify each unique fixture session and classification-options combination at most once during one process execution, regardless of how many golden cases target that session.

#### Scenario: Multiple cases target one session
- **WHEN** two or more golden cases reference different turns in the same paired session with the same options
- **THEN** the harness performs one Unified classification and evaluates every referenced turn from that result

### Requirement: Golden session prefilter
The experimental golden harness SHALL avoid classifying a paired session when its raw Server Log does not contain any timestamp requested by the selected golden cases, while exhaustive audits and invariants SHALL retain their full fixture scope.

#### Scenario: Selected cases target one session in a multi-session fixture
- **WHEN** the selected golden cases reference timestamps present in only one paired Server Log session
- **THEN** the harness classifies that session and skips other paired sessions without changing the selected cases' results or order

### Requirement: Zero classification drift
Performance-only validation workflow changes MUST preserve the status, ordered components, concrete action labels, hit membership, virtual-hit membership, and cast assignment of every golden turn.

#### Scenario: Cached and uncached execution are compared
- **WHEN** the same golden corpus is evaluated through the baseline and optimized workflows
- **THEN** their classification fingerprints are identical for every golden turn

### Requirement: Reversible checkpoints
Each optimization SHALL be independently removable without requiring changes to classifier rules, expected golden results, or unrelated optimizations.

#### Scenario: Optimization fails a gate
- **WHEN** an optimization changes a fingerprint or fails to provide measurable benefit
- **THEN** that optimization can be reverted while previously accepted checkpoints remain intact

### Requirement: Single owner for exhaustive invariants
Exhaustive mechanical invariant checks SHALL be owned by the invariants mode and SHALL NOT trigger duplicate full-fixture classifications from the curated golden mode.

#### Scenario: Mandatory validation runs golden cases and invariants
- **WHEN** the mandatory runner executes both modes
- **THEN** curated cases run in the golden mode and every exhaustive invariant runs once in the invariants mode

### Requirement: Scoped correction validation
The mandatory validation runner SHALL support an explicit substring filter for exactly one selected mode, forwarding that scope to golden cases, invariant fixtures, or discovered tests without changing unfiltered execution.

#### Scenario: Developer validates one affected fixture
- **WHEN** the runner is invoked with one mode and `--match <substring>`
- **THEN** only matching cases, fixtures, or test filenames execute and an empty match fails instead of reporting a vacuous success
