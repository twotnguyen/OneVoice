# OV-018 — Gửi Messenger có kiểm tra trạng thái

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/channels/facebook/messenger.ts và messenger.test.ts; adapter outbox trong src/lib/jobs/ hoặc cùng Facebook module; nối src/worker/business-jobs.ts và receipt OV-017. Thêm migration outbox + supabase/tests/messenger-outbox.test.sql.

### Hợp đồng đầu vào, đầu ra và persistence

Outbox lưu org/Page/PSID, inbound event, conversation revision, loại reply|handoff_ack, payload hash, request key, lease, attempt, remote id và error code đã lọc. Trạng thái dự kiến PENDING→SENDING→SENT|UNKNOWN|FAILED|SUPPRESSED; retry chỉ khi chứng minh chưa nhận. SENT nghĩa API accepted, không tự gán delivered/read.

### Trình tự thực hiện

- [ ] Viết tests state machine và fake transport trước. Xác minh tài liệu Meta hiện hành và ghi version/permission/limits đã đọc; không giả định provider hỗ trợ idempotency key.
- [ ] Transaction tạo outbox duy nhất từ completed eligible candidate; một acknowledgement cho handoff ID. Claim và recheck revision/state/window sát dispatch, serialize với handoff ở cùng điểm quyết định gửi.
- [ ] Persist SENDING trước network. Crash/timeout sau dispatch→UNKNOWN; lỗi rõ ràng chưa accepted mới bounded retry. Token/permission lỗi dừng gửi và hiện trạng thái cho manager.
- [ ] Nối worker, lưu remote id và audit; thêm view lỗi vận hành tối thiểu, không staff composer. Document điểm tuyến tính dispatch: message đã được Meta nhận trước handoff không thể thu hồi; test chặn mọi dispatch được cấp sau handoff.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-018-01: Replay webhook/candidate/restart không tạo hai outbox; hai worker chỉ một dispatch.
- [ ] AT-018-02: Handoff trước authorize send→SUPPRESSED; handoff rồi complete không hồi sinh revision cũ.
- [ ] AT-018-03: ACK bàn giao chỉ một lần; paused hội thoại không gửi câu trả lời thường.
- [ ] AT-018-04: 24h boundary bằng clock fixture; expired token không retry vô hạn; malformed success→UNKNOWN.
- [ ] AT-018-05: Transport accepted nhưng mất response/restart SENDING→UNKNOWN và zero blind resend; trạng thái operator nhìn thấy.
- [ ] AT-018-06: Local DB+fake HTTP toàn worker phải chạy thật; live tester proof cần quyền riêng, thiếu thì ghi blocker, không gọi tin khách thật.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/channels/facebook/messenger.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/channels/facebook/messenger.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Send outbox qua API chính thức một Fanpage, lưu remote id/status; state recheck sát send.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 18 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không có gửi message Meta.

## Expected behavior

Send outbox qua API chính thức một Fanpage, lưu remote id/status; state recheck sát send.

## Requirements

Window/permission Meta kiểm tra theo tài liệu mới; retry 429/5xx có giới hạn; timeout không gửi lặp mù; handoff acknowledgement duy nhất được gửi khi vừa chuyển trước khi im lặng.

## Dependencies

OV-012, OV-017

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/channels/facebook/messenger.ts; src/worker/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Live send chỉ trong kịch bản kiểm thử được phép; không tự nhắn khách thật để thử.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Pause race sau generation; duplicate webhook; token hết hạn; window hết; network outcome unknown giữ reconciliation.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.


Integration contract: outbound intent records originating message and conversation revision. Recheck current state AND matching revision before side effect: a handoff followed by completion must not revive an old generated reply. Message eligibility excludes staff-handled windows. Unknown send outcomes require reconciliation rather than blindretry; local fixtures do not establish real Meta delivery.

Provider research (2026-09-12): official [Meta Send a message](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages), updated2026-08-11, read through browser after web fetch429. Text replies use POST /PAGE_ID/messages, recipient.id=PSID, messaging_type=RESPONSE; successful response includes recipient_id/message_id. Standard window is24hours. App needs Page access token and pages_messaging. The page's sample API version isv26.0. CONFIRMED_EVENT_UPDATE, ACCOUNT_UPDATE and POST_PURCHASE_UPDATE tags now return code100 from2026-04-27; Human Agent is for manual business responses, not AI. Error examples include10permission,100parameter,190token,551unreachable,613rate limit. Delivery/read require separate webhook subscriptions.

Implementation choice: restrict MVP automated replies to verified private-conversation activity within24hours, even when broader platform entry points might qualify. No automated Human Agent tag or out-of-window workaround. Native-app staff handling stays unchanged. Token/permission failure and ambiguous network outcome must remain explicit operator-visible states. Verify the Send API reference before coding byte/character bounds and retry classification; this research does not establish live delivery or support for provider idempotency keys.

Reference-page limitation: official linked Send API reference rendered navigation only in the browser during this research; do not infer an idempotency-key contract or text limit from that empty page. Resolve through a current primary reference during implementation, or explicitly choose a conservative application bound and retain UNKNOWN rather than blind retry for ambiguous sends.
