# OV-026 — Nhân viên cập nhật tiến độ bảo hành

## Status

DONE

## Objective

Staff tạo case gắn order/item sau xử lý yêu cầu, trạng thái RECEIVED/INSPECTING/IN_SERVICE/READY/COMPLETED và ghi chú hiển thị khách.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 26 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không warranty cases.

## Expected behavior

Staff tạo case gắn order/item sau xử lý yêu cầu, trạng thái RECEIVED/INSPECTING/IN_SERVICE/READY/COMPLETED và ghi chú hiển thị khách.

## Requirements

AI chỉ lookup progress, không tạo/duyệt case theo khách; không lẫn private notes vào response; history timestamps.

## Dependencies

OV-007, OV-009, OV-020

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/warranty/; src/app/(app)/warranty/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Yêu cầu bảo hành Messenger vẫn handoff dù đã có case.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Order/item mismatch; case ngoài order; update version conflict; trạng thái invalid.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Eligibility ruling: staff/manager chỉ tạo hồ sơ cho order item cùng doanh nghiệp thuộc đơn PAID + DELIVERED, snapshot đã frozen. Đây là điều kiện kỹ thuật để theo dõi hồ sơ sau khi nhân viên xử lý yêu cầu, không tự xác nhận quyền lợi hay thời hạn bảo hành. Không tạo đơn giao thành công từ UI bảo hành.

Progress ruling: RECEIVED → INSPECTING → IN_SERVICE → READY → COMPLETED; cho phép cập nhật ghi chú tại cùng trạng thái, không nhảy bước hoặc mở lại trạng thái cũ. Ghi chú cho khách và nội bộ lưu riêng. Customer reader chỉ đọc theo organization + conversation đã được trusted adapter xác minh + order; không có public route hay AI mutation. Yêu cầu bảo hành Messenger vẫn phải handoff. Lịch sử lưu bất biến đầy đủ; detail hiển thị 100 phiên bản gần nhất, danh sách phân trang 20 hồ sơ. Không gửi tin nhắn hay thông báo tự động.


Parent review: schema/API/UI permissions, idempotency, order eligibility, transitions and private/public projection reviewed. Scoped SQL fixture counts fixed; 37 assertions pass with retained local UI case present. 14 Vitest tests pass (combined network/warranty48). Actual browser staff login → eligible paid/delivered synthetic item → create RECEIVED v1 → INSPECTING v2 → two history entries → logout verified. Disposable Auth user removed; disabled synthetic product/order/case and immutable history retained only in local DB. No real payment, customer message or warranty eligibility approval occurred.
