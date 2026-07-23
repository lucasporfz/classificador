## ADDED Requirements

### Requirement: Basic virtual-zero event eligibility is reused

The Unified engine SHALL evaluate context-wide basic virtual-zero charm eligibility once for an unchanged server-event collection and SHALL reuse that ordered subset across candidate blocks. Reuse MUST NOT bypass block-specific timestamp, sequence, mob, visible-hit pairing or ordering checks.

#### Scenario: Multiple candidate blocks share one context

- **WHEN** virtual-zero eligibility is evaluated repeatedly with the same context and unchanged server-event array
- **THEN** basic event eligibility is not rescanned while each block still receives its independently filtered and ordered result

#### Scenario: Server-event collection changes

- **WHEN** the context receives a replacement event array or the current array length changes
- **THEN** the basic eligible-event subset is recomputed before block-specific validation

### Requirement: Eligibility reuse has zero classification drift

Caching basic eligibility MUST affect computational work only. Every protected and corpus-wide classification output SHALL remain identical to the uncached engine.

#### Scenario: Full corpus is classified

- **WHEN** the optimized engine processes all Unified fixtures
- **THEN** the complete dump is byte-identical to the dump from rollback point `eae4650`
