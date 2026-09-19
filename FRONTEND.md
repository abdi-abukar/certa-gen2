# Certa frontend design principles

This is the design direction for the rebuild, not a claim that the current shells
already implement it. Use it with the repo skill at
[`.agents/skills/certa-frontend/SKILL.md`](.agents/skills/certa-frontend/SKILL.md).
It applies to web, mobile, staff tools and the surrounding UI of game scenes.
Engineering and domain rules remain in `AGENTS.md` and the relevant domain policy.

## Point of view

Certa is a clear financial interface set in an illustrated mountain world. A
trader should recognize the character, forest, ledges, ascent and earned objects,
then immediately understand their account and next action. The world gives Certa
its identity; precise language and readable information earn trust.

Keep the existing crest, evergreen setting, warm gold, character silhouettes and
collectible materials. Improve the composition, type hierarchy and quality of
interactions. A generic trading terminal, a casino, and a dashboard covered in
game controls would each lose something essential to Certa.

### Principles that guide decisions

1. **One memorable moment per view.** Choose a scene, an earned object or a strong
   typographic composition. Give it space; keep the surrounding controls quiet.
   A payout form can be memorable through exceptional clarity alone.
2. **Show the work of trading clearly.** Put account state, amounts, limits,
   freshness and the next valid action ahead of decoration. An illustration must
   never obscure a risk limit, pending review or unavailable operation.
3. **Compose around the content.** Facts belong in aligned rows; comparisons in
   tables; independent accounts can be cards. Use a journey for actual progression.
   Do not divide every paragraph into an identical rounded box.
4. **Typography does the organizing.** Size, weight, measure and spacing establish
   hierarchy before outlines, labels and badges are added. A small screen gets a
   simpler composition, not shrunken desktop type.
5. **Progress reflects evidence.** Animation celebrates an established state.
   It does not establish a pass, payment, compliance result or award.
6. **Consistency leaves room for art.** Navigation, controls, status meanings and
   typography stay familiar. A campaign can change the scene without changing how
   someone reads or operates the product.

## A shared language with different levels of expression

| Surface | What leads | How the world appears |
| --- | --- | --- |
| Marketing | A specific promise, useful explanation and clear next step | One composed scene or character moment; ample breathing room |
| Customer account | Account selection, current state, limits and next action | An adjacent ascent or cabinet; data remains fully readable without it |
| Payouts, receipts, compliance, settings | The task, its requirements and result | Restrained crest/material details; decoration yields to the form or ledger |
| Staff | Search, evidence, filters, permissions and auditable actions | Familiar type and palette; scenes only when previewing scene/award content |
| Mobile | A short task path with native navigation and readable controls | Static artwork first; optional interactive scenes only after a deliberate native integration |
| Embedded scene | Character, place, movement and collectibles | Pixel and material language belongs here; ordinary UI provides equivalent account information |

## Baseline visual decisions

These are the defaults for new or intentionally redesigned screens. They are
design tokens to implement in the existing owning stylesheet/theme, not a new
package or an instruction to restyle untouched routes. When an approved token
owner exists, reuse it. Do not create a slightly different palette per page.

### Color

Six core roles derive from Certa's forest and collectible materials:

| Role | Value | Use |
| --- | --- | --- |
| Stage | `#000000` | Art stages, deep negative space; optional, not every surface |
| Forest | `#06130D` | Main dark canvas; dark text on a light ledger |
| Pine | `#123522` | Raised/grouped dark surface where grouping is meaningful |
| Ivory | `#F6F3E9` | Primary text; optional light ledger surface |
| Sage | `#B7C4B6` | Secondary text on dark surfaces |
| Gold | `#D8B86D` | Primary action, selection and earned-object emphasis |

Gold buttons use Forest text, not white. Gold does not mean success. Suggested
status foregrounds on Forest/Pine are success `#9CCBA8`, caution `#F0C875`, error
`#FF9B9B`, information `#A8CFE7`; always include a text label or icon with a name.
Borders that identify controls can begin at `#70856F`; subdued decorative rules
must not be the only way to find an input. Verify actual foreground/background
pairs, including overlays and disabled/read-only states.

On an Ivory ledger, use Forest text and a dark secondary such as `#465447`.
Do not reuse Sage or pale semantic colors as text on a light surface. Focus must
be visible on both the control and its surroundings; use a contrasting offset
ring rather than a barely different shade of the button.

