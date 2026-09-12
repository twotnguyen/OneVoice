import { createHash } from "node:crypto";
import { PublicHttpError, validatePublicUrl, type PublicTextFetcher } from "@/lib/network/public-http";
import type { RemoteImageResolver } from "@/lib/video/remote-image-resolver";

export type FreeAssetStatus = "usable" | "failed" | "expired" | "revoked";
export type FreeAssetProvenance = "catalog" | "stock";
export type StockProvider = "wikimedia" | "pexels" | "unsplash";
export type AllowedLicenseId =
  | "cc0-1.0"
  | "cc-by-4.0"
  | "cc-by-3.0"
  | "public-domain"
  | "pexels"
  | "unsplash"
  | "catalog";

export type FreeAsset = Readonly<{
  id: string;
  sourceUrl: string;
  provider: string;
  author: string | null;
  licenseId: AllowedLicenseId;
  licenseUrl: string;
  retrievedAt: string;
  contentHash: string;
  mime: string;
  dimensions: Readonly<{ width: number; height: number }> | null;
  status: FreeAssetStatus;
  provenance: FreeAssetProvenance;
  skuId: string | null;
  attribution: string | null;
}>;

export type AssetAttribution = Readonly<{
  text: string;
  licenseId: AllowedLicenseId;
  licenseUrl: string;
  author: string | null;
  sourceUrl: string;
  provider: string;
}>;

export type LicenseCandidate = Readonly<{
  licenseId?: string | null;
  licenseUrl?: string | null;
  licenseName?: string | null;
  commercialUse?: boolean | null;
  price?: number | null;
  author?: string | null;
  attribution?: string | null;
  provider?: string | null;
  provenance?: FreeAssetProvenance;
}>;

export type IngestCandidate = Readonly<{
  organizationId: string;
  id?: string;
  sourceUrl: string;
  provider: string;
  provenance: FreeAssetProvenance;
  skuId?: string | null;
  mime?: string | null;
  license: LicenseCandidate;
}>;

export type ResolvedMediaBytes = Readonly<{
  sha256: string;
  mimeType: string;
  width?: number;
  height?: number;
  bytes?: number;
}>;

export type StockHit = Readonly<{
  sourceUrl: string;
  provider: "wikimedia";
  licenseId: AllowedLicenseId;
  licenseUrl: string;
  author: string | null;
  mime: string;
  width?: number;
  height?: number;
}>;

export type CampaignMedia =
  | Readonly<{ kind: "catalog"; asset: FreeAsset }>
  | Readonly<{ kind: "stock"; asset: FreeAsset }>
  | Readonly<{ kind: "motion-only"; reason: string; source: "fallback" }>;

export type FreeAssetRegistry = {
  getByHash(organizationId: string, contentHash: string): Promise<FreeAsset | null>;
  getById(organizationId: string, id: string): Promise<FreeAsset | null>;
  save(organizationId: string, asset: FreeAsset): Promise<FreeAsset>;
  listUsable(organizationId: string): Promise<FreeAsset[]>;
  updateStatus(organizationId: string, id: string, status: Exclude<FreeAssetStatus, "usable">): Promise<FreeAsset>;
};

export type FreeAssetDependencies = {
  registry: FreeAssetRegistry;
  now?: () => Date;
  id?: () => string;
  fetch?: PublicTextFetcher;
  resolveImage?: (url: string) => Promise<ResolvedMediaBytes | null>;
  keys?: { PEXELS_API_KEY?: string; UNSPLASH_ACCESS_KEY?: string };
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
};

export class FreeAssetError extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ? `${code}:${detail}` : code);
    this.name = "FreeAssetError";
  }
}

