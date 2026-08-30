# OpenCorp — Hệ điều hành doanh nghiệp số AI

> Đồng nghiệp AI trong từng phòng ban: doanh nghiệp giữ nguyên bộ máy con người,
> "tuyển" thêm nhân viên AI làm phần việc lặp lại — con người giữ quyền quyết định.

Sản phẩm dự thi **Cuộc thi Xây dựng Hệ điều hành Doanh nghiệp số AI** (Khoa CNTT HUTECH)
và **OLP Phần mềm nguồn mở 2026** (chủ đề DX-OS, kiến trúc H-P-D-I).

## Kiến trúc

| Không gian | Thành phần |
|---|---|
| **[H] Human** | Keycloak (SSO), tài liệu chuẩn P.A.R.A, Mission Control |
| **[P] Process** | Orchestrator (FastAPI), vòng lặp Writer→QC, webhook Chatwoot, phê duyệt human-in-the-loop |
| **[D] Data** | PostgreSQL (một nguồn sự thật), nhật ký agent, dashboard |
| **[I] Intelligence** | Ollama (LLM local), Qdrant (RAG), các agent phòng ban |

Chi tiết: [docs/kien-truc.md](docs/kien-truc.md)

## Chạy nhanh

Yêu cầu: Docker + Docker Compose.

```bash
cp .env.example .env        # điền LLM_BASE_URL + LLM_API_KEY của nhà cung cấp bạn dùng
docker compose up -d        # lõi: Postgres, Keycloak, Qdrant, Orchestrator
```

- Mission Control: <http://localhost:8000>
- Keycloak admin: <http://localhost:8080> (admin / xem `.env`)
- Chạy demo vòng lặp Writer→QC: `make demo-content` rồi F5 Mission Control

### Cấu hình LLM

Orchestrator gọi LLM qua **API chuẩn OpenAI-compatible** (base URL + API key) —
đổi nhà cung cấp chỉ cần sửa `.env`, không phải sửa code:

```bash
LLM_BASE_URL=https://api.openai.com/v1   # hoặc OpenRouter, Groq, DeepSeek...
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
```

Không đặt `LLM_API_KEY` → orchestrator tự rơi về **Ollama local** làm phao
demo khi mất mạng (bật bằng `docker compose --profile local-llm up -d` rồi
`make pull-model`).

Bật trục CSKH (Chatwoot):

```bash
docker compose --profile cskh run --rm chatwoot bundle exec rails db:chatwoot_prepare   # lần đầu
docker compose --profile cskh up -d
# Chatwoot: http://localhost:3000 — tạo tài khoản admin theo hướng dẫn màn hình đầu
```

## Thành phần nguồn mở sử dụng

| Thành phần | Giấy phép | Vai trò |
|---|---|---|
| PostgreSQL | PostgreSQL License | CSDL — một nguồn sự thật |
| Keycloak | Apache-2.0 | SSO / định danh tập trung |
| Qdrant | Apache-2.0 | Vector DB cho RAG |
| Ollama | MIT | Chạy LLM local |
| Chatwoot | MIT | Hộp thư CSKH đa kênh |
| FastAPI, httpx, psycopg | MIT / BSD / LGPL | Orchestrator |

## Cấu trúc repo

```
docker-compose.yml          # toàn bộ hạ tầng, một lệnh
infra/db/init/              # schema + seed dữ liệu demo
services/orchestrator/      # trục điều phối AI + Mission Control
docs/                       # tài liệu kiến trúc
```

## Đóng góp & giấy phép

- Lỗi/đề xuất: mở [Issue](../../issues). Quy trình đóng góp: [CONTRIBUTING.md](CONTRIBUTING.md)
- Thay đổi theo phiên bản: [CHANGELOG.md](CHANGELOG.md)
- Giấy phép: [MIT](LICENSE)