Seasonal lantern orange and autumn foliage are campaign accents. They may replace
the decorative accent within a scoped campaign, but must preserve action clarity,
focus and status meanings. Halloween is one reference, not the permanent theme.

### Shared illustrated footer

Public, authentication, checkout, customer and staff pages end with the supplied
`certa_footer_html (1)` landscape. Rebuild the brand, link columns and newsletter
in native HTML and the app's DM Sans; only the logo and panorama are images.
Use fine sage dividers, cream surfaces, forest actions and at least 44px targets.
The panorama already includes “Same traders. Bigger futures.”, so do not duplicate
that signature in HTML. Keep the artwork after the legal links/disclosure at the
bottom. Lazy-load it at its original aspect ratio without cropping the character
and signs. Container queries adapt to the available width beside the sidebar;
collapsed and mobile rails must never cover the footer. Newsletter consent starts
unchecked, with visible submitting, success, sign-in and recoverable error states.

### Trader dashboard light surface

The customer landing page is **Accounts**: three illustrated slot cards, using the
supplied account-block reference, with a compact history list below. Desktop has
three columns; tablets use two, and phones use a perspective stack. Swipe left or
right to cycle slots, with a spring settling each card into place and a small dot
indicator below. There are no arrow buttons or automatic advances. Vertical scroll
and account taps stay native; reduced motion makes swaps instant. Keyboard users
can focus the stack and use arrow keys; a native slot picker is also available to
assistive technology and appears on keyboard focus. Only the front card is
interactive on phones. Each occupied card shows its
actual account name, lifecycle/setup status and elapsed start age when available,
with Open account leading to financial details. Sample reference balances, profits
and payout days are not account data. Start age is not qualifying trading days.

For a new customer, slot one keeps the supplied first-visit illustration, welcome,
Buy your first account and Account rules; slots two and three use the same muted
mountain/plus-sign artwork. The artwork fills most of each card. Empty slots have
a dashed border and purchase action, while reserved/setup slots keep their real
state. Counts come from confirmed allocation; unknown capacity gets a checking
card and over-capacity exceptions must never hide a real account. Omit a duplicate
header purchase action and keep recording off the slot grid. Returning traders get
next-account wording above their history. Keep the light cards and forest actions
within the existing DM Sans account shell.
Payment confirmation and setup problems stay distinct from evaluation failure.
**Purchase account** sits directly below Accounts in navigation and opens the
standalone checkout. Opening an account retains the detailed financial dashboard.

Sidebar community order is Trader Payouts (banknote), Affiliates, Trophy Cabinet.
Collapse is an icon-only chevron at the midpoint of the desktop sidebar's right
edge, with a 44px hit area and an accessible expand/collapse label. The customer
sidebar and mobile drawer offer a Tradara green (`#45C28D`) action with the existing
Tradara T mark and “Trade on Tradara” label. It opens `https://terminal.tradara.com`
in a new tab for an active account; confirmed absence links to checkout. An
icon-only sign-out button sits alongside it, with a 44px target and an accessible
label. The collapsed desktop rail stacks the two icons. Loading and unknown
account state do not claim the trader has no accounts.

Customer sidebar pages and standalone checkout pair the supplied “Trade together.
Go further.” masthead with a personalized welcome on the same row. A portrait of
the customer's saved character opens their account settings; the greeting uses
their first name, then their handle, or “Welcome back.” when neither is available.
The Accounts landing page uses this as its main heading, with Accounts as a small
eyebrow and “Pick up where you left off.” beneath the greeting. Remove the separate
Accounts heading below it. A fine divider separates the banner from the cards.
The portrait replaces the desktop sidebar's account entry; keep sign-out there
and the existing profile entry in the mobile drawer. Staff keeps its sidebar entry
and decorative masthead. Keep the original artwork and lettering together at
260–375px wide, hidden from assistive technology. At 800px and below, hide only the
decorative artwork; the welcome, portrait and page title remain available.

