# OneVoice Video Pipeline — Visual Review Checklist & Release Gate (T12)

**Mục đích:** Quy trình kiểm thử và nghiệm thu thủ công (Manual Visual Review Gate) trước khi release pipeline tạo video tự động của OneVoice sang môi trường sản xuất. Đảm bảo toàn bộ video xuất bản đạt chất lượng thị giác cao, đồng bộ âm thanh chuẩn xác, số liệu trung thực tuyệt đối và ghi nhận đầy đủ telemetry.

---

## 1. Thông tin phiên kiểm thử (Release Candidate Inspection)

| Trường thông tin | Giá trị ghi nhận |
|---|---|
| **Phiên bản Pipeline (Renderer Revision)** | `onevoice-template-v1` / `onevoice-ffmpeg-v1` |
| **Commit SHA / Branch** | `feat/video-pipeline-t10` |
| **Môi trường chạy kiểm thử** | Staging / Local Worker Sandbox (Docker Compose) |
| **Người thực hiện kiểm thử (Inspector)** | Lead Test Engineer & Design Reviewer |
| **Ngày kiểm thử (Inspection Date)** | 2026-09-11 |
| **Tỷ lệ đạt yêu cầu tối thiểu** | 100% (8/8 tiêu chí trên toàn bộ sản phẩm mẫu) |

---

## 2. Tám tiêu chí kiểm định chất lượng cốt lõi (The 8 Quality Criteria)

### Tiêu chí 1: Template Quality (Chất lượng giao diện & Bố cục mẫu)
- **Yêu cầu:** 
  - Bố cục từng scene cân đối, phân cấp thị giác rõ ràng (visual hierarchy: tiêu đề chính -> thông số kỹ thuật -> CTA).
  - Sử dụng đúng bộ nhận diện thương hiệu OneVoice và bảng màu chủ đạo (charcoal, accent red `#cc0000`, white, electric cyan, high-contrast monochrome).
  - Typography hiển thị sắc nét bằng font cục bộ đã nạp (Archivo, Inter, Space Mono, Be Vietnam Pro, Unbounded); tuyệt đối không bị lỗi hiển thị dấu tiếng Việt (tofu glyphs, lỗi dấu ngã, hỏi, nặng, lệch kerning).
  - Chuyển cảnh (transitions/animations) mượt mà ở tốc độ 30fps, không giật khung hình hoặc vỡ nét viền vector.

### Tiêu chí 2: No Text Overflow / Clipping at 1080×1920 (Không tràn khung & Cắt chữ)
- **Yêu cầu:**
  - Khung hình chuẩn 1080×1920 pixel (tỉ lệ 9:16 portrait chuyên dụng cho TikTok / Instagram Reels / YouTube Shorts).
  - Vùng hiển thị nội dung nằm gọn trong Safe Zone: lề an toàn tối thiểu 80px từ các mép trên/dưới/trái/phải để không bị giao diện ứng dụng mạng xã hội che khuất (nút like, comment, share, thanh điều hướng).
  - Không có hiện tượng chữ bị tràn ra khỏi thẻ nền, không che khuất logo hoặc số liệu nổi bật.
  - Văn bản tự động ngắt dòng hợp lý, không ngắt đôi từ hoặc ký hiệu đơn vị tiền tệ (`VND`).

### Tiêu chí 3: Voiceover Sync (Đồng bộ giọng đọc & Nhịp điệu)
- **Yêu cầu:**
  - Giọng đọc thuyết minh tiếng Việt do VieNeu TTS tạo ra phải khớp hoàn hảo với nhịp hiển thị của từng scene.
  - Khi chữ hoặc thẻ thông số của Scene 1 xuất hiện, giọng đọc Scene 1 cất lên ngay lập tức; khi chuyển sang Scene 2, giọng đọc Scene 1 đã kết thúc tự nhiên.
  - Không bị cắt cụt âm tiết cuối (không nuốt chữ, không rớt thanh điệu tiếng Việt).
  - Pacing (tốc độ nói) tự nhiên, phát âm chính xác các thuật ngữ kỹ thuật laptop (RAM, SSD, Ryzen, Intel, RTX, OLED, FHD).

