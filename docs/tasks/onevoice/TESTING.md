# OneVoice — tiêu chuẩn kiểm thử và Definition of Done

Tài liệu này là gate chung của 53 issue. Các AT-xxx trong từng issue là test cụ thể bổ sung, không thay gate này. Không chạy tài chính/thông điệp/bài đăng thật làm fixture.

## 1. Phân loại bằng chứng

| Lớp | Chứng minh | Không chứng minh |
|---|---|---|
|Unit với injected clock/provider|Domain rules, output parsing, retry bounds|DB lock, provider permissions, delivery|
|Local SQL/REST|RLS, grants, RPC, atomicity, actual database shape|Remote deployment đã migrate|
|Hai DB connections/worker restart|Race, lease, durable recovery|Exactly-once external provider effect|
|Browser local|Role/UI flow và persistence qua HTTP|Meta native inbox/thread đúng khách|
|Linux real media|Actual MP4/manifest/visual/audio|Facebook upload/publish thành công|
|Provider sandbox/tester|Contract/permission/callback trên tài khoản được phép|Production approval cho mọi khách|
|Release E2E|Toàn hành trình trên version và mode được ghi|Các case bị skip hoặc chưa chạy|

## 2. Commands chuẩn

Chạy tại D:\Documents\CODE\OneVoice; xác nhận Node/pnpm từ package/lockfile. Không cài nâng dependency để che test lỗi.

```powershell
git status --short
git diff --stat
node --version
pnpm --version
node node_modules/typescript/bin/tsc --noEmit
```

Vitest: dùng exact paths của issue; ví dụ hiện có017/032:

```powershell
node node_modules/vitest/vitest.mjs run src/lib/consultation/planner.test.ts src/lib/consultation/worker.test.ts src/lib/knowledge/descriptive-policy.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/vitest/vitest.mjs run src/lib/content/passport.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/eslint/bin/eslint.js src/lib/consultation/planner.ts src/lib/content/passport.ts --max-warnings=0
git diff --check
```

Đổi danh sách lint/test theo **mọi file thực tế đã sửa**, không chỉ ví dụ. Test mới có đường dẫn dự kiến trong issue phải được tạo. Không test.skip hoặc tăng timeout chỉ để đạt; khi test media cần budget khác phải chứng minh thời gian subprocess thực tế và vẫn giữ assertions.

Full suite dành integration milestone/release, không lặp vô ích sau mỗi edit:

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --no-file-parallelism
node node_modules/eslint/bin/eslint.js . --max-warnings=0
```

Nếu Windows thiếu Linux media prerequisites: ghi exact failed/skipped cases, chạy môi trường Dockerfile.test theo docs/development/linux-media-tests.md; không báo full suite PASS từ targeted tests.

## 3. SQL local và concurrency

- Xác nhận Supabase URL local, container owner và migration history trước write. Không db reset/db push/remote migration; không tự apply tất cả migration còn uncommitted của agent khác.
- Dùng database fixture ID riêng với organization scope. PostgreSQL UUID legacy có thể không qua z.uuid(); dùng postgresUuid helper hiện hữu.
- Fixture có specs dạng array thật, variant options, null stock, expired source, inactive staff và retained audit history; không chỉ object rỗng/happy path.
- Dùng SQL transaction rollback khi không kiểm cross-connection. Cross-connection fixtures phải ghi namespace và cleanup an toàn; immutable audit/history có thể giữ nhưng fake Auth phải disable/delete theo FK rules.
- Exit code psql=0 không đảm bảo pgTAP pass. Kiểm cả dòng not ok và plan/count mismatch.

Ví dụ chạy suite hiện có, sau khi operator/agent đã xác nhận đúng container local:

```powershell
$taskSqlOutput = Get-Content supabase/tests/consultation.test.sql |
  docker exec -i supabase_db_onevoice psql -X -At -U postgres -d postgres -v ON_ERROR_STOP=1 2>&1
