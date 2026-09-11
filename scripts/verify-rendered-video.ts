// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { lstat, open, realpath, readFile } from "node:fs/promises";
import path from "node:path";

const FFPROBE_TIMEOUT_MS = 10_000;
const PROCESS_OUTPUT_LIMIT_BYTES = 64 * 1024;
const LOCAL_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const MP4_MAJOR_BRANDS = new Set(["isom", "iso2", "mp41", "mp42", "avc1"]);
// Khớp PROBE_TOLERANCE_MS của template-video-renderer (duration trong ±250 ms).
const DEFAULT_TEMPLATE_TOLERANCE_MS = 250;
// Gate legacy cho bàn video local 12s: 11.5–12.5 giây.
const LEGACY_MIN_DURATION_S = 11.5;
const LEGACY_MAX_DURATION_S = 12.5;

type FailureCode =
  | "FFPROBE_UNAVAILABLE"
  | "FFPROBE_TIMEOUT"
  | "FFPROBE_OUTPUT_LIMIT"
  | "FFPROBE_PARSE_FAILED"
  | "FILE_UNREADABLE"
  | "PROFILE_MISMATCH";

class VerificationFailure extends Error {
  readonly code: FailureCode;

  constructor(code: FailureCode) {
    super(code);
    this.code = code;
  }
}

type ProbeResult = {
  streams?: Array<{
    codec_name?: unknown;
    pix_fmt?: unknown;
    width?: unknown;
    height?: unknown;
  }>;
  format?: {
    format_name?: unknown;
    duration?: unknown;
    tags?: { major_brand?: unknown };
  };
};

async function resolveLocalFile(input: string): Promise<{ path: string; bytes: number }> {
  if (!input || LOCAL_PROTOCOL_PATTERN.test(input)) {
    throw new VerificationFailure("FILE_UNREADABLE");
  }

  try {
    const absolutePath = path.resolve(input);
    const initialDetails = await lstat(absolutePath);
    if (initialDetails.isSymbolicLink() || !initialDetails.isFile() || initialDetails.size <= 0) {
      throw new VerificationFailure("FILE_UNREADABLE");
    }
    const resolvedPath = await realpath(absolutePath);
    const handle = await open(resolvedPath, "r");
    try {
      const details = await handle.stat();
      if (!details.isFile() || details.size <= 0) {
        throw new VerificationFailure("FILE_UNREADABLE");
      }
      return { path: resolvedPath, bytes: details.size };
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof VerificationFailure) throw error;
    throw new VerificationFailure("FILE_UNREADABLE");
  }
}

