# OneVoice — Ý tưởng đề tài cập nhật

> Trạng thái: định hướng sản phẩm đã thống nhất để tiếp tục đặc tả và triển khai.
>
> Bối cảnh demo: cửa hàng máy tính.

## 1. Tóm tắt ý tưởng

**OneVoice là hệ điều hành marketing và bán hàng AI nguồn mở cho doanh nghiệp Việt Nam.**

Hệ thống tự phát hiện cơ hội kinh doanh từ dữ liệu sản phẩm, tồn kho và khuyến mãi; biến cơ hội đó thành chiến dịch nội dung có kiểm soát; tiếp nhận khách hàng từ các kênh tương tác; tư vấn, thu thập thông tin và tạo đơn nháp; sau đó truy vết kết quả bán hàng ngược về nội dung và chiến dịch đã tạo ra khách hàng.

Thông điệp chính:

> **Từ tín hiệu kinh doanh đến đơn hàng — trong một luồng dữ liệu có kiểm soát và truy vết được.**

OneVoice không được định vị là một công cụ tạo nội dung, chatbot hay phần mềm đăng bài riêng lẻ. Giá trị của sản phẩm nằm ở việc nối toàn bộ hành trình **dữ liệu → cơ hội → chiến dịch → nội dung → tương tác → tư vấn → đơn hàng → đo lường** thành một vòng khép kín.

## 2. Bài toán doanh nghiệp

Một cửa hàng thường vận hành bằng nhiều “ốc đảo” dữ liệu:

- Cấu hình và hình ảnh sản phẩm nằm trong bảng tính hoặc website.
- Tồn kho và chương trình khuyến mãi được theo dõi ở nơi khác.
- Nhân viên phải tự nghĩ hôm nay nên quảng bá sản phẩm nào.
- Công cụ đăng nội dung chỉ đo lượt xem, lượt thích và bình luận.
- Chatbot hoặc hộp thư không biết khách đến từ chiến dịch nào.
- Đơn hàng không giữ được nguồn nội dung đã tạo ra khách hàng.
- Giá hoặc khuyến mãi thay đổi nhưng nội dung đã tạo có thể vẫn dùng dữ liệu cũ.

Khoảng đứt quan trọng nhất là: **marketing tạo tương tác nhưng doanh nghiệp không theo dõi xuyên suốt tương tác đó đến đơn hàng và doanh thu.**

## 3. Đối tượng sử dụng

Đối tượng chính là doanh nghiệp từ startup đến vừa và lớn có hoạt động bán hàng qua nội dung số. Bản demo tập trung vào cửa hàng máy tính vì:

- Dữ liệu cấu hình, giá và tồn kho có cấu trúc rõ ràng.
- Hình ảnh sản phẩm thật thường đã có sẵn.
- Câu hỏi của khách hàng có thể kiểm chứng bằng dữ liệu.
- Có thể trình diễn đầy đủ hành trình từ nội dung đến đơn hàng.

Các vai trò chính:

- **Quản lý:** cấu hình quy tắc, duyệt chiến dịch, xem kết quả.
- **Nhân viên marketing:** chọn sản phẩm hoặc sử dụng đề xuất của AI, chỉnh sửa và duyệt nội dung.
- **Nhân viên bán hàng:** tiếp quản những cuộc hội thoại khó hoặc hành động rủi ro.
- **Khách hàng:** nhận tư vấn, cung cấp thông tin, kiểm tra và xác nhận đơn.

## 4. Vòng đời nghiệp vụ khép kín

1. Đồng bộ dữ liệu sản phẩm, giá, tồn kho, khuyến mãi và chính sách.
2. Phát hiện một tín hiệu hoặc cơ hội kinh doanh.
3. AI đề xuất mục tiêu, sản phẩm, thông điệp và kênh của chiến dịch.
4. Sinh bài viết, hình ảnh hoặc video theo hai chế độ tự động và có hướng dẫn.
5. Truth Guard kiểm tra độ mới và tính nhất quán của dữ liệu.
6. Máy soát trước; người có quyền xem lại và duyệt nội dung.
7. Xếp lịch và xuất bản qua adapter của từng nền tảng.
8. Gom bình luận và tin nhắn về hộp thư OneVoice, kèm nguồn chiến dịch.
9. AI tư vấn dựa trên dữ liệu đã được doanh nghiệp phê duyệt.
10. AI thu thập họ tên, số điện thoại, địa chỉ, sản phẩm và lựa chọn giao nhận.
11. Hệ thống tạo đơn nháp và gửi đường dẫn để khách kiểm tra, chỉnh sửa và xác nhận.
12. Đơn hàng giữ liên kết với nội dung và chiến dịch đã tạo ra khách.
13. Kết quả bán hàng và tồn kho quay lại Opportunity Engine để hỗ trợ quyết định tiếp theo.

