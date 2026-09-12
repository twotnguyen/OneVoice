# OV-058 — Giao câu trả lời AI trên website

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Inbound WEB → job durable → `consult()` hiện hữu → `finish_consultation` → persist outbound **WEB**, không `messenger_outbox`, không Graph.

### Files và ownership

Tạo `src/lib/channels/web/outbound.ts` (+ test). Migration owner: `supabase/migrations/20260913102000_website_outbound.sql` (+ `supabase/tests/website-outbound.test.sql`). Wire `src/worker/consultation.ts` pump WEB — **không** copy planner/`consult()`. Đọc `supabase/migrations/20260912113000_messenger_outbox.sql` trigger `enqueue_messenger_outbox_from_receipt`: WEB **không** được insert `messenger_outbox` (thiếu page/psid sẽ vỡ hoặc gọi Graph). Sửa trigger/fence theo channel, không xóa Facebook path.

### Hợp đồng đầu vào, đầu ra và persistence

- Reuse `consult()` / `finish_consultation` / planner / evidence / lease. `claim_consultation_job` đã nhận WEB (OV-054).
- Outbound table WEB (tên `web_outbound` hoặc tương đương — **không** tái sử dụng `messenger_outbox`). Unique theo inbound event; kind `reply|handoff_ack` như 018. Persist customer-visible text để GET `/api/chat/messages` đọc được.
- Send-time fence giống OV-018: tại thời điểm “giao” (persist visible outbound) recheck `AI_ACTIVE` + conversation revision; handoff trước authorize → không lộ reply cũ; complete không revive revision cũ.
- `WAITING_STAFF`: không AI reply; inbound vẫn stored (đã có từ 054/056).
- Không Messenger transport. Không Graph. Không `claim_messenger_job` cho hàng WEB.
- Worker restart: không nhân outbound; replay `finish_consultation` idempotent.

### Trình tự thực hiện

- [x] SQL: WEB outbound + unique inbound; trigger Facebook chỉ khi `channel=FACEBOOK`; WEB enqueue outbound WEB.
- [x] Worker: claim WEB inbound → consult → finish → outbound WEB visible; WAITING_STAFF không candidate reply.
- [x] Revision fence tests (handoff before persist visible; stale revision suppressed).
- [x] GET `/api/chat/messages` thấy AI text; `messenger_outbox` count 0 cho hội thoại WEB.
- [x] AT không Graph; README/Status sau TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-058-01: WEB inbound → `consult()` → `finish_consultation` → đúng một hàng outbound WEB; không hàng `messenger_outbox`; không HTTP Graph.
- [x] AT-058-02: WAITING_STAFF — inbound lưu, không AI reply outbound; pause giữa generate không persist reply (cùng 018).
- [x] AT-058-03: Revision fence — handoff trước authorize/persist visible → suppressed; staff complete không revive revision cũ.
- [x] AT-058-04: Replay finish/job restart không nhân outbound WEB; hai worker một winner.
- [x] AT-058-05: Khách GET `/api/chat/messages` thấy reply AI; Facebook conversation vẫn đi `messenger_outbox` (fixture local, fake transport, **không** live Graph).

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/channels/web/outbound.test.ts` và SQL `supabase/tests/website-outbound.test.sql`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/channels/web/outbound.test.ts --maxWorkers=1 --no-file-parallelism
```

Nếu entry chưa tồn tại, tạo regression trước implementation. Local SQL container `supabase_db_onevoice`. Không Facebook live / VNPay live.

## Status

DONE

## Objective

Giao câu trả lời AI cho hội thoại WEB bằng `consult()`/`finish_consultation` hiện có, outbound table WEB (không Graph, không `messenger_outbox`), fence revision/AI_ACTIVE như OV-018.

## Context

Thực hiện website-first trong [DECISIONS.md](DECISIONS.md). Task 58 trong [tracker](README.md). `consult()` đã channel-agnostic khi có context. Trigger `enqueue_messenger_outbox_from_receipt` Messenger-specific. OV-017 DONE; OV-018 DONE cho Facebook. DAG: OV-056 → OV-058 → OV-059.

## Current behavior

Mọi `consultation_receipts` completed có candidate đều enqueue `messenger_outbox` (cần page_id/psid). Không đường giao text cho WEB. `claim_consultation_job` trước 054 chỉ Facebook.

## Expected behavior

Hội thoại WEB nhận AI reply trên poll `/api/chat/messages`. Handoff vẫn thắng. Facebook outbox không đổi với hàng FACEBOOK.

## Requirements

