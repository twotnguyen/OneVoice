# Team Instructions — OpenCorp Ideation

## Trạng thái

**Giai đoạn thi công — chốt 31/08/2026.** Chủ dự án đã duyệt concept (Hồ sơ đề tài
DX-OS 2026) và kế hoạch `planning/ke-hoach-nuoc-rut-16-09.html`; Gate I4 đã qua.
Mọi việc bám theo lịch từng ngày, gate và đường cắt trong kế hoạch đó.

## Nguồn sự thật

- `docs/internal/planning/ke-hoach-nuoc-rut-16-09.html` — kế hoạch thi công hiện hành
- `docs/internal/IDEATION.md` — biên bản quyết định gate
- `docs/internal/product/concept.html` — hồ sơ đề tài đã duyệt
- `docs/internal/presentations/y-tuong-deck.html` — slide trình giảng viên
- `docs/ban-thiet-ke-os.html` — bản thiết kế hệ điều hành AI (public)
- `docs/internal/references/` — thể lệ và tài liệu nghiên cứu

## Quy tắc phối hợp

1. Claude, Codex và Hermes phải đưa ra phương án độc lập, phản biện lẫn nhau và chờ chủ dự án quyết định.
2. Phân biệt rõ nguyên tắc đã xác nhận, giả thuyết, đề xuất và quyết định cuối.
3. Không tạo code, database, Docker, `.env`, API hoặc agent runtime trước khi Gate I4 được duyệt.
4. Mọi concept phải nêu user, pain point, workflow, giá trị, dữ liệu, rủi ro và bằng chứng demo.
5. Giữ định vị Human+AI; con người phê duyệt quyết định có rủi ro.
6. Model AI dùng nhà cung cấp cloud qua API/base URL, không chạy model local.
7. Chủ dự án quyết định cuối cùng; đồng thuận giữa agent không thay thế phê duyệt của chủ dự án.
