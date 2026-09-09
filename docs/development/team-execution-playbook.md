# Playbook thực thi nhóm OneVoice

> Phiên bản điều hành: 08/09/2026, múi giờ Việt Nam (ICT, UTC+7).
> Áp dụng cho đội 2–4 sinh viên xây OneVoice từ bán kết trường ngày 17/09/2026 tới OLP quốc gia ngày 10/12/2026.

Playbook biến [roadmap](development-roadmap.md) thành cách làm việc hằng ngày. Nó ưu tiên một vertical slice đáng tin hơn nhiều module rời rạc, và giữ repository luôn ở trạng thái một thành viên khác có thể dựng/chạy/kiểm tra.

## 1. Cam kết làm việc

1. Chỉ xây thứ làm chắc hơn chuỗi `Opportunity → Campaign → Content → Interaction → Lead → Draft Order → Order`.
2. PostgreSQL là SSOT; không sửa dữ liệu nghiệp vụ bằng tay để cứu demo. Muốn thay đổi phải qua migration, seed hoặc endpoint có audit.
3. AI không là authority. Không Evidence thì không claim; thiếu/mâu thuẫn/rủi ro thì handoff người thật.
4. MockChannel, deterministic fixture và seed/reset là phần sản phẩm, không phải thủ thuật trình diễn.
5. Mọi số liệu, dữ liệu doanh nghiệp và media phải có provenance/permission. Dataset GearVN là snapshot công khai, không phải tồn kho nội bộ hoặc quan hệ hợp tác.
6. Mỗi merge vào nhánh chính phải làm repository tốt hơn hoặc an toàn hơn để phát hành; không merge “tạm chạy”.

## 2. Đội hình và quyền quyết định

### 2.1 Vai trò bốn người

| Vai trò | Accountable | Responsible chính | Quyền quyết định |
|---|---|---|---|
| `TL` — Tech lead/release owner | Scope, release, kiến trúc, deadline, quyết định cắt | Backlog order, PR architecture, mentor communication, final sign-off | Có quyền từ chối feature không có test/gate; chốt cut-line sau khi nghe owner |
| `BDQ` — Backend/Data/Quality | SSOT, transaction, guard, automated test | Schema/migration, worker/API, seed/reset, audit, CI verification | Chặn merge làm mất version/audit, không tái lập hoặc làm test P0 đỏ |
| `UD` — UI/Demo | Khả dụng và demo narrative | UI states, Passport/attribution view, slides/video, rehearsal | Chặn demo claim không nhìn thấy được hoặc không có fallback |
| `AIQ` — AI/Integration/Quality | Evidence/handoff, provider safety, external dependency evidence | Adapter, eval set, MockChannel/adapter proof, privacy/license inventory | Chặn AI behavior không grounded hoặc component có license/quyền dùng chưa rõ |

Mỗi người là reviewer bắt buộc cho miền của mình; `TL` không được tự merge thay đổi lớn do chính mình viết nếu không có một reviewer khác. Giảng viên là người phản biện scope/đạo đức/dữ liệu, không phải người sửa thay đội.

### 2.2 Thu gọn khi chỉ có hai hoặc ba người

| Quy mô | Phân vai | Quy tắc giảm rủi ro |
|---:|---|---|
| 2 | A: `TL+UD`; B: `BDQ+AIQ` | Mỗi PR có self-checklist và review chéo; không mở adapter thật/video live |
| 3 | A: `TL`; B: `BDQ+AIQ`; C: `UD` | B và C pair trong S-01–S-05 rehearsal; `TL` không ôm thêm module |
| 4 | Tách đủ bốn role | Người thứ tư tăng QA/eval/compliance, không mở feature mới trước phase gate |

