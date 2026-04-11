/**
 * FPS Monitor — dev-only tool.
 * Logs average FPS every 3 seconds to console.
 * Call startFpsMonitor() to begin, stopFpsMonitor() to end.
 */

let frameCount = 0;
let lastTime = performance.now();
let rafId: number | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;

function countFrame() {
  frameCount++;
  rafId = requestAnimationFrame(countFrame);
}

export function startFpsMonitor(): void {
  if (rafId !== null) return; // Already running

  frameCount = 0;
  lastTime = performance.now();
  rafId = requestAnimationFrame(countFrame);

  intervalId = setInterval(() => {
    const now = performance.now();
    const elapsed = (now - lastTime) / 1000;
    const fps = Math.round(frameCount / elapsed);

    console.log(
      `%c[FPS] ${fps}`,
      fps >= 55
        ? 'color: #10b981; font-weight: bold'
        : fps >= 30
          ? 'color: #f59e0b; font-weight: bold'
          : 'color: #ef4444; font-weight: bold'
    );

    frameCount = 0;
    lastTime = now;
  }, 3000);
}

export function stopFpsMonitor(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
