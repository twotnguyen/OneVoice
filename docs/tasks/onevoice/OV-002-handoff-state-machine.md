# OV-002 — Quy tắc chuyển người và dừng AI

## Status

DONE

## Objective

Hàm chuyển trạng thái thuần cho AI_ACTIVE, WAITING_STAFF, STAFF_ACTIVE; kiểm tra quyền bằng OV-001.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 2 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa có trạng thái hội thoại/handoff.

## Expected behavior

Hàm chuyển trạng thái thuần cho AI_ACTIVE, WAITING_STAFF, STAFF_ACTIVE; kiểm tra quyền bằng OV-001.

## Requirements

Tạo yêu cầu dừng AI ngay; policy_question không tạo handoff; return_request/warranty_request/customer_requested/missing_evidence/lookup_failed tạo handoff; nhận phải có actor; chỉ người nhận hoặc manager hoàn tất; hoàn tất trả AI_ACTIVE; yêu cầu lặp không tạo bản sao.

## Dependencies

OV-001

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/conversations/handoff.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Message đến trong khi chờ chỉ lưu; mất phiên không tự bật AI; persistence/concurrency thuộc OV-014.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Chờ chưa nhận và đang nhận đều không cho AI; nhận hai lần bởi người khác bị từ chối; hoàn tất sai người/sai trạng thái; không sửa object đầu vào.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Pure handoff module và tests đã triển khai; AI dừng từ WAITING_STAFF, claim/complete kiểm role và ownership. TDD red missing module; 29 tests green, scoped lint/typecheck pass; independent review accepted. Chưa DB/channel integration.