function runFfprobe(executable: string, videoPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "format=format_name,duration:format_tags=major_brand:stream=codec_name,pix_fmt,width,height",
        "-of",
        "json",
        videoPath,
      ],
      { shell: false },
    );
    const stdout: Buffer[] = [];
    let outputBytes = 0;
    let forcedFailure: VerificationFailure | undefined;
    const terminate = (code: FailureCode) => {
      forcedFailure ??= new VerificationFailure(code);
      child.kill("SIGKILL");
    };
    const consume = (chunk: Buffer, preserve: boolean) => {
      outputBytes += chunk.length;
      if (outputBytes > PROCESS_OUTPUT_LIMIT_BYTES) {
        terminate("FFPROBE_OUTPUT_LIMIT");
      } else if (preserve) {
        stdout.push(chunk);
      }
    };
    const timer = setTimeout(() => terminate("FFPROBE_TIMEOUT"), FFPROBE_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => consume(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => consume(chunk, false));
    child.on("error", () => {
      clearTimeout(timer);
      reject(new VerificationFailure("FFPROBE_UNAVAILABLE"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (forcedFailure) reject(forcedFailure);
      else if (code !== 0) reject(new VerificationFailure("PROFILE_MISMATCH"));
      else resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseProbe(rawProbe: string): ProbeResult {
  try {
    return JSON.parse(rawProbe) as ProbeResult;
  } catch {
    throw new VerificationFailure("FFPROBE_PARSE_FAILED");
  }
}

type VerifierOptions = {
  videoPath: string;
  templateMode: boolean;
  expectedDurationMs: number | null;
  toleranceMs: number;
};

function printUsage(): void {
  console.error(
    "Usage: pnpm video:verify -- <path> [--template [--duration-ms N] [--tolerance N]]"
  );
}

function finiteInt(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && Number.isFinite(number) ? number : null;
}

function parseVerifierArgs(rawArgs: string[]): VerifierOptions | null {
  let templateMode = false;
  let expectedDurationMs: number | null = null;
  let toleranceMs = DEFAULT_TEMPLATE_TOLERANCE_MS;
  let toleranceOverridden = false;
  let videoPath: string | null = null;

  for (let index = 0; index < rawArgs.length; index++) {
    const arg = rawArgs[index];
    if (arg === "--template") {
      templateMode = true;
    } else if (arg === "--duration-ms" || arg.startsWith("--duration-ms=")) {
      const rawValue = arg.includes("=")
        ? arg.slice("--duration-ms=".length)
        : rawArgs[++index];
      const parsed = finiteInt(rawValue);
      if (parsed === null || parsed <= 0 || parsed > 3_600_000) return null;
      expectedDurationMs = parsed;
    } else if (arg === "--tolerance" || arg.startsWith("--tolerance=")) {
      const rawValue = arg.includes("=") ? arg.slice("--tolerance=".length) : rawArgs[++index];
      const parsed = finiteInt(rawValue);
      if (parsed === null || parsed < 0 || parsed > 60_000) return null;
      toleranceMs = parsed;
      toleranceOverridden = true;
    } else if (arg.startsWith("--")) {
      return null;
    } else if (videoPath === null) {
      videoPath = arg;
    } else {
      return null;
    }
  }

  if (videoPath === null) return null;
  // --duration-ms / --tolerance ngầm bật kiểm tra kiểu template (so với mốc ms).
  if (expectedDurationMs !== null || toleranceOverridden) templateMode = true;
  return { videoPath, templateMode, expectedDurationMs, toleranceMs };
}

/**
 * Đọc mốc thời lượng kỳ vọng từ manifest anh em (renders/<uuid>/manifest.json,
 * field artifact.durationMs) khi chạy --template mà không truyền --duration-ms.
 * Thất bại (không có file, JSON sai, thiếu field) thì trả null để caller fallback;
 * không in path hay nội dung file ra output.
 */
async function readManifestDurationMs(videoAbsolutePath: string): Promise<number | null> {
  try {
    const manifestPath = path.join(path.dirname(videoAbsolutePath), "manifest.json");
    const raw = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as { artifact?: { durationMs?: unknown } };
    const durationMs = finiteNumber(parsed.artifact?.durationMs);
    if (durationMs === null || !Number.isInteger(durationMs) || durationMs <= 0) return null;
    return durationMs;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const options = parseVerifierArgs(args);
  if (!options) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const file = await resolveLocalFile(options.videoPath);
  const ffprobePath = process.env.FFPROBE_PATH?.trim() || "ffprobe";
  const probe = parseProbe(await runFfprobe(ffprobePath, file.path));
  const stream = probe.streams?.[0];
  const formatName = typeof probe.format?.format_name === "string" ? probe.format.format_name : "";
  const majorBrand =
    typeof probe.format?.tags?.major_brand === "string"
      ? probe.format.tags.major_brand.trim()
      : "";
  const codecName = typeof stream?.codec_name === "string" ? stream.codec_name : "";
  const pixelFormat = typeof stream?.pix_fmt === "string" ? stream.pix_fmt : "";
  const width = finiteNumber(stream?.width);
  const height = finiteNumber(stream?.height);
  const duration = finiteNumber(probe.format?.duration);

  if (
    !formatName.split(",").includes("mp4") ||
    !MP4_MAJOR_BRANDS.has(majorBrand) ||
    codecName !== "h264" ||
    pixelFormat !== "yuv420p" ||
    width !== 1080 ||
    height !== 1920 ||
    duration === null
  ) {
    throw new VerificationFailure("PROFILE_MISMATCH");
  }

  const durationMs = Math.round(duration * 1000);
  let expectedDurationMs = options.expectedDurationMs;
  let manifestDurationMs: number | null = null;
  if (options.templateMode && expectedDurationMs === null) {
    manifestDurationMs = await readManifestDurationMs(file.path);
    expectedDurationMs = manifestDurationMs;
  }

  if (expectedDurationMs !== null) {
    // Gate kiểu template-video-renderer: |probe - totalMs| <= tolerance (mặc định ±250 ms).
    if (Math.abs(durationMs - expectedDurationMs) > options.toleranceMs) {
      throw new VerificationFailure("PROFILE_MISMATCH");
    }
  } else if (duration < LEGACY_MIN_DURATION_S || duration > LEGACY_MAX_DURATION_S) {
    // Gate legacy mặc định cho bàn video local 12s.
    throw new VerificationFailure("PROFILE_MISMATCH");
  }

  console.log("=== ONEVOICE RENDERED VIDEO VERIFICATION ===");
  console.log("Format: MP4");
  console.log(`Major brand: ${majorBrand}`);
  console.log("Codec: H.264");
  console.log(`Pixel format: ${pixelFormat}`);
  console.log(`Dimensions: ${width}x${height}`);
  console.log(`Duration: ${duration.toFixed(3)} seconds`);
  if (expectedDurationMs !== null) {
    console.log(`Mode: template (expected ${expectedDurationMs} ms, tolerance ±${options.toleranceMs} ms)`);
    if (manifestDurationMs !== null && options.expectedDurationMs !== null &&
        manifestDurationMs !== options.expectedDurationMs) {
      console.log(`Manifest duration: ${manifestDurationMs} ms (flag --duration-ms takes precedence)`);
    } else if (manifestDurationMs !== null) {
      console.log(`Manifest duration: ${manifestDurationMs} ms`);
    }
  } else if (options.templateMode) {
    console.log("Mode: template (no expected duration reference; duration gate skipped)");
  } else {
    console.log(`Mode: legacy (expected ${LEGACY_MIN_DURATION_S}-${LEGACY_MAX_DURATION_S} seconds)`);
  }
  console.log(`File size: ${file.bytes} bytes`);
  console.log("\n>>> RENDERED VIDEO VERIFICATION PASSED <<<");
}

main().catch((error: unknown) => {
  const code = error instanceof VerificationFailure ? error.code : "PROFILE_MISMATCH";
  console.error(`Video verification failed: ${code}`);
  process.exitCode = 1;
});
