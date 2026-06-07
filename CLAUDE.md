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
  components/hits/damage per turn, Impact Analyser). No simulation line. Also owns the
  **multi-session log picker** — see section below.
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
