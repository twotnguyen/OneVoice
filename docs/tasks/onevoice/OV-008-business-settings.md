# OV-008 — Cấu hình doanh nghiệp và thương hiệu

## Status

DONE

## Objective

Một business settings của bản cài đặt: tên, giọng điệu, chủ đề cho phép/cấm, timezone, lịch và mục tiêu marketing.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 8 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Cấu hình env hardcode, chưa thiết lập thương hiệu.

## Expected behavior

Một business settings của bản cài đặt: tên, giọng điệu, chủ đề cho phép/cấm, timezone, lịch và mục tiêu marketing.

## Requirements

Manager sửa/lưu version có optimistic lock và audit; runtime đọc bản mới; không đưa API tokens vào JSON UI; giờ đăng tự động hoặc daily cap/windows; mục tiêu engagement/messages/paid-orders/mixed.

## Dependencies

OV-003, OV-007, OV-009

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/business/settings.ts; src/app/(app)/settings/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Bao gồm wiring manager audit viewer tại src/app/(app)/settings/audit/ và authenticated src/app/api/audit/ dùng repository OV-009, có paging và redaction.

## Edge cases

UI giải thích mode bằng tiếng Việt; secrets nằm cấu hình triển khai riêng.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Staff POST bị chặn; timezone sai; cap invalid; version conflict; setting mới dùng ở request kế tiếp.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented manager settings and read-only audit surfaces, optimistic revision and request receipts with atomic audit in local PostgreSQL. Independent review accepted concurrency and permission boundaries; follow-up removes unrelated AI configuration dependency before completion.

Validation: 19 unit/route tests and 17 pgTAP tests; independent overlapping transactions proof; whole-project typecheck and scoped lint passed. Parent local HTTP runner verified staff denial, save/replay/stale-revision rejection, audit event and both pages. Actual browser login -> settings -> save revision3 -> restore original values revision4 -> audit rows verified. Tests use local-only disposable users, never remote business data. New journal entries intentionally remain append-only.

Technical defaults: revision0 OneVoice, polite factual voice, no topic entries, Asia/Ho_Chi_Minh (canonical timezone alias accepted), automatic goal selection, constrained timing with one post/day and09:00–17:00, mixed objective. Limits1–30 posts/day and1–7 non-overlapping same-day windows are engineering defaults. Mixed stores preference without inventing numeric weights. Consumers must read fresh settings per decision; scheduling/resume belongs later tasks.

Pre-implementation ruling: settings store current desired modes/brand; saving settings must not silently resume PAUSED automation (persistent campaign state/control belongs030/038). Missing settings gives explicit defaults/version0, automation remains setup-gated. Audit viewer is read-only manager UI over009, not a second audit schema. Defaults, numeric limits and mixed objective weights must be documented as engineering choices.

Completion evidence: unrelated AI dependency removed through backward-compatible data-only Supabase client and regression tests. Header/audit labels reviewed again in actual browser. 23 focused tests reported by implementation, parent reran21 settings/route/client tests; whole-project TypeScript passed after concurrent conversation types landed. Settings values restored and disposable UI Auth user removed; local audit history retained.
