## Context

`normalizeName` is the canonical boundary for case-folding, whitespace collapsing and trimming names used throughout parsing, setup inference and candidate validation. A CPU profile of the protected `thunder-arrow` session recorded 990 of 11,452 samples (8.64%) inside `normalizeName`, plus 154 samples (1.34%) in its whitespace regular expression. Most hot calls repeat a small set of already-seen mob, setup and action strings while validating many partitions.

The function is pure: its result depends only on the exact value after `String(s || '')`. Classification rules require normalized comparisons but do not require recomputation. This change is therefore governed by the zero-drift contract in `unified-classification-performance` and by all existing domain rules that consume normalized names.

## Goals / Non-Goals

**Goals:**

- Avoid repeated lowercase/regex/trim work for identical raw inputs.
- Avoid Map and transformation overhead for canonical lowercase ASCII names.
- Preserve the exact return value for every JavaScript input accepted today.
- Bound retained entries for the long-lived browser runtime.
- Demonstrate measurable production-engine improvement on a protected heavy session.

**Non-Goals:**

- Change parsing, name equivalence, classification rules or expected results.
- Add caches around mutable classification objects.
- Optimize other profile hotspots in the same checkpoint.

## Decisions

### Canonical ASCII fast path

After the existing `String(s || '')` conversion, scan the raw string once. Return it directly only when it contains lowercase ASCII with no leading, trailing or repeated spaces and no control whitespace. Uppercase, non-ASCII and non-canonical whitespace inputs continue through the unchanged lowercase, whitespace-collapse and trim pipeline.

This condition only recognizes strings for which the existing transformation is an identity operation. It introduces no new name equivalence and keeps Unicode case-folding delegated to `String.prototype.toLowerCase`.

Alternative rejected: put every input through the Map first. Profiling the cache-only implementation still attributed 7.11% of samples to `normalizeName`; the canonical fast path removes lookup and allocation work from the dominant case.

### Cache by exact raw string

Convert the argument with the existing `String(s || '')` expression, then use that exact string as the cache key. On a miss, execute the unchanged lowercase, whitespace-collapse and trim pipeline. This preserves behavior for nullish, numeric and object inputs while ensuring equal raw strings share a result.

Alternative rejected: assume `hit.mob` is already normalized and bypass the canonical helper at selected call sites. That would spread a new invariant across parsing, virtual-hit construction and imported APIs, increasing classification risk.

### Bounded clear-on-cap cache

Use a named maximum-entry constant. When a new key would exceed the cap, clear the cache before inserting it. Clearing affects performance only; every miss still executes the canonical transformation. A simple clear avoids recency bookkeeping in the hottest function.

Alternative rejected: an unbounded Map. The browser runtime can classify many logs without reload, so unique chat/action strings could accumulate indefinitely.

### One-area checkpoint

Touch only the canonical normalization area and add focused tests. Keep the optimization independently revertible before profiling the next hotspot.

## Risks / Trade-offs

- [Cache key conversion changes behavior] -> reuse the exact pre-existing `String(s || '')` conversion before lookup.
- [Fast path accepts a string changed by the old pipeline] -> reject uppercase, non-ASCII, control whitespace, leading/trailing spaces and repeated spaces before returning directly.
- [Cached values become stale] -> keys and values are primitive strings and normalization has no external state.
- [Long-lived memory growth] -> enforce a named maximum and clear on cap.
- [Map overhead exceeds regex savings] -> benchmark the protected session; revert if median runtime does not improve.
- [Classification drift] -> compare fingerprints and zero-drift dumps before accepting the checkpoint.

## Migration Plan

1. Record baseline profile, runtime and fingerprints.
2. Add focused normalization/cache tests.
3. Implement the canonical ASCII fast path and bounded memoization in `js/unified-formulas.js`.
4. Compare targeted fingerprints and runtime.
5. Run scoped dumps, then full mandatory validation and zero-drift dump.
6. Revert the implementation commit if any output differs or the speedup is not measurable.

## Open Questions

- The cache cap will be selected from observed unique-name cardinality with enough headroom for full fixtures; it is a memory bound, never a classification threshold.
