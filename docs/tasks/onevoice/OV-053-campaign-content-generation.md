# OV-053 — Sinh nội dung chiến dịch dùng chung

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/content/campaign-generation.ts + campaign-generation.test.ts; đọc existing generate-video-script.ts, passport.ts, version-repository.ts và034 inventory.

### Hợp đồng đầu vào, đầu ra và persistence

Service input trusted org+slotId+expectedContentRevision+requestId+format post|video; output persisted version receipt hoặc bounded failure. Source lấy campaign đã lưu, không model-controlled URLs/org. Một successful generation receipt/request; repair tối đa1, usage cộng các lần thực tế.

### Trình tự thực hiện

- [ ] Viết provider fixtures cho product/program/trend và idempotent repository trước; định nghĩa source snapshot envelope theo032.
- [ ] Đọc fresh settings/evidence/assets/inventory, build bounded untrusted-data prompt; parse structured draft, validate032; một repair với validation errors đã lọc.
- [ ] Save version CAS+request receipt. Replay đã save trả receipt không gọi model; timeout chưa save không được tuyên bố exactly-once model billing.
- [ ] Expose shared function cho035/036 không phụ thuộc React; cancellation/current revision changed discard candidate. Không render/publish trong generator.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-053-01: Ba source kinds × post/video tạo correct passport; trend không bắt buộc SKU giả.
- [ ] AT-053-02: Caption/CTA/narration injected price/promo unsupported→reject/one repair only.
- [ ] AT-053-03: Same request persisted replay zero AI; parallel request same revision chỉ một version.
- [ ] AT-053-04: Provider deadline/cancel/stale source/import same-version change→no valid stale save.
- [ ] AT-053-05: 031single-generation regression; actual local save+restart proof; artifactHash vẫn null.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/content/campaign-generation.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/content/campaign-generation.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Dịch vụ phía máy chủ sinh bài viết hoặc kịch bản video cho sản phẩm, chương trình và chủ đề đã chọn; dùng chung cho Studio và worker tự động.

## Context

Review khi tích hợp OV-030 phát hiện khoảng trống: OV-032 sở hữu phiên bản/kiểm chứng, OV-035 sở hữu giao diện, OV-036 sở hữu lịch, OV-046 chỉ render kịch bản đã lưu. Chưa task nào sở hữu dịch vụ sinh nội dung theo chiến dịch. Task này bổ sung ownership, không mở rộng phạm vi sản phẩm đã xác nhận.

## Current behavior

generateVideoScript chỉ nhận một product snapshot cho video cũ. Chưa có dịch vụ chung sinh post có ảnh, nội dung chương trình hoặc nội dung bắt trend với nguồn và lưu phiên bản.

## Expected behavior

Một API nội bộ có kiểu dữ liệu nhận slot đã xác minh và loại nội dung, đọc nguồn hiện hành, sinh một kết quả có giới hạn, kiểm OV-032 rồi lưu phiên bản. Studio và scheduler gọi cùng dịch vụ này; retry không sinh/lưu trùng phiên bản đã hoàn tất.

## Requirements

- Organization/campaign/slot từ trusted server; chọn nguồn từ chiến dịch đã lưu, không nhận SQL/URL tùy ý do model đưa ra.
- Hỗ trợ product, program và engagement trend; bài viết gồm text/caption và ảnh có nguồn, video dùng hợp đồng script hiện có cùng media/template OV-034.
- Giá/tồn/chương trình từ vận hành; mô tả từ nguồn cấu hình, xu hướng từ OV-028. Không giả dữ liệu thiếu, không trộn giá các SKU, không cộng khuyến mãi tùy ý.
- Model chỉ sinh nội dung, không cấp quyền đăng hoặc điều khiển marketing. Thông tin doanh nghiệp, nguồn và prompt khách đều là dữ liệu không đáng tin về mặt chỉ thị.
- Đọc brand voice/allowed/forbidden topics và mục tiêu đang hiệu lực. Kết quả phải qua kiểm chứng OV-032 trước khi trở thành phiên bản hợp lệ.
- Một lần sinh thành công cho một yêu cầu idempotent; tối đa một repair cho lỗi kiểm chứng. Ghi model, usage được cung cấp, nguồn, lỗi và outcome; không ghi credentials hay raw provider error.
- Giới hạn thời gian, kích thước, số lần thử; hủy hoặc thay đổi revision/priority làm kết quả cũ không còn đủ điều kiện sử dụng. Không tự nối lại automation.
- Không gửi tin/đăng bài/render trong dịch vụ này. OV-046 render phiên bản đã lưu; OV-036 điều phối retry/replacement; OV-037 đăng.

## Dependencies

OV-032, OV-034

## Edge cases

Nguồn hết hạn giữa lúc sinh; chương trình bị sửa cùng version qua importer; ảnh không dùng được; chỉ có trend nhưng không có SKU; model đưa claim mới trong caption; provider timeout sau khi sinh; replay sau khi phiên bản đã lưu; script hợp lệ nhưng artifact chưa tồn tại.

## Acceptance criteria

- [ ] Studio và scheduler có thể gọi cùng một dịch vụ không phụ thuộc React/Next UI.
- [ ] Product/program/trend có test sinh post/script với provenance phù hợp; unsupported claims không được lưu như hợp lệ.
- [ ] Replay cùng request trả phiên bản đã lưu; không gọi AI lần nữa sau kết quả bền vững, không tạo artifact giả.
- [ ] Retry/repair/cancellation có giới hạn và kết quả cũ không vượt qua revision fence.
- [ ] Validation, giới hạn thực tế và quyết định triển khai được ghi; không tuyên bố provider thật đã chạy khi chỉ dùng fixture.

## Testing

Provider fixture với output có cấu trúc, single-generation regression OV-031, caption/CTA injection, dữ liệu thay đổi trong lúc chờ, persisted retry/restart và actual local database proof. Chạy typecheck, lint và test liên quan; không dùng khách thật hoặc đăng bài thật.

## Implementation boundaries

src/lib/content/campaign-generation* và adapters phục vụ đúng dịch vụ này; tái sử dụng OV-032/034/046, không tạo thêm bảng chiến dịch, scheduler hoặc queue render thứ hai. Persistence bổ sung nếu cần phải có migration và kiểm thử transaction rõ ràng.

## Implementation decisions and evidence

Chưa triển khai. Task tách qua review trước khi bắt đầu phần generation mới; OV-035 phụ thuộc task này, OV-036 nhận gián tiếp qua OV-035.
