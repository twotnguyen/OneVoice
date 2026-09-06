# Đề xuất dự án FlowProof: giảm công việc làm lại khi doanh nghiệp ứng dụng AI

Ngày nghiên cứu: 05/09/2026. Trạng thái: **đề xuất để thảo luận**, chưa chốt thiết kế, chưa triển khai. Tên FlowProof là tên làm việc, chưa kiểm tra nhãn hiệu. Bản này bổ sung cho [tổng quan cuộc thi](2026-09-05-tong-quan-hutech-olp-dx-os.md) và [đối chiếu thị trường](2026-09-05-enterprise-ai-market-evidence.md).

## 1. Đề xuất một chủ đề

**FlowProof — DX-Lab mã nguồn mở kiểm soát bàn giao công việc Human+AI và giảm chi phí làm lại giữa các phòng ban.**

Một nhân viên dùng AI tạo tài liệu rất nhanh, nhưng người nhận phải kiểm chứng số liệu, bổ sung điều kiện và hỏi lại dữ liệu thiếu. Sản phẩm đề xuất tổ chức cả vòng tạo, kiểm tra, bàn giao, trả sửa và cải tiến quy trình. Đơn vị đo là một hồ sơ nghiệp vụ được bên nhận chấp nhận, với chất lượng đáp ứng tiêu chí, thay vì số văn bản hoặc số lần gọi AI.

Giả thuyết khác biệt: kết hợp tiêu chí nghiệm thu của phòng ban nhận việc, bằng chứng nguồn có phiên bản, số liệu làm lại và thử lại các tình huống sau khi sửa quy trình, áp dụng vào một nghiệp vụ SME Việt Nam. Đây là giả thuyết về cách tập trung sản phẩm, không phải bằng chứng chưa có đối thủ.

## 2. Doanh nghiệp đang ứng dụng AI như thế nào

| Nhóm ứng dụng | Bằng chứng công khai | Phân loại |
|---|---|---|
| Nhân sự và dịch vụ nội bộ | IBM AskHR hỗ trợ hỏi chính sách và các giao dịch nhân sự, kết nối hệ thống nghiệp vụ; người xử lý nhu cầu phức tạp | Case study do IBM công bố [1] |
| Chăm sóc khách hàng, giao dịch | Nhóm Nubank mô tả các agent production trong giao thẻ, quản lý thẻ và hỗ trợ khách hàng | Nghiên cứu của nhóm triển khai, không phải kiểm toán độc lập [2] |
| Kỹ thuật và sản xuất | Siemens mô tả Industrial Copilot hỗ trợ kỹ sư thyssenkrupp và vận hành nhà máy | Công bố nhà cung cấp/khách hàng, có cả nội dung triển khai và kế hoạch [3] |
| AI trên nhiều chức năng | McKinsey 2026 ghi nhận khoảng cách giữa năng suất cá nhân và tác động tài chính toàn doanh nghiệp | Khảo sát tự báo cáo, không phải đo trực tiếp mọi công ty [4] |

Từ các nguồn này, có thể suy luận bài toán triển khai đã vượt khỏi tạo nội dung: doanh nghiệp cần dữ liệu phù hợp, tích hợp hành động, xử lý ngoại lệ và xác định kết quả đạt yêu cầu. Không suy ra mức trưởng thành của tập đoàn quốc tế giống SME Việt Nam.

## 3. Vấn đề được chọn có bằng chứng gì

- Khảo sát Zapier công bố 14/01/2026: 58% người trả lời dành ít nhất ba giờ/tuần sửa đầu ra AI. Mẫu 1.100 người dùng AI tại Mỹ, làm ở doanh nghiệp từ 250 nhân viên; dữ liệu thu tháng 11/2025. Không dùng tỷ lệ này làm ước lượng cho SME Việt Nam. [5]
- BetterUp/Stanford mô tả “workslop”: đầu ra trông hoàn chỉnh nhưng khiến người nhận phải xử lý bổ sung. Nghiên cứu dựa trên khảo sát 1.150 nhân viên bàn giấy toàn thời gian tại Mỹ tháng 9/2025. [6]
- McKinsey công bố 25/08/2026: 80% người trả lời nói AI cải thiện năng suất cá nhân, 37% ghi nhận tác động tích cực tới EBIT của tổ chức. Đây không phải bằng chứng toàn bộ chênh lệch do workslop gây ra. [4]

Vấn đề làm lại đã tồn tại trước AI. Giả thuyết cần kiểm tra là AI tăng tốc tạo đầu ra nhưng chất lượng đầu vào cho bước kế tiếp không tăng tương ứng. Lỗi cũng có thể đến từ quy trình, tài liệu lỗi thời hoặc người dùng; không tự gán mọi lần trả sửa cho AI.

