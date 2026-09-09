# Roadmap phát triển OneVoice

> Phiên bản điều hành: 08/09/2026, múi giờ Việt Nam (ICT, UTC+7).
> Mục đích: đưa đội 2–4 sinh viên từ ý tưởng tới một vertical slice có thể kiểm chứng ở bán kết ngày 17/09/2026, chung kết ngày 02/10/2026 và kho mã nguồn sẵn sàng cho OLP quốc gia ngày 10/12/2026.

Roadmap này là tài liệu điều hành trung tâm. Phạm vi, vai trò và tiêu chí hệ thống được khóa trong [Blueprint toàn dự án](onevoice-project-blueprint.md); cách làm việc hằng ngày nằm trong [Playbook thực thi nhóm](team-execution-playbook.md). Khi có mâu thuẫn, ưu tiên blueprint, rồi đến acceptance gate trong tài liệu này.

## Tài liệu phải mở ở từng phase gate

| Khi cần quyết định | Đọc cùng roadmap | Gate áp dụng chính |
|---|---|---|
| Module, API, schema, queue hoặc adapter | [Kiến trúc và công nghệ](architecture-and-tech-stack.md) | P0–P3, P11–P13 |
| Provenance, version, Evidence, Truth Guard, AI evaluation hoặc handoff | [Dữ liệu, AI và guardrail](data-ai-and-guardrails.md) | P0–P3, P7–P8 |
| Test pyramid, fixture, Definition of Done hoặc release defect | [Kế hoạch kiểm thử và chất lượng](testing-and-quality-plan.md) | Mọi P0–P5 và P7–P15 |
| Compose, CI, secret, backup, SBOM, license hay release | [DevOps, release và tuân thủ OSS](devops-release-and-oss-compliance.md) | P0, P4–P5, P9, P12, P14–P15 |
| Chọn hoặc thay dependency/provider/repository | [Công cụ và repository](tools-and-repositories.md) | Trước khi thêm dependency ở mọi phase |
| Phỏng vấn, metric, video/slide, rehearsal và rubric | [Demo, xác thực và thang điểm](demo-validation-and-scoring.md) | P4–P5, P7–P10, P14–P15 |

## 1. Mục tiêu bất biến và đường găng

Mỗi phase chỉ có giá trị khi làm hoàn chỉnh hơn đúng chuỗi sau:

```text
Opportunity → Campaign → Content → Approval/Truth Guard
→ Interaction → AI consultation/Handoff → Lead
→ Draft Order → Customer confirmation → Order → Attribution
```

Không đổi ba quyết định sau trước chung kết trường:

1. MVP là modular monolith TypeScript; PostgreSQL là SSOT (nguồn dữ liệu chuẩn duy nhất) cho nghiệp vụ, version, audit và attribution.
2. `MockChannel`/loopback chạy offline là đường demo bắt buộc. Adapter mạng xã hội thật chỉ là nâng cấp sau khi credential, quyền ứng dụng và webhook đã được kiểm chứng.
3. AI chỉ tạo đề xuất, nội dung, trả lời và đơn nháp. Manager duyệt nội dung; khách xác nhận đơn COD; nhân viên hoặc cổng thanh toán xác nhận tiền.

Đường găng tới bán kết là: dữ liệu curated có version → Opportunity → Content Passport/approval → Truth Guard → MockChannel → evidence/handoff → draft order/customer confirmation → first-touch attribution. Video, provider AI từ xa và adapter thật không nằm trên đường găng.

## 2. Vai trò dùng trong roadmap

| Ký hiệu | Owner chính | Trách nhiệm trong từng gate |
|---|---|---|
| `TL` | Tech lead/release owner | Chốt scope, kiến trúc, merge/release, quyết định cut-line, đối ngoại với giảng viên |
| `BDQ` | Backend, Data và Quality owner | Schema/seed/version, API/workflow, test tự động, data reset, audit và release verification |
| `UD` | UI và Demo owner | Luồng người dùng, trạng thái nhìn thấy, Passport/dashboard, slide/video/rehearsal |
| `AIQ` | AI, Integration và QA owner | Provider/fixture adapter, evidence/handoff evaluation, adapter channel, security/license evidence |

Đội hai người: `TL` kiêm `UD`, `BDQ` kiêm `AIQ`. Đội ba người: `TL`, `BDQ+AIQ`, `UD`. Đội bốn người ở cuộc thi trường có thể tách `AIQ`, nhưng đây là một workstream chứ không mặc định là suất thi quốc gia. OLP PMNM giới hạn tối đa ba sinh viên: trước 31/10 phải khóa ba thí sinh và bàn giao workstream `AIQ` cho `BDQ`/`TL`; contributor thứ tư vẫn có thể hỗ trợ ngoài đội hình chính thức theo quy định của trường/BTC. Mỗi deliverable chỉ có một owner chịu trách nhiệm cuối cùng, dù có người hỗ trợ.

