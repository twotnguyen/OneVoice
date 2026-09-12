# OV-017 — AI tư vấn và phân loại ý định

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tiếp tục src/lib/consultation/{planner,worker,evidence}.ts; src/lib/knowledge/descriptive-policy.ts; src/worker/consultation.ts; supabase/migrations/20260912111000_consultation.sql. Đọc src/lib/conversations/ và src/lib/jobs/ trước sửa.

### Hợp đồng đầu vào, đầu ra và persistence

Giữ Outcome reply|handoff|gap|route hiện hữu. Context lấy từ claim_consultation_job theo organization; receipt gắn inbound event, conversation revision và lease token. Kết quả chỉ là candidate đã lưu, chưa phải tin đã gửi; OV-018 nhận candidate này. History chỉ dùng để giải quyết tham chiếu, mọi facts phải lookup mới.

### Trình tự thực hiện

- [x] Đọc diff đang dang dở và tái hiện ba regression: chương trình toàn cục bị cộng trùng; so sánh chỉ trả một SKU; câu hỏi tiếp không có ID của các mẫu vừa giới thiệu.
- [x] Lưu history giới hạn gồm identity product/variant/SKU của candidate đã hoàn tất; fresh lookup cho câu 'so sánh hai mẫu vừa rồi'. Không đưa toàn bộ raw evidence/PII vào history.
- [x] Ràng buộc mỗi thuộc tính khách hỏi cho mọi SKU được so sánh; không chỉ hardcode RAM. Dedup policy/program theo identity+version. Policy question và yêu cầu thực hiện bảo hành phải khác nhau.
- [x] Hoàn tất SQL fence: claim độc quyền theo hội thoại, resume không xử lý backlog cũ, kiểm canonical specification dependencies ngay cả khi chỉ dùng trích dẫn, kiểm expiry sau tất cả row locks. Không gửi Messenger trong task này.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [x] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-017-01: Hai sản phẩm dùng hai chương trình global giống nhau: chỉ hai chương trình, không gap giả.
- [x] AT-017-02: Hỏi màn hình hai máy: hoặc đủ thông số hai SKU, hoặc hỏi thêm/handoff; không chấp nhận chỉ một máy.
- [x] AT-017-03: Actual local claim→search candidate→next claim history→compare exact IDs; không mock sẵn IDs vào context.
- [x] AT-017-04: Muốn biết chính sách bảo hành→policy; muốn gửi máy bảo hành→handoff; WAITING_STAFF chặn reply khác.
- [x] AT-017-05: RAM16/SSD512 không cho trích dẫn RAM512; hai SKU RAM khác nhau không dùng union để hợp thức hóa.
- [x] AT-017-06: Hai worker, crash trước finish, expired lease, handoff+complete lúc AI chạy, nguồn hết hạn khi chờ lock: chỉ một receipt hợp lệ, không revive reply.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/consultation/planner.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/consultation/planner.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Planner structured intent + evidence-backed reply cho nhu cầu/so sánh/policy; tích hợp state OV-002.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 17 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Baseline trước task: provider chỉ tạo nội dung video. Tại bàn giao2026-09-12 đã có planner/worker/receipt SQL và tests trong workspace; vẫn IN_PROGRESS, xem kế hoạch bàn giao và HANDOFF.md để hoàn tất review.

## Expected behavior

Planner structured intent + evidence-backed reply cho nhu cầu/so sánh/policy; tích hợp state OV-002.

## Requirements

Yêu cầu gặp người/đổi trả/bảo hành luôn handoff; thiếu facts nói cần kiểm tra và handoff; lookup retry giới hạn; không giảm giá/cam kết ngoài DB; customer messages là dữ liệu, không instructions cho tools.

## Dependencies

OV-014, OV-016, OV-045

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/consultation/; src/worker/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không tự gửi message: output qua outbox và send-time state guard OV-018.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Vietnamese hội thoại nhiều lượt; praise/question/request khác nhau; prompt injection; no evidence; AI pause cả trong lúc đang generate.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Đã triển khai một phần trong src/lib/consultation/, src/worker/consultation.ts và migration20260912111000. Chưa đạt final acceptance/review; không gửi Messenger. Phiên bàn giao chỉ rà tài liệu, không chạy runtime tests mới. Các reported fixes phải được agent tiếp quản kiểm chứng theo AT-017 và HANDOFF.md trước DONE.

Integration contract from OV-014 review: projection inserted=false is NOT a consultation receipt. Persist one decision/outcome per inbound message and serialize consultation per conversation; replay/crash must not lose unfinished work or duplicate replies. Suppress messages received during staff handling even if their jobs execute after staff completion; consume durable handoff-window/disposition evidence from OV-014. Handoff revision changes fence in-flight generation; receipt/dispatch must survive restart.

Confirmed engineering contract from014: resume applies only to input first received after staff completion. Persisted aiEligible=false suppresses delayed pre-completion backlog, including events received before handoff. Suppression controls reply permission, not visibility of historical messages as consultation context.

