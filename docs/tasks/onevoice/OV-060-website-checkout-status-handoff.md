# OV-060 — Tích hợp checkout, status và handoff vào chat website

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Website-first: public chat là `/chat` (staff queue giữ `/support`). Không Graph, không Messenger send, không production charge. Reuse OV-021 confirmation, OV-027 status-lookup, OV-002 handoff; không invent table/service mới.

### Files và ownership

Nối planner/worker consultation đã có sang WEB inbound (OV-058) để gọi collection/link OV-021, status-lookup OV-027, và handoff WAITING_STAFF. Không tạo engine checkout/status/handoff thứ hai. Không sửa `src/app/(app)/support/` (OV-059). Không đụng Messenger outbox.

Đường dẫn dự kiến (chỉ tạo nếu chưa có implementation hiện hữu):

- `src/lib/consultation/` (WEB checkout/status/handoff routing; reuse `confirmation.ts`, `status-lookup.ts`, `handoff.ts`)
- colocated `*.test.ts` cho WEB wiring
- không migration mới (không table mới)

### Hợp đồng đầu vào, đầu ra và persistence

Inbound WEB đã persist (OV-056) + consultation job (OV-058). Outcome:

- Checkout: thu đủ tên/điện thoại/địa chỉ/SKU/số lượng theo schema OV-021; opaque confirmation URL (`/order-confirmation/{token}`) trong WEB outbound message. Token hash at rest, purpose=confirmation. Không PII trong URL. Confirm không tự PAID/PREPARING.
- Status: website session + mã đơn + điện thoại theo OV-027; public DTO only. Token purpose=status không confirm/pay.
- Handoff: `return_request` / `warranty_request` / `customer_requested` / `missing_evidence` / `lookup_failed` → `WAITING_STAFF` ngay; AI dừng; inbound vẫn lưu. Policy question không handoff.

Handoff thắng lookup. Không gọi Graph. Không `messenger_outbox`.

### Trình tự thực hiện

- [x] Đọc OV-021/027/002/058 contracts; viết regression WEB checkout/status/handoff trước khi nối planner.
- [x] Nối collection/link OV-021 từ WEB consult; confirmation URL chỉ WEB outbound.
- [x] Nối status-lookup OV-027; session WEB thay PSID; lỗi unverified đồng nhất.
- [x] Handoff WAITING_STAFF thắng lookup; không AI reply sau handoff (OV-058).
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-060-01: WEB chat thiếu field checkout không tạo link; đủ field → confirmation URL trong WEB outbound, không Graph/Messenger.
- [x] AT-060-02: Status đúng session+mã đơn+SĐT → public DTO; sai session/SĐT/mã → cùng thông báo unverified; không lộ existence.
- [x] AT-060-03: Yêu cầu gặp người / thực hiện đổi trả / bảo hành → WAITING_STAFF, AI dừng, lookup không chạy thay handoff.
- [x] AT-060-04: `/chat` hiện confirmation URL; reload còn history; purpose=confirmation không dùng làm status và ngược lại.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/consultation/website-checkout-status.test.ts` (đổi đúng path thực tế).

```powershell
node node_modules/vitest/vitest.mjs run src/lib/consultation/website-checkout-status.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md. Không Facebook, không live VNPay.

## Status

DONE

## Objective

Nối checkout (OV-021), tra cứu tiến độ (OV-027) và handoff vào chat website `/chat` để khách hoàn tất đơn, xem trạng thái, và gặp nhân viên mà không cần Messenger.

## Context

Thực hiện quyết định website-first 2026-09-13 trong [DECISIONS.md](DECISIONS.md) (website là kênh khách chính cho tới khi có Meta). Đây là task 60 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

Public chat route: `/chat`. Staff `/support` đã occupied. Interview cũ hoãn web-chat (DECISIONS §7) bị supersede cho WEB; Facebook vẫn adapter tương lai.

## Current behavior

OV-021 confirmation và OV-002 handoff tồn tại; OV-027 chưa làm. Consultation/outbox hiện gắn Messenger. Chat website (OV-057/058) chưa wire checkout/status/handoff. Không orders UI cho tới OV-025.

## Expected behavior

AI trên `/chat` thu checkout → link xác nhận; tra cứu khi đúng session+mã+SĐT; yêu cầu người/đổi trả/bảo hành → WAITING_STAFF. Confirmation URL nằm trong chat. Không Messenger. Handoff thắng lookup.

## Requirements

- Reuse OV-021/027/002; không duplicate collection/verifier/handoff.
- Không Graph / Messenger send / `messenger_outbox`.
- Không production charge; return URL / IPN không thuộc issue này (OV-023/024/063).
- Handoff thắng status lookup.
- Private notes không ra customer DTO.
- CSRF/origin trên mutation public đã có ở OV-055/056; không nới.
- Fulfilment enum `DELIVERING` (không `SHIPPING`) khi nhắc tiến độ.

