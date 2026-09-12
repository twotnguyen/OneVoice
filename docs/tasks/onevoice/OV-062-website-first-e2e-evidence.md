# OV-062 — Bằng chứng E2E website-first

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Orca browser (embedded) cho customer + marketing flows từ website-first product decision (user section 8 / plan 2026-09-13). Không Graph trong network log. Evidence sanitized dưới `docs/tasks/onevoice/evidence/` (logs/text; screenshot nhỏ tùy chọn). Không commit binary lớn. Không production charge. Không Facebook.

### Files và ownership

Tạo `docs/tasks/onevoice/evidence/` lúc chạy (logs/text sanitized). Có thể thêm script/orchester Orca trong `docs/tasks/onevoice/` hoặc test harness hiện có — không product feature mới. Không sửa `src/` trừ bugfix phát hiện buộc phải tách issue.

Flows bắt buộc (section 8 website-first):

1. Anonymous `/chat` (không login): AI tư vấn catalog/policies, compare.
2. Checkout collection → confirmation URL trong chat (OV-060/021). Không bắt live VNPay (OV-063 tách).
3. Status lookup (session + mã đơn + SĐT) trên WEB.
4. Human request / return / warranty execution → WAITING_STAFF; staff claim + reply trong OneVoice; khách thấy reply trên `/chat` (OV-059).
5. Marketing: caption/script/video, Truth Guard, versions, history, calendar.
6. Due content không publishing provider → `WAITING_CHANNEL`, không `PUBLISHED`, không Graph.

### Hợp đồng đầu vào, đầu ra và persistence

Chạy trên bản local đã wire OV-057/059/060/035/036/061. Ghi version/HEAD, lệnh Orca, network: zero Facebook Graph. Screenshot/log che PII/token. Return URL / IPN live không thuộc issue (OV-063). OV-051 Facebook ingress vẫn BLOCKED và không chặn E2E này.

### Trình tự thực hiện

- [ ] Chuẩn bị fixture local (catalog/policy/order synthetic); không .env secrets in evidence.
- [ ] Orca: `/chat` consult/compare/checkout/status/handoff/staff reply.
- [ ] Orca: Studio+calendar history; due → WAITING_CHANNEL.
- [ ] Network log: no Graph; no production VNPay charge.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-062-01: Anonymous `/chat` tư vấn catalog/policies/compare; không login; reload giữ history; no Graph.
- [ ] AT-062-02: Checkout → confirmation URL trong chat; mở `/order-confirmation/{token}` đọc summary; không mark PAID từ return URL; không live charge.
- [ ] AT-062-03: Status đúng identity; handoff WAITING_STAFF; staff claim+WEB reply hiện trên `/chat`; private notes không hiện.
- [ ] AT-062-04: Marketing generate → Truth Guard → versions → history/calendar; due without provider = `WAITING_CHANNEL` not `PUBLISHED`; no Graph.

### Lệnh và bằng chứng

Task E2E/Orca: dùng Orca embedded browser + evidence matrix TESTING.md; không thêm unit test giả để thay browser proof.

```powershell
# Ghi exact orca/browser commands khi chạy. Ví dụ placeholder:
# orca ... (route /chat, /support/[id], video-studio, /campaigns)
```

Sanitized logs: `docs/tasks/onevoice/evidence/` (tạo khi chạy). Không token, PII, media lớn.

## Status

BLOCKED

## Objective

Bằng chứng Orca end-to-end cho luồng khách website và marketing waiting-channel, không Facebook Graph, không production charge.

## Context

Thực hiện quyết định website-first 2026-09-13 (user section 8). Đây là task 62 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

Public chat `/chat`. Staff `/support`. Fulfilment `DELIVERING` không `SHIPPING`. OV-044 release E2E Messenger/VNPay sandbox không thay issue này.

## Current behavior

Chưa website chat. Chưa waiting-channel. OV-044 E2E social→paid chưa chạy. OV-051 BLOCKED. OV-024 core DONE; live IPN là OV-063.

## Expected behavior

Orca chứng minh đủ flows section 8 trên WEB + marketing history/WAITING_CHANNEL. Network không Graph. Evidence sanitized.

## Requirements

- Không Graph / Messenger send / Facebook publish.
- Không production charge; không bắt AT-063 live IPN.
- Không coi unit/SQL của task con là E2E.
- Evidence che định danh; không commit binary lớn.
- Failures → focused issue, không sửa broad scope trong E2E.

## Dependencies

OV-057, OV-059, OV-060, OV-035, OV-036, OV-061

Không phụ thuộc OV-037, OV-051, OV-063.

## Implementation boundaries

Đọc trước và chỉ thu thập evidence + script chạy Orca. Có thể tạo thư mục evidence và ghi issue. Phát sinh bug product → issue riêng, không phình OV-062. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không implement chat/checkout/scheduler. Không live VNPay. Không Meta.

## Edge cases

- `/support` login-gated không đụng `/chat`.
- Staff Facebook conversation: không composer send (OV-015/059).
- Thiếu Chrome/libnss3 là OV-034, không fake lavfi cho marketing video proof.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Orca customer+marketing; network no Graph; screenshots/logs sanitized; WAITING_CHANNEL not PUBLISHED.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi nếu có script; `pnpm typecheck` không bắt buộc nếu không sửa src. Với schema dùng Supabase local. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13. Next.js `pnpm dev` on http://localhost:3000 using process `.env` (not printed). Local Postgres `supabase_db_onevoice` holds 20260913 website migrations. Orca runtime 1.4.199. No production charge. No Graph.

AT-062-01 PARTIAL: Orca `tab create --url http://localhost:3000/chat` title `Chat tư vấn`; snapshot heading/form/no login chrome; network log font GET only (no graph.facebook.com). Session `POST /chat/session` 403 then 503 after CSRF origin fix — Next `.env` is not the local migrated database, so cookie session cannot be created against website_sessions. Send/reload history not proven in this browser process.
AT-062-02..04: proven by child-issue HTTP/SQL (OV-060, OV-059, OV-061), not a single Orca walkthrough. Prerequisite for full browser: Next must use local Kong `127.0.0.1:54321` with migrations through 20260913110000, plus consultation worker.

Commands: `orca tab create --url http://localhost:3000/chat --json`; `orca snapshot --json`; `orca network --limit 50 --json`; `orca eval` session POST. `pnpm build` exit 0. `tsc --noEmit` exit 0. `eslint . --max-warnings=0` exit 0.

Remaining blocker: live Orca send/staff/Studio against the Next `.env` database. Do not treat SQL of children as this issue DONE.
