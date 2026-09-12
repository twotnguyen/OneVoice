# OV-052 — Đọc nguồn HTTPS công khai có giới hạn

## Status

DONE

## Objective

Một adapter HTTPS dùng chung cho thu thập xu hướng và nạp tri thức, chặn truy cập địa chỉ nội bộ và giới hạn tài nguyên.

## Context

Tách từ OV-028 khi OV-050 cần cùng primitive mạng. Tránh hai cơ chế fetch khác nhau hoặc buộc tư vấn khách phụ thuộc toàn bộ tính năng xu hướng.

## Current behavior

Registry OV-049 chỉ kiểm tra URL, chưa fetch. Media resolver hiện có không phải adapter đọc tài liệu văn bản.

## Expected behavior

`src/lib/network/public-http.ts` đọc văn bản từ hostname HTTPS công khai, trả nội dung, URL cuối và content type; lỗi có mã an toàn, không chứa credentials/nội dung.

## Requirements

- Chặn credentials, IP literal, localhost/private/reserved addresses; kiểm tất cả IPv4 DNS responses và ghim địa chỉ kết nối, giữ TLS hostname verification.
- Kiểm lại URL/DNS khi redirect; tối đa ba redirect cùng origin.
- Giới hạn toàn thao tác tối đa8giây,512KiB body,16KiB headers; hỗ trợ abort.
- Không gửi cookie/auth header; yêu cầu identity encoding và từ chối compressed response để tránh decompression bombs.
- IPv4-only là giới hạn đầu tiên có chủ đích; IPv6-only phải báo lỗi, không bỏ kiểm tra.
- Không phân loại nội dung, ghi DB, thực hiện AI hoặc tự lập lịch. Các consumer028/050 sở hữu provenance/freshness/retry.

## Dependencies

Không.

## Edge cases

DNS mixed public/private, DNS rebinding, redirect qua origin khác, body streaming quá lớn/chậm, abort trước/sau DNS, response lỗi, TLS verification, timeout trong chuỗi redirect.

## Acceptance criteria

- [x] Một public-text transport được dùng chung, không fetch tùy ý qua global fetch ngoài guard.
- [x] Các giới hạn và lỗi được kiểm thử ở đúng lớp transport.
- [x] Typecheck/lint và thử đọc công khai không mang dữ liệu riêng đạt; hạn chế mạng được ghi thật nếu gặp.

## Testing

TDD với injected DNS/transport cho địa chỉ, redirect, abort và resource bounds; kiểm tra production TLS/pinning options. Một read-only HTTPS request công khai xác minh composition; không dùng URL nội bộ thật hoặc secrets để làm fixture.

## Implementation decisions and evidence

Adapter hoàn tất `fetchPublicText(url, { signal?, timeoutMs?, maxBytes? })`, hard ceilings không được nới qua input. Đang triển khai trước khi tiếp tục OV-028; OV-050 bắt đầu sau khi primitive này được review.

Review độc lập phát hiện Accept thiếu HTML và fragment URL không tương thích registry; đã sửa kèm regression đỏ/xanh. Fragment được bỏ trước transport, TLS verification bật rõ ràng. 34 boundary tests đạt; opt-in public Mastodon JSON và NASA RSS proof đạt (35 tổng). Parent chạy lại network + warranty: 48 tests đạt, public proof opt-in được bỏ qua trong regression offline. Typecheck và scoped lint đạt theo owner. Consumer OV-028/050 dùng primitive này; chưa khẳng định ingestion đã chạy.
