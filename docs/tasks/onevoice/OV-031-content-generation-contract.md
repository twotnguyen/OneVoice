# OV-031 — Một lần sinh kịch bản và nội dung đồng nhất

## Status

DONE

## Objective

Template path dùng một GeneratedVideoScript chứa cả content và script; legacy ffmpeg tiếp tục generateContent.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 31 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Template path gọi generateContent rồi generateScript, có thể hai lần AI không thống nhất.

## Expected behavior

Template path dùng một GeneratedVideoScript chứa cả content và script; legacy ffmpeg tiếp tục generateContent.

## Requirements

Caption/hook/CTA/video cùng result và usage; generation fail đúng stage; không gọi generator thứ hai; record scene count/hash khi có.

## Dependencies

Không có phụ thuộc triển khai.

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/render/product-video-pipeline.ts; src/worker/main.ts; src/lib/render/composition-root.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không đổi remote provider/model; giữ API compatibility; discovered telemetry gaps ghi task.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Spies one call, outputs cùng generation, usage đúng; legacy tests pass; generation failure không render.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Template pipeline dùng một GeneratedVideoScript cho content/script/model/usage; sceneCount và SHA256 của JSON script exact được ghi telemetry. TDD red2/green3 regression; toàn bộ3 pipeline files19 tests pass; scoped lint/typecheck pass. Independent review accepted (reviewer kiểm4files48 tests). Không chạy provider hoặc render video thật, vì task chỉ generation contract; FFmpeg legacy được giữ.
