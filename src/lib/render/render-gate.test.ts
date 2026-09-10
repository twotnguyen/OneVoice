// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";

import { MAX_CONCURRENT_RENDERS, RenderGate } from "./render-gate";

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("RenderGate.acquireSlot", () => {
  it("never holds more than MAX_CONCURRENT_RENDERS slots, even when acquires arrive during the release/wake gap", async () => {
    const gate = new RenderGate();
    let held = 0;
    let peak = 0;

    const acquireHoldRelease = async () => {
      const release = await gate.acquireSlot();
      held += 1;
      peak = Math.max(peak, held);
      await macrotask();
      held -= 1;
      release();
    };

    // First wave saturates the gate and queues extras.
    const wave1 = Array.from({ length: MAX_CONCURRENT_RENDERS + 2 }, acquireHoldRelease);
    // Second wave lands while wave 1 is releasing and waking waiters — the window
    // where the old implementation briefly dropped `active` below the limit.
    await macrotask();
    const wave2 = Array.from({ length: 3 }, acquireHoldRelease);

    await Promise.all([...wave1, ...wave2]);

    expect(peak).toBe(MAX_CONCURRENT_RENDERS);
  });

  it("hands freed slots to waiters in FIFO order", async () => {
    const gate = new RenderGate();
    const entered: number[] = [];

    const run = async (n: number) => {
      const release = await gate.acquireSlot();
      entered.push(n);
      await Promise.resolve();
      release();
    };

    const total = MAX_CONCURRENT_RENDERS + 3;
    await Promise.all(Array.from({ length: total }, (_, i) => run(i)));

    expect(entered).toEqual(Array.from({ length: total }, (_, i) => i));
  });

  it("frees the slot when nobody is waiting", async () => {
    const gate = new RenderGate();
    const first = await gate.acquireSlot();
    const second = await gate.acquireSlot();
    first();
    second();

    let thirdResolved = false;
    const third = gate.acquireSlot().then((release) => {
      thirdResolved = true;
      return release;
    });
    await macrotask();
    expect(thirdResolved).toBe(true);
    (await third)();
  });

  it("treats a double release as a single release", async () => {
    const gate = new RenderGate();
    const first = await gate.acquireSlot();
    const second = await gate.acquireSlot();
    first();
    first(); // must not over-free a slot

    const third = await gate.acquireSlot(); // takes the one genuinely freed slot

    let fourthResolved = false;
    const fourth = gate.acquireSlot().then((release) => {
      fourthResolved = true;
      return release;
    });
    await macrotask();
    expect(fourthResolved).toBe(false); // gate is full again (second + third)

    second();
    third();
    (await fourth)();
  });
});

describe("RenderGate.claim / release", () => {
  it("dedupes an in-flight id until it is released", () => {
    const gate = new RenderGate();
    expect(gate.claim("a")).toBe(true);
    expect(gate.claim("a")).toBe(false);
    gate.release("a");
    expect(gate.claim("a")).toBe(true);
  });
});
