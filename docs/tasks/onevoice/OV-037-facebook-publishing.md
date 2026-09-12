# OV-037 — Đăng bài và Reels lên Fanpage

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/channels/facebook/publishing.ts + publishing.test.ts; persist publish attempts/remote IDs; nối worker marketing. Dùng artifact receipt046 và current-check032.

### Hợp đồng đầu vào, đầu ra và persistence

publish attempt khóa Page+slot+contentVersion+artifactHash+controlRevision; text/image post và Reels có typed adapters riêng theo official API. States PREPARED|DISPATCHING|PUBLISHED|FAILED|UNKNOWN|SUPPRESSED; remote accepted và processing/published phải phân biệt.

### Trình tự thực hiện

- [ ] Xác minh current official Page posts/photo/Reels upload/status/permission docs; lưu contract fixture/version, không suy từ Messenger endpoint.
- [ ] Revalidate current campaign/control/settings/source/media license/artifact hash trước authorize dispatch; stale→036 regeneration, không tự chỉnh published document.
- [ ] Implement bounded upload/status polling và idempotent receipt; persist remote handle sớm để restart reconcile; ambiguous create/finalize→UNKNOWN, không duplicate post.
- [ ] Operator view status/link/error trong campaign; public posting chỉ controlled tester scenario được cho phép, không bật production để thử.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-037-01: Pause/new priority/source change giữa render và dispatch→SUPPRESSED hoặc regeneration.
- [ ] AT-037-02: Post dùng đúng text/version; Reels dùng exact verified artifact; artifact missing/hash mismatch→zero sends.
- [ ] AT-037-03: Remote accepted rồi timeout/restart→reconcile handle, không upload/post mù lần hai.
- [ ] AT-037-04: Token hết/permission thiếu/APIprocessingfailed→bounded terminal error; cap counted theo scheduler rule.
- [ ] AT-037-05: Controlled Meta proof cả post và Reels trước claim live-complete; thiếu quyền giữ integration BLOCKED và release chưa đạt.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/channels/facebook/publishing.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/channels/facebook/publishing.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Adapter publish text/image/video/Reels đúng quyền Meta; outbox lưu upload/publish IDs và result.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 37 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa publishing thật.

## Expected behavior

Adapter publish text/image/video/Reels đúng quyền Meta; outbox lưu upload/publish IDs và result.

## Requirements

Recheck pause + latest facts ngay trước send; regenerate phù hợp hoặc skip/replacement; uncertain timeout reconcile trước retry; revoke token/permission có status rõ.

## Dependencies

OV-018, OV-032, OV-034, OV-036

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/channels/facebook/publishing.ts; src/worker/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không đăng khách thật để thử; API permissions/access review là external gate.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

Ngoại lệ pause: chỉ matching active priority job được publish khi PAUSED; tất cả job lịch thường bị chặn. Khi priority kết thúc/ID thay đổi, không còn ngoại lệ. Test request giả priority, ID khác, priority đã hoàn tất và ordinary job lúc paused.

## Testing

Mock contract upload stages, duplicate, timeout after accept, changed price/pause race; test Page live được kiểm soát.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
