# OV-005 — Lưu tài khoản nhân viên và quyền

## Status

DONE

## Objective

Migration bổ sung staff_profiles liên kết auth.users và organization hiện hành, active, role; không cổng tenant/signup.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 5 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chỉ có organizations/catalog; service key toàn quyền, chưa membership.

## Expected behavior

Migration bổ sung staff_profiles liên kết auth.users và organization hiện hành, active, role; không cổng tenant/signup.

## Requirements

RLS không cho self-escalation; actor do server xác minh; admin bootstrap tài khoản manager qua thao tác quản trị có tài liệu, không mật khẩu mặc định; không reset/xóa catalog; SQL policies thu hồi quyền public mặc định.

## Dependencies

OV-001

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `supabase/migrations/; src/lib/auth/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không tự áp migration vào DB từ xa; thiếu local runtime ghi BLOCKED validation, không đánh DONE bằng đọc SQL.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Local Supabase: manager/staff/anon/disabled, sửa role bị từ chối; migration từ bản hiện hành giữ counts catalog.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Additive staff_profiles migration + bootstrap docs, local-only SQL tests. TDD absent table red;17 role/grant/RLS tests pass via supabase test db;3 exact catalog preservation assertions pass via verify-staff-upgrade.ps1 (transaction rollback). Independent schema review accepted; service mutation coverage and upgrade proof added per review. Local migration history repaired to applied after manual local application. No remote migration or credentials changed. Profile-table only: login/session/route guards remain OV-006/007.
