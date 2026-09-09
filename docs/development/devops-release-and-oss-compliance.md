# DevOps, release và tuân thủ OSS

> Phiên bản: 08/09/2026
> Trạng thái: **contract cần implement** cho OneVoice. Tài liệu mô tả yêu cầu nghiệm thu; không khẳng định Compose, pipeline, secret store, command, image hoặc cloud account hiện đã tồn tại.

## 1. Mục tiêu vận hành

Một release OneVoice phải dựng được từ source, chạy được vertical slice offline bằng fixture/reset xác định, quan sát được lỗi và truy xuất được inventory license. Hạ tầng không được thay thế các invariant nghiệp vụ: PostgreSQL là SSOT; Truth Guard kiểm facts hiện hành; AI không tự phê duyệt, xác nhận đơn hay xác nhận tiền.

Các ràng buộc từ [Blueprint](onevoice-project-blueprint.md) là bắt buộc:

- MVP là modular monolith, không dựng microservices, Kafka hoặc Kubernetes trước chung kết trường.
- `MockChannel` và deterministic AI fixture là đường chạy bắt buộc; social adapter, remote LLM, render video/TTS là optional/fallback.
- Video Revideo/VieNeu-TTS không được chặn P0.
- PII demo là giả; không có secret hoặc PII đầy đủ trong telemetry, fixture, artifact CI hay repository.

## 2. Contract môi trường

| Môi trường | Mục đích | Dữ liệu và kết nối được phép | Điều kiện tối thiểu | Không được coi là |
|---|---|---|---|---|
| Local developer | Viết/test từng module | Seed synthetic, MockChannel, deterministic AI fixture; provider thật chỉ qua local secret | Reset DB, migration, test và healthcheck phải tái lập được theo runbook | Bằng chứng production-ready |
| CI ephemeral | Xác minh PR/release | Fixture synthetic, DB/Valkey ephemeral, không có token social/production | Job cô lập, logs redacted, artifact có retention ngắn | Nơi thử post thật hoặc lưu PII |
| Demo/rehearsal | Chạy vertical slice cho hội đồng | Snapshot đã curate, fixed clock, MockChannel; adapter thật chỉ khi đủ quyền | Một thao tác reset, healthcheck, backup/export và kịch bản offline | Môi trường chứa credential chưa kiểm kê |
| Staging tùy chọn | Thử webhook/adapters thật | Chỉ test OA/app/scopes, PII tối thiểu có consent | TLS, signed webhook, expiry/rotation secret, event idempotency | Điều kiện bắt buộc cho P0 |
| Production sau MVP | Triển khai với partner | Data minimization, retention/deletion process, approved providers | Threat model, backup restore drill, incident owner và review pháp lý | Bản sao trực tiếp của demo |

## 3. Compose contract cần implement

Một file Compose (tên/path được chọn khi implement) phải dựng được tối thiểu các service sau từ source/config được version hóa:

```text
app (Next.js UI + BFF/API) ─┬── PostgreSQL (SSOT)
                            ├── Valkey ── worker (BullMQ jobs: retry/render/schedule)
                            ├── MockChannel / deterministic AI fixture
                            └── local media volume qua adapter
```

Yêu cầu:

1. `app`, `worker`, `postgres`, `valkey` có healthcheck; app chỉ báo ready sau dependency cần thiết đã sẵn sàng.
2. PostgreSQL và media phải dùng named volume hoặc external storage có chủ đích. Valkey có thể mất cache/job transient nhưng không được là nơi duy nhất giữ business state/audit.
3. Worker và API dùng cùng schema/version, idempotency key và correlation ID. Worker restart không tạo duplicate publish/order/audit event.
4. Image phải pin version hoặc digest trước release; cấm `latest` trong manifest release. Base image, OS package và FFmpeg binary phải vào inventory container.
5. Network chỉ expose port cần thiết. DB/Valkey không expose public; webhook public đi qua TLS/reverse proxy đã cấu hình limit upload, timeout và rate limit.
6. Render video/TTS phải là asynchronous job có timeout, retry hữu hạn, dead-letter/failed state nhìn thấy được. Không khóa HTTP request và có fallback text/pre-rendered artifact.
7. Compose phải hỗ trợ profile hoặc config tương đương để chạy `offline` không tải model/call Internet. Không dùng remote provider làm dependency khởi động bắt buộc.
8. Seed/reset và migration là bước explicit trong runbook. Không tự xóa volume/dữ liệu khi khởi động service.