### Giả định năng lực và chế độ đội hai người

Roadmap bán kết giả định đội ba người có tổng cộng khoảng 15–18 giờ tập trung mỗi ngày. Nếu đội chỉ có hai người hoặc tổng năng lực dưới 10 giờ/ngày, áp dụng P0 tối thiểu ngay từ đầu: đúng 10 SKU, một rule, một content template/fixture, một Passport detail view, một MockChannel conversation, một Draft Order và một attribution query. `TL` phải pair vào domain core khi G1/G2 trễ; bỏ dashboard chart, render video, provider online, adapter thật và UI phụ trước khi cắt bất kỳ invariant Truth Guard/handoff/customer confirmation nào.

## 3. Lệnh kiểm tra chuẩn phải được thiết lập từ ngày 08/09

Các lệnh dưới đây là hợp đồng vận hành của repository. Nếu tên script khác, `TL` phải cập nhật bảng này, README và CI cùng một pull request; không dùng thao tác truyền miệng.

```bash
pnpm install --frozen-lockfile
docker compose --profile demo up --build -d
pnpm demo:reset -- --scenario semifinal
pnpm check
pnpm test:e2e
pnpm build
pnpm verify
curl --fail --silent --show-error http://localhost:3000/healthz
git diff --check
git status --short
```

`pnpm check` gộp format/lint/typecheck và unit/integration; dùng trong vòng lặp phát triển. `pnpm verify` gộp `check`, E2E P0, build, security và dependency/license gate; chỉ trở thành release gate bắt buộc từ P4. P0 chạy install + Compose + reset + health + `pnpm check`; P1–P3 chạy thêm các integration/E2E grep đã hiện hữu cho phase đó. Test chưa implement phải có test file/issue tương ứng và bị báo rõ là chưa đạt; không tạo script rỗng để giả xanh. `pnpm test:e2e` chạy đủ tối thiểu bốn scenario P0 khi P4 bắt đầu. `pnpm demo:reset` là tên reset duy nhất trong tài liệu.

## 4. Chặng A — khóa vertical slice cho bán kết, 08/09–17/09

### P0 — 08/09: khóa phạm vi, dữ liệu và đường chạy

**Mục tiêu.** Biến ý tưởng thành một demo contract có thể build trong tám ngày, đồng thời đặt nền tái lập và nguồn mở.

| Mục | Nội dung |
|---|---|
| Inputs | Blueprint, catalog snapshot GearVN ngày 31/08/2026 chỉ để tham khảo, thể lệ cuộc thi, thiết bị/credential hiện có của đội |
| Bước thực hiện | 1) Chốt một hero SKU hư cấu hoặc được phép dùng, tồn mô phỏng `15`, một promotion còn ba ngày và price version `v12→v13`. 2) Curate 10–20 SKU có provenance, media permission và facts cấu trúc. 3) Vẽ state transition cho Content, Conversation và Draft Order. 4) Khởi tạo repo với Apache License 2.0, `.env.example`, Compose, schema migration, seed/reset và bốn demo account. 5) Viết kịch bản S-01 đến S-05 thành issue/checklist. 6) Chốt stack/provider qua adapter; fixture offline là bắt buộc. |
| Owner | `TL` chốt scope và license; `BDQ` làm data contract/migration/seed; `UD` phác luồng demo; `AIQ` lập inventory provider, model và asset |
| Outputs | Scope card một trang; schema/seed contract; backlog P0 có owner; repo buildable; danh sách license/provenance; demo script v0 |
| Dependency | Không phụ thuộc credential mạng xã hội hoặc model từ xa |

**Acceptance gate P0.** Cả đội có thể giải thích cùng một kịch bản trong ba phút; `pnpm install`, Compose và `pnpm demo:reset -- --scenario semifinal` thành công trên máy không có database cũ; có seed cho Manager, Marketing, Sales, Customer; snapshot nguồn được ghi ngày thu thập, không gọi là tồn kho nội bộ.

**Kiểm tra thực tế.** Ở P0 chạy subset: install, Compose, reset, health, `pnpm check`, `git diff --check`; chưa yêu cầu full `pnpm verify`. Mở database và xác nhận hero SKU có price/promotion version; `git log --oneline -5` cho thấy commit có chủ đích; reviewer đọc license và `.env.example` mà không cần secret.

**Cut-line.** Nếu hết ngày 08/09 chưa có credential media hoặc LLM, dùng image/post template và deterministic fixture. Với đội hai người, chỉ scaffold đủ app + PostgreSQL + seed/reset; Valkey/worker có thể chạy synchronous adapter tạm thời đến P3 nhưng contract outbox/idempotency vẫn phải được thiết kế. Không trì hoãn schema, seed hay MockChannel để chờ tích hợp thật.

