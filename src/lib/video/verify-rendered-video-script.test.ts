// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

function runProcess(
  executable: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: process.cwd(),
      env: environment,
      shell: false,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function createVideoFixture(videoPath: string): Promise<void> {
  const result = await runProcess("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=blue:s=1080x1920:r=1:d=1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-y",
    videoPath,
  ]);
  if (result.code !== 0) throw new Error(`Unable to create test video: ${result.stderr}`);
}

function runVerifier(args: readonly string[]) {
  return runProcess(process.execPath, [
    "--experimental-strip-types",
    "scripts/verify-rendered-video.ts",
    ...args,
  ]);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("rendered video verifier script", () => {
  it("reports the required metadata for a real conforming MP4", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "onevoice-video-verifier-test-"));
    roots.push(root);
    const videoPath = path.join(root, "video.mp4");
    await createVideoFixture(videoPath);
    const bytes = (await stat(videoPath)).size;

    const result = await runVerifier(["--", videoPath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Format: MP4");
    expect(result.stdout).toContain("Codec: H.264");
    expect(result.stdout).toContain("Pixel format: yuv420p");
    expect(result.stdout).toContain("Dimensions: 1080x1920");
    expect(result.stdout).toContain("Duration: 1.000 seconds");
    expect(result.stdout).toContain(`File size: ${bytes} bytes`);
  });

  it("rejects an invalid file without printing its path or contents", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "onevoice-video-verifier-test-"));
    roots.push(root);
    const secret = "Bearer super-secret-verifier-fixture";
    const invalidPath = path.join(root, "private-secret.txt");
    await writeFile(invalidPath, secret, "utf8");

    const result = await runVerifier(["--", invalidPath]);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.code).not.toBe(0);
    expect(output).toContain("Video verification failed");
    expect(output).not.toContain(secret);
    expect(output).not.toContain(invalidPath);
    expect(output).not.toContain("super-secret-verifier-fixture");
  });

  it("requires exactly one video path", async () => {
    const [missing, extra] = await Promise.all([
      runVerifier(["--"]),
      runVerifier(["--", "first.mp4", "second.mp4"]),
    ]);

    expect(missing.code).not.toBe(0);
    expect(missing.stderr).toContain("Usage: pnpm video:verify -- <path>");
    expect(extra.code).not.toBe(0);
    expect(extra.stderr).toContain("Usage: pnpm video:verify -- <path>");
  });
});
