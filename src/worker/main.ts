// SPDX-License-Identifier: Apache-2.0
// Worker entrypoint: poll -> claim -> render -> record -> release. Single job
// at a time. recoverStale runs on boot and every 60s. SIGTERM finishes the
// current job then exits. Bundled by `build:worker` into dist/worker.js (C1):
// never run as loose TypeScript (the @/ alias needs the bundler).

import { generateVideoScript } from "@/lib/content/generate-video-script";
import { ProductVideoPipeline } from "@/lib/render/product-video-pipeline";

import { composeWorker } from "./composition";
import { runJob } from "./run-job";

const RECOVER_INTERVAL_MS = 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const worker = composeWorker();
  const pipeline = new ProductVideoPipeline({
    catalog: worker.catalog,
    generateContent: async (snapshot) =>
      (await generateVideoScript(worker.provider, snapshot, worker.scriptOptions)).content,
    ...(worker.generateScript ? { generateScript: worker.generateScript } : {}),
    imageResolver: worker.imageResolver,
    compileStoryboard: worker.compileStoryboard,
    renderer: worker.renderer,
    library: worker.library,
    recordEvent: worker.recordEvent,
  });

  let shuttingDown = false;
  process.once("SIGTERM", () => {
    shuttingDown = true;
  });

  await worker.queue.recoverStale(worker.jobStaleMs);
  let lastRecover = Date.now();
  while (!shuttingDown) {
    if (Date.now() - lastRecover >= RECOVER_INTERVAL_MS) {
      await worker.queue.recoverStale(worker.jobStaleMs);
      lastRecover = Date.now();
    }
    const job = await worker.queue.claim(worker.workerId);
    if (!job) {
      await sleep(worker.pollMs);
      continue;
    }
    try {
      await runJob({ pipeline, queue: worker.queue }, job);
    } catch {
      // runJob only throws if queue.complete itself fails after the pipeline
      // already recorded the terminal state; the job file stays in running/
      // for the next recoverStale sweep to retire. Never crash the loop.
    }
  }
}

import { pathToFileURL } from "node:url";

// Entry guard: `node dist/worker.js` runs the loop; a bare
// `import("./dist/worker.js")` (N3 smoke check) must not.
const invokedAs = process.argv[1];
if (invokedAs && import.meta.url === pathToFileURL(invokedAs).href) {
  await main();
}
