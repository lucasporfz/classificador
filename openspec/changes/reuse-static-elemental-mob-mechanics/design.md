## Context

For one mob-mod table entry, elemental modifier and mitigation are static. Effective modifier additionally depends on the observed/contextual pierce scalar, and mitigation depends on the float16 option. Dynamic candidate state begins only afterward with post multipliers, critical mode and Terra Burst.

## Decision

Use a module-private `WeakMap` keyed by the mob-mod object. Each value is a bounded `Map` keyed by elemental property, pierce and float16 mode. A cached record includes the raw elemental modifier and raw mitigation percentage; mismatches force recomputation and replacement. The per-mob map clears at 128 combinations.

This cache returns only two numbers: `mod` and `mit`. Existing dynamic computations and `_revCache` continue unchanged.

## Risks And Rollback

- Custom mutable mob tables are protected by raw-value checks.
- Weak keys avoid retaining replaced tables.
- Focused tests cover table mutation and float16 mode separation.
- Full zero-drift dump is mandatory.
- Rollback point: `84a0d8f`.
