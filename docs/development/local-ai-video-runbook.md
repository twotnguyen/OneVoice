# Runbook video AI cục bộ & Kiến trúc Pipeline Đa Tiến Trình

Tài liệu này mô tả chi tiết kiến trúc vận hành của hệ thống sản xuất video AI OneVoice: giao diện web Next.js (BFF đóng vai trò enqueue-only), hàng đợi tệp bất đồng bộ (`FileJobQueue`), tiến trình nền (`worker`), dịch vụ tổng hợp giọng nói VieNeu-TTS (`tts` sidecar), và engine dựng video hoạt họa template (HyperFrames & FFmpeg).

> **Sự thật hiện tại vs blueprint:** Hệ thống hiện tại sở hữu **bàn sản xuất video tự động 15–25 giây** dựa trên template đồ họa chuyên nghiệp (kèm legacy fallback 12 giây bằng FFmpeg đơn thuần). Quy trình: chọn sản phẩm từ catalog → AI tạo kịch bản → VieNeu-TTS tổng hợp giọng đọc → HyperFrames render canvas frame → FFmpeg hòa trộn âm thanh/video → lưu trữ artifact cục bộ và ghi nhận sổ cái `render_events`. Blueprint toàn dự án (`docs/development/onevoice-project-blueprint.md`) mô tả vòng vận hành đầy đủ Dữ liệu → Cơ hội → Chiến dịch → Nội dung → Hội thoại → Đơn hàng; các vòng tiếp theo thuộc phạm vi P1–P3.

---

## 1. Điều kiện chạy

- **Node.js:** phiên bản 24 trở lên (khuyến nghị `24.13.0`+).
- **pnpm:** `11.24.0`.
- **FFmpeg & ffprobe:** phiên bản 7.x trở lên, hỗ trợ encoder `libx264` và bộ lọc `lavfi`.
- **Chromium:** trình duyệt headless phục vụ HyperFrames render HTML canvas sang video.
- **Python:** phiên bản 3.10+ (nếu chạy trực tiếp native TTS sidecar) hoặc Docker Engine hỗ trợ Docker Compose v2.
- **Supabase project:** chứa cơ sở dữ liệu OneVoice và bảng sổ cái `render_events`.
- **AI provider:** hỗ trợ OpenAI Responses API tương thích (ví dụ OpenCode Zen).

Kiểm tra binary native:

```bash
node --version
pnpm --version
ffmpeg -version
ffprobe -version
```

Nếu `ffmpeg` hoặc `ffprobe` không nằm trên `PATH`, đặt đường dẫn executable trong `FFMPEG_PATH` và `FFPROBE_PATH`.

---

## 2. Cấu hình biến môi trường (`.env`)

Tạo file local từ template chuẩn:

```bash
cp .env.example .env
```

Toàn bộ các biến môi trường được định nghĩa và kiểm tra nghiêm ngặt qua Zod schema tại `src/lib/env/server.ts`:

```env
# ==========================================
# 1. Supabase (Database & Catalog)
# ==========================================
# Publishable key dùng cho client, secret key chỉ dùng ở server-side.
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_replace_me
SUPABASE_SECRET_KEY=sb_secret_replace_me

# ==========================================
# 2. AI Provider (LLM Script & Content Generation)
# ==========================================
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://opencode.ai/zen/v1
AI_API_KEY=your_opencode_zen_api_key_here
AI_MODEL=muse-spark-1.3-contributor-free

# ==========================================
# 3. Scope & Đường dẫn Media Cục bộ
# ==========================================
ONEVOICE_ORGANIZATION_ID=a0000000-0000-0000-0000-000000000001
ONEVOICE_MEDIA_ROOT=renders
ONEVOICE_IMAGE_HOSTS=product.hstatic.net
FFMPEG_PATH=ffmpeg
FFPROBE_PATH=ffprobe
ONEVOICE_FONT_PATH=

# ==========================================
# 4. Engine Template Video & HyperFrames
# ==========================================
# Renderer: "template" (mặc định 15–25s) hoặc "ffmpeg" (legacy 12s)
ONEVOICE_RENDERER=template
ONEVOICE_HYPERFRAMES_PATH=hyperframes
ONEVOICE_TEMPLATES_ROOT=src/lib/video/template-pipeline/templates
ONEVOICE_AUDIO_ROOT=assets/audio
ONEVOICE_MUSIC_GAIN=0.35

# ==========================================
# 5. VieNeu-TTS Voice Synthesis Sidecar
# ==========================================
ONEVOICE_TTS_ENDPOINT=http://localhost:8123
ONEVOICE_TTS_TIMEOUT_MS=60000

# ==========================================
# 6. Kịch bản Video AI (Script Options)
# ==========================================
# Tùy chọn model riêng cho kịch bản (nếu để trống sẽ dùng AI_MODEL)
ONEVOICE_SCRIPT_MODEL=
ONEVOICE_SCRIPT_TIMEOUT_MS=180000

# ==========================================
# 7. Hàng đợi tệp & Render Worker (Async Pipeline)
# ==========================================
# Đường dẫn thư mục hàng đợi (mặc định trỏ về <ONEVOICE_MEDIA_ROOT>/queue)
ONEVOICE_QUEUE_ROOT=
ONEVOICE_WORKER_ID=
ONEVOICE_WORKER_POLL_MS=1000
ONEVOICE_JOB_STALE_MS=600000
```

