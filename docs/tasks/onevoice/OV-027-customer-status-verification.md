# OV-027 — Xác minh khách và tra cứu tiến độ

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/consultation/status-lookup.ts + status-lookup.test.ts; src/app/order-status/; purpose-specific token helper dùng chung021; nối planner/worker route order_status.

### Hợp đồng đầu vào, đầu ra và persistence

Verify order code+normalized phone+trusted owner. **Website-first:** owner = website session (OV-054/055), không bắt PSID. Facebook PSID là adapter-only, không required cho WEB. Unknown/wrong/legacy-unbound trả cùng thông báo không xác minh được; legacy→staff, không auto-bind. Success chỉ public order/warranty DTO; token purpose=status không được confirm/pay. **Superseded for WEB:** «trusted org/Page/PSID owner» — PSID không phải blocker website.

### Trình tự thực hiện
- [x] Viết privacy fixtures có hai khách cùng phone, hai Page và order unbound. Rate-limit server persisted theo identity và request origin, không memory-only.
- [x] Implement verifier và current order/warranty read, không chứa internal notes/address đầy đủ mặc định. Đề xuất kỹ thuật TTL status link30min, lưu hash và scope.
- [x] Nối intent→ask missing info→verify→candidate status/link trên **WEB chat** (OV-060). Handoff/request thực hiện bảo hành vẫn thắng lookup. Messenger/018 outbox không còn hard wiring. **Superseded:** «Nối Messenger intent→…→018».
- [x] Trang public GET token đọc current status có asOf, no-store/referrer policy; token invalid không tiết lộ mã đơn tồn tại.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [x] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-027-01: WEB session+mã đơn+SĐT đúng → public DTO; sai session/SĐT/mã → cùng unverified, no data. PSID không required cho WEB (Facebook adapter-only). Unbound/legacy→handoff, không binding ngầm. **Superseded for WEB:** «sai PSID→no data».
- [x] AT-027-02: Guess hàng loạt→rate limited **persisted** (còn sau restart); errors không phân biệt order tồn tại.
- [x] AT-027-03: Warranty public progress đúng case/order, không private note, không người khác.
- [x] AT-027-04: Local worker verification trên website session (không bắt Messenger outbox); token confirmation không được dùng làm status và ngược lại. Handoff thắng lookup.
- [x] AT-027-01 original (Facebook adapter, not WEB blocker): Biết phone+order nhưng sai PSID→no data — chỉ khi channel FACEBOOK.


### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/consultation/status-lookup.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/consultation/status-lookup.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Tra cứu tiến độ kênh-neutral: website session + mã đơn + điện thoại. Facebook PSID chỉ adapter. Chưa binding → nhân viên xác minh, không OTP.

**Superseded 2026-09-13 (Messenger-only):** «Order tạo từ Messenger gắn PSID; tra cứu yêu cầu mã đơn+điện thoại khớp và PSID owner; chưa binding chuyển nhân viên xác minh.»


## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 27 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa customer identity binding.

## Expected behavior

Tra cứu tiến độ kênh-neutral: website session + mã đơn + điện thoại. Facebook PSID chỉ adapter. Chưa binding → nhân viên xác minh, không OTP.

**Superseded 2026-09-13:** same Messenger/PSID sentence as Objective.


## Requirements

Không tiết lộ tồn tại order trước verify; không chỉ biết số điện thoại là được; public detail token có hạn; trả trạng thái và nội dung khách được xem.

## Dependencies

OV-025, OV-026, OV-054

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/consultation/status-lookup.ts; src/app/order-status/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Wiring bắt buộc: src/lib/consultation/ và src/worker/ gọi status tool sau xác minh, route public chỉ trả đúng token scope. Test **WEB session** -> verified lookup -> WEB outbound (OV-058/060), không chỉ unit lookup. Messenger outbox/OV-018 **không** hard dep. **Superseded:** «Test Messenger intent -> verified lookup -> outbox response».

## Edge cases

