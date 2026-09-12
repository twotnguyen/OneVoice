# OV-039 — Liên kết nội dung tới hội thoại và đơn

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/analytics/attribution.ts + attribution.test.ts; migration immutable attribution events; nối verified webhook019/014, publish037 và paid024.

### Hợp đồng đầu vào, đầu ra và persistence

First-known-touch dựa provider referral/comment/post ref đã kiểm hoặc opaque signed referral mapping; org/Page/content/campaign/conversation/order links. Unknown là explicit null+reason, không dựa tên khách hay thời gian gần nhất.

### Trình tự thực hiện

- [ ] Định nghĩa event identity provider/source event và unique dedup; giữ observedAt/providerAt và attribution basis.
- [ ] Bind verified referral vào conversation; preserve first-known valid touch, không overwrite bởi event muộn vô căn cứ.
- [ ] Bind order từ trusted conversation và count paid conversion chỉ khi024 verified; aggregate không nhân đôi do nhiều order lines/IPN.
- [ ] Read model attribution cho041 với unknown bucket; không tự gán views thành customers hay causal ROI.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-039-01: Duplicate/reordered/referral spoof/cross-Page→không double attribution.
- [ ] AT-039-02: Direct Messenger không referral→unknown; first known touch không bị last touch overwrite.
- [ ] AT-039-03: Paid IPN repeat→một conversion; failed/unpaid không revenue.
- [ ] AT-039-04: Local ingress→conversation→order→payment fixtures reconcile exact known+unknown counts.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/analytics/attribution.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/analytics/attribution.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Lưu content/campaign/message source refs từ dữ liệu Meta hoặc signed entry link; liên kết order; first known touch và unknown rõ ràng.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 39 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Funnel hiện là sản xuất video, chưa sales.

## Expected behavior

Lưu content/campaign/message source refs từ dữ liệu Meta hoặc signed entry link; liên kết order; first known touch và unknown rõ ràng.

## Requirements

Không tự suy khách nhìn bài là attribution; paid order tính sau IPN; dedup events; giữ late evidence có audit.

## Dependencies

OV-019, OV-024, OV-030, OV-037

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/analytics/attribution.ts; supabase/migrations/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Wiring bắt buộc: src/lib/channels/facebook/, src/lib/orders/ và src/lib/payments/vnpay/ gọi event producers cùng transaction/unique key; không chỉ analytics repository độc lập.

## Edge cases

Mô hình first-known-touch là mặc định kỹ thuật; không hứa chứng minh causal lift.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Organic unknown, nhiều bài một khách, webhook replay, cancelled/unpaid không thành paid revenue.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.
