# Báo cáo nghiên cứu DX-OS và OLP Phần mềm nguồn mở 2026

## Kết luận quan trọng nhất

1. **DX-OS không phải hệ điều hành kiểu Windows/Linux.** Đây là một phương pháp luận và kiến trúc vận hành doanh nghiệp số, tổ chức thành bốn không gian **H–P–D–I**: con người, quy trình, dữ liệu và trí tuệ.[1][6]
2. Chủ đề chính thức cấp quốc gia của khối Phần mềm nguồn mở OLP 2026 là **“Xây dựng hệ điều hành doanh nghiệp số (DX-OS)”**. Định hướng là xây một **DX-Lab** theo kiến trúc lắp ghép/Open-Core, mô phỏng đủ H–P–D–I để giải quyết một bài toán vận hành doanh nghiệp.[1][2]
3. Cuộc thi **“Xây dựng Hệ điều hành Doanh nghiệp số AI” của HUTECH là cuộc thi cấp trường/khoa**, tách biệt với OLP quốc gia.[5] Theo thông tin bạn xác nhận từ phía HUTECH, kết quả cuộc thi được dùng để đánh giá và sàng lọc: các đội đạt giải là nguồn để trường lựa chọn đội tuyển, sau đó tiếp tục đào tạo và bồi dưỡng trước khi tham dự OLP quốc gia. Đây là cơ chế tuyển chọn nội bộ, không có nghĩa toàn bộ thành viên của mọi đội đạt giải tự động được đăng ký quốc gia.
4. Có một chênh lệch cần xử lý sớm: HUTECH cho **2–4 sinh viên/đội**, còn OLP PMNM quốc gia cho **tối đa 3 thí sinh/đội**, mỗi trường tối đa hai đội.[2][5] Nếu đội HUTECH có bốn người, trường sẽ đánh giá năng lực từng thành viên để chọn danh sách phù hợp cho OLP.
5. Không nên chờ đến tháng 11 mới làm chuẩn nguồn mở. OLP chấm **50/100 điểm chỉ từ kho mã trước chung kết**; sản phẩm tốt nhưng repository, giấy phép, build và tài liệu kém có thể mất một nửa số điểm.[2][3]

## Tôi đã kiểm tra những gì

Tôi đã đọc 12 tài liệu thực trong thư mục `references`: bốn tài liệu `official`, ba tệp Markdown và một PDF trong `research`, cùng bốn slide HTML của HUTECH. PDF `ai-enterprise-model.pdf` không có text layer nên đã được kết xuất và đọc đủ 15 trang bằng OCR/vision. Tôi cũng đối chiếu các trang chính thức của OLP, VFOSSA, HUTECH, GitBook DX-OS và repository Paperclip.

Độ tin cậy của tài liệu cục bộ không đồng đều:

- `vfossa-dx-os-2026.md` và phần lớn `dx-os-source-notes.md` là bản lưu từ nguồn VFOSSA/GitBook, phù hợp để nghiên cứu.
- `olp-2026-overview.md` là bản tổng hợp, hữu ích nhưng phải đối chiếu lại nguồn chính thức.
- `olp-history.md`, `open-source-license-notes.md` và `aios-notes.md` là ghi chú học tập; một số khẳng định không có nguồn hoặc quá tổng quát, không nên dùng như thể lệ.
- Các slide HUTECH có phiên bản cũ và mới. Lịch 09/09–16/09 trong `clb-mnm-slide-buoi3-ke-hoach-cuoc-thi.html` đã bị thay bởi lịch 17/09–02/10 trong `cuoc-thi-pho-bien-va-de-tai-mau.html` và thông báo HUTECH hiện hành.[5]

## Hiểu đúng mô hình DX-OS

| Không gian | Vai trò | Một lát cắt sản phẩm nên thể hiện |
|---|---|---|
| **H – Human** | Danh tính, vai trò, môi trường làm việc số, giao tiếp và tri thức | đăng nhập/SSO, RBAC, workspace, thông báo, tài liệu/knowledge base |
| **P – Process** | Biến công việc thành luồng có trạng thái, quy tắc, sự kiện và điểm phê duyệt | workflow từ đầu vào đến đầu ra, validation, assignment, SLA, audit trail |
| **D – Data** | Tạo nguồn dữ liệu chuẩn/SSOT và khả năng đo lường | schema rõ ràng, lịch sử thay đổi, báo cáo/dashboard, lineage hoặc nhật ký |
| **I – Intelligence** | Dùng AI/agent trên nền dữ liệu và quy trình đã chuẩn hóa | phân loại, trích xuất, gợi ý, RAG/agent, cảnh báo; hành động rủi ro phải có human approval |

