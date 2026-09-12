# OV-042 — Sửa lỗi kiểm thử và môi trường render

## Status

DONE

## Objective

Phân loại code defect vs missing prerequisites; portable path tests; durationSeconds assertions; sửa React refs/effect theo docs.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 42 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Baseline trước: typecheck pass; lint fail; test fail do binaries/path/font và assertion cũ.

## Expected behavior

Phân loại code defect vs missing prerequisites; portable path tests; durationSeconds assertions; sửa React refs/effect theo docs.

## Requirements

Không skip lỗi sản phẩm để xanh; kiểm binaries trước E2E có thông báo prerequisite; lint fixes không thay hành vi; bảo toàn dirty files.

## Dependencies

Không có phụ thuộc triển khai.

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/render/types.test.ts; src/lib/render/runtime-composition.test.ts; src/lib/video/template-pipeline/templates.test.ts; src/app/(app)/studio/; docs/development/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Tách thêm issue nếu lỗi renderer khác phạm vi; không cài binary nguồn lạ mù.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

pnpm typecheck/lint và targeted tests cho source/test corrections; ghi platform/binaries chính xác. Full suite FFmpeg/fonts/worker E2E được tách sang OV-047 sau khi phát hiện fixtures POSIX cần container Linux. Không skip tests hoặc tuyên bố full suite xanh từ task này.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Sửa expectations durationSeconds/path Windows theo runtime hiện hành; sửa React render refs/loading, scrollbar accessibility và Next Image. Review phát hiện thumbnail mất scoped CSS; đã thêm inline contain/size và reviewer chấp nhận. Baseline targeted TDD: 4 lỗi trước sửa, 9/9 pass sau sửa. Combined 12 files 239 tests pass; full project ESLint và typecheck pass. Docker snapshot mới nhất cũng đã qua typecheck/lint. Full FFmpeg/worker E2E thuộc OV-047, chưa dùng kết quả targeted để tuyên bố full suite. Giữ nguyên các thay đổi ban đầu của người dùng.
