# OV-006 — Đăng nhập và phiên nhân viên

## Status

DONE

## Objective

Login/logout Supabase Auth, xác minh user ở server và profile active đúng organization.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 6 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Các trang nội bộ chưa yêu cầu đăng nhập.

## Expected behavior

Login/logout Supabase Auth, xác minh user ở server và profile active đúng organization.

## Requirements

Không tin role từ cookie/client; HttpOnly session với CSRF/origin cho mutation; giới hạn thử login; redirect chỉ nội bộ; không public signup. Account creation/disable UI và audit transaction tách sang OV-048, không thuộc task session.

## Dependencies

OV-005, OV-009

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/auth/session.ts; src/app/login/; src/app/api/auth/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Session phải đọc profile active mới nhất ở server; UI/account lifecycle và invariant manager cuối cùng thuộc OV-048.

## Edge cases

Đọc docs Next đang cài và official Supabase Auth trước viết integration; secret không gửi browser.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Route tests token sai/hết hạn/profile disable; trình duyệt login/logout và session expiry.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Supabase SSR0.12.7 cookie HttpOnly, getUser + fresh active profile, login/logout/session và Proxy refresh.31 auth tests pass; typecheck/scopedlint pass. Local browser login->dashboard, /login authenticated greeting và logout->form verified. scripts/verify-auth-local.mjs passes actual local Auth/HTTP cookie flags/CSRF/safe redirects/disable-existing-session/logout/expired token; disposable fixtures removed, no remote modifications or email. Independent review caught normalized dot-segment open redirect:2RED tests before fix,31GREEN fullauth after; reviewer accepts. ONEVOICE_APP_ORIGIN config and limits documented in deployment guide/.env.example. Existing pages/API guards still OV-007; staff management048.
