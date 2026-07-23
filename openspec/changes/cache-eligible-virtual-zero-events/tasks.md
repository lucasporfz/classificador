## 1. Baseline And Contract

- [x] 1.1 Record the post-normalization CPU profile and protected runtime
- [x] 1.2 Add focused coverage for unchanged-source reuse and source refresh

## 2. Context Eligibility Cache

- [x] 2.1 Add a module-private WeakMap beside the canonical block eligibility function
- [x] 2.2 Cache only the basic `isEligibleVirtualZeroCharm` filtering step
- [x] 2.3 Refresh when source identity or length changes
- [x] 2.4 Preserve all block-specific filters and ordering unchanged

## 3. Performance And Zero Drift

- [x] 3.1 Measure protected runtime and CPU profile
- [x] 3.2 Compare protected gabarito and dump output
- [x] 3.3 Compare the full dump with rollback point `eae4650`
- [x] 3.4 Run mandatory Unified checks against documented baseline failures
- [x] 3.5 Record results and create an independent rollback point
