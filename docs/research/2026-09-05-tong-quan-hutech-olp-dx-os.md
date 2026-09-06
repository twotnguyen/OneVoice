# Tổng quan cuộc thi HUTECH và OLP PMNM 2026 theo mô hình DX-OS

Ngày nghiên cứu: **05/09/2026**, giờ Việt Nam. Đây là bản tổng hợp bổ sung, giữ nguyên tài liệu cũ. Phạm vi là chủ đề, thể lệ, tài liệu tập huấn và ý nghĩa đối với việc chuẩn bị sản phẩm; không đánh giá trạng thái triển khai OpenCorp.

## Kết luận

Đội cần chứng minh một quy trình doanh nghiệp chạy xuyên suốt, có người chịu trách nhiệm, dữ liệu đáng tin cậy và AI tham gia xử lý công việc. Với OLP quốc gia, quy trình đó cần nằm trong DX-Lab thể hiện đủ H–P–D–I và đáp ứng tiêu chí phát triển phần mềm nguồn mở. Với HUTECH, bài toán thực tiễn, quy trình tích hợp và mức độ hoàn thiện chiếm tổng cộng 65/100 điểm trong slide tập huấn.

Theo bối cảnh bạn cung cấp, cuộc thi HUTECH là chặng tuyển chọn trước khi trường cử đội đi OLP. Về thể lệ, hai cuộc thi có quy mô đội, lịch và cách chấm riêng. Đạt giải trường không đủ để suy ra mọi thành viên tự động có suất OLP; danh sách cuối cùng do trường quyết định.

## 1. Tài liệu đã khảo sát và cách sử dụng

| Tài liệu trong dự án | Cách sử dụng |
|---|---|
| [Slide nền tảng](../slides/clb-mnm-slide-2026.html) | Đọc nội dung về nguồn mở, đề OLP, cách chấm; kiểm tra lại quy định bằng VFOSSA |
| [Slide buổi 2](../slides/clb-mnm-slide-buoi2-boc-de.html) | Đọc đầy đủ phần giải thích DX-OS và định hướng đội tuyển; phân biệt lời khuyên giảng dạy với thể lệ |
| [Slide buổi 3](../slides/clb-mnm-slide-buoi3-ke-hoach-cuoc-thi.html) | Bản kế hoạch có lịch cũ; dùng để đối chiếu thay đổi |
| [Phổ biến thể lệ và đề tài mẫu](../slides/cuoc-thi-pho-bien-va-de-tai-mau.html) | Nguồn nội bộ chính cho lịch mới, rubric, hồ sơ và ví dụ nghiệp vụ |
| [Bản lưu VFOSSA](../official/vfossa-dx-os-2026.md) | Đối chiếu bài công bố chủ đề trực tiếp trên web |
| [Giáo trình hợp nhất](../official/dx-os-source-notes.md) | Khảo sát mục lục 82 phần, đọc trọng tâm định nghĩa, HPDI, quản trị, kiến trúc và triển khai; không tuyên bố đã kiểm chứng mọi công thức trong giáo trình |
| [Tổng quan OLP](../official/olp-2026-overview.md), [lịch sử](../official/olp-history.md) | Tài liệu tổng hợp, không thay thế thể lệ năm 2026 |
| [AIOS notes](aios-notes.md), [PDF công ty AI](ai-enterprise-model.pdf) | Gợi ý ý tưởng; PDF không có text layer, đã kết xuất và đọc 15 trang bằng hình ảnh |
| [License notes](open-source-license-notes.md), [links](links.md) | Ghi chú học tập và đầu mối tham khảo; không dùng đường dẫn danh sách đăng ký riêng tư cho nghiên cứu công khai |
| [Báo cáo có sẵn](dx-os-olp-2026-report.md) | Giữ lại thông tin tuyển chọn và yêu cầu nội bộ mà báo cáo ghi là đã được người dùng xác nhận; không coi đó là xác minh web mới |

Thứ tự ưu tiên: thể lệ/thông báo BTC hiện hành → bài công bố chính thức → slide nội bộ → giáo trình phương pháp luận → ghi chú, ví dụ và nhận định nghiên cứu. Nếu nguồn xung đột, ghi rõ thay vì trộn thành một quy định mới.

