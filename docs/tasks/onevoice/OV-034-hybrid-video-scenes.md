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
- [ ] Render fixture sản phẩm portrait/landscape/transparent/missing; review keyframes đầu/giữa/cuối và audio, giữ 9:16/script bounds hiện tại.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-034-01: Asset đúng SKU hiện trong rendered frame; missing asset có fallback rõ, không stock image ngẫu nhiên.
- [x] AT-034-02: Uncovered default claims bị passport chặn; style indices/colors hợp lệ không bị reject.
- [x] AT-034-03: Ảnh méo/che CTA/text overflow được kiểm qua screenshot; remote fetch không diễn ra ngoài033 adapter.
- [ ] AT-034-04: FFprobe codec/pixel format1080x1920/duration/audio và fixture voice khác nhau được chuyển đúng provider; không cần đổi engine.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/video/hybrid-scenes.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/video/hybrid-scenes.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

BLOCKED

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
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
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
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13, Windows 11 host D:/Documents/CODE/OneVoice, Docker Linux image `onevoice-validation:latest` (sha256:c5b3e27116bfcfb79c6637e50afa035215cdf0c180b1ac196958998ced84341e, created 2026-09-12T11:04:48.543595158Z, size 1124219511). ffmpeg/ffprobe 5.1.9-0+deb12u1 inside the image. Host PATH has no ffmpeg. Hyperframes CLI 0.6.94 at `node_modules/.bin/hyperframes`. No python3/python/vieneu in the image. No .env printed. No remote DB, no real Messenger/Facebook/VNPay. No migration. README not edited. hybrid-scenes.ts / template-video-renderer.ts not rewritten.

Acceptance cases:
AT-034-01 => PASS (unit: SKU A PNG hash injected as data URI; missing SKU / other-SKU stock → empty slot + fallback "Thiếu ảnh sản phẩm")
AT-034-02 => PASS (unit: exportTrustedInventory / passport UNCOVERED_TEXT)
AT-034-03 => PASS (unit: contain layout screenshot buffer 1080x1920; fetch spy empty)
AT-034-04 => BLOCKED (lavfi color=black is not acceptance. Voice-id routing unit test still exists. Pipeline MP4 via `TemplateVideoRenderer` + `composeTemplate` / HyperFrames did not produce an artifact.)

Commands executed:
```
docker image inspect onevoice-validation:latest --format "{{.Id}} {{.Created}} {{.Size}}"
# sha256:c5b3e27116bfcfb79c6637e50afa035215cdf0c180b1ac196958998ced84341e 2026-09-12T11:04:48.543595158Z 1124219511

docker run --rm onevoice-validation:latest sh -c "command -v hyperframes; ls node_modules/.bin/hyperframes; command -v python3; command -v python; command -v vieneu; command -v chromium; command -v chromium-browser"
# hyperframes not on PATH; node_modules/.bin/hyperframes present; NO_PYTHON3; NO_PYTHON; NO_VIENEU; no chromium

docker run --rm onevoice-validation:latest node_modules/.bin/hyperframes doctor
# ✗ Chrome: Chrome Headless Shell is required for local rendering. Run: npx hyperframes browser ensure
# ✗ /dev/shm 64 MB (Chrome needs ≥256 MB)

docker run --rm -v "D:/Documents/CODE/OneVoice/src:/app/src" -v "D:/Documents/CODE/OneVoice/assets:/app/assets" -w /app -e HYPERFRAMES_NO_TELEMETRY=1 -e HYPERFRAMES_NO_UPDATE_CHECK=1 -e HYPERFRAMES_NO_AUTO_INSTALL=1 onevoice-validation:latest node_modules/.bin/hyperframes render src/lib/video/template-pipeline/templates/frame-liquid-bg-hero --composition compositions/portrait.html --output /tmp/ov034-hybrid.mp4 --fps 30
# HYPERFRAMES_NO_AUTO_INSTALL=1 did not stop Chrome download. Render then failed. No /tmp/ov034-hybrid.mp4.

docker run --rm --shm-size=512m -v "D:/Documents/CODE/OneVoice/src:/app/src" -v "D:/Documents/CODE/OneVoice/assets:/app/assets" -w /app -e HYPERFRAMES_NO_TELEMETRY=1 -e HYPERFRAMES_NO_UPDATE_CHECK=1 onevoice-validation:latest pnpm exec vitest run src/lib/video/_ov034-pipeline.smoke.test.ts --maxWorkers=1 --no-file-parallelism
# Throwaway smoke imported TemplateVideoRenderer (default composeTemplate) + hybrid product-hero script with empty product_image (explicit missing fallback). TTS stub throws if reached.
```

Exact pipeline error (`compose-template.ts` spawn of hyperframes, exit 1):
```
Error: hyperframes render failed (exit 1): ... Failed to launch the browser process:  Code: 127

stderr:
/root/.cache/hyperframes/chrome/chrome-headless-shell/linux-131.0.6778.85/chrome-headless-shell-linux64/chrome-headless-shell: error while loading shared libraries: libnss3.so: cannot open shared object file: No such file or directory

TROUBLESHOOTING: https://pptr.dev/troubleshooting
```

TTS in image: `command -v python3` / `python` / `vieneu` all missing. VieNeu sidecar source exists under `services/tts/` but cannot run (no Python). HyperFrames `tts` (Kokoro) was not used; OneVoice pipeline TTS is VieNeu.

Implementation decisions: Hybrid set unchanged (product-hero=`frame-liquid-bg-hero` contain, comparison=`frame-aicoding-comparison`, media-background=`frame-glitch-title`). Renderer still rewrites https media slots to local data URIs before HyperFrames. No Remotion. No Facebook. lavfi `color=c=black` MP4 removed from AT-034-04 colocated test so it cannot be used as codec proof. Throwaway smoke test deleted after the failed Docker run.

Remaining limitations/blockers: `onevoice-validation:latest` has HyperFrames CLI 0.6.94 and ffmpeg 5.1.9 but cannot launch Chrome Headless Shell (`libnss3.so` missing). VieNeu TTS is absent (no python3). Host has no ffmpeg. AT-034-04 therefore has no HyperFrames/hybrid pipeline MP4 (1080x1920 h264 yuv420p + audio). Do not treat lavfi black as DONE. README not updated (assignment).

Reviewer conclusion and README/status update: leave README untouched. Status BLOCKED — AT-034-04 pipeline MP4 not produced in Docker.