Tài liệu VFOSSA mô tả công nghệ theo nhóm chứ không áp đặt một stack: H có SSO, lưu trữ nội bộ, Wiki/CMS và truyền thông; P có low-code/iPaaS/workflow; D có cơ sở dữ liệu và BI; I có ML, vector database, LLM framework, RAG và Agentic AI.[1]

Invariant quan trọng là **H → P → D → I**.[1] AI không thể cứu một quy trình chưa rõ và dữ liệu chưa chuẩn. Một hệ thống chỉ có chatbot hoặc nhiều agent nhưng thiếu workflow, SSOT, quyền hạn và audit log chưa phải DX-OS hoàn chỉnh.

“Open-Core” trong bài công bố nên được hiểu thận trọng là kiến trúc ghép các nền tảng lõi qua API/webhook, không phải giấy phép cho phép nộp thành phần đóng. Điều kiện bắt buộc của OLP vẫn là sản phẩm được phát hành theo giấy phép **OSI-approved** và mã nguồn truy cập tự do trên Internet.[2][3]

GitBook gốc dùng nhiều ví dụ Google Workspace/AppSheet/Gemini.[6][7] Đó là ví dụ triển khai phương pháp luận, không đồng nghĩa các dịch vụ đóng này phù hợp với tiêu chí nguồn mở và build từ source của OLP. Với bài quốc gia, nên ưu tiên thành phần có giấy phép rõ ràng, self-host được và có đường chạy thay thế khi không có API thương mại.

## Thể lệ OLP Phần mềm nguồn mở 2026 cấp quốc gia

- OLP 2026 là kỳ thứ 35; chương trình chính diễn ra **08–11/12/2026 tại VKU, Đại học Đà Nẵng**.[8][9]
- Khối Phần mềm nguồn mở là **khối H**, hình thức đội/hackathon; Hội Tin học Việt Nam tổ chức, VFOSSA là đơn vị thường trực.[3][4]
- Đội tối đa ba thí sinh và một giảng viên dẫn dắt; mỗi trường tối đa hai đội PMNM.[2]
- Dự kiến mở đăng ký từ đầu tháng 11 đến hết **25/11/2026**; lệ phí được thông báo là **700.000 đồng/thí sinh**, gồm VAT.[4]
- Đề nghiệp vụ cụ thể dự kiến được công bố khoảng một tháng trước chung kết. Hiện chưa có đề chính thức, nên chưa nên khóa kiến trúc vào một ngành hoặc một workflow quá đặc thù.[2][3]
- Lịch khối PMNM: chấm kho mã **07–09/12**, trình diễn/chung kết **10/12**, công bố kết quả **11/12**.[2][3]

### 50 điểm PoF — kho mã trước chung kết

| Nhóm | Điểm |
|---|---:|
| Quản lý mã nguồn công khai | 5 |
| Giấy phép nguồn mở | 10 |
| Quản lý phiên bản/release | 5 |
| Build được từ mã nguồn | 10 |
| Thư viện, phụ thuộc và bundling | 10 |
| Tài liệu kỹ thuật và giao tiếp dự án | 10 |

Thể lệ nêu các lỗi có thể bị trừ điểm như thiếu thông tin giấy phép trong từng tệp mã, giấy phép không tương thích, thiếu thông báo mục đích giấy phép hoặc thiếu toàn văn giấy phép.[2] Cách an toàn là chọn một giấy phép OSI ngay từ đầu, thêm `LICENSE`, SPDX header cho file mã do đội viết, dependency inventory/SBOM, lockfile, hướng dẫn build sạch, release có tag/changelog và issue tracker công khai.

### 50 điểm sản phẩm tại chung kết

Năm tiêu chí bằng nhau, mỗi tiêu chí 10 điểm: **nguyên gốc kỹ thuật, mức hoàn thiện, thân thiện người dùng, khả năng phát triển bền vững, trình diễn và thu hút cộng đồng nguồn mở**.[2]

