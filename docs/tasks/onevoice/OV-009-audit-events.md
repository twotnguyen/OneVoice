# OV-009 — Nhật ký hành động nghiệp vụ

## Status

DONE

## Objective

Append-only audit actor/action/entity/time/reason/correlationId, không raw tokens/PII trong log.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 9 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chỉ có render_events kỹ thuật.

## Expected behavior

Append-only audit actor/action/entity/time/reason/correlationId, không raw tokens/PII trong log.

## Requirements

Ghi mutation cùng transaction khi liên quan đơn/quyền; worker có actor system; view manager lọc/paging; dữ liệu nhạy cảm redacted.

## Dependencies

OV-005

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/audit/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Manager audit view thuộc src/app/(app)/settings/audit/ và src/app/api/audit/, sẽ mở qua session guard OV-006/007 ở task tích hợp; phần OV-009 chỉ API repository và schema, không expose unauthenticated route. View wiring do OV-008 sở hữu.

## Edge cases

Không coi audit best-effort là đủ cho thanh toán; audit không chứa nội dung chat đầy đủ.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Không update/delete audit từ staff; duplicate idempotency key; failure transaction không mất event.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Schema append-only với RLS/grants/triggers; repository idempotency và cursor microsecond, không payload tự do. 12 Vitest tests pass; 18 pgTAP local tests pass; lint/typecheck pass. Independent reviewer chấp nhận; cải thiện test duplicate để dùng primary key mới và assert đúng unique constraint idempotency, chạy lại18/18 pass. Không migration từ xa. Authorization viewer thuộc OV-008; mutation+audit atomic thuộc RPC task nghiệp vụ, standalone append không thay transaction.

Reopened test-only follow-up: local browser settings saves will leave valid audit history. SQL assertions must scope fixture rows rather than assume audit_events globally empty; verify with unrelated audit row inside rollback transaction.

Test isolation regression verified: inserting unrelated existing audit inside rollback gave2fail/18 beforefix; fixture-scopedcounts now18/18pass both withhistoryandstandardpgTAP. No productioncode/schema changed.
