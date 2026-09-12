// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { TemplateInventory } from "@/lib/content/passport";
import {
  resolveCampaignMedia,
  type FreeAsset,
  type FreeAssetDependencies,
} from "@/lib/media/free-assets";
import {
  TEMPLATE_IDS,
  TEMPLATE_NON_TEXT_INPUTS,
  TEMPLATES_ROOT,
  type TemplateId,
} from "./template-registry";

export const MISSING_PRODUCT_ASSET = "Thiếu ảnh sản phẩm" as const;
export const CANVAS = Object.freeze({ width: 1080, height: 1920 });

export type MediaFit = "contain" | "cover";
export type HybridKind = "product-hero" | "comparison" | "media-background";

export const HYBRID_TEMPLATES: Readonly<
  Record<string, Readonly<{ kind: HybridKind; slots: Readonly<Record<string, MediaFit>> }>>
> = Object.freeze({
  "frame-liquid-bg-hero": Object.freeze({
    kind: "product-hero",
    slots: Object.freeze({ product_image: "contain" }),
  }),
  "frame-aicoding-comparison": Object.freeze({
    kind: "comparison",
    slots: Object.freeze({ "left.image": "contain", "right.image": "contain" }),
  }),
  "frame-glitch-title": Object.freeze({
    kind: "media-background",
    slots: Object.freeze({ media_background: "cover" }),
  }),
});

/** Pixel boxes matching the 9:16 portrait CSS (product image must not cover CTA/text). */
export const HYBRID_LAYOUT = Object.freeze({
  "product-hero": Object.freeze({
    image: Object.freeze({ x: 190, y: 280, w: 700, h: 640, fit: "contain" as const }),
    headline: Object.freeze({ x: 80, y: 960, w: 920, h: 200 }),
    subheadline: Object.freeze({ x: 100, y: 1180, w: 880, h: 120 }),
    cta: Object.freeze({ x: 270, y: 1360, w: 540, h: 80 }),
  }),
  comparison: Object.freeze({
    leftImage: Object.freeze({ x: 100, y: 700, w: 400, h: 220, fit: "contain" as const }),
    rightImage: Object.freeze({ x: 580, y: 700, w: 400, h: 220, fit: "contain" as const }),
  }),
  "media-background": Object.freeze({
    image: Object.freeze({ x: 0, y: 0, w: 1080, h: 1920, fit: "cover" as const }),
    title: Object.freeze({ x: 80, y: 760, w: 920, h: 400 }),
  }),
});

export type Box = Readonly<{ x: number; y: number; w: number; h: number }>;
export type HybridSandbox = { pathFor(contentHash: string): string | null };
export type HybridMediaContext = Readonly<{
  organizationId: string;
  campaignKind: "product" | "program" | "trend";
  skuId?: string | null;
  sandbox: HybridSandbox;
  deps: FreeAssetDependencies;
  imagePath?: string;
}>;

export type ResolvedLocalMedia = Readonly<{
  kind: "local";
  contentHash: string;
  dataUri: string;
  mime: string;
  skuId: string | null;
}>;
export type ResolvedMissingMedia = Readonly<{
  kind: "missing";
  reason: "missing_sku_asset" | "not_selectable";
  fallback: typeof MISSING_PRODUCT_ASSET;
}>;
export type ResolvedHybridMedia = ResolvedLocalMedia | ResolvedMissingMedia;

function isTemplateId(id: string): id is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(id);
}

export function memorySandbox(files: Readonly<Record<string, string>>): HybridSandbox {
  return { pathFor: (hash) => files[hash] ?? null };
}

export function portraitPath(templateId: TemplateId): string {
  return path.join(TEMPLATES_ROOT, templateId, "compositions", "portrait.html");
}

export function templateHash(templateId: TemplateId): string {
  return createHash("sha256").update(readFileSync(portraitPath(templateId))).digest("hex");
}

