# OV-043 — Triển khai riêng và sao lưu

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Đọc Dockerfile, docker-compose.yml, Dockerfile.test, docs/development/linux-media-tests.md; sửa deployment/scripts trong phạm vi; thêm docs/deployment/onevoice-runbook.md.

### Hợp đồng đầu vào, đầu ra và persistence

Một installation/org/Page với persistent DB/media, web+business workers+render/TTS prerequisites. Secrets runtime không image/client bundle. Health phân biệt live/readiness/worker heartbeat. Không bootstrap manager password mặc định.

### Trình tự thực hiện

- [ ] Fresh disposable install từ migrations; upgrade copy có dữ liệu/audit; kiểm package media/template tracing warnings và server-required assets thực sự trong image.
- [ ] Runbook env matrix required/optional, worker commands, Meta/VNPay setup gates, manager bootstrap và pause mặc định; không dùng dev.env remote để test.
- [ ] Backup DB+media/config metadata và restore trên DB mới; worker crash/restart recovery, disk full, lease expiry và dead jobs operator recovery.
- [ ] Thiết lập request/session DB deadlines thật và test PostgREST lock timeout; function SET statement_timeout riêng không đủ. Ghi retention, rotation, licenses/SBOM và rollback forward-safe.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-043-01: Clean Linux build+typecheck/lint/full suites+real media; fresh install và non-destructive upgrade.
- [ ] AT-043-02: Backup restore giữ orders/audit/jobs/artifact mappings, không tự đăng lại UNKNOWN attempts.
- [ ] AT-043-03: Worker kill/restart không mất receipts/oversell; missing secrets/readiness false.
- [ ] AT-043-04: Production bundle không .env/secrets/unwanted whole repo; media mount và FFmpeg/TTS health thật.
- [ ] AT-043-05: Real PostgREST blocked RPC được server timeout theo config, không chỉ client abort.

### Lệnh và bằng chứng

Task vận hành/live: dùng commands/runbook và evidence matrix trong TESTING.md; không thêm unit test giả để thay deployment/provider proof.

## Status

TODO

## Objective

Hướng dẫn một doanh nghiệp/một Page, env riêng, self-host Supabase hoặc endpoint riêng, HTTPS webhooks, migrations/backup restore, worker health.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 43 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Compose app/worker/TTS, Supabase ngoài; health không đủ worker.

## Expected behavior

Hướng dẫn một doanh nghiệp/một Page, env riêng, self-host Supabase hoặc endpoint riêng, HTTPS webhooks, migrations/backup restore, worker health.

## Requirements

Không reset DB đang dùng; seed demo tách; dependency licenses/SBOM; secrets rotation; media/job/data retention configurable; deployment readiness gates.

## Dependencies

OV-007, OV-012, OV-015, OV-027, OV-038, OV-041, OV-042, OV-047, OV-048

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `docker-compose.yml; Dockerfile; docs/deployment/; scripts/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không SaaS multi-tenant/signup/billing; public endpoints cần tài khoản hạ tầng của doanh nghiệp.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Clean build/install; local migration upgrade; backup restore rehearsal; restart workers không mất state; render prerequisites.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.

Build inspection evidence: immutable Linux image07e7995c production Next build passed (compile, typecheck, static generation). Ten dynamic-filesystem tracing warnings remain around configurable media/template paths. During this task, inspect packaged server output and intended media mount boundaries; document or fix unintended whole-project inclusion with a focused regression. Do not treat successful compilation as deployment/readiness proof. This evidence predates latest consultation/campaign changes.

Database deadline review: function-level SET statement_timeout does not arm a deadline for the already-running outer statement (local reviewer reproduced SET5ms with pg_sleep100ms). Before deployment, enforce and verify request/session-level database deadlines on real PostgREST RPCs; keep client AbortSignal wait bounds distinct from proven server cancellation. Audit existing RPC documentation for this distinction, without treating function configuration alone as evidence.