OLP PMNM giới hạn tối đa ba sinh viên. Vì vậy với đội bốn người ở cuộc thi trường, `AIQ` là workstream tách riêng tạm thời; trước 31/10 đội khóa ba thí sinh chính thức, chuyển AI evaluation/adapter cho `BDQ` và compliance/provider decision cho `TL`, rồi tổ chức một buổi bàn giao có runbook và rehearsal. Contributor thứ tư không được trình bày như thí sinh OLP nếu quy định chính thức không cho phép.

Nếu một thành viên vắng quá một ngày trong chặng bán kết hoặc hai ngày ở chặng sau, owner phải chuyển issue, demo account, command và trạng thái hiện tại cho backup owner trước daily tiếp theo.

## 3. Nhịp điều hành theo chặng

### 3.1 08/09–16/09: chế độ bán kết

- 09:00, tối đa 12 phút: mỗi owner nói “gate hiện tại, bằng chứng hôm qua, blocker, cut đề xuất”.
- 13:30, tối đa 10 phút: kiểm đường găng; chỉ `TL` thay thứ tự backlog.
- 21:00, tối đa 20 phút: chạy command contract, cập nhật defect board, ghi một replayable demo state trước khi kết thúc ngày.
- Mỗi ngày tối thiểu một lần reset seed và chạy đúng phần E2E liên quan thay đổi trong ngày.
- Ngày 15/09 chuyển sang release mode; ngày 16/09 chỉ xử lý P0 và rehearsal.

### 3.2 18/09–02/10: chế độ chung kết

- Daily 15 phút vào đầu buổi làm việc và review QA/rehearsal cuối buổi.
- Họp refinement tối đa 30 phút sau retrospective 18/09; WIP tối đa ba item kỹ thuật cùng lúc với đội bốn người, hai item với đội hai hoặc ba người.
- Hai buổi review với người ngoài đội: một usability review, một mock jury review trước 28/09.
- Từ 28/09 là release mode: chỉ lỗi P0, compliance hoặc chỉnh presentation có bằng chứng.

### 3.3 03/10–10/12: chế độ OLP

- Weekly planning 45 phút: chọn ít hơn năng lực ước lượng để giữ thời gian cho reproducibility/compliance.
- Mid-week technical review 30 phút: module boundary, license, migration, CI và test debt.
- Weekly contributor/release check 30 phút: clone mới, build, docs, issue tracker, changelog.
- Sau khi có đề OLP chính thức, dùng một buổi mapping yêu cầu→module→test→demo trước khi code.

## 4. Bảng công việc và cách chọn việc

Dùng một board có các cột: `Ready`, `In progress`, `In review`, `Verification`, `Done`, `Cut`. Không đưa item không có owner và acceptance criterion vào `Ready`.

Mỗi issue phải có các trường tối thiểu:

```text
Mục tiêu người dùng:
In scope / out of scope:
Owner và reviewer:
Acceptance examples:
Data/permission ảnh hưởng:
Test cần thêm hoặc cập nhật:
Demo-visible result:
Dependency/risk:
Cut-line nếu không xong đúng gate:
```

Ưu tiên được tính theo thứ tự: safety/data invariant → vertical-slice gap → test/reproducibility → evidence/demo clarity → nice-to-have. Nếu một item không nâng một tiêu chí chấm, một invariant hoặc phase gate, đưa vào `Cut` hoặc backlog sau cuộc thi.

`In progress` nghĩa là branch đã có owner và có bước tiếp theo trong ngày; item bị block quá bốn giờ phải ghi lý do, owner phụ thuộc và fallback. Không che blocker bằng cách mở một feature độc lập khác.

## 5. Git workflow và review

### 5.1 Nhánh, commit và merge

- `main` luôn phải build/test được và đại diện cho bản có thể demo.
- Mỗi issue dùng branch ngắn: `feat/opportunity-rule`, `fix/truth-guard-price`, `docs/semifinal-runbook`, `chore/sbom`.
- Không commit trực tiếp vào `main`, không force-push nhánh chung, không rebase branch của người khác.
- Commit nhỏ, mô tả hành vi: `feat(guard): block publish when price version differs` thay vì `update`.
- Một PR chỉ giải một vấn đề; tách refactor không liên quan khỏi thay đổi behavior.
- Rebase/merge theo quy ước repository, nhưng trước merge phải qua CI/checklist. `TL` ghi release tag ở các gate G5, G6 và G7 của roadmap.