The overview places its compact sage recording bar below the dashboard content,
keeping account selection, balance and the mountain journey first. Offer recording
only after opening a resolved account, never an empty or unissued slot. An existing
capture or retained clip keeps its controls across account routes. After explicit
browser source selection, it shows recording/waiting/stopped text, elapsed time,
available footage, 1/5/10-minute clip choices, Save and Stop. The bar remains visible
across account routes while footage is held. Downloads and an optional preview stay
local; video-only capture and the need to keep the dashboard tab open are stated
before starting. Unsupported browsers get a desktop Chrome/Edge explanation.

The combined `/account` dashboard uses the approved cream treatment: paper
`#FAF9F5`, ink `#17221B`, secondary text `#68716A`, forest actions `#234C35`,
and a pale sage ledger `#EEF0E8`. These roles are owned by the account shell and
its scoped modules. Keep this light surface across account tools and evaluation
pricing. Public art stages retain their existing palette.

The heading pairs Overview with a prominent forest Buy account action and a compact
creator-code disclosure directly beneath it. The code editor opens on demand; only
server-confirmed codes and discounts are shown. Pricing, history and refresh stay
in the account-selection row. The selected account leads: tabs, balance
and risk figures beside one horizontal Kaplay journey, then objectives, a selected
trading day, and that day's trades. Desktop places the calendar beside objectives;
phone reading order puts objectives first. Shading groups the ledger; financial
facts stay open on the cream canvas. Sidebar navigation collapses on desktop and
opens as a modal drawer on phones. Compliance has one generic dashboard action.
Pending issuance and outcomes belong to the selected evaluation or reserved slot.
Scene movement uses confirmed progress and a browser observation checkpoint;
it never decides a pass, failure, issuance or eligibility.

### Typography

**DM Sans is the rebuild's default UI and display family**, chosen from the HTML
reference for its clear numerals, readable body and confident headings. Use
500/550 for reading, 600/650 for controls and 650/700 for headings. The client
homepage deliberately avoids thin supporting text following readability review.
Start with one
family. Do not add a second display face merely to make a page feel designed.

This is a new design decision, not an assertion that DM Sans is installed in all
apps. The old site uses Manrope/Space Grotesk; the new auth shells use Arial/system
type. For a narrow fix, preserve the surrounding implementation. A scoped design
migration should introduce the chosen font once in its app's font owner, verify
its license and fallback, and avoid remote CSS imports. Read the installed Next
font guide for web; use the supported Expo font path for native. Do not add a
font loader dependency for a task that does not need one.

The existing local pixel/game faces belong to short signs, scene dialogue and
collectible treatments. Never use them for money tables, legal copy, form fields
or general navigation. Do not treat `gameboy.ttf` and `game-font.ttf` as the same
face or assume one license covers every file; inspect the specific asset.

| Role | Starting size | Line height and treatment |
| --- | --- | --- |
| Supporting label | 14px / 0.875rem | 1.4; sentence case, normal tracking |
| Body / input | 16px / 1rem | 1.5–1.65; 45–72 character reading measure |
| Intro | 20px / 1.25rem | 1.45–1.55; use sparingly |
| Subheading | 24px / 1.5rem | 1.2–1.3 |
| Page title | 32–40px / 2–2.5rem | 1.1–1.2; generally left aligned |
| Marketing display | 40–72px / 2.5–4.5rem | 1.05–1.12; fluid and allowed to wrap |
| Important amount | 24–40px / 1.5–2.5rem | Tabular lining numerals; explicit currency/unit |

These are starting roles, not fixed sizes to force onto every viewport. Use rem
and bounded fluid scaling on web, native sizing with font scaling on mobile.
Essential instructions stay at least 14px at normal scale; body/input defaults
stay 16px. At 320px, use a wrapped heading, never `nowrap` plus viewport shrinking.
Right-align comparable numeric columns, preserve precision, and distinguish
zero, missing, stale and unavailable values. A dash needs context; it is not zero.

No automatic monospace for small labels. Avoid all-caps eyebrows, exaggerated
tracking, one colored/cursive word in a headline and typographic strikethrough
gimmicks. Use such a treatment only when the specific brief gives it a real job.

### Layout, spacing and controls

Use a 4px rhythm with a small working scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
Start with 16–24px mobile gutters, 32–48px desktop gutters and a 1200–1280px main
content width. Dense staff tables can justify wider layouts. Reading columns stay
narrower. Share alignment lines across headings, rows and actions.