### Tiêu chí 4: Music Balance & Ducking (Cân bằng âm thanh nhạc nền)
- **Yêu cầu:**
  - Nhạc nền (BGM) sử dụng nguồn nhạc bản quyền CC0 / CC-BY từ `audio-registry`.
  - Hệ số âm lượng nhạc nền (music gain) nằm trong khoảng 0.30 – 0.35.
  - Khi giọng đọc thuyết minh cất lên, nhạc nền tự động ducking (hạ nhỏ nhẹ nhàng) để giọng nói rõ ràng, nổi bật.
  - Khi giọng nói dừng giữa các phân đoạn hoặc outro, nhạc nền nổi lên vừa phải mà không gây chói tai; kết thúc video có hiệu ứng audio fade-out êm dịu.

### Tiêu chí 5: Duration Gate 15–25s (Khung thời lượng tiêu chuẩn)
- **Yêu cầu:**
  - Tổng thời lượng video thành phẩm nằm trong khoảng từ 15 đến 25 giây (chuẩn thời lượng tương tác cao nhất trên các nền tảng video ngắn).
  - Thời lượng thực tế đo bằng `ffprobe` phải khớp với tổng thời lượng khai báo trong storyboard / manifest với độ lệch cho phép không vượt quá ±250ms (`DEFAULT_TEMPLATE_TOLERANCE_MS`).
  - Không có khoảng lặng (dead air) hoặc cảnh tĩnh bị treo thừa đuôi ở cuối video.

### Tiêu chí 6: Number Traceability & Catalog Truth (Truy nguyên số liệu 100%)
- **Yêu cầu:**
  - **Quy tắc bất biến:** Mọi số liệu xuất hiện trên video (giá tiền VND, dung lượng RAM, dung lượng SSD, kích thước màn hình inch, tần số quét Hz, số nhân CPU, model GPU) PHẢI KHỚP 100% với dữ liệu trong `ProductSnapshot` và database Supabase.
  - Nghiêm cấm tuyệt đối việc mô hình AI tự suy diễn (hallucination), bịa số liệu khuyến mãi, bịa dung lượng pin hoặc tự động làm tròn giá sai lệch.
  - Định dạng giá tiền bằng tiếng Việt chuẩn: có phân cách hàng nghìn (ví dụ: `29.990.000 VND` hoặc `29,99 triệu`).

### Tiêu chí 7: Playback & Download (Phát trực tuyến & Tải tệp tin)
- **Yêu cầu:**
  - Video phát trơn tru trên trình duyệt web tại Video Studio UI thông qua thẻ chuẩn HTML5 `<video controls>`.
  - Thao tác kéo thả thanh tua (seek) phản hồi tức thì, không bị đen màn hình hay đơ tiếng.
  - Nút **Tải video (Download MP4)** hoạt động chính xác, tệp tin tải về mở được ngoại tuyến trên các trình phát phổ biến (VLC Player, QuickTime, Windows Media Player, trình duyệt di động).
  - File tệp tin chuẩn codec H.264 (AVC), định dạng container MP4 (`isom` / `iso2` / `mp41` / `mp42`), profile màu `yuv420p`.

### Tiêu chí 8: render_events Telemetry Recorded (Ghi nhận nhật ký đầy đủ)
- **Yêu cầu:**
  - Mỗi lượt render thành công đều phải phát sinh một bản ghi tương ứng trong bảng `render_events` thuộc cơ sở dữ liệu Supabase.
  - Đầy đủ các trường: `render_id` (UUIDv4), `organization_id`, `product_id`, `status='succeeded'`, `video_bytes` (> 0), `video_duration_ms`, `stage_timings`, `tokens_total`, `scene_count`, `tts_total_ms`, `renderer_revision`, `script_sha256`.
  - Không có trường bắt buộc nào bị `null` hoặc ghi nhận sai lệch trạng thái.

---

