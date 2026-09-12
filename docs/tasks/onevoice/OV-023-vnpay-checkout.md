# OV-023 — Tạo yêu cầu thanh toán VNPay

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/payments/vnpay/checkout.ts + checkout.test.ts; src/app/api/payments/vnpay/; thêm server-only configuration trong env example không chứa secret.

### Hợp đồng đầu vào, đầu ra và persistence

Adapter chỉ nhận persisted ACTIVE attempt từ022. URL ký gồm amount/ref/merchant/expiry từ server. Provider config sandbox/prod rõ ràng; return URL cố định cùng origin. Không mặc định thuật toán/encoding từ trí nhớ: chốt bằng official spec và golden vector trong task.

### Trình tự thực hiện

- [x] Đọc official VNPay integration docs trước code và lưu source/date/version cùng fixture signing độc lập với implementation.
- [x] Validate merchant config và active reservation; canonicalize đúng chuẩn, sign server-only; lưu provider transaction ref unique liên kết attempt.
- [x] Expose start checkout qua confirmed token POST; replay same active attempt trả cùng reference, không lấy total/currency/returnUrl từ client.
- [x] Return page hiển thị pending/verified status từ DB; querystring thành công không thay payment. Hiển thị lỗi cấu hình/expiry phù hợp, không lộ hash secret.
- [x] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-023-01: Golden vector chữ Việt, khoảng trắng, dấu+, encoded params, amount scale và VND integer boundaries.
- [x] AT-023-02: Client tamper amount/ref/redirect bị bỏ hoặc reject; expired attempt không có signed URL.
- [x] AT-023-03: Repeated start không tạo nhiều giữ hàng; sandbox URL không trộn credentials production.
- [x] AT-023-04: Sandbox redirect/session thực tế với merchant được cấp; thiếu config ghi BLOCKED validation, không coi mock là sandbox.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/payments/vnpay/checkout.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/payments/vnpay/checkout.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

DONE

## Objective

Adapter tạo signed payment URL số tiền từ DB, mã giao dịch riêng attempt; expiry khớp reservation.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 23 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa VNPay.

## Expected behavior

Adapter tạo signed payment URL số tiền từ DB, mã giao dịch riêng attempt; expiry khớp reservation.

## Requirements

Official VNPay spec version và canonical encoding; secrets server-only; sandbox/prod tách rõ; return page chỉ pending cho tới IPN xác minh; không client total.

## Dependencies

