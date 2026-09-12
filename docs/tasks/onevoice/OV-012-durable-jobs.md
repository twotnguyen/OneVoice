# OV-012 — Hàng đợi bền vững cho nghiệp vụ

## Status

DONE

## Objective

Postgres jobs/outbox với unique dedup key, availableAt, lease owner/expiry, attempts và lỗi chuẩn hóa.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 12 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

File queue chỉ render; chưa inbound/outbound jobs.

## Expected behavior

Postgres jobs/outbox với unique dedup key, availableAt, lease owner/expiry, attempts và lỗi chuẩn hóa.

## Requirements

Atomic claim SKIP LOCKED/RPC, heartbeat, bounded retry/backoff, dead letter, graceful shutdown; giữ file render queue cho tới adapter OV-046; transaction enqueue cùng nghiệp vụ.

## Dependencies

OV-005, OV-009

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/jobs/; src/worker/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không hứa exactly-once với remote publish; reconciliation thuộc OV-037.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Hai workers chỉ một claim; crash/reclaim; vượt retry; clock injection; không lộ body nhạy cảm.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Service-only Postgres queue và4RPC; canonical UUID parser, typed references, fencing token, attempts1–20, backoff5s tăng gấp đôi cap1h, lease60s, attempt tối đa15min. Review phát hiện heartbeat RPC treo: thêm deadline10s cho claim/heartbeat/finish và cooperative abort; chỉ hủy chờ, không hứa hủy remote side effect.12Vitest/29pgTAP local/typecheck/scopedlint pass; scripts/verify-business-jobs-local.ps1 dùng2transactions thật, worker1claim1 giữlock, worker2claim0, fixturescleanup. Reviewer chấp nhận fixes. Types từ local schema, không migration remote. Pump opt-in chưa handler production; enqueue atomic trong RPC nghiệp vụ tương lai, TS enqueue không thay transaction.
