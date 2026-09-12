# Kiểm kê phần mềm nguồn mở (OSS Inventory & License Compliance)

> **Dự án:** OneVoice  
> **Giấy phép mã nguồn chính:** Apache License 2.0 (xem [LICENSE](../LICENSE))  
> **Bản quyền:** Copyright 2026 OneVoice contributors  
> **Cập nhật lần cuối:** 11/09/2026  

Tài liệu này kiểm kê chi tiết toàn bộ các thành phần phần mềm nguồn mở (OSS), thư viện, phông chữ, dữ liệu âm thanh và trọng số mô hình AI được tích hợp hoặc phân phối kèm trong hệ thống OneVoice, cùng với điều kiện tuân thủ giấy phép theo tiêu chuẩn kỹ thuật DX-OS / OLP 2026.

---

## 1. Thành phần mã nguồn tích hợp (Adapted & Vendored Code)

### 1.1. Video Template Pipeline (`src/lib/video/template-pipeline/`)

| Thuộc tính | Chi tiết |
|---|---|
| **Tên gốc** | `references/AI-auto-generate-video` (`aicoding-template-video`) |
| **Tác giả gốc** | AI Coding / Hồ Quang Hải |
| **Commit upstream** | `15c0103bd127e9a2ed963e81cdc33b04b17482cc` |
| **Giấy phép** | MIT License (Bản quyền 2025 AI Coding) |
| **Văn bản giấy phép** | `src/lib/video/template-pipeline/LICENSE` |
| **Vị trí trong repo** | `src/lib/video/template-pipeline/` |
| **Tệp tin giữ lại** | - `compose-template.ts` (chuyển đổi từ `src/render/template-composer.ts`)<br>- `video-tools.ts` (từ `src/render/video-tools.ts`)<br>- `audio-tools.ts` (từ `src/assets/audio-tools.ts`)<br>- `sfx-selector.ts` (từ `src/assets/sfx-selector.ts`)<br>- `templates/` (11 thư mục template kèm `CATALOG.md`) |
| **Tệp tin lược bỏ** | `src/cli.ts`, `src/config.ts`, `src/utils/logger.ts`, `src/tts/*`, `src/render/template-pipeline.ts`, `src/render/template-script-schema.ts`, `scripts/`, `dist/`, `assets/`, `output/`, `.agent/`, `.claude/`, `package-lock.json`, cùng toàn bộ unit tests kiểu cũ dùng `nock`/`axios`. |
| **Các thay đổi chính** | 1. **Bảo mật tiến trình con:** `composeTemplate` thực thi trực tiếp binary `hyperframes` đã cài đặt với `shell: false`, loại bỏ hoàn toàn nguy cơ shell-injection và không gọi `npx` qua mạng.<br>2. **Tiêm đường dẫn động (Dependency Injection):** Nhận `templatesRoot` và `audioRoot` từ biến môi trường (`ONEVOICE_TEMPLATES_ROOT`, `ONEVOICE_AUDIO_ROOT`) thay vì phụ thuộc `import.meta.url`, tương thích với Next.js standalone bundle và Docker container.<br>3. **Nội bộ hóa phông chữ:** Thay thế toàn bộ liên kết CDN `fonts.googleapis.com` / `fonts.gstatic.com` bằng `@font-face` WOFF2 cục bộ trong từng thư mục template.<br>4. **Rebranding:** Đổi tên kênh và URL mẫu từ `aicodingvn` sang `OneVoice` (`https://onevoice.local/`).<br>5. **Loại bỏ phụ thuộc ngoài:** Bỏ `axios` (dùng Node 24 native `fetch`), bỏ `dotenv`, chuẩn hóa module ESM bundler resolution. |

---

## 2. Công cụ dựng và Render Engine (Render & Engine Tools)

### 2.1. HyperFrames CLI (`hyperframes@0.6.94`)

