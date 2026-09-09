# OneVoice Documentation Suite — Design Specification

## Mục tiêu

Xây dựng một bộ tài liệu tiếng Việt có thể dùng trực tiếp để đội 2–4 sinh viên phát triển, kiểm thử, trình diễn và hoàn thiện OneVoice từ ngày 08/09/2026 tới vòng bán kết 17/09/2026, chung kết trường 02/10/2026 và chuẩn hóa kho mã nguồn cho OLP quốc gia tháng 12/2026.

Bộ tài liệu phải trả lời được bốn câu hỏi:

1. OneVoice là gì, giải quyết bài toán nào và khác sản phẩm hiện có ở đâu?
2. Hệ thống được xây bằng kiến trúc, công nghệ và dữ liệu nào?
3. Đội phải làm gì theo đúng thứ tự để có một lát cắt chạy xuyên suốt?
4. Bằng chứng nào chứng minh một giai đoạn hoặc toàn bộ sản phẩm đã hoàn thành?

## Đối tượng đọc

- Thành viên đội thi chịu trách nhiệm triển khai.
- Giảng viên hướng dẫn cần đánh giá phạm vi và tiến độ.
- Người kiểm thử hoặc người mới tham gia dự án.
- Giám khảo cần hiểu phần nguyên gốc, khả năng tái lập và tính nguồn mở.

## Nguyên tắc nội dung

- Viết bằng tiếng Việt, giải thích thuật ngữ tiếng Anh ở lần xuất hiện đầu tiên.
- Một tài liệu có một trách nhiệm chính; `README.md` là điểm vào duy nhất.
- Roadmap là tài liệu điều hành trung tâm và liên kết tới tài liệu chuyên sâu tại đúng phase gate.
- Mọi mốc thời gian dùng ngày tuyệt đối, múi giờ Việt Nam.
- Tách rõ dữ liệu thật, snapshot công khai, dữ liệu đã được cho phép và dữ liệu mô phỏng.
- Không gọi tồn kho công khai của GearVN là tồn kho nội bộ doanh nghiệp.
- Không hứa tích hợp nền tảng thật nếu chưa có credential, quyền ứng dụng và webhook đã kiểm chứng.
- Không gọi một dependency là mã nguồn mở chỉ vì mã được công khai; license code, model, dataset và media phải được audit riêng.
- Các ví dụ phải nhất quán với một vertical slice: `Opportunity → Campaign → Content → Interaction → Lead → Draft Order → Order`.

## Quyết định sản phẩm được khóa

- Kiến trúc MVP là modular monolith TypeScript với worker nền, không dùng microservices.
- PostgreSQL là nguồn sự thật duy nhất cho dữ liệu nghiệp vụ, version, audit và attribution.
- Truth Guard, Content Passport, AI có bằng chứng và Content-to-Cash Attribution là phần lõi do đội xây.
- Mock channel/loopback là bắt buộc để demo offline; chỉ thêm một adapter thật khi quyền nền tảng đã sẵn sàng.
- AI chỉ tạo đề xuất, nội dung, câu trả lời và đơn nháp; người có quyền duyệt nội dung, khách xác nhận đơn, cổng thanh toán hoặc nhân viên xác nhận tiền.
- Điểm cuối MVP là đơn COD được khách xác nhận; thanh toán và đối soát thật để sau.
- Video programmatic bằng Revideo và VieNeu-TTS là nhánh nâng cấp, không được chặn vertical slice văn bản/ảnh.
- Catalog demo dùng 10–20 SKU đã curate; snapshot GearVN chỉ là nguồn tham khảo và nguồn facts có thời điểm.
- Attribution MVP là deterministic first-touch; khi thiếu nguồn phải ghi `unknown`, không suy đoán.

## Cấu trúc đầu ra

Thư mục `docs/development/` gồm:

| File | Trách nhiệm |
|---|---|
| `README.md` | Bản đồ tài liệu, thứ tự đọc và cách dùng theo vai trò |
| `onevoice-project-blueprint.md` | Đặc tả đầy đủ toàn dự án, phạm vi và tiêu chí thành công |
| `development-roadmap.md` | Kế hoạch từng bước, phase gate và lịch từ 08/09 tới OLP quốc gia |
| `architecture-and-tech-stack.md` | Kiến trúc, module, entity, luồng dữ liệu và lựa chọn stack |
| `data-ai-and-guardrails.md` | Dữ liệu, versioning, Truth Guard, grounding, handoff và AI evaluation |
| `testing-and-quality-plan.md` | Test pyramid, test cases, test data, DoD và release gates |
| `devops-release-and-oss-compliance.md` | Môi trường, Docker/CI, quan sát, backup, SBOM và compliance |
| `tools-and-repositories.md` | Công cụ/repo: chọn, loại, để sau, license và rủi ro |
| `demo-validation-and-scoring.md` | Demo, phỏng vấn doanh nghiệp, số đo và ánh xạ tiêu chí chấm |
| `team-execution-playbook.md` | Phân vai, Git workflow, điều hành ngày, review và xử lý rủi ro |

## Nguồn có thẩm quyền

Theo thứ tự ưu tiên:

1. Tài liệu chính thức trong `docs/official/` và liên kết nguồn gốc của VFOSSA/OLP.
2. `docs/onevoice-y-tuong-de-tai.md` cho định nghĩa sản phẩm đã thống nhất.
3. Báo cáo dataset và manifest trong `data/reports/` và `data/output/dataset-manifest.json`.
4. License/README/tài liệu chính thức của từng repository hoặc nền tảng.
5. Tài liệu nghiên cứu trong `docs/research/` và `../opencorp-claude/docs/research/` chỉ là nguồn tham khảo, không phải chứng cứ cuối cùng.

## Tiêu chí nghiệm thu

- Có đủ 10 file đầu ra và không có `TBD`, `TODO` hoặc placeholder chưa xử lý.
- Mọi file được liên kết từ `docs/development/README.md`; không có liên kết Markdown nội bộ bị hỏng.
- Roadmap có bước, chủ sở hữu, đầu vào, đầu ra, dependency, tiêu chí chấp nhận, lệnh kiểm tra và phương án cắt scope.
- Blueprint bao phủ bài toán, người dùng, workflow, chức năng, phi chức năng, dữ liệu, AI, bảo mật, OSS, demo và lộ trình.
- Công nghệ/repository có vai trò, quyết định, license, rủi ro và fallback; link ngoài trỏ tới nguồn chính thức.
- Test plan có tối thiểu bốn E2E P0: happy path, stale data, thiếu evidence/handoff và vượt quyền.
- Nội dung thống nhất về ngày thi, phạm vi MVP, tên module, mô hình attribution và quyền quyết định của AI/người.
- Có ma trận truy vết từ yêu cầu dự án tới tài liệu và phase gate.
