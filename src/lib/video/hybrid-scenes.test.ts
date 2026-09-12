// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validateContentVersion } from "@/lib/content/passport";
import {
  createMemoryRegistry,
  type FreeAsset,
  type FreeAssetDependencies,
} from "@/lib/media/free-assets";
import type { ProductScript } from "./script-schema";
import { TemplateVideoRenderer } from "./template-video-renderer";
import type { ComposeArgs } from "./template-pipeline/compose-template";
import { probeVideo } from "./ffmpeg-renderer";
import { TEMPLATES_ROOT, type TemplateId } from "./template-registry";
import {
  HYBRID_TEMPLATES,
  MISSING_PRODUCT_ASSET,
  exportTrustedInventory,
  inspectHybridLayout,
  memorySandbox,
  portraitPath,
  prepareComposeInputs,
  remainingStaticText,
  resolveHybridMedia,
  templateHash,
  type HybridMediaContext,
} from "./hybrid-scenes";

const org = "a0000000-0000-0000-0000-000000000001";
const skuA = "a0000000-0000-4000-8000-0000000000aa";
const skuB = "a0000000-0000-4000-8000-0000000000bb";
const PNG_A = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEElEQVR4nGP4w8AARAwQCgAfjgPxzzTeXgAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_B = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const hashA = createHash("sha256").update(PNG_A).digest("hex");
const hashB = createHash("sha256").update(PNG_B).digest("hex");
const urlA = "https://cdn.example.com/sku-a.png";
const urlB = "https://cdn.example.com/sku-b.png";
const phrase = "Nhắn tin để được tư vấn";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function scratch(): string {
  const root = mkdtempSync(path.join(tmpdir(), "onevoice-hybrid-"));
  roots.push(root);
  return root;
}

function asset(skuId: string, hash: string, url: string, provenance: "catalog" | "stock" = "catalog"): FreeAsset {
  return {
    id: hash.slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"),
    sourceUrl: url,
    provider: provenance === "catalog" ? "catalog" : "wikimedia",
    author: provenance === "catalog" ? null : "Wikimedia",
    licenseId: provenance === "catalog" ? "catalog" : "cc0-1.0",
    licenseUrl: provenance === "catalog" ? url : "https://creativecommons.org/publicdomain/zero/1.0/",
    retrievedAt: "2026-09-12T12:00:00.000Z",
    contentHash: hash,
    mime: "image/png",
    dimensions: { width: 2, height: provenance === "catalog" ? 4 : 2 },
    status: "usable",
    provenance,
    skuId: provenance === "catalog" ? skuId : null,
    attribution: null,
  };
}

async function ctx(files: Record<string, Buffer>, extras: Partial<HybridMediaContext> = {}): Promise<HybridMediaContext> {
  const root = scratch();
  const sandboxFiles: Record<string, string> = {};
  const registry = createMemoryRegistry();
  for (const [hash, bytes] of Object.entries(files)) {
    const filePath = path.join(root, `${hash.slice(0, 12)}.png`);
    writeFileSync(filePath, bytes);
    sandboxFiles[hash] = filePath;
  }
  await registry.save(org, asset(skuA, hashA, urlA));
  const deps: FreeAssetDependencies = {
    registry,
    resolveImage: async (url) => {
      if (url === urlA) return { sha256: hashA, mimeType: "image/png", width: 2, height: 4, bytes: PNG_A.length };
      if (url === urlB) return { sha256: hashB, mimeType: "image/png", width: 1, height: 1, bytes: PNG_B.length };
      return null;
    },
    now: () => new Date("2026-09-12T12:00:00.000Z"),
  };
  return {
    organizationId: org,
    campaignKind: "product",
    skuId: skuA,
    sandbox: memorySandbox(sandboxFiles),
    deps,
    ...extras,
  };
}

function validScript(): ProductScript {
  return JSON.parse(
    readFileSync(path.resolve(__dirname, "__fixtures__/script-valid.json"), "utf8"),
  ) as ProductScript;
}

