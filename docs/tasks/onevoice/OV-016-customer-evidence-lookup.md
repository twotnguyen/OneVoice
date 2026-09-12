# OV-016 — Tra cứu evidence nội bộ cho AI

## Status

DONE

## Objective

Structured tools tìm sản phẩm theo nhu cầu/specs/giá và so sánh nhiều sản phẩm; policy/promotion active; evidence refs/version/asOf.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 16 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Snapshot render chỉ 8 facts; chưa lookup tư vấn.

## Expected behavior

Structured tools tìm sản phẩm theo nhu cầu/specs/giá và so sánh nhiều sản phẩm; policy/promotion active; evidence refs/version/asOf.

## Requirements

Tra CSDL và phiên bản tri thức active từ OV-050; mỗi claim gắn source/version/asOf, thông số phải đúng sản phẩm; nguồn cấu hình không đồng nghĩa mọi URL khách gửi đáng tin. Giá/tồn/trạng thái dùng dữ liệu vận hành; mâu thuẫn/hết hạn trả missing, không web fallback tùy ý; lọc stock thật khả dụng; tham số allowlist và giới hạn; không đưa raw import payload/prompt instructions vào system.

## Dependencies

OV-010, OV-011, OV-050

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/consultation/evidence.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không công bố giá website bên ngoài; AI hỏi lại nhu cầu thiếu thay vì handoff ngay.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Không có dữ liệu trả missing; SKU mismatch; promotion hết hạn; query độc hại; so sánh mỗi claim có đúng product/version.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented structured read-only evidence lookup and service-only RPC109000; final review and validation recorded below.


Implementation evidence: exact product/variant/SKU comparison, bounded literal search, canonical policies/programs and current mapped descriptive source excerpts all carry provenance/asOf. Parent independently ran12unit/actual-local-REST tests and24SQL assertions PASS; owner whole typecheck and scoped lint PASS. No live AI/customer messaging, writes to operational data or arbitrary URL fetches.

Review fixes: invalid physical quantities cannot verify availability; any malformed/oversized specification set is incomplete and cannot supply verified specification facts/filter matches, including a hidden101st conflicting value and21st variant option. Policy conflicts are withheld; simultaneous promotions stay separate. Read-only physical stock is not a reservation promise. Client6s abort bounds waiting; server cancellation is not proven by function-level statement_timeout (deployment enforcement tracked043). Details in src/lib/consultation/EVIDENCE.md.
