# OneVoice Implementation Plan

## Bàn giao cho agent mới — 2026-09-13

**Bắt đầu tại [HANDOFF.md](HANDOFF.md)**, sau đó đọc [DECISIONS.md](DECISIONS.md) mục Website-first, tracker này, [TESTING.md](TESTING.md) và issue được giao. Prompt copy sẵn: [AGENT-PROMPTS.md](AGENT-PROMPTS.md). Kết quả review tài liệu: [HANDOFF-REVIEW.md](HANDOFF-REVIEW.md).

Trạng thái hiện tại: **53 DONE / 0 IN_PROGRESS / 7 TODO / 3 BLOCKED**, tổng 63 issue.

Website-first core DONE except OV-062 Orca live send (Next `.env` DB ≠ local migrated). OV-051/063 BLOCKED. Stop before OV-037.

> Thực hiện từng issue theo dependency; trạng thái hợp lệ: TODO | IN_PROGRESS | BLOCKED | DONE. Kế hoạch website-first (2026-09-13) thắng phỏng vấn khi mâu thuẫn; không cần hỏi lại quyền bắt đầu. Dùng quy trình test trước thay đổi và review sau từng task.

**Goal:** OneVoice chăm sóc khách trên website (chat ẩn danh `/chat`, AI tư vấn, handoff staff trong OneVoice) và tự chuẩn bị marketing (caption/script/video, Truth Guard, lịch sử, calendar; `WAITING_CHANNEL` khi chưa publish Facebook) cho một doanh nghiệp; đơn/VNPay/tra cứu; triển khai riêng. Facebook Messenger/Fanpage là adapter tương lai, không chặn website-first MVP.

**Architecture:** Giữ Next.js App Router + TypeScript và Supabase/Postgres. Một bản cài đặt gắn một organization; không SaaS đa doanh nghiệp. Kênh `WEB` và `FACEBOOK`; public `/chat`; staff `/support`. Logic nghiệp vụ thuần tách khỏi adapters; Supabase Auth xác minh staff; RPC/transactions bảo vệ đơn, tồn, jobs và chuyển người; external side effects qua outbox. Fulfilment `DELIVERING` (không `SHIPPING`). HyperFrames làm nền video, bổ sung tư liệu; chưa quyết định chuyển Remotion.

**Tech Stack:** Node >=24, pnpm 11.24.0, Next 16.3.4, React 19.2.8, TypeScript 6, Supabase JS 2.116.0, Vitest, HyperFrames 0.6.94, FFmpeg và TTS đã có. Đọc docs Next cài trong node_modules trước thay đổi framework.

**Spec:** [DECISIONS.md](DECISIONS.md). [GAP-ANALYSIS.md](GAP-ANALYSIS.md) ghi trạng thái đã kiểm chứng và mâu thuẫn. [PLAN-REVIEW.md](PLAN-REVIEW.md) ghi review trước code.

## Global constraints

