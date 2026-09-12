# OV-015 — Danh sách yêu cầu và nhận/hoàn tất

## Status

DONE

## Objective

Đếm yêu cầu chưa xong, lọc chờ/đang xử lý, context, nút nhận và hoàn tất; mở ứng dụng gốc để trả lời.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 15 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không có queue nhân viên.

## Expected behavior

Đếm yêu cầu chưa xong, lọc chờ/đang xử lý, context, nút nhận và hoàn tất; mở ứng dụng gốc để trả lời.

## Requirements

Không editor trả lời trong OneVoice; link Meta chỉ khi có URL hợp lệ, fallback hướng dẫn tìm chat; refresh phù hợp, phân trang; message mới hiển thị; manager reassignment audited.

## Dependencies

OV-007, OV-014

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/(app)/support/; src/app/api/support/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không tự suy nhân viên trả lời bên Meta là đã hoàn tất OneVoice.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Overnight persisted; staff khác không hoàn tất; double-click idempotent; không lộ token; UI state conflict refresh.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented scoped queue counts/filtering, conversation history paging/refresh, claim/complete and manager reassignment, with a validated optional Meta inbox link and explicit fallback. No reply composer or external message sending.

Owned validation:13 support tests including actual local REST reads,14 local SQL reassignment assertions, typecheck and scoped lint. Parent browser verified local signed-in manager sees1waiting request and correct message, claims revision2, completes revision3; new-input-only resume notice appears. Claimant display reviewed and improved to Bạn/display name with ID fallback, plus focused regression.

The native Meta inbox URL is optional and not invented from PSID. Live operator navigation/delivery remains a release check; local test support events are synthetic and no customer was contacted.


OV-015 implementation choice (2026-09-12): retain `/support` and `/api/support`. Manager reassignment is a distinct audited operation, never a takeover through the staff claim RPC. A bounded migration adds assignment history and a service-only reassignment RPC with conversation revision CAS, idempotency receipt, fresh manager/assignee scope checks, and unchanged paused status. Previous claimant and claim timestamp are retained in assignment history. This supports recovery from disabled claimants without granting staff reassignment rights.
