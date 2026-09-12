# OV-024 — Xác minh thanh toán và chuẩn bị hàng

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/payments/vnpay/notification.ts + notification.test.ts; IPN route; SQL finalize payment và supabase/tests/payment-finalization.test.sql. Tái sử dụng order-state.ts/reservations.

### Hợp đồng đầu vào, đầu ra và persistence

Verify signature trước mutation; match merchant, transaction ref, amount, currency, provider result với DB attempt. Verified success atomically PAID+consume reservation+PREPARING+audit. Late success→MANUAL_REVIEW exception, không fulfill/refund. Response code dùng official VNPay contract.

### Trình tự thực hiện

- [x] Viết table-driven IPN fixtures và local SQL concurrency test trước; lưu unique provider transaction receipt với digest để replay kiểm payload.
- [x] Implement positive signature verification và strict parser, không tin browser return. Lock attempt/order/reservations cùng thứ tự022.
- [x] Finalize transaction hoặc late-payment exception, giữ lịch sử bất biến. Failure/out-of-order không downgrade paid. Endpoint trả provider ACK đúng verified outcome.
- [ ] Sandbox end-to-end start→IPN→DB→return page **moved to OV-063** (AT-024-05). Không bắt buộc cho OV-024 DONE. Không production charge. Manager exception read model cho025 đã có từ core.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [x] Core scope 2026-09-13 DONE. README tracker do orchestrator. Live sandbox không thuộc issue này.

### Acceptance test cases bắt buộc

- [x] AT-024-01: Signature/merchant/amount/currency/ref sai→zero paid/stock mutation.
- [x] AT-024-02: Duplicate identical success→một consume/audit; reused ref với payload khác→reject.
- [x] AT-024-03: Race expiry vs IPN bằng hai DB connections: kho nhất quán; late success không PREPARING.
- [x] AT-024-04: Return trước IPN vẫn pending; failure đến sau success không downgrade.
- [ ] AT-024-05: **moved to OV-063**. Sandbox verified IPN sau sandbox payment. Không required cho OV-024 DONE. Wording gốc: «Sandbox verified IPN bắt buộc trước DONE; thiếu merchant/callback quyền ghi BLOCKED.»

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/payments/vnpay/notification.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/payments/vnpay/notification.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

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

Sandbox E2E **không** còn bắt buộc trước OV-024 DONE (superseded 2026-09-13 → OV-063). Không gọi tài chính thật / production để test. Core local HMAC/IPN đủ DONE.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task (core HMAC/match/idempotency/atomic; live sandbox = OV-063).
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại (AT-024-01..04 PASS; AT-024-05 moved).
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

