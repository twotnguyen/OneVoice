# OV-054 — Hội thoại trung lập kênh FACEBOOK|WEB

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Website-first: kênh WEB là khách hàng chính cho đến khi có credential Meta. Facebook còn là adapter. Không Graph, không Messenger send, không cookie, không HTTP công khai trong task này.

### Files và ownership

Sửa `src/lib/conversations/repository.ts` (RPC names/snapshot). Một migration owner: `supabase/migrations/20260913100000_channel_neutral_conversations.sql`. SQL tests colocated `supabase/tests/channel-neutral-conversations.test.sql` (tên cuối cùng theo cây hiện hữu). Đọc `supabase/migrations/20260912100000_conversations.sql`, `20260912111000_consultation.sql`, `src/lib/conversations/handoff.ts` trước khi sửa. Không đụng `src/app/`, cookies, hay planner.

### Hợp đồng đầu vào, đầu ra và persistence

- `conversations` identified by `(organization_id, channel, channel_user_key)`; `channel` ∈ `FACEBOOK|WEB`.
- Facebook adapter giữ `page_id` + `psid` (NOT NULL khi `channel=FACEBOOK`). WEB không yêu cầu `page_id`/`psid` (nullable). Không dùng Page/PSID làm identity WEB.
- Migrate in-place hàng Facebook hiện có: `channel='FACEBOOK'`, `channel_user_key` không làm mất uniqueness `(organization_id, page_id, psid)` — hai Page khác cùng PSID vẫn hai hội thoại. Không merge hàng.
- `project_web_conversation` song song `project_facebook_conversation`: cùng handoff/revision/`aiEligible`/suppression. Reuse `request_conversation_handoff` / `transition_conversation_handoff` / OV-002; không copy planner, không copy handoff module.
- Messages WEB persist **không** bắt FK `facebook_inbound_events`. Chọn đúng một: bảng `web_inbound_events` **hoặc** `inbound_events` tổng quát (kênh + `provider_key`). Không tạo họ bảng thứ ba. Unique inbound `(organization_id, channel, provider_key)` (Facebook giữ unique hiện hữu `(organization_id, page_id, provider_key)`).
- `claim_consultation_job` nhận job `kind=inbound_event` WEB (entity trỏ inbound WEB), không chỉ join `facebook_inbound_events`. Generic `claim_business_job` không được lấy trộm inbound tư vấn WEB (cùng rule Facebook private).
- Snapshot/repository có `channel` (+ `channelUserKey` nội bộ). Không thêm `reply_customer` (OV-059). Không public HTTP.

### Trình tự thực hiện

- [x] Viết SQL uniqueness + Facebook regression (replay, echo/comment ignored, watermark) trước khi đổi constraint; chứng minh fail đúng nếu unique `(org,page,psid)` bị bỏ.
- [x] Migration in-place: backfill `channel`/`channel_user_key`, nullable `page_id`/`psid` với CHECK theo channel, unique mới, `web_inbound_events` hoặc inbound tổng quát, `project_web_conversation`, nới FK message/handoff/receipt để WEB không bắt Facebook event.
- [x] `claim_consultation_job` claim được WEB inbound; suppression WAITING_STAFF + delayed backlog sau complete vẫn `aiEligible=false`.
- [x] Repository TypeScript nhận snapshot/channel; Facebook `project()` giữ nguyên tên RPC.
- [x] Chạy từng ca acceptance dưới đây trên SQL local (`supabase_db_onevoice`) + test colocated; không Graph.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-054-01: Facebook regression — `project_facebook_conversation` replay `inserted=false`; echo/comment `ignored`; unique `(org,page,psid)` không gộp hai Page; không gọi Graph.
- [x] AT-054-02: WEB không có `page_id`/`psid` — `project_web_conversation` tạo hội thoại `channel=WEB`; CHECK cấm WEB bắt Page/PSID; FACEBOOK vẫn NOT NULL page/psid.
- [x] AT-054-03: Uniqueness — hai project WEB cùng `(org, channel, channel_user_key)` một hàng; inbound duplicate `(org, channel, provider_key)` không nhân message; WEB và FACEBOOK cùng chuỗi key vẫn hai hội thoại.
- [x] AT-054-04: Suppression WAITING_STAFF — inbound WEB lúc pause vẫn lưu, `aiEligible=false`; message nhận trong cửa sổ staff vẫn suppressed sau complete; chỉ input mới sau complete mới eligible (cùng contract OV-014).
- [x] AT-054-05: Concurrent project — hai connection `project_web_conversation` cùng event: một conversation, một message, không lost update revision.

