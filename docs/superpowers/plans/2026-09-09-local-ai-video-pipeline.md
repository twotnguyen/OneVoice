# OneVoice Local AI Video Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a real local flow from Supabase product selection through OpenCode Zen content generation to a stored, playable, downloadable MP4.

**Architecture:** A synchronous server-only `ProductVideoPipeline` coordinates the existing Supabase catalog adapter, the verified OpenCode Responses contract, a pure three-scene storyboard compiler, an FFmpeg renderer adapter, and a private local video library. Next.js route handlers expose product, render-status, preview, and download interfaces while the browser receives no secrets or filesystem paths.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Zod 4, Supabase JS 2, Vitest 5, Node 24+, FFmpeg/ffprobe 7-compatible, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-09-local-ai-video-pipeline-design.md`

## Global Constraints

- Use pnpm 11.24.0 and Node >= 24.
- Supabase and AI credentials stay server-only and never appear in client props, responses, logs, Git, or documentation.
- Use the real OpenCode Zen `POST /responses` contract with a new UUIDv4 `x-session-id` per request; do not set `max_output_tokens: 32`.
- Organization scope comes from `ONEVOICE_ORGANIZATION_ID` on the server and defaults to `a0000000-0000-0000-0000-000000000001`; it is never accepted from the browser.
- Catalog data is a dated public snapshot. UI and prompts must not describe it as live store inventory or imply a source partnership.
- Store generated runtime data only below `ONEVOICE_MEDIA_ROOT`, default `renders/`; generated media remains Git-ignored.
- The first slice is synchronous and local-only. Do not add a queue, worker, Valkey, Revideo, TTS, social adapter, or Supabase render-job migration.
- Remote images are optional and bounded. An invalid/unavailable image produces a text-only video, not a failed render.
- FFmpeg receives controlled argument arrays and trusted local paths only; output must be probed before storage.
- Every new behavior follows RED → verify the expected failure → GREEN → REFACTOR.

---

### Task 1: Server-scoped catalog for the production desk

**Files:**
- Modify: `src/lib/catalog/types.ts`
- Modify: `src/lib/catalog/repository.ts`
- Modify: `src/lib/catalog/repository.test.ts`

**Interfaces:**
- Produces: `OrganizationScope`, `StudioProduct`, `ProductFact`, and `ProductSnapshot` types.
- Produces: `CatalogRepository.listStudioProducts(scope, pagination)` returning only safe laptop summaries.
- Produces: `CatalogRepository.getProductSnapshot(scope, productId)` returning allow-listed product facts and the primary image URL.
- Preserves: all existing repository methods unless a direct signature change is needed to enforce organization scoping.

- [ ] **Step 1: Add failing organization-scope and mapping tests**

Add tests whose fakes mirror complete Supabase rows and prove:

```ts
await repository.listStudioProducts(
  { organizationId: "org-1" },
  { page: 1, pageSize: 18 },
);

expect(query.eq).toHaveBeenCalledWith("organization_id", "org-1");
expect(query.eq).toHaveBeenCalledWith("product_type", "laptop");
expect(result.items[0]).toEqual({
  id: "prod-1",
  name: "Laptop ASUS",
  sku: "LAP-01",
  brand: "ASUS",
  priceVnd: 30_000_000,
  currency: "VND",
  stockQuantity: 4,
  collectedAt: "2026-08-31T00:00:00Z",
});
```

Add a snapshot test that expects the product lookup to include both `id` and
`organization_id`, excludes raw descriptions/source payload, and maps literal
facts for product name, SKU, price, stock, and a bounded list of structured
specifications.

- [ ] **Step 2: Run catalog tests and verify RED**

Run:

```bash
pnpm test src/lib/catalog/repository.test.ts
```

Expected: FAIL because `listStudioProducts`, `getProductSnapshot`, and the new
types do not exist.

- [ ] **Step 3: Implement the minimal catalog interface**

Add immutable types matching the design spec. Implement product listing from
`content_ready_products` with exact organization, `product_type=laptop`,
`quality=usable`, `in_stock=true`, positive price, price-descending order, and
bounded pagination `1..100`.

Implement snapshot lookup with both identifiers:

```ts
.eq("product_id", productId)
.eq("organization_id", scope.organizationId)
.maybeSingle()
```

Map only allow-listed facts. Treat a missing/zero price as no snapshot. Keep
`source_payload`, description HTML, breadcrumbs, and arbitrary JSON out of the
result.

- [ ] **Step 4: Run focused and full checks**

```bash
pnpm test src/lib/catalog/repository.test.ts
pnpm lint
pnpm typecheck
```

Expected: all commands exit 0 with no warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog/types.ts src/lib/catalog/repository.ts src/lib/catalog/repository.test.ts
git commit -m "feat(catalog): expose scoped studio products"
```