## 4. Configuration và secrets contract

Phải có template cấu hình không chứa giá trị thật và schema validate lúc startup. Tên biến có thể thay đổi khi implement, nhưng phải bao phủ các nhóm sau:

| Nhóm | Ví dụ nội dung | Quy tắc |
|---|---|---|
| Runtime | environment, public base URL, allowed origins, fixed demo clock | Không hard-code URL production; origin public phải explicit |
| Database/queue | connection endpoint, database name, TLS mode | Secret chỉ inject runtime; DB user least privilege; migration credential tách nếu có |
| Auth/confirmation | signing key, token TTL, cookie/session settings | Key rotation plan; confirmation token single-purpose, expiring, không ghi log raw token |
| AI/TTS/media | provider endpoint/key, model revision, template revision, media storage credential | Provider/model qua adapter; không log prompt/PII/model token; pin revision cho evidence/passport |
| Platform webhooks | app/OA credential, verification secret, signing secret, scope metadata | Có owner, expiry, revoke path; không đưa vào seed/image/CI artifact |
| Observability | OTLP endpoint/token, log level, metrics endpoint | Allowlist attributes và redaction trước export |

- Secret không được nằm trong git history, Docker image layer, fixture, screenshot, error message, SBOM hay copy/paste demo.
- `.env.example`/equivalent chỉ là schema/tên biến và giá trị giả; CI phải phát hiện secret format bị commit theo policy.
- Mọi endpoint nhận request từ customer/platform phải validate schema, giới hạn kích thước và rate limit. Webhook xác minh signature trước enqueue; event duplicate phải an toàn.

## 5. CI quality gates cần implement

Pipeline phải tạo bằng chứng theo commit SHA; tên workflow/command được chọn lúc implement, nhưng không được thay gate bằng thao tác thủ công không lưu kết quả.

| Gate | Bằng chứng cần có | Fail khi |
|---|---|---|
| Format/lint/typecheck | Output tool và version runtime | Lỗi syntax/type/lint mức đã quy định |
| Unit + integration | Test DB transaction, state transition, Truth Guard, evidence/handoff, RBAC/audit | Critical invariant không có test hoặc test fail |
| E2E | Browser fixture: happy path, stale block, handoff, denied action, customer confirmation | AI/tool có thể publish/confirm thay người hoặc flow không lặp lại được |
| Migration/seed/reset | DB rỗng migrate được; seed deterministic; reset có scope rõ | Schema drift, fixture không tái tạo hoặc reset xóa target không được phép |
| Dependency/license | Lockfile diff, allow/deny policy, SBOM source + image | License unknown/disallowed hoặc enterprise/NC artifact chưa duyệt |
| Security | Secret scan, dependency/image CVE report | Secret xuất hiện; CVE vượt ngưỡng policy không có exception còn hạn |
| Build/health | Images pin version, Compose/profile offline khởi động và healthcheck | Service không ready, dependency Internet bắt buộc, hoặc image không tái lập |
| Artifact/release | Checksums, changelog, SBOM, NOTICE, inventory bốn luồng | Artifact thiếu provenance hoặc không map được về commit/tag |

CI test phải dùng MockChannel và fixture AI, không post lên Facebook/TikTok/Zalo hay gọi LLM trả phí. Adapter thật chỉ được test trên staging có owner, credential riêng và audit log.

## 6. Observability và incident contract

### 6.1 Tín hiệu tối thiểu

- **Health/readiness:** API, worker, PostgreSQL, Valkey và media adapter. Chỉ expose chi tiết nội bộ cho operator.
- **Structured logs:** timestamp, level, service, request/job ID, correlation ID, actor type, target ID đã pseudonymize, state transition và error class.
- **Metrics:** request/error/latency, queue depth/retry/failure, Truth Guard block/stale count, handoff count, confirmation success/failure, webhook duplicate/signature reject, backup age/restore result.
- **Trace:** luồng API → outbox/job → worker → adapter với correlation ID. AI run chỉ lưu provider/model/template/snapshot/output hash theo Blueprint, không export raw PII/prompt mặc định.
- **AuditEvent:** append-only ở application layer cho approval, exception, publish request/result, handoff, draft/order confirmation và admin/config action.

### 6.2 Redaction và retention

