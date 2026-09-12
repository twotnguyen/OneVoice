# OV-010 — Quản lý sản phẩm, giá, ảnh và tồn

## Status

DONE

## Objective

Manager CRUD/disable sản phẩm và variants, specs, giá VND và tồn; hỗ trợ tất cả nhóm máy tính/phụ kiện hiện có.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 10 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Catalog chỉ đọc/import; view đang ưu tiên laptop; ảnh là external URLs.

## Expected behavior

Manager CRUD/disable sản phẩm và variants, specs, giá VND và tồn; hỗ trợ tất cả nhóm máy tính/phụ kiện hiện có.

## Requirements

Lưu tăng version và AI dùng ngay; tiền số nguyên không âm; stock vật lý tách reserved; ảnh URL hiện tại giữ nguyên; xóa logic giữ lịch sử đơn; lọc/paging ở DB.

## Dependencies

OV-007, OV-009

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/catalog/repository.ts; src/app/(app)/products/; src/app/api/products/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không tự biến dữ liệu GearVN thành dữ liệu doanh nghiệp đã xác thực; demo phải ghi nguồn.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Staff ghi bị cấm; conflict hai tab; cập nhật giá thấy ngay; link ảnh lỗi vẫn lưu có cảnh báo, không làm hỏng catalog.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented versioned manager catalog API/UI and local transactional schema. Imported provenance retained; native catalog source identified separately; soft disable removes items from current selection while retaining history.


Execution boundary: thêm management repository riêng nếu giảm ảnh hưởng read/render repository hiện có. Chưa tạo stock reservations (OV-022); quantity hiện tại là physical và unknown giữ null, không đổi in_stock=true thành stock giả. Disable sản phẩm/variant phải loại khỏi lựa chọn AI/Studio qua query/view liên quan; không xóa lịch sử. Provenance import giữ GearVN/demo, manager edits ghi người/thời điểm riêng không tẩy nguồn.

Inventory ruling (engineering default): product có variants thì variant là đơn vị bán/giữ tồn; không cho bán parent bucket song song. Parent physicalquantity là aggregate activevariants (unknown=>null). Product không variants dùng product SKU. OV-022 phải sửa chính mutation catalog010 để không giảm physical dưới reserved, không tạo API cập nhật kho thứ hai né invariant.

Parent integration boundary: manager settings links to /products, preserving existing user navigation edits. Local HTTP verification passed create/replay/conflict, staff denial, fresh price edits and zero-stock normalization; disabled its named fixture afterward, retained immutable history.

Browser verification: created named local keyboard with price250000, physicalstock2 and USB specification; saved version1 then disabled version2 through UI. Source and edit time persisted. Independent review found a concurrent child-ID ownership race in upserts across products; issue remains IN_PROGRESS until conditional ownership update and two-connection regression pass.

Completion: ownership-conditioned image/variant upserts reviewed independently. Parent reran actual two-connection races: both rejected foreign-child updates and rolled back losing product. Parent reran43 focused tests and47SQL assertions; implementation combined64tests, scopedlint and whole-project typecheck passed. Browser and localHTTP evidence above satisfy integration scope. No remote migration or real catalog writes occurred.
