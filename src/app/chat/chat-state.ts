// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const CHAT_MESSAGES_PATH = "/api/chat/messages";
export const CHAT_SESSION_PATH = "/chat/session";
export const CHAT_POLL_MS = 10_000;
export const CHAT_TEXT_MAX = 1800;

export type PublicChatStatus = "AI_ACTIVE" | "WAITING_STAFF" | "STAFF_ACTIVE";
export type PublicChatKind = "message" | "reply" | "handoff_ack";
export type PublicChatDirection = "inbound" | "outbound";

export type PublicChatMessage = {
  id: string;
  text: string;
  direction: PublicChatDirection;
  kind: PublicChatKind;
  receivedAt: string;
};

export type ChatPhase = "loading" | "empty" | "ready" | "error";

export type ChatSnapshot = {
  phase: ChatPhase;
  messages: PublicChatMessage[];
  status: PublicChatStatus;
  notice: string | null;
  busy: boolean;
};

export const initialChatSnapshot: ChatSnapshot = {
  phase: "loading",
  messages: [],
  status: "AI_ACTIVE",
  notice: null,
  busy: false,
};

const messageSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  direction: z.enum(["inbound", "outbound"]),
  kind: z.enum(["message", "reply", "handoff_ack"]),
  receivedAt: z.string().min(1),
});
const payloadSchema = z.object({
  messages: z.array(z.unknown()),
  cursor: z.string().nullable().optional(),
  status: z.enum(["AI_ACTIVE", "WAITING_STAFF", "STAFF_ACTIVE"]).optional(),
});

export function conversationStatusCopy(status: PublicChatStatus, messages: readonly PublicChatMessage[]): string {
  if (status === "WAITING_STAFF") return "Đang chờ nhân viên";
  if (status === "STAFF_ACTIVE") return "Nhân viên đang hỗ trợ";
  const last = messages.at(-1);
  if (last?.direction === "inbound") return "AI đang xử lý";
  return "Đang tư vấn";
}

export function mergeMessages(existing: readonly PublicChatMessage[], incoming: readonly PublicChatMessage[]): PublicChatMessage[] {
  const items = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) items.set(row.id, row);
  return [...items.values()].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
}

export function messagesCursor(messages: readonly PublicChatMessage[]): string | null {
  const last = messages.at(-1);
  return last ? JSON.stringify({ at: last.receivedAt, id: last.id }) : null;
}

export function parseMessagesPayload(body: unknown): { messages: PublicChatMessage[]; cursor: string | null; status: PublicChatStatus } | null {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return null;
  const messages: PublicChatMessage[] = [];
  for (const item of parsed.data.messages) {
    const message = messageSchema.safeParse(item);
    if (message.success) messages.push(message.data);
  }
  return {
    messages,
    cursor: parsed.data.cursor && parsed.data.cursor.length > 0 ? parsed.data.cursor : null,
    status: parsed.data.status ?? "AI_ACTIVE",
  };
}

export class PublicChatSession {
  snapshot: ChatSnapshot = { ...initialChatSnapshot };
  private inflight = false;
  private pendingText: string | null = null;
  private pendingRequestId: string | null = null;

  constructor(
    private readonly http: { fetch: typeof globalThis.fetch },
    private readonly onChange: (snapshot: ChatSnapshot) => void = () => {},
    private readonly requestId: () => string = () => crypto.randomUUID(),
  ) {}

  async load(): Promise<void> {
    this.replace({ ...initialChatSnapshot });
    await this.ensureSession();
    await this.refresh({ replace: true });
  }

  async poll(visible: boolean): Promise<void> {
    if (!visible || this.inflight || this.snapshot.phase === "loading") return;
    await this.refresh({ replace: false });
  }

  async send(text: string): Promise<{ ok: boolean }> {
    const trimmed = text.trim();
    if (!trimmed || this.snapshot.busy) return { ok: false };
    if (trimmed.length > CHAT_TEXT_MAX) {
      this.replace({ notice: "Tin nhắn quá dài. Rút ngắn rồi gửi lại." });
      return { ok: false };
    }
    if (this.pendingText !== trimmed) {
      this.pendingText = trimmed;
      this.pendingRequestId = this.requestId();
    }
    this.replace({ busy: true, notice: null });
    try {
      const response = await this.http.fetch(CHAT_MESSAGES_PATH, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmed, requestId: this.pendingRequestId }),
      });
      if (response.status === 401) {
        this.cookieLost();
        return { ok: false };
      }
      if (!response.ok) {
        this.replace({
          busy: false,
          notice: response.status === 429
            ? "Bạn gửi quá nhanh. Thử lại sau một phút."
            : "Không thể gửi tin nhắn. Thử lại cùng nội dung.",
        });
        return { ok: false };
      }
      this.pendingText = null;
      this.pendingRequestId = null;
      await this.refresh({ replace: false, force: true });
      this.replace({ busy: false });
      return { ok: true };
    } catch {
      this.replace({ busy: false, notice: "Kết nối bị gián đoạn. Thử lại cùng yêu cầu." });
      return { ok: false };
    }
  }

  private async ensureSession(): Promise<void> {
    try {
      await this.http.fetch(CHAT_SESSION_PATH, { method: "POST", credentials: "same-origin" });
    } catch {
      /* GET /api/chat/messages reports the usable error. */
    }
  }

  private async refresh(options: { replace: boolean; force?: boolean }): Promise<void> {
    if (this.inflight && !options.force) return;
    this.inflight = true;
    try {
      const cursor = options.replace ? null : messagesCursor(this.snapshot.messages);
      const url = cursor ? `${CHAT_MESSAGES_PATH}?cursor=${encodeURIComponent(cursor)}` : CHAT_MESSAGES_PATH;
      const response = await this.http.fetch(url, { method: "GET", credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) {
        this.cookieLost();
        return;
      }
      if (!response.ok) {
        this.replace({
          phase: this.snapshot.messages.length === 0 ? "error" : this.snapshot.phase,
          notice: "Chưa thể tải tin nhắn. Thử lại.",
        });
        return;
      }
      let body: unknown;
      try { body = await response.json(); } catch {
        this.replace({
          phase: this.snapshot.messages.length === 0 ? "error" : this.snapshot.phase,
          notice: "Chưa thể tải tin nhắn. Thử lại.",
        });
        return;
      }
      const parsed = parseMessagesPayload(body);
      if (!parsed) {
        this.replace({
          phase: this.snapshot.messages.length === 0 ? "error" : this.snapshot.phase,
          notice: "Chưa thể tải tin nhắn. Thử lại.",
        });
        return;
      }
      const messages = options.replace ? parsed.messages : mergeMessages(this.snapshot.messages, parsed.messages);
      this.replace({
        phase: messages.length === 0 ? "empty" : "ready",
        messages,
        status: parsed.status,
        notice: null,
      });
    } catch {
      this.replace({
        phase: this.snapshot.messages.length === 0 ? "error" : this.snapshot.phase,
        notice: "Kết nối bị gián đoạn. Thử lại.",
      });
    } finally {
      this.inflight = false;
    }
  }

  private cookieLost(): void {
    this.replace({
      phase: "error",
      messages: [],
      status: "AI_ACTIVE",
      notice: "Phiên trò chuyện không khả dụng. Tải lại trang để thử lại.",
      busy: false,
    });
  }

  private replace(partial: Partial<ChatSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    this.onChange(this.snapshot);
  }
}