### Chi tiết các biến môi trường mới

| Biến | Kiểu dữ liệu | Mặc định (Native) | Giá trị trong Container | Mô tả & Lưu ý |
|---|---|---|---|---|
| `ONEVOICE_RENDERER` | Enum (`template` \| `ffmpeg`) | `template` | `template` | Chọn bộ render: `template` sử dụng HyperFrames và kịch bản 3–5 cảnh (15–25s); `ffmpeg` là fallback legacy 12s. |
| `ONEVOICE_HYPERFRAMES_PATH` | String | `hyperframes` | `/usr/local/bin/hyperframes` | Đường dẫn đến binary `hyperframes`. Không bao giờ gọi qua `npx`. |
| `ONEVOICE_TEMPLATES_ROOT` | String | `src/lib/video/template-pipeline/templates` | `/app/templates` | Thư mục chứa 11 mẫu giao diện HTML/CSS template đã nhúng sẵn phông chữ cục bộ. |
| `ONEVOICE_AUDIO_ROOT` | String | `assets/audio` | `/app/assets/audio` | Thư mục chứa nhạc nền (`music/`) và hiệu ứng âm thanh (`sfx/`). |
| `ONEVOICE_MUSIC_GAIN` | Number (0.0–1.0) | `0.35` | `0.35` | Mức âm lượng nhạc nền khi hòa âm cùng giọng đọc thuyết minh (audio ducking). |
| `ONEVOICE_TTS_ENDPOINT` | String URL | `http://localhost:8123` | `http://tts:8123` | Endpoint dịch vụ tổng hợp giọng nói VieNeu-TTS v3 Turbo sidecar. |
| `ONEVOICE_TTS_TIMEOUT_MS` | Number (ms) | `60000` (60s) | `60000` | Thời gian chờ tối đa cho một yêu cầu tổng hợp âm thanh giọng đọc. |
| `ONEVOICE_SCRIPT_MODEL` | String (optional) | _(rỗng - dùng `AI_MODEL`)_ | _(rỗng)_ | Ghi đè tên model AI khi sinh kịch bản cấu trúc (hỗ trợ phân tách model suy luận). |
| `ONEVOICE_SCRIPT_TIMEOUT_MS` | Number (ms) | `180000` (3m) | `180000` | Thời gian chờ tối đa cho bước sinh kịch bản JSON nhiều cảnh qua AI. |
| `ONEVOICE_QUEUE_ROOT` | String Path | `<ONEVOICE_MEDIA_ROOT>/queue` | `/app/renders/queue` | Thư mục hàng đợi công việc. Bắt buộc đối với tiến trình worker độc lập. |
| `ONEVOICE_WORKER_ID` | String (optional) | _(tự sinh UUID)_ | _(tự sinh UUID)_ | Định danh duy nhất của tiến trình worker để ghi vết tranh chấp (race winner). |
| `ONEVOICE_WORKER_POLL_MS` | Number (ms) | `1000` (1s) | `1000` | Tần suất worker kiểm tra các tệp công việc mới trong `queue/queued/`. |
| `ONEVOICE_JOB_STALE_MS` | Number (ms) | `600000` (10m) | `600000` | Ngưỡng thời gian xác định tác vụ bị treo/chết để worker tự động thu hồi (recoverStale). |

