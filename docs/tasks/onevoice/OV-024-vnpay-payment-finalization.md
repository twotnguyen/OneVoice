# OV-024 — Xác minh thanh toán và chuẩn bị hàng

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/payments/vnpay/notification.ts + notification.test.ts; IPN route; SQL finalize payment và supabase/tests/payment-finalization.test.sql. Tái sử dụng order-state.ts/reservations.

### Hợp đồng đầu vào, đầu ra và persistence

Verify signature trước mutation; match merchant, transaction ref, amount, currency, provider result với DB attempt. Verified success atomically PAID+consume reservation+PREPARING+audit. Late success→MANUAL_REVIEW exception, không fulfill/refund. Response code dùng official VNPay contract.

### Trình tự thực hiện

- [ ] Viết table-driven IPN fixtures và local SQL concurrency test trước; lưu unique provider transaction receipt với digest để replay kiểm payload.
- [ ] Implement positive signature verification và strict parser, không tin browser return. Lock attempt/order/reservations cùng thứ tự022.
- [ ] Finalize transaction hoặc late-payment exception, giữ lịch sử bất biến. Failure/out-of-order không downgrade paid. Endpoint trả provider ACK đúng verified outcome.
- [ ] Chạy sandbox end-to-end start→IPN→DB→return page; ghi evidence đã che thông tin; chuẩn bị manager exception read model cho025.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-024-01: Signature/merchant/amount/currency/ref sai→zero paid/stock mutation.
- [ ] AT-024-02: Duplicate identical success→một consume/audit; reused ref với payload khác→reject.
- [ ] AT-024-03: Race expiry vs IPN bằng hai DB connections: kho nhất quán; late success không PREPARING.
- [ ] AT-024-04: Return trước IPN vẫn pending; failure đến sau success không downgrade.
- [ ] AT-024-05: Sandbox verified IPN bắt buộc trước DONE; thiếu merchant/callback quyền ghi BLOCKED.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/payments/vnpay/notification.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/payments/vnpay/notification.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

IPN verify signature, merchant, transaction, amount, currency và order; atomic paid + consume reservation + PREPARING.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 24 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa callback.

## Expected behavior

IPN verify signature, merchant, transaction, amount, currency và order; atomic paid + consume reservation + PREPARING.

## Requirements

Không tin redirect; duplicates ack đúng; mismatch từ chối/audit; late paid -> exception queue manager, không tự fulfill/refund; payment failure không paid.

## Dependencies

OV-023

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/payments/vnpay/notification.ts; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Sandbox E2E là bắt buộc trước DONE; không gọi tài chính thật để test.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

IPN lặp/out-of-order/fake amount/signature; paid vs expiry concurrent; return trước IPN; callback muộn.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
