// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import type { LookupFunction } from "node:net";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { RemoteImageResolver } from "./remote-image-resolver";

const roots: string[] = [];
const publicAddress = { address: "93.184.216.34", family: 4 as const };

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "onevoice-resolver-test-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fakeResponse(
  body: Uint8Array = new Uint8Array(),
  statusCode = 200,
  headers: Record<string, string> = {},
): IncomingMessage {
  return Object.assign(Readable.from(body.length ? [body] : []), { statusCode, headers }) as IncomingMessage;
}

async function run(executable: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { shell: false });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} exited with ${code}`));
    });
  });
}

async function imageFixture(
  root: string,
  extension: "jpg" | "png" | "webp",
  size = "16x12",
): Promise<Buffer> {
  const fixturePath = path.join(root, `fixture-${size.replace("x", "-")}.${extension}`);
  await run("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=red:s=${size}`,
    "-frames:v",
    "1",
    "-y",
    fixturePath,
  ]);
  return readFile(fixturePath);
}

type RequestSeam = (url: URL, options: RequestOptions) => Promise<IncomingMessage>;

function resolverOptions(
  temporaryRoot: string,
  request: RequestSeam,
  lookup: (hostname: string) => Promise<readonly { address: string; family: 4 | 6 }[]> =
    async () => [publicAddress],
) {
  return { allowedHostnames: ["images.example.com"], temporaryRoot, request, lookup };
}

