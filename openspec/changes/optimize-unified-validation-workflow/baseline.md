# Baseline - 22/Jul/2026

## Targeted golden behavior

- `node tools/gabarito-unified.mjs --only barrage/19:00:38`
  - Result: `PASS barrage/19:00:38`, `1/1 gabarito-unified ok`.
  - Wall time: 9.054 seconds.
- `node tools/gabarito-unified.mjs --only thunder-arrow`
  - Result: `0/0 gabarito-unified ok`.
  - The direct harness does not discover the three new elemental-ammunition cases.
- `tools/unified-experimental.mjs`
  - Contains three thunder-arrow cases: `18:52:42`, `18:52:44`, `18:52:46`.

## Classifier reference

- Direct `thunder arrow` classification: 210 turns, 7 unresolved, `aaElement=energy`.
- Classification wall time: 22.151 seconds in the stock runtime measurement.
- Stable turn/component/action signature SHA-256:
  `9f93ac6c21097b8c2cb89a4f6117ea2d1200e469e93e55218c5387011c1dfbf8`.

## Acceptance

- Existing golden cases must retain their results and order.
- The three shared thunder-arrow cases must pass in both golden executors.
- Cached and uncached classifications must have identical classification fingerprints.

## Checkpoint R2 Results

- `thunder-arrow` cached: 3 requests, 1 classification, 2 cache hits; 21.226-21.437 seconds on repeated warm measurements.
- `thunder-arrow` uncached: 3 requests, 3 classifications; 63.647 seconds.
- `barrage/19:*` cached: 5 requests, 1 classification, 4 cache hits; 9.052 seconds.
- `barrage/19:*` uncached: 5 requests, 5 classifications; 43.699 seconds.
- All three thunder-arrow fingerprints and all five barrage fingerprints were identical between cached and uncached execution.
- Full direct golden run: 120/124 passed in 534.587 seconds; the four failures are the documented pre-existing `essence/00:21:12`, `essence/00:21:14`, `essence/00:23:29`, and `mk/05:42:01` cases.
- Full direct golden cache activity: 124 requests, 28 classifications, 96 cache hits, and 139 session classifications avoided by raw-timestamp prefiltering.
- `node tools/run-unified-checks.mjs --tests`: 8/11 passed; only the three documented pre-existing failures remained.
- `node tools/run-unified-checks.mjs --invariants`: 1/1 passed in 659.2 seconds.
- `node tools/run-unified-checks.mjs --gabarito`: exceeded the 900-second command limit while running the unfiltered experimental golden suite.
- Filtered shared-case verification: both golden executors passed all three thunder-arrow cases; experimental completed in 29.8 seconds and direct completed in 30.0 seconds with one classification and two cache hits.

## Checkpoint R3 Results

- Experimental `barrage` filtered: 20/20 passed with 3 expected out-of-scope skips; 4 session classifications, 11 sessions skipped, 47.414 seconds.
- Experimental `barrage` unfiltered compatibility mode: identical case output; 15 session classifications, 0 skipped, 614.337 seconds.
- Targeted speedup: 12.96x with 73.3% fewer session classifications.
- Full mandatory experimental gabarito: completed in 878.54 seconds instead of exceeding the 900-second limit; all seven failures exactly match prior baseline reports.
- Post-change tests: 8/11 passed; only `experimental-ui-parity`, `mob-element-regime`, and `unified-spiritual-outburst-multistage` retained their documented failures.
- Post-change invariants: 1/1 passed in 688.355 seconds with exhaustive fixture scope unchanged.

## Rejected Experiment: Reused `vm.Script`

- Compiling the ten browser-shared sources once and reusing `vm.Script` across fresh contexts preserved the three thunder-arrow outputs but measured 38.6-70.8 seconds and did not demonstrate an improvement over the earlier 25.9-second baseline.
- A later restored-code run also measured 67.9 seconds, showing substantial environmental slowdown. The experiment was fully reverted because no reliable gain was demonstrated; per-context source loading remains unchanged.

## Checkpoint R4 Results

- The removed `audit/bakradrone`, `audit/highwin2`, and `audit/bastion` checks were a strict subset of `turnInvariantViolations`; canonical invariants additionally cover T-006, M-024, and M-025.
- Full curated experimental gabarito: 878.54 -> 660.266 seconds, a 24.8% reduction.
- Curated output retained 74 passes, the same seven documented failures, and the same three out-of-scope skips; only the three duplicate audit PASS lines were removed.
- The curated run classified 29 sessions and skipped 41 irrelevant sessions across 18 fixture queries.
- The latest exhaustive invariant run remains 1/1 passing at 688.355 seconds; its implementation and fixture list were not changed by audit removal.
- Based on measured isolated stages, mandatory validation falls from approximately 1,637 to 1,419 seconds, a 13.3% total reduction.

## Rejected Experiment: Early Exhaustive Cache Release

- Releasing paired logs and session models after every invariant fixture failed to improve the 688.355-second baseline and timed out beyond 900 seconds while the environment was degraded.
- Cache-lifetime changes were fully reverted. The unrelated unused preliminary `sessionPairs` call in standalone audit was removed because `modelForPair` already performs and handles pairing.

## Checkpoint R5 Results

- `run-unified-checks --gabarito --match thunder-arrow`: 1/1 target passed in 41.612 seconds, covering all three shared cases.
- `run-unified-checks --invariants --match hakka`: 1/1 fixture target passed in 8.289 seconds.
- `run-unified-checks --tests --match classification-fingerprint`: 1/1 test passed in the scoped CLI verification.
- Missing values, unknown flags, empty test matches, match without a mode, and match with multiple modes all fail instead of returning a vacuous success.
- Unfiltered test discovery retained every previous test and the same three documented failures; after adding the CLI contract test the expected summary becomes 9/12 targets passing.