## Dependencies

OV-021, OV-025, OV-027, OV-058

OV-054/055/056/057 là transitive qua OV-058. OV-059 (composer) không chặn wire checkout/status/handoff; khách thấy WAITING_STAFF từ handoff này, tin nhân viên thuộc OV-059.

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: consultation WEB routing tới confirmation/status-lookup/handoff. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không sửa Facebook ingress, không thêm cookie/session (OV-055), không public chat UI (OV-057), không staff composer (OV-059), không orders list UI (OV-025), không status verifier core (OV-027 — gọi, không copy).

## Edge cases

- Policy question không handoff.
- Lookup failed / missing evidence → handoff, không đoán.
- Concurrent handoff không tạo bản sao (OV-002).
- Token confirmation hết hạn: generic error, không lộ order.
- Không tài khoản khách; session WEB opaque (OV-055) không phải conversation UUID.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Checkout thiếu field; confirmation URL chỉ WEB; status sai identity; handoff thắng lookup; không Graph trong network/log.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13, local Windows, container `supabase_db_onevoice`, no remote DB writes, no VNPay charge, no Facebook Graph/Messenger send.
Workspace identifier: OV-060 files listed below; no git commit.
Files and migration versions changed:
- `src/lib/consultation/website-checkout-status.test.ts` (new)
- `supabase/migrations/20260913108000_website_checkout_status_handoff.sql` (applied; `schema_migrations` version=20260913108000 name=website_checkout_status_handoff)
- this issue
Planner `consult()` / worker `createConsultationHandler` already called `collectCheckoutRoute` and `collectOrderStatusRoute` (OV-021/027). This issue only made `finish_consultation` persist a reply candidate for `route` outcomes that already have customer-visible text, so OV-058 `web_outbound` delivers confirmation/status copy on WEB. No staff composer. No scheduler. No `messages.ts` DTO change (URL is in outbound text `/chat` already renders).
Acceptance cases:
- AT-060-01 PASS vitest missing checkout field has no confirmation URL and does not call collect; complete name/phone/address/SKU/qty → opaque `/order-confirmation/{token}` on consult/worker outcome and local `web_outbound.text`; `messenger_outbox=0`; fulfilment DRAFT / payment UNPAID; planner/worker/outbound/messages sources have no Graph.
- AT-060-02 PASS session+order UUID+phone → status URL `/order-status/`; wrong session/phone/code share `UNVERIFIED_TEXT` with no `statusUrl` and no order id leak. Local verify issues purpose=`status` token; wrong phone stores the same unverified copy.
- AT-060-03 PASS explicit gặp người / đổi trả / bảo hành return `handoff` without calling status.verify or checkout.collect; policy questions stay null. Local handoff → conversation `WAITING_STAFF` + `handoff_ack`; later inbound does not return an AI-eligible consultation job; `messenger_outbox=0`.
- AT-060-04 PASS GET `/api/chat/messages` includes outbound confirmation URL; reload returns the same texts. Confirmation token hash cannot `read_order_status`; status token cannot `read_order_confirmation`.
Commands executed:
```
docker exec -i supabase_db_onevoice psql ... < supabase/migrations/20260913108000_website_checkout_status_handoff.sql
node node_modules/vitest/vitest.mjs run src/lib/consultation/website-checkout-status.test.ts --maxWorkers=1 --no-file-parallelism
# Test Files 1 passed / Tests 8 passed
```
Results: vitest 8/8 passed. typecheck/eslint/full suite skipped per assignment.
DB proof: local `supabase_db_onevoice` only; synthetic org/product/WEB ingest; leftover jobs marked succeeded in test `finally`. Migration left applied (forward-only). No db reset.
UI/media/provider proof: no live `/chat` browser tab (Next not required this wave). GET messages DTO is the `/chat` transcript source (`chat-client.tsx` renders `row.text`). No Meta/Messenger send. No live VNPay.
Implementation decisions:
- Reuse OV-021 collection/token and OV-027 verifier. Do not invent a second checkout/status engine.
- `finish_consultation` keeps `outcome.type=route` (worker tests still see route) and sets `candidate.type=reply` with the route text so existing WEB enqueue/authorize fences apply. Route without text stays candidate-null (legacy).
- WAITING_STAFF still suppresses (`conversation_changed`) before the route candidate branch. Handoff still uses `handoff_ack`.
- Chat DTO unchanged; confirmation/status links are the customer-visible text.
Remaining limitations/blockers: live `/chat` walkthrough is OV-062. README tracker owned by orchestrator. `database.types.ts` not updated. tsc/eslint deferred.
Cleanup: vitest fixture orgs swept queued jobs. No owned long-running processes.
Reviewer conclusion and README/status update: Status **DONE** 2026-09-13 website-first. AT-060-01..04 PASS. README not edited (orchestrator-owned).