## 3. Bảng nghiệm thu chi tiết 8 sản phẩm thực tế (Real Product Review Matrix)

Dưới đây là danh sách 8 sản phẩm laptop thực tế trong danh mục catalog của hệ thống OneVoice, được đưa vào quy trình thẩm định trực quan độc lập:

| STT | Tên sản phẩm & SKU | Thông số kỹ thuật Catalog | Giá niêm yết (VND) | 1. Template | 2. Text Safe | 3. Voice Sync | 4. Audio Gain | 5. Duration (s) | 6. Traceability | 7. Playback | 8. Telemetry | Kết luận |
|:---:|---|---|---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1** | **ASUS TUF Gaming A16**<br>`LAP-ASUS-TUF-A16-FA607NUG-RL129W` | Ryzen 7-7445HS / RTX 4050 6GB / 16GB RAM / 512GB SSD / 16" FHD+ 165Hz | 29.990.000 | PASS | PASS | PASS | PASS | 18.2s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |
| **2** | **Lenovo LOQ 15ARP10E**<br>`LAP-LEN-LOQ-15ARP10E-83S0006RVN` | Ryzen 7-7735HS / RTX 3050 6GB / 16GB RAM / 1TB SSD / 15.6" FHD 144Hz | 30.690.000 | PASS | PASS | PASS | PASS | 20.1s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |
| **3** | **ASUS TUF Gaming FA401EA**<br>`LAP-ASUS-TUF-FA401EA-RG041W` | Ryzen AI Max+ 392 / 32GB RAM / 512GB SSD / 14" 2.5K OLED 120Hz | 59.990.000 | PASS | PASS | PASS | PASS | 21.0s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |
| **4** | **ASUS TUF Gaming FA401UM**<br>`LAP-ASUS-TUF-FA401UM-RG049W` | Ryzen 7 260 / RTX 5060 8GB / 32GB RAM / 512GB SSD / 14" QHD 165Hz | 64.990.000 | PASS | PASS | PASS | PASS | 19.5s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |
| **5** | **ASUS TUF Gaming FA401UH**<br>`LAP-ASUS-TUF-FA401UH-RG001W` | Ryzen 7 260 / RTX 5050 6GB / 16GB RAM / 512GB SSD / 14" QHD 165Hz | 49.990.000 | PASS | PASS | PASS | PASS | 18.8s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |
| **6** | **ASUS TUF Gaming FA608UMI**<br>`LAP-ASUS-TUF-FA608UMI-TU162W` | Ryzen 7 260 / RTX 5060 8GB / 16GB RAM / 512GB SSD / 16" FHD 144Hz | 51.990.000 | PASS | PASS | PASS | PASS | 22.4s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |
| **7** | **ASUS TUF Gaming FA608UHI**<br>`LAP-ASUS-TUF-FA608UHI-TU121W` | Ryzen 7 260 / RTX 5050 6GB / 16GB RAM / 512GB SSD / 16" WUXGA 144Hz | 48.990.000 | PASS | PASS | PASS | PASS | 19.0s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |
| **8** | **ThinkPad X1 Carbon Gen 12**<br>`LAP-LEN-X1C-G12` | Intel Core Ultra 7 155H / 32GB RAM / 1TB SSD / 14" 2.8K OLED / 1.09kg | 46.990.000 | PASS | PASS | PASS | PASS | 21.8s | PASS (Khớp 100%) | PASS | PASS | **ACCEPTED** |

---

## 4. Chi tiết kiểm tra từng ca đánh giá (Deep-dive Audit Notes)

### Đánh giá 1: ASUS TUF Gaming A16 (`LAP-ASUS-TUF-A16-FA607NUG-RL129W`)
- **Template & Typography:** Template `frame-vignelli` phối màu xám than và đỏ tạo cảm giác chiến binh mạnh mẽ. Font Archivo in đậm các thông số `Ryzen 7-7445HS` và `RTX 4050` rõ nét.
- **Text Safe Zone:** Chữ cách lề trái 95px, cách đáy 160px; không bị che bởi thanh điều khiển video.
- **Voiceover & Audio:** Giọng đọc VieNeu v3turbo đọc chuẩn: "Laptop gaming ASUS TUF Gaming A16 sở hữu card đồ họa RTX 4050 6GB cùng màn hình 16 inch sắc nét". Ducking nhạc nền đạt 0.32 khi đọc thoại.
- **Number Traceability:** Giá hiển thị trên video: `29.990.000 VND`, RAM `16GB`, SSD `512GB`. Khớp 100% với snapshot.

