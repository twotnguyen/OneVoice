# Xác thực bài toán, kịch bản demo và ánh xạ thang điểm

## 1. Mục tiêu

Tài liệu này giúp đội chứng minh OneVoice không chỉ là một prototype AI đẹp mắt mà là một giải pháp:

- giải quyết pain point được người dùng thật xác nhận;
- chạy xuyên suốt từ dữ liệu đến đơn hàng;
- có cơ chế an toàn nhìn thấy được;
- có số đo và bằng chứng tái lập;
- phù hợp DX-OS và tiêu chí phần mềm nguồn mở.

## 2. Thông điệp trình bày

### Một câu

> OneVoice biến tín hiệu kinh doanh thành nội dung, hội thoại và đơn hàng trong một luồng dữ liệu có kiểm soát và truy vết được.

### Ba mươi giây

Cửa hàng đang tách rời dữ liệu sản phẩm, công cụ marketing, hộp thư và đơn hàng. OneVoice phát hiện sản phẩm cần quảng bá, tạo nội dung từ facts đã duyệt, chặn giá/khuyến mãi cũ, tư vấn khách có bằng chứng, tạo đơn nháp để khách tự xác nhận và truy ngược kết quả về chiến dịch ban đầu. Sản phẩm tự host, có adapter thay thế và con người giữ quyền ở các hành động rủi ro.

### Điểm không được nói sai

- Không nói “AI tự chốt đơn hoàn toàn”; nói “AI đưa tới đơn nháp, khách tự xác nhận”.
- Không nói “AI bảo đảm tăng doanh thu”; chỉ trình bày chỉ số đã đo.
- Không nói “dữ liệu thật của GearVN/cửa hàng đối tác” nếu chỉ có snapshot công khai.
- Không nói “hỗ trợ Facebook/TikTok/Zalo” nếu adapter chưa chạy với quyền thật; nói rõ adapter contract và trạng thái từng tích hợp.
- Không gọi attribution theo quy tắc là bằng chứng nhân quả.

## 3. Xác thực với cửa hàng

### 3.1 Đối tượng phỏng vấn

Ưu tiên một cửa hàng máy tính có:

- Catalog, bảng giá hoặc tồn kho có thể chia sẻ ở mức đã ẩn thông tin nhạy cảm.
- Fanpage/OA/kênh bán hàng và nhân viên trực inbox.
- Quy trình tạo nội dung, tư vấn và ghi đơn hiện hữu.
- Người có quyền đồng ý cho dùng dữ liệu/ảnh hoặc cho phép thử quy trình.

Nếu chưa có cửa hàng, vẫn dùng synthetic dataset nhưng phải ghi “demo giả lập”. Không dùng tên/logo doanh nghiệp để tạo cảm giác có hợp tác.

### 3.2 Kịch bản phỏng vấn 25 phút

1. Hôm qua/tuần qua, ai quyết định sản phẩm nào cần quảng bá và dựa trên dữ liệu nào?
2. Một bài viết/video từ lúc chọn sản phẩm tới lúc đăng mất bao lâu và qua mấy người?
3. Giá, tồn và khuyến mãi thay đổi được thông báo cho marketing/inbox như thế nào?
4. Đã từng có bài hoặc câu trả lời dùng thông tin cũ chưa? Hậu quả là gì?
5. Khách thường hỏi năm nhóm câu nào? Câu nào nhân viên mới dễ trả lời sai?
6. Khi bot/nhân viên không biết, hiện tại chuyển ai và người đó nhận được ngữ cảnh gì?
7. Từ bình luận/tin nhắn đến đơn hàng, những thông tin nào phải thu và nhập ở đâu?
8. Cửa hàng biết bài nào tạo ra đơn hay chỉ đo tương tác?
9. Khâu nào tốn thời gian hoặc rơi khách nhiều nhất?
10. Nếu OneVoice chỉ giải quyết tốt một luồng trong hai tuần, luồng nào đáng thử nhất?

Không hỏi dẫn dắt “anh/chị có muốn AI làm X không?”. Hỏi hành vi, ví dụ gần nhất, thời gian và hậu quả.

### 3.3 Bằng chứng cần xin

- Sơ đồ quy trình hiện tại đã ẩn thông tin nhạy cảm.
- 5–10 câu hỏi khách hàng thường gặp.
- Một bảng sản phẩm/policy mẫu hoặc quyền dùng subset.
- Ảnh chụp màn hình đã che PII về điểm đứt, nếu được phép.
- Biên bản/ghi chú xác nhận pain point và phản hồi prototype.
- Consent riêng nếu quay/ghi âm/trích dẫn tên người/doanh nghiệp.

## 4. Kế hoạch đo trước–sau

### 4.1 Task chuẩn

