// SPDX-License-Identifier: Apache-2.0

import type { OrganizationScope, ProductSnapshot } from "@/lib/catalog/types";
import type { GeneratedProductContent } from "@/lib/content/types";
import type {
  RenderedVideo,
  ResolvedAsset,
  VideoManifest,
  VideoManifestError,
  VideoRenderRequest,
  VideoStoryboard,
} from "@/lib/video/types";
import type { RenderRun } from "./types";
import { defaultDiagnosticSink, type DiagnosticSink } from "./diagnostics";
import type { RenderStage } from "./types";

type Dependencies = Readonly<{
  catalog: {
    getProductSnapshot(scope: OrganizationScope, productId: string): Promise<ProductSnapshot | null>;
  };
  generateContent(snapshot: ProductSnapshot): Promise<GeneratedProductContent>;
  imageResolver: { resolve(url: string): Promise<ResolvedAsset | null> };
  compileStoryboard(snapshot: ProductSnapshot, content: GeneratedProductContent): VideoStoryboard;
  renderer: { render(request: VideoRenderRequest): Promise<RenderedVideo> };
  library: {
    save(renderId: string, manifest: VideoManifest, video?: RenderedVideo): Promise<void>;
  };
  diagnostic?: DiagnosticSink;
}>;

type CreateCommand = Readonly<{
  renderId: string;
  productId: string;
  scope: OrganizationScope;
  onStage?: (stage: RenderStage) => void;
}>;

function publicContent(content: GeneratedProductContent) {
  return { hook: content.hook, caption: content.caption, cta: content.cta };
}

export class ProductVideoPipeline {
  private readonly diagnostic: DiagnosticSink;

  constructor(private readonly dependencies: Dependencies) {
    this.diagnostic = dependencies.diagnostic ?? defaultDiagnosticSink;
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

  async create(command: CreateCommand): Promise<RenderRun> {
    this.stage(command, "loading_product");
    let snapshot: ProductSnapshot | null;
    try {
      snapshot = await this.dependencies.catalog.getProductSnapshot(command.scope, command.productId);
    } catch {
      return this.fail(command, {
        stage: "loading_product",
        code: "CATALOG_FAILED",
      });
    }
    if (!snapshot) {
      return this.fail(command, {
        stage: "loading_product",
        code: "PRODUCT_NOT_FOUND",
      });
    }

    let content: GeneratedProductContent;
    this.stage(command, "generating_content");
    try {
      content = await this.dependencies.generateContent(snapshot);
    } catch {
      return this.fail(command, {
        stage: "generating_content",
        code: "AI_GENERATION_FAILED",
      });
    }

    let asset: ResolvedAsset | null = null;
    let video: RenderedVideo | null = null;
    try {
      this.stage(command, "resolving_asset");
      if (snapshot.primaryImageUrl) {
        try {
          asset = await this.dependencies.imageResolver.resolve(snapshot.primaryImageUrl);
        } catch {
          return await this.fail(command, {
            stage: "resolving_asset",
            code: "IMAGE_RESOLUTION_FAILED",
          }, content);
        }
      }

      this.stage(command, "rendering_video");
      try {
        video = await this.dependencies.renderer.render({
          storyboard: this.dependencies.compileStoryboard(snapshot, content),
          ...(asset ? { imagePath: asset.path } : {}),
        });
      } catch {
        return await this.fail(command, {
          stage: "rendering_video",
          code: "VIDEO_RENDER_FAILED",
        }, content);
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
      try {
        this.stage(command, "storing_artifact");
        await this.dependencies.library.save(command.renderId, run, video);
        return run;
      } catch {
        return await this.fail(command, {
          stage: "storing_artifact",
          code: "STORAGE_FAILED",
        }, content);
      }
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