IPN lặp/out-of-order/fake amount/signature; paid vs expiry concurrent; return trước IPN; callback muộn.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task (README left for orchestrator).
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13, local Windows, container `supabase_db_onevoice`, local Kong `127.0.0.1:54321`, no remote DB writes, no real/sandbox VNPay charge, no Facebook.
Workspace identifier: OV-024 files below; dirty user/sibling files preserved. NEXT_PUBLIC_SUPABASE_URL left unchanged.
Files and migration versions changed:
- `src/lib/payments/vnpay/notification.ts`
- `src/lib/payments/vnpay/notification.test.ts`
- `src/app/api/payments/vnpay/ipn/route.ts`
- `supabase/migrations/20260912121000_vnpay_payment_finalization.sql` applied locally and recorded in `supabase_migrations.schema_migrations` (version 20260912121000, name vnpay_payment_finalization)
- `supabase/tests/payment-finalization.test.sql`
- this issue
Official IPN ACK: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html retrieved 2026-09-13, PAY 2.1.0 GET IPN, HMACSHA512 before mutation, JSON `{RspCode,Message}`. Retry ends on 00/02; continues on 01/04/97/99. Messages match official PHP sample (`Confirm Success`, `Order not found`, `Order already confirmed`, `invalid amount`, `Invalid signature`, `Unknow error`).
Acceptance cases:
- AT-024-01 PASS vitest HMAC-before-mutate (97/01/04, mutations empty except SQL amount match) + SQL TAP unknown ref/merchant/amount/currency → zero paid/stock/receipt.
- AT-024-02 PASS identical digest replay RspCode 02, one receipt/one `order.payment_paid` audit/one consume; different digest after PAID → 02, no second consume.
- AT-024-03 PASS two real `docker exec -i` psql sessions: expire vs `finalize_vnpay_ipn` after `expires_at` in the past; final PAID+EXPIRED+MANUAL_REVIEW, reservation RELEASED, physical unchanged, one `payment_exceptions` row. Sequential TAP expire-then-IPN same invariants.
- AT-024-04 PASS `readVnpayReturn` stays pending/UNPAID; failure IPN after success RspCode 02, still PAID/PREPARING.
- AT-024-05 **moved to OV-063** (was BLOCKED: did not submit a sandbox payment). VNPay IPN is server-call-server after a charge; unsigned mocks are not sandbox IPN (97/99). No live IPN without charging. Not required for this DONE.
Commands executed:
```
docker exec -i supabase_db_onevoice psql ... < supabase/migrations/20260912121000_vnpay_payment_finalization.sql
docker exec -i supabase_db_onevoice psql ... < supabase/tests/payment-finalization.test.sql
# 1..49 all ok, ROLLBACK, no `not ok`
node node_modules/vitest/vitest.mjs run src/lib/payments/vnpay/notification.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
# Test Files 1 passed / Tests 8 passed
```
Results: SQL TAP 49/49 ok; vitest 8/8. typecheck/eslint/full suite skipped per assignment.
DB proof: local container only; `vnpay_ipn_receipts` unique (txn_ref, payload_digest) plus one PAID/MANUAL_REVIEW per txn_ref; `orders.reconciliation`; `payment_exceptions` late_payment read model for OV-025. Fixtures disabled (`products.disabled_at`, `staff_profiles.active=false`). No db reset.
Implementation decisions:
- HMAC via `verifyVnpayChecksum` before any RPC. Merchant/currency filters in TS; amount/ref match and mutations in `finalize_vnpay_ipn`. Consume is `consume_inventory_attempt` inside that transaction (OV-022 lock order: advisory 26, order, SKUs, attempt).
- Success 00+00: atomic PAID + consume + PREPARING + audit. Late/released: PAID + MANUAL_REVIEW, no PREPARING, no stock decrement, no refund. Failure after PAID does not downgrade. Return URL remains OV-023 read-only.
- GET `/api/payments/vnpay/ipn` always HTTP 200 JSON ACK. No same-origin CSRF (VNPay server-to-server).
Remaining limitations/blockers: AT-024-05 sandbox verified IPN **moved to OV-063**. Core không BLOCKED. Live Next still points at remote Supabase (OV-023 diagnosis); không blocker HMAC/SQL. OV-025 unblocked by this DONE.
Cleanup: SQL TAP rolled back; vitest fixtures disabled. No extra processes. Migration left applied locally (forward-only).
Reviewer conclusion and README/status update: Status **DONE** 2026-09-13 website-first. AT-024-01..04 PASS. AT-024-05 → OV-063 BLOCKED live sandbox. README do orchestrator (DocsTracker).

## Website-first 2026-09-13 — core close

Status **DONE**. Live sandbox IPN is OV-063 (BLOCKED until merchant/sandbox charge allowed). Does **not** block OV-025.

Core scope complete (evidence AT-024-01..04 above, 2026-09-13, `supabase_db_onevoice`, no remote writes, no real/sandbox charge, no Facebook):

- HMAC before mutation
- amount/order/txn match
- idempotency
- replay protection
- bad signature → zero paid/stock
- late callback → MANUAL_REVIEW, not PREPARING
- atomic txn (PAID + consume + PREPARING + audit)
- only verified IPN → PREPARING
- return URL never PAID

AT-024-01..04 remain PASS. AT-024-05 moved to OV-063; unsigned mocks are not sandbox IPN (97/99). No production charge.