function hybridScript(): ProductScript {
  const script = validScript();
  script.meta = { hook: phrase, caption: phrase, cta: phrase };
  script.voice = { speed: 1, voiceId: "vi-VN-HoaiMyNeural" };
  script.scenes = script.scenes.map((scene) => ({ ...scene, voiceText: phrase })) as typeof script.scenes;
  script.scenes[0] = {
    ...script.scenes[0]!,
    templateId: "frame-liquid-bg-hero",
    inputs: {
      kicker: phrase,
      headline: phrase,
      subheadline: phrase,
      cta: phrase,
      brand: phrase,
      headline_from: "#112233",
      headline_to: "#aabbcc",
      product_image: urlA,
    },
  };
  script.scenes[1] = {
    ...script.scenes[1]!,
    templateId: "frame-creative-voltage",
    inputs: { accent_index: 1, display_lines: [phrase], meta: phrase, script: "Xem chi tiết", caption: phrase },
  };
  script.scenes[2] = {
    ...script.scenes[2]!,
    type: "body",
    templateId: "frame-glitch-title",
    inputs: { title: phrase, subtitle: phrase, media_background: urlA },
  };
  script.scenes[3] = {
    ...script.scenes[3]!,
    templateId: "frame-logo-outro",
    inputs: { brand_name: phrase, tagline: phrase, primary_url: "https://cdn.example.com/h.png" },
  };
  return script;
}


async function runProcess(executable: string, args: readonly string[]): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  const child = spawn(executable, args, { shell: false });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(stdout);
    else reject(new Error(`${executable} failed (exit ${code}): ${stderr.slice(-800)}`));
  });
  return promise;
}


function pipelineScript(): ProductScript {
  const script = validScript();
  script.music = null;
  script.scenes = [script.scenes[0]!, script.scenes[1]!, script.scenes[3]!].map((scene) => {
    const { sfx: _sfx, ...rest } = scene;
    void _sfx;
    return rest;
  }) as ProductScript["scenes"];
  script.scenes[0] = {
    ...script.scenes[0]!,
    inputs: { ...script.scenes[0]!.inputs, product_image: urlA },
  };
  return script;
}


async function pipelineMedia(png: Buffer): Promise<HybridMediaContext> {
  const hash = createHash("sha256").update(png).digest("hex");
  const root = scratch();
  const filePath = path.join(root, "product.png");
  writeFileSync(filePath, png);
  const registry = createMemoryRegistry();
  await registry.save(org, asset(skuA, hash, urlA));
  return {
    organizationId: org,
    campaignKind: "product",
    skuId: skuA,
    sandbox: memorySandbox({ [hash]: filePath }),
    deps: {
      registry,
      resolveImage: async (url) =>
        url === urlA ? { sha256: hash, mimeType: "image/png", width: 240, height: 480, bytes: png.length } : null,
      now: () => new Date("2026-09-12T12:00:00.000Z"),
    },
  };
}


describe("AT-034-01 SKU asset and missing fallback", () => {
  it("injects the matching SKU bytes into the compose payload", async () => {
    const media = await ctx({ [hashA]: PNG_A, [hashB]: PNG_B });
    await media.deps.registry.save(org, asset(skuB, hashB, urlB));
    const resolved = await resolveHybridMedia(urlA, media);
    expect(resolved.kind).toBe("local");
    if (resolved.kind !== "local") return;
    expect(resolved.contentHash).toBe(hashA);
    expect(resolved.skuId).toBe(skuA);
    expect(resolved.dataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(resolved.dataUri.split(",")[1]!, "base64")).toEqual(PNG_A);
    const inputs = await prepareComposeInputs(
      "frame-liquid-bg-hero",
      { product_image: urlA, headline: phrase },
      media,
    );
    expect(inputs.product_image).toBe(resolved.dataUri);
    expect(String(inputs.product_image)).not.toContain("https://");
  });

  it("uses an explicit missing fallback instead of another SKU or stock", async () => {
    const media = await ctx({ [hashB]: PNG_B });
    await media.deps.registry.save(org, asset(skuB, hashB, urlB));
    await media.deps.registry.save(org, asset(skuB, hashB, "https://cdn.example.com/stock.png", "stock"));
    const resolved = await resolveHybridMedia(urlA, media);
    expect(resolved.kind).toBe("missing");
    if (resolved.kind !== "missing") return;
    expect(resolved.fallback).toBe(MISSING_PRODUCT_ASSET);
    const inputs = await prepareComposeInputs("frame-liquid-bg-hero", { product_image: urlA }, media);
    expect(inputs.product_image).toBe("");
    expect(MISSING_PRODUCT_ASSET).toBe("Thiếu ảnh sản phẩm");
  });
});