### P1 — 09/09: SSOT, Opportunity và Campaign

**Mục tiêu.** Chứng minh D và P trước: dữ liệu có version tạo một cơ hội có lý do và một campaign có trạng thái.

| Mục | Nội dung |
|---|---|
| Inputs | Migration/seed P0; rule tồn kho và promotion; state diagram đã chốt |
| Bước thực hiện | 1) Implement catalog version, product fact, promotion và immutable audit event. 2) Implement đúng một rule: nguồn tồn được phép, `on_hand ≥ threshold`, promotion `ACTIVE`, `valid_from ≤ now < valid_until` và `0 < valid_until - now ≤ window`; lưu trigger snapshot, rule version, priority và reason. 3) Tạo Campaign từ Opportunity hoặc manual selection nhưng giữ source reference. 4) Tạo UI tối thiểu cho Marketing xem/copy lý do. 5) Viết unit test cho hai biên thời gian, threshold, out-of-stock, expired/far-future promotion và duplicate/idempotent run. |
| Owner | `BDQ` domain/API/test; `UD` màn Opportunity/Campaign; `TL` review data boundary; `AIQ` kiểm rule explanation không đưa claim ngoài snapshot |
| Outputs | Opportunity engine chạy từ seed; campaign có source link; audit trail; tests domain P1 |
| Dependency | P0 gate pass; không cần content generation |

**Acceptance gate P1.** Một run sinh đúng một Opportunity cho hero SKU, lý do hiển thị kèm facts/version; không tạo lại bản trùng ở lần run kế tiếp; Marketing không thể sửa trực tiếp fact nguồn qua Campaign; audit truy được actor và correlation ID.

**Kiểm tra thực tế.** Chạy `pnpm check` và integration test của P1; chạy seed rồi trigger worker/job bằng command đã ghi trong README; truy API/UI và đối chiếu Opportunity với record seed; chạy test date boundary với promotion expired. Chưa coi full `pnpm verify` là gate.

**Cut-line.** Chỉ giữ một rule deterministic. Nếu dashboard/opportunity ranking chưa xong, hiển thị danh sách một opportunity ưu tiên; không thêm rule AI hoặc nhiều chiến dịch.

### P2 — 10/09: Content Passport, RBAC và Truth Guard

**Mục tiêu.** Chứng minh phần nguyên gốc của OneVoice: content claim có evidence, người có quyền duyệt và dữ liệu cũ bị chặn.

| Mục | Nội dung |
|---|---|
| Inputs | Opportunity/Campaign P1, snapshot/version facts, roles nội bộ |
| Bước thực hiện | 1) Tạo content draft từ template hoặc provider adapter, tách critical claims: giá, cấu hình, promotion. 2) Lưu Passport gồm source hash/version, template/provider/model, output hash, actor và lineage. 3) Evidence validator đối chiếu claim với source snapshot. 4) Enforce server-side RBAC: Marketing tạo/chỉnh draft, Manager approve/reject/exception. 5) Chạy Truth Guard trước approve và publish; price/promotion version đổi thì trạng thái `STALE/BLOCKED`. 6) Hiển thị reason/evidence cho Manager. |
| Owner | `BDQ` state machine, guard, audit; `UD` Passport/approval/error UI; `AIQ` content schema/evidence adapter and eval; `TL` review quyền và cut-line |
| Outputs | Content/claim/Passport tables và UI; approval flow; stale scenario automated test; artifact text/image demo |
| Dependency | P1 gate pass; media render có thể là static/local |

**Acceptance gate P2.** Marketing bị server từ chối khi request publish nội dung chưa duyệt nhưng được request/schedule nội dung đã duyệt; Manager approve content valid; đổi giá hero SKU `v12→v13` sau approval làm publish fail với reason nhìn thấy và bắt buộc regenerate/reapprove. Giá/promotion không được Manager exception. Không có critical claim nào không có Evidence.

**Kiểm tra thực tế.** `pnpm check`; chạy S-02 bằng `pnpm test:e2e -- --grep stale`; mở Passport và xác nhận product version, claim, evidence, approver và block event; thử endpoint bằng token Marketing để xác nhận status không đổi.

**Cut-line.** Artifact P0 là post/ảnh template. Revideo, TTS, scheduling và publish thật chỉ được thêm khi P2 đã pass hai lần liên tiếp; không thay Truth Guard bằng prompt tự đánh giá.

### P3 — 11/09–12/09: MockChannel, AI evidence/handoff và Draft Order

**Mục tiêu.** Hoàn thành nửa sau của vertical slice mà không phụ thuộc Internet hay nền tảng bên thứ ba.