1. Phone, address, access token, cookie, signed link, webhook body nguyên văn, prompt chứa PII và audio reference không được thành metric label hoặc log mặc định.
2. Log/error phải dùng ID/correlation ID; truy dữ liệu đầy đủ chỉ qua authorization/audit path trong DB.
3. Thiết lập retention cho log, trace, job failure payload, media render và backup; owner phê duyệt mọi retention dài hơn demo need.
4. Incident runbook cần có owner, cách disable adapter/provider, cách rotate secret, cách preserve evidence không chứa PII và cách thông báo stakeholder.

## 7. Backup, restore và demo reset

### 7.1 Backup contract

- PostgreSQL: backup logical hoặc physical có timestamp, schema version, checksum, encryption/access control và retention. Backup phải bao gồm data cần khôi phục Content Passport/audit/attribution, không chỉ catalog.
- Media: lưu manifest hash/object key và provenance; backup/restore phải khớp Passport, hoặc UI phải hiển thị artifact unavailable thay vì giả có file.
- Config: chỉ backup template/config không secret. Secret được khôi phục qua secret manager/runbook, không nhúng vào backup artifact.
- Queue: không lấy queue làm backup. Sau restore, jobs được rebuild từ DB/outbox hoặc được đánh dấu retry thủ công có audit.

### 7.2 Restore và reset contract

1. Có runbook restore vào target cô lập; xác minh migration/schema version, count/foreign-key consistency, Passport lineage và một scenario S-01/S-02.
2. Test restore định kỳ trước release; ghi thời gian, người chạy, backup ID/checksum và kết quả. “Có backup” không đạt nếu chưa restore được.
3. Demo reset chỉ nhắm dataset/volume demo explicit; có confirmation, backup/export trước reset và fixed clock/seed. Không dùng lệnh wildcard/destructive trên workstation hoặc cloud account chung.
4. Khi lỗi provider/platform, reset không được xóa audit/order; UI hiển thị failed/retry/fallback state.

## 8. Release contract

| Giai đoạn | Điều kiện vào | Deliverable / bằng chứng | Điều kiện dừng |
|---|---|---|---|
| Candidate | P0 scope frozen, code review xong | Commit SHA, test report, migration/seed rehearsal | Có lỗi P0, state invariant fail hoặc reset không lặp lại |
| Demo RC | Candidate chạy hai lần bằng fixture/offline | Checklist demo, video fallback, health/backup evidence, known-issues | Còn phụ thuộc credential/Internet không có fallback |
| Public OSS release | RC đạt và license decision đã duyệt | Version/tag, checksum/image digest, SBOM, NOTICE, inventory 4 luồng, changelog, build instructions | License/model/media/API provenance không rõ hoặc secrets/PII bị phát hiện |
| Post-release | Artifact được lưu và có owner | CVE triage, dependency update plan, incident contact | Không được rewrite tag/artifact để che lỗi; phát hành patch mới |

Release note phải nói đúng phạm vi: MockChannel hay adapter thật, model/provider nào là optional, dataset là synthetic/snapshot nào, và claim nào chưa được đo với cửa hàng. Không gọi integration “production” chỉ vì đã demo được.

## 9. OSS compliance: audit bốn luồng

Một SBOM package không đủ. Mỗi release phải có một inventory có version/revision, SHA/checksum khi áp dụng, nguồn chính thức, license/terms, dùng ở đâu, owner, quyết định, notice cần giữ và ngày review cho **bốn luồng** sau.

Mã do đội OneVoice viết dùng Apache License 2.0. Repo phải chứa toàn văn `LICENSE`; file nguồn thêm SPDX identifier khi quy định OLP yêu cầu; `NOTICE` giữ attribution/notice cần thiết. Quyết định này không đổi license của dependency, container, model, dataset hoặc media được đóng gói cùng release.

| Luồng | Phải kiểm kê | Gate license/provenance | Ví dụ rủi ro |
|---|---|---|---|
| Code | Direct/transitive package, source tool, SDK, source base | License file/official source, lockfile, SBOM SPDX/CycloneDX, NOTICE | LiteLLM `enterprise/`, n8n Sustainable Use, GPL/AGPL transitive |
| Container/binary | Base image, OS package, FFmpeg/build flags, runtime binary | Image digest, Dockerfile/build recipe, package inventory/SBOM image, `ffmpeg -buildconf` | `latest` trôi; bật `--enable-gpl`; binary không biết nguồn |
| Model/data | LLM/TTS/embedding weights, tokenizer, dataset, embedding index | Model card/dataset card/license, revision hash, terms, consent/provenance | Code Apache nhưng weight CC-BY-NC; dataset không có permission |
| Media | Ảnh sản phẩm, logo, font, nhạc, footage, voice reference, generated output | Asset manifest hash/source/license/permission/expiry/consent | Hotlink, font/music không thương mại, clone giọng không consent |

