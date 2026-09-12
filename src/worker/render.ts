// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createSupabaseDataClient } from "../lib/supabase/server";
import { ProductVideoPipeline } from "../lib/render/product-video-pipeline";
import { createRenderHandler, createRenderStore } from "../lib/jobs/render-adapter";
import { composeWorker } from "./composition";
import { runBusinessJobs } from "./business-jobs";

/** Dedicated content-render pump. Legacy file-queue manual render stays in main.ts. */
export async function runContentRender(signal: AbortSignal) {
  const worker = composeWorker();
  const store = createRenderStore(createSupabaseDataClient());
  const pipeline = new ProductVideoPipeline({
    catalog: worker.catalog,
    generateContent: async () => { throw new Error("persisted_script_required"); },
    imageResolver: worker.imageResolver,
    compileStoryboard: worker.compileStoryboard,
    renderer: worker.renderer,
    library: worker.library,
    recordEvent: worker.recordEvent,
  });
  await runBusinessJobs({
    queue: store.queue,
    owner: randomUUID(),
    signal,
    handlers: { render_content: createRenderHandler({ store, library: worker.library, pipeline }) },
    pollMs: 1000,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.ONEVOICE_RENDER_WORKER !== "1") {
    console.error("Set ONEVOICE_RENDER_WORKER=1 to explicitly enable content render.");
    process.exitCode = 1;
  } else {
    const stop = new AbortController();
    process.once("SIGTERM", () => stop.abort());
    process.once("SIGINT", () => stop.abort());
    await runContentRender(stop.signal).catch(() => {
      console.error("render_worker_failed");
      process.exitCode = 1;
    });
  }
}
