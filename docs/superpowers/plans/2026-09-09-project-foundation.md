# OneVoice Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo nền OneVoice chạy được bằng Next.js, Supabase Cloud, adapter AI OpenAI-compatible và Docker Compose.

**Architecture:** Một Next.js app giữ UI và BFF. Supabase Cloud cung cấp PostgreSQL; schema được version bằng Supabase migrations. AI đi qua port server-only để đổi provider mà không sửa nghiệp vụ.

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Vitest 5, Zod 4, Supabase JS/CLI, Node 24 Alpine, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-09-project-foundation-design.md`

## Global Constraints

- Dùng pnpm 11.24.0 và Node >= 24.
- Apache-2.0 chỉ áp dụng cho code do đội viết.
- Không commit secret; key server không có tiền tố `NEXT_PUBLIC_`.
- Không thêm catalog, AI UI, auth UI, worker hoặc video trong foundation.
- Mọi hành vi TypeScript mới phải đi qua RED → GREEN → REFACTOR.

---

### Task 1: Repository foundation và health contract

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`
- Create: `src/app/api/health/route.test.ts`
- Create: `src/app/api/health/route.ts`

**Interfaces:**
- Produces: `GET(): Promise<Response>` trả `{ status: "ok", service: "onevoice" }`.

- [x] Tạo package/config và test health mong đợi.
- [x] Chạy `pnpm test src/app/api/health/route.test.ts`, xác nhận FAIL vì chưa có route.
- [x] Viết route tối thiểu.
- [x] Chạy lại test, lint và typecheck tới khi PASS.

### Task 2: Server environment và Supabase client

**Files:**
- Create: `src/lib/env/server.test.ts`, `src/lib/env/server.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `.env.example`, `supabase/config.toml`, `supabase/migrations/20260909013047_20260909000000_healthcheck.sql`, `supabase/seed.sql`

**Interfaces:**
- Produces: `readServerEnv(source?: NodeJS.ProcessEnv): ServerEnv`.
- Produces: `createSupabaseServerClient(): SupabaseClient`.

- [x] Viết test từ chối URL/key/model thiếu và không trả key client-side.
- [x] Chạy test, xác nhận FAIL vì module chưa tồn tại.
- [x] Cài đặt parser Zod và Supabase server client tối thiểu.
- [x] Chạy test tới khi PASS; kiểm migration/seed không chứa PII.

### Task 3: AI provider adapter

**Files:**
- Create: `src/lib/ai/provider.ts`
- Create: `src/lib/ai/openai-compatible.test.ts`, `src/lib/ai/openai-compatible.ts`

**Interfaces:**
- Produces: `AiProvider.generateText(input: GenerateTextInput): Promise<GenerateTextResult>`.
- Produces: `OpenAICompatibleProvider` nhận config và `fetch` implementation.

- [x] Viết test xác nhận URL `/chat/completions`, Bearer header, model/messages và text trả về.
- [x] Chạy test, xác nhận FAIL vì adapter chưa tồn tại.
- [x] Viết implementation tối thiểu với response validation và lỗi an toàn.
- [x] Chạy toàn bộ unit test tới khi PASS.

### Task 4: Trang nền và Docker runtime

**Files:**
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `public/.gitkeep`, `.gitignore`, `.dockerignore`, `Dockerfile`, `compose.yaml`
- Create: `LICENSE`, `README.md`

**Interfaces:**
- Consumes: `GET /api/health`, biến môi trường trong `.env.example`.
- Produces: app standalone tại cổng 3000 và Docker healthcheck.

- [x] Viết homepage server component và CSS theo signal-console design.
- [x] Thêm multi-stage Dockerfile, Compose app service và healthcheck không cần curl.
- [x] Viết README với local, Supabase, AI và Docker commands.
- [x] Chạy `pnpm check`, `pnpm build`, `docker compose config`.
- [x] Chạy `docker compose up --build -d`, đợi healthy và gọi `/api/health`.
- [x] Dừng Compose không dùng `-v`; kiểm `git diff --check` và secret scan.