Use space before containers. Borders separate groups or define controls; numbering
communicates a real sequence. Reserve shadows for layering or tactile scene
objects. Ordinary controls start around 6px corners; larger dialogs/panels around
12px; pills are useful for compact status/filter chips, not every action. Reuse
the established component before introducing another radius or button style.

The public homepage and account guide share action styles in `intro.module.css`:
48px minimum height, 6px corners, 14px/600 labels and 18px line icons. Use filled
forest primary actions, outlined secondary actions and unboxed text-only navigation.
Header labels use compact 14px/650 text with 44px minimum touch targets. The full
navigation stays visible above 1200px; narrower screens use a labeled Menu button
with a three-line icon. Mobile retains the crest and a compact single-line Certa
Futures title, with login and signup always visible outside the menu. Mobile login
uses an unboxed 22px sign-in icon with a 44px tap target and a “Log in” accessible label;
desktop retains the text label. The mobile
menu uses the three-line icon with an accessible label. The header signup button
uses a compact 12px label and 32px visible height (30px on mobile with 10px horizontal padding), with its hit area extended to
44px; its label stays on one line. Homepage and account-guide
headings and reading text use black, overriding the forest text default locally.
They share hover, pressed and focus behavior; chapter tabs keep content-driven
heights. The navbar turns white as soon as the page scrolls. The public hero has
one focal point: a large, centered black headline positioned near the top on
desktop and mobile. A short supporting description appears on mobile only; the extra sun/cloud graphic and the community text link are omitted.
Below the headline, “Get started (Free)” is the primary button and “Weekly puzzle”
is a secondary button with a local countdown to Sunday 17:00 America/Toronto.
The puzzle button opens a live API-backed clue/answer dialog. An ivory form sits beside
a forest ticket stage with restrained gold foil, the existing crest, mountain linework
and a perforated stub. Mobile places the clue before the ticket. The foil is a
preview until issuance is confirmed; no client-generated scratch outcome is shown.
The countdown on the hero does not assert published availability.
Transparent navbar links become ivory while the scene shade is active; solid and open-menu headers retain dark text. The approved five-landmark village panorama
runs below the title. The desktop hero/game stage occupies 100svh, including its header space.
Compact headline/actions and viewport-relative bottom spacing preserve room for the village.
Mobile CTAs share one row with compact 13px labels to preserve space for the village
and stop details. A white “Account rules” link and downward arrow sit at the bottom
of the grassy hero, focusing and scrolling to the account guide's first chapter.
Reserve space below mobile content for the link; keep keyboard focus visible and
respect reduced motion when scrolling.
Stop details have no nested scrolling region. The headline and mobile description
remain visible when a stop is active. On mobile, the stage can grow beyond one
viewport so the introduction and stop details fit without overlapping or hiding
text. The character is a separate sprite: it walks
to the cottage, noticeboard, workbench, fountain and telescope shelter, pauses
for 3 seconds facing each object before continuing. Only tapping the character triggers one of five random upright jumps with no consecutive repeats, including while walking; no flips, scaling or double jumps. A transparent accessible button follows the sprite, supports keyboard activation and disappears under reduced motion. Panel hover/focus keeps the panorama and timer paused while explicit taps animate only the character. Dialog/offscreen/hidden pauses freeze jumps, which settle immediately under reduced motion. Titles sit above their physical landmarks during the approach and stop; the separate row of topic labels is removed. The image repeats directly
left-to-right without mirrored landmarks. Large editorial feature panels above the village correspond to actual stops,
with a soft black full-scene shade above the landmark labels and below the content. The headline becomes ivory while a stop is featured. Feature panels use ivory text, a topic-specific line icon, a consistent eyebrow,
a heading and a short description. Use exactly one prominent ivory CTA with forest
text per panel, matching the inverted Get Started treatment. While the scene shade
is active, the transparent navbar's Get Started button and both hero actions use
the same ivory fill and forest text, including shared hover and pressed colors.
Use a clear action label and visible focus states.
The CTA label and arrow remain inline on mobile; the hero's two main actions share
one row. Avoid circular frames or radial decoration around the topic icons.
Stops appear in order: About Certa (mountain/flag), Certa Transparency (shield/check),
Certa Community (conversation), Affiliates (megaphone), then Certa Rewards (gift).
About opens the evaluation guide; Transparency opens Firm Rules while Live Trader
Progress has no destination. Community and affiliate questions use the verified
Certa Discord invite. Rewards opens the existing weekly puzzle dialog; copy must
not promise a discount, prize reveal or ticket before its server-confirmed state.
A keyboard-accessible topic selector allows direct selection even
with reduced motion or an unavailable scene; keyboard focus holds the stop, and
hovering a panel pauses the scene until pointer leave. Panel text wraps on mobile; headline sizing follows viewport width rather than viewport height. Mobile uses a 64px character; desktop uses 88px. There is
no visible pause control. Reduced motion and offscreen/hidden pause remain.
Navbar labels use title case: Account Rules, Live Trader Progress, Customer Support,
Certa Sundays, Bug Reports, Log In and Get Started.
For a server-validated customer session with completed second factor, the navbar
hides Log In and both navbar and hero replace Get Started with Dashboard linking
to `/account`. Expired verification returns to the full login dialog. Guest and invalid sessions keep
the existing auth actions; guests without a session cookie cause no auth lookup.
At 700px and below, the header shows the crest, compact Certa Futures title,
login icon, Get started, and an icon-only menu button in one row. Auth actions
sit outside the menu. Wider navigation stays unchanged.


