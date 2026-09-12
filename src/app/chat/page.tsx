// SPDX-License-Identifier: Apache-2.0
import { ChatClient } from "./chat-client";
import styles from "./chat.module.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  referrer: "no-referrer" as const,
  title: "Chat tư vấn",
};

export default function ChatPage() {
  return (
    <main className={styles.main}>
      <section className={styles.card} aria-labelledby="chat-heading">
        <p className={styles.brand}>ONEVOICE</p>
        <h1 id="chat-heading">Chat tư vấn</h1>
        <p>Gửi tin nhắn cho cửa hàng. Không cần đăng nhập Facebook.</p>
        <ChatClient />
      </section>
    </main>
  );
}
