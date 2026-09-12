# OV-047 — Môi trường kiểm thử media Linux tái lập

## Status

DONE

## Objective

Chạy đầy đủ suite, kể cả worker/render E2E, trong container có FFmpeg/ffprobe/fonts và hỗ trợ shell/symlink fixtures.

## Context

Phát hiện khi OV-042 chạy baseline trên Windows: ngoài binary thiếu, test fixtures còn dùng shell POSIX và symlink. Không sửa tests để bỏ qua lỗi hoặc cài thêm binary toàn máy người dùng; tạo môi trường test tái lập cho deployment Linux.

## Current behavior

Host không có FFmpeg/ffprobe trên PATH. Dockerfile production có FFmpeg nhưng runner không giữ dev dependencies/tests. Full suite chưa có môi trường test media rõ ràng.

## Expected behavior

Dockerfile.test dùng Node24, pnpm lockfile, FFmpeg/fonts và chạy typecheck/lint/full Vitest với ONEVOICE_E2E=1; không gọi AI hoặc CSDL doanh nghiệp thật.

## Requirements

Đọc .dockerignore và xác nhận .env/keys/references/data không vào image. Không mount secrets hoặc thay node_modules Windows. Workers giới hạn để tránh bùng tài nguyên. Ghi rõ full tests kiểm FFmpeg legacy, không chứng minh chất lượng HyperFrames hybrid hoặc tích hợp Meta/VNPay.

## Dependencies

OV-042

Bổ sung từ lần chạy full suite: determinism E2E render hai video1080x1920/12giây rồi SSIM vượt timeout mặc định5giây. Scope task bao gồm thời hạn riêng có giới hạn cho test media này khi chạy riêng chứng minh assertions vẫn pass; không thay assertions, giảm độ phân giải hoặc timeout toàn suite.

## Edge cases

Network registry unavailable, image dependency fail, FFmpeg codec/font không phù hợp phải fail có evidence; không skip test. Nếu phát hiện defect khác phải tạo issue trước sửa.

## Acceptance criteria

- [x] Image build từ lockfile thành công, không cần .env thật.
- [x] Full tests bật E2E pass; typecheck và lint pass trong image.
- [x] Tài liệu lệnh tái lập và giới hạn được ghi.

## Testing

docker build -f Dockerfile.test -t onevoice-validation .; docker run --rm onevoice-validation. Kiểm .env không tồn tại trong image. Chỉ image/container local, không publish registry.

## Implementation decisions and evidence

Task mới tách từ phần môi trường trong OV-042; source fixes OV-042 vẫn phải review/validation trước DONE. Không tuyên bố Windows full media suite xanh.

Initial Linux full run: typecheck/lint pass; 50 files pass, 1 fail; 581 tests pass, 1 timeout5s tại determinism E2E. Chưa DONE; đang chạy chẩn đoán riêng với budget120s.

Final evidence: Docker image build succeeds without .env; typecheck/lint pass and51files582tests pass with ONEVOICE_E2E=1 (116s). Diagnostic determinism3/3pass8.54s proves5s budget insufficient; test-specific120s fix preserves all assertions. docs/development/linux-media-tests.md records commands/limits. This snapshot predates OV-006/012 changes; those require their own validation, not included in582. Self-review accepts bounded timeout and secret exclusions.

Reopened after broader execution snapshot (image07e7995cbd210c80): TypeScript/lint pass;99 test files,889 tests passed,1 metadata-video test timed out at5000ms,4 opt-in live/local tests skipped. Investigate fixture encoding/probe timing before a narrowly scoped correction; preserve actual MP4/codec/resolution/duration assertions and production verifier deadline. This extends the existing media-test budget scope, not product rendering behavior. Current image predates latest029/050 fixes; future release requires fresh snapshot.


Focused follow-up on immutable image `sha256:07e7995cbd210c80eacd82b2e2b20b5dcf4afa20b29460a31a2b350cdcacba06`: before source edits, three focused runs used a diagnostic20s budget and temporary timing-only instrumentation copied into disposable containers. Unrestricted runs passed477ms (FFmpeg280ms/verifier188ms) and1504ms (FFmpeg1106ms/verifier374ms, concurrent production-build contention). A deliberately constrained `--cpus=0.1` run passed10,798ms (FFmpeg7802ms/verifier2501ms). This third run is controlled contention, not a claim that the original suite had that exact CPU quota.

Narrow fix: only the first real conformingMP4 test receives20,000ms for fixture encoding/startup plus the production verifier's own10s probe budget. Every original assertion,1080x1920 dimensions,H.264/yuv420p codec,12s duration, container and production code/deadline remains unchanged. No suite-wide timeout was changed. With only that test file copied into the same image, the complete verifier file passed14/14 in14.19s; the unchanged ten-second deadline test passed10.113s. Scoped ESLint passed. No image rebuild or secret/workspace mount was used.

Reproduce focused proof without rebuilding:
```powershell
docker create --name ov047-focused-proof --network none onevoice-validation pnpm exec vitest run src/lib/video/verify-rendered-video-script.test.ts --reporter=verbose --maxWorkers=1 --no-file-parallelism
docker cp src/lib/video/verify-rendered-video-script.test.ts ov047-focused-proof:/app/src/lib/video/verify-rendered-video-script.test.ts
docker start -a ov047-focused-proof
docker rm ov047-focused-proof
```
The parent owns a later broad validation run; this focused proof does not claim the current whole workspace/full suite passed.

Final controlled-quota proof: changed test alone, no CLI timeout override, passed6592ms under0.1CPU. Post-run /proc inspection in the same container found0 surviving FFmpeg/ffprobe/verifier fixture child processes. Diagnostic containers were removed after proof.

Parent full recheck completed: same immutable07e7995c image plus only corrected verifier test copied into disposable ov047-full-recheck, network disabled; typecheck/lint PASS,95files PASS/4 opt-in files skipped,890tests PASS/4 skipped in107.08s, exit0. Real MP4 case749ms and determinism9108ms. This satisfies the reopened media environment issue; latest029/050/016/030 changes require their separate/new snapshot validation. No global current-workspace release claim.