Keep one primary action per decision group. Secondary actions remain readable
without competing fills. Visible labels, focus, pressed/pending/disabled states,
field errors and an explanation for blocked actions are part of the component.
Target 44px touch areas, expanding hit areas around compact icons when needed.
Use real icons with consistent stroke/geometry, not emoji as control icons.
Keep the existing crest asset and proportions; do not redraw the logo in CSS.

Illustrative Certa objects can be richer than interface icons. Preserve crisp
pixel edges for actual pixel assets; never pixelate text or photographic/model
renders just to make them match the game. Crop artwork intentionally across sizes.

## Dialogs and bottom sheets

Web dialogs use `apps/web/app/_components/responsive-dialog.tsx`. Desktop uses
a centered ivory surface with content on the left and an optional illustrated
right panel, without an outer border around the image.
Auth dialogs set `contentSized`: desktop height comes from
the form column, while the editorial panel fills that height and compresses its
copy for shorter forms. There is no fixed minimum dialog height. At 700px and
below it becomes a bottom sheet. Auth uses the optional `mobileArtwork="strip"` treatment:
the editorial panel becomes a short illustrated header inside the same opaque sheet, with no transparent gap.
Other decorative panels are hidden by default. Opening takes 200ms and
closing 160ms, with reduced motion disabling both. Use the native modal top layer
for focus trapping and background inertness, restore focus/scroll on dismissal,
and focus the heading initially so opening does not summon a phone keyboard.
Inputs, selects and textareas are 16px minimum. The shared text-field skin in
`packages/ui-web/src/styles.css` excludes checkboxes and radios, which keep the native
control and take only the brand accent: padding meant for a text field collapses a 20px
box. When checking a form's layout, load that stylesheet and `globals.css` alongside the
module, or the global rules that actually style the control are invisible. The sheet tracks the visual
viewport in a full-screen native dialog shell and respects bottom safe-area padding.
Only the inner content scrolls; the close button remains accessible. Lock both root
and body scrolling, block single-finger scroll chaining at sheet edges, and restore
original styles and page position on dismissal. An ivory backing fills the area below
the visual viewport to avoid transparent keyboard/safe-area gaps. Preserve pinch zoom.
Native iOS keyboard and toolbar behavior still requires a physical-device check.

Signup, login, recovery and the weekly puzzle share this shell. Auth uses the
existing village artwork in an editorial panel that explains the moment: the
signup panel carries the headline plus four perks taken from the firm's own perk
list (100% payout split, no daily loss limit, no consistency rules, no activation
fee), each with a gold line icon from `village-graphic.tsx`; login welcomes the
trader back, and recovery explains the reset link. Perk icons join the existing
icon set rather than starting a second one, and keep its 64 viewBox, 2.5 stroke
and round joins. As the panel shortens the landscape band yields first, then the
perk details, then the fourth perk, so copy never sits on bright sky. Signup is paginated into three short forms, but
the form column shows no step heading, progress bar or subtitle: the fields say
where you are. The step number stays in a visually hidden heading that takes focus
on each change, so it is still announced. Legal first and last name share one row
at every width, and so do the public @ and country of residence, with the @ hint
below the pair. Country of residence is the platform select at every width, which
already searches a long list by keystroke; there is no custom combobox. The
"Already have an account?" link shares one row with the step's back control, and login
shares its row with "Forgot password?". Signing in does not leave the dialog: once the
password is accepted the same panel shows the six-digit code step, which requests the code
on open and offers a resend with a countdown.
Puzzle uses its ticket artwork. Keep feature operations outside the shell. DM Sans is loaded once by the
web root layout so portal-mounted dialogs inherit the same typography.

