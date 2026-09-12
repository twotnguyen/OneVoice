# OneVoice — bàn giao triển khai cho agent mới

> Dừng triển khai code ở phiên bàn giao này theo yêu cầu người dùng. Agent mới đọc tài liệu và tiếp tục từng issue, không phỏng vấn lại hoặc triển khai Blueprint cũ theo suy đoán.

**Goal:** Hoàn tất MVP website-first: chat ẩn danh `/chat`, AI tư vấn, handoff staff trong OneVoice, đơn/VNPay/tra cứu, marketing sinh nội dung + `WAITING_CHANNEL` khi chưa có Facebook publish. Messenger/Fanpage là adapter tương lai, không chặn website.
**Architecture:** Next.js/Supabase, nghiệp vụ transaction trong PostgreSQL, jobs/outbox có dedup và revision/lease fence, HyperFrames cho video. Kênh khách `WEB` + `FACEBOOK`; public `/chat`; staff `/support`. Fulfilment `DELIVERING` (không `SHIPPING`).
**Tech Stack:** Node24+, pnpm11, TypeScript, Next16 hiện được cài. Đọc package.json/lockfile và tài liệu Next trong node_modules/next/dist/docs/ trước thay framework.
**Spec:** [DECISIONS.md](DECISIONS.md) — mục Website-first (2026-09-13) thắng phỏng vấn khi mâu thuẫn. Kế hoạch từng issue nằm cùng thư mục.

## Thứ tự đọc bắt buộc

1. AGENTS.md tại root và chỉ dẫn thư mục liên quan; git status/diff, không ghi đè thay đổi có sẵn.
2. DECISIONS.md: Website-first trước; phân biệt quyết định người dùng, mặc định kỹ thuật, phạm vi hoãn; câu superseded không xóa.
3. README.md: dependency/order/status; GAP-ANALYSIS.md và PLAN-REVIEW.md: nền tảng và lý do chia task.
4. Tài liệu này, TESTING.md và đúng issue được giao, gồm cả kế hoạch bàn giao bổ sung và evidence cuối file.
5. Đọc implementation của dependency và code hiện tại trước sửa. Các phần Current behavior ban đầu ghi baseline trước task; evidence cuối file và verified runtime có ưu tiên hơn baseline lịch sử.

## Trạng thái tại bàn giao ngày 2026-09-13 (website-first)

Branch `codex/onevoice-website-first` trên HEAD origin/main. Dirty chỉ `next-env.d.ts` — không commit, không reset/stash/clean. Không Facebook Graph, Messenger send, comment reply, Facebook publish, production charge, hoặc .env.

63 issue sau docs pass: **39 DONE, 0 IN_PROGRESS, 21 TODO, 3 BLOCKED** (OV-034, OV-051, OV-063). OV-024 core DONE (AT-024-01..04). Live VNPay sandbox = OV-063 BLOCKED, không chặn OV-025. OV-051 vẫn BLOCKED. OV-037+ Facebook vẫn TODO vòng này. Issue mới OV-054..OV-062 TODO; OV-063 BLOCKED.

Snapshot 2026-09-12 (29 DONE / 2 IN_PROGRESS / 21 TODO / 1 BLOCKED, rồi tracker 53 issue 38 DONE / 12 TODO / 3 BLOCKED gồm OV-024) là lịch sử trước website-first; không dùng làm trạng thái hiện tại.

- DONE là đạt phạm vi riêng của issue, không chứng minh ứng dụng end-to-end đã xong.
- OV-024 core: HMAC, amount/order/txn, idempotency, replay, bad signature, late callback, atomic txn; chỉ IPN verified → PREPARING; return URL không PAID. AT-024-05 chuyển OV-063.
- OV-063 BLOCKED: sandbox merchant/credentials và allowed charge. Không production charge. Không code trong issue này cho tới khi hết blocker.
- OV-034 vẫn BLOCKED tới khi impl Docker libs (`libnss3` + Puppeteer deps), `--shm-size=1g`, TTS/fixture audio, MP4 thật. Blocker **installable**, không phải credential. Được phép bắt đầu impl.
- OV-051 BLOCKED: Meta credentials/HTTPS/tester event.
- Không interview. Không implement product code trong docs pass. Không chạy formatter/full suite chỉ để viết tài liệu.

## Điểm tiếp tục — website-first DAG

Sau docs: **Wave A song song: OV-034 + OV-054 + OV-025**. Rồi theo DAG. Không đảo thứ tự bằng cách đổi status.

```
Docs (xong)
  ├─ OV-024 core DONE ──► OV-025 ──► OV-027 (deps: 025, 026 DONE, 054)
  ├─ OV-063 live VNPay BLOCKED (no code)
  ├─ OV-034 Docker+MP4 ──► OV-053 ──► OV-035 ──► OV-036 ──► OV-061
  └─ OV-054 ──► OV-055 ──► OV-056 ──► OV-057
                         └─► OV-058 ──► OV-059
                         OV-060 deps: 054, 021 DONE, 025, 027, 058
                         OV-062 deps: 057, 059, 060, 035, 036, 061
Stop before OV-037. OV-051 stays BLOCKED. OV-038..044 not this round.
```

Wave A (song song, không Graph, không charge):

### OV-034 — Docker libs + MP4 thật

