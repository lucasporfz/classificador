## Why

The protected workload calls `minimalCandidateCluster` about 30 thousand times
and performs about 4.4 million linear nearest-value comparisons. The current CPU
profile attributes 4.56% of samples to this implementation after earlier hot
paths were reduced.

## What Changes

- Find the nearest value in each sorted candidate set with binary search while
  preserving the lower-value tie break.
- Preserve repeated-anchor evaluation order and add deterministic
  reference-equivalence coverage for edge cases and generated candidate sets.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-classification-performance`: Reduce repeated candidate-cluster search
  work without changing the selected cluster.

## Impact

- Production change is local to `minimalCandidateCluster` in
  `js/unified-validation.js`.
- No classification rule, threshold, candidate, output, UI or dependency
  changes.
