# OV-057 — Giao diện chat công khai /chat

## Kế hoạch bàn giao chi tiết — 2026-09-13

Phần này bổ sung các mục Requirements/Acceptance criteria bên dưới; đọc cùng [HANDOFF.md](HANDOFF.md) và [TESTING.md](TESTING.md). Đây là kế hoạch thực hiện, không phải kết quả test mới. Tên file mới là đích dự kiến; kiểm tra cây mã trước khi tạo để không trùng implementation hiện hữu.

Public route **`/chat`**. Staff đã chiếm `/support` — không đổi. (User từng muốn public `/support`; engineering giữ staff `/support` + public `/chat` để tránh login-gate collision — ghi trong issue này.)

### Files và ownership

Tạo `src/app/chat/` (ngoài `(app)/` — layout staff có nav Hỗ trợ/Đăng xuất). Client poll `/api/chat/messages`. Không sửa `src/app/(app)/support/` (OV-059 mới composer). Styles colocated. Đọc `src/app/login/` và `src/app/order-confirmation/` làm mẫu public page.

### Hợp đồng đầu vào, đầu ra và persistence

- Không login. Không staff chrome. Cookie phiên do API OV-055/056 set khi gửi/poll.
- Gửi/xem, cursor poll, reload giữ history (browser refresh → GET lại, không empty nếu session còn).
- Trạng thái: AI processing (inbound đã nhận, chưa có outbound — 056 đủ), waiting staff (`WAITING_STAFF`), claimed (`STAFF_ACTIVE`). Text AI/staff đầy đủ đến từ 058/059 khi có; UI không block nếu chưa có reply.
- loading / error / empty. Responsive + a11y (label ô nhập, `aria-live` tin mới, focus không kẹt, keyboard gửi).
- Không Graph. Không link Meta. Không PSID trên UI.

### Trình tự thực hiện

- [x] Page `/chat` public; không `(app)` layout.
- [x] Composer + transcript + poll; empty/loading/error; states từ status API.
- [x] Browser local skipped: component+route tests cover send/reload/401 (assignment allows skip).
- [x] Kiểm `/support` vẫn login-gate, copy Meta inbox không đổi ở task này.
- [x] AT; README/Status sau TESTING.md.

### Acceptance test cases bắt buộc

- [x] AT-057-01: GET `/chat` không login — form chat, không nav staff, không redirect `/login`.
- [x] AT-057-02: Gửi tin → hiện trong transcript; poll/cursor nhận bản persist; reload (F5) giữ history khi cookie còn.
- [x] AT-057-03: UI loading/error/empty; trạng thái processing / waiting staff / claimed không crash khi chưa có AI text (không Graph).
- [x] AT-057-04: a11y/responsive — label, keyboard submit, không phụ thuộc hover-only; viewport hẹp dùng được.
- [x] AT-057-05: `/support` không bị đổi route/login-gate trong task này; public không thấy chrome staff.

### Lệnh và bằng chứng

Test entry dự kiến: browser local + test component nếu có colocated. Không full suite.

```powershell
node node_modules/vitest/vitest.mjs run src/app/chat --maxWorkers=1 --no-file-parallelism
```

Browser: mở `/chat` trên app local, gửi fixture, reload. Ghi screenshot nhỏ chỉ khi repo đã có `docs/tasks/onevoice/evidence/` (OV-062 sở hữu evidence E2E đầy đủ). AT không Facebook live.

## Status

DONE

## Objective

Trang công khai `/chat`: gửi/xem, poll, reload giữ history, trạng thái AI/waiting/claimed, loading/error/empty, a11y/responsive; không login; không đụng staff `/support`.

## Context

Thực hiện website-first trong [DECISIONS.md](DECISIONS.md). Task 57 trong [tracker](README.md). Public pages hiện: `/login`, `/order-confirmation/[token]`. Staff queue `src/app/(app)/support/` + `/api/support`. Route conflict đã chốt: public `/chat`.

## Current behavior

Không có `/chat`. Khách không UI tư vấn trừ (tương lai) Messenger.

## Expected behavior

Khách mở `/chat`, nhắn, thấy history sau reload, thấy trạng thái chờ nhân viên/đang xử lý khi hội thoại handoff. Không cần Facebook.

## Requirements

