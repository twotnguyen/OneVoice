https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html

Giới thiệu mô hình DX-OS và chủ đề cuộc thi Phần mềm nguồn mở OLP 2026
Thứ ba - 09/06/2026 15:02

Trong khuôn khổ khối thi Phần mềm nguồn mở Olympic Tin học Sinh viên Việt Nam 2026, mô hình DX-OS được lựa chọn làm định hướng phát triển và là cơ sở để xây dựng chủ đề cuộc thi năm nay. Việc tìm hiểu về DX-OS không chỉ giúp các đội thi nắm bắt đúng yêu cầu đề bài mà còn mở ra góc nhìn mới về vai trò của phần mềm nguồn mở trong thúc đẩy chuyển đổi số. Bài viết dưới đây sẽ giới thiệu tổng quan về mô hình DX-OS và chủ đề chính thức của cuộc thi.
Giới thiệu mô hình DX-OS và chủ đề cuộc thi Phần mềm nguồn mở OLP 2026

1. Bài toán Chuyển đổi số và Sự ra đời của Kiến trúc DX-OS
   Chúng ta đang bước vào "Kỷ nguyên vươn mình" của dân tộc, nơi Chuyển đổi số (CĐS) không còn là một lựa chọn bổ trợ để làm đẹp đội hình, mà đã trở thành một tấm vé sinh tồn bắt buộc trước áp lực đào thải khốc liệt của nền kinh tế số. Áp lực vận hành này đang siết chặt các tổ chức, từ các tầng quản lý vĩ mô của Chính phủ cho đến hơn 900.000 doanh nghiệp vừa và nhỏ (SME) trên cả nước.

Tuy nhiên, phần lớn các chương trình chuyển đổi số hiện nay đang rơi vào cái bẫy của sự "ảo tưởng công nghệ". Doanh nghiệp đổ tiền mua sắm hàng loạt phần mềm đắt đỏ nhưng nhân sự vẫn làm việc theo thói quen cũ, nhắn tin rải rác và báo cáo thủ công. Hệ quả là dữ liệu sinh ra bị giam hãm trong các ốc đảo thông tin rời rạc và hoàn toàn thất bại trong việc giải quyết bài toán chiến lược của doanh nghiệp.

Để phá tan ảo tưởng công nghệ và tránh rơi vào bẫy "rác đầu vào - rác đầu ra", Giáo trình "Xây dựng Hệ điều hành Doanh nghiệp số: Từ Tư duy đến Hành động (DX-OS in Action)" đã ra đời. Tài liệu này giới thiệu một phương pháp luận hệ thống: Chuyển đổi số bản chất là quá trình chuyển giao quyền kiểm soát từ thao tác thủ công của con người sang các thuật toán tự động. Phương pháp này được mô hình hóa thông qua cấu trúc phân bổ quyền điều khiển H-P-D-I, chia hệ thống vận hành thành 4 không gian chức năng chuyên biệt.

1.1. Cấu trúc 4 Không gian của Hệ điều hành DX-O
[H] Không gian Nhân sự - Kiến tạo Môi trường Làm việc Số Tích hợp: Đây là phân tầng vận hành cơ sở của hệ thống. Thay vì để quy trình phụ thuộc hoàn toàn vào trí nhớ, thói quen và thao tác thủ công của nhân sự, mục tiêu kiến trúc là tạo ra một môi trường làm việc số khép kín. Hệ thống áp dụng cơ chế quản trị định danh tập trung (SSO), tiêu chuẩn hóa cấu trúc lưu trữ dữ liệu tệp tin vật lý theo phương pháp P.A.R.A và thiết lập cổng thông tin nội bộ để kiểm soát độ chính xác của luồng thông tin ngay từ khâu đầu vào.

