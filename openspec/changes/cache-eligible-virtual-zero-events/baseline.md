# Baseline - 23/Jul/2026

## Profile

- Rollback point: `eae4650`.
- Fixture: `thunder arrow Server Log.txt` / `thunder arrow Local Chat.txt`.
- Profile samples: 10,583 over 27.742 seconds.
- `eligibleVirtualZeroCharmsForBlock`: 832 self samples (7.86%).
- `isEligibleVirtualZeroCharm`: 398 self samples (3.76%).
- Combined basic/block eligibility work: 11.62%.

## Zero-Drift Reference

- Full dump: 1,676,756 bytes.
- SHA-256: `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.

## Acceptance

- Protected gabarito remains 3/3.
- Protected and full dumps remain byte-identical.
- Existing mandatory-check failures remain the only failures.
- Protected runtime improves measurably; otherwise the cache is reverted.

## Result

- Protected gabarito remained 3/3 and the protected dump retained SHA-256 `882C6E63A803E6676804C6D07DACAF745829CD04779BEF3D70E4D11253B881AD`.
- Full dump retained 1,676,756 bytes and SHA-256 `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.
- Protected median runtime fell from 23.416 seconds to 18.501 seconds, a 21.0% reduction.
- Profile duration fell from 27.742 seconds to 19.460 seconds, a 29.9% reduction. Both eligibility functions left the top 15 self-time frames.
- Full dump runtime fell from about 1,433 seconds to 1,289 seconds, a 10.1% reduction.
- Full direct gabarito remained 120/124 with the same four failures and ran in about 499 seconds versus 564 seconds in the prior checkpoint.
- Mandatory checks passed 12/16 targets. The only failures remained the experimental gabarito plus the three documented tests; the new cache test passed.
- Independent rollback point before this checkpoint: commit `eae4650`.
