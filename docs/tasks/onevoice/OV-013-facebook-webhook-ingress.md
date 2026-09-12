# OV-013 — Nhận webhook một Fanpage

## Status

DONE

## Objective

GET verify token; POST raw-body HMAC app secret; chỉ Page ID cấu hình; lưu event dedup và trả nhanh.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 13 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa có Meta adapter.

## Expected behavior

GET verify token; POST raw-body HMAC app secret; chỉ Page ID cấu hình; lưu event dedup và trả nhanh.

## Requirements

Không xử lý AI trong HTTP webhook; hỗ trợ batched messaging/comments, message echoes và attachment; token log redaction; ack sau persist; body size limit.

## Dependencies

OV-012

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/channels/facebook/webhook.ts; src/app/api/webhooks/facebook/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Xác minh docs Meta hiện hành; thiếu Meta app secret/Page token là blocker live, fake event chỉ test.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Chữ ký sai/thiếu, Page lạ, duplicate/out-of-order, malformed body, echo không trả lời vòng lặp.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented raw-byte HMAC, configured-Page validation, bounded normalization, transactional event/job deduplication and echo suppression. Verified 18 Vitest tests including concurrent signed HTTP requests through actual local Supabase REST; 15 pgTAP assertions; scoped ESLint and whole-project TypeScript pass. Review regressions cover delivery timestamp independent deduplication and PostgreSQL JSONB byte expansion before persistence.

Limits: no live Page subscription or customer messages tested; see OV-051. Feed events without source action timestamps retain null action time; identical repeated changes without a provider event identifier cannot be distinguished reliably. HTTP deadline is 4 seconds; uncertain persistence returns retryable failure.


## Verified provider contract and execution boundary

Đã đọc Meta official qua browser ngày2026-09-12: https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks (updated May5,2026) và https://developers.facebook.com/docs/graph-api/webhooks/getting-started/. GET token challenge; POST X-Hub-Signature-256 trên raw bytes, không stringify parsed JSON. Messenger ACK<=5s; persist+enqueue trước ACK, bound storage wait để retry khi chưa chắc commit. Timestamp cho out-of-order, dedup provider IDs. Standard Access chỉ app-role testers; customers cần Advanced Access/App Review. Code mẫu GitHub cũ SHA1/20s không là chuẩn hiện tại.

Task này xác minh adapter+SQL integration local với payload theo contract; live Page proof tách OV-051 (release bắt buộc), không tuyên bố đã kết nối Meta thật từ fixtures. Có thể thêm migration inbound event + transaction enqueue vì jobentity reference cần bền vững; AI/handoff/conversation projection thuộc OV-014/017.