### 5.2 Checklist PR bắt buộc

Tác giả hoàn thành checklist trước review; reviewer chỉ approve khi tự đối chiếu ít nhất acceptance path.

```text
[ ] Issue nêu acceptance, owner và cut-line.
[ ] Không đổi SSOT/audit/RBAC ngoài ý định; migration có rollback hoặc recovery note.
[ ] Có test mới/cập nhật cho happy path và failure path liên quan.
[ ] pnpm check xanh; nếu chạm workflow P0 thì E2E liên quan xanh.
[ ] Seed/reset hoặc fixture được cập nhật xác định.
[ ] UI hiển thị state/error/evidence cần thấy; không chỉ ẩn nút.
[ ] Log không lộ secret hoặc PII đầy đủ.
[ ] Dependency/model/media mới có source, revision, license và fallback.
[ ] README/tài liệu runbook thay đổi nếu lệnh hoặc behavior thay đổi.
[ ] git diff --check sạch; không đưa artifact lớn/secret vào source.
```

PR thay đổi Truth Guard, permission, customer confirmation, AI tool side-effect, migration hoặc license cần hai người review nếu đội có từ ba người; tối thiểu một reviewer không phải tác giả nếu đội hai người.

### 5.3 Quy tắc source và artifact

- Source, migration, seed schema, test fixture và docs ở Git; generated media/binary lớn chỉ lưu khi license và release policy cho phép.
- Không commit `.env` chứa secret, customer PII thật, raw dataset không được phép phân phối, token signed còn dùng được hoặc recording có thông tin nhạy cảm.
- Mọi asset demo phải có inventory: source, author/right holder, date, license/permission, hash, intended use, replacement plan.
- Khi một dependency không rõ license, `AIQ`/`TL` đặt nó ở trạng thái blocked; không merge trước khi có bằng chứng hoặc phương án thay thế.

## 6. Quy trình build–test–demo hằng ngày

### 6.1 Command contract

Từ P4, trước khi gọi một build “sẵn sàng”, owner chạy và lưu output/link CI cho toàn bộ release gate:

```bash
pnpm install --frozen-lockfile
docker compose --profile demo up --build -d
pnpm demo:reset -- --scenario semifinal
pnpm verify
curl --fail --silent --show-error http://localhost:3000/healthz
git diff --check
```

Các scripts phải được định nghĩa trong `package.json` và README. Khi chưa có một script cần thiết, issue tương ứng chưa thể vào `Done`; `BDQ` thêm command hoặc giảm claim/gate về phần đã kiểm được.

Ở P0 chỉ bắt buộc install + Compose + reset + health + `pnpm check` + `git diff --check`. P1–P3 chạy `pnpm check` và test integration/E2E được thêm cho phase hiện tại; chưa được ghi nhận là full release gate. Không tạo `pnpm verify` rỗng để có kết quả xanh giả.

### 6.2 Bộ scenario P0

| ID | Hành trình | Owner chạy trước release | Bằng chứng tối thiểu |
|---|---|---|---|
| S-01 | Opportunity → approved content → interaction → evidence answer → lead → Draft Order → customer confirms COD → attribution | `BDQ` + `UD` | E2E result, Passport/order screenshots, audit correlation ID |
| S-02 | Approved content dùng giá/promotion cũ → Truth Guard block → bắt buộc regenerate/reapprove; không cho Manager exception | `BDQ` | Test output, block reason, version/audit evidence |
| S-03 | Question thiếu evidence hoặc mâu thuẫn → `HANDOFF_REQUIRED` | `AIQ` + `UD` | Eval fixture, evidence gap, Sales queue view |
| S-04 | Marketing publish chưa duyệt hoặc AI/service cố confirm order → server deny, state bất biến | `BDQ` + `AIQ` | Authorization response, audit event, unchanged record |
| S-05 | Provider/network unavailable → fixture/MockChannel core flow vẫn chạy; job ngoài hiển thị retry/bounded failure | `AIQ` | Offline rehearsal log, UI state, no data loss |