$taskSqlExit = $LASTEXITCODE
$taskSqlOutput
if ($taskSqlExit -ne 0 -or ($taskSqlOutput | Out-String) -match '(?m)^not ok|Looks like you failed|Bad plan') {
  throw 'SQL validation failed'
}
```

Giữ raw TAP totals và expected assertion count trong evidence; thiếu finish/plan output là lỗi, không mặc định pass.

Race phải dùng hai connections thật với barrier/lock, không Promise.all trên pure mock. Bắt buộc cho inventory last-unit, payment/expiry, claim/lease, CAS/revision. Assert final rows+audit counts+stock invariants, không chỉ HTTP200.

Client abort chỉ chứng minh caller ngừng đợi. Muốn claim database timeout/cancellation phải quan sát actual PostgREST/query session; function SET statement_timeout không đủ.

## 4. Local integration opt-in

Đọc header/environment guard từng .local.test.ts và scripts/verify-*-local trước chạy; không tự source .env. Ví dụ guard017 hiện dùng ONEVOICE_LOCAL_CONSULTATION_PROOF=1, nhưng phải kiểm source lại vì interface có thể đổi. Set env tạm theo script, restore sau run. Repository mocks không thay actual REST test.

017 cần planner+worker+SQL+scripts/verify-consultation-local.mjs và actual local REST.032 cần passport+version-repository.local.test.ts+content-versions SQL, bao gồm real array specs và expiry lock race. Không chạy unfinished migration không thuộc ownership.

## 5. UI, media và provider gates

UI: manager/staff/inactive/anonymous; loading/empty/error/conflict; double click; reload/resume; actual HTTP response and DB persistence. Keyboard focus/form validation nếu có modal mới. Fake auth API tạo fixture được phép local; không dùng credentials thật.

Media: real render, ffprobe H.264/yuv420p1080x1920 và duration theo script, actual audio track; nghe narration/voice và xem keyframes. Ghi content/template/media/artifact hash, clip source/license. Kiểm manifest recovery và không double generation. Không dùng byte size làm proof deterministic identical video.

Provider: đọc official current docs trước code; ghi URL/date/version/permission/error contract. Fake transport cho red/green tests, sandbox/tester cho acceptance yêu cầu external. Không có quyền/config thì BLOCKED, không đăng ký dịch vụ trả phí hoặc gửi khách thật. UNKNOWN outcome không blind retry; không tuyên bố exactly-once send nếu provider không hỗ trợ.

## 6. Evidence mẫu bắt buộc trong từng issue

```text
Validation date / environment:
Workspace identifier: git HEAD + dirty file list/hash hoặc artifact snapshot
Files and migration versions changed:
Acceptance cases: AT-xxx-01 ... => PASS/FAIL/BLOCKED + evidence path
Commands executed:
Results: exit code, test files/tests/assertions, skipped with reasons
DB proof: local endpoint (no secret), fixture namespace, race final invariants
UI/media/provider proof: mode, screenshots/logs/artifact hashes, sanitized IDs
Implementation decisions: actual exported contract and caller wiring
Remaining limitations/blockers:
Cleanup: fixture state and any running processes owned by this task
Reviewer conclusion and README/status update:
```

Không điền PASS vào mẫu trước chạy. Lưu sanitized logs dưới docs/tasks/onevoice/evidence/ khi cần; không lưu token, PII hay media dung lượng lớn trong repo.

## 7. Definition of Done

- Mọi AT của issue đạt; Requirements/Expected behavior được wired vào caller thực tế, không chỉ helper độc lập.
- TSC và scoped lint pass; relevant regression tests pass; database/UI/media/provider gates tương ứng đủ evidence.
- Test mới đã thấy fail đúng behavior thiếu trước implementation; nếu khôi phục code dang dở đã có fix, ghi regression pass và lý do không còn red, không giả tạo lịch sử.
- Không skip để làm xanh, không mock lại thuật toán rồi test mock, không coi success HTTP là transaction correctness.
- Không regress quyền/identity/freshness/lease/idempotency; secrets không ra client/log.
- Diff giữ user changes; newly discovered scope có issue và dependency.
- Exact implementation decisions, test outputs, limitations được ghi; README status đồng bộ. Thiếu external gate bắt buộc => BLOCKED, chưa DONE.

## 8. Bằng chứng lịch sử không được đánh đồng với HEAD hiện tại

Snapshot Linux trước đây:890 tests pass/4 opt-in skipped với media test deadline đã có giải thích; snapshot đó có trước các thay đổi consultation/content mới. SQL regression501 assertions/18 suites cũng có phạm vi lịch sử và chưa bao trùm mọi schema dang dở. Agent nhận bàn giao phải chạy lại phần mình sửa; release phải kiểm whole current workspace. Phiên soạn tài liệu này không tuyên bố runtime tests mới.