## 2. DX-OS và sản phẩm DX-Lab

Trong tài liệu cuộc thi, DX-OS là kiến trúc vận hành doanh nghiệp kết nối con người, quy trình, dữ liệu và AI. Từ “hệ điều hành” dùng như phép ẩn dụ về lớp phối hợp các thành phần trong tổ chức. DX-Lab là môi trường thực hành mô phỏng kiến trúc đó trên một tình huống nghiệp vụ có thể trình diễn. [VFOSSA công bố chủ đề](https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html).

| Không gian | Nội dung theo tài liệu | Bằng chứng demo đề xuất |
|---|---|---|
| H – Human | Định danh tập trung, không gian làm việc, lưu trữ P.A.R.A, cổng nội bộ | Người dùng có vai trò khác nhau, quyền truy cập phù hợp, tài liệu nghiệp vụ được tổ chức |
| P – Process | Luồng công việc theo sự kiện, chuyển giao giữa bộ phận, ràng buộc chống lỗi | Một yêu cầu đi qua các trạng thái, đúng người phụ trách, chặn thao tác không hợp lệ |
| D – Data | Dữ liệu chuẩn hóa, nhất quán, dashboard | Cùng mã khách/yêu cầu trên các bước; dashboard tính từ bản ghi thật |
| I – Intelligence | AI đọc dữ liệu và sự kiện, truy xuất tri thức, thực hiện hành động trong phạm vi cấu hình | Sự kiện kích hoạt AI phân loại hoặc đề xuất; hệ thống lưu kết quả và chuyển đúng bước tiếp theo |

Cột cuối là diễn giải của nghiên cứu, không phải bảng chức năng BTC bắt buộc nguyên văn. SSO, P.A.R.A và các nhóm công cụ H/P/D/I được bài VFOSSA mô tả rõ; cần ánh xạ chúng trong hồ sơ quốc gia thay vì chỉ đổi tên menu thành H, P, D, I.

“Open-Core” trong ngữ cảnh đề gắn với việc lựa chọn và lắp ghép nền tảng qua API, có dữ liệu và quy trình liên thông. Tài liệu chưa giải quyết chi tiết mọi tình huống pha trộn thành phần đóng. Vì thế không suy ra từ tên này rằng giấy phép thương mại hay mọi SaaS đều tự động được chấp nhận.

