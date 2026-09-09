// SPDX-License-Identifier: Apache-2.0

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  RenderedVideo,
  VideoProbe,
  VideoRenderRequest,
  VideoStoryboard,
} from "./types";

const RENDERER_REVISION = "onevoice-ffmpeg-v1" as const;
const PROCESS_TIMEOUT_MS = 45_000;
const STDERR_LIMIT = 64 * 1024;
const FONT_CANDIDATES = [
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/System/Library/Fonts/HelveticaNeue.ttc",
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
] as const;

type RendererOptions = Readonly<{
  outputRoot: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  fontPath?: string;
}>;

type ProcessResult = Readonly<{ stdout: string; stderr: string }>;

async function runProcess(
  executable: string,
  args: readonly string[],
  timeoutMs = PROCESS_TIMEOUT_MS,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= STDERR_LIMIT) stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > STDERR_LIMIT) stderr = stderr.subarray(stderr.length - STDERR_LIMIT);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("Media process timed out"));
      } else if (code !== 0) {
        reject(new Error(`Media process exited with code ${code}: ${stderr.toString("utf8")}`));
      } else {
        resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: stderr.toString("utf8") });
      }
    });
  });
}

function finiteNumber(value: unknown): number | null {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

export async function probeVideo(
  videoPath: string,
  ffprobePath = "ffprobe",
): Promise<VideoProbe> {
  const { stdout } = await runProcess(ffprobePath, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "format=format_name,duration:stream=codec_name,pix_fmt,width,height",
    "-of",
    "json",
    videoPath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<Record<string, unknown>>;
    format?: Record<string, unknown>;
  };
  const stream = parsed.streams?.[0];
  const durationSeconds = finiteNumber(parsed.format?.duration);
  const width = finiteNumber(stream?.width);
  const height = finiteNumber(stream?.height);
  if (
    !stream ||
    !parsed.format ||
    typeof parsed.format.format_name !== "string" ||
    typeof stream.codec_name !== "string" ||
    typeof stream.pix_fmt !== "string" ||
    durationSeconds === null ||
    width === null ||
    height === null
  ) {
    throw new Error("Rendered video probe is incomplete");
  }
  return {
    formatName: parsed.format.format_name,
    codecName: stream.codec_name,
    pixelFormat: stream.pix_fmt,
    width,
    height,
    durationMs: Math.round(durationSeconds * 1000),
  };
}

async function resolveFont(configuredPath?: string): Promise<string> {
  const candidates = [configuredPath, process.env.ONEVOICE_FONT_PATH, ...FONT_CANDIDATES].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      if ((await stat(resolved)).isFile()) return resolved;
    } catch {
      // Continue to the next explicit platform candidate.
    }
  }
  throw new Error("No supported local font was found");
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function validateStoryboard(storyboard: VideoStoryboard): void {
  if (
    storyboard.schema !== "onevoice.storyboard.v1" ||
    storyboard.template !== "product-spotlight-v1" ||
    storyboard.canvas.width !== 1080 ||
    storyboard.canvas.height !== 1920 ||
    storyboard.canvas.fps !== 30 ||
    storyboard.canvas.durationMs !== 12_000 ||
    storyboard.scenes.length !== 3 ||
    storyboard.scenes.some(
      (scene) =>
        scene.durationMs !== 4_000 ||
        scene.lines.length > 5 ||
        scene.lines.some((line) => line.length > 24),
    )
  ) {
    throw new Error("Invalid video storyboard");
  }
}

async function sha256File(filePath: string): Promise<string> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

export class FfmpegVideoRenderer {
  private readonly outputRoot: string;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly fontPath?: string;

  constructor(options: RendererOptions) {
    this.outputRoot = path.resolve(options.outputRoot);
    this.ffmpegPath = options.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = options.ffprobePath ?? "ffprobe";
    this.fontPath = options.fontPath;
  }

  async render(request: VideoRenderRequest): Promise<RenderedVideo> {
    validateStoryboard(request.storyboard);
    await mkdir(this.outputRoot, { recursive: true, mode: 0o700 });
    const workDirectory = await mkdtemp(path.join(this.outputRoot, ".work-"));
    const outputPath = path.join(this.outputRoot, `${randomUUID()}.mp4`);

    try {
      const fontPath = await resolveFont(this.fontPath);
      if (request.imagePath) {
        if (!path.isAbsolute(request.imagePath) || !(await stat(request.imagePath)).isFile()) {
          throw new Error("Image input must be a trusted local file");
        }
      }

      const filters: string[] = [];
      let currentVideo = "[0:v]";
      if (request.imagePath) {
        filters.push(
          "[1:v]scale=800:800:force_original_aspect_ratio=decrease," +
            "pad=800:800:(ow-iw)/2:(oh-ih)/2:color=white@0[asset]",
        );
        filters.push(`${currentVideo}[asset]overlay=(W-w)/2:260:enable='between(t,4,8)'[base]`);
        currentVideo = "[base]";
      }

      for (const [index, scene] of request.storyboard.scenes.entries()) {
        const textPath = path.join(workDirectory, `scene-${index}.txt`);
        await writeFile(textPath, `${scene.lines.join("\n")}\n`, { mode: 0o600, flag: "wx" });
        const outputLabel = `[text${index}]`;
        const start = index * 4;
        const end = start + 4;
        filters.push(
          `${currentVideo}drawtext=fontfile='${escapeFilterValue(fontPath)}':` +
            `textfile='${escapeFilterValue(textPath)}':expansion=none:` +
            "fontcolor=white:fontsize=64:line_spacing=22:" +
            `x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${start},${end})'${outputLabel}`,
        );
        currentVideo = outputLabel;
      }

      const args = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=0x071A33:s=1080x1920:r=30:d=12",
        ...(request.imagePath ? ["-loop", "1", "-i", request.imagePath] : []),
        "-filter_complex",
        filters.join(";"),
        "-map",
        currentVideo,
        "-t",
        "12",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-y",
        outputPath,
      ];
      await runProcess(this.ffmpegPath, args);
      const probe = await probeVideo(outputPath, this.ffprobePath);
      if (
        !probe.formatName.includes("mp4") ||
        probe.codecName !== "h264" ||
        probe.pixelFormat !== "yuv420p" ||
        probe.width !== 1080 ||
        probe.height !== 1920 ||
        probe.durationMs < 11_500 ||
        probe.durationMs > 12_500
      ) {
        throw new Error("Rendered video failed verification");
      }
      const details = await stat(outputPath);
      const sha256 = await sha256File(outputPath);
      return {
        path: outputPath,
        bytes: details.size,
        sha256,
        ...probe,
        rendererRevision: RENDERER_REVISION,
        cleanup: () => rm(outputPath, { force: true }),
      };
    } catch (error) {
      await rm(outputPath, { force: true });
      throw error;
    } finally {
      await rm(workDirectory, { recursive: true, force: true });
    }
  }
}
