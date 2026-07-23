## 1. Baseline And Contract

- [x] 1.1 Capture a CPU profile and targeted runtime for the protected thunder-arrow session
- [x] 1.2 Add focused tests for normalization equivalence across cache hits and cache resets
- [x] 1.3 Record targeted classification fingerprints before implementation

## 2. Bounded Memoization

- [x] 2.1 Add a named cache-size bound beside the canonical normalizeName implementation
- [x] 2.2 Return canonical lowercase ASCII inputs directly and preserve the existing transformation for every other input
- [x] 2.3 Memoize transformed values by the exact pre-normalization string
- [x] 2.4 Clear cached entries at the bound without exposing or coupling cache state to classification context

## 3. Performance And Zero Drift

- [x] 3.1 Compare targeted fingerprints before and after memoization
- [x] 3.2 Measure repeated targeted runtimes and retain only a measurable improvement
- [x] 3.3 Run scoped gabarito and dump checks before the full corpus
- [x] 3.4 Run gabarito-unified, dump-unified and run-unified-checks against documented baseline failures
- [x] 3.5 Record results and the independent rollback point
