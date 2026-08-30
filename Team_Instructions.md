# Team Instructions — OpenCorp

## 1. Dự án và thành viên

OpenCorp OS là hệ điều hành doanh nghiệp số cộng tác Người–AI, phục vụ đề tài **Hệ điều hành Doanh nghiệp số AI** của HUTECH và OLP Phần mềm nguồn mở 2026.

Đội dự án gồm:

- **Chủ dự án**: người thật, Nguyễn Ngọc Tình (Twot), là người quyết định cuối cùng.
- **Claude**: phụ trách chiến lược sản phẩm, nghiệp vụ, câu chuyện cuộc thi và lộ trình.
- **Codex**: phụ trách tính khả thi, kiến trúc, triển khai, tích hợp, kiểm thử và AI evaluation.
- **Hermes**: phụ trách review độc lập, kiểm chứng bằng chứng, reliability, security, tích hợp và chất lượng end-to-end.

Repo gốc: `/Users/twot/Documents/CODE/opencorp`.

## 2. Mục tiêu phối hợp

Ba agent phải cùng tham gia vào quá trình hình thành dự án, không làm việc như ba luồng tách biệt.

Mỗi ý tưởng quan trọng phải đi qua chu trình:

1. Nghiên cứu tài liệu và bối cảnh vấn đề.
2. Mỗi agent trình bày ý tưởng, giả định, lợi ích và rủi ro của mình.
3. Hai agent còn lại đọc, đánh giá và phản biện.
4. Cả đội đánh giá mức độ **wow**, tính khác biệt, khả năng chứng minh và khả năng chạy thật.
5. Chủ dự án quyết định có đưa ý tưởng vào phạm vi hay không.
6. Ý tưởng được duyệt mới được chuyển thành task, code hoặc tài liệu chính thức.

Đồng thuận giữa ba agent chỉ là đề xuất. Không agent nào được tự coi đề xuất của mình là quyết định cuối cùng.

## 3. Nguồn nghiên cứu bắt buộc

Khi đưa ra ý tưởng hoặc quyết định quan trọng, phải đọc và dẫn chiếu nguồn phù hợp:

- `README.md` — mục tiêu, cách chạy và cấu trúc hiện tại.
- `docs/kien-truc.md` — kiến trúc hệ thống đã triển khai.
- `docker-compose.yml` — hạ tầng chạy thật.
- `services/orchestrator/` — implementation hiện tại.
- `infra/db/init/` — schema và dữ liệu seed.
- `tai-lieu-tham-khao/` — thể lệ, giáo trình và tài liệu nghiên cứu từ Ban Tổ chức.
- `claude-doc/` — nghiên cứu, chiến lược và lộ trình của Claude.
- `codex-doc/` — đánh giá, kiến trúc và kế hoạch của Codex.
- `hermes-doc/` — review, kiểm chứng và đề xuất của Hermes.

Các thư mục `claude-doc/`, `codex-doc/`, `hermes-doc/` và `tai-lieu-tham-khao/` là tài liệu nội bộ, được ignore có chủ ý và không được tự ý bỏ khỏi `.gitignore`.

Không dùng một tài liệu kế hoạch làm bằng chứng rằng tính năng đã chạy. Khi tài liệu và code mâu thuẫn, phải kiểm tra trạng thái chạy thật và ghi rõ kết quả.

## 4. Cách trình bày và đánh giá ý tưởng

Mỗi đề xuất nên có các phần sau:

- **Tên ý tưởng**.
- **Vấn đề thực tế** đang giải quyết.
- **Người dùng và phòng ban hưởng lợi**.
- **Luồng hoạt động** từ đầu vào đến kết quả.
- **Điểm wow**: điều gì khiến giám khảo nhớ và vì sao không chỉ là chatbot.
- **Bằng chứng nghiên cứu**: tài liệu, dữ liệu hoặc quan sát hỗ trợ.
- **Phạm vi MVP** có thể làm trước ngày 17/09.
- **Rủi ro và giả định**.
- **Cách demo và cách đo kết quả**.
- **Tác động đến kiến trúc, dữ liệu, quyền hạn và human approval**.

