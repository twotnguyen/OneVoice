# OV-032 — Lưu nguồn và kiểm facts bài/video

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tiếp tục src/lib/content/{passport,version-repository}.ts và tests; src/lib/knowledge/descriptive-policy.ts; supabase/migrations/20260912112000_content_versions.sql; supabase/tests/content-versions.test.sql.

### Hợp đồng đầu vào, đầu ra và persistence

Giữ immutable content_versions và slot content_revision CAS đã có; document onevoice.content.v1 chứa post/script/evidence/templates/fields/model/hash, artifactHash=null. Valid content không đồng nghĩa rendered/publishable. OV-053 sinh,046 render,037 kiểm lần cuối và đăng.

### Trình tự thực hiện

- [ ] Đọc toàn bộ code dang dở; tái chạy actual REST với specifications dạng array thật và variant.options mâu thuẫn. Không dựa fixture specs={} để kết luận đạt.
- [ ] Hoàn tất field coverage cả caption/CTA/narration/default template; style/media được phân loại từ trusted template inventory, không do model tự khai báo để né facts.
- [ ] Kiểm scope campaign product/program/trend và program applicability; bắt buộc business settings snapshot dù không có brand claim. Numeric quote phải gắn đúng thuộc tính và SKU.
- [ ] Kiểm currentness cả raw values/hash/timestamps, không chỉ version; expiry sau mọi lock ở save VÀ check-current. Ghi giới hạn semantic guard và bàn giao contract cho033/034/046/053.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-032-01: RAM16/SSD512 không chấp nhận RAM512; conflicting variant specs không có VALID claim.
- [ ] AT-032-02: Campaign product A không nhận evidence product B/unrelated program; trend khác fingerprint/run bị reject.
- [ ] AT-032-03: Settings/forbidden topics đổi hoặc importer sửa same-version facts→stale.
- [ ] AT-032-04: Template accent_index/color hợp lệ không bị coi là prose; unknown input/uncovered default numeric text→reject.
- [ ] AT-032-05: Concurrent slot save chỉ một revision; replay identical request same version; immutable rows update/delete bị reject.
- [ ] AT-032-06: Nguồn hết hạn trong lúc chờ later row lock→check-current/save phải reject; actual local REST, không chỉ mock repository.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/content/passport.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/content/passport.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

IN_PROGRESS

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

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Giá trong caption sai; promotion hết hạn; SKU mismatch; external fact thiếu source; DB latest khác snapshot.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Đã triển khai một phần passport.ts, version-repository.ts, migration20260912112000 và tests trong workspace. Vẫn IN_PROGRESS vì chưa final review toàn bộ AT-032. Phiên bàn giao không chạy runtime tests mới; không dùng reported local pass để tự đánh DONE. Xem HANDOFF.md về specification shape, source scope, settings và expiry race cần kiểm chứng.


Review contract: validate every visible/audible claim, including hook/caption/CTA, promotional dates, narration, supplied scene slots and default/static template text. Missing inputs cannot expose unrelated template percentages, employers or branding. OV-034 must remove/override such defaults and provide rendered-text evidence; slot-only validation does not establish truthful final media.

Pre-implementation integration contract:
- Reuse OV030 campaign_slots; add the content-version relationship here. A content version is immutable and belongs to exactly one scoped slot/campaign. Edits/regeneration create new versions; no parallel campaign/content store.
- Persist full post/script input, field-level claims and provenance, model/template identifiers, validation result and deterministic content hash. Later OV046 attaches the actual render artifact through a fenced immutable receipt; a generated script is not a rendered/published artifact.
- Validate all visible fields including caption/hook/CTA and template defaults. A legacy numerical guard pass alone is insufficient for qualitative or source-derived claims. Missing or conflicting sources fail closed with an actionable reason, without adding mandatory manager approval.
- Freshness must compare relevant current values/source hashes as well as management versions: the existing importer can change product/program fields without incrementing those versions. No silent reclassification of an old artifact as current.
- Persisted validation is evidence for a version at a time, not permanent publish permission. Expose a current-check contract to OV036/037; those tasks own scheduling, regeneration/replacement orchestration and external publication.
- Keep initial validation/generation adapters independently testable without a live AI account or real post. Catalog product/variant identity, promotional terms/dates, configured source version/hash/expiry, media/template text and changed-after-generation cases require regressions.