/** Verified 2026-09-12 from Creative Commons, Pexels, and Unsplash license pages. Share-alike/NC/ND are not commercial-compatible here. */
const LICENSE_BY_ID: Record<Exclude<AllowedLicenseId, "catalog">, { url: string; attributionRequired: boolean }> = {
  "cc0-1.0": { url: "https://creativecommons.org/publicdomain/zero/1.0/", attributionRequired: false },
  "cc-by-4.0": { url: "https://creativecommons.org/licenses/by/4.0/", attributionRequired: true },
  "cc-by-3.0": { url: "https://creativecommons.org/licenses/by/3.0/", attributionRequired: true },
  "public-domain": { url: "https://creativecommons.org/publicdomain/mark/1.0/", attributionRequired: false },
  pexels: { url: "https://www.pexels.com/license/", attributionRequired: false },
  unsplash: { url: "https://unsplash.com/license/", attributionRequired: false },
};

const RASTER = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROVIDER_KEYS = { pexels: "PEXELS_API_KEY", unsplash: "UNSPLASH_ACCESS_KEY" } as const;
const FACEBOOK_HOST = /(^|\.)(facebook\.com|fbcdn\.net|messenger\.com|instagram\.com|cdninstagram\.com)$/;

function mapped(error: unknown): FreeAssetError {
  if (error instanceof FreeAssetError) return error;
  if (error instanceof PublicHttpError) return new FreeAssetError(error.code);
  return new FreeAssetError("network_error");
}

function boundMs(value: number | undefined): number {
  const timeoutMs = Math.min(8000, value ?? 8000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new FreeAssetError("unsafe_url");
  return timeoutMs;
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  const timer = setTimeout(() => reject(new FreeAssetError("timeout")), timeoutMs);
  Promise.resolve(work).then(
    (value) => {
      clearTimeout(timer);
      resolve(value);
    },
    (error) => {
      clearTimeout(timer);
      reject(mapped(error));
    },
  );
  return promise;
}

function text(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, 200) : null;
}

function normalizeLicenseId(raw: string): string | null {
  const value = raw
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/creative commons/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return null;
  if (/by-?sa|by-?nc|by-?nd|fair use|all rights reserved|shutterstock|getty|adobe stock/.test(value)) return "rejected";
  if (/\bcc0\b/.test(value) || value.includes("zero 1.0") || value === "cc0-1.0") return "cc0-1.0";
  if (value.includes("by 4.0") || value.includes("by-4.0") || value === "cc-by-4.0" || value.includes("attribution 4.0")) return "cc-by-4.0";
  if (value.includes("by 3.0") || value.includes("by-3.0") || value === "cc-by-3.0" || value.includes("attribution 3.0")) return "cc-by-3.0";
  if (value.includes("public domain") || value === "pd" || value === "pdm" || value === "public-domain") return "public-domain";
  if (value.includes("pexels")) return "pexels";
  if (value.includes("unsplash")) return "unsplash";
  return value;
}

export function isForbiddenStockHost(hostname: string): boolean {
  return FACEBOOK_HOST.test(hostname.toLowerCase().replace(/\.$/, ""));
}

export function evaluateLicense(candidate: LicenseCandidate): {
  licenseId: AllowedLicenseId;
  licenseUrl: string;
  attributionRequired: boolean;
  attribution: string | null;
  author: string | null;
} {
  if (candidate.provider === "facebook" || candidate.provider === "instagram") {
    throw new FreeAssetError("facebook_stock_forbidden");
  }
  if (candidate.provenance === "catalog") {
    return { licenseId: "catalog", licenseUrl: "", attributionRequired: false, attribution: null, author: text(candidate.author) };
  }
  if (candidate.price != null && candidate.price > 0) throw new FreeAssetError("unlicensed");
  if (candidate.commercialUse === false) throw new FreeAssetError("unlicensed");
  const normalized = normalizeLicenseId(candidate.licenseId || candidate.licenseName || "");
  if (!normalized || normalized === "rejected" || !(normalized in LICENSE_BY_ID)) throw new FreeAssetError("unlicensed");
  const licenseId = normalized as Exclude<AllowedLicenseId, "catalog">;
  const spec = LICENSE_BY_ID[licenseId];
  const author = text(candidate.author) ?? text(candidate.attribution);
  if (spec.attributionRequired && !author) throw new FreeAssetError("attribution_required");
  const attribution = spec.attributionRequired && author ? `${author} / ${licenseId.toUpperCase()}` : text(candidate.attribution);
  return { licenseId, licenseUrl: spec.url, attributionRequired: spec.attributionRequired, attribution, author };
}

