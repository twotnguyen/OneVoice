# OneVoice — bàn giao triển khai cho agent mới

> Dừng triển khai code ở phiên bàn giao này theo yêu cầu người dùng. Agent mới đọc tài liệu và tiếp tục từng issue, không phỏng vấn lại hoặc triển khai Blueprint cũ theo suy đoán.

**Goal:** Hoàn tất MVP chăm sóc Messenger và marketing Facebook cho một doanh nghiệp triển khai riêng.
**Architecture:** Next.js/Supabase, nghiệp vụ transaction trong PostgreSQL, jobs/outbox có dedup và revision/lease fence, HyperFrames cho video.
**Tech Stack:** Node24+, pnpm11, TypeScript, Next16 hiện được cài. Đọc package.json/lockfile và tài liệu Next trong node_modules/next/dist/docs/ trước thay framework.
**Spec:** [DECISIONS.md](DECISIONS.md). Kế hoạch từng issue nằm cùng thư mục.

## Thứ tự đọc bắt buộc

1. AGENTS.md tại root và chỉ dẫn thư mục liên quan; git status/diff, không ghi đè thay đổi có sẵn.
2. DECISIONS.md: phân biệt quyết định người dùng, mặc định kỹ thuật, phạm vi hoãn.
3. README.md: dependency/order/status; GAP-ANALYSIS.md và PLAN-REVIEW.md: nền tảng và lý do chia task.
4. Tài liệu này, TESTING.md và đúng issue được giao, gồm cả kế hoạch bàn giao bổ sung và evidence cuối file.
5. Đọc implementation của dependency và code hiện tại trước sửa. Các phần Current behavior ban đầu ghi baseline trước task; evidence cuối file và verified runtime có ưu tiên hơn baseline lịch sử.

## Trạng thái tại bàn giao ngày 2026-09-12

**Cập nhật Git theo yêu cầu tiếp theo của người dùng:** toàn bộ mã và kế hoạch hiện có được chuẩn bị commit/PR vào main để bàn giao. Cảnh báo uncommitted bên dưới mô tả thời điểm soạn plan trước commit; sau khi PR được merge, clone main mới nhất sẽ có các file được version-control trong checkpoint này. Secrets, dữ liệu doanh nghiệp, references và artifacts bị ignore vẫn không nằm trong Git. Kiểm trạng thái PR/commit thực tế thay vì suy từ tài liệu rằng merge đã thành công.

53 issue: **29 DONE, 2 IN_PROGRESS, 21 TODO, 1 BLOCKED**. Không có test runtime mới được chạy chỉ để viết tài liệu bàn giao; evidence lịch sử giữ nguyên phạm vi ghi trong issue.

- DONE là đạt phạm vi riêng của issue, không chứng minh ứng dụng end-to-end đã xong.
- IN_PROGRESS: OV-017 và OV-032 đã có code/migration/tests chưa hoàn tất review; không viết lại từ đầu hoặc tự chuyển DONE.
- OV-051 BLOCKED: chưa đủ bằng chứng cấu hình/quyền Meta/HTTPS và tester event thật.
- Nhiều tính năng và migration vẫn là uncommitted/untracked. Chỉ clone branch từ remote có thể thiếu gần toàn bộ công việc này. Agent mới phải dùng **working directory hiện tại**, hoặc bản sao đầy đủ cả untracked files do người dùng chuyển. Không commit/stash/reset để tiện bàn giao.
- Các agents trước đã interrupted/completed tại lúc rà soát; tài liệu này không yêu cầu chúng tiếp tục code.

## Điểm tiếp tục ưu tiên

### OV-017

Đọc planner.ts, worker.ts, evidence.ts, migration111000 và local test script. Review trước phát hiện:
- Guidance global trùng khi so sánh hai sản phẩm.
- So sánh thuộc tính ngoài RAM có thể chỉ chọn facts một sản phẩm.
- History không đủ identity để hiểu “hai mẫu vừa rồi”.
- Numeric quote cần đúng attribute/SKU và snapshot canonical dependencies; union RAM/SSD hoặc nhiều SKU có thể hợp thức hóa mâu thuẫn.
- Expiry cần kiểm sau các row lock, không chỉ trước khi chờ.
- Policy “muốn biết chính sách bảo hành” không phải yêu cầu gửi bảo hành.

Một số sửa đã xuất hiện trong workspace nhưng **chưa có kết luận review cuối**. Đối chiếu code hiện tại, chạy lại acceptance trong issue; không giả định tất cả lỗi vẫn tồn tại, cũng không dùng thông báo agent cũ làm bằng chứng đã sửa.

### OV-032

Đọc passport.ts/version-repository.ts/migration112000. Review đã yêu cầu:
- Specifications array thực tế và variant.options; không chỉ fixture object rỗng.
- Trusted non-text style/media inventory và toàn bộ visible default text.
- Campaign/source applicability; mandatory settings revision và forbidden topics.
- Numeric quote đúng thuộc tính và product/SKU context.
- Currentness same-version importer changes, source expiry sau các lock ở save và read-current.

Một số sửa có local proof từ agent nhưng task vẫn IN_PROGRESS vì chưa review cuối. Không regenerate nội dung trong task032;053 sở hữu generator và046 render receipt.

## Phân công và thứ tự khả thi

Chỉ bắt đầu task khi mọi dependency DONE; chưa đạt test bắt buộc thì không mở khóa bằng cách đổi status cho tiện.