## 4. Ba hướng đã cân nhắc

| Hướng | Lý do hấp dẫn | Lý do chọn hoặc bỏ |
|---|---|---|
| Trung tâm quản lý nhiều agent | Đúng xu hướng AI doanh nghiệp | Trùng mạnh ServiceNow/IBM và nhiều nền tảng; phạm vi rộng, khó chứng minh lợi ích riêng |
| Đối soát lời hứa với khách khi dữ liệu đổi | Demo dễ hiểu, gần doanh thu | Sierra Horizon, Salesforce OMS và các nền tảng commitment đã có năng lực gần; không chọn làm luận điểm mới |
| Bàn giao Human+AI, đo làm lại, cải tiến có kiểm chứng | Bằng chứng vấn đề rõ; thể hiện liên phòng ban; có thí nghiệm trước/sau | **Khuyến nghị**, nếu thu được quy trình và mẫu hồ sơ thực tế |

Quyết định là đánh giá phù hợp cuộc thi và khả năng kiểm chứng, không phải xếp hạng thị trường định lượng.

## 5. Kiểm tra trùng và giới hạn tính mới

| Sản phẩm/nguồn | Phần đã có | Ý nghĩa đối với đề xuất |
|---|---|---|
| Pensero [7] | Đo AI, chất lượng, rework trong phát triển phần mềm | Không tuyên bố sáng tạo ra đo rework hoặc AI ROI |
| Milestone [8] | Gắn chi phí AI với vòng đời phát triển, chất lượng và kết quả | Dashboard chi phí riêng lẻ không đủ khác biệt |
| RedHub [9] | Bảng tính chi phí workslop và bộ kiểm tra bàn giao | Không tuyên bố checklist bàn giao hay tính chi phí là mới |
| Zapier [5] | Khuyến nghị và công cụ phối hợp ngữ cảnh, QA, phê duyệt | Không thể chỉ ghép automation rồi gọi đó là phát minh |
| Regisseur [10] | AI trong quy trình có giới hạn, bàn giao người, hồ sơ kiểm tra và đo kết quả | Đây là đối thủ gần; một workflow có guardrail chung vẫn trùng đáng kể |
| Celonis [12] | Cải tiến quy trình, điều phối người, hệ thống và AI | Không tuyên bố phát minh vòng cải tiến liên phòng ban |
| Commonly [13] | Tiêu chí nghiệm thu, bằng chứng và người nhận trong công việc Human+AI | Mô hình bàn giao có bằng chứng cũng đã có tiền lệ trực tiếp |
| Sierra Horizon [11] | Theo đuổi kết quả qua sự kiện và nhiều lần tương tác | Hướng theo dõi cam kết khách đã có sản phẩm công bố |

Các trang sản phẩm mô tả năng lực nhà cung cấp quảng bá tại ngày đọc; nghiên cứu chưa đăng ký hoặc kiểm thử. Chưa xác minh được sản phẩm nào đáp ứng trọn gói đúng phạm vi đề xuất, nhưng cũng không chứng minh không có. Nguồn mở và tiếng Việt tạo cơ hội phục vụ một nhóm người dùng, không tự động tạo tính mới kỹ thuật.

Phần đội có thể tự xây và bảo vệ trước giám khảo:

1. **Mô hình hồ sơ bàn giao:** đầu ra, nguồn, phiên bản dữ liệu, tiêu chí của bên nhận, người sở hữu, kết quả kiểm tra và lịch sử trả sửa có cùng mã nghiệp vụ.
2. **Kiểm tra phụ thuộc:** tài liệu đổi hoặc dữ liệu thiếu làm mất hiệu lực một kiểm tra cụ thể; hiển thị rõ phần cần kiểm tra lại thay vì yêu cầu đọc lại toàn bộ.
3. **Vòng cải tiến có kiểm chứng:** người nhận nêu lỗi; AI đề xuất nguyên nhân/cập nhật mẫu; người có quyền duyệt; chạy lại bộ tình huống cố định để so sánh trước khi áp dụng phiên bản mới.
4. **Bộ đánh giá tiếng Việt có công bố:** tình huống đúng/sai/mơ hồ, tiêu chí nghiệm thu và cách tính thời gian làm lại, kèm phạm vi dữ liệu được phép chia sẻ.

Đây là đóng góp dự kiến. Chỉ được ghi “đã thực hiện/hiệu quả” sau khi có sản phẩm và kết quả đo.