## 5. Hai chế độ tạo chiến dịch

### 5.1. Tự động

Hệ thống theo dõi các sự kiện trong dữ liệu và tự đề xuất hành động, ví dụ:

- Sản phẩm còn tồn kho cao.
- Khuyến mãi sắp hết hạn.
- Sản phẩm bán chậm trong một khoảng thời gian.
- Sản phẩm đang được nhiều khách hỏi nhưng chưa có nội dung phù hợp.
- Một chiến dịch có nhiều tương tác nhưng ít đơn hàng và cần thay thông điệp.

AI chuẩn bị đề xuất và nội dung nhưng không tự thực hiện hành động có rủi ro nếu chưa được cấp quyền.

### 5.2. Có hướng dẫn

Nhân viên chủ động chọn:

- Sản phẩm hoặc nhóm sản phẩm.
- Chương trình khuyến mãi.
- Mục tiêu chiến dịch.
- Đối tượng khách hàng.
- Kênh và định dạng nội dung.

AI dựa trên lựa chọn này để viết nội dung hoặc dựng video, sau đó chuyển sang bước kiểm tra và phê duyệt.

## 6. Các nâng cấp tạo khác biệt

### 6.1. Opportunity Engine — phát hiện cơ hội kinh doanh

Opportunity Engine không “đăng bài mỗi ngày cho đủ lịch”. Nó biến tín hiệu dữ liệu thành một cơ hội có lý do rõ ràng.

Một cơ hội cần lưu:

- Tín hiệu kích hoạt.
- Dữ liệu được sử dụng.
- Sản phẩm hoặc chương trình liên quan.
- Mức ưu tiên.
- Mục tiêu đề xuất.
- Người hoặc quy tắc có quyền phê duyệt.

Ví dụ:

> Acer Nitro V còn 15 máy, cao hơn ngưỡng tồn kho; chương trình giảm giá còn ba ngày. Đề xuất video ngắn tập trung vào RTX 4060 và màn hình 144 Hz.

MVP chỉ cần một số trigger cấu hình được. Không xây một nền tảng workflow tổng quát.

### 6.2. Content Passport — hộ chiếu nội dung

Mỗi bài viết, hình ảnh hoặc video có một hồ sơ truy vết riêng, bao gồm:

- Sản phẩm và phiên bản dữ liệu nguồn.
- Giá, tồn kho và khuyến mãi tại thời điểm tạo.
- Template, model và cấu hình AI đã sử dụng.
- Người tạo, người chỉnh sửa và người duyệt.
- Thời điểm duyệt, xuất bản và nền tảng đích.
- Bình luận, tin nhắn và khách hàng tiềm năng phát sinh.
- Đơn hàng và kết quả được ghi nhận từ nội dung.

Content Passport giúp trả lời bốn câu hỏi:

1. Nội dung nói dựa trên dữ liệu nào?
2. Ai đã duyệt nội dung đó?
3. Nội dung kéo về những khách hàng nào?
4. Nội dung tạo ra đơn hàng hoặc kết quả gì?

### 6.3. Truth Guard — rào chắn dữ liệu đúng và còn hiệu lực

Truth Guard kiểm tra dữ liệu tại nhiều thời điểm:

- Khi AI tạo nội dung.
- Trước khi nhân viên duyệt.
- Ngay trước khi xuất bản theo lịch.
- Trước khi AI trả lời khách.
- Trước khi tạo đơn nháp.

Nếu giá, tồn kho hoặc khuyến mãi đã thay đổi, hệ thống có thể:

- Chặn xuất bản.
- Đánh dấu nội dung đã lỗi thời.
- Đề nghị tạo lại phần bị ảnh hưởng.
- Yêu cầu người có quyền xác nhận ngoại lệ.

Tình huống trình diễn nổi bật:

> Video được tạo với giá 19,9 triệu. Quản lý đổi giá thành 18,9 triệu trước giờ đăng. OneVoice phát hiện phiên bản dữ liệu không còn hợp lệ và chặn lịch đăng cho đến khi nội dung được cập nhật hoặc phê duyệt lại.

### 6.4. AI tư vấn có bằng chứng

Mỗi câu trả lời quan trọng của AI cần gắn với dữ liệu đã được doanh nghiệp duyệt, ví dụ:

- SKU hoặc bản ghi sản phẩm được dùng.
- Thời điểm dữ liệu được cập nhật.
- Chính sách hoặc chương trình được áp dụng.
- Mức tin cậy hoặc trạng thái đủ/thiếu bằng chứng.

AI phải chuyển người thật khi:

- Không tìm được dữ liệu đáng tin cậy.
- Khách hỏi ngoài phạm vi đã cấu hình.
- Có mâu thuẫn giữa các nguồn dữ liệu.
- Khách yêu cầu thương lượng hoặc ngoại lệ chính sách.
- Hành động liên quan đến xác nhận tiền, hoàn tiền hoặc cam kết pháp lý.

### 6.5. Content-to-Cash Attribution — truy vết từ nội dung tới đơn hàng

Mỗi tương tác cần giữ được ngữ cảnh nguồn:

```text
Opportunity → Campaign → Content → Interaction → Lead → Draft Order → Order
```

Dashboard không chỉ báo lượt xem mà cần trả lời:

- Nội dung nào tạo ra cuộc hội thoại?
- Cuộc hội thoại nào trở thành khách hàng tiềm năng?
- Chiến dịch nào tạo ra đơn hàng?
- Kênh nào đáng tiếp tục đầu tư?

Đây là dữ liệu đầu vào cho vòng chiến dịch tiếp theo, không chỉ là báo cáo cuối kỳ.

## 7. Nhà máy nội dung và video AI

### Nội dung văn bản

AI sinh bài viết theo dữ liệu thật, mục tiêu, nhóm khách hàng, kênh và giọng điệu của doanh nghiệp. Nội dung được kiểm tra về:

- Giá và cấu hình.
- Tình trạng tồn kho.
- Thời hạn khuyến mãi.
- Tuyên bố quá mức hoặc không có bằng chứng.
- Nhãn hoặc thông báo nội dung AI khi cần.

### Video quảng bá

Hướng ưu tiên là video programmatic thay vì AI Human trong MVP:

- Dùng ảnh sản phẩm thật của cửa hàng.
- AI viết kịch bản từ dữ liệu sản phẩm và mục tiêu chiến dịch.
- **Revideo** dựng bố cục, chuyển động, chữ và phụ đề.
- **VieNeu-TTS** tạo giọng đọc tiếng Việt chạy local.
- Chuẩn hóa cách đọc các thuật ngữ như RTX, CPU, RAM, SSD và giá tiền.
- Một template có thể tạo nhiều video nhưng vẫn dùng dữ liệu mới nhất.

AI Human, lip-sync và livestream được giữ ở lộ trình sau, không phải phần chứng minh cốt lõi.

## 8. Chăm sóc khách hàng và chốt đơn

AI được phép đi tới bước tạo đơn nháp, bao gồm:

- Xác định nhu cầu, ngân sách và mục đích sử dụng.
- Tư vấn dựa trên danh mục sản phẩm và chính sách hiện hành.
- Thu thập họ tên, số điện thoại, địa chỉ và ghi chú giao hàng.
- Xác nhận lại sản phẩm, cấu hình, số lượng và hình thức nhận hàng.
- Tạo đường dẫn đơn hàng để khách tự kiểm tra và xác nhận.

Nguyên tắc quyền quyết định:

- **Khách hàng** là người xác nhận thông tin và đặt hàng.
- **AI** không tự thay khách xác nhận đơn.
- **AI** không tự kết luận tiền đã được nhận.
- **Nhân viên hoặc cổng thanh toán** xác nhận trạng thái thanh toán.

