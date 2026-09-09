# Công cụ và repository OneVoice

> Phiên bản: 08/09/2026
> Trạng thái: quyết định kỹ thuật và license **đã rà soát nguồn chính thức**. Đây là contract để implement; không khẳng định các package, image, Compose file hay adapter dưới đây đã tồn tại trong repository.

## 1. Nguyên tắc chọn công cụ

OneVoice là modular monolith TypeScript. Công cụ chỉ được thêm nếu phục vụ trực tiếp vertical slice:

```text
Opportunity → Campaign → Content → Approval/Truth Guard
→ Interaction → Handoff → Draft order → Customer confirmation → Attribution
```

- PostgreSQL là SSOT cho dữ liệu nghiệp vụ, version, audit và attribution. Không đưa state nghiệp vụ vào queue, cache, prompt hay platform channel.
- Mọi LLM, TTS, media và channel đi qua adapter. Core domain không gọi thẳng SDK nền tảng.
- `MockChannel` và deterministic AI fixture là bắt buộc; social platform, render và TTS không được chặn P0.
- “Maturity/risk” dưới đây là rủi ro tích hợp, vận hành và license cho OneVoice, không phải nhận định bảo mật tuyệt đối.
- License của **code** không cấp quyền cho model weights, dataset, giọng nói, ảnh, font, nhạc, codec binary hoặc API platform. Các thứ đó được audit riêng ở tài liệu DevOps/OSS.

## 2. Ma trận quyết định