| Mục | Nội dung |
|---|---|
| Inputs | Approved content/Passport P2; MockChannel contract; policy và product facts curated |
| Bước thực hiện | 1) MockChannel tạo Interaction có `content_id` và `campaign_id` từ link/source deterministic. 2) AI adapter chỉ nhận structured facts/policy/Evidence và trả schema answer/citation/handoff reason. 3) Tạo eval fixtures: known fact, unknown fact, conflict, discount exception. 4) Chuyển Conversation sang `HANDOFF_REQUIRED` khi thiếu evidence, mâu thuẫn, tài chính hay ngoại lệ. 5) Thu lead giả và validate đầy đủ trường cần thiết. 6) Tạo Draft Order, chạy Truth Guard lại, phát signed confirmation link. 7) Customer tự xác nhận COD hoặc hủy; AI không có endpoint/state transition để tự xác nhận. |
| Owner | `AIQ` adapter/eval/handoff; `BDQ` Interaction, lead/order transaction và signed link; `UD` inbox, evidence drawer, customer confirmation; `TL` test quyền quyết định |
| Outputs | Offline inbox, grounded answer/evidence view, handoff queue, draft/customer confirmation COD, order audit |
| Dependency | P2 gate pass; AI fixture local bắt buộc trước provider remote |

**Acceptance gate P3.** S-01 hoàn thành từ approved content đến `ORDER_CREATED`; answer known fact hiện SKU/field/version; unknown/conflict tạo handoff thay vì claim; Customer, không phải AI hay Sales, tạo `CUSTOMER_CONFIRMED`; lead/order chứa PII giả và được masking trong log.

**Kiểm tra thực tế.** `pnpm test:e2e -- --grep 'happy path|missing evidence|unauthorized'`; rút Internet hoặc tắt provider remote rồi chạy lại happy path với fixture; mở audit và truy actor của mọi state transition; thử gọi confirmation endpoint bằng service token và nhận HTTP 403/401 theo thiết kế.

**Cut-line.** Chỉ một inbox web loopback và một journey khách. Không làm Facebook/Zalo/TikTok, payment QR, recommendation nhiều SKU hay semantic RAG tổng quát trước P3 pass.

### P4 — 13/09–14/09: Attribution, hardening và hồ sơ bán kết

**Mục tiêu.** Làm evidence cuối của luồng và biến sản phẩm chạy thành hồ sơ có thể chấm.

| Mục | Nội dung |
|---|---|
| Inputs | S-01 đến S-04, audit/lineage P3, tiêu chí bán kết |
| Bước thực hiện | 1) Implement deterministic first-touch attribution; nguồn thiếu phải lưu `unknown`. 2) Tạo Passport/order view truy Opportunity→Order. 3) Hoàn thiện four E2E P0 và S-05 offline fallback. 4) Viết README runbook, sơ đồ kiến trúc/workflow/data/AI, danh mục OSS và dịch vụ thứ ba. 5) Quay video tối đa năm phút từ build thật; soạn slide từ dữ liệu không nhạy cảm. 6) Đo M-01 đến M-06 bằng fixture/fault injection, không tự suy diễn doanh thu. |
| Owner | `BDQ` attribution/query/tests; `UD` dashboard, video, slide; `AIQ` evaluation report/AI boundary; `TL` hồ sơ, narrative và review |
| Outputs | Order lineage view, test report, video backup, slide, architecture/workflow diagrams, submission checklist |
| Dependency | P3 gate pass; không cần adapter thật |

**Acceptance gate P4.** Một Order demo truy ngược được toàn bộ lineage hoặc hiển thị `unknown` ở điểm nguồn thiếu; bốn E2E P0 và offline fallback pass; video dưới năm phút; tài liệu nêu rõ dữ liệu synthetic/snapshot và thành phần thứ ba; không còn bug P0/P1 mở.

**Kiểm tra thực tế.** `pnpm check && pnpm test:e2e`; chạy `git diff --check`; fresh clone vào thư mục tạm, dùng README dựng demo; kiểm video duration; một người ngoài đội dùng checklist để xác nhận narrative, data label và link tài liệu.

**Cut-line.** Nếu dashboard chưa hoàn chỉnh, Passport order detail là màn hình attribution chính. Không mở rộng chart, analytics real-time, video AI hay platform adapter trong khi bốn E2E chưa xanh.

### P5 — 15/09–16/09: release candidate và freeze

**Mục tiêu.** Bảo đảm bản nộp/biểu diễn có thể tái lập, reset và phục hồi khi lỗi.

