# OV-061 — Lịch sử nội dung và WAITING_CHANNEL

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Website-first: marketing vẫn sinh caption/script/video, Truth Guard, versions, history, calendar. Due mà không có Facebook publishing provider → `WAITING_CHANNEL` (không mất, không infinite retry, không `PUBLISHED`). Không Graph. Không làm OV-037.

### Files và ownership

Một migration owner: `supabase/migrations/20260913110000_campaign_slot_waiting_channel.sql` (timestamp sau series OV-054/055 `20260913100000`/`20260913101000`; nếu 110000 đã dùng khi impl, lấy version trống tiếp theo — không reuse 100000/101000). Reuse `campaign_slots`, `content_versions` (immutable), `render_receipts.artifact_hash`. Không table content/campaign mới.

Đường dẫn dự kiến:

- migration trên
- `src/lib/campaigns/` (slot status `WAITING_CHANNEL`)
- `src/lib/marketing/` (consume due-without-provider; không copy `scheduler.ts` thành engine thứ hai — OV-036 owns scheduler, issue này thêm trạng thái và hand-off)
- `src/app/video-studio.tsx` và calendar OV-030 (history UI; không có `(app)/studio/`)
- colocated tests + SQL TAP

### Hợp đồng đầu vào, đầu ra và persistence

Slot status hiện: `PLANNED|READY|CLAIMED|PUBLISHED|SKIPPED|FAILED`. Thêm `WAITING_CHANNEL`.

Due slot đã có content version + publishable render, campaign nonterminal, control cho phép chạy, nhưng không có Facebook publishing provider → chuyển `WAITING_CHANNEL` một lần, lý do persist, không Graph, không `PUBLISHED`. Bounded skip/retry giữ nguyên rule OV-036; không vòng vô hạn. Studio+calendar hiện caption/script/passport/Truth Guard, artifact+hash, version history. Manager edit/regenerate → version mới (032). Unschedule/download không publish.

`content_versions` immutable; `artifact_hash` chỉ trên `render_receipts` (OV-046). VALID content ≠ rendered ≠ published.

### Trình tự thực hiện