[P] Không gian Quy trình - Tự động hóa Luồng công việc: Phân tầng này tiếp nhận quyền điều khiển từ con người thông qua việc thiết lập các cấu trúc thuật toán. Chức năng cốt lõi là tự động hóa quy trình dựa trên kiến trúc hướng sự kiện, xử lý các bước chuyển giao thông tin giữa các bộ phận chức năng mà không cần thao tác thủ công. Hệ thống tích hợp các ràng buộc kỹ thuật khắt khe (Poka-yoke) để giới hạn các thao tác không hợp lệ, bảo đảm tính toàn vẹn ngay từ điểm chạm đầu vào.
Không gian Dữ liệu - Ra quyết định dựa trên sự thật: Khi Không gian [P] vận hành ổn định, hệ thống tự động kết xuất các tập dữ liệu phẳng có cấu trúc. Không gian [D] chịu trách nhiệm thu thập, làm sạch và đồng bộ hóa thành nguồn cơ sở dữ liệu sự thật duy nhất nhằm triệt tiêu hiện tượng ốc đảo thông tin. Thông qua các bảng điều khiển thời gian thực (Dashboard), cấp quản lý có thể giám sát và điều hành dựa trên số liệu định lượng cập nhật liên tục.
Không gian Trí tuệ Nhân tạo - Tiến đến Doanh nghiệp Tự hành: Đây là trạng thái kiến trúc mức độ cao nhất, định vị tổ chức ở mô hình doanh nghiệp AI-Native. Trí tuệ nhân tạo được tích hợp trực tiếp vào hệ thống dưới dạng các tác tử tự hành (Agentic AI). Hệ thống có khả năng tự phân tích tập dữ liệu từ Không gian [D], tự nhận diện sự kiện từ Không gian [P] và tự động thực thi các lệnh hành động cấu hình sẵn mà không yêu cầu tín hiệu điều khiển hay nhấp chuột từ con người.
1.2. Sự tiến hóa tuyến tính và Nguyên lý "Human-in-the-loop"
Điểm cốt lõi của phương pháp luận này là việc chỉ ra tính tuyến tính bắt buộc trong quá trình nâng cấp hệ thống. Tổ chức không thể đạt được năng lực tự động hóa ở Không gian [I] nếu chưa chuẩn hóa dữ liệu tại Không gian [D] và thiết lập ràng buộc kỹ thuật tại Không gian [P]. Việc tích hợp công nghệ AI vào một quy trình chưa được chuẩn hóa sẽ dẫn đến lỗi logic dữ liệu đầu vào (Garbage In, Garbage Out) và sinh ra ảo giác dữ liệu.

Quá trình tiến hóa này tỷ lệ nghịch với sự can thiệp thủ công của nhân sự. Khi năng lực xử lý của máy móc tại các trục [P], [D], [I] tăng lên, tỷ lệ thao tác thủ công của nhân sự (ký hiệu là hằng số [H]) sẽ sụt giảm tương ứng, từ 100% xuống còn 10-20%. Dựa trên nguyên lý "Con người trong vòng lặp" (Human-in-the-loop), nhân sự dịch chuyển vai trò sang thiết kế luồng thuật toán, kiểm soát chất lượng hệ thống, giám sát rào chắn đạo đức và phê duyệt các ngoại lệ.

2. Chủ đề Cuộc thi Phần mềm Nguồn mở OLP 2026: Xây dựng DX-Lab
   Để chuyển hóa tư duy chiến lược từ lý thuyết thành hành động thực tiễn, Hội Tin học Việt Nam và Câu lạc bộ VFOSSA chính thức công bố chủ đề cho cuộc thi OLP Phần mềm Nguồn mở (PMNM) năm 2026: Xây dựng Hệ điều hành Doanh nghiệp số (DX-OS) dựa trên kiến trúc Open-Core.

Mục tiêu của cuộc thi là định hướng sinh viên chuyên và không chuyên CNTT vận dụng các nền tảng mã nguồn mở để tự thiết kế và xây dựng một Trạm thực hành số (DX-Lab). Trạm thực hành này phải mô phỏng lại 4 không gian kiến trúc H-P-D-I, giải quyết triệt để các bài toán vận hành của doanh nghiệp.

