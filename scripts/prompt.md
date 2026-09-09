# OneVoice — Prompt bàn giao phiên phát triển mới

Bạn đang tiếp quản toàn bộ quá trình phát triển dự án OneVoice tại:

```text
/Users/twot/Documents/CODE/OneVoice
```

Đọc toàn bộ `AGENTS.md` và tài liệu dự án trước khi hành động. Sau đó bắt đầu triển khai ngay; tự quyết định các vấn đề kỹ thuật thông thường và chỉ dừng khi thực sự thiếu quyền hạn hoặc gặp Git conflict theo quy định dự án.

## Mục tiêu phiên bản đầu

Xây dựng OneVoice chạy ổn định trên máy local với luồng hoàn chỉnh:

```text
Supabase
→ hiển thị danh sách sản phẩm
→ người dùng chọn sản phẩm
→ AI tạo nội dung/kịch bản quảng cáo
→ dựng video
→ lưu video MP4 ở local
→ xem trước video trên giao diện
→ tải file video xuống
```

Chưa triển khai đăng Facebook, Messenger hoặc TikTok trong phiên bản này. Thiết kế các ranh giới module đủ rõ để có thể bổ sung các nền tảng phân phối sau này mà không cần viết lại pipeline chính.

## Trạng thái đã biết

- Supabase đã kết nối thực tế và đọc được khoảng 4.109 sản phẩm cùng các bảng liên quan.
- Dự án dùng `@supabase/supabase-js`, chưa dùng Prisma.
- Các biến Supabase và AI thật nằm trong `.env`. Giữ mọi server secret ở phía server; không ghi chúng vào log, client bundle, commit hoặc tài liệu.
- OpenCode Zen API đã gọi thành công với endpoint `/responses` và model `muse-spark-1.3-contributor-free`.
- Mỗi request đến model miễn phí phải có header `x-session-id` là một UUID mới.
- Không đặt `max_output_tokens: 32`; giới hạn này từng khiến model trả HTTP 200 nhưng `output` rỗng.
- Có thể kiểm tra kết nối AI bằng `pnpm ai:verify`.
- Các repository tham khảo nằm trong `references/` và thư mục này được gitignore.
- Working tree có thể chứa thay đổi chưa commit từ phiên trước. Xem `git status` và diff trước; bảo toàn mọi thay đổi hiện hữu và tích hợp chúng có chủ đích.
- Nhánh gần nhất là `codex/onevoice-foundation`; xác minh lại trạng thái Git thực tế trước khi tạo nhánh mới.

## Điều phối và subagent

Đây là nhiệm vụ lớn. Bắt buộc sử dụng subagent với vai trò phù hợp và giao phạm vi trách nhiệm rõ ràng.

1. Giao explorer/scout khảo sát kiến trúc, pipeline dữ liệu, repository tham khảo và blast radius. Hoàn thành khi có bản đồ file/symbol và các rủi ro có bằng chứng.
2. Giao architect hoặc dùng `codebase-design` để xác định interface tối thiểu cho product data, AI content generation, media assets, video rendering jobs và local output. Hoàn thành khi các boundary và hợp đồng dữ liệu đủ để các phần được triển khai độc lập.
3. Chia implementation thành các lát độc lập: Supabase/data, OpenCode Responses API, video rendering, frontend/UI và testing/QA.
4. Mỗi subagent phải được chỉ định rõ file hoặc module sở hữu, biết rằng có agent khác cùng làm việc và điều chỉnh theo thay đổi chung thay vì hoàn tác chúng.
5. Primary agent review kết quả của từng subagent, phản hồi hoặc yêu cầu sửa khi chưa đạt, tích hợp tập trung và chịu trách nhiệm cho kiểm chứng cuối.
6. Không để nhiều agent tự ý checkout trong cùng working directory. Khi thực sự cần nhánh độc lập, tạo git worktree an toàn.
7. Primary agent quản lý commit, push, PR và merge trừ khi đã giao rõ một thao tác Git cụ thể.

## Skills và công cụ

Chủ động chọn các skill đang có sẵn và đọc đầy đủ `SKILL.md` trước khi dùng. Ưu tiên khi phù hợp:

- `subagent-driven-development`
- `codebase-design`
- `writing-plans`
- `test-driven-development`
- `systematic-debugging`
- `frontend-design`
- `requesting-code-review`
- `verification-before-completion`
- `finishing-a-development-branch`

