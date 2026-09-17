# Certa frontend acceptance review

Use the checks that match the change. This is a review aid, not a demand to build
every state, migrate every route or run a full design process for a copy correction.
Fix observed defects within scope; record unavailable verification honestly.

## Visual review

- Inspect a wide desktop around 1440px, a narrow phone around 390px, and the 320px
  boundary for a new layout. Check a middle width if navigation/grid transitions.
  On native, inspect the supported device/emulator with text scaling and safe areas.
- Wait for fonts and the intended final motion state before judging a screenshot.
  Check actual loaded type; CSS naming a family is not evidence it loaded. Check
  missing-font/image behavior as well as the ideal view.
- Review hierarchy, alignment, measure, whitespace, wrapping and image crop. Does
  the primary action compete with decoration? Can the user read the amount, unit,
  account status and freshness before interpreting the illustration?
- Confirm essential labels remain readable, long names/large amounts wrap without
  clipping, and columns align by meaning. Check zero, negative and unavailable
  values separately. Do not hide unreadable text with overflow clipping.
- Compare with the relevant reference and `FRONTEND.md`. Name one concrete
  improvement. Remove decoration without a deliberate compositional, brand or
  product purpose; preserve the focal artwork when it serves that purpose.
- Avoid layout shifts from fonts, late art and iframe sizing. A static fallback
  must preserve both the space and the user's ability to complete the task.

## Interaction and accessibility

- Use semantic headings, links, buttons, field labels and tables; no clickable
  generic containers when a native element fits. Icon-only buttons need names.
- Complete the affected action with a keyboard. Check visible focus, sensible
  order, open/close behavior, Escape and focus restoration for dialogs/menus.
  Sticky navigation must not cover focused controls or anchored headings.
- Check 200% text zoom, readable reflow, accessible validation and associated field
  errors. Do not disable native text scaling to keep a composition intact.
- Check relevant color pairs: body text at least 4.5:1, essential control/focus
  boundaries at least 3:1. Test both light and dark surfaces when both occur.
  Status does not rely on red/green alone. These are project review thresholds.
- Confirm touch areas around 44px, no hover-only required action, and a usable
  mobile keyboard/input type. Fixed footers must not cover fields or errors.
- Respect reduced motion from initial load. Reading/action access cannot require
  watching an animation, scrolling through a pinned scene or manipulating a game.
- Use assistive announcements for important async results without continuously
  announcing every live number. Charts/scenes need a useful textual equivalent
  when they convey information; decorative artwork can remain decorative.

## State and source integrity

Exercise the states the component can actually enter, using fixtures/mocks or a
safe local environment. Do not create live payouts, compliance requests or account
grants to check how a success message looks.

| State | Required clarity |
| --- | --- |
| Initial loading | Structure remains stable; no fabricated balance or eligibility |
| Empty | Explain what belongs here and an available next action |
| Error/offline | Preserve recoverable input; explain an actionable recovery |
| Denied/blocked | Distinguish insufficient permission from unmet prerequisites |
| Stale | Indicate freshness and the supported refresh/recovery path |
| Pending/unknown | Do not imply confirmed completion or invite unsafe retries |
| Confirmed | Show the actual result and consistent action vocabulary |
| Preview | Label synthetic data where it could be mistaken for an actual account |

For protected UI, also test identity changes and late responses where applicable.
Do not display another user's data while a replacement request loads. Server
authorization is still mandatory; a disabled control is not an access boundary.

## Scene-specific review

- Confirm the selected mode loads without fetching every scene or model. No live
  WebGL galleries; no unbounded frame/listener growth on navigation.
- Check offscreen/hidden pause, reduced-motion fallback, failure/loading UI and
  cleanup in the mode actually changed. Do not infer support from a different mode.
- Verify source-window and exact-origin checks survive host changes. A spoofed
  scene event cannot trigger a financial or award mutation.
- Confirm important account information and actions are available outside the
  canvas. Canonical account/award state controls progress; local animation does not.
- Document native/GPU checks actually performed. A JS export or desktop screenshot
  does not verify a phone, WebView or low-power hardware.

## Evidence at handoff

Summarize the user-visible result, relevant screenshot/viewports and interaction
checks, automated validation, and anything still synthetic or externally blocked.
Prefer measurable observations over “polished” or “production-ready.” Store
temporary captures in the task artifact/temp location, not in public app assets.

Run `pnpm test`, `pnpm typecheck` and builds for changed apps per `AGENTS.md`.
Include `pnpm test:http` for auth/environment changes and the documented mobile
export for native dependency/routing changes. Follow domain-specific verification
when behavior changes. Pure skill/documentation edits use skill validation and
link/consistency review; they do not need unchanged app builds.