Một regression chỉ đóng sau khi có reproduction fixture/test. Nếu bug không thể tự động hóa kịp, lưu video/steps deterministic và tạo test ngay khi phase freeze qua.

### 6.3 Triage lỗi

| Mức | Định nghĩa | SLA trong chặng bán kết/chung kết | Hành động |
|---|---|---|---|
| P0 | Mất data, bypass quyền, AI/customer confirmation sai, core demo không chạy, lộ secret/PII, build không tái lập | Dừng feature khác; xử lý ngay | `TL` điều phối, owner tạo reproduction, fix + regression trước merge |
| P1 | Một scenario có workaround rõ nhưng làm giảm trải nghiệm/điểm | Xử lý trước gate kế tiếp | Gắn workaround vào runbook, owner/ETA, test khi fix |
| P2 | Lỗi polish hoặc backlog không ảnh hưởng core evidence | Sau release gate | Không chen vào release mode |

Không downgrade P0 chỉ để kịp demo. Nếu không sửa được, chuyển sang fallback có kiểm chứng và nói rõ giới hạn trong trình bày.

## 7. Data, AI, bảo mật và quyết định side-effect

### 7.1 Data discipline

- Dùng 10–20 SKU curated. Mỗi fact có `source`, `collected_at`, `as_of`, `version`, trust level và permission/license status.
- Tồn kho, promotion và policy mô phỏng phải được ghi nhãn mô phỏng. Không dùng con số từ snapshot công khai làm dữ liệu vận hành hiện tại.
- Demo PII là giả; log che phone/address và không ghi raw prompt chứa PII vào telemetry.
- Không overwrite critical facts: update tạo version mới; Passport và Order giữ reference version/hashes của thời điểm hành động.
- Reset demo là một command, có seed fixed/fake clock và chạy idempotent. Không sửa database thủ công giữa rehearsal.

### 7.2 AI discipline

- Model/provider chỉ nằm sau adapter. Fixture local phải trả output schema giống provider thật để test offline.
- AI answer chứa Evidence reference gồm SKU/field/version hoặc tạo handoff. Không để LLM tự gọi side-effect endpoint không qua authorization, schema validation và idempotency ở server.
- `AIQ` duy trì eval set known/unknown/conflict/risky; mọi sửa prompt/model/provider chạy lại set này.
- Hỏi giá đặc biệt, thương lượng, thanh toán, refund, legal commitment, lack/conflict evidence đều chuyển người thật.
- Không gọi output fixture là “AI live”; màn demo và tài liệu nêu đúng provider/fallback đang chạy.

### 7.3 Decision rights

| Hành động | Ai khởi tạo | Ai có quyền hoàn tất | Bằng chứng bắt buộc |
|---|---|---|---|
| Create/edit content draft | Marketing hoặc AI | Marketing | Source snapshot + audit |
| Approve/reject/exception | Manager | Manager | Evidence/Truth Guard result + audit |
| Request/schedule publish | Marketing hoặc Manager | Server chỉ nhận khi content đã approved | Current fact version + approval + audit |
| Execute external publish | Worker từ outbox | Worker sau Truth Guard pass | Guard decision + idempotency receipt + audit |
| Handoff conversation | AI, Sales hoặc rule | Sales tiếp quản | Reason/evidence gap |
| Create Draft Order | AI hoặc Sales | Server sau validation/guard | Valid lead + price/stock version |
| Confirm COD | Customer signed flow | Customer | Valid expiring token + audit |
| Mark paid | Payment gateway/authorized human | Payment gateway/authorized human | Reconciliation evidence |

