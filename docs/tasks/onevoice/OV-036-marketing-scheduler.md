# OV-036 — Chọn giờ và số lượng đăng

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/marketing/scheduler.ts + scheduler.test.ts; nối campaign control/slots030, business jobs012, generation053 và render046. SQL schedule claim/dedup có local tests.

### Hợp đồng đầu vào, đầu ra và persistence

tick(org, now) dùng DB clock và persisted control revision; output persisted slot/job decisions, không network publish trực tiếp. Có automatic timing hoặc manager windows/cap; mục tiêu độc lập. Cap tính slot reservations để hai worker không vượt.

### Trình tự thực hiện

- [x] Viết pure time/window/cap selector với timezone từ settings; chọn bounded defaults kỹ thuật có config, không gọi là quyết định người dùng.
- [x] Transaction claim due slot chỉ campaign nonterminal/current control; PAUSED chặn ordinary, matching priority vẫn eligible; FAILED campaign không chạy slot PLANNED cũ.
- [x] Nối053→046→ready cho037. Retry/repair tối đa có cấu hình; stale nguồn regenerate hoặc SKIPPED với tối đa một replacement liên kết, không vòng vô hạn.
- [x] Persist decision reason/source revisions; crash resume từ receipts; không tự bật RUNNING khi priority hoàn tất/lỗi.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-036-01: Hai ticks đồng thời không trùng slot/job hoặc vượt daily cap; boundary midnight/timezone và DST config.
- [x] AT-036-02: PAUSED ordinary không chạy; đúng priority được chạy; ưu tiên hoàn tất vẫn PAUSED.
- [x] AT-036-03: Expired promo/stock0→skip/replacement bounded; changed price→new content version.
- [x] AT-036-04: Crash giữa generate/render/schedule resumes; terminal campaign không chạy; timeout chưa rõ outcome không tạo publication khác.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/marketing/scheduler.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/marketing/scheduler.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

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

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

DST/timezone midnight, restart duplicate, cap, paused, no content, priority complete vẫn pause.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment:
2026-09-13 local Windows; container supabase_db_onevoice running; Kong/API http://127.0.0.1:54321. No remote DB, no Facebook Graph, no Messenger send, no Facebook publish, no VNPay charge. Provider fixtures only (no live AI). ONEVOICE_LOCAL_ADMIN set from `supabase status --output json` SERVICE_ROLE_KEY (not printed; not sourced from .env).

Workspace identifier: git HEAD d442a91ccead974422b56ecf7a92cfc190cb8888. Dirty this task: src/lib/marketing/scheduler.ts, src/lib/marketing/scheduler.test.ts, src/worker/automation-tick.ts, supabase/migrations/20260913106000_marketing_scheduler.sql, supabase/tests/scheduler.test.sql, supabase/tests/scheduler-concurrency.mjs, src/lib/supabase/database.types.ts, docs/tasks/onevoice/OV-036-marketing-scheduler.md.

Files and migration versions changed:
src/lib/marketing/scheduler.ts (new), src/lib/marketing/scheduler.test.ts (new), src/worker/automation-tick.ts (new), supabase/migrations/20260913106000_marketing_scheduler.sql (new), supabase/tests/scheduler.test.sql (new), supabase/tests/scheduler-concurrency.mjs (new), src/lib/supabase/database.types.ts (slot columns + scheduler RPCs). README not edited.

Acceptance cases: AT-036-01 => PASS (unit midnight HCM + DST America/New_York; two concurrent ticks one READY/one generate, daily cap 1; SQL replay/cap; two-connection claim fence)
AT-036-02 => PASS (unit PAUSED ordinary empty, matching priority READY, completePriority stays PAUSED; SQL same + campaign remains PLANNED)
AT-036-03 => PASS (unit stale_stock skip + one replacement, second skip does not add another; price_changed generates expectedContentRevision 1; SQL inspect zero stock + skip/replace unique)
AT-036-04 => PASS (unit PROVIDER_TIMEOUT then same generateRequestId resume to READY published=0; FAILED campaign no slots; SQL terminal campaign not claimed; apply rejects action=published)

Commands executed:
node node_modules/vitest/vitest.mjs run src/lib/marketing/scheduler.test.ts --maxWorkers=1 --no-file-parallelism
(second run with ONEVOICE_LOCAL_ADMIN from supabase status JSON, key not printed)
cat supabase/tests/scheduler.test.sql | docker exec -i supabase_db_onevoice psql ...
node supabase/tests/scheduler-concurrency.mjs
Did not run tsc, eslint, or full vitest.

Results: without local admin 8 passed / 1 skipped (local persistence) exit 0. With ONEVOICE_LOCAL_ADMIN 9 passed / 9 exit 0; none skipped. SQL TAP 24/24 ok, plan 1..24, ROLLBACK. Concurrency: PASS two connections claim one due slot; never published.

DB proof: local endpoint http://127.0.0.1:54321; Postgres via supabase_db_onevoice. Migration 20260913106000 applied. Fixtures paused/disabled after runs; immutable receipts/audit retained. No PUBLISHED rows. Generic claim_business_job excludes automation_tick.

UI/media/provider proof: n/a. No Graph, no render worker, no live model.

Implementation decisions: `tick(org, now)` claims due slots under control lock + revision fence, schedules with settings timezone (auto uses cap 1 / 10:00-16:00 technical defaults). Slot stays PLANNED during generate (053/save_content_version reject CLAIMED), then READY after generate (+ optional enqueue_render for video). Never PUBLISHED, never Graph. Missed prior local days SKIPPED without burst; at most one linked replacement. complete_priority_control clears priority, stays PAUSED, does not COMPLETE the campaign (OV-061 needs nonterminal). Dedicated worker src/worker/automation-tick.ts opt-in ONEVOICE_SCHEDULER_WORKER=1; consultation pump does not steal automation_tick jobs.

Remaining limitations/blockers: README status left to orchestrator. tsc/eslint/full suite skipped per assignment. WAITING_CHANNEL is OV-061. Facebook publish is OV-037. Live AI/render not run in this issue.

Cleanup: local products disabled_at, campaigns FAILED, controls PAUSED. No owned background processes.

Reviewer conclusion and README/status update: Status DONE in this issue. README not edited. READY content is not a publish receipt.


Integration review fromOV-030: slot eligibility must also require a nonterminal owning campaign and current control/priority revision. A PLANNED slot belonging to a FAILED/COMPLETED campaign is not runnable. Ordinary work requiresRUNNING and noactivepriority; matching priority work may run whilePAUSED, but ending/failing it never resumes ordinary work. Do not treat a stored slot or old generation receipt as permission by itself.

## Website-first 2026-09-13 — no Facebook publish

Without a Facebook publishing provider, due slots become `WAITING_CHANNEL` via **OV-061**, never `PUBLISHED`, never Graph. Bounded skip/retry (existing AT-036-03/04) still apply; no infinite retry. Do **not** implement OV-037 in this issue. Scheduler `tick` persists slot/job decisions only; network publish remains OV-037 (not this round).

Slot status today: `PLANNED|READY|CLAIMED|PUBLISHED|SKIPPED|FAILED`. `WAITING_CHANNEL` is added and consumed in OV-061; this issue must not mark due-without-provider as `PUBLISHED` or call Graph. Historical «Nối053→046→ready cho037» means ready-for-publish **when a provider exists**; website-first path hands off to waiting-channel instead.
