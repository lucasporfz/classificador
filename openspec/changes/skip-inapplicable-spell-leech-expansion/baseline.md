# Baseline - 23/Jul/2026

- Rollback point: `d6b6a74`.
- Protected gabarito: 3/3.
- Accepted-checkpoint median: 18.501 seconds; current-machine serial median: about 20.9 seconds.
- `leechEffectiveRateCandidates`: 1,887,204 executions.
- `spellLeechBonusOptionsForBlock`: 2,088,648 executions.
- `spellLeechBonusEntryForBlock`: 4,076,574 executions.
- Full dump SHA-256: `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.

## Result

- `leechEffectiveRateCandidates` remained at exactly 1,887,204 executions.
- `spellLeechBonusOptionsForBlock` fell to 894,062 executions, a 57.2% reduction.
- `spellLeechBonusEntryForBlock` fell to 994,784 executions, a 75.6% reduction.
- V8 coverage run time fell from 94.1 seconds to 64.0 seconds.
- Normal protected median fell from the current-machine baseline of about 20.9 seconds to 18.555 seconds, about 11%.
- Protected gabarito remained 3/3 and its dump retained SHA-256 `882C6E63A803E6676804C6D07DACAF745829CD04779BEF3D70E4D11253B881AD`.
- Full dump remained byte-identical at SHA-256 `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.
- The full dump wall time varied upward from about 1,289 seconds to 1,356 seconds in this run; no corpus-wide dump speed claim is made from that sample.
- Direct gabarito remained 120/124 with the same four failures and fell from about 499 seconds to 396 seconds in this run.
- Mandatory checks passed 13/17 targets. The only failures remained the experimental gabarito plus the three documented tests.
- Independent rollback point before this checkpoint: commit `d6b6a74`.
