# OV-028 — Thu thập xu hướng có nguồn

## Status

DONE

## Objective

Adapters nguồn công khai/API được phép và RSS có timestamp, URL, topic, freshness, dedup; phân biệt tín hiệu xã hội với tin tức.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 28 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa nguồn xu hướng.

## Expected behavior

Adapters nguồn công khai/API được phép và RSS có timestamp, URL, topic, freshness, dedup; phân biệt tín hiệu xã hội với tin tức.

## Requirements

Không tuyên bố RSS là số liệu trending Facebook; provider capability/status rõ; TTL cấu hình; text external untrusted; không lấy facts catalog từ trend.

## Dependencies

OV-008, OV-012, OV-052

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/trends/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không scraping vượt đăng nhập/quyền; nguồn xã hội thiếu API được báo unavailable và ghi gap.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Nguồn lỗi/hết hạn/duplicate, content injection, không có nguồn -> không bịa trend.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.


Execution note: provider design/official documentation reviewed; implementation resumes after extracted shared transportOV-052. No completed provider capability claimed yet.

Implemented and independently reviewed: configured public Mastodon instance tags and RSS/Atom headlines, strict source bounds, untrusted provenance, publication/metric-day TTL, unknown dates excluded from eligibleEvidence. No Facebook trend claim or default source. Atomic snapshots/receipts and content dedup in migration105000. Runnable one-shot operator `node src/lib/trends/run.mjs --local` explicitly uses local Supabase, never loads .env; unconfigured and real public-source smoke both verified by owner. Parent reran14 offline tests and19 local SQL assertions. Owner additionally ran public transport and actual REST/concurrent-receipt proofs; scoped lint passed. Auto refresh orchestration remains upcoming campaign/scheduler tasks, not claimed here.