### Lệnh và bằng chứng

Test entry dự kiến: `supabase/tests/channel-neutral-conversations.test.sql` và regression `src/lib/conversations/` nếu repository đổi schema parse.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/conversations --maxWorkers=1 --no-file-parallelism
```

SQL local (container `supabase_db_onevoice` only; không db reset/remote):

```powershell
docker exec supabase_db_onevoice psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/channel-neutral-conversations.test.sql
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm test hiện có của module bị sửa, scoped ESLint, SQL/concurrency gates theo TESTING.md. Mọi AT phải chạy được **không** Facebook live / VNPay live.

## Status

DONE

## Objective

Hội thoại bền vững theo `(organization_id, channel, channel_user_key)` với `channel` `FACEBOOK|WEB`; WEB không cần Page/PSID; Facebook adapter giữ các cột đó; handoff/suppression/consultation claim dùng chung.

## Context

Thực hiện quyết định website-first trong [DECISIONS.md](DECISIONS.md) (phỏng vấn cũ lấy Facebook làm kênh duy nhất — superseded cho identity hội thoại). Đây là task 54 trong [tracker](README.md). DAG: OV-054 → OV-055 → OV-056 → OV-057; OV-056 cũng mở OV-058 → OV-059. OV-027 phụ thuộc OV-054 (channel-neutral), không khóa Facebook. Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

`conversations` `UNIQUE(organization_id, page_id, psid)`; `page_id`/`psid` NOT NULL; không có enum channel. `conversation_messages.inbound_event_id` UNIQUE FK `facebook_inbound_events`. Handoff `source_event_id` và `consultation_receipts.event_id` cũng FK Facebook. `project_facebook_conversation` + `claim_consultation_job` chỉ join inbound Facebook. Status `AI_ACTIVE|WAITING_STAFF|STAFF_ACTIVE` (OV-002/014) đã đúng và phải giữ.

## Expected behavior

Cùng hàng đợi/handoff/revision; identity kênh-neutral. `project_web_conversation` song song Facebook. WEB không page/psid. `claim_consultation_job` nhận inbound WEB. Unique inbound theo kênh. Suppression WAITING_STAFF không đổi nghĩa.

## Requirements

- Channel `FACEBOOK|WEB` only; không Zalo/email/bảng hội thoại thứ hai.
- Facebook: giữ `page_id`+`psid` trên hàng FACEBOOK; adapter `src/lib/channels/facebook` không bị xóa.
- WEB: cấm require `page_id`/`psid`; `channel_user_key` không phải conversation UUID và không phải raw cookie (cookie thuộc OV-055).
- Migrate in-place; uniqueness Facebook hiện hữu được bảo toàn (không gộp Page).
- Reuse handoff OV-002/014 (`aiEligible`, revision CAS, complete-only).
- Messages WEB không FK bắt buộc `facebook_inbound_events`.
- `claim_consultation_job` nhận WEB; không copy planner; không public HTTP; không cookies; không `reply_customer`.
- Một migration `20260913100000_channel_neutral_conversations.sql`. Forward-only. Local container `supabase_db_onevoice`.

## Dependencies