| Mục | Nội dung |
|---|---|
| Inputs | P4 artifacts, laptop demo, video backup, deployment/Compose instructions |
| Bước thực hiện | 1) Chỉ triage lỗi P0/P1; đóng feature mới. 2) Fresh-install rehearsal trên máy khác hoặc user profile sạch. 3) Chạy hai full rehearsal liên tiếp theo thời lượng bán kết. 4) Backup seed/database/media/video/slide và kiểm reset. 5) Tag release candidate, freeze lockfile; kiểm secret, license inventory và git state. |
| Owner | `TL` release/freeze; `BDQ` fresh-install/reset; `UD` rehearsal/backup presentation; `AIQ` offline and dependency verification |
| Outputs | Release candidate tag, backup bundle, rehearsal log, known-issue list có workaround, file nộp cuối |
| Dependency | P4 gate pass |

**Acceptance gate P5.** Hai rehearsal liên tiếp hoàn thành không sửa code; `docker compose --profile demo up --build -d` và reset thành công từ clone mới; no P0 defect; demo có đường fallback khi Internet/provider lỗi; chỉ có P1/P2 đã được `TL` chấp nhận và có workaround.

**Kiểm tra thực tế.** Full command contract trên máy sạch; tắt Wi-Fi sau startup; `git status --short` chỉ có artifact release được chủ đích; verify hashes of backup files; peer review submission checklist item-by-item.

**Cut-line.** Sau 18:00 ngày 15/09 chỉ sửa P0. Ngày 16/09 không merge thay đổi logic; dùng video backup nếu bất cứ external service nào không ổn định.

### 17/09: bán kết online

**Mục tiêu.** Trình bày một câu chuyện duy nhất và chứng minh được phần chạy thật.

**Runbook.** Khởi động local stack trước giờ ít nhất 45 phút; reset seed; kiểm healthcheck, browser profiles, demo accounts, media local và video backup; mở sẵn ba tab: Opportunity, Passport/Truth Guard và customer confirmation/attribution. Demo theo thứ tự S-01, chèn S-02 tại thời điểm đổi giá, sau đó S-03 ở inbox. Người điều phối không code trong giờ chờ; một người quan sát log/reset.

**Gate tại chỗ.** Demo core chạy offline; phát video chỉ là fallback, không thay cho mọi màn hình; câu trả lời phản biện bám evidence, permission và scope đã làm.

**Cut-line.** Không nhận sửa tính năng từ chat phút chót. Nếu một màn hình lỗi, chuyển sang seeded backup state và tiếp tục câu chuyện, không trình diễn trang lỗi không giải thích được.

## 5. Chặng B — hoàn thiện chung kết trường, 18/09–02/10

### P6 — 18/09: retrospective và tái xếp backlog

**Mục tiêu.** Chuyển phản hồi bán kết thành thay đổi nhỏ, đo được, không làm hỏng vertical slice.

| Mục | Nội dung |
|---|---|
| Inputs | Recording, câu hỏi giám khảo, bug log, release candidate bán kết |
| Bước thực hiện | Phân loại feedback thành defect, clarity, evidence, usability hoặc ý tưởng sau cuộc thi; gắn tiêu chí chấm bị ảnh hưởng; chỉ chọn item có owner, acceptance test và cut-line; cập nhật risk register và rehearsal script. |
| Owner | `TL` quyết backlog; tất cả thành viên cung cấp evidence; `BDQ` rà regression risk |
| Outputs | Decision log, sprint chung kết giới hạn WIP, updated test/demo checklist |
| Dependency | Bán kết hoàn tất |

**Acceptance gate P6.** Không có item “làm cho đẹp” thiếu tiêu chí; mọi thay đổi logic nêu test cần thêm; P0 vertical slice vẫn là item ưu tiên số một.

**Kiểm tra thực tế.** Review 30 phút với giảng viên hoặc reviewer; `git tag --list` giữ được baseline bán kết; `pnpm check` trên baseline trước khi bắt đầu thay đổi.

**Cut-line.** Không rewrite kiến trúc, không đổi database/framework, không thêm domain mới dựa trên một câu hỏi phản biện.

### P7 — 19/09–22/09: harden trải nghiệm và bằng chứng

**Mục tiêu.** Nâng chất lượng thao tác, observability và chứng cứ của core flow.

| Mục | Nội dung |
|---|---|
| Inputs | Backlog P6, baseline release, defect reports |
| Bước thực hiện | Sửa P0/P1; giảm số click trong core flow; làm rõ `STALE`, `BLOCKED`, `HANDOFF_REQUIRED`, quyền actor và source timestamp; thêm correlation ID/audit viewer/health state; hoàn thiện metric capture và accessibility cơ bản; chỉ thử adapter thật sau proof credential/webhook riêng. |
| Owner | `UD` UX/error state; `BDQ` observability/regression; `AIQ` eval usability and adapter proof; `TL` accepts integration scope |
| Outputs | Polished core UI, audit/health evidence, measured test results, adapter proof or explicit mock-only decision |
| Dependency | P6 gate pass |

