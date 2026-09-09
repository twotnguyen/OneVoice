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
}>;

type CreateCommand = Readonly<{
  renderId: string;
  productId: string;
  scope: OrganizationScope;
}>;

function publicContent(content: GeneratedProductContent) {
  return { hook: content.hook, caption: content.caption, cta: content.cta };
}

export class ProductVideoPipeline {
  constructor(private readonly dependencies: Dependencies) {}

  private async fail(
    renderId: string,
    error: VideoManifestError,
    content?: GeneratedProductContent,
  ): Promise<RenderRun> {
    const run: RenderRun = {
      renderId,
      status: "failed",
      ...(content ? { content: publicContent(content) } : {}),
      error,
    };
    try {
      await this.dependencies.library.save(renderId, run);
    } catch {
      // The terminal result remains safe even when the storage boundary is unavailable.
    }
    return run;
  }

  async create(command: CreateCommand): Promise<RenderRun> {
    let snapshot: ProductSnapshot | null;
    try {
      snapshot = await this.dependencies.catalog.getProductSnapshot(command.scope, command.productId);
    } catch {
      return this.fail(command.renderId, {
        stage: "loading_product",
        code: "CATALOG_FAILED",
      });
    }
    if (!snapshot) {
      return this.fail(command.renderId, {
        stage: "loading_product",
        code: "PRODUCT_NOT_FOUND",
      });
    }

    let content: GeneratedProductContent;
    try {
      content = await this.dependencies.generateContent(snapshot);
    } catch {
      return this.fail(command.renderId, {
        stage: "generating_content",
        code: "AI_GENERATION_FAILED",
      });
    }

    let asset: ResolvedAsset | null = null;
    let video: RenderedVideo | null = null;
    try {
      if (snapshot.primaryImageUrl) {
        try {
          asset = await this.dependencies.imageResolver.resolve(snapshot.primaryImageUrl);
        } catch {
          asset = null;
        }
      }

      try {
        video = await this.dependencies.renderer.render({
          storyboard: this.dependencies.compileStoryboard(snapshot, content),
          ...(asset ? { imagePath: asset.path } : {}),
        });
      } catch {
        return await this.fail(command.renderId, {
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
        await this.dependencies.library.save(command.renderId, run, video);
        return run;
      } catch {
        return await this.fail(command.renderId, {
          stage: "storing_artifact",
          code: "STORAGE_FAILED",
        }, content);
      }
    } finally {
      await Promise.allSettled([
        ...(video ? [video.cleanup()] : []),
        ...(asset ? [asset.cleanup()] : []),
      ]);
    }
  }
}
