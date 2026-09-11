// SPDX-License-Identifier: Apache-2.0

import type { RenderStage } from "@/lib/render/types";

// Structural mirror of the succeeded `RenderRunView` in @/lib/render/types.ts, plus the
// `urls` block the route appends. Keep this in sync with `toRenderRunView` there: the
// server owns the shape, the client only re-declares it because it cannot import the
// projection at runtime.
export type RenderResponse = Readonly<{
  renderId: string;
  status: "succeeded";
  content: { hook: string; caption: string; cta: string };
  urls: { status: string; video: string; download: string };
}>;
export type RenderOperation = Readonly<{ token: string; renderId: string; productId: string }>;
export type DeskState =
  | { status: "idle" }
  | { status: "creating"; operation: RenderOperation; stage?: RenderStage }
  | { status: "ready"; operation: RenderOperation; result: RenderResponse }
  | { status: "error"; operation: RenderOperation; message: string }
  | { status: "artifact_error"; operation: RenderOperation; result: RenderResponse };
export type StudioState = Readonly<{ selectedId: string | null; desk: DeskState }>;
export type StudioAction =
  | { type: "select"; productId: string }
  | { type: "start"; operation: RenderOperation }
  | { type: "progress"; token: string; stage: RenderStage }
  | { type: "success"; token: string; result: RenderResponse }
  | { type: "failure"; token: string; message: string }
  | { type: "artifact_failure"; token: string };

export const initialStudioState: StudioState = { selectedId: null, desk: { status: "idle" } };

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  if (action.type === "select") {
    if (state.desk.status === "creating") return state;
    return { selectedId: action.productId, desk: { status: "idle" } };
  }
  if (action.type === "start") {
    if (state.desk.status === "creating" || state.selectedId !== action.operation.productId) return state;
    return { ...state, desk: { status: "creating", operation: action.operation } };
  }
  if (action.type === "progress") {
    if (state.desk.status !== "creating" || state.desk.operation.token !== action.token) return state;
    return { ...state, desk: { ...state.desk, stage: action.stage } };
  }
  if (action.type === "success") {
    if (state.desk.status !== "creating" || state.desk.operation.token !== action.token) return state;
    return { ...state, desk: { status: "ready", operation: state.desk.operation, result: action.result } };
  }
  if (action.type === "failure") {
    if (state.desk.status !== "creating" || state.desk.operation.token !== action.token) return state;
    return { ...state, desk: { status: "error", operation: state.desk.operation, message: action.message } };
  }
  if (state.desk.status !== "ready" || state.desk.operation.token !== action.token) return state;
  return { ...state, desk: { status: "artifact_error", operation: state.desk.operation, result: state.desk.result } };
}

export function formatSnapshotLabel(value: string | null): string {
  const date = value ? new Date(value) : null;
  const suffix = date && !Number.isNaN(date.valueOf())
    ? new Intl.DateTimeFormat("vi-VN", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
    : "Chưa rõ ngày thu thập";
  return `Bản chụp catalog công khai · ${suffix}`;
}

export async function checkDownloadArtifact(
  url: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<boolean> {
  try {
    return (await fetchImplementation(url, { method: "HEAD", cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

export function parseRunningStage(value: unknown): RenderStage | null {
  if (typeof value !== "object" || value === null || !("status" in value) || !("stage" in value)) return null;
  if (value.status !== "running" || typeof value.stage !== "string") return null;
  return (["loading_product", "generating_content", "resolving_asset", "synthesizing_voice", "composing_scenes", "rendering_video", "storing_artifact"] as const).includes(value.stage as RenderStage)
    ? value.stage as RenderStage
    : null;
}

export class StudioOperationController {
  private active: AbortController | null = null;
  start(): AbortController | null {
    if (this.active) return null;
    this.active = new AbortController();
    return this.active;
  }
  finish(controller: AbortController): void {
    if (this.active === controller) this.active = null;
  }
  dispose(): void {
    this.active?.abort();
    this.active = null;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidRenderId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function randomUuidFallback(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function newStudioUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      const candidate = crypto.randomUUID();
      if (isValidRenderId(candidate)) return candidate;
    }
  } catch {
    // Fall through to the getRandomValues-based fallback below.
  }
  return randomUuidFallback();
}

export async function readJsonBody(response: Response): Promise<unknown | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function isSucceededRenderResponse(value: unknown): value is RenderResponse {
  if (typeof value !== "object" || value === null) return false;
  if (!("status" in value) || value.status !== "succeeded") return false;
  if (!("renderId" in value) || !isValidRenderId(value.renderId)) return false;
  if (!("content" in value) || typeof value.content !== "object" || value.content === null) return false;
  if (!("urls" in value) || typeof value.urls !== "object" || value.urls === null) return false;
  return true;
}

export const STUDIO_POLL_INITIAL_DELAY_MS = 500;
export const STUDIO_POLL_MAX_DELAY_MS = 2000;
export const STUDIO_POLL_TOTAL_TIMEOUT_MS = 300_000;

export function nextPollDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(STUDIO_POLL_INITIAL_DELAY_MS * 2 ** safeAttempt, STUDIO_POLL_MAX_DELAY_MS);
}
