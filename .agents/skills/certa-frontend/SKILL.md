---
name: certa-frontend
description: Design, implement, refine and review Certa web, mobile and staff interfaces, including typography, layouts, interaction states and UI around the existing game scenes. Use for Certa frontend work in this repository; backend-only changes do not need this skill.
---

# Certa frontend

Act as the design lead and frontend engineer for this specific product. Create
recognizably Certa interfaces: an illustrated mountain world, disciplined readable
tools and honest account state. Use the user's requested scope and the existing
architecture; a frontend request does not activate an unapproved feature.

## Start with the right evidence

Paths such as `FRONTEND.md` below are relative to the monorepo root, the directory
containing `AGENTS.md`, `STRUCTURE.md` and `pnpm-workspace.yaml`.

1. Read `AGENTS.md`, `FRONTEND.md` and the relevant existing screen/style owner.
   Follow `STRUCTURE.md` and `CONTRIBUTING.md` for implementation work. The current
   generic auth shell is a foundation, not the finished visual standard.
2. For visual migration or a substantial new composition, use
   [references/sources.md](references/sources.md) to find the supplied HTML, parent
   app and canonical game assets. Inspect the relevant visual, not just its code.
   Existing repo principles are sufficient for small changes; do not browse the
   live site or reread every domain document for a button fix.
3. Read the domain policy when that domain is affected: `ACCOUNTS.md` for accounts,
   purchases and provisioning; `PAYOUTS.md` for payouts; `CONTRACTS.md` for compliance;
   `AWARDS.md` for scenes/collectibles; `DISCORD.md` for community; `CONTENT.md` for
   newsletters/puzzles; `TRADARA.md` for trading operations. Policy and current
   server contracts own behavior. Reference visuals own neither rules nor grants.

`FRONTEND.md` owns shared visual decisions. The user's explicit brief takes
precedence over aesthetic defaults. Explain a meaningful departure and update
shared guidance only if the user is changing the shared direction. Do not expand
a local exception into a global redesign or request approval for routine choices.

## Pass one: make the design decision

For a new screen or substantial redesign, write a compact direction before code:

- **Job:** who uses this screen, what they need to learn/do, and its primary action.
- **Truth:** which data is canonical, which states/actions are already supported,
  and what is explicitly a preview or missing integration.
- **Expression:** choose marketing, customer tool, staff tool, native or scene
  treatment from `FRONTEND.md`; name the one focal element.
- **System:** name the existing owner and the relevant color/type/spacing roles.
  Reuse the baseline, rather than inventing new hex values and fonts per route.
- **Composition:** compare two brief layout ideas with small ASCII wireframes
  when structure is open. Choose one and state alignment and mobile reading order.
  When the user supplies an exact layout, work within it instead of re-pitching it.
- **States and cost:** list meaningful loading/empty/error/stale/denied/pending
  states; decide the scene fallback, loading trigger and reduced-motion behavior.

Example composition reasoning, not a required template:

```text
Account overview, wide:            Account overview, narrow:
[Account selection / status]       [Account selection / status]
[Facts + next action | Ascent]     [Facts / limits / next action]
[Trading-day ledger         ]     [Optional ascent / still]
                                  [Trading-day ledger]
```

Critique the plan before implementation: if the logo were removed, would the
scene, content and hierarchy still suggest Certa? Does every border, label and
animation explain something? Are financial facts easier to read than decoration?
Revise the generic part and briefly state why. One deliberate art choice is more
useful than multiplying effects. This is a working decision, not an approval gate.
For a narrow fix, make only the relevant decision; skip the full design exercise.

**Say each thing once.** A screen states a fact in one place: one step indicator,
not a progress bar plus a "Step 1 of 3" heading plus a "three steps" subtitle; one
title, not a title restated by its description. Cut filler that narrates every
aspect of the screen ("then you're in", "here's what happens next") and remove
the space it occupied rather than leaving empty padding. Related short fields
(first and last name) stay on one row at phone width; stack only when a field
cannot hold its own content.

## Pass two: implement within the owners

- Keep platform UI local. Routes compose; business operations remain in their
  server/domain owners. Reuse `@certa/ui-web` only for proven browser components
  shared by web/admin. Native uses React Native controls and its existing theme
  owner, not DOM/CSS imports or a speculative cross-platform UI package.
- Read the applicable installed Next guide before changing Next code. Use the
  existing app font path, route composition and client/server boundaries. Keep
  interactive client boundaries small; public marketing does not need auth reads.
- Put semantic tokens in the existing owning stylesheet/theme. For a design
  migration, replace the scoped superseded rules. Do not append `final.css`, copy
  the HTML's layered override stack, or introduce an unrequested CSS/component
  framework. Keep selectors scoped so a campaign cannot restyle every `button`.
- Build the reusable states with the component: visible label, focus, selected,
  pending, disabled explanation and error recovery as applicable. Keep mobile
  reading order logical in the DOM; do not fake it solely with CSS ordering.
- Preserve current API/auth/state ownership. Only confirmed server results change
  financial/compliance state. Preview toggles stay in a visibly synthetic preview.
  Unknown results need the operation's recovery path, not automatic write retries.
- Reuse the existing crest, characters and material assets intentionally. Verify
  asset origin, dimensions, license and owning app/package. No imports from the
  parent repo, private server assets in public folders, or whole reference dumps.

### If an embedded game scene is involved

Use `packages/game` and `AWARDS.md`: Kaplay for 2D, React/Jotai for overlays, Three.js
for models, Vite for the bundle. Existing modes are adventure, hero, climb, firm,
signup, cabinet, customize and trinket. Read `src/main.jsx` and the actual host for
the chosen mode. No second game engine or separate game server is needed.

Use the host's same-origin `/game/` output. Both sides validate exact origin and
the expected window/frame identity; preserve the supported message contracts.
Never copy the old wildcard `postMessage` example. Scene messages are presentation
requests, not authority to pass an account, issue an award or request payment.

Load only the selected scene/model, reserve its layout space, and supply a useful
static/unavailable fallback. Verify pause/cleanup/reduced motion for the affected
mode; do not assume it is already implemented. Do not preload the 54 MB beta model
or mount a live model viewer in every catalog row. Do not add polling to animate
account progress. Native WebView embedding is not currently enabled; a native
design task starts with native UI/still assets unless integration is in scope.

Small native character/sprite feedback can use existing platform animation tools
without embedding the game. A confirmed request may receive acknowledgement motion
while remaining “Requested”; never advance the canonical summit/pass/payout journey
or display an earned award on request acceptance. Use a separate acknowledgement
visual if a summit would imply completion. Respect reduced motion in either case.

## Review the result, then hand it over

Use [references/review.md](references/review.md) for the relevant checks. Inspect
actual rendered desktop and narrow layouts, including the non-happy states that
the change affects. Use the available browser workflow; if rendering is unavailable,
state the limitation and continue source/behavior checks without claiming visual QA.

For code changes, run the repo-required tests, typecheck and changed-app builds;
include HTTP/auth checks or native export when their documented triggers apply.
Do not add tests that merely match CSS classes, copy or this skill's wording.
Documentation-only changes need skill, link and consistency validation, not app builds.

Report the implemented outcome, visual direction, meaningful checks and remaining
integration/device limitations. Do not claim an attractive preview is connected,
accessible, production-ready or device-tested without corresponding evidence.
