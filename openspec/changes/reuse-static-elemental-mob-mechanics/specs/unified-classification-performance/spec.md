## ADDED Requirements

### Requirement: Static elemental mob mechanics are reused

The Unified engine SHALL reuse effective modifier and mitigation results for repeated elemental reversals when the mob-mod object, raw values, elemental property, pierce and float16 mode are unchanged.

#### Scenario: Repeated reversal uses identical static mechanics

- **WHEN** the same mob mechanics and pierce mode are evaluated again
- **THEN** effective modifier and mitigation are reused while dynamic critical and post-multiplier state is still evaluated normally

#### Scenario: Custom mob table mutates

- **WHEN** the raw elemental modifier or mitigation percentage changes on the same object
- **THEN** the static mechanics are recomputed before reversal

#### Scenario: Full corpus is classified

- **WHEN** the optimized engine processes all Unified fixtures
- **THEN** its dump is byte-identical to rollback point `84a0d8f`
