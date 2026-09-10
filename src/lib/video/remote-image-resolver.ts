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
import { tmpdir } from "node:os";
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
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MIME_CODECS = {
  "image/jpeg": "mjpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
const PROBE_ARGS = [
  "-v",
  "error",
  "-select_streams",
  "v:0",
  "-show_entries",
  "stream=codec_name,width,height",
  "-of",
  "json",
  "source.bin",
] as const;
const NORMALIZATION_ARGS = [
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
] as const;
const TRUSTED_IMAGES = [
  {
    mimeType: "image/jpeg",
    bytes: Buffer.from(
      "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYxLjE5LjEwMQD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABgcQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAACAAIDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCLAFF/f//Z",
      "base64",
    ),
  },
  {
    mimeType: "image/png",
    bytes: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEElEQVR4nGP4w8AARAwQCgAfjgPxzzTeXgAAAABJRU5ErkJggg==",
      "base64",
    ),
  },
  {
    mimeType: "image/webp",
    bytes: Buffer.from(
      "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAgA0JaACdLoB+AADsAD+8Oj3/yC5YXXI1/8gP+QH/ID/+PIAAAA=",
      "base64",
    ),
  },
] as const;

type DnsAddress = Readonly<{ address: string; family: 4 | 6 }>;
type RequestSeam = (url: URL, options: RequestOptions) => Promise<IncomingMessage>;
type ResolverOptions = Readonly<{
  allowedHostnames: readonly string[];
  temporaryRoot: string;
  lookup?: (hostname: string) => Promise<readonly DnsAddress[]>;
  request?: RequestSeam;
  ffmpegPath?: string;
  ffprobePath?: string;
  writeChunk?: (handle: FileHandle, chunk: Buffer) => Promise<{ bytesWritten: number }>;
}>;

class RemoteContentError extends Error {}
class MediaProcessNonzeroError extends RemoteContentError {}
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

function matchesIpv6Cidr(
  groups: readonly number[],
  prefix: readonly number[],
  prefixLength: number,
): boolean {
  const completeGroups = Math.floor(prefixLength / 16);
  for (let index = 0; index < completeGroups; index += 1) {
    if (groups[index] !== prefix[index]) return false;
  }
  const remainingBits = prefixLength % 16;
  if (remainingBits === 0) return true;
  const mask = (0xffff << (16 - remainingBits)) & 0xffff;
  return (groups[completeGroups] & mask) === (prefix[completeGroups] & mask);
}

// Snapshot of Status=ALLOCATED rows in the IANA IPv6 Global Unicast Address Space registry:
// https://www.iana.org/assignments/ipv6-unicast-address-assignments/ipv6-unicast-address-assignments.xhtml
// Last reviewed: 2026-09-09. The partially allocated 2001::/23 and 6to4 2002::/16 are
// intentionally rejected wholesale, so neither appears here.
const IANA_ALLOCATED_IPV6_PREFIXES = [
  ["2001:200::", 23],
  ["2001:400::", 23],
  ["2001:600::", 23],
  ["2001:800::", 22],
  ["2001:c00::", 23],
  ["2001:e00::", 23],
  ["2001:1200::", 23],
  ["2001:1400::", 22],
  ["2001:1800::", 23],
  ["2001:1a00::", 23],
  ["2001:1c00::", 22],
  ["2001:2000::", 19],
  ["2001:4000::", 23],
  ["2001:4200::", 23],
  ["2001:4400::", 23],
  ["2001:4600::", 23],
  ["2001:4800::", 23],
  ["2001:4a00::", 23],
  ["2001:4c00::", 23],
  ["2001:5000::", 20],
  ["2001:8000::", 19],
  ["2001:a000::", 20],
  ["2001:b000::", 20],
  ["2003::", 18],
  ["2400::", 12],
  ["2410::", 12],
  ["2600::", 12],
  ["2610::", 23],
  ["2620::", 23],
  ["2630::", 12],
  ["2800::", 12],
  ["2a00::", 12],
  ["2a10::", 12],
  ["2c00::", 12],
] as const;

