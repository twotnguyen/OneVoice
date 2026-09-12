# OV-001 — Quyền nghiệp vụ theo vai trò

## Status

DONE

## Objective

Cung cấp canPerformBusinessAction(role, action): boolean, nhận unknown ở biên và từ chối giá trị không hợp lệ.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 1 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa có kiểm tra quyền nghiệp vụ dùng chung.

## Expected behavior

Cung cấp canPerformBusinessAction(role, action): boolean, nhận unknown ở biên và từ chối giá trị không hợp lệ.

## Requirements

manager được đọc vận hành, xử lý yêu cầu, cập nhật đơn/giao hàng/bảo hành, quản lý catalog/chính sách/AI/marketing/tài khoản; staff chỉ đọc dữ liệu cần hỗ trợ và cập nhật đơn/giao hàng/bảo hành, nhận/hoàn tất yêu cầu; không có vai trò marketing riêng.

## Dependencies

Không có phụ thuộc triển khai.

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/business/permissions.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không có tài khoản vẫn bị từ chối; module này chưa thay thế kiểm tra phiên ở API.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Toàn bộ ma trận manager/staff; role/action lạ, null và tên prototype đều bị từ chối.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented src/lib/business/permissions.ts và permissions.test.ts. Strict allowlist 13 actions, manager/staff; unknown/prototype inputs denied without coercion. TDD red: missing module; green: 91 tests. Targeted ESLint --max-warnings=0, pnpm typecheck và diff check exit 0. Independent review accepted. Scope chỉ policy thuần, chưa session/route enforcement (OV-006/007).
