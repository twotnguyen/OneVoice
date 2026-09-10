# OneVoice

OneVoice là hệ thống marketing và bán hàng đa kênh có AI cho doanh nghiệp. Bản hiện tại có bàn sản xuất cục bộ: chọn một sản phẩm từ bản chụp catalog công khai, tạo nội dung qua AI và dựng video MP4 dọc 12 giây bằng FFmpeg.

## Yêu cầu

- Node.js 24 trở lên
- pnpm 11.24.0
- FFmpeg và ffprobe (có trong cùng gói FFmpeg)
- Docker với Compose nếu chạy container
- Một Supabase project và một AI provider tương thích OpenAI để chạy luồng thật

Kiểm tra công cụ native trước khi cài dependency:

```bash
node --version
pnpm --version
ffmpeg -version
ffprobe -version
```

## Chạy local

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

Mở <http://localhost:3000>. Chọn sản phẩm, bấm **Tạo video 12 giây**, chờ video xuất hiện rồi phát hoặc tải MP4 trong giao diện. Liveness endpoint ở <http://localhost:3000/api/health> và không gọi dịch vụ ngoài.

Artifact được ghi vào `renders/<uuid>/video.mp4` và `renders/<uuid>/manifest.json`. Kiểm tra video đã tạo:

```bash
pnpm video:verify -- renders/<uuid>/video.mp4
```

Verifier tải `FFPROBE_PATH` từ `.env`, chỉ đọc regular file local không rỗng (không theo symlink hoặc URL/protocol), và chỉ chấp nhận MP4 có major brand `isom`, `iso2`, `mp41`, `mp42` hoặc `avc1`.

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
AI_BASE_URL=https://opencode.ai/zen/v1
AI_API_KEY=replace_me
AI_MODEL=muse-spark-1.3-contributor-free
```

`AI_BASE_URL` phải cung cấp endpoint tương thích `POST /responses`. Key chỉ được gửi từ server qua `OpenAICompatibleProvider`; frontend không gọi provider trực tiếp.

Luồng video còn dùng các biến server-only sau:

```env
ONEVOICE_ORGANIZATION_ID=a0000000-0000-0000-0000-000000000001
ONEVOICE_MEDIA_ROOT=renders
ONEVOICE_IMAGE_HOSTS=product.hstatic.net
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
ONEVOICE_FONT_PATH=
```

Không đưa `SUPABASE_SECRET_KEY`, `AI_API_KEY` hoặc các biến runtime này vào mã client. Xem cấu hình, giới hạn và xử lý sự cố đầy đủ tại [runbook video local](docs/development/local-ai-video-runbook.md).

## Kiểm tra

```bash
pnpm check
pnpm build
pnpm data:verify
pnpm ai:verify
```

Hai lệnh cuối kết nối thật đến Supabase và AI provider đã cấu hình. Dataset là **bản chụp catalog công khai ngày 31/08/2026**, không phải tồn kho hiện tại hoặc dữ liệu của đối tác.

## Chạy bằng Docker Compose

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3000/api/health
docker compose exec app ffmpeg -version
docker compose exec app ffprobe -version
```

Image runtime cài FFmpeg, chạy ứng dụng bằng user không phải root và ghi media vào `/app/renders`. Compose cố định executable container-native `ffmpeg`/`ffprobe` và font `/usr/share/fonts/dejavu/DejaVuSans.ttf`, nên đường dẫn native trong `.env` không ghi đè cấu hình container. Named volume `onevoice-renders` giữ video khi container được tạo lại. Xem log bằng `docker compose logs -f app`; `docker compose down` giữ volume, còn `docker compose down -v` xóa vĩnh viễn các artifact trong volume.

Compose chỉ chạy web app, bind mặc định tại `127.0.0.1:3000`; không thêm database, queue hay worker. Cơ sở dữ liệu chính chạy trên Supabase Cloud. Muốn cho máy khác truy cập phải thiết kế riêng authentication, TLS và network policy trước khi đổi bind address; không expose cấu hình local này trực tiếp.

## Giới hạn bản local

Render hiện chạy đồng bộ trong web process và chỉ phù hợp cho phát triển/demo local, không expose trực tiếp ra Internet. AI có timeout 30 giây, tải/chuẩn hóa ảnh 10 giây và FFmpeg 45 giây. Status/type/byte/decode không hợp lệ từ ảnh remote có thể chuyển sang video chỉ có chữ. Lỗi local về temporary directory/filesystem/tool capability, timeout, signal hoặc giới hạn stderr dừng luồng an toàn với `IMAGE_RESOLUTION_FAILED`; chúng không bị che bằng fallback. Khi chuyển sang production, tác vụ render phải được đưa sang durable queue/worker thay vì giữ request web mở.

## Cấu trúc foundation

```text
src/app/                 Next.js UI và route handlers
src/lib/ai/              AI provider port và OpenAI-compatible adapter
src/lib/render/          Orchestration cho luồng tạo video
src/lib/env/             Kiểm tra biến môi trường server
src/lib/supabase/        Supabase server client
src/lib/video/           Storyboard, ảnh, FFmpeg và lưu artifact local
supabase/migrations/     Schema có version
supabase/seed.sql        Dữ liệu demo tái lập
```

## Giấy phép

Code do đội OneVoice viết được phát hành theo [Apache License 2.0](LICENSE). Dependency, dataset, model và media giữ giấy phép riêng và phải được kiểm kê trước khi phát hành. FFmpeg 7.1.1 dùng cho proof local qua Homebrew được build với `--enable-gpl`; bằng chứng local đó không phải quyết định cấp phép binary cho bản phát hành công khai. Phải audit build flags và codec của image phát hành riêng.
