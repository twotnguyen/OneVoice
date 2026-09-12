# OV-034 — Ảnh sản phẩm trong đồ họa chuyển động

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Sửa src/lib/video/template-registry.ts và template-pipeline liên quan; src/lib/video/hybrid-scenes.test.ts; tạo trusted inventory export cho032; giữ renderer HyperFrames hiện hữu.

### Hợp đồng đầu vào, đầu ra và persistence

Input ProductScriptSchema hiện hành + asset references033. Output template inventory gồm hash/static text/text input/non-text input; renderer phải dùng đúng inventory đó. Không đổi engine Remotion hay tự kéo media tùy ý trong HTML.

### Trình tự thực hiện

- [ ] Chọn tập template hỗ trợ hybrid và ghi exact slots; gỡ hoặc thay placeholder/default marketing claims không có evidence.
- [ ] Implement fit/contain/crop có chủ đích cho ảnh thật, resolve vào local sandbox trước render; không để URL fetch ngầm vượt adapter.
- [ ] Nối trusted inventory với032 và generator053; text/caption/narration và rendered defaults cùng một nguồn. Voice selection được truyền từ request đến renderer/TTS, không chỉ UI state.
- [ ] Render fixture sản phẩm portrait/landscape/transparent/missing; review keyframes đầu/giữa/cuối và audio, giữ 9:16/script bounds hiện tại.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-034-01: Asset đúng SKU hiện trong rendered frame; missing asset có fallback rõ, không stock image ngẫu nhiên.
- [ ] AT-034-02: Uncovered default claims bị passport chặn; style indices/colors hợp lệ không bị reject.
- [ ] AT-034-03: Ảnh méo/che CTA/text overflow được kiểm qua screenshot; remote fetch không diễn ra ngoài033 adapter.
- [ ] AT-034-04: FFprobe codec/pixel format1080x1920/duration/audio và fixture voice khác nhau được chuyển đúng provider; không cần đổi engine.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/video/hybrid-scenes.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/video/hybrid-scenes.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Thêm scene product hero/comparison/media background có refs ảnh/video và layout riêng; giữ motion làm chủ đạo.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 34 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Renderer template hiện text-only bỏ imagePath.

## Expected behavior

Thêm scene product hero/comparison/media background có refs ảnh/video và layout riêng; giữ motion làm chủ đạo.

## Requirements

Không méo ảnh/che SKU; captions Vietnamese; schema không cho raw HTML/code từ AI; duration theo voice; bounded render; dùng nền HyperFrames hiện tại.

## Dependencies

OV-031, OV-032, OV-033

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/video/script-schema.ts; src/lib/video/template-registry.ts; src/lib/video/template-video-renderer.ts; templates/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Không chuyển Remotion chỉ vì xu hướng; chất lượng phải xem thành phẩm trước DONE.

## Acceptance criteria

- [ ] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [ ] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [ ] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [ ] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Fixture product ảnh thật + specs; render kiểm 9:16/1080x1920, overflow/audio sync; fallback ảnh lỗi không dùng sai sản phẩm.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [ ] Mark IN_PROGRESS trong task và README.
- [ ] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [ ] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [ ] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [ ] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Chưa bắt đầu triển khai; không có kết quả kiểm thử được tuyên bố cho task này.


Template audit requirement from existing-code study: remove unrelated baked-in claims/branding and require meaningful values for visible slots. Pass final rendered text/default manifest into OV-032 validation, not only AI-provided inputs. Verify real narration timing and scene hold after narration rather than character-count estimate alone; bound subprocesses and cancel/drain sibling renders before cleanup.
