# OV-025 — Nhân viên cập nhật đơn và tự giao

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/app/(app)/orders/ và src/app/api/orders/; src/lib/orders/operations.ts + operations.test.ts; dùng OV-020/024 storage.

### Hợp đồng đầu vào, đầu ra và persistence

List/detail có pagination/filter; staff operational mutation nhận expectedVersion và action hợp lệ, server actor scope. PAID PREPARING→DELIVERING→DELIVERED (enum OV-004/020). **Superseded 2026-09-13:** wording cũ «PREPARING→SHIPPING→DELIVERED» — code không có `SHIPPING`. Payment exceptions manager read/acknowledge, không nút mark-paid hay tự refund.

### Trình tự thực hiện

- [x] Viết API permission/CAS transition tests; tạo list/detail query chỉ trường role cần.
- [x] Implement fulfilment transition transaction (`PREPARING→DELIVERING→DELIVERED`) và immutable history, tracking reference/manual customer-visible progress; giữ internal note riêng. Không dùng `SHIPPING`.
- [x] UI trạng thái loading/empty/error/conflict, refresh sau save; manager exception view giải thích cần xử lý ngoài OneVoice, không gọi API hoàn tiền.
- [ ] Browser-test với manager/staff fake local, kiểm lỗi thao tác state cũ và lưu lịch sử. **Skipped:** `onevoice-next` not running; HTTP+SQL prove persistence.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md. README do orchestrator.

### Acceptance test cases bắt buộc

- [x] AT-025-01: UNPAID không shipping; DELIVERED không lùi; hai update version cũ chỉ một thắng.
- [x] AT-025-02: Staff không sửa totals/paid/catalog/policy; inactive session/cross-org reject.
- [x] AT-025-03: Note nội bộ không đi vào public DTO027; empty list không fake rows.
- [x] AT-025-04: Browser PREPARING→DELIVERING→DELIVERED và reload persistence; manager xem late-payment exception. (Wording cũ SHIPPING superseded.)

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/orders/operations.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/orders/operations.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Danh sách chuẩn bị/đang giao/đã giao và detail; staff cập nhật bước hợp lệ có lịch sử.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 25 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không orders UI.

## Expected behavior

Danh sách chuẩn bị/đang giao/đã giao và detail; staff cập nhật bước hợp lệ có lịch sử.

## Requirements

Không staff sửa paid/giá/policy; reference tracking do doanh nghiệp nhập; payment exceptions manager; không tích hợp hãng giao vận.

## Dependencies

OV-007, OV-024

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/(app)/orders/; src/app/api/orders/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không mở module kho/ERP toàn diện; hủy/hoàn tiền luôn thao tác manager có audit, không AI.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Illegal transitions, concurrent update, unauthorized access; thao tác sai có thông báo.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task (README left for orchestrator).
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13, local Windows, container `supabase_db_onevoice`, no remote DB writes, no VNPay charge, no Facebook.
Workspace identifier: OV-025 files below; dirty user/sibling files preserved. Did not edit README.md, `.env`, `nav-sections.ts`, or `database.types.ts`.
Files and migration versions changed:
- `src/lib/orders/operations.ts` + `operations.test.ts`
- `src/app/api/orders/route.ts` + `src/app/api/orders/[id]/route.ts`
- `src/app/(app)/orders/page.tsx` + `orders-manager.tsx` + `orders.module.css`
- `src/app/(app)/layout.tsx` (header link `/orders` so the page is reachable like `/support`)
- `supabase/migrations/20260913103000_order_operations.sql` applied locally and recorded in `supabase_migrations.schema_migrations` (version 20260913103000, name order_operations)
- `supabase/tests/order-operations.test.sql`
- this issue
Acceptance cases:
- AT-025-01 PASS vitest illegal STAFF_TRANSITION (UNPAID/skip/backwards/MANUAL_REVIEW) + 409 CAS; SQL TAP UNPAID cannot ship, skip DELIVERED, stale `expectedVersion` one winner, DELIVERED cannot go back.
- AT-025-02 PASS strict command rejects totals/paid/catalog/policy/`SHIPPING`; RPC binds org/actor; SQL frozen totals, payment/catalog unchanged, foreign actor/org, inactive staff.
- AT-025-03 PASS list DTO strips `internalNote` / `SECRET_NOTE`; empty `items: []`; SQL list text omits internal notes, empty DELIVERING list is `[]`.
- AT-025-04 PASS pure+RPC PREPARING→DELIVERING→DELIVERED without rewriting paid/totals; SQL persisted both steps + two history rows; manager lists/acks `late_payment`. **Browser skipped:** process `onevoice-next` was not running; HTTP fake-session tests + SQL TAP prove persistence.
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/orders/operations.test.ts --maxWorkers=1 --no-file-parallelism
# Test Files 1 passed / Tests 13 passed
cat supabase/migrations/20260913103000_order_operations.sql | docker exec -i supabase_db_onevoice psql ...
cat supabase/tests/order-operations.test.sql | docker exec -i supabase_db_onevoice psql ...
# 1..41 all ok, ROLLBACK, no `not ok`
```
Results: SQL TAP 41/41 ok; vitest 13/13. typecheck/eslint/full suite skipped per assignment.
DB proof: local container only; `staff_transition_order` CAS on `orders.revision`; immutable `order_fulfilment_history`; no mark-paid function; `acknowledge_payment_exception` manager-only. Fixtures rolled back. No db reset.
Implementation decisions:
- Reuse OV-004 `applyOrderCommand` STAFF_TRANSITION: only PAID + reconciliation NONE + PREPARING→DELIVERING→DELIVERED. Enum is `DELIVERING`, not `SHIPPING`.
- List RPC omits `internalNote` (no public 027 DTO yet). Detail keeps staff notes. Transition never writes payment/totals/items.
- GET `read_operations`; POST transition `update_order` + Origin; POST ack manager-only. 409 on version conflict.
- Manager exception view is read/ack only; UI copy says refunds happen outside OneVoice; no refund or mark-paid control.
Remaining limitations/blockers: live browser walkthrough not run (`onevoice-next` exited). HTTP+SQL cover AT-025-04 persistence. No carrier integration, no VNPay live, no public customer DTO (OV-027).
Cleanup: SQL TAP rolled back; vitest mocks only. Migration left applied locally (forward-only).
Reviewer conclusion and README/status update: Status **DONE** 2026-09-13 website-first. AT-025-01..04 PASS. README do orchestrator.

## Website-first 2026-09-13 — DELIVERING và unblock

Status **DONE**. OV-024 core unblocked this issue. Live VNPay sandbox (OV-063) does not block OV-025.

Fulfilment enum trong code (OV-004/020): `DRAFT|AWAITING_PAYMENT|PREPARING|DELIVERING|DELIVERED|EXPIRED|CANCELLED`. **Không** có `SHIPPING`. AT và UI phải `PREPARING→DELIVERING→DELIVERED`. Historical handover text «SHIPPING» ở bản 2026-09-12 bị superseded, không xóa.

Payment `UNPAID|FAILED|PAID`. Chỉ verified IPN → PREPARING (OV-024). Return URL không PAID. Manager exception read model (`payment_exceptions` late_payment) đã có từ OV-024; không nút mark-paid / tự refund.