*Lưu ý bảo mật:* Tuyệt đối không thêm tiền tố `NEXT_PUBLIC_` cho bất kỳ biến nào ngoài `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

---

## 3. Chạy native và kiểm tra dịch vụ thật

### 3.1. Chuẩn bị và kiểm tra kết nối

```bash
pnpm install --frozen-lockfile
pnpm data:verify   # Supabase: kiểm tra 4.109 sản phẩm và 1.455 content-ready
pnpm ai:verify     # AI provider: kiểm tra phản hồi HTTP 200 từ Responses API
```

### 3.2. Khởi chạy tiến trình nền (Worker) và Web App

Hệ thống yêu cầu cả web BFF và render worker cùng hoạt động.

**Terminal 1 — Đóng gói và chạy Render Worker:**
```bash
pnpm build:worker
node dist/worker.js
```
Worker sẽ khởi chạy, tự động tạo cấu trúc thư mục `renders/queue/`, chạy kiểm tra thu hồi tác vụ dở dang (`recoverStale`) và lắng nghe công việc mới.

**Terminal 2 — Khởi chạy Web Server:**
```bash
pnpm dev
```
Truy cập <http://localhost:3000> ("Bàn sản xuất video"):
1. **Cột 01 – Sản phẩm:** Chọn một laptop trong danh sách.
2. **Cột 02 – Kịch bản:** Bấm **Tạo video** (thời lượng chuẩn **15–25 giây**). Web app sẽ gửi `POST /api/renders`, nhận mã `202 Accepted`, và tự động chuyển sang chế độ thăm dò trạng thái mỗi 2000ms.
3. **Cột 03 – Thành phẩm:** Khi worker xử lý xong, giao diện sẽ tự động tải video và hiển thị player xem thử cùng nút **Tải video**.

### 3.3. Xác minh artifact thành phẩm

Mỗi lần dựng lưu trữ thành phẩm tại `renders/<uuid>/video.mp4` và `renders/<uuid>/manifest.json`. Sử dụng công cụ `video:verify` để kiểm định chất lượng:

```bash
# Kiểm tra video dựng bằng template engine (15–25 giây):
pnpm video:verify -- renders/<uuid>/video.mp4 --template

# Kiểm tra với mốc thời lượng và dung sai tùy biến:
pnpm video:verify -- renders/<uuid>/video.mp4 --template --duration-ms 18000 --tolerance 250
```

Verifier kiểm tra nghiêm ngặt:
- Định dạng container: MP4 có major brand trong nhóm allowlist `isom`, `iso2`, `mp41`, `mp42`, `avc1`.
- Codec video: H.264 (`avc1`), pixel format `yuv420p`, độ phân giải dọc 1080×1920.
- Thời lượng: Sai lệch tối đa ±250 ms so với `artifact.durationMs` ghi trong `manifest.json`.

---

## 4. Chạy bằng Docker Compose (Multi-Service Architecture)

Kiến trúc triển khai container chuẩn hóa gồm 3 dịch vụ chuyên biệt:

```text
[Trình duyệt Client]
        │
        ▼ HTTP (Port 3000)
┌──────────────────────────────────────┐
│  Service: app (Next.js Web / BFF)   │ ── Enqueue job ──┐
│  - Enqueue-only (POST -> 202 Queued) │                  │
│  - Polling status / Media streamer   │                  │
└──────────────────────────────────────┘                  │
                                                          ▼
┌──────────────────────────────────────┐        ┌───────────────────────┐
│  Service: worker (dist/worker.js)    │ ◄───── │ Volume:               │
│  - Claim job via atomic rename       │        │   onevoice-renders    │
│  - Script -> HyperFrames -> FFmpeg   │ ────── │  - queue/             │
│  - shm_size: 1gb, grace_period: 300s │        │  - <renderId>/        │
└──────────────────────────────────────┘        └───────────────────────┘
        │
        ▼ HTTP (Internal port 8123)
┌──────────────────────────────────────┐        ┌───────────────────────┐
│  Service: tts (VieNeu-TTS Sidecar)   │ ◄───── │ Volume:               │
│  - Profile: tts, v3turbo model       │        │   onevoice-tts-models │
│  - HF_HUB_OFFLINE=1 (Zero Internet)  │        │  - /models (Weights)  │
└──────────────────────────────────────┘        └───────────────────────┘
```

### 4.1. Đặc tả các dịch vụ

1. **`app`:** Web frontend và API route handler. Không thực hiện tác vụ nặng, chỉ đẩy job vào `queue/queued/` và trả về 202. Đọc file `manifest.json` và `video.mp4` qua volume để stream cho client.
2. **`worker`:** Render worker chạy image Alpine cài sẵn Chromium, FFmpeg và HyperFrames CLI.
   - `shm_size: 1gb`: Thiết lập bộ nhớ chia sẻ `/dev/shm` đủ lớn cho Chromium headless render canvas phức tạp mà không bị sập (crash).
   - `stop_grace_period: 300s`: Khi nhận `SIGTERM`, worker không bị tắt đột ngột mà được chờ tối đa 5 phút để hoàn tất nốt render job hiện tại.
3. **`tts`:** Sidecar tổng hợp giọng nói tiếng Việt dựa trên VieNeu-TTS v3 Turbo. Nằm sau profile `tts`. Khi chạy production/offline, service hoạt động hoàn toàn độc lập với cờ `HF_HUB_OFFLINE=1`.

### 4.2. Khởi chạy toàn bộ hệ thống

```bash
# 1. Xây dựng các Docker images
docker compose build