- Ưu tiên: Website-first (2026-09-13) > quyết định phỏng vấn > code/runtime đã kiểm chứng > kiến trúc hiện tại > tài liệu duy trì > roadmap/research/slides cũ.
- Nhân viên chỉ đọc thông tin cần hỗ trợ, cập nhật đơn/giao hàng/bảo hành, nhận và hoàn tất hỗ trợ; trả lời khách WEB trong OneVoice (`reply_customer`). Manager quản lý catalog, giá, tồn, chính sách, chương trình, tài khoản, AI và marketing.
- AI tư vấn dùng CSDL và nguồn tri thức cấu hình; lời sửa «Không chỉ lấy từ csdl» có ưu tiên. Giá/tồn/trạng thái giao dịch theo dữ liệu vận hành; nguồn ngoài có provenance/freshness và không tự ghi đè.
- Không duyệt thủ công mặc định cho chỉnh dữ liệu hoặc từng nội dung; manager kiểm soát phạm vi automation.
- Actual return/warranty requests và yêu cầu gặp người phải dừng AI toàn cuộc hội thoại ngay khi vào queue; câu hỏi policy AI được trả lời.
- Khách bắt đầu thanh toán giữ tồn 15 phút; confirmed paid VNPay mới PREPARING; staff tự cập nhật giao hàng (`PREPARING→DELIVERING→DELIVERED`).
- Marketing pause do yêu cầu ưu tiên giữ nguyên cho tới manager bật lại; regenerate dữ liệu thay đổi hoặc skip/replacement nếu không còn phù hợp. Due không publishing provider → `WAITING_CHANNEL`, không `PUBLISHED`, không retry vô hạn.
- External media chỉ miễn phí và phù hợp quyền sử dụng; ảnh catalog có thể giữ link hiện tại.
- Dirty hiện tại chỉ `next-env.d.ts` (không commit). Ghi chú lịch sử 5 file user trong GAP-ANALYSIS vẫn giữ; trước khi chạm file dirty phải đọc diff và merge chủ đích. Không reset/clean/force push/stash hoặc commit file người dùng.
- Không migration/reset DB từ xa hoặc gửi tin/đăng bài/giao dịch thật trong kiểm thử. Sandbox/local trước; thiếu credentials/quyền ghi blocker cụ thể.
- DONE chỉ đúng phạm vi từng issue: module thuần không đồng nghĩa API/UI/live integration đã xong.
- Mọi task mới phát hiện phải thêm tracker/dependency; không âm thầm mở rộng phạm vi.

## Task order and dependencies

P0 = nền tảng/an toàn dữ liệu và customer workflow; P1 = marketing/analytics cần trong bản đầu; P2 = release evidence. P1 không có nghĩa bỏ khỏi MVP. Thực hiện số tăng dần trong các task đã mở khóa; bỏ qua task BLOCKED để làm task độc lập. OV-042 có thể làm sớm khi baseline cản validation.

