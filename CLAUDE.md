# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page **Tibia log classifier**. It crosses a **server log** + a **local chat**
from the same hunt into one **rotation table** per component/spell (turns, avg hits, base
damage, effective damage) plus log charts. **No simulation** — only observed hits/damage.
UI is pt-BR/en (`js/i18n.js`). This was extracted from a larger XP/h simulator; only the
classifier feature lives here.

## Running and checking (no build system)

Plain HTML + `<script src>` files; open `index.html` on a static server (Chart.js from CDN).
There is no bundler or test framework.

- **Syntax check a JS file:** `node --check js/<file>.js`
- **Run the classifier offline (oracle):** `node tools/rp-classify-proto.mjs "logs/<server>.txt" "logs/<localchat>.txt"` — prints the rotation table + incantation detection. Add `--spell "<incant|label>"` and/or `--hits N` to dump matching aligned turns hit-by-hit. **One log pair per process** (parser state would contaminate across logs).

## js/ modules: globals, not modules

Files load as plain `<script src>` (see `index.html`), sharing one **global scope** — no
`import`/`export`. **Load order matters** (matches `index.html`):

`i18n.js` → `stats.js` → `mob-element-mods.js` → `rp-grenade-peak.js` →
`parser-rp-helpers.js` → `classifier-parser.js` → `classifier.js` → `histogram.js` →
`charts-helpers.js` → `app.js`.

A function defined in an earlier file is callable from a later one. When adding a shared
helper, define it in a file that loads before its callers.

## Architecture

- **`js/classifier-parser.js`** (`parseLogForClassifier`): log text → events → 2-second
  turns → `turnStats`. No min-length guard (reads single-kill bosses); article `A/An/The`
  optional. Reuses the shared RP classification helpers. Returns `distinctMobs` (boss = 1).
- **`js/classifier.js`**: spell table `CLS_SPELLS` (every spell of all vocations), player
  auto-detection, server↔local-chat join by timestamp, and rotation assembly
  (`classifyWithLocalChat`). **Component split = mechanical, by order**: AA single-target
  first, then AoE (spell/rune); a pack RP (≥2 mobs) uses the band classifier instead.
  Strict alignment: a turn is analyzed only if every cast component matches 100%, else the
  whole turn is dropped. Damage columns: `revertedDmg` (crit/Onslaught/prey removed = base)
  and raw `dmg` (effective), both excluding overkill.
- **`js/parser-rp-helpers.js`**: the validated RP band classifier (arrow/spell/rune/grenade
  by holy-damage signature). Holy damage is deterministic per mob+component; arrow is
  physical and varies — that separates them. Do not loosen these rules without re-validating
  against logs.
- **`js/app.js`**: UI glue + Chart.js rendering (rotation table, per-component histograms,
  components/hits/damage per turn, Impact Analyser). No simulation line.
- **`js/mob-element-mods.js`** / **`js/rp-grenade-peak.js`** / **`js/charts-helpers.js`**:
  data table + helpers extracted from the original monolithic app.

## Conventions

- Windows + PowerShell environment. The `Bash` tool is also available; heredocs mangle
  backslashes — write script files with the `Write` tool, not heredocs.
- Commit only when asked; end commit messages with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- `logs/*.txt` are real combat logs used as fixtures by the oracle.