const ALLOCATED_IPV6_CIDRS = IANA_ALLOCATED_IPV6_PREFIXES.map(([address, prefixLength]) => {
  const groups = ipv6Groups(address);
  if (!groups) throw new Error("Invalid embedded IPv6 registry prefix");
  return { groups, prefixLength };
});

function isPublicIpv6(address: string): boolean {
  const groups = ipv6Groups(address);
  if (!groups) return false;
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPublicIpv4(
      `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`,
    );
  }
  if (matchesIpv6Cidr(groups, ipv6Groups("2001:db8::")!, 32)) return false;
  return ALLOCATED_IPV6_CIDRS.some(({ groups: prefix, prefixLength }) =>
    matchesIpv6Cidr(groups, prefix, prefixLength),
  );
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
): Promise<{
  ok: boolean;
  stdout: Buffer;
  timedOut: boolean;
  signaled: boolean;
  outputExceeded: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, cwd });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    const stopForExcessOutput = () => {
      outputExceeded = true;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > STDERR_LIMIT) stopForExcessOutput();
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes > STDERR_LIMIT) stopForExcessOutput();
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new ResolverConfigurationError());
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && signal === null && !timedOut && !outputExceeded,
        stdout: Buffer.concat(stdout),
        timedOut,
        signaled: signal !== null,
        outputExceeded,
      });
    });
  });
}

async function writeAll(
  handle: FileHandle,
  chunk: Buffer,
  writeChunk: (handle: FileHandle, chunk: Buffer) => Promise<{ bytesWritten: number }>,
): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    let result: { bytesWritten: number };
    try {
      result = await writeChunk(handle, chunk.subarray(offset));
    } catch {
      throw new ResolverLocalError();
    }
    if (
      !result ||
      !Number.isSafeInteger(result.bytesWritten) ||
      result.bytesWritten <= 0 ||
      result.bytesWritten > chunk.length - offset
    ) {
      throw new ResolverLocalError();
    }
    offset += result.bytesWritten;
  }
}

async function normalizeImage(
  executable: string,
  cwd: string,
  writeChunk: (handle: FileHandle, chunk: Buffer) => Promise<{ bytesWritten: number }>,
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
    NORMALIZATION_ARGS,
    { shell: false, cwd },
  );
  let killReason: "normalized-size" | "stderr" | "timeout" | null = null;
  let stderrBytes = 0;
  const timer = setTimeout(() => {
    if (killReason === null) {
      killReason = "timeout";
      child.kill("SIGKILL");
    }
  }, TIMEOUT_MS);
  child.stderr.on("data", (chunk: Buffer) => {
    stderrBytes += chunk.length;
    if (stderrBytes > STDERR_LIMIT && killReason === null) {
      killReason = "stderr";
      child.kill("SIGKILL");
    }
  });
  const completion = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      child.on("error", () => reject(new ResolverConfigurationError()));
      child.on("close", (code, signal) => resolve({ code, signal }));
    },
  );

  try {
    let bytes = 0;
    try {
      for await (const value of child.stdout) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
        bytes += chunk.length;
        if (bytes > MAX_NORMALIZED_BYTES) {
          if (killReason === null) {
            killReason = "normalized-size";
            child.kill("SIGKILL");
          }
          break;
        }
        try {
          await writeAll(outputHandle, chunk, writeChunk);
        } catch (error) {
          child.kill("SIGKILL");
          if (error instanceof ResolverLocalError) throw error;
          throw new ResolverLocalError();
        }
      }
    } catch (error) {
      if (
        error instanceof ResolverLocalError ||
        error instanceof ResolverConfigurationError ||
        error instanceof RemoteContentError
      ) {
        throw error;
      }
      throw new RemoteContentError();
    }
    const { code, signal } = await completion;
    if (killReason === "normalized-size") throw new RemoteContentError();
    if (killReason !== null || signal !== null) {
      throw new ResolverConfigurationError();
    }
    if (code !== 0) throw new MediaProcessNonzeroError();
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
    return bytes.subarray(0, 8).equals(PNG_SIGNATURE);
  }
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

