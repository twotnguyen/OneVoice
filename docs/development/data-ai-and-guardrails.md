# Dữ liệu, AI và guardrail của OneVoice

## 1. Mục tiêu

Tài liệu này định nghĩa cách OneVoice biến dữ liệu doanh nghiệp thành cơ hội, nội dung, câu trả lời và đơn hàng mà vẫn trả lời được:

- Fact này lấy từ đâu?
- Nó đúng ở version và thời điểm nào?
- AI được phép làm gì với fact đó?
- Khi dữ liệu cũ, thiếu hoặc mâu thuẫn thì hệ thống phải dừng ở đâu?

Nguyên tắc lõi:

> LLM đề xuất ngôn ngữ; application code quyết định quyền, trạng thái và tính hợp lệ.

## 2. Phân tầng dữ liệu

| Tầng | Ví dụ | Mức tin cậy | Cách sử dụng |
|---|---|---|---|
| T0 — Master đã duyệt | SKU, model, giá hiện hành, tồn nội bộ, promotion, policy | Cao nhất | Nguồn cho critical claims và order |
| T1 — Snapshot có provenance | Dữ liệu GearVN ngày 31/08/2026, catalog nhà cung cấp | Có thời điểm, có giới hạn | Curate/import; không coi là live hoặc nội bộ |
| T2 — Nội dung tham khảo | Description marketing, FAQ chưa duyệt, review | Trung bình/thấp | Gợi ý copy; không dùng một mình cho critical claim |
| T3 — Tương tác khách hàng | Tin nhắn, nhu cầu, địa chỉ, consent | Nhạy cảm | Tối thiểu hóa, kiểm quyền, retention và masking |
| T4 — Dữ liệu sinh bởi AI | Opportunity explanation, caption, answer, summary | Không tự là sự thật | Phải gắn AI run, evidence và trạng thái duyệt |
| T5 — Fixture/mô phỏng | Tồn 15, khách demo, đơn COD | Chỉ dùng kiểm thử/demo | Ghi rõ synthetic; không trình bày là số liệu doanh nghiệp |

## 3. Nguồn dữ liệu GearVN hiện có

Bộ snapshot chính trong `data/` có:

- 4.109 record hợp lệ, 3.977 record `usable`.
- 1.506 record `InStock`, 2.603 `OutOfStock` tại thời điểm crawl.
- 100% có giá và hình ảnh; 4.059 có specifications; 3.438 có description.
- 4.049 sản phẩm có ít nhất một promotion object.
- Snapshot được thu thập ngày 31/08/2026; nhiều promotion đã hết hạn vào 08/09/2026.
- Có lỗi taxonomy/normalization: phụ kiện bị xếp thành laptop; một số display attribute lấy nhầm “màn hình cảm ứng: Không”; description có thể mâu thuẫn model/spec.

Thứ tự ưu tiên khi curate facts:

```text
SKU/model → structured specifications/variants → price/stock snapshot
→ promotion → validated normalized attributes → description marketing
```

Không dùng toàn bộ thư mục 1,1 GB làm seed ứng dụng. Không đưa các bảng Long Châu vào domain OneVoice.

## 4. Curated demo dataset

### 4.1 Quy mô và thành phần

Tạo một dataset nhỏ, version-control được:

- 10–20 SKU máy tính/phụ kiện có specs và ảnh rõ ràng.
- Một hero product cho happy path.
- Một sản phẩm hết hàng.
- Một sản phẩm thiếu critical spec để buộc handoff.
- Một promotion còn hạn và một promotion đã hết hạn.
- Hai version của hero product: trước và sau khi đổi giá/promotion.
- Bốn tài khoản role, bốn conversation fixture, hai lead và hai Draft Order.
- Ảnh local có quyền sử dụng/ghi nguồn; không hotlink khi demo.

### 4.2 Trường provenance bắt buộc

Mỗi nguồn hoặc fact quan trọng cần:

