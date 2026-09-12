# Bootstrap nhân viên cho một bản cài đặt

Mỗi deployment OneVoice dùng một organization, lấy từ ONEVOICE_ORGANIZATION_ID của server. Không có public signup hoặc mật khẩu quản trị mặc định. Tài khoản Supabase Auth không tự có quyền OneVoice: cần staff_profiles đang active và đúng organization.

## Chuẩn bị

Áp migration bằng quy trình upgrade đã kiểm tra trên local/staging trước. Không chạy db reset lên dữ liệu doanh nghiệp. Migration 20260912090000_staff_profiles.sql chỉ thêm bảng/quyền, không thay catalog.

Trong giao diện quản trị Supabase của chính deployment, tạo hoặc mời tài khoản người quản lý qua Authentication. Dùng mật khẩu riêng được truyền an toàn hoặc invitation, không đưa vào repository/log. Ghi lại UUID của người dùng Auth và UUID organization hiện có.

## Gán người quản lý đầu tiên

Quản trị viên hạ tầng dùng SQL Editor riêng của deployment, với UUID đã đối chiếu, thực hiện insert vào public.staff_profiles gồm user_id, organization_id, role='manager', active=true và display_name. Không nhận UUID/role từ khách chưa đăng nhập hoặc lưu quyền trong raw_user_meta_data. Không dùng lệnh on conflict ghi đè role một cách âm thầm.

Các cột và constraints:

- user_id: UUID tồn tại trong auth.users, primary key (mỗi account một profile).
- organization_id: UUID tồn tại trong public.organizations, phải trùng server configuration.
- role: manager hoặc staff; active: false để thu hồi truy cập trong OneVoice.
- display_name: tối đa 160 ký tự, không thông tin nhạy cảm.

Đây là thao tác hạ tầng được ghi trong sổ vận hành; giao diện quản lý tài khoản thuộc OV-048, nền audit thuộc OV-009. Trang `/login` và session thuộc OV-006; các entry point hiện có được bảo vệ riêng trong OV-007.

## Quyền dữ liệu

Authenticated chỉ SELECT profile active của chính họ. Không thể INSERT/UPDATE/DELETE để tự cấp quyền. Manager cũng dùng API server cho thay đổi tài khoản; service_role có quyền và chỉ nằm server. API bắt buộc kiểm phiên, profile active, organization và hành động trước khi sử dụng service_role. Auth user metadata do khách sửa được không là nguồn role.

Các bảng catalog hiện có tiếp tục không cho anon/authenticated đọc trực tiếp. Không mở lại policies public để tiện đăng nhập.

## Kiểm thử local

Chạy `pnpm exec supabase test db supabase/tests/staff-profiles.test.sql` để kiểm manager/staff/anon/disabled, self-escalation và service-role mutations. Chạy `./scripts/verify-staff-upgrade.ps1` trong PowerShell để kiểm migration không đổi catalog. Cả hai dùng pgTAP trong transaction rollback, chỉ chạy Supabase local. Script preservation cố định container local `supabase_db_onevoice`, không nhận remote connection URL. Dữ liệu user/order thật không được đưa vào fixture.

Tham khảo đã đối chiếu: [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Chỉ tham chiếu primary key auth.users và không tin user metadata cho phân quyền.

## Cấu hình phiên

`NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dùng cho Auth. Đặt `ONEVOICE_ORGANIZATION_ID` đúng organization, `ONEVOICE_APP_ORIGIN` đúng origin ứng dụng, không có slash cuối. Production bắt buộc HTTPS và hai giá trị này tường minh. Không cần AI key hoặc service key để đăng nhập; catalog server vẫn có cấu hình riêng.

Cookie phiên là HttpOnly, SameSite=Lax và Secure khi HTTPS/production. Mỗi lần xác minh dùng Auth getUser và profile active mới nhất; không tin role trong metadata. Giới hạn login trong mỗi tiến trình là 5 lần/account/phút, 100 lần tổng/phút, kết hợp giới hạn Supabase Auth. Nhiều replicas cần ingress limiter dùng chung; restart làm mất bộ đếm local.

Logout xóa cookie trình duyệt và thu hồi refresh token của phiên. Access token đã bị sao chép có thể còn hợp lệ đến hạn; không mô tả logout là thu hồi tức thì mọi JWT. Disable profile sẽ bị kiểm tra lại và chặn tại entry point đã tích hợp guard.

## HTTP integration local

Khởi động Next dev với các biến Supabase lấy từ `supabase status -o json` của local, origin `http://localhost:3000`. Không sửa `.env` doanh nghiệp để thử. Trong một PowerShell khác:

```powershell
$onevoiceLocal = pnpm exec supabase status -o json | ConvertFrom-Json
$env:ONEVOICE_LOCAL_URL = $onevoiceLocal.API_URL
$env:ONEVOICE_LOCAL_ADMIN = $onevoiceLocal.SERVICE_ROLE_KEY
$env:ONEVOICE_LOCAL_JWT = $onevoiceLocal.JWT_SECRET
node scripts/verify-auth-local.mjs
```

Không in object `$onevoiceLocal`. Script từ chối URL ngoài local, tạo account giả không gửi email rồi tự xóa trong finally; kiểm login/logout, cookie flags, CSRF, redirect, disable profile và token hết hạn. Kiểm trình duyệt riêng xác nhận form và điều hướng; script không thay thế visual QA.

Sau OV-007, đặt `$env:ONEVOICE_VERIFY_GUARDS = "1"` trước chạy HTTP verifier để kiểm ma trận API/page, HEAD, staff/manager và Origin render. Render limiter chỉ bảo vệ mỗi process; thêm shared ingress limit khi scale replicas. Public /api/health là liveness tối giản; /api/ready là manager diagnostics.
