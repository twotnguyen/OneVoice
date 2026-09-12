# OV-033 — Tư liệu miễn phí và quản lý nguồn

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/media/free-assets.ts + free-assets.test.ts và registry persistence; tái sử dụng src/lib/network/ public HTTPS fetch và image resolver hiện hữu. Không viết crawler mới.

### Hợp đồng đầu vào, đầu ra và persistence

Asset record gồm id/sourceUrl/provider/author/licenseId/licenseUrl/retrievedAt/contentHash/mime/dimensions/status. Chỉ free commercial-compatible license đã xác minh; free-price không bằng được phép tái sử dụng. Catalog URL và external stock phải phân biệt provenance.

### Trình tự thực hiện

- [x] Định nghĩa license allowlist và attribution requirements từ tài liệu provider; adapter có bounded search/download, SSRF guard, size/type validation.
- [x] Persist asset provenance và local immutable bytes hoặc reference đã kiểm; asset fail/expired/revoked không selectable. Không giả provider access khi thiếu key.
- [x] Cho content pipeline chọn tư liệu theo campaign, ảnh catalog ưu tiên; fallback motion-only có nguồn khi không có media phù hợp.
- [x] Thêm attribution metadata chuyển sang passport/render/publish; không mặc định quyền sử dụng video từ Facebook tham khảo.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-033-01: Unknown license/paid asset/no commercial rights→reject; attribution-required thiếu credit→reject.
- [x] AT-033-02: Private IP/redirect/oversize/wrong MIME/SVG active content→reject bằng network boundary.
- [x] AT-033-03: Same bytes retry dedup, provider timeout bounded và fallback không dùng ảnh sản phẩm khác.
- [x] AT-033-04: Real public miễn phí fixture nếu khả dụng + local registry proof; lưu source/license kiểm tra, không coi download được là license proof.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/media/free-assets.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/media/free-assets.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Product URLs ưu tiên; adapter free stock image/video có source/license/creator và commercial suitability metadata.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 33 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chỉ resolver product image allowlist.

## Expected behavior

Product URLs ưu tiên; adapter free stock image/video có source/license/creator và commercial suitability metadata.

## Requirements

Không mua tư liệu; không tải video Fanpage làm stock; generic asset không gắn như đúng SKU; SSRF/type/size/time limits; allowed hosts cấu hình.

## Dependencies

OV-028, OV-032

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/media/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Current Supabase ảnh link được chấp nhận, không bắt buộc mirror Storage.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

URL nội bộ/redirect private chặn; provider lỗi; license thiếu -> không dùng; duplicate asset cache.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task (README owned by orchestrator, not edited).
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-12, Windows, local supabase_db_onevoice + http://127.0.0.1:54321. Node vitest 5. No .env printed.
Workspace identifier: git HEAD de46270630c8f468f0ba602b11ef76618e28f01c. This task added src/lib/media/free-assets.ts, src/lib/media/free-assets.test.ts, supabase/migrations/20260912115000_free_media_assets.sql, and this issue evidence. README not edited.

Files and migration versions changed:
`src/lib/media/free-assets.ts`, `src/lib/media/free-assets.test.ts`, `supabase/migrations/20260912115000_free_media_assets.sql`. Applied locally only; recorded supabase_migrations.schema_migrations version=20260912115000 name=free_media_assets. No db reset. Did not rewrite 20260912111000 or 20260912112000.

Acceptance cases:
AT-033-01 => PASS (unknown/paid/NC/SA/free-price-without-license reject unlicensed; CC BY without author reject attribution_required; Facebook host/provider reject facebook_stock_forbidden)
AT-033-02 => PASS (validatePublicUrl/createPublicTextFetcher reject https://127.0.0.1, DNS 10.0.0.1 unsafe_address, cross-origin redirect_rejected, oversize too_large; .svg/image/svg+xml/script SVG svg_rejected; application/pdf wrong_mime)
AT-033-03 => PASS (same sha256 retry returns first id; 100ms stock hang -> motion-only timeout; other SKU catalog image not selected)
AT-033-04 => PASS (memory registry stores source/license; successful download of "free download" still unlicensed; live Wikimedia search through fetchPublicText with ONEVOICE_PUBLIC_HTTP_PROOF=1; download is not license proof)

Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/media/free-assets.test.ts --maxWorkers=1 --no-file-parallelism
ONEVOICE_PUBLIC_HTTP_PROOF=1 node node_modules/vitest/vitest.mjs run src/lib/media/free-assets.test.ts --maxWorkers=1 --no-file-parallelism
```
SQL apply of 20260912115000_free_media_assets.sql via docker exec -i supabase_db_onevoice psql. Constraint smoke in a rolled-back transaction.

Results: first vitest exit 0, 13 passed / 1 skipped (live Wikimedia). With ONEVOICE_PUBLIC_HTTP_PROOF=1: exit 0, 14 passed / 0 skipped. tsc/eslint/full suite skipped per assignment.

DB proof: local endpoint http://127.0.0.1:54321; Postgres supabase_db_onevoice. service_role insert privilege on free_media_assets=false; authenticated select=false. register_free_media_asset idempotent on content_hash (second id ignored, returned c0330000-0000-4000-8000-000000000001). revoke -> list_usable_free_media_assets=[]. Facebook URL 42501; stock+skuId 22023; CC BY without attribution check_violation. Fixtures rolled back.

UI/media/provider proof: Wikimedia Commons search over public-http (no API key). PEXELS_API_KEY missing; UNSPLASH_ACCESS_KEY missing. searchStock("pexels"|"unsplash") throws missing_provider_key with those exact names and invents no licensed hits. Authenticated Pexels/Unsplash HTTP is not sent through public-http (no caller headers).

Implementation decisions: exported evaluateLicense, ingestAsset, searchStock, resolveCampaignMedia, createMemoryRegistry, mediaAttribution, resolveWithRemoteImage, toRegisterPayload. License allowlist cc0-1.0/cc-by-4.0/cc-by-3.0/public-domain/pexels/unsplash plus first-party catalog. CC BY-SA/NC/ND and paid/unknown rejected. Catalog provenance requires skuId; stock skuId is always null. Image bytes go through injected RemoteImageResolver; metadata search uses fetchPublicText. Timeout capped at 8000ms. SQL RPCs register_free_media_asset / list_usable_free_media_assets / revoke_free_media_asset are security definer, service_role execute only.

Remaining limitations/blockers: PEXELS_API_KEY and UNSPLASH_ACCESS_KEY are missing so those providers stay fail-closed (exact names above). Raster-only ingest (jpeg/png/webp); stock video is not downloaded. mediaAttribution is for later passport/render/publish — those modules were not edited. Status left IN_PROGRESS; README not updated.

Cleanup: SQL smoke rolled back. No extra processes. Live Wikimedia used public metadata only.

Reviewer conclusion and README/status update: leave Status IN_PROGRESS for orchestrator verification. README not edited.