| Field | Ý nghĩa |
|---|---|
| `source_type` | `STORE_MASTER`, `PUBLIC_SNAPSHOT`, `SYNTHETIC`, `USER_INPUT` |
| `source_uri` | URI hoặc định danh nội bộ; có thể null với synthetic |
| `collected_at` | Thời điểm thu thập |
| `valid_from`, `valid_until` | Khoảng hiệu lực nếu có |
| `as_of` | Thời điểm fact đại diện |
| `trust_level` | `VERIFIED`, `SOURCE_LIMITED`, `UNVERIFIED` |
| `license_or_permission` | Giấy phép, consent, thỏa thuận hoặc ghi chú hạn chế |
| `approved_by`, `approved_at` | Người và thời điểm đưa vào master |
| `version`, `content_hash` | Version tăng dần và hash canonical payload |

### 4.3 Seed gợi ý

Có thể dùng ASUS V16 trong snapshot làm ví dụ facts có thời điểm:

- `Laptop gaming ASUS V16 V3607VJ-TK189W`
- SKU: `LAP-ASUS-V3607VJ-TK189W`
- Giá snapshot: 26.490.000 đồng.
- Quantity snapshot: 3.
- Promotion 5% của snapshot kết thúc ngày 02/09/2026.

Ngày 08/09/2026, promotion này đã hết hạn. Đây là case tốt để Truth Guard chặn nội dung cũ, nhưng phải ghi rõ đây là snapshot công khai và không phải dữ liệu tồn kho live.

Nếu cần tình huống “tồn 15 và khuyến mãi còn ba ngày”, tạo record synthetic và gắn nhãn rõ trong UI/tài liệu.

## 5. Versioning và snapshot

### 5.1 Quy tắc version

- `Product`/`Sku` giữ identity ổn định.
- Mỗi thay đổi facts vận hành tạo `ProductVersion`, `OfferVersion` hoặc `InventorySnapshot` mới.
- Không sửa version đã được Content Passport hoặc Order tham chiếu.
- Canonical payload sắp xếp key và chuẩn hóa đơn vị trước khi hash.
- Hash dùng để phát hiện thay đổi; version dùng để giải thích lịch sử và truy vấn.

### 5.2 Critical và non-critical fields

Critical mặc định:

- SKU/model, giá, currency, availability/quantity.
- Promotion value, điều kiện, `valid_until`.
- Các specs được nội dung hoặc AI đưa ra như CPU, GPU, RAM, SSD, warranty.
- Policy đổi trả/giao hàng được viện dẫn.

Non-critical mặc định:

- Cách diễn đạt, tone, hashtag, thứ tự cảnh, màu nền.
- Copy marketing không chứa fact mới.

Thay đổi critical field làm Passport liên quan `STALE`. Thay đổi non-critical field không bắt buộc chặn nhưng phải ghi version mới nếu được dùng lại.

## 6. Content Claim và Evidence

AI/content renderer không chỉ trả một đoạn văn. Output cần có cấu trúc:

```json
{
  "body": "Laptop ASUS V16 có RTX 3050 6GB, giá snapshot 26.490.000 đồng.",
  "claims": [
    {
      "kind": "GPU",
      "value": "NVIDIA GeForce RTX 3050 6GB",
      "evidence_ids": ["spec:sku-001:version-12:gpu"],
      "critical": true
    },
    {
      "kind": "PRICE",
      "value": 26490000,
      "evidence_ids": ["offer:sku-001:version-7:price"],
      "critical": true
    }
  ]
}
```

Validator phải:

1. Parse output schema; reject output không parse được.
2. Kiểm tra mỗi critical claim có Evidence tồn tại và được phép dùng.
3. Chuẩn hóa đơn vị/giá/model trước khi so sánh.
4. Không cho claim mạnh hơn evidence, ví dụ “chơi mọi game mượt” từ cấu hình đơn thuần.
5. Kiểm tra promotion còn hiệu lực ở thời điểm dự kiến publish.
6. Lưu claim, evidence, snapshot và AI run riêng, không chỉ lưu final text.

## 7. Truth Guard

### 7.1 Các điểm kiểm tra

