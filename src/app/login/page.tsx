// SPDX-License-Identifier: Apache-2.0
import { safeRedirect } from "@/lib/auth/security";
import { getStaffSession } from "@/lib/auth/session";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams;
  const actor = await getStaffSession();
  const next = safeRedirect(params.next);
  return <main className={styles.main}><section className={styles.card} aria-labelledby="login-heading">
    <p className={styles.brand}>ONEVOICE</p>
    <h1 id="login-heading">{actor ? "Bạn đã đăng nhập" : "Đăng nhập nhân viên"}</h1>
    {actor ? <>
      <p>Xin chào, {actor.displayName || "nhân viên"}.</p>
      <a className={styles.continue} href={next}>Tiếp tục vào OneVoice</a>
      <form action="/api/auth/logout" method="post"><button type="submit">Đăng xuất</button></form>
    </> : <>
      <p>Sử dụng tài khoản do người quản lý cấp.</p>
      {params.error && <p role="alert" className={styles.error}>Không thể đăng nhập. Kiểm tra thông tin hoặc liên hệ người quản lý.</p>}
      <form action="/api/auth/login" method="post" className={styles.form}>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required />
        <label htmlFor="password">Mật khẩu</label>
        <input id="password" name="password" type="password" autoComplete="current-password" maxLength={1024} required />
        <button type="submit">Đăng nhập</button>
      </form>
    </>}
  </section></main>;
}
