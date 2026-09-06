# Đối chiếu nguồn chính thức cuộc thi DX-OS 2026

Ngày kiểm tra: 05/09/2026. Phạm vi: nguồn công khai VFOSSA, OLP và HUTECH; không đánh giá mã nguồn OpenCorp. Đây là ghi chú nguồn bổ trợ báo cáo tổng hợp.

## 1. Nguồn và độ tin cậy

| Nguồn | Vai trò | Kết quả truy cập |
|---|---|---|
| [VFOSSA: giới thiệu DX-OS](https://vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html) | Định hướng kiến trúc, chủ đề; bài ngày 09/06/2026 | Đã đọc toàn bài qua web |
| [VFOSSA: thể lệ PMNM 2026](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html) | Quy định trực tiếp về tham gia, thời gian, chấm điểm; ngày 09/06/2026 | Đã đọc qua web và Agent Reach/Jina Reader |
| [HUTECH IT Event: cuộc thi](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14) | Thông tin tổ chức cuộc thi cấp trường | Đã đọc qua web và Agent Reach/Jina Reader |
| [OLP: Thông báo số 1](https://www.olp.vn/tin-t%E1%BB%A9c/olympic-icpc/th%C3%B4ng-b%C3%A1o) | Lịch, địa điểm sự kiện toàn quốc | Đã đối chiếu nội dung công khai |
| [Facebook do người dùng cung cấp](https://www.facebook.com/share/p/1DmS6SC6sw/) | Truyền thông cuộc thi trường | Chưa xác minh trực tiếp; dùng bản chép trong yêu cầu, không coi là bản cập nhật mới nhất |

Doctor của Agent Reach báo chưa cài backend Facebook/OpenCLI. Không cài thêm hay truy xuất cookie. Agent Reach v1.5.0 được kiểm tra và báo đang là bản mới nhất.

## 2. Định hướng DX-OS đã công bố

VFOSSA định hướng xây dựng DX-Lab theo Open-Core, mô phỏng H–P–D–I: môi trường nhân sự số; quy trình; dữ liệu thống nhất; tác tử AI. Các nhóm công cụ bao gồm định danh, lưu trữ, wiki, giao tiếp; low-code/API/workflow; cơ sở dữ liệu/BI; vector database/LLM/RAG. Tài liệu nhấn mạnh chuẩn hóa quy trình và dữ liệu trước AI, cùng vai trò giám sát/phê duyệt ngoại lệ của con người. Hệ sinh thái OLP 2023–2025 là tài nguyên kế thừa. Bài dẫn tới [giáo trình DX-OS](https://opendigitransform.gitbook.io/dx-os).

Diễn giải nghiên cứu: đây là đề bài tích hợp vận hành doanh nghiệp. Một chatbot riêng lẻ hoặc một bộ dashboard riêng lẻ khó thể hiện toàn bộ kiến trúc. Việc chọn một hành trình nghiệp vụ xuyên bốn không gian là cách thiết kế demo được đề xuất, không phải câu chữ bắt buộc trong thể lệ.

## 3. Quy định PMNM toàn quốc

[Thể lệ VFOSSA](https://vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html): tối đa 2 đội/trường, 3 sinh viên/đội, có giảng viên; đề chi tiết tháng 11. Chấm repo 7–9/12; chung kết 10/12; trao giải 11/12/2026.

| Nhóm chấm | Điểm |
|---|---:|
| PoF: quản lý nguồn; license; release; build; dependencies; tài liệu | 5; 10; 5; 10; 10; 10 |
| Sản phẩm: nguyên gốc; hoàn thiện; thân thiện; bền vững; trình diễn/cộng đồng | Mỗi mục 10 |

Repo công khai và license OSI-approved là điều kiện xét chấm. Release phải có trước nộp; cần hướng dẫn build, README, changelog, bug tracker. Bảng trừ điểm đề cập header license từng tệp, tương thích giấy phép, bundling và sửa thư viện. Mục định dạng release liệt kê cả ZIP cùng RAR/ARJ: cần BTC giải thích, không tự sửa nghĩa. Ngày đăng bài 09/06 nhưng lịch ghi phát động tháng 7; cần phân biệt ngày bài với mốc kế hoạch.

## 4. Cuộc thi HUTECH và các khoảng trống

[HUTECH IT Event](https://itevent.hutech.edu.vn/su-kien/cuoc-thi-xay-dung-he-dieu-hanh-doanh-nghiep-so-ai-14) xác nhận Khoa CNTT tổ chức; thời gian 12:30 ngày 02/10/2026; đội dự kiến 2–4 sinh viên HUTECH, mỗi người một đội, có thể đăng ký một người hướng dẫn. Đội cần dự tập huấn, tuân thủ bản quyền, bảo mật và đạo đức AI. Hạn dự kiến 02/08/2026; trang đang đóng đăng ký. Trường địa điểm hiện chưa xác định.

Bản Facebook người dùng chép nêu bán kết online 19:00 ngày 17/09; chung kết ở E1-02.10; 5 buổi trực tiếp và 2 buổi trực tuyến. Slide nội bộ [phổ biến cuộc thi](../slides/cuoc-thi-pho-bien-va-de-tai-mau.html) và [báo cáo đã có](dx-os-olp-2026-report.md) đối chiếu các mốc này, đồng thời ghi chung kết có 10 phút demo và 5 phút phản biện. Website chưa đủ dữ liệu để xác nhận riêng từng chi tiết; thông tin slide không bị phủ định chỉ vì trường địa điểm trên website còn trống.

Chưa tìm thấy trong các nguồn web đã đọc: rubric HUTECH đầy đủ, tiêu chuẩn chọn đội đi quốc gia, thời lượng demo, giới hạn dùng API mô hình thương mại. Tuy nhiên tài liệu nội bộ đã ghi nhận rõ: [báo cáo trước, mục Cơ chế tuyển chọn HUTECH](dx-os-olp-2026-report.md#cơ-chế-tuyển-chọn-hutech-đã-được-xác-nhận) dẫn thông tin người dùng xác nhận rằng kết quả/giải thưởng là căn cứ tuyển chọn; đội bốn người được xét năng lực từng thành viên để hình thành đội tối đa ba người; public repository và license OSI-approved bắt buộc ngay từ bán kết. Những điều kiện này cần được giữ trong kế hoạch, với nhãn **xác nhận nội bộ đã ghi lại**, không gắn nhãn web xác minh. Không suy ra đạt giải là tự động có suất quốc gia.

## 5. Lịch chung và hệ quả thực hành

[Thông báo OLP](https://www.olp.vn/tin-t%E1%BB%A9c/olympic-icpc/th%C3%B4ng-b%C3%A1o) đặt sự kiện toàn quốc vào 8–11/12/2026 tại Đại học CNTT&TT Việt–Hàn, Đại học Đà Nẵng. Chấm repo PMNM bắt đầu ngày 7 theo thể lệ riêng, nên hai khoảng thời gian phục vụ hai hoạt động khác nhau.

Diễn giải: trước mắt cần tối ưu sản phẩm cho cuộc thi trường, đồng thời chuẩn bị nền tảng nguồn mở tái sử dụng cho tháng 11. Không nên coi định hướng DX-OS hiện tại là đặc tả cuối cùng của đề quốc gia. Đội 4 người ở trường cần chuẩn bị cho việc trường xét năng lực để chọn tối đa 3 người theo xác nhận nội bộ. Tỷ lệ chấm OLP không tự động áp dụng cho HUTECH; rubric trường nằm trong slide riêng.

Giới hạn tìm kiếm: đã tìm các truy vấn DX-OS/đề thi/2026 trên VFOSSA và OLP; chưa phát hiện một đề chi tiết PMNM 2026 bổ sung trong tập kết quả đã xem. Đây không phải khẳng định toàn Internet không có tài liệu khác. Lịch và quy định cần cập nhật theo BTC tại thời điểm nộp.
