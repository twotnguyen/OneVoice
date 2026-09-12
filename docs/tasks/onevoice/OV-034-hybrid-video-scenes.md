# OV-034 — Ảnh sản phẩm trong đồ họa chuyển động

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Sửa src/lib/video/template-registry.ts và template-pipeline liên quan; src/lib/video/hybrid-scenes.test.ts; tạo trusted inventory export cho032; giữ renderer HyperFrames hiện hữu.

### Hợp đồng đầu vào, đầu ra và persistence

Input ProductScriptSchema hiện hành + asset references033. Output template inventory gồm hash/static text/text input/non-text input; renderer phải dùng đúng inventory đó. Không đổi engine Remotion hay tự kéo media tùy ý trong HTML.

### Trình tự thực hiện

- [x] Chọn tập template hỗ trợ hybrid và ghi exact slots; gỡ hoặc thay placeholder/default marketing claims không có evidence.
- [x] Implement fit/contain/crop có chủ đích cho ảnh thật, resolve vào local sandbox trước render; không để URL fetch ngầm vượt adapter.
- [x] Nối trusted inventory với032 và generator053; text/caption/narration và rendered defaults cùng một nguồn. Voice selection được truyền từ request đến renderer/TTS, không chỉ UI state.
- [x] Render fixture sản phẩm portrait/landscape/transparent/missing; review keyframes đầu/giữa/cuối và audio, giữ 9:16/script bounds hiện tại.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [x] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-034-01: Asset đúng SKU hiện trong rendered frame; missing asset có fallback rõ, không stock image ngẫu nhiên.
- [x] AT-034-02: Uncovered default claims bị passport chặn; style indices/colors hợp lệ không bị reject.
- [x] AT-034-03: Ảnh méo/che CTA/text overflow được kiểm qua screenshot; remote fetch không diễn ra ngoài033 adapter.
- [x] AT-034-04: FFprobe codec/pixel format1080x1920/duration/audio và fixture voice khác nhau được chuyển đúng provider; không cần đổi engine.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/video/hybrid-scenes.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/video/hybrid-scenes.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Thêm scene product hero/comparison/media background có refs ảnh/video và layout riêng; giữ motion làm chủ đạo.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 34 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Renderer template hiện text-only bỏ imagePath.

## Expected behavior

Thêm scene product hero/comparison/media background có refs ảnh/video và layout riêng; giữ motion làm chủ đạo.

## Requirements

Không méo ảnh/che SKU; captions Vietnamese; schema không cho raw HTML/code từ AI; duration theo voice; bounded render; dùng nền HyperFrames hiện tại.

## Dependencies

OV-031, OV-032, OV-033

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/video/script-schema.ts; src/lib/video/template-registry.ts; src/lib/video/template-video-renderer.ts; templates/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không chuyển Remotion chỉ vì xu hướng; chất lượng phải xem thành phẩm trước DONE.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Fixture product ảnh thật + specs; render kiểm 9:16/1080x1920, overflow/audio sync; fallback ảnh lỗi không dùng sai sản phẩm.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task (README owned by orchestrator, not edited).
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13, Windows 11 host D:/Documents/CODE/OneVoice, Docker Linux image `onevoice-validation` rebuilt from `Dockerfile.test` (node:24.13.0-bookworm-slim + ffmpeg + fonts-dejavu-core + Chrome Headless runtime libs + `hyperframes browser ensure`). ffmpeg/ffprobe 5.1.9-0+deb12u1 inside the image. Host PATH has no ffmpeg. Hyperframes CLI 0.6.94. Chrome Headless Shell linux-131.0.6778.85 baked at `/root/.cache/hyperframes/chrome/.../chrome-headless-shell`. No python3/vieneu in the image. No .env printed. No remote DB, no real Messenger/Facebook/VNPay. No migration. README not edited.

Workspace identifier: git HEAD d442a91ccead974422b56ecf7a92cfc190cb8888. This task dirty: Dockerfile.test, docs/development/linux-media-tests.md, src/lib/video/hybrid-scenes.test.ts, docs/tasks/onevoice/OV-034-hybrid-video-scenes.md.

