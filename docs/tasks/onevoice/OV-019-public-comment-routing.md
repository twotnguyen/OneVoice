# OV-019 — Bình luận quan tâm mời nhắn Messenger

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/channels/facebook/comments.ts + comments.test.ts; dùng webhook/backend OV-013 và outbox OV-018; SQL dedup keyed Page+comment ID.

### Hợp đồng đầu vào, đầu ra và persistence

Classifier chỉ trả INVITE|IGNORE. Nội dung cố định tiếng Việt mời nhắn Messenger, không đưa giá, chính sách, PII. Public-comment reply adapter riêng, không tái sử dụng PSID endpoint sai mục đích; comment không mở private messaging window.

### Trình tự thực hiện

- [ ] Parse feed/comment event đã xác minh chữ ký/Page; bỏ Page self echo, deleted/unsupported event và reply do chính bot tạo.
- [ ] Tạo bộ fixture tiếng Việt praise/question/service request/spam; output model không được trở thành free-form public reply.
- [ ] Persist disposition và invitation outbox theo comment identity; edit/replay không tạo chuỗi trả lời mới.
- [ ] Nối worker với API public comment đã xác minh; dùng cùng chính sách ambiguous network của018, không tự private-message người bình luận.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-019-01: 'xịn quá', 'sản phẩm tốt lắm'→IGNORE; 'giá bao nhiêu', 'còn hàng không', yêu cầu bảo hành→INVITE.
- [ ] AT-019-02: Comment chứa số điện thoại/địa chỉ: reply không phản chiếu dữ liệu đó.
- [ ] AT-019-03: Self echo và duplicate/edit event→tối đa một reply; thiếu quyền/unknown→không retry mù.
- [ ] AT-019-04: Actual local signed ingress→disposition→fake public transport; chứng minh không tạo private consultation window.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/channels/facebook/comments.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/channels/facebook/comments.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

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

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Các ví dụ người dùng: xịn quá/tốt lắm ->ignore; giá bao nhiêu/còn hàng ->invite; bảo hành ->invite; replay.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
