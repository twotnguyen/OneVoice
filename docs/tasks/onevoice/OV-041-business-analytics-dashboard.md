# OV-041 — Dashboard hiệu quả và mục tiêu

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Sửa src/app/(app)/dashboard/, funnel/, src/lib/stats/; tạo src/lib/analytics/business-summary.test.ts; nối src/lib/opportunities/ và scheduler feedback.

### Hợp đồng đầu vào, đầu ra và persistence

Server aggregate từ verified paid orders, attribution039, metrics040, support queue. Response có period/asOf/coverage/unavailable; money VNDinteger. Auto feedback tiêu thụ measured observations, không thay objective/cap manager.

### Trình tự thực hiện

- [ ] Ghi hash/diff user chart/nav trước sửa. Implement DB aggregates phân trang đầy đủ, không total từ capped1000 rows.
- [ ] Thay hardcoded counts/healthy/token-savings fallback bằng measured/unavailable hoặc estimate gắn nhãn; gồm catalog/Studio counters hiện có.
- [ ] UI engagement/messages/paid revenue/unknown attribution/handoff backlog; role-limited fields, loading/empty/error và asOf.
- [ ] Nối deterministic observation-based ranking trong auto mode; sample ít/missing data giữ baseline, không giả causal effect.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-041-01: Fixture hơn1000events totals đúng; paid-only revenue, duplicate IPN/metric không tăng.
- [ ] AT-041-02: No data→empty/unavailable, không3977 hay giả healthy; unavailable không zero.
- [ ] AT-041-03: Unknown attribution vẫn hiện; staff không xem private manager-only data.
- [ ] AT-041-04: Same candidate set, validated observations thay ranking theo documented rule; manager goal/cap không đổi.
- [ ] AT-041-05: Browser reconcile UI totals với SQL fixture và preserve user chart/nav changes.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/analytics/business-summary.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/analytics/business-summary.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Hiển thị content performance, Messenger inquiries, handoff backlog, paid orders/revenue và unknown attribution; manager objective feedback.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 41 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Dashboard có số fallback và funnel savings/token giả định.

## Expected behavior

Hiển thị content performance, Messenger inquiries, handoff backlog, paid orders/revenue và unknown attribution; manager objective feedback.

## Requirements

Tách số thật/demo/estimate; pagination tổng hợp DB; asOf rõ; optimization tiêu thụ observation chứ không tự sửa goal manager.

## Dependencies

OV-027, OV-038, OV-039, OV-040

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/(app)/dashboard/; src/app/(app)/funnel/; src/lib/stats/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Wiring feedback bắt buộc: src/lib/opportunities/ và src/lib/marketing/scheduler.ts tiêu thụ observation đã xác thực từ analytics; không đổi goal manager, không dùng missing metrics như zero. Test observed outcomes đổi ranking/slot trong auto mode, manager constraints vẫn giữ.

## Edge cases

Không ghi đè trend-chart/nav người dùng; giao diện hiện có cần merge cẩn thận.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Reconcile source fixtures, paid-only revenue, no-data view, staff field permissions, scope toàn loại sản phẩm.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.

Measurement cleanup includes catalog/Studio count labels in addition to dashboard/funnel: current local zero-row database still displays hardcoded3,977 and category counts. Replace with scoped measured counts or explicitly unavailable states; do not present missing data as fabricated totals. Preserve user chart/navigation edits.
