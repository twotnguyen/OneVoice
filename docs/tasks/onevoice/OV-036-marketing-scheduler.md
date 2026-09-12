# OV-036 — Chọn giờ và số lượng đăng

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/marketing/scheduler.ts + scheduler.test.ts; nối campaign control/slots030, business jobs012, generation053 và render046. SQL schedule claim/dedup có local tests.

### Hợp đồng đầu vào, đầu ra và persistence

tick(org, now) dùng DB clock và persisted control revision; output persisted slot/job decisions, không network publish trực tiếp. Có automatic timing hoặc manager windows/cap; mục tiêu độc lập. Cap tính slot reservations để hai worker không vượt.

### Trình tự thực hiện

- [ ] Viết pure time/window/cap selector với timezone từ settings; chọn bounded defaults kỹ thuật có config, không gọi là quyết định người dùng.
- [ ] Transaction claim due slot chỉ campaign nonterminal/current control; PAUSED chặn ordinary, matching priority vẫn eligible; FAILED campaign không chạy slot PLANNED cũ.
- [ ] Nối053→046→ready cho037. Retry/repair tối đa có cấu hình; stale nguồn regenerate hoặc SKIPPED với tối đa một replacement liên kết, không vòng vô hạn.
- [ ] Persist decision reason/source revisions; crash resume từ receipts; không tự bật RUNNING khi priority hoàn tất/lỗi.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-036-01: Hai ticks đồng thời không trùng slot/job hoặc vượt daily cap; boundary midnight/timezone và DST config.
- [ ] AT-036-02: PAUSED ordinary không chạy; đúng priority được chạy; ưu tiên hoàn tất vẫn PAUSED.
- [ ] AT-036-03: Expired promo/stock0→skip/replacement bounded; changed price→new content version.
- [ ] AT-036-04: Crash giữa generate/render/schedule resumes; terminal campaign không chạy; timeout chưa rõ outcome không tạo publication khác.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/marketing/scheduler.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/marketing/scheduler.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Chọn slots tự động hoặc cap/windows manager, timezone; workers claim slot một lần.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 36 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không scheduler.

## Expected behavior

Chọn slots tự động hoặc cap/windows manager, timezone; workers claim slot một lần.

## Requirements

Chạy khi RUNNING; dữ liệu ít dùng cadence fallback cấu hình, không bịa optimization; missed slots không burst spam; priority chỉ riêng job; stale rebuild/skip tạo slot mới.

## Dependencies

OV-012, OV-030, OV-032, OV-035

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/marketing/scheduler.ts; src/worker/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Giới hạn retry regenerate theo slot tránh vòng lặp vô hạn; skip reason audit.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

DST/timezone midnight, restart duplicate, cap, paused, no content, priority complete vẫn pause.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.


Integration review fromOV-030: slot eligibility must also require a nonterminal owning campaign and current control/priority revision. A PLANNED slot belonging to a FAILED/COMPLETED campaign is not runnable. Ordinary work requiresRUNNING and noactivepriority; matching priority work may run whilePAUSED, but ending/failing it never resumes ordinary work. Do not treat a stored slot or old generation receipt as permission by itself.