2.1. Khai thác hệ sinh thái công nghệ OLP các năm trước
Thay vì phụ thuộc vào một danh sách các phần mềm tĩnh, Ban tổ chức yêu cầu các đội thi chủ động kết hợp với những nền tảng nguồn mở đã được khai thác trong các kỳ thi OLP trước đây để lắp ráp thành một cỗ máy vận hành hoàn chỉnh:

Ứng dụng Nền tảng Low-code/No-code (Chủ đề OLP 2024): Khai thác các nền tảng phát triển dùng ít mã nguồn (LCDP) để xây dựng biểu mẫu nhập liệu, thiết lập cơ sở dữ liệu quan hệ và tạo rào chắn kỹ thuật tại Không gian [P].
Ứng dụng Dữ liệu mở liên kết (Chủ đề OLP 2025): Tận dụng các mô hình dữ liệu liên kết (LOD) để chuẩn hóa cấu trúc siêu dữ liệu, hình thành Nguồn sự thật duy nhất cho Không gian [D].
Ứng dụng Mô hình Ngôn ngữ Lớn (Chủ đề OLP 2023): Triển khai các mô hình ngôn ngữ lớn (LLM) và kỹ thuật RAG để xây dựng tác tử thông minh, tự động hóa quy trình ra quyết định tại Không gian [I].
2.2. Quy hoạch công cụ theo Bản đồ Công nghệ DX-OS
Dựa trên kiến trúc phân bổ quyền điều khiển H-P-D-I, các đội thi cần tự chủ động nghiên cứu và tìm kiếm các giải pháp phần mềm lõi mở (Open-Core) trên Internet để thiết lập một hệ sinh thái DX-Lab hoàn chỉnh. Việc quy hoạch công cụ cần đáp ứng các nhóm chức năng cốt lõi sau:

Nhóm công cụ Không gian [H] (Nhân sự): Tìm kiếm các nền tảng mã nguồn mở chuyên về Quản trị định danh tập trung (SSO), Quản trị lưu trữ đám mây nội bộ (Cloud Storage), Hệ thống quản trị tri thức (Wiki/CMS) và Hệ thống truyền thông tức thời.
Nhóm công cụ Không gian [P] (Quy trình): Khai thác các nền tảng phát triển dùng ít mã nguồn để xây dựng giao diện, kết hợp với các Nền tảng tích hợp dịch vụ (iPaaS) và Tự động hóa luồng việc (Workflow Automation) nhằm thiết lập trục trung gian kết nối API giữa các phần mềm.
Nhóm công cụ Không gian [D] (Dữ liệu): Tìm kiếm các Hệ quản trị Cơ sở dữ liệu quan hệ/phi quan hệ để cấu trúc hóa dữ liệu tĩnh, kết hợp với các nền tảng Kinh doanh thông minh (Business Intelligence - BI) nguồn mở để thiết kế bảng điều khiển và trực quan hóa dữ liệu.
Nhóm công cụ Không gian [I] (Trí tuệ nhân tạo): Ứng dụng các thư viện học máy, cơ sở dữ liệu vector (Vector Database) và khung phát triển mô hình ngôn ngữ lớn (LLM Frameworks) nguồn mở để xây dựng kiến trúc truy xuất tri thức và thiết lập các tác tử tự hành (Agentic AI).
2.3. Phạm vi Khai thác DX-Lab
Toàn bộ hạ tầng kỹ thuật và tài liệu sản phẩm DX-Lab được xây dựng nhằm phục vụ trực tiếp cho ba nhóm tác nhân cốt lõi trong chu kỳ chuyển đổi số:

