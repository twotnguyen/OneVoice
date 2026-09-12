# OV-045 — Ghi thiếu thông tin và bổ sung tri thức

## Status

DONE

## Objective

Ghi gap từ câu hỏi chưa trả lời có entity/field/reason/conversationRef, trạng thái OPEN/RESOLVED và manager view.

## Context

Theo [DECISIONS.md](DECISIONS.md); task bổ sung qua review trước implementation để tránh thiếu ownership.

## Current behavior

Chưa lưu thiếu facts trong hỗ trợ.

## Expected behavior

Ghi gap từ câu hỏi chưa trả lời có entity/field/reason/conversationRef, trạng thái OPEN/RESOLVED và manager view.

## Requirements

Handoff thiếu evidence ghi gap bền vững cùng request; dedup câu hỏi tương đương theo field/entity; manager xem/redact khách và đánh resolved sau cập nhật dữ liệu; không tự học nội dung khách thành facts.

## Dependencies

OV-007, OV-009, OV-014

## Implementation boundaries

src/lib/knowledge/gaps.ts; src/app/(app)/knowledge/; supabase/migrations/

## Edge cases

Ghi references thay vì PII/raw chat trong log; không tự bật lại hội thoại do gap đã giải quyết.

## Acceptance criteria

- [x] Toàn bộ Requirements và Expected behavior có implementation và test.
- [x] Các tình huống Testing có bằng chứng kết quả.
- [x] Không chạm phạm vi task khác; ghi quyết định và cập nhật tracker.

## Testing

Không tạo facts từ chat; retry không nhân gap; staff không sửa nguồn tri thức; resolved gap vẫn giữ lịch sử. Chạy test colocated, typecheck, lint và local DB/worker integration tương ứng.

## Implementation decisions and evidence

Chưa triển khai; không có kết quả kiểm thử mới.


Implementation boundary clarified: chỉ lưu mã field/reason và references tới sản phẩm, event, hội thoại; không sao chép câu hỏi, tên/số điện thoại khách vào gap/audit. Manager mở hội thoại qua trang hỗ trợ được phân quyền khi cần context. Mỗi occurrence mới có thể mở lại gap đã resolved; replay occurrence cũ không mở lại. Resolve không hoàn tất handoff hoặc tự bật AI. OV-017 sẽ gọi atomic missing-evidence handoff port, không có model/worker registration trong OV-045.

Verification: 6 colocated Vitest tests,34 local pgTAP assertions, scoped ESLint and typecheck passed. Independent review found changed classification of an already completed event could create a new gap; two regression assertions failed before the fix and pass with active-handoff identity fencing. Exact occurrence replay remains stable. Browser manager viewed one synthetic gap, resolved it, saw it under RESOLVED, followed support link and verified WAITING_STAFF unchanged. Test-only handoff subsequently explicitly completed and its queued job removed; gap/history retained local only. No inbound AI adapter registered yet (OV-017).
