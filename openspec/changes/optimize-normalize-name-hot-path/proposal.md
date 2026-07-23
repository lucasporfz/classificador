## Why

CPU profiling of the protected `thunder-arrow` fixture attributes 8.64% of all samples to repeated `normalizeName` work, plus 1.34% to its whitespace regular expression. The same already-normalized mob and action names are processed thousands of times while candidate partitions are evaluated, making this a measurable production hot path with no domain value.

## What Changes

- Return already-canonical ASCII names directly, without lowercase/regex/trim work.
- Memoize non-canonical `normalizeName` inputs by exact raw string inside the Unified formulas runtime.
- Bound cache growth so repeated browser classifications cannot retain an unlimited number of log strings.
- Preserve the normalized return value for every input and keep all classification decisions unchanged.
- Add synthetic cache-contract coverage and compare full classification fingerprints before and after the optimization.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-classification-performance`: Add a behavior-preserving canonical-name fast path and bounded memoization for repeated name normalization in candidate-validation hot paths.

## Impact

- Affected implementation: `js/unified-formulas.js` only.
- Affected validation: focused unit coverage, direct/experimental golden cases, full zero-drift dump and mandatory Unified checks.
- No UI, classification rule, expected golden result, external API, or dependency changes.
