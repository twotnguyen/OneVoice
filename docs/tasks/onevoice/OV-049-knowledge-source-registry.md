# OV-049 — Quản lý nguồn tri thức bổ sung

## Status

DONE

## Objective

Manager thêm/sửa/tắt nguồn text và URL cho tư vấn.

## Context

Bổ sung để sửa diễn giải DB-only trái lời cuối cuộc phỏng vấn. Xem DECISIONS.md; phạm vi nguồn cụ thể là mặc định kỹ thuật, không phải xác nhận mới.

## Current behavior

Chưa có registry ngoài catalog.

## Expected behavior

Giao diện manager tạo nội dung text hoặc URL HTTPS với tên, phạm vi sản phẩm/chủ đề, loại authority và thời hạn freshness; staff chỉ đọc.

## Requirements

Schema registry + API/UI CRUD có version conflict và audit transaction; xóa mềm giữ nguồn lịch sử. Không fetch URL trong task này. Ruling: plaintext và HTTPS HTML là hai adapter đầu; các định dạng tài liệu khác không giả vờ đã hỗ trợ. Nội dung lưu được dùng khi đã ingest hợp lệ, không có bước duyệt riêng.

## Dependencies

OV-007, OV-009

## Edge cases

URL credentials/private host bị từ chối; text quá lớn; nguồn bị tắt; staff giả manager.

## Acceptance criteria

- [x] Expected behavior và Requirements đầy đủ trong phạm vi.
- [x] Testing có bằng chứng, không lộ credentials hoặc ghi nguồn thật khi test.
- [x] Nguồn mới tích hợp theo dependency, không giả định runtime đã hoàn tất chỉ từ schema.

## Testing

Permission, version conflict, audit rollback, input bounds; UI tạo/tắt nguồn, chưa gọi web thật. Vitest, typecheck, scoped lint và local SQL tương ứng.

## Implementation decisions and evidence

Implemented scoped versioned source registry, manager save/soft-disable and staff read-only API/UI. SQL rechecks active manager, product ownership, optimistic revision and receipt identity; source history and audit commit together. No URL fetching or ingestion is performed here.

TDD evidence:19 initial domain tests,3 route tests and20 local SQL assertions passed; URL normalization review added a failing regression then fix, bringing source tests to23. Accepted URLs canonicalize scheme/hostname/default port/trailing dot before SQL. Actual local HTTP verified text/HTTPS source create, replay, conflict, read and disable, including uppercase URL normalization. Browser verified text source save version1, disable version2 and staff read-only view. Scoped lint passed; combined typecheck passed before unrelated warranty TDD files were introduced.

Independent review accepted after identifying URL normalization; fix validated with both unit and local HTTP/SQL boundaries. Source freshness requires matching version, active state, valid nonfuture fetch time and unexpired TTL. Declared authority never raises instruction priority or overrides transaction facts. OV-050 owns DNS validation, ingestion status, retrieval and refresh.

Implementation defaults: plaintext or HTTPS HTML source, declared business/reference authority (metadata, never instruction priority), product/topic scope and freshness1–720hours. Registry validation rejects credentials, IP literals and local hostnames; OV-050 must additionally resolve and revalidate public DNS on every fetch/redirect. No HTTP fetch here. Active source changes invalidate prior ingestion through revision mismatch, with no extra approval step.