| Thuộc tính | Chi tiết |
|---|---|
| **Thành phần** | `hyperframes` (Headless HTML/CSS/Canvas to Video frame renderer) |
| **Phiên bản** | `0.6.94` |
| **Tác giả / Tổ chức** | nexu-io / HyperFrames Contributors |
| **Giấy phép** | Apache License 2.0 |
| **Nguồn upstream** | [npm: hyperframes](https://www.npmjs.com/package/hyperframes) / [GitHub: nexu-io/hyperframes](https://github.com/nexu-io/hyperframes) |
| **Vai trò** | Render các frame HTML/CSS động sang video MP4 thông qua Chromium headless. |
| **Cấu hình container** | Cài đặt toàn cục trong Docker worker (`npm install -g hyperframes@0.6.94`). Chạy ở đường dẫn `/usr/local/bin/hyperframes`. Thiết lập các biến môi trường cách ly: `HYPERFRAMES_NO_TELEMETRY=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`, `HYPERFRAMES_NO_AUTO_INSTALL=1`, `HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium-browser`. |

### 2.2. VieNeu-TTS Sidecar (`vieneu==3.6.4`)

| Thuộc tính | Chi tiết |
|---|---|
| **Thành phần** | `vieneu` (Vietnamese Neural Text-to-Speech engine) |
| **Phiên bản** | `3.6.4` |
| **Giấy phép mã nguồn** | Apache License 2.0 |
| **Nguồn upstream** | [PyPI: vieneu](https://pypi.org/project/vieneu/) |
| **Vị trí trong repo** | `services/tts/` (Microservice FastAPI bọc bên ngoài) |
| **Trọng số mô hình** | Trọng số VieNeu-TTS v3 Turbo (`v3turbo`) trên Hugging Face. |
| **Giấy phép mô hình** | Open weights license (cho phép nghiên cứu và thương mại hóa có ghi nhận tác giả). |
| **Cơ chế offline** | Được nạp sẵn một lần qua lệnh `python provision.py` vào Docker named volume `onevoice-tts-models`, sau đó chạy runtime hoàn toàn ngoại tuyến với `HF_HUB_OFFLINE=1`. Không phát sinh kết nối Internet lúc dựng video. |

---

## 3. Phông chữ nhúng cục bộ (Vendored Webfonts)

Toàn bộ các phông chữ dùng trong 11 mẫu video template được nhúng trực tiếp dưới định dạng `.woff2` (chỉ gồm tập ký tự `latin` và `vietnamese`) tại `src/lib/video/template-pipeline/templates/*/assets/fonts/`. Bộ kiểm thử tự động `templates.test.ts` kiểm tra và ngăn chặn mọi yêu cầu tải phông từ xa.

| Phông chữ | Tác giả / Foundry | Giấy phép | Tập ký tự | Mục đích sử dụng |
|---|---|---|---|---|
| **Alfa Slab One** | JM Solé | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Tiêu đề khối lớn, phong cách áp phích cổ điển (`frame-bold-poster`, `frame-statement-outro`) |
| **Archivo** | Omnibus-Type | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Font sans hình học thay thế Helvetica (`frame-vignelli`, `frame-pentagram-stat`, `frame-glitch-title`) |
| **Be Vietnam Pro** | Fábio Haag, Tung Nguyen (Vietnamese Typography) | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Phông chữ chính cho văn bản tiếng Việt chuẩn mực (`frame-statement-outro`, `frame-creative-voltage`, `frame-aicoding-list`, `frame-aicoding-comparison`, v.v.) |
| **Dancing Script** | Pablo Impallari | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Chữ viết tay điểm nhấn cảm xúc (`frame-creative-voltage`) |
| **Inter** | Rasmus Andersson | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Giao diện hiện đại, thông số kỹ thuật (`frame-build-minimal`, `frame-logo-outro`) |
| **Inter Tight** | Rasmus Andersson | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Tiêu đề cô đọng, liquid hero (`frame-liquid-bg-hero`, `frame-logo-outro`) |
| **Lora** | Cyreal | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Kiểu serif mềm mại cho trích dẫn (`frame-bold-poster`) |
| **Space Mono** | Colophon Foundry | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Font monospace công nghệ, glitch effect (`frame-glitch-title`, `frame-creative-voltage`) |
| **Unbounded** | NaN, Faux Foundry | SIL Open Font License 1.1 (OFL-1.1) | Latin, Vietnamese | Phông trưng bày phá cách (`frame-creative-voltage`) |
| **DejaVu Sans** | Bitstream / DejaVu Open Source Project | Bitstream Vera / DejaVu License (Permissive) | Đa ngôn ngữ | Phông hệ thống cài sẵn trong Alpine container (`font-dejavu`) dùng cho FFmpeg drawtext fallback |

*Ghi chú:* OFL-1.1 cho phép sử dụng tự do, nhúng (bundling/embedding) và phân phối lại trong phần mềm thương mại mà không phải trả phí bản quyền, với điều kiện giữ nguyên thông báo bản quyền và không bán riêng lẻ từng file phông chữ.

---

## 4. Tài nguyên âm thanh (Audio Assets: Music Beds & SFX)

Chi tiết quy cách kiểm tra và ghi công từng tệp âm thanh được lưu tại `assets/audio/NOTICE.md`:

### 4.1. Nhạc nền (Music Beds)

Tất cả các bản nhạc nền được biên tập thành đoạn 30 giây, chuyển đổi mono 44.1 kHz, fade in/out lặp mượt mà và chuẩn hóa âm lượng ở mức tiêu chuẩn phát thanh −23 LUFS:

| Tệp tin | Tác phẩm | Tác giả | Giấy phép | Nguồn phát hành gốc |
|---|---|---|---|---|
| `assets/audio/music/upbeat-forever.mp3` | "Upbeat Forever" (ISRC USUAN1500063) | Kevin MacLeod (incompetech.com) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Upbeat_Forever_(ISRC_USUAN1500063).mp3) |
| `assets/audio/music/inspiring-advertising.mp3` | "Inspiring Advertising — Upbeat Summer Corporate" | Rafael Krux (filmmusic.io) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Rafael_Krux_-_Inspiring_Advertising_-_Upbeat_Summer_Corporate_(cc-by)_(filmmusic).mp3) |

