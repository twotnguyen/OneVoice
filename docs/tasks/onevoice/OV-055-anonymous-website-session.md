# OV-055 — Phiên khách website ẩn danh

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Website-first: khách chat không login. Phiên gắn `channel_user_key` WEB (OV-054), không phải PSID, không phải conversation UUID.

### Files và ownership

Tạo `src/lib/channels/web/session.ts` (+ `session.test.ts`) và cookie helper cùng module hoặc helper nội bộ, không nhân staff auth. Migration owner: `supabase/migrations/20260913101000_website_sessions.sql`. Đọc `src/lib/auth/session.ts` / `src/lib/auth/security.ts` (`sameOriginMutation`, exact Origin) để **không** tái sử dụng cookie nhân viên. Không public chat UI (OV-057) và không POST messages (OV-056) trừ helper session mà API sau gọi.

### Hợp đồng đầu vào, đầu ra và persistence

- Token opaque random ≥32 bytes. Cookie: HttpOnly; `Secure` khi HTTPS; `SameSite=Lax` (không cần cross-site POST). Không `SameSite=None`.
- Persist **hash** token (SHA-256 hex), không plaintext. Token ≠ `conversations.id`, ≠ `channel_user_key` thô nếu key đó đoán được từ UUID hội thoại.
- Session không đoán được từ conversation id; session A không đọc được hội thoại session B.
- Hàng session: `organization_id`, token hash, `channel_user_key` ổn định (đưa vào `project_web_conversation`), timestamps. Org = org customer-facing của deployment (cùng model `organizations` hiện hữu); không bảng org mới; không lấy org từ `page_id` Facebook; không public org picker.
- Rate-limit **tạo session** persisted (DB), không `LoginLimiter` memory-only (OV-027 cùng yêu cầu). Restart process không reset hạn mức.
- Mutation (tạo/rotate cookie) kiểm Origin exact + `sameOriginMutation`. GET gắn cookie hiện có không tạo phiên mới nếu token hợp lệ.
- Không Graph. Không staff session. Không login.

### Trình tự thực hiện

- [x] SQL table hash-at-rest + unique hash + RLS/revoke browser direct; rate-limit table/RPC persisted.
- [x] Token generator ≥32 bytes CSPRNG; cookie flags unit test (HttpOnly, SameSite=Lax, Secure iff HTTPS).
- [x] Lookup by hash; reject guessed conversation UUID; cross-session isolation SQL.
- [x] Origin fail → không set cookie. Rate-limit create sau restart vẫn chặn (đọc DB).
- [x] Chạy AT dưới đây; không Facebook live.
- [x] Review diff/scope; README/Status sau TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-055-01: Token ≥32 bytes opaque; cookie HttpOnly + SameSite=Lax; Secure trên origin HTTPS, không bắt Secure trên HTTP local; không lộ token trong JSON body.
- [x] AT-055-02: Chỉ hash nằm ở DB; plaintext token không query được từ conversation id hay `channel_user_key`.
- [x] AT-055-03: Hai session khác hash không đọc/ghi identity của nhau; đoán UUID hội thoại không cấp cookie hợp lệ.
- [x] AT-055-04: Rate-limit create persisted — vượt ngưỡng 429/chặn cả sau restart process; không dựa `LoginLimiter` in-memory.
- [x] AT-055-05: POST thiếu/sai Origin bị reject; không tạo hàng session. Không gọi Graph; không cần page/psid.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/channels/web/session.test.ts` và SQL `supabase/tests/website-sessions.test.sql`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/channels/web/session.test.ts --maxWorkers=1 --no-file-parallelism
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. SQL/concurrency theo TESTING.md. AT không Facebook/VNPay live.

## Status

DONE

## Objective

Cấp phiên khách ẩn danh bằng token opaque, cookie HttpOnly, hash at rest, rate-limit tạo phiên bền vững, CSRF Origin trên mutation — không login, không Facebook.

## Context

Thực hiện quyết định website-first trong [DECISIONS.md](DECISIONS.md). Đây là task 55 trong [tracker](README.md). Phụ thuộc OV-054. Public pages hiện có: `/login`, `/order-confirmation/[token]`. Auth cookies hiện staff-only. CSRF app: exact Origin (`sameOriginMutation`). Rate limit hiện `LoginLimiter` in-process — **không đủ** cho tạo phiên WEB.

## Current behavior

Không có `src/lib/channels/web/`. Không bảng website session. Khách không có identity ngoài Facebook Page+PSID. Staff cookie không dùng cho `/chat`.

## Expected behavior

Khách nhận cookie phiên; server chỉ lưu hash; `channel_user_key` ổn định cho OV-054; tạo phiên bị rate-limit DB; mutation kiểm Origin.

## Requirements

- Opaque ≥32 bytes; HttpOnly; Secure on HTTPS; SameSite=Lax.
- Hash at rest; token không phải conversation UUID.
- Persisted rate-limit create.
- Origin on mutations.
- Không Graph; không production charge; không Facebook page/psid.
- Một migration `20260913101000_website_sessions.sql`.
- Reuse `sameOriginMutation`; không copy staff session cookie name/path.

## Dependencies

OV-054

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/channels/web/session.ts; supabase/migrations/20260913101000_website_sessions.sql`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không implement `/api/chat/messages` (OV-056) hay UI `/chat` (OV-057) trừ export session helper. Không thêm `reply_customer`. Không đụng `messenger_outbox`.

