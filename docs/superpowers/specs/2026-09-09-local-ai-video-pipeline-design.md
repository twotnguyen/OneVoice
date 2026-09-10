# OneVoice Local AI Video Pipeline — Design Specification

## Goal

Build the first complete local OneVoice flow:

```text
Supabase catalog → product selection → OpenCode Zen content
→ deterministic FFmpeg render → private local MP4
→ browser preview → download
```

This slice does not publish to Facebook, Messenger, TikTok, or any other
channel. It keeps the external seams small enough that durable jobs and channel
adapters can be added later without rewriting the product, AI, storyboard,
renderer, storage, or UI contracts.

## Product scope

- Show a server-scoped page of real, content-ready laptop products from the
  existing Supabase project.
- Let the user select one product and start one render at a time.
- Generate a bounded hook, caption, and call to action with the real OpenCode
  Zen Responses endpoint and the configured model.
- Render a 12-second, 1080×1920 H.264 MP4 from a fixed three-scene storyboard.
- Prefer the catalog product image; fall back to a text-only render when the
  remote image cannot be safely resolved.
- Store the MP4 and a small manifest under the ignored local media root.
- Preview the resulting MP4 with native browser controls and download it.
- Show catalog, AI, image, render, storage, and missing-artifact failures in the
  interface with a useful retry action.

Catalog facts are a public snapshot with `collected_at`, not live store stock.
The UI and generated prompt must call them a snapshot and must not imply a
commercial relationship with the source.

## Architectural decision

Use one synchronous, server-only `ProductVideoPipeline` in the existing Next.js
process. The AI timeout is 30 seconds, image resolution timeout is 10 seconds,
and FFmpeg timeout is 45 seconds. The client generates a render UUID, then the
request stays open while the local pipeline completes.

This is intentionally local-only. An in-process fire-and-forget queue would
lose work while pretending to be durable; a Supabase outbox, BullMQ, Valkey,
and worker would materially enlarge this first slice. When deployment requires
durability, `POST /api/renders` can persist `PENDING` and return `202`, and a
worker can call the same pipeline interface. The UI status and media routes do
not need to change.

Direct FFmpeg is a temporary `VideoRenderer` adapter. It does not introduce a
second video DSL beside the documented Revideo direction. Revideo can replace
the adapter later. TTS is excluded: the MP4 is subtitle-led and has no cloned or
generated voice.

No Supabase migration is required. Supabase remains the product source of
truth; render status and artifacts are explicitly local runtime data.

## Deep modules and interfaces

### Product catalog module

The existing `CatalogRepository` remains the Supabase adapter. Every detail and
AI-context query must include the server-derived organization ID.

```ts
type OrganizationScope = Readonly<{ organizationId: string }>;

type StudioProduct = Readonly<{
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  priceVnd: number;
  currency: string;
  stockQuantity: number | null;
  collectedAt: string | null;
}>;

type ProductSnapshot = Readonly<{
  productId: string;
  organizationId: string;
  name: string;
  sku: string | null;
  brand: string | null;
  priceVnd: number;
  currency: string;
  stockQuantity: number | null;
  collectedAt: string | null;
  primaryImageUrl: string | null;
  facts: readonly ProductFact[];
}>;
```

The browser never supplies an organization ID. The local composition root uses
`ONEVOICE_ORGANIZATION_ID`, defaulting to the existing demo organization UUID.
No raw description HTML, source payload, or arbitrary provider row crosses the
catalog seam.

### AI and content module

`OpenAICompatibleProvider.generateText()` is corrected to the verified
Responses contract:

- `POST ${AI_BASE_URL}/responses`
- Bearer authorization and `Content-Type: application/json`
- a fresh UUIDv4 `x-session-id` per request
- body `{ model, input }`
- no `max_output_tokens: 32`
- accept top-level `output_text` or nested `output[].content[].output_text`
- timeout and empty-output failures contain no key or provider body

`generateProductContent(provider, snapshot)` asks for strict JSON and parses it
with Zod into:

```ts
type GeneratedProductContent = Readonly<{
  hook: string;
  caption: string;
  cta: string;
  model: string;
  responseId?: string;
}>;
```

The prompt contains only allow-listed structured facts, explicit snapshot
wording, and length limits. AI supplies language, while application code owns
the exact price, SKU, and snapshot facts shown in the video.

### Video module

`compileProductStoryboard(snapshot, content)` is pure and returns exactly three
four-second scenes: hook, facts, and call to action. It owns text limits and
line wrapping.

