# OV-035 — Studio bài viết/video và chỉnh sửa

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Sửa src/app/video-studio.tsx và helpers, src/app/(app)/campaigns/; API Studio trong src/app/api/; tạo src/lib/content/studio-service.test.ts cho service boundary.

### Hợp đồng đầu vào, đầu ra và persistence

Manager Studio chọn campaign/slot, gọi053 để sinh hoặc chỉnh draft→032 lưu revision mới→046 render. Staff read-only. Không public generate bypass session; không approval gate mới. Reload theo persisted slot/render ID.

### Trình tự thực hiện

- [ ] Đọc current reducer/race tests; giữ existing manual product render compatibility trong khi nối campaign path.
- [ ] UI select product/program/trend theo campaign, post/video, voice và asset/template hợp lệ; mọi edit làm version mới phải validate trước dùng.
- [ ] Hiển thị truth failures, generation/render progress, retry state và stale revision; caption/script/video phải cùng content version.
- [ ] Resume từ URL/persisted ID khi reload; handle selectedId/category links hiện có nếu thuộc UI path này. Copy clipboard phải chờ kết quả, không báo success giả.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-035-01: Staff mutation403; manager edit giá bịa→validation error; không có per-post approval bắt buộc.
- [ ] AT-035-02: Chuyển selection khi response cũ tới không overwrite; reload thấy job cũ, không regenerate.
- [ ] AT-035-03: Một click generate thành công một generation receipt; retry completed không gọi AI lại.
- [ ] AT-035-04: Browser product/program/trend workflows; selected voice tới request; stale video không gắn caption mới; download correct artifact.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/content/studio-service.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/content/studio-service.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

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

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Nav/reload không mất job; sửa giá sai bị chặn; voice lựa chọn tới TTS; lỗi user-friendly.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
