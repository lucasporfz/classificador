## Context

`spellLeechBonusEntryForBlock` already defines non-spell blocks as inapplicable by returning `null`. `spellLeechBonusOptionsForBlock` maps that to `[0]`. The hot rate-candidate function can preserve this exact canonical result without entering either spell helper for arrow, rune or grenade blocks.

## Decision

- Initialize each expansion with `spellBonusEntry = null` and `spellBonuses = [0]`.
- Only for `block.comp === 'spell'`, resolve the entry once and pass it to the existing options helper.
- Let external callers of the options helper omit the optional entry and retain existing behavior.
- Attach the one resolved entry to all candidates. Consumers treat candidate diagnostics as read-only and serialized output is unchanged.

No persistent cache or new validator is introduced.

## Risks And Rollback

- Focused tests compare complete candidate values for spell and non-spell blocks.
- V8 coverage must show fewer spell-helper executions.
- Protected and full dumps must remain byte-identical.
- Rollback point: `d6b6a74`.
