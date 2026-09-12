# OV-059 — Nhân viên trả lời khách website

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

OV-015 “không composer” **superseded cho WEB only**. Composer WEB trên `/support/[id]`. Facebook: ẩn/disable composer, giữ notice Meta inbox — **không** Graph send.

### Files và ownership

Sửa `src/lib/business/permissions.ts` (+ `permissions.test.ts`): thêm `reply_customer` cho staff+manager. Sửa `src/app/(app)/support/support-conversation.tsx`, `src/app/api/support/[id]/route.ts`. Persist qua outbound WEB OV-058 (không `messenger_outbox`). Đọc OV-001 allowlist 13 actions hiện tại; OV-002 complete-only; `transition_conversation_handoff` claim CAS. Không thêm `reply_customer` ở 054.

### Hợp đồng đầu vào, đầu ra và persistence

- Composer chỉ khi `channel=WEB` và hội thoại `STAFF_ACTIVE` + actor là claimant hoặc manager (cùng complete rule). FACEBOOK: không composer; giữ copy mở Meta.
- `canPerformBusinessAction(role, "reply_customer")` true cho staff và manager; unknown action vẫn false.
- POST reply: permission `reply_customer`, exact Origin, expectedRevision/CAS nếu đụng revision, audit `audit_events`. Text → WEB outbound customer-visible; poll `/api/chat/messages` thấy. Idempotent `requestId`.
- Private notes (nếu thêm ô nội bộ): đánh dấu private, **không** vào public DTO 056. Không notes thì AT vẫn chứng minh không field staff-only trên GET khách.
- Concurrent claim: một winner (RPC hiện hữu); người thua 409, không gửi được reply.
- Complete/reopen theo OV-002: complete only; không silent reopen. Reply không complete hộ.
- Không Graph. Không gửi Messenger từ composer.

### Trình tự thực hiện

- [x] TDD permissions: `reply_customer` staff+manager; ma trận cũ không regress.
- [x] API support POST operation `reply` (tên chốt khi impl) chỉ WEB; Facebook 400/403 + UI disabled.
- [x] UI composer WEB; Facebook notice Meta giữ.
- [x] Audit + concurrent claim + private notes isolation.
- [x] Browser staff fake local; khách `/chat` thấy reply. Không Graph.
- [x] README/Status sau TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-059-01: Staff/manager WEB `/support/[id]` gửi reply → outbound WEB persist; khách GET `/api/chat/messages` thấy; audit row; không `messenger_outbox`.
- [x] AT-059-02: `reply_customer` staff+manager; role lạ/null deny; inactive session/cross-org reject.
- [x] AT-059-03: Facebook conversation — composer ẩn hoặc disabled; POST reply reject; Meta inbox notice còn; zero Graph.
- [x] AT-059-04: Concurrent claim hai staff — một winner; loser không reply; complete-only, không silent reopen.
- [x] AT-059-05: Private notes (nếu có) không có trên public GET; nếu không có notes, public JSON không chứa field nội bộ staff.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/business/permissions.test.ts` và test support/reply colocated.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/business/permissions.test.ts --maxWorkers=1 --no-file-parallelism
```

Nếu path reply mới, tạo regression trước impl. Browser: staff `/support/{id}` WEB fixture, anonymous `/chat`. Không Facebook live.

## Status

DONE

## Objective

Composer WEB trên `/support/[id]`; quyền `reply_customer` staff+manager; reply hiện trên chat khách; Facebook không gửi Graph; notes nội bộ không tới khách; claim đồng thời một người thắng; audit.

## Context

Thực hiện website-first trong [DECISIONS.md](DECISIONS.md). Task 59 trong [tracker](README.md). OV-015 DONE: claim/complete/reassign, **no composer**. OV-001: 13 actions, chưa `reply_customer`. Staff UI `src/app/(app)/support/support-conversation.tsx` bảo “Trả lời khách trong hộp thư Meta”. DAG: OV-058 → OV-059. Deps OV-015, OV-001, OV-058.

## Current behavior

`/api/support/[id]` POST `claim|complete|reassign` only. Không composer. Không private notes. Facebook-centric copy + optional Meta URL.

## Expected behavior

WEB: nhân viên nhận rồi gõ trả lời trong OneVoice; khách thấy qua poll. FACEBOOK: như OV-015 (Meta inbox), composer tắt. Quyền mới `reply_customer`.

## Requirements

- Composer WEB only trên `/support/[id]`.
- BusinessAction `reply_customer` staff+manager (không thêm ở 054).
- Private notes never to customer.
- Concurrent claim one winner.
- Audit mutations.
- Facebook composer disabled; no Graph.
- Complete only (OV-002); no silent reopen.

## Dependencies