| Order | Task | Priority | Dependencies | Status |
|---|---|---|---|---|
| 1 | [OV-001 — Quyền nghiệp vụ theo vai trò](OV-001-business-permissions.md) | P0 | — | DONE |
| 2 | [OV-002 — Quy tắc chuyển người và dừng AI](OV-002-handoff-state-machine.md) | P0 | OV-001 | DONE |
| 3 | [OV-003 — Quy tắc tạm dừng và ưu tiên marketing](OV-003-marketing-control-state.md) | P0 | OV-001 | DONE |
| 4 | [OV-004 — Quy tắc đơn chờ thanh toán và giữ hàng](OV-004-order-reservation-state.md) | P0 | — | DONE |
| 5 | [OV-005 — Lưu tài khoản nhân viên và quyền](OV-005-staff-auth-storage.md) | P0 | OV-001 | DONE |
| 6 | [OV-009 — Nhật ký hành động nghiệp vụ](OV-009-audit-events.md) | P0 | OV-005 | DONE |
| 7 | [OV-006 — Đăng nhập và phiên nhân viên](OV-006-staff-session-login.md) | P0 | OV-005, OV-009 | DONE |
| 8 | [OV-007 — Bảo vệ API và trang nội bộ hiện có](OV-007-protect-existing-routes.md) | P0 | OV-001, OV-006 | DONE |
| 9 | [OV-008 — Cấu hình doanh nghiệp và thương hiệu](OV-008-business-settings.md) | P0 | OV-003, OV-007, OV-009 | DONE |
| 10 | [OV-010 — Quản lý sản phẩm, giá, ảnh và tồn](OV-010-catalog-management.md) | P0 | OV-007, OV-009 | DONE |
| 11 | [OV-011 — Quản lý chính sách và chương trình](OV-011-policy-promotion-management.md) | P0 | OV-007, OV-009 | DONE |
| 12 | [OV-012 — Hàng đợi bền vững cho nghiệp vụ](OV-012-durable-jobs.md) | P0 | OV-005, OV-009 | DONE |
| 13 | [OV-013 — Nhận webhook một Fanpage](OV-013-facebook-webhook-ingress.md) | P0 | OV-012 | DONE |
| 14 | [OV-014 — Lưu hội thoại và hàng chờ hỗ trợ](OV-014-conversation-persistence.md) | P0 | OV-002, OV-009, OV-013 | DONE |
| 15 | [OV-015 — Danh sách yêu cầu và nhận/hoàn tất](OV-015-staff-handoff-ui.md) | P0 | OV-007, OV-014 | DONE |
| 16 | [OV-020 — Đơn hàng native và dòng sản phẩm](OV-020-orders-persistence.md) | P0 | OV-004, OV-005, OV-009, OV-010 | DONE |
| 17 | [OV-026 — Nhân viên cập nhật tiến độ bảo hành](OV-026-warranty-tracking.md) | P0 | OV-007, OV-009, OV-020 | DONE |
| 18 | [OV-031 — Một lần sinh kịch bản và nội dung đồng nhất](OV-031-content-generation-contract.md) | P1 | — | DONE |
| 19 | [OV-042 — Sửa lỗi kiểm thử và môi trường render](OV-042-baseline-validation-repairs.md) | P0 | — | DONE |
| 20 | [OV-045 — Ghi thiếu thông tin và bổ sung tri thức](OV-045-knowledge-gap-tracking.md) | P0 | OV-007, OV-009, OV-014 | DONE |
| 21 | [OV-047 — Môi trường kiểm thử media Linux tái lập](OV-047-linux-media-validation.md) | P2 | OV-042 | DONE |
| 22 | [OV-048 — Quản lý tài khoản nhân viên](OV-048-staff-administration.md) | P0 | OV-005, OV-006, OV-007, OV-009 | DONE |
| 23 | [OV-049 — Quản lý nguồn tri thức bổ sung](OV-049-knowledge-source-registry.md) | P0 | OV-007, OV-009 | DONE |
| 24 | [OV-051 — Kiểm chứng nhận sự kiện Fanpage thật](OV-051-facebook-ingress-live-verification.md) | P2 | OV-013 | BLOCKED |
| 25 | [OV-052 — Đọc nguồn HTTPS công khai có giới hạn](OV-052-public-http-fetch.md) | P0 | — | DONE |
| 26 | [OV-028 — Thu thập xu hướng có nguồn](OV-028-trend-source-ingestion.md) | P1 | OV-008, OV-012, OV-052 | DONE |
| 27 | [OV-029 — Đề xuất sản phẩm và chủ đề](OV-029-opportunity-engine.md) | P1 | OV-008, OV-010, OV-011, OV-028 | DONE |
| 28 | [OV-030 — Lưu chiến dịch và lịch nội dung](OV-030-campaigns-and-calendar.md) | P1 | OV-003, OV-009, OV-029 | DONE |
| 29 | [OV-050 — Nạp và làm mới tri thức có nguồn](OV-050-knowledge-source-ingestion.md) | P0 | OV-012, OV-049, OV-052 | DONE |
| 30 | [OV-016 — Tra cứu evidence nội bộ cho AI](OV-016-customer-evidence-lookup.md) | P0 | OV-010, OV-011, OV-050 | DONE |
| 31 | [OV-017 — AI tư vấn và phân loại ý định](OV-017-messenger-consultation.md) | P0 | OV-014, OV-016, OV-045 | DONE |
| 32 | [OV-018 — Gửi Messenger có kiểm tra trạng thái](OV-018-messenger-outbound.md) | P0 | OV-012, OV-017 | DONE |
| 33 | [OV-019 — Bình luận quan tâm mời nhắn Messenger](OV-019-public-comment-routing.md) | P0 | OV-013, OV-018 | DONE |
| 34 | [OV-021 — Link khách kiểm tra và xác nhận đơn](OV-021-checkout-confirmation.md) | P0 | OV-017, OV-020 | DONE |
| 35 | [OV-022 — Giữ tồn 15 phút nguyên tử](OV-022-inventory-reservations.md) | P0 | OV-012, OV-020, OV-021 | DONE |
| 36 | [OV-023 — Tạo yêu cầu thanh toán VNPay](OV-023-vnpay-checkout.md) | P0 | OV-022 | DONE |
| 37 | [OV-024 — Xác minh thanh toán và chuẩn bị hàng](OV-024-vnpay-payment-finalization.md) | P0 | OV-023 | DONE |
| 38 | [OV-025 — Nhân viên cập nhật đơn và tự giao](OV-025-order-operations-ui.md) | P0 | OV-007, OV-024 | DONE |
| 39 | [OV-027 — Xác minh khách và tra cứu tiến độ](OV-027-customer-status-verification.md) | P0 | OV-025, OV-026, OV-054 | DONE |
| 40 | [OV-032 — Lưu nguồn và kiểm facts bài/video](OV-032-content-passport-and-truth.md) | P1 | OV-011, OV-016, OV-030, OV-031 | DONE |
| 41 | [OV-033 — Tư liệu miễn phí và quản lý nguồn](OV-033-free-media-sourcing.md) | P1 | OV-028, OV-032 | DONE |
| 42 | [OV-034 — Ảnh sản phẩm trong đồ họa chuyển động](OV-034-hybrid-video-scenes.md) | P1 | OV-031, OV-032, OV-033 | DONE |
| 43 | [OV-046 — Kết nối render với hàng đợi marketing](OV-046-render-job-adapter.md) | P1 | OV-012, OV-031, OV-032 | DONE |
| 44 | [OV-053 — Sinh nội dung chiến dịch dùng chung](OV-053-campaign-content-generation.md) | P1 | OV-032, OV-034 | DONE |
| 45 | [OV-035 — Studio bài viết/video và chỉnh sửa](OV-035-studio-content-review.md) | P1 | OV-007, OV-030, OV-032, OV-034, OV-046, OV-053 | DONE |
| 46 | [OV-036 — Chọn giờ và số lượng đăng](OV-036-marketing-scheduler.md) | P1 | OV-012, OV-030, OV-032, OV-035 | DONE |
| 47 | [OV-037 — Đăng bài và Reels lên Fanpage](OV-037-facebook-publishing.md) | P1 | OV-018, OV-032, OV-034, OV-036 | TODO |
| 48 | [OV-038 — Điều khiển tự động và yêu cầu ưu tiên](OV-038-marketing-controls-ui.md) | P1 | OV-008, OV-030, OV-036, OV-037 | TODO |
| 49 | [OV-039 — Liên kết nội dung tới hội thoại và đơn](OV-039-attribution-events.md) | P1 | OV-019, OV-024, OV-030, OV-037 | TODO |
| 50 | [OV-040 — Thu thập hiệu quả nội dung](OV-040-facebook-insights.md) | P1 | OV-012, OV-037 | TODO |
| 51 | [OV-041 — Dashboard hiệu quả và mục tiêu](OV-041-business-analytics-dashboard.md) | P1 | OV-027, OV-038, OV-039, OV-040 | TODO |
| 52 | [OV-043 — Triển khai riêng và sao lưu](OV-043-deployment-and-operations.md) | P2 | OV-007, OV-012, OV-015, OV-027, OV-038, OV-041, OV-042, OV-047, OV-048 | TODO |
| 53 | [OV-044 — Nghiệm thu luồng OneVoice và bằng chứng cuộc thi](OV-044-end-to-end-release-evidence.md) | P2 | OV-043, OV-051 | TODO |
| 54 | [OV-054 — Hội thoại trung lập kênh WEB/FACEBOOK](OV-054-channel-neutral-conversations.md) | P0 | OV-002, OV-014 | DONE |
| 55 | [OV-055 — Phiên khách website ẩn danh](OV-055-anonymous-website-session.md) | P0 | OV-054 | DONE |
| 56 | [OV-056 — API nhắn tin website](OV-056-website-messaging-api.md) | P0 | OV-055 | DONE |
| 57 | [OV-057 — Chat công khai `/chat`](OV-057-public-website-chat-ui.md) | P0 | OV-056 | DONE |
| 58 | [OV-058 — AI trả lời trên website](OV-058-ai-website-response-delivery.md) | P0 | OV-017, OV-056 | DONE |
| 59 | [OV-059 — Staff trả lời hội thoại WEB](OV-059-staff-website-reply.md) | P0 | OV-001, OV-015, OV-058 | DONE |
| 60 | [OV-060 — Checkout/status/handoff trên website](OV-060-website-checkout-status-handoff.md) | P0 | OV-021, OV-025, OV-027, OV-054, OV-058 | DONE |
| 61 | [OV-061 — Lịch sử nội dung và WAITING_CHANNEL](OV-061-content-history-waiting-channel.md) | P1 | OV-030, OV-032, OV-035, OV-036, OV-046 | DONE |
| 62 | [OV-062 — Bằng chứng E2E website-first](OV-062-website-first-e2e-evidence.md) | P2 | OV-035, OV-036, OV-057, OV-059, OV-060, OV-061 | BLOCKED |
| 63 | [OV-063 — IPN VNPay sandbox thật](OV-063-vnpay-sandbox-ipn.md) | P2 | OV-024 | BLOCKED |