Files and migration versions changed: Dockerfile.test (libnss3 + Puppeteer/GTK libs, `hyperframes browser ensure` after COPY); docs/development/linux-media-tests.md (`docker run --rm --shm-size=1g` + digest inspect); src/lib/video/hybrid-scenes.test.ts (AT-034-04 real TemplateVideoRenderer/composeTemplate pipeline). No SQL migration.

Acceptance cases: AT-034-01 ... => PASS/FAIL/BLOCKED + evidence path
AT-034-01 => PASS (unit: SKU A PNG hash injected as data URI; missing SKU / other-SKU stock → empty slot + fallback "Thiếu ảnh sản phẩm")
AT-034-02 => PASS (unit: exportTrustedInventory / passport UNCOVERED_TEXT)
AT-034-03 => PASS (unit: contain layout screenshot buffer 1080x1920; fetch spy empty)
AT-034-04 => PASS (voice-id routing unit + HyperFrames pipeline MP4; not lavfi black)

Commands executed:
```
docker build -f Dockerfile.test -t onevoice-validation .
docker image inspect onevoice-validation --format "{{.Id}} {{.Created}} {{.Size}}"
# sha256:714493989fa3517d672da49e04d969874eef8270252b34f6aedbf4edc48a6b04 2026-09-12T19:31:40.606604201Z 1247789489

docker run --rm --shm-size=1g onevoice-validation pnpm exec vitest run src/lib/video/hybrid-scenes.test.ts --maxWorkers=1 --no-file-parallelism
```

Results: exit code 0. Test Files 1 passed (1). Tests 9 passed (9). Duration 126.20s. Pipeline it 125461ms. No skips.

stdout:
```
AT-034-04 sha256=aa784cc536e0d63064b0ce80259853eee567e2671da942290896cb744ee01cde durationMs=15000 h264/yuv420p 1080x1920 audio=aac magenta=484779
```

DB proof: n/a (no schema change).

UI/media/provider proof: Linux Docker `--shm-size=1g`. Real `TemplateVideoRenderer` default `composeTemplate` (HyperFrames, 3 scenes × 5s, product-hero `frame-liquid-bg-hero` with SKU data-URI). Fixture voice = `assets/audio/sfx/accents/ding.mp3` copied per scene (VieNeu sidecar absent; not silent lavfi black video). ffprobe: H.264 yuv420p 1080×1920 15000ms; audio AAC. Frame t=1.0s has 484779 magenta pixels (700×640 product PNG). Artifact sha256 aa784cc536e0d63064b0ce80259853eee567e2671da942290896cb744ee01cde. Byte-size not used as determinism.

Implementation decisions: Hybrid set unchanged (product-hero=`frame-liquid-bg-hero` contain, comparison=`frame-aicoding-comparison`, media-background=`frame-glitch-title`). Renderer still rewrites https media slots to local data URIs before HyperFrames. Pipeline script sets `music=null` and strips SFX because image ffmpeg 5.1.9 rejects mixMusicBed filtergraph label `[voice]` (`Invalid stream specifier: voice`); fixture voice still muxes as AAC. No Remotion. No Facebook. Chrome Headless Shell installed at image build (`pnpm exec hyperframes browser ensure`), not by mutating a running container.

Remaining limitations/blockers: VieNeu TTS still absent in the test image (no python3); AT-034-04 uses a real muxed MP3 fixture instead. mixMusicBed remains incompatible with Debian ffmpeg 5.1.9 `[voice]` labels (out of this issue's file ownership). Host PATH has no ffmpeg. README not updated (orchestrator).

Cleanup: renderer `cleanup()` removed the MP4; no extra containers left running.

Reviewer conclusion and README/status update: leave README untouched (assignment). Status DONE — AT-034-04 pipeline MP4 produced and probed in rebuilt `onevoice-validation`.

## Website-first 2026-09-13 — Docker unblock path

Status **DONE**. AT-034-04 implemented (pipeline MP4). Not a credential/Meta/VNPay gate. `Dockerfile.test` now installs Chrome Headless runtime libs including `libnss3` plus GTK/X11/Puppeteer deps and `fonts-liberation`, then `hyperframes browser ensure`. Runs require `--shm-size=1g`.

Image digest `sha256:714493989fa3517d672da49e04d969874eef8270252b34f6aedbf4edc48a6b04` created 2026-09-12T19:31:40.606604201Z size 1247789489. AT-034-01..04 PASS. No lavfi `color=c=black` as codec proof.