**Acceptance gate P7.** Người ngoài đội hoàn thành S-01 theo script; stale/handoff/error được hiểu không cần giải thích dài; audit đọc được request-to-order; nếu adapter thật được giữ, nó pass webhook/auth/idempotency test và không thay MockChannel.

**Kiểm tra thực tế.** Usability session ghi màn hình; `pnpm test:e2e`; simulate restart/worker retry; `curl` health endpoints; verify logs mask PII.

**Cut-line.** Adapter thật thất bại bất kỳ proof nào thì tắt bằng feature flag và demo MockChannel. Không mở multi-channel hay payment thật.

### P8 — 23/09–25/09: fault injection, QA và nội dung chung kết

**Mục tiêu.** Chứng minh “AI có trách nhiệm” và độ tin cậy thay vì chỉ polish giao diện.

| Mục | Nội dung |
|---|---|
| Inputs | P7 build, evaluation fixtures, scoring rubric |
| Bước thực hiện | Chạy injected cases: price/promotion/stock stale, evidence absent/conflict, role bypass, malformed signed link, duplicate webhook/message, external provider timeout; cập nhật regression test; quay video final candidate; viết câu trả lời phản biện cho H–P–D–I, data permission, license và originality. |
| Owner | `AIQ` eval/fault matrix; `BDQ` robustness fixes/tests; `UD` video/presentation; `TL` rebuttal and scope integrity |
| Outputs | QA evidence pack, risk matrix signed off, video candidate, slide/script v2 |
| Dependency | P7 gate pass |

**Acceptance gate P8.** All P0 fault cases fail safe: blocked/handoff/deny/retry-visible, never silent success; no secret/PII in captured artifacts; video/story stays within ten minutes and maps each DX-OS layer to a visible action.

**Kiểm tra thực tế.** `pnpm test:e2e -- --grep 'stale|handoff|unauthorized|offline'`; inspect logs; execute data reset after each case; review video with timer and compare claims to visible screen.

**Cut-line.** Không thêm agent autonomy, livestream, OCR hoặc analytics prediction. Một failure không tái lập được là P0 cho tới khi có reproduction hoặc documented workaround.

### P9 — 26/09–28/09: rehearsal, compliance và final release candidate

**Mục tiêu.** Khóa một build có thể trình diễn trực tiếp và được kiểm tra độc lập.

| Mục | Nội dung |
|---|---|
| Inputs | QA evidence, slides/video v2, OSS inventory |
| Bước thực hiện | Ba rehearsal với người đóng vai giám khảo; fresh-install test; generate SBOM/dependency inventory; review license của code, model, dataset, media/font/music; tag final RC; test monitor/audio/network/power backup. |
| Owner | `TL` release and compliance sign-off; `BDQ` fresh install/SBOM; `UD` rehearsal logistics; `AIQ` model/media/provider review |
| Outputs | Final RC, rehearsal timings, compliance pack, portable offline bundle |
| Dependency | P8 gate pass |

**Acceptance gate P9.** Ba rehearsal hoàn thành trong 10 phút demo + 5 phút Q&A without code changes; fresh install succeeds; component inventory has owner/license/source/fallback; no unknown production secret; release tag maps to exact artifact hashes.

**Kiểm tra thực tế.** `pnpm audit --prod`; SBOM command được ghi trong release notes; chạy `pnpm verify`; install from tag trong thư mục sạch; inspect `git diff <tag> --check`.

**Cut-line.** Sau ngày 28/09, only P0 fixes and presentation corrections. Nếu video programmatic không deterministic, dùng artifact pre-rendered có provenance thay vì render live.

### P10 — 29/09–02/10: freeze và chung kết trực tiếp

**Mục tiêu.** Vận hành demo 10 phút có dự phòng, phản biện được năm phút bằng evidence.

| Mục | Nội dung |
|---|---|
| Inputs | Final RC, backup bundle, Q&A cards, venue plan |
| Bước thực hiện | Daily short rehearsal; check laptop, charger, hotspot, projector resolution, local Docker images and browser profile; freeze code; allocate speaker/operator/log observer; execute direct-final runbook. |
| Owner | `TL` speaker/timekeeper; `UD` operator; `BDQ` stack/reset/log observer; `AIQ` Q&A and fallback observer |
| Outputs | Final demo machine, printed/available Q&A evidence, release artifact and fallback video |
| Dependency | P9 gate pass |

**Acceptance gate P10.** Runbook is executable by an alternate member; demo starts with no Internet; every claim in slides has artifact, test result or explicit simulation label; no merge after final freeze except verified P0.

**Kiểm tra thực tế.** Cold boot rehearsal; disable Wi-Fi; execute reset and S-01/S-02/S-03; time each speaker segment; checksum backup and verify playback.

