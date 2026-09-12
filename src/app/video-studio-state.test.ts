// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  checkDownloadArtifact,
  formatSnapshotLabel,
  initialStudioState,
  parseRunningStage,
  safeRenderMessage,
  StudioOperationController,
  studioReducer,
} from "./video-studio-state";

const result = {
  renderId: "render-1",
  status: "succeeded" as const,
  content: { hook: "hook", caption: "caption", cta: "cta" },
  urls: { status: "/status", video: "/video", download: "/download" },
};

describe("studioReducer", () => {
  it("locks selection and duplicate render starts around the initiating product", () => {
    let state = studioReducer(initialStudioState, { type: "select", productId: "product-a" });
    state = studioReducer(state, { type: "start", operation: { token: "op-1", renderId: "render-1", productId: "product-a" } });
    state = studioReducer(state, { type: "select", productId: "product-b" });
    state = studioReducer(state, { type: "start", operation: { token: "op-2", renderId: "render-2", productId: "product-b" } });
    state = studioReducer(state, { type: "success", token: "op-1", result });
    expect(state.selectedId).toBe("product-a");
    expect(state.desk.status).toBe("ready");
    if (state.desk.status !== "ready") throw new Error("expected ready state");
    expect(state.desk.operation.productId).toBe("product-a");
  });

  it("ignores stale stages and completions from an older operation token", () => {
    let state = studioReducer(initialStudioState, { type: "select", productId: "product-a" });
    state = studioReducer(state, { type: "start", operation: { token: "op-1", renderId: "render-1", productId: "product-a" } });
    state = studioReducer(state, { type: "failure", token: "op-1", message: "failed" });
    state = studioReducer(state, { type: "select", productId: "product-b" });
    state = studioReducer(state, { type: "start", operation: { token: "op-2", renderId: "render-2", productId: "product-b" } });
    state = studioReducer(state, { type: "progress", token: "op-1", stage: "rendering_video" });
    state = studioReducer(state, { type: "success", token: "op-1", result });
    expect(state.desk).toMatchObject({ status: "creating", operation: { token: "op-2" } });
    state = studioReducer(state, { type: "progress", token: "op-2", stage: "resolving_asset" });
    expect(state.desk).toMatchObject({ status: "creating", stage: "resolving_asset" });
  });

  it("turns media and download failures into a recoverable artifact error", () => {
    let state = studioReducer(initialStudioState, { type: "select", productId: "product-a" });
    state = studioReducer(state, { type: "start", operation: { token: "op-1", renderId: "render-1", productId: "product-a" } });
    state = studioReducer(state, { type: "success", token: "op-1", result });
    state = studioReducer(state, { type: "artifact_failure", token: "op-1" });
    expect(state.desk).toMatchObject({ status: "artifact_error", operation: { token: "op-1" }, result });
  });

  it("reaches ready from start + polled succeeded with no success dispatched from POST", () => {
    let state = studioReducer(initialStudioState, { type: "select", productId: "product-a" });
    const operation = { token: "op-1", renderId: "render-1", productId: "product-a" };
    state = studioReducer(state, { type: "start", operation });
    expect(state.desk.status).toBe("creating");

    state = studioReducer(state, { type: "progress", token: "op-1", stage: "rendering_video" });
    expect(state.desk).toMatchObject({ status: "creating", stage: "rendering_video" });

    state = studioReducer(state, { type: "success", token: "op-1", result });
    expect(state.desk.status).toBe("ready");
    if (state.desk.status !== "ready") throw new Error("expected ready state");
    expect(state.desk.result).toEqual(result);
  });

  it("reaches error on polled failed with mapped Vietnamese message", () => {
    let state = studioReducer(initialStudioState, { type: "select", productId: "product-a" });
    const operation = { token: "op-1", renderId: "render-1", productId: "product-a" };
    state = studioReducer(state, { type: "start", operation });

    const message = safeRenderMessage("AI_GENERATION_FAILED");
    state = studioReducer(state, { type: "failure", token: "op-1", message });
    expect(state.desk.status).toBe("error");
    if (state.desk.status !== "error") throw new Error("expected error state");
    expect(state.desk.message).toBe("Dịch vụ viết nội dung chưa phản hồi. Bạn có thể thử lại.");
  });

  it("reaches error on polled WORKER_LOST failure with its own message, not generic fallback", () => {
    let state = studioReducer(initialStudioState, { type: "select", productId: "product-a" });
    const operation = { token: "op-1", renderId: "render-1", productId: "product-a" };
    state = studioReducer(state, { type: "start", operation });

    const message = safeRenderMessage("WORKER_LOST");
    expect(message).not.toBe("Chưa thể tạo video lúc này. Hãy thử lại sau ít phút.");
    expect(message).toBe("Tiến trình dựng video bị gián đoạn bất ngờ. Hãy thử tạo lại.");

    state = studioReducer(state, { type: "failure", token: "op-1", message });
    expect(state.desk.status).toBe("error");
    if (state.desk.status !== "error") throw new Error("expected error state");
    expect(state.desk.message).toBe("Tiến trình dựng video bị gián đoạn bất ngờ. Hãy thử tạo lại.");
  });

  it("maps new error codes to specific Vietnamese messages", () => {
    expect(safeRenderMessage("SCRIPT_TRUTH_VIOLATION")).toBe("Nội dung video chứa thông tin chưa được kiểm chứng từ catalog. Hãy thử lại.");
    expect(safeRenderMessage("SCRIPT_DURATION_EXCEEDED")).toBe("Thời lượng kịch bản vượt quá giới hạn cho phép. Hãy thử lại.");
    expect(safeRenderMessage("TTS_UNAVAILABLE")).toBe("Dịch vụ lồng tiếng chưa sẵn sàng hoặc phản hồi chậm. Hãy thử lại sau ít phút.");
    expect(safeRenderMessage("NARRATION_OVERRUNS_SCENE")).toBe("Giọng đọc dài hơn thời lượng cảnh video. Hãy thử tạo lại.");
  });
});

