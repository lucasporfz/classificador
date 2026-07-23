## ADDED Requirements

### Requirement: Spell-only leech work is applicable only to spell blocks

The Unified engine SHALL use the canonical zero spell-bonus option for non-spell blocks without resolving spell metadata. For spell blocks, it SHALL resolve the canonical spell entry once per effective-rate expansion and reuse it across generated candidates.

#### Scenario: Block is arrow, rune or grenade

- **WHEN** effective leech rates are expanded
- **THEN** candidates contain spell bonus zero and spell entry null without spell metadata resolution

#### Scenario: Spell has multiple official bonus candidates

- **WHEN** effective leech rates are expanded for that spell
- **THEN** candidate values and ordering remain unchanged and share one resolved diagnostic entry

#### Scenario: Full corpus is classified

- **WHEN** the optimized engine processes all Unified fixtures
- **THEN** the complete dump is byte-identical to rollback point `d6b6a74`
