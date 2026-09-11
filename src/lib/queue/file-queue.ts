// SPDX-License-Identifier: Apache-2.0
// File-backed JobQueue. On-disk layout under <root>:
//   queued/<renderId>.json, running/<renderId>.json, done/<renderId>.json.
// claim() is rename(queued -> running), atomic on one filesystem; the race loser
// gets ENOENT and moves on. Every mutation writes via temp-file + fsync +
// rename so a SIGKILL mid-write never leaves truncated JSON behind (M3).
// recoverStale treats an unparseable job file as a lost job (failed /
// WORKER_LOST + onJobLost), never as a fatal error — one corrupt file must not
// stall the queue. Same O_NOFOLLOW / realpath-containment hardening as
// LocalVideoLibrary. The queue stays storage-only: terminal-failure effects go
// through the onJobLost callback (N12).

import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { RenderStage } from "@/lib/render/types";

import {
  RenderJobSchema,
  type FileJobQueueOptions,
  type JobOutcome,
  type JobQueue,
  type RenderJob,
} from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY = constants.O_DIRECTORY ?? 0;

const WORKER_LOST = { stage: "rendering_video", code: "WORKER_LOST" } as const;

type Subdir = "queued" | "running" | "done";

function parseJob(value: unknown): RenderJob | null {
  const parsed = RenderJobSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class FileJobQueue implements JobQueue {
  private readonly root: string;
  private readonly onJobLost?: NonNullable<FileJobQueueOptions["onJobLost"]>;

  constructor(options: FileJobQueueOptions) {
    this.root = path.resolve(options.root);
    if (options.onJobLost) this.onJobLost = options.onJobLost;
  }

  private validateRenderId(renderId: string): void {
    if (!UUID_PATTERN.test(renderId)) throw new Error("Invalid render ID");
  }

  // mkdir -p the three subdirs; reject symlinks anywhere on the path.
  private async safeSubdir(subdir: Subdir): Promise<string> {
    await mkdir(path.join(this.root, subdir), { recursive: true, mode: 0o700 });
    const rootDetails = await lstat(this.root);
    if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
      throw new Error("Unsafe queue root");
    }
    const rootRealPath = await realpath(this.root);
    const handle = await open(rootRealPath, constants.O_RDONLY | DIRECTORY | NO_FOLLOW);
    await handle.close();
    const directory = path.join(rootRealPath, subdir);
    const details = await lstat(directory);
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error("Unsafe queue directory");
    }
    return directory;
  }

  // Temp-file + fsync + rename write. Returns when the target is durable.
  private async atomicWrite(directory: string, fileName: string, job: RenderJob): Promise<void> {
    const data = `${JSON.stringify(job)}\n`;
    const tmpName = `.tmp-${job.renderId}-${randomUUID()}.json`;
    const tmpPath = path.join(directory, tmpName);
    const handle = await open(
      tmpPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(data, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmpPath, path.join(directory, fileName));
  }

  private async readJobFile(filePath: string): Promise<RenderJob | null> {
    const details = await lstat(filePath);
    if (details.isSymbolicLink() || !details.isFile()) throw new Error("Unsafe job file");
    const handle = await open(filePath, constants.O_RDONLY | NO_FOLLOW);
    try {
      if (!(await handle.stat()).isFile()) throw new Error("Unsafe job file");
      let parsed: unknown;
      try {
        parsed = JSON.parse(await handle.readFile("utf8")) as unknown;
      } catch {
        return null;
      }
      return parseJob(parsed);
    } finally {
      await handle.close();
    }
  }

  private async pathIsMissing(pathname: string): Promise<boolean> {
    try {
      await lstat(pathname);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
      throw error;
    }
  }

  private async jobExists(renderId: string): Promise<boolean> {
    for (const subdir of ["queued", "running", "done"] as const) {
      const directory = await this.safeSubdir(subdir);
      if (!(await this.pathIsMissing(path.join(directory, `${renderId}.json`)))) return true;
    }
    return false;
  }

  async enqueue(job: RenderJob): Promise<void> {
    const parsed = parseJob(job);
    if (!parsed) throw new Error("Invalid job");
    this.validateRenderId(parsed.renderId);
    if (await this.jobExists(parsed.renderId)) throw new Error("JOB_EXISTS");
    const directory = await this.safeSubdir("queued");
    await this.atomicWrite(directory, `${parsed.renderId}.json`, { ...parsed, status: "queued" });
  }

  async claim(workerId: string): Promise<RenderJob | null> {
    const queued = await this.safeSubdir("queued");
    const running = await this.safeSubdir("running");
    const files = (await readdir(queued)).filter((name) => name.endsWith(".json")).sort();
    for (const file of files) {
      const filePath = path.join(queued, file);
      let job: RenderJob | null;
      try {
        job = await this.readJobFile(filePath);
      } catch (error) {
        // Unsafe (symlink) job files are rejected loudly, never skipped: a
        // skipped symlink would sit in queued/ silently starving the worker.
        if ((error as Error).message.startsWith("Unsafe")) throw error;
        continue;
      }
      if (!job) continue;
      const claimed: RenderJob = {
        ...job,
        status: "running",
        startedAt: job.startedAt ?? new Date().toISOString(),
        workerId,
        heartbeatAt: new Date().toISOString(),
      };
      // Atomic claim: rename queued -> running. On ENOENT another worker won.
      try {
        await rename(filePath, path.join(running, `${job.renderId}.json`));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      // Publish the claimed record atomically (temp + rename, never partial).
      await this.atomicWrite(running, `${job.renderId}.json`, claimed);
      return claimed;
    }
    return null;
  }

  async heartbeat(renderId: string, stage: RenderStage): Promise<void> {
    this.validateRenderId(renderId);
    const running = await this.safeSubdir("running");
    const filePath = path.join(running, `${renderId}.json`);
    let job: RenderJob | null;
    try {
      job = await this.readJobFile(filePath);
    } catch {
      return;
    }
    if (!job) return;
    await this.atomicWrite(running, `${renderId}.json`, {
      ...job,
      status: "running",
      stage,
      heartbeatAt: new Date().toISOString(),
    });
  }

  async complete(renderId: string, outcome: JobOutcome): Promise<void> {
    this.validateRenderId(renderId);
    const running = await this.safeSubdir("running");
    const done = await this.safeSubdir("done");
    const filePath = path.join(running, `${renderId}.json`);
    let job: RenderJob | null;
    try {
      job = await this.readJobFile(filePath);
    } catch {
      return;
    }
    if (!job) return;
    const finished: RenderJob =
      outcome.status === "succeeded"
        ? { ...job, status: "succeeded", finishedAt: new Date().toISOString() }
        : {
            ...job,
            status: "failed",
            finishedAt: new Date().toISOString(),
            error: { stage: outcome.error.stage, code: outcome.error.code },
          };
    await this.atomicWrite(done, `${renderId}.json`, finished);
    await rm(filePath, { force: true });
  }

  async get(renderId: string): Promise<RenderJob | null> {
    this.validateRenderId(renderId);
    for (const subdir of ["queued", "running", "done"] as const) {
      const directory = await this.safeSubdir(subdir);
      const filePath = path.join(directory, `${renderId}.json`);
      if (await this.pathIsMissing(filePath)) continue;
      try {
        return await this.readJobFile(filePath);
      } catch {
        return null;
      }
    }
    return null;
  }

  private async retireAsLost(
    done: string,
    sourcePath: string,
    renderId: string,
    staleJob: RenderJob | null,
  ): Promise<void> {
    const lost: RenderJob = {
      renderId,
      productId: staleJob?.productId ?? "00000000-0000-4000-8000-000000000000",
      organizationId: staleJob?.organizationId ?? "00000000-0000-4000-8000-000000000000",
      status: "failed",
      enqueuedAt: staleJob?.enqueuedAt ?? new Date(0).toISOString(),
      attempts: (staleJob?.attempts ?? 0) + 1,
      finishedAt: new Date().toISOString(),
      error: { ...WORKER_LOST },
    };
    await this.atomicWrite(done, `${renderId}.json`, parseJob(lost) ?? lost);
    await rm(sourcePath, { force: true });
    await this.onJobLost?.(renderId, { ...WORKER_LOST });
  }

  async recoverStale(maxAgeMs: number): Promise<number> {
    const queued = await this.safeSubdir("queued");
    const running = await this.safeSubdir("running");
    const done = await this.safeSubdir("done");
    const now = Date.now();
    let recovered = 0;
    const files = (await readdir(running)).filter((name) => name.endsWith(".json")).sort();
    for (const file of files) {
      const renderId = file.slice(0, -".json".length);
      if (!UUID_PATTERN.test(renderId)) continue;
      const filePath = path.join(running, file);
      let job: RenderJob | null;
      try {
        job = await this.readJobFile(filePath);
      } catch (error) {
        // ENOENT: another worker completed it between readdir and read.
        // Unsafe: skip without retiring — never clobber terminal state.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        continue;
      }
      if (!job) {
        // Truncated JSON / schema drift: lost job, never fatal (M3).
        await this.retireAsLost(done, filePath, renderId, null);
        recovered += 1;
        continue;
      }
      // Missing/unparseable heartbeat counts as stale: a crash between
      // claim's rename and the claimed-record write leaves no heartbeat.
      const heartbeatMs = job.heartbeatAt ? Date.parse(job.heartbeatAt) : Number.NaN;
      if (Number.isFinite(heartbeatMs) && now - heartbeatMs < maxAgeMs) continue;
      if (job.attempts >= 1) {
        await this.retireAsLost(done, filePath, renderId, job);
      } else {
        const requeued: RenderJob = {
          ...job,
          status: "queued",
          attempts: job.attempts + 1,
          workerId: undefined,
          heartbeatAt: undefined,
          startedAt: undefined,
          stage: undefined,
        };
        await this.atomicWrite(queued, `${renderId}.json`, requeued);
        await rm(filePath, { force: true });
      }
      recovered += 1;
    }
    return recovered;
  }
}
