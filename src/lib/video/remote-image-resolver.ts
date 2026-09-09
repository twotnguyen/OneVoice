// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";

import type { ResolvedAsset } from "./types";

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type ResolverOptions = Readonly<{
  allowedHostnames: readonly string[];
  temporaryRoot: string;
  fetch?: typeof fetch;
}>;

export class RemoteImageResolver {
  private readonly allowedHostnames: ReadonlySet<string>;
  private readonly temporaryRoot: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ResolverOptions) {
    this.allowedHostnames = new Set(
      options.allowedHostnames.map((hostname) => hostname.toLowerCase()),
    );
    this.temporaryRoot = path.resolve(options.temporaryRoot);
    this.fetchImpl = options.fetch ?? fetch;
  }

  private allowedUrl(value: string | URL): URL | null {
    try {
      const url = value instanceof URL ? value : new URL(value);
      if (url.protocol !== "https:" || !this.allowedHostnames.has(url.hostname.toLowerCase())) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  async resolve(value: string): Promise<ResolvedAsset | null> {
    let currentUrl = this.allowedUrl(value);
    if (!currentUrl) return null;

    let assetDirectory: string | null = null;
    try {
      const signal = AbortSignal.timeout(TIMEOUT_MS);
      let response: Response | null = null;

      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        response = await this.fetchImpl(currentUrl, { redirect: "manual", signal });
        if (response.url && !this.allowedUrl(response.url)) return null;

        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) return null;
        currentUrl = this.allowedUrl(new URL(location, currentUrl));
        if (!currentUrl) return null;
      }

      if (!response?.ok || !response.body) return null;
      const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (!mimeType || !(mimeType in MIME_EXTENSIONS)) return null;
      const typedMime = mimeType as keyof typeof MIME_EXTENSIONS;
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) return null;

      await mkdir(this.temporaryRoot, { recursive: true, mode: 0o700 });
      assetDirectory = await mkdtemp(path.join(this.temporaryRoot, "asset-"));
      const assetPath = path.join(
        assetDirectory,
        `${randomUUID()}.${MIME_EXTENSIONS[typedMime]}`,
      );
      const file = await open(assetPath, "wx", 0o600);
      const reader = response.body.getReader();
      const digest = createHash("sha256");
      let bytes = 0;

      try {
        while (true) {
          const { done, value: chunk } = await reader.read();
          if (done) break;
          bytes += chunk.byteLength;
          if (bytes > MAX_BYTES) throw new Error("Image exceeds byte limit");
          digest.update(chunk);
          await file.write(chunk);
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        await file.close();
      }

      const cleanupDirectory = assetDirectory;
      assetDirectory = null;
      return {
        path: assetPath,
        mimeType: typedMime,
        bytes,
        sha256: digest.digest("hex"),
        cleanup: () => rm(cleanupDirectory, { recursive: true, force: true }),
      };
    } catch {
      return null;
    } finally {
      if (assetDirectory) {
        await rm(assetDirectory, { recursive: true, force: true });
      }
    }
  }
}
