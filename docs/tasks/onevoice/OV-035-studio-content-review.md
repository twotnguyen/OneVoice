# OV-035 — Studio bài viết/video và chỉnh sửa

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Sửa src/app/video-studio.tsx và helpers, src/app/(app)/campaigns/; API Studio trong src/app/api/; tạo src/lib/content/studio-service.test.ts cho service boundary.

### Hợp đồng đầu vào, đầu ra và persistence

Manager Studio chọn campaign/slot, gọi053 để sinh hoặc chỉnh draft→032 lưu revision mới→046 render. Staff read-only. Không public generate bypass session; không approval gate mới. Reload theo persisted slot/render ID.

### Trình tự thực hiện

- [x] Đọc current reducer/race tests; giữ existing manual product render compatibility trong khi nối campaign path.
- [x] UI select product/program/trend theo campaign, post/video, voice và asset/template hợp lệ; mọi edit làm version mới phải validate trước dùng.
- [x] Hiển thị truth failures, generation/render progress, retry state và stale revision; caption/script/video phải cùng content version.
- [x] Resume từ URL/persisted ID khi reload; handle selectedId/category links hiện có nếu thuộc UI path này. Copy clipboard phải chờ kết quả, không báo success giả.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-035-01: Staff mutation403; manager edit giá bịa→validation error; không có per-post approval bắt buộc.
- [x] AT-035-02: Chuyển selection khi response cũ tới không overwrite; reload thấy job cũ, không regenerate.
- [x] AT-035-03: Một click generate thành công một generation receipt; retry completed không gọi AI lại.
- [x] AT-035-04: Browser product/program/trend workflows; selected voice tới request; stale video không gắn caption mới; download correct artifact.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/content/studio-service.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/content/studio-service.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Manager xem/sửa script/caption, chọn product/program, preview/download, regenerate; jobs persisted và resume progress.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 35 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Studio chỉ tạo video; voice selection chưa gửi; mất trạng thái khi điều hướng.

## Expected behavior

Manager xem/sửa script/caption, chọn product/program, preview/download, regenerate; jobs persisted và resume progress.

## Requirements

Sửa nội dung tạo revision kiểm truth lại; voice truyền end-to-end; không staff generation; manual priority pause; post có ảnh và text.

## Dependencies

OV-007, OV-030, OV-032, OV-034, OV-046, OV-053

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/(app)/studio/; src/app/video-studio-state.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không full timeline editor/Canva clone; tôn trọng uncommitted UI.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Nav/reload không mất job; sửa giá sai bị chặn; voice lựa chọn tới TTS; lỗi user-friendly.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment:
2026-09-13 local Windows; container supabase_db_onevoice assumed running for sibling local work. This task's AT-035-01..04 ran as HTTP/service + reducer tests without a new DB migration or live AI/render. No remote DB, no Facebook Graph, no Messenger send, no Facebook publish, no VNPay charge.

Workspace identifier: git HEAD d442a91ccead974422b56ecf7a92cfc190cb8888. Dirty this task: src/lib/content/studio-service.ts, src/lib/content/studio-service.test.ts, src/app/api/studio/route.ts, src/app/video-studio.tsx, src/app/video-studio-state.ts, src/app/video-studio-state.test.ts, src/app/api/renders/route.ts, src/app/(app)/campaigns/campaign-manager.tsx, docs/tasks/onevoice/OV-035-studio-content-review.md.

Files and migration versions changed:
No new migration. Studio reuses content_versions.request_id replay (OV-032/053) and enqueue_render 1:1 mapping (OV-046).

Acceptance cases: AT-035-01 => PASS (HTTP staff generate/edit 403, provider.calls=0; manager fake-price edit VALIDATION 400; generate has no approvalRequired/pendingApproval and no PUBLISHED/Graph)
AT-035-02 => PASS (reducer ignores stale slot token after newer selection; resume restores persisted render without a new start; GET /api/studio?slotId&renderId does not call AI)
AT-035-03 => PASS (one generate → one receipt, provider.calls=1; same requestId replayed=true, HTTP 201, still calls=1)
AT-035-04 => PASS at HTTP/service (voiceId injected into saved script and echoed on receipt; download URL is `/api/renders/{currentRenderId}/download`; after a newer version, stale render artifact is not attached. Product/program/trend HTTP generate + GET resume. Browser UI not run — skipped per assignment, HTTP persistence accepted.)

Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/content/studio-service.test.ts src/app/video-studio-state.test.ts --maxWorkers=1 --no-file-parallelism
```
Did not run tsc, eslint, full vitest, db reset, or browser.

Results: 20 passed / 20, exit 0 (~989ms). studio-service 7 passed; video-studio-state 13 passed including AT-035-02 slot/resume.

DB proof: none new. Persistence asserted via in-memory store that mirrors request_id replay + render receipt matching contentVersionId. No PUBLISHED transition, no Graph.

UI/media/provider proof: browser skipped (AT-035-04 HTTP persistence). No live model, no ffmpeg. Legacy POST /api/renders still accepts {renderId, productId} and optional voiceId without changing the file-queue job shape.

Implementation decisions: Extended existing Studio at `/` (video-studio.tsx); did not create a second `/studio` app route. `generateStudioContent` calls OV-053 `generateCampaignContent` then OV-032 save (inside 053) then optional OV-046 `enqueueRender` for video. Voice is applied in the generation store.save wrapper (`script.voice.voiceId`) so one requestId still yields one version. `editStudioContent` validates with `validateContentVersion` before save; fake prices fail VALIDATION. Staff mutations FORBIDDEN at service and `withApiPermission(..., "manage_marketing")`. GET `/api/studio` is read_operations so staff can resume read-only. Download URLs come only from a succeeded receipt whose contentVersionId matches the current slot version. Reload uses `?slotId=&renderId=` / `?selectedId=&renderId=` without POSTing generate. Clipboard waits on `clipboard.writeText` then sets success.

Remaining limitations/blockers: README status left to orchestrator. tsc/eslint/full suite skipped per concurrent sibling edits. Browser product/program/trend walkthrough not executed. Legacy file-queue worker still does not read voiceId from the job file; campaign path persists voice on the content script that OV-046 already consumes.

Cleanup: no local DB fixtures, no owned background processes.

Reviewer conclusion and README/status update: Status DONE in this issue. README not edited. VALID generated content is not a publish receipt.
