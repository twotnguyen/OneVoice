// SPDX-License-Identifier: MIT
// Vendored from references/AI-auto-generate-video (src/render/template-composer.ts).
// Adapted: injected templatesRoot (R-E), shell:false against resolved binary
// (offline A4, no npx), per-call timeout, temp vars-file cleanup.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const STDERR_LIMIT = 64 * 1024;

export type Aspect = "9:16" | "16:9" | "1:1";

/**
 * Each aspect renders a dedicated composition file authored at that native
 * canvas (these templates use absolute-px layouts, so we re-lay-out per aspect
 * rather than scale a single composition). Missing file → fall back to index.html.
 */
const ASPECT_ENTRY: Record<Aspect, string> = {
  "16:9": "index.html",
  "9:16": "compositions/portrait.html",
  "1:1": "compositions/square.html",
};

export type ComposeArgs = Readonly<{
  templatesRoot: string;
  /** Folder name under templatesRoot, e.g. "frame-bold-poster". Never a path. */
  templateId: string;
  /** Content slots, matching the template's data-composition-variables schema. */
  inputs: Record<string, unknown>;
  /** Absolute or cwd-relative output .mp4 path. */
  outputPath: string;
  aspect: Aspect;
  fps: number;
  /** Resolved hyperframes binary (ONEVOICE_HYPERFRAMES_PATH). Never npx. */
  hyperframesPath: string;
  timeoutMs: number;
}>;

function run(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
    });
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > STDERR_LIMIT)
        stderr = stderr.subarray(stderr.length - STDERR_LIMIT);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("hyperframes render timed out"));
      } else if (code !== 0) {
        reject(
          new Error(
            `hyperframes render failed (exit ${code}): ${stderr.toString("utf8").slice(-800)}`,
          ),
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Render one vendored HyperFrames template into an MP4, injecting `inputs`
 * as composition variables. This is the deterministic "fill the slots" step:
 * the caller only supplies text, the template owns all the visual design.
 */
export async function composeTemplate(args: ComposeArgs): Promise<string> {
  const {
    templatesRoot,
    templateId,
    inputs,
    fps,
    aspect,
    hyperframesPath,
    timeoutMs,
  } = args;
  if (
    templateId.length === 0 ||
    templateId.includes("/") ||
    templateId.includes("\\") ||
    templateId.includes("..")
  ) {
    throw new Error(
      `composeTemplate: unsafe templateId ${JSON.stringify(templateId)}`,
    );
  }
  const templateDir = join(templatesRoot, templateId);
  if (!existsSync(join(templateDir, "index.html"))) {
    throw new Error(`Template not found: ${templateDir}/index.html`);
  }

  // Pick the composition file for the requested aspect (fall back to index.html).
  const entry = ASPECT_ENTRY[aspect];
  const entryFile = existsSync(join(templateDir, entry)) ? entry : "index.html";

  const outputPath = isAbsolute(args.outputPath)
    ? args.outputPath
    : resolve(process.cwd(), args.outputPath);

  // Pass variables via a temp file, NOT argv: model-authored text carries
  // quotes/Unicode (em-dash, Vietnamese) that argv mangling would corrupt.
  const varsDir = await mkdtemp(join(tmpdir(), "hf-vars-"));
  try {
    const varsFile = join(varsDir, "variables.json");
    await writeFile(varsFile, JSON.stringify(inputs), "utf8");
    await run(
      hyperframesPath,
      [
        "render",
        templateDir,
        "--composition",
        entryFile,
        "--output",
        outputPath,
        "--fps",
        String(fps),
        "--variables-file",
        varsFile,
      ],
      timeoutMs,
    );
  } finally {
    await rm(varsDir, { recursive: true, force: true });
  }

  return outputPath;
}