MVP sử dụng COD làm mặc định. Nếu doanh nghiệp yêu cầu đặt cọc, hệ thống có thể tạo yêu cầu thanh toán hoặc QR kèm mã tham chiếu, nhưng việc đối soát tiền thật để sau hoặc do người có quyền xác nhận.

## 9. Ánh xạ với mô hình DX-OS H–P–D–I

| Không gian | Thể hiện trong OneVoice |
|---|---|
| **H — Nhân sự** | Vai trò, phân quyền, phê duyệt, tiếp quản hội thoại, xác nhận ngoại lệ và lịch sử trách nhiệm |
| **P — Quy trình** | Trigger, trạng thái, Truth Guard, lịch đăng, chuyển người, đơn nháp và quy tắc chốt đơn |
| **D — Dữ liệu** | Nguồn sự thật cho sản phẩm, giá, tồn kho, khuyến mãi, khách hàng, nội dung và đơn hàng |
| **I — Trí tuệ** | Phát hiện cơ hội, sinh nội dung, tư vấn có bằng chứng và đề xuất chiến dịch tiếp theo |

Kiến trúc cần ưu tiên open-core, self-host và adapter để có thể thay thế từng dịch vụ hoặc nền tảng mà không làm mất trục dữ liệu lõi.

## 10. Phạm vi MVP

MVP phải chứng minh **một lát cắt xuyên suốt**, không chạy theo số lượng tính năng:

- Khoảng 10 sản phẩm máy tính với cấu hình, ảnh, giá và tồn kho.
- Một chương trình khuyến mãi có thời hạn.
- Một trigger phát hiện cơ hội.
- Tạo một nội dung hoặc video thật.
- Content Passport cho nội dung đó.
- Truth Guard kiểm tra thay đổi giá hoặc khuyến mãi.
- Một bước phê duyệt có phân quyền.
- Một kênh tương tác thật hoặc adapter demo đáng tin cậy.
- Hộp thư giữ được nguồn chiến dịch.
- AI tư vấn, có bằng chứng và biết chuyển người.
- Thu thập đủ thông tin khách hàng.
- Tạo đơn nháp và trang xác nhận đơn.
- COD; đặt cọc chỉ ở mức yêu cầu hoặc QR minh họa.
- Dashboard truy vết được nội dung → hội thoại → đơn hàng.

## 11. Phần để sau MVP

- Đăng tự động lên nhiều nền tảng cùng lúc.
- Thanh toán và đối soát ngân hàng thật.
- AI Human, lip-sync và livestream.
- OCR hóa đơn kế toán.
- Hermes hoặc DevOps Agent tự vận hành hạ tầng.
- Phân tích nâng cao trên nhiều doanh nghiệp.
- Tự tối ưu ngân sách quảng cáo.
- Workflow builder tổng quát.

Các phần này chỉ được bổ sung sau khi lát cắt từ cơ hội tới đơn hàng đã ổn định.

## 12. Kịch bản demo đề xuất

1. Mở dashboard cửa hàng máy tính.
2. Opportunity Engine phát hiện Acer Nitro V còn tồn 15 máy và khuyến mãi còn ba ngày.
3. AI giải thích lý do đề xuất chiến dịch.
4. Hệ thống tạo video bằng dữ liệu và ảnh thật.
5. Nhân viên xem Content Passport và bấm duyệt.
6. Thay đổi giá sản phẩm trước giờ đăng để Truth Guard phát hiện nội dung lỗi thời.
7. Cập nhật hoặc duyệt lại nội dung, sau đó xuất bản.
8. Khách hỏi: “Máy này chơi Valorant ổn không?”.
9. AI trả lời bằng cấu hình có nguồn, đồng thời hỏi thêm nhu cầu.
10. Khách cung cấp họ tên, điện thoại, địa chỉ và lựa chọn sản phẩm.
11. AI tạo đơn nháp; khách mở đường dẫn và xác nhận COD.
12. Dashboard hiển thị đơn hàng được truy vết về video và cơ hội tồn kho ban đầu.

Toàn bộ phần trình diễn phải là một câu chuyện duy nhất, không chuyển qua nhiều demo nhỏ rời rạc.

