# Review kế hoạch bàn giao — 2026-09-12

## Kết luận và phạm vi

Bộ issue trước bàn giao đã có quyết định/dependency nhưng nhiều task còn checklist tổng quát. Phiên này bổ sung kế hoạch thực hiện và ca acceptance cụ thể cho toàn bộ24 issue chưa DONE;29 issue DONE giữ evidence và scope cũ, không viết lại thành kế hoạch mới.

Chỉ thay tài liệu. Không chạy application tests, sửa code/migration, apply DB hoặc thay status để tạo cảm giác tiến độ. Việc kiểm tra cấu trúc tài liệu không chứng minh runtime đạt yêu cầu.

## Các vấn đề đã xử lý trong kế hoạch

- Tránh viết lại017/032: HANDOFF ghi code dang dở và các finding cần kiểm chứng, phân biệt reported fix với final acceptance.
- Bỏ mơ hồ ownership generation:032 passport,053 shared generator,046 render receipt,035 Studio,036 schedule,037 publish. Không consumer nào tạo content table/generator cạnh tranh.
- Phân biệt token xác nhận021, reservation022, signed checkout023, verified IPN024 và status token027; browser return không phải paid.
- Ghi giới hạn exactly-once bên provider và race send/handoff. Persist-before-send và UNKNOWN không đồng nghĩa thu hồi được message đã được Meta nhận.
- Bổ sung test thực DB hai connections cho oversell, expiry/IPN, leases/CAS và source expiry; không dựa mock transaction.
- Thống nhất immutable content document có artifactHash=null;046 giữ actual artifact receipt riêng thay vì sửa content row.
- Phân biệt technical defaults với phỏng vấn: token TTL24h/30min và state names mới trong checklist là đề xuất kỹ thuật có thể thay với lý do; không coi là lời người dùng.
- Deployment và release vẫn có external gates; không dùng lịch sử890tests hay501SQL assertions làm current end-to-end proof.
- Giữ refund ngoài automation:025 chỉ operational UI/exception visibility; câu cũ nhắc manager refund không cấp quyền xây cổng refund tài chính. Nếu cần workflow refund thật phải issue mới và yêu cầu rõ.

## Bao phủ yêu cầu sản phẩm

| Yêu cầu đã chốt | Issue chịu trách nhiệm |
|---|---|
|Một business/Page/self-host, portability|008,013,043,051|
|Quyền manager/staff và session|001,005,006,007,048|
|Catalog/policy/program dùng ngay|010,011,016,032|
|Nguồn ngoài có provenance/freshness|049,050,052,016,017,032|
|Tư vấn nhu cầu, so sánh nhiều lượt|014,016,017,018|
|Handoff overnight, staff native app, AI stop/resume|002,014,015,017,018,045,051|
|Public comment invite, praise ignore|013,019|
|Collection→confirmation→reserve→VNPay|004,020,021,022,023,024|
|Self delivery/warranty/status identity|025,026,027|
|Opportunities từ nội bộ và trends|028,029,030,041|
|Post/video/free media/Truth Guard|031,032,033,034,046,053|
|Studio/schedule/publish/priority pause|003,035,036,037,038|
|Attribution/insights/feedback trung thực|039,040,041|
|Audit/jobs/recovery/release evidence|009,012,042,043,044,047|

## Độ nhỏ của task và điểm review

Mỗi issue còn lại có4 bước implementation chính, acceptance cụ thể và một deliverable boundary. Các task nhiều thành phần như021/024/035/037 phải thực hiện tuần tự domain/storage→adapter→wiring→proof, không gộp thành một thay đổi không kiểm chứng. Nếu provider contract thực tế làm scope lớn hơn boundary, tách focused issue trước mở rộng; không thêm task rỗng chỉ để tăng số lượng.

README có DAG và order. Các nhánh có thể làm song song nằm trong HANDOFF; shared file chỉ một owner. Dependency production và external proof phải giữ nguyên: thiếu051 không ngăn local013 nhưng ngăn final044; thiếu sandbox024 không được DONE thanh toán.

## Kiểm tra tài liệu

Đã kiểm bằng script tại phiên này:53 issue đủ10 headings người dùng yêu cầu; status hợp lệ; dependency tồn tại, không cycle, order đúng và tracker đồng bộ;24 issue chưa DONE có Files/contract/checklist/AT/tests; tổng109 acceptance cases AT; local Markdown links giải quyết được. Kết quả exit0, errors=[]; git diff --check cho đường tài liệu exit0 (lưu ý phần untracked không được Git kiểm đầy đủ). Đây là validation tài liệu, không thay runtime test evidence.
