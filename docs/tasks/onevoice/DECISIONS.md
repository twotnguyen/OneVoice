# OneVoice — quyết định sản phẩm sau phỏng vấn

Nguồn chuẩn mới cho kế hoạch trong thư mục này. Không tự suy các câu trả lời đồng ý ngắn thành chức năng ngoài câu hỏi. Phỏng vấn đã kết thúc; các lựa chọn kỹ thuật còn lại do người triển khai quyết định và ghi lại.

## 1. Sản phẩm và triển khai

**Đã xác nhận:** Một bản cài đặt phục vụ một doanh nghiệp; trước mắt một Facebook Fanpage và CSDL Supabase hiện có, ngành máy tính/phụ kiện. Doanh nghiệp khác nhận mã nguồn và triển khai trên máy chủ riêng, cấu hình dữ liệu/thương hiệu của họ. Không dùng một máy chủ SaaS cho nhiều doanh nghiệp đăng ký. Khả năng áp dụng nhiều nơi là portability/configurability, không bắt buộc multi-tenancy. Bản đầu gồm cả chăm sóc khách và marketing, không chỉ video desk.

Facebook Messenger hỗ trợ riêng tư; comment quan tâm hỏi mua hoặc yêu cầu sau bán chỉ mời inbox. Lời khen chung không trả lời. Fanpage đã có, Meta app permissions chưa được kiểm chứng. Website/Gmail/Zalo/TikTok là định hướng tương lai; website bản đầu phục vụ quản lý, link xác nhận và tra cứu, chưa thêm website-chat channel.

## 2. Nhân sự và nguồn dữ liệu

**Đã xác nhận:** Manager quản lý AI, bật/tắt automation, yêu cầu đăng, sửa sản phẩm/giá/tồn/khuyến mãi/chính sách. Staff chỉ xử lý hỗ trợ và cập nhật đơn/giao hàng/bảo hành. Lưu dữ liệu thành công thì AI dùng ngay; không chờ duyệt. Bản đầu có giao diện quản lý quen thuộc.

**Sửa theo lời người dùng cuối cuộc phỏng vấn: «Không chỉ lấy từ csdl».** OneVoice phải dùng được nhiều nguồn tri thức ngoài CSDL hiện tại. Câu diễn giải DB-only trước đó bị thay thế; không coi các câu đồng ý ngắn là xác nhận hạn chế này. Marketing tiếp tục có nguồn xu hướng bên ngoài.

**Mặc định triển khai, không phải xác nhận trực tiếp:** Manager thêm nội dung tri thức và URL nguồn doanh nghiệp/hãng tin cậy; ingestion có nguồn, phiên bản, thời điểm lấy và hạn sử dụng. AI tư vấn dùng những nguồn này cho giải thích/thông số/chính sách đã cấu hình. Giá bán, tồn, khuyến mãi hiệu lực và trạng thái đơn/bảo hành phải theo dữ liệu vận hành doanh nghiệp; nguồn ngoài không tự ghi đè. Nguồn mâu thuẫn/hết hạn phải báo thiếu kiểm chứng hoặc handoff, không tự chọn thông tin có lợi. Tra web tùy ý theo mọi câu hỏi chưa được bật mặc định.

Supabase thực tế hiện chứa ảnh dưới dạng URLs, không Storage objects. Người dùng chấp nhận tiếp tục dùng link. Tư liệu bổ sung bên ngoài được phép nhưng bản đầu chỉ miễn phí có quyền sử dụng phù hợp.

## 3. Chăm sóc và chuyển người

**Đã xác nhận:** AI hỏi nhu cầu, tư vấn/so sánh chi tiết, trả lời chính sách và tra cứu trạng thái khi đúng khách. Khách hỏi chính sách đổi trả/bảo hành -> AI trả lời. Khách yêu cầu thực hiện đổi trả/bảo hành hoặc muốn gặp người -> tạo handoff.

Yêu cầu được lưu qua đêm và hiển thị số lượng trên web. Staff nhận xử lý rồi mở ứng dụng gốc để trả lời; OneVoice không có staff reply composer. AI dừng toàn cuộc hội thoại từ lúc request WAITING_STAFF, không đợi claim, không trả lời câu khác. Staff hoàn tất trong OneVoice mới cho AI tiếp tục.

Chưa rõ nhu cầu -> hỏi thêm. Thiếu facts doanh nghiệp -> giải thích cần kiểm tra, handoff và dừng. Lookup lỗi -> thử lại có giới hạn, không thành công thì handoff. Ghi knowledge gaps cho manager bổ sung; không bịa/cam kết.

## 4. Đơn, thanh toán, bảo hành

**Đã xác nhận:** Chưa có phần mềm doanh nghiệp ngoài; OneVoice xây phần quản lý tối thiểu để nhân viên cập nhật orders/shipping/warranty. Không mở rộng thành ERP/logistics. Doanh nghiệp tự giao hàng.