export function mediaAttribution(asset: FreeAsset): AssetAttribution {
  const textValue =
    asset.attribution ??
    (asset.author ? `${asset.author} / ${asset.licenseId}` : `${asset.provider} / ${asset.licenseId}`);
  return {
    text: textValue,
    licenseId: asset.licenseId,
    licenseUrl: asset.licenseUrl,
    author: asset.author,
    sourceUrl: asset.sourceUrl,
    provider: asset.provider,
  };
}

export function createMemoryRegistry(): FreeAssetRegistry {
  const rows = new Map<string, FreeAsset & { organizationId: string }>();
  const key = (organizationId: string, contentHash: string) => `${organizationId}:${contentHash}`;
  const find = (organizationId: string, id: string) =>
    [...rows.values()].find((row) => row.organizationId === organizationId && row.id === id) ?? null;
  return {
    async getByHash(organizationId, contentHash) {
      return rows.get(key(organizationId, contentHash)) ?? null;
    },
    async getById(organizationId, id) {
      return find(organizationId, id);
    },
    async save(organizationId, asset) {
      const existing = rows.get(key(organizationId, asset.contentHash));
      if (existing) return existing;
      rows.set(key(organizationId, asset.contentHash), { ...asset, organizationId });
      return asset;
    },
    async listUsable(organizationId) {
      return [...rows.values()].filter((row) => row.organizationId === organizationId && row.status === "usable");
    },
    async updateStatus(organizationId, id, status) {
      const existing = find(organizationId, id);
      if (!existing) throw new FreeAssetError("not_selectable");
      const updated = { ...existing, status };
      rows.set(key(organizationId, existing.contentHash), updated);
      return updated;
    },
  };
}

function mediaUrl(value: string): URL {
  try {
    return validatePublicUrl(value);
  } catch (error) {
    throw mapped(error);
  }
}

function rejectMediaUrl(url: URL, mime?: string | null): void {
  if (isForbiddenStockHost(url.hostname)) throw new FreeAssetError("facebook_stock_forbidden");
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".svg") || mime === "image/svg+xml") throw new FreeAssetError("svg_rejected");
  if (mime && !RASTER.has(mime)) throw new FreeAssetError("wrong_mime");
}