- Hoàn tất017 và032 trước. Có thể giao hai agent riêng nếu user giao song song, nhưng **descriptive-policy.ts là file dùng chung**: chỉ một owner sửa, agent kia review/tiêu thụ contract.
- Sau017:018 và021 độc lập ở deliverable nhưng cùng consultation wiring; phải phân ownership.018→019;021→022→023→024→025;027 chờ018/025/026.
- Sau032:033→034→053 và046 có thể độc lập.035 chờ034/046/053, rồi036→037→038.
-039 cần019/024/030/037;040 cần037;041 cần027/038/039/040;043 rồi044 theo tracker.
-051 có thể được operator chuẩn bị riêng nhưng không tự xin quyền tài khoản, mở tunnel hay gửi khách thật.

Mỗi migration chỉ một owner. Liệt kê tên hiện tại trước chọn timestamp mới;111000/112000 đã có và có thể đã áp dụng local. Agent khác không chạy migration của task đang sửa. Nếu migration đã phát hành ở môi trường dùng chung, dùng forward migration; không sửa lịch sử production.

## Những quyết định không được tự đảo

Một business/một Page/self-host, không SaaS. Staff trả lời trong ứng dụng gốc, không composer OneVoice. AI dừng khi WAITING_STAFF; complete chỉ cho input mới. Không tự duyệt đổi trả/bảo hành. Không approval gate từng bài. Ưu tiên marketing kết thúc vẫn PAUSED. Nhiều nguồn tri thức nhưng vận hành DB quyết định giá/tồn/đơn. VNPay verified IPN mới paid/PREPARING. Không tự refund. Tư liệu miễn phí có quyền dùng. Không đổi sang Remotion chỉ vì tham khảo repo.

## Hợp đồng liên task

| Producer | Consumer | Dữ liệu và invariant |
|---|---|---|
|013→014→017|018|Inbound identity, conversation revision, aiEligible, completed candidate; projection không thay consultation receipt|
|017|021/027|Typed checkout/status route, trusted conversation context; model không sở hữu org/identity authorization|
|021|022|Confirmed customer/SKU quote+order version; GET link không reserve/paid|
|022|023/024|Persisted attempt+frozen amount+expiry; reservation atomic, canonical SKU|
|024|025/039|Verified paid receipt+PREPARING hoặc explicit late exception; replay không nhân revenue|
|030|032/036/038|Single control revision/priority, campaign/source and slot IDs; terminal campaign không runnable|
|032|053/035/046/037|Immutable content document/hash/revision+evidence; VALID không phải artifact/render/publish receipt|
|033/034|032/053/046|Asset license/provenance and trusted template hashes/input inventory; no unvalidated HTML defaults|
|053|035/036|Một shared generation service; persisted request replay không gọi AI lại|
|046|035/036/037|Actual artifact receipt/hash/manifest matching content; không sửa immutable content row|
|039/040|041/029/036|Verified attribution/metrics with asOf and unavailable, không fabricated zero/ROI|

Tên interface mới trong task là thiết kế dự kiến, không tuyên bố đã có API đó. Khi code hiện tại cung cấp contract tương đương, tái sử dụng và ghi exact exported signature/path vào issue producer trước khi bàn giao consumer. Không tạo competing tables/services.

## Quy trình thực hiện một issue

- Mark IN_PROGRESS và cập nhật tracker; kiểm dependency và ownership trước sửa.
- Đọc diff/code; viết test chứng minh thiếu behavior hoặc regression, chạy thấy fail đúng nguyên nhân.
- Thực hiện checklist nhỏ trong issue, chỉ scope được giao. New scope→issue riêng và dependency cập nhật.
- Chạy TESTING.md gates phù hợp, review state transitions/permissions/concurrency. Test tự viết lại logic production bằng fake local function không tính evidence.
- Ghi quyết định, exact files/interfaces/migration version, commands/results, external limitations và next handoff.
- DONE chỉ khi acceptance đạt; thiếu provider sandbox bắt buộc→BLOCKED với prerequisite cụ thể, tiếp tục issue độc lập.
- Không tự commit/push/deploy hoặc thực hiện external side effect thật chỉ vì unit tests xanh.

## Bảo toàn workspace và môi trường

Các thay đổi người dùng ban đầu gồm dashboard/trend-chart.tsx, nav-sections.ts/test, globals.css và layout.tsx. Hiện có thêm nhiều thay đổi đã triển khai; **mọi dirty file đều phải bảo toàn**, không chỉ năm file gốc.

Local Supabase đã dùng localhost:54321 và container supabase_db_onevoice. Trước mọi DB write test, xác nhận endpoint và org fixture local; .env hiện hữu có thể trỏ dữ liệu doanh nghiệp từ xa. Không in .env/secrets. Không coi Supabase MCP đã kết nối: phiên trước chỉ xác minh direct connection/read, chưa có MCP capability proof.

Không giả định terminal/devserver cũ còn sống; kiểm process/port trước khi khởi động. Không kill process không xác định owner. next-env.d.ts có thể đổi đường .next/dev/types do dev server; không reset cả file hay coi đây là product change.

## Tiêu chí kết thúc toàn bộ

Tất cả issue thuộc release closure phải DONE với test evidence; không còn integration blocker bị che bởi mocks. Deliverable gồm mã, migration nâng cấp không phá dữ liệu, local+provider sandbox evidence, runbook, backup/restore proof và bản demo trung thực theo044.
