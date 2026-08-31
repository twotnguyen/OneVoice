# OpenCorp — Ideation Board

## Trạng thái

**Đã chốt — 31/08/2026.** Chủ dự án phê duyệt concept theo Hồ sơ đề tài DX-OS 2026
(OpenCorp — đồng nghiệp AI trong từng phòng ban) và lộ trình thi công theo
`planning/ke-hoach-nuoc-rut-16-09.html`, với một điều chỉnh: model AI dùng nhà cung
cấp cloud qua API/base URL, không chạy model local. Gate I0–I4 coi như đã qua;
implementation được mở khóa theo kế hoạch trên.

Cập nhật cùng ngày (sau phản biện của Codex và các vòng thảo luận với chủ dự án):
chốt tính năng chữ ký **"đồng nghiệp AI trực 24/7 — làm nhiều hơn là nói:
Nói – Làm – Nhớ – Bàn giao"**; bậc thang ưu tiên wow-first W1→W6; demo theo hành
trình một khách hàng; ma trận human approval 4 mức rủi ro. Tất cả đã phản ánh vào
kế hoạch và slide deck.

**Cập nhật 01/09/2026.** Chốt phạm vi bề mặt web: OpenCorp **không xây website
thương mại điện tử** cho cửa hàng máy tính (trang sản phẩm động, giỏ hàng, thanh
toán, trang quản trị đơn). Bề mặt web của sản phẩm chỉ gồm **Mission Control**
(dashboard nội bộ) và **Chatwoot** (điểm khách hàng tiếp xúc, đa kênh — gồm widget
live-chat nhúng trên trang). "Khách nhắn trên web" = kênh Website của Chatwoot →
webhook → Orchestrator. Tối đa cho phép **một trang HTML tĩnh** làm điểm mở màn
demo (logo + vài sản phẩm render từ file catalog + nhúng widget Chatwoot), không
backend riêng. Lý do: giữ kỷ luật "đặc thù nằm ở dữ liệu, không nằm trong code",
tránh biến sản phẩm thành "phần mềm quản lý cửa hàng có AI", và không tiêu thời
gian nước rút cho hạng mục không có trong thang điểm.

Tài liệu trong `product/`, `presentations/` và `archive/previous-plans/` là bối cảnh
tham khảo; nguồn sự thật thi công duy nhất là `planning/ke-hoach-nuoc-rut-16-09.html`.

## Các nguyên tắc đã xác nhận

1. OpenCorp phục vụ doanh nghiệp và môi trường vận hành thực tế.
2. AI cộng tác với con người; không thay toàn bộ nhân sự.
3. Con người phê duyệt quyết định có rủi ro và chịu trách nhiệm cuối cùng.
4. Model AI dùng dịch vụ cloud qua API/base URL; không chạy model local.
5. Sản phẩm phải liên hệ rõ với chủ đề DX-OS/H–P–D–I và tiêu chí cuộc thi.
6. Đặc thù của doanh nghiệp nằm ở dữ liệu nạp vào (catalog, Brand DNA, tài liệu,
   skill), không nằm trong code lõi. OpenCorp không xây giao diện riêng cho từng
   nghiệp vụ — không có web bán hàng cho cửa hàng máy tính; bề mặt web chỉ là
   Mission Control + widget Chatwoot.

## Câu hỏi cần trả lời trước khi thiết kế giải pháp

### 1. Doanh nghiệp nào?

- Pilot cụ thể là ai?
- Quy mô, vai trò nhân sự và hệ thống hiện có?
- Đội có quyền sử dụng catalog, SOP, ticket hoặc dữ liệu nào?

### 2. Vấn đề nào đáng giải nhất?

- Pain point lặp lại bao nhiêu lần mỗi ngày/tuần?
- Ai đang chịu chi phí của vấn đề?
- Vì sao công cụ hiện tại chưa giải quyết được?
- Kết quả nào có thể quan sát hoặc đo được?

### 3. Hành trình trung tâm là gì?

- Sự kiện bắt đầu ở đâu?
- Đi qua những phòng ban nào?
- Ngữ cảnh nào thường bị mất?
- Quyết định nào AI được chuẩn bị và quyết định nào bắt buộc người duyệt?

### 4. Vì sao phải là AI?

- Phần việc nào cần hiểu ngôn ngữ/tài liệu/ngữ cảnh?
- Phần nào nên dùng rule, database hoặc workflow thông thường?
- Sai ở bước nào sẽ gây rủi ro?
- Cần citation, refusal, approval và audit ở đâu?

### 5. Bằng chứng thắng cuộc là gì?

- Demo nào khiến giảng viên hiểu trong 60 giây?
- KPI nghiệp vụ và AI nào cần đo?
- Dữ liệu nào là thật, synthetic hoặc simulated?
- Mức nào phải chạy live; mức nào chỉ nên là prototype/roadmap?

## Quy trình ideation

| Gate | Đầu ra | Điều kiện chuyển bước |
|---|---|---|
| I0 — Problem discovery | 3–5 pain point có bằng chứng | Có người dùng/pilot và nguồn dữ liệu xác thực |
| I1 — Concept options | Ít nhất 3 concept khác nhau | Mỗi concept có user, workflow, giá trị và rủi ro |
| I2 — Selection | Bảng so sánh theo tiêu chí cuộc thi | Chủ dự án chọn một concept hoặc yêu cầu vòng mới |
| I3 — Validation | Storyboard/demo giấy + phản biện giảng viên | Giảng viên hiểu bài toán, khác biệt và phạm vi |
| I4 — Scope lock | One-pager, MVP, KPI, data plan | Chủ dự án phê duyệt bằng văn bản |
| I5 — Architecture | Kiến trúc và roadmap đề xuất | Chỉ bắt đầu sau I4; chưa phải mặc định |

## Tiêu chí so sánh concept

1. Mức đau và tính thực tiễn của bài toán.
2. Khả năng tiếp cận dữ liệu/pilot.
3. Mức phù hợp H–P–D–I và tiêu chí nguồn mở.
4. Một workflow có thể kể và demo trọn vẹn.
5. AI tạo giá trị thật, không phải gắn chatbot cho có.
6. Human approval, safety và audit có vai trò rõ.
7. Khả năng hoàn thành trong thời gian cuộc thi.
8. Điểm wow nhìn thấy được nhưng không phụ thuộc vào hiệu ứng.

## Quy tắc dừng

~~Không tạo lại Docker Compose, `.env`, database schema, API service hoặc agent code
cho đến khi Gate I4 được chủ dự án phê duyệt.~~ **Đã gỡ 31/08/2026** — Gate I4 được
chủ dự án phê duyệt; thi công theo `planning/ke-hoach-nuoc-rut-16-09.html`.
