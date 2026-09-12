# OV-029 — Đề xuất sản phẩm và chủ đề

## Status

DONE

## Objective

Rule+AI scoring có lý do/evidence theo stock/promotion/performance/trends; auto-goal hoặc manager objective.

## Context

Thực hiện quyết định trong [DECISIONS.md](DECISIONS.md), ưu tiên phỏng vấn hơn Blueprint cũ. Đây là task 29 trong [tracker](README.md). Các yêu cầu chung trong tracker áp dụng đầy đủ.

## Current behavior

Chưa Opportunity Engine.

## Expected behavior

Rule+AI scoring có lý do/evidence theo stock/promotion/performance/trends; auto-goal hoặc manager objective.

## Requirements

Cho phép trend không gắn SKU trong brand rules; lọc banned topics; tránh lặp; dùng DB product facts; lưu score inputs/version thay vì số điểm tùy ý.

## Dependencies

OV-008, OV-010, OV-011, OV-028

## Implementation boundaries

Đọc trước và chỉ sửa phạm vi: `src/lib/opportunities/`. Có thể tạo test colocated và helper nội bộ cho trách nhiệm này; phát sinh tính năng khác phải tạo issue. Mọi state mutation có persistence phải tuân transaction/idempotency của task tích hợp, không chỉ gọi hàm thuần rồi ghi bất kỳ.

## Edge cases

Hiệu quả đo được thêm sau OV-040; ban đầu ghi chưa có dữ liệu thay số giả.

## Acceptance criteria

- [x] Hành vi Expected behavior và toàn bộ Requirements được thực hiện trong đúng phạm vi task.
- [x] Các tình huống Testing dưới đây có kiểm thử chứng minh và kết quả được ghi lại.
- [x] Không phá các API đang dùng hoặc bỏ qua quyền/kiểm chứng ở biên liên quan.
- [x] Ghi quyết định kỹ thuật và giới hạn thực tế; task tích hợp chưa làm không được mô tả như đã chạy thật.

## Testing

Stock zero, expired promotion, no trend, goal mixed, forbidden topic, evidence outdated.

Chạy Vitest vào đúng test colocated của phạm vi thay đổi, `pnpm typecheck`, ESLint vào file thay đổi. Với schema dùng Supabase local và kiểm permission/transaction thật; với media xem thành phẩm và kiểm ffprobe; với integration cần sandbox proof ngoài mocks. Không dùng dữ liệu khách thật hay giao dịch thật làm fixture.

## Execution checklist

- [x] Mark IN_PROGRESS trong task và README.
- [x] Đọc code hiện hành, viết regression/acceptance test trước thay đổi code.
- [x] Chạy test thấy lỗi đúng nguyên nhân; triển khai trong phạm vi.
- [x] Chạy validation phù hợp, self-review diff, cập nhật acceptance.
- [x] Chỉ mark DONE khi tất cả criteria đạt; nếu thiếu điều kiện ghi BLOCKED và tiếp tục task độc lập.

## Implementation decisions and evidence

Pre-implementation scope ruling: OV-029 owns a bounded read-only snapshot adapter and rule/AI ranking contract under `src/lib/opportunities/`. The decision includes frozen inputs, source versions, an input digest, algorithm version, component scores and exclusions. OV-030 must persist that complete contract atomically with its campaign/idempotency receipt and revalidate current operational facts before scheduling/publishing; this task does not create campaigns or turn automation on.

Technical defaults, not newly elicited product decisions: operational snapshot maximum age five minutes; recent-pick exclusion seven days; trend-only content requires an explicit allowed-topic match and no forbidden-topic match. Rule scores are documented heuristics, never measured performance. Performance is explicitly null/unavailable until OV-040. AI is a bounded advisory ranking step using the existing provider port, cannot add eligible candidates or alter operational facts; unavailable AI allows rule-only automatic ranking, while an unverified free-text manager goal fails closed.



Implementation evidence: `src/lib/opportunities/engine.ts` and `snapshot.ts` provide the frozen rule/AI decision contract and uncached, bounded real Supabase reads. Detailed scoring weights, safety boundaries, source limits and OV-030 responsibilities are recorded in `src/lib/opportunities/README.md`. No schema or state mutation was added. Sixteen offline tests pass (stock/variant gates, expired programs, manager/mixed goals, banned and permitted trend topics, AI-invalid candidates, source TTL during ranking, separate discounts, recent topics and null performance). The opt-in actual local REST test passed independently, proving fresh variant price/version, parent-stock non-substitution, expired promotion exclusion, foreign product denial and absent trends. Scoped ESLint and whole-project typecheck pass. Tests used only synthetic local data and fake AI responses; no real provider calls occurred.

Independent review follow-up: two regressions reproduced fractional-percent rejection and unstable embedded variant ordering before the fixes. Program discount validation now accepts fractional percentage/legacy values, with integer-only fixed VND and percentage range0–100. Variant facts are sorted by ID before freezing. Eighteen offline tests pass; actual local REST proof also passed with an expired12.5% promotion and then the same active12.5% promotion.

Parent acceptance: independent review found fractional percentage incompatibility and nondeterministic variant ordering; both fixed with red/green regressions. Parent reran18 offline tests successfully and inspected corrected schema/ordering. Actual local REST proof covers valid expired/active12.5% program and variant bucket/version; no live AI or publish claim. Whole project typecheck passed before concurrent OV-016 additions; latest unrelated missing RPC type is tracked in that active task, not a reason to misrepresent current global compilation.