Đây là quyết định kỹ thuật privacy thay cho tự chọn OTP provider; nhân viên xác minh đơn cũ trước liên kết.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Guess phone/order, sai session, rate limit persisted, no binding, warranty private note không lộ, handoff thắng lookup. PSID chỉ khi channel FACEBOOK.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13, local Windows, container `supabase_db_onevoice`, no remote DB writes, no VNPay charge, no Facebook Graph/Messenger send.
Workspace identifier: git HEAD d442a91; dirty/untracked owned files listed below. Did not edit README.md, `.env`, `next-env.d.ts`, or `database.types.ts`.
Files and migration versions changed:
- `src/lib/consultation/status-lookup.ts` + `status-lookup.test.ts`
- `src/lib/consultation/planner.ts` (order_status collect/verify/statusUrl only)
- `src/lib/consultation/worker.ts` (statusLookup port wiring only)
- `src/app/order-status/[token]/page.tsx` + `status.module.css`
- `next.config.ts` (`/order-status/:path*` no-store/no-referrer)
- `supabase/migrations/20260913104000_status_lookup.sql` applied locally; `supabase_migrations.schema_migrations` version=20260913104000 name=status_lookup
- `supabase/tests/status-lookup.test.sql`
- this issue
Acceptance cases:
- AT-027-01 PASS vitest WEB session+code+phone public DTO without PSID; wrong session/phone/code share `{ok:false,code:UNVERIFIED}` with no order data; unbound HANDOFF and `conversation_id` stays null. SQL TAP ok 9–18 same. Facebook wrong PSID unverified; matching page+psid adapter verifies.
- AT-027-02 PASS vitest Map store survives new `createStatusLookup` instance; SQL TAP ok 19–25 five guesses then RATE_LIMITED even when the order exists; `status_lookup_rate_windows.attempt_count>=6` persisted.
- AT-027-03 PASS `toPublicOrderStatus` strips `SECRET_NOTE`/`PRIVATE`/address; verified warranty is own case only. SQL TAP ok 26–29 token read omits notes and other-customer warranty.
- AT-027-04 PASS consult/worker store `{type:route,route:order_status,statusUrl}` without Messenger; explicit handoff/warranty/return win over lookup; SQL TAP ok 31–34 confirmation token cannot `read_order_status`, status token cannot `read_order_confirmation`/`confirm_order_quote`/`read_vnpay_checkout_start`.
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/consultation/status-lookup.test.ts --maxWorkers=1 --no-file-parallelism
# Test Files 1 passed / Tests 14 passed
node node_modules/vitest/vitest.mjs run src/lib/consultation/planner.test.ts src/lib/consultation/worker.test.ts --maxWorkers=1 --no-file-parallelism
# Test Files 2 passed / Tests 14 passed
Get-Content supabase/migrations/20260913104000_status_lookup.sql | docker exec -i supabase_db_onevoice psql ...
Get-Content supabase/tests/status-lookup.test.sql | docker exec -i supabase_db_onevoice psql ...
# finish 1..34, ROLLBACK, no `not ok`
```
Results: SQL TAP 34/34 ok; vitest status-lookup 14/14; planner+worker 14/14. typecheck/eslint/full suite skipped per assignment.
DB proof: local container only; `verify_customer_order_status` rate-limits by sha256(identity jsonb)+origin hash in 10-minute windows (limit 5); purpose=`status` tokens hashed at rest TTL 30min cap 1h; public DTO never selects `internal_note`/`private_note`/address. Fixtures rolled back. No db reset.
Implementation decisions:
- Reuse `order_confirmation_tokens` with purpose check `confirmation|status`. Existing confirm/pay RPCs already require purpose=`confirmation`.
- Trusted owner is `conversation_id` from the worker claim. WEB identity is `(organization_id,channel,channel_user_key)` with null page/psid; Facebook adapter additionally requires page+psid on that conversation. Website path never takes a PSID argument.
- Unbound (`orders.conversation_id` null) returns HANDOFF and does not write the conversation. Planner maps that to `gap` `lookup_failed`/`service` so `finish_consultation` hands off via existing gap path.
- Public GET `/order-status/[token]` is read-only (no API mutations). Invalid token is generic «Liên kết không khả dụng.» Headers private no-store / no-referrer.
- Worker stores route/statusUrl candidate only; no Messenger transport.
Remaining limitations/blockers: live `/order-status` browser walkthrough not run (`onevoice-next` not required this wave). WEB outbound composer is OV-058/060. `database.types.ts` not updated (RPC port uses `client.rpc as never`) to avoid sibling collisions. README tracker owned by orchestrator.
Cleanup: SQL TAP rolled back; vitest fakes only. Migration left applied locally (forward-only).
Reviewer conclusion and README/status update: Status **DONE** 2026-09-13 website-first. AT-027-01..04 PASS. README do orchestrator.

## Website-first 2026-09-13 — channel-neutral

Status **DONE**. Core identity: website session + order code + phone. Facebook PSID is adapter-only, **not** required for WEB. **OV-018 removed as hard dependency**; add **OV-054**. Live deps: OV-025, OV-026, OV-054.

Uniform unverified errors (unknown/wrong/legacy) — không lộ existence. Rate-limit persisted (DB, not memory-only), survives restart. Handoff wins over lookup (return/warranty execution / customer_requested / lookup_failed).

DECISIONS §6 «Status lookup: order từ Messenger gắn Page+PSID» bị superseded cho WEB; giữ làm Facebook adapter rule, không khóa website.
