# OV-023 — Tạo yêu cầu thanh toán VNPay

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/payments/vnpay/checkout.ts + checkout.test.ts; src/app/api/payments/vnpay/; thêm server-only configuration trong env example không chứa secret.

### Hợp đồng đầu vào, đầu ra và persistence

Adapter chỉ nhận persisted ACTIVE attempt từ022. URL ký gồm amount/ref/merchant/expiry từ server. Provider config sandbox/prod rõ ràng; return URL cố định cùng origin. Không mặc định thuật toán/encoding từ trí nhớ: chốt bằng official spec và golden vector trong task.

### Trình tự thực hiện

- [ ] Đọc official VNPay integration docs trước code và lưu source/date/version cùng fixture signing độc lập với implementation.
- [ ] Validate merchant config và active reservation; canonicalize đúng chuẩn, sign server-only; lưu provider transaction ref unique liên kết attempt.
- [ ] Expose start checkout qua confirmed token POST; replay same active attempt trả cùng reference, không lấy total/currency/returnUrl từ client.
- [ ] Return page hiển thị pending/verified status từ DB; querystring thành công không thay payment. Hiển thị lỗi cấu hình/expiry phù hợp, không lộ hash secret.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-023-01: Golden vector chữ Việt, khoảng trắng, dấu+, encoded params, amount scale và VND integer boundaries.
- [ ] AT-023-02: Client tamper amount/ref/redirect bị bỏ hoặc reject; expired attempt không có signed URL.
- [ ] AT-023-03: Repeated start không tạo nhiều giữ hàng; sandbox URL không trộn credentials production.
- [ ] AT-023-04: Sandbox redirect/session thực tế với merchant được cấp; thiếu config ghi BLOCKED validation, không coi mock là sandbox.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/payments/vnpay/checkout.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/payments/vnpay/checkout.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Adapter tạo signed payment URL số tiền từ DB, mã giao dịch riêng attempt; expiry khớp reservation.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 23 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa VNPay.

## Expected behavior

Adapter tạo signed payment URL số tiền từ DB, mã giao dịch riêng attempt; expiry khớp reservation.

## Requirements

Official VNPay spec version và canonical encoding; secrets server-only; sandbox/prod tách rõ; return page chỉ pending cho tới IPN xác minh; không client total.

## Dependencies

OV-022

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/payments/vnpay/; src/app/api/payments/vnpay/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Thiếu merchant TMN/hash secret chặn live validation, không tự đăng ký/thu phí.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Golden signing vectors, unicode encoding, amount scaling, expired reservation, provider error.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