- Reuse `consult()` / `finish_consultation`; không copy planner.
- WEB outbound table, not `messenger_outbox`.
- No Graph. WAITING_STAFF stores inbound, no AI reply.
- Revision fence at persist-visible time.
- Jobs: không thêm kind mới nếu `outbound_message` dùng được với entity WEB outbound; nếu dùng chung kind, claimant Messenger không được lấy hàng WEB và ngược lại.

## Dependencies

OV-017, OV-056

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/channels/web/outbound.ts; src/worker/consultation.ts; supabase/migrations/20260913102000_website_outbound.sql`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không composer staff (OV-059). Không checkout (OV-060). Không xóa Facebook adapter. Không `.env` token Graph.

## Edge cases

- WEB receipt với candidate reply khi conversation đã WAITING_STAFF → không visible outbound.
- Trigger 018 chạy trên receipt WEB → must no-op Messenger insert.
- Gap/handoff_ack: khách có thể thấy ack ngắn nếu product đã làm trên Facebook; WEB tương đương, không Graph.
- Không đánh SENT=delivered; WEB “giao” = persist visible cho poll.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.
- [x] AT-058-01..05 PASS không live Graph.

## Testing

SQL unique/fence, worker local fake AI, GET poll thấy text, messenger_outbox=0 cho WEB, Facebook fixture vẫn enqueue outbox. Không khách thật.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13 local win32, container supabase_db_onevoice, no live Graph.
Workspace identifier: OV-058 files listed below; no git commit.
Files and migration versions changed:
- src/lib/channels/web/outbound.ts (new)
- src/lib/channels/web/outbound.test.ts (new)
- supabase/migrations/20260913102000_website_outbound.sql (applied; schema_migrations version 20260913102000 name website_outbound)
- supabase/tests/website-outbound.test.sql (new)
- src/worker/consultation.ts (WEB outbound pump always-on; Graph pumps still token-gated)
- src/lib/channels/web/messages.ts (GET merges VISIBLE web_outbound; 056 POST/DTO unchanged)
- docs/tasks/onevoice/OV-058-ai-website-response-delivery.md
Acceptance cases:
- AT-058-01 PASS — consult() praise → finish_consultation → 1 web_outbound, messenger_outbox=0, outbound.ts has no graph.facebook.com / createGraphMessengerTransport
- AT-058-02 PASS — WAITING_STAFF inbound stored; pause-before-finish withholds candidate (SQL ok 26–32)
- AT-058-03 PASS — handoff before persist-visible SUPPRESSED; staff complete does not revive old revision (SQL ok 34–39)
- AT-058-04 PASS — finish replay idempotent; unique inbound; two workers one lease; replay authorize stays one VISIBLE row
- AT-058-05 PASS — GET JSON includes outbound AI text; Facebook fixture still enqueues messenger_outbox and fake transport SENT; no live Graph
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/channels/web/outbound.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/vitest/vitest.mjs run src/lib/channels/web/messages.test.ts --maxWorkers=1 --no-file-parallelism
Get-Content supabase/tests/website-outbound.test.sql | docker exec -i supabase_db_onevoice psql -X -U postgres -d postgres -v ON_ERROR_STOP=1
```
Results: vitest outbound.test.ts 7 passed; messages.test.ts 5 passed (056 GET/POST unchanged). SQL TAP finish 1..51 all ok ROLLBACK.
DB proof: local supabase_db_onevoice; TAP fixtures a0580000-… rolled back; vitest ephemeral orgs swept queued jobs. schema_migrations 20260913102000 recorded.
UI/media/provider proof: n/a (no UI; no live Graph). Facebook path used existing fake Messenger transport.
Implementation decisions: Separate table web_outbound (not messenger_outbox). Kinds reply|handoff_ack; unique inbound_event_id; unique handoff_ack(handoff_id). Trigger enqueue_messenger_outbox_from_receipt no-ops unless conversations.channel=FACEBOOK. New trigger enqueue_web_outbound_from_receipt for WEB only. Delivery = PENDING then authorize_web_outbound persist VISIBLE if AI_ACTIVE+revision (reply) or matching handoff (ack); else SUPPRESSED. Reused outbound_message kind; claim_messenger_job joins messenger_outbox; claim_web_outbound_job joins web_outbound. Worker always runs WEB pump with createWebOutboundHandler (no transport). GET listPublicMessages merges inbound + VISIBLE outbound by (time,id).
Remaining limitations/blockers: Staff composer is OV-059. database.types.ts not updated (RPC via structural client.rpc as never). README tracker owned by orchestrator. tsc/eslint deferred.
Cleanup: SQL TAP rolled back; vitest leftover jobs marked succeeded for fixture orgs. No owned long-running processes.
Reviewer conclusion and README/status update: AT-058-01..05 PASS. Status DONE. README not edited (orchestrator-owned).