Giáo trình đặt nền quản trị bên cạnh công nghệ: **5 RÕ** gồm vai trò, trách nhiệm, quy trình, tiêu chuẩn, công cụ; **3 Chuyên – 2 Thức** gồm chuyên môn, chuyên nghiệp, chuyên tâm, tỉnh thức, tri thức. Với sản phẩm, nên chuyển chúng thành phân quyền, người chịu trách nhiệm, điều kiện chuyển trạng thái, tiêu chí đầu ra và kho tri thức. [Giáo trình DX-OS](https://opendigitransform.gitbook.io/dx-os), đối chiếu mục 3.2–3.3 trong bản lưu địa phương.

Nguyên tắc Human-in-the-loop giữ con người ở vị trí thiết kế, giám sát và phê duyệt ngoại lệ. Một agent tự phân loại yêu cầu, tra cứu dữ liệu và tạo bản nháp vẫn thể hiện tự động hóa; bước cam kết quan trọng có thể đợi người có thẩm quyền. Số lượng agent không phải thước đo trực tiếp mức độ đạt DX-OS.

## 3. HUTECH: lịch, sản phẩm, cách chấm

Trang [HUTECH IT Event](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14) xác nhận đối tượng là sinh viên HUTECH, đội dự kiến 2–4 người, mỗi sinh viên một đội, có thể đăng ký một người hướng dẫn. Mục tiêu là ứng dụng thực tiễn về số hóa doanh nghiệp, AI và tự động hóa; yêu cầu tham gia tập huấn và tuân thủ bản quyền, dữ liệu, đạo đức AI. Trang hiện ghi đăng ký đã đóng.

| Mốc | Thời gian | Nguồn và tình trạng |
|---|---|---|
| Hạn đăng ký dự kiến | 02/08/2026 | HUTECH IT Event và slide |
| 5 buổi trực tiếp | 04, 11, 18, 25/08 và 01/09; 13:30, E1.03.11 | Slide phổ biến mới |
| 2 buổi online | 08/09 và 15/09; 20:00 | Slide phổ biến mới |
| Bán kết online | 17/09/2026, 19:00 | Slide mới và nội dung Facebook bạn cung cấp; web sự kiện chưa xác nhận riêng mốc này |
| Chung kết | 02/10/2026, 12:30 | Thời gian khớp web HUTECH |
| Phòng chung kết | E1-02.10 | Slide/Facebook; trường địa điểm trên website hiện “Chưa xác định”, cần thông báo BTC chốt |

Tính theo ngày 05/09, còn 12 ngày lịch tới bán kết và 27 ngày tới chung kết. Lịch 09/09–16/09 và 3 buổi online trong slide buổi 3 là phiên bản cũ so với bộ phổ biến và thông báo bạn gửi; không dùng nó để lập lịch hiện tại.

Rubric **theo slide nội bộ**, chưa tìm thấy bảng đầy đủ trên trang HUTECH đã truy cập:

| Tiêu chí | Điểm | Bằng chứng nên chuẩn bị – đề xuất |
|---|---:|---|
| Tính thực tiễn và giá trị doanh nghiệp | 25 | Người sử dụng cụ thể, quy trình trước đây, vấn đề và số đo |
| Hoàn thiện, ổn định, trải nghiệm | 20 | Luồng chạy trọn vẹn, dữ liệu mẫu, xử lý lỗi dễ hiểu |
| Tự động hóa và tích hợp | 20 | Sự kiện/API, chuyển giao, dữ liệu không phải chép lại |
| AI phù hợp, hiệu quả, an toàn | 15 | Nhiệm vụ rõ, bộ đánh giá, trường hợp sai và cách chuyển người xử lý |
| Sáng tạo, mở rộng | 10 | Đóng góp riêng và một ví dụ thay đổi quy trình |
| Hồ sơ, trình bày, demo, phản biện | 10 | Hồ sơ đầy đủ, demo đúng thời lượng, giải thích được quyết định thiết kế |

Ba mục đầu cộng thành 65 điểm. Đây là phép cộng từ rubric để định hướng ưu tiên, không phải lời hứa đạt điểm. Có doanh nghiệp thật hay demo đẹp cũng không bảo đảm điểm tối đa.

Theo slide mới, hồ sơ gồm mã nguồn hoặc cấu hình với hướng dẫn cài đặt/vận hành; mô tả bài toán, người dùng, kiến trúc, quy trình, AI và dữ liệu vào/ra; video tối đa 5 phút, slide, tài khoản thử nghiệm nếu có. Cần công bố thành phần nguồn mở và dịch vụ bên thứ ba, dùng dữ liệu được phép. Chung kết dành 10 phút trình bày/demo và 5 phút phản biện. Bán kết yêu cầu mô tả, link chạy thử hoặc video, sơ đồ quy trình và slide. Chưa có bằng chứng hiện tại về giờ khóa nộp hồ sơ riêng, mẫu nộp cuối cùng hay thời lượng bán kết.

Báo cáo cũ của dự án ghi **public repository và giấy phép OSI-approved bắt buộc từ bán kết**, với nguồn là xác nhận trước đây của bạn. Bản nghiên cứu này giữ điều kiện đó cho việc chuẩn bị nội bộ, đồng thời không gắn nhãn “website HUTECH đã xác nhận”. Tương tự, cơ chế xét giải/năng lực để chọn đội OLP được giữ như thông tin nội bộ có sẵn.

## 4. OLP PMNM quốc gia: yêu cầu riêng

[Thể lệ VFOSSA 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html) quy định mỗi trường tối đa 2 đội, mỗi đội tối đa 3 sinh viên và có giảng viên dẫn dắt. Sản phẩm nguồn mở, kho mã công khai và khả năng build/cài đặt từ source là phần trọng yếu.

| Giai đoạn | Lịch công bố |
|---|---|
| Công bố đề chi tiết | Tháng 11/2026 |
| Chấm kho mã | 07–09/12/2026 |
| Chung kết/trình diễn PMNM | 10/12/2026 |
| Kết quả và trao giải | 11/12/2026 |

Chương trình OLP chung diễn ra 08–11/12 tại VKU, Đại học Đà Nẵng; việc chấm repo PMNM từ 07/12 là hoạt động riêng trước đó. [Thông báo OLP](https://www.olp.vn/tin-t%E1%BB%A9c/olympic-icpc/th%C3%B4ng-b%C3%A1o).

**Chủ đề DX-OS đã công bố; đề chi tiết theo lịch vẫn ở tháng 11.** Trong các nguồn đã kiểm tra, chưa tìm thấy đặc tả nghiệp vụ chi tiết bổ sung. Sản phẩm HUTECH nên tạo nền tảng có thể thích ứng; chưa có cơ sở bảo đảm mang nguyên demo hiện tại đi quốc gia là đủ.

| Phần chấm | Các mục | Tổng |
|---|---|---:|
| PoF/kho mã | Quản lý mã công khai 5; license 10; phiên bản/release 5; build 10; thư viện/phụ thuộc 10; tài liệu 10 | 50 |
| Sản phẩm/chung kết | Nguyên gốc; hoàn thiện; thân thiện; phát triển bền vững; trình diễn và cộng đồng — mỗi mục 10 | 50 |

PoF có các điều kiện xét chấm và mức trừ cụ thể. Không nên diễn giải thành “mất bất kỳ một điểm là loại”, cũng không bỏ qua tính loại trừ của điều kiện nguồn mở/truy cập nguồn. Hồ sơ nên có LICENSE, thông tin license cho tệp do đội viết, dependency inventory, hướng dẫn build sạch, release, README, changelog và bug tracker. Đây là cách chuyển rubric thành việc chuẩn bị; không phải mọi tên file đều là mẫu bắt buộc.

Điều khoản định dạng release trong bản thể lệ liệt kê ZIP cùng RAR/ARJ ở nhóm định dạng bị trừ; nếu định nộp ZIP, cần BTC giải thích. Không tự coi đó là lỗi đánh máy để bỏ qua.

## 5. Những điểm dễ hiểu sai khi đọc tài liệu

1. **Cuộc thi trường và quốc gia:** HUTECH 2–4 người, OLP tối đa 3; rubric và lịch khác nhau. Điều kiện chọn thành viên cuối cùng thuộc trường.
2. **Ví dụ giáo trình và bài thi nguồn mở:** Giáo trình có Google Workspace/AppSheet/Gemini để thực hành phương pháp luận. Đây không phải danh sách công nghệ được BTC quốc gia phê duyệt cho mọi cách dùng.
3. **Public code và nguồn mở:** OSI xét quyền dùng, sửa, phân phối theo giấy phép; chỉ nhìn thấy code không đủ. n8n tự mô tả cơ chế fair-code/Sustainable Use License, nên cần xét đúng thành phần và phiên bản thay vì mặc định mọi thứ tự host đều OSI. [OSI](https://opensource.org/osd), [n8n công bố giấy phép](https://blog.n8n.io/announcing-new-sustainable-use-license/).
4. **Cloud model API:** Chưa tìm được quy định công khai trả lời dứt điểm cách dùng mô hình thương mại trong bài quốc gia. Không tự kết luận bị cấm hoặc chắc chắn được chấp nhận. Giữ cấu hình dịch vụ rõ ràng và hỏi BTC về điều kiện đánh giá; bản chạy dùng mock phải được ghi là mô phỏng.
5. **SSOT:** Slide cảnh báo nhiều kho dữ liệu để chống các bản ghi mâu thuẫn. Diễn giải kỹ thuật hợp lý là có nguồn chuẩn và cơ chế đồng bộ rõ ràng; cache, bản sao đọc hoặc chỉ mục tìm kiếm không tự động vi phạm nguyên tắc này.
6. **Agentic AI:** Quyền dùng công cụ cần gắn với dữ liệu/quy trình và giới hạn trách nhiệm. Tạo nhiều chức danh CEO/CTO AI không tự chứng minh hiệu quả kinh doanh.
7. **Các tỷ lệ trong tài liệu:** PDF trang 11 ghi 75%, 55–60%, 35–40%; AIOS notes có bảng chi phí/thời gian và ví dụ 18 agent. Không có phương pháp đo hoặc bằng chứng kèm theo đủ để dùng chúng làm kết quả thực nghiệm của đội.
8. **Ngôn ngữ giáo trình:** Các mô tả “0 đồng”, “không sai sót”, tỷ lệ HPDI hay ví dụ ROI là tuyên bố/phương pháp của tài liệu. Không chuyển thành cam kết chi phí, hiệu quả hoặc chuẩn kỹ thuật đã được kiểm nghiệm cho sản phẩm.

## 6. Hiểu tài liệu AI trong thư mục đúng vai trò

PDF trình bày mục tiêu → tổ chức agent → điều phối → thực thi → giám sát → mở rộng; Paperclip được đề xuất làm lớp điều hành nhiệm vụ, ngân sách và phê duyệt. Trang 10–15 nêu rõ cần bổ sung hệ thống nghiệp vụ và hạ tầng để thành Enterprise OS. Vì vậy ý tưởng này cung cấp một cách triển khai phần I và một phần P; các năng lực cụ thể của Paperclip chưa được chạy thử trong nghiên cứu này.

Tài liệu AIOS giúp hình dung harness, skill, shared context, handoff và quality gate. Những cách phân biệt chatbot/agent trong đó được đơn giản hóa để giảng dạy; không nên dùng như phân loại kỹ thuật tuyệt đối cho mọi sản phẩm AI hiện nay.

## 7. Hệ quả cho việc chọn phạm vi sản phẩm

Đây là đề xuất nghiên cứu, chưa phải roadmap được chốt:

- Chọn một tổ chức/ngành cụ thể và một quy trình có đầu vào, người phụ trách, bước kiểm soát, đầu ra và thước đo rõ ràng.
- Dựng một luồng hoàn chỉnh đi qua H/P/D/I; tích hợp số thành phần cần thiết để giải quyết vấn đề đó.
- Trình diễn cả đường thành công và một ngoại lệ: dữ liệu thiếu, quyền không đủ hoặc AI không chắc chắn.
- Đo thời gian xử lý, sai sót, số thao tác thủ công và chi phí AI trên cùng tập tình huống trước/sau. Ghi số mẫu và điều kiện thử, không lấy số liệu mẫu trong slide làm thành tích.
- Chuẩn bị repo, hướng dẫn chạy và video song song với sản phẩm. Mốc đóng băng nội bộ trước 17/09 là lựa chọn của đội, không phải hạn nộp do BTC đã xác nhận.

Ví dụ minh họa trong bán lẻ: yêu cầu tư vấn → AI trích nhu cầu và tra cứu danh mục → nhân viên bổ sung thông tin → tạo báo giá nháp → quản lý duyệt điều kiện ngoại lệ → lưu đơn/yêu cầu → dashboard theo dõi và chăm sóc sau bán. H thể hiện vai trò/quyền; P thể hiện trạng thái và phê duyệt; D giữ dữ liệu nhất quán; I thực hiện phần hiểu ngôn ngữ và gợi ý. Đây chỉ là ví dụ để hiểu kiến trúc, không chốt ngành hoặc chức năng cho dự án.

## 8. Những thông tin cần BTC làm rõ tiếp

- Mẫu hồ sơ, đường dẫn và giờ khóa nộp bán kết; thời lượng trình bày bán kết.
- Phòng chung kết do website hiện chưa xác định, trong khi slide ghi E1-02.10.
- Cách xét giải/năng lực thành viên để chọn danh sách OLP, đặc biệt đội 4 người.
- Phạm vi dịch vụ AI thương mại được dùng và điều kiện tái lập bài quốc gia.
- Chi tiết đề quốc gia tháng 11 và cách giải thích một số mục PoF.

Những khoảng trống này không ngăn đội chuẩn bị một sản phẩm thực tiễn và repo nguồn mở ngay bây giờ. Thông tin Facebook được sử dụng từ bản bạn chép và đối chiếu slide; chưa xác minh trực tiếp toàn bài trên Facebook.

Đối chiếu web chi tiết nằm trong [ghi chú nguồn chính thức](2026-09-05-official-contest-source-audit.md). Báo cáo này chỉ thêm tài liệu nghiên cứu, không sửa các nguồn gốc hay tạo commit.
