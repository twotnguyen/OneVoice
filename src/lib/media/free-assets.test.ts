import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import type { request } from "node:https";
import { describe, expect, it, vi } from "vitest";
import { createPublicTextFetcher, fetchPublicText, PublicHttpError } from "@/lib/network/public-http";
import {
  createMemoryRegistry,
  evaluateLicense,
  FreeAssetError,
  ingestAsset,
  isForbiddenStockHost,
  mediaAttribution,
  resolveCampaignMedia,
  searchStock,
  type FreeAsset,
  type FreeAssetDependencies,
  type IngestCandidate,
} from "./free-assets";

const org = "a0000000-0000-0000-0000-000000000001";
const skuA = "a0000000-0000-4000-8000-0000000000aa";
const skuB = "a0000000-0000-4000-8000-0000000000bb";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEElEQVR4nGP4w8AARAwQCgAfjgPxzzTeXgAAAABJRU5ErkJggg==",
  "base64",
);
const pngHash = createHash("sha256").update(PNG).digest("hex");
const now = new Date("2026-09-12T12:00:00.000Z");

function harness(
  responses: { status?: number; headers?: Record<string, string>; chunks?: Buffer[]; hang?: boolean }[] = [{}],
  addresses = ["93.184.215.14"],
) {
  const requests: Record<string, unknown>[] = [];
  const dns = vi.fn(async () => addresses);
  const transport = vi.fn((options, callback) => {
    requests.push(options);
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    req.destroy = vi.fn();
    req.end = () =>
      queueMicrotask(() => {
        const data = responses.shift() ?? {};
        if (data.hang) return;
        const res = Object.assign(new EventEmitter(), {
          statusCode: data.status ?? 200,
          headers: data.headers ?? { "content-type": "application/json" },
          destroy: vi.fn(),
          resume: vi.fn(),
        });
        callback(res);
        for (const chunk of data.chunks ?? [Buffer.from("{}")]) res.emit("data", chunk);
        res.emit("end");
      });
    return req;
  }) as unknown as typeof request;
  return { fetch: createPublicTextFetcher({ resolve4: dns, request: transport }), dns, requests };
}

function licensedStock(overrides: Partial<IngestCandidate> = {}): IngestCandidate {
  return {
    organizationId: org,
    sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a0/cc0.png",
    provider: "wikimedia",
    provenance: "stock",
    license: {
      licenseId: "cc0-1.0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Example Author",
      commercialUse: true,
      price: 0,
    },
    ...overrides,
  };
}

function deps(overrides: Partial<FreeAssetDependencies> = {}): FreeAssetDependencies {
  return {
    registry: createMemoryRegistry(),
    now: () => now,
    id: () => "b0000000-0000-4000-8000-000000000001",
    resolveImage: async () => ({ sha256: pngHash, mimeType: "image/png", width: 2, height: 2, bytes: PNG.length }),
    keys: {},
    timeoutMs: 8000,
    ...overrides,
  };
}