UI visibility không thay server authorization. Bất kỳ thay đổi quyền hay state transition nhạy cảm nào phải được review bằng S-04.

## 8. Demo and rehearsal operations

### 8.1 Kịch bản trình diễn

Demo không là tour màn hình. Một người dẫn chuyện theo thứ tự: Opportunity từ tồn/promotion → content evidence/approval → đổi giá để Truth Guard block → reapprove → interaction có source → AI answer/handoff → lead/draft → customer confirms COD → Order Passport/attribution. `UD` vận hành UI, `BDQ` quan sát health/log/reset, `AIQ` chuẩn bị câu hỏi/evidence; `TL` giữ thời gian và câu chuyện.

### 8.2 Rehearsal checklist

```text
[ ] Laptop được sạc, adapter/projector, hotspot, audio và browser profile đã thử.
[ ] Docker images, seed data, media, fonts và fixture local có sẵn offline.
[ ] Demo accounts/sign-in/link customer được reset và không hết hạn trong rehearsal.
[ ] Healthcheck xanh; worker/job state bình thường; log viewer mở được.
[ ] S-01, S-02, S-03 và S-04 chạy từ seed sạch.
[ ] Video backup phát được không cần Internet; slide claim khớp build hiện hành.
[ ] Đồng hồ cho từng segment; có người ghi lỗi và không interrupt speaker.
[ ] Sau rehearsal, reset database và ghi kết quả/pass-fail vào release log.
```

Mốc rehearsal: hai lần liên tiếp trước 16/09; ba lần với mock jury trước 28/09; một cold-boot/offline rehearsal trước 02/10; một fresh-clone rehearsal trước 06/12.

### 8.3 Fallback ladder

1. Chạy local app + PostgreSQL + MockChannel + fixture, không Internet.
2. Nếu worker/provider lỗi, dùng pre-generated approved artifact và fixture nhưng vẫn thao tác Truth Guard, handoff, confirmation, attribution thật trong local app.
3. Nếu UI một view hỏng, dùng seeded backup state/Pasport view hoặc replay video của đúng release tag, giải thích nguyên nhân; không giả vờ external integration đang live.
4. Nếu môi trường không khởi động được, trình bày build/reproducibility artifact và video backup, đồng thời nói rõ giới hạn; sau đó tập trung phản biện thiết kế/test/license.

## 9. Risk register và cơ chế dừng dây chuyền

| Tín hiệu sớm | Rủi ro | Owner | Hành động ngay | Quyết định cut |
|---|---|---|---|---|
| P1 chưa có full S-01 trước 12/09 | Nhiều màn hình, không có vertical slice | `TL` | Pair vào đường găng, freeze backlog | Bỏ video live, real adapter, chart nâng cao |
| Credential/webhook chưa test | Phụ thuộc platform ngoài | `AIQ` | Tách feature flag, test MockChannel | Demo mock-only |
| Facts lấy từ description/nhớ model | Claim sai/cũ | `BDQ` + `AIQ` | Chặn claim, curate field Evidence | Bỏ câu trả lời/claim không có source |
| Seed reset không ổn định | Demo không tái lập | `BDQ` | Fix transaction/idempotency, run clean DB | Bỏ scenario không reset được |
| P0 flaky hoặc network-dependent | Rehearsal fail | `BDQ` + `AIQ` | Stabilize fixture/timeouts/local media | Bỏ live render/provider/channel |
| Asset/model license không rõ | Không thể phát hành OSS hợp lệ | `AIQ` + `TL` | Default deny, tìm replacement | Remove component/artifact |
| Một member là người duy nhất biết module | Bus factor | Owner đó + `TL` | Pair walkthrough, runbook, backup owner | Freeze module đến khi handover xong |
| Có yêu cầu thêm feature sát gate | Scope creep | `TL` | Map vào scoring/gate/test | Đưa `Cut` unless fixes P0 |

