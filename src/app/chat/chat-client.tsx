// SPDX-License-Identifier: Apache-2.0
"use client";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  CHAT_POLL_MS,
  CHAT_TEXT_MAX,
  PublicChatSession,
  conversationStatusCopy,
  initialChatSnapshot,
  type ChatSnapshot,
} from "./chat-state";
import styles from "./chat.module.css";

export function ChatClient() {
  const [snapshot, setSnapshot] = useState<ChatSnapshot>(initialChatSnapshot);
  const [draft, setDraft] = useState("");
  const sessionRef = useRef<PublicChatSession | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const session = new PublicChatSession({ fetch }, setSnapshot);
    sessionRef.current = session;
    void session.load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void session.poll(true);
    }, CHAT_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void session.poll(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      sessionRef.current = null;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const session = sessionRef.current;
    if (!session) return;
    const result = await session.send(draft);
    if (result.ok) {
      setDraft("");
      composerRef.current?.focus();
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const statusText = conversationStatusCopy(snapshot.status, snapshot.messages);
  return (
    <div className={styles.chat}>
      <p className={styles.status} role="status">{statusText}</p>
      {snapshot.phase === "loading" && <p className={styles.banner}>Đang tải hội thoại…</p>}
      {snapshot.phase === "empty" && <p className={styles.banner}>Chưa có tin nhắn. Hãy gửi tin để bắt đầu.</p>}
      {snapshot.phase === "error" && <p className={styles.error} role="alert">{snapshot.notice ?? "Không thể tải hội thoại."}</p>}
      {snapshot.notice && snapshot.phase !== "error" && <p className={styles.notice} role="status">{snapshot.notice}</p>}
      <div className={styles.transcript} aria-live="polite" aria-label="Tin nhắn">
        {snapshot.messages.map((row) => (
          <article key={row.id} className={row.direction === "inbound" ? styles.inbound : styles.outbound}>
            <p>{row.text || (row.direction === "outbound" ? "Đã nhận phản hồi." : "Đã gửi.")}</p>
            <time dateTime={row.receivedAt}>{row.receivedAt}</time>
          </article>
        ))}
      </div>
      <form onSubmit={(event) => void submit(event)} className={styles.composer}>
        <label htmlFor="chat-message">Tin nhắn</label>
        <textarea
          id="chat-message"
          name="message"
          ref={composerRef}
          required
          maxLength={CHAT_TEXT_MAX}
          rows={3}
          value={draft}
          disabled={snapshot.busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onComposerKey}
          autoComplete="off"
        />
        <button type="submit" disabled={snapshot.busy || draft.trim().length === 0}>Gửi</button>
      </form>
    </div>
  );
}