## 13. Bằng chứng thực tiễn cần thu thập

Không tự đặt ra số liệu thành công. Nhóm cần đo trước và sau khi thử nghiệm:

- Thời gian nhân viên chọn sản phẩm và chuẩn bị một chiến dịch.
- Thời gian tạo một bài viết hoặc video.
- Thời gian phản hồi đầu tiên cho khách.
- Tỷ lệ câu trả lời đúng dữ liệu sản phẩm trong bộ câu hỏi kiểm thử.
- Số trường hợp Truth Guard phát hiện dữ liệu cũ hoặc mâu thuẫn.
- Tỷ lệ cuộc hội thoại có đủ thông tin để tạo đơn nháp.
- Tỷ lệ nội dung, tương tác và đơn hàng truy vết đầy đủ được nguồn.

Cần có tối thiểu một cửa hàng hoặc người vận hành bán hàng xác nhận bài toán, góp ý luồng và cho phép sử dụng dữ liệu mẫu đã ẩn thông tin nhạy cảm.

## 14. Liên hệ với thang điểm

| Tiêu chí | Cách OneVoice chứng minh |
|---|---|
| Tính thực tiễn và giá trị doanh nghiệp | Đối tác cửa hàng, dữ liệu thật, vấn đề thật và số đo trước/sau |
| Hoàn thiện và trải nghiệm | Một luồng demo xuyên suốt, không có màn hình hoặc bước chỉ kể bằng lời |
| Quy trình tự động hóa và tích hợp | Trigger → duyệt → đăng → hội thoại → đơn hàng → phản hồi dữ liệu |
| AI phù hợp, an toàn và có trách nhiệm | Grounding, bằng chứng, Truth Guard, phân quyền, chuyển người và audit log |
| Sáng tạo và khả năng mở rộng | Content Passport, Content-to-Cash Attribution và kiến trúc adapter/open-core |
| Hồ sơ, trình bày và phản biện | Tài liệu kiến trúc, license audit, bộ kiểm thử AI, demo 5 phút và tài khoản thử nghiệm |

## 15. Điểm khác biệt khi phản biện

### Khác công cụ tạo nội dung hoặc xếp lịch

OneVoice không dừng ở lượt xem và tương tác. Hệ thống giữ ngữ cảnh từ dữ liệu sản phẩm tới đơn hàng và đưa kết quả quay lại vòng marketing.

### Khác chatbot hoặc hộp thư bán hàng

OneVoice biết khách đến từ nội dung, chiến dịch và cơ hội kinh doanh nào; câu trả lời được ràng buộc bằng dữ liệu đã duyệt.

### Khác giải pháp SaaS đóng

Lõi dữ liệu và quy trình có thể tự host, có adapter mở, audit được dependency và giảm phụ thuộc nhà cung cấp.

### Khác một chatbot gắn thêm dashboard

AI chỉ là lớp trí tuệ trên một quy trình, mô hình dữ liệu, phân quyền và cơ chế kiểm soát đã được thiết kế rõ ràng.

## 16. Câu giới thiệu 30 giây

> Một cửa hàng có thể biết mình còn 15 chiếc laptop và khuyến mãi chỉ còn ba ngày, nhưng dữ liệu đó chưa tự biến thành doanh thu. OneVoice phát hiện cơ hội, tạo chiến dịch và video từ dữ liệu thật, kiểm tra giá trước khi đăng, giữ nguồn khi khách nhắn tin, tư vấn có bằng chứng và tạo đơn để khách xác nhận. Khi có đơn, cửa hàng biết chính xác nội dung nào đã tạo ra khách hàng. Đó là một vòng marketing-to-order khép kín, nguồn mở và do doanh nghiệp kiểm soát.

## 17. Nguyên tắc đóng băng phạm vi

Một tính năng mới chỉ được đưa vào MVP nếu nó giúp chứng minh ít nhất một mắt xích trong chuỗi:

```text
Tín hiệu → Chiến dịch → Nội dung → Tương tác → Đơn hàng → Học lại
```

Nếu tính năng không làm luồng này hoàn chỉnh hơn, an toàn hơn hoặc đo lường được hơn, nó được chuyển sang giai đoạn sau.