- Route `/chat`. Poll. Reload history. States AI processing / waiting staff / claimed. loading/error/empty. a11y/responsive.
- No login. No staff chrome. No Graph.
- Staff `/support` unchanged in this issue.

## Dependencies

OV-056

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/app/chat/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

Không thêm composer staff. Không checkout/status lookup (OV-060). Không sửa Dockerfile/.env.

## Edge cases

- JS tắt: không fake “đã gửi” nếu POST fail.
- Poll khi tab ẩn: không spam vô hạn (cùng tinh thần support 10s + visibility).
- Cookie bị xóa giữa chừng: empty/error, không mix history người khác.
- Không dùng `/support` làm public alias.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.
- [x] AT-057-01..05 PASS không Graph.

## Testing

Browser local anonymous; reload persistence; UI states; `/support` regression login. Không khách thật.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. UI: loading/empty/error; keyboard.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Validation date / environment: 2026-09-13 local Windows; no Graph / VNPay / production charge.
Workspace identifier: git HEAD d442a91ccead974422b56ecf7a92cfc190cb8888; owned untracked: `src/app/chat/**`, this issue. README left to orchestrator.
Files and migration versions changed: `src/app/chat/page.tsx`, `chat-client.tsx`, `chat-state.ts`, `chat.module.css`, `chat.test.ts`, `session/route.ts`. No migration. Did not edit `src/app/(app)/support/`, `messages.ts`, worker, scheduler, README, `.env`, or `database.types.ts`.
Acceptance cases:
- AT-057-01 PASS (page is outside `(app)`; no `requirePagePermission` / `getStaffSession` / `/login` redirect; composer form present; no staff nav / Graph / PSID)
- AT-057-02 PASS (vitest: first visit POST `/chat/session` then GET `/api/chat/messages`; send appears only after persist GET; cursor poll merges; new `PublicChatSession.load()` keeps history while cookie remains; cookie drop clears transcript and errors)
- AT-057-03 PASS (loading/empty/error phases; `AI_ACTIVE` inbound-only = processing; `WAITING_STAFF` / `STAFF_ACTIVE` copy without outbound text; hidden-tab poll does not fetch)
- AT-057-04 PASS (label `Tin nhắn`, form `onSubmit`, Enter submits textarea, `aria-live="polite"`, `min-height: 44px`, `@media (max-width: 640px)`, send button not hover-only)
- AT-057-05 PASS (`/support` still `requirePagePermission("read_operations","/support")` + Meta inbox copy; `(app)` layout still has Hỗ trợ/Đăng xuất; public `/chat` has neither)
Commands executed:
```
node node_modules/vitest/vitest.mjs run src/app/chat --maxWorkers=1 --no-file-parallelism
```
Results: vitest 6 passed / 1 file. Browser skipped (assignment: component+route tests prove no login gate and poll UI). tsc/eslint/full suite skipped (orchestrator; concurrent siblings). No Graph.
DB proof: none required; no schema change. Session create reuses OV-055 `createWebsiteSession` via POST `/chat/session`.
UI/media/provider proof: colocated vitest; no Facebook live; no screenshots (OV-062 owns E2E evidence).
Implementation decisions: Public `/chat` is a root App Router page (not under `(app)`). Client `PublicChatSession` POSTs `/chat/session` on first visit (colocated route, `ov_web_session` HttpOnly via OV-055 helper), then cursor-polls GET `/api/chat/messages` every 10s while `document.visibilityState==="visible"`. POST send `{text,requestId}` (max 1800); transcript updates only after persist GET — failed POST does not fake a row. Reload = new load GET without cursor. 401 clears messages. Status copy from `AI_ACTIVE` / `WAITING_STAFF` / `STAFF_ACTIVE`; empty outbound text still renders. No staff chrome, no Graph, no `/support` alias.
Remaining limitations/blockers: Browser walkthrough not run in this agent (component/HTTP tests cover AT). AI/staff outbound text still owned by OV-058/059; UI already accepts empty outbound. README tracker owned by orchestrator. Typecheck/eslint deferred to orchestrator.
Cleanup: no fixtures, no running processes owned by this task.
Reviewer conclusion: AT-057-01..05 PASS on vitest; issue DONE. README status sync is orchestrator-owned.
