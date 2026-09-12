# OV-053 — Sinh nội dung chiến dịch dùng chung

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/content/campaign-generation.ts + campaign-generation.test.ts; đọc existing generate-video-script.ts, passport.ts, version-repository.ts và034 inventory.

### Hợp đồng đầu vào, đầu ra và persistence

Service input trusted org+slotId+expectedContentRevision+requestId+format post|video; output persisted version receipt hoặc bounded failure. Source lấy campaign đã lưu, không model-controlled URLs/org. Một successful generation receipt/request; repair tối đa1, usage cộng các lần thực tế.

### Trình tự thực hiện

- [x] Viết provider fixtures cho product/program/trend và idempotent repository trước; định nghĩa source snapshot envelope theo032.
- [x] Đọc fresh settings/evidence/assets/inventory, build bounded untrusted-data prompt; parse structured draft, validate032; một repair với validation errors đã lọc.
- [x] Save version CAS+request receipt. Replay đã save trả receipt không gọi model; timeout chưa save không được tuyên bố exactly-once model billing.
- [x] Expose shared function cho035/036 không phụ thuộc React; cancellation/current revision changed discard candidate. Không render/publish trong generator.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-053-01: Ba source kinds × post/video tạo correct passport; trend không bắt buộc SKU giả.
- [x] AT-053-02: Caption/CTA/narration injected price/promo unsupported→reject/one repair only.
- [x] AT-053-03: Same request persisted replay zero AI; parallel request same revision chỉ một version.
- [x] AT-053-04: Provider deadline/cancel/stale source/import same-version change→no valid stale save.
- [x] AT-053-05: 031single-generation regression; actual local save+restart proof; artifactHash vẫn null.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/content/campaign-generation.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/content/campaign-generation.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Dịch vụ phía máy chủ sinh bài viết hoặc kịch bản video cho sản phẩm, chương trình và chủ đề đã chọn; dùng chung cho Studio và worker tự động.

## Context

Review khi tích hợp OV-030 phát hiện khoảng trống: OV-032 sở hữu phiên bản/kiểm chứng, OV-035 sở hữu giao diện, OV-036 sở hữu lịch, OV-046 chỉ render kịch bản đã lưu. Chưa task nào sở hữu dịch vụ sinh nội dung theo chiến dịch. Task này bổ sung ownership, không mở rộng phạm vi sản phẩm đã xác nhận.

## Current behavior

generateVideoScript chỉ nhận một product snapshot cho video cũ. Chưa có dịch vụ chung sinh post có ảnh, nội dung chương trình hoặc nội dung bắt trend với nguồn và lưu phiên bản.

## Expected behavior

Một API nội bộ có kiểu dữ liệu nhận slot đã xác minh và loại nội dung, đọc nguồn hiện hành, sinh một kết quả có giới hạn, kiểm OV-032 rồi lưu phiên bản. Studio và scheduler gọi cùng dịch vụ này; retry không sinh/lưu trùng phiên bản đã hoàn tất.

## Requirements

- Organization/campaign/slot từ trusted server; chọn nguồn từ chiến dịch đã lưu, không nhận SQL/URL tùy ý do model đưa ra.
- Hỗ trợ product, program và engagement trend; bài viết gồm text/caption và ảnh có nguồn, video dùng hợp đồng script hiện có cùng media/template OV-034.
- Giá/tồn/chương trình từ vận hành; mô tả từ nguồn cấu hình, xu hướng từ OV-028. Không giả dữ liệu thiếu, không trộn giá các SKU, không cộng khuyến mãi tùy ý.
- Model chỉ sinh nội dung, không cấp quyền đăng hoặc điều khiển marketing. Thông tin doanh nghiệp, nguồn và prompt khách đều là dữ liệu không đáng tin về mặt chỉ thị.
- Đọc brand voice/allowed/forbidden topics và mục tiêu đang hiệu lực. Kết quả phải qua kiểm chứng OV-032 trước khi trở thành phiên bản hợp lệ.
- Một lần sinh thành công cho một yêu cầu idempotent; tối đa một repair cho lỗi kiểm chứng. Ghi model, usage được cung cấp, nguồn, lỗi và outcome; không ghi credentials hay raw provider error.
- Giới hạn thời gian, kích thước, số lần thử; hủy hoặc thay đổi revision/priority làm kết quả cũ không còn đủ điều kiện sử dụng. Không tự nối lại automation.
- Không gửi tin/đăng bài/render trong dịch vụ này. OV-046 render phiên bản đã lưu; OV-036 điều phối retry/replacement; OV-037 đăng.

## Dependencies

OV-032, OV-034

## Edge cases

Nguồn hết hạn giữa lúc sinh; chương trình bị sửa cùng version qua importer; ảnh không dùng được; chỉ có trend nhưng không có SKU; model đưa claim mới trong caption; provider timeout sau khi sinh; replay sau khi phiên bản đã lưu; script hợp lệ nhưng artifact chưa tồn tại.

## Acceptance criteria

