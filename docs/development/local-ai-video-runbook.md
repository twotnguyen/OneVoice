# Runbook video AI cục bộ

Runbook này mô tả đúng bản proof hiện tại: web app gọi Supabase Cloud và một AI provider tương thích OpenAI, sau đó dựng và lưu MP4 trên cùng máy chạy web process. Đây là luồng **local-only**, không phải kiến trúc production.

## 1. Điều kiện chạy

- Node.js 24 trở lên.
- pnpm 11.24.0.
- FFmpeg và ffprobe có H.264 encoder.
- Supabase project chứa dataset OneVoice.
- AI provider có Responses API theo cấu hình hiện tại.

Kiểm tra binary native:

```bash
node --version
pnpm --version
ffmpeg -version
ffprobe -version
```

Nếu `ffmpeg` hoặc `ffprobe` không nằm trên `PATH`, đặt đường dẫn executable trong `FFMPEG_PATH` và `FFPROBE_PATH`. Lệnh `pnpm video:verify` tự tải `.env` nếu file tồn tại.

## 2. Cấu hình `.env`

Tạo file local và không commit:

```bash
cp .env.example .env
```

Các biến ứng dụng đọc:

```env
# Supabase; publishable key có thể xuất hiện ở client, secret key chỉ ở server.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_SECRET_KEY=sb_secret_replace_me

# AI; toàn bộ nhóm này chỉ ở server.
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://opencode.ai/zen/v1
AI_API_KEY=replace_me
AI_MODEL=muse-spark-1.3-contributor-free

# Scope và media; toàn bộ nhóm này chỉ ở server.
ONEVOICE_ORGANIZATION_ID=a0000000-0000-0000-0000-000000000001
ONEVOICE_MEDIA_ROOT=renders
ONEVOICE_IMAGE_HOSTS=product.hstatic.net
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
ONEVOICE_FONT_PATH=
```

`ONEVOICE_IMAGE_HOSTS` là danh sách hostname HTTPS cho phép, phân tách bằng dấu phẩy. Đường dẫn media/font/executable tương đối được resolve từ thư mục repository. Không đặt prefix `NEXT_PUBLIC_` cho secret, scope, đường dẫn media hoặc cấu hình FFmpeg.

## 3. Chạy native và kiểm tra dịch vụ thật

```bash
pnpm install --frozen-lockfile
pnpm data:verify
pnpm ai:verify
pnpm dev
```

Kết quả chuẩn của `data:verify` gồm 4.109 sản phẩm và 1.455 sản phẩm content-ready. `ai:verify` phải trả output không rỗng. Đây là kiểm tra kết nối thật, không phải fixture.

Dataset được ghi nhãn là **bản chụp catalog công khai ngày 31/08/2026**. Giá, số lượng và promotion trong snapshot không phải dữ liệu vận hành hiện tại, tồn kho nội bộ hay bằng chứng hợp tác với cửa hàng.

Mở <http://localhost:3000> và thực hiện:

1. Chọn một sản phẩm trong danh sách.
2. Bấm **Tạo video 12 giây** và quan sát các trạng thái tạo nội dung, xử lý ảnh, dựng và lưu.
3. Khi thành công, phát video bằng player hoặc bấm **Tải video**.
4. Lấy UUID render từ URL video hoặc thư mục artifact và chạy:

```bash
pnpm video:verify -- renders/<uuid>/video.mp4
```

Verifier chỉ thành công khi artifact là MP4 có major brand trong allow-list `isom`, `iso2`, `mp41`, `mp42`, `avc1`, video H.264, `yuv420p`, 1080×1920 và duration dương; QuickTime MOV, 3GP và ISO-BMFF khác bị từ chối. Input được resolve thành absolute local path trước khi gọi ffprobe và phải là regular file đọc được, không rỗng; URL/protocol và symlink bị từ chối. Verifier giới hạn output, dừng ffprobe sau 10 giây, và chỉ in metadata hoặc mã lỗi an toàn, không in path, nội dung file hay stderr của ffprobe. Mỗi render nằm tại:

```text
renders/<uuid>/video.mp4
renders/<uuid>/manifest.json
```

Các URL ứng dụng dùng để preview và download là:

```text
/api/renders/<uuid>/video
/api/renders/<uuid>/download
```

## 4. Chạy bằng Docker Compose

```bash
docker compose build
docker compose up -d
docker compose ps
curl --fail http://localhost:3000/api/health
docker compose exec app ffmpeg -version
docker compose exec app ffprobe -version
```

