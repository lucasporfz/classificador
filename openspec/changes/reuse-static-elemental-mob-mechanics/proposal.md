## Why

The protected engine executes `elementalOriginalCandidates` about 1.94 million times. Existing `_revCache` prevents almost all expensive inversion loops, but each cache lookup still recomputes the same mob effective modifier and float16 mitigation. The current CPU profile attributes 6.58% to `effectiveMod` and 2.62% to `f16round`.

## What Changes

- Reuse resolved effective modifier and mitigation for an unchanged mob-mod object, elemental property, pierce value and float16 mode.
- Validate raw modifier and mitigation values before every reuse.
- Leave critical, Grav San, bestiary bonus, Terra Burst and the existing `_revCache` unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-classification-performance`: Reuse static mob mechanics before dynamic elemental reversal state is resolved.

## Impact

- Production change is local to `js/unified-formulas.js`.
- No classification rule, threshold, candidate, output, UI or dependency changes.