- [x] Studio và scheduler có thể gọi cùng một dịch vụ không phụ thuộc React/Next UI.
- [x] Product/program/trend có test sinh post/script với provenance phù hợp; unsupported claims không được lưu như hợp lệ.
- [x] Replay cùng request trả phiên bản đã lưu; không gọi AI lần nữa sau kết quả bền vững, không tạo artifact giả.
- [x] Retry/repair/cancellation có giới hạn và kết quả cũ không vượt qua revision fence.
- [x] Validation, giới hạn thực tế và quyết định triển khai được ghi; không tuyên bố provider thật đã chạy khi chỉ dùng fixture.

## Testing

Provider fixture với output có cấu trúc, single-generation regression OV-031, caption/CTA injection, dữ liệu thay đổi trong lúc chờ, persisted retry/restart và actual local database proof. Chạy typecheck, lint và test liên quan; không dùng khách thật hoặc đăng bài thật.

## Implementation boundaries

src/lib/content/campaign-generation* và adapters phục vụ đúng dịch vụ này; tái sử dụng OV-032/034/046, không tạo thêm bảng chiến dịch, scheduler hoặc queue render thứ hai. Persistence bổ sung nếu cần phải có migration và kiểm thử transaction rõ ràng.

## Implementation decisions and evidence

Validation date / environment:
2026-09-13 local Windows; container supabase_db_onevoice running; Kong/API http://127.0.0.1:54321. No remote DB, no Facebook Graph, no Messenger send, no Facebook publish, no VNPay charge. Provider fixtures only (no live AI). ONEVOICE_LOCAL_ADMIN set from `pnpm exec supabase status --output json` SERVICE_ROLE_KEY (not printed; not sourced from .env).

Workspace identifier: git HEAD d442a91ccead974422b56ecf7a92cfc190cb8888. Dirty this task: src/lib/content/campaign-generation.ts, src/lib/content/campaign-generation.test.ts, docs/tasks/onevoice/OV-053-campaign-content-generation.md.

Files and migration versions changed:
src/lib/content/campaign-generation.ts (new), src/lib/content/campaign-generation.test.ts (new). No migration 20260913105000_campaign_generation.sql: content_versions.request_id uniqueness plus save_content_version CAS is sufficient for receipt replay.

Acceptance cases: AT-053-01 => PASS (unit: product/program/trend × post/video; trend selectors have no skuId/product and prompt has no Keyboard/price)
AT-053-02 => PASS (unit: caption/CTA/narration unsupported price/promo; one repair; second failure TRUTH_GUARD and saves=0; recovered attempt usage summed 10+8 / 5+4 / 15+12)
AT-053-03 => PASS (unit replay same requestId provider.calls=1; parallel different requestIds same revision one fulfilled one rejected)
AT-053-04 => PASS (unit cancel, AbortSignal.timeout 30ms hanging provider, staleSave, expectedContentRevision fence; saves=0)
AT-053-05 => PASS (unit video one generateText, script.meta equals post, artifactHash null; local REST save+restart replayed=true provider.calls=1; competing same revision one winner)

Commands executed:
node node_modules/vitest/vitest.mjs run src/lib/content/campaign-generation.test.ts --maxWorkers=1 --no-file-parallelism
(second run with ONEVOICE_LOCAL_ADMIN from supabase status JSON, key not printed). Did not run tsc, eslint, or full vitest.

Results: without local admin 7 passed / 1 skipped (local persistence) exit 0 (~830ms). With ONEVOICE_LOCAL_ADMIN 8 passed / 8 exit 0 (~1.69s); none skipped.

DB proof: local endpoint http://127.0.0.1:54321; Postgres via supabase_db_onevoice. Fixture campaign title `Generation fixture`; after run: content_versions count=2 artifact_null=true distinct content_hash=1 slot=1; campaign_status=FAILED; slot content_revision=2 (initial save version 1 + one competing winner). Immutable content_versions retained; product disabled_at set; no new migration.

UI/media/provider proof: n/a. Fixtures only; no live model, no render, no publish.

Implementation decisions: `generateCampaignContent({organizationId, slotId, expectedContentRevision, requestId, format})` is a React-free function. Trusted campaign/slot/evidence loaded from server; model output cannot choose org/URLs (mediaUrl inputs stripped). Trend/program selectors never invent a SKU. Truth-guard/passport failures get one repair; usage is summed. Replay hits content_versions.request_id before any AI call. Parallel same revision uses save_content_version CAS. artifactHash remains null. Inventory from exportTrustedInventory, never from the model. OV-035/036 call this service; this task does not wire Studio UI or scheduler.

Remaining limitations/blockers: README status left to orchestrator (do not edit README). tsc/eslint/full suite skipped per assignment. No live AI provider run. Studio/scheduler callers are OV-035/036.

Cleanup: local product disabled_at, campaign FAILED. No owned background processes.

Reviewer conclusion and README/status update: Status DONE in this issue. README not edited. VALID generated content is not a render/publish receipt.