## 6. Pilot: báo giá B2B bàn giao sang tài chính và vận hành

Khách hàng mục tiêu giả định: doanh nghiệp bán thiết bị hoặc cung cấp dịch vụ có nhân viên dùng AI để soạn báo giá, sau đó tài chính và bộ phận thực hiện phải kiểm tra. Người nhận việc là người dùng chính để khảo sát; trưởng vận hành là người có thể hưởng lợi từ giảm số vòng sửa. Chưa chứng minh khả năng trả tiền.

Ví dụ dữ liệu demo giả lập: khách hỏi mua 20 thiết bị, giao ngày cụ thể. AI tạo báo giá từ bảng giá cũ; phí lắp đặt chưa rõ; lịch giao chưa được bộ phận vận hành xác nhận. Hồ sơ nhìn hoàn chỉnh nhưng chưa đủ để thực hiện.

Luồng đề xuất:

1. Sales nhập yêu cầu và chọn danh mục, bảng giá, chính sách có hiệu lực. AI tạo bản nháp có trường dữ liệu cấu trúc và dẫn nguồn.
2. Hệ thống kiểm tra điều kiện bàn giao: nguồn giá còn hiệu lực, tổng tiền đúng, phí được khai báo, thời gian thực hiện có căn cứ. Không mặc định “trống” nghĩa là “miễn phí”.
3. Nếu thiếu, hồ sơ trả lại đúng người kèm lý do và vị trí nguồn. Nếu đủ, chuyển tài chính rồi vận hành theo quy trình đã định.
4. Người nhận chấp nhận hoặc trả sửa bằng mã lý do; có thể phản biện kiểm tra sai của hệ thống. Hoạt động sửa có thời lượng ghi nhận riêng.
5. AI tổng hợp các nguyên nhân lặp lại và đề xuất thay đổi một mẫu đầu vào hoặc bước lấy dữ liệu. Quản lý kiểm tra và duyệt phiên bản quy trình mới.
6. Chạy lại các tình huống kiểm tra ở chế độ thử, so sánh lỗi còn lại và cảnh báo thừa. Chỉ áp dụng sau khi người có quyền đồng ý.

Điều kiện dựa trên thời điểm: không tự áp bảng giá mới để phủ nhận báo giá cũ đã được chấp thuận. Tách bản nháp, báo giá đã gửi, đã duyệt và nghĩa vụ đã hình thành; demo bán kết chỉ cần phạm vi bản nháp trước gửi khách để tránh phình nghiệp vụ.

## 7. AI làm gì và hệ thống kiểm tra gì

AI phù hợp với trích xuất yêu cầu tiếng Việt, nhận ra thông tin mơ hồ, nối nhận xét trả sửa tới phần hồ sơ liên quan và đề xuất cải tiến. Tổng tiền, thời hạn, quyền duyệt và trạng thái nên kiểm tra bằng logic xác định từ dữ liệu chuẩn. Một AI khác xác nhận “đúng” không thay thế bằng chứng.

Trường hợp không có nguồn hoặc không đủ độ chắc chắn phải hiện “chưa đủ dữ liệu” và chuyển người xử lý. Không suy đoán ai dùng AI từ văn phong; ghi nhận nguồn tạo ở các thao tác đã tích hợp hoặc do người dùng khai báo. Không dùng số liệu để tự động xếp hạng hoặc quy lỗi cá nhân.

Theo định hướng cloud API có sẵn của dự án, AI có thể gọi qua provider cấu hình. Dữ liệu đưa ra ngoài cần nằm trong phạm vi được phép; tập thi dùng dữ liệu giả lập/ẩn danh. Phạm vi model thương mại ở OLP cần tiếp tục đối chiếu BTC như báo cáo cuộc thi đã nêu.

## 8. Ánh xạ DX-OS

| Không gian | Thành phần dự kiến |
|---|---|
| H | Portal, vai trò Sales/Tài chính/Vận hành, người nhận và người duyệt; kho quy trình/biểu mẫu được tổ chức |
| P | Luồng tạo → kiểm tra → nhận việc → trả sửa/duyệt; quản lý phiên bản quy trình |
| D | Hồ sơ bàn giao, dữ liệu nguồn, lỗi và thời lượng sửa cùng mã; dashboard kết quả |
| I | Trích xuất, gợi ý sửa, phân nhóm lỗi, đề xuất cải tiến và hỗ trợ tạo tình huống kiểm tra |

Để phát triển lên OLP phải thể hiện các năng lực H đầy đủ theo bài công bố, gồm định danh tập trung và tổ chức tri thức, đồng thời bảo đảm repo/license/build. Một công cụ chấm văn bản đứng riêng sẽ chưa thể hiện toàn bộ DX-Lab.

