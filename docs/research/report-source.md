# Đề xuất chủ đề dự án OLP PMNM 2026 theo mô hình DX-OS

**Bản nghiên cứu và khuyến nghị chiến lược**
**Ngày chốt thông tin:** 07/09/2026
**Bối cảnh:** Vòng loại HUTECH → đội tuyển dự OLP Tin học Sinh viên Việt Nam 2026 tại Đà Nẵng

## Kết luận điều hành

Đề tài nên ưu tiên là **OpenDX Agent Passport — Hộ chiếu nhiệm vụ và cổng kiểm soát AI Agent cho doanh nghiệp**.

Sản phẩm giải quyết câu hỏi đang xuất hiện sau làn sóng “đưa AI vào doanh nghiệp”: *AI agent nào được phép làm gì, theo ủy quyền của ai, trên dữ liệu nào, trong giới hạn nào, và làm sao chứng minh lại toàn bộ hành động?* Đây không phải chatbot hỏi đáp, cũng không phải một MCP gateway đơn thuần. Phần khác biệt nên là một **trình biên dịch chính sách doanh nghiệp bằng tiếng Việt**: chuyển SOP, ma trận trách nhiệm 5 RÕ/RACI, phân loại dữ liệu và ngưỡng rủi ro thành “hộ chiếu nhiệm vụ” máy có thể thực thi; mọi lời gọi công cụ của agent đều được cho phép, chặn hoặc chuyển sang người duyệt và được ghi thành bằng chứng.

Hướng này có bốn lợi thế. Thứ nhất, nó đi trúng chuỗi H–P–D–I của DX-OS: danh tính và ủy quyền của con người; quy trình và rào chắn; dữ liệu chính sách và nhật ký thống nhất; AI agent chỉ hành động trong phạm vi được giao. Thứ hai, nó giải quyết một vấn đề mới phát sinh khi AI chuyển từ “nói” sang “làm”: quyền hạn quá mức, tài khoản dùng chung, prompt injection, shadow AI và thiếu khả năng truy vết. Thứ ba, Luật Trí tuệ nhân tạo và Luật Bảo vệ dữ liệu cá nhân của Việt Nam đã có hiệu lực trong năm 2026, làm cho giám sát con người, nhật ký, quản trị dữ liệu và trách nhiệm giải trình trở thành các yêu cầu vận hành đáng quan tâm. Thứ tư, kịch bản tấn công–chặn–xin duyệt–thực thi–truy vết tạo được màn trình diễn ngắn, rõ và có cao trào.

Tuy nhiên, đề tài chỉ nên chọn nếu đội có thể phỏng vấn ít nhất ba doanh nghiệp hoặc nhóm vận hành thực tế trong 7–10 ngày tới. Nếu chưa tiếp cận được doanh nghiệp đang dùng agent, phương án ít rủi ro hơn là **VendorTrust — kiểm soát quy trình tiếp nhận nhà cung cấp và thay đổi hồ sơ**, hoặc **HandoverOS — bàn giao tri thức kèm chuyển giao quyền và thu hồi truy cập**.

## 1. Cuộc thi thực sự yêu cầu gì?

### 1.1. OLP Phần mềm nguồn mở 2026