export async function ingestAsset(candidate: IngestCandidate, deps: FreeAssetDependencies): Promise<FreeAsset> {
  const license = evaluateLicense({ ...candidate.license, provider: candidate.provider, provenance: candidate.provenance });
  const url = mediaUrl(candidate.sourceUrl);
  rejectMediaUrl(url, candidate.mime ?? null);
  const skuId = candidate.provenance === "catalog" ? candidate.skuId ?? null : null;
  if (candidate.provenance === "catalog" && !skuId) throw new FreeAssetError("unlicensed");
  if (candidate.provenance === "stock" && candidate.provider === "catalog") throw new FreeAssetError("unlicensed");
  const resolved = deps.resolveImage
    ? await withTimeout(Promise.resolve(deps.resolveImage(url.href)), boundMs(deps.timeoutMs)).catch((error) => {
        throw mapped(error);
      })
    : null;
  if (!resolved || !/^[a-f0-9]{64}$/.test(resolved.sha256)) throw new FreeAssetError("rejected_media");
  if (resolved.mimeType === "image/svg+xml") throw new FreeAssetError("svg_rejected");
  if (!RASTER.has(resolved.mimeType)) throw new FreeAssetError("wrong_mime");
  const existing = await deps.registry.getByHash(candidate.organizationId, resolved.sha256);
  if (existing) return existing;
  const asset: FreeAsset = {
    id: candidate.id ?? deps.id?.() ?? createHash("sha256").update(resolved.sha256).digest("hex").slice(0, 32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"),
    sourceUrl: url.href,
    provider: candidate.provenance === "catalog" ? "catalog" : candidate.provider,
    author: license.author,
    licenseId: license.licenseId,
    licenseUrl: license.licenseId === "catalog" ? url.href : license.licenseUrl,
    retrievedAt: (deps.now ?? (() => new Date()))().toISOString(),
    contentHash: resolved.sha256,
    mime: resolved.mimeType,
    dimensions: resolved.width && resolved.height ? { width: resolved.width, height: resolved.height } : null,
    status: "usable",
    provenance: candidate.provenance,
    skuId,
    attribution: license.attribution,
  };
  return deps.registry.save(candidate.organizationId, asset);
}

function wikimediaSearchUrl(query: string): string {
  const trimmed = query.normalize("NFKC").trim().slice(0, 80);
  if (trimmed.length < 1) throw new FreeAssetError("unlicensed");
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "5");
  url.searchParams.set("gsrsearch", trimmed);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata");
  return validatePublicUrl(url.href).href;
}

function metadataValue(entry: unknown, key: string): string | null {
  if (!entry || typeof entry !== "object") return null;
  const metadata = (entry as { extmetadata?: Record<string, { value?: unknown }> }).extmetadata;
  const value = metadata?.[key]?.value;
  return typeof value === "string" ? value : null;
}

export async function searchStock(query: string, provider: StockProvider, deps: FreeAssetDependencies): Promise<StockHit[]> {
  if (provider === "pexels" || provider === "unsplash") {
    const name = PROVIDER_KEYS[provider];
    if (!deps.keys?.[name]?.trim()) throw new FreeAssetError("missing_provider_key", name);
    throw new FreeAssetError("unlicensed", name);
  }
  if (!deps.fetch) throw new FreeAssetError("timeout");
  const timeoutMs = boundMs(deps.timeoutMs);
  const maxBytes = Math.min(512 * 1024, deps.maxBytes ?? 512 * 1024);
  const response = await withTimeout(deps.fetch(wikimediaSearchUrl(query), { timeoutMs, maxBytes, signal: deps.signal }), timeoutMs);
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    throw new FreeAssetError("invalid_response");
  }
  const pages = (parsed as { query?: { pages?: Record<string, unknown> } }).query?.pages;
  if (!pages || typeof pages !== "object") return [];
  const hits: StockHit[] = [];
  for (const page of Object.values(pages)) {
    if (hits.length >= 5) break;
    const info = Array.isArray((page as { imageinfo?: unknown[] }).imageinfo) ? (page as { imageinfo: Record<string, unknown>[] }).imageinfo[0] : null;
    if (!info || typeof info.url !== "string" || typeof info.mime !== "string") continue;
    try {
      const url = mediaUrl(info.url);
      rejectMediaUrl(url, typeof info.mime === "string" ? info.mime : null);
      if (!url.hostname.toLowerCase().endsWith("upload.wikimedia.org")) continue;
      const license = evaluateLicense({
        licenseName: metadataValue(info, "LicenseShortName") ?? metadataValue(info, "UsageTerms"),
        licenseUrl: metadataValue(info, "LicenseUrl"),
        author: metadataValue(info, "Artist"),
        commercialUse: true,
        price: 0,
        provider: "wikimedia",
        provenance: "stock",
      });
      hits.push({
        sourceUrl: url.href,
        provider: "wikimedia",
        licenseId: license.licenseId,
        licenseUrl: license.licenseUrl,
        author: license.author,
        mime: info.mime,
        width: typeof info.width === "number" ? info.width : undefined,
        height: typeof info.height === "number" ? info.height : undefined,
      });
    } catch (error) {
      if (error instanceof FreeAssetError && (error.code === "unsafe_url" || error.code === "unsafe_address")) throw error;
    }
  }
  return hits;
}