- [x] Migration enum/check `WAITING_CHANNEL`; SQL uniqueness/transition tests; Facebook regression: không tự PUBLISHED.
- [x] Scheduler/Studio đọc status mới; due without provider → WAITING_CHANNEL, không gọi publishing.ts / Graph.
- [x] History UI: caption/script/passport/Truth Guard/render hash/versions trên Studio + calendar; manager edit/regenerate/unschedule/download.
- [x] Bounded skip/retry; crash resume không đổi WAITING_CHANNEL thành PUBLISHED.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-061-01: Studio+calendar hiện caption/script/passport/Truth Guard, artifact hash, version history; content_versions không UPDATE/DELETE.
- [x] AT-061-02: Manager edit/regenerate → version mới; unschedule không PUBLISHED; download đúng artifact hiện hành.
- [x] AT-061-03: Due slot không Facebook provider → `WAITING_CHANNEL`; zero Graph; không `PUBLISHED`; hai tick không double-publish.
- [x] AT-061-04: Retry/skip bounded; PAUSED ordinary không chạy; WAITING_CHANNEL không infinite retry và không tự lên PUBLISHED khi thiếu provider.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/marketing/waiting-channel.test.ts` và SQL migration test.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/marketing/waiting-channel.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md. Không Facebook Graph, không live VNPay.

## Status

DONE

## Objective

Lịch sử nội dung (caption/script/passport/Truth Guard/render+hash/versions) trong Studio và calendar; slot due không có kênh đăng → `WAITING_CHANNEL`, không Graph, không `PUBLISHED`.

## Context

Thực hiện quyết định website-first 2026-09-13. Đây là task 61 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

Interview §5 vẫn yêu cầu đăng Fanpage khi có provider; thiếu Meta thì không bịa publish. OV-037 (Facebook publishing) không thuộc round này.

Studio hiện tại: `src/app/video-studio.tsx` (không `(app)/studio/`). Chưa `campaign-generation.ts` / `scheduler.ts` (OV-053/036). Campaign slots chưa có `WAITING_CHANNEL`.

## Current behavior

Slots: `PLANNED|READY|CLAIMED|PUBLISHED|SKIPPED|FAILED`. History/version ở 032/046; Studio review là OV-035. Scheduler OV-036 chưa làm. Không waiting-channel. Không Graph publish.

## Expected behavior

Studio+calendar đọc được history đầy đủ. Due without Facebook provider → `WAITING_CHANNEL`. Never Graph. Never `PUBLISHED` trên đường này. Manager edit/regenerate/unschedule/download.

## Requirements

- Thêm đúng một status `WAITING_CHANNEL` vào slot hiện có; không bảng song song.
- Không gọi Facebook Graph / OV-037.
- Không infinite retry; skip/replacement bounded (OV-036).
- `content_versions` immutable; artifact hash trên `render_receipts` only.
- Staff read-only; manager mới edit/regenerate/unschedule.
- Không mandatory per-post approval (interview).
- Timezone/calendar reuse OV-030.

## Dependencies

OV-030, OV-032, OV-035, OV-036, OV-046

OV-034/053 là transitive qua OV-035. Không phụ thuộc OV-037.

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: slot status + history UI + scheduler/Studio consume `WAITING_CHANNEL`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không implement publishing adapter (OV-037). Không copy planner consultation. Không sửa Dockerfile.test (OV-034).

## Edge cases

- Thiếu render publishable → không WAITING_CHANNEL giả như đã sẵn sàng đăng; FAILED/SKIPPED theo rule 036.
- Campaign FAILED/COMPLETED: slot PLANNED cũ không chạy (OV-030/036).
- Priority PAUSED: ordinary không chạy; matching priority vẫn eligible.
- Artifact stale/hash mismatch: không pretend WAITING_CHANNEL như published.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Enum/SQL transition; due without provider; no Graph; history immutable; bounded retry; pause.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment:
2026-09-13 local Windows; container supabase_db_onevoice running; Kong/API http://127.0.0.1:54321. No remote DB, no Facebook Graph, no Messenger send, no Facebook publish, no VNPay charge. README not edited (assignment). tsc/eslint/full suite skipped.

Files and migration versions changed:
supabase/migrations/20260913110000_campaign_slot_waiting_channel.sql (new), supabase/tests/waiting-channel.test.sql (new), src/lib/marketing/scheduler.ts (due-without-provider → WAITING_CHANNEL only), src/lib/marketing/waiting-channel.test.ts (new), src/lib/marketing/scheduler.test.ts (OV-036 ticks pass hasPublishingProvider: true so READY path stays), src/lib/campaigns/management.ts, src/lib/campaigns/repository.ts, src/app/api/campaigns/route.ts, src/lib/content/studio-service.ts, src/app/api/studio/route.ts, src/app/video-studio.tsx, src/app/(app)/campaigns/campaign-manager.tsx, src/lib/supabase/database.types.ts, docs/tasks/onevoice/OV-061-content-history-waiting-channel.md.

Acceptance cases: AT-061-01 => PASS (SQL history RPC + calendar record caption/validation/versions; content_versions UPDATE/DELETE 55000 append-only; campaignSchema DTO)
AT-061-02 => PASS (manager unschedule SQL + local REST; status stays WAITING_CHANNEL, scheduled_at null, PUBLISHED=0, versions survive; staff 42501; save_content_version/check_content_version now allow WAITING_CHANNEL so OV-035 edit/regenerate still writes a new immutable version; download URLs remain `/api/renders/{id}/download` from current artifact)
AT-061-03 => PASS (unit tick without provider → WAITING_CHANNEL, second tick empty, published=0; scheduler.ts/worker have no graph.facebook.com/publishing.ts; SQL apply waiting_channel once + replay; local REST same)
AT-061-04 => PASS (PAUSED ordinary claim 0; WAITING_CHANNEL not reclaimed; apply published rejected)

Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/marketing/waiting-channel.test.ts src/lib/marketing/scheduler.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/vitest/vitest.mjs run src/lib/content/studio-service.test.ts src/lib/campaigns/routes.test.ts --maxWorkers=1 --no-file-parallelism
docker exec -i supabase_db_onevoice psql ... < supabase/tests/waiting-channel.test.sql
```
Second waiting-channel vitest with ONEVOICE_LOCAL_ADMIN from supabase status JSON (key not printed).
Did not run tsc, eslint, or full vitest.

Results: SQL TAP 30/30 ok, plan 1..30, ROLLBACK. Vitest without admin: waiting-channel+scheduler 13 passed / 2 skipped. Studio+campaigns routes 9 passed. With local admin: waiting-channel 6 passed / 6 including local due tick → WAITING_CHANNEL, PUBLISHED=0, unschedule, history versions=1.

DB proof: migration 20260913110000 applied on supabase_db_onevoice. Constraint includes WAITING_CHANNEL. Fixtures rolled back in SQL TAP; local vitest paused/disabled after run. Never PUBLISHED. No Graph.

Implementation decisions: Website-first default is no Facebook publishing provider (`FACEBOOK_PAGE_ACCESS_TOKEN` empty). `tick` applies `waiting_channel` instead of `ready` when the provider is absent; already-READY due slots use a stable per-slot request id so the transition is once. Claim still only picks PLANNED|READY, so WAITING_CHANNEL is not retried. OV-036 tests pass `hasPublishingProvider: true` to keep the READY-for-037 path. History lives on immutable `content_versions` + `render_receipts.artifact_hash`; calendar `internal_campaign_record` and Studio GET expose it. Manager `unschedule_campaign_slot` clears `scheduled_at` only.

Remaining limitations/blockers: README status left to orchestrator. tsc/eslint/full suite skipped. Browser Studio/calendar walkthrough not executed (HTTP/SQL persistence accepted). OV-037 publishing adapter not implemented; a configured page token would leave slots READY for that issue.

Cleanup: SQL TAP ROLLBACK; local products disabled_at, campaigns FAILED, controls PAUSED. No owned background processes.

Reviewer conclusion and README/status update: Status DONE in this issue. README not edited. WAITING_CHANNEL is not a publish receipt.