**Cut-line.** On 02/10, do not change environment after setup. If live provider/channel fails, present the offline core and its fault-handling evidence rather than retrying indefinitely.

## 6. Chặng C — chuẩn hóa cho OLP quốc gia, 03/10–10/12

### P11 — 03/10–10/10: bảo toàn baseline và productization backlog

**Mục tiêu.** Bảo toàn bằng chứng chung kết, xử lý nợ kỹ thuật có chọn lọc và tách phần tái sử dụng khỏi phần demo.

| Mục | Nội dung |
|---|---|
| Inputs | Final tag, recording, feedback, known-issue list |
| Bước thực hiện | Tag/archive final evidence; retrospective; write ADR cho các quyết định lõi; triage dependency/security debt; review module boundaries and public API; define OLP-compatible backlog that remains domain-adaptable. |
| Owner | `TL` roadmap/ADRs; `BDQ` debt/module review; `AIQ` model/data license follow-up; `UD` community showcase assets |
| Outputs | Preserved final baseline, OLP backlog, ADR index, maintenance policy |
| Dependency | Chung kết hoàn tất |

**Acceptance gate P11.** Baseline chung kết vẫn dựng và demo được; every OLP item has business reason, test plan and owner; no speculative rewrite entered active sprint.

**Kiểm tra thực tế.** Checkout final tag in clean directory; run command contract; compare release assets hashes; review backlog against OLP PoF criteria.

**Cut-line.** Không làm lại UI/stack chỉ vì có thời gian; giữ modular monolith tới khi có số liệu chứng minh cần tách.

### P12 — 11/10–08/11: tái lập, bảo mật và OSS compliance

**Mục tiêu.** Đạt nền PoF: public source có thể build, license rõ, dependency và artifact truy được.

| Mục | Nội dung |
|---|---|
| Inputs | Baseline P11, OLP PoF rubric, current inventory |
| Bước thực hiện | Public repository hygiene; xác minh Apache License 2.0 và thêm SPDX headers khi phù hợp; hoàn thiện `LICENSE`, `NOTICE`, CONTRIBUTING, SECURITY, CHANGELOG; pin dependencies; sinh SBOM; scan secrets/licenses/vulnerabilities; tạo clean-install, backup/restore và upgrade runbooks; thiết lập CI cho check, tests và container build. |
| Owner | `TL` policy/public release; `BDQ` CI/build/SBOM; `AIQ` license inventory for model/dataset/media; `UD` contributor and screenshot docs |
| Outputs | Release-ready repo, SBOM, dependency/license matrix, CI badges/reports, security and contributor docs |
| Dependency | P11 gate pass; official licenses verified at primary sources |

**Acceptance gate P12.** A new contributor builds from public source without hidden files; CI executes lint/type/test/build; each shipped code/model/dataset/media artifact has source, revision, license, use restriction and replacement decision; secrets scanner clean.

**Kiểm tra thực tế.** Fresh clone trên máy/container khác; `pnpm install --frozen-lockfile`; Compose build; `pnpm verify`; lưu SBOM và license scan thành release artifact; kiểm repo public không có credential.

**Cut-line.** Remove or replace any component without licensable right for the intended distribution; do not waive an unclear model/media license because the demo works locally.

### P13 — 09/11–25/11: adapter hardening và đề OLP khi được công bố

**Mục tiêu.** Giữ OneVoice adaptable trước đề nghiệp vụ chính thức, không đoán trước domain rồi xây quá mức.

| Mục | Nội dung |
|---|---|
| Inputs | Official OLP brief when available, P12 release, partner feedback |
| Bước thực hiện | Map official requirements to reusable modules: identity/RBAC, process/state machine, SSOT/version/audit, intelligence/evidence; adapt seed/domain vocabulary behind interfaces; add only integrations required by brief; create migration/demo scenario; preserve original OneVoice evidence. Trước 31/10 khóa ba thí sinh OLP và hoàn tất bàn giao workstream thứ tư. Khi lịch dự kiến còn hiệu lực, hoàn tất đăng ký trực tuyến trước 25/11 và phối hợp trường gửi đăng ký chính thức trước 27/11; kiểm lại thông báo BTC trước khi nộp. |
| Owner | `TL` requirement mapping; `BDQ` module/config adaptation; `AIQ` safety/eval update; `UD` revised demo flow |
| Outputs | Traceability matrix official brief→module→test→demo, release branch, scenario pack, biên bản bàn giao ba thí sinh và xác nhận đăng ký |
| Dependency | P12 gate pass and actual brief |

**Acceptance gate P13.** Every new requirement maps to an existing or explicitly added module, acceptance test and demo action; core version/audit/RBAC/evidence invariants remain true; scope approved by mentor before implementation.

**Kiểm tra thực tế.** Requirement review meeting; run previous S-01–S-05 plus adapted scenarios; diff schema/API and verify migration/rollback plan; check documentation links.

