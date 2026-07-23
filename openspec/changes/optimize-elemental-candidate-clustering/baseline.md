# Baseline - 23/Jul/2026

- Rollback point: `1c65154`.
- `minimalCandidateCluster`: 30,822 executions and 4.56% of protected CPU
  samples.
- Inner nearest-value comparison loop: about 4.4 million executions.
- Protected median: 16.784 seconds.
- Protected dump SHA-256:
  `882C6E63A803E6676804C6D07DACAF745829CD04779BEF3D70E4D11253B881AD`.
- Full dump SHA-256:
  `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.

## Result

- Deterministic reference equivalence passed for explicit edge cases and 2,000
  generated candidate-set combinations.
- `minimalCandidateCluster` fell from 4.56% to 0.76% of protected CPU samples,
  an 83.3% reduction in profile share.
- Wall-clock measurements were discarded because concurrent machine load moved
  identical protected runs between about 17 and 75 seconds.
- Protected A/B output remained byte-identical with SHA-256:
  `5129262A46446754C4ABAD9E3EA70C8D557280E0438C6A48E9A0C92F8F50E4BB`.
- The full corpus was validated in bounded `--pairs` batches after the monolithic
  run exceeded 30 minutes under contention: 34 fixtures, 15,495 classified
  turns and zero line differences against rollback point `1c65154`.
- Direct gabarito remained at 120/124 with the same four pre-existing failures.
- Mandatory checks finished at 15/19 targets. The new equivalence test,
  invariants and all other expected targets passed; only the four documented
  pre-existing target failures remained.
- Rollback point before this optimization: `1c65154`.
