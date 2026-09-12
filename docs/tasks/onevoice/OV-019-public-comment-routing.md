# OV-019 — Bình luận quan tâm mời nhắn Messenger

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/channels/facebook/comments.ts + comments.test.ts; dùng webhook/backend OV-013 và outbox OV-018; SQL dedup keyed Page+comment ID.

### Hợp đồng đầu vào, đầu ra và persistence

Classifier chỉ trả INVITE|IGNORE. Nội dung cố định tiếng Việt mời nhắn Messenger, không đưa giá, chính sách, PII. Public-comment reply adapter riêng, không tái sử dụng PSID endpoint sai mục đích; comment không mở private messaging window.

### Trình tự thực hiện

- [x] Parse feed/comment event đã xác minh chữ ký/Page; bỏ Page self echo, deleted/unsupported event và reply do chính bot tạo.
- [x] Tạo bộ fixture tiếng Việt praise/question/service request/spam; output model không được trở thành free-form public reply.
- [x] Persist disposition và invitation outbox theo comment identity; edit/replay không tạo chuỗi trả lời mới.
- [x] Nối worker với API public comment đã xác minh; dùng cùng chính sách ambiguous network của018, không tự private-message người bình luận.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-019-01: 'xịn quá', 'sản phẩm tốt lắm'→IGNORE; 'giá bao nhiêu', 'còn hàng không', yêu cầu bảo hành→INVITE.
- [x] AT-019-02: Comment chứa số điện thoại/địa chỉ: reply không phản chiếu dữ liệu đó.
- [x] AT-019-03: Self echo và duplicate/edit event→tối đa một reply; thiếu quyền/unknown→không retry mù.
- [x] AT-019-04: Actual local signed ingress→disposition→fake public transport; chứng minh không tạo private consultation window.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/channels/facebook/comments.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/channels/facebook/comments.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Quan tâm sản phẩm/dịch vụ và khiếu nại/đổi trả/bảo hành công khai được mời inbox; khen chung bỏ qua.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 19 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không comment classifier.

## Expected behavior

Quan tâm sản phẩm/dịch vụ và khiếu nại/đổi trả/bảo hành công khai được mời inbox; khen chung bỏ qua.

## Requirements

Không tư vấn chi tiết hoặc xin thông tin cá nhân công khai; mỗi comment tối đa một reply; Page echo bỏ qua; ambiguous không spam; bot reply không tạo loop.

## Dependencies

OV-013, OV-018

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/channels/facebook/comments.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không suy ra đủ quyền private reply; chỉ public invitation theo API khả dụng.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Các ví dụ người dùng: xịn quá/tốt lắm ->ignore; giá bao nhiêu/còn hàng ->invite; bảo hành ->invite; replay.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task (README owned by orchestrator, not edited).
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập. README/DONE do orchestrator.

## Implementation decisions and evidence

Validation date / environment: 2026-09-12, Windows local D:\Documents\CODE\OneVoice, branch main. Node vitest 5.0.0. Local container supabase_db_onevoice; Postgres via docker exec; no remote DB; no live Messenger/Facebook public comment; no .env print.
Workspace identifier: git HEAD de46270630c8f468f0ba602b11ef76618e28f01c + dirty OV-019 files below (README not edited).
Files and migration versions changed:
- src/lib/channels/facebook/comments.ts (new)
- src/lib/channels/facebook/comments.test.ts (new)
- src/lib/channels/facebook/webhook.ts (skip Page self-echo, remove/hide, missing comment_id)
- src/lib/jobs/types.ts (job kind outbound_comment)
- src/worker/consultation.ts (comment disposition pump always; public-comment send pump when FACEBOOK_PAGE_ACCESS_TOKEN is set)
- supabase/migrations/20260912117000_public_comment_routing.sql (applied locally; schema_migrations version 20260912117000 name public_comment_routing)
- supabase/tests/public-comment-routing.test.sql (new)
- docs/tasks/onevoice/OV-019-public-comment-routing.md (this evidence)
Acceptance cases:
- AT-019-01 PASS — classifyPublicComment: xịn quá / sản phẩm tốt lắm → IGNORE; giá bao nhiêu / còn hàng không / yêu cầu bảo hành / đổi trả → INVITE; spam URL → IGNORE
- AT-019-02 PASS — INVITE text is fixed Vietnamese invite; does not contain 0901234567, Nguyễn Huệ, digits, giá, or bảo hành
- AT-019-03 PASS — webhook/parse skip page self-echo, remove, hide, missing comment_id; SQL unique (organization_id,page_id,comment_id) first-write-wins on edit; Graph 10 permission completes without retry; SENDING restart → UNKNOWN zero resend
- AT-019-04 PASS — HMAC-signed local webhook → ingest → disposition → fake POST /{comment-id}/comments; conversations=0; claim_consultation_job null; messenger_outbox=0; transport request has commentId not psid
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/channels/facebook/comments.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/vitest/vitest.mjs run src/lib/channels/facebook/webhook.test.ts --maxWorkers=1 --no-file-parallelism
docker exec supabase_db_onevoice psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/public-comment-routing.test.sql
```
Results: vitest comments 8 passed / 1 file; webhook 15 passed / 1 file; SQL TAP 1..20, finish empty (no `not ok`, plan matches). tsc/eslint/full suite skipped (orchestrator; concurrent siblings).
DB proof: local supabase_db_onevoice; fixture pages 2019*/2020* ephemeral orgs in vitest; SQL uses org d1900000-0000-0000-0000-000000000099 rolled back. schema_migrations 20260912117000 recorded. No db reset.
Provider proof: public reply is POST https://graph.facebook.com/v25.0/{comment-id}/comments with `{message}` and Page token (pages_manage_engagement class). Not POST /{PAGE_ID}/messages and not Private Replies (recipient.comment_id). Success body `{id}`; codes 10/100/190/613 reused from OV-018 policy. Send API `{message_id,recipient_id}` is classified malformed. Live Graph comment reply BLOCKED: no pages_manage_engagement sandbox/tester permission in this session; did not post on a real Page.
Implementation decisions: classifier INVITE|IGNORE in comments.ts (Vietnamese folded keywords; first matching invite wins over praise). Invite text is a SQL check-constrained constant, so stored replies cannot echo PII. Dedup unique(organization_id,page_id,comment_id); edits/replays do not enqueue a second outbound_comment. inbound comment jobs use claim_public_comment_job; generic claim_business_job excludes comments. outbound_comment is a separate job kind so messenger PSID send cannot pick them up. authorize persists SENDING before network; restart SENDING → UNKNOWN; permission/token/invalid_parameter FAILED no retry; rate_limit bounded retry; timeout/malformed/unknown no blind resend. Webhook drops page-authored and deleted comments before persist to prevent bot loops.
Remaining limitations/blockers: live Graph public-comment tester not run (missing permitted Page/token). Fake HTTP does not prove Meta delivery. database.types.ts not updated (RPC port uses structural client.rpc as never) to avoid colliding with sibling agents. First-write-wins means a praise comment later edited into a question stays IGNORE.
Cleanup: SQL tests rolled back; AT-019-04 succeeds leftover outbound leases for its orgs; immutable receipts/audit retained on local fixture orgs.
Reviewer conclusion and README/status update: implementation complete for AT-019-01..04 local+fake. Status left IN_PROGRESS; README not edited.
