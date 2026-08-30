# Kiến trúc OpenCorp

## Nguyên tắc

1. **Đồng nghiệp AI, không thay con người**: người và AI nằm chung bảng `employees`;
   mọi hành động hệ trọng (đăng bài, gửi khách, duyệt đơn) dừng chờ con người.
2. **Đặc thù nằm ở dữ liệu, không nằm trong code**: catalog, Brand DNA, tài liệu,
   skill là dữ liệu nạp vào — code lõi không biết "cửa hàng máy tính" là gì.
3. **Một nguồn sự thật**: mọi phòng ban đọc/ghi PostgreSQL; Mission Control chỉ là
   một cách nhìn vào `agent_log`.

## Luồng chính (bản khung 31/08)

```
Khách nhắn (Chatwoot) ──webhook──▶ Orchestrator ──▶ agent CSKH (RAG/ticket)  [02/09+]
Lệnh demo /demo/content-run ─────▶ Writer agent ⇄ QC agent (≤3 vòng) ──▶ posts + agent_log
Mission Control (GET /) ◀──────── đọc employees + agent_log
```

## Việc kế tiếp theo lộ trình

- 02/09: webhook Chatwoot → phân loại → RAG tư vấn
- 03/09: Brand DNA file + nhiều writer theo trụ nội dung
- 05/09: đăng Meta API + luồng ticket bảo hành
- 06/09: RAG nội bộ phân quyền theo phòng ban (nhãn `documents.department` + vai từ Keycloak)
