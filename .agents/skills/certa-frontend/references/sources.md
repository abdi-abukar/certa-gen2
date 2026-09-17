# Certa design reference map

Reviewed on 2026-09-15. Paths below are relative to the monorepo root unless
explicitly prefixed with `../`. Parent files and `certa-website-code 2/` are optional
reference material, never runtime dependencies. Read only the part relevant to
the task. If a source is absent, use `FRONTEND.md` and current implementation; ask
for an exact missing asset only when the requested result actually depends on it.

## Authority

The current user brief and repo policy govern the task. `FRONTEND.md` records the
rebuild's design decisions; canonical server contracts govern product behavior.
Current scenes own the embedding protocol. The HTML package, parent app and public
site provide design evidence, not authority to change financial rules or copy
their architecture. Do not resolve conflicting prices or eligibility by guessing.

## Supplied HTML package

Entry: `certa-website-code 2/START-HERE.html`; intended display and preview limits:
`certa-website-code 2/README.md`. Keep stylesheet order when viewing the reference.

| Source | What it establishes | How to use it |
| --- | --- | --- |
| `index.html`, `styles.css` | DM Sans base typography; page content and section composition | Keep the readable family and clear hierarchy; improve wrapping and measure |
| `open-layout.css` | More open groups and rows; Playball handwritten replacement word | Keep useful grouping; omit the one-word cursive treatment by default |
| `scroll-refine.css`, `certa-details.css` | Final black stage, lantern/pumpkin hero/footer, warm ivory text | Inspect the final cascade, not the first palette declaration |
| `theme-config.js` | Pinned October campaign, orange accent | Seasonal reference, not permanent branding or a new theme service |
| `dashboard.html`, `dashboard.css` | Ascent beside account facts/calendar; DM Sans; amber and muted sage | Preserve complementary scene/data regions; enlarge tiny labels |
| `payouts.html`, `payouts.css`, `payouts.js` | Destination and eligibility previews | Layout reference only; in-memory operations are not payout APIs |
| `receipts.html`, `settings.html`, `account-pages.js` | Sample receipt export; local compliance toggles | Sample CSV is real export of fake records; toggles are not verification |
| `assets/certa-logo.png` | Existing Certa crest | Reuse an approved source with its proportions intact |
| `assets/dashboard-ascent.png`, `assets/certa-custom-icons.png` | Illustrated ascent and Certa-specific objects | Art direction; a contact sheet is not automatically an accessible icon system |
| `assets/black-lanterns-pumpkins.png` | Final seasonal hero/footer art | Intentional crop and one focal composition |

Observed final colors differ from early declarations: marketing uses black and
`#090a09`, ivory `#fff6e7`, detail amber `#efb26e`, with theme orange `#ff9b42`.
Dashboard uses `#030403`, text `#f6f0e6`, muted `#92998f`, amber `#f2a34f`.
The new evergreen palette in `FRONTEND.md` is a synthesis, not an exact extraction.

Desktop hero and dashboard were rendered and visually reviewed. The strong parts
are the scene's material presence, breathing room, readable sans type and open
data layout. Limitations visible in code include essential 8–11px labels and a
mobile headline forced to `nowrap` at `4.08vw`. Do not inherit those limitations,
the nine-file CSS override stack, repeated `!important`, decorative all-caps
eyebrows, or the large empty hero spacer as mandatory layout rules.

The supplied design-lead brief asks for subject-specific choices, compact tokens,
comparison/critique before code, one focal gesture, restrained motion and plain
interface copy. Those principles are incorporated in `FRONTEND.md` and the skill;
future work does not depend on the original machine-local attachment path.

## Parent application

Read the parent `AGENTS.md` before inspecting its implementation. These files were
reviewed as history and reference, not selected for wholesale migration:

| Source | Useful evidence |
| --- | --- |
| `../app/globals.css` | Forest `#06130d`, ivory `#f6f3e9`, gold `#d8b86d`; existing brand continuity |
| `../app/fonts.ts` | Manrope body, Space Grotesk heading, Geist Mono/DM Mono; historical choices |
| `../components/certa/hero.tsx` | Large heading beside the transparent climb and illustrated action tiles |
| `../components/certa/action-art.tsx` | Certa-specific evaluation, rules, ticket, funded and reward illustrations |
| `../public/platform/board-desktop.webp` | Light ledger panels over the mountain world; readable conventional financial typography |
| `../supporting-apps/game-eng/` | Old scene/host context; some wildcard messaging is superseded |

## Canonical current implementation

- `packages/game/package.json`, `src/main.jsx`: Kaplay, React/Jotai, Three.js and
  Vite; dynamic scene selection. Follow installed versions, not versions frozen
  into this reference document.
- `packages/game/public/world-background.png`: pixel evergreen mountain, sage sky,
  warm stone ledges and grass. `public/` also owns character art, models and fonts.
- `packages/game/README.md`: per-host build, large model and font-license notes.
  `public/FONT-LICENSE.txt` documents Silkscreen; verify the particular font used.
- `apps/web/app/awards/cabinet.tsx`: current scene host and frame validation.
  `AWARDS.md` owns read models, evidence and supported integration.
- `packages/server/assets/awards/`: private certificate plates/local fonts. These
  are server-rendered artifacts, not a public asset folder to copy into a theme.
- `packages/ui-web/src/styles.css`, `apps/mobile/lib/styles.ts`: current light
  auth foundations. They are implementation owners, not the target art direction.

## Live site

[Certa Futures](https://www.certafutures.com/) was read and a desktop first view
captured on 2026-09-15. It showed deep forest, ivory display copy and illustrated
action tiles. The public page also presents account, adventure, payout and cabinet
sections. The capture did not establish the loaded interactive game experience:
headless WebGL was limited. Game conclusions above come from local source/assets.

The site changes over time. Revisit only when the task needs current visual or
product evidence, using an available browsing tool. Do not treat a screenshot as
proof of auth behavior, eligibility, execution or backend activation.

## New choices versus observed facts

DM Sans across ordinary UI, the six-role evergreen palette, minimum label sizing,
scoped seasonal treatment and the review workflow are deliberate rebuild defaults.
They are not already implemented in the current apps. Keep this distinction when
reporting completion; documentation establishes direction, not a delivered redesign.
