# OV-050 — Nạp và làm mới tri thức có nguồn

## Status

DONE

## Objective

Tạo phiên bản tri thức có thể truy xuất từ registry.

## Context

Bổ sung để sửa diễn giải DB-only trái lời cuối cuộc phỏng vấn. Xem DECISIONS.md; phạm vi nguồn cụ thể là mặc định kỹ thuật, không phải xác nhận mới.

## Current behavior

Chưa fetch/index nguồn tri thức ngoài catalog.

## Expected behavior

Job nạp text hoặc HTTPS HTML, chuẩn hóa nội dung/chunks và lưu nguồn/version/hash/fetchedAt/expiresAt; refresh có giới hạn, nguồn lỗi/hết hạn không dùng làm facts.

## Requirements

Chỉ nguồn active đã cấu hình; DNS/redirect SSRF kiểm mỗi hop, giới hạn bytes/time/MIME, không browser credentials. HTML loại scripts/styles; nội dung là dữ liệu không system instructions. Publish phiên bản nguyên tử, giữ bản cũ cho lịch sử nhưng không phục vụ nếu stale/disabled. Queue theo source/version, dedup; status/failure-safe code hiển thị manager. Retrieval tại OV-016 dùng bounded text search, không bắt buộc embeddings.

## Dependencies

OV-012, OV-049, OV-052

## Edge cases

Nguồn đổi trong lúc nạp; URL đổi DNS; source tắt; text chứa prompt injection; refresh lỗi; nội dung thiếu product mapping.

## Acceptance criteria

- [x] Expected behavior và Requirements đầy đủ trong phạm vi.
- [x] Testing có bằng chứng, không lộ credentials hoặc ghi nguồn thật khi test.
- [x] Nguồn mới tích hợp theo dependency, không giả định runtime đã hoàn tất chỉ từ schema.

## Testing

Local HTTP port fixtures với transport injection kiểm SSRF/redirect/caps; SQL atomic version swap; retry/deadletter; inactive/stale không truy xuất; không truy cập dữ liệu khách thật. Vitest, typecheck, scoped lint và local SQL tương ứng.

## Implementation decisions and evidence

Implemented boundary: registry text hoặc HTTPS HTML qua `fetchPublicText`; UTF-8/plain text hoặc HTML, 512 KiB transport, 200k normalized characters, ≤100 chunks ×2000 UTF-16 units (không cắt surrogate pair). HTML parse5 chạy trong worker thread riêng với deadline 1500ms, heap 64+16MiB và stack 2MiB; bỏ scripts/styles/template/hidden content, không thực thi hay xem nội dung như instructions. Published records/chunks giữ bất biến, có source document/version/hash/URL/fetchedAt/expiresAt. Mọi read kiểm source active/current/fresh; lần refresh mới pending hoặc lỗi cũng chặn fallback bản cũ (conservative default).

Job integration: `knowledge_ingest` dùng business_jobs lease/heartbeat/finish và claim riêng; generic pump bỏ qua kind này. Worker opt-in kiểm due sources mỗi 60 giây, tối đa20 nguồn mỗi vòng, một handler đang chạy; dedup source/version/15-minute cycle, tối đa3 attempts với backoff chung. Manager API chỉ enqueue, không chạy fetch trong request. SQL publish kiểm lại lease sau khi chờ source lock và trước commit; nguồn đổi/tắt hoặc lease hết hạn không publish. UI nguồn cho manager hiển thị trạng thái/lỗi safe code và yêu cầu refresh; không có AI/retrieval ranking trong task này.

Deployment opt-in (chưa tự chạy process): inject `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` vào môi trường đúng deployment, chạy `pnpm build:knowledge-worker` để tạo cả `dist/knowledge-ingestion.js` và `dist/knowledge-parser.js`, rồi đặt `ONEVOICE_KNOWLEDGE_WORKER=1` và chạy `pnpm start:knowledge-worker`. Giữ hai artifacts cùng thư mục. Không tự đọc `.env`; không bật worker ở route. Worker đã kiểm startup/polling/shutdown bằng compiled artifact trên local Supabase, không có active source lúc smoke. Windows smoke phát event SIGTERM bên trong child để kiểm callback shutdown; không tuyên bố đã kiểm OS signal delivery trên Linux.

Validation: 30 targeted Vitest (ingestion + jobs), full TypeScript, scoped ESLint pass; 44 local PostgreSQL assertions pass. Actual two-connection source-lock wait past lease expiry: RED published incorrectly, GREEN false/no ingestion. UUID default-org regression RED/GREEN. Pathological 450k-byte deeply nested HTML previously blocked main event loop; isolated-parser regression now rejects within deadline while main event loop remains responsive. Local REST fixture proves enqueue/dedup/claim/text + compiled isolated HTML parser/publish/finish/current retrieval/version invalidation and actual default-org scope; HTML transport injected, no external fetch. Immutable fixture history retained with source and fixture staff disabled afterward. Independent review012 accepted all three corrections. Migration107000 applied exactly to local DB and history repaired; no remote migration.

Reproduce local proof (PowerShell, no credentials printed):

```powershell
pnpm build:knowledge-worker
node node_modules/esbuild/bin/esbuild scripts/verify-knowledge-ingestion-local.ts --bundle --platform=node --target=node24 --format=esm --outfile=dist/verify-knowledge-ingestion-local.js
$knowledgeLocalStatus = pnpm exec supabase status -o json | ConvertFrom-Json
$env:ONEVOICE_LOCAL_ADMIN = $knowledgeLocalStatus.SERVICE_ROLE_KEY
node scripts/verify-knowledge-worker-local.mjs
node dist/verify-knowledge-ingestion-local.js
Remove-Item Env:ONEVOICE_LOCAL_ADMIN
node supabase/tests/knowledge-ingestion-concurrency.mjs
```

Worker smoke refuses to run if any source is active, so do not disable real records merely to run it. Parent final acceptance/UI/API review remains responsible for marking DONE.

Parent acceptance: independent reviewer accepted canonical org UUID, post-lock lease expiry and bounded isolated HTML parser fixes. Parent reran18 ingestion tests and all16 local SQL suites446 assertions (including44 ingestion). Compiled worker/process and actual REST proofs recorded above were executed by implementer and inspected by independent reviewer. Runtime is explicitly opt-in; no live business source fetched in proof.

Parent UI review: trạng thái chờ và mô tả xử lý dùng ngôn ngữ nghiệp vụ, hướng dẫn vận hành worker nằm trong tài liệu deployment; không thay đổi luồng xử lý.