Unblock path: `Dockerfile.test` apt Chrome Headless runtime gồm `libnss3` và deps Puppeteer; `docker build -f Dockerfile.test`; chạy `--shm-size=1g`; TTS sidecar hoặc fixture audio hợp lệ (không lavfi black). HyperFrames pipeline thật. MP4 H.264 yuv420p 1080x1920 có audio, ảnh sản phẩm, ffprobe, artifact hash. Status BLOCKED cho tới impl xong AT-034-04; được phép implement ngay.

### OV-054 — Channel-neutral conversations

`(organization_id, channel, channel_user_key)`, channel `FACEBOOK|WEB`. Facebook giữ page_id+psid; WEB không cần. Messages WEB không FK `facebook_inbound_events`. Migration `20260913100000_channel_neutral_conversations.sql`. Không public HTTP, không cookie. Deps OV-002, OV-014 DONE.

### OV-025 — Order operations UI

Unblocked bởi OV-024 core DONE. Fulfilment `PREPARING→DELIVERING→DELIVERED` (không `SHIPPING`). Không đợi OV-063.

Tiếp theo DAG: 054→055→056→057 và 056→058→059; 025→027 (cùng 054, 026); 060 sau 021/025/027/054/058; 034→053→035→036→061; 062 sau 057/059/060/035/036/061. Dừng trước OV-037.

## Phân công và thứ tự khả thi

Chỉ bắt đầu task khi mọi dependency DONE; chưa đạt test bắt buộc thì không mở khóa bằng cách đổi status cho tiện.

- Wave A: ba owner riêng OV-034 / OV-054 / OV-025. Không đụng file của nhau; mỗi migration một owner.
- Sau 054: 055 (session) rồi 056 (API) rồi 057 (UI `/chat`) song song nhánh 058 (AI WEB outbound) từ 056.
- 059 sau 015/001/058: composer WEB-only; Facebook ẩn/disable composer, không Graph.
- 027 sau 025+026+054: channel-neutral; không phụ thuộc cứng OV-018; PSID chỉ adapter.
- 060 sau 021/025/027/054/058.
- 034→053→035→036→061 (`WAITING_CHANNEL`, không publish).
- 062 E2E Orca sau 057/059/060/035/036/061.
- 063 chỉ khi có sandbox credentials; không chặn 025.
- 051 operator chuẩn bị riêng; không tự xin quyền, tunnel, khách thật.
- OV-017/032 đã DONE; không viết lại planner. WEB tái sử dụng `consult()` / finish_consultation; không copy engine.

Mỗi migration chỉ một owner. Timestamp mới bắt đầu `20260913100000` (latest existing `20260912121000`). Forward-only. Local container `supabase_db_onevoice` only. Agent khác không chạy migration của task đang sửa.

## Những quyết định không được tự đảo

Một business/một Page/self-host, không SaaS. **[SUPERSEDED cho WEB:]** staff trả lời trong OneVoice trên hội thoại WEB; Facebook không Graph-send từ composer. AI dừng khi WAITING_STAFF; complete chỉ cho input mới. Không tự duyệt đổi trả/bảo hành. Không approval gate từng bài. Ưu tiên marketing kết thúc vẫn PAUSED. Due content không provider → `WAITING_CHANNEL`, không `PUBLISHED`. Nhiều nguồn tri thức nhưng vận hành DB quyết định giá/tồn/đơn. VNPay verified IPN mới paid/PREPARING. Không tự refund. Tư liệu miễn phí có quyền dùng. Không đổi sang Remotion chỉ vì tham khảo repo. Không Facebook Graph / production charge trong vòng website-first.

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
|054→055→056|057/058|WEB conversation identity, session token hash, inbound persist+job; không Graph; private notes không về khách|
|058|059/060|WEB outbound từ consult()/staff; WAITING_STAFF không AI reply; send-time AI_ACTIVE+revision fence|
|024 core|025/039|Verified paid+PREPARING; live sandbox là 063, không khóa 025|
|036/035|061|Due without publish provider → WAITING_CHANNEL; không Graph, không PUBLISHED|

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

Các thay đổi người dùng ban đầu gồm dashboard/trend-chart.tsx, nav-sections.ts/test, globals.css và layout.tsx (ghi chú lịch sử). **Hiện tại dirty chỉ `next-env.d.ts`** — không commit, không reset. Mọi dirty file phát sinh sau vẫn phải bảo toàn.

Local Supabase đã dùng localhost:54321 và container supabase_db_onevoice. Trước mọi DB write test, xác nhận endpoint và org fixture local; .env hiện hữu có thể trỏ dữ liệu doanh nghiệp từ xa. Không in .env/secrets. Không coi Supabase MCP đã kết nối: phiên trước chỉ xác minh direct connection/read, chưa có MCP capability proof.

Không giả định terminal/devserver cũ còn sống; kiểm process/port trước khi khởi động. Không kill process không xác định owner. next-env.d.ts có thể đổi đường .next/dev/types do dev server; không reset cả file hay coi đây là product change.

## Tiêu chí kết thúc toàn bộ

Tất cả issue thuộc release closure phải DONE với test evidence; không còn integration blocker bị che bởi mocks. Deliverable gồm mã, migration nâng cấp không phá dữ liệu, local+provider sandbox evidence, runbook, backup/restore proof và bản demo trung thực theo044.
