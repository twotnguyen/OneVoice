# OneVoice

OneVoice là hệ thống marketing và bán hàng đa kênh có AI cho doanh nghiệp. Repository hiện chứa foundation: Next.js, Supabase, adapter AI tương thích OpenAI, kiểm thử và Docker Compose.

## Yêu cầu

- Node.js 24 trở lên
- pnpm 11.24.0
- Docker với Compose nếu chạy container
- Một Supabase project và một AI provider tương thích OpenAI khi phát triển tính năng kết nối thật

## Chạy local

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

Mở <http://localhost:3000>. Liveness endpoint ở <http://localhost:3000/api/health> và không gọi dịch vụ ngoài.

## Cấu hình Supabase

Điền vào `.env`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_SECRET_KEY=sb_secret_replace_me
```

Publishable key được bảo vệ bằng Row Level Security. `SUPABASE_SECRET_KEY` chỉ được đọc ở server và không được commit.

Schema được quản lý trong `supabase/migrations/`. Để chạy Supabase local bằng Docker-compatible runtime:

```bash
pnpm supabase:start
pnpm supabase:reset
```

Local Supabase dành cho phát triển; không được expose trực tiếp ra Internet.

## Cấu hình AI provider

```env
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.your-provider.example/v1
AI_API_KEY=replace_me
AI_MODEL=replace_me
```

`AI_BASE_URL` phải cung cấp endpoint tương thích `POST /chat/completions`. Key chỉ được gửi từ server qua `OpenAICompatibleProvider`; frontend không gọi provider trực tiếp.

## Kiểm tra

```bash
pnpm check
pnpm build
```

## Chạy bằng Docker Compose

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3000/api/health
```

Xem log bằng `docker compose logs -f app`. Dừng hệ thống bằng `docker compose down`; không thêm `-v` khi chưa chủ động xóa dữ liệu của các service được bổ sung sau này.

Compose hiện đóng gói ứng dụng. Cơ sở dữ liệu chính chạy trên Supabase Cloud; Supabase CLI cung cấp stack local chính thức khi cần phát triển hoặc demo offline.

## Cấu trúc foundation

```text
src/app/                 Next.js UI và route handlers
src/lib/ai/              AI provider port và OpenAI-compatible adapter
src/lib/env/             Kiểm tra biến môi trường server
src/lib/supabase/        Supabase server client
supabase/migrations/     Schema có version
supabase/seed.sql        Dữ liệu demo tái lập
```

## Giấy phép

Code do đội OneVoice viết được phát hành theo [Apache License 2.0](LICENSE). Dependency, dataset, model và media giữ giấy phép riêng và phải được kiểm kê trước khi phát hành.