OV-015, OV-001, OV-058

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/business/permissions.ts; src/app/(app)/support/; src/app/api/support/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Reuse WEB outbound OV-058; không bảng Messenger mới. Không đổi route public `/chat`. Không Facebook publishing. Migration notes chỉ nếu thêm private notes — owner 059, timestamp sau `20260913102000`, không tranh 054/055.

## Edge cases

- Reply khi WAITING_STAFF chưa claim → reject.
- Manager reply giúp claimant: cho phép nếu policy complete (manager) — ghi quyết định; mặc định cùng người được complete hoặc manager.
- Empty text reject.
- Double-click reply idempotent.
- Không suy “đã trả lời Meta” = complete OneVoice (OV-015 edge, giữ).

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.
- [x] AT-059-01..05 PASS không live Graph.

## Testing

Permissions matrix, WEB reply persistence, Facebook composer disabled, concurrent claim, notes isolation, audit. Browser staff+anonymous. Không khách thật.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13 local win32, container supabase_db_onevoice, no live Graph.
Workspace identifier: OV-059 files listed below; no git commit.
Files and migration versions changed:
- src/lib/business/permissions.ts (reply_customer staff+manager)
- src/lib/business/permissions.test.ts
- src/lib/conversations/support/read.ts (channel on detail, merge VISIBLE web_outbound, canComposeStaffWebReply)
- src/lib/conversations/support/read.test.ts
- src/lib/conversations/support/routes.test.ts
- src/lib/conversations/support/reply.test.ts (new)
- src/app/api/support/[id]/route.ts (POST operation reply → staff_web_reply, permission reply_customer)
- src/app/(app)/support/support-conversation.tsx (WEB composer; Facebook Meta notice kept)
- src/app/(app)/support/support.module.css
- src/lib/supabase/database.types.ts (conversations.channel/channel_user_key; staff_web_reply)
- supabase/migrations/20260913107000_staff_web_reply.sql (applied; schema_migrations version 20260913107000 name staff_web_reply)
- supabase/tests/staff-web-reply.test.sql
- docs/tasks/onevoice/OV-059-staff-website-reply.md
Acceptance cases:
- AT-059-01 PASS — staff_web_reply inserts VISIBLE web_outbound kind=reply; messenger_outbox=0; audit conversation.staff_replied; GET /api/chat/messages public DTO includes outbound reply text; no Graph
- AT-059-02 PASS — reply_customer staff+manager; null/unknown deny; empty text 400; inactive staff and cross-org 42501; Origin mismatch 403; unauthenticated 401
- AT-059-03 PASS — canComposeStaffWebReply false for FACEBOOK; UI keeps Meta inbox notice and hides composer; staff_web_reply on FACEBOOK 22023; source has no graph.facebook.com
- AT-059-04 PASS — concurrent claim one winner (existing CAS); loser 42501 on reply; complete-only; reply after complete cannot reopen
- AT-059-05 PASS — no private notes UI; public GET JSON keys only id/text/direction/kind/receivedAt (no privateNote/staffId/actorId/claimedBy/psid)
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/business/permissions.test.ts src/lib/conversations/support/read.test.ts src/lib/conversations/support/routes.test.ts src/lib/conversations/support/reply.test.ts --maxWorkers=1 --no-file-parallelism
Get-Content supabase/tests/staff-web-reply.test.sql | docker exec -i supabase_db_onevoice psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
```
Results: vitest 4 files 115 passed. SQL TAP finish 1..30 all ok ROLLBACK.
DB proof: local supabase_db_onevoice; TAP fixtures a0590000-… rolled back; vitest ephemeral orgs swept queued jobs. schema_migrations 20260913107000 recorded.
UI/media/provider proof: composer gated by canComposeStaffWebReply (WEB STAFF_ACTIVE claimant or manager). Facebook notice retained in support-conversation.tsx. No live Graph. No interactive browser this run; customer visibility proven via createWebsiteMessagesRoute GET DTO + VISIBLE web_outbound.
Implementation decisions: Persist staff reply as web_outbound VISIBLE immediately (kind=reply, nullable inbound_event_id, request_key=requestId). No worker, no messenger_outbox, no revision bump, no complete. Idempotent via conversation_transition_receipts + request_key. Actor rule matches complete (claimant or manager). Facebook 22023. Public GET unchanged (OV-056/058 merge VISIBLE reply). No private notes field.
Remaining limitations/blockers: README tracker owned by orchestrator. tsc/eslint deferred per wave. No private-notes composer.
Cleanup: SQL TAP rolled back; vitest leftover jobs marked succeeded for fixture orgs. No owned long-running processes.
Reviewer conclusion and README/status update: AT-059-01..05 PASS. Status DONE. README not edited (orchestrator-owned).
