# template-pipeline — vendored template renderer

Vendored from `references/AI-auto-generate-video` (sibling checkout of the
upstream repo, MIT), commit `15c0103bd127e9a2ed963e81cdc33b04b17482cc`.

## What was kept

| File | Upstream source |
| ---- | --------------- |
| `compose-template.ts` | `src/render/template-composer.ts` |
| `video-tools.ts` | `src/render/video-tools.ts` |
| `audio-tools.ts` | `src/assets/audio-tools.ts` |
| `sfx-selector.ts` | `src/assets/sfx-selector.ts` |
| `templates/` (11 dirs + `CATALOG.md`) | `templates/` |

## What was deliberately dropped

`src/cli.ts`, `src/config.ts` (OneVoice has `readServerEnv`), `src/utils/logger.ts`
(repo uses the `DiagnosticSink` seam), `src/tts/*` (T5 owns the TTS client),
`src/render/template-pipeline.ts` (T7 rewrites it), `src/render/template-script-schema.ts`
(T2 replaces it), `scripts/`, `dist/`, `assets/`, `output/`, `.agent/`, `.claude/`,
`package-lock.json`. Upstream `*.test.ts` files were not ported — they are
`nock`/`axios`-shaped against removed code paths; T2/T3/T7 write first-party
tests against the adapted surface instead.

## Adaptations

- `.js` ESM import suffixes stripped (`moduleResolution: bundler`).
- No `axios` (Node 24 native `fetch` is used where HTTP is needed); no `dotenv`.
- `// SPDX-License-Identifier: MIT` headers on vendored sources.
- `composeTemplate` takes an injected `templatesRoot` instead of resolving from
  `import.meta.url` (Next standalone relocates the module), and spawns the
  pre-installed hyperframes binary with `shell: false` (offline + no
  shell-injection surface on model-authored text). Never `npx`.
- `TEMPLATES_DIR` no longer exists as a module constant — every call passes
  `templatesRoot` explicitly so app, worker and Docker image can each root it
  differently (`ONEVOICE_TEMPLATES_ROOT`).
- `quality`/`draft` render presets dropped: T7 always renders `standard` at the
  script's fps. Re-add only if a caller needs it.

## Fonts (R-B)

Every `fonts.googleapis.com` `<link>` was replaced with a local `@font-face`
block under each template's `assets/fonts/` (latin + vietnamese subsets only,
`.woff2`). All 8 referenced families vendored: Alfa Slab One, Archivo,
Be Vietnam Pro, Dancing Script, Inter, Inter Tight, Lora, Space Mono, Unbounded.
`templates.test.ts` fails on any remote font URL.

## Rebranding (R-J)

All `aicodingvn` URLs → `https://onevoice.local/` and `AI Coding` channel
defaults → `OneVoice` inside template `data-composition-variables` defaults
(the on-screen text when a slot is left unfilled), `CATALOG.md` examples and
template `meta.json` display names. Provenance notes (`NOTICE.md` files)
intentionally still name the upstream author.

## T0-gated steps (not yet done)

- `ONEVOICE_HYPERFRAMES_PATH` in `src/lib/env/server.ts`, resolved through
  `src/lib/render/runtime-paths.ts`.
- `p-limit` + `hyperframes@0.6.94` in `package.json` (needed by T7, not this module).