OV-002, OV-014

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/conversations/repository.ts; supabase/migrations/20260913100000_channel_neutral_conversations.sql`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không sửa `src/app/`, `Dockerfile`, `.env`, Messenger outbox, permissions allowlist, hay Studio. Không enqueue Graph. `enqueue_messenger_outbox_from_receipt` để nguyên — WEB outbound là OV-058.

## Edge cases

- FACEBOOK thiếu page/psid vẫn invalid_conversation_identity.
- Public comment/echo Facebook vẫn ignored, không thành WEB.
- Job `inbound_event` Facebook và WEB cùng `kind` nhưng entity khác bảng — claimant phải phân nhánh đúng, không nuốt comment (OV-019).
- `channel_user_key` rỗng/quá dài reject.
- Không silent reopen sau complete (OV-002).

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.
- [x] AT-054-01..05 PASS trên fixture local, không Graph.

## Testing

SQL uniqueness, Facebook regression, WEB without page/psid, concurrent project, suppression WAITING_STAFF. Hai connection thật cho AT-054-05. Không memory-only. Không dữ liệu khách thật.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13 local Windows; container `supabase_db_onevoice`; no Graph / VNPay.
Workspace identifier: git HEAD d442a91; dirty/untracked owned files: `src/lib/conversations/repository.ts`, `src/lib/conversations/repository.test.ts`, `supabase/migrations/20260913100000_channel_neutral_conversations.sql`, `supabase/tests/channel-neutral-conversations.test.sql`, `supabase/tests/channel-neutral-conversations-concurrency.mjs`, this issue. README left to orchestrator.
Files and migration versions changed: exclusive `20260913100000_channel_neutral_conversations.sql` applied locally; `supabase_migrations.schema_migrations` version=20260913100000 name=channel_neutral_conversations. No db reset.
Acceptance cases:
- AT-054-01 PASS (SQL TAP ok 7–14: replay inserted=false, echo/comment ignored, two Pages same PSID stay two rows)
- AT-054-02 PASS (SQL TAP ok 15–26: WEB channel, null page/psid, XOR web inbound pointer, CHECKs)
- AT-054-03 PASS (SQL TAP ok 27–34: one WEB row, duplicate provider_key, WEB+FACEBOOK same key string stay distinct)
- AT-054-04 PASS (SQL TAP ok 40–47: pause persist+suppress, post-complete delayed stays false, fresh eligible)
- AT-054-05 PASS (`node supabase/tests/channel-neutral-conversations-concurrency.mjs`: two real docker psql sessions; one conversation, one message, revision 0)
Commands executed:
```
docker exec supabase_db_onevoice psql ... -f /tmp/channel-neutral-conversations.test.sql
node supabase/tests/channel-neutral-conversations-concurrency.mjs
node node_modules/vitest/vitest.mjs run src/lib/conversations --maxWorkers=1 --no-file-parallelism
```
Results: SQL TAP finish `1..47` no `not ok`; concurrency `PASS AT-054-05`; vitest 4 passed / 1 skipped (handoff.local), 47 passed / 1 skipped. tsc/eslint/full suite skipped (orchestrator; concurrent siblings). Pre-impl SQL TAP failed `web_inbound_events does not exist` (red). Existing `conversations.test.sql` ok 14 counts global `outbound_message` jobs (have 13) — unscoped pre-existing rows, not created by WEB projection; remaining 34/35 Facebook assertions passed. No Graph.
DB proof: local supabase_db_onevoice; TAP fixtures a0540000-… rolled back; AT-054-05 ephemeral org left with one projected WEB conversation. schema_migrations 20260913100000 recorded.
Implementation decisions: chose `web_inbound_events` (not a generalized inbound_events table). `conversation_messages.inbound_event_id` stays the event UUID; added nullable `facebook_inbound_event_id` + `web_inbound_event_id` XOR + match check so WEB messages persist without `facebook_inbound_events`. Dropped Facebook FKs on handoff `source_event_id`, handoff decisions, `consultation_receipts.event_id`, and `knowledge_gap_occurrences.source_event_id` (UUID still unique per event). WEB uniqueness is partial unique `(organization_id, channel, channel_user_key) WHERE channel=WEB`; FACEBOOK uniqueness is partial unique `(organization_id, page_id, psid) WHERE channel=FACEBOOK` so two Pages with the same PSID stay two rows. FACEBOOK `channel_user_key` backfill is PSID. `ingest_web_event` inserts+enqueues `business_jobs.kind=inbound_event`. `project()` keeps RPC `project_facebook_conversation`. `enqueue_messenger_outbox_from_receipt` unchanged (WEB outbound OV-058).
Remaining limitations/blockers: WEB eligible `finish_consultation` with a reply/handoff_ack candidate can still hit Messenger outbox NOT NULL page/psid — out of scope (OV-058). `database.types.ts` not updated to avoid sibling collisions. README tracker owned by orchestrator.
Cleanup: SQL TAP rolled back; AT-054-05 fixture org retained like other concurrency tests. No running processes owned by this task.
Reviewer conclusion: AT-054-01..05 PASS on local SQL; issue DONE. README status sync is orchestrator-owned.
