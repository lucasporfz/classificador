## Context

`eligibleVirtualZeroCharmsForBlock` has two layers. Basic eligibility depends only on each server event; block eligibility then depends on timestamps, sequences, mobs, visible-hit pairing and proximity ordering. The complete server-event array is fixed after parsing, but the current implementation repeats both layers for every candidate block.

The protected profile recorded 832 of 10,583 samples (7.86%) in the block function and 398 samples (3.76%) in its basic eligibility predicate.

## Goals / Non-Goals

**Goals:**

- Compute basic virtual-zero charm eligibility once per context.
- Keep every block-dependent decision and output order unchanged.
- Avoid adding a competing validator or mutating classification output.

**Non-Goals:**

- Cache final block results.
- Change which charm types are eligible.
- Change temporal, sequence, mob or paired-visible-hit rules.
- Combine this checkpoint with leech or elemental optimizations.

## Decisions

### WeakMap keyed by classification context

Store a private record containing the source event-array identity, its length and the filtered eligible events. A `WeakMap` avoids adding cache state to the context consumed by reports and permits collection when the classification context is released.

### Refresh on source replacement or length change

Recompute when `context.serverEvents` is replaced or its length changes. Production constructs the array before classification, while this guard keeps reused contexts safe from append-style fixture setup.

### Preserve the canonical block filter

Only replace `(context.serverEvents || []).filter(isEligibleVirtualZeroCharm)` with the cached equivalent. All following filtering and sorting remain in the canonical function.

## Risks / Trade-offs

- [Stale cache after event mutation] -> validate source identity and length before every reuse.
- [Cache affects serialized context] -> keep it in a module-private `WeakMap`.
- [Order changes] -> `Array.prototype.filter` preserves source order and the existing final sort remains unchanged.
- [Classification drift] -> compare protected and complete dumps byte for byte.
- [Overhead exceeds savings on small logs] -> retain only if the protected heavy fixture improves measurably.

## Migration Plan

1. Record profile, runtime and zero-drift reference from commit `eae4650`.
2. Add a focused test proving repeated calls do not rescan unchanged source events and refresh after replacement.
3. Add the private bounded-lifetime cache beside the canonical function.
4. Run protected gabarito and dump checks.
5. Run the full dump and mandatory validation.
6. Revert to `eae4650` if output changes or the runtime gain is not measurable.
