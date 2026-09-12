// SPDX-License-Identifier: Apache-2.0

import { spawn } from "node:child_process";
import {
  access,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const verifierPath = path.resolve("scripts/verify-rendered-video.ts");
const conformingProbe = JSON.stringify({
  streams: [{ codec_name: "h264", pix_fmt: "yuv420p", width: 1080, height: 1920 }],
  format: {
    format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    duration: "12.000000",
    tags: { major_brand: "isom" },
  },
});

type ProcessResult = { code: number | null; stdout: string; stderr: string };

function runProcess(
  executable: string,
  args: readonly string[],
  options: { cwd?: string; environment?: NodeJS.ProcessEnv } = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.environment ?? process.env,
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

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "onevoice-video-verifier-test-"));
  roots.push(root);
  return root;
}

async function createVideoFixture(
  videoPath: string,
  container: "mp4" | "mov" | "3gp" = "mp4",
  durationSeconds = 12,
): Promise<void> {
  const result = await runProcess("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=blue:s=1080x1920:r=1:d=${durationSeconds}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-f",
    container,
    "-y",
    videoPath,
  ]);
  if (result.code !== 0) throw new Error(`Unable to create test video: ${result.stderr}`);
}

async function createExecutable(root: string, name: string, body: string): Promise<string> {
  const executable = path.join(root, name);
  await writeFile(executable, `#!/usr/bin/env node\n${body}\n`, "utf8");
  await chmod(executable, 0o700);
  return executable;
}

function runVerifier(
  args: readonly string[],
  options: { cwd?: string; ffprobePath?: string } = {},
): Promise<ProcessResult> {
  return runProcess(process.execPath, ["--experimental-strip-types", verifierPath, ...args], {
    cwd: options.cwd,
    environment: {
      ...process.env,
      ...(options.ffprobePath ? { FFPROBE_PATH: options.ffprobePath } : {}),
    },
  });
}

