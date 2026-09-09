# Rà soát yêu cầu Docker, giấy phép và deliverable — OLP PMNM 2026 / vòng trường HUTECH

**Ngày rà soát:** 08/09/2026
**Phạm vi:** khối Phần mềm nguồn mở (PMNM) OLP 2026 cấp quốc gia và cuộc thi “Xây dựng Hệ điều hành Doanh nghiệp số AI” của Khoa CNTT HUTECH.
**Nguyên tắc nguồn:** chỉ dùng công bố chính thức của VFOSSA/OLP/HUTECH và bản lưu cục bộ của chính các công bố đó. Không dùng blog, bài tư vấn hoặc dự án mẫu làm căn cứ xác định nghĩa vụ.

## Kết luận ngắn

1. **Docker/container không phải yêu cầu bắt buộc trong thể lệ OLP PMNM 2026 đang được công bố.** VFOSSA viết rõ là **“khuyến khích”** dùng container hóa như Docker. Nghĩa vụ thật sự là sản phẩm phải cài đặt/biên dịch được từ mã nguồn và có hướng dẫn thực hiện. Nguồn HUTECH công khai đến ngày rà soát cũng không yêu cầu Docker ở vòng bán kết hay chung kết trường.
2. **Giấy phép nguồn mở là điều kiện bắt buộc ở cấp quốc gia.** Dự án phải phát hành theo giấy phép **OSI-approved** và mã nguồn phải truy cập tự do trên Internet thì mới được BTC chấm xếp hạng. Phần PoF chấm trước chung kết còn kiểm tra license trong từng tệp mã, tính tương thích giấy phép, thông báo mục đích giấy phép và bản sao toàn văn giấy phép.
3. **Ở vòng trường HUTECH, chưa có căn cứ công khai để nói file `LICENSE` là deliverable riêng tại bán kết.** HUTECH chỉ công bố nghĩa vụ tổng quát là tuân thủ bản quyền, bảo mật dữ liệu, đạo đức AI và chịu trách nhiệm về sản phẩm. Vì vòng trường có mục tiêu chọn/ươm tạo sản phẩm đi tiếp, việc đưa `LICENSE` vào repo ngay bây giờ là chuẩn bị kỹ thuật hợp lý, nhưng đó là **khuyến nghị/suy luận**, không nên gọi là quy định HUTECH nếu chưa có văn bản bổ sung.

## 1. Ma trận yêu cầu theo giai đoạn

| Giai đoạn | Docker/container | LICENSE / source license | Điều có bằng chứng chính thức |
|---|---|---|---|
| Đăng ký HUTECH | Không được nhắc đến | Không yêu cầu file `LICENSE`; có nghĩa vụ chung “tuân thủ quy định về bản quyền” | Hồ sơ đăng ký gồm tên đội, thành viên, tên ý tưởng, bài toán doanh nghiệp và mô tả ngắn giải pháp. [HUTECH IT Event](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14) |
| Bán kết HUTECH, 17/09/2026 (online) | **Không có căn cứ công khai cho thấy bắt buộc** | **Chưa có mốc/file bắt buộc được công bố công khai** | Poster chính thức trên trang sự kiện cho biết lịch bán kết, nhưng không nêu deliverable hoặc rubric kỹ thuật. [Trang sự kiện và poster HUTECH](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14) |
| Chung kết HUTECH, 02/10/2026 | **Không có căn cứ công khai cho thấy bắt buộc** | **Chưa có mốc/file bắt buộc được công bố công khai** | Trang sự kiện nêu thời gian chung kết và các nghĩa vụ chung về bản quyền/bảo mật/AI; không có rubric build, deploy, dependency hay license chi tiết. [HUTECH IT Event](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14) |
| Sau khi OLP công bố đề chi tiết (dự kiến tháng 11/2026) | Không bắt buộc theo thể lệ hiện tại; Docker là cách đóng gói được khuyến khích | Dự án dự thi phải là PMNM theo license OSI-approved và có mã nguồn tự do truy cập trên Internet | Đội lập trình theo đề và công bố toàn bộ kết quả sản phẩm trên một kho mã nguồn mở. [VFOSSA — Thể lệ 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html) |
| Chấm kho mã/PoF, 07–09/12/2026 | Không có mục chấm “phải có Docker”; bị chấm ở năng lực build/cài từ source | **Bắt buộc để đủ điều kiện được chấm**, đồng thời là hạng mục PoF 10 điểm | PoF chấm repo, license, release, build from source, dependency/bundling và tài liệu/giao tiếp trước chung kết. [VFOSSA — Thể lệ 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html) |
| Chung kết OLP, 10/12/2026 | Không bắt buộc theo công bố hiện tại; container có thể giúp demo ổn định | Yêu cầu nguồn mở vẫn là điều kiện nền; phần license đã được kiểm tra trong PoF trước chung kết | 50 điểm sản phẩm được chấm qua trình bày/demo: nguyên gốc, hoàn thiện, thân thiện, bền vững và thu hút cộng đồng. [VFOSSA — Thể lệ 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html) |