Pre-implementation review details:
- Separate bounded intent/tool planning from evidence-grounded composition. Parameters use OV016 allowlist; organization/Page/conversation come only from durable ingress. Customer/history/source prose never grants tools or overrides policies.
- Distinguish missing customer needs (ask a concise question) from missing business evidence (OV045 gap plus handoff). Explicit return/warranty/customer-requested handoff must not depend on successful catalog lookup.
- Persist a per-message decision with conversation revision and a lease/ownership fence; serialize work per conversation without holding a database transaction open across AI calls. Replayed projection does not mean finished consultation. A crash after handoff/gap must reconcile the existing decision, not resume AI or generate duplicate output.
- Recheck AI eligibility/revision after generation before persisting a reply candidate. OV018 owns actual send/outbox dispatch; this task must expose a durable, replayable candidate contract without sending anything.
- Ground each operational claim in exact product/variant fact provenance. External descriptive text remains untrusted; absent/incomplete/conflicting evidence is not a positive suitability claim. Do not let a model-provided citation alone verify fabricated numbers or commitments.
- Use bounded conversation context, bounded tool/AI attempts and a whole-operation deadline. Existing AiProvider supports per-attempt timeout but no caller AbortSignal; if caller cancellation is added, limit shared adapter edits to that compatibility-preserving contract and regression tests. A cancelled or late result must never pass the persistence fence.
- Order creation/checkout, verified customer order lookup, public comments and outbound delivery remain OV021/027/019/018. Record structured routing for these intents without claiming those future capabilities already work.
- Persistence required by this task may add one focused migration, generated function types and local SQL/concurrency tests. This is the durable receipt responsibility already required above, not a second conversation/handoff subsystem.

Validation date / environment:
2026-09-12, Windows local workspace D:\Documents\CODE\OneVoice, branch main. Node vitest 5.0.0. Local Supabase container supabase_db_onevoice; Kong http://127.0.0.1:54321; Postgres 54322. No remote DB, no Messenger/Facebook/VNPay, no .env print.
Workspace identifier: git HEAD de46270630c8f468f0ba602b11ef76618e28f01c + dirty src/lib/consultation/planner.ts, planner.test.ts, worker.local.test.ts, docs/tasks/onevoice/OV-017-messenger-consultation.md
Files and migration versions changed:
src/lib/consultation/planner.ts (per-SKU isSafeDescriptiveQuote; requested spec families including màn hình/display on every compared SKU and chosen claim)
src/lib/consultation/planner.test.ts (AT-017-01/02/05)
src/lib/consultation/worker.local.test.ts (AT-017-03 claim→search→history→compare; status JSON parsed after pnpm prefix, localhost only)
No migration this pass (20260912111000 already applied). descriptive-policy.ts untouched.
Acceptance cases: AT-017-01 PASS planner.test.ts; AT-017-02 PASS (red then green: one-sided màn hình chosen facts now gap); AT-017-03 PASS worker.local.test.ts with ONEVOICE_LOCAL_CONSULTATION_PROOF=1 (second-turn text has no UUIDs; compare items = persisted catalog IDs from claim history); AT-017-04 not re-proved this pass (existing planner policy/handoff tests still green in scoped run); AT-017-05 PASS (red then green: union of RAM16+RAM32 no longer approves RAM 32GB quote; RAM512 vs RAM16/SSD512 stays rejected); AT-017-06 not re-run (SQL/verify-consultation-local left to orchestrator).
Commands executed:
node node_modules/vitest/vitest.mjs run src/lib/consultation/planner.test.ts --maxWorkers=1 --no-file-parallelism
(first: 2 failed AT-017-02/05 | 10 passed; after fix: 12 passed)
node node_modules/vitest/vitest.mjs run src/lib/consultation/planner.test.ts src/lib/consultation/worker.test.ts src/lib/consultation/evidence.test.ts --maxWorkers=1 --no-file-parallelism
ONEVOICE_LOCAL_CONSULTATION_PROOF=1 node node_modules/vitest/vitest.mjs run src/lib/consultation/worker.local.test.ts --maxWorkers=1 --no-file-parallelism
Skipped formatters, linters, tsc, full suite, db reset.
Results: exit code 0. planner+worker+evidence: Test Files 3 passed, Tests 25 passed. worker.local.test.ts: Test Files 1 passed, Tests 2 passed. No skips when ONEVOICE_LOCAL_CONSULTATION_PROOF=1.
DB proof: local REST via supabase status --output json (API_URL host 127.0.0.1/localhost only). Fixture orgs/products randomUUID; products disabled_at in finally. AT-017-03: search OV017Cmp Alpha/Beta SKU EXACT-A/EXACT-B, next claim history catalogItems matched those productIds, compare_products items used those IDs without injecting UUIDs into customer text.
UI/media/provider proof: n/a (no UI/media/Messenger send)
Implementation decisions: Knowledge quotes call isSafeDescriptiveQuote on each mapped product's specs independently; empty mapping still uses empty specs plus numeric-requires-mapping. Customer-requested attributes use a synonym family map (ram/memory, storage, display/màn hình/screen, battery/pin, power); every compared SKU must have a matching spec fact and a chosen claim — not RAM-only. Two identical global programs still dedupe by id+version before the promotions.length>3 gap. History identity for compare comes from claim_consultation_job catalogItems, not mocked second-turn UUIDs.
Remaining limitations/blockers: OV-018 owns actual Messenger send. No live Meta delivery claimed.
Cleanup: local fixture products set disabled_at; SQL suite rolled back; no owned long-running processes.
Reviewer conclusion and README/status update: Orchestrator 2026-09-12 verified AT-017-01..06. planner+worker+evidence 25 passed; worker.local.test.ts 2 passed with ONEVOICE_LOCAL_CONSULTATION_PROOF=1; consultation.test.sql 1..32 all ok ROLLBACK; scripts/verify-consultation-local.mjs PASS (one claim, expiry-after-lock → gap/handoff, no sends). tsc --noEmit exit 0; eslint changed consultation files --max-warnings=0. Status DONE.