Ban lãnh đạo, Quản lý SME và Cơ quan Nhà nước: Ứng dụng khung đo lường để chẩn đoán thực trạng tổ chức, triệt tiêu các hạn chế vận hành và tối ưu hóa tỷ suất hoàn vốn (ROI) đầu tư hạ tầng công nghệ.
Chuyên gia Công nghệ và Tư vấn viên: Môi trường đóng gói và chia sẻ tri thức chuyên môn, kết nối đối tác kỹ thuật và xây dựng năng lực để tham gia vào mạng lưới tư vấn viên chuyển đổi số cấp quốc gia.
Sinh viên và Giảng viên khối ngành kỹ thuật, kinh tế số: Tiếp cận môi trường thực nghiệm giả lập (Hộp cát DX-Lab) trên các cơ sở dữ liệu thực tế của doanh nghiệp, chuyển hóa lý thuyết thành năng lực ứng dụng thực chiến. 3. Chuẩn bị cho cuộc thi PMNM - OLP 2026
Cuộc thi Phần mềm nguồn mở OLP 2026 do Hội Tin học Việt Nam và CLB VFOSSA tổ chức dành cho sinh viên chuyên hoặc không chuyên về CNTT trên toàn quốc. Mỗi đội thi gồm tối đa 3 thí sinh dưới sự dẫn dắt của một giảng viên.

Các trường tham gia cần huấn luyện đội tuyển những kỹ năng cốt lõi sau để vượt qua các tiêu chí khắt khe của cuộc thi:

3.1 Nắm vững tiêu chí loại trừ (PoF - Point of Failure)
Bài thi sẽ được chấm theo thang điểm 100, trong đó 50 điểm thuộc về Tiêu chí PoF. Sinh viên cần đặc biệt lưu ý:

Cấp phép hợp lệ: Sản phẩm phải có giấy phép OSI-approved ghi rõ trong từng tệp mã và có bản sao toàn văn giấy phép. Nếu vi phạm sẽ bị trừ điểm nặng.
Hệ thống quản lý mã nguồn: Bắt buộc sử dụng hệ thống quản lý mã nguồn công khai trên Internet. Sẽ bị trừ điểm nếu không có web viewer hoặc không được truy cập mở.
Cài đặt từ mã nguồn (Building From Source): Sản phẩm phải cho phép biên dịch và cài đặt từ mã nguồn. Thiếu hướng dẫn hoặc sử dụng công cụ nguồn đóng để dịch sẽ bị trừ điểm. Khuyến khích sử dụng các kỹ thuật container hóa (như Docker) để đóng gói hệ thống DX-Lab.
Quản lý thư viện và tài liệu: Không chỉnh sửa mã nguồn của các thư viện đính kèm. Phải có tài liệu Readme rõ ràng, lịch sử thay đổi (Changelog) và hệ thống ghi nhận lỗi (Bug tracker).
3.2 Kỹ năng giải quyết vấn đề và Trình diễn sản phẩm
Phần thi chung kết (50 điểm) sẽ được đánh giá qua hình thức lập trình hackathon và trình diễn (Showcase). Đội tuyển cần chuẩn bị:

Tư duy Kiến trúc: Lắp ghép các phần mềm mã nguồn mở một cách logic, tạo ra một giải pháp kỹ thuật có tính nguyên gốc và giải quyết đúng bài toán nghiệp vụ DX-OS.
Mức độ hoàn thiện và thân thiện: Sản phẩm DX-Lab phải chạy thực tế mượt mà, cung cấp tiện ích thân thiện cho người dùng cuối (nhân viên, quản lý).
Khả năng thu hút cộng đồng: Đội thi cần thể hiện tầm nhìn phát triển bền vững của sản phẩm và phong cách trình diễn thuyết phục để thu hút sự quan tâm của cộng đồng nguồn mở.
Cuộc thi OLP PMNM 2026 không chỉ là một sân chơi lập trình, mà là cơ hội để sinh viên tiếp cận bài toán thực tiễn của doanh nghiệp, chuyển hóa lý thuyết từ giáo trình thành năng lực ứng dụng thực chiến. Khung kiến trúc H-P-D-I cung cấp một lăng kính kỹ thuật rõ ràng để thiết kế hệ thống. Để hiểu sâu về các công thức ánh xạ, cách triển khai cấu trúc lắp ghép và các bước thiết lập mã nguồn, kính mời các đội tuyển và độc giả truy cập, tham khảo toàn văn Giáo trình Xây dựng Hệ điều hành Doanh nghiệp số (DX-OS) tại địa chỉ: https://opendigitransform.gitbook.io/dx-os.
