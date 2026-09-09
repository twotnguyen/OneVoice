// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readFile, rm } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { RequestOptions } from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

import type { ResolvedAsset } from "./types";

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const STDERR_LIMIT = 64 * 1024;
const MAX_NORMALIZED_BYTES = 64 * 1024 * 1024;
const MIME_CODECS = {
  "image/jpeg": "mjpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type DnsAddress = Readonly<{ address: string; family: 4 | 6 }>;
type RequestSeam = (url: URL, options: RequestOptions) => Promise<IncomingMessage>;
type ResolverOptions = Readonly<{
  allowedHostnames: readonly string[];
  temporaryRoot: string;
  lookup?: (hostname: string) => Promise<readonly DnsAddress[]>;
  request?: RequestSeam;
  ffmpegPath?: string;
  ffprobePath?: string;
  writeChunk?: (handle: FileHandle, chunk: Buffer) => Promise<unknown>;
}>;

class RemoteContentError extends Error {}
class ResolverConfigurationError extends Error {}
class ResolverLocalError extends Error {}

function defaultRequest(url: URL, options: RequestOptions): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, options, resolve);
    request.on("error", reject);
    request.end();
  });
}

async function defaultLookup(hostname: string): Promise<readonly DnsAddress[]> {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  return addresses
    .filter((address): address is { address: string; family: 4 | 6 } =>
      address.family === 4 || address.family === 6,
    )
    .map(({ address, family }) => ({ address, family }));
}

function hasExplicitPort(value: string): boolean {
  const authority = /^(?:https:)?\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!authority) return false;
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  if (host.startsWith("[")) return host.slice(host.indexOf("]") + 1).startsWith(":");
  return host.includes(":");
}

function ipv4Bytes(address: string): readonly number[] | null {
  if (isIP(address) !== 4) return null;
  const bytes = address.split(".").map(Number);
  return bytes.length === 4 ? bytes : null;
}

function isPublicIpv4(address: string): boolean {
  const bytes = ipv4Bytes(address);
  if (!bytes) return false;
  const [a, b] = bytes;
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88 && bytes[2] === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && bytes[2] === 100) ||
    (a === 203 && b === 0 && bytes[2] === 113) ||
    a >= 224
  ) {
    return false;
  }
  return true;
}