Truth Guard chạy:

1. Sau khi sinh content/answer để xác nhận claim có evidence.
2. Trước khi Manager duyệt.
3. Ngay trước khi publish job có side effect.
4. Trước khi AI gửi câu trả lời chứa critical fact.
5. Trước khi tạo/gửi Draft Order.
6. Trước khi khách xác nhận Order.

### 7.2 Quy tắc xác định

Truth Guard là domain service, không phải prompt “hãy kiểm tra giúp”. Pseudocode:

```text
load action + referenced passport/snapshot
authorize actor for action
for each critical claim:
  load current approved fact
  verify evidence exists and source is allowed
  compare normalized value, version and validity window
  if missing/conflicting/expired/changed: add blocking reason
if any blocking reason:
  if every reason is exceptionable and a valid Manager verification exists:
    persist PASS_WITH_EXCEPTION + evidence + AuditEvent
    continue the explicitly scoped action
  else:
    persist BLOCKED/STALE + AuditEvent
    return structured failure; do not execute side effect
else:
  persist guard decision and continue transaction/outbox
```

### 7.3 Kết quả và xử lý

| Kết quả | Ý nghĩa | Hành động |
|---|---|---|
| `PASS` | Critical facts còn hợp lệ | Cho workflow tiếp tục |
| `PASS_WITH_EXCEPTION` | Manager đã cung cấp bằng chứng xác minh hợp lệ cho lý do được phép ngoại lệ | Chỉ cho action/passport/scope và thời hạn đã ghi; audit đầy đủ |
| `STALE` | Version/value/validity đã thay đổi | Regenerate và yêu cầu duyệt lại |
| `INSUFFICIENT_EVIDENCE` | Không đủ nguồn cho claim | Xóa/sửa claim hoặc handoff |
| `CONFLICT` | Hai nguồn được phép mâu thuẫn | Chặn, yêu cầu owner dữ liệu xử lý |
| `POLICY_BLOCK` | Actor/action vi phạm quyền hoặc policy | Chặn, audit; không cho prompt override |
| `EXCEPTION_REQUIRED` | Trường hợp có thể chấp nhận bằng xác minh của người có quyền | Manager cung cấp lý do và Evidence mới; tạo approval có scope/thời hạn |

Không được ngoại lệ cho mismatch về SKU/model, giá/currency, tồn/availability, giá trị/ngày hiệu lực promotion, customer confirmation hoặc payment state. Ngoại lệ MVP chỉ áp dụng cho freshness SLA/provenance gap khi Manager trực tiếp xác minh cùng giá trị hiện hành và tạo `ManualVerificationEvidence`; nó không biến một fact sai thành fact đúng.

## 8. Opportunity Engine

### 8.1 Rule MVP

Rule P0 phải đơn giản, test được và giải thích được. Nó chỉ dùng tồn kho nội bộ/fixture có provenance được phép; public quantity snapshot không đủ để kích hoạt rule này:

```text
HIGH_STOCK_EXPIRING_PROMO:
inventory.source in allowed_sources
inventory.on_hand >= configured_threshold
AND promotion.status = ACTIVE
AND promotion.valid_from <= now < promotion.valid_until
AND 0 < promotion.valid_until - now <= configured_window
```

Output tối thiểu:

- `rule_id`, `triggered_at`, input snapshot IDs.
- Reason code và câu giải thích sinh từ template hoặc AI.
- Product/promotion/version.
- Priority, proposed objective/channel/format.
- Trạng thái thống nhất: `DETECTED → PROPOSED → ACCEPTED → CAMPAIGN_CREATED`; từ `PROPOSED` có thể chuyển `DISMISSED`.

AI được phép viết lại lý do dễ hiểu hoặc gợi ý thông điệp; AI không quyết định rule có kích hoạt hay không.

## 9. Kiến trúc AI

### 9.1 Nguyên tắc structured-first

Thứ tự truy xuất:

