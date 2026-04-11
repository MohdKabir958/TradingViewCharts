/**
 * Batches multiple chart update callbacks into a single requestAnimationFrame.
 * Prevents layout thrashing when 16 charts try to update simultaneously.
 */

type UpdateCallback = () => void;

let pendingUpdates: UpdateCallback[] = [];
let rafId: number | null = null;

function flush() {
  const updates = pendingUpdates;
  pendingUpdates = [];
  rafId = null;

  for (const update of updates) {
    update();
  }
}

/**
 * Schedule a chart update to run in the next animation frame.
 * Multiple calls within the same frame are batched together.
 */
export function scheduleChartUpdate(callback: UpdateCallback): void {
  pendingUpdates.push(callback);

  if (rafId === null) {
    rafId = requestAnimationFrame(flush);
  }
}

/**
 * Cancel all pending updates (e.g., on unmount).
 */
export function cancelPendingUpdates(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  pendingUpdates = [];
}
