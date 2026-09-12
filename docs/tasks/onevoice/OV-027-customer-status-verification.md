# OV-027 — Xác minh khách và tra cứu tiến độ

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/consultation/status-lookup.ts + status-lookup.test.ts; src/app/order-status/; purpose-specific token helper dùng chung021; nối planner/worker route order_status.

### Hợp đồng đầu vào, đầu ra và persistence

Verify order code+normalized phone+trusted org/Page/PSID owner. Unknown/wrong/legacy-unbound trả cùng thông báo không xác minh được; legacy→staff, không auto-bind. Success chỉ public order/warranty DTO; token purpose=status không được confirm/pay.

### Trình tự thực hiện

- [ ] Viết privacy fixtures có hai khách cùng phone, hai Page và order unbound. Rate-limit server persisted theo identity và request origin, không memory-only.
- [ ] Implement verifier và current order/warranty read, không chứa internal notes/address đầy đủ mặc định. Đề xuất kỹ thuật TTL status link30min, lưu hash và scope.
- [ ] Nối Messenger intent→ask missing info→verify→candidate status/link→018. Handoff/request thực hiện bảo hành vẫn thắng lookup.
- [ ] Trang public GET token đọc current status có asOf, no-store/referrer policy; token invalid không tiết lộ mã đơn tồn tại.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-027-01: Biết phone+order nhưng sai PSID→no data; unbound→handoff, không binding ngầm.
- [ ] AT-027-02: Guess hàng loạt→rate limited cả sau restart; errors không phân biệt order tồn tại.
- [ ] AT-027-03: Warranty public progress đúng case/order, không private note, không người khác.
- [ ] AT-027-04: Local full worker verification→outbox fixture→browser link; token confirmation không được dùng làm status và ngược lại.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/consultation/status-lookup.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/consultation/status-lookup.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Order tạo từ Messenger gắn PSID; tra cứu yêu cầu mã đơn+điện thoại khớp và PSID owner; chưa binding chuyển nhân viên xác minh.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 27 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa customer identity binding.

## Expected behavior

Order tạo từ Messenger gắn PSID; tra cứu yêu cầu mã đơn+điện thoại khớp và PSID owner; chưa binding chuyển nhân viên xác minh.

## Requirements

Không tiết lộ tồn tại order trước verify; không chỉ biết số điện thoại là được; public detail token có hạn; trả trạng thái và nội dung khách được xem.

## Dependencies

OV-018, OV-025, OV-026

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/consultation/status-lookup.ts; src/app/order-status/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Wiring bắt buộc: src/lib/consultation/ và src/worker/ gọi status tool sau xác minh, route public chỉ trả đúng token scope. Test Messenger intent -> verified lookup -> outbox response, không chỉ unit lookup.

## Edge cases

Đây là quyết định kỹ thuật privacy thay cho tự chọn OTP provider; nhân viên xác minh đơn cũ trước liên kết.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Guess phone/order, khác PSID, rate limit, no binding, warranty private note không lộ.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