Viết kế hoạch triển khai ngắn với tiêu chí kiểm chứng, rồi thực hiện ngay mà không chờ phê duyệt.

Được phép và nên sử dụng `@unified-computer-use` trong quá trình phát triển để:

- Kiểm tra giao diện trong trình duyệt và ứng dụng local.
- Chạy thử luồng người dùng thực tế.
- Kiểm tra loading, error và empty states.
- Chọn sản phẩm, tạo video, phát video và tải video.
- Kiểm tra GitHub PR bằng giao diện khi cần.

Ưu tiên API, CLI hoặc công cụ chuyên dụng cho thao tác có interface rõ ràng; dùng unified computer use cho kiểm chứng UI và thao tác trình duyệt/native app.

## Nguyên tắc triển khai

- Xây dựng giải pháp nhỏ nhất đáp ứng trọn vẹn mục tiêu; mọi dòng thay đổi phải truy ngược được về yêu cầu.
- Áp dụng test-first cho logic quan trọng và bug fix.
- Kiểm tra ít nhất một luồng thật với Supabase, OpenCode API và video thật; test mock chỉ là lớp bổ sung.
- Video đầu ra phải là MP4 hợp lệ, được lưu local và phát được trên giao diện.
- Hiển thị tiến trình và lỗi rõ ràng khi AI hoặc video renderer thất bại.
- Giữ server secret ngoài browser và log.
- Giữ `.env`, credential, dữ liệu nhạy cảm và video dung lượng lớn ngoài Git.
- Đánh giá license và kiến trúc trước khi lấy ý tưởng hoặc code từ repository tham khảo.
- Có thể dùng FFmpeg hoặc giải pháp phù hợp khác nếu cần; xác minh dependency và ghi rõ cách cài/chạy.
- Giữ thay đổi surgical; để nguyên phần không liên quan.

## Quy trình Git

Thực hiện đầy đủ quy trình sau:

1. Kiểm tra working tree, current branch, remote và các thay đổi hiện hữu.
2. Chạy `git fetch` trước khi tạo nhánh hoặc push; xác định default branch và so sánh local với remote.
3. Tạo nhánh `feat/local-ai-video-pipeline`. Nếu tên đã tồn tại, chọn tên tương đương, rõ nghĩa và không ghi đè nhánh cũ.
4. Tạo các commit nhỏ, độc lập, theo Conventional Commits. Không thêm `Co-Authored-By: Codex`.
5. Trước khi push, fetch và kiểm tra remote lần nữa.
6. Khi remote không có thay đổi mới hoặc việc đồng bộ diễn ra sạch, push nhánh và tạo PR.
7. Review PR, xử lý nhận xét hợp lệ và kiểm tra CI.
8. Chỉ merge khi toàn bộ kiểm chứng bắt buộc đạt.
9. Nếu merge/rebase phát sinh conflict, dừng lại và báo chính xác file cùng commit gây conflict; chờ người dùng quyết định.
10. Sau merge, xác minh trạng thái remote và phiên bản trên nhánh đích.

Bạn được ủy quyền push, tạo PR và merge trong phạm vi nhiệm vụ này nếu GitHub CLI đã đăng nhập và quyền repository cho phép.

## Tiêu chí hoàn thành

Chỉ tuyên bố hoàn thành khi có bằng chứng mới cho tất cả các mục:

- Ứng dụng khởi động được trên local.
- Supabase trả về dữ liệu sản phẩm thật.
- UI hiển thị và cho phép chọn sản phẩm.
- OpenCode Zen tạo được nội dung thật.
- Video MP4 được tạo thật và lưu local.
- Video phát được trên giao diện.
- Người dùng tải được video.
- Server secrets không xuất hiện ở client bundle, log hoặc Git.
- Unit và integration tests đạt.
- Lint và typecheck đạt đối với source code OneVoice.
- Production build đạt.
- Luồng end-to-end được kiểm tra bằng `@unified-computer-use`.
- Tài liệu setup và chạy local đủ để tái hiện trên máy mới.
- Nhánh đã push, PR đã tạo, review xong và merge đúng quy trình nếu quyền cho phép.

Trong quá trình làm, gửi cập nhật ngắn gọn định kỳ: việc đang làm, subagent phụ trách, bằng chứng kiểm chứng và rủi ro mới. Tiếp tục sửa và kiểm tra cho đến khi mục tiêu thực sự hoàn thành.