describe("formatSnapshotLabel", () => {
  it("labels dated and unknown public catalog snapshots", () => {
    expect(formatSnapshotLabel("2026-09-09T00:00:00.000Z")).toBe("Bản chụp catalog công khai · 09/09/2026");
    expect(formatSnapshotLabel(null)).toBe("Bản chụp catalog công khai · Chưa rõ ngày thu thập");
    expect(formatSnapshotLabel("invalid")).toBe("Bản chụp catalog công khai · Chưa rõ ngày thu thập");
  });
});

describe("checkDownloadArtifact", () => {
  it("uses HEAD and rejects a missing artifact before download navigation", async () => {
    const requests: Array<[string, RequestInit | undefined]> = [];
    const available = await checkDownloadArtifact("/download", async (input, init) => {
      requests.push([String(input), init]);
      return new Response(null, { status: 404 });
    });
    expect(available).toBe(false);
    expect(requests).toEqual([["/download", { method: "HEAD", cache: "no-store" }]]);
  });
});

describe("parseRunningStage", () => {
  it("accepts only actual running stages observed from the status route", () => {
    expect(parseRunningStage({ status: "running", stage: "resolving_asset" })).toBe("resolving_asset");
    expect(parseRunningStage({ status: "running", stage: "synthesizing_voice" })).toBe("synthesizing_voice");
    expect(parseRunningStage({ status: "running", stage: "composing_scenes" })).toBe("composing_scenes");
    expect(parseRunningStage({ status: "queued" })).toBeNull();
    expect(parseRunningStage({ status: "succeeded", stage: "rendering_video" })).toBeNull();
    expect(parseRunningStage({ status: "running", stage: "invented" })).toBeNull();
  });
});
describe("StudioOperationController", () => {
  it("admits one operation and aborts it on disposal", () => {
    const operations = new StudioOperationController();
    const first = operations.start();
    expect(first).toBeInstanceOf(AbortController);
    expect(operations.start()).toBeNull();
    operations.dispose();
    expect(first!.signal.aborted).toBe(true);
  });
});
