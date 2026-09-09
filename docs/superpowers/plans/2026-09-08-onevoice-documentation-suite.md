# OneVoice Documentation Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo bộ tài liệu tiếng Việt đầy đủ để đội thi có thể phát triển và hoàn thành OneVoice theo từng giai đoạn, đồng thời chuẩn bị hồ sơ nguồn mở và demo.

**Architecture:** Tài liệu được tổ chức dạng mô-đun với một README làm điểm vào và một roadmap làm trục điều hành. Các tài liệu chuyên sâu dùng chung thuật ngữ, quyết định và vertical slice đã khóa trong spec.

**Tech Stack:** Markdown, Mermaid tương thích GitHub, liên kết nguồn chính thức, shell validation bằng `rg` và script kiểm tra link nội bộ.

**Spec:** `docs/superpowers/specs/2026-09-08-onevoice-documentation-suite-design.md`

## Global Constraints

- Viết bằng tiếng Việt; giải thích thuật ngữ tiếng Anh ở lần xuất hiện đầu tiên.
- Không dùng `TBD`, `TODO` hoặc placeholder trong bản bàn giao.
- Không gọi dữ liệu GearVN là tồn kho nội bộ hoặc dữ liệu đối tác nếu chưa có bằng chứng.
- MVP là modular monolith, PostgreSQL SSOT, deterministic first-touch attribution, MockChannel bắt buộc và COD/customer confirmation là điểm cuối.
- Mọi khẳng định license và API nền tảng phải có link nguồn chính thức và ngày kiểm tra 08/09/2026.
- Không sửa hoặc xóa dữ liệu và tài liệu hiện có ngoài thư mục `docs/development/`.

---

### Task 1: Bản đồ tài liệu và blueprint toàn dự án

**Files:**
- Create: `docs/development/README.md`
- Create: `docs/development/onevoice-project-blueprint.md`

**Interfaces:**
- Consumes: spec, `docs/onevoice-y-tuong-de-tai.md`, tài liệu OLP/DX-OS chính thức và báo cáo dataset.
- Produces: thuật ngữ chuẩn, phạm vi, ma trận yêu cầu và hệ thống liên kết cho tất cả task sau.

- [ ] Viết README với thứ tự đọc theo vai trò và theo giai đoạn.
- [ ] Viết blueprint gồm bài toán, persona, workflow, module, yêu cầu chức năng/phi chức năng, dữ liệu, AI, bảo mật, OSS, demo, rủi ro và tiêu chí thành công.
- [ ] Thêm ma trận truy vết yêu cầu → module → bằng chứng → tài liệu.
- [ ] Kiểm tra không có placeholder và mọi thuật ngữ lõi có định nghĩa nhất quán.

### Task 2: Roadmap phát triển và playbook thực thi

**Files:**
- Create: `docs/development/development-roadmap.md`
- Create: `docs/development/team-execution-playbook.md`

**Interfaces:**
- Consumes: phạm vi và thuật ngữ từ Task 1.
- Produces: phase gate, lịch, ownership và Definition of Ready cho Task 3–5.

- [ ] Viết roadmap từ 08/09–17/09, 18/09–02/10 và 03/10–10/12.
- [ ] Mỗi phase ghi rõ mục tiêu, đầu vào, bước thao tác, đầu ra, dependency, acceptance criteria, lệnh kiểm tra, rủi ro và cut-line.
- [ ] Viết playbook cho đội 2, 3 hoặc 4 người; khóa ba owner lõi phù hợp giới hạn OLP ba thí sinh.
- [ ] Thêm daily cadence, Git workflow, review, feature freeze, incident/demo protocol và decision log.

### Task 3: Kiến trúc, công nghệ và repository

**Files:**
- Create: `docs/development/architecture-and-tech-stack.md`
- Create: `docs/development/tools-and-repositories.md`

**Interfaces:**
- Consumes: blueprint và roadmap.
- Produces: module boundaries, entity/flow contracts, dependency decisions và fallback dùng trong test/DevOps.

- [ ] Mô tả modular monolith, worker, PostgreSQL, object storage, adapters và AI provider interface.
- [ ] Ghi rõ entity tối thiểu, state transitions, invariants và các điểm Truth Guard kiểm tra.
- [ ] Lập bảng công nghệ/repository gồm vai trò, license, maturity, quyết định chọn/loại/để sau, điều kiện và fallback.
- [ ] Xác minh link tới nguồn chính thức cho license/API; phân biệt code, model, dataset và media.

### Task 4: Dữ liệu, AI, guardrail và kiểm thử

**Files:**
- Create: `docs/development/data-ai-and-guardrails.md`
- Create: `docs/development/testing-and-quality-plan.md`

**Interfaces:**
- Consumes: entity/flow từ Task 3 và phase gates từ Task 2.
- Produces: test fixtures, invariants, eval set, E2E contract và Definition of Done.

- [ ] Mô tả data tiers, curated demo dataset, version/hash, provenance, freshness, evidence và PII policy.
- [ ] Đặc tả Opportunity rule, Truth Guard, claim validation, AI grounding, prompt-injection boundary và human handoff.
- [ ] Viết test pyramid, test matrix cho domain/API/adapter/AI/security và ít nhất bốn E2E P0.
- [ ] Ghi test data, controlled clock, seed/reset, failure injection, regression policy và quality gates.

### Task 5: DevOps, OSS compliance, demo và chấm điểm

**Files:**
- Create: `docs/development/devops-release-and-oss-compliance.md`
- Create: `docs/development/demo-validation-and-scoring.md`

**Interfaces:**
- Consumes: stack, test gates và roadmap.
- Produces: quy trình build/release tái lập, compliance evidence và kịch bản demo được đo.

- [ ] Viết môi trường dev/demo, Docker Compose, configuration/secrets, CI gates, backup/reset, observability và release checklist.
- [ ] Viết license audit bốn luồng, SBOM, dependency/model/media inventory, NOTICE và vulnerability policy.
- [ ] Viết demo 5 phút và 10 phút, fallback offline, rehearsal checklist và bộ câu hỏi phản biện.
- [ ] Ánh xạ tính năng/bằng chứng vào thang điểm HUTECH và PoF/showcase OLP; không tự đặt số liệu tác động.

### Task 6: Tích hợp và kiểm tra toàn bộ bộ tài liệu

**Files:**
- Modify: `docs/development/README.md`
- Modify: các file trong `docs/development/` khi phát hiện mâu thuẫn.

**Interfaces:**
- Consumes: toàn bộ Task 1–5.
- Produces: bộ tài liệu thống nhất, liên kết được và sẵn sàng cho đội sử dụng.

- [ ] Kiểm tra đủ 10 file và mọi file đều được README liên kết.
- [ ] Chạy `rg -n 'TBD|TODO|FIXME|placeholder|điền sau' docs/development` và sửa mọi kết quả thực sự là nội dung chưa hoàn thiện.
- [ ] Kiểm tra các thuật ngữ/date/invariant: 17/09/2026, 02/10/2026, MockChannel, first-touch, COD, PostgreSQL SSOT và vertical slice.
- [ ] Kiểm tra liên kết Markdown nội bộ tồn tại và link ngoài dùng HTTPS tới nguồn chính thức.
- [ ] Đối chiếu từng tiêu chí nghiệm thu trong spec với bằng chứng cụ thể trong file.
- [ ] Đọc chéo như một thành viên mới: README → roadmap → phase đầu tiên phải đủ để bắt đầu mà không cần đoán.
