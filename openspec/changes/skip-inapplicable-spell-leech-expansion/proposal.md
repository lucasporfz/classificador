## Why

V8 execution coverage of the protected thunder-arrow fixture recorded 1,887,204 calls to `leechEffectiveRateCandidates` but 4,076,574 calls to `spellLeechBonusEntryForBlock`. Non-spell blocks can only use the zero spell bonus, yet they repeatedly enter spell-specific helper paths. Spell blocks also reconstruct the same entry for each generated candidate.

## What Changes

- Keep the canonical `[0]` spell-bonus option directly for non-spell blocks.
- Resolve the spell entry once when the block is a spell.
- Reuse that entry for option selection and candidate diagnostics.
- Preserve candidate values, ordering and serialized diagnostics.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-classification-performance`: Skip inapplicable spell-only leech expansion and duplicate entry construction.

## Impact

- Production change: the existing leech candidate helpers in `js/unified-validation.js`.
- No rule, threshold, gabarito, UI, API or dependency changes.