1. Query theo SKU/filters trong PostgreSQL cho price, stock, specs, promotion.
2. Full-text/vector retrieval chỉ cho policy, FAQ, description đã duyệt.
3. Assemble context có allow-list fields, version và timestamp.
4. LLM trả output schema.
5. Evidence validator và Truth Guard kiểm tra độc lập.
6. Tool/action layer kiểm quyền, trạng thái và idempotency trước side effect.

Không cần vector database riêng ở MVP; PostgreSQL + pgvector đủ cho tập policy nhỏ. Catalog có cấu trúc không nên biến thành embedding rồi hy vọng LLM đọc đúng giá.

### 9.2 Provider adapter

AI/embedding provider triển khai **duy nhất** contract `AiProvider` chuẩn trong [Kiến trúc §8.3](architecture-and-tech-stack.md#83-adapter-ports): `generateContent`, `answerWithEvidence` và `embed`. Schema chi tiết nằm trong `packages/contracts`; tài liệu này không định nghĩa thêm một chữ ký song song. Mọi implementation phải trả output có schema, provider/model revision, usage và provenance đủ để tạo Evidence/Passport.

TTS/media dùng port riêng để lỗi render không trộn với quyết định AI:

```text
synthesize(text, voiceProfile, glossary) → AudioArtifact
render(scenePlan, assets, audio?) → MediaJob
```

Các provider cần có:

- `MockAiProvider`: output fixture xác định cho test/demo offline.
- `LocalAiProvider`: Ollama/OpenAI-compatible endpoint khi máy đủ tài nguyên.
- `RemoteAiProvider`: chỉ bật khi có secret và policy cho phép dữ liệu gửi ra ngoài.

Mỗi `AiRun` lưu provider/model/revision, template hash, input snapshot hash, output hash, latency, token/cost nếu có, decision và error code. Không lưu PII nguyên văn trong telemetry.

## 10. Tư vấn và chốt đơn

### 10.1 Slot cần thu thập

| Nhóm | Trường | Khi thiếu |
|---|---|---|
| Nhu cầu | mục đích, ngân sách, ưu tiên, phần mềm/game | AI hỏi từng câu ngắn |
| Sản phẩm | SKU, variant, quantity | Không tạo Draft Order nếu mơ hồ |
| Khách | họ tên, số điện thoại | Validate và xin xác nhận |
| Giao nhận | địa chỉ hoặc nhận tại cửa hàng, ghi chú | Hỏi lại; không tự suy diễn |
| Đồng ý | consent xử lý thông tin và nhận link xác nhận | Không lưu/tiếp tục ngoài mục đích nếu chưa phù hợp |

### 10.2 Điều kiện handoff

- Không có product/policy Evidence phù hợp.
- Nguồn mâu thuẫn hoặc data freshness quá hạn.
- Khách yêu cầu giảm giá, trả góp, ngoại lệ bảo hành/đổi trả.
- Khách phàn nàn, đe dọa, yêu cầu pháp lý hoặc hoàn tiền.
- Khách muốn thanh toán/đặt cọc nhưng gateway chưa xác nhận.
- Prompt injection: yêu cầu bỏ qua policy, tiết lộ prompt/secret hoặc thao tác ngoài quyền.
- Model/tool lỗi lặp lại quá ngưỡng.

Handoff gồm reason code, summary không bịa, collected slots, evidence đã dùng và hành động chờ người thật.

### 10.3 Đơn và thanh toán

- AI tạo `DRAFT`; signed link chuyển trạng thái sang `LINK_SENT`.
- Khách được xem/sửa product, quantity, thông tin giao nhận và tổng tiền.
- Server chạy Truth Guard lại trước `CUSTOMER_CONFIRMED`.
- COD là mặc định MVP.
- QR đặt cọc ở phase sau phải chứa order reference duy nhất; webhook hoặc người có quyền mới chuyển payment sang `CONFIRMED`.
- AI không đọc ảnh QR/biên lai rồi tự khẳng định tiền đã vào tài khoản.

## 11. Content Passport

Passport tối thiểu lưu:

```text
passport_id
content_id + artifact_hash
source snapshot IDs + canonical hash
claims[] + evidence[]
template/prompt/model/provider revisions
creator/editor/approver + timestamps
guard decisions + exception decisions
publish attempts + platform/post reference
interaction/lead/order references
```

Passport không cần blockchain. Tính hữu ích đến từ version bất biến, audit actor và liên kết có thể truy vấn.

## 12. Video programmatic

Pipeline nâng cấp:

```text
Approved snapshot → script + claims → claim validation
→ scene plan → Revideo template → VieNeu-TTS adapter
→ FFmpeg encode/subtitle → media artifact/hash → Content Passport
```

Guardrail video:

- Chữ/voiceover đều sinh từ cùng danh sách claims.
- Giá/promotion hiển thị thành scene data, không hard-code trong asset.
- Glossary kiểm cách đọc RTX, CPU, RAM, SSD, model và giá tiền.
- Phụ đề là bắt buộc; narration có thể tắt nếu TTS lỗi.
- Render chạy worker, có timeout, retry hữu hạn và artifact pre-rendered dự phòng.
- Không dùng AI human/voice cloning khi chưa có consent và license phù hợp.

## 13. Prompt injection và tool safety

Tách ba miền dữ liệu:

- System policy do đội/doanh nghiệp quản lý.
- Retrieved evidence chỉ là dữ liệu, không phải instruction.
- Customer content là untrusted input.

Quy tắc:

- Không ghép raw HTML/description vào system prompt mà không đánh dấu/sanitize.
- Tool allow-list theo task; model không được tự chọn tool quyền cao.
- Tool input phải schema-validate và re-authorize actor/conversation.
- Side effect dùng idempotency key và outbox; model retry không tạo hai đơn/bài.
- Không trả nội bộ prompt, secret, customer khác hoặc audit restricted fields.
- Eval prompt injection là gate P0, không phải test phụ.

## 14. Quyền riêng tư và retention

| Dữ liệu | Log/telemetry | Retention demo | Quyền truy cập |
|---|---|---|---|
| Product/public facts | Có provenance | Theo version release | Nội bộ; một phần công khai |
| Prompt/output không PII | Hash + metadata; full content trong store kiểm soát | Theo mục đích evaluation | AI/QA có quyền |
| Phone/address | Mask, không đưa vào trace | Ngắn nhất đủ demo; reset sau sự kiện | Sales/Manager |
| Signed token | Không log token đầy đủ | Đến expiry | Customer sở hữu link |
| Audit | Không chứa secret/raw PII nếu không cần | Theo policy | Manager/auditor |

## 15. Bộ đánh giá AI tối thiểu

Tạo fixture có expected evidence/action:

- 10 câu hỏi facts rõ ràng.
- 5 câu hỏi thiếu facts.
- 5 câu có hai nguồn mâu thuẫn.
- 5 yêu cầu ngoại lệ/giảm giá/hoàn tiền.
- 5 prompt injection hoặc yêu cầu lộ dữ liệu.
- 5 luồng thu thập thông tin, gồm input sai số điện thoại/địa chỉ thiếu.

Không chỉ chấm similarity câu chữ. Chấm:

- Claim correctness.
- Evidence precision/coverage.
- Abstain/handoff correctness.
- Forbidden action rate.
- PII leakage.
- Schema validity và reproducibility.

Ma trận test chi tiết nằm tại [testing-and-quality-plan.md](testing-and-quality-plan.md).

## 16. Acceptance checklist

- Dataset demo có provenance/version và reset được.
- Ít nhất một promotion active, một expired và hai product versions.
- Opportunity trigger là rule xác định; AI chỉ giải thích.
- Mọi critical claim của content/answer có Evidence.
- Truth Guard chặn đúng stale, expired, conflict, insufficient evidence và policy violation.
- AI không thể publish, approve, confirm order hoặc confirm payment.
- Conversation thiếu evidence tạo handoff có reason/context.
- Customer confirmation là server-side transition riêng.
- Passport truy được từ source snapshot tới Order.
- Mock provider chạy toàn bộ test/demo offline.
