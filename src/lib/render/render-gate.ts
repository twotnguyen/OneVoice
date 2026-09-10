// SPDX-License-Identifier: Apache-2.0

/** Maximum product renders allowed to hold an ffmpeg pipeline slot at once. */
export const MAX_CONCURRENT_RENDERS = 2;

/**
 * Process-wide guard for the unauthenticated `POST /api/renders` route.
 *
 * - `claim` / `release` dedupe an in-flight `renderId` so a replayed or concurrent
 *   POST cannot run a second pipeline for the same id or blank the first operation's
 *   progress feed in its `finally`.
 * - `acquireSlot` serialises pipeline execution past {@link MAX_CONCURRENT_RENDERS},
 *   so N unauthenticated POSTs cannot spawn N libx264 processes; callers past the
 *   limit wait rather than fail.
 */
export class RenderGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly inFlight = new Set<string>();

  /** Marks `renderId` as in flight. Returns false if it already was. */
  claim(renderId: string): boolean {
    if (this.inFlight.has(renderId)) return false;
    this.inFlight.add(renderId);
    return true;
  }

  release(renderId: string): void {
    this.inFlight.delete(renderId);
  }

  /** Resolves once a pipeline slot is free; the returned callback frees it exactly once. */
  async acquireSlot(): Promise<() => void> {
    if (this.active >= MAX_CONCURRENT_RENDERS) {
      // Wait for a slot. A woken waiter inherits the releaser's slot, so it must NOT
      // increment `active` itself — otherwise a caller arriving in the gap between
      // release and wake could see `active` transiently below the limit and let
      // concurrency exceed MAX_CONCURRENT_RENDERS.
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      });
    } else {
      this.active += 1;
    }
    let freed = false;
    return () => {
      if (freed) return;
      freed = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.active -= 1;
    };
  }
}

/** Shared instance used by the live route; tests construct their own. */
export const sharedRenderGate = new RenderGate();