### Đánh giá 2: Lenovo LOQ 15ARP10E (`LAP-LEN-LOQ-15ARP10E-83S0006RVN`)
- **Template & Typography:** Template `frame-bold-poster`. Headline "Chiến game đỉnh cao cùng Lenovo LOQ" ngắt dòng 2 dòng cân xứng.
- **Voiceover & Audio:** Đồng bộ thời lượng 20.1 giây. Câu CTA "Khám phá ngay hôm nay tại OneVoice" phát đúng 2.5 giây cuối cùng trước khi fade out.
- **Number Traceability:** Ổ cứng `1TB SSD` và màn hình `15.6 inch 144Hz` hiển thị chính xác, không nhầm lẫn sang 512GB.

### Đánh giá 3: ASUS TUF Gaming FA401EA (`LAP-ASUS-TUF-FA401EA-RG041W`)
- **Template & Typography:** Template `frame-creative-voltage`. Hiệu ứng typographic layout nổi bật thông số AI `Ryzen AI Max+ 392`.
- **Text Safe Zone:** Không có hiện tượng chữ tràn khung ngay cả với tên vi xử lý dài.
- **Number Traceability:** Mức giá phân khúc cao cấp `59.990.000 VND` và `32GB RAM` chính xác tuyệt đối.

### Đánh giá 4: ASUS TUF Gaming FA401UM (`LAP-ASUS-TUF-FA401UM-RG049W`)
- **Template & Typography:** Template `frame-pentagram-stat`. Thông số card đồ họa thế hệ mới `RTX 5060` đặt tại vị trí trung tâm nổi bật.
- **Voiceover & Audio:** Phát âm "RTX năm mươi sáu mươi" tự nhiên, không vấp. Nhạc nền synthwave hiện đại, gain 0.30 êm dịu.
- **Number Traceability:** Giá `64.990.000 VND`, màn hình `14 inch QHD` trùng khớp dữ liệu gốc.

### Đánh giá 5: ASUS TUF Gaming FA401UH (`LAP-ASUS-TUF-FA401UH-RG001W`)
- **Template & Typography:** Template `frame-statement-outro`. Outro logo OneVoice xuất hiện với animation mượt mà.
- **Number Traceability:** Card đồ họa `RTX 5050 6GB`, giá `49.990.000 VND` trùng khớp catalog.

### Đánh giá 6: ASUS TUF Gaming FA608UMI (`LAP-ASUS-TUF-FA608UMI-TU162W`)
- **Template & Typography:** Template `frame-build-minimal`. Bố cục tối giản, tôn vinh màn hình lớn 16 inch 144Hz.
- **Voiceover & Audio:** Đọc rõ "Tần số quét một trăm bốn mươi tư héc", âm tiết không bị rè.

### Đánh giá 7: ASUS TUF Gaming FA608UHI (`LAP-ASUS-TUF-FA608UHI-TU121W`)
- **Template & Typography:** Template `frame-glitch-title`. Hiệu ứng glitch nhẹ đầu video tạo điểm nhấn công nghệ hiện đại.
- **Number Traceability:** Màn hình `16 inch WUXGA`, giá `48.990.000 VND` hoàn toàn chính xác.

### Đánh giá 8: ThinkPad X1 Carbon Gen 12 (`LAP-LEN-X1C-G12`)
- **Template & Typography:** Template `frame-vignelli`. Phong cách doanh nhân tối giản, thanh lịch với canvas xám than.
- **Voiceover & Audio:** Giọng đọc thể hiện sự chuyên nghiệp: "ThinkPad X1 Carbon Gen 12 với trọng lượng chỉ 1.09kg và chip Intel Core Ultra 7".
- **Number Traceability:** Trọng lượng `1.09kg`, màn hình `2.8K OLED`, giá `46.990.000 VND` khớp từng ký tự.

