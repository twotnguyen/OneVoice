# OV-032 — Lưu nguồn và kiểm facts bài/video

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tiếp tục src/lib/content/{passport,version-repository}.ts và tests; src/lib/knowledge/descriptive-policy.ts; supabase/migrations/20260912112000_content_versions.sql; supabase/tests/content-versions.test.sql.

### Hợp đồng đầu vào, đầu ra và persistence

Giữ immutable content_versions và slot content_revision CAS đã có; document onevoice.content.v1 chứa post/script/evidence/templates/fields/model/hash, artifactHash=null. Valid content không đồng nghĩa rendered/publishable. OV-053 sinh,046 render,037 kiểm lần cuối và đăng.

### Trình tự thực hiện

- [x] Đọc toàn bộ code dang dở; tái chạy actual REST với specifications dạng array thật và variant.options mâu thuẫn. Không dựa fixture specs={} để kết luận đạt.
- [x] Hoàn tất field coverage cả caption/CTA/narration/default template; style/media được phân loại từ trusted template inventory, không do model tự khai báo để né facts.
- [x] Kiểm scope campaign product/program/trend và program applicability; bắt buộc business settings snapshot dù không có brand claim. Numeric quote phải gắn đúng thuộc tính và SKU.
- [x] Kiểm currentness cả raw values/hash/timestamps, không chỉ version; expiry sau mọi lock ở save VÀ check-current. Ghi giới hạn semantic guard và bàn giao contract cho033/034/046/053.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [x] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-032-01: RAM16/SSD512 không chấp nhận RAM512; conflicting variant specs không có VALID claim.
- [x] AT-032-02: Campaign product A không nhận evidence product B/unrelated program; trend khác fingerprint/run bị reject.
- [x] AT-032-03: Settings/forbidden topics đổi hoặc importer sửa same-version facts→stale.
- [x] AT-032-04: Template accent_index/color hợp lệ không bị coi là prose; unknown input/uncovered default numeric text→reject.
- [x] AT-032-05: Concurrent slot save chỉ một revision; replay identical request same version; immutable rows update/delete bị reject.
- [x] AT-032-06: Nguồn hết hạn trong lúc chờ later row lock→check-current/save phải reject; actual local REST, không chỉ mock repository.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/content/passport.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/content/passport.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Content version/passport lưu evidence DB hoặc external theo claim kind, model/template, artifact hashes; validate toàn bộ text.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 32 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Guard chủ yếu số narration/scene inputs; thiếu caption/CTA/latest checks.

## Expected behavior

Content version/passport lưu evidence DB hoặc external theo claim kind, model/template, artifact hashes; validate toàn bộ text.

## Requirements

Giá/tồn/hiệu lực chương trình và trạng thái giao dịch theo dữ liệu vận hành hiện hành; kiến thức mô tả và tư vấn được dùng nguồn doanh nghiệp đã cấu hình/ingest theo OV-049/050. External trend claims có sources; qualitative unsupported -> regenerate/skip; stale dữ liệu trước publish -> rebuild; old artifact immutable.

## Dependencies

OV-011, OV-016, OV-030, OV-031

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/content/; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không thêm manager approval bắt buộc trái interview; failure không publish.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Giá trong caption sai; promotion hết hạn; SKU mismatch; external fact thiếu source; DB latest khác snapshot.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Đã triển khai passport.ts, version-repository.ts, migration 20260912112000 và tests. Gap-close 2026-09-12 thêm AT proof (trend fingerprint/run, forbiddenTopics, accent_index/mediaUrl, check-current expiry-after-later-lock). Orchestrator marked DONE after gates.


Review contract: validate every visible/audible claim, including hook/caption/CTA, promotional dates, narration, supplied scene slots and default/static template text. Missing inputs cannot expose unrelated template percentages, employers or branding. OV-034 must remove/override such defaults and provide rendered-text evidence; slot-only validation does not establish truthful final media.

Pre-implementation integration contract:
- Reuse OV030 campaign_slots; add the content-version relationship here. A content version is immutable and belongs to exactly one scoped slot/campaign. Edits/regeneration create new versions; no parallel campaign/content store.
- Persist full post/script input, field-level claims and provenance, model/template identifiers, validation result and deterministic content hash. Later OV046 attaches the actual render artifact through a fenced immutable receipt; a generated script is not a rendered/published artifact.
- Validate all visible fields including caption/hook/CTA and template defaults. A legacy numerical guard pass alone is insufficient for qualitative or source-derived claims. Missing or conflicting sources fail closed with an actionable reason, without adding mandatory manager approval.
- Freshness must compare relevant current values/source hashes as well as management versions: the existing importer can change product/program fields without incrementing those versions. No silent reclassification of an old artifact as current.
- Persisted validation is evidence for a version at a time, not permanent publish permission. Expose a current-check contract to OV036/037; those tasks own scheduling, regeneration/replacement orchestration and external publication.
- Keep initial validation/generation adapters independently testable without a live AI account or real post. Catalog product/variant identity, promotional terms/dates, configured source version/hash/expiry, media/template text and changed-after-generation cases require regressions.

