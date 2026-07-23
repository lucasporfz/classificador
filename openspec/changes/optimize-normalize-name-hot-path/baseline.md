# Baseline - 23/Jul/2026

## Profile

- Fixture: `thunder arrow Server Log.txt` / `thunder arrow Local Chat.txt`.
- CPU-profiled command: `node --cpu-prof tools/gabarito-unified.mjs --only thunder-arrow`.
- Profile duration: 31.609 seconds; command wall time: 32.329 seconds.
- Samples: 11,452.
- `normalizeName`: 990 self samples (8.64%).
- whitespace regular expression inside normalization: 154 self samples (1.34%).

## Targeted Fingerprints

- `thunder-arrow/18:52:46`: `6b81fbb7d59d347d895238a40abe099669c33000233b112d1ab305d425c59e5b`
- `thunder-arrow/18:52:44`: `ad4692bf8dd77a28b35ea50b6dd392a6a119fb754acf6d3ab9bd88cca3c8f073`
- `thunder-arrow/18:52:42`: `ea8bbc14920fa242d059d7b00093b907fbc0085584051c23ae0cba3b090dcce1`

## Acceptance

- All targeted fingerprints remain identical.
- Scoped and full dumps have zero classification drift.
- Existing golden failures remain the only failures.
- Median targeted runtime improves beyond normal measurement noise; otherwise the implementation is reverted.

## Result

- Targeted fingerprints remained identical for all three protected thunder-arrow turns.
- Scoped dump SHA-256 matched before and after: `882C6E63A803E6676804C6D07DACAF745829CD04779BEF3D70E4D11253B881AD`.
- Full dumps were byte-identical at 1,676,756 bytes with SHA-256 `8F3192E70B0AC5595ADCB7991B4F88A889CFB29CCE9D954131A620211E0ED7AA`.
- Targeted gabarito passed 3/3.
- Full direct gabarito remained 120/124 with the same four pre-existing failures.
- Mandatory checks remained at the documented baseline failure set. The count moved from 10/14 to 10/15 only because the new normalization test passed as an additional target.
- Median protected-session runtime improved from 26.332 seconds to 23.416 seconds, an 11.1% reduction.
- CPU self-samples for normalization fell from 8.64% plus 1.34% in its whitespace regex to 5.56%; the regex no longer appeared as a top self-time frame.
- Independent rollback point before this engine checkpoint: commit `a67eab2`.