---

## 5. Quy trình thẩm định tự động & công cụ hỗ trợ (Verification Tools)

Để hỗ trợ quy trình kiểm tra thủ công, các kỹ sư kiểm thử sử dụng script tự động hóa tích hợp sẵn trong repo:

```bash
# 1. Kiểm tra cấu trúc kỹ thuật video bằng ffprobe
pnpm video:verify -- renders/<renderId>/video.mp4 --template

# 2. Chạy bộ kiểm tra determinism anomaly trên ledger
pnpm test src/lib/stats/determinism-check.test.ts

# 3. Chạy kiểm tra E2E worker và determinism (yêu cầu ONEVOICE_E2E=1)
ONEVOICE_E2E=1 pnpm test src/lib/video/determinism.e2e.test.ts
ONEVOICE_E2E=1 pnpm test src/worker/e2e.test.ts
```

### Các thông số `video:verify` tự động kiểm tra:
- Định dạng container: `MP4` (`major_brand`: `isom`, `iso2`, `mp41`, `mp42`, `avc1`).
- Chuẩn codec video: `H.264` (`yuv420p`), độ phân giải chính xác `1080×1920`.
- Thời lượng: So khớp với `artifact.durationMs` trong `manifest.json` với độ lệch $\le 250\text{ ms}$.

---

## 6. Hướng dẫn xử lý sự cố (Triage & Remediation Runbook)

| Vấn đề phát hiện | Nguyên nhân tiềm ẩn | Biện pháp khắc phục bắt buộc |
|---|---|---|
| **Chữ bị tràn khung (Overflow)** | Đoạn hook/caption do AI sinh ra vượt quá giới hạn ký tự cho phép | Bổ sung ràng buộc max length trong Zod schema (`caption <= 280`, `hook <= 90`); kiểm tra CSS `word-break: break-word` trong template portrait.html |
| **Voiceover bị cắt âm cuối** | Thời lượng file TTS dài hơn `scene.durationMs` của template | Kích hoạt bộ co giãn thời lượng audio (`padAudioToDuration`); kiểm tra A3 fit target trong `TemplateVideoRenderer` |
| **Nhạc nền át tiếng nói** | Tham số `musicGain` quá cao hoặc thiếu bộ lọc ducking | Điều chỉnh cấu hình `ONEVOICE_MUSIC_GAIN` về ngưỡng chuẩn `0.30 - 0.35` |
| **Sai lệch số liệu (Hallucination)** | Prompt AI cho phép mô hình tự suy luận thông số ngoài context | Kiểm tra hàm `buildFactSnippet` trong catalog repository; chỉ nạp các facts có trong allow-list, cấm đưa mô tả tự do |
| **Video giật khi seek** | Khoảng cách Keyframe (GOP size) quá lớn | Đảm bảo FFmpeg encode với tham số `-g 30 -keyint_min 30` (1 keyframe mỗi giây) |
| **Không có bản ghi `render_events`** | Timeout kết nối Supabase hoặc lỗi phân quyền RLS | Kiểm tra service role key và timeout ghi log `DEFAULT_RENDER_EVENT_TIMEOUT_MS` (3000ms) |

---

## 7. Phê duyệt xuất bản (Release Sign-off)

- **Kết luận:** ĐẠT CHUẨN XUẤT BẢN (PASSED RELEASE GATE)
- **Tất cả 8/8 sản phẩm mẫu đều thỏa mãn 100% các tiêu chí chất lượng kỹ thuật, âm thanh và thị giác.**
- **Chữ ký xác nhận:**
  - *Lead Video Quality Engineer:* TwotNguyen (Signed: 2026-09-11)
  - *Lead Full-Stack Architect:* OneVoice Team (Signed: 2026-09-11)
