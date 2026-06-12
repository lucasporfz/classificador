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
  The parser also associates immediate post-hit leech lines (`You were healed for N
  hitpoints.` and `You gained N mana.`) to the last eligible offensive player hit in the
  same timestamp. Do not attach leech to potion/manual heals, charm-only/reflection events,
  or unrelated later hits.
- **`js/classifier.js`**: spell table `CLS_SPELLS` (every spell of all vocations), player
  auto-detection, server↔local-chat join by timestamp, and rotation assembly
  (`classifyWithLocalChat`). **Component split = mechanical, by order**: AA single-target
  first, then AoE (spell/rune); a pack RP (≥2 mobs) uses the band classifier instead.
  Strict alignment: a turn is analyzed only if every cast component matches 100%, else the
  whole turn is dropped. Damage columns: `revertedDmg` (crit/Onslaught/prey removed = base)
  and raw `dmg` (effective), both excluding overkill. With `{ trace: true }`, it returns
  `turnTrace` for UI drill-down; each trace line carries `ts`, `seq`, `comp`, `type`,
  `lowBlow`, `realCrit`, `onslaught`, and `ok` (overkill).
- **`js/parser-rp-helpers.js`**: the validated RP band classifier (arrow/spell/rune/grenade
  by holy-damage signature). Holy damage is deterministic per mob+component; arrow is
  physical and varies — that separates them. Do not loosen these rules without re-validating
  against logs.
- **`js/app.js`**: UI glue + Chart.js rendering (rotation table, per-component histograms,
  components/hits/damage per turn, Impact Analyser). No simulation line. Also owns the
  **multi-session log picker** — see section below. Chart drill-down uses `turnTrace`; chart
  clicks open the non-modal `.cls-turn-detail` panel with previous/next navigation.
- **`js/mob-element-mods.js`** / **`js/rp-grenade-peak.js`** / **`js/charts-helpers.js`**:
  data table + helpers extracted from the original monolithic app.

## Delicate rules (don't break these)

