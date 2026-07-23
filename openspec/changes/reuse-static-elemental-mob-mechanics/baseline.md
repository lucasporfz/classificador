# Baseline - 23/Jul/2026

- Rollback point: `84a0d8f`.
- `elementalOriginalCandidates`: about 1.94 million executions.
- `effectiveMod`: about 2.51 million executions and 6.58% of protected CPU samples.
- `mitigationMultiplier` / `f16round`: about 2.51 million executions; `f16round` is 2.62% of protected CPU samples.
- Protected median: 18.555 seconds.
- Full dump SHA-256: `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.

## Result

- `elementalOriginalCandidates` remained at about 1.94 million executions.
- `effectiveMod`, `mitigationMultiplier` and `f16round` fell to about 562 thousand
  executions, a 77.6% reduction in repeated static elemental work.
- Instrumented protected runtime fell from about 64.0 to 39.2 seconds.
- Protected median fell from 18.555 to 16.784 seconds, a 9.5% improvement.
- Protected dump remained byte-identical:
  `882C6E63A803E6676804C6D07DACAF745829CD04779BEF3D70E4D11253B881AD`.
- Full dump remained byte-identical:
  `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.
- Full dump runtime remained effectively unchanged at about 1,355 seconds.
- Direct gabarito remained at 120/124 with the same four pre-existing failures.
- Mandatory checks finished at 14/18 targets with only the four documented
  pre-existing target failures; invariants and focused cache tests passed.
- Rollback point before this optimization: `84a0d8f`.