**Cut-line.** If the official brief is not available, work only on generic quality, documentation, tests and contributor readiness. Do not invent a second enterprise product.

### P14 — 26/11–06/12: release, documentation và hackathon rehearsal

**Mục tiêu.** Chuẩn bị bản phát hành có thể bị chấm kho mã và bị chạy lại dưới áp lực hackathon.

| Mục | Nội dung |
|---|---|
| Inputs | P13 scenario, current public repo, OLP requirements |
| Bước thực hiện | Feature freeze; create release/tag/changelog; rerun full dependency and license audit; validate documentation from clone; prepare issue tracker labels, demo accounts and seed datasets; rehearse build, test, demo and Q&A under timebox. |
| Owner | `TL` release/checklist; `BDQ` reproducibility; `AIQ` compliance/evaluation pack; `UD` showcase/readme visuals |
| Outputs | OLP release candidate, reproducibility record, final documentation set, hackathon runbook |
| Dependency | P13 gate pass |

**Acceptance gate P14.** Repo is public, tagged, licensed and buildable; docs point to exact commands; all required artifacts are attached or linked; independent reviewer can reproduce core flow and locate original contribution.

**Kiểm tra thực tế.** Fresh clone rehearsal có bấm giờ; `pnpm verify`; CI xanh tại tag; đọc README như contributor mới; kiểm link release và checksum artifact.

**Cut-line.** After RC, fixes only for build, legal/compliance, security or P0 workflow failures. Any enhancement becomes a post-competition issue.

### P15 — 07/12–10/12: chấm kho mã và hackathon OLP

**Mục tiêu.** Có đội hình, source và demo có thể kiểm tra trực tiếp mà không phụ thuộc người viết ban đầu.

| Mục | Nội dung |
|---|---|
| Inputs | OLP RC, portable environment, official schedule |
| Bước thực hiện | Reconfirm tag/CI/SBOM; distribute roles; verify build on event hardware; run seed/reset; present architecture, original modules, OSS choices, test evidence and one end-to-end story; capture questions for follow-up. |
| Owner | Ba thí sinh chính thức: `TL` coordination/presentation; `BDQ` build/data và workstream `AIQ`; `UD` demo/operator. Contributor thứ tư không nằm trong đội hình thi |
| Outputs | Submitted/reviewed source, live demo, response log, post-event archive |
| Dependency | P14 gate pass |

**Acceptance gate P15.** Any two team members can execute clean build and core demo; one can explain license/dependency choices; one can reproduce stale/handoff/security tests; no uncommitted secret or local-only artifact is required.

**Kiểm tra thực tế.** Run the command contract from release tag; offline demo rehearsal; inspect `git status --short`; compare running image/version to release manifest.

**Cut-line.** During chấm kho mã/hackathon, only apply a narrowly scoped, reviewed fix required to build or run the submitted scenario; tag and document it immediately.

## 7. Release gates tóm tắt

| Gate | Ngày chậm nhất | Bằng chứng bắt buộc | Quyết định nếu fail |
|---|---:|---|---|
| G0 scope/data | 08/09 | Curated seed, contract, role owner, OSS/data labels | Cắt external integration/video |
| G1 opportunity | 09/09 | Deterministic rule, version/audit, tests | Cắt ranking/multiple rules |
| G2 guard | 10/09 | Passport, RBAC, stale block | Cắt render/scheduling thật |
| G3 order loop | 12/09 | MockChannel, evidence/handoff, customer-confirmed COD | Cắt platform/payment/RAG rộng |
| G4 semifinal package | 14/09 | Attribution, four E2E, docs/video/slide | Cắt dashboard nâng cao |
| G5 freeze | 16/09 | Two clean rehearsals, fresh install, backup | Chỉ P0 fixes/video fallback |
| G6 final RC | 28/09 | Three rehearsals, compliance pack, portable bundle | Chỉ P0/presentation fixes |
| G7 OLP PoF | 06/12 | Public reproducible release, SBOM/license/docs | Chỉ build/legal/security/P0 fixes |

## 8. Định nghĩa hoàn thành theo mốc

Một item không hoàn thành khi chỉ có màn hình hoặc code chạy trên máy tác giả. Mỗi item phải có owner, acceptance criterion, test evidence, validation/error state, RBAC/audit nếu có side effect, seed/reset nếu dùng data, tài liệu ngắn và demo-visible output.

Một release không hoàn thành khi chỉ có video. Nó phải có P0 tests xanh, no known P0 defect, build từ clone mới, source/asset/provider inventory, runbook reset/fallback và rehearsal evidence. Nếu bất kỳ điều kiện nào thiếu, `TL` ghi rõ quyết định giữ/cắt item thay vì ngầm coi nó là hoàn tất.
