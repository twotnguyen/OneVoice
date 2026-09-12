# OV-025 — Nhân viên cập nhật đơn và tự giao

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/app/(app)/orders/ và src/app/api/orders/; src/lib/orders/operations.ts + operations.test.ts; dùng OV-020/024 storage.

### Hợp đồng đầu vào, đầu ra và persistence

List/detail có pagination/filter; staff operational mutation nhận expectedVersion và action hợp lệ, server actor scope. PAID PREPARING→SHIPPING→DELIVERED; trạng thái thực tế dùng enum004/020. Payment exceptions manager read/acknowledge, không nút mark-paid hay tự refund.

### Trình tự thực hiện

- [ ] Viết API permission/CAS transition tests; tạo list/detail query chỉ trường role cần.
- [ ] Implement shipping transition transaction và immutable history, tracking reference/manual customer-visible progress; giữ internal note riêng.
- [ ] UI trạng thái loading/empty/error/conflict, refresh sau save; manager exception view giải thích cần xử lý ngoài OneVoice, không gọi API hoàn tiền.
- [ ] Browser-test với manager/staff fake local, kiểm lỗi thao tác state cũ và lưu lịch sử.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-025-01: UNPAID không shipping; DELIVERED không lùi; hai update version cũ chỉ một thắng.
- [ ] AT-025-02: Staff không sửa totals/paid/catalog/policy; inactive session/cross-org reject.
- [ ] AT-025-03: Note nội bộ không đi vào public DTO027; empty list không fake rows.
- [ ] AT-025-04: Browser PREPARING→SHIPPING→DELIVERED và reload persistence; manager xem late-payment exception.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/orders/operations.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/orders/operations.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Danh sách chuẩn bị/đang giao/đã giao và detail; staff cập nhật bước hợp lệ có lịch sử.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 25 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Không orders UI.

## Expected behavior

Danh sách chuẩn bị/đang giao/đã giao và detail; staff cập nhật bước hợp lệ có lịch sử.

## Requirements

Không staff sửa paid/giá/policy; reference tracking do doanh nghiệp nhập; payment exceptions manager; không tích hợp hãng giao vận.

## Dependencies

OV-007, OV-024

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/(app)/orders/; src/app/api/orders/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không mở module kho/ERP toàn diện; hủy/hoàn tiền luôn thao tác manager có audit, không AI.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Illegal transitions, concurrent update, unauthorized access; thao tác sai có thông báo.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