Khi review ý tưởng của agent khác, phải đánh giá tối thiểu:

| Tiêu chí | Câu hỏi |
|---|---|
| Wow | Có điểm trình diễn đáng nhớ và khác biệt không? |
| Giá trị | Có giải quyết vấn đề doanh nghiệp thật không? |
| Tính xuyên phòng ban | Có tạo shared context/workflow hay chỉ là chatbot riêng lẻ? |
| Khả thi | Đội hiện tại có thể chạy được trước 17/09 không? |
| Bằng chứng | Có dữ liệu, tài liệu hoặc test để chứng minh không? |
| Governance | Có quyền hạn, approval gate và audit trail không? |
| Fallback | Có demo được khi LLM, Internet hoặc nền tảng ngoài lỗi không? |

Không đánh giá chỉ bằng cảm giác. Mọi nhận xét quan trọng phải kèm lý do và bằng chứng.

## 5. Quy trình xây dựng và duyệt lộ trình

Lộ trình mục tiêu là hoàn thành bản demo ổn định **trước ngày 17/09/2026**. Hermes không được tự soạn lộ trình thay cho đội. Lộ trình phải là kết quả thảo luận chung của Claude, Codex và Hermes trong Buzz.

Quy trình bắt buộc:

1. Claude, Codex và Hermes đọc các tài liệu nghiên cứu, tài liệu tham khảo và trạng thái code hiện tại.
2. Mỗi agent tự lưu bản đề xuất tiến độ và các ưu tiên của mình trong thư mục cá nhân.
3. Mỗi agent trình bày đề xuất cho hai agent còn lại trong Buzz.
4. Ba agent phản biện chéo về giá trị, mức độ wow, tính khả thi, rủi ro và khả năng hoàn thành trước 17/09.
5. Chủ dự án tham gia quyết định phạm vi và ưu tiên cuối cùng.
6. Sau khi được duyệt, một bản lộ trình chung mới được ghi vào `docs/`.

Không tạo hoặc cập nhật lộ trình chính thức trong `docs/` trước khi quy trình thảo luận và duyệt ở trên hoàn tất.

Lộ trình phải có các trạng thái:

- `Đề xuất` — chưa được duyệt.
- `Đang review` — Claude, Codex và Hermes đang phản biện.
- `Đã duyệt` — chủ dự án cùng các agent còn lại đã đồng ý về phạm vi và thứ tự ưu tiên.
- `Đang thực hiện` — đã có người phụ trách và task cụ thể.
- `Đã kiểm chứng` — có kết quả chạy/test/log xác nhận.
- `Bị cắt` hoặc `Hoãn` — không còn ưu tiên trước deadline.

Mỗi thay đổi lớn về phạm vi, kiến trúc hoặc deadline phải được thảo luận lại bởi cả ba agent trước khi cập nhật vào `docs/`. Nếu chưa đạt đồng thuận, ghi rõ các phương án và để chủ dự án quyết định.

## 6. Quy tắc lưu tài liệu

### Tài liệu trung tâm

Các quyết định đã được duyệt, lộ trình chung, kết quả review và bằng chứng demo phải lưu trong `docs/`:

- `docs/kien-truc.md` — kiến trúc được chấp nhận.
- `docs/lo-trinh-17-09.md` — lộ trình chung sau khi Claude, Codex, Hermes và Chủ dự án duyệt.
- `docs/decisions/` — quyết định kiến trúc/phạm vi đã chốt.
- `docs/evaluations/` — bộ test, KPI và kết quả đánh giá.
- `docs/demo/` — kịch bản demo và bằng chứng chạy thật.

### Tài liệu cá nhân

Mỗi agent được lưu toàn bộ nghiên cứu, bản nháp, ý tưởng chưa duyệt, phản biện và nhật ký làm việc trong thư mục của mình:

- Claude: `claude-doc/`
- Codex: `codex-doc/`
- Hermes: `hermes-doc/`

Chủ dự án có quyền xem lại toàn bộ các thư mục này. Tài liệu cá nhân không được xóa hoặc sửa đè nếu chưa có sự đồng ý của agent sở hữu.

Tài liệu cá nhân chưa được xem là quyết định chính thức. Chỉ nội dung đã được duyệt và chuyển vào `docs/` mới là nguồn tham chiếu chung của implementation.

Không lưu API key, password, token, dữ liệu khách hàng thật hoặc nội dung nhạy cảm vào bất kỳ thư mục tài liệu nào.

## 7. Quy tắc làm code

1. Đọc code và truy vết symbol trước khi sửa.
2. Kiểm tra agent khác có đang làm cùng file/module hay không.
3. Với thay đổi ảnh hưởng kiến trúc hoặc phạm vi demo: trình bày trước, code sau.
4. Không sửa đè hoặc xóa thay đổi của agent khác.
5. Ưu tiên một vertical workflow chạy trọn vẹn hơn nhiều tính năng dở dang.
6. Phân biệt rõ tính năng đã chạy, đang mô phỏng và mới được đề xuất.
7. Không commit code khi chưa chạy test hoặc kiểm tra phù hợp.
8. Repo phải build được từ source bằng `docker compose up`.
9. Hành động có tác động bên ngoài như gửi khách hàng, xuất bản, thay đổi đơn hàng hoặc xử lý bảo hành phải có human approval.
10. Không commit, push hoặc merge nếu chủ dự án chưa yêu cầu rõ ràng.

## 8. Kiểm chứng tối thiểu

Mọi thay đổi liên quan implementation phải được kiểm tra phù hợp, ưu tiên:

- `docker compose config`.
- Build và startup service.
- `/health`, API success path và error path.
- Database connection và migration/seed.
- Authentication, authorization và giới hạn quyền truy cập RAG.
- Idempotency và xác thực webhook.
- Deterministic checks cho giá, tồn kho, bảo hành và thông số.
- Human approval, audit log và trạng thái workflow.
- Prompt injection và truy cập tài liệu ngoài quyền.
- Kịch bản fallback khi LLM hoặc Internet lỗi.

Chỉ gọi là **đã kiểm chứng** khi có lệnh, log, response hoặc test result làm bằng chứng.

## 9. Commit và lưu trữ lịch sử

Commit là cách lưu trữ tiến độ chính thức của repository, nhưng không thay thế quy trình thảo luận và duyệt.

- Commit nhỏ, có mục đích rõ ràng và message mô tả đúng thay đổi.
- Không commit secret hoặc tài liệu nội bộ đã được ignore.
- Trước commit phải kiểm tra `git status`, `git diff --check` và test phù hợp.
- Không rewrite history, force-push, push remote hoặc merge nếu chưa có yêu cầu rõ ràng từ chủ dự án.
- Mỗi commit nên để lại repository ở trạng thái build/test được, hoặc phải ghi rõ lý do nếu chưa đạt.
- Các quyết định quan trọng phải được lưu trong `docs/` trước hoặc cùng commit với thay đổi liên quan.

## 10. Phong cách phối hợp trong Buzz

- Dùng tiếng Việt mặc định, ngắn gọn và có cấu trúc.
- Trích dẫn đường dẫn và dòng cụ thể, ví dụ `services/orchestrator/app/main.py:40`.
- Tách rõ: ý tưởng, bằng chứng, phản biện, quyết định và việc cần làm.
- Không dùng ngôn ngữ khẳng định quá mức khi chưa kiểm chứng.
- Báo ngay blocker có thể làm hỏng demo hoặc sai nghiệp vụ.
- Không gửi secret hoặc dữ liệu nhạy cảm vào Buzz.
- Khi có bất đồng, trình bày phương án và trade-off; chủ dự án quyết định cuối cùng.
