# OV-051 — Kiểm chứng nhận sự kiện Fanpage thật

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Đọc docs/deployment/ và src/lib/channels/facebook/webhook.ts; chỉ cập nhật issue/live evidence và setup instructions. Không cần sửa adapter nếu chưa có failing regression.

### Hợp đồng đầu vào, đầu ra và persistence

Đây là kiểm chứng external environment, vẫn BLOCKED tới khi operator cung cấp đúng Page/app/HTTPS/permissions. Không tự mở tunnel hoặc sửa subscription/Page khác để lách blocker.

### Trình tự thực hiện

- [ ] Inventory tên config cần thiết, không in giá trị; xác nhận callback HTTPS và app/Page matching deployment bằng operator evidence.
- [ ] Operator verify callback và gửi tester message; quan sát ACK/event/job timestamp và dedup trong DB, lưu sanitized IDs.
- [ ] Kiểm native Meta inbox link/context cho đúng người nhận; generic PSID fallback không phải proof đã mở đúng chat.
- [ ] Phân biệt tester Standard Access và quyền phục vụ khách thật; ghi blocker chính xác và unblocking evidence thay vì đánh dấu DONE từ fixture.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-051-01: Wrong verify token→denied; valid Meta challenge success; actual tester event đúng Page→một event/job.
- [ ] AT-051-02: Meta redelivery→no duplicate event; callback ACK dưới provider deadline đã xác minh.
- [ ] AT-051-03: Không log secret/message PII; không tự outbound message/post trong issue này.
- [ ] AT-051-04: Native staff handoff operator xác nhận đúng thread; actual customer permission state được ghi rõ.

### Lệnh và bằng chứng

Task vận hành/live: dùng commands/runbook và evidence matrix trong TESTING.md; không thêm unit test giả để thay deployment/provider proof.

## Status

BLOCKED

## Objective

Xác minh callback HTTPS và Meta app/Page subscription thực tế trước release.

## Context

Tách live environment evidence khỏi adapter OV-013 để không đánh đồng local fixtures với kết nối thật. Không gửi tin hoặc sửa Page của người dùng trong test khi chưa có ủy quyền cụ thể.

## Current behavior

Chưa thấy cấu hình Meta app secret, verify token và Page ID trong env đã kiểm tra; quyền app/subscription chưa kiểm chứng.

## Expected behavior

Meta xác minh callback thành công; sự kiện tester gửi đến Page được nhận một lần, đúng Page, có timestamp; secrets không xuất hiện trong logs/evidence.

## Requirements

HTTPS hợp lệ, credentials cài riêng ngoài repository, Page/app đúng deployment. Xác minh Standard Access tester và Advanced Access/App Review cho khách thật; lưu kết quả che định danh/tin nhắn. Không coi CLI fixture ký bằng secret giả là live proof. Missing account/permissions là blocker, không mở ngầm public tunnel hoặc dùng Page khác.

## Dependencies

OV-013

## Edge cases

Token sai, Page không subscribe, app chưa approved, retry/duplicate, callback quá5s, rollback subscription do delivery failures.

## Acceptance criteria

- [ ] Callback/permissions verified cho Page được chỉ định.
- [ ] Live incoming fixture do tester thực hiện được persist và dedup.
- [ ] Logs/evidence không chứa credentials hoặc nội dung khách thật.

## Testing

Meta dashboard verification và tester event, kiểm DB event/job và ACK timing. Không gửi messages/posts tự động để thử trong issue này.

## Implementation decisions and evidence

BLOCKED: thiếu cấu hình/quyền Meta và HTTPS callback được xác nhận. Tiếp tục các task local độc lập. Nguồn: Meta Messenger Webhooks official, cập nhật May5,2026, đã đọc Sep12,2026.

Live operator check: verify staff can identify the correct native Meta conversation from configured inbox link and OneVoice context. A generic inbox link or PSID fallback alone is not proof of successful handoff to the actual customer. Record sanitized operator evidence without publishing customer messages.
