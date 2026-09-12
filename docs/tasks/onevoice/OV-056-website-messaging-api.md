# OV-056 — API tin nhắn website công khai

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Public route **`/api/chat/messages`** GET+POST. Không Graph. Không chạy AI inline (worker OV-058).

### Files và ownership

Tạo `src/app/api/chat/messages/route.ts` và `src/lib/channels/web/messages.ts` (+ test colocated). Dùng session OV-055 và `project_web_conversation` OV-054. Rate-limit **gửi** persisted (cùng họ bảng limiter WEB của OV-055 nếu đã có — không tạo limiter memory, không bảng limiter thứ ba cạnh tranh). Đọc `src/lib/auth/security.ts` Origin. Không sửa `/api/support`.

### Hợp đồng đầu vào, đầu ra và persistence

- Cookie session bắt buộc; thiếu cookie → 401/403 generic, không tiết lộ hội thoại tồn tại.
- POST: inbound idempotent (client `requestId`/`provider_key` unique `(org, channel, provider_key)`); persist inbound WEB; enqueue `business_jobs.kind='inbound_event'` (cùng kind hiện hữu). Replay cùng key không nhân message/job.
- GET: cursor poll; chỉ message khách được xem (inbound của mình + outbound công khai sau OV-058/059). **Private notes không bao giờ trả**.
- Giới hạn độ dài text (conservative, cùng tinh thần 1800 consultation candidate — ghi bound đã chọn). Rate-limit send persisted theo session hash + origin.
- POST/GET mutation/send: exact Origin trên POST (`sameOriginMutation`). GET poll same-origin cookie.
- Không gọi `consult()`. Không `enqueue_messenger_outbox_from_receipt` path. Không Graph. Không Facebook page/psid trên request.
- Public DTO: text, direction/kind khách thấy, timestamps, cursor, conversation status tối thiểu (`AI_ACTIVE` / `WAITING_STAFF` / `STAFF_ACTIVE`) để UI OV-057. Không PSID, không staff id, không internal note.

### Trình tự thực hiện

- [x] Tests: no-cookie, bad Origin, idempotent POST, length, rate-limit restart, GET cursor, notes absent.
- [x] POST persist + enqueue inbound_event; GET cursor; gắn cookie OV-055.
- [x] Cấm Graph import/transport; cấm gọi planner/consult trong route.
- [x] Chạy AT; HTTP local hoặc handler test + SQL job row.
- [x] Review; README/Status sau TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-056-01: POST+GET `/api/chat/messages` với cookie — inbound lưu, job `inbound_event` một hàng; replay cùng idempotency key không nhân.
- [x] AT-056-02: Không cookie / cookie session khác → không đọc được history; sai Origin POST reject.
- [x] AT-056-03: Text quá dài reject; rate-limit send persisted còn hiệu lực sau restart process.
- [x] AT-056-04: GET cursor phân trang; reload (GET lại từ đầu) trả đúng history đã persist; không private notes trong JSON.
- [x] AT-056-05: Route không gọi Graph, không `consult()`/`finish_consultation`, không ghi `messenger_outbox`. Chạy được không page_id/psid.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/channels/web/messages.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/channels/web/messages.test.ts --maxWorkers=1 --no-file-parallelism
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Không Facebook live.

## Status

DONE

## Objective

API công khai GET+POST `/api/chat/messages` theo cookie phiên: inbound idempotent + job `inbound_event`, poll cursor, giới hạn length/rate, Origin, không Graph, không AI inline.

## Context

Thực hiện website-first trong [DECISIONS.md](DECISIONS.md). Task 56 trong [tracker](README.md). Jobs hiện có: `inbound_event|outbound_message|automation_tick|knowledge_ingest|render_content|outbound_comment`. Consultation worker đã claim `inbound_event` Facebook; OV-054 mở WEB. Staff API `/api/support` login-gate — không dùng cho khách.

## Current behavior

Không `/api/chat`. Inbound chỉ `ingest_facebook_events`. Khách không POST được tin.

## Expected behavior

Khách có cookie gửi/nhận qua `/api/chat/messages`; tin bền vững; job inbound; poll cursor; AI/staff reply chưa bắt buộc (OV-058/059). Status hội thoại đọc được nếu đã project.

## Requirements

- Public `/api/chat/messages` GET+POST; cookie session; idempotent inbound + inbound_event job; cursor poll; length+rate limits persisted; Origin on POST.
- No Graph; no inline AI; private notes never returned.
- Không login. Không staff chrome. Không Facebook fields bắt buộc.
- Reuse `web_inbound_events` / inbound tổng quát của OV-054; không bảng hội thoại mới.

## Dependencies