# 2. Nạp trước trọng số mô hình TTS (chạy một lần duy nhất, cần Internet)
docker compose --profile tts run --rm tts python provision.py

# 3. Khởi động toàn bộ stack ngầm (app, worker, tts)
docker compose --profile tts up -d

# 4. Kiểm tra trạng thái các container
docker compose ps

# 5. Kiểm tra tính sẵn sàng của web BFF
curl --fail http://localhost:3000/api/health
```

### 4.3. Quản lý Volumes và Dữ liệu

- **`onevoice-renders`:** Lưu trữ hàng đợi `queue/` và video đã dựng tại `/app/renders`. Dữ liệu được bảo toàn qua các lần `docker compose down`.
- **`onevoice-tts-models`:** Lưu trữ vĩnh viễn trọng số mô hình TTS tại `/models`.
- Khi cần dọn dẹp sạch toàn bộ media và cache mô hình để làm lại từ đầu:
  ```bash
  docker compose --profile tts down -v
  ```

---

## 5. Quy trình Dựng Video Đa Tiến Trình (Asynchronous Render Pipeline)

Quy trình sản xuất video từ lúc người dùng thao tác đến khi phát thành phẩm diễn ra qua 9 giai đoạn tách biệt, đảm bảo tính bền vững và khả năng phục hồi:

```text
[Client UI] ── 1. POST /api/renders ──► [Web App BFF]
     ▲                                         │
     │ (Poll 2000ms)                           │ 2. Atomic Enqueue
     │                                         ▼
     │                                ┌─────────────────┐
     │                                │  queue/queued/  │
     │                                └─────────────────┘
     │                                         │
     │                                         │ 3. Atomic Rename (claim)
     │                                         ▼
     │                                ┌─────────────────┐
     │                                │ queue/running/  │
     │                                └─────────────────┘
     │                                         │
     │                                         │ 4. Worker Pipeline
     │                                         ├─► Catalog Snapshot
     │                                         ├─► AI Script Generation
     │                                         ├─► Truth Guard Check
     │                                         ├─► TTS Audio Synthesis
     │                                         ├─► HyperFrames Composition
     │                                         └─► FFmpeg Audio/Video Mux
     │                                         │
     │                                         ▼ 5. Complete & Save
     │                                ┌─────────────────┐
     │ ◄────── 7. Stream MP4 ──────── │ renders/<uuid>/ │
     │                                └─────────────────┘
     │                                         │
     │                                         │ 6. Upsert Ledger
     │                                         ▼
     └────── Status / Progress ◄─────── [render_events] (Supabase)