`RemoteImageResolver.resolve(url)` only fetches HTTPS images from an explicit
hostname allow-list, revalidates redirects, applies a 10-second timeout and an
8 MiB cap, accepts JPEG/PNG/WebP, and writes to a private temporary directory.
Any resolution failure yields a deterministic text-only fallback rather than
handing a URL to FFmpeg.

`VideoRenderer.render(request)` accepts a storyboard and optional trusted local
image path. `FfmpegVideoRenderer` uses `spawn()` argument arrays with no shell,
fixed dimensions/duration/frame rate, H.264, `yuv420p`, `faststart`, bounded
stderr, timeout, and temporary-file cleanup. It runs `ffprobe` before returning
and rejects output that is not a playable 1080×1920 MP4.

`LocalVideoLibrary` is the only module that knows the filesystem root. It uses
UUID-only artifact IDs, atomic rename, and stores:

```text
<ONEVOICE_MEDIA_ROOT>/<render-id>/video.mp4
<ONEVOICE_MEDIA_ROOT>/<render-id>/manifest.json
```

Request data never becomes a path. The default media root is the ignored
`renders/` directory.

### Orchestration module

```ts
interface ProductVideoPipeline {
  create(command: {
    renderId: string;
    productId: string;
    scope: OrganizationScope;
  }): Promise<RenderRun>;
}
```

The pipeline is the deep module that sequences product lookup, AI generation,
asset resolution, storyboard compilation, FFmpeg rendering, storage, cleanup,
and terminal status. Its safe result contains generated copy and artifact IDs,
never local paths, secrets, or raw provider payloads.

## HTTP interface

- `GET /api/products?page=1&pageSize=18` returns laptop summaries from the
  configured organization.
- `POST /api/renders` validates `{ renderId: uuid, productId: uuid }`, runs the
  pipeline, and returns `201` on success or a structured safe error.
- `GET /api/renders/:renderId` returns the saved safe manifest or `404`.
- `GET /api/renders/:renderId/video` streams MP4 inline and supports valid byte
  ranges.
- `GET /api/renders/:renderId/download` streams the same MP4 as an attachment.

Media responses use `video/mp4`, `Accept-Ranges: bytes`,
`Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`.

## User interface

The page becomes a Vietnamese “production desk,” keeping the existing cobalt,
ink, and teal identity without generic dashboard cards:

```text
┌ product catalog ──────┬ campaign script ─────┬ finished video ─────┐
│ selectable rows       │ selected snapshot    │ native video player │
│ name/brand/price      │ hook/caption/CTA     │ download action     │
│ loading/error/empty   │ true current stage   │ error/retry state   │
└───────────────────────┴──────────────────────┴──────────────────────┘
```

The client reports real stages—loading products, generating content, resolving
the image, rendering, and ready—without fabricated percentages. Selection,
keyboard focus, mobile layout, reduced motion, empty state, and error recovery
must remain clear.

## Security and operational constraints

- Supabase and AI secrets remain server-only and are never serialized or
  logged.
- Organization scope is configured on the server, not accepted from the client.
- Catalog text is untrusted data, not an instruction; raw HTML/descriptions are
  excluded from prompts and video filters.
- Remote image scheme, host, redirects, MIME, and byte count are bounded.
- Local file lookup accepts UUIDs only and verifies the resolved path remains
  inside the configured media root.
- FFmpeg receives only trusted local paths and controlled argument arrays.
- The current Homebrew FFmpeg build is GPL-enabled. It is valid evidence for
  the local proof only, not a blanket public-release licensing decision.
- Docker installs its own FFmpeg package and mounts a writable local media
  directory; README records the native and container requirements.
- Generated MP4s and manifests remain Git-ignored.

## Verification

- TDD unit tests for organization scoping, Responses URL/body/fresh UUID,
  output parsing, prompt/schema validation, storyboard facts, safe local paths,
  range parsing, and visible failure results.
- A real FFmpeg integration test renders a local fixture and verifies codec,
  pixel format, dimensions, duration, and MP4 format with `ffprobe`.
- Fresh live checks run `pnpm data:verify` and `pnpm ai:verify`.
- One real pipeline run uses a Supabase product, OpenCode Zen, a catalog image
  when safely available, and produces a probed local MP4.
- `pnpm check`, production build, Docker configuration/build, and secret/client
  bundle scans pass.
- Browser E2E selects a product, generates content, waits for the real MP4,
  plays it, and downloads it through the visible UI.

## Explicitly out of scope

- Social publishing, inbox, Messenger, Facebook, TikTok, or Zalo adapters.
- Revideo, TTS, voice cloning, music, sound effects, or AI avatars.
- Durable queue/worker, retries across process restarts, or Supabase render-job
  tables.
- Content approval, Truth Guard, Campaign/Passport persistence, and the later
  opportunity-to-order vertical slice.
