// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";

import type { GenerateTextResult } from "@/lib/ai/provider";
import type { OrganizationScope, ProductSnapshot } from "@/lib/catalog/types";
import type { GeneratedProductContent } from "@/lib/content/types";
import type { GeneratedVideoScript } from "@/lib/content/generate-video-script";
import type {
  RenderedVideo,
  ResolvedAsset,
  VideoManifest,
  VideoManifestError,
  VideoRenderRequest,
  VideoStoryboard,
} from "@/lib/video/types";
import type { TemplateRenderRequest } from "@/lib/video/template-video-renderer";
import type { RenderRun } from "./types";
import { defaultDiagnosticSink, type DiagnosticSink } from "./diagnostics";
import type { RenderStage } from "./types";

export type RenderEventInput = Readonly<{
  renderId: string;
  productId: string;
  status: "succeeded" | "failed";
  errorStage?: string;
  errorCode?: string;
  model?: string;
  usage?: GenerateTextResult["usage"];
  timings: Readonly<Record<string, number>>;
  totalDurationMs: number;
  videoBytes?: number;
  videoDurationMs?: number;
  createdAt: string;
  // Hash identifies the exact serialized script supplied to the renderer.
  sceneCount?: number;
  ttsTotalMs?: number;
  rendererRevision?: string;
  scriptSha256?: string;
}>;

export type RenderEventStore = Readonly<{
  record(input: RenderEventInput, opts: { signal: AbortSignal }): Promise<void>;
}>;

type TerminateCtx = {
  startedAt: number;
  wallClockStart: number;
  timings: Record<string, number>;
  usage: GenerateTextResult["usage"] | undefined;
  model: string | undefined;
  sceneCount?: number;
  scriptSha256?: string;
  renderEventTimeoutMs: number;
};

type Dependencies = Readonly<{
  catalog: {
    getProductSnapshot(scope: OrganizationScope, productId: string): Promise<ProductSnapshot | null>;
  };
  generateContent(snapshot: ProductSnapshot): Promise<GeneratedProductContent>;
  generateScript?: (snapshot: ProductSnapshot) => Promise<GeneratedVideoScript>;
  imageResolver: { resolve(url: string): Promise<ResolvedAsset | null> };
  compileStoryboard(snapshot: ProductSnapshot, content: GeneratedProductContent): VideoStoryboard;
  renderer: { render(request: VideoRenderRequest | TemplateRenderRequest): Promise<RenderedVideo> };
  library: {
    save(renderId: string, manifest: VideoManifest, video?: RenderedVideo): Promise<void>;
  };
  diagnostic?: DiagnosticSink;
  recordEvent?: RenderEventStore;
  renderEventTimeoutMs?: number;
}>;

type CreateCommand = Readonly<{
  renderId: string;
  productId: string;
  scope: OrganizationScope;
  onStage?: (stage: RenderStage) => void;
}>;

const DEFAULT_RENDER_EVENT_TIMEOUT_MS = 3000;

const noopRenderEventStore: RenderEventStore = {
  async record(): Promise<void> {},
};

function publicContent(content: GeneratedProductContent) {
  return { hook: content.hook, caption: content.caption, cta: content.cta };
}

export class ProductVideoPipeline {
  private readonly diagnostic: DiagnosticSink;
  private readonly recordEvent: RenderEventStore;
  private readonly renderEventTimeoutMs: number;

  constructor(private readonly dependencies: Dependencies) {
    this.diagnostic = dependencies.diagnostic ?? defaultDiagnosticSink;
    this.recordEvent = dependencies.recordEvent ?? noopRenderEventStore;
    this.renderEventTimeoutMs = dependencies.renderEventTimeoutMs ?? DEFAULT_RENDER_EVENT_TIMEOUT_MS;
  }

  private async fail(
    command: CreateCommand,
    error: VideoManifestError,
    content?: GeneratedProductContent,
  ): Promise<RenderRun> {
    this.stage(command, "storing_artifact");
    const renderId = command.renderId;
    const run: RenderRun = {
      renderId,
      status: "failed",
      ...(content ? { content: publicContent(content) } : {}),
      error,
    };
    try {
      await this.dependencies.library.save(renderId, run);
    } catch {
      this.diagnostic({ stage: "storing_artifact", code: "STORAGE_FAILED" });
      return {
        renderId,
        status: "failed",
        ...(content ? { content: publicContent(content) } : {}),
        error: { stage: "storing_artifact", code: "STORAGE_FAILED" },
      };
    }
    return run;
  }

