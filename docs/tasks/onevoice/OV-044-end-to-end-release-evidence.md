# OV-044 — Nghiệm thu luồng OneVoice và bằng chứng cuộc thi

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo tests/onevoice/ hành trình E2E và docs/tasks/onevoice/RELEASE-EVIDENCE.md; cập nhật docs/development/demo-validation-and-scoring.md theo tài liệu cuộc thi hiện có.

### Hợp đồng đầu vào, đầu ra và persistence

Evidence row gồm journey, commit/workspace identifier, fixture/provider mode, steps, expected/actual, timestamp, artifact/log sanitized, result. Release không DONE nếu dependent issue BLOCKED; local fake transport không tính live Meta/VNPay.

### Trình tự thực hiện

- [ ] Lập fixture seed namespace riêng và cleanup không xóa audit gốc; kiểm đủ closure dependencies tracker trước run.
- [ ] Chạy marketing opportunity→campaign→generate→truth→render→publish tester; pause/priority/resume và stale regeneration.
- [ ] Chạy Messenger needs→compare follow-up→confirm→reserve→VNPay sandbox→PREPARING→manual shipping→verified status; overnight handoff→native app→complete→new input only.
- [ ] Ghi failures thành focused issue, không sửa broad scope trong E2E; map demo evidence với tiêu chí cuộc thi, không dựng KPI thiếu dữ liệu.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-044-01: Prompt injection/missing evidence/price drift/no stock/wrong identity/unauthorized staff đều có expected rejection evidence.
- [ ] AT-044-02: Replay webhooks/IPN, crash worker, expired source và ambiguous upload không duplicate effect.
- [ ] AT-044-03: Clean deployment repeat run; tất cả prerequisite gates pass, test skipped/blocker được liệt kê.
- [ ] AT-044-04: Review video/audio screenshot, live tester proof có quyền và sandbox VNPay; không chụp PII/secret.

### Lệnh và bằng chứng

Task vận hành/live: dùng commands/runbook và evidence matrix trong TESTING.md; không thêm unit test giả để thay deployment/provider proof.

## Status

TODO

## Objective

Demo deterministic fixtures và controlled sandbox chạy các hành trình đã chốt; ghi rõ mocks vs live.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 44 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa E2E social -> paid order -> status và auto marketing.

## Expected behavior

Demo deterministic fixtures và controlled sandbox chạy các hành trình đã chốt; ghi rõ mocks vs live.

## Requirements

Marketing chọn -> render -> truth -> publish; customer comparison -> confirm -> VNPay paid -> preparing -> tracking; return handoff overnight -> staff app -> complete; priority pause/resume; repeat fresh installation.

## Dependencies

OV-043, OV-051

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `tests/; docs/tasks/onevoice/; docs/development/demo-validation-and-scoring.md`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Thiếu credentials/quyền không thể DONE live; báo BLOCKED task liên quan với lý do cụ thể, tiếp tục việc độc lập.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Negative cases thiếu evidence, stale price, no stock, webhook duplicates, paused AI, wrong identity, unauthorized staff, upload timeout; đủ acceptance mọi task phụ thuộc.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