Điều này có nghĩa “ghép nhiều công cụ” chưa đủ. Đội cần chỉ ra phần kỹ thuật do mình sở hữu: mô hình dữ liệu, workflow engine/adapter, chính sách quyền, orchestration, evaluation, audit hoặc cơ chế tích hợp có giá trị riêng.

## Cuộc thi HUTECH hiện tại

Trang HUTECH xác nhận mục tiêu là tạo sân chơi về mã nguồn mở, AI và tự động hóa; xây ứng dụng giúp doanh nghiệp số hóa hoạt động, quản trị dữ liệu và tăng hiệu quả vận hành. Đội dự kiến 2–4 sinh viên HUTECH, có thể có một giảng viên/chuyên gia hướng dẫn.[5]

Theo slide mới nhất trong thư mục của bạn:

- Đăng ký hết **02/08/2026**.
- Năm buổi trực tiếp: **04/08, 11/08, 18/08, 25/08, 01/09**, lúc 13:30 tại E1.03.11.
- Hai buổi online: **08/09 và 15/09**, lúc 20:00.
- Bán kết online: **19:00 ngày 17/09/2026**; hồ sơ gồm mô tả, demo, sơ đồ và slide.
- Chung kết trực tiếp: **12:30 ngày 02/10/2026 tại E1-02.10**; 10 phút demo và 5 phút phản biện.
- Hồ sơ dự thi: mã nguồn/cấu hình và hướng dẫn chạy; tài liệu bài toán–kiến trúc–workflow–AI–dữ liệu; video tối đa 5 phút; slide; tài khoản thử nghiệm nếu có; công khai thành phần nguồn mở và dịch vụ bên thứ ba; không dùng dữ liệu cá nhân/doanh nghiệp khi chưa được phép.

Mốc hoàn thành nội bộ an toàn là **ngày 16/09/2026 hoặc sớm hơn**, để ngày 17/09 chỉ dùng cho kiểm tra bản nộp và trình bày. Public repository và giấy phép OSI-approved là yêu cầu áp dụng ngay từ vòng bán kết theo thông tin bạn xác nhận.

Thang điểm HUTECH trong slide mới:

| Tiêu chí | Điểm |
|---|---:|
| Tính thực tiễn và giá trị cho doanh nghiệp | 25 |
| Hoàn thiện và trải nghiệm người dùng | 20 |
| Quy trình tự động hóa và tích hợp | 20 |
| AI phù hợp, an toàn, có trách nhiệm | 15 |
| Sáng tạo và khả năng mở rộng | 10 |
| Hồ sơ, trình bày, demo, phản biện | 10 |

Vì vậy, chiến thuật ở HUTECH không phải nhồi nhiều agent. **45 điểm nằm ở hiểu nghiệp vụ và thiết kế quy trình; thêm 20 điểm cho sản phẩm chạy mượt.** AI chỉ chiếm 15 điểm và còn phải hợp lý, an toàn, có trách nhiệm.

Tính đến 04/09/2026, còn **13 ngày tới bán kết HUTECH**, 28 ngày tới chung kết và 97 ngày tới ngày trình diễn PMNM quốc gia. Các con số này dựa trên lịch hiện hành; Ban tổ chức có thể cập nhật.

## Đánh giá hai tài liệu AI riêng trong thư mục

`aios-notes.md` diễn giải agent, skill, harness, memory, multi-agent và “AIOS”. Nó hữu ích để học khái niệm nhưng không phải tài liệu OLP/DX-OS chính thức và có nhiều con số/khẳng định không dẫn nguồn. Không nên đưa các con số đó vào pitch.

PDF `ai-enterprise-model.pdf` đề xuất “công ty AI tự vận hành” với Paperclip làm control plane cho org chart, nhiệm vụ, ngân sách, approval và audit. Paperclip hiện công bố mã nguồn MIT.[10] Ý tưởng này phù hợp nhất với **không gian I** và một phần P; chính slide PDF cũng thừa nhận còn thiếu CRM, tài chính, pháp lý, hệ nghiệp vụ và hạ tầng để thành Enterprise OS. Vì vậy Paperclip có thể là một thành phần, không nên là toàn bộ đề tài.