  private stage(command: CreateCommand, stage: RenderStage): void {
    command.onStage?.(stage);
  }

  // Total: never throws, emits no stage. Every create() return site routes through here.
  private async terminate(run: RenderRun, command: CreateCommand, ctx: TerminateCtx): Promise<RenderRun> {
    try {
      const totalDurationMs = Math.round(performance.now() - ctx.startedAt);
      const row: RenderEventInput = {
        renderId: run.renderId,
        productId: command.productId,
        status: run.status,
        ...(run.status === "failed" ? { errorStage: run.error.stage, errorCode: run.error.code } : {}),
        ...(ctx.model ? { model: ctx.model } : {}),
        ...(ctx.usage ? { usage: ctx.usage } : {}),
        ...(ctx.sceneCount !== undefined ? { sceneCount: ctx.sceneCount } : {}),
        ...(ctx.scriptSha256 ? { scriptSha256: ctx.scriptSha256 } : {}),
        timings: { ...ctx.timings },
        totalDurationMs,
        ...(run.status === "succeeded"
          ? {
              videoBytes: run.artifact.bytes,
              videoDurationMs: run.artifact.durationMs,
              rendererRevision: run.artifact.rendererRevision,
            }
          : {}),
        ...(ctx.timings.synthesizing_voice_ms != null
          ? { ttsTotalMs: ctx.timings.synthesizing_voice_ms }
          : {}),
        createdAt: new Date(ctx.wallClockStart).toISOString(),
      };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.recordEvent.record(row, { signal: AbortSignal.timeout(ctx.renderEventTimeoutMs) }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("RENDER_EVENT_TIMEOUT")), ctx.renderEventTimeoutMs);
          }),
        ]);
      } catch {
        this.diagnostic({ stage: "storing_artifact", code: "RENDER_EVENT_WRITE_FAILED" });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Swallowed: terminate() returns run unconditionally.
    }
    return run;
  }

  async create(command: CreateCommand): Promise<RenderRun> {
    const startedAt = performance.now();
    const wallClockStart = Date.now();
    const timings: Record<string, number> = {};
    const ctx: TerminateCtx = {
      startedAt,
      wallClockStart,
      timings,
      usage: undefined,
      model: undefined,
      renderEventTimeoutMs: this.renderEventTimeoutMs,
    };

    this.stage(command, "loading_product");
    let snapshot: ProductSnapshot | null;
    {
      const t = performance.now();
      try {
        snapshot = await this.dependencies.catalog.getProductSnapshot(command.scope, command.productId);
      } catch {
        timings.loading_product_ms = Math.round(performance.now() - t);
        return await this.terminate(await this.fail(command, {
          stage: "loading_product",
          code: "CATALOG_FAILED",
        }), command, ctx);
      }
      timings.loading_product_ms = Math.round(performance.now() - t);
    }
    if (!snapshot) {
      return await this.terminate(await this.fail(command, {
        stage: "loading_product",
        code: "PRODUCT_NOT_FOUND",
      }), command, ctx);
    }

    let content: GeneratedProductContent;
    let script: GeneratedVideoScript["script"] | undefined;
    this.stage(command, "generating_content");
    {
      const t = performance.now();
      try {
        if (this.dependencies.generateScript) {
          const generated = await this.dependencies.generateScript(snapshot);
          content = generated.content;
          script = generated.script;
          ctx.model = generated.model;
          ctx.usage = generated.usage ?? content.usage;
          ctx.sceneCount = script.scenes.length;
          ctx.scriptSha256 = createHash("sha256").update(JSON.stringify(script)).digest("hex");
        } else {
          content = await this.dependencies.generateContent(snapshot);
          ctx.model = content.model;
          ctx.usage = content.usage;
        }
      } catch {
        timings.generating_content_ms = Math.round(performance.now() - t);
        return await this.terminate(await this.fail(command, {
          stage: "generating_content",
          code: "AI_GENERATION_FAILED",
        }), command, ctx);
      }
      timings.generating_content_ms = Math.round(performance.now() - t);
    }

    let asset: ResolvedAsset | null = null;
    let video: RenderedVideo | null = null;
    try {
      // Template path (T7): the script stage already produced the script, so
      // the renderer takes it directly. Ffmpeg path: derive a storyboard.
      // Resolve image only for ffmpeg path — template renderer is text-only.
      if (script) {
        if (snapshot.primaryImageUrl) {
          console.warn(
            "[onevoice] asset_ignored: template renderer is text-only, skipping image resolve",
          );
        }
        this.stage(command, "synthesizing_voice");
        this.stage(command, "composing_scenes");
      } else {
        this.stage(command, "resolving_asset");
        if (snapshot.primaryImageUrl) {
          const t = performance.now();
          try {
            asset = await this.dependencies.imageResolver.resolve(snapshot.primaryImageUrl);
          } catch {
            timings.resolving_asset_ms = Math.round(performance.now() - t);
            return await this.terminate(await this.fail(command, {
              stage: "resolving_asset",
              code: "IMAGE_RESOLUTION_FAILED",
            }, content), command, ctx);
          }
          timings.resolving_asset_ms = Math.round(performance.now() - t);
        }
      }
      this.stage(command, "rendering_video");
      {
        const t = performance.now();
        try {
          video = script
            ? await this.dependencies.renderer.render({
                script,
                snapshot,
                onStage: (stage) => this.stage(command, stage),
              })
            : await this.dependencies.renderer.render({
                storyboard: this.dependencies.compileStoryboard(snapshot, content),
                ...(asset ? { imagePath: asset.path } : {}),
              });
        } catch (error) {
          timings.rendering_video_ms = Math.round(performance.now() - t);
          const message = error instanceof Error ? error.message : "";
          const mapped = message === "TEMPLATE_SCRIPT_INVALID"
            ? { stage: "generating_content" as const, code: "SCRIPT_SCHEMA_INVALID" as const }
            : message === "SCRIPT_TRUTH_VIOLATION"
              ? { stage: "generating_content" as const, code: "SCRIPT_TRUTH_VIOLATION" as const }
              : message === "SCENE_BELOW_NATURAL_DURATION"
                ? { stage: "generating_content" as const, code: "SCRIPT_DURATION_EXCEEDED" as const }
                : message === "NARRATION_OVERRUNS_SCENE"
                  ? { stage: "synthesizing_voice" as const, code: "NARRATION_OVERRUNS_SCENE" as const }
                  : { stage: "rendering_video" as const, code: "VIDEO_RENDER_FAILED" as const };
          return await this.terminate(await this.fail(command, mapped, content), command, ctx);
        }
        timings.rendering_video_ms = Math.round(performance.now() - t);
        Object.assign(timings, video.timings ?? {});
      }

      const run: RenderRun = {
        renderId: command.renderId,
        status: "succeeded",
        content: publicContent(content),
        artifact: {
          bytes: video.bytes,
          sha256: video.sha256,
          durationMs: video.durationMs,
          width: video.width,
          height: video.height,
          codecName: video.codecName,
          pixelFormat: video.pixelFormat,
          formatName: video.formatName,
          rendererRevision: video.rendererRevision,
        },
      };
      this.stage(command, "storing_artifact");
      {
        const t = performance.now();
        try {
          await this.dependencies.library.save(command.renderId, run, video);
        } catch {
          timings.storing_artifact_ms = Math.round(performance.now() - t);
          return await this.terminate(
            await this.fail(command, {
              stage: "storing_artifact",
              code: "STORAGE_FAILED",
            }, content),
            command,
            ctx,
          );
        }
        timings.storing_artifact_ms = Math.round(performance.now() - t);
      }
      return await this.terminate(run, command, ctx);
    } finally {
      const videoCleanup = video?.cleanup;
      const assetCleanup = asset?.cleanup;
      const cleanups = [
        ...(videoCleanup ? [{ stage: "rendering_video" as const, promise: Promise.resolve().then(videoCleanup) }] : []),
        ...(assetCleanup ? [{ stage: "resolving_asset" as const, promise: Promise.resolve().then(assetCleanup) }] : []),
      ];
      const results = await Promise.allSettled(cleanups.map(({ promise }) => promise));
      results.forEach((result, index) => {
        if (result.status === "rejected") this.diagnostic({ stage: cleanups[index].stage, code: "CLEANUP_FAILED" });
      });
    }
  }
}