Cho người vận hành thực hiện cùng một task bằng quy trình hiện tại và OneVoice:

> Chọn một sản phẩm phù hợp chương trình sắp hết hạn, tạo nội dung đúng facts, trả lời ba câu hỏi khách và chuẩn bị một đơn COD.

### 4.2 Chỉ số

| Chỉ số | Baseline | OneVoice | Bằng chứng |
|---|---|---|---|
| Thời gian chọn sản phẩm/cơ hội | Stopwatch + screen record | Cùng điều kiện | Video/log opportunity |
| Thời gian tạo nội dung đã duyệt | Từ bắt đầu đến approval | Audit timestamps | Passport/audit |
| Critical claim correctness | Checklist SKU/giá/spec/promotion | Eval cùng facts | Claim/Evidence report |
| Thời gian phản hồi đầu tiên | Message timestamps | Interaction log | Export đã mask |
| Unknown/risky handoff đúng | Bộ câu hỏi cố định | Eval result | Reason code/evidence gap |
| Đủ trường tạo Draft Order | Conversation checklist | Schema validation | Fixture/report |
| Lineage completeness | Kiểm thủ công | Query Passport | Trace screenshot/query |

Không kết luận về doanh thu nếu thời gian/pilot không đủ. Dùng wording “giảm thời gian trong task thử nghiệm” thay vì “tăng hiệu suất doanh nghiệp” khi chỉ đo lab.

## 5. Kịch bản dữ liệu demo

### Phương án A — dữ liệu synthetic kiểm soát hoàn toàn

- Hero product có tồn kho 15, promotion còn ba ngày ở clock cố định.
- Version v12 giá 19,9 triệu; version v13 giá 18,9 triệu.
- Dùng để chứng minh stale-price block tái lập.
- UI và slide ghi “dữ liệu mô phỏng cửa hàng máy tính”.

### Phương án B — snapshot GearVN có provenance

- ASUS V16 V3607VJ-TK189W, giá snapshot 26.490.000 đồng, quantity snapshot 3.
- Promotion 5% kết thúc 02/09/2026.
- Ở thời điểm 08/09/2026, Truth Guard phát hiện promotion đã hết hạn.
- Dùng để chứng minh data freshness; không đăng quảng cáo thật và không gọi là tồn kho hiện tại.

Khuyến nghị: bán kết dùng A để demo xác định; slide phụ dùng B làm bằng chứng dữ liệu thực tế có thể cũ và cần Truth Guard.

## 6. Storyboard demo 5 phút — bán kết/video

| Thời gian | Hành động trên màn hình | Điều phải chứng minh |
|---:|---|---|
| 0:00–0:25 | Nêu điểm đứt: marketing, inbox và đơn không chung ngữ cảnh | Bài toán dễ hiểu |
| 0:25–0:55 | Dashboard hiện opportunity và lý do từ tồn/promotion | AI/rule bắt đầu từ dữ liệu |
| 0:55–1:30 | Marketing tạo content; mở claims/Evidence/Passport | Không phải text generator mù |
| 1:30–2:05 | Manager duyệt; đổi giá hoặc clock; worker thử publish và bị Truth Guard chặn | Poka-yoke nhìn thấy được |
| 2:05–2:30 | Regenerate/reapprove; publish qua MockChannel hoặc adapter đã xác minh | Workflow và quyền |
| 2:30–3:20 | Khách hỏi; AI trả lời có SKU/version rồi gặp câu unknown và handoff | Grounding và biết dừng |
| 3:20–4:15 | Khách cung cấp thông tin; hệ thống tạo link; khách tự xác nhận COD | Quyền khách hàng |
| 4:15–4:45 | Mở Passport/Order lineage về content/opportunity | Content-to-Cash |
| 4:45–5:00 | Chốt H–P–D–I, nguồn mở/self-host và số đo thật | Khớp đề thi |

Không chuyển qua nhiều sản phẩm hoặc nhiều dashboard. Một câu chuyện, một correlation ID, một Order.

## 7. Storyboard demo 10 phút — chung kết

| Thời gian | Nội dung |
|---:|---|
| 0:00–0:45 | Hook bằng pain point và một bằng chứng phỏng vấn/ảnh đã được phép |
| 0:45–1:30 | Giải thích vertical slice và bốn cơ chế nguyên gốc |
| 1:30–3:00 | Opportunity → content claims → video/post artifact → approval |
| 3:00–4:10 | Fault injection giá/promotion → Truth Guard block → xử lý |
| 4:10–5:40 | Inbound interaction → grounded answer → unknown handoff |
| 5:40–7:00 | Lead → Draft Order → customer confirmation COD |
| 7:00–8:00 | Passport/attribution/audit và chỉ số thử nghiệm |
| 8:00–8:50 | DX-OS H–P–D–I và kiến trúc adapter/open-source |
| 8:50–9:35 | Phần đội tự xây, license audit và khả năng tái lập |
| 9:35–10:00 | Kết luận và roadmap production |