describe("AT-033-01 license allowlist", () => {
  it("rejects unknown license, paid assets, and missing commercial rights", () => {
    expect(() => evaluateLicense({ licenseId: "unknown" })).toThrow(FreeAssetError);
    expect(() => evaluateLicense({ licenseId: "unknown" })).toThrow("unlicensed");
    expect(() => evaluateLicense({ licenseId: "cc0-1.0", price: 19 })).toThrow("unlicensed");
    expect(() => evaluateLicense({ licenseId: "cc-by-4.0", commercialUse: false, author: "Ada" })).toThrow("unlicensed");
    expect(() => evaluateLicense({ licenseName: "CC BY-SA 4.0", author: "Ada" })).toThrow("unlicensed");
    expect(() => evaluateLicense({ licenseName: "CC BY-NC 4.0", author: "Ada" })).toThrow("unlicensed");
    expect(() => evaluateLicense({ price: 0 })).toThrow("unlicensed");
    expect(() => evaluateLicense({ licenseName: "Shutterstock License", price: 0 })).toThrow("unlicensed");
  });

  it("rejects attribution-required licenses without credit", () => {
    expect(() => evaluateLicense({ licenseId: "cc-by-4.0" })).toThrow("attribution_required");
    expect(() => evaluateLicense({ licenseId: "cc-by-3.0", author: "  " })).toThrow("attribution_required");
    expect(evaluateLicense({ licenseId: "cc0-1.0" })).toMatchObject({
      licenseId: "cc0-1.0",
      attributionRequired: false,
    });
    const credited = evaluateLicense({ licenseId: "cc-by-4.0", author: "Ada Lovelace" });
    expect(credited.attribution).toContain("Ada Lovelace");
    expect(credited.licenseUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
  });

  it("does not treat Facebook reference media as stock", () => {
    expect(isForbiddenStockHost("scontent.xx.fbcdn.net")).toBe(true);
    expect(isForbiddenStockHost("www.facebook.com")).toBe(true);
    expect(isForbiddenStockHost("upload.wikimedia.org")).toBe(false);
    expect(() =>
      evaluateLicense({ licenseId: "cc0-1.0", provider: "facebook", provenance: "stock" }),
    ).toThrow("facebook_stock_forbidden");
  });
});

describe("AT-033-02 network boundary", () => {
  it("rejects private IP, unsafe URL, and cross-origin redirect through public-http", async () => {
    await expect(
      ingestAsset(licensedStock({ sourceUrl: "https://127.0.0.1/secret.png" }), deps()),
    ).rejects.toMatchObject({ code: "unsafe_url" });
    await expect(
      searchStock("laptop", "wikimedia", {
        ...deps(),
        fetch: harness([{}], ["10.0.0.1"]).fetch,
      }),
    ).rejects.toMatchObject({ code: "unsafe_address" });
    await expect(
      searchStock("laptop", "wikimedia", {
        ...deps(),
        fetch: harness([{ status: 302, headers: { location: "https://other.example/feed" } }]).fetch,
      }),
    ).rejects.toMatchObject({ code: "redirect_rejected" });
  });

  it("rejects oversize metadata, wrong MIME, and SVG active content", async () => {
    await expect(
      searchStock("laptop", "wikimedia", {
        ...deps(),
        fetch: harness([{ chunks: [Buffer.alloc(5), Buffer.alloc(6)] }]).fetch,
        timeoutMs: 8000,
        maxBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "too_large" });
    await expect(
      ingestAsset(licensedStock({ mime: "image/svg+xml", sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a0/x.svg" }), deps()),
    ).rejects.toMatchObject({ code: "svg_rejected" });
    await expect(
      ingestAsset(
        licensedStock({
          mime: "application/pdf",
          sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a0/doc.pdf",
        }),
        deps(),
      ),
    ).rejects.toMatchObject({ code: "wrong_mime" });
    const svgBody = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>';
    await expect(
      ingestAsset(
        licensedStock({ sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a0/active.png" }),
        deps({
          resolveImage: async () => {
            throw new FreeAssetError("svg_rejected");
          },
          fetch: async () => ({ text: svgBody, finalUrl: "https://upload.wikimedia.org/wikipedia/commons/a/a0/active.png", contentType: "image/svg+xml" }),
        }),
      ),
    ).rejects.toMatchObject({ code: "svg_rejected" });
  });
});

describe("AT-033-03 dedup, timeout, sku isolation", () => {
  it("deduplicates the same bytes on retry and keeps the first provenance", async () => {
    const registry = createMemoryRegistry();
    const shared = deps({ registry });
    const first = await ingestAsset(licensedStock(), shared);
    const second = await ingestAsset(
      licensedStock({
        sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/b/b0/mirror.png",
        id: "b0000000-0000-4000-8000-000000000002",
      }),
      shared,
    );
    expect(second.id).toBe(first.id);
    expect(second.sourceUrl).toBe(first.sourceUrl);
    expect(await registry.listUsable(org)).toHaveLength(1);
    expect(first.contentHash).toBe(pngHash);
  });

  it("bounds provider timeout and does not fall back to another SKU image", async () => {
    vi.useFakeTimers();
    try {
      const registry = createMemoryRegistry();
      await ingestAsset(
        licensedStock({
          provenance: "catalog",
          provider: "catalog",
          skuId: skuB,
          sourceUrl: "https://product.hstatic.net/sku-b.png",
          license: { provenance: "catalog" },
        }),
        deps({
          registry,
          id: () => "b0000000-0000-4000-8000-0000000000bb",
          resolveImage: async () => ({ sha256: "b".repeat(64), mimeType: "image/png", width: 2, height: 2 }),
        }),
      );
      const pending = resolveCampaignMedia(
        {
          organizationId: org,
          campaignKind: "product",
          skuId: skuA,
          catalogCandidates: [{ sourceUrl: "https://product.hstatic.net/sku-b.png", skuId: skuB }],
          stockQuery: "laptop background",
          stockProvider: "wikimedia",
        },
        deps({
          registry,
          fetch: () => Promise.withResolvers<never>().promise,
          timeoutMs: 100,
        }),
      );
      await vi.advanceTimersByTimeAsync(100);
      const result = await pending;
      expect(result).toMatchObject({ kind: "motion-only", reason: "timeout", source: "fallback" });
      expect(JSON.stringify(result)).not.toContain("sku-b.png");
      expect(JSON.stringify(result)).not.toContain(skuB);
    } finally {
      vi.useRealTimers();
    }
  });

});

describe("AT-033-04 license proof is not a successful download", () => {
  it("registers a licensed fixture with source and license, and still rejects downloaded unlicensed bytes", async () => {
    const registry = createMemoryRegistry();
    const licensed = await ingestAsset(licensedStock(), deps({ registry }));
    expect(licensed.status).toBe("usable");
    expect(licensed.licenseId).toBe("cc0-1.0");
    expect(licensed.licenseUrl).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
    expect(licensed.provider).toBe("wikimedia");
    expect(licensed.provenance).toBe("stock");
    expect(licensed.skuId).toBeNull();
    expect(mediaAttribution(licensed)).toMatchObject({
      licenseId: "cc0-1.0",
      sourceUrl: licensed.sourceUrl,
      provider: "wikimedia",
    });
    await expect(
      ingestAsset(
        licensedStock({
          sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/c/c0/unlicensed.png",
          license: { price: 0, licenseName: "free download" },
        }),
        deps({
          registry,
          resolveImage: async () => ({ sha256: "c".repeat(64), mimeType: "image/png", width: 2, height: 2 }),
        }),
      ),
    ).rejects.toMatchObject({ code: "unlicensed" });
    expect(await registry.listUsable(org)).toHaveLength(1);
    const failed = await registry.getByHash(org, pngHash);
    expect(failed?.licenseId).toBe("cc0-1.0");
  });

  it("keeps catalog provenance distinct from stock and never labels generic stock as a SKU", async () => {
    const registry = createMemoryRegistry();
    const catalog = await ingestAsset(
      licensedStock({
        provenance: "catalog",
        provider: "catalog",
        skuId: skuA,
        sourceUrl: "https://product.hstatic.net/sku-a.png",
        license: { provenance: "catalog" },
      }),
      deps({ registry, id: () => "b0000000-0000-4000-8000-0000000000aa" }),
    );
    expect(catalog.provenance).toBe("catalog");
    expect(catalog.skuId).toBe(skuA);
    expect(catalog.licenseId).toBe("catalog");
    const stock = await ingestAsset(
      licensedStock({
        sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/d/d0/generic.png",
        skuId: skuA,
      }),
      deps({
        registry,
        id: () => "b0000000-0000-4000-8000-0000000000cc",
        resolveImage: async () => ({ sha256: "d".repeat(64), mimeType: "image/png", width: 2, height: 2 }),
      }),
    );
    expect(stock.provenance).toBe("stock");
    expect(stock.skuId).toBeNull();
    const selected = await resolveCampaignMedia(
      { organizationId: org, campaignKind: "product", skuId: skuA },
      deps({ registry }),
    );
    expect(selected).toMatchObject({ kind: "catalog", asset: expect.objectContaining({ skuId: skuA, provenance: "catalog" }) });
  });

  it("fails closed on missing Pexels/Unsplash keys without inventing licensed hits", async () => {
    const pexels = searchStock("laptop", "pexels", deps({ keys: {} }));
    await expect(pexels).rejects.toBeInstanceOf(FreeAssetError);
    await expect(pexels).rejects.toMatchObject({ code: "missing_provider_key", detail: "PEXELS_API_KEY" });
    await expect(searchStock("laptop", "unsplash", deps({ keys: { PEXELS_API_KEY: "present" } }))).rejects.toMatchObject({
      code: "missing_provider_key",
      detail: "UNSPLASH_ACCESS_KEY",
    });
  });

  it("parses Wikimedia license metadata and drops unlicensed or SVG hits", async () => {
    const body = JSON.stringify({
      query: {
        pages: {
          "1": {
            title: "File:Good.jpg",
            imageinfo: [
              {
                url: "https://upload.wikimedia.org/wikipedia/commons/g/g0/Good.jpg",
                mime: "image/jpeg",
                size: 1200,
                width: 16,
                height: 12,
                extmetadata: {
                  LicenseShortName: { value: "CC0" },
                  LicenseUrl: { value: "https://creativecommons.org/publicdomain/zero/1.0/" },
                  Artist: { value: "<a href=\"https://commons.wikimedia.org/wiki/User:Ada\">Ada</a>" },
                  AttributionRequired: { value: "false" },
                },
              },
            ],
          },
          "2": {
            title: "File:Paid.jpg",
            imageinfo: [
              {
                url: "https://upload.wikimedia.org/wikipedia/commons/p/p0/Paid.jpg",
                mime: "image/jpeg",
                extmetadata: { LicenseShortName: { value: "Fair use" } },
              },
            ],
          },
          "3": {
            title: "File:Active.svg",
            imageinfo: [
              {
                url: "https://upload.wikimedia.org/wikipedia/commons/s/s0/Active.svg",
                mime: "image/svg+xml",
                extmetadata: {
                  LicenseShortName: { value: "CC BY 4.0" },
                  LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
                  Artist: { value: "Ada" },
                },
              },
            ],
          },
        },
      },
    });
    const hits = await searchStock("laptop", "wikimedia", {
      ...deps(),
      fetch: async () => ({ text: body, finalUrl: "https://commons.wikimedia.org/w/api.php", contentType: "application/json" }),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/g/g0/Good.jpg",
      licenseId: "cc0-1.0",
      author: "Ada",
    });
  });

  it("does not select failed, expired, or revoked assets", async () => {
    const registry = createMemoryRegistry();
    const asset = await ingestAsset(licensedStock(), deps({ registry }));
    await registry.updateStatus(org, asset.id, "revoked");
    const selected = await resolveCampaignMedia(
      { organizationId: org, campaignKind: "trend", stockQuery: "laptop", stockProvider: "wikimedia" },
      deps({
        registry,
        fetch: async () => {
          throw new PublicHttpError("timeout");
        },
      }),
    );
    expect(selected.kind).toBe("motion-only");
    expect(await registry.listUsable(org)).toEqual([]);
  });

  it.skipIf(process.env.ONEVOICE_PUBLIC_HTTP_PROOF !== "1")(
    "reads a real public Wikimedia license through the guarded transport",
    async () => {
      const hits = await searchStock("red apple", "wikimedia", deps({ fetch: fetchPublicText }));
      expect(hits.length).toBeGreaterThan(0);
      expect(["cc0-1.0", "cc-by-4.0", "cc-by-3.0", "public-domain"]).toContain(hits[0].licenseId);
      expect(hits[0].sourceUrl.startsWith("https://upload.wikimedia.org/")).toBe(true);
      expect(hits[0].licenseUrl.startsWith("https://")).toBe(true);
      const licensed = evaluateLicense({
        licenseId: hits[0].licenseId,
        author: hits[0].author,
        commercialUse: true,
        price: 0,
      });
      expect(licensed.licenseId).toBe(hits[0].licenseId);
    },
    20000,
  );
});

describe("campaign catalog priority", () => {
  it("prefers the matching catalog image over stock", async () => {
    const registry = createMemoryRegistry();
    await ingestAsset(
      licensedStock({
        provenance: "catalog",
        provider: "catalog",
        skuId: skuA,
        sourceUrl: "https://product.hstatic.net/sku-a.png",
        license: { provenance: "catalog" },
      }),
      deps({ registry, id: () => "b0000000-0000-4000-8000-0000000000aa" }),
    );
    await ingestAsset(
      licensedStock({ sourceUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e0/stock.png" }),
      deps({
        registry,
        id: () => "b0000000-0000-4000-8000-0000000000ee",
        resolveImage: async () => ({ sha256: "e".repeat(64), mimeType: "image/png", width: 2, height: 2 }),
      }),
    );
    const selected = await resolveCampaignMedia(
      { organizationId: org, campaignKind: "product", skuId: skuA },
      deps({ registry }),
    );
    expect(selected).toEqual({
      kind: "catalog",
      asset: expect.objectContaining({ provenance: "catalog", skuId: skuA }) as FreeAsset,
    });
  });
});