“Dừng dây chuyền” nghĩa là ngừng merge feature mới vào phần bị ảnh hưởng, tạo reproduction, chọn owner và fallback, rồi chạy regression trước khi tiếp tục. Đó không phải báo động thất bại; đó là cách giữ demo và dữ liệu đáng tin.

## 10. Giao tiếp, review và bằng chứng tiến độ

### 10.1 Daily update chuẩn

Mỗi owner cập nhật board trước daily bằng bốn dòng:

```text
Gate đang phục vụ:
Bằng chứng mới (PR, CI, test, rehearsal hoặc document):
Blocker và người/đầu vào phụ thuộc:
Việc sẽ hoàn tất trước daily kế tiếp hoặc đề xuất cut:
```

Không báo “đang gần xong” mà không gắn test, branch/PR, artifact hoặc replayable steps. `TL` tổng hợp thành một trạng thái: green, amber hoặc red; red phải có quyết định trong cùng ngày.

### 10.2 Review giảng viên/partner

Đưa reviewer đúng ba thứ: build hoặc video của release tag, kịch bản demo ngắn, và câu hỏi cụ thể về problem fit/permission/workflow. Ghi feedback thành issue, không sửa trực tiếp theo lời nói. Với dữ liệu cửa hàng thật, xin quyền trước; nếu chưa có, label demo synthetic và không tuyên bố pilot hay kết quả thương mại.

### 10.3 Evidence pack mỗi release

| Nhóm | Nội dung |
|---|---|
| Product | Demo script, screenshots/recording, feature-to-scenario matrix |
| Quality | CI link/output, test report S-01–S-05, defect list và known workarounds |
| Data/AI | Seed manifest, provenance/permission, evaluation result, handoff cases |
| Security | Secret scan, authorization test, log masking check, signed-link behavior |
| OSS | LICENSE, NOTICE, SBOM, dependency/model/media inventory, release tag/changelog |
| Operations | Fresh-install log, reset instructions, offline rehearsal, backup hashes |

## 11. Definition of Done trong vận hành nhóm

Một issue chỉ đi `Done` sau khi owner và reviewer có thể trả lời “ai dùng, fact nào thay đổi, lỗi xảy ra thì sao, test nào chứng minh, demo nhìn thấy gì, chạy lại thế nào”. Cụ thể:

```text
[ ] Acceptance criterion đạt trên build hiện tại.
[ ] Happy path và relevant error/authorization path đã được kiểm.
[ ] Version/audit/RBAC được giữ nếu feature có side effect.
[ ] Test, seed/fixture và reset được cập nhật.
[ ] UI/CLI trả trạng thái có thể hiểu; failure không silent.
[ ] Data, model, media và dependency mới có provenance/license decision.
[ ] Command contract liên quan pass; CI/review evidence được link vào issue.
[ ] Tài liệu, demo script và changelog phản ánh behavior thực tế.
[ ] Owner đã handover đủ để backup owner tái chạy phần này.
```

Một release chỉ đi `Done` khi all P0 scenario pass, no P0 defect, fresh install/seed/reset success, audit/OSS/data evidence complete, rehearsal đạt đúng thời lượng và fallback được thử. Release owner ký xác nhận trong release log; không ai tự xác nhận release của chính mình khi không có ít nhất một reviewer khác.

## 12. Bàn giao và sau sự kiện

Sau mỗi mốc 17/09, 02/10 và 10/12: tag source, export evidence pack, bảo quản recording/slide/seed manifest, ghi known issues và decisions, rồi retrospective tối đa 45 phút. Câu hỏi bắt buộc là: điều gì chứng minh giả thuyết, control nào đã chặn lỗi, dependency nào gây rủi ro, phần nào nên cắt hoặc chuẩn hóa. Hành động sau retrospective phải được đưa vào roadmap/backlog với owner và gate, không chỉ nằm trong ghi chú cuộc họp.
