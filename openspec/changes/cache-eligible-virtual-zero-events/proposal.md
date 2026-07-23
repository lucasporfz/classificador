## Why

After the name-normalization optimization, CPU profiling of the protected `thunder-arrow` fixture attributes 7.86% of samples to `eligibleVirtualZeroCharmsForBlock` and another 3.76% to `isEligibleVirtualZeroCharm`. Every candidate block scans the complete immutable server-event array even though basic charm eligibility does not depend on the turn or block.

## What Changes

- Cache the basic eligible-event subset per classification context and server-event array identity.
- Refresh the subset if the event-array identity or length changes.
- Preserve all block-specific timestamp, sequence, mob, pairing and ordering checks.
- Verify cache reuse behavior, runtime improvement and complete zero classification drift.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unified-classification-performance`: Reuse immutable virtual-zero event eligibility work across candidate-block validation.

## Impact

- Affected implementation: `js/unified-validation.js`.
- Affected validation: focused cache-contract test, protected fixture, full dump and mandatory Unified checks.
- No classification rule, expected gabarito, UI, external API or dependency changes.
