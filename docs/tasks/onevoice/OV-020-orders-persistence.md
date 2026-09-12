# OV-020 — Đơn hàng native và dòng sản phẩm

## Status

DONE

## Objective

Lưu draft/items snapshot price/version, buyer/address, reservation/payment/fulfilment refs, provenance nullable.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 20 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa orders.

## Expected behavior

Lưu draft/items snapshot price/version, buyer/address, reservation/payment/fulfilment refs, provenance nullable.

## Requirements

Totals do server tính; currency VND; snapshot immutable sau checkout; nguồn unknown hợp lệ; PII auth-bound; staff không tự sửa giá bằng payload.

## Dependencies

OV-004, OV-005, OV-009, OV-010

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/orders/repository.ts; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Giao phí mặc định doanh nghiệp cấu hình, thiếu phí không tự bịa; không thêm logistics bên thứ ba.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Atomic items+order; giá biến thể khác; duplicate request; negative quantity; invalid address/phone.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented native draft/order-item storage with authoritative price snapshots, VND totals, explicit workflow ownership, immutable checkout snapshot and atomic audit/idempotency. Independent review accepted scope and reran10 repository tests and56 local SQL assertions. Combined order tests32 pass including existing22 domain tests; typecheck/scoped lint pass.

Boundary: no public API/UI, stock reservation, payment or fulfilment transition is implemented here. Freeze helper is not callable by service-role clients directly; OV-021/022 must invoke it inside an authorized checkout/hold transaction and recheck current facts. Shipping fee remains unknown until explicitly configured; never assumed free.


Inventory ruling (engineering default): product có variants thì variant là đơn vị bán/giữ tồn; không cho bán parent bucket song song. Parent physicalquantity là aggregate activevariants (unknown=>null). Product không variants dùng product SKU. OV-022 phải sửa chính mutation catalog010 để không giảm physical dưới reserved, không tạo API cập nhật kho thứ hai né invariant.

Checkout boundary ruling: OV-020 chỉ cung cấp helper SQL freeze snapshot để OV-021/022 gọi trong cùng transaction với checkout/hold. Có thể giữ trạng thái DRAFT với frozen marker; draft đã frozen không được sửa. Không có route checkout/hold/payment trong OV-020. Phí giao hàng cấu hình theo doanh nghiệp mặc định NULL (chưa biết), không mặc định miễn phí; fee revision phải được chụp và kiểm lại cùng giá/version catalog.