function ipv6Groups(address: string): readonly number[] | null {
  if (isIP(address) !== 6) return null;
  let normalized = address.toLowerCase().split("%", 1)[0];
  const dottedIndex = normalized.lastIndexOf(":");
  if (normalized.includes(".")) {
    const bytes = ipv4Bytes(normalized.slice(dottedIndex + 1));
    if (!bytes) return null;
    normalized = `${normalized.slice(0, dottedIndex)}:${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const zeros = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const textGroups = [...head, ...Array.from({ length: zeros }, () => "0"), ...tail];
  if (textGroups.length !== 8) return null;
  const groups = textGroups.map((group) => Number.parseInt(group, 16));
  return groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff)
    ? groups
    : null;
}

function isPublicIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPublicIpv4(
      `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`,
    );
  }
  const first = groups[0];
  if ((first & 0xe000) !== 0x2000) return false;
  if (
    (first === 0x2001 && groups[1] === 0x0000) ||
    (first === 0x2001 && groups[1] === 0x0002 && groups[2] === 0x0000) ||
    (first === 0x2001 && (groups[1] & 0xfff0) === 0x0010) ||
    (first === 0x2001 && (groups[1] & 0xfff0) === 0x0020) ||
    (first === 0x2001 && groups[1] === 0x0db8) ||
    first === 0x2002 ||
    (first === 0x3fff && (groups[1] & 0xf000) === 0)
  ) {
    return false;
  }
  return true;
}

function isPublicAddress(address: DnsAddress): boolean {
  return address.family === 4 ? isPublicIpv4(address.address) : isPublicIpv6(address.address);
}

type PinnedLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | readonly DnsAddress[],
  family?: number,
) => void;

function pinnedLookup(address: DnsAddress): LookupFunction {
  return ((
    _hostname: string,
    options: { all?: boolean } | PinnedLookupCallback,
    callback?: PinnedLookupCallback,
  ) => {
    const done = typeof options === "function" ? options : callback;
    if (!done) return;
    if (typeof options === "object" && options.all) done(null, [address]);
    else done(null, address.address, address.family);
  }) as LookupFunction;
}

function header(response: IncomingMessage, name: string): string | null {
  const value = response.headers[name];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function drain(response: IncomingMessage): void {
  response.resume();
}

async function runMediaProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, cwd });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= STDERR_LIMIT) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes = Math.min(STDERR_LIMIT, stderrBytes + chunk.length);
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new ResolverConfigurationError());
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout: Buffer.concat(stdout).toString("utf8") });
    });
  });
}

async function normalizeImage(
  executable: string,
  cwd: string,
  writeChunk: (handle: FileHandle, chunk: Buffer) => Promise<unknown>,
): Promise<void> {
  let outputHandle: FileHandle;
  try {
    outputHandle = await open(
      path.join(cwd, "normalized.png"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch {
    throw new ResolverLocalError();
  }
  const child = spawn(
    executable,
    [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "source.bin",
      "-map_metadata",
      "-1",
      "-frames:v",
      "1",
      "-c:v",
      "png",
      "-pix_fmt",
      "rgba",
      "-f",
      "image2pipe",
      "pipe:1",
    ],
    { shell: false, cwd },
  );
  let timedOut = false;
  let stderr = Buffer.alloc(0);
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, TIMEOUT_MS);
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = Buffer.concat([stderr, chunk]);
    if (stderr.length > STDERR_LIMIT) stderr = stderr.subarray(stderr.length - STDERR_LIMIT);
  });
  const completion = new Promise<number | null>((resolve, reject) => {
    child.on("error", () => reject(new ResolverConfigurationError()));
    child.on("close", resolve);
  });

  try {
    let bytes = 0;
    try {
      for await (const value of child.stdout) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
        bytes += chunk.length;
        if (bytes > MAX_NORMALIZED_BYTES) {
          child.kill("SIGKILL");
          throw new RemoteContentError();
        }
        try {
          await writeChunk(outputHandle, chunk);
        } catch {
          child.kill("SIGKILL");
          throw new ResolverLocalError();
        }
      }
    } catch (error) {
      if (error instanceof ResolverLocalError || error instanceof RemoteContentError) throw error;
      throw new RemoteContentError();
    }
    const code = await completion;
    if (timedOut || code !== 0) throw new RemoteContentError();
    try {
      await outputHandle.sync();
    } catch {
      throw new ResolverLocalError();
    }
  } finally {
    clearTimeout(timer);
    await outputHandle.close().catch(() => {
      throw new ResolverLocalError();
    });
  }
}

function validSignature(bytes: Buffer, mimeType: keyof typeof MIME_CODECS): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

export class RemoteImageResolver {
  private readonly allowedHostnames: ReadonlySet<string>;
  private readonly temporaryRoot: string;
  private readonly lookup: (hostname: string) => Promise<readonly DnsAddress[]>;
  private readonly request: RequestSeam;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly writeChunk: (handle: FileHandle, chunk: Buffer) => Promise<unknown>;

  constructor(options: ResolverOptions) {
    this.allowedHostnames = new Set(
      options.allowedHostnames.map((hostname) => hostname.toLowerCase()),
    );
    this.temporaryRoot = path.resolve(options.temporaryRoot);
    this.lookup = options.lookup ?? defaultLookup;
    this.request = options.request ?? defaultRequest;
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? "ffprobe";
    this.writeChunk = options.writeChunk ?? ((handle, chunk) => handle.write(chunk));
  }

  private allowedUrl(value: string, base?: URL): URL | null {
    try {
      if (hasExplicitPort(value)) return null;
      const url = base ? new URL(value, base) : new URL(value);
      if (
        url.protocol !== "https:" ||
        url.port !== "" ||
        !this.allowedHostnames.has(url.hostname.toLowerCase())
      ) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  private async requestHop(url: URL, signal: AbortSignal): Promise<IncomingMessage | null> {
    let addresses: readonly DnsAddress[];
    try {
      addresses = await this.lookup(url.hostname);
    } catch {
      return null;
    }
    if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
      return null;
    }
    try {
      return await this.request(url, {
        method: "GET",
        port: 443,
        servername: url.hostname,
        signal,
        lookup: pinnedLookup(addresses[0]),
      });
    } catch {
      return null;
    }
  }

  private async downloadAndNormalize(
    response: IncomingMessage,
    mimeType: keyof typeof MIME_CODECS,
  ): Promise<ResolvedAsset> {
    let assetDirectory: string | null = null;
    let responseComplete = false;
    try {
      try {
        await mkdir(this.temporaryRoot, { recursive: true, mode: 0o700 });
        const rootDetails = await lstat(this.temporaryRoot);
        if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
          throw new ResolverLocalError();
        }
        assetDirectory = await mkdtemp(path.join(this.temporaryRoot, "asset-"));
        const sourceHandle = await open(
          path.join(assetDirectory, "source.bin"),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
          0o600,
        );
        let bytes = 0;
        try {
          const iterator = response[Symbol.asyncIterator]();
          while (true) {
            let next: IteratorResult<unknown>;
            try {
              next = await iterator.next();
            } catch {
              throw new RemoteContentError();
            }
            if (next.done) {
              responseComplete = true;
              break;
            }
            const value = next.value;
            const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
            bytes += chunk.length;
            if (bytes > MAX_BYTES) {
              response.destroy();
              throw new RemoteContentError();
            }
            try {
              await this.writeChunk(sourceHandle, chunk);
            } catch {
              throw new ResolverLocalError();
            }
          }
          await sourceHandle.sync().catch(() => {
            throw new ResolverLocalError();
          });
        } finally {
          await sourceHandle.close();
        }
      } catch (error) {
        if (error instanceof RemoteContentError) throw error;
        throw new ResolverLocalError();
      }

      const source = await readFile(path.join(assetDirectory, "source.bin")).catch(() => {
        throw new ResolverLocalError();
      });
      if (!validSignature(source, mimeType)) throw new RemoteContentError();
      const probe = await runMediaProcess(
        this.ffprobePath,
        [
          "-v",
          "error",
          "-select_streams",
          "v:0",
          "-show_entries",
          "stream=codec_name,width,height",
          "-of",
          "json",
          "source.bin",
        ],
        assetDirectory,
      );
      if (!probe.ok) throw new RemoteContentError();
      let parsed: { streams?: Array<{ codec_name?: unknown; width?: unknown; height?: unknown }> };
      try {
        parsed = JSON.parse(probe.stdout) as typeof parsed;
      } catch {
        throw new RemoteContentError();
      }
      const stream = parsed.streams?.[0];
      const width = Number(stream?.width);
      const height = Number(stream?.height);
      if (
        stream?.codec_name !== MIME_CODECS[mimeType] ||
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width <= 0 ||
        height <= 0 ||
        width > MAX_DIMENSION ||
        height > MAX_DIMENSION ||
        width * height > MAX_PIXELS
      ) {
        throw new RemoteContentError();
      }

      await normalizeImage(this.ffmpegPath, assetDirectory, this.writeChunk);
      const normalizedPath = path.join(assetDirectory, "normalized.png");
      const normalizedBytes = await readFile(normalizedPath).catch(() => {
        throw new ResolverLocalError();
      });
      if (!validSignature(normalizedBytes, "image/png")) throw new RemoteContentError();
      await rm(path.join(assetDirectory, "source.bin"), { force: true }).catch(() => {
        throw new ResolverLocalError();
      });
      const cleanupDirectory = assetDirectory;
      assetDirectory = null;
      return {
        path: normalizedPath,
        mimeType: "image/png",
        bytes: normalizedBytes.length,
        sha256: createHash("sha256").update(normalizedBytes).digest("hex"),
        cleanup: () => rm(cleanupDirectory, { recursive: true, force: true }),
      };
    } finally {
      if (!responseComplete && !response.destroyed) response.destroy();
      if (assetDirectory) await rm(assetDirectory, { recursive: true, force: true });
    }
  }

  private async validateMediaCapabilities(): Promise<void> {
    const [ffmpeg, ffprobe] = await Promise.all([
      runMediaProcess(this.ffmpegPath, ["-version"], process.cwd()),
      runMediaProcess(this.ffprobePath, ["-version"], process.cwd()),
    ]);
    if (
      !ffmpeg.ok ||
      !ffprobe.ok ||
      !/^ffmpeg version\b/m.test(ffmpeg.stdout) ||
      !/^ffprobe version\b/m.test(ffprobe.stdout)
    ) {
      throw new ResolverConfigurationError();
    }
  }

  async resolve(value: string): Promise<ResolvedAsset | null> {
    let currentUrl = this.allowedUrl(value);
    if (!currentUrl) return null;
    try {
      await this.validateMediaCapabilities();
    } catch {
      throw new Error("Image resolver configuration failed");
    }
    const signal = AbortSignal.timeout(TIMEOUT_MS);

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await this.requestHop(currentUrl, signal);
      if (!response) return null;
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = header(response, "location");
        drain(response);
        if (!location || redirects === MAX_REDIRECTS) return null;
        const redirected = this.allowedUrl(location, currentUrl);
        if (!redirected) return null;
        currentUrl = redirected;
        continue;
      }
      if (status < 200 || status >= 300) {
        drain(response);
        return null;
      }
      const contentType = header(response, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (!contentType || !(contentType in MIME_CODECS)) {
        drain(response);
        return null;
      }
      const declaredLength = Number(header(response, "content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) {
        drain(response);
        return null;
      }
      try {
        return await this.downloadAndNormalize(
          response,
          contentType as keyof typeof MIME_CODECS,
        );
      } catch (error) {
        if (error instanceof RemoteContentError) return null;
        if (error instanceof ResolverConfigurationError) {
          throw new Error("Image resolver configuration failed");
        }
        throw new Error("Image resolver local operation failed");
      }
    }
    return null;
  }
}
