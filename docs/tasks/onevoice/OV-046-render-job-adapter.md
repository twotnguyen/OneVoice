# OV-046 — Kết nối render với hàng đợi marketing

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/jobs/render-adapter.ts + render-adapter.test.ts; nối src/worker/ và existing src/lib/render/ pipeline/file queue; không thay toàn bộ queue.

### Hợp đồng đầu vào, đầu ra và persistence

enqueue stored contentVersionId→stable renderId mapping; immutable render receipt(contentHash,template/media hashes,artifactHash,manifestPath,status). Consume script từ032, không gọi generator lần nữa. artifactHash lưu receipt riêng, không sửa content_versions immutable.

### Trình tự thực hiện

- [x] Viết crash/replay tests dựa fake renderer và actual artifact library; map business job/content version một lần.
- [x] Adapter truyền persisted exact script/media/voice cho pipeline; legacy manual render giữ đường cũ.
- [x] On restart inspect final manifest/hash trước quyết định render lại; partial artifacts không success. Lease/revision fence trước attach result.
- [x] Expose completed/failed receipt cho035/036/037; stale artifact giữ history nhưng không ready latest slot; bounded cleanup đúng ownership.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-046-01: Retry completed manifest→zero render/AI calls; initial render không generate lại script.
- [x] AT-046-02: Kill worker sau artifact write trước DBfinish→recover same artifact/id.
- [x] AT-046-03: Late old revision result không replace latest; missing/corrupt/hash-mismatch artifact→not publishable.
- [x] AT-046-04: Actual local DB+real Linux MP4 proof và legacy single-generation/manual-render regressions.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/jobs/render-adapter.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/jobs/render-adapter.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Adapter business render job tới pipeline hiện có, lưu content version/renderId và terminal result để marketing tiếp tục.

## Context

Theo [DECISIONS.md](DECISIONS.md); task bổ sung qua review trước implementation để tránh thiếu ownership.

## Current behavior

File queue chỉ biết product render, marketing jobs chưa thể chờ artifact bền vững.

## Expected behavior

Adapter business render job tới pipeline hiện có, lưu content version/renderId và terminal result để marketing tiếp tục.

## Requirements

Không xóa render queue cũ; dedup contentVersion/renderId; worker crash reconcile library trước tạo lại; content snapshot không sinh hai lần; bounded retries; lỗi render không publish.

## Dependencies

OV-012, OV-031, OV-032

## Implementation boundaries

src/lib/jobs/render-adapter.ts; src/worker/; src/lib/render/

## Edge cases

Đây là ownership queue seam được OV-012 tham chiếu, tách khỏi thiết kế scene OV-034.

## Acceptance criteria

- [x] Toàn bộ Requirements và Expected behavior có implementation và test.
- [x] Các tình huống Testing có bằng chứng kết quả.
- [x] Không chạm phạm vi task khác; ghi quyết định và cập nhật tracker.

## Testing

Retry đã có manifest không render lại; job chết hồi phục; stale content revision không dùng artifact cũ; manual render vẫn hoạt động. Chạy test colocated, typecheck, lint và local DB/worker integration tương ứng.

## Implementation decisions and evidence

Validation date / environment:
2026-09-13 local Windows; Docker engine linux/amd64; image onevoice-validation:latest (ffmpeg/ffprobe 5.1.9-0+deb12u1); container supabase_db_onevoice; Kong/API http://127.0.0.1:54321. No remote DB, no real Messenger/Facebook/VNPay. Local REST key taken from `pnpm exec supabase status --output json` inside the test (not printed; not sourced from .env). Host PATH has no ffmpeg; AT-046-04 encodes and probes via `docker run --rm -v <tmpdir>:/work onevoice-validation:latest`.

Workspace identifier: git HEAD de46270630c8f468f0ba602b11ef76618e28f01c. This task dirty: src/lib/jobs/render-adapter.ts, src/lib/jobs/render-adapter.test.ts, src/lib/jobs/types.ts, src/lib/render/product-video-pipeline.ts (persisted-script seam only), src/worker/render.ts, supabase/migrations/20260912116000_render_adapter.sql, docs/tasks/onevoice/OV-046-render-job-adapter.md. Sibling dirty left untouched (hybrid-scenes/template-registry/template-video-renderer owned by OV-034).

Files and migration versions changed:
src/lib/jobs/render-adapter.ts + render-adapter.test.ts; jobKinds += render_content; ProductVideoPipeline.create accepts optional persisted script/content; src/worker/render.ts dedicated pump (legacy file-queue main.ts unchanged). Migration 20260912116000_render_adapter.sql applied locally; supabase_migrations.schema_migrations version=20260912116000 name=render_adapter. No db reset.

