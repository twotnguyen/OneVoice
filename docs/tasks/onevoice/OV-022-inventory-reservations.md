# OV-022 — Giữ tồn 15 phút nguyên tử

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/orders/reservations.ts + reservations.test.ts; migration reservation/payment-attempt; supabase/tests/inventory-reservations.test.sql; sửa đúng mutation catalog hiện hữu để bảo vệ reserved.

### Hợp đồng đầu vào, đầu ra và persistence

beginPayment nhận trusted orderId+expectedVersion+requestId, không nhận client total; trả attemptId, frozenTotalVnd, expiresAt. Một transaction lock order và SKU theo thứ tự ID, revalidate giá/phí/stock, freeze, reserve, tạo attempt. available=physical-activeReserved. Expiry15min theo DB clock.

### Trình tự thực hiện

- [x] Viết SQL invariant và hai-connection last-unit regression trước; active reservation unique per attempt/SKU, state ACTIVE|CONSUMED|RELEASED.
- [x] Implement begin-payment transaction all-or-nothing, reject stale quote và variant không active. Parent có variants không được bán bucket song song.
- [x] Nối manager stock mutation: không giảm physical dưới reserved, kể cả import/bulk path có thể thay kho; mọi đường write phải dùng invariant hoặc bị reject.
- [x] Expiry job lock cùng order/reservation với024; release idempotent; mất lease/restart không giải phóng hai lần. Catalog/evidence availability phải dùng cùng cách tính sau integration.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-022-01: Hai khách mua last unit→một success; không âm stock/reserved.
- [x] AT-022-02: Hai SKU, một thiếu→zero reservation/attempt/frozen partial changes.
- [x] AT-022-03: Same request replay trả same attempt, conflict payload bị reject.
- [x] AT-022-04: Paid/expiry chạy đồng thời→exactly consumed hoặc released; late paid không lấy kho người khác.
- [x] AT-022-05: Manager/import giảm dưới reserved bị reject; unknown stock không cho checkout; variant disabled có active reserve không làm mất invariant.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/orders/reservations.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/orders/reservations.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

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

- [x] Mark IN_PROGRESS trong task (README left for orchestrator).
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-12, local Windows, container `supabase_db_onevoice`, no remote DB, no VNPay/Messenger.
Workspace identifier: git HEAD de46270; dirty/untracked owned files: `src/lib/orders/reservations.ts`, `src/lib/orders/reservations.test.ts`, `supabase/migrations/20260912118000_inventory_reservations.sql`, `supabase/tests/inventory-reservations.test.sql`, `src/lib/supabase/database.types.ts`.
Files and migration versions changed: exclusive `20260912118000_inventory_reservations.sql` applied locally and recorded in `supabase_migrations.schema_migrations`.
Acceptance cases:
- AT-022-01 PASS two real docker psql sessions; loser `ORDER_STOCK_UNAVAILABLE`; physical 1, active reserved 1, available 0.
- AT-022-02 PASS missing SKU rolls back attempt/reservation/freeze.
- AT-022-03 PASS same requestId replay; changed expectedVersion `ORDER_REQUEST_CONFLICT`.
- AT-022-04 PASS expire vs consume on two connections; final RELEASED or CONSUMED once; late consume cannot steal a later ACTIVE hold.
- AT-022-05 PASS unknown stock `ORDER_STOCK_UNKNOWN`; import/manager `CATALOG_STOCK_RESERVED`; disabled variant keeps ACTIVE reserve and the physical floor.
Commands executed:
```
docker exec -i supabase_db_onevoice psql ... < supabase/migrations/20260912118000_inventory_reservations.sql
docker exec -i supabase_db_onevoice psql ... < supabase/tests/inventory-reservations.test.sql
# 1..38 all ok, ROLLBACK
node node_modules/vitest/vitest.mjs run src/lib/orders/reservations.test.ts --maxWorkers=1 --no-file-parallelism
# Test Files 1 passed / Tests 10 passed / Duration 20.35s
```
Results: SQL TAP 38/38 ok; vitest 10/10. typecheck/eslint/full suite skipped per assignment.
DB proof: local container only; synthetic org/product/order UUIDs; two connections via `docker exec -i` for last-unit and paid/expiry.
Implementation decisions:
- `beginPayment(port, organizationId, {orderId, expectedVersion, requestId})` calls `readConfirmedQuote` then `begin_payment`. Never accepts client total.
- SQL one transaction: lock order, lock SKUs by id, revalidate price/fee/stock (`available = physical - ACTIVE reserved`), `freeze_order_checkout_snapshot`, insert `payment_attempts` + `inventory_reservations`, set `AWAITING_PAYMENT`. Expiry = `clock_timestamp() + 15 minutes`.
- States ACTIVE|CONSUMED|RELEASED. Unique active attempt per order; unique reservation per attempt/SKU.
- Consume decrements physical after marking CONSUMED. Expire/late consume RELEASE without decrement. Same lock order (order then SKUs then attempt) for 024. Replay is idempotent.
- Catalog fence is a BEFORE UPDATE trigger on `products`/`product_variants.stock_quantity` so `save_catalog_product` and import/bulk UPDATEs cannot drop physical below reserved. No second stock API.
Remaining limitations/blockers: consultation evidence still reports recorded physical, not available; VNPay 023/024 not implemented; tsc/eslint/README/DONE left for orchestrator.
Cleanup: SQL TAP rolled back; vitest fixtures disabled (`products.disabled_at`, `staff_profiles.active=false`). No running processes.
Reviewer conclusion and README/status update: Status IN_PROGRESS; DONE unset pending orchestrator verification. No README edit.


Inventory ruling (engineering default): product có variants thì variant là đơn vị bán/giữ tồn; không cho bán parent bucket song song. Parent physicalquantity là aggregate activevariants (unknown=>null). Product không variants dùng product SKU. OV-022 phải sửa chính mutation catalog010 để không giảm physical dưới reserved, không tạo API cập nhật kho thứ hai né invariant.
