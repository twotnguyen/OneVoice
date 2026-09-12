# OV-040 — Thu thập hiệu quả nội dung

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/analytics/facebook-insights.ts + facebook-insights.test.ts; worker jobs012; migration metric snapshots.

### Hợp đồng đầu vào, đầu ra và persistence

Metric record remoteContentId/name/periodStart/end/value nullable/unit/asOf/providerVersion/availability reason. Unique content+metric+period+provider snapshot semantics; không sum lifetime snapshots như increments.

### Trình tự thực hiện

- [ ] Xác minh current Meta supported metrics/permissions cho post/Reels; capability mapping unavailable cho unsupported/deprecated.
- [ ] Bounded pagination/rate retry with persisted cursor/lease; fetch chỉ Page/content thuộc deployment.
- [ ] Upsert refresh cùng interval; preserve provenance/availability và old snapshot timestamp, không renew freshness khi failure.
- [ ] Expose aggregates cho041, phân biệt lifetime vs period để tránh cộng chồng.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-040-01: Missing/permission/deprecated→null unavailable, explicit provider0→0.
- [ ] AT-040-02: Replay refresh không duplicate; lifetime10 rồi12→12 không22.
- [ ] AT-040-03: 429 retry bounded, cursor restart và partial failure có stale reason.
- [ ] AT-040-04: Timezone/period bounds; actual provider read proof nếu quyền sẵn, thiếu ghi blocker rõ.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/analytics/facebook-insights.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/analytics/facebook-insights.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Lưu views/reach/engagement/click metrics được API cấp với time window/asOf/availability.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 40 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không social metrics ingestion.

## Expected behavior

Lưu views/reach/engagement/click metrics được API cấp với time window/asOf/availability.

## Requirements

Không biến missing thành zero; quyền hết hạn/metric deprecated báo unavailable; counts/upserts theo content-period.

## Dependencies

OV-012, OV-037

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/analytics/facebook-insights.ts`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Xác minh docs Meta trước implementation; không fabricate số liệu demo trong production.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Rate-limit retry; metric thiếu; refresh idempotent; timezone; API version fixtures.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