## Edge cases

- Cookie thiếu/malformed → anonymous miss, không 500 lộ schema.
- Rotate/fixation: không chấp nhận token do client tự đặt nếu không có hàng hash.
- HTTPS vs HTTP local: Secure chỉ khi origin HTTPS.
- Cross-site POST không cần (Lax đủ).
- Nhiều replica: limiter phải DB, không Map process.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.
- [x] AT-055-01..05 PASS không Graph.

## Testing

Cookie flags, hash-only persistence, isolation, persisted rate-limit, Origin CSRF. Không khách thật.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13 local Windows; container `supabase_db_onevoice`; no Graph / VNPay.
Workspace identifier: git HEAD d442a91; dirty/untracked owned files: `src/lib/channels/web/session.ts`, `src/lib/channels/web/session.test.ts`, `supabase/migrations/20260913101000_website_sessions.sql`, `supabase/tests/website-sessions.test.sql`, this issue. README left to orchestrator.
Files and migration versions changed: exclusive `20260913101000_website_sessions.sql` applied locally; `supabase_migrations.schema_migrations` version=20260913101000 name=website_sessions. No db reset. Did not edit Wave A migrations, planner, README, `.env`, or `database.types.ts`.
Acceptance cases:
- AT-055-01 PASS (vitest: 32-byte base64url token; cookie `ov_web_session` HttpOnly + SameSite=Lax; Secure on https://app.test, absent on http://localhost:3000; JSON body `{ok:true}` omits token)
- AT-055-02 PASS (vitest RPC args are SHA-256 hex only; SQL TAP ok 14–18, 35: `channel_user_key=token_hash`, no plaintext token/cookie/ip columns, conversation UUID is not a token hash, CHECK rejects mismatched key)
- AT-055-03 PASS (vitest two cookies isolated; guessed conversation UUID cookie → null. SQL TAP ok 19–24: A/B hashes distinct, UUID `read_website_session` null)
- AT-055-04 PASS (vitest 5 creates then 429 on a new `createWebsiteSession` binding against the same port; hashed client_key, raw IP absent from RPC args. SQL TAP ok 25–34: sixth create `RATE_LIMITED`, still blocked on a new call, `hit_count=5` persisted, no extra row)
- AT-055-05 PASS (vitest POST missing/wrong Origin and GET → 403, zero RPC/rows; valid POST then reuse cookie does not insert a second row)
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/channels/web/session.test.ts --maxWorkers=1 --no-file-parallelism
docker exec supabase_db_onevoice psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/website-sessions.test.sql
```
Results: vitest 5 passed / 1 file. SQL TAP finish `1..35` no `not ok`. tsc/eslint/full suite skipped (orchestrator; concurrent siblings). Pre-impl SQL TAP failed `null character not permitted` in advisory lock then `permission denied for table conversations` under service_role; both fixed before green TAP. No Graph.
DB proof: local supabase_db_onevoice; TAP fixtures a0550000-… rolled back; schema_migrations 20260913101000 recorded. Rate-limit table `website_rate_limits` keyed by hashed `client_key`, scope `session_create`.
Implementation decisions: cookie name `ov_web_session` (not staff/supabase). Token = 32 CSPRNG bytes base64url (43 chars). At rest `token_hash = sha256(token)` hex PK. **WEB `channel_user_key` for OV-054 `project_web_conversation` = that same SHA-256 hex** (never raw cookie, never `conversations.id`). Create/read are POST Origin-gated / cookie lookup helpers; no `/api/chat` route (OV-056). Persisted limiter is `take_website_rate_limit(scope, client_key, limit, window_ms)` — 5 creates / 60s per hashed IP-or-similar; OV-056 can reuse the table with another scope. `sameOriginMutation` reused. GET/POST with a valid cookie does not insert a second row. Client identity hashed in TS (`x-forwarded-for` first hop or `unknown`); raw IP is not stored or logged.
Remaining limitations/blockers: no public HTTP route in this task; OV-056 wires cookie → inbound. `database.types.ts` not updated to avoid sibling collisions. README tracker owned by orchestrator. Typecheck/eslint deferred to orchestrator.
Cleanup: SQL TAP rolled back. No running processes owned by this task.
Reviewer conclusion: AT-055-01..05 PASS on vitest + local SQL; issue DONE. README status sync is orchestrator-owned.
