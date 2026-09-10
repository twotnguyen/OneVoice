// SPDX-License-Identifier: Apache-2.0

import type { RenderStage } from "./types";

export type RunningRender = Readonly<{ renderId: string; status: "running"; stage: RenderStage }>;
type Entry = Readonly<{ stage: RenderStage; updatedAt: number }>;
type Options = Readonly<{ maxEntries?: number; maxAgeMs?: number; now?: () => number }>;

export class RenderProgressStore {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;

  constructor(options: Options = {}) {
    this.maxEntries = options.maxEntries ?? 100;
    this.maxAgeMs = options.maxAgeMs ?? 10 * 60_000;
    this.now = options.now ?? Date.now;
  }

  private prune(): void {
    const cutoff = this.now() - this.maxAgeMs;
    for (const [id, entry] of this.entries) {
      if (entry.updatedAt < cutoff) this.entries.delete(id);
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  start(renderId: string): void {
    this.entries.delete(renderId);
    this.entries.set(renderId, { stage: "loading_product", updatedAt: this.now() });
    this.prune();
  }

  update(renderId: string, stage: RenderStage): void {
    if (!this.entries.has(renderId)) return;
    this.entries.delete(renderId);
    this.entries.set(renderId, { stage, updatedAt: this.now() });
  }

  get(renderId: string): RunningRender | null {
    this.prune();
    const entry = this.entries.get(renderId);
    return entry ? { renderId, status: "running", stage: entry.stage } : null;
  }

  clear(renderId: string): void { this.entries.delete(renderId); }
}