Compose chỉ khởi động web app và bind `127.0.0.1:3000`. Image runtime cài gói Alpine `ffmpeg` cùng font DejaVu mà renderer dùng, chạy bằng user `nextjs` không phải root, đặt `ONEVOICE_MEDIA_ROOT=/app/renders` và mount named volume `onevoice-renders` vào đó. Compose cũng cố định `FFMPEG_PATH=ffmpeg`, `FFPROBE_PATH=ffprobe` và `ONEVOICE_FONT_PATH=/usr/share/fonts/dejavu/DejaVuSans.ttf`; các đường dẫn native trong `.env` không thể ghi đè ba giá trị container này. Supabase vẫn là dịch vụ ngoài; bản này không tạo database, queue hoặc worker container.

Cấu hình này không có authentication boundary cho render endpoints. Nếu cần truy cập từ máy khác, phải thiết kế và kiểm thử authentication, TLS termination, network policy/rate limiting riêng trước khi đổi loopback bind; không publish trực tiếp cấu hình local-only ra LAN hoặc Internet.

`docker compose down` xóa container nhưng giữ artifact trong named volume. Chỉ chạy lệnh sau khi chủ động muốn xóa media:

```bash
docker compose down -v
```

Có thể xem dung lượng và mount point bằng `docker volume inspect onevoice_onevoice-renders` (tên thực tế có thể đổi theo Compose project name).

## 5. Timeout, fallback và giới hạn

- AI generation có timeout 30 giây.
- Tải hoặc chuẩn hóa ảnh có timeout 10 giây và chỉ chấp nhận host/type/kích thước đã giới hạn.
- FFmpeg render có timeout 45 giây.
- Remote image bị từ chối do HTTP status, redirect/host, content type, giới hạn byte, signature/codec/dimension hoặc decode nonzero có thể trả về fallback video chỉ có chữ; nội dung sản phẩm vẫn đến từ snapshot đã chọn.
- Lỗi local về temporary directory/filesystem, tool capability, timeout, process signal, giới hạn stderr/output hoặc cleanup không fallback. Pipeline dừng an toàn với `IMAGE_RESOLUTION_FAILED` để cấu hình vận hành không bị che khuất.
- Render chạy đồng bộ trong web process. Restart có thể làm mất tác vụ đang chạy; không có durable retry, lịch sử job hay phân phối tải.
- Artifact nằm trên filesystem local/named volume, không phải object storage và không phù hợp để chia sẻ giữa nhiều web replica.

Trước khi public/production, chuyển orchestration sang durable queue và worker riêng, lưu trạng thái job bền vững, đưa artifact sang object storage, thêm retry/idempotency/cleanup và giữ API web chỉ tạo hoặc đọc trạng thái job.

## 6. Xử lý sự cố

| Hiện tượng | Kiểm tra |
|---|---|
| Catalog không tải | Chạy `pnpm data:verify`; kiểm tra URL, publishable key, secret key và organization UUID. |
| AI không trả nội dung | Chạy `pnpm ai:verify`; kiểm tra base URL, API key, model và timeout 30 giây. |
| Luôn dùng video chỉ có chữ | Kiểm tra `ONEVOICE_IMAGE_HOSTS`, HTTPS URL, DNS và log mã lỗi ảnh an toàn. |
| Render thất bại | Chạy `ffmpeg -version`, `ffprobe -version`; kiểm tra quyền ghi `ONEVOICE_MEDIA_ROOT` và font path. |
| `FILE_UNREADABLE` | Input là URL/protocol, symlink, không phải regular file local đọc được, rỗng hoặc không tồn tại. |
| `PROFILE_MISMATCH` | Artifact không đúng MP4 brand/H.264/`yuv420p`/1080×1920/duration, là MOV/3GP hoặc ffprobe từ chối media. |
| `FFPROBE_UNAVAILABLE` | Kiểm tra `FFPROBE_PATH` và quyền chạy executable. |
| `FFPROBE_TIMEOUT` | ffprobe vượt deadline 10 giây và đã bị terminate/reap. |
| `FFPROBE_OUTPUT_LIMIT` / `FFPROBE_PARSE_FAILED` | ffprobe trả output quá giới hạn hoặc JSON sai; verifier không in raw output. |
| Container không ghi được media | Chạy `docker compose config`, kiểm tra volume mount và quyền của `/app/renders` bằng user `nextjs`. |

## 7. Bằng chứng kiểm thử và giấy phép FFmpeg

Chạy gate tự động:

```bash
pnpm test src/lib/video/verify-rendered-video-script.test.ts
pnpm check
pnpm build
docker compose config
git diff --check
```

Máy proof local đã dùng Homebrew FFmpeg 7.1.1 và `ffmpeg -version` cho thấy build có `--enable-gpl`. Điều này chỉ chứng minh luồng chạy local; nó **không phải quyết định cấp phép binary cho bản phát hành công khai**. Trước khi phân phối image/binary, đội phải lưu `ffmpeg -version`, `ffmpeg -buildconf`, package inventory/SBOM và review GPL/LGPL cùng codec thực tế của chính artifact phát hành.
