# OV-033 — Tư liệu miễn phí và quản lý nguồn

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/media/free-assets.ts + free-assets.test.ts và registry persistence; tái sử dụng src/lib/network/ public HTTPS fetch và image resolver hiện hữu. Không viết crawler mới.

### Hợp đồng đầu vào, đầu ra và persistence

Asset record gồm id/sourceUrl/provider/author/licenseId/licenseUrl/retrievedAt/contentHash/mime/dimensions/status. Chỉ free commercial-compatible license đã xác minh; free-price không bằng được phép tái sử dụng. Catalog URL và external stock phải phân biệt provenance.

### Trình tự thực hiện

- [ ] Định nghĩa license allowlist và attribution requirements từ tài liệu provider; adapter có bounded search/download, SSRF guard, size/type validation.
- [ ] Persist asset provenance và local immutable bytes hoặc reference đã kiểm; asset fail/expired/revoked không selectable. Không giả provider access khi thiếu key.
- [ ] Cho content pipeline chọn tư liệu theo campaign, ảnh catalog ưu tiên; fallback motion-only có nguồn khi không có media phù hợp.
- [ ] Thêm attribution metadata chuyển sang passport/render/publish; không mặc định quyền sử dụng video từ Facebook tham khảo.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-033-01: Unknown license/paid asset/no commercial rights→reject; attribution-required thiếu credit→reject.
- [ ] AT-033-02: Private IP/redirect/oversize/wrong MIME/SVG active content→reject bằng network boundary.
- [ ] AT-033-03: Same bytes retry dedup, provider timeout bounded và fallback không dùng ảnh sản phẩm khác.
- [ ] AT-033-04: Real public miễn phí fixture nếu khả dụng + local registry proof; lưu source/license kiểm tra, không coi download được là license proof.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/media/free-assets.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/media/free-assets.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

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

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

URL nội bộ/redirect private chặn; provider lỗi; license thiếu -> không dùng; duplicate asset cache.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