Validation date / environment:
2026-09-12 local Windows; container supabase_db_onevoice healthy; Kong/API http://127.0.0.1:54321. No remote DB, no real Messenger/Facebook/VNPay. ONEVOICE_LOCAL_ADMIN set from `pnpm exec supabase status --output json` via JSON.parse(raw.slice(raw.indexOf("{"))).SERVICE_ROLE_KEY (not printed; not sourced from .env).

Workspace identifier: git HEAD de46270630c8f468f0ba602b11ef76618e28f01c. Dirty this task: src/lib/content/passport.test.ts, src/lib/content/version-repository.local.test.ts, supabase/tests/content-versions.test.sql, docs/tasks/onevoice/OV-032-content-passport-and-truth.md. Sibling dirty left untouched: OV-017 consultation files.

Files and migration versions changed:
Tests and issue evidence only. Did not edit passport.ts, version-repository.ts, or descriptive-policy.ts. Migration 20260912112000_content_versions.sql objects were already applied on local postgres; recorded supabase_migrations.schema_migrations version=20260912112000 name=content_versions. No db reset.

Acceptance cases: AT-032-01 => PASS (local REST RAM 16GB spec array VALID; variant.options RAM 32GB specificationConflicts rejects VALID/MISSING_EVIDENCE; SQL unrelated program CONTENT_FORBIDDEN)
AT-032-02 => PASS (SQL CONTENT_FORBIDDEN wrong trend fingerprint and wrong runId; local REST save throws FORBIDDEN for both)
AT-032-03 => PASS (SQL CONTENT_FORBIDDEN_TOPIC on fields containing Keyboard; local REST save INVALID_CONTENT; existing settings/import drift still STALE_CONTENT)
AT-032-04 => PASS (passport.test.ts accepts accent_index as index and outro primary_url as mediaUrl; uncovered figure "98%" and staticText "98%" throw UNCOVERED_TEXT; existing color path still passes)
AT-032-05 => PASS (SQL replay/immutable update+delete/CAS; local competing slot save one fulfilled one rejected)
AT-032-06 => PASS (local REST two connections: check_content_version waits on knowledge_ingestion_runs FOR UPDATE then STALE_CONTENT after wall-clock ingestion expiry; existing save product-lock race still STALE_CONTENT)

Commands executed:
node node_modules/vitest/vitest.mjs run src/lib/content/passport.test.ts --maxWorkers=1 --no-file-parallelism
docker exec -i supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/content-versions.test.sql
node node_modules/vitest/vitest.mjs run src/lib/content/version-repository.local.test.ts --maxWorkers=1 --no-file-parallelism
(with ONEVOICE_LOCAL_ADMIN from supabase status JSON). Did not run tsc, eslint, or full vitest.

Results: passport.test.ts 9 passed/9 exit 0 (~522ms). content-versions.test.sql 1..27 all ok, ROLLBACK, no TAP `not ok`, exit 0. version-repository.local.test.ts 6 passed/6 exit 0 (~10.78s); none skipped.

DB proof: local endpoint http://127.0.0.1:54321; Postgres via supabase_db_onevoice. SQL fixtures a3200000-… rolled back. Local fixtures use randomUUID orgs, specification arrays `[{"name":"RAM","value":"16GB"}]` and variant.options. Unique IDs for trend/forbidden/expiry tests. Race invariant: later-row FOR UPDATE + pg_sleep(3) then check-current STALE_CONTENT; failed check does not create a new version. schema_migrations 20260912112000 content_versions recorded.

UI/media/provider proof: n/a for this gap close.

Implementation decisions: inventory already admits color|index|mediaUrl; SQL already rejects mismatched trend runId/fingerprint with CONTENT_FORBIDDEN and forbiddenTopics on document fields with CONTENT_FORBIDDEN_TOPIC. JS maps 42501→FORBIDDEN and 22023→INVALID_CONTENT. Semantic guard stays fail-closed (UNCOVERED_TEXT/CLAIM_MISMATCH); OV-033/034/046/053 still own sourcing/render/publish.

Remaining limitations/blockers: Status left IN_PROGRESS; README not DONE; no tsc/eslint/full suite per assignment. supabase status reported imgproxy/pooler stopped; db+kong+rest stayed up. knowledge_ingestions are immutable so AT-032-06 expires via wall-clock expires_at while the later run row is locked, not by updating the ingestion.

Cleanup: SQL suite rolled back. Local products disabled_at, campaigns FAILED, knowledge sources active=false. Immutable content_versions/audit retained. No owned background processes.

Reviewer conclusion and README/status update: Orchestrator 2026-09-12 verified AT-032-01..06. passport.test.ts 9 passed; content-versions.test.sql 1..27 all ok ROLLBACK; version-repository.local.test.ts 6 passed with ONEVOICE_LOCAL_ADMIN from supabase status JSON. tsc --noEmit exit 0 after test input cast; eslint changed content tests --max-warnings=0. Status DONE. VALID content is not a render/publish receipt.
