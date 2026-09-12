// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createSupabaseDataClient } from "../lib/supabase/server";
import { OpenAICompatibleProvider } from "../lib/ai/openai-compatible";
import { generateCampaignContent, createCampaignGenerationStore } from "../lib/content/campaign-generation";
import { createRenderStore } from "../lib/jobs/render-adapter";
import { createSchedulerStore, createAutomationTickHandler } from "../lib/marketing/scheduler";
import { runBusinessJobs } from "./business-jobs";

/** Explicit process opt-in. Does not publish, call Graph, or set PUBLISHED. */
export async function runAutomationTick(signal: AbortSignal) {
  const required = (key: string) => {
    const value = process.env[key];
    if (!value?.trim()) throw Error("scheduler_config_missing");
    return value;
  };
  const client = createSupabaseDataClient();
  const provider = new OpenAICompatibleProvider({ baseUrl: required("AI_BASE_URL"), apiKey: required("AI_API_KEY"), model: required("AI_MODEL") });
  const store = createSchedulerStore(client);
  const renders = createRenderStore(client);
  let nextSchedule = 0;
  const queue = {
    ...store.queue!,
    async claim(owner: string) {
      if (Date.now() >= nextSchedule) {
        nextSchedule = Date.now() + 60000;
        await store.queue!.enqueueDue();
      }
      return store.queue!.claim(owner);
    },
  };
  await runBusinessJobs({
    queue,
    owner: randomUUID(),
    signal,
    handlers: {
      automation_tick: async (job, active) => {
        const generation = createCampaignGenerationStore(client, job.organization_id);
        await createAutomationTickHandler({
          store,
          generate: (input) => generateCampaignContent(input, { provider, store: generation, signal: active }),
          enqueueRender: (contentVersionId) => renders.enqueue(job.organization_id, contentVersionId),
          latestRender: (slotId) => renders.latest(job.organization_id, slotId),
        })(job, active);
      },
    },
    pollMs: 1000,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.ONEVOICE_SCHEDULER_WORKER !== "1") {
    console.error("Set ONEVOICE_SCHEDULER_WORKER=1 to enable the marketing scheduler.");
    process.exitCode = 1;
  } else {
    const stop = new AbortController();
    process.once("SIGTERM", () => stop.abort());
    process.once("SIGINT", () => stop.abort());
    await runAutomationTick(stop.signal).catch(() => {
      console.error("scheduler_worker_failed");
      process.exitCode = 1;
    });
  }
}