## 9. MVP và bằng chứng nên có

MVP hướng tới bán kết: một quy trình báo giá, ba vai trò, một kiểu hồ sơ, dữ liệu bảng giá/chính sách mẫu, một giao diện bàn giao, một vòng trả sửa và dashboard. Có thể minh họa một thay đổi mẫu đã duyệt rồi thử lại; không cần tự động viết lại workflow tùy ý. Tính khả thi trong 12 ngày phụ thuộc nền tảng và năng lực đội, chưa được xác minh ở lượt nghiên cứu này.

Demo 5 phút đề xuất:

- Tạo một báo giá AI nhìn hợp lý nhưng thiếu căn cứ.
- Chỉ ra lỗi và nguồn đối chiếu; trả đúng người sửa.
- Hoàn thiện và bàn giao qua tài chính/vận hành.
- Hiện số vòng sửa và thời gian thực tế, không chỉ thời gian sinh bản nháp.
- Duyệt thay đổi mẫu, chạy lại tình huống, cho thấy cả trường hợp được sửa và trường hợp kiểm tra không nên chặn.

Đánh giá nên gồm ba chế độ trên các nhóm tình huống tương đương: quy trình hiện tại, quy trình có checklist thủ công, và FlowProof. Chế độ checklist là đối chứng quan trọng: cần biết AI có giúp thêm điều gì so với chỉ chuẩn hóa quy trình.

Các chỉ số: tỷ lệ được nhận ngay lần đầu; lỗi lọt tới bước sau; cảnh báo sai; số vòng trả sửa; phút tạo/kiểm tra/sửa; tổng thời gian hoàn thành; token/API dùng cho mỗi hồ sơ được chấp nhận. Tách chờ việc khỏi thời gian người thực sự làm. Không suy ra quan hệ nhân quả chỉ từ việc một hồ sơ có gắn nhãn AI.

Có thể bắt đầu với 20–30 tình huống giả lập có đáp án do người hiểu nghiệp vụ kiểm tra; giữ một phần chưa dùng để chỉnh prompt. Số mẫu này chỉ hỗ trợ đánh giá prototype. Sau đó cần hồ sơ thực được phép và người dùng thật; không tuyên bố phần trăm tiết kiệm trước khi đo.

## 10. Điều kiện để chốt hoặc bỏ ý tưởng

Trước khi viết nhiều code, phỏng vấn 3–5 doanh nghiệp cùng một nhóm và xin xem các hồ sơ bị trả sửa đã ẩn danh. Hỏi ai sửa, thiếu gì, mất bao lâu, lý do xảy ra, hệ thống hiện có giải quyết được chưa. Chọn phạm vi sau khi thấy lỗi lặp lại và có người muốn thử.

Nên bỏ hoặc đổi hướng nếu doanh nghiệp ít bàn giao, hồ sơ chuẩn hiện đã xử lý tốt, không có dữ liệu/nhân sự đánh giá, hoặc thêm cổng kiểm tra làm công việc chậm hơn lợi ích thu được. Nếu nhu cầu chỉ là một checklist vài trường, giải pháp tối giản có thể phù hợp hơn một nền tảng AI.

## Nguồn

[1] [IBM AskHR](https://www.ibm.com/case-studies/ibm-askhr).

[2] [Nubank: Building Customer Support AI Agents at 100M-User Scale](https://arxiv.org/abs/2606.08867).

[3] [Siemens: AI agents for industrial automation, 2025](https://press.siemens.com/global/en/pressrelease/siemens-introduces-ai-agents-industrial-automation).

[4] [McKinsey: The state of AI in 2026, 25/08/2026](https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai).

[5] [Zapier: AI workslop, 14/01/2026](https://zapier.com/blog/ai-workslop/).

[6] [BetterUp Labs/Stanford: Workslop](https://www.betterup.com/workslop).

[7] [Pensero: AI deployment](https://pensero.ai/platform/ai-deployment).

[8] [Milestone: AI feature spend attribution](https://mstone.ai/ai-feature-spend-attribution/).

[9] [RedHub: workslop calculator](https://redhub.ai/quick-kits/workslop-cost-verification-tax-calculator).

[10] [Regisseur](https://www.regisseur.ai/).

[11] [Sierra Horizon](https://sierra.ai/product/horizon).

[12] [Celonis: Process Improvement](https://www.celonis.com/platform/process-improvement).

[13] [Commonly: AI Agent Acceptance Criteria, 02/09/2026](https://commonly.me/guides/ai-agent-acceptance-criteria/).
