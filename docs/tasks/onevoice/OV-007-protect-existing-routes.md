# OV-007 — Bảo vệ API và trang nội bộ hiện có

## Status

DONE

## Objective

Áp guard server cho toàn bộ bề mặt nội bộ, manager-only tạo render; staff read các dữ liệu cần tư vấn.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 7 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Catalog/render/history/dashboard đang truy cập thiếu auth.

## Expected behavior

Áp guard server cho toàn bộ bề mặt nội bộ, manager-only tạo render; staff read các dữ liệu cần tư vấn.

## Requirements

Inventory tất cả route/page/download; public chỉ health rút gọn, webhook có chữ ký, confirmation token; không sửa mất uncommitted layout/nav; 401/403 chuẩn, giới hạn requests tạo render.

## Dependencies

OV-001, OV-006

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/api/products/route.ts; src/app/api/renders/; src/app/api/dashboard/; src/app/api/ready/; src/app/(app)/**/page.tsx; src/app/(app)/layout.tsx; catalog server actions; src/lib/auth/guards.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không chỉ giấu menu; secret key bypass RLS nên guard bắt buộc ở service.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Anonymous không đọc catalog/video nội bộ; staff không POST render; manager được; HEAD/range cũng phải auth.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Inventory5pages+layout,2catalog serveractions,9APIexportsincludingHEAD/range. Guards precede lazy composition; cookie refresh preserved; staff catalog, manager render/analytics/ready. Render origin +per-process5actor/30total/min; health minimal.102tests11files pass; scopedlint/diff pass; independentreview39tests accepts. scripts/verify-auth-local.mjs with ONEVOICE_VERIFY_GUARDS=1 passes actual localHTTP/page/role matrix; fixturescleaned. Original layout dashboardlink+spacer preserved, chart/globals/nav untouched. Whole repository tsc --noEmit also passed after concurrent013types completed.


Pre-implementation review: layout alone is insufficient per installed Next docs; protect every server page/data action and exported route handler before creating service-role composition. Inventory includes video/download HEAD/range and ready diagnostics. Preserve pre-existing layout/nav hunks; no changes to user dashboard chart or globals.
