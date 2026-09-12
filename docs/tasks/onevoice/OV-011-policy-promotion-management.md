# OV-011 — Quản lý chính sách và chương trình

## Status

DONE

## Objective

Manager CRUD chính sách đổi trả/bảo hành và khuyến mãi có phạm vi sản phẩm, ngày hiệu lực, version.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 11 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Promotions có import, chưa policy CRUD.

## Expected behavior

Manager CRUD chính sách đổi trả/bảo hành và khuyến mãi có phạm vi sản phẩm, ngày hiệu lực, version.

## Requirements

Lưu dùng ngay không duyệt; hết hạn không tư vấn như đang có; chính sách chỉ là evidence, không tự phê duyệt yêu cầu; plain text sanitized.

## Dependencies

OV-007, OV-009

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/knowledge/; src/app/(app)/knowledge/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Dịch vụ tổng quát qua nội dung doanh nghiệp; không mở workflow đặt lịch dịch vụ mới.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Hiệu lực đúng timezone và biên; chồng chương trình không cộng dồn tự ý; staff forbidden; lịch sử phiên bản còn.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented manager policy/service/promotion management using existing promotion truth, explicit global/product scope, immutable version history and atomic audit. Imports remain product-scoped unless explicitly edited, and provenance is preserved. Fresh evidence excludes disabled/expired entries and presents overlapping offers separately.

Independent review accepted scope;16 focused tests (including date conversion),28 SQL assertions, actual local REST evidence script, typecheck and scoped lint pass. Parent HTTP runner verified global program and policy create/replay/conflict/history/disable. Browser created policy version1, selected09:00 +07:00 boundaries and disabled version2; local database confirmed02:00 UTC storage, correct expiry and disabled status.

Date/time picker replaced raw ISO entry after UI review. Fixed UTC-offset selection defaults+07:00 and changes display without altering stored instants. No automatic warranty/return approval or discount aggregation added.


Pre-implementation scope: reuse existing promotions/product_promotions data rather than competing independent promotion truth. Preserve imported provenance; add policy/general service information storage and version history. Explicit UTC instants at storage boundaries, inclusive start/exclusive expiry; UI displays and edits with explicit timezone/offset. Overlapping offers are presented separately; this task does not calculate discounts or approve returns/warranties. Soft disable retains version history. Add manager API and discoverable knowledge screen with authorized read-only evidence port for OV-016.
