## 1. Baseline And Contracts

- [x] 1.1 Record current targeted golden outputs and runtimes for one repeated heavy fixture and the new thunder-arrow cases
- [x] 1.2 Add a classification fingerprint helper/test that detects changes in status, components, actions, hit membership and cast assignment

## 2. Canonical Golden Catalog

- [x] 2.1 Add a side-effect-free shared golden-case catalog with the thunder-arrow tracer cases
- [x] 2.2 Migrate unified-experimental and gabarito-unified to consume the shared thunder-arrow cases without duplicating expectations

## 3. Session Classification Cache

- [x] 3.1 Cache session splitting and pairing by fixture pair in gabarito-unified
- [x] 3.2 Cache Unified classification by paired session and fixed classification options
- [x] 3.3 Preserve case order, diagnostics, filtering and exit-code behavior
- [x] 3.4 Skip paired sessions that do not contain the requested raw Server Log timestamp

## 4. Verification And Checkpoint

- [x] 4.1 Verify cached and uncached fingerprints are identical for targeted fixtures
- [x] 4.2 Measure the repeated-case speedup and confirm each unique session is classified once
- [x] 4.3 Run OpenSpec validation and the mandatory Unified checks, comparing only against documented pre-existing failures
  - OpenSpec, tests and invariants completed; the optimized full experimental gabarito completed within the 900-second limit with only its seven documented pre-existing failures.

## 5. Experimental Golden Session Scope

- [x] 5.1 Cache experimental pairing and classification at paired-session granularity
- [x] 5.2 Group selected golden cases by fixture and classify only sessions containing a requested raw timestamp
- [x] 5.3 Preserve exhaustive audit scope while introducing the paired-session cache
- [x] 5.4 Add diagnostic cache statistics and an unfiltered comparison mode
- [x] 5.5 Compare filtered and unfiltered outputs for representative multi-session fixtures
- [x] 5.6 Run the complete experimental gabarito within the validation limit and compare failures with baseline

## 6. Invariant Ownership

- [x] 6.1 Prove that the three full-fixture gabarito audits are a strict subset of canonical invariant checks
- [x] 6.2 Remove duplicate full-fixture audits from curated gabarito mode
- [x] 6.3 Verify curated case outputs and documented failures remain unchanged
- [x] 6.4 Run exhaustive invariants and confirm the removed checks remain covered
- [x] 6.5 Measure the complete mandatory validation speedup

## 7. Scoped Correction Runner

- [x] 7.1 Add strict `--match` parsing that requires exactly one validation mode
- [x] 7.2 Forward matching to curated gabarito and invariant fixture selection
- [x] 7.3 Filter discovered tests by filename and reject empty matches
- [x] 7.4 Preserve default full-run target discovery and output
- [x] 7.5 Validate one golden fixture, one invariant fixture, one test, and invalid CLI combinations