- **Spell cast↔turn alignment uses the SPELL-hit timestamp, not the turn's first hit.**
  The AoE spell lands ~1s *after* the auto-attack (the turn's first hit). `clsNearest`
  searches `[T-1, T+2]` and breaks ties toward the **earlier** cast (`dt < bestDt` is
  strict). If `T` were the AA's ts, an `exori gran` cast 1s after the AA would tie with an
  `exori`/`exori mas` cast 1s before, and the tie would pick the *wrong, earlier* spell.
  This mislabels Fierce Berserk turns as Berserk/Groundshaker in EK and creates fake
  "same spell repeated" runs in the chart. Fix: `clsBuildTurnRecords` exports `spellTs` =
  `min(ts)` of the turn's `correctedComponent==='spell'` lines, and the match uses
  `clsNearest(playerSpellCasts, r.spellTs)`. (Rune comes from the definitive server
  "Using one of N … runes" line; grenade has its own ~3s cast→explode rule — neither was
  changed.)
- **The "componentes por turno" chart is driven by the real rotation rows, not a fixed
  component set.** Each `row` carries `hitsTimeline` (a per-aligned-turn array, 0 where the
  component didn't fire, built from `alignedTurns` in `classifyWithLocalChat`). `app.js`
  draws one line per row whose timeline has any value > 0, with a colour palette. This is
  why it picks up every vocation's named spells and never shows an empty rune/grenade line.
  Do **not** revert it to the validator's hardcoded `['arrow','spell','rune','grenade']`
  reading `temporalSeries.components` — that lumps all spells into one line and invents
  absent components.
- **EK AA classification is position-first, then diagnostics.** For EK/melee (`exori*`)
  turns, the first non-grenade hit is the AA candidate. Crit/non-crit boundary is the first
  confirmation signal. Leech is diagnostic/confirmation: compare `(lifeLeech + manaLeech) /
  dmg` against other non-overkill hits only. Overkill damage is truncated and must never be
  used in leech-ratio comparisons; if the candidate itself is overkill, keep the positional
  decision and warn `ek_uncertain_leech`. A strong leech contradiction can still make the
  turn `no AA`, but not when the contradiction is caused by overkill.
- **Low Blow and Onslaught must remain distinguishable in trace/UI.** Parser events keep
  `lowBlow`, `realCrit`, and `onslaught`. `low blow charm` is displayed as `crítico low
  blow`; pure Onslaught (`due to your attack. (Onslaught)`) displays as `Onslaught`; a real
  crit/Low Blow with Onslaught displays as `Crítico e Onslaught`. Do not collapse pure
  Onslaught back to generic `crítico` just because normalization represents it as
  `type: 'crit'`.
- **Single-mob RP grenade is the 3rd hit (chronological) in [c+2, c+4].** In
  `clsReclassifyByOrder` (`grenSet` detection), the grenade is identified as the hit at
  index `min(2, n-1)` among all `rpComponentLines` sorted by `(ts, seq)` whose timestamp
  falls in `[cast+2, cast+4]`. The rotation is arrow+spell+grenade (3 components), so the
  3rd hit in the window is the explosion; any 4th+ hit belongs to the next rotation. Do not
  use `spellTsSet` to filter candidates — after a spell cast the player has a 2s attack
  cooldown, meaning a hit at `cast+1` can only be the grenade (not an arrow), and blocking
  it by `spellTsSet` picks the wrong hit. For 2-hit windows (spell+grenade, no AA) the 2nd
  hit is the grenade; for the murcion case (grenade missed, no hits in window), the window
  is empty and no grenade is marked.
- **RP all-arrow turns near grenade casts can be valid AA-area turns.** In RP packs, an
  all-arrow turn at the exact timestamp of a grenade cast (for example `exevo tempo mas
  san`) must not be promoted to `spell` by `chat_spell_all_arrow_fallback`. The grenade cast
  is used to identify the later explode turn (~C+3); the cast turn itself may remain a valid
  `arrow`-only turn and must appear in `turnTrace`.
- **RP low/high grenade marks are secondary to local chat.** The parser may mark a
  low/high pair as `rpGrenade='cast'/'explode'` before local chat is known. In
  `classifyWithLocalChat`, keep those marks only when a real `exevo tempo mas san` cast is
  compatible with the marked turn(s). If chat contradicts the heuristic, clear the mark and
  rebuild the turn classification before applying spell/rune fallbacks. This prevents false
  `grenade_cast_arrow_only` turns such as `darklight e vemiath` `07/Jun/2026 22:18-22:24`
  around `22:22:11`.
- **RP chat fallback must not blindly turn all-arrow into all-spell.** When local chat proves
  an RP attack spell but the band classifier returned `bands_all_arrow`, recover the missing
  second component conservatively. Single-target RP spells (`exori gran con`, `exori san`,
  `exori con`, `exori infir con`) are deterministic order `AA -> spell`: mark only the
  last hit as `spell`, keep the prefix as `arrow`. AoE spell fallback (`exevo mas san`)
  should first look for a consistent suffix by normalized holy damage and keep any prefix as
  `arrow`; only promote the whole block when no reliable split exists.
- **RP AoE all-spell turns can still contain a prefix AA.** If a pack turn is classified as
  100% `spell`, local chat has the AoE spell, and the first non-overkill hit has a much
  stronger leech/damage ratio than the following non-overkill spell block, restore that first
  hit to `arrow`. This handles hard mixed turns such as `darklight e vemiath`
  `07/Jun/2026 23:19-23:25` at `23:24:39`, where the first hit is AA and the suffix is
  `Divine Caldera`.
- **Expose Weakness hits in the same component must not break band boundaries.** The debuff
  `(increased damage by Expose Weakness)` adds +8% elemental pierce to the mob, changing its
  effective `holyDmgMod` (e.g. sopping corpus 1.05 → 1.09). The band classifier
  (`rpClassifyTurnByBands`) uses `ewAwareEq` in `bandStart` and `isHoly`: hits with and
  without EW on the same mob are normalized via `ceil(ewHit × baseMod / ewMod)` and compared
  with ±1 tolerance (accounting for `ceil` rounding). Without this, EW and non-EW hits of
  the same grenade/spell look like different values and split the band at the wrong place.
  Do not replace `ewAwareEq` with plain equality in these two functions.
- **Observed damage classification and execution metrics are intentionally different.** The
  rotation table/detail show observed damage components only. A server line like
  `Using one of N great fireball runes...` can count as an executed spell/rune/grenade for
  uptime metrics even if no rune damage is visible in that turn. Do not relabel the hits as
  rune unless the damage/order evidence supports it. Example: `darklight e vemiath`
  `04/Jun/2026 22:41-22:46` turn `22:45:34` has a GFB `Using` line after the offensive hits;
  the hits stay `arrow`, but the spell/rune/grenade uptime counts the second component as
  executed.
- **Metric denominators must ignore partial edge turns when appropriate.** The first aligned
  turn of a session can be a partial log slice. If it contains only AA damage and no visible
  second component, do not count it as a lost `Spell/rune/granada` turn. Keep it in
  `turnTrace` and AA metrics; exclude it only from the second-component uptime denominator.
- **Chart drill-down is tied to aligned `turnTrace`.** Histogram bars map by row
  `hitsTimeline`; timeline/scatter points map by `dataIndex -> turnTrace[dataIndex]`.
  `renderTurnDetail(turns, res, selectedIndex)` shows one active turn at a time. For a
  single clicked turn, previous/next walks the full `turnTrace`; for histogram multi-turn
  selections, it walks that selected subset. The panel is centered with a sticky header so
  navigation buttons do not jump as turn size changes.
- **Drill-down labels are user-facing, not raw component tokens.** In the detail table,
  `arrow` displays as `auto ataque`; `spell` displays the aligned spell label (for example
  `Berserk (exori)`/`Divine Caldera (exevo mas san)`); `rune` displays the rune name; and
  `grenade` displays the grenade/cast label when available.

## Multi-session log picker (js/app.js)

O Tibia acumula várias sessões num mesmo arquivo de log, cada uma precedida por uma linha
`Channel ... saved Www Mmm DD HH:MM:SS YYYY`. Alguns arquivos mais antigos (ex.: `murcion`)
não têm essa linha e começam direto com `HH:MM:SS`.

**Funções principais (todas em `js/app.js`):**

- `clsSplitSessions(text)` — divide o texto em sessões pelo cabeçalho. Se nenhum cabeçalho
  for encontrado, retorna uma sessão única cobrindo o arquivo inteiro (`header: ''`).
- `clsSessionLabel(s)` — formata `DD/Mmm/YYYY HH:MM–HH:MM` a partir do cabeçalho e dos
  timestamps da sessão.
- `clsParseSessionDate(s)` — extrai `{year, month, day, saveSec}` do cabeçalho para o
  pareamento. Retorna `null` se não houver cabeçalho.
- `clsBuildPairs(svSessions, lcSessions)` — para cada sessão de server log, encontra o local
  chat do **mesmo dia** com `saveSec` mais próximo (tolerância ≤ 1 hora). Usa o horário de
  **save** (fim da sessão), não o `firstTs`, porque ambos os arquivos são salvos juntos no
  fim da sessão, com diferença de segundos.
- `clsUpdatePairPicker()` — atualiza `#clsPairSelect`:
  - **Fast path 1+1**: se cada arquivo tem exatamente 1 sessão (com ou sem cabeçalho),
    pareamento direto, sem picker, sem mensagem de erro.
  - **2+ pares**: mostra o `<select>` com as opções; auto-seleciona o primeiro par.
  - **0 pares**: oculta picker, exibe `cls_status_no_pairs`.
- `clsLoadFile(inputId, isServer)` — lê o arquivo, atualiza `clsServerSessions` /
  `clsLocalSessions`, reseta **ambas** as textareas para `sessions[0]` dos respectivos
  arquivos (evita resíduo de seleção anterior), depois chama `clsUpdatePairPicker`.

**Wiring dos botões:** `input.value = ''` é feito no **click handler** (antes de abrir o
diálogo), não no `onload` — limpar o input dentro do callback async trava o file input no
Chrome/Windows.

**Arquivos sem cabeçalho** (ex.: `murcion server log rp.txt`, `murcion local chat rp.txt`):
`clsSplitSessions` os retorna como 1 sessão com `header: ''`; o fast path 1+1 os popula
diretamente nas textareas sem passar pelo algoritmo de data.

## How to validate a classifier change

1. `node --check js/classifier.js` (and any file you touched).
2. Run the **oracle on every fixture before and after** and `diff` the output — changes
   must be confined to the logs you expect; RP/druid should stay identical when you only
   touch EK behaviour, etc.
3. When a change **reclassifies** turns, confirm each move two independent ways: **timing**
   (the spell hits coincide with the new cast, ~1s after the AA) **and damage magnitude**
   (the turn's base damage matches the new label's `dmgBase`, not the old one). Both must
   agree before accepting the change.
4. The component split is mechanical (AA-first, then AoE by order) for single-target/EK and
   band-based for RP packs — a fix for one regime must not regress the other.
5. For EK leech changes, verify `bastion` turn `15:20:27` keeps `517` as `arrow` and does
   not use the `15` overkill hit to create `ek_leech_contradiction_no_aa`.
6. For RP pack/grenade changes, verify the `darklight e vemiath` session saved
   `Sun Jun 07 23:53:15/17 2026`: `23:28:34` appears in `turnTrace` as `AA 17`, and the
   following `23:28:36` turn still carries the grenade explosion.
   For single-mob grenade (`grenSet`) changes, run oracle on `bakra` session 6 and verify:
   - `09:20:21` → AA 1, spell 1, grenade 1 (810 = grenade at c+3)
   - `09:21:06` → AA 1, spell 1, grenade 1 (940 = grenade at c+3)
   - `09:23:47` → AA 1, spell 1, grenade 1 (917 = grenade at c+4; 917 at :47 cannot be
     arrow because exevo mas san was cast at :46, imposing a 2s attack cooldown)
   - `bakra` session 7 `09:33:47` → AA 1, spell 1, grenade 1 (885 = grenade, not 677)
7. For UI drill-down changes, run syntax checks and test in the browser: chart click opens
   `.cls-turn-detail`, previous/next stays stable, spell/rune/grenade labels are names
   rather than raw component tokens, and Low Blow/Onslaught labels render correctly.
8. For RP all-arrow/chat fallback changes, verify:
   - `darklight rp` `04/Jun/2026 09:13-09:22`, turn `09:14:16`: `405` and `501` remain
     `arrow`; the last hit `1067` becomes `Strong Ethereal Spear (exori gran con)`.
   - `darklight e vemiath` `07/Jun/2026 23:19-23:25`, turn `23:22:28`: do not classify the
     whole turn as spell; the high-leech prefix AA stays `arrow` and the suffix is
     `Divine Caldera`.
   - `darklight e vemiath` `07/Jun/2026 23:19-23:25`, turn `23:24:39`: first hit `819
     darklight source` is `arrow`; the following hits are `Divine Caldera`.
   - `murcion` remains visually stable; do not create fake pack-style AA/rune/spell splits.
9. For second-component uptime changes, verify `darklight e vemiath` `04/Jun/2026
   22:41-22:46`: the first partial turn `22:41:16` remains visible in drill-down as AA-only
   but does not count as a lost `Spell/rune/granada`; turn `22:45:34` remains observed
   `arrow` damage while its `Using ... great fireball runes` line counts as second-component
   execution for the metric.

## Relationship to the original app

This repo was extracted from a larger Tibia XP/h simulator (lives at `../claude`,
`index novo.html` + `js/`). The **classifier logic is shared**: `js/classifier.js`,
`js/classifier-parser.js`, `js/parser-rp-helpers.js` here are copies of the originals, and
the classifier UI in the original lives inside `index novo.html`
(`renderClassifier`/`renderClassifierCharts`). When you fix classifier behaviour, apply the
**same change to both** repos and keep `js/classifier.js` byte-identical (verify with
`diff --strip-trailing-cr`). In the original repo also run `node tools/check-inline.mjs`
(2/2) and `node tools/rp-gabarito.mjs --parser` (38/38 — the validator's parser, which the
classifier never touches, must stay green).

## Deploy

Public GitHub repo `lucasporfz/classificador`, branch `main`. GitHub Pages serves the root:
**https://lucasporfz.github.io/classificador/**. A plain `git push origin main` redeploys
(Pages rebuilds in ~1–2 min). Local preview: any static server, e.g.
`python -m http.server 5599` then open `http://127.0.0.1:5599/`.

## Conventions

- Windows + PowerShell environment. The `Bash` tool is also available; heredocs mangle
  backslashes — write script files with the `Write` tool, not heredocs.
- Commit only when asked; end commit messages with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- `logs/*.txt` are real combat logs used as fixtures by the oracle. Pairs cover RP pack
  (`server log rp` + `localchat rp`), RP party (`darklight …`), RP boss single-target
  (`murcion …`), EK packs (`bastion …`, `night harpy …`) and druid (`uhax …`).

# Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