Thiết kế phần thao tác live khoảng bảy phút, giữ ba phút đệm cho độ trễ và chuyển cảnh.

## 8. Kế hoạch dự phòng

| Sự cố | Phát hiện trước demo | Fallback |
|---|---|---|
| Mất Internet | Healthcheck đỏ | MockAi + MockChannel + media local |
| Provider LLM lỗi/chậm | Timeout/retry status | Deterministic fixture cùng snapshot |
| TTS/render lỗi | Job failed | Subtitle-only hoặc artifact pre-rendered có Passport |
| Facebook/Zalo/TikTok lỗi quyền | Adapter health unauthorized | Không cố đăng; dùng MockChannel và nói đúng trạng thái |
| Database bẩn | Seed/version lệch | `demo:reset`, database snapshot dự phòng |
| Máy chính lỗi | Không boot/project không build | Máy thứ hai + video MP4 local |
| Demo data hết hạn ngoài ý muốn | Clock khác fixture | Controlled clock trong demo environment |
| QR/payment không chạy | Gateway unavailable | COD; không giả lập trạng thái paid |

Mỗi fallback phải được rehearsal, không chỉ ghi trên giấy.

## 9. Checklist rehearsal

### Trước lần chạy

- Commit/tag đúng bản demo, working tree được biết rõ.
- `demo:reset` hoàn thành và tài khoản role hoạt động.
- Clock, timezone, seed và hero product đúng.
- Browser tabs, zoom, notification và password manager được chuẩn bị.
- Internet/adapter/provider health được kiểm tra nhưng không nằm trên critical path.
- Video/media/fonts local; âm lượng và màn hình phụ đã thử.
- Timer, người nói, người thao tác và tín hiệu chuyển người rõ.

### Sau lần chạy

- Tổng thời gian và thời gian từng đoạn.
- Có bước nào phải giải thích vì UI không tự nói được?
- Có state/audit nào phải sửa DB tay không?
- Có claim nào không mở được Evidence?
- Có câu nào vượt quá sản phẩm thực sự chạy?
- Ghi blocker/P1/P2; bug demo cần regression test.

Gate: bán kết cần hai rehearsal liên tiếp không sửa code; chung kết cần ba rehearsal với ít nhất một người ngoài đội đóng vai giám khảo.

## 10. Ánh xạ thang điểm HUTECH

Nguồn lịch mới là [trang sự kiện HUTECH](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14). Trọng số dưới đây lấy từ [slide tập huấn buổi 3](../slides/clb-mnm-slide-buoi3-ke-hoach-cuoc-thi.html); slide đó chứa lịch dự kiến cũ nên chỉ dùng cho rubric và phải kiểm tra lại nếu Ban Tổ chức công bố thang điểm mới. Đội cần tối ưu tính thực tiễn, trải nghiệm, tự động hóa/tích hợp, AI có trách nhiệm, sáng tạo và hồ sơ; không tự suy ra điểm chắc chắn:

| Nhóm tiêu chí | OneVoice chứng minh | Artifact/bằng chứng |
|---|---|---|
| Thực tiễn và giá trị doanh nghiệp | Pain point được phỏng vấn; task baseline/after; dữ liệu có quyền | Interview notes, consent, measurement report |
| Hoàn thiện và trải nghiệm | Một vertical slice, error state rõ, customer confirm | E2E video, usability notes, release candidate |
| Tự động hóa và tích hợp | Rule → approval → outbox/adapter → inbox → order | Architecture, audit timeline, integration tests |
| AI phù hợp/an toàn | Structured facts, Evidence, Truth Guard, abstain/handoff | AI eval report, stale/unknown demo |
| Sáng tạo/mở rộng | Passport, deterministic lineage, adapter/open-core | Passport JSON/UI, ADR, roadmap |
| Hồ sơ/trình bày | Repo tái lập, docs, slide/video và phản biện | README, test report, SBOM, rehearsal log |

## 11. Ánh xạ OLP quốc gia

Tài liệu OLP hiện có mô tả 100 điểm gồm 50 điểm kho mã nguồn/PoF và 50 điểm showcase. Theo dõi thông báo chính thức tháng 11 và cập nhật khi đề chi tiết thay đổi.

### 50 điểm kho mã nguồn/PoF

| Hạng mục | Việc chuẩn bị |
|---|---|
| Kho mã nguồn truy cập được | Repo public đúng thời hạn, commit history rõ, không chứa secret |
| License OSI-approved | Project LICENSE, SPDX/header policy, third-party NOTICE |
| Build từ source | Fresh clone + documented Compose/build, pin versions và seed |
| Dependency/gói đính kèm | Lockfile, SBOM, model/media inventory, license/CVE gate |
| README/tài liệu/changelog/issues | Quickstart, architecture, testing, release notes, issue tracker |

