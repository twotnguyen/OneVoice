# OV-048 — Quản lý tài khoản nhân viên

## Status

DONE

## Objective

Người quản lý cấp/khóa tài khoản và thay vai trò qua giao diện có audit, không public signup.

## Context

Tách khỏi OV-006 khi triển khai để login/session và account lifecycle có acceptance riêng; không thêm yêu cầu sản phẩm mới.

## Current behavior

OV-005 chỉ schema và bootstrap hạ tầng; chưa UI quản lý account.

## Expected behavior

Manager xem danh sách staff, thêm account, đổi role, disable/enable; staff bị từ chối. Phiên bị disable không được tiếp tục truy cập nội bộ.

## Requirements

src/app/(app)/settings/staff/, src/app/api/staff/, src/lib/auth/staff-admin.ts. Server xác minh manager+scope. Không tự disable/demote manager cuối cùng (transaction lock); mutation profile+audit cùng transaction; Auth Admin create và DB có compensation/idempotency, không để user mồ côi tự được quyền. Không log mật khẩu. Local tests chỉ tài khoản giả, không email/gửi thư thật. Bootstrap đầu tiên vẫn qua hướng dẫn deployment.

## Dependencies

OV-005, OV-006, OV-007, OV-009

## Edge cases

Hai manager đồng thời tự hạ quyền, account Auth tạo thành công nhưng profile lỗi, email trùng, profile khác installation, session revoked giữa request.

## Acceptance criteria

- [x] UI/API cấp và thu hồi quyền đúng actor; không public signup.
- [x] Last manager invariant và audit transaction có local integration proof.
- [x] Không lộ credentials; errors không enumerate email người ngoài.

## Testing

Route permission tests và local Supabase Auth fixture; concurrency SQL last-manager; browser manager tạo/disable staff và staff bị chặn. Chạy lint/typecheck/tests liên quan.

## Implementation decisions and evidence

Tách task trước code để tránh gộp session và quản trị account; chưa triển khai.


Implementation evidence (2026-09-12): manager-only API/page and staff role/enable/disable edits use fresh guards and transactional SQL rechecks. Per-organization serialization protects the last active manager; optimistic versions and request receipts protect retries. Creation reserves a server UUID and private ownership marker before Auth Admin createUser (email_confirm:true, no email), reconciles only that identity, and atomically completes profile+audit. A pending Auth identity has no staff profile/access. The manager can reopen their own pending requests after refresh using the original password. No password is persisted or logged; a keyed request digest binds credentials.

Validation: 8 focused staff-admin Vitest tests plus 20 existing session tests pass; 16 local pgTAP assertions pass; scoped ESLint passes. Persisted local-only script proves actual Auth create/replay, interrupted completion recovery, duplicate-email non-adoption, pending ownership/privacy, existing-token disable/enable, and two genuinely overlapping PostgreSQL self-demotion transactions. Synthetic Auth users are removed; synthetic audit evidence is retained. Parent browser verified list/select/update and creation form. Independent reviewer accepted source and independently ran 8 tests +16 SQL assertions. Whole-project typecheck was temporarily blocked only by concurrent OV-050 code at the final scoped check.

Reproduce the actual local integration in PowerShell (never loads `.env`):
```powershell
pnpm exec esbuild scripts/verify-staff-admin-local.ts --bundle --platform=node --format=esm --packages=external --outfile=tmp/verify-staff-admin-local.mjs
$staffLocalStatus = (& pnpm exec supabase status -o json | Out-String | ConvertFrom-Json)
$env:ONEVOICE_LOCAL_ADMIN = $staffLocalStatus.SERVICE_ROLE_KEY
try { node tmp/verify-staff-admin-local.mjs; if ($LASTEXITCODE -ne 0) { throw 'Local staff verification failed' } }
finally { Remove-Item Env:ONEVOICE_LOCAL_ADMIN }
```
The script hardcodes localhost Supabase and the local Docker database, sends no email and never uses remote Auth credentials.

Parent reran documented actual local Auth and two-session concurrency script successfully. Browser manager list/select/edit display name saved successfully; new-account form renders required fields and default staff role. Credential creation, duplicate rejection, disable/enable and interrupted request recovery verified through actual local Auth/repository plus route guards; no browser password creation claimed. Disposable browser Auth user could not be deleted because completed handoff history references its ID; it was disabled and Auth-banned in local DB, preserving history. Independent reviewer accepted source/API/SQL boundaries;8 targeted tests and16 SQL assertions passed, broader session suite28.
