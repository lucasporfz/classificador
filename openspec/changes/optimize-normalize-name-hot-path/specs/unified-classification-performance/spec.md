## ADDED Requirements

### Requirement: Name normalization is memoized without changing equivalence

The Unified engine SHALL return canonical lowercase ASCII names directly and SHALL reuse the normalized result for repeated exact non-canonical raw name strings instead of rerunning lowercase, whitespace-collapse and trim work during candidate validation. The fast path and memoization MUST return exactly the same string as the original transformation for every accepted input and MUST NOT alter any classification decision.

#### Scenario: Input is already canonical ASCII

- **WHEN** a raw name contains lowercase ASCII with canonical single spacing
- **THEN** the engine returns that same primitive string without lowercase, regular-expression or cache work

#### Scenario: Input requires canonical transformation

- **WHEN** a raw name contains uppercase, non-ASCII, leading, trailing, repeated or control whitespace
- **THEN** the engine applies the existing lowercase, whitespace-collapse and trim transformation before returning the result

#### Scenario: Repeated mob name across candidate partitions

- **WHEN** the same raw mob name is normalized while many candidate partitions are evaluated
- **THEN** the canonical transformation is computed once while every caller receives the same normalized primitive string

#### Scenario: Different whitespace and case remain distinct cache inputs

- **WHEN** raw inputs differ by case or whitespace but normalize to the same canonical name
- **THEN** each exact raw input MAY occupy its own cache entry but MUST return the same canonical output produced before memoization

### Requirement: Name-normalization cache is memory bounded

The Unified browser runtime SHALL bound the number of retained name-normalization entries. Reaching the bound MAY discard cached entries, but eviction MUST affect performance only and MUST NOT affect normalized values or classification state.

#### Scenario: Cache reaches its configured bound

- **WHEN** more unique raw strings are normalized than the configured cache can retain
- **THEN** old entries are discarded and later requests recompute the unchanged canonical transformation without classification drift
