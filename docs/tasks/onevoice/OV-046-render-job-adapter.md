# OV-046 — Kết nối render với hàng đợi marketing

## Kế hoạch bàn giao chi tiết — 2026-09-12

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

### Files và ownership

Tạo src/lib/jobs/render-adapter.ts + render-adapter.test.ts; nối src/worker/ và existing src/lib/render/ pipeline/file queue; không thay toàn bộ queue.

### Hợp đồng đầu vào, đầu ra và persistence

enqueue stored contentVersionId→stable renderId mapping; immutable render receipt(contentHash,template/media hashes,artifactHash,manifestPath,status). Consume script từ032, không gọi generator lần nữa. artifactHash lưu receipt riêng, không sửa content_versions immutable.

### Trình tự thực hiện

- [ ] Viết crash/replay tests dựa fake renderer và actual artifact library; map business job/content version một lần.
- [ ] Adapter truyền persisted exact script/media/voice cho pipeline; legacy manual render giữ đường cũ.
- [ ] On restart inspect final manifest/hash trước quyết định render lại; partial artifacts không success. Lease/revision fence trước attach result.
- [ ] Expose completed/failed receipt cho035/036/037; stale artifact giữ history nhưng không ready latest slot; bounded cleanup đúng ownership.
- [ ] Chạy từng ca acceptance dưới đây với implementation thật ở boundary tương ứng; lưu command, kết quả và giới hạn trong issue.
- [ ] Review diff/scope/dependencies, cập nhật README và Status chỉ sau khi đạt toàn bộ gate TESTING.md.

### Acceptance test cases bắt buộc

- [ ] AT-046-01: Retry completed manifest→zero render/AI calls; initial render không generate lại script.
- [ ] AT-046-02: Kill worker sau artifact write trước DBfinish→recover same artifact/id.
- [ ] AT-046-03: Late old revision result không replace latest; missing/corrupt/hash-mismatch artifact→not publishable.
- [ ] AT-046-04: Actual local DB+real Linux MP4 proof và legacy single-generation/manual-render regressions.

### Lệnh và bằng chứng

Test entry dự kiến: `src/lib/jobs/render-adapter.test.ts`.

```powershell
node node_modules/vitest/vitest.mjs run src/lib/jobs/render-adapter.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit
```

Nếu entry chưa tồn tại, tạo regression trước implementation; không bỏ qua test vì path mới. Chạy thêm các test hiện có của module bị sửa, scoped ESLint, SQL/concurrency/browser/provider gates theo TESTING.md.

## Status

TODO

## Objective

Adapter business render job tới pipeline hiện có, lưu content version/renderId và terminal result để marketing tiếp tục.

## Context

Theo [DECISIONS.md](DECISIONS.md); task bổ sung qua review trước implementation để tránh thiếu ownership.

## Current behavior

File queue chỉ biết product render, marketing jobs chưa thể chờ artifact bền vững.

## Expected behavior

Adapter business render job tới pipeline hiện có, lưu content version/renderId và terminal result để marketing tiếp tục.

## Requirements

Không xóa render queue cũ; dedup contentVersion/renderId; worker crash reconcile library trước tạo lại; content snapshot không sinh hai lần; bounded retries; lỗi render không publish.

## Dependencies

OV-012, OV-031, OV-032

## Implementation boundaries

src/lib/jobs/render-adapter.ts; src/worker/; src/lib/render/

## Edge cases

Đây là ownership queue seam được OV-012 tham chiếu, tách khỏi thiết kế scene OV-034.

## Acceptance criteria

- [ ] Toàn bộ Requirements và Expected behavior có implementation và test.
- [ ] Các tình huống Testing có bằng chứng kết quả.
- [ ] Không chạm phạm vi task khác; ghi quyết định và cập nhật tracker.

## Testing

Retry đã có manifest không render lại; job chết hồi phục; stale content revision không dùng artifact cũ; manual render vẫn hoạt động. Chạy test colocated, typecheck, lint và local DB/worker integration tương ứng.

## Implementation decisions and evidence

Chưa triển khai; không có kết quả kiểm thử mới.


Dependency review: render adapter consumes the persisted immutable content/version/script contract from OV-032. It must not invent a competing content table or regenerate a script that already passed Truth Guard. OV-032 is therefore a prerequisite; OV-035 still depends on this adapter without a cycle.