```

### 5.1. Chi tiết 9 bước xử lý

1. **Client POST (`POST /api/renders`):**
   Client gửi payload `{ productId, renderId }` (với `renderId` là UUIDv4 do client khởi tạo).
   - **Khóa trùng lặp đồng bộ (`RenderGate`):** Từ chối ngay lập tức các request trùng `renderId` đang đến cùng lúc với mã `409 RENDER_ID_IN_USE`.
   - **Khóa phát lại (`Replay Guard`):** Kiểm tra thư viện media (`LocalVideoLibrary`), nếu `renderId` đã có thành phẩm từ trước, trả về ngay `409 RENDER_ID_IN_USE`.
   - **Ghi hàng đợi:** Đẩy tệp công việc vào `queue/queued/<renderId>.json` thông qua temp-file + fsync + atomic rename.
   - **Phản hồi:** Trả về HTTP `202 Accepted` kèm cấu trúc:
     ```json
     {
       "renderId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
       "status": "queued",
       "urls": {
         "status": "/api/renders/7c9e6679-7425-40de-944b-e07fc1f90ae7",
         "video": "/api/renders/7c9e6679-7425-40de-944b-e07fc1f90ae7/video",
         "download": "/api/renders/7c9e6679-7425-40de-944b-e07fc1f90ae7/download"
       }
     }
     ```

2. **Worker Claim (Chiếm quyền xử lý):**
   Worker chạy vòng lặp vô tận, kiểm tra thư mục `queue/queued/` mỗi `ONEVOICE_WORKER_POLL_MS` (1 giây).
   - Khi phát hiện tệp, worker thực hiện `fs.rename("queue/queued/<id>.json", "queue/running/<id>.json")`.
   - Thao tác rename là nguyên tử (atomic) trên cùng một hệ thống tệp. Nếu có nhiều worker cùng tranh chấp, worker nào nhận mã `ENOENT` sẽ tự động bỏ qua và thăm dò tệp khác.

3. **Tạo kịch bản AI & Kiểm định sự thật (Script & Truth Guard):**
   - Lấy thông tin `ProductSnapshot` từ Supabase.
   - Gọi AI model qua `generateVideoScript` với timeout `ONEVOICE_SCRIPT_TIMEOUT_MS` (180s).
   - Xác thực cấu trúc kịch bản theo Zod schema `ProductScriptSchema` (`onevoice.script.v1`): bắt buộc 3–5 cảnh (`hook`, `body`, `outro`), tổng thời lượng trong khoảng 15.000 ms – 25.000 ms (`MIN_TOTAL_MS` – `HARD_CAP_MS`), thời lượng mỗi cảnh phải lớn hơn hoặc bằng thời lượng tự nhiên (`naturalDurationMs`) của template tương ứng.
   - **Truth Guard (`checkScriptAgainstSnapshot`):** Đối chiếu toàn bộ thông số kỹ thuật (CPU, RAM, màn hình, giá) mà AI sinh ra với bản chụp catalog gốc. Nếu phát hiện bịa đặt dữ liệu (hallucination), pipeline lập tức từ chối và ghi nhận lỗi.

4. **Tổng hợp giọng đọc ngoại tuyến (VieNeu-TTS):**
   - Từng đoạn văn bản thuyết minh (`voiceText`) của mỗi cảnh được gửi tới sidecar qua `POST /tts`.
   - Sidecar trả về dòng byte audio MP3 mono 44.1 kHz.
   - Đo thời lượng audio thực tế: nếu audio dài hơn thời lượng cảnh (`scene.durationMs`), dừng ngay với lỗi an toàn `NARRATION_OVERRUNS_SCENE`.
   - Dùng FFmpeg chèn thêm đoạn im lặng (`padAudioToDuration`) để độ dài file âm thanh khớp chính xác 100% với `scene.durationMs`.

5. **Dựng khung hình template (HyperFrames Canvas Composition):**
   - Với mỗi cảnh, HyperFrames gọi Chromium headless biên dịch HTML/CSS template tại `src/lib/video/template-pipeline/templates/<templateId>/`.
   - Điền các biến nội dung (`inputs`), render các chuyển động CSS `@keyframes` thành chuỗi khung hình video.
   - Dùng FFmpeg kéo dài khung hình tĩnh cuối (`fitClipToDuration`) để clip video khớp chính xác với `scene.durationMs`.

6. **Hòa âm và ghép video (FFmpeg Audio & Video Muxing):**
   - Nối toàn bộ video các cảnh thành một luồng video duy nhất (`concatVideos`).
   - Nối toàn bộ audio giọng đọc các cảnh (`concatAudio`).
   - Trộn các hiệu ứng âm thanh SFX (`mixSfxOntoVoice`) theo mốc thời gian `startOffsetSec` và âm lượng `volume`.
   - Trộn nhạc nền (`mixMusicBed`) với độ lớn `ONEVOICE_MUSIC_GAIN=0.35` và fade-out 1.5 giây ở cuối video.
   - Ghép audio tổng hợp vào video track bằng FFmpeg (`muxAudioOntoVideo`), sinh ra file hoàn chỉnh `video.mp4`.

7. **Lưu trữ Manifest & Di chuyển trạng thái:**
   - Ghi file video vào `renders/<renderId>/video.mp4`.
   - Ghi file thông số `renders/<renderId>/manifest.json` (chứa metadata, duration, sha256, fps, timeline).
   - Di chuyển tệp công việc từ `queue/running/<renderId>.json` sang `queue/done/<renderId>.json`.

8. **Ghi nhận sổ cái `render_events`:**
   - Tiến trình ghi một bản ghi vào bảng `render_events` trên Supabase, lưu trữ đầy đủ: thời gian chạy từng stage (`stage_timings`), tổng thời gian (`total_duration_ms`), kích thước video (`video_bytes`), thời lượng thực tế (`video_duration_ms`), số cảnh (`scene_count`), tổng thời gian TTS (`tts_total_ms`), revision của renderer (`renderer_revision`), và mã băm sha256 của kịch bản (`script_sha256`).

9. **Client UI Thăm dò (Polling 2000ms):**
   - Giao diện người dùng tại `src/app/` thiết lập polling thăm dò `GET /api/renders/<renderId>` với chu kỳ chuẩn 2000ms (`STUDIO_POLL_INTERVAL_MS = 2000`, `nextPollDelayMs`).
   - API trả về trạng thái chi tiết: `{ status: "queued" }` → `{ status: "running", stage: "rendering_video" }` → `{ status: "succeeded", videoUrl, manifest }`.
   - Khi hoàn tất, giao diện hiển thị video player, bảng kịch bản hook/caption/cta và nút tải video. Quá trình polling tự ngắt khi gặp trạng thái cuối hoặc quá thời gian timeout 5 phút (`STUDIO_POLL_TOTAL_TIMEOUT_MS = 300000`).

---

### 5.2. Hướng dẫn kiểm tra hàng đợi trên đĩa (`queue/`)

Toàn bộ trạng thái công việc được phản ánh minh bạch trên hệ thống tệp:

```text
renders/queue/
├── queued/     # Chứa các job vừa tạo, đang chờ worker nhận
│   └── <renderId>.json
├── running/    # Chứa job worker đang xử lý (kèm PID và workerId)
│   └── <renderId>.json
└── done/       # Chứa các job đã hoàn tất thành công hoặc đã kết thúc
    └── <renderId>.json
