# OV-021 — Link khách kiểm tra và xác nhận đơn

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/orders/confirmation.ts + confirmation.test.ts; src/app/order-confirmation/; src/app/api/checkout/; nối consultation route checkout. Dùng src/lib/orders/repository.ts và shipping settings OV-020.

### Hợp đồng đầu vào, đầu ra và persistence

Collection lưu theo trusted conversation+revision, lines exact sellable SKU, tên/điện thoại/địa chỉ. Token random 32 bytes, chỉ hash at rest, purpose=confirmation, TTL mặc định kỹ thuật24h; URL origin cấu hình. Quote có orderVersion, SKU values và shipping revision. Confirm không tự PAID/PREPARING hay giữ tồn;022 sở hữu begin-payment.

### Trình tự thực hiện

- [ ] Xây structured collection với server schema và hỏi đúng field thiếu; không model tự điền thông tin hay lấy SKU khác. Save draft idempotent theo conversation/request.
- [ ] Tạo token và trang GET read-only; không token/PII vào logs, metadata hay referrer. Token hết hạn/khác scope trả generic error.
- [ ] Cho khách sửa thông tin và xác nhận bằng POST. Requote authoritative; giá/phí đổi phải hiển thị thay đổi rồi khách xác nhận lại. Thêm manager-only shipping fee input vì null không phải miễn phí.
- [ ] Nối tool từ017 tới018 outbox URL; expose confirmed snapshot cho022 bằng hàm server typed, chưa giả lập nút thanh toán thành công.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-021-01: Thiếu từng field không tạo link; product có variants phải chọn variant, quantity nguyên dương.
- [ ] AT-021-02: GET token không đổi state; token sai/hết hạn/order khác không lộ existence/PII.
- [ ] AT-021-03: Double POST chỉ một confirmed revision; sửa sau confirm làm quote cũ invalid.
- [ ] AT-021-04: Giá/phí đổi→reconfirm; shipping fee null→blocked; staff không sửa shipping setting.
- [ ] AT-021-05: Actual Messenger candidate→collection→local browser confirmation→persisted confirmed quote; không chỉ test UI độc lập.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/orders/confirmation.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/orders/confirmation.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

AI thu đủ tên, điện thoại, địa chỉ, sản phẩm/số lượng rồi tạo link token opaque có hạn; trang hiển thị summary và sửa thông tin trước checkout.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 21 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không có trang xác nhận.

## Expected behavior

AI thu đủ tên, điện thoại, địa chỉ, sản phẩm/số lượng rồi tạo link token opaque có hạn; trang hiển thị summary và sửa thông tin trước checkout.

## Requirements

Không PII trong URL; token hash at rest; link riêng order; không coi mở link là đồng ý; tra giá/tồn lại và yêu cầu xác nhận lại nếu đổi; CSRF/rate limits.

Integration ruling from OV-020: phải cung cấp đường cấu hình phí giao hàng đã biết cho manager trước checkout; order_shipping_settings.flat_fee_vnd mặc định NULL, không tự coi là 0. Kiểm lại fee revision, catalog price/version và tồn ngay trong transaction bắt đầu giữ hàng/thanh toán. Không coi snapshot đã freeze trước đó là bằng chứng dữ liệu vẫn hiện hành; helper freeze của OV-020 phải được phối hợp atomically với OV-022.

## Dependencies

OV-017, OV-020

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/order-confirmation/; src/app/api/checkout/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Wiring bắt buộc: src/lib/consultation/ và src/worker/ phải gọi collection/link tool này từ Messenger; không chỉ có trang web độc lập. Kết quả tool chứa opaque confirmation URL, không lộ secret hoặc PII trong URL.

## Edge cases

Không tài khoản khách bắt buộc; token tra cứu đơn khác với nhân viên session.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Thiếu info không link; token giả/hết hạn; giá đổi; double-submit; redirect không mở.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