describe("RemoteImageResolver transport", () => {
  it("rejects non-HTTPS, alternate ports, and non-allowlisted URLs before DNS or requests", async () => {
    let lookupCalls = 0;
    let requestCalls = 0;
    const resolver = new RemoteImageResolver(
      resolverOptions(
        await temporaryRoot(),
        async () => {
          requestCalls += 1;
          return fakeResponse();
        },
        async () => {
          lookupCalls += 1;
          return [publicAddress];
        },
      ) as never,
    );

    await expect(resolver.resolve("http://images.example.com/a.jpg")).resolves.toBeNull();
    await expect(resolver.resolve("https://images.example.com:444/a.jpg")).resolves.toBeNull();
    await expect(resolver.resolve("https://evil.example/a.jpg")).resolves.toBeNull();
    expect({ lookupCalls, requestCalls }).toEqual({ lookupCalls: 0, requestCalls: 0 });
  });

  it.each([
    "0.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "2001:db8::1",
    "2001:2::1",
    "2001:10::1",
    "2001:20::1",
    "2001::1",
    "2002::1",
    "3fff::1",
    "3ffe::1",
    "3000::1",
    "2001:100::1",
    "2001:1000::1",
    "2003:4000::1",
    "2420::1",
    "2611::1",
    "2c10::1",
    "4000::1",
    "64:ff9b:1::1",
    "::ffff:127.0.0.1",
  ])("rejects non-public DNS address %s before requesting", async (address) => {
    let lookupCalls = 0;
    let requestCalls = 0;
    const family = address.includes(":") ? 6 : 4;
    const resolver = new RemoteImageResolver(
      resolverOptions(
        await temporaryRoot(),
        async () => {
          requestCalls += 1;
          return fakeResponse();
        },
        async () => {
          lookupCalls += 1;
          return [{ address, family } as { address: string; family: 4 | 6 }];
        },
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/a.jpg")).resolves.toBeNull();
    expect(lookupCalls).toBe(1);
    expect(requestCalls).toBe(0);
  });

  it("accepts a representative global-unicast IPv6 address", async () => {
    let requestCalls = 0;
    const resolver = new RemoteImageResolver(
      resolverOptions(
        await temporaryRoot(),
        async () => {
          requestCalls += 1;
          return fakeResponse(new Uint8Array(), 404);
        },
        async () => [{ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 }],
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/a.png")).resolves.toBeNull();
    expect(requestCalls).toBe(1);
  });

  it("classifies a public IPv4-mapped IPv6 address through the IPv4 policy", async () => {
    let requestCalls = 0;
    const resolver = new RemoteImageResolver(
      resolverOptions(
        await temporaryRoot(),
        async () => {
          requestCalls += 1;
          return fakeResponse(new Uint8Array(), 404);
        },
        async () => [{ address: "::ffff:93.184.216.34", family: 6 }],
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/a.png")).resolves.toBeNull();
    expect(requestCalls).toBe(1);
  });

  it("accepts every allocated IANA global-unicast prefix", async () => {
    const addresses = [
      "2001:200::1",
      "2001:400::1",
      "2001:600::1",
      "2001:800::1",
      "2001:c00::1",
      "2001:e00::1",
      "2001:1200::1",
      "2001:1400::1",
      "2001:1800::1",
      "2001:1a00::1",
      "2001:1c00::1",
      "2001:2000::1",
      "2001:4000::1",
      "2001:4200::1",
      "2001:4400::1",
      "2001:4600::1",
      "2001:4800::1",
      "2001:4a00::1",
      "2001:4c00::1",
      "2001:5000::1",
      "2001:8000::1",
      "2001:a000::1",
      "2001:b000::1",
      "2003::1",
      "2400::1",
      "2410::1",
      "2600::1",
      "2610::1",
      "2620::1",
      "2630::1",
      "2800::1",
      "2a00::1",
      "2a10::1",
      "2c00::1",
    ];
    let address = addresses[0];
    let requestCalls = 0;
    const resolver = new RemoteImageResolver(
      resolverOptions(
        await temporaryRoot(),
        async () => {
          requestCalls += 1;
          return fakeResponse(new Uint8Array(), 404);
        },
        async () => [{ address, family: 6 }],
      ) as never,
    );

    for (address of addresses) {
      await expect(resolver.resolve("https://images.example.com/a.png")).resolves.toBeNull();
    }
    expect(requestCalls).toBe(addresses.length);
  });

  it("rejects a hop if any resolved address is non-public", async () => {
    let requestCalls = 0;
    const resolver = new RemoteImageResolver(
      resolverOptions(
        await temporaryRoot(),
        async () => {
          requestCalls += 1;
          return fakeResponse();
        },
        async () => [publicAddress, { address: "127.0.0.1", family: 4 }],
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/a.jpg")).resolves.toBeNull();
    expect(requestCalls).toBe(0);
  });

  it("pins the validated address in the TLS request while preserving host and SNI", async () => {
    const fixtureRoot = await temporaryRoot();
    const png = await imageFixture(fixtureRoot, "png");
    let requestCalls = 0;
    const request: RequestSeam = async (url, options) => {
      requestCalls += 1;
      expect(url.hostname).toBe("images.example.com");
      expect(options.servername).toBe("images.example.com");
      expect(options.port).toBe(443);
      expect(options.signal).toBeInstanceOf(AbortSignal);
      const pinned = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        const lookup = options.lookup as LookupFunction;
        lookup("images.example.com", {}, (error, address, family) => {
          if (error) reject(error);
          else resolve({ address: address as string, family: family as number });
        });
      });
      expect(pinned).toEqual(publicAddress);
      return fakeResponse(png, 200, { "content-type": "image/png" });
    };
    const resolver = new RemoteImageResolver(
      resolverOptions(path.join(fixtureRoot, "assets"), request) as never,
    );

    const asset = await resolver.resolve("https://images.example.com/a.png");

    expect(requestCalls).toBe(1);
    expect(asset).toMatchObject({
      mimeType: "image/png",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      bytes: expect.any(Number),
    });
    expect(path.basename(asset!.path)).toBe("normalized.png");
    expect((await readFile(asset!.path)).subarray(1, 4).toString()).toBe("PNG");
    await asset!.cleanup();
  });

  it("re-resolves redirects, rejects a rebound target, and drains the redirect response", async () => {
    let lookups = 0;
    let requests = 0;
    let resumed = 0;
    const redirect = fakeResponse(new Uint8Array([1, 2, 3]), 302, {
      location: "https://images.example.com/final.jpg",
    });
    const originalResume = redirect.resume.bind(redirect);
    redirect.resume = () => {
      resumed += 1;
      return originalResume();
    };
    const resolver = new RemoteImageResolver(
      resolverOptions(
        await temporaryRoot(),
        async () => {
          requests += 1;
          return redirect;
        },
        async () => {
          lookups += 1;
          return lookups === 1 ? [publicAddress] : [{ address: "127.0.0.1", family: 4 }];
        },
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/start.jpg")).resolves.toBeNull();
    expect({ lookups, requests, resumed }).toEqual({ lookups: 2, requests: 1, resumed: 1 });
  });
});

describe("RemoteImageResolver content boundary", () => {
  it.each([
    ["jpg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"],
  ] as const)("decodes a real %s and returns one normalized PNG", async (extension, mimeType) => {
    const root = await temporaryRoot();
    const fixture = await imageFixture(root, extension);
    const resolver = new RemoteImageResolver(
      resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(fixture, 200, { "content-type": mimeType }),
      ) as never,
    );

    const asset = await resolver.resolve(`https://images.example.com/a.${extension}`);

    expect(asset?.mimeType).toBe("image/png");
    expect(asset?.bytes).toBeGreaterThan(8);
    expect((await readFile(asset!.path)).subarray(1, 4).toString()).toBe("PNG");
    await asset!.cleanup();
    await expect(readdir(path.join(root, "assets"))).resolves.toEqual([]);
  });

  it("rejects a MIME/codec mismatch and drains invalid responses", async () => {
    const root = await temporaryRoot();
    const jpeg = await imageFixture(root, "jpg");
    const resolver = new RemoteImageResolver(
      resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(jpeg, 200, { "content-type": "image/png" }),
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/mismatch.png")).resolves.toBeNull();
    await expect(readdir(path.join(root, "assets"))).resolves.toEqual([]);
  });

  it("rejects truncated image content", async () => {
    const root = await temporaryRoot();
    const png = await imageFixture(root, "png");
    const resolver = new RemoteImageResolver(
      resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(png.subarray(0, 12), 200, { "content-type": "image/png" }),
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/truncated.png")).resolves.toBeNull();
  });

  it("rejects images beyond the dimension limit", async () => {
    const root = await temporaryRoot();
    const png = await imageFixture(root, "png", "8194x2");
    const resolver = new RemoteImageResolver(
      resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(png, 200, { "content-type": "image/png" }),
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/wide.png")).resolves.toBeNull();
  });

  it("enforces the eight MiB streaming cap and removes partial files", async () => {
    const root = await temporaryRoot();
    const oversized = Buffer.alloc(8 * 1024 * 1024 + 1);
    const resolver = new RemoteImageResolver(
      resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(oversized, 200, { "content-type": "image/png" }),
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/large.png")).resolves.toBeNull();
    await expect(readdir(path.join(root, "assets"))).resolves.toEqual([]);
  });

  it("treats a response stream failure as a remote fallback and removes partial files", async () => {
    const root = await temporaryRoot();
    const response = new Readable({
      read() {
        this.push(Buffer.from([137, 80, 78, 71]));
        this.destroy(new Error("remote connection reset"));
      },
    });
    Object.assign(response, {
      statusCode: 200,
      headers: { "content-type": "image/png" },
    });
    const resolver = new RemoteImageResolver(
      resolverOptions(path.join(root, "assets"), async () => response as IncomingMessage) as never,
    );

    await expect(resolver.resolve("https://images.example.com/reset.png")).resolves.toBeNull();
    await expect(readdir(path.join(root, "assets"))).resolves.toEqual([]);
  });

  it("returns null for remote status failures and drains their bodies", async () => {
    let resumed = 0;
    const response = fakeResponse(new Uint8Array([1, 2, 3]), 404);
    const originalResume = response.resume.bind(response);
    response.resume = () => {
      resumed += 1;
      return originalResume();
    };
    const resolver = new RemoteImageResolver(
      resolverOptions(await temporaryRoot(), async () => response) as never,
    );

    await expect(resolver.resolve("https://images.example.com/missing.png")).resolves.toBeNull();
    expect(resumed).toBe(1);
  });

  it("rethrows local temporary-root failures as safe operational errors", async () => {
    const root = await temporaryRoot();
    const rootFile = path.join(root, "not-a-directory");
    await writeFile(rootFile, "file");
    const png = await imageFixture(root, "png");
    const response = fakeResponse(png, 200, { "content-type": "image/png" });
    const resolver = new RemoteImageResolver(
      resolverOptions(
        rootFile,
        async () => response,
      ) as never,
    );

    await expect(resolver.resolve("https://images.example.com/a.png")).rejects.toThrow(
      "Image resolver local operation failed",
    );
    expect(response.destroyed).toBe(true);
  });

  it("destroys the response when a local chunk write fails", async () => {
    const root = await temporaryRoot();
    const png = await imageFixture(root, "png");
    const response = fakeResponse(png, 200, { "content-type": "image/png" });
    const options = {
      ...resolverOptions(path.join(root, "assets"), async () => response),
      writeChunk: async () => {
        throw new Error("simulated local disk failure");
      },
    };
    const resolver = new RemoteImageResolver(options as never);

    await expect(resolver.resolve("https://images.example.com/a.png")).rejects.toThrow(
      "Image resolver local operation failed",
    );
    expect(response.destroyed).toBe(true);
    await expect(readdir(path.join(root, "assets"))).resolves.toEqual([]);
  });

  it("completes partial normalized-output writes", async () => {
    const root = await temporaryRoot();
    const png = await imageFixture(root, "png");
    let sourceHandle: object | undefined;
    let partialWrites = 0;
    const resolver = new RemoteImageResolver({
      ...resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(png, 200, { "content-type": "image/png" }),
      ),
      writeChunk: async (handle: FileHandle, chunk: Buffer) => {
        sourceHandle ??= handle;
        if (handle === sourceHandle) return handle.write(chunk);
        partialWrites += 1;
        return handle.write(chunk.subarray(0, Math.min(3, chunk.length)));
      },
    } as never);

    const asset = await resolver.resolve("https://images.example.com/a.png");

    expect(partialWrites).toBeGreaterThan(1);
    expect((await readFile(asset!.path)).subarray(0, 8)).toEqual(png.subarray(0, 8));
    await run("ffprobe", ["-v", "error", asset!.path]);
    await asset!.cleanup();
  });

  it("rethrows zero-progress normalized-output writes as a safe local error", async () => {
    const root = await temporaryRoot();
    const png = await imageFixture(root, "png");
    let sourceHandle: object | undefined;
    const resolver = new RemoteImageResolver({
      ...resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(png, 200, { "content-type": "image/png" }),
      ),
      writeChunk: async (handle: FileHandle, chunk: Buffer) => {
        sourceHandle ??= handle;
        if (handle === sourceHandle) return handle.write(chunk);
        return { bytesWritten: 0, buffer: chunk };
      },
    } as never);

    await expect(resolver.resolve("https://images.example.com/a.png")).rejects.toThrow(
      "Image resolver local operation failed",
    );
    await expect(readdir(path.join(root, "assets"))).resolves.toEqual([]);
  });

  it("rethrows missing decoder configuration as a safe operational error", async () => {
    const root = await temporaryRoot();
    const png = await imageFixture(root, "png");
    const options = {
      ...resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(png, 200, { "content-type": "image/png" }),
      ),
      ffprobePath: path.join(root, "missing-ffprobe"),
    };
    const resolver = new RemoteImageResolver(options as never);

    await expect(resolver.resolve("https://images.example.com/a.png")).rejects.toThrow(
      "Image resolver configuration failed",
    );
  });

  it.each([
    ["ffmpegPath", "/usr/bin/false"],
    ["ffmpegPath", "/usr/bin/true"],
    ["ffprobePath", "/usr/bin/false"],
    ["ffprobePath", "/usr/bin/true"],
  ] as const)("rejects a wrong or nonworking %s before remote decoding", async (field, executable) => {
    const root = await temporaryRoot();
    const png = await imageFixture(root, "png");
    const options = {
      ...resolverOptions(
        path.join(root, "assets"),
        async () => fakeResponse(png, 200, { "content-type": "image/png" }),
      ),
      [field]: executable,
    };
    const resolver = new RemoteImageResolver(options as never);

    await expect(resolver.resolve("https://images.example.com/a.png")).rejects.toThrow(
      "Image resolver configuration failed",
    );
  });

  it.each([
    ["ffmpegPath", "ffmpeg"],
    ["ffprobePath", "ffprobe"],
  ] as const)("rejects a banner-spoofing %s before making a request", async (field, binary) => {
    const root = await temporaryRoot();
    const executable = path.join(root, `${binary}-spoof`);
    await writeFile(
      executable,
      `#!/bin/sh\nif [ "$1" = "-version" ]; then echo "${binary} version spoof"; exit 0; fi\nexit 1\n`,
    );
    await chmod(executable, 0o700);
    let requestCalls = 0;
    const resolver = new RemoteImageResolver({
      ...resolverOptions(path.join(root, "assets"), async () => {
        requestCalls += 1;
        return fakeResponse();
      }),
      [field]: executable,
    } as never);

    await expect(resolver.resolve("https://images.example.com/a.png")).rejects.toThrow(
      "Image resolver configuration failed",
    );
    expect(requestCalls).toBe(0);
    await writeFile(executable, `#!/bin/sh\nexec ${binary} "$@"\n`);
    await expect(resolver.resolve("https://images.example.com/a.png")).resolves.toBeNull();
    expect(requestCalls).toBe(1);
    await writeFile(executable, "#!/bin/sh\nexit 1\n");
    await expect(resolver.resolve("https://images.example.com/a.png")).resolves.toBeNull();
    expect(requestCalls).toBe(2);
  });

  it("rethrows a runtime decoder signal after a successful capability smoke test", async () => {
    const root = await temporaryRoot();
    const executable = path.join(root, "ffmpeg-wrapper");
    await writeFile(executable, '#!/bin/sh\nexec ffmpeg "$@"\n');
    await chmod(executable, 0o700);
    const png = await imageFixture(root, "png");
    let response = fakeResponse(new Uint8Array(), 404);
    const resolver = new RemoteImageResolver({
      ...resolverOptions(path.join(root, "assets"), async () => response),
      ffmpegPath: executable,
    } as never);
    await expect(resolver.resolve("https://images.example.com/a.png")).resolves.toBeNull();
    await writeFile(executable, "#!/bin/sh\nkill -TERM $$\n");
    response = fakeResponse(png, 200, { "content-type": "image/png" });

    await expect(resolver.resolve("https://images.example.com/a.png")).rejects.toThrow(
      "Image resolver configuration failed",
    );
  });
});
