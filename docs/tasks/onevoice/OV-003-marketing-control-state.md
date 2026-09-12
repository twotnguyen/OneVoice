# OV-003 — Quy tắc tạm dừng và ưu tiên marketing

## Status

DONE

## Objective

Trạng thái thuần RUNNING/PAUSED, với yêu cầu ưu tiên độc lập.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 3 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa có lịch hay điều khiển marketing tự động.

## Expected behavior

Trạng thái thuần RUNNING/PAUSED, với yêu cầu ưu tiên độc lập.

## Requirements

Chỉ manager pause/resume/requestPriority; requestPriority luôn PAUSED; kết thúc hoặc lỗi yêu cầu ưu tiên không tự resume; resume chỉ khi không còn priority đang xử lý; mode tự chọn mục tiêu và mode mục tiêu chỉ định độc lập với mode giờ đăng tự động/giới hạn.

## Dependencies

OV-001

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/marketing/automation-control.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Pause không thu hồi bài đã đăng; worker phải kiểm tra lại trước publish trong OV-037.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

Trong PAUSED chỉ cho phép job mang đúng active priority ID (do manager yêu cầu). Ordinary scheduled job luôn bị chặn. Hoàn tất/lỗi priority xóa active ID nhưng vẫn PAUSED. Hàm eligibility kiểm job kind/id để scheduler và publisher dùng chung.

## Testing

Staff không đổi trạng thái; ưu tiên xong/lỗi vẫn PAUSED; yêu cầu lặp cùng id idempotent; ưu tiên khác khi đang chạy trả conflict.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented immutable automation-control module, canonical manager guards, explicit active priority exception and independent modes. TDD red missing module; 40 tests pass; scoped lint/tsc pass; independent review accepted. Completion/failure stays PAUSED. Persistence and authenticated job scope remain integrations.