## Lịch sử tiến độ và kiểm chứng

- Current: {'DONE': 53, 'IN_PROGRESS': 0, 'TODO': 7, 'BLOCKED': 3}.
- 2026-09-13: website-first implementation DONE through OV-061. OV-062 BLOCKED on Next `.env` vs local migrations. OV-051 Meta live, OV-063 VNPay sandbox IPN remain BLOCKED. No Graph, no production charge.
- OV-001/002/003/004: pure domain rules hoàn tất; chưa đồng nghĩa Facebook/VNPay integrations đã chạy.
- OV-005: local schema verified17 permission tests và3 upgrade preservation tests; remote DB không thay đổi.
- OV-031: one generation regression + existing pipeline tests pass.
- Latest combined targeted validation:12files239tests pass; full project lint pass. Full media/E2E validation ở OV-047, không dùng các số này thay live proof.
- Review bổ sung OV-047: tách môi trường Linux khỏi source fixesOV-042; dependency và release closure được kiểm lại.

- OV-047: Linux snapshot51files582tests/typecheck/lint pass; predates auth/jobs. OV-006:31tests + actual local browser/HTTP pass. Sources corrected to multi-source per final user statement;049/050 added before implementation.

- Latest local database regression: six completed schema suites143assertions pass (staff17, audit18, jobs29, Facebook15, settings17, catalog47), with existing local audit history present. This is separate from older Linux media snapshot and does not prove live Facebook/VNPay behavior.

