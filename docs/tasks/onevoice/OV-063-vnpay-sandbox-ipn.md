# OV-063 — IPN VNPay sandbox sau thanh toán thử

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Tách AT-024-05 khỏi OV-024. Core IPN (HMAC, match, idempotency, replay, bad signature, late IPN, atomic, verified IPN only → PREPARING, return URL never PAID) đã DONE trên OV-024. Issue này chỉ live sandbox IPN sau một sandbox payment. Không production charge. Không chặn OV-025.

### Files và ownership

Không product code trừ khi live IPN lộ regression của `handleVnpayIpn` / `finalize_vnpay_ipn`. Evidence trong issue này + `docs/tasks/onevoice/evidence/` sanitized. Reuse:

- `src/lib/payments/vnpay/notification.ts`
- `src/app/api/payments/vnpay/ipn/route.ts`
- `supabase/migrations/20260912121000_vnpay_payment_finalization.sql` (đã apply local)
- OV-023 checkout adapter / return URL read-only

Không migration mới.

### Hợp đồng đầu vào, đầu ra và persistence

VNPay server-to-server IPN sau sandbox charge. Official PAY 2.1.0 GET IPN, HMACSHA512 trước mutation, JSON `{RspCode,Message}` (docs https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html, đã đọc 2026-09-13 trên OV-024). Success verified → atomic PAID + consume + PREPARING. Return URL không PAID. Không gọi www production host.

### Trình tự thực hiện

- [ ] Operator cung cấp merchant/sandbox được phép charge thử; inventory tên config, không in secret.
- [ ] Sandbox payment (không production) → IPN thật tới local/public HTTPS callback đã cấu hình.
- [ ] Đối chiếu DB: receipt digest, PAID+PREPARING, stock consume, audit; return URL vẫn không tự PAID.
- [ ] Replay IPN identical → RspCode 02, không double consume.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

Chuyển từ AT-024-05:

- [ ] AT-063-01: Sandbox verified IPN sau sandbox payment → PAID + consume + PREPARING; HMAC/merchant/amount/ref khớp.
- [ ] AT-063-02: Return URL trước/sau IPN không tự PAID; chỉ IPN verified mới PREPARING.
- [ ] AT-063-03: Identical live IPN replay → ack already confirmed, một consume/audit.
- [ ] AT-063-04: Không production charge; sandbox host only; evidence không chứa hash secret / PII thẻ.

### Lệnh và bằng chứng

Task vận hành/live: commands/runbook TESTING.md lớp Provider sandbox. Không unit test giả thay live IPN. Unsigned mock không phải sandbox IPN (OV-024: 97/99).

```powershell
# Ghi exact sandbox payment + IPN observe commands khi được phép charge.
# Không chạy production. Không in VNP_HASH_SECRET.
```

## Status

BLOCKED

## Objective

Xác minh IPN VNPay sandbox thật sau một lần thanh toán sandbox; không production charge.

## Context

Tách live environment evidence khỏi core OV-024 để OV-024 DONE và OV-025 không bị khóa. Đây là task 63 trong [tracker](README.md). Song song OV-051 (Facebook live) — live provider tách khỏi local core.

OV-024 AT-024-01..04 PASS (2026-09-13): HMAC-before-mutate, replay, expiry race, return-before-IPN. AT-024-05 BLOCKED vì assignment cấm submit payment; unsigned mocks không phải IPN.

## Current behavior

Core `handleVnpayIpn` / `finalize_vnpay_ipn` local PASS. Chưa có sandbox payment → IPN server-call-server. Live Next vẫn trỏ remote Supabase (OV-023 diagnosis); local fixtures không hiện trên :3000.

## Expected behavior

Một sandbox charge được phép → VNPay gọi IPN → verified success atomically PAID+PREPARING; return URL không PAID; replay idempotent. Evidence sanitized.

## Requirements

- Không production charge.
- Không coi mock/unsigned/local TAP là live IPN.
- Secrets không in log/evidence.
- Không tự đăng ký merchant trả phí.
- Thiếu merchant/sandbox/callback quyền → giữ BLOCKED.
- Không chặn OV-025 orders UI.

## Dependencies

OV-024

Không block OV-025. Không phụ thuộc OV-051/037.

## Implementation boundaries

Đọc trước; chỉ evidence live + issue. Sửa `notification.ts` chỉ khi live IPN chứng minh regression. Có thể tạo test colocated nếu có failing contract. Phát sinh checkout/UI khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không .env trong git. Không Facebook.

## Edge cases

Thiếu TMN/hash/IPN URL; Next remote Supabase vs local DB; IPN tới sai host; late IPN sau expire (OV-024 already: MANUAL_REVIEW, không PREPARING).

## Acceptance criteria

- [ ] Sandbox IPN verified sau sandbox payment, không production.
- [ ] PAID+PREPARING chỉ từ IPN; return URL không PAID.
- [ ] Replay/idempotency giữ trên live IPN.
- [ ] Logs/evidence không chứa credentials hay PII thẻ.

## Testing

Sandbox dashboard + IPN hit + DB receipt. Không unit giả. Không khách thật, không thẻ thật ngoài sandbox được phép.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README khi có quyền charge sandbox.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code nếu có bug.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

BLOCKED 2026-09-13: chưa được phép sandbox charge. OV-024 cấm submit payment; AT-024-05 moved here. Unsigned mocks ≠ sandbox IPN (RspCode 97/99). Core HMAC/match/idempotency/replay/bad signature/late/atomic/verified-only-PREPARING/return-never-PAID ở OV-024 PASS — không làm lại.

Không chặn OV-025. README status BLOCKED cho issue này; OV-024 README DONE (orchestrator).