## Chiến lược tối ưu để đi từ HUTECH lên OLP

### Trong 13 ngày trước bán kết

1. Chọn **một** bài toán doanh nghiệp có người dùng và tổn thất đo được.
2. Vẽ một luồng end-to-end duy nhất: input → kiểm tra → xử lý/assign → lưu SSOT → dashboard → AI hỗ trợ → human approval → output.
3. Làm vertical slice chạy thật với dữ liệu mẫu; không mở rộng sang nhiều module.
4. Chuẩn bị đồng thời README, sơ đồ kiến trúc, video dưới 5 phút và kịch bản demo không phụ thuộc Internet.
5. Đo ít nhất ba chỉ số: thời gian xử lý, tỷ lệ lỗi/công việc thủ công giảm, và chi phí/tần suất can thiệp của con người.

### Ngay từ bây giờ để không phải làm lại cho OLP

- Giữ nhóm lõi tối đa ba người.
- Public Git history sạch, commit đều theo đóng góp thật.
- Chọn giấy phép OSI-approved; audit tương thích giấy phép của dependency và model/dataset.
- Build mới từ repository bằng một quy trình được tài liệu hóa; không phụ thuộc secret trong code.
- Có sample `.env`, seed data giả, backup/restore, RBAC, audit log, budget/rate limit cho AI và approval gate cho hành động rủi ro.
- Thiết kế adapter cho LLM/dịch vụ ngoài để demo vẫn chạy bằng local/mock provider.
- Định nghĩa rõ phần nguyên gốc của đội và kiểm thử phần đó.

## Cơ chế tuyển chọn HUTECH đã được xác nhận

1. Cuộc thi HUTECH là hoạt động đánh giá và sàng lọc sinh viên để hình thành đội tuyển PMNM của trường.
2. Kết quả và giải thưởng của cuộc thi là căn cứ chính để đánh giá các đội.
3. Nếu một đội có bốn thành viên, trường xem xét năng lực từng người vì đội OLP quốc gia chỉ được đăng ký tối đa ba thí sinh.
4. Public repository và giấy phép OSI-approved là bắt buộc ngay từ bán kết.
5. Bán kết diễn ra lúc **19:00 ngày 17/09/2026, online**; sản phẩm nên hoàn thành chậm nhất ngày 16/09 và tốt hơn là sớm hơn để có thời gian kiểm thử.
6. Sau bán kết, các dự án được chấm điểm; giải thưởng được công bố tại chung kết ngày **02/10/2026**. Sau đó trường lựa chọn đội tuyển và tiếp tục đào tạo, bồi dưỡng để tham dự OLP quốc gia.

## Phạm vi chưa thể xác minh

- Chưa có đề nghiệp vụ PMNM quốc gia 2026; các đề tài mẫu trong slide chỉ là gợi ý.
- Cơ chế tuyển chọn nội bộ nêu trên được cập nhật từ thông tin bạn xác nhận; tôi vẫn chưa tìm thấy văn bản công khai mô tả chi tiết cách trường quy đổi giải thưởng và năng lực cá nhân thành danh sách đội tuyển cuối cùng.
- Facebook share link không cung cấp toàn bộ nội dung qua kênh đọc công khai; các chi tiết 5 buổi trực tiếp, 2 buổi online, 17/09 và 02/10 được đối chiếu bằng slide mới trong thư mục và trang sự kiện HUTECH, không coi Facebook là nguồn độc lập.
- Cụm “Open-Core” chưa được thể lệ giải thích về khả năng dùng thành phần proprietary; để an toàn, phần nộp và đường chạy cốt lõi nên hoàn toàn theo giấy phép OSI-approved.

## Sources

[1] https://www.vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html
[2] https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html
[3] https://www.olp.vn/procon-pmmn/phần-mềm-nguồn-mở
[4] https://www.olp.vn/olympic-tin-học-sinh-viên/đăng-ký-danh-sách
[5] https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14
[6] https://opendigitransform.gitbook.io/dx-os
[7] https://opendigitransform.gitbook.io/dx-os/llms.txt
[8] https://www.olp.vn
[9] https://www.olp.vn/olympic-tin-học-sinh-viên/chương-trình
[10] https://github.com/paperclipai/paperclip