---

### Task 2: OpenCode Responses adapter and bounded campaign content

**Files:**
- Modify: `src/lib/ai/provider.ts`
- Modify: `src/lib/ai/openai-compatible.ts`
- Modify: `src/lib/ai/openai-compatible.test.ts`
- Create: `src/lib/content/types.ts`
- Create: `src/lib/content/generate-product-content.ts`
- Create: `src/lib/content/generate-product-content.test.ts`

**Interfaces:**
- Produces: `AiProvider.generateText({ prompt, timeoutMs? })` returning text, model, optional response ID, and normalized usage.
- Produces: `generateProductContent(provider, snapshot): Promise<GeneratedProductContent>`.
- Consumes: `ProductSnapshot` from Task 1.

- [ ] **Step 1: Replace chat-completions expectations with failing Responses tests**

Test two calls and capture request URL, headers, and body. Assert literal
behavior:

```ts
expect(urls).toEqual([
  "https://opencode.ai/zen/v1/responses",
  "https://opencode.ai/zen/v1/responses",
]);
expect(bodies[0]).toEqual({
  model: "muse-spark-1.3-contributor-free",
  input: "Write the campaign.",
});
expect(sessionIds[0]).toMatch(UUID_V4_PATTERN);
expect(sessionIds[1]).toMatch(UUID_V4_PATTERN);
expect(sessionIds[0]).not.toBe(sessionIds[1]);
```

Add cases for nested `output_text`, top-level `output_text`, empty output, HTTP
failure without response-body leakage, and timeout forwarding. Do not assert on
the random UUID generator itself; assert the observable header contract.

- [ ] **Step 2: Run the adapter test and verify RED**

```bash
pnpm test src/lib/ai/openai-compatible.test.ts
```

Expected: FAIL because the implementation still calls `/chat/completions` and
uses the old request/response shape.

- [ ] **Step 3: Implement the Responses adapter**

Use `randomUUID()`, `AbortSignal.timeout(input.timeoutMs ?? 30_000)`, and a Zod
schema that accepts:

```ts
{
  id?: string;
  model?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
}
```

Send only `model` and `input` in the JSON body. Return a safe error containing
only the HTTP status for provider failures. Reject whitespace-only output.

- [ ] **Step 4: Add failing content-generation tests**

Use a fake provider that returns fenced and unfenced JSON. Prove that the module:

```ts
expect(content).toEqual({
  hook: "Sẵn sàng cho mọi trận đấu.",
  caption: "Hiệu năng mạnh trong một thiết kế gọn gàng.",
  cta: "Xem thông tin sản phẩm",
  model: "muse-test",
  responseId: "resp-1",
});
```

Also prove malformed JSON, overlong fields, and missing fields are rejected;
the prompt contains the literal product facts and snapshot date but does not
contain `source_payload`, HTML, or instructions copied from a description.

- [ ] **Step 5: Run the content test and verify RED**