### 4.2. Hiệu ứng âm thanh (Sound Effects - SFX)

Mười hiệu ứng âm thanh chuyển cảnh và điểm nhấn được đặt trong các thư mục `sfx/transitions/`, `sfx/accents/`, `sfx/ui/`:

- **Transitions:** `whoosh.mp3`, `swoosh.mp3`, `transition-down.mp3`, `riser.mp3`
- **Accents:** `ding.mp3`, `chime-success.mp3`, `sparkle.mp3`, `thud.mp3`
- **UI:** `pop.mp3`, `click.mp3`

| Thuộc tính | Chi tiết |
|---|---|
| **Định dạng** | MP3 mono 44.1 kHz, giới hạn đỉnh âm lượng (peak-limited). |
| **Phương thức khởi tạo** | Được tổng hợp bằng lập trình trực tiếp trong repository thông qua các chuỗi bộ lọc âm thanh FFmpeg (`lavfi filters`), không sử dụng mẫu ghi âm từ bên thứ ba. |
| **Giấy phép** | [Creative Commons Zero 1.0 Universal (CC0 1.0)](https://creativecommons.org/publicdomain/zero/1.0/) — Tuyên bố từ bỏ bản quyền vào phạm vi công cộng bởi đội ngũ phát triển OneVoice. |

---

## 5. Thư viện phụ thuộc chính trong `package.json`

| Gói | Phiên bản | Giấy phép | Mục đích |
|---|---|---|---|
| `@supabase/supabase-js` | `2.116.0` | MIT | SDK giao tiếp cơ sở dữ liệu PostgreSQL / Supabase |
| `hyperframes` | `0.6.94` | Apache-2.0 | Engine render HTML canvas sang video |
| `next` | `16.3.4` | MIT | Framework React full-stack cho giao diện và API route |
| `p-limit` | `^7.3.2` | MIT | Kiểm soát số tác vụ render/xử lý bất đồng bộ đồng thời |
| `react` | `19.2.8` | MIT | Thư viện UI cốt lõi |
| `react-dom` | `19.2.8` | MIT | DOM renderer cho React |
| `zod` | `4.5.4` | MIT | Schema validation chặt chẽ cho cấu hình, script và API |
| `esbuild` | `0.28.2` | MIT | Đóng gói mã nguồn worker (`pnpm build:worker`) thành `dist/worker.js` |
| `typescript` | `6.0.3` | Apache-2.0 | Hệ thống kiểu tĩnh phục vụ biên dịch an toàn |
| `vitest` | `5.0.0` | MIT | Test runner tốc độ cao cho unit và integration tests |
| `eslint` | `9.39.5` | MIT | Kiểm tra chất lượng và tuân thủ quy chuẩn mã nguồn |

---

## 6. Phân tích tuân thủ giấy phép FFmpeg

Hệ thống sử dụng các tiện ích dòng lệnh `ffmpeg` và `ffprobe` độc lập qua tiến trình con (`child_process.spawn` với `shell: false`), không liên kết thư viện tĩnh (static link) vào binary Node.js:

1. **Môi trường cục bộ (Local Developer):** Thường sử dụng bản build phân phối qua Homebrew hoặc package manager OS (có thể chứa cờ `--enable-gpl` tùy cấu hình cá nhân). Điều này chỉ phục vụ nghiên cứu và kiểm thử chức năng cục bộ.
2. **Môi trường Docker Container:** Dockerfile cài đặt binary `ffmpeg` chính thức từ kho gói Alpine Linux (`apk add --no-cache ffmpeg`). Bản build này tuân thủ cấu hình LGPL/GPL chuẩn của Alpine.
3. **Tuân thủ phân phối:** Không đóng gói hoặc phân phối trực tiếp binary FFmpeg trong mã nguồn Git của OneVoice. Khi triển khai container thương mại ra ngoài tổ chức, đội ngũ DevOps có trách nhiệm kiểm kê cờ cấu hình (`ffmpeg -buildconf`) và danh mục codec để đảm bảo tuân thủ đầy đủ quy định LGPL v2.1+ / GPL v2.0+.

---

## 7. Bảng tổng hợp nghĩa vụ pháp lý (Attribution & Compliance Matrix)

| Nhóm tài nguyên | Giấy phép áp dụng | Nghĩa vụ chính đối với OneVoice |
|---|---|---|
| Mã nguồn OneVoice | **Apache-2.0** | Phát hành mã nguồn kèm tệp LICENSE, giữ thông báo bản quyền trong các tệp, cấp quyền sáng chế rõ ràng. |
| Template pipeline | **MIT** | Giữ thông báo bản quyền của tác giả gốc tại `src/lib/video/template-pipeline/LICENSE` và file `NOTICE`. |
| HyperFrames CLI | **Apache-2.0** | Giữ thông tin tác giả nexu-io, ghi công trong tệp `NOTICE`. |
| VieNeu-TTS | **Apache-2.0** | Giữ thông báo bản quyền trong `services/tts/`, ghi công trong `NOTICE`. |
| Webfonts (9 font families) | **OFL-1.1** | Nhúng phông kèm thông báo OFL, không bán phông riêng lẻ, giữ nguyên tên tác giả. |
| Nhạc nền ("Upbeat Forever", "Inspiring Advertising") | **CC BY 3.0 / CC BY 4.0** | Ghi rõ tên tác giả (Kevin MacLeod, Rafael Krux), đường dẫn giấy phép CC, và mô tả rõ các sửa đổi (cắt ngắn, lặp, chuẩn hóa LUFS) trong `NOTICE` và tài liệu. |
| SFX cục bộ (10 âm thanh) | **CC0 1.0 Universal** | Thuộc phạm vi công cộng, không bắt buộc ghi công, nhưng ghi nhận nguồn gốc để minh bạch nguồn gốc tài nguyên. |