function expectSafeFailure(
  result: ProcessResult,
  code: string,
  forbidden: readonly string[] = [],
): void {
  const output = `${result.stdout}\n${result.stderr}`;
  expect(result.code).not.toBe(0);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain(`Video verification failed: ${code}`);
  for (const value of forbidden) expect(output).not.toContain(value);
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("rendered video verifier script", () => {
  it("reports the required metadata for a real conforming MP4", async () => {
    const root = await temporaryRoot();
    const videoPath = path.join(root, "video.mp4");
    await createVideoFixture(videoPath);
    const bytes = (await stat(videoPath)).size;

    const result = await runVerifier(["--", videoPath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Format: MP4");
    expect(result.stdout).toContain("Major brand: isom");
    expect(result.stdout).toContain("Codec: H.264");
    expect(result.stdout).toContain("Pixel format: yuv420p");
    expect(result.stdout).toContain("Dimensions: 1080x1920");
    expect(result.stdout).toContain("Duration: 12.000 seconds");
    expect(result.stdout).toContain(`File size: ${bytes} bytes`);
    // Real fixture encoding/startup plus the verifier's own 10-second probe budget.
    // Keep this local to the cold-path integration test, not the whole suite.
  }, 20_000);

  it("rejects an otherwise conforming MP4 whose duration is outside the render window", async () => {
    const root = await temporaryRoot();
    const videoPath = path.join(root, "short.mp4");
    await createVideoFixture(videoPath, "mp4", 1);

    const result = await runVerifier(["--", videoPath]);

    expectSafeFailure(result, "PROFILE_MISMATCH", [videoPath]);
  });

  it.each([
    ["QuickTime MOV", "video.mov", "mov"],
    ["3GP", "video.3gp", "3gp"],
  ] as const)("rejects a real %s with an otherwise conforming video stream", async (_, name, format) => {
    const root = await temporaryRoot();
    const videoPath = path.join(root, name);
    await createVideoFixture(videoPath, format);

    const result = await runVerifier(["--", videoPath]);

    expectSafeFailure(result, "PROFILE_MISMATCH", [videoPath]);
  });

  it("resolves a leading-dash filename before invoking ffprobe", async () => {
    const root = await temporaryRoot();
    await createVideoFixture(path.join(root, "-video.mp4"));

    const result = await runVerifier(["--", "-video.mp4"], { cwd: root });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Major brand: isom");
  });

  it.each([
    ["protocol input", "https://example.com/private-video.mp4"],
    ["missing file", "private-missing-video.mp4"],
  ])("rejects %s before invoking ffprobe", async (_, input) => {
    const root = await temporaryRoot();
    const marker = path.join(root, "ffprobe-called");
    const fake = await createExecutable(
      root,
      "ffprobe-marker",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "called"); process.stdout.write(${JSON.stringify(conformingProbe)});`,
    );

    const result = await runVerifier(["--", input], { cwd: root, ffprobePath: fake });

    expectSafeFailure(result, "FILE_UNREADABLE", [input, root]);
    await expect(access(marker)).rejects.toThrow();
  });

  it("rejects an empty file and a symlink before invoking ffprobe", async () => {
    const root = await temporaryRoot();
    const empty = path.join(root, "empty.mp4");
    const link = path.join(root, "linked.mp4");
    const target = path.join(root, "target.mp4");
    const marker = path.join(root, "ffprobe-called");
    await writeFile(empty, "");
    await writeFile(target, "nonempty");
    await symlink(target, link);
    const fake = await createExecutable(
      root,
      "ffprobe-marker",
      `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "called"); process.stdout.write(${JSON.stringify(conformingProbe)});`,
    );

    const [emptyResult, linkResult] = await Promise.all([
      runVerifier(["--", empty], { ffprobePath: fake }),
      runVerifier(["--", link], { ffprobePath: fake }),
    ]);

    expectSafeFailure(emptyResult, "FILE_UNREADABLE", [empty]);
    expectSafeFailure(linkResult, "FILE_UNREADABLE", [link, target]);
    await expect(access(marker)).rejects.toThrow();
  });

  it("reports an unavailable ffprobe without printing its path", async () => {
    const root = await temporaryRoot();
    const videoPath = path.join(root, "video.mp4");
    const unavailable = path.join(root, "private-missing-ffprobe");
    await writeFile(videoPath, "nonempty");

    const result = await runVerifier(["--", videoPath], { ffprobePath: unavailable });

    expectSafeFailure(result, "FFPROBE_UNAVAILABLE", [videoPath, unavailable, root]);
  });

  it(
    "terminates and reaps ffprobe after the ten-second deadline",
    async () => {
      const root = await temporaryRoot();
      const videoPath = path.join(root, "video.mp4");
      await writeFile(videoPath, "nonempty");
      const slow = await createExecutable(
        root,
        "ffprobe-slow",
        `setTimeout(() => process.stdout.write(${JSON.stringify(conformingProbe)}), 12_000);`,
      );
      const startedAt = performance.now();

      const result = await runVerifier(["--", videoPath], { ffprobePath: slow });

      expectSafeFailure(result, "FFPROBE_TIMEOUT", [videoPath, slow, root]);
      const elapsedMs = performance.now() - startedAt;
      expect(elapsedMs).toBeGreaterThanOrEqual(9_500);
      expect(elapsedMs).toBeLessThan(11_500);
    },
    15_000,
  );

  it("terminates ffprobe when bounded output is exceeded", async () => {
    const root = await temporaryRoot();
    const videoPath = path.join(root, "video.mp4");
    await writeFile(videoPath, "nonempty");
    const noisy = await createExecutable(
      root,
      "ffprobe-noisy",
      'process.stdout.write("x".repeat(40 * 1024)); process.stderr.write("y".repeat(40 * 1024));',
    );

    const result = await runVerifier(["--", videoPath], { ffprobePath: noisy });

    expectSafeFailure(result, "FFPROBE_OUTPUT_LIMIT", [videoPath, noisy, root, "x".repeat(100)]);
  });

  it("reports malformed ffprobe JSON without printing output or input details", async () => {
    const root = await temporaryRoot();
    const videoPath = path.join(root, "video.mp4");
    const secret = "Bearer super-secret-verifier-fixture";
    await writeFile(videoPath, "nonempty");
    const malformed = await createExecutable(
      root,
      "ffprobe-malformed",
      `process.stdout.write(${JSON.stringify(`{"secret":"${secret}"`)});`,
    );

    const result = await runVerifier(["--", videoPath], { ffprobePath: malformed });

    expectSafeFailure(result, "FFPROBE_PARSE_FAILED", [videoPath, malformed, root, secret]);
  });

  it("loads FFPROBE_PATH from .env through the package command", async () => {
    const root = await temporaryRoot();
    const scriptsDirectory = path.join(root, "scripts");
    await mkdir(scriptsDirectory);
    await copyFile(verifierPath, path.join(scriptsDirectory, "verify-rendered-video.ts"));
    await writeFile(path.join(root, "video.mp4"), "nonempty");
    const fake = await createExecutable(
      root,
      "ffprobe-from-env",
      `process.stdout.write(${JSON.stringify(conformingProbe)});`,
    );
    const repositoryPackage = JSON.parse(await readFile("package.json", "utf8")) as {
      scripts: { "video:verify": string };
    };
    await writeFile(
      path.join(root, "package.json"),
      `${JSON.stringify({
        type: "module",
        scripts: { "video:verify": repositoryPackage.scripts["video:verify"] },
      })}\n`,
    );
    await writeFile(path.join(root, ".env"), `FFPROBE_PATH=${JSON.stringify(fake)}\n`);

    const result = await runProcess("pnpm", ["video:verify", "--", "video.mp4"], { cwd: root });

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("Video verification failed");
    expect(result.stderr).not.toContain(fake);
    expect(result.stdout).toContain("Major brand: isom");
    expect(result.stdout).not.toContain(fake);
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