## Motion and the game world

Use motion to answer an action, show changed state or introduce one focal scene.
Small UI transitions can begin around 120–200ms; scene choreography needs its own
purpose and budget. Avoid independent scroll reveals on every section, perpetual
button pulses, hover lifts on every row and scroll hijacking.

The client web app hides browser scrollbar tracks and thumbs, including nested
scroll areas, through `apps/web/app/globals.css`. Preserve wheel, trackpad, touch
and keyboard scrolling; do not use `overflow: hidden` to hide a scrollbar.

Respect reduced motion on first render. Provide a still scene or an immediate
state transition with the same information; a pause button alone is insufficient.
Pause optional work when hidden/offscreen and clean up listeners, frames and GPU
resources on unmount. Verify this in the affected mode; it is not proven across
the current game package merely because an older host supported pause messages.

For embedded interactive scenes, use the canonical `packages/game` modes and
the protocol in `AWARDS.md`. Kaplay
owns 2D scenes, React the overlays, Three.js the 3D previews. Load one selected
model on demand; the existing beta model is about 54 MB. Ordinary forms must be
usable before a scene loads and when WebGL is unavailable. Native WebView scenes
are not currently integrated or device-verified.

A brief native character/sprite animation can use the existing platform animation
tools without a WebView or a new engine. Keep its reduced-motion still and its
meaning explicit. Request acknowledgement can celebrate a confirmed submission;
it must not advance the canonical summit, pass or earned-payout journey.

## Interface language and honest states

Write in sentence case with concrete verbs: “Save changes,” “View receipt,”
“Request payout.” Use the same action name in its confirmation. Name what the
trader understands, not internal tables, webhooks, projections or provider jobs.
Do not add filler such as “Unlock your potential” to make a layout look finished.

Show prerequisites near the action. Distinguish requested, processing, approved
and completed using the actual operation contract. Do not show “Paid” when a
request was only accepted, or “Funded” when compliance is still pending. On an
ambiguous result, explain that confirmation is pending and provide the supported
status/recovery path; a blind retry can duplicate a financial operation.

Use synthetic fixtures only in explicit previews/tests. Label sample data where
it appears. Do not copy the HTML demo's client-side KYC toggles or invented amounts
into real flows. Account limits, prices and legal claims come from current product
contracts and verified data, not screenshots, old copy or a design prompt.

Errors explain what failed and the next useful action without raw provider codes
or personal records. Empty states explain what belongs there and an available
next step. Stale data includes understandable freshness; unavailable data is not
silently rendered as a healthy zero.

## Review and change control

Before substantial frontend work, write a brief design direction, compare plausible
compositions, then critique it against this document and the user's request.
When the user supplies an exact layout, critique within it instead of proposing
competing layouts. Small fixes need only the relevant decision. See the skill for the workflow and
its [review guide](.agents/skills/certa-frontend/references/review.md) for acceptance.

Review real renders at desktop and narrow mobile sizes, keyboard behavior, actual
font loading and non-happy states. Check body-text contrast at 4.5:1 and essential
control/focus boundaries at 3:1; color alone never conveys state. Test reflow and
200% text zoom. These are project quality targets, not a claim of certification.

Update this document when a deliberate design decision changes the shared
language. Keep implementation tokens and this guidance aligned in the same scoped
change. A seasonal page is not permission to fork the global design system.

The [source map](.agents/skills/certa-frontend/references/sources.md) records which
parts came from the old app, the supplied HTML, live-site review and new decisions.
Reference folders may be absent in another checkout; the principles here remain
usable without importing or depending on them.

### Staff workspace frame