- Latest local database regression:16 suites446 assertions passed, including retained synthetic audit/history fixtures. OV-028 public provider and OV-050 compiled worker proofs are recorded in their issues. Latest Linux media snapshot is being rebuilt and tested; no new full-suite pass claimed yet.

- New Linux snapshot TypeScript/lint pass;889 tests pass,1 real-MP4 verifier fixture times out at5s,4 opt-in integration cases skipped. OV-047 reopened for focused diagnosis; no full-suite green claim.

- OV-047 reopened issue resolved: immutable07e7995c plus sole metadata-test deadline fix, network-disabled full run passes TypeScript/lint and890tests (4 opt-in skipped),107.08s. Production Next build of base image also passes with10 filesystem-tracing warnings tracked inOV-043. Latest consultation/campaign changes are outside this snapshot.

- OV-016 DONE after independent review and parent12unit/actualREST +24SQL assertions PASS; invalidstock and hidden-spec-conflict regressions included. OV-017 starts durable grounded consultation; no Messenger sends untilOV-018.

- OV-017 DONE: planner per-SKU quotes + spec families; 25 unit + 2 local REST; consultation SQL 32 ok; verify-consultation-local PASS no sends. OV-032 DONE: passport 9, content-versions SQL 27, local REST 6; VALID is not render/publish. OV-018 DONE local fake Graph (SQL 55, vitest 9); live Meta tester BLOCKED as limitation. OV-021 DONE confirmation SQL 19 + vitest 26. OV-033 DONE Wikimedia/license gates (Pexels/Unsplash keys missing fail-closed). OV-046 BLOCKED AT-046-04 Linux MP4 (01-03 pass). Next: 019, 022, 034.
