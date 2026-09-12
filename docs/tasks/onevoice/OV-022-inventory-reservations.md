# OV-022 — Giữ tồn 15 phút nguyên tử

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/orders/reservations.ts + reservations.test.ts; migration reservation/payment-attempt; supabase/tests/inventory-reservations.test.sql; sửa đúng mutation catalog hiện hữu để bảo vệ reserved.

### Hợp đồng đầu vào, đầu ra và persistence

beginPayment nhận trusted orderId+expectedVersion+requestId, không nhận client total; trả attemptId, frozenTotalVnd, expiresAt. Một transaction lock order và SKU theo thứ tự ID, revalidate giá/phí/stock, freeze, reserve, tạo attempt. available=physical-activeReserved. Expiry15min theo DB clock.

### Trình tự thực hiện

- [ ] Viết SQL invariant và hai-connection last-unit regression trước; active reservation unique per attempt/SKU, state ACTIVE|CONSUMED|RELEASED.
- [ ] Implement begin-payment transaction all-or-nothing, reject stale quote và variant không active. Parent có variants không được bán bucket song song.
- [ ] Nối manager stock mutation: không giảm physical dưới reserved, kể cả import/bulk path có thể thay kho; mọi đường write phải dùng invariant hoặc bị reject.
- [ ] Expiry job lock cùng order/reservation với024; release idempotent; mất lease/restart không giải phóng hai lần. Catalog/evidence availability phải dùng cùng cách tính sau integration.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-022-01: Hai khách mua last unit→một success; không âm stock/reserved.
- [ ] AT-022-02: Hai SKU, một thiếu→zero reservation/attempt/frozen partial changes.
- [ ] AT-022-03: Same request replay trả same attempt, conflict payload bị reject.
- [ ] AT-022-04: Paid/expiry chạy đồng thời→exactly consumed hoặc released; late paid không lấy kho người khác.
- [ ] AT-022-05: Manager/import giảm dưới reserved bị reject; unknown stock không cho checkout; variant disabled có active reserve không làm mất invariant.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/orders/reservations.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/orders/reservations.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

RPC giữ tất cả dòng đơn nguyên tử khi bắt đầu thanh toán; expiry job trả tồn idempotent.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 22 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa reserved stock.

## Expected behavior

RPC giữ tất cả dòng đơn nguyên tử khi bắt đầu thanh toán; expiry job trả tồn idempotent.

## Requirements

Khả dụng=physical-reserved; không âm; stock update manager không thấp hơn reserved; tạo reservation và checkout attempt một transaction.

## Dependencies

OV-012, OV-020, OV-021

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/orders/reservations.ts; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không giữ từ lúc AI tư vấn; callback muộn không tự oversell.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Hai khách mua last unit; hết hạn trùng callback; nhiều SKU một SKU thiếu rollback; job retry không trả hai lần.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.


Inventory ruling (engineering default): product có variants thì variant là đơn vị bán/giữ tồn; không cho bán parent bucket song song. Parent physicalquantity là aggregate activevariants (unknown=>null). Product không variants dùng product SKU. OV-022 phải sửa chính mutation catalog010 để không giảm physical dưới reserved, không tạo API cập nhật kho thứ hai né invariant.