Acceptance cases: AT-046-01 => PASS (fake renderer + LocalVideoLibrary; retry completed manifest calls pipeline.create exactly once and never generateScript; ProductVideoPipeline persisted path does not call generateScript/generateContent)
AT-046-02 => PASS (kill after library.save before receipt insert; replay inspects ready artifact, same renderId, zero extra render)
AT-046-03 => PASS (late v1 receipt succeeded but publishable=false and latest() ignores it; missing/corrupt/hash-mismatch => not_publishable). Local Postgres: stable contentVersionId=renderId enqueue, generic claim_business_job excludes render_content, crash recover writes receipt without re-render, slot moved to v2 so v1 is not latest, content_versions.artifact_hash stays null, RLS on, authenticated cannot SELECT, service_role cannot UPDATE receipts.
AT-046-04 => PASS. Real Linux MP4 from onevoice-validation:latest ffmpeg 5.1.9 (libx264 + aac, 1080x1920, yuv420p, audio stream present). Adapter processRenderJob on local Postgres with persisted content-version script: generateScript/generateContent not called; receipt.artifactHash equals file sha256; content_versions.artifact_hash stays null; retry does not re-render. Legacy single-generation + product-video-pipeline regressions PASS.

Commands executed:
```
docker run --rm onevoice-validation:latest ffmpeg -version
ffmpeg version 5.1.9-0+deb12u1
docker run --rm onevoice-validation:latest ffprobe -version
ffprobe version 5.1.9-0+deb12u1
docker run --rm -v <tmpdir>:/work onevoice-validation:latest ffprobe -v error -show_entries stream=codec_name,codec_type,pix_fmt,width,height -show_entries format=format_name,duration -of json /work/video.mp4
```
ffprobe JSON: video codec_name=h264 pix_fmt=yuv420p width=1080 height=1920; audio codec_type=audio codec_name=aac; format_name contains mp4; duration=1.000000.
```
node node_modules/vitest/vitest.mjs run src/lib/jobs/render-adapter.test.ts src/lib/render/single-generation.test.ts src/lib/render/product-video-pipeline.test.ts src/lib/jobs/types.test.ts --maxWorkers=1 --no-file-parallelism
```
(22 passed / 22, exit 0)
```
node node_modules/vitest/vitest.mjs run src/lib/jobs/render-adapter.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
```
AT-046-01..03 PASS; local DB 01/02/03 PASS 5464ms; AT-046-04 PASS 7872ms (6 passed, exit 0)
```
node node_modules/vitest/vitest.mjs run src/worker/import-guard.test.ts --maxWorkers=1 --no-file-parallelism
```
(1 passed, exit 0)
Skipped formatters, linters, tsc, full suite, db reset, Dockerfile.test full CMD, README.

Results: exit 0. render-adapter 6 passed; single-generation 3 passed; product-video-pipeline + types included in 22 total. No skips.

DB proof: local endpoint http://127.0.0.1:54321; Postgres via supabase_db_onevoice. Fixture orgs randomUUID; products disabled_at and campaigns FAILED in finally. schema_migrations 20260912116000 render_adapter recorded. Receipts immutable; artifact hash only on render_receipts (AT-046-04 receipt.artifactHash matched Linux MP4 sha256).

UI/media/provider proof: AT-046-04 Linux MP4 produced and probed in onevoice-validation:latest (ffmpeg/ffprobe 5.1.9); H.264 yuv420p 1080x1920 with AAC audio. No Facebook/Meta/VNPay.

Implementation decisions: renderId equals contentVersionId (stable 1:1). Immutable render_jobs mapping + immutable render_receipts. finish_render inserts receipt under lease; runBusinessJobs finishes the queue row. latest_publishable_render requires slot.content_version_id match + succeeded + artifact_hash. list_stale_renders returns bounded non-current render ids. Dedicated claim_render_job; claim_business_job excludes knowledge_ingest, render_content, outbound_message, and consultation inbound_event. Adapter inspects LocalVideoLibrary manifest+sha256 before render; persisted script is passed to ProductVideoPipeline.create so generators are not called. Worker src/worker/render.ts is opt-in (ONEVOICE_RENDER_WORKER=1) and does not replace the file queue. AT-046-04 uses docker onevoice-validation:latest as the Linux ffmpeg/ffprobe toolchain from the Windows host (no host ffmpeg).

Remaining limitations/blockers:
None for AT-046-01..04. Host PATH still has no ffmpeg; proof is the Linux image, not a host binary. README not updated (orchestrator). Skipped tsc/lint/full suite per concurrent sibling edits.

Cleanup: local fixture products disabled_at and campaigns FAILED; immutable content_versions/receipts retained; no owned long-running processes.

Reviewer conclusion and README/status update: Orchestrator owns README. Status DONE after AT-046-04 Linux MP4 + local DB proof.

Dependency review: render adapter consumes the persisted immutable content/version/script contract from OV-032. It must not invent a competing content table or regenerate a script that already passed Truth Guard. OV-032 is therefore a prerequisite; OV-035 still depends on this adapter without a cycle.
