# Bộ tài liệu phát triển OneVoice

> Phiên bản tài liệu: 08/09/2026
> Phạm vi: bán kết trường 17/09/2026, chung kết trường 02/10/2026 và chuẩn hóa cho OLP quốc gia tháng 12/2026.

## Bắt đầu từ đâu?

Nếu chỉ đọc ba tài liệu, hãy đọc theo thứ tự:

1. [Tổng quan và đặc tả toàn dự án](onevoice-project-blueprint.md) để hiểu OneVoice xây cái gì và không xây cái gì.
2. [Roadmap phát triển từng bước](development-roadmap.md) để biết hôm nay đội phải làm gì và điều kiện nào mới được chuyển phase.
3. [Kế hoạch kiểm thử và chất lượng](testing-and-quality-plan.md) để biết bằng chứng nào chứng minh một phần đã hoàn thành.

Không bắt đầu bằng việc chọn thêm framework hoặc làm video. Hãy hoàn thành vertical slice sau trước:

```text
Opportunity → Campaign → Content → Approval/Truth Guard
→ Interaction → AI consultation/Handoff → Lead
→ Draft Order → Customer confirmation → Order → Attribution
```

## Bản đồ tài liệu

| Tài liệu | Dùng khi nào? | Người đọc chính |
|---|---|---|
| [Blueprint toàn dự án](onevoice-project-blueprint.md) | Chốt bài toán, phạm vi, yêu cầu và tiêu chí thành công | Cả đội, giảng viên |
| [Roadmap phát triển](development-roadmap.md) | Lập kế hoạch ngày, kiểm tra phase gate, quyết định cắt scope | Trưởng nhóm, cả đội |
| [Kiến trúc và công nghệ](architecture-and-tech-stack.md) | Thiết kế module, schema, API, worker và adapter | Backend, full-stack |
| [Dữ liệu, AI và guardrail](data-ai-and-guardrails.md) | Chuẩn hóa dữ liệu, grounding, Truth Guard, handoff | Data/AI, backend |
| [Kiểm thử và chất lượng](testing-and-quality-plan.md) | Viết test, chuẩn bị fixture, đóng bug và release gate | QA, mọi developer |
| [DevOps, release và OSS](devops-release-and-oss-compliance.md) | Dựng máy mới, CI/CD, SBOM, license và phát hành | Platform, trưởng nhóm |
| [Công cụ và repository](tools-and-repositories.md) | Chọn dependency hoặc đánh giá công cụ mới | Tech lead, reviewer |
| [Demo, xác thực và thang điểm](demo-validation-and-scoring.md) | Phỏng vấn cửa hàng, đo tác động, tập demo và phản biện | Product/demo owner |
| [Playbook làm việc nhóm](team-execution-playbook.md) | Phân vai, Git workflow, daily review và xử lý sự cố | Cả đội |

## Đọc theo vai trò

### Trưởng nhóm

Đọc blueprint → roadmap → playbook → demo/scoring → DevOps/OSS. Mỗi ngày phải biết đường găng, feature nào bị cắt và bằng chứng nào còn thiếu.

### Backend/Data/AI

Đọc blueprint → kiến trúc → dữ liệu/AI → kiểm thử → DevOps. Không cho LLM tự đọc description rồi phát biểu tự do; facts quan trọng phải đi qua trường cấu trúc và Evidence.

### Frontend/Demo

Đọc blueprint → roadmap → kiến trúc → demo/scoring → kiểm thử. Mọi trạng thái `STALE`, `BLOCKED`, `HANDOFF_REQUIRED` và lỗi quyền phải nhìn thấy được trong giao diện.

### Giảng viên hoặc reviewer

Đọc blueprint → roadmap → demo/scoring → tools/repositories. Bốn câu hỏi cần phản biện là: bài toán có thật không, phần nào do đội xây, demo có chạy xuyên suốt không và kho mã nguồn có tái lập được không.

## Các quyết định đã khóa

1. MVP là **modular monolith TypeScript**, không phải microservices.
2. **PostgreSQL là nguồn sự thật duy nhất** cho dữ liệu nghiệp vụ, version, audit và attribution.
3. Lõi nguyên gốc của đội là **Opportunity Engine, Truth Guard, Content Passport, evidence/handoff và Content-to-Cash Attribution**.
4. Attribution MVP dùng **first-touch theo quy tắc**; thiếu nguồn thì ghi `unknown`, không suy đoán quan hệ nhân quả.
5. **MockChannel** bắt buộc để demo offline. Một adapter nền tảng thật chỉ là nâng cấp khi đã có credential và quyền phù hợp.
6. AI chỉ được tạo đề xuất, nội dung, câu trả lời và đơn nháp. Quản lý duyệt nội dung; khách xác nhận đơn; nhân viên/cổng thanh toán xác nhận tiền.
7. Điểm cuối MVP là **đơn COD được khách xác nhận**. Đặt cọc, QR và đối soát thật để sau.
8. Video Revideo + VieNeu-TTS không được nằm trên đường găng của bán kết.
9. Dataset GearVN là snapshot công khai ngày 31/08/2026, không phải tồn kho nội bộ hoặc bằng chứng hợp tác với cửa hàng.
10. Code, model weights, dataset, hình ảnh, font, nhạc và binary codec phải được audit giấy phép riêng.
11. Mã do đội viết phát hành theo **Apache License 2.0** để đáp ứng OSI, có patent grant và thuận lợi cho doanh nghiệp triển khai; dependency/model/media vẫn tuân giấy phép riêng.