```bash
pnpm test src/lib/content/generate-product-content.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 6: Implement minimal prompt assembly and parsing**

Define a Zod schema with `hook` 8–90 characters, `caption` 20–280 characters,
and `cta` 3–60 characters. Strip one optional Markdown JSON fence, parse the
object, and return provider provenance. The prompt explicitly says the facts
are data, asks for exactly one JSON object, forbids invented price/stock/specs,
and calls `collectedAt` a snapshot date.

- [ ] **Step 7: Run focused and full checks**

```bash
pnpm test src/lib/ai/openai-compatible.test.ts src/lib/content/generate-product-content.test.ts
pnpm lint
pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai src/lib/content
git commit -m "feat(ai): generate product copy through Responses API"
```

---

### Task 3: Deterministic local MP4 rendering and storage

**Files:**
- Create: `src/lib/video/types.ts`
- Create: `src/lib/video/storyboard.ts`
- Create: `src/lib/video/storyboard.test.ts`
- Create: `src/lib/video/remote-image-resolver.ts`
- Create: `src/lib/video/remote-image-resolver.test.ts`
- Create: `src/lib/video/ffmpeg-renderer.ts`
- Create: `src/lib/video/ffmpeg-renderer.test.ts`
- Create: `src/lib/video/local-video-library.ts`
- Create: `src/lib/video/local-video-library.test.ts`
- Create: `src/lib/video/http-range.ts`
- Create: `src/lib/video/http-range.test.ts`

**Interfaces:**
- Produces: `compileProductStoryboard(snapshot, content): VideoStoryboard`.
- Produces: `RemoteImageResolver.resolve(url): Promise<ResolvedAsset | null>`.
- Produces: `FfmpegVideoRenderer.render(request): Promise<RenderedVideo>`.
- Produces: `LocalVideoLibrary.save/getRun/readVideo` using UUID-only IDs.
- Produces: `parseByteRange(header, size)` for safe preview streaming.

- [ ] **Step 1: Add failing pure storyboard tests**

Assert a literal three-scene result with schema
`onevoice.storyboard.v1`, template `product-spotlight-v1`, canvas
1080×1920/30fps/12,000ms, four seconds per scene, exact product price rendered
by application code, and long copy wrapped/truncated to bounded lines.

- [ ] **Step 2: Run storyboard test and verify RED**

```bash
pnpm test src/lib/video/storyboard.test.ts
```

- [ ] **Step 3: Implement the pure storyboard compiler**

Create fixed hook, facts, and CTA scenes. Use `Intl.NumberFormat("vi-VN")` for
VND and include the snapshot date when present. Do not interpolate unbounded
catalog or AI strings directly into an FFmpeg filter.

- [ ] **Step 4: Add failing remote-image resolver tests**

Use local HTTP test servers or injected `fetch` to prove HTTPS/allow-list
enforcement, redirect revalidation, JPEG/PNG/WebP MIME allow-list, 8 MiB
streaming cap, 10-second signal, and cleanup. Invalid inputs return `null`; they
do not escape the temporary root or cause a render failure.

- [ ] **Step 5: Run image tests and verify RED**

```bash
pnpm test src/lib/video/remote-image-resolver.test.ts
```

- [ ] **Step 6: Implement the bounded image resolver**

Accept constructor options for the exact allowed hostnames and temporary root.
Validate each redirect manually. Write with an application-generated filename,
never a URL pathname. Return `{path, mimeType, bytes, sha256, cleanup}` for a
valid image and `null` for a safe fallback.

- [ ] **Step 7: Add failing local-library and range tests**

Prove UUID-only validation, atomic manifest/video placement below a temporary
root, missing-artifact behavior, and these literal ranges for a 1,000-byte file:

```ts
expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
expect(parseByteRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
expect(parseByteRange("bytes=1000-1001", 1000)).toBeNull();
```

- [ ] **Step 8: Run library/range tests and verify RED**

```bash
pnpm test src/lib/video/local-video-library.test.ts src/lib/video/http-range.test.ts
```

- [ ] **Step 9: Implement the local library and range parser**

Use `path.resolve(root, renderId)` plus a root-containment check. Write a
temporary file in the artifact directory and rename it atomically. Manifests
contain safe render status/content/artifact metadata only, not internal paths.

- [ ] **Step 10: Add a failing real FFmpeg integration test**

The test creates a temporary render root, renders a text-only storyboard through
the real `ffmpeg` executable, and runs real `ffprobe`. Assert:

```ts
expect(probe).toMatchObject({
  formatName: expect.stringContaining("mp4"),
  codecName: "h264",
  pixelFormat: "yuv420p",
  width: 1080,
  height: 1920,
});
expect(probe.durationMs).toBeGreaterThanOrEqual(11_500);
expect(probe.durationMs).toBeLessThanOrEqual(12_500);
```

Name the failure this catches: returning success for a file that is absent,
wrong-sized, the wrong codec/pixel format, or not playable.

- [ ] **Step 11: Run the renderer test and verify RED**

```bash
pnpm test src/lib/video/ffmpeg-renderer.test.ts
```

Expected: FAIL because the renderer does not exist.

- [ ] **Step 12: Implement FFmpeg rendering and probing**

Use `spawn(executable, args, {shell: false})`, `-nostdin`, fixed lavfi color
input, optional trusted local image input, controlled text files, one known font
path selected from `ONEVOICE_FONT_PATH` or platform defaults, H.264,
`yuv420p`, `+faststart`, and a 45-second kill timeout. Bound captured stderr and
delete the work directory in `finally`. Return bytes, SHA-256, duration,
dimensions, codec, and renderer revision only after `ffprobe` passes.

- [ ] **Step 13: Run all video tests and checks**

```bash
pnpm test src/lib/video
pnpm lint
pnpm typecheck
```

- [ ] **Step 14: Commit**

```bash
git add src/lib/video
git commit -m "feat(video): render and store verified local MP4"
```

---

### Task 4: Pipeline, HTTP routes, and production-desk UI

**Files:**
- Create: `src/lib/render/types.ts`
- Create: `src/lib/render/product-video-pipeline.ts`
- Create: `src/lib/render/product-video-pipeline.test.ts`
- Create: `src/lib/render/composition-root.ts`
- Modify: `src/lib/env/server.ts`
- Modify: `src/lib/env/server.test.ts`
- Modify: `.env.example`
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/route.test.ts`
- Create: `src/app/api/renders/route.ts`
- Create: `src/app/api/renders/route.test.ts`
- Create: `src/app/api/renders/[renderId]/route.ts`
- Create: `src/app/api/renders/[renderId]/video/route.ts`
- Create: `src/app/api/renders/[renderId]/download/route.ts`
- Create: `src/app/video-studio.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: catalog, AI/content, image, storyboard, renderer, and local-library interfaces from Tasks 1–3.
- Produces: `ProductVideoPipeline.create({renderId, productId, scope})` returning a terminal safe `RenderRun`.
- Produces: product, render, status, inline-video, and download route contracts from the spec.
- Produces: the complete Vietnamese browser flow.

- [ ] **Step 1: Add failing pipeline tests**

Use small real in-memory adapters, not assertions about mocks. Prove observable
ordering through returned results and saved manifests:

- a valid product produces content, a three-scene storyboard, one stored MP4,
  and `status: "succeeded"`;
- missing product returns `PRODUCT_NOT_FOUND` without calling AI;
- AI failure, FFmpeg failure, and storage failure return a safe stage/code and
  save `status: "failed"` without provider bodies, paths, or secrets;
- image resolution failure still succeeds with a text-only artifact;
- cleanup runs for success and failure.

- [ ] **Step 2: Run pipeline test and verify RED**

```bash
pnpm test src/lib/render/product-video-pipeline.test.ts
```

- [ ] **Step 3: Implement render types and the deep pipeline module**

Define a discriminated `RenderRun` with safe stages and errors. Sequence
`loading_product → generating_content → resolving_asset → rendering_video →
storing_artifact`; catch only at the orchestration seam, persist the terminal
manifest, and never serialize trusted local paths.

- [ ] **Step 4: Add failing environment tests**

Prove defaults and validation for:

```env
ONEVOICE_ORGANIZATION_ID=a0000000-0000-0000-0000-000000000001
ONEVOICE_MEDIA_ROOT=renders
ONEVOICE_IMAGE_HOSTS=product.hstatic.net
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
ONEVOICE_FONT_PATH=
```

The media root may be relative to the repository root; image hosts are parsed
to a non-empty array. Existing server secret tests remain green.

- [ ] **Step 5: Run env tests and verify RED**

```bash
pnpm test src/lib/env/server.test.ts
```

- [ ] **Step 6: Implement runtime configuration and composition root**

Construct one `CatalogRepository`, Responses provider, content generator, image
resolver, FFmpeg renderer, local library, and pipeline entirely in server-only
modules. Resolve relative runtime paths from `process.cwd()`.

- [ ] **Step 7: Add failing route tests**

Use dependency factories exported for tests and assert actual `Response`
status/body/headers for:

- bounded product pagination and no organization parameter;
- valid render request returns `201` and safe URLs;
- malformed UUID returns `400`;
- missing product returns `404`;
- provider/render failures return a safe `502`/`500` body;
- inline media returns `200` or `206` with correct `Content-Range`;
- invalid ranges return `416`;
- download sets a sanitized attachment filename;
- missing UUID/artifact returns `404`.

- [ ] **Step 8: Run route tests and verify RED**

```bash
pnpm test src/app/api/products/route.test.ts src/app/api/renders/route.test.ts
```

- [ ] **Step 9: Implement routes with server-derived scope**

Validate query/body/path values with Zod. Build safe public URLs from render
UUIDs only. Share one media-response helper between inline and download routes
so range handling cannot drift. Add `private, no-store` and `nosniff` headers.

- [ ] **Step 10: Build the production-desk client**

Create one client module that:

1. fetches `/api/products?page=1&pageSize=18` and renders loading/error/empty;
2. stores one selected product ID;
3. creates `crypto.randomUUID()` and posts to `/api/renders`;
4. reports the current real stage without fabricated percentages;
5. shows returned hook/caption/CTA;
6. mounts `<video controls preload="metadata">` with the inline URL;
7. exposes the download URL and a retry action.

Keep the selected product visually and programmatically explicit, use native
buttons/labels, visible focus, responsive single-column layout below 880px, and
respect reduced motion. Continue the existing ink/cobalt/teal visual language,
with the timeline/progress rail as the single memorable device.

- [ ] **Step 11: Run focused and full checks**

```bash
pnpm test src/lib/render src/app/api
pnpm lint
pnpm typecheck
```

- [ ] **Step 12: Commit**

```bash
git add .env.example src/lib/env src/lib/render src/app
git commit -m "feat(studio): connect product selection to video output"
```

---

### Task 5: Runtime packaging, documentation, and acceptance verification

**Files:**
- Modify: `Dockerfile`
- Modify: `compose.yaml`
- Modify: `package.json`
- Modify: `README.md`
- Create: `docs/development/local-ai-video-runbook.md`
- Create: `scripts/verify-rendered-video.ts`
- Create: `src/lib/video/verify-rendered-video-script.test.ts`

**Interfaces:**
- Produces: `pnpm video:verify -- <path>` for repeatable ffprobe validation.
- Produces: native and Docker setup/run instructions with explicit local-only and FFmpeg license notes.
- Preserves: current health route and existing Supabase/AI verification commands.

- [ ] **Step 1: Add a failing executable verifier test**

Create a tiny real MP4 fixture in a temporary directory through FFmpeg, spawn
the proposed script, and assert exit 0 plus output containing literal format,
codec, dimensions, duration, and file size. Run it against a text file and
assert non-zero with no file contents or secrets printed.

- [ ] **Step 2: Run verifier test and verify RED**

```bash
pnpm test src/lib/video/verify-rendered-video-script.test.ts
```

- [ ] **Step 3: Implement the verifier and package command**

Add:

```json
"video:verify": "node --experimental-strip-types scripts/verify-rendered-video.ts"
```

The script accepts exactly one path, runs configured `ffprobe` without a shell,
requires MP4/H.264/yuv420p/1080×1920/positive duration, and prints safe metadata.

- [ ] **Step 4: Package FFmpeg and writable storage for Docker**

Install the Alpine `ffmpeg` package in the final runtime image, create/chown
`/app/renders`, set `ONEVOICE_MEDIA_ROOT=/app/renders`, and mount a named
`onevoice-renders` volume. Keep the application non-root. Do not add database,
queue, or worker services.

- [ ] **Step 5: Document exact setup and behavior**

Update README and add the runbook with:

- Node/pnpm/FFmpeg requirements and `ffmpeg -version`/`ffprobe -version` checks;
- `.env` keys, including server-only scope/media/image/FFmpeg options;
- `pnpm dev`, real Supabase/AI verification, render flow, local output location,
  preview/download, and `pnpm video:verify -- renders/<uuid>/video.mp4`;
- Docker build/run and volume behavior;
- snapshot-data label, local-only synchronous limitation, text-only image
  fallback, 30s/10s/45s timeouts, and future worker migration;
- Homebrew FFmpeg 7.1.1 was GPL-enabled, so local proof is not a public-release
  binary licensing decision.

- [ ] **Step 6: Run the complete automated gate**

```bash
pnpm check
pnpm build
docker compose config
git diff --check
```

Expected: all commands exit 0; Vitest reports zero failures; production build
emits no secret values.

- [ ] **Step 7: Run live external and media integration**

```bash
pnpm data:verify
pnpm ai:verify
```

Start the app, select a real Supabase product, create a real OpenCode video,
then run:

```bash
pnpm video:verify -- renders/<render-id>/video.mp4
```

Expected: Supabase reports 4,109 products and 1,455 content-ready; OpenCode
returns non-empty output; the video verifier reports MP4/H.264/yuv420p,
1080×1920, and approximately 12 seconds.

- [ ] **Step 8: Verify the browser flow with unified computer use**

From a fresh page load:

1. confirm real products load;
2. select a product;
3. start generation and observe the visible busy state;
4. wait for generated copy and real MP4;
5. play the video and confirm current time advances;
6. activate download and verify an MP4 is saved;
7. inspect narrow viewport plus loading/error/empty affordances where practical.

- [ ] **Step 9: Run secret and Git hygiene checks**

```bash
git ls-files '.env*' 'renders/**' '*.mp4'
git grep -n -E 'SUPABASE_SECRET_KEY=.+|AI_API_KEY=.+' -- ':!*.example' || true
git status --short
```

Expected: no real `.env`, generated media, or credential value is tracked.

- [ ] **Step 10: Commit**

```bash
git add Dockerfile compose.yaml package.json README.md docs/development/local-ai-video-runbook.md scripts/verify-rendered-video.ts src/lib/video/verify-rendered-video-script.test.ts
git commit -m "docs: package and verify local video workflow"
```

---

## Final branch gate

After all five task reviews are clean:

```bash
pnpm check
pnpm build
pnpm data:verify
pnpm ai:verify
docker compose config
git diff --check
git status --short --branch
```

Generate one fresh MP4 through the browser, verify it with `pnpm video:verify`,
play it, download it, and inspect the client bundle/logs/Git index for secrets.
Then perform the broad whole-branch code review before fetch, push, PR, CI,
review, and merge.