export function readPortraitDefaults(templateId: TemplateId): Record<string, unknown> {
  const html = readFileSync(portraitPath(templateId), "utf8");
  const match = html.match(/data-composition-variables='([^']*)'/);
  if (!match?.[1]) return {};
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function flatten(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return value.trim() ? [[prefix, value]] : [];
  if (typeof value === "number" || typeof value === "boolean") {
    return prefix ? [[prefix, String(value)]] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flatten(item, prefix ? `${prefix}.${index}` : String(index)));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      flatten(item, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [];
}

function lookup(value: unknown, pathKey: string): unknown {
  return pathKey.split(".").reduce<unknown>((cursor, key) => {
    if (cursor == null || typeof cursor !== "object") return undefined;
    return (cursor as Record<string, unknown>)[key];
  }, value);
}

function assign(target: Record<string, unknown>, pathKey: string, value: unknown): void {
  const parts = pathKey.split(".");
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cursor[key];
    if (next == null || typeof next !== "object" || Array.isArray(next)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = value;
}

export function remainingStaticText(
  templateId: TemplateId,
  inputsList: readonly Record<string, unknown>[],
): Record<string, string> {
  const defaults = flatten(readPortraitDefaults(templateId));
  const nonText = TEMPLATE_NON_TEXT_INPUTS[templateId];
  const out: Record<string, string> = {};
  for (const [key, value] of defaults) {
    if (nonText[key]) continue;
    const uncovered = inputsList.some((inputs) => lookup(inputs, key) === undefined);
    if (uncovered) out[key] = value;
  }
  return out;
}

/** Trusted OV-032 inventory: hash + leftover defaults + style/media slot kinds. Never from an AI response. */
export function exportTrustedInventory(
  scenes: readonly { templateId: string; inputs: Record<string, unknown> }[],
): TemplateInventory[] {
  const grouped = new Map<TemplateId, Record<string, unknown>[]>();
  for (const scene of scenes) {
    if (!isTemplateId(scene.templateId)) continue;
    const list = grouped.get(scene.templateId) ?? [];
    list.push(scene.inputs);
    grouped.set(scene.templateId, list);
  }
  return [...grouped.entries()].map(([templateId, inputsList]) => ({
    templateId,
    templateHash: templateHash(templateId),
    staticText: remainingStaticText(templateId, inputsList),
    nonTextInputs: { ...TEMPLATE_NON_TEXT_INPUTS[templateId] },
  }));
}

const DATA_URI = /^data:image\/(png|jpeg|webp);base64,/i;

export function assertLocalMedia(value: string): string {
  if (DATA_URI.test(value)) return value;
  throw new Error("REMOTE_MEDIA_FORBIDDEN");
}

function mimeOf(filePath: string, fallback: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return fallback;
}

function dataUriFromFile(filePath: string, mime: string): string {
  return `data:${mime};base64,${readFileSync(filePath).toString("base64")}`;
}

function trustedLocalFile(filePath: string): boolean {
  return path.isAbsolute(filePath) && statSync(filePath).isFile() && !filePath.includes("\0");
}

export function fittedRect(
  image: Readonly<{ w: number; h: number }>,
  slot: Box & { fit: MediaFit },
): Box {
  const scale =
    slot.fit === "contain"
      ? Math.min(slot.w / image.w, slot.h / image.h)
      : Math.max(slot.w / image.w, slot.h / image.h);
  const w = image.w * scale;
  const h = image.h * scale;
  return { x: slot.x + (slot.w - w) / 2, y: slot.y + (slot.h - h) / 2, w, h };
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function inspectHybridLayout(input: {
  kind: HybridKind;
  image: Readonly<{ w: number; h: number }>;
}): Readonly<{
  fitted: Box;
  distorted: boolean;
  overflow: boolean;
  coversCta: boolean;
  coversText: boolean;
  screenshot: Uint8Array;
}> {
  if (input.kind === "product-hero") {
    const slot = HYBRID_LAYOUT["product-hero"].image;
    const fitted = fittedRect(input.image, slot);
    const aspect = input.image.w / input.image.h;
    const fittedAspect = fitted.w / fitted.h;
    const coversCta = boxesOverlap(fitted, HYBRID_LAYOUT["product-hero"].cta);
    const coversText =
      boxesOverlap(fitted, HYBRID_LAYOUT["product-hero"].headline) ||
      boxesOverlap(fitted, HYBRID_LAYOUT["product-hero"].subheadline);
    return {
      fitted,
      distorted: Math.abs(aspect - fittedAspect) > 1e-6,
      overflow: fitted.x < 0 || fitted.y < 0 || fitted.x + fitted.w > CANVAS.width || fitted.y + fitted.h > CANVAS.height,
      coversCta,
      coversText,
      screenshot: rasterize([
        { box: slot, fill: 1 },
        { box: fitted, fill: 2 },
        { box: HYBRID_LAYOUT["product-hero"].cta, fill: 3 },
        { box: HYBRID_LAYOUT["product-hero"].headline, fill: 4 },
      ]),
    };
  }
  if (input.kind === "comparison") {
    const slot = HYBRID_LAYOUT.comparison.leftImage;
    const fitted = fittedRect(input.image, slot);
    return {
      fitted,
      distorted: Math.abs(input.image.w / input.image.h - fitted.w / fitted.h) > 1e-6,
      overflow: fitted.x < slot.x - 1e-6 || fitted.y < slot.y - 1e-6,
      coversCta: false,
      coversText: false,
      screenshot: rasterize([
        { box: slot, fill: 1 },
        { box: fitted, fill: 2 },
      ]),
    };
  }
  const slot = HYBRID_LAYOUT["media-background"].image;
  const fitted = fittedRect(input.image, slot);
  return {
    fitted,
    distorted: Math.abs(input.image.w / input.image.h - fitted.w / fitted.h) > 1e-6,
    overflow: false,
    coversCta: false,
    coversText: false,
    screenshot: rasterize([
      { box: slot, fill: 1 },
      { box: HYBRID_LAYOUT["media-background"].title, fill: 4 },
    ]),
  };
}

function rasterize(layers: readonly { box: Box; fill: number }[]): Uint8Array {
  const pixels = new Uint8Array(CANVAS.width * CANVAS.height);
  for (const layer of layers) {
    const x0 = Math.max(0, Math.floor(layer.box.x));
    const y0 = Math.max(0, Math.floor(layer.box.y));
    const x1 = Math.min(CANVAS.width, Math.ceil(layer.box.x + layer.box.w));
    const y1 = Math.min(CANVAS.height, Math.ceil(layer.box.y + layer.box.h));
    for (let y = y0; y < y1; y++) {
      const row = y * CANVAS.width;
      pixels.fill(layer.fill, row + x0, row + x1);
    }
  }
  return pixels;
}

function missing(reason: ResolvedMissingMedia["reason"] = "missing_sku_asset"): ResolvedMissingMedia {
  return { kind: "missing", reason, fallback: MISSING_PRODUCT_ASSET };
}

function fromSandbox(asset: FreeAsset, sandbox: HybridSandbox): ResolvedHybridMedia {
  const localPath = sandbox.pathFor(asset.contentHash);
  if (!localPath || !trustedLocalFile(localPath)) return missing("not_selectable");
  const mime = mimeOf(localPath, asset.mime);
  return {
    kind: "local",
    contentHash: asset.contentHash,
    dataUri: assertLocalMedia(dataUriFromFile(localPath, mime)),
    mime,
    skuId: asset.skuId,
  };
}

/** Product scenes never fall through to unrelated stock; media bytes come from the OV-033 sandbox. */
export async function resolveHybridMedia(
  url: unknown,
  ctx: HybridMediaContext,
): Promise<ResolvedHybridMedia> {
  if (typeof url === "string" && DATA_URI.test(url)) {
    return {
      kind: "local",
      contentHash: createHash("sha256").update(url).digest("hex"),
      dataUri: assertLocalMedia(url),
      mime: "image/png",
      skuId: ctx.skuId ?? null,
    };
  }
  if (ctx.imagePath && (url == null || url === "") && trustedLocalFile(ctx.imagePath)) {
    const bytes = readFileSync(ctx.imagePath);
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const sandboxed = ctx.sandbox.pathFor(contentHash);
    if (sandboxed && path.resolve(sandboxed) === path.resolve(ctx.imagePath)) {
      return fromSandbox(
        {
          id: contentHash.slice(0, 32),
          sourceUrl: "https://catalog.example.com/local.png",
          provider: "catalog",
          author: null,
          licenseId: "catalog",
          licenseUrl: "https://catalog.example.com/local.png",
          retrievedAt: "2026-09-12T00:00:00.000Z",
          contentHash,
          mime: mimeOf(ctx.imagePath, "image/png"),
          dimensions: null,
          status: "usable",
          provenance: "catalog",
          skuId: ctx.skuId ?? null,
          attribution: null,
        },
        ctx.sandbox,
      );
    }
    return missing("not_selectable");
  }
  if (typeof url !== "string" || !url.startsWith("https://")) return missing();
  const usable = await ctx.deps.registry.listUsable(ctx.organizationId);
  if (ctx.campaignKind === "product") {
    const catalog = usable.find(
      (asset) =>
        asset.provenance === "catalog" &&
        asset.status === "usable" &&
        asset.sourceUrl === url &&
        (!ctx.skuId || asset.skuId === ctx.skuId),
    );
    if (catalog) return fromSandbox(catalog, ctx.sandbox);
    if (ctx.skuId) {
      const media = await resolveCampaignMedia(
        {
          organizationId: ctx.organizationId,
          campaignKind: "product",
          skuId: ctx.skuId,
          catalogCandidates: [{ sourceUrl: url, skuId: ctx.skuId }],
        },
        ctx.deps,
      );
      if (media.kind === "catalog" && media.asset.skuId === ctx.skuId) {
        return fromSandbox(media.asset, ctx.sandbox);
      }
    }
    return missing("missing_sku_asset");
  }
  const media = await resolveCampaignMedia(
    { organizationId: ctx.organizationId, campaignKind: ctx.campaignKind },
    ctx.deps,
  );
  if (media.kind === "motion-only") return missing("missing_sku_asset");
  return fromSandbox(media.asset, ctx.sandbox);
}

export async function prepareComposeInputs(
  templateId: string,
  inputs: Record<string, unknown>,
  ctx: HybridMediaContext | undefined,
): Promise<Record<string, unknown>> {
  const prepared = structuredClone(inputs) as Record<string, unknown>;
  const hybrid = HYBRID_TEMPLATES[templateId];
  if (!hybrid) return prepared;
  for (const slotPath of Object.keys(hybrid.slots)) {
    const current = lookup(prepared, slotPath);
    const useImagePath = Boolean(ctx?.imagePath && slotPath === "product_image");
    if (current === undefined && !useImagePath) continue;
    if (typeof current === "string" && /^https?:/i.test(current) === false && current !== "") {
      if (DATA_URI.test(current)) {
        assertLocalMedia(current);
        continue;
      }
      assign(prepared, slotPath, "");
      continue;
    }
    if (!ctx) {
      assign(prepared, slotPath, "");
      continue;
    }
    const resolved = await resolveHybridMedia(current === "" ? undefined : current, ctx);
    assign(prepared, slotPath, resolved.kind === "local" ? resolved.dataUri : "");
  }
  return prepared;
}
