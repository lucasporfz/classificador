## Context

`minimalCandidateCluster` receives one candidate set per hit and selects the
smallest span obtained by anchoring on every candidate value. Candidate sets are
normalized into sorted unique integers, but the current implementation scans
every value to find the nearest one.

## Goals / Non-Goals

**Goals:**

- Preserve the exact returned `min`, `max`, `span`, `center` and `chosen` values.
- Reduce nearest-value comparisons.
- Keep the change local to the canonical cluster function.

**Non-Goals:**

- Change elemental tolerance, reconstruction or classification rules.
- Cache results across calls.
- Change malformed or empty-input behavior.

## Decisions

- Use lower-bound binary search in each sorted candidate set. Compare the
  predecessor and successor, choosing the predecessor on equal distance to
  preserve the existing lower-value tie break.
- Retain repeated anchors, the current best-cluster comparison and the complete
  evaluation order unchanged. Reference testing showed that a repeated anchor
  can affect a later historical tie after intervening bases.
- Test the optimized function against an embedded reference implementation of
  the current algorithm across explicit edge cases and deterministic generated
  sets.

## Risks / Trade-offs

- [A binary-search boundary differs from the linear scan] -> Cover singleton,
  below-range, above-range and equidistant anchors with reference equivalence.
- [Changing anchor order changes a later tie] -> Preserve all repeated anchors
  and compare complete output against the reference over generated inputs.
- [A local benchmark improves but classification drifts] -> Require protected and
  full byte-identical dumps before the rollback commit.