The admin frame uses a Forest desktop sidebar adjacent to an Ivory workspace,
with Gold marking the active route. At 800px and below it becomes a top bar with
an in-flow navigation accordion, Escape dismissal and focus restoration. This
follows the client’s mobile dismissal conventions without introducing a modal
for navigation. Staff permissions use readable grouped controls; protected master
status and denied/loading/unknown outcomes remain explicit. The existing admin
system font is retained for this navigation and permissions change.

The initial panorama is a preloaded static image behind the game frame. Reveal the
hero content once the background or scene is ready, with image-error and two-second
timeout fallbacks and a no-JavaScript text fallback. Do not gate account access on
scene loading.

### Public account rules guide

The account guide is a forest stage with one game gesture: a horizontal stage
trail. Evaluation, Certified Funded, Max Drawdown and Firm Rules are numbered
stages on a path; the reached part of the path and the selected node turn gold,
a “Stage n of 4” counter sits beside the heading, and the village character
sprite (`/game/characters-black-hair.png`, CSS sprite, pixelated) walks to the
selected stage over 420ms using the game's walk frames. Reduced motion moves it
instantly with no walk cycle. The trail scrolls horizontally on narrow screens
and keeps the selected tab in view without moving the page; keyboard arrows,
Home and End move between stages at every width.
Content sits on a raised pine panel: a forest account/fee summary, three
target/drawdown/position tiles, and evaluation/firm rules. The evaluation stage
draws one “run” bar from the $50,000 start with the $48,500 floor and $53,000
target, labelled as illustration. The drawdown tile opens Max Drawdown through
“Learn more”; the worked example stays in that section. The fee summary shows
$150 struck through beside $120, with a mystery coupon showing the minimum 20%
discount and checkout reveal copy. These coupon figures are preview presentation
only. Previous/Next stage buttons close the panel; the last stage shows a
plain end note. The single signup CTA below the panel is gold with forest text.
Section indices for hero links are unchanged. These figures remain public
design-preview copy, not plan or eligibility authority.

### Staff authentication

Staff authentication uses a cream-white `#FAF9F5` page, a restrained crest header,
and an ivory form surface. Its local DM Sans font and 48px white, 6px-radius inputs
match the client auth dialog, including password Show/Hide, forest primary action,
visible labels and inline recovery link. Staff authentication remains email/password;
customer signup and second-factor flows are not part of this interface.

### Customer checkout

The `/checkout` route owns a compact crest header, a single Review / Payment /
Account indicator, and a sage order summary to the left of the cream form. On
mobile the summary precedes the form; quantity, discount and payable USD stay
visible before the action. The existing mountain still provides the one art cue.
Use the same cream, forest, sage and DM Sans roles as the overview. Card and Crypto
are customer choices; processor names remain operational configuration. Verified
payment and each purchased evaluation's issuance are separate states. The overview's
creator-code row is compact and expandable; discount percentages come from the server.

Client and staff navigation share the cream sidebar, forest active state, line
icons, collapse control and mobile drawer. The customer menu is Accounts, Purchase
account, Trader Payouts, Affiliates, Trophy Cabinet, Receipts, Compliance and
Customer Support. Trading Terminal and Merch Store are omitted from customer
navigation. The staff menu is Weekly Puzzle, Newsletter,
Coupons, Tickets, Traders, Trading Accounts, Compliance, Firm Risk/Economics,
Payouts, Checkout, Affiliates, Staff Accounts, Bug Items and Customer Support.
Keep this order and show planned destinations while their pages are built.
Existing routes are reused; a navigation link does not imply a feature is implemented.
The footer opens a personal account dialog rather than linking the email directly
to security. Its pixel character uses the saved Certa avatar and the game renderer.
The dialog shows production username and compliance status, character colour
editing, and links to compliance, Discord, security and support. Staff see their
own personal record; customer-only actions open the configured client origin.

Account dialogs use a compact forest tab sidebar on the left and a larger cream
content panel on the right. Identity stays small above the tabs. Overview opens
with a welcome, owned account P&L snapshot and session summary; dedicated tabs
show Session, Compliance, Character, Security, Discord and Support. Mobile keeps
the bottom sheet, with identity above horizontally scrollable tabs and content
below. Tabs support arrow keys, Home/End and labelled panels.