export async function resolveCampaignMedia(
  input: {
    organizationId: string;
    campaignKind: "product" | "program" | "trend";
    skuId?: string | null;
    catalogCandidates?: readonly { sourceUrl: string; skuId: string; mime?: string }[];
    stockQuery?: string;
    stockProvider?: StockProvider;
  },
  deps: FreeAssetDependencies,
): Promise<CampaignMedia> {
  const usable = await deps.registry.listUsable(input.organizationId);
  if (input.campaignKind === "product" && input.skuId) {
    const catalog = usable.find((asset) => asset.provenance === "catalog" && asset.skuId === input.skuId);
    if (catalog) return { kind: "catalog", asset: catalog };
    for (const candidate of input.catalogCandidates ?? []) {
      if (candidate.skuId !== input.skuId) continue;
      try {
        const asset = await ingestAsset(
          {
            organizationId: input.organizationId,
            sourceUrl: candidate.sourceUrl,
            provider: "catalog",
            provenance: "catalog",
            skuId: candidate.skuId,
            mime: candidate.mime,
            license: { provenance: "catalog" },
          },
          deps,
        );
        if (asset.status === "usable" && asset.provenance === "catalog" && asset.skuId === input.skuId) {
          return { kind: "catalog", asset };
        }
      } catch {
        continue;
      }
    }
  }
  const stock = usable.find((asset) => asset.provenance === "stock" && asset.status === "usable");
  if (stock) return { kind: "stock", asset: stock };
  if (input.stockQuery && input.stockProvider) {
    try {
      const hits = await searchStock(input.stockQuery, input.stockProvider, deps);
      for (const hit of hits) {
        try {
          const asset = await ingestAsset(
            {
              organizationId: input.organizationId,
              sourceUrl: hit.sourceUrl,
              provider: hit.provider,
              provenance: "stock",
              mime: hit.mime,
              license: {
                licenseId: hit.licenseId,
                licenseUrl: hit.licenseUrl,
                author: hit.author,
                commercialUse: true,
                price: 0,
                provider: hit.provider,
                provenance: "stock",
              },
            },
            deps,
          );
          if (asset.status === "usable" && asset.provenance === "stock") return { kind: "stock", asset };
        } catch {
          continue;
        }
      }
    } catch (error) {
      const code = mapped(error).code;
      if (code === "timeout") return { kind: "motion-only", reason: "timeout", source: "fallback" };
    }
  }
  return { kind: "motion-only", reason: "no_licensed_media", source: "fallback" };
}

/** Wire the existing image resolver; do not download through a second crawler. */
export function resolveWithRemoteImage(resolver: RemoteImageResolver): NonNullable<FreeAssetDependencies["resolveImage"]> {
  return async (url) => {
    const asset = await resolver.resolve(url);
    if (!asset) return null;
    return { sha256: asset.sha256, mimeType: asset.mimeType, bytes: asset.bytes };
  };
}

export function toRegisterPayload(organizationId: string, asset: FreeAsset): Record<string, unknown> {
  return {
    p_organization_id: organizationId,
    p_asset: {
      id: asset.id,
      sourceUrl: asset.sourceUrl,
      provider: asset.provider,
      author: asset.author,
      licenseId: asset.licenseId,
      licenseUrl: asset.licenseUrl,
      retrievedAt: asset.retrievedAt,
      contentHash: asset.contentHash,
      mime: asset.mime,
      width: asset.dimensions?.width ?? null,
      height: asset.dimensions?.height ?? null,
      status: asset.status,
      provenance: asset.provenance,
      skuId: asset.skuId,
      attribution: asset.attribution,
    },
  };
}