```

**Các lệnh kiểm tra nhanh cho kỹ sư vận hành:**

```bash
# Đếm số lượng job đang chờ xử lý
ls -1 renders/queue/queued | wc -l

# Xem job đang chạy hiện tại
ls -l renders/queue/running

# Đọc thông tin chi tiết một job đang chạy
cat renders/queue/running/<renderId>.json | jq .

# Kiểm tra log của worker khi đang xử lý job
docker compose logs -f --tail=50 worker
```

---

### 5.3. Cơ chế tự phục hồi tác vụ treo (`recoverStale`)

Khi worker bị restart đột ngột, server mất điện, hoặc tiến trình render gặp sự cố nghiêm trọng, job có thể bị kẹt lại trong thư mục `running/`.

Hệ thống xử lý tự động như sau:
1. **Thời điểm chạy:** Hàm `worker.queue.recoverStale(jobStaleMs)` tự động kích hoạt ngay khi worker khởi động (boot time) và lặp lại định kỳ mỗi 60 giây trong suốt vòng lặp worker.
2. **Tiêu chuẩn phát hiện:** Quét toàn bộ tệp trong `queue/running/`:
   - Nếu thời gian sửa đổi gần nhất (`mtime`) của tệp cũ hơn ngưỡng `ONEVOICE_JOB_STALE_MS` (mặc định 600.000 ms / 10 phút).
   - Hoặc nếu tệp JSON bị hỏng (unparseable / corrupt do lỗi đĩa).
3. **Hành động phục hồi:**
   - Đánh dấu tác vụ thất bại với mã `WORKER_LOST`, stage `rendering_video`.
   - Kích hoạt callback `onJobLost` để ghi nhận sự kiện thất bại vào sổ cái `render_events` trên Supabase (giúp dashboard và UI không bị treo vĩnh viễn ở trạng thái "Đang xử lý").
   - Di chuyển nguyên tử tệp công việc từ `queue/running/<id>.json` sang `queue/done/<id>.json`.
   - Không bao giờ làm sập (crash) vòng lặp chính của worker.

---

## 6. Truy vấn kiểm tra tính tất định cho vận hành (Determinism Query)

Một tiêu chuẩn kỹ thuật sống còn của engine dựng video OneVoice là **tính tất định (determinism)**: Cùng một kịch bản đầu vào (`script_sha256`) và cùng một phiên bản engine (`renderer_revision`) thì video MP4 đầu ra phải có nội dung và số byte hoàn toàn trùng khớp, không bị phân kỳ do render font hay lệch khung hình.

Kỹ sư vận hành có thể chạy truy vấn SQL sau trực tiếp trên cơ sở dữ liệu Supabase để phát hiện ngay lập tức các trường hợp bất thường (anomalies):

```sql
SELECT
  script_sha256,
  renderer_revision,
  COUNT(DISTINCT video_bytes) AS byte_variants,
  ARRAY_AGG(render_id) AS render_ids
