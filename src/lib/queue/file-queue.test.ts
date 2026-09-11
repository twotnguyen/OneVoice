// SPDX-License-Identifier: Apache-2.0

import { symlink, writeFile } from "node:fs/promises";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it, afterEach } from "vitest";

import { FileJobQueue } from "./file-queue";
import type { RenderJob } from "./types";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "onevoice-queue-test-"));
  roots.push(root);
  return root;
}

function job(overrides: Partial<RenderJob> = {}): RenderJob {
  return {
    renderId: "b0000000-0000-4000-8000-000000000001",
    productId: "b0000000-0000-4000-8000-000000000002",
    organizationId: "a0000000-0000-4000-8000-000000000001",
    status: "queued",
    enqueuedAt: "2026-09-10T00:00:00.000Z",
    attempts: 0,
    ...overrides,
  };
}

async function tmpLeftovers(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const subdir of ["queued", "running", "done"]) {
    let files: string[] = [];
    try {
      files = await readdir(path.join(root, subdir));
    } catch {
      continue;
    }
    found.push(...files.filter((name) => name.startsWith(".tmp-")).map((name) => `${subdir}/${name}`));
  }
  return found;
}

describe("FileJobQueue", () => {
  it("enqueue then claim returns running; a second claim returns null", async () => {
    const queue = new FileJobQueue({ root: await freshRoot() });
    await queue.enqueue(job());
    const claimed = await queue.claim("worker-1");
    expect(claimed?.status).toBe("running");
    expect(claimed?.workerId).toBe("worker-1");
    expect(await queue.claim("worker-2")).toBeNull();
  });

  it("crash recovery: stale job requeues with attempts+1, then retires as WORKER_LOST with onJobLost once", async () => {
    const lost: Array<{ renderId: string; error: { stage: string; code: string } }> = [];
    const queue = new FileJobQueue({
      root: await freshRoot(),
      onJobLost: async (renderId, error) => {
        lost.push({ renderId, error });
      },
    });
    await queue.enqueue(job());
    await queue.claim("worker-1");
    await queue.heartbeat(job().renderId, "rendering_video");
    // Force staleness by backdating through a second sweep window.
    const recovered1 = await queue.recoverStale(-1);
    expect(recovered1).toBe(1);
    const reclaimed = await queue.claim("worker-1");
    expect(reclaimed?.status).toBe("running");
    expect(reclaimed?.attempts).toBe(1);
    const recovered2 = await queue.recoverStale(-1);
    expect(recovered2).toBe(1);
    const done = await queue.get(job().renderId);
    expect(done?.status).toBe("failed");
    expect(done?.error).toEqual({ stage: "rendering_video", code: "WORKER_LOST" });
    expect(lost).toHaveLength(1);
    expect(lost[0]?.renderId).toBe(job().renderId);
    expect(await queue.claim("worker-1")).toBeNull();
  });

  it("M3: truncated running JSON is recovered as failed/WORKER_LOST without throwing", async () => {
    const lost: string[] = [];
    const root = await freshRoot();
    const queue = new FileJobQueue({
      root,
      onJobLost: async (renderId) => {
        lost.push(renderId);
      },
    });
    const goodId = "b0000000-0000-4000-8000-000000000011";
    const badId = "b0000000-0000-4000-8000-000000000012";
    await queue.enqueue(job({ renderId: goodId }));
    await queue.enqueue(job({ renderId: badId }));
    await queue.claim("worker-1");
    await queue.claim("worker-1");
    await writeFile(path.join(root, "running", `${badId}.json`), '{"renderId": "truncated');
    const recovered = await queue.recoverStale(-1);
    expect(recovered).toBe(2);
    const bad = await queue.get(badId);
    expect(bad?.status).toBe("failed");
    expect(bad?.error).toEqual({ stage: "rendering_video", code: "WORKER_LOST" });
    expect(lost).toContain(badId);
    // The valid stale job was also swept (requeued, then claimable).
    expect(await queue.claim("worker-1")).not.toBeNull();
  });

  it("two concurrent claims on one queued job: exactly one wins", async () => {
    const queue = new FileJobQueue({ root: await freshRoot() });
    await queue.enqueue(job());
    const [first, second] = await Promise.all([queue.claim("w-1"), queue.claim("w-2")]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("enqueue on an existing renderId rejects JOB_EXISTS", async () => {
    const queue = new FileJobQueue({ root: await freshRoot() });
    await queue.enqueue(job());
    await expect(queue.enqueue(job())).rejects.toThrow("JOB_EXISTS");
  });

  it("a symlinked queued job file is rejected as unsafe", async () => {
    const root = await freshRoot();
    const queue = new FileJobQueue({ root });
    await queue.enqueue(job());
    const target = path.join(root, "queued", `${job().renderId}.json`);
    const linkDir = await mkdtemp(path.join(tmpdir(), "onevoice-queue-link-"));
    roots.push(linkDir);
    const linkSource = path.join(linkDir, "x.json");
    await writeFile(linkSource, "{}");
    await rm(target, { force: true });
    await symlink(linkSource, target);
    await expect(queue.claim("worker-1")).rejects.toThrow();
  });

  it("no .tmp-* files survive heartbeat or complete", async () => {
    const root = await freshRoot();
    const queue = new FileJobQueue({ root });
    await queue.enqueue(job());
    await queue.claim("worker-1");
    await queue.heartbeat(job().renderId, "rendering_video");
    expect(await tmpLeftovers(root)).toEqual([]);
    await queue.complete(job().renderId, { status: "succeeded" });
    expect(await tmpLeftovers(root)).toEqual([]);
    const done = await queue.get(job().renderId);
    expect(done?.status).toBe("succeeded");
  });
});
