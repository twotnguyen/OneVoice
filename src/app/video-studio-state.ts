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
  return (["loading_product", "generating_content", "resolving_asset", "rendering_video", "storing_artifact"] as const).includes(value.stage as RenderStage)
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