**Lưu ý về thuật ngữ:** PoF trong thể lệ 2026 là nhóm tiêu chí 50 điểm được **chấm trước buổi chung kết**, không phải tên một vòng HUTECH. VFOSSA gọi đây là “Tiêu chí dựa trên PoF”; bài giới thiệu dùng cụm “tiêu chí loại trừ (PoF)”, nhưng bảng chính thức vẫn cho điểm/trừ điểm theo từng lỗi. [VFOSSA — Thể lệ 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html), [VFOSSA — Giới thiệu DX-OS](https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html)

## 2. Docker/container: bắt buộc hay khuyến nghị?

### Yêu cầu bắt buộc

Thể lệ quốc gia bắt buộc sản phẩm **cho phép cài đặt, biên dịch được từ mã nguồn**. Các lỗi bị trừ điểm gồm: không có hướng dẫn build; cấu hình bằng sửa tay tệp header; không cấu hình được trước khi build; dùng công cụ nguồn đóng hoặc tự tạo để dịch; và chương trình không hoạt động khi nằm ngoài thư mục mã nguồn. Hạng mục này có tối đa 10 điểm. [VFOSSA — Thể lệ 2026, mục “Building From Source”](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html)

### Khuyến nghị chính thức

Bài hướng dẫn chuẩn bị của VFOSSA nói: **“Khuyến khích sử dụng các kỹ thuật container hóa (như Docker) để đóng gói hệ thống DX-Lab.”** Đây là khuyến nghị kỹ thuật, không phải điều kiện dự thi và cũng không có hàng điểm Docker riêng trong rubric. [VFOSSA — Giới thiệu DX-OS, mục 3.1](https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html)

### Suy luận thực hành

- Dockerfile/Compose có thể là cách tốt để chứng minh khả năng dựng môi trường lặp lại, nhất là một DX-Lab tích hợp nhiều dịch vụ. Tuy nhiên, **có Docker mà không build/cài được từ source vẫn không đáp ứng rubric**.
- Không nên biến Docker thành con đường duy nhất nếu image dựa trên thành phần đóng, cần secret không được hướng dẫn, hoặc chỉ kéo image dựng sẵn mà không chỉ ra cách tạo sản phẩm từ source.
- Với vòng HUTECH, nên chuẩn bị một lệnh dựng/chạy ngắn và một phương án demo dự phòng. Đây là khuyến nghị giảm rủi ro trình diễn, không phải quy định đã được HUTECH công bố.

## 3. LICENSE phải có khi nào?

### Điều bắt buộc ở OLP quốc gia

VFOSSA đặt điều kiện đầu vào: dự án dự thi phải là PMNM phát hành theo giấy phép OSI-approved và mã nguồn phải truy cập tự do trên Internet; chỉ dự án đáp ứng mới được chấm xếp hạng. Vì kho mã được chấm ngày 07–09/12/2026, **hạn chắc chắn muộn nhất theo lịch công bố là trước khi kho được đưa vào chấm PoF**. [VFOSSA — Thể lệ 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html)

PoF cấp tối đa 10 điểm cho license và liệt kê bốn lỗi, mỗi lỗi có thể bị trừ 5 điểm:

- license không được ghi trong từng tệp mã;
- mã nguồn tự thân có các license không tương thích;
- mã nguồn không có thông báo về mục đích của license;
- mã nguồn không kèm một bản sao toàn văn license.

Do đó, một file `LICENSE` ở root là **cần nhưng chưa đủ** theo câu chữ rubric; đội còn phải xử lý header/notice trong tệp mã và lập bảng kiểm tương thích license của dependency. [VFOSSA — Thể lệ 2026, tiêu chí 2](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html)

### Điều đã và chưa được HUTECH công bố

HUTECH yêu cầu đội “tuân thủ quy định về bản quyền” và chịu trách nhiệm về sản phẩm, nhưng trang sự kiện không nêu:

- license nào được chấp nhận;
- có phải nộp file `LICENSE` ở bán kết hay không;
- có kiểm tra header từng tệp hay dependency license ở vòng trường hay không;
- repository/release nào phải nộp trước bán kết hoặc chung kết trường.

Vì vậy, không đủ bằng chứng để khẳng định LICENSE là deliverable bắt buộc của bán kết HUTECH. Tuy vậy, nếu sản phẩm được chuẩn bị để đi OLP quốc gia, **nên đưa license vào repo từ sớm**, trước khi nhận code từ nhiều thành viên hoặc nhập dependency, để tránh tranh chấp quyền tác giả và tương thích giấy phép về sau. Phần “nên” này là suy luận quản trị dự án, không phải quy định vòng trường. [HUTECH IT Event](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14)

## 4. Deliverable và tiêu chí liên quan build/deploy, dependency, license

### HUTECH — những gì công khai đến 08/09/2026

**Bắt buộc/được nêu rõ:**

- Tham gia đầy đủ chương trình tập huấn.
- Tuân thủ bản quyền, bảo mật dữ liệu, đạo đức sử dụng AI; chịu trách nhiệm về sản phẩm.
- Hồ sơ đăng ký: tên đội, thông tin thành viên, tên ý tưởng, bài toán doanh nghiệp dự kiến giải quyết, mô tả ngắn giải pháp.

**Chưa thấy công bố:** repo công khai, release, tài liệu build/deploy, Docker, dependency manifest/SBOM, file LICENSE, changelog, bug tracker hoặc thang điểm bán kết/chung kết trường. Không nên biến checklist OLP quốc gia thành phát biểu “HUTECH bắt buộc” nếu chưa có thông báo bổ sung từ BTC trường. [HUTECH IT Event](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14)

### OLP PMNM 2026 — deliverable/rubric quốc gia

| Nhóm | Điểm | Yêu cầu/chứng cứ cần có |
|---|---:|---|
| Kho quản lý mã nguồn Internet | 5 | Repo truy cập được từ Internet; công khai/có web viewer; thực sự dùng VCS. |
| License OSI-approved | 10 | License mở phù hợp đề; thông tin license trong từng tệp; không xung đột license; notice về mục đích; bản sao toàn văn license. |
| Release | 5 | Ít nhất một release tạo trước thời điểm nộp; có versioning; dùng định dạng phát hành được BTC xem là mở. Thể lệ nêu `.zip`, `.rar`, `.arj`, … là ví dụ định dạng bị trừ điểm; nên hỏi BTC để làm rõ chi tiết bất thường này thay vì tự diễn giải ngược văn bản. |
| Build/cài từ source | 10 | Build/cài được từ source; có hướng dẫn; cấu hình được; không dùng công cụ nguồn đóng/tự tạo để dịch; chạy được ngoài thư mục source. |
| Dependency và bundling | 10 | Làm rõ thư viện/gói dùng; ưu tiên thư viện sẵn có trong hệ thống; không phát hành kèm dependency của dự án khác; không sửa source gói đính kèm. |
| Tài liệu và giao tiếp | 10 | README/hướng dẫn rõ và làm theo được; changelog; bug tracker. |
| Sản phẩm/demo chung kết | 50 | 10 điểm mỗi mục: nguyên gốc kỹ thuật, hoàn thiện khi chạy demo, thân thiện, phát triển bền vững, phong cách trình diễn/thu hút cộng đồng nguồn mở. |

Nguồn cho toàn bộ bảng: [VFOSSA — Thể lệ OLP Phần mềm nguồn mở năm 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html).

## 5. Checklist hành động an toàn cho đội HUTECH

Checklist này là **khuyến nghị để đáp ứng sớm OLP quốc gia**, không phải mô tả yêu cầu mới của vòng trường:

1. Chọn một license OSI-approved cho phần code do đội sở hữu; thêm toàn văn vào `LICENSE` và header/notice theo đúng rubric VFOSSA.
2. Lập `THIRD_PARTY_NOTICES.md` hoặc bảng dependency gồm tên, phiên bản khóa, nguồn, license, cách sử dụng/phân phối; kiểm tra tương thích license.
3. Có `README` với prerequisites, cấu hình, build, chạy, test và dữ liệu demo. Các lệnh phải được thử trên máy/môi trường sạch.
4. Nếu dùng Docker, lưu `Dockerfile`/Compose trong repo, pin phiên bản hợp lý và mô tả cách tự build image từ source; không chỉ trỏ đến image dựng sẵn.
5. Tạo release có version trước hạn nộp chính thức; duy trì `CHANGELOG` và issue tracker.
6. Chuẩn bị demo vừa chứng minh sản phẩm chạy thật vừa giải thích kiến trúc, giá trị người dùng và khả năng phát triển bền vững.
7. Trước bán kết HUTECH, hỏi BTC trường bằng văn bản về rubric, định dạng nộp, deadline đóng repo, yêu cầu demo và license để chốt những phần trang sự kiện chưa công bố.