### 9.1 Policy quyết định

- **Allow mặc định sau inventory:** MIT, Apache-2.0, BSD-2/3-Clause, PostgreSQL License; vẫn phải giữ copyright/NOTICE và review patent/attribution của Apache-2.0.
- **Review bắt buộc:** GPL, LGPL, AGPL, MPL, dual-license, custom/unknown, source-available/fair-code, commercial/research-only/NC, enterprise folders, API terms và mọi model/media/data không có quyền rõ.
- **Deny mặc định cho release công khai** đến khi có quyết định bằng văn bản: unknown license, n8n Sustainable Use cho product core, VoiceStudio default bundle có CC-BY-NC weight, secret/PII/asset không provenance.
- **MinIO không thuộc baseline P0:** upstream dùng AGPL-3.0 và đã archived; local filesystem adapter là mặc định. Chỉ thêm S3-compatible implementation sau dependency decision mới có maintenance, license và replacement plan.
- AGPL/GPL không bị “sạch” chỉ vì chạy server; mức liên kết, sửa đổi, phân phối/network use và mô hình phát hành phải được reviewer có thẩm quyền đánh giá trước.
- License của output generated không tự được cấp bởi license source model/tool; assets, voice consent và policy platform vẫn áp dụng.

### 9.2 SBOM, NOTICE và CVE

1. Sinh SBOM SPDX hoặc CycloneDX từ **source lockfile** và từ **final image** bằng công cụ đã chọn (Syft là baseline đề xuất trong [tools/repositories](tools-and-repositories.md)). Lưu cùng release artifact, không chỉ log CI.
2. So sánh SBOM với allow/deny list; bất kỳ dependency mới, đổi version hoặc đổi license cần review trước merge/release.
3. Tạo `NOTICE`/third-party attribution từ inventory, giữ nguyên required notices và source/license text khi distribution yêu cầu. Không tự xóa notice để “gọn repository”.
4. Scan dependency/image (Trivy là baseline đề xuất). CVE phải có severity, affected version, exposure, owner, mitigation/fix version, acceptance rationale và expiry cho exception.
5. Không dùng suppression vô thời hạn. Exception hết hạn phải fail gate hoặc được gia hạn bằng review mới.
6. Khi phát hiện license/CVE sau release: freeze artifact bị ảnh hưởng, xác định release/commit/image/model/media scope, publish fix/mitigation và cập nhật inventory/changelog; không sửa lịch sử release để che dấu.

## 10. Checklist trước demo và trước public release

### Demo RC

- [ ] Fresh setup/rehearsal theo runbook, offline profile vẫn chạy S-01 đến S-04 bằng fixture.
- [ ] Truth Guard chặn stale fact; AI/tool không thể publish/confirm thay người; handoff nhìn thấy.
- [ ] Healthcheck, structured log/correlation ID và failure state của queue/adapter quan sát được.
- [ ] Backup/export và reset demo đã chạy trên target đúng scope; video/text fallback sẵn sàng.
- [ ] Không có secret/PII thật trong seed, screenshot, logs hay source.

### Public OSS release

- [ ] Project license được chốt; code/container/model-data/media inventory đủ bốn luồng.
- [ ] SBOM source + final image, NOTICE, CVE triage và checksum/digest gắn đúng tag/commit.
- [ ] FFmpeg provenance/build flags, model revision/card, dataset/media permission và voice consent được lưu.
- [ ] README/build instructions chỉ nêu command/config đã thực sự được implement và verify; không hứa social integration/provider chưa có quyền.
- [ ] Changelog, known issues, fallback và contact/owner cho incident/CVE rõ ràng.

## 11. Liên kết quyết định

- Danh mục tool/repository, license và fallback: [tools-and-repositories.md](tools-and-repositories.md).
- Phạm vi P0/P1, fallback offline, state invariants và NFR: [onevoice-project-blueprint.md](onevoice-project-blueprint.md).
- Test pyramid, E2E, AI evaluation và release gates: [testing-and-quality-plan.md](testing-and-quality-plan.md). Nếu có mâu thuẫn, Blueprint và invariant an toàn được ưu tiên rồi phải sửa các tài liệu còn lại trong cùng pull request.