describe("AT-034-02 passport inventory", () => {
  it("blocks uncovered default claims and accepts valid style index/color", () => {
    const script = hybridScript();
    const inventory = exportTrustedInventory(script.scenes);
    expect(inventory.find((item) => item.templateId === "frame-liquid-bg-hero")?.nonTextInputs).toMatchObject({
      headline_from: "color",
      headline_to: "color",
      product_image: "mediaUrl",
    });
    expect(inventory.find((item) => item.templateId === "frame-creative-voltage")?.nonTextInputs.accent_index).toBe(
      "index",
    );
    for (const item of inventory) {
      expect(JSON.stringify(item.staticText)).not.toMatch(/98%|mạnh nhất|88%|GPT 5\.5|62%/i);
      expect(item.templateHash).toBe(templateHash(item.templateId as TemplateId));
    }
    const claims = [
      ...["post.hook", "post.caption", "post.cta"].map((field) => ({
        field,
        start: 0,
        end: phrase.length,
        kind: "neutral" as const,
      })),
      ...script.scenes.flatMap((scene, index) => [
        { field: `script.scenes.${index}.voiceText`, start: 0, end: phrase.length, kind: "neutral" as const },
        ...Object.keys(scene.inputs)
          .filter(
            (key) =>
              typeof scene.inputs[key] === "string" &&
              !["product_image", "media_background", "primary_url", "headline_from", "headline_to", "script"].includes(key),
          )
          .map((key) => ({
            field: `script.scenes.${index}.inputs.${key}`,
            start: 0,
            end: phrase.length,
            kind: "neutral" as const,
          })),
        ...(scene.templateId === "frame-creative-voltage"
          ? [{ field: `script.scenes.${index}.inputs.script`, start: 0, end: 12, kind: "neutral" as const }]
          : []),
        ...((scene.inputs.display_lines as string[] | undefined)?.map((_, line) => ({
          field: `script.scenes.${index}.inputs.display_lines.${line}`,
          start: 0,
          end: phrase.length,
          kind: "neutral" as const,
        })) ?? []),
      ]),
    ];
    const value = { post: script.meta, script, model: { id: "fixture", responseId: null }, claims };
    expect(validateContentVersion(value, [], inventory).artifactHash).toBeNull();
    const dirty = structuredClone(inventory);
    dirty[0]!.staticText = { hiddenDefault: "98%" };
    expect(() => validateContentVersion(value, [], dirty)).toThrow("UNCOVERED_TEXT");
  });

  it("exports leftover template defaults so passport can reject them", () => {
    const leftovers = remainingStaticText("frame-liquid-bg-hero", [{}]);
    expect(JSON.stringify(leftovers)).not.toMatch(/mạnh nhất|GPT 5\.5|98%/i);
  });
});

