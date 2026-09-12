# OV-030 — Lưu chiến dịch và lịch nội dung

## Status

DONE

## Objective

Campaign objective, opportunity/manual source, slots, content refs và status; auto/manual priority flow.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 30 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không campaign entity.

## Expected behavior

Campaign objective, opportunity/manual source, slots, content refs và status; auto/manual priority flow.

## Requirements

Manager tạo yêu cầu sản phẩm/chương trình ngay làm pause automation atomically; không resume khi priority done; ưu tiên không bỏ qua Truth Guard; staff read-only.

Before using an OV-029 opportunity, persist the complete frozen decision contract (input snapshot, input digest, algorithm version, candidate components/exclusions, AI model/status/assessments, source versions and decision time) in the same campaign/idempotency transaction. An ephemeral numeric score alone is insufficient. Revalidate current operational eligibility and source freshness before scheduling/publishing.

## Dependencies

OV-003, OV-009, OV-029

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/campaigns/; src/app/(app)/campaigns/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không quảng cáo trả phí; campaign chỉ organic Facebook.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Pause/restart persisted; duplicate priority; manual expired program; calendar timezone.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Implemented for review: durable organization-scoped marketing control, campaigns, initial unscheduled slots, immutable frozen decision/source/settings snapshots and idempotent receipts. Fresh manager authorization, origin checks and strict bounded POST input; staff read-only list/detail/calendar. Manual priority atomically pauses, conflicting requests reject, scoped trusted terminal clears priority and remains PAUSED. Saved business settings are required; no implicit enable, scheduler, AI generation, publishing or writable content references.


Pre-implementation review:030 owns a single durable campaign/control/slot model and full029 decision receipt. Initial slots are unscheduled;036 chooses times,032 owns content versions/FK,038 owns top-level automation pause/resume controls. Manual priority creation pauses atomically, terminal clears matching priority but stays paused. Initial PAUSED until explicit manager enable is an engineering deployment default, not a new interview answer. No duplicate generation, scheduler or posting worker in030.

Parent local browser proof: signed in synthetic manager, opened /campaigns from additive header link (original nav preserved), searched synthetic product by name, selected it and created priority request. UI showed onePLANNED campaign, one unscheduled slot, no content, PAUSED with active priority. Exact local terminal RPC then marked synthetic campaignFAILED; browser reload confirmed PAUSED remained and priority cleared. Product disabled and fake Auth user deleted; immutable campaign/audit history retained. Screenshot inspected desktop layout; no real generation/publishing/payment occurred. Header scopedlint PASS.

Validation (local only): 9 offline campaign tests PASS; 1 actual engine-to-local-REST service test PASS. The latter covers same-version imported program discount/terms in standalone and attached branches, product price/name drift, malformed SQL operational fields, program expiry while waiting on a real database lock, full frozen decision equality, request replay and recent-source exclusion. SQL suite31 assertions PASS, including audit rollback, permissions, terminal PAUSED and canonical UUID source refs. Actual two-connection priority race PASS: one campaign/audit, loser conflicts, terminal remains PAUSED. Scoped ESLint PASS. Whole TypeScript check currently reports only concurrent consultation/planner.ts:43 narrowing work outside this task. Migration20260912110000 applied to local Docker PostgreSQL and exact local migration history repaired; no remote migration.

Reproduction: `node node_modules/vitest/vitest.mjs run src/lib/campaigns --maxWorkers=1 --no-file-parallelism` with `ONEVOICE_LOCAL_ADMIN` set from local `pnpm exec supabase status -o json` enables the explicit localhost54321 integration test; without it that test skips. `node supabase/tests/campaigns-concurrency.mjs` uses only Docker local PostgreSQL. `Get-Content supabase/tests/campaigns.test.sql -Raw | docker exec -i supabase_db_onevoice psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At` runs rollback-scoped SQL assertions. Synthetic persisted integration fixtures are soft-disabled and controls paused afterward; immutable campaign/audit history is retained. No job is launched by these tests.

Import drift is checked against program terms/scope/product references/discount/interval, normalizing timestamp instants and product reference ordering, and against selected product name/type/version/effective SKU values. OV029 does not include brand in its input. Ordinary selection rejects the same durable source key within seven days under the control lock; explicit manual priority is allowed to override recency. OV032/036 must revalidate again at later content/scheduling/publishing use; a stored snapshot never claims future eligibility.

Parent final acceptance:10campaign unit/route/actualREST tests and31SQL assertions PASS after all review fixes; prior actualconcurrency andbrowser proofs alsoPASS. Shared consultation narrowing fixed and whole typecheck nowPASS (reported012). Review accepts normalized UUID recency and current-field import drift checks. Scope complete; later generation/scheduling/publication remain separate tasks.

Final independent review accepted UUID canonicalization before recency checks plus current product name/type comparison; no remaining material finding in those reviewed fixes.