| Công cụ / repository | Vai trò trong OneVoice | License đã xác minh | Maturity / rủi ro | Quyết định | Điều kiện và fallback | Nguồn chính thức |
|---|---|---|---|---|---|---|
| Next.js | Dashboard nội bộ và trang customer confirmation | MIT | Cao; phải kiểm soát cache để giá/tồn kho không cũ | Chọn | Server phải đọc facts hiện hành trước action nhạy cảm; fallback là UI tối giản cùng contract API | [license](https://github.com/vercel/next.js/blob/canary/license.md) |
| NestJS | API tách riêng khi có nhiều consumer và team backend độc lập | MIT | Cao, nhưng tạo runtime/DTO/deployment thứ hai trong MVP | Để sau | MVP dùng Next.js Route Handlers/BFF và domain TypeScript thuần; chỉ thêm khi đạt điều kiện ADR-002 | [LICENSE](https://github.com/nestjs/nest/blob/master/LICENSE) |
| PostgreSQL | SSOT cho catalog version, opportunity, content passport, order và audit | PostgreSQL License (permissive) | Rất cao; migration, backup và reset là rủi ro chính | Chọn | Mọi critical mutation có transaction/version/outbox; không thay bằng document store trong MVP | [COPYRIGHT](https://github.com/postgres/postgres/blob/master/COPYRIGHT) |
| Prisma | ORM và migration TypeScript | Apache-2.0 | Cao; schema drift là rủi ro | Chọn | Migration phải review và chạy trên DB rỗng/seed; fallback là SQL migration được review | [LICENSE](https://github.com/prisma/prisma/blob/main/LICENSE) |
| pgvector | Retrieval cho policy/mô tả đã duyệt | PostgreSQL License | Cao; đủ cho catalog MVP, ít service hơn vector DB riêng | Chọn | Evidence vẫn lấy từ record/version SSOT, không lấy vector hit làm fact; fallback là SQL full-text/structured lookup | [LICENSE](https://github.com/pgvector/pgvector/blob/master/LICENSE) |
| Valkey | Cache, rate limit và backing store cho queue | BSD-3-Clause | Cao; key expiry và mất cache không được làm mất business state | Chọn | DB vẫn là SSOT; fallback local/in-memory chỉ dùng test, không cho demo nhiều process | [COPYING](https://github.com/valkey-io/valkey/blob/unstable/COPYING) |
| BullMQ core | Job render, schedule, webhook retry | MIT | Cao; retry/idempotency phải do domain thiết kế | Chọn | Không dùng feature Pro/EE không được duyệt; fallback chạy worker synchronous có giới hạn cho fixture | [LICENSE](https://github.com/taskforcesh/bullmq/blob/master/LICENSE) |
| Local filesystem media adapter | Lưu artifact demo trên volume local qua `MediaStorage` port | Code OneVoice | Đơn giản, chạy offline; không phù hợp scale đa node | Chọn P0 | Lưu hash/provenance và không expose đường dẫn tùy ý; có thể thay bằng S3 adapter mà không đổi domain | [Kiến trúc](architecture-and-tech-stack.md#4-stack-ưu-tiên-và-build-vs-use) |
| MinIO | S3-compatible object storage tự host sau P0 | AGPL-3.0; upstream archived 25/04/2026 | Rủi ro maintenance và nghĩa vụ AGPL khi phân phối/sửa đổi; không cần cho demo một node | Để sau/review lại | P0 dùng local filesystem adapter; chỉ đưa vào release sau khi audit image/source/obligation và có lý do vận hành | [LICENSE](https://github.com/minio/minio/blob/master/LICENSE) |
| Domain state machine tự viết | States cho Content, Conversation, Draft Order và Truth Guard | Code OneVoice | Rủi ro dependency thấp; cần test transition kỹ | Chọn | Mọi transition nhạy cảm kiểm RBAC/evidence ngoài LLM; không dùng generic workflow builder trong P0 | [Blueprint](onevoice-project-blueprint.md#7-mô-hình-trạng-thái-tối-thiểu) |
| Temporal | Durable workflow/saga khi retry và timers vượt khả năng queue đơn giản | MIT | Maturity cao nhưng vận hành nặng cho MVP | Để sau | Chỉ xem xét sau khi có job failure/recovery được đo; fallback là BullMQ + outbox/idempotency | [LICENSE](https://github.com/temporalio/temporal/blob/main/LICENSE) |
| n8n | Workflow builder tham khảo | Sustainable Use License, không phải OSI-open-source | Rủi ro license và scope: giới hạn use/distribution, thêm workflow DSL | Loại khỏi core | Không dùng trong product/release OSS; fallback là state machine domain đã định nghĩa | [LICENSE](https://github.com/n8n-io/n8n/blob/master/LICENSE.md) |
| Ollama | Chạy model local/offline cho demo khi hạ tầng phù hợp | MIT; model weights có license riêng | Trung bình; RAM/GPU/quality model là biến số | Chọn có điều kiện | Pin model revision và có deterministic fixture; fallback là mock/approved remote provider qua adapter | [LICENSE](https://github.com/ollama/ollama/blob/main/LICENSE) |
| LiteLLM core | Provider-neutral LLM gateway và metadata model/provider | Core ngoài `enterprise/` là MIT; enterprise có license riêng | Khá cao; nguy cơ vô tình đóng gói phần enterprise | Chọn có điều kiện | Lockfile/image phải chứng minh chỉ dùng core; fallback adapter provider nhỏ, không đổi core domain | [LICENSE](https://github.com/BerriAI/litellm/blob/litellm_internal_staging/LICENSE) |
| Guardrails AI | Validator output có cấu trúc của LLM | Apache-2.0 | Trung bình; không thay thế Truth Guard xác định | Để sau | Chỉ dùng như lớp phụ trợ sau schema validation; fallback Zod/DTO + rule domain | [LICENSE](https://github.com/guardrails-ai/guardrails/blob/main/LICENSE) |
| Open Policy Agent | Policy-as-code cho rule RBAC/exception khi policy phức tạp | Apache-2.0 | Cao nhưng thêm ngôn ngữ/chạy service hoặc embedding | Để sau | Chỉ dùng khi policy vượt role matrix MVP; fallback policy module TypeScript có test | [LICENSE](https://github.com/open-policy-agent/opa/blob/main/LICENSE) |
| Qdrant | Vector DB tách riêng khi pgvector không đủ | Apache-2.0 | Cao nhưng tăng backup/index/ops | Để sau | Chỉ thêm sau benchmark evidence retrieval; fallback pgvector | [LICENSE](https://github.com/qdrant/qdrant/blob/master/LICENSE) |
| Langfuse community | Quan sát prompt/run/eval LLM | Community ngoài `ee/` là MIT Expat; `ee/` có license riêng | Trung bình; PII/EE-boundary là rủi ro | Để sau | Không gửi PII/raw secret; fallback OpenTelemetry custom spans và audit DB | [LICENSE](https://github.com/langfuse/langfuse/blob/main/LICENSE) |
| Revideo | Video programmatic từ facts, template và asset đã duyệt | MIT | Trung bình-cao; phù hợp P1 nhưng render không nằm đường găng P0 | Chọn P1 | Pin template/assets; fallback video pre-rendered hoặc post text-only | [LICENSE](https://github.com/midrender/revideo/blob/main/LICENSE) |
| Motion Canvas | Lựa chọn thay thế Revideo | MIT tại nhánh `main` đã kiểm | Trung bình; hai DSL video cùng lúc gây phân tán | Để sau | Chỉ chọn một engine; fallback Revideo | [LICENSE](https://github.com/motion-canvas/motion-canvas/blob/main/LICENSE) |
| FFmpeg | Encode, mux, subtitle, thumbnail và kiểm tra media | Mặc định LGPL-2.1-or-later; bật `--enable-gpl` làm build GPL-2.0-or-later | Rất cao về độ chín; build flags/codecs là rủi ro license | Chọn có điều kiện | Lưu `ffmpeg -buildconf`, không bật GPL component nếu chưa review; fallback encode đã được host/platform chấp nhận | [license guide](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md) |
| VieNeu-TTS | TTS tiếng Việt local cho video | Code Apache-2.0; model card `apache-2.0` | Mới hơn; phải benchmark thuật ngữ máy tính/giá và kiểm từng artifact | Chọn thử nghiệm P1 | Pin code + model revision, consent với voice clone; fallback voice preset được phép hoặc video không voice | [code LICENSE](https://github.com/pnnbao97/VieNeu-TTS/blob/main/LICENSE), [model card](https://huggingface.co/pnnbao-ump/VieNeu-TTS) |
| VoiceStudio (debpalash) | Voice cloning/TTS workstation | App AGPL-3.0-only; default OmniVoice weights CC-BY-NC, tokenizer có terms riêng | Rủi ro license cao cho sản phẩm/doanh nghiệp | Loại | Không dùng default bundle cho release; fallback VieNeu hoặc asset voice có quyền rõ | [LICENSE](https://github.com/debpalash/VoiceStudio/blob/main/LICENSE), [license notice](https://github.com/debpalash/VoiceStudio/blob/main/LICENSE-NOTICE.md) |
| Facebook Page/Messenger | Adapter publish/inbox khi có app đã duyệt | Không có OSS license cho platform API; SDK Meta có license chỉ để dùng cùng Meta APIs | App review, scope, webhook policy là rủi ro | Để sau | Không hứa hỗ trợ account cá nhân; fallback MockChannel hoặc channel đủ quyền khác | [Messenger webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks/), [SDK license](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/LICENSE) |
| TikTok Content Posting | Adapter để creator đã ủy quyền đăng video/ảnh | Không có OSS license cho platform API | Cần `video.publish`, domain verification, explicit consent; client chưa audit bị giới hạn private | Để sau | Dùng upload draft/manual publish khi policy yêu cầu; fallback MockChannel/demo export | [Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [webhooks](https://developers.tiktok.com/docs/en/webhooks-overview) |
| Zalo OA OpenAPI | Inbox, content và tương tác OA tại Việt Nam | Không có OSS license cho platform API; OA OpenAPI là dịch vụ/terms riêng | Cần OA, entitlement/gói phù hợp, consent và policy loại tin | Chọn có điều kiện P1 | Chỉ implement khi partner có OA/quyền thật; fallback MockChannel. Không dùng data thật khi chưa có consent | [developer docs](https://developers.zalo.me/docs), [OpenAPI/policy](https://oa.zalo.me/home/resources/library/tinh-nang-mo-rong-nang-cap-zalo-oa_2410156908111809541) |
| OpenTelemetry JS | Trace API/job/webhook/LLM | Apache-2.0 | Cao; raw PII/prompt là rủi ro telemetry | Chọn | Allowlist field, correlation ID, redaction trước export; fallback structured log tối thiểu | [LICENSE](https://github.com/open-telemetry/opentelemetry-js/blob/main/LICENSE) |
| Prometheus | Metrics health, queue, Truth Guard, handoff | Apache-2.0 | Rất cao; cardinality quá lớn làm hại demo | Chọn | Không dùng phone/order/message làm label; fallback health/metrics endpoint nội bộ | [LICENSE](https://github.com/prometheus/prometheus/blob/main/LICENSE) |
| Grafana | Dashboard metrics/traces | AGPL-3.0 | Mạnh nhưng copyleft network khi sửa/host; không cần P0 | Để sau | Review trước public hosting/modification; fallback dashboard OneVoice hoặc Prometheus UI nội bộ | [LICENSE](https://github.com/grafana/grafana/blob/main/LICENSE) |
| Playwright | E2E: approval, stale block, handoff, confirm order | Apache-2.0 | Cao; browser CI cần fixture ổn định | Chọn | Không phụ thuộc provider/platform thật; fallback browser rehearsal thủ công có checklist | [LICENSE](https://github.com/microsoft/playwright/blob/main/LICENSE) |
| Trivy | Scan CVE, secret và image | Apache-2.0 | Cao; cần triage false positive | Chọn | Block severity theo policy release, không auto-ignore vô hạn; fallback manual CVE record có owner/expiry | [LICENSE](https://github.com/aquasecurity/trivy/blob/main/LICENSE) |
| Syft | Sinh SBOM SPDX/CycloneDX | Apache-2.0 | Cao; SBOM là inventory chứ không tự kết luận compliance | Chọn | Sinh từ source và image release; fallback inventory thủ công tạm thời, không đủ gate OLP | [LICENSE](https://github.com/anchore/syft/blob/main/LICENSE) |
| Docker Compose | Dựng local/demo có thể tái lập | Apache-2.0 | Cao; image tag trôi là rủi ro | Chọn | Khi được implement, pin image/version và healthcheck; fallback runbook local không được xem là release-ready | [LICENSE](https://github.com/docker/compose/blob/main/LICENSE) |
| Caddy | TLS/reverse proxy khi chạy ngoài local | Apache-2.0 | Cao; public endpoint/webhook cần rate limit/upload limit | Chọn có điều kiện | Không bắt buộc offline demo; fallback reverse proxy được review tương đương | [LICENSE](https://github.com/caddyserver/caddy/blob/master/LICENSE) |
| Kubernetes | Orchestration đa node | Apache-2.0 | Cao nhưng quá nặng và không thuộc scope | Để sau | Không dùng trước khi Compose/rehearsal ổn định; fallback Compose | [LICENSE](https://github.com/kubernetes/kubernetes/blob/master/LICENSE) |
| Keycloak | SSO/RBAC production | Apache-2.0 | Cao nhưng thêm Java service | Để sau | MVP cần auth/RBAC server-side tối giản + audit; fallback không được là client-only role check | [LICENSE](https://github.com/keycloak/keycloak/blob/main/LICENSE.txt) |
| Hermes Agent | DevOps/automation agent | MIT | Repository mới; bề mặt tool/credential execution lớn và ngoài scope MVP | Để sau | Không cấp credential production/không auto-execute; fallback runbook và human approval | [LICENSE](https://github.com/hermes-agent-org/hermes/blob/main/LICENSE) |

## 3. Baseline được phép implement trước

Baseline ưu tiên là: Next.js full-stack, PostgreSQL, Prisma, pgvector, Valkey, BullMQ, local filesystem media adapter, OpenTelemetry, Prometheus, Playwright, Trivy, Syft và Docker Compose. NestJS/MinIO/Revideo/VieNeu/FFmpeg là phần sau P0 hoặc có điều kiện và phải có fallback. LLM chỉ là adapter có thể thay thế; Truth Guard, evidence, handoff, RBAC, audit và customer confirmation vẫn là code/domain của OneVoice.

Không được thêm dependency mới chỉ vì “có AI”. Mỗi dependency đề xuất mới phải bổ sung vào bảng này với source license chính thức, version/revision dự kiến, reason, fallback và người review.

## 4. Quy tắc adapter platform

1. Một adapter thật chỉ được bật khi có app/OA, credential, scope, webhook callback và quyền sử dụng dữ liệu hợp lệ.
2. Webhook phải xác minh chữ ký, chống replay, ack nhanh, đưa xử lý nặng vào queue và idempotent theo event/platform ID.
3. `Interaction` phải lưu nguồn `content_id`/`campaign_id` khi platform cung cấp; nếu không có thì gán `unknown`, không suy diễn attribution.
4. API platform, SDK và OAuth token không nằm trong DB seed, source, image hay log. Có expiry/rotation/revoke runbook.
5. Adapter có lỗi phải thể hiện `PENDING`/`FAILED`/`RETRYING` cho người dùng; không được đánh dấu `PUBLISHED` chỉ vì đã gửi request.

## 5. Điều kiện công khai repository

- Mã do đội viết dùng Apache License 2.0; repository phải có toàn văn `LICENSE`, xử lý `NOTICE`/attribution và không gắn Apache-2.0 cho dependency, model hoặc media mang giấy phép khác.
- `README` release phải nêu dependency chính, cách dựng từ source, external services tùy chọn, model/media không bundle và giới hạn platform.
- Không commit credential, dataset/PII không có quyền, model weight/media không có inventory, hoặc binary FFmpeg không có provenance/build configuration.
- Mọi link chính thức trong bảng phải được kiểm tra lại khi nâng version lớn hoặc trước release OLP.
