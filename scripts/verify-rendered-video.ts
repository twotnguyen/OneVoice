// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";

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
  };
};

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
        "format=format_name,duration:stream=codec_name,pix_fmt,width,height",
        "-of",
        "json",
        videoPath,
      ],
      { shell: false },
    );
    const stdout: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error("ffprobe rejected the file"));
    });
  });
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  if (args.length !== 1) {
    console.error("Usage: pnpm video:verify -- <path>");
    process.exitCode = 1;
    return;
  }

  const ffprobePath = process.env.FFPROBE_PATH?.trim() || "ffprobe";
  const rawProbe = await runFfprobe(ffprobePath, args[0]);
  const probe = JSON.parse(rawProbe) as ProbeResult;
  const stream = probe.streams?.[0];
  const formatName = typeof probe.format?.format_name === "string" ? probe.format.format_name : "";
  const codecName = typeof stream?.codec_name === "string" ? stream.codec_name : "";
  const pixelFormat = typeof stream?.pix_fmt === "string" ? stream.pix_fmt : "";
  const width = finiteNumber(stream?.width);
  const height = finiteNumber(stream?.height);
  const duration = finiteNumber(probe.format?.duration);

  if (
    !formatName.split(",").includes("mp4") ||
    codecName !== "h264" ||
    pixelFormat !== "yuv420p" ||
    width !== 1080 ||
    height !== 1920 ||
    duration === null ||
    duration <= 0
  ) {
    throw new Error("Video does not match the required output profile");
  }

  const file = await stat(args[0]);
  if (!file.isFile() || file.size <= 0) throw new Error("Video file is empty");

  console.log("=== ONEVOICE RENDERED VIDEO VERIFICATION ===");
  console.log("Format: MP4");
  console.log("Codec: H.264");
  console.log(`Pixel format: ${pixelFormat}`);
  console.log(`Dimensions: ${width}x${height}`);
  console.log(`Duration: ${duration.toFixed(3)} seconds`);
  console.log(`File size: ${file.size} bytes`);
  console.log("\n>>> RENDERED VIDEO VERIFICATION PASSED <<<");
}

main().catch(() => {
  console.error("Video verification failed: input is not a valid OneVoice MP4");
  process.exitCode = 1;
});