Chủ đề chính thức là **“Xây dựng hệ điều hành doanh nghiệp số (DX-OS)”** theo kiến trúc Open-Core. Sản phẩm được mô tả như một DX-Lab mô phỏng đủ bốn không gian H–P–D–I để giải quyết bài toán vận hành doanh nghiệp. BTC không áp đặt một stack duy nhất; đội tự lựa chọn và lắp ghép các thành phần nguồn mở phù hợp. [VFOSSA – giới thiệu DX-OS và chủ đề OLP 2026](https://www.vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html)

Điều kiện để dự án được chấm là mã nguồn phải truy cập tự do trên Internet và sản phẩm phải phát hành theo giấy phép được OSI phê duyệt. OLP chấm 100 điểm, chia đều thành 50 điểm “Proof of Foss” trên kho mã và 50 điểm sản phẩm tại vòng chung kết. PoF bao gồm kho mã công khai, giấy phép, release/versioning, khả năng build từ source, quản lý dependency/bundling và tài liệu/giao tiếp. Điểm sản phẩm gồm tính nguyên gốc kỹ thuật, độ hoàn thiện, thân thiện sử dụng, khả năng phát triển bền vững và sức thuyết phục với cộng đồng nguồn mở. [VFOSSA – Thể lệ OLP PMNM 2026](https://www.vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html)

Mỗi đội OLP quốc gia tối đa ba sinh viên và một giảng viên; mỗi trường tối đa hai đội. Đề nghiệp vụ cụ thể dự kiến công bố trong tháng 11, chấm kho mã từ 07–09/12, thi/trình diễn ngày 10/12 và trao giải ngày 11/12 tại VKU, Đà Nẵng. Tại thời điểm 07/09/2026, đề nghiệp vụ chi tiết chưa xuất hiện trên các kênh chính thức. Vì vậy, đội nên xây một **hạt nhân DX-OS có thể thay workflow**, thay vì khóa cứng toàn bộ sản phẩm vào một ngành mà BTC chưa công bố. [OLP – Khối Phần mềm nguồn mở](https://www.olp.vn/procon-pmmn/ph%E1%BA%A7n-m%E1%BB%81m-ngu%E1%BB%93n-m%E1%BB%9F) và [Chương trình OLP 2026](https://www.olp.vn/olympic-tin-h%E1%BB%8Dc-sinh-vi%C3%AAn/ch%C6%B0%C6%A1ng-tr%C3%ACnh)

### 1.2. Vòng loại HUTECH

Tài liệu mới nhất trong `docs/slides/cuoc-thi-pho-bien-va-de-tai-mau.html` ghi bán kết trực tuyến lúc 19:00 ngày 17/09/2026 và chung kết lúc 12:30 ngày 02/10/2026. Với mốc chốt nghiên cứu 07/09, đội còn 10 ngày đến bán kết, 25 ngày đến chung kết trường và 94 ngày đến ngày thi khối PMNM quốc gia.

Rubric HUTECH đặt trọng tâm rất rõ vào bài toán thực tế và quy trình:

| Tiêu chí HUTECH | Điểm |
|---|---:|
| Tính thực tiễn và giá trị đối với doanh nghiệp | 25 |
| Mức độ hoàn thiện, ổn định, trải nghiệm sử dụng | 20 |
| Tự động hóa quy trình và khả năng tích hợp | 20 |
| AI phù hợp, an toàn và có trách nhiệm | 15 |
| Sáng tạo và khả năng mở rộng | 10 |
| Tài liệu, trình diễn và trả lời phản biện | 10 |

Như vậy, **45 điểm nằm ở giá trị doanh nghiệp và quy trình**, còn AI chỉ chiếm 15 điểm. Chiến lược đúng là chọn một doanh nghiệp thật, một workflow đầu–cuối, một lỗi/ngoại lệ đắt giá và một phép đo trước–sau. “Dùng model nào” là quyết định kỹ thuật cấp hai.

## 2. Hiểu DX-OS như một kiến trúc vận hành

DX-OS không phải hệ điều hành máy tính như Linux hay Windows và cũng không phải một ERP nguyên khối. Nó là lớp kiến trúc/ phương pháp vận hành kết nối bốn không gian:

| Không gian | Câu hỏi thiết kế | Bằng chứng cần thấy trong sản phẩm |
|---|---|---|
| H — Human | Ai sở hữu công việc, ai ủy quyền, ai chịu trách nhiệm? | Danh tính, vai trò, workspace, thông báo, người duyệt |
| P — Process | Sự kiện nào kích hoạt? Điều kiện nào chặn lỗi? Ngoại lệ đi đâu? | Workflow, rule, SLA, phê duyệt, Poka‑Yoke |
| D — Data | Nguồn sự thật duy nhất là gì? Trạng thái và lịch sử ở đâu? | SSOT, schema, lineage, audit log, dashboard |
| I — Intelligence | AI đọc gì, đề xuất gì, được hành động đến đâu? | Agent/RAG/model, tool call, confidence, guardrail, HITL |

Điểm quan trọng nhất là quan hệ nhân quả **H → P → D → I**. Tự động hóa một quy trình chưa rõ chỉ làm lỗi chạy nhanh hơn; agent dùng dữ liệu không có chủ sở hữu sẽ khó giải trình; AI không thay được rào chắn quy trình. Với đề tài được khuyến nghị, H–P–D–I không phải bốn ô trang trí mà là bốn lớp cùng xuất hiện trong một lần chạy end-to-end.

“Open-Core” trong bài giới thiệu DX-OS nên được hiểu về mặt kiến trúc là lõi có thể lắp ghép và thay module qua API. Nó không thay thế yêu cầu giấy phép nguồn mở của OLP. Một sản phẩm “source available” hoặc phụ thuộc hoàn toàn vào SaaS đóng có thể tạo rủi ro ở vòng PoF. Cách an toàn là để toàn bộ đường chạy demo cốt lõi tự host được, dùng giấy phép OSI-approved, có dữ liệu tổng hợp và có chế độ model cục bộ/mock.

## 3. Vì sao “thêm một chatbot” không còn đủ mới?

Khảo sát Microsoft tại Việt Nam năm 2025 cho thấy 95% lãnh đạo Việt Nam được hỏi kỳ vọng dùng “digital labor” trong 12–18 tháng và 65% nói tổ chức đã dùng agent để tự động hóa hoàn toàn một số workflow. Đây là khảo sát do nhà cung cấp thực hiện, nên nên xem như tín hiệu xu hướng hơn là thống kê đại diện toàn bộ doanh nghiệp. [Microsoft Work Trend Index Việt Nam 2025](https://news.microsoft.com/source/asia/2025/06/12/bao-cao-chi-so-xu-huong-cong-viec-nam-2025-su-ra-doi-cua-doanh-nghiep-tien-phong-2/?lang=vi)

Trong báo cáo 2026, Microsoft mô tả bài toán đã chuyển từ thử năng lực model sang tái thiết kế mô hình vận hành và xác lập mức cộng tác người–agent. [Microsoft Work Trend Index 2026](https://news.microsoft.com/source/asia/2026/06/08/2026-work-trend-index-report-reveals-how-frontier-firms-are-rebuilding-the-operating-model-for-the-age-of-ai/)

Khoảng trống mới nằm ở quản trị hành động. IBM/Ponemon ghi nhận một phần năm tổ chức trong mẫu các doanh nghiệp từng bị breach có sự cố liên quan shadow AI; mức thiếu kiểm soát truy cập AI rất cao. Vì mẫu chỉ gồm các tổ chức đã bị breach và nghiên cứu do vendor tài trợ, số liệu không nên suy rộng trực tiếp cho Việt Nam; tuy vậy, nó minh họa được kiểu rủi ro mới. [IBM Cost of a Data Breach 2025](https://newsroom.ibm.com/2025-07-30-ibm-report-13-of-organizations-reported-breaches-of-ai-models-or-applications,-97-of-which-reported-lacking-proper-ai-access-controls)

NIST năm 2026 nêu các nhu cầu còn thiếu quanh danh tính agent, ủy quyền, xác thực, nguyên tắc quyền tối thiểu, truy vết và non-repudiation. OWASP gọi “excessive agency” là tình huống model có quá nhiều chức năng, quyền hoặc tự chủ và khuyến nghị thu hẹp tool/permission cùng phê duyệt con người cho tác vụ tác động cao. [NIST – Identity and Authorization for Software Agents](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents) và [OWASP LLM06: Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)

Luật Trí tuệ nhân tạo số 134/2025/QH15 có hiệu lực 01/03/2026. Tóm tắt chính thức của Bộ KH&CN nêu các yêu cầu đối với hệ thống rủi ro cao như quản trị rủi ro, chất lượng dữ liệu, hồ sơ kỹ thuật, nhật ký hoạt động và giám sát/can thiệp con người. Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 có hiệu lực 01/01/2026. Sản phẩm dự thi không nên tuyên bố “bảo đảm tuân thủ”; tuy nhiên, nó có thể **hỗ trợ thực thi kiểm soát và tạo minh chứng**. [Bộ KH&CN – tóm tắt Luật AI](https://mst.gov.vn/luat-tri-tue-nhan-tao-dung-hang-rao-bao-ve-theo-muc-rui-ro-19726071423282963.htm) và [Cơ sở dữ liệu VBPL – Luật Bảo vệ dữ liệu cá nhân](https://vbpl.moj.gov.vn/khanhhoa/Pages/vbpq-van-ban-goc.aspx?ItemID=179252)

Các danh mục nền tảng doanh nghiệp như 1000Platforms cho thấy CRM, chatbot, social commerce, ERP, livestream AI và dashboard đã có nhiều lựa chọn. Đây chỉ là tín hiệu khám phá, không phải khảo sát thị trường đầy đủ. [1000Platforms – danh sách nền tảng](https://1000platforms.com/listings)

## 4. Danh sách đề tài đã sàng lọc

Điểm dưới đây là **ước lượng chiến lược**, không phải điểm của giám khảo. Mục đích là buộc đội so sánh trên đúng rubric HUTECH và rủi ro hoàn thành.

| Hạng | Đề tài | Giá trị | Hoàn thiện | Workflow | AI an toàn | Sáng tạo | Demo | Tổng |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | OpenDX Agent Passport | 23 | 16 | 19 | 15 | 10 | 10 | 93 |
| 2 | VendorTrust — tiếp nhận nhà cung cấp | 24 | 18 | 19 | 12 | 8 | 9 | 90 |
| 3 | EvidenceOps — hồ sơ bằng chứng AI | 22 | 17 | 18 | 14 | 9 | 9 | 89 |
| 4 | HandoverOS — bàn giao tri thức và quyền | 24 | 19 | 18 | 12 | 7 | 9 | 89 |
| 5 | AR Dispute — xử lý tranh chấp công nợ | 25 | 18 | 19 | 11 | 6 | 9 | 88 |
| 6 | Process Twin Lite — phát hiện lệch quy trình | 21 | 14 | 18 | 14 | 10 | 8 | 85 |
| 7 | CAPA Copilot — xử lý sự cố chất lượng | 24 | 15 | 18 | 12 | 8 | 8 | 85 |
| 8 | SOP Drift — tác động khi chính sách đổi | 21 | 16 | 17 | 13 | 9 | 8 | 84 |

### 4.1. OpenDX Agent Passport — khuyến nghị số 1

**Người mua/người bảo trợ:** CTO/CIO, trưởng vận hành, người phụ trách an toàn thông tin hoặc nền tảng AI.
**Người dùng:** process owner, quản trị hệ thống, người duyệt và kiểm toán nội bộ.
**Vấn đề:** agent dùng credential chung, được cấp quyền rộng, không có phạm vi nhiệm vụ theo thời gian và không tạo bằng chứng đủ rõ để biết ai chịu trách nhiệm.
**Điểm mới:** SOP tiếng Việt + 5 RÕ/RACI → hộ chiếu nhiệm vụ → enforcement ở runtime → biên nhận hành động.
**Rủi ro:** dễ quá rộng, dễ bị xem là “MCP gateway nữa”, tiêu chuẩn agent còn biến động.

### 4.2. VendorTrust — phương án hoàn thành chắc nhất

Một workflow tiếp nhận nhà cung cấp: đọc giấy phép/chứng nhận/hợp đồng, phát hiện thiếu hoặc hết hạn, đối chiếu tài khoản ngân hàng thay đổi, phân tuyến phê duyệt và lưu bằng chứng. AI chỉ trích xuất/so sánh; quy tắc quyết định nằm trong workflow. Đề tài có buyer rõ, dữ liệu tổng hợp dễ làm, demo trực quan và đo được thời gian xử lý. Nó kém “mới” hơn Agent Passport nhưng dễ đạt 20 điểm hoàn thiện.

### 4.3. EvidenceOps — kiểm kê và bằng chứng quản trị AI

Lập danh mục hệ thống AI theo owner, mục đích, dữ liệu, model, nhà cung cấp và mức rủi ro; thu log, test, phê duyệt, incident; xuất evidence pack theo phiên bản. Có tính thời sự pháp lý và hợp với doanh nghiệp lớn, nhưng nếu chỉ là form/dashboard sẽ thiếu cao trào. Nên ghép một kiểm soát runtime để chứng minh “bằng chứng sinh ra từ vận hành”.

### 4.4. HandoverOS — bàn giao tri thức có kiểm soát

Phỏng vấn nhân sự sắp nghỉ, phát hiện tri thức còn thiếu, sinh câu hỏi bổ sung, tạo kho tri thức phân quyền, chuyển owner tài liệu và lập checklist thu hồi quyền. Ý tưởng khởi nguồn có thể tham khảo bài “AI Knowledge-Transfer GPT for Employee Offboarding” trên The Rundown; phần tạo khác biệt là lifecycle, quyền, provenance và bằng chứng bàn giao, không chỉ RAG hỏi đáp. [The Rundown – Knowledge Transfer GPT](https://app.therundown.ai/community/posts/3dc33702-7240-4d10-ab89-44a2722e3601)

### 4.5. Process Twin Lite — phát hiện quy trình thật trước khi tự động hóa

Nhập CSV/event log/email tổng hợp, chuẩn hóa sự kiện, dựng process graph, phát hiện bottleneck/đường tắt/vi phạm phân tách nhiệm vụ, rồi đề xuất workflow an toàn cho agent. Đây là đề tài sâu, rất đúng tinh thần “đừng tự động hóa hỗn loạn”, nhưng rủi ro entity matching và process mining cao trong thời gian ngắn.

## 5. Thiết kế đề tài OpenDX Agent Passport

### 5.1. Tuyên bố sản phẩm một câu

“OpenDX Agent Passport giúp doanh nghiệp biến SOP và quy tắc ủy quyền thành giới hạn thực thi cho AI agent, để mỗi hành động đều đúng người, đúng quyền, đúng dữ liệu, đúng thời điểm và truy vết được.”

### 5.2. Đừng xây “một gateway nữa”

Không gian gateway/MCP đã xuất hiện nhiều dự án nguồn mở. Vì vậy, `allow/deny tool call` chỉ là nền tảng kỹ thuật, không phải điểm sáng. Bốn thành phần đội phải tự làm và demo rõ là:

1. **Vietnamese SOP-to-Policy Compiler:** AI đọc SOP/biểu mẫu, đề xuất event, vai trò, dữ liệu, tool, giới hạn và bước duyệt; con người xác nhận trước khi sinh policy.
2. **Mission Passport:** hợp đồng nhiệm vụ có owner, agent, mục đích, scope dữ liệu/tool, ngân sách, TTL, ngưỡng phê duyệt và chính sách lưu vết.
3. **Delegation Chain & Action Receipt:** thể hiện người giao → agent → tool → kết quả, kèm policy version và lý do quyết định.
4. **Vietnam Evidence Pack:** xuất bộ minh chứng hỗ trợ kiểm soát nội bộ theo các trường quản trị rủi ro, dữ liệu, nhật ký và human oversight; tuyệt đối không gắn nhãn “đã tuân thủ luật”.

### 5.3. Luồng demo đề xuất

Chọn duy nhất workflow **tiếp nhận và cập nhật hồ sơ nhà cung cấp**:

1. Trưởng mua hàng giao agent hoàn tất hồ sơ nhà cung cấp A trong 30 phút.
2. Hệ thống tạo passport: được đọc hồ sơ A, tra CRM, so sánh tài khoản ngân hàng, soạn email; không được đọc danh sách khách hàng, không được tự gửi email ra ngoài, không được tự thay đổi tài khoản thanh toán.
3. Một PDF nhà cung cấp chứa prompt injection ẩn: yêu cầu agent đọc danh sách khách hàng và gửi ra email ngoài.
4. Agent gọi tool vượt scope. Gateway chặn, che PII nếu có, lưu policy decision và cảnh báo người chịu trách nhiệm.
5. Agent vẫn hoàn tất phần an toàn: trích xuất hồ sơ, phát hiện chứng nhận hết hạn, soạn yêu cầu bổ sung.
6. Thay đổi tài khoản ngân hàng hoặc gửi email ra ngoài được chuyển sang màn hình duyệt có diff, dữ liệu liên quan, mức rủi ro và lý do.
7. Sau khi người duyệt xác nhận, hệ thống dùng credential ngắn hạn/mock để thực thi và phát hành action receipt.
8. Dashboard hiển thị timeline đầy đủ: ai giao, agent nào làm, tool nào được gọi, policy phiên bản nào, dữ liệu nào chạm tới, bước nào bị chặn/duyệt và kết quả cuối.

Kịch bản này vừa chứng minh giá trị của Agent Passport, vừa “mượn” độ cụ thể của VendorTrust để tránh demo trừu tượng.

### 5.4. Ánh xạ H–P–D–I

| Lớp | Thành phần trong MVP |
|---|---|
| H | Đăng nhập, vai trò buyer/approver/admin, owner của agent, chuỗi ủy quyền |
| P | Workflow tiếp nhận nhà cung cấp, TTL, ngưỡng duyệt, deny/escalate, kill switch |
| D | Registry policy/passport, phân loại dữ liệu, event ledger, dashboard và evidence export |
| I | Agent đọc hồ sơ, đề xuất passport, gọi tool và giải thích action; không tự vượt policy |

### 5.5. Kiến trúc MVP nguồn mở

| Khối | Gợi ý | Vai trò |
|---|---|---|
| UI/API | React/Next.js + FastAPI hoặc NestJS | Giao diện quản trị, duyệt và API |
| Identity | Keycloak (Apache-2.0) | User/role/agent owner, OIDC |
| Policy | Open Policy Agent (Apache-2.0) | Quyết định allow/deny/escalate |
| Data | PostgreSQL | Passport, policy version, workflow state |
| PII | Microsoft Presidio (MIT) | Phát hiện/che dữ liệu nhạy cảm trong demo |
| Trace | OpenTelemetry Collector (Apache-2.0) | Trace xuyên agent/tool/policy |
| Model | Model API có adapter + local/mock fallback | Trích xuất SOP, đề xuất policy, đọc tài liệu |
| Tool sandbox | Mock CRM + mock email + mock supplier DB | Đường chạy tái lập, không phụ thuộc SaaS |

Các giấy phép nêu trên cần được kiểm tra lại theo đúng phiên bản dependency khóa trong repo. Nguồn chính thức: [Keycloak](https://github.com/keycloak/keycloak), [Open Policy Agent](https://github.com/open-policy-agent/OPA), [Microsoft Presidio](https://github.com/microsoft/presidio) và [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector).

### 5.6. Scope bắt buộc và scope cắt bỏ

**MVP bắt buộc:** một agent; hai tool giả lập; một workflow; ba vai trò; một mẫu SOP; một passport schema; ba quyết định allow/deny/escalate; một prompt injection; một màn hình duyệt; một audit timeline; một evidence export.

**Không làm trước bán kết:** marketplace connector; multi-tenant; billing; full SIEM; rollback mọi hành động; tự động chứng nhận compliance; hỗ trợ mọi framework agent; model tự huấn luyện; dashboard 20 biểu đồ.

## 6. Phép đo và kiểm chứng

Đội không nên hứa “giảm 80% rủi ro” khi chưa đo. Bộ test bán kết có thể dùng 20–30 lời gọi công cụ được gắn nhãn trước, gồm hợp lệ, vượt dữ liệu, vượt tool, hết hạn, cần duyệt và prompt injection.

| Chỉ số | Mục tiêu demo |
|---|---|
| Hành động rủi ro cao bị chặn hoặc chuyển duyệt | 100% trên test suite đã gắn nhãn |
| Action receipt liên kết đủ owner–agent–passport–policy–tool–result | 100% |
| Thời gian truy ra nguyên nhân một action | So sánh log rời rạc với timeline thống nhất |
| Thời gian tạo policy | So sánh viết tay với SOP-to-policy có người xác nhận |
| False allow / false deny | Báo cáo riêng, không gộp thành “accuracy” |
| PII detection | Precision/recall trên bộ dữ liệu tiếng Việt tổng hợp |

Để lấy trọn điểm thực tiễn, cần ít nhất ba cuộc phỏng vấn 20–30 phút. Câu hỏi trọng tâm: nhân viên dùng công cụ AI nào; dữ liệu nào từng được copy vào AI; agent đang dùng API key của ai; hành động nào bắt buộc duyệt; đã từng có near-miss nào; mất bao lâu để truy ra một hành động; mức chậm do bước duyệt nào còn chấp nhận được. Sau mỗi phỏng vấn, lưu bằng chứng đã ẩn danh: vai trò, ngành, workflow, tần suất, chi phí/lỗi và câu trích dẫn được phép dùng.

## 7. Kế hoạch đến bán kết và chung kết trường

### 07–09/09: Chốt vấn đề và bằng chứng

- Phỏng vấn ba doanh nghiệp/người vận hành; chọn duy nhất workflow nhà cung cấp hoặc một workflow tương đương có owner thật.
- Viết problem statement, baseline, user journey và acceptance test.
- Tạo repo công khai, giấy phép Apache-2.0, README skeleton, issue board, architecture decision record đầu tiên.

### 10–12/09: Xương sống H–P–D

- User/role, passport schema, OPA policies, mock tools, event ledger.
- Luồng allow/deny/escalate chạy deterministic chưa cần LLM.
- Test tích hợp và seed data một lệnh.

### 13–15/09: Lớp I và demo

- Trích xuất SOP/PDF; AI chỉ đề xuất policy, con người xác nhận.
- Thêm prompt injection và PII case; dựng approval UI và audit timeline.
- Quay demo thô, đo các chỉ số, sửa điểm gãy.

### 16–17/09: Đóng gói bán kết

- Video tối đa 5 phút, slide, sơ đồ quy trình, tài liệu dữ liệu/AI, tài khoản demo.
- Chạy build sạch từ source, khóa dependency, kiểm giấy phép, sao lưu local demo.
- Tập pitch 7 phút và Q&A về khách hàng, tính mới, luật, false positive và lý do dùng AI.

### 18/09–02/10: Từ prototype sang sản phẩm

- Ưu tiên ổn định, UX và observability; không mở thêm ngành.
- Thêm rule editor dễ hiểu, policy diff/versioning, export evidence, benchmark và test adversarial.
- Công bố release đầu tiên, changelog, roadmap, contribution guide và danh sách good first issue.

## 8. Chiến lược nguồn mở và PoF

Nên cấp phép code đội viết bằng **Apache-2.0** để có điều khoản patent rõ; lựa chọn cuối cùng cần giảng viên/đội rà soát. Repo phải có ít nhất:

- `LICENSE`, SPDX header nơi phù hợp, `NOTICE` nếu cần;
- README nêu bài toán, kiến trúc H–P–D–I, quick start, dữ liệu demo và giới hạn;
- `docker compose up` hoặc một lệnh tương đương dựng đường chạy cốt lõi từ source;
- lockfile, SBOM, bảng dependency–license và không commit secret;
- tag/release, changelog, semantic versioning;
- issue tracker, roadmap, contributing guide, code of conduct;
- tài liệu model/provider, nguồn dữ liệu, consent, PII và responsible-AI test;
- ảnh/video demo, kiến trúc, sequence của allow/deny/escalate;
- chế độ offline/local/mock để giám khảo tái lập mà không cần API key trả phí.

Đừng dùng giấy phép Creative Commons cho code và đừng coi “public repo” đồng nghĩa “open source”. OSI yêu cầu quyền dùng, sửa đổi và phân phối theo giấy phép phù hợp. [Open Source Initiative – Open Source Definition](https://opensource.org/osd) và [OSI Approved Licenses](https://opensource.org/licenses)

## 9. Phản biện dự kiến

| Câu hỏi của giám khảo | Câu trả lời nên chứng minh bằng sản phẩm |
|---|---|
| Đây có phải chỉ là MCP gateway? | Gateway là enforcement point; phần nguyên gốc là SOP/5 RÕ → passport, delegation chain và evidence pack Việt Nam. |
| Tại sao cần AI? | Quy tắc quyết định là deterministic; AI chỉ chuyển tài liệu phi cấu trúc thành đề xuất policy và xử lý hồ sơ. Không dùng AI ở chỗ rule đủ dùng. |
| Có đảm bảo tuân thủ luật không? | Không. Sản phẩm hỗ trợ kiểm soát và tạo bằng chứng; đánh giá pháp lý vẫn do người có thẩm quyền. |
| Nếu agent lách bằng prompt injection? | Tool call bị chặn ở lớp ngoài model; test adversarial được chạy lặp lại và ghi decision. |
| Tại sao doanh nghiệp nhỏ cần? | MVP dùng template và self-host một nút; SME chọn workflow nhạy cảm. Không giả định mọi SME có cùng nghĩa vụ pháp lý. |
| Nếu không có Internet/model API? | Demo deterministic, dữ liệu tổng hợp và local/mock adapter vẫn chạy đầy đủ. |
| Mở rộng sang enterprise thế nào? | Tích hợp IdP/SIEM, credential ngắn hạn, SCIM/SPIFFE, data classification và multi-tenant sau MVP. |

## 10. Quyết định chọn đề tài

Chọn **OpenDX Agent Passport** nếu ba điều kiện cùng đúng: có doanh nghiệp/người vận hành xác nhận pain; đội có một thành viên backend/security đủ mạnh; và đội cam kết giữ scope ở một workflow với tool giả lập. Chọn **VendorTrust** nếu cần tối đa hóa xác suất hoàn thiện trong 10 ngày. Chọn **HandoverOS** nếu đội có nguồn người dùng HR/IT và muốn demo dễ hiểu hơn.

Không nên chọn chatbot chăm sóc khách hàng, chatbot tuyển sinh, ERP mini, dashboard tổng hợp hay dự báo tồn kho đơn thuần trừ khi có một workflow/ngoại lệ rất riêng và bằng chứng doanh nghiệp thật. Các hướng này vừa nằm trong nhóm đề tài mẫu của trường, vừa đã có nhiều sản phẩm thị trường; độ khó không nằm ở model mà ở việc chứng minh điểm khác biệt.

## 11. Giới hạn nghiên cứu

- Đề nghiệp vụ OLP quốc gia tháng 11 chưa được công bố tại thời điểm chốt; khuyến nghị cần được đối chiếu lại khi đề ra.
- Không truy cập ổn định được nội dung nhóm Facebook IndieHackerVN; không dùng bài đăng trong nhóm làm bằng chứng chính.
- Trang YouTube được xác định là nội dung về vận hành công ty bằng đội ngũ AI agent, nhưng không có transcript đáng tin cậy để trích dẫn.
- 1000Platforms là nguồn khám phá sản phẩm, không phải market census.
- Các khảo sát Microsoft và IBM là nghiên cứu do vendor tài trợ; báo cáo đã ghi caveat và dùng như tín hiệu, không suy rộng tuyệt đối.
- Phần pháp lý là định hướng thiết kế sản phẩm, không phải tư vấn pháp luật.

## Tài liệu tham khảo chọn lọc

1. [VFOSSA – Giới thiệu mô hình DX-OS và chủ đề OLP PMNM 2026](https://www.vfossa.vn/tin-tuc/gioi-thieu-mo-hinh-dx-os-va-chu-de-cuoc-thi-phan-mem-nguon-mo-olp-2026-761.html), 09/06/2026.
2. [VFOSSA – Thể lệ OLP PMNM 2026](https://www.vfossa.vn/tin-tuc/the-le-olp-phan-mem-nguon-mo-nam-2026-760.html), 09/06/2026.
3. [OLP – Khối Phần mềm nguồn mở](https://www.olp.vn/procon-pmmn/ph%E1%BA%A7n-m%E1%BB%81m-ngu%E1%BB%93n-m%E1%BB%9F) và [chương trình OLP 2026](https://www.olp.vn/olympic-tin-h%E1%BB%8Dc-sinh-vi%C3%AAn/ch%C6%B0%C6%A1ng-tr%C3%ACnh).
4. [NIST – Identity and Authorization for Software Agents](https://www.nist.gov/news-events/news/2026/02/new-concept-paper-identity-and-authority-software-agents), 24/02/2026.
5. [NIST – AI Agent Standards Initiative](https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative), cập nhật 14/08/2026.
6. [OWASP LLM06: Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/).
7. [World Economic Forum – AI Agents in Action](https://www.weforum.org/publications/ai-agents-in-action-a-playbook-for-trusted-adoption-authorization-and-scaling/), 26/05/2026.
8. [Cổng thông tin Chính phủ – Luật Trí tuệ nhân tạo 134/2025/QH15](https://vanban.chinhphu.vn/?docid=216334&orggroupid=1&pageid=27160).
9. [Cơ sở dữ liệu VBPL – Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15](https://vbpl.moj.gov.vn/khanhhoa/Pages/vbpq-van-ban-goc.aspx?ItemID=179252).
10. [Microsoft Work Trend Index Việt Nam 2025](https://news.microsoft.com/source/asia/2025/06/12/bao-cao-chi-so-xu-huong-cong-viec-nam-2025-su-ra-doi-cua-doanh-nghiep-tien-phong-2/?lang=vi).
11. [IBM Cost of a Data Breach 2025](https://newsroom.ibm.com/2025-07-30-ibm-report-13-of-organizations-reported-breaches-of-ai-models-or-applications,-97-of-which-reported-lacking-proper-ai-access-controls), 30/07/2025.
12. [Open Source Initiative – Approved Licenses](https://opensource.org/licenses).
