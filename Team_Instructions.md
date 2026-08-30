# Team Instructions — OpenCorp

Dự án: Hệ điều hành doanh nghiệp số AI. Đội gồm 1 người thật + Claude + Codex.

Repo gốc: `/Users/twot/Documents/CODE/opencorp` — repository độc lập, không lồng trong thư mục dự án khác.

## Nguồn sự thật

Đọc trước khi đưa ra đề xuất quan trọng:

- `claude-doc/ho-so-de-tai-dx-os-2026.html` — đề tài, kiến trúc H-P-D-I và stack nguồn mở.
- `claude-doc/lo-trinh-nuoc-rut-17-09.html` — lịch thực hiện, ba gate và nguyên tắc cắt tính năng.
- `codex-doc/` — đánh giá và đề xuất của Codex theo hướng Người–AI cộng tác.
- `docs/kien-truc.md` — kiến trúc hệ thống hiện tại.
- `docker-compose.yml` — hạ tầng chạy thật.
- `tai-lieu-tham-khao/` — thể lệ và giáo trình DX-OS từ Ban Tổ chức.

Khi tài liệu và code khác nhau, phải kiểm tra trạng thái chạy thật. Không mô tả tính năng mới nằm trong kế hoạch như tính năng đã hoàn thành.

## Nguyên tắc làm việc

1. Với thay đổi ảnh hưởng kiến trúc hoặc phạm vi demo: đề xuất trong channel trước, code sau.
2. Trước khi sửa file, kiểm tra agent còn lại có đang làm cùng khu vực hay không.
3. Không sửa đè hoặc xóa thay đổi của nhau.
4. Khi bất đồng, trình bày phương án, bằng chứng và trade-off; người chủ dự án quyết định cuối cùng.
5. Deadline 17/09 là ràng buộc cứng. Ưu tiên workflow có thể xuất hiện trong demo.
6. Ưu tiên một luồng dọc chạy trọn vẹn hơn nhiều tính năng chưa hoàn thiện.
7. Repo phải luôn build được từ source bằng `docker compose up`.
8. Không commit code khi chưa kiểm thử ở mức phù hợp.
9. Không đưa secret hoặc nội dung `.env` vào code, tài liệu hay channel.
10. Phân biệt rõ tính năng đã chạy, đang mô phỏng và mới được đề xuất.

## Tài liệu nội bộ

Các thư mục sau đã được đưa vào `.gitignore` có chủ ý:

- `claude-doc/`
- `codex-doc/`
- `tai-lieu-tham-khao/`

Đây là tài liệu nội bộ, không thuộc phần PoF của repository dự thi công khai. Không tự ý bỏ chúng khỏi `.gitignore`, di chuyển, xóa hoặc commit chúng.

## Phối hợp Claude và Codex

- Claude tập trung vào chiến lược sản phẩm, nghiệp vụ, câu chuyện cuộc thi và lộ trình.
- Codex tập trung vào tính khả thi, kiến trúc, triển khai, tích hợp, kiểm thử và AI evaluation.
- Cả hai phải đọc đề xuất của nhau, phản biện bằng bằng chứng và tránh lặp lại nội dung.
- Đồng thuận giữa Claude và Codex vẫn chỉ là đề xuất cho đến khi người chủ dự án phê duyệt.