## 6. Giới hạn và điểm cần xác nhận tiếp

- Tại thời điểm rà soát, trang HUTECH mới công khai mô tả ngắn, hồ sơ đăng ký, lịch sự kiện và poster lịch tập huấn/bán kết/chung kết; chưa có điều lệ/rubric chi tiết cho hai vòng trường.
- VFOSSA dự kiến công bố đề thi chi tiết vào tháng 11/2026, trước chung kết khoảng một tháng. Đề sau này có thể thêm ràng buộc kỹ thuật. Kết luận “Docker không bắt buộc” chỉ phản ánh **thể lệ/chủ đề đã công bố đến 08/09/2026**; phải rà lại khi đề chính thức xuất hiện.
- Tệp local [`docs/official/vfossa-dx-os-2026.md`](../official/vfossa-dx-os-2026.md) là bản lưu nội dung bài VFOSSA và phù hợp với trang chính thức. Các ghi chú khác trong repo được dùng để tìm đầu mối, không được dùng làm căn cứ nâng một khuyến nghị thành yêu cầu bắt buộc.

## Nguồn sơ cấp

1. [VFOSSA — Thể lệ OLP Phần mềm nguồn mở năm 2026, 09/06/2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html).
2. [VFOSSA — Giới thiệu mô hình DX-OS và chủ đề cuộc thi PMNM OLP 2026, 09/06/2026](https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html).
3. [OLP — Trang khối Phần mềm nguồn mở](https://www.olp.vn/procon-pmmn/ph%E1%BA%A7n-m%E1%BB%81m-ngu%E1%BB%93n-m%E1%BB%9F). Trang này lưu nhiều mùa thi; đối với yêu cầu 2026, báo cáo ưu tiên bài thể lệ VFOSSA ghi rõ năm 2026.
4. [HUTECH IT Event — Cuộc thi “Xây dựng Hệ điều hành Doanh nghiệp số AI”](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14), Khoa Công nghệ Thông tin HUTECH.
5. [Poster chính thức HUTECH trên máy chủ sự kiện](https://itevent.hutech.edu.vn/uploads/events/2026/1785313164_aYiOXDYf.png).

---

## Phụ lục cập nhật 09/09/2026 — đối chiếu hai PDF tập huấn về Docker và chịu tải

### A. Kết luận phân loại Docker Compose

| Khả năng | Kết luận | Căn cứ |
|---|---|---|
| **(a) Yêu cầu bắt buộc của vòng trường HUTECH** | **Không có bằng chứng để kết luận như vậy.** | Trang sự kiện HUTECH yêu cầu đội tham gia đầy đủ tập huấn, nhưng không công bố Docker/Compose trong điều lệ, deliverable hoặc rubric vòng bán kết/chung kết. Một kỹ thuật được dạy trong tập huấn không tự động trở thành điều kiện thi. [HUTECH IT Event](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14) |
| **(b) Yêu cầu của OLP quốc gia** | **Không, theo thể lệ/chủ đề công bố đến 09/09/2026.** | OLP bắt buộc build/cài được từ source và có hướng dẫn; VFOSSA chỉ **khuyến khích** container hóa “như Docker”. Rubric không có mục Docker hay Compose riêng. [VFOSSA — Thể lệ 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html), [VFOSSA — Giới thiệu DX-OS, mục 3.1](https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html) |
| **(c) Nội dung tập huấn/khuyến nghị** | **Có — đây là phân loại chính xác nhất của PDF Docker.** | Deck có cấu trúc bài giảng: khái niệm, “THỰC HÀNH”, ví dụ Compose, lệnh dùng hằng ngày, triển khai VPS và mục “ÁP DỤNG NGAY”. Không có trang điều lệ, thang điểm, deadline hoặc thể thức nộp bài. [`Docker nen tang trien khai.pdf`, tr. 7–10, 15, 19](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=7) |
| **(d) Yêu cầu kỹ thuật của bài thực hành** | **Chỉ đúng trong phạm vi hẹp của checklist bài học; chưa chứng minh là deliverable được chấm.** | Trang 19 dùng câu mệnh lệnh “Viết `compose.yaml`…” trong “Việc cần làm cho sản phẩm dự thi”. Tuy nhiên, chính PDF không nêu phải nộp file này cho ai, trước khi nào, hay bị loại/trừ điểm nếu thiếu. Nếu giảng viên giao checklist này thành bài thực hành riêng, Compose là yêu cầu của bài thực hành đó; từ PDF đơn lẻ chưa thể nâng thành yêu cầu cuộc thi. [`Docker nen tang trien khai.pdf`, tr. 19, “ÁP DỤNG NGAY — Việc cần làm cho sản phẩm dự thi”](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=19) |

**Kết luận một câu:** Docker Compose là **công cụ được dạy và được khuyến nghị mạnh để đóng gói/chạy sản phẩm**; trang 19 biến nó thành một việc cần làm trong checklist kỹ thuật của buổi học, nhưng **không phải yêu cầu bắt buộc đã được công bố của vòng trường hoặc OLP quốc gia**.

### B. Bằng chứng theo đúng trang/đề mục PDF

#### PDF 1 — “Docker: từ máy cá nhân tới server thật” (20 trang)

- **Trang 1, “NỀN TẢNG TRIỂN KHAI HỆ THỐNG”:** tiêu đề phụ ghi “Docker · Compose · Volume · Triển khai lên VPS”. Đây là định vị chủ đề bài giảng, không phải tiêu đề điều lệ. [`Docker nen tang trien khai.pdf`, tr. 1](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=1)
- **Trang 7, “THỰC HÀNH — Một Dockerfile thật trông như thế nào”:** minh họa một Dockerfile Node. Trang này xác nhận deck có phần thực hành kỹ thuật. [`Docker nen tang trien khai.pdf`, tr. 7](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=7)
- **Trang 8, “DOCKER COMPOSE — Sản phẩm thật không chỉ có một phần”:** giải thích một DX-OS đơn giản có web, PostgreSQL và Redis; Compose gom các thành phần vào một file và bật bằng một lệnh. Đây là giải thích lợi ích/cách dùng, không có từ “bắt buộc”. [`Docker nen tang trien khai.pdf`, tr. 8](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=8)
- **Trang 9, “DOCKER COMPOSE — Cả dàn máy gói trong một file”:** đưa ví dụ `compose.yaml` gồm dịch vụ `web`, `db`, network theo tên dịch vụ và volume dữ liệu. Đây là mẫu kỹ thuật. [`Docker nen tang trien khai.pdf`, tr. 9](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=9)
- **Trang 10, “THỰC HÀNH — Những lệnh dùng hằng ngày”:** liệt kê `docker compose up -d`, `ps`, `logs`, `up -d --build`, `exec`, `down` và cảnh báo `down -v`. Đây là nội dung thực hành vận hành. [`Docker nen tang trien khai.pdf`, tr. 10](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=10)
- **Trang 13, “PHẦN LIÊN QUAN — Mật khẩu và khóa bí mật để ở đâu”:** hướng dẫn `.env`, `.gitignore`, `.env.example`; câu “thể lệ cuộc thi yêu cầu công bố rõ thành phần và dịch vụ bên thứ ba đã dùng” ánh xạ hợp lý sang tiêu chí dependency/bundling của VFOSSA. Trang này không nói Compose là bắt buộc. [`Docker nen tang trien khai.pdf`, tr. 13](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=13)
- **Trang 15, “TRIỂN KHAI — Từ máy cá nhân lên server thật”:** đưa quy trình cài Docker lên VPS, kéo code, tạo `.env`, chạy `docker compose up -d`, trỏ domain và bật HTTPS. Đây là một quy trình triển khai được đề xuất. [`Docker nen tang trien khai.pdf`, tr. 15](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=15)
- **Trang 19, “ÁP DỤNG NGAY — Việc cần làm cho sản phẩm dự thi”:** checklist gồm viết Dockerfile, tạo `.dockerignore`, viết `compose.yaml`, quản lý `.env`, thử trên máy sạch và ghi lệnh vào README. Dòng 3 ghi “Viết `compose.yaml` gom web, cơ sở dữ liệu và các phần khác, nhớ khai báo volume cho dữ liệu”. Đây là bằng chứng mạnh nhất cho **instruction kỹ thuật của buổi học**, nhưng trang không nêu trạng thái điều lệ hay chế tài thi. [`Docker nen tang trien khai.pdf`, tr. 19](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=19)
- **Trang 20, “KẾT NỐI — Docker mở đường cho những thứ đã học”:** liên hệ container với nhân bản, tự khởi động lại và sao lưu volume; câu kết ưu tiên “đóng gói chạy được trước” rồi mới chịu tải. Đây là thứ tự học/triển khai. [`Docker nen tang trien khai.pdf`, tr. 20](../slides/Docker%20nen%20tang%20trien%20khai.pdf#page=20)

Metadata PDF không có trường tác giả, không có custom metadata và không tự nhận là văn bản điều lệ; tài liệu được tạo bằng Headless Chrome ngày 11/08/2026. Vì vậy, báo cáo dùng PDF để xác định **nội dung đã được trình bày trong deck**, không dùng nó để thay thế thể lệ chính thức của VFOSSA hoặc trang công bố HUTECH.

#### PDF 2 — “Vì sao hệ thống sập — và cách làm cho nó không sập” (23 trang)

- Toàn văn 23 trang **không có cụm “Docker” hoặc “Compose”**. Tài liệu tập trung vào hiệu năng truy vấn, đo tải, scale ngang/load balancer, hàng đợi, chịu lỗi, backup và livestream quy mô lớn. Do đó PDF này không tạo thêm yêu cầu Docker Compose.
- **Trang 12, “TẦNG 3 · KHI MỘT MÁY KHÔNG ĐỦ — Thêm máy và người gác cổng chia việc”:** câu “Điều kiện bắt buộc: cả 3 máy phải giống hệt nhau, không máy nào giữ riêng dữ liệu của người dùng” là điều kiện **kỹ thuật của horizontal scaling/statelessness**, không phải điều kiện bắt buộc của cuộc thi và cũng không chỉ định Docker Compose. [`Ky thuat chiu tai va su co.pdf`, tr. 12](../slides/Ky%20thuat%20chiu%20tai%20va%20su%20co.pdf#page=12)
- **Trang 23, “ÁP DỤNG NGAY — Bảy việc làm được ngay tuần này”:** checklist yêu cầu kiểm tra số truy vấn, tạo chỉ mục, nén ảnh/phân trang, timeout dịch vụ ngoài, đẩy tác vụ nặng ra nền, bật/thử khôi phục backup và ghi thời gian xử lý vào log. Không có Docker/Compose. [`Ky thuat chiu tai va su co.pdf`, tr. 23](../slides/Ky%20thuat%20chiu%20tai%20va%20su%20co.pdf#page=23)

### C. Tách instruction trong PDF khỏi yêu cầu nhiệm vụ và yêu cầu cuộc thi

Các câu mệnh lệnh trong slide như “Viết Dockerfile”, “Tạo `.dockerignore`”, “Viết `compose.yaml`”, “Chuyển mọi mật khẩu sang `.env`” và “Thử trên máy sạch” được đọc như **đối tượng cần phân tích**. Chúng không phải chỉ dẫn cho người thực hiện báo cáo, và cũng không tự có hiệu lực như điều lệ cuộc thi.

Để một câu trong deck trở thành yêu cầu bắt buộc của vòng trường, cần thêm bằng chứng có thẩm quyền như điều lệ/rubric/thông báo nộp bài của BTC HUTECH, trong đó nêu rõ deliverable, mốc thời gian hoặc hệ quả nếu thiếu. Để trở thành yêu cầu OLP quốc gia, nó phải xuất hiện trong thể lệ hoặc đề thi 2026 của VFOSSA/OLP. Các nguồn chính thức được kiểm tra đến 09/09/2026 chưa có bằng chứng đó; ngược lại, VFOSSA gọi container hóa là **khuyến khích**.

### D. Hệ quả thực hành cho đội

- **Nên làm `compose.yaml`:** vì nó trực tiếp hỗ trợ build/deploy lặp lại, thử trên máy sạch và demo ổn định; đây là cách mạnh để đáp ứng tinh thần “Building From Source”.
- **Không nên tuyên bố “thiếu Compose là bị loại/trừ điểm”:** chưa có nguồn chính thức chứng minh.
- **Nếu người phụ trách tập huấn giao trang 19 làm bài phải hoàn thành:** khi đó Compose là yêu cầu của **bài tập nội bộ** theo chỉ đạo riêng đó, không phải mặc nhiên là luật của bán kết HUTECH hay OLP quốc gia.