### 50 điểm sản phẩm/showcase

| Hạng mục | OneVoice cần thể hiện |
|---|---|
| Tính nguyên gốc | Truth Guard + Passport + evidence/handoff + lineage, không phải chỉ ghép SaaS |
| Mức độ hoàn thiện | P0 chạy xuyên suốt, state/error/retry và data reset |
| Thân thiện người dùng | Vai trò rõ, lý do block dễ hiểu, khách tự xác nhận đơn |
| Phát triển bền vững | Modular monolith, adapter, contribution docs và roadmap hợp lý |
| Trình diễn/cộng đồng | Câu chuyện có doanh nghiệp, demo cuốn hút, repo và issue dễ tham gia |

## 12. Phần nguyên gốc của đội

Khi bị hỏi “đội tự viết gì?”, chỉ thẳng module, test và commit cho:

- Product/offer versioning và snapshot hash.
- Opportunity rule + explanation context.
- Content Claim/Evidence model và validator.
- Truth Guard decisions tại approve/publish/reply/order.
- Content Passport và audit timeline.
- Conversation evidence/handoff policy.
- Customer confirmation transition.
- First-touch lineage query/dashboard.
- Adapter contracts và deterministic mock.

Next.js, PostgreSQL, Revideo hoặc model là nền tảng; chúng không phải phần sáng tạo chính.

## 13. Câu hỏi phản biện cần luyện

### “Khác gì Buffer/Pancake/chatbot?”

Các công cụ đó mạnh ở từng khâu. OneVoice chứng minh lớp nối có kiểm soát: cùng version facts đi từ opportunity/content sang conversation/order, stale facts bị chặn và kết quả truy ngược được về nguồn.

### “AI có thực sự cần không?”

AI dùng cho giải thích cơ hội, sinh nội dung, hiểu câu hỏi và tạo câu trả lời. Rule/state/permission/Truth Guard vẫn là code xác định. Demo phải so sánh phần rule với phần model.

### “Tại sao không dùng n8n?”

Workflow lõi cần transaction, version, test và audit do đội kiểm soát; n8n dùng Sustainable Use License không phải OSI-approved. Có thể dùng công cụ bridge ở ngoài core sau khi audit nhưng không đặt nó làm dependency bắt buộc.

### “Dữ liệu này có thật không?”

Chỉ đúng theo nhãn: public snapshot ngày 31/08, synthetic demo hoặc store-approved. Đội không gọi public stock là inventory nội bộ; provenance xuất hiện trong UI/Passport.

### “AI trả lời sai hoặc bị prompt injection thì sao?”

Facts từ structured lookup, output schema và Evidence validator; action được server authorize; thiếu/mâu thuẫn/risky thì handoff. Prompt không thể tự cấp quyền.

### “Tại sao khách không đặt cọc?”

MVP chọn COD để chứng minh quyền xác nhận và lineage mà không giả lập payment. QR/payment chỉ được thêm khi có mã tham chiếu, webhook/idempotency và nguồn xác nhận tiền đáng tin.

### “Attribution có chứng minh nội dung tạo ra doanh thu không?”

Không. MVP dùng first-touch tracking theo quy tắc và công bố giới hạn; nó chứng minh lineage của hành trình ghi nhận, không chứng minh quan hệ nhân quả.

### “Nếu nền tảng không duyệt API?”

Core không phụ thuộc platform. Adapter contract và MockChannel chứng minh quy trình; adapter thật chỉ bật khi credential/scope/webhook đã xác minh.

## 14. Hồ sơ bàn giao cho mỗi mốc

- Release/tag và checksum artifact.
- Slide + video dự phòng đúng thời lượng.
- Kiến trúc và workflow diagram.
- Dataset/provenance/permission note.
- Test/AI-eval/fresh-install/rehearsal report.
- SBOM, dependency/model/media inventory và NOTICE.
- Interview/measurement report đã ẩn PII.
- Known issues, fallback và roadmap sau mốc.

## 15. Điều kiện sẵn sàng trình diễn

- Có một câu chuyện duy nhất từ Opportunity tới Order.
- Truth Guard và handoff được nhìn thấy, không chỉ kể.
- Customer tự xác nhận; AI không có nút/tài khoản để bypass.
- Passport mở được Evidence và lineage.
- Mọi con số tác động có phương pháp đo và artifact.
- Dữ liệu thật/snapshot/synthetic được gắn nhãn nhất quán.
- Demo offline và video dự phòng đã chạy thử.
- Phần nói khớp đúng trạng thái code/repo, không trình bày roadmap như tính năng đã có.
