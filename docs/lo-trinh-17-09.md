# Lộ trình OpenCorp OS đến trước 17/09/2026

> **Trạng thái tài liệu: Đề xuất — chờ Chủ dự án, Claude, Codex và Hermes duyệt.**
>
> Mục tiêu: có một vertical workflow xuyên phòng ban chạy ổn định, có shared context, human approval, audit trail và kịch bản fallback để trình diễn trước ngày 17/09/2026.

## Nguyên tắc cắt phạm vi

- Ưu tiên workflow chạy trọn vẹn hơn số lượng tính năng.
- Core bắt buộc: identity/permission, workflow, shared data, approval và audit.
- Computer retail là vertical kiểm chứng; không tuyên bố đã hỗ trợ mọi ngành.
- Avatar/livestream chỉ là lớp WOW, không được làm phụ thuộc của demo lõi.
- Doanh thu chỉ ghi nhận sau khi đơn được xác nhận hoặc thanh toán.
- Mọi số liệu trong demo phải phân biệt rõ dữ liệu thật, seed, mô phỏng và đề xuất.

## Lộ trình đề xuất

| Thời gian | Mục tiêu | Kết quả cần có | Trạng thái |
|---|---|---|---|
| 01/09 | Chốt scope, persona, dữ liệu demo và tiêu chí thắng | One-page scope; danh sách dữ liệu được phép dùng; tiêu chí WOW/KPI | Đề xuất |
| 02/09 | Hoàn thiện trục CSKH | Chatwoot webhook → phân loại intent → trả lời RAG hoặc tạo ticket | Đề xuất |
| 03/09 | Hoàn thiện Brand DNA và content workflow | Nhiều writer theo pillar; rubric đọc từ dữ liệu cấu hình | Đề xuất |
| 04/09 | Bổ sung kiểm soát nội dung | Deterministic check catalog; Writer → QC → revision → human approval | Đề xuất |
| 05/09 | Nối hành trình bán hàng/bảo hành | Purchase intent → qualified lead → draft order; ticket warranty có người nhận | Đề xuất |
| 06/09 | Kiểm chứng RAG phân quyền | Lọc quyền trước retrieval; AI từ chối tài liệu ngoài phòng ban; có audit log | Đề xuất |
| 07–08/09 | Ghép vertical workflow | Marketing → Sales → Support/Warranty trên shared context | Đề xuất |
| 09/09 | Tích hợp Mission Control | Hiển thị nhân sự, trạng thái workflow, approval và audit trail | Đề xuất |
| 10/09 | Viết evaluation và test chính | Test intent, grounded answer, permission, injection, escalation, latency | Đề xuất |
| 11/09 | Hardening và fallback | Demo chạy được khi API/Internet lỗi; xử lý timeout, retry, duplicate webhook | Đề xuất |
| 12/09 | Chạy Gate 1 — feature freeze | Chỉ giữ tính năng có thể demo; cắt feature chưa ổn định | Đề xuất |
| 13/09 | Chạy Gate 2 — technical proof | Build từ source, seed lại được, test pass, có log và số liệu | Đề xuất |
| 14/09 | Hoàn thiện câu chuyện trình bày | Kịch bản demo 10 phút, phân vai, slide, ảnh/log bằng chứng | Đề xuất |
| 15/09 | Tổng duyệt lần 1 | Chạy demo như điều kiện thi; ghi toàn bộ lỗi và thời gian từng bước | Đề xuất |
| 16/09 | Sửa blocker và tổng duyệt lần 2 | Bản release candidate, backup/video fallback, checklist trình diễn | Đề xuất |
| Trước 17/09 | Khóa bản dự thi | Không thêm feature; chỉ sửa blocker; lưu commit và tài liệu evidence | Đề xuất |

## Gate duyệt

### Gate 0 — Scope approval, trước khi triển khai mở rộng

Người duyệt: Chủ dự án + Claude + Codex + Hermes.

Phải chốt:

- Một workflow chính để demo.
- Những gì là core, WOW layer và vision only.
- Dữ liệu seed/dữ liệu thật được phép dùng.
- KPI và tiêu chí đánh giá.
- Phần nào chắc chắn không làm trước deadline.

### Gate 1 — Feature freeze, mục tiêu 12/09

Chỉ giữ tính năng đã chạy hoặc có đường fallback rõ ràng. Tính năng chưa chứng minh được end-to-end chuyển sang `Hoãn` hoặc `Vision only`.

### Gate 2 — Technical proof, mục tiêu 13/09

Phải có bằng chứng cho:

- Build/startup từ source.
- Database seed và health check.
- Workflow chính chạy từ đầu đến cuối.
- Human approval và audit trail.
- Permission/RAG boundary.
- Error path và fallback.
- Test/evaluation tối thiểu.

### Gate 3 — Demo freeze, trước 17/09

Không thêm tính năng mới. Chỉ sửa blocker, hoàn thiện bằng chứng và bảo đảm bản demo lặp lại được.

## Quy trình cập nhật

Mỗi task trong bảng phải được cập nhật với:

- Người phụ trách.
- File/module liên quan.
- Dependency.
- Bằng chứng hoàn thành.
- Rủi ro còn lại.
- Trạng thái: `Đề xuất`, `Đang review`, `Đã duyệt`, `Đang thực hiện`, `Đã kiểm chứng`, `Hoãn` hoặc `Bị cắt`.

Mọi thay đổi lớn về phạm vi hoặc thứ tự phải được thảo luận bởi cả ba agent và Chủ dự án trước khi thực hiện.
