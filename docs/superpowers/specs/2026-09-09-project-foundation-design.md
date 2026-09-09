# OneVoice Project Foundation — Design Specification

## Mục tiêu

Dựng nền ứng dụng OneVoice có thể chạy và kiểm tra độc lập trước khi phát triển nghiệp vụ: Next.js, Supabase Cloud, schema/seed có version, AI qua API tương thích OpenAI, health endpoint và Docker Compose.

## Phạm vi được duyệt

- Next.js App Router, TypeScript strict và pnpm.
- Supabase Cloud là cơ sở dữ liệu phát triển chính.
- Schema nằm trong `supabase/migrations/`; dữ liệu demo sau này nằm trong `supabase/seed.sql`.
- Supabase local có thể được bật bằng CLI khi cần tái lập/offline; không tự viết lại toàn bộ Supabase stack trong `compose.yaml`.
- `compose.yaml` ban đầu chỉ đóng gói ứng dụng; cấu hình Supabase truyền qua biến môi trường.
- AI chỉ được gọi từ server qua một port nội bộ và adapter OpenAI-compatible.
- Không đưa key thật vào Git; `.env.example` chỉ có tên biến và giá trị mẫu an toàn.
- Apache-2.0 áp dụng cho code do đội viết; dataset, model, media và dependency được audit riêng.

## Luồng chạy

```text
Browser
  └─> Next.js app/BFF
        ├─> Supabase Cloud (PostgreSQL/Auth/Storage khi cần)
        └─> AiProvider
              └─> OpenAI-compatible base URL + API key + model
```

`NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` được phép xuất hiện ở client và chỉ có quyền theo RLS. `SUPABASE_SECRET_KEY` và `AI_API_KEY` là server-only. Không biến server-only nào mang tiền tố `NEXT_PUBLIC_`.

## Contract nền

- `GET /api/health` luôn trả HTTP 200 nếu process Next.js còn sống, không làm lộ key và không phụ thuộc dịch vụ ngoài.
- `readServerEnv()` chỉ trả cấu hình server sau khi kiểm tra URL/key/model hợp lệ.
- `OpenAICompatibleProvider.generateText()` gọi `${AI_BASE_URL}/chat/completions`, gửi Bearer key, model và messages; lỗi HTTP trở thành lỗi có mã trạng thái nhưng không chứa key.
- `createSupabaseServerClient()` chỉ được import trong server module.

## Docker

Dockerfile dùng multi-stage build và Node 24 Alpine. `compose.yaml` build app từ source, đọc `.env` nếu có, cung cấp healthcheck và không chứa secret. Supabase local được quản lý bằng Supabase CLI vì CLI tự dựng stack container chính thức.

## Giao diện nền

Trang chủ là “signal console” tối giản dành cho đội phát triển: nền sáng, mực xanh đậm, cobalt làm tín hiệu chính và xanh lục cho trạng thái. Nội dung căn trái, một cột trạng thái rõ ràng thay vì lưới card SaaS. Font ưu tiên Avenir Next/Segoe UI để hiển thị tiếng Việt ổn định mà không cần tải font khi build.

## Kiểm thử và nghiệm thu

- Unit test health response và server env validation.
- Unit test adapter AI tạo đúng URL/header/body và parse response.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` đều thành công.
- `docker compose config` hợp lệ; `docker compose up --build` đưa healthcheck về healthy.
- Không có `.env`, API key hoặc Supabase secret thật trong Git.

## Ngoài phạm vi

Catalog sản phẩm, Opportunity Engine, đăng bài, inbox, chốt đơn, video, queue, worker, Supabase Auth UI và adapter mạng xã hội chưa được triển khai trong foundation này.
