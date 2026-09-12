# OV-014 — Lưu hội thoại và hàng chờ hỗ trợ

## Status

DONE

## Objective

Khóa theo Page+PSID; message/event unique; request, claimant, timestamps, version và trạng thái bền vững.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 14 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa lưu tin nhắn/handoff.

## Expected behavior

Khóa theo Page+PSID; message/event unique; request, claimant, timestamps, version và trạng thái bền vững.

## Requirements

Inbound lock để tạo handoff+pause atomic; append khách nhắn khi chờ; complete có CAS; không gộp danh tính công khai với PSID khi thiếu bằng chứng.

## Dependencies

OV-002, OV-009, OV-013

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/conversations/repository.ts; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Phân biệt policy với yêu cầu thật qua classifier OV-017; attachment chưa đọc được đưa nhân viên khi cần.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Webhook replay không thêm request; hai người claim chỉ một; message đến sau pause không tạo send job; restart giữ queue.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented durable conversation/message/handoff persistence and service-only RPCs with atomic pause, staff transitions, request receipts and audit. Parent review found delayed backlog eligibility risk; fixed with durable suppression and staff-completion receipt-time cutoff before acceptance.

Parent reran35 local SQL assertions,34 conversation tests, and actual overlapping claim transactions: second claimant blocks while first holds row. Separate SQL tests prove stale revision cannot claim afterward and audit failures roll back state. Scoped lint and whole-project TypeScript passed before final SQL-only cutoff update; concurrent knowledge implementation may have temporary unrelated errors.

Boundary: explicit projection handler remains opt-in; no classifier, send jobs or staff UI yet. OV-017 must consume aiEligible as reply permission, not a history filter, with durable decision receipts; OV-018 must fence sends by conversation revision. Resume only newly received input after staff completion, never old backlog. Pure schema/persistence completion does not claim Facebook customer support is live.