FROM render_events
WHERE status = 'succeeded'
  AND script_sha256 IS NOT NULL
GROUP BY script_sha256, renderer_revision
HAVING COUNT(DISTINCT video_bytes) > 1;
```

### Cách diễn giải kết quả:

- **Kết quả chuẩn (Hệ thống lành mạnh):** Truy vấn trả về `0 rows`. Điều này chứng minh toàn bộ các video có cùng kịch bản đều sinh ra kích thước byte giống hệt nhau (`byte_variants = 1`).
- **Phát hiện bất thường (`byte_variants > 1`):** Nếu truy vấn trả về kết quả, nghĩa là có từ 2 kích thước video khác nhau được sinh ra từ cùng một kịch bản và renderer revision.
  - **Nguyên nhân tiềm ẩn:** Môi trường Chromium render font chữ khác nhau giữa các máy worker, chênh lệch phiên bản FFmpeg, hoặc có sự xuất hiện của timestamp/random seed không được kiểm soát trong template.
  - **Hành động xử lý:** Lấy danh sách các `render_ids` trong kết quả truy vấn, tải các file `manifest.json` tương ứng để so sánh chi tiết metadata và kiểm tra lại môi trường thực thi của các worker.

---

## 7. Quy trình nạp mô hình ngoại tuyến và Cẩm nang Timeout

### 7.1. Quy trình nạp mô hình ngoại tuyến (Offline Provisioning)

Để đảm bảo hệ thống có thể chạy hoàn toàn độc lập mà không phụ thuộc Internet trong các buổi chấm thi hoặc môi trường mạng nội bộ khép kín:

1. **Bước 1: Build image sidecar:**
   ```bash
   docker compose --profile tts build
   ```
2. **Bước 2: Nạp trước trọng số mô hình (Pre-fetching):**
   Thực hiện khi máy có kết nối Internet để tải trọng số mô hình VieNeu-TTS v3 Turbo từ Hugging Face về volume:
   ```bash
   docker compose --profile tts run --rm tts python provision.py
   ```
   Lệnh này tải model, thực hiện suy luận thử câu mẫu "Xin chào" và lưu cache vào `/models` (volume `onevoice-tts-models`).
3. **Bước 3: Khởi chạy hoàn toàn ngoại tuyến:**
   Sau khi bước 2 hoàn tất, sidecar sẽ chạy runtime với `HF_HUB_OFFLINE=1`. Ngắt Internet máy chủ, hệ thống vẫn dựng video và đọc thuyết minh trơn tru.

### 7.2. Cẩm nang Timeout toàn hệ thống

| Tác vụ / Thành phần | Cấu hình / Tham số | Giá trị | Hành động khi vượt ngưỡng |
|---|---|---|---|
| Sinh kịch bản AI | `ONEVOICE_SCRIPT_TIMEOUT_MS` | 180.000 ms (3 phút) | Hủy request AI, báo lỗi `AI_TIMEOUT`, không xếp hàng render. |
| Tải ảnh sản phẩm | `IMAGE_DOWNLOAD_TIMEOUT_MS` | 10.000 ms (10 giây) | Fallback sang mẫu video typography (chỉ có chữ), không làm hỏng flow. |
| Tổng hợp giọng nói TTS | `ONEVOICE_TTS_TIMEOUT_MS` | 60.000 ms (1 phút) | Đánh dấu lỗi `TTS_TIMEOUT`, dừng tác vụ render an toàn. |
| Dựng khung hình mỗi cảnh | `COMPOSE_TIMEOUT_MS` | 120.000 ms (2 phút) | Hủy tiến trình con HyperFrames, báo lỗi `SCENE_COMPOSE_TIMEOUT`. |
| Thu hồi tác vụ treo | `ONEVOICE_JOB_STALE_MS` | 600.000 ms (10 phút) | `recoverStale` đánh dấu `WORKER_LOST`, chuyển job sang `done/`. |
| Thời gian chờ dừng Worker | `stop_grace_period` (Compose) | 300 giây (5 phút) | Cho phép worker hoàn tất nốt render job hiện tại trước khi gửi `SIGKILL`. |
| Chu kỳ thăm dò Client UI | `STUDIO_POLL_INTERVAL_MS` | 2.000 ms (2 giây) | Gửi request `GET /api/renders/<id>` cập nhật trạng thái giao diện. |
| Tổng thời gian thăm dò UI | `STUDIO_POLL_TOTAL_TIMEOUT_MS` | 300.000 ms (5 phút) | Ngừng polling, thông báo giao diện tác vụ quá thời gian xử lý. |

---

## 8. Xử lý sự cố (Troubleshooting)

| Hiện tượng | Nguyên nhân có thể | Cách kiểm tra & Khắc phục |
|---|---|---|
| UI dừng ở trạng thái "Đang xếp hàng (202 Queued)" | Tiến trình worker chưa chạy hoặc bị sập | Chạy `docker compose ps` hoặc `ps aux \| grep worker`. Đảm bảo worker đang chạy lệnh `node dist/worker.js`. |
| Job nằm mãi trong `queue/running/` | Worker gặp sự cố nặng hoặc hết bộ nhớ | Chạy `docker compose logs worker`. Kiểm tra `recoverStale` sau 10 phút hoặc khởi động lại worker để tự thu hồi. |
| Lỗi `WORKER_LOST` | Worker bị kill đột ngột (OOM hoặc SIGKILL) | Tăng `shm_size` trong Docker Compose (khuyến nghị tối thiểu `1gb` cho Chromium headless). |
| Lỗi `NARRATION_OVERRUNS_SCENE` | Văn bản AI viết quá dài so với thời lượng cảnh | Kiểm tra kịch bản AI; kịch bản chuẩn được kiểm soát bởi `ProductScriptSchema` (14 ký tự/giây). |
| Lỗi `RENDER_ID_IN_USE` (HTTP 409) | Client gửi đúp request với cùng renderId | Bình thường: cơ chế bảo vệ chống duplicate của `RenderGate` và `ReplayGuard`. |
| TTS báo lỗi `MODEL_NOT_READY` (503) | Sidecar đang khởi động và nạp trọng số | Đợi khoảng 30–60 giây cho `start_period` của container hoàn tất; kiểm tra qua `curl http://localhost:8123/health`. |
| Video ra chỉ có chữ, không có ảnh | Host ảnh không nằm trong allowlist hoặc ảnh lỗi | Kiểm tra `ONEVOICE_IMAGE_HOSTS` trong `.env`. Pipeline tự fallback sang chữ để không chặn người dùng. |
| `PROFILE_MISMATCH` khi verify video | Video không đúng chuẩn MP4/H.264 hoặc sai thời lượng | Chạy với cờ `--template` để kiểm tra theo gate của template renderer: `pnpm video:verify -- renders/<uuid>/video.mp4 --template`. |
| Không tìm thấy `hyperframes` hoặc `ffmpeg` | Thiếu binary trong PATH | Cài đặt công cụ hoặc cấu hình đường dẫn tuyệt đối trong `ONEVOICE_HYPERFRAMES_PATH` và `FFMPEG_PATH`. |