async function probeImage(
  executable: string,
  cwd: string,
): Promise<{ codecName: unknown; width: number; height: number }> {
  const probe = await runMediaProcess(executable, PROBE_ARGS, cwd);
  if (probe.timedOut || probe.signaled || probe.outputExceeded) {
    throw new ResolverConfigurationError();
  }
  if (!probe.ok) throw new MediaProcessNonzeroError();
  let parsed: { streams?: Array<{ codec_name?: unknown; width?: unknown; height?: unknown }> };
  try {
    parsed = JSON.parse(probe.stdout.toString("utf8")) as typeof parsed;
  } catch {
    throw new RemoteContentError();
  }
  const stream = parsed.streams?.[0];
  return {
    codecName: stream?.codec_name,
    width: Number(stream?.width),
    height: Number(stream?.height),
  };
}

export class RemoteImageResolver {
  private readonly allowedHostnames: ReadonlySet<string>;
  private readonly temporaryRoot: string;
  private readonly lookup: (hostname: string) => Promise<readonly DnsAddress[]>;
  private readonly request: RequestSeam;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly writeChunk: (
    handle: FileHandle,
    chunk: Buffer,
  ) => Promise<{ bytesWritten: number }>;
  private capabilityValidation?: Promise<void>;

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
        url.username !== "" ||
        url.password !== "" ||
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
              await writeAll(sourceHandle, chunk, this.writeChunk);
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
      const { codecName, width, height } = await probeImage(this.ffprobePath, assetDirectory);
      if (
        codecName !== MIME_CODECS[mimeType] ||
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
    let capabilityDirectory: string | null = null;
    try {
      capabilityDirectory = await mkdtemp(path.join(tmpdir(), "onevoice-media-capability-"));
      for (const { mimeType, bytes } of TRUSTED_IMAGES) {
        const fixtureDirectory = path.join(
          /* turbopackIgnore: true */ capabilityDirectory,
          MIME_CODECS[mimeType],
        );
        await mkdir(fixtureDirectory, { mode: 0o700 });
        const sourceHandle = await open(
          path.join(fixtureDirectory, "source.bin"),
          constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
          0o600,
        );
        try {
          await writeAll(sourceHandle, bytes, (target, chunk) => target.write(chunk));
          await sourceHandle.sync();
        } finally {
          await sourceHandle.close();
        }
        const probe = await probeImage(this.ffprobePath, fixtureDirectory);
        if (
          probe.codecName !== MIME_CODECS[mimeType] ||
          probe.width !== 2 ||
          probe.height !== 2
        ) {
          throw new ResolverConfigurationError();
        }
        await normalizeImage(
          this.ffmpegPath,
          fixtureDirectory,
          (target, chunk) => target.write(chunk),
        );
        const normalized = await readFile(path.join(fixtureDirectory, "normalized.png"));
        if (!validSignature(normalized, "image/png")) {
          throw new ResolverConfigurationError();
        }
      }
    } catch {
      throw new ResolverConfigurationError();
    } finally {
      if (capabilityDirectory) {
        await rm(capabilityDirectory, { recursive: true, force: true }).catch(() => {
          throw new ResolverConfigurationError();
        });
      }
    }
  }

  private ensureMediaCapabilities(): Promise<void> {
    if (!this.capabilityValidation) {
      const validation = this.validateMediaCapabilities();
      this.capabilityValidation = validation.catch((error: unknown) => {
        this.capabilityValidation = undefined;
        throw error;
      });
    }
    return this.capabilityValidation;
  }

  private async revalidateMediaCapabilities(): Promise<void> {
    this.capabilityValidation = undefined;
    await this.ensureMediaCapabilities();
  }

  async resolve(value: string): Promise<ResolvedAsset | null> {
    let currentUrl = this.allowedUrl(value);
    if (!currentUrl) return null;
    try {
      await this.ensureMediaCapabilities();
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
        if (error instanceof MediaProcessNonzeroError) {
          try {
            await this.revalidateMediaCapabilities();
          } catch {
            throw new Error("Image resolver configuration failed");
          }
          return null;
        }
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
