# Desired OneVoice vs hiện trạng đã kiểm chứng

## Evidence baseline

Đã đọc tài liệu trước source trong nghiên cứu trước phỏng vấn. Kiểm tra Git khi bắt đầu kế hoạch: branch main, 5 file user dirty dưới đây. API Supabase đã trả schema và count thật trong phiên này; đây là kết nối .env, không Supabase MCP (không tools MCP được expose). Không công bố keys.

- organizations 1; products 4109; images 24351; variants 4109; categories 533; promotions 62; import_runs 6; render_events 9 tại thời điểm kiểm tra trước.
- 24351 image URLs: product.hstatic.net 16912, cdn.hstatic.net 7436, gearvn.com 3. storage_path null toàn bộ, Storage buckets rỗng. 3 mẫu HEAD HTTP200 ảnh; chưa xác minh mọi URL.
- Không thấy orders/conversations/warranty/campaigns/staff tables trong public schema API đã đọc.

## Mapping gaps

| Desired | Current verified | Issues |
|---|---|---|
| Một doanh nghiệp, staff/manager, portable deployment | organization scope env; không staff auth/guards | 001,005–009,043 |
| Handoff bền vững, pause ngay, staff trả lời ngoài | Không channel/conversation subsystem | 002,012–019 |
| Multi-source consultation, knowledge gap | Snapshot cho render; không sales tools | 010–011,016–018,049–050 |
| Native order/VNPay/15min reserve/status/warranty | Không schema hoặc adapters | 004,020–027 |
| Autonomous + manager override và pause bền vững | Chưa marketing scheduler/control | 003,008,028–030,036–038 |
| Nguồn/truth toàn bộ nội dung trước đăng | Guard số trong scene, chưa caption/CTA/latest gate | 016,031–032,037 |
| Video kết hợp ảnh thật | HyperFrames text-only; ignore imagePath; AI bị gọi hai lượt | 031,033–035 |
| Đăng Fanpage và đo business outcome | No publishing; render metrics chủ yếu | 037,039–041 |
| Build/test/deploy evidence | Baseline có lỗi môi trường và code | 042–044 |

## Conflicts resolved by interview

| Tài liệu/hướng cũ | Quyết định mới có ưu tiên |
|---|---|
| Blueprint marketing draft -> manager approve/reapprove | Tự sinh và đăng trong cấu hình manager; stale regenerate/skip, không bắt duyệt từng lần |
| Blueprint MockChannel đủ P0 | Facebook Messenger và Fanpage thật là mục tiêu bản đầu; mock chỉ test |
| COD/đặt cọc QR demo; payment về sau | VNPay và paid-confirmed -> PREPARING ngay trong bản đầu |
| Đơn nháp là điểm cuối; sau bán chưa core | Có native order/shipping/warranty status, nhưng request return/warranty chuyển staff |
| Hộp thư nguồn chiến dịch có thể hiểu là staff reply UI | OneVoice queue/context/claim/done; reply tại ứng dụng gốc |
| Đề xuất SaaS multi-tenant ở phỏng vấn bị user sửa | Một deployment/một doanh nghiệp/một Page; portability cho doanh nghiệp khác |
| Pure text template và laptop-only demo | Motion+product images/video, ngành máy tính/phụ kiện toàn catalog |
| RAG/web potentially broadened | Lời sửa cuối cho phép nhiều nguồn; thêm registry/ingestion, operational facts vẫn authoritative |

Các conflict này đã có quyết định trực tiếp; không hỏi lại, không blindly theo Blueprint. Các tài liệu cũ là historical planning reference; README tracker này không tuyên bố đã triển khai chúng.

## Uncommitted work to preserve

- src/app/(app)/dashboard/trend-chart.tsx
- src/app/(app)/layout.tsx
- src/app/(app)/nav-sections.test.ts
- src/app/(app)/nav-sections.ts
- src/app/globals.css

Không stage/commit/overwrite các file trên. Nếu task tương lai cần sửa, đọc diff trước và giữ hunks hiện tại.

## Validation baseline limitations

Nghiên cứu trước ghi typecheck pass; pnpm check fail lint (6 errors/10 warnings); suite 289 pass/90 fail/6 skip, phần lớn FFmpeg/ffprobe/fonts thiếu hoặc Windows path/symlink; có assertion durationSeconds cũ. Đây là kết quả lịch sử trong phiên, không thay kết quả mới của task. OV-042 phải chạy lại và phân loại. Template byte reproducibility và quality chưa có proof đầy đủ. Không chạy reset/migration vào Supabase remote để thử.

## External completion gates

Meta app/permissions/token/webhook HTTPS và quyền insights/publish chưa kiểm chứng; VNPay merchant sandbox credentials chưa kiểm chứng. Một số tests local cần Docker/Supabase và FFmpeg/font/TTS. Triển khai code/test doubles được phép, nhưng integration không DONE nếu thiếu proof bắt buộc; ghi BLOCKED gate rõ và làm task khác.


Kiểm tra tên biến .env khi lập kế hoạch: chưa có biến chứa FACEBOOK/META_/PAGE_/MESSENGER hoặc VNPAY/VNP_. Đây chỉ là inventory tên biến, không chứng minh tài khoản nhà cung cấp chưa tồn tại. Không in giá trị bí mật. Live integration gates vẫn chưa mở.