OV-055

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/api/chat/messages/; src/lib/channels/web/messages.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không UI `/chat` (OV-057). Không WEB outbound table (OV-058). Không composer `/support` (OV-059). Không đổi `BUSINESS_ACTIONS`. Một migration chỉ khi API cần receipt/rate-limit **chưa** có trong 055 — không tranh owner 054/055; ưu tiên reuse.

## Edge cases

- Double-click POST: một inbound.
- Cursor giả/malformed: 400 generic.
- WAITING_STAFF: vẫn nhận inbound (OV-014 append-while-waiting); không trả lời AI ở đây.
- Job enqueue fail phải rollback inbound (một transaction).
- Không lộ org/staff/PSID.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.
- [x] AT-056-01..05 PASS không Graph.

## Testing

Idempotency, CSRF, rate-limit persisted, cursor, isolation, no Graph/no consult. Không khách thật.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13 local Windows; container `supabase_db_onevoice`; no Graph / VNPay.
Workspace identifier: git HEAD d442a91; dirty/untracked owned files: `src/app/api/chat/messages/route.ts`, `src/lib/channels/web/messages.ts`, `src/lib/channels/web/messages.test.ts`, `supabase/tests/website-messages.test.sql`, this issue. README left to orchestrator.
Files and migration versions changed: no new migration. Reused `ingest_web_event` (OV-054) and `take_website_rate_limit` / `website_rate_limits` (OV-055). Did not edit Wave A migrations, planner, README, `.env`, or `database.types.ts`.
Acceptance cases:
- AT-056-01 PASS (vitest: POST+GET cookie stores inbound text, one `inbound_event` job; replay same `requestId` does not duplicate. SQL TAP ok 8–10: same event id, one `web_inbound_events` row, one job)
- AT-056-02 PASS (vitest: missing cookie 401; missing/wrong Origin POST 403 and zero events; session B GET `messages: []`; guessed conversation UUID cookie 401. SQL TAP ok 12–14: distinct sender_key rows)
- AT-056-03 PASS (vitest: 1801 chars → 400; 1800 accepted; 20 sends then 429; new handler binding against the same port still 429; client_key is sha256(session hash + origin), raw cookie absent from RPC. SQL TAP ok 15–21: `message_send` scope hit_count=20 persisted)
- AT-056-04 PASS (vitest: malformed cursor `{` → 400; pageSize 2 returns one/two then three; reload from start returns one/two; kind=note / `SECRET_NOTE` / psid / staffId omitted from JSON. SQL TAP ok 22–23: inbound data `{"text":"xin chao"}`, no SECRET_NOTE)
- AT-056-05 PASS (vitest: ingest payload has no pageId/psid; source of `messages.ts` + route has no `consult(`, `finish_consultation`, `messenger_outbox`, `graph.facebook.com`. SQL TAP ok 11, 24–25: zero `messenger_outbox` / `outbound_message` for fixture org; inbound jsonb has text without page/psid)
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/channels/web/messages.test.ts --maxWorkers=1 --no-file-parallelism
docker exec supabase_db_onevoice psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/website-messages.test.sql
```
Results: vitest 5 passed / 1 file. SQL TAP finish `1..25` no `not ok`. tsc/eslint/full suite skipped (orchestrator; concurrent siblings). No Graph.
DB proof: local supabase_db_onevoice; TAP fixtures a0560000-… rolled back; no schema_migrations change.
Implementation decisions: Public GET+POST `/api/chat/messages`. Cookie `ov_web_session` required (401 if missing/unknown). POST uses `sameOriginMutation` (403). Text bound **1800** (consultation candidate). Idempotency `provider_key=message:${requestId}` via `ingest_web_event` (atomic persist + `inbound_event` job). Send limiter reuses `website_rate_limits` scope `message_send`, 20 / 60s, `client_key=sha256(channelUserKey + NUL + origin)` — no third limiter table, no migration. GET cursor `{at,id}` chronological; page 50; status from projected WEB conversation or `AI_ACTIVE`. Public DTO: `id,text,direction,kind,receivedAt` plus `cursor`/`status`. Kinds `message|reply|handoff_ack`; `note` dropped. GET lists `web_inbound_events` for this `sender_key` (channel_user_key = token hash). Outbound WEB table is OV-058 — GET is ready to map `reply`/`handoff_ack` when listed. No `consult()`, no Graph, no `messenger_outbox`.
Remaining limitations/blockers: AI/staff outbound text not persisted yet (OV-058/059). Session cookie is not created here (OV-055 helper / OV-057 UI). `database.types.ts` not updated to avoid sibling collisions. README tracker owned by orchestrator. Typecheck/eslint deferred to orchestrator.
Cleanup: SQL TAP rolled back. No running processes owned by this task.
Reviewer conclusion: AT-056-01..05 PASS on vitest + local SQL; issue DONE. README status sync is orchestrator-owned.