describe("AT-034-03 layout screenshot and adapter boundary", () => {
  it("keeps contain/cover boxes off the CTA and does not distort", () => {
    const portrait = inspectHybridLayout({ kind: "product-hero", image: { w: 400, h: 800 } });
    const landscape = inspectHybridLayout({ kind: "product-hero", image: { w: 800, h: 400 } });
    const transparent = inspectHybridLayout({ kind: "product-hero", image: { w: 512, h: 512 } });
    for (const shot of [portrait, landscape, transparent]) {
      expect(shot.distorted).toBe(false);
      expect(shot.coversCta).toBe(false);
      expect(shot.coversText).toBe(false);
      expect(shot.overflow).toBe(false);
      expect(shot.screenshot.length).toBe(1080 * 1920);
    }
    const cover = inspectHybridLayout({ kind: "media-background", image: { w: 1920, h: 1080 } });
    expect(cover.distorted).toBe(false);
    const heroHtml = readFileSync(portraitPath("frame-liquid-bg-hero"), "utf8");
    const compareHtml = readFileSync(portraitPath("frame-aicoding-comparison"), "utf8");
    const glitchHtml = readFileSync(portraitPath("frame-glitch-title"), "utf8");
    expect(heroHtml).toMatch(/object-fit:\s*contain/);
    expect(compareHtml).toMatch(/object-fit:\s*contain/);
    expect(glitchHtml).toMatch(/object-fit:\s*cover/);
    expect(heroHtml).toContain(MISSING_PRODUCT_ASSET);
    expect(heroHtml).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });

  it("never fetches remotely outside the OV-033 resolveImage adapter", async () => {
    const fetches: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetches.push(String(input));
      throw new Error("unexpected fetch");
    }) as typeof fetch;
    try {
      const media = await ctx({ [hashA]: PNG_A });
      const inputs = await prepareComposeInputs(
        "frame-liquid-bg-hero",
        { product_image: urlA },
        media,
      );
      expect(fetches).toEqual([]);
      expect(String(inputs.product_image).startsWith("data:image/png;base64,")).toBe(true);
      await expect(
        prepareComposeInputs("frame-liquid-bg-hero", { product_image: urlA }, undefined),
      ).resolves.toMatchObject({ product_image: "" });
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("AT-034-04 voice routing", () => {
  it("passes request voice ids through to TTS", async () => {
    const script = validScript();
    const outputRoot = scratch();
    const voices: Array<string | undefined> = [];
    const renderer = new TemplateVideoRenderer({
      outputRoot,
      templatesRoot: "/templates",
      audioRoot: "/audio",
      hyperframesPath: "hyperframes",
      tts: {
        async synthesize(_text, outPath, options) {
          voices.push(options?.voice);
          writeFileSync(outPath, "fake-mp3");
        },
      },
      musicGain: 0.35,
      compose: async (args: ComposeArgs) => {
        writeFileSync(args.outputPath, "fake-clip");
        return args.outputPath;
      },
      fitClip: async (_in, _sec, outPath) => {
        writeFileSync(outPath, "fake-fitted");
      },
      concatVideos: async (_clips, outPath) => {
        writeFileSync(outPath, "fake-silent");
      },
      mux: async (_video, _audio, outPath) => {
        writeFileSync(outPath, "fake-final");
      },
      probe: (async () => ({
        formatName: "mp4",
        codecName: "h264",
        pixelFormat: "yuv420p",
        width: 1080,
        height: 1920,
        durationMs: script.scenes.reduce((sum, scene) => sum + scene.durationMs, 0),
      })) as typeof probeVideo,
      measureAudio: async () => 2,
      padAudio: async () => undefined,
      concatAudio: async () => undefined,
      mixSfx: async () => undefined,
      mixMusic: async () => undefined,
      resolveMusic: (name) => `/audio/${name}.mp3`,
      resolveSfx: (name) => `/audio/${name}.mp3`,
    });
    const first = await renderer.render({
      script,
      voice: { voiceId: "vi-VN-HoaiMyNeural" },
    });
    await first.cleanup();
    const second = await renderer.render({
      script,
      voice: { voiceId: "vi-VN-NamMinhNeural" },
    });
    await second.cleanup();
    expect(voices).toEqual([
      ...script.scenes.map(() => "vi-VN-HoaiMyNeural"),
      ...script.scenes.map(() => "vi-VN-NamMinhNeural"),
    ]);
  });

  it(
    "renders a HyperFrames pipeline MP4 with H.264 yuv420p 1080x1920, audio, and product image",
    async () => {
      const script = pipelineScript();
      const outputRoot = scratch();
      const productPath = path.join(outputRoot, "product.png");
      await runProcess("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=0xFF00FF:s=700x640:d=0.04",
        "-frames:v",
        "1",
        productPath,
      ]);
      const productPng = readFileSync(productPath);
      const media = await pipelineMedia(productPng);
      const prepared = await prepareComposeInputs(
        "frame-liquid-bg-hero",
        script.scenes[0]!.inputs as Record<string, unknown>,
        media,
      );
      expect(String(prepared.product_image).startsWith("data:image/png;base64,")).toBe(true);
      const audioRoot = path.resolve(process.cwd(), "assets/audio");
      const fixtureVoice = path.join(audioRoot, "sfx", "accents", "ding.mp3");
      const hyperframesPath =
        process.env.ONEVOICE_HYPERFRAMES_PATH?.trim() ||
        path.resolve(process.cwd(), "node_modules/.bin/hyperframes");
      const renderer = new TemplateVideoRenderer({
        outputRoot,
        templatesRoot: TEMPLATES_ROOT,
        audioRoot,
        hyperframesPath,
        composeTimeoutMs: 240_000,
        tts: {
          async synthesize(_text, outPath) {
            copyFileSync(fixtureVoice, outPath);
          },
        },
        musicGain: 0.35,
      });
      const rendered = await renderer.render({
        script,
        media,
        voice: { voiceId: "vi-VN-HoaiMyNeural" },
      });
      try {
        const probe = await probeVideo(rendered.path);
        expect(probe.codecName).toBe("h264");
        expect(probe.pixelFormat).toBe("yuv420p");
        expect(probe.width).toBe(1080);
        expect(probe.height).toBe(1920);
        expect(probe.formatName).toMatch(/mp4/);
        const totalMs = script.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
        expect(Math.abs(probe.durationMs - totalMs)).toBeLessThanOrEqual(250);
        expect(rendered.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(rendered.rendererRevision).toBe("onevoice-template-v1");

        const audioJson = JSON.parse(
          await runProcess("ffprobe", [
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_type,codec_name,sample_rate",
            "-of",
            "json",
            rendered.path,
          ]),
        ) as { streams?: Array<{ codec_type?: string; codec_name?: string; sample_rate?: string }> };
        const audio = audioJson.streams?.[0];
        expect(audio?.codec_type).toBe("audio");
        expect(audio?.codec_name).toBe("aac");
        expect(Number(audio?.sample_rate)).toBeGreaterThan(0);

        const framePath = path.join(outputRoot, "hero-frame.rgb");
        await runProcess("ffmpeg", [
          "-y",
          "-ss",
          "1.0",
          "-i",
          rendered.path,
          "-frames:v",
          "1",
          "-f",
          "rawvideo",
          "-pix_fmt",
          "rgb24",
          framePath,
        ]);
        const pixels = readFileSync(framePath);
        expect(pixels.length).toBe(1080 * 1920 * 3);
        let magentaPixels = 0;
        for (let i = 0; i < pixels.length; i += 3) {
          if (pixels[i]! > 160 && pixels[i + 1]! < 90 && pixels[i + 2]! > 160) magentaPixels += 1;
        }
        expect(magentaPixels).toBeGreaterThan(10_000);
        console.info(
          `AT-034-04 sha256=${rendered.sha256} durationMs=${probe.durationMs} ${probe.codecName}/${probe.pixelFormat} ${probe.width}x${probe.height} audio=${audio?.codec_name} magenta=${magentaPixels}`,
        );

      } finally {
        await rendered.cleanup();
      }
    },
    600_000,
  );


});

describe("hybrid template set", () => {
  it("names product hero, comparison, and media-background slots", () => {
    expect(HYBRID_TEMPLATES["frame-liquid-bg-hero"]?.kind).toBe("product-hero");
    expect(HYBRID_TEMPLATES["frame-aicoding-comparison"]?.kind).toBe("comparison");
    expect(HYBRID_TEMPLATES["frame-glitch-title"]?.kind).toBe("media-background");
  });
});