---

## 9. Bằng chứng kiểm thử và Cấp phép phát hành

Chạy toàn bộ bộ kiểm thử tự động phục vụ nghiệm thu:

```bash
# 1. Đóng gói mã nguồn worker
pnpm build:worker

# 2. Chạy toàn bộ unit tests
pnpm test

# 3. Chạy kiểm thử chất lượng mã nguồn tổng thể (lint + typecheck + unit tests)
pnpm check

# 4. Chạy bộ kiểm thử tích hợp E2E và kiểm tra tính tất định byte-determinism
ONEVOICE_E2E=1 pnpm test src/lib/video/determinism.e2e.test.ts
ONEVOICE_E2E=1 pnpm test src/worker/e2e.test.ts

# 5. Kiểm tra tính hợp lệ của cấu hình Docker Compose
docker compose config
```

### Lưu ý về cấp phép phân phối:

- Toàn bộ mã nguồn do OneVoice phát triển được phát hành theo giấy phép **Apache License 2.0**.
- Danh mục chi tiết các thư viện phụ thuộc, phông chữ OFL-1.1 và bản quyền âm thanh CC BY được lưu tại [docs/oss-inventory.md](oss-inventory.md) và [NOTICE](../../NOTICE).
- Khi đóng gói Docker image hoặc binary phát hành thương mại, đội ngũ kỹ thuật có trách nhiệm lưu lại đầu ra của `ffmpeg -version` và `ffmpeg -buildconf` để đảm bảo tuân thủ đầy đủ các điều khoản cấp phép của FFmpeg và các codec liên quan.
