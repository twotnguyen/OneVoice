# OV-038 — Điều khiển tự động và yêu cầu ưu tiên

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/marketing/control-service.ts + control-service.test.ts; UI settings/campaigns và manager API; tái sử dụng control state003, campaign management030.

### Hợp đồng đầu vào, đầu ra và persistence

Manager commands pause|resume|priority với expectedControlRevision/requestId; objective mode và timing mode hai trường độc lập trong008. Không tạo bảng control thứ hai. Resume là hành động tường minh, chỉ khi setup readiness đạt.

### Trình tự thực hiện

- [ ] Implement transaction command/CAS/audit trên control hiện hữu; pause loại bỏ quyền dispatch ordinary jobs cũ theo revision.
- [ ] Priority command tạo campaign đúng selected product/program và PAUSED atomically; terminal priority không tự resume.
- [ ] UI hiển thị current mode, cap/windows, reason paused, active priority và configuration errors; manager-only mutation.
- [ ] Nối settings version với scheduler/currentness; không reset manual objective khi auto timing bật.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-038-01: Staff403/inactive manager401; duplicate command một audit; two managers stale revision409.
- [ ] AT-038-02: Priority complete/failure→PAUSED; resume rõ ràng mới ordinary eligible.
- [ ] AT-038-03: 4combination objective/timing độc lập; cap/window invalid reject.
- [ ] AT-038-04: Browser pause→priority→finish fixture→still paused→manual resume; queued old jobs bị fence.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/marketing/control-service.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/marketing/control-service.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Hiện RUNNING/PAUSED, nguyên nhân, lịch, đề xuất; pause/resume và priority product/program; mode mục tiêu/lịch độc lập.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 38 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa manager control UI.

## Expected behavior

Hiện RUNNING/PAUSED, nguyên nhân, lịch, đề xuất; pause/resume và priority product/program; mode mục tiêu/lịch độc lập.

## Requirements

Default auto workflow chỉ bắt đầu khi kết nối/cấu hình ready và manager bật; priority kết thúc vẫn cần bật lại; staff forbidden backend.

## Dependencies

OV-008, OV-030, OV-036, OV-037

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/(app)/marketing/; src/app/api/marketing/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Đăng tự động được user chốt, không thêm duyệt từng bài.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Refresh hiện state thật; conflict simultaneous toggles; pending priority ngăn resume; source unavailable rõ.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
