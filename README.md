# OneVoice

OneVoice là hệ thống marketing và bán hàng đa kênh có AI cho doanh nghiệp. **Sự thật hiện tại:** bản này chỉ có bàn sản xuất video local 12 giây — chọn một sản phẩm từ bản chụp catalog công khai, tạo nội dung qua AI và dựng video MP4 dọc bằng FFmpeg. **Blueprint toàn dự án** (`docs/development/onevoice-project-blueprint.md`) mô tả vòng vận hành đầy đủ Dữ liệu → Cơ hội → Chiến dịch → Nội dung → Hội thoại → Đơn hàng, nhưng đó là **mục tiêu P0–P3, chưa phải thứ bản này làm được** — đừng đọc README này như lời hứa full-loop.

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

### 1. Chuẩn bị

```bash
node --version   # >= 24
pnpm --version   # 11.24.0
ffmpeg -version  # >= 7
ffprobe -version # >= 7

cp .env.example .env   # rồi điền Supabase + AI provider, xem hai mục cấu hình bên dưới
pnpm install --frozen-lockfile
```

### 2. Kiểm tra kết nối thật (khuyến nghị chạy trước)

```bash
pnpm data:verify   # Supabase: phải in "ALL VERIFICATION CHECKS PASSED" (4109 sản phẩm / 1455 content-ready)
pnpm ai:verify     # AI provider: phải in "AI PROVIDER VERIFICATION PASSED" (HTTP 200, output khác rỗng)
```

Nếu một trong hai lệnh này fail thì luồng tạo video cũng sẽ fail — sửa `.env` trước khi chạy tiếp.

### 3. Khởi động ứng dụng

```bash
pnpm dev
```

Mở <http://localhost:3000> ("Bàn sản xuất video") và làm theo ba bước trong giao diện:

1. **Cột 01 – Sản phẩm:** danh sách laptop lấy từ Supabase (`GET /api/products`). Bấm chọn một sản phẩm.
2. **Cột 02 – Kịch bản:** bấm **Tạo video 12 giây**. Các nhãn trạng thái thật sẽ chạy lần lượt: *Đang tải bản chụp sản phẩm → Đang tạo nội dung → Đang xử lý ảnh sản phẩm → Đang dựng video → Đang lưu thành phẩm* (thường 20–40 giây, tùy độ trễ của model AI). Xong sẽ hiện `hook` / `caption` / `cta` do AI viết.
3. **Cột 03 – Thành phẩm:** video phát ngay trong trang; bấm **Tải video** để lưu MP4.

Liveness endpoint: <http://localhost:3000/api/health> (không gọi dịch vụ ngoài).

### 4. Kiểm tra artifact

Mỗi lần dựng ghi vào `renders/<uuid>/video.mp4` và `renders/<uuid>/manifest.json` (thư mục `renders/` được git-ignore). Xác minh một video:

```bash
pnpm video:verify -- renders/<uuid>/video.mp4
```

Phải in `RENDERED VIDEO VERIFICATION PASSED` với: MP4 / H.264 / yuv420p / 1080×1920 / thời lượng **11.5–12.5 giây** (gate legacy mặc định cho bàn local 12s). Verifier đọc `FFPROBE_PATH` từ `.env`, chỉ nhận regular file local không rỗng (không theo symlink hoặc URL/protocol) và chỉ chấp nhận MP4 có major brand `isom`, `iso2`, `mp41`, `mp42` hoặc `avc1`. Với video dựng bằng template renderer ở thời lượng khác, dùng mode template khớp gate của renderer (sai lệch cho phép mặc định ±250 ms, tự đọc `artifact.durationMs` từ `manifest.json` anh em nếu không truyền mốc):

```bash
pnpm video:verify -- renders/<uuid>/video.mp4 --template
pnpm video:verify -- renders/<uuid>/video.mp4 --template --duration-ms 12000 --tolerance 250
```

### Xử lý sự cố nhanh

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `pnpm ai:verify` báo HTTP 404 | `AI_BASE_URL` sai đường dẫn | Dùng `https://opencode.ai/zen/v1` **hoặc** `.../v1/responses` — adapter tự thêm `/responses` nếu thiếu, không nhân đôi. |
| Tạo video fail ở bước "Đang tạo nội dung", thử lại lúc được lúc không | Model contributor-free suy luận lâu (15–35 giây) | Đây là bình thường; call nội dung có timeout 120 giây. Nếu vẫn fail liên tục, kiểm tra `pnpm ai:verify`. |
| Video ra chỉ có chữ, không có ảnh sản phẩm | Ảnh remote lỗi status/type/byte/decode, hoặc host không nằm trong `ONEVOICE_IMAGE_HOSTS` | Có chủ đích: pipeline fallback sang video chỉ có chữ thay vì fail. Thêm host vào `ONEVOICE_IMAGE_HOSTS` nếu cần. |
| `FFmpeg`/`ffprobe` not found | Chưa cài hoặc không trong `PATH` | Cài FFmpeg 7+, hoặc đặt `FFMPEG_PATH` / `FFPROBE_PATH` tuyệt đối trong `.env`. |
| Cột "Sản phẩm" trống hoặc lỗi | `pnpm data:verify` fail | Sửa `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY`. |

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

Render hiện chạy đồng bộ trong web process và chỉ phù hợp cho phát triển/demo local, không expose trực tiếp ra Internet. Call tạo nội dung AI có timeout 120 giây (mặc định provider là 30 giây), tải/chuẩn hóa ảnh 10 giây và FFmpeg 45 giây. Status/type/byte/decode không hợp lệ từ ảnh remote có thể chuyển sang video chỉ có chữ. Lỗi local về temporary directory/filesystem/tool capability, timeout, signal hoặc giới hạn stderr dừng luồng an toàn với `IMAGE_RESOLUTION_FAILED`; chúng không bị che bằng fallback. Khi chuyển sang production, tác vụ render phải được đưa sang durable queue/worker thay vì giữ request web mở.

Phạm vi nói rõ: bản này **không** có Opportunity Engine, phê duyệt/xuất bản, hội thoại, tư vấn, đơn nháp/đơn hàng hay đo lường attribution — các mục P0–P3 trong blueprint vẫn là kế hoạch, chưa phải tính năng. Mọi con số catalog (4109 sản phẩm / 1455 content-ready) đều thuộc bản chụp ngày 31/08/2026, không phải tồn kho hiện tại.

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
