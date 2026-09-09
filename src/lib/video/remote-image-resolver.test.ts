// SPDX-License-Identifier: Apache-2.0

import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RemoteImageResolver } from "./remote-image-resolver";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "onevoice-resolver-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("RemoteImageResolver", () => {
  it("rejects non-HTTPS and non-allowlisted URLs before fetching", async () => {
    let calls = 0;
    const resolver = new RemoteImageResolver({
      allowedHostnames: ["images.example.com"],
      temporaryRoot: await temporaryRoot(),
      fetch: async () => {
        calls += 1;
        return new Response();
      },
    });

    await expect(resolver.resolve("http://images.example.com/a.jpg")).resolves.toBeNull();
    await expect(resolver.resolve("https://evil.example/a.jpg")).resolves.toBeNull();
    await expect(resolver.resolve("not a url")).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  it("manually revalidates the final URL after a redirect", async () => {
    const seen: string[] = [];
    const resolver = new RemoteImageResolver({
      allowedHostnames: ["images.example.com"],
      temporaryRoot: await temporaryRoot(),
      fetch: async (input, init) => {
        seen.push(String(input));
        expect(init?.redirect).toBe("manual");
        return new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/private.jpg" },
        });
      },
    });

    await expect(resolver.resolve("https://images.example.com/start")).resolves.toBeNull();
    expect(seen).toEqual(["https://images.example.com/start"]);
  });

  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "stores a bounded %s image below the temporary root and cleans it up",
    async (mimeType) => {
      const root = await temporaryRoot();
      const resolver = new RemoteImageResolver({
        allowedHostnames: ["images.example.com"],
        temporaryRoot: root,
        fetch: async (_input, init) => {
          expect(init?.signal).toBeInstanceOf(AbortSignal);
          return new Response(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-type": `${mimeType}; charset=binary` },
          });
        },
      });

      const asset = await resolver.resolve("https://images.example.com/../../escape.jpg");

      expect(asset).toMatchObject({
        mimeType,
        bytes: 4,
        sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
      });
      expect(path.relative(root, asset!.path)).not.toMatch(/^\.\.(?:[/\\]|$)/);
      expect(path.basename(asset!.path)).toMatch(/^[0-9a-f-]+\.(?:jpg|png|webp)$/);

      await asset!.cleanup();
      await expect(readdir(root)).resolves.toEqual([]);
    },
  );

  it("returns null for disallowed MIME types and removes temporary files", async () => {
    const root = await temporaryRoot();
    const resolver = new RemoteImageResolver({
      allowedHostnames: ["images.example.com"],
      temporaryRoot: root,
      fetch: async () => new Response("svg", { headers: { "content-type": "image/svg+xml" } }),
    });

    await expect(resolver.resolve("https://images.example.com/a.svg")).resolves.toBeNull();
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("enforces the streaming byte cap and cleans partial output", async () => {
    const root = await temporaryRoot();
    const chunk = new Uint8Array(4 * 1024 * 1024);
    const resolver = new RemoteImageResolver({
      allowedHostnames: ["images.example.com"],
      temporaryRoot: root,
      fetch: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(chunk);
              controller.enqueue(chunk);
              controller.enqueue(new Uint8Array([1]));
              controller.close();
            },
          }),
          { headers: { "content-type": "image/png" } },
        ),
    });

    await expect(resolver.resolve("https://images.example.com/large.png")).resolves.toBeNull();
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("uses a ten-second abort signal by default", async () => {
    const root = await temporaryRoot();
    const originalTimeout = AbortSignal.timeout;
    let timeout: number | undefined;
    AbortSignal.timeout = ((milliseconds: number) => {
      timeout = milliseconds;
      return originalTimeout(milliseconds);
    }) as typeof AbortSignal.timeout;

    try {
      const resolver = new RemoteImageResolver({
        allowedHostnames: ["images.example.com"],
        temporaryRoot: root,
        fetch: async () => new Response(null, { status: 404 }),
      });
      await resolver.resolve("https://images.example.com/missing.jpg");
    } finally {
      AbortSignal.timeout = originalTimeout;
    }

    expect(timeout).toBe(10_000);
  });
});