AI thu đủ thông tin khách chốt đơn -> tạo link kiểm tra/xác nhận. VNPay là phương thức bản đầu. Chỉ khi khách xác nhận và VNPay báo thanh toán thành công mới PREPARING; không cần staff duyệt. Giữ tồn 15 phút từ lúc bắt đầu thanh toán, hết hạn chưa paid thì trả tồn khả dụng. Lookup order/shipping/warranty phải xác minh khách. AI không quyết định chấp thuận return/warranty.

## 5. Marketing tự động và thủ công

**Đã xác nhận:** Mặc định khi automation được bật, OneVoice tự đề xuất nội dung/thời điểm, tạo kịch bản/bài/video và đăng Facebook Fanpage. Manager được pause để yêu cầu quảng bá sản phẩm/chương trình khác ngay. Sau ưu tiên, kể cả xong, vẫn PAUSED tới manager bật lại.

Manager chọn độc lập: (a) hệ thống tự chọn mục tiêu/sản phẩm hoặc manager đặt mục tiêu; (b) hệ thống chọn giờ/tần suất hoặc manager đặt cap/windows. Cần theo dõi content engagement lẫn khách nhắn và đơn paid; manager chọn mục tiêu tối ưu.

Có tìm xu hướng bên ngoài. Được làm nội dung bắt trend không quảng bá trực tiếp, trong topics được phép/cấm và brand voice manager thiết lập. Trước đăng kiểm dữ liệu: tự sửa/tạo lại nếu phù hợp; không phù hợp thì bỏ lượt và tạo lượt thay thế. Không bắt duyệt lại bởi người vì trái quyết định tự đăng.

Video: motion graphics chủ đạo, ghép ảnh/video thật theo nội dung. HyperFrames là hiện trạng; Remotion chưa là yêu cầu. Không mặc định AI sinh video quang thực/AI presenter/lip-sync. Không stock trả phí, không paid advertising.

## 6. Mặc định kỹ thuật do người triển khai chọn

Các mục dưới đây KHÔNG phải câu trả lời trực tiếp của người dùng. Có thể điều chỉnh qua issue khi code/provider constraints chứng minh cần thiết.

- Vietnamese UI/content ban đầu, timezone Asia/Ho_Chi_Minh cấu hình được, tiền VND nguyên; không hardcode laptop-only.
- Authentication dựa Supabase Auth và server-verified active staff profile; không public signup. Manager bootstrap bằng công cụ quản trị có hướng dẫn, không tạo credentials mặc định.
- Giữ organization_id hiện có làm scope bản cài đặt, không xóa catalog để đổi kiến trúc. Actor/organization từ trusted server, không từ body.
- Status lookup: order từ Messenger gắn Page+PSID; hỏi mã đơn/điện thoại và đối chiếu owner. Đơn cũ chưa binding chuyển staff xác minh, không tự mua OTP service hay lộ dữ liệu chỉ qua số điện thoại.
- Link khách opaque, hạn dùng và hash at rest; checkout totals server authoritative; IPN xác minh mới paid, late payment vào exception manager, không tự refund/fulfill.
- Mặc định tồn/SKU: có variants thì đơn chọn variant active và giữ tồn variant; tồn product là tổng hiển thị (null nếu có variant chưa rõ số lượng), không bán thêm từ một bucket product song song. Product không variants có thể dùng chính product làm SKU. Giá biến thể được dùng khi khách chọn biến thể. OV-022 bổ sung invariant reserved vào cùng đường cập nhật kho.
- Không AI tự hủy/hoàn tiền/giảm giá; yêu cầu ngoại lệ chuyển người. Staff operational transitions chỉ thay state hợp lệ.
- PostgreSQL jobs/outbox cho nghiệp vụ cần atomic persistence; không đổi render file queue trước khi có adapter rõ. At-least-once jobs + dedup; timeout remote không tự gửi lại mù.
- Automation chưa tự đăng ngay sau cài app khi thiếu Page/brand/sources; manager bật một lần sau setup. Đây là setup gate, không duyệt từng nội dung.
- Knowledge gaps bền vững và manager xem trong giao diện hỗ trợ/knowledge; evidence/version giữ tại các hành động.
- First-known-touch attribution, unknown nếu thiếu nguồn; không suy từ lượt xem. Không thay thế metric unavailable bằng 0; không tuyên bố có conversion causal proof.
- Nguồn trend social phải có capability thực tế; RSS bổ sung tin tức nhưng không đóng giả thống kê social trends. Không crawler vượt login/quyền; ghi blocker khi provider chưa cho phép.
- Lịch retry, token TTL và API versions là cấu hình có giới hạn; xác minh tài liệu provider hiện hành trong task tích hợp.

## 7. Hoãn sau bản đầu

Nhiều Page, các channel TikTok/Zalo/Gmail/web-chat; phần mềm ERP ngoài; SaaS multi-tenancy/self-signup/subscription; nhân viên reply trong OneVoice; approvals marketing nhiều tầng; paid stock/ads; full video editor, avatar/lip-sync/livestream; logistics provider integration. Không tự đưa các mục này vào implementation.
