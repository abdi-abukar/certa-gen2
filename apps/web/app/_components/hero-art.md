# Introduction asset provenance

This records sources for the public home introduction. Visual principles remain
in [FRONTEND.md](../../../../FRONTEND.md); this is not a separate design guide.

| Asset | Source and treatment |
| --- | --- |
| `apps/web/public/brand/certa-crest.png` | User-owned Certa crest copied unchanged from the parent application's `public/logo.png`; 325 × 325, 139,792 bytes. Preserve its full proportions and transparent edges. |
| `apps/web/app/_components/fonts/dm-sans-latin.woff2` | Official Google Fonts DM Sans v17 Latin variable font, weights 400–700; 36,980 bytes. Loaded with `next/font/local`; no runtime Google Fonts request. |
| `apps/web/app/_components/fonts/OFL.txt` | Original SIL Open Font License 1.1 for the DM Sans Project Authors, retained alongside the font. |
| `apps/web/public/brand/hero-landscape.webp` | New image generated with the built-in `image_gen` tool on 2026-09-15, then compressed to WebP with the installed Sharp dependency; 1536 × 1024, 118,894 bytes. |

Font acquisition used the official [variable-font stylesheet](https://fonts.googleapis.com/css2?family=DM+Sans:wght@400..700&display=swap),
its [Latin WOFF2 asset](https://fonts.gstatic.com/s/dmsans/v17/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K6z9mXg.woff2)
and the [Google Fonts license file](https://raw.githubusercontent.com/google/fonts/main/ofl/dmsans/OFL.txt).

The landscape's material/style reference was Certa's blank winning-trade plate,
`packages/server/assets/awards/certs/win-plate.jpg`. A synthetic certificate preview
was also inspected locally. Neither the private plate nor a rendered certificate
was copied into public assets. The new landscape has no customer data, certificate
number, financial amount, lettering or logo. Its pale sky is scoped to this home
composition; it does not redefine the shared palette.

The generated PNG was saved by the tool at
`/Users/abdiabukar/.codex/generated_images/01a0a7b3-c79d-7673-850d-aa6cf8741809/exec-85e3ba12-16b4-4032-bd0d-fd30e2e99aca.png`.
That machine-local source is provenance only; the app uses the committed WebP and
does not depend on the parent repo or generation cache.

## Full generation prompt

```text
Use case: stylized-concept. Asset type: clean landscape background for the Certa Futures website hero, 1536x1024 landscape. The attached image is a STYLE AND MATERIAL REFERENCE for the user's own winning trade certificate. Create a new unbranded landscape with the same handcrafted detailed pixel-art alpine scenery and bright hopeful morning light: expansive pale blue sky with a few soft small clouds, layered blue distant mountains, evergreen trees, grassy warm stone ground at the very bottom. Composition is critical: upper 75% is very calm pale light-blue sky usable behind real dark HTML text and a separate interactive character; all mountains and foreground ground concentrated in bottom 25%, mountains low on horizon, small evergreens only around lower edges. No floating islands, no character, no logo, no crest, no numbers, no letters, no signs, no UI, no borders. Preserve fine pixel-art edges and rich grassy rock textures near the bottom. Lighter, softer pale sky than reference so navy website copy will remain readable. Background only, not a screenshot of a website. This art will be layered behind actual HTML typography and actual game-engine ledges.
```

## Approved village replacement

`packages/game/public/firm-landscape.webp` now contains the five-landmark village
approved in the conversation: cottage, noticeboard, canvas-covered workbench,
fountain and telescope shelter. It replaces the previous empty panorama. The
source has no baked-in character. It was generated with the built-in image tool,
then converted to WebP (quality 94, unchanged dimensions) using installed Sharp.

Selected source:
`/Users/abdiabukar/.codex/generated_images/01a0aae9-976b-70d0-a9db-d2602d1824be/exec-24671843-8a89-45fc-9d0e-9b756005d8ff.png`.

The image brief requested five evenly spaced landmarks, a continuous level path,
open sky, no people or UI, and matching left/right scenery for direct repetition.
The final edit preserved the center while refining both outer edges to remove
mismatched clouds and match path height and foreground treatment. The approved
image is used unchanged apart from format compression; exact edge continuity
has not been certified through rendered browser QA.

The separate character remains `packages/game/public/characters-black-hair.png`.
The scene registers stops to landmark centers, uses `up-idle` to face the objects,
and repeats the image without mirroring. The web host reuses the same built
`/game/firm-landscape.webp` for loading/error fallback. No runtime dependency on
the machine-local generated-image directory remains.
