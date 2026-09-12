# Prompt bàn giao OneVoice

Copy prompt dưới đây cho agent có quyền đọc **workspace hiện tại gồm untracked files**. Nếu chuyển máy/agent chỉ thấy remote Git branch, cần chuyển đủ working directory trước; không gửi .env/secrets qua prompt.

## Agent điều phối tiếp tục toàn bộ

```text
Bạn tiếp quản dự án OneVoice tại D:\Documents\CODE\OneVoice.
Hãy đọc AGENTS.md, docs/tasks/onevoice/HANDOFF.md, DECISIONS.md, README.md,
TESTING.md và PLAN-REVIEW.md trước khi code. Không bắt đầu lại phỏng vấn.

Nguồn chuẩn: quyết định người dùng trong DECISIONS > verified code/runtime >
architecture > maintained docs > old roadmap/Blueprint. Sản phẩm là một
doanh nghiệp/một Fanpage/self-host, không SaaS; không mở rộng phạm vi hoãn.

Workspace có nhiều uncommitted/untracked changes phải bảo toàn. Không reset,
clean, stash, commit, push hoặc remote migration để tiện làm việc. Đọc diff
trước sửa. Dùng current working directory, không assume remote branch đủ code.

53 issue:29 DONE,2 IN_PROGRESS(017,032),21 TODO,1 BLOCKED(051).
Kiểm lại tracker và code hiện tại. Hoàn tất review/acceptance017 và032 trước,
không viết lại hoặc tự đánh DONE vì đã có code. Sau đó tiếp tục task unblocked
theo dependency; đọc kế hoạch chi tiết AT-xxx trong từng file OV-xxx.

Với mỗi task: mark IN_PROGRESS; đọc existing implementation; viết regression;
implement đúng scope; chạy unit/SQL actual REST/concurrency/browser/media/
provider gates theo TESTING.md; ghi actual signatures, migration, commands,
results và limitations; review; chỉ DONE khi mọi acceptance pass; cập nhật
README. New work phải issue riêng, không âm thầm mở rộng.

Không hỏi lại quyết định đã chốt. Tự quyết chi tiết kỹ thuật hợp lý và ghi lại.
Không nhắn khách/đăng bài/thanh toán thật hay dùng remote business DB làm fixture.
Thiếu sandbox/Meta permissions bắt buộc thì BLOCKED với bằng chứng cụ thể,
tiếp tục task độc lập, không giả mock là live proof.

Nếu chia agents: mỗi task/file/migration có một owner, không cùng sửa shared
descriptive-policy.ts; coordinator giữ README/dependencies và integration review.
Kết thúc báo task hoàn tất, test evidence, blockers và điểm tiếp tục chính xác.
```

## Agent chỉ làm một task

Thay OV-017 và đường dẫn file bằng issue được giao; agent không tự nhận luôn cả dự án.

```text
Tiếp quản đúng task OV-017 trong D:\Documents\CODE\OneVoice.
Đọc docs/tasks/onevoice/HANDOFF.md, DECISIONS.md, TESTING.md, README.md và
OV-017-messenger-consultation.md đầy đủ. Đọc code/diff và dependencies trước sửa.

Chỉ làm task này, bao gồm caller wiring và acceptance tests đã ghi trong issue.
Đây là code đang dang dở, không viết lại từ đầu, không coi status IN_PROGRESS là
chưa có implementation. Kiểm các review findings trong HANDOFF với code hiện tại.

Bảo toàn mọi uncommitted/untracked changes; không destructive Git, remote DB
mutation hoặc external side effects thật. Không sửa shared file nếu agent khác
đang sở hữu; báo coordinator contract cần thay. Migration mới phải tránh collision.

Mark IN_PROGRESS, thực hiện từng checklist/AT, validate theo TESTING.md và
ghi commands/results/actual interfaces/limitations. Chỉ mark DONE khi đủ gate.
Nếu phát hiện việc ngoài scope tạo issue/đề xuất dependency rõ; không mở rộng ngầm.
Bàn giao danh sách files changed, acceptance evidence, unresolved blockers và
contract cho task tiếp theo. Không bắt đầu task khác sau khi xong.
```

## Agent review độc lập

```text
Review read-only task được giao trong docs/tasks/onevoice/.
Đọc DECISIONS, HANDOFF, TESTING, issue và implementation/callers/migrations.
Kiểm mỗi AT có actual evidence, permissions/identity, DB atomicity/race, lease/
revision/freshness, idempotency/UNKNOWN, UI wiring và provider limitations.
Không tự sửa code hoặc đánh DONE. Báo findings có file/line, concrete trigger,
expected vs actual, severity và test thiếu. Phân biệt lỗi tái hiện, suy luận và
external blocker; không tuyên bố all-pass nếu chưa chạy đúng gate.
```