## Ba chặng phát triển

| Chặng | Kết quả bắt buộc |
|---|---|
| 08–17/09 — bán kết | Một vertical slice chạy được, Truth Guard và handoff nhìn thấy, video dự phòng, tài liệu bài toán |
| 18/09–02/10 — chung kết trường | Ổn định trải nghiệm, một tích hợp thật nếu đủ điều kiện, video programmatic và bằng chứng thử nghiệm |
| 03/10–10/12 — OLP quốc gia | Repo công khai tái lập được, license/SBOM sạch, cộng đồng và showcase/hackathon sẵn sàng |

Chi tiết, cổng nghiệm thu và phương án cắt scope nằm trong [roadmap](development-roadmap.md).

## Thuật ngữ thống nhất

| Thuật ngữ | Nghĩa trong OneVoice |
|---|---|
| SSOT | Single Source of Truth — nguồn dữ liệu chuẩn duy nhất của hệ thống |
| Opportunity | Cơ hội kinh doanh được tạo từ một tín hiệu và snapshot dữ liệu cụ thể |
| Content Claim | Một phát biểu có thể kiểm tra trong nội dung, ví dụ giá, cấu hình hoặc ngày hết khuyến mãi |
| Content Passport | Hồ sơ nối nội dung với nguồn dữ liệu, AI run, người duyệt, tương tác và đơn hàng |
| Truth Guard | Các kiểm tra xác định chặn hành động khi facts quan trọng cũ, thiếu hoặc mâu thuẫn |
| Evidence | Bản ghi/field/version chứng minh một claim hoặc câu trả lời của AI |
| Handoff | Chuyển cuộc hội thoại cho người thật do thiếu bằng chứng, rủi ro hoặc ngoại lệ |
| Draft Order | Đơn nháp do hệ thống tạo nhưng chưa phải đơn được khách xác nhận |
| Attribution | Quy tắc gắn nguồn nội dung/chiến dịch cho tương tác và đơn hàng; không đồng nghĩa quan hệ nhân quả |
| Phase gate | Điều kiện kiểm chứng bắt buộc trước khi chuyển sang giai đoạn tiếp theo |
| BFF | Backend for Frontend — lớp API phía server phục vụ trực tiếp giao diện |
| Outbox | Bảng sự kiện ghi cùng transaction nghiệp vụ để worker có thể gửi/retry an toàn |
| Idempotency | Cùng một yêu cầu/event chạy lại nhưng không tạo side effect trùng |
| ADR | Architectural Decision Record — bản ghi quyết định kiến trúc và hệ quả |
| PoF | Point of Failure — nhóm tiêu chí kho mã nguồn có thể làm mất điểm lớn ở OLP |
| SBOM | Software Bill of Materials — danh mục thành phần/phụ thuộc của source hoặc image |

## Nguồn có thẩm quyền

- Định hướng sản phẩm: [onevoice-y-tuong-de-tai.md](../onevoice-y-tuong-de-tai.md).
- Chủ đề DX-OS: [vfossa-dx-os-2026.md](../official/vfossa-dx-os-2026.md).
- Thể lệ, PoF và lịch OLP: [olp-2026-overview.md](../official/olp-2026-overview.md).
- Lịch và yêu cầu cuộc thi trường: [trang sự kiện HUTECH](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14); rubric trong [slide tập huấn buổi 3](../slides/clb-mnm-slide-buoi3-ke-hoach-cuoc-thi.html) cần đối chiếu thông báo mới vì slide cũ dùng lịch dự kiến trước đó.
- Chất lượng dataset: [FINAL-DATASET-REPORT.md](../../data/reports/FINAL-DATASET-REPORT.md) và [dataset-manifest.json](../../data/output/dataset-manifest.json).
- License/API của dependency: liên kết chính thức trong [tools-and-repositories.md](tools-and-repositories.md).

## Quy tắc “hoàn thành”

Một feature chưa được xem là hoàn thành nếu chỉ chạy trên máy người viết. Nó phải có acceptance criterion, validation/error state, RBAC phù hợp, audit event, test, dữ liệu seed/reset, kết quả nhìn thấy trong demo và tài liệu được cập nhật. Xem Definition of Done đầy đủ trong [testing-and-quality-plan.md](testing-and-quality-plan.md).
