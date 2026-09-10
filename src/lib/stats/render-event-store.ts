// SPDX-License-Identifier: Apache-2.0
//
// Supabase-backed RenderEventStore. No `import "server-only"` — the
// store-level stub-fetch test imports this module directly (see D5).

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  RenderEventInput,
  RenderEventStore,
} from "@/lib/render/product-video-pipeline";
import { toRow } from "./render-event.ts";

export type { RenderEventInput, RenderEventStore };

type RenderEventClient = {
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options?: { onConflict?: string },
    ): {
      abortSignal(signal: AbortSignal): Promise<{ error: { code: string } | null }>;
    };
  };
};

export class SupabaseRenderEventStore implements RenderEventStore {
  constructor(
    private readonly client: SupabaseClient | RenderEventClient,
    private readonly organizationId: string,
  ) {}

  async record(input: RenderEventInput, opts: { signal: AbortSignal }): Promise<void> {
    const { error } = await this.client
      .from("render_events")
      .upsert(toRow(input, this.organizationId), { onConflict: "render_id" })
      .abortSignal(opts.signal);
    if (error) throw new Error(error.code || "RENDER_EVENT_WRITE_FAILED");
  }
}