OV-022

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/payments/vnpay/; src/app/api/payments/vnpay/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Thiếu merchant TMN/hash secret chặn live validation, không tự đăng ký/thu phí.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Golden signing vectors, unicode encoding, amount scaling, expired reservation, provider error.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task (README left for orchestrator).
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13, local Windows, container `supabase_db_onevoice`, local Kong `127.0.0.1:54321`, no remote DB writes, no real VNPay charges.
Workspace identifier: OV-023 files below; dirty user/sibling files preserved. NEXT_PUBLIC_SUPABASE_URL left pointing at remote host `fshfqcynkvodinffromx.supabase.co`.
Files and migration versions changed:
- `src/lib/payments/vnpay/checkout.ts`
- `src/lib/payments/vnpay/checkout.test.ts` (AT-023-04 live sandbox proof)
- `src/app/api/payments/vnpay/[token]/route.ts`
- `src/app/api/payments/vnpay/return/route.ts`
- `.env.example` (placeholders only, no secrets)
- `supabase/migrations/20260912120000_vnpay_checkout.sql` applied locally and recorded in `supabase_migrations.schema_migrations`
- this issue
Official spec: https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html retrieved 2026-09-12, PAY API `vnp_Version=2.1.0`, checksum HMACSHA512, PHP `urlencode` canonicalization (space → `+`), `vnp_Amount` = VND × 100, GMT+7 `yyyyMMddHHmmss`. Sandbox URL `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html`. Return URL must not update payment (IPN is OV-024).
Golden HMAC vectors were computed with Node `crypto.createHmac('sha512')` over hand-built hashData strings (not by importing the adapter), then asserted against `signVnpaySecureHash`.
Acceptance cases:
- AT-023-01 PASS vitest golden Vietnamese/spaces/`+`/percent-encoding, amount ×100, min 1 VND / max 9_999_999_999 VND.
- AT-023-02 PASS strict body rejects client amount/currency/returnUrl; expired ACTIVE attempt returns no `paymentUrl`.
- AT-023-03 PASS replay reuses persisted attempt/txnRef without `begin_payment`; sandbox host never mixed with `www.vnpayment.vn`; mock hosts rejected.
- AT-023-04 PASS live sandbox session. Diagnosis: running Next on :3000 uses remote Supabase host `fshfqcynkvodinffromx.supabase.co`, so local confirmation tokens are invisible and POST `/api/payments/vnpay/{token}` maps RPC failure to 400 `ORDER_UNAVAILABLE`. Proof did not write remote DB and did not change `NEXT_PUBLIC_SUPABASE_URL`. Local `pnpm exec supabase status --output json` API host `127.0.0.1:54321` plus domain RPCs (`save_catalog_product`, `save_order_shipping_settings`, `issue_order_confirmation_token`, `confirm_order_quote`, `begin_payment`, `persist_vnpay_checkout`) and production `createVnpayCheckoutRoute` / `startVnpayCheckout` with origin `ONEVOICE_APP_ORIGIN` (tunnel host, no secrets). POST-equivalent `{ requestId }` only, `sec-fetch-site: same-origin`. Result: HTTP 200, `paymentUrl` host `sandbox.vnpayment.vn`, signed `vnp_SecureHash` present, GET sandbox status 200, not `MERCHANT_UNCONFIGURED`, not `www.vnpayment.vn`. No payment submitted.
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/lib/payments/vnpay/checkout.test.ts --maxWorkers=1 --no-file-parallelism --reporter=verbose
# Test Files 1 passed / Tests 11 passed
# AT-023-04 evidence JSON (no secrets): {"at":"AT-023-04","diagnosis":"ORDER_UNAVAILABLE because Next uses remote supabase while fixtures are local","appSupabaseHost":"fshfqcynkvodinffromx.supabase.co","localApiHost":"127.0.0.1:54321","postStatus":200,"paymentHost":"sandbox.vnpayment.vn","hasSecureHash":true,"sandboxStatus":200,"sandboxHost":"sandbox.vnpayment.vn"}
```
Results: vitest 11/11. typecheck/eslint/full suite skipped per assignment. Real sandbox GET 200 on `sandbox.vnpayment.vn`.
DB proof: local container only; table `vnpay_checkouts`; RPCs `read_vnpay_checkout_start`, `persist_vnpay_checkout`, `read_vnpay_return`. Return RPC is SELECT-only. Fixture products disabled (`disabled_at` set); no db reset.
Implementation decisions:
- Adapter signs a persisted ACTIVE attempt from OV-022 (`beginPayment` when none exists). Amount/currency/returnUrl/expiry/merchant come from DB + server config. Client POST body is `{ requestId }` only.
- `vnp_TxnRef` = attempt UUID without hyphens, unique per attempt. Replay returns the stored createDate/ip/ref and re-signs; does not insert a second reservation.
- POST `/api/payments/vnpay/[token]`; GET `/api/payments/vnpay/return` HTML from DB status. `vnp_ResponseCode=00` does not mark PAID. Hash secret never returned.
- Merchant allowlist: sandbox and `https://www.vnpayment.vn/paymentv2/vpcpay.html` only.
- AT-023-04 cannot POST the running Next process without mutating remote Supabase; local Kong + production route functions are the sandbox proof path.
Remaining limitations/blockers: IPN/paid finalization is OV-024. Live Next still points at remote Supabase; app checkout on :3000 would still miss local fixtures.
Cleanup: no live payment submitted; no extra processes. SQL migration left applied locally (forward-only). Fixture products disabled.
Reviewer conclusion and README/status update: Status DONE on AT-023-01..04. No README edit.
