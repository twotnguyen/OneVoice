# Plan review before implementation

## Scope and source of truth

Đối chiếu DECISIONS với từng nhóm task trong README. Không thêm SaaS, nhiều Page, inbox reply UI, COD, approval từng bài hoặc stock trả phí. Các mặc định kỹ thuật được phân biệt khỏi câu trả lời của user.

## Findings and rulings

| Finding | Decision before coding |
|---|---|
| Handoff module thuần chưa bảo đảm pause nguyên tử | OV-002 chỉ quy tắc; OV-014 và OV-018 chịu DB transaction và send-time recheck; không ghi DONE feature handoff khi chỉ module xong |
| Payment state module không đủ proof thanh toán | OV-004 nhận verified proof từ boundary; OV-024 kiểm chữ ký/amount và transaction; redirect không được finalize |
| Marketing priority completion dễ tự resume | OV-003,030,036,038 cùng giữ PAUSED; không có transition tự resume |
| Insights đến sau opportunity, nguy cơ vòng phụ thuộc | OV-029 nhận observations tùy chọn, thiếu ghi no-data; OV-041 wiring feedback sau OV-040, không đổi objective manager |
| OV-010 quản lý stock trước reservations | Lưu stock vật lý; OV-022 thêm reserved/cross-field invariant bằng migration, không hai cột tồn authoritative cạnh tranh |
| Đăng thật và payment thật thiếu access | Tách code/mocks khỏi live gates; không DONE task yêu cầu sandbox khi chưa chạy |
| Các task UI cần sửa file dirty | Không sửa 5 file user trong giai đoạn nền; task tích hợp đọc diff và merge, không rollback |
| Worktree skill đề nghị hỏi tạo worktree, user yêu cầu không hỏi nữa | Làm tại checkout hiện hành trên nhánh codex/onevoice-confirmed-product, không copy secrets/node_modules sang checkout khác, không stage/commit thay đổi của user |

## Dependency audit

Kiểm bằng dữ liệu tracker: 44 tasks, mọi dependency tồn tại và nhỏ hơn ID task; không cycle. Task không dependencies: 001,004,031,042. Ưu tiên số tăng dần trong các task mở khóa, có thể làm baseline repair khi cần validation.

## Responsibility and test audit

| Issues | Responsibility / boundary | Verification |
|---|---|---|
| 001–004 | Pure domain rules; chưa API/persistence | Ma trận quyền, state/expiry boundaries, immutable input |
| 005–009 | Auth, existing route guards, settings, audit | SQL RLS + real server session + forged role tests |
| 010–011 | Catalog/policy truth inputs | version conflict, active date boundaries, unauthorized edits |
| 012–019 | Durable channel processing and human queue | leases, signatures, dedup, handoff send race, UI claims |
| 020–027 | Customer checkout and tracking | atomic inventory, signed VNPay callbacks, identity binding |
| 028–030 | Sources/opportunity/campaign | freshness, source availability, pause persistence |
| 031–035 | Coherent generation, evidence, assets, video/Studio | one generation regression, caption truth, SSRF, visual/audio QA |
| 036–038 | Schedule/publish/control | pause/latest facts recheck, timeout reconciliation, manager guards |
| 039–041 | Attribution and analytics | unknown preserved, paid-only money, metrics timestamps |
| 042–044 | Baseline/deploy/release evidence | full suite with prerequisites, restore/restart, sandbox E2E |

## Review status

Primary and independent reviews completed before production code. Independent reviewer found seven concrete issues, all addressed: release now depends on staff queue UI; auth/settings depend on audit; paused marketing explicitly permits only the matching active priority job; OV-045 owns knowledge gaps; OV-046 owns render bridge; checkout/status/attribution include producer wiring; analytics includes observation consumers. Audit UI ownership split explicitly between repository OV-009 and authenticated viewer OV-008.

Final dependency validation: 46 files, topological order covers all 46, zero missing/cyclic edges, every task is in OV-044 release dependency closure. Forward ID references OV-045/046 are intentional; README Order is computed by dependencies rather than ID. All required issue headings present. No product code was changed before this review.

## Execution rulings

- Work in existing checkout on a new codex branch, honoring user request to stop further questions and preserve dirty changes. No commits/stashes/worktree copies or external writes.
- Use focused implementation/review agents per task where useful, following subagent-driven-development. Parent validates integration and tracker, agents never stage/commit user files.
- Docker daemon available (29.7.2). FFmpeg/ffprobe not on PATH; media integration prerequisite belongs OV-042. Do not mask those failures with skips.

- Execution review: tách OV-047 môi trường Linux và OV-048 account lifecycle khỏi session task OV-006. 48 issues, dependency graph acyclic và toàn bộ nằm trong release closure. OV-047 bao gồm explicit timeout cho test render nặng nếu diagnostic chứng minh thiếu budget mặc định; không nới assertion hoặc skip.

- Correction: diễn giải DB-only mâu thuẫn lời cuối người dùng «Không chỉ lấy từ csdl». Áp dụng lời cuối, thêm OV-049 registry và OV-050 ingestion; retrieval thuộc OV-016. Manager-configured sources là mặc định kỹ thuật công khai, không gán thành câu trả lời đã xác nhận. Không thay đổi domain rules đã hoàn tất.

- OV-051 tách live Meta ingress evidence khỏi local contract013; release044 phụ thuộc051. Thiếu credentials/quyền không ngăn local implementation nhưng không được claim kết nối Facebook thật. Official docs kiểm lại qua browser vì web fetch429; dùng SHA256/ACK5s theo tài liệu2026, không lấy SHA1/20s sample cũ.

Incremental review: OV-046 needed OV-032 persisted content-version/script identity before its render adapter can reconcile artifacts honestly. Added dependency; no extra feature or duplicate content table. OV-017/018 contracts now explicitly fence delayed messages and old generated replies across handoff/completion.

OV-052 extracted before transport implementation:028 and050 share a neutral public HTTPS reader with DNS pinning, TLS and bounded resources. Both depend on052; customer ingestion does not depend on provider-specific trends. Task count52, no duplicate transport work.

Current execution checkpoint:52issues validated again for all required headings, tracker/status agreement, dependency readiness and completeOV-044 release closure;28DONE/2IN_PROGRESS/21TODO/1BLOCKED. OV-016 independent review resolved invalidstock and specification-truncation conflicts before unlockingOV-017. OV-030 review found recent-pick concurrency and same-version program-import drift; both must pass regressions before completion. OV-043 now owns proven request-level SQL deadlines and production filesystem-tracing verification, avoiding unrelated scope expansion.

OV-053 extracted before generation implementation: one shared campaign post/script generation service for Studio and scheduler. OV-032 remains version/truth storage, OV-034 scene/media composition, OV-046 rendering, OV-035 UI andOV-036 timing. OV-053 depends032/034;035 depends053; no cycle or duplicate generator. This fills previously unowned work within confirmed MVP, not a new user requirement.
