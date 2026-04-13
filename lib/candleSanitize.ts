import { CandleData, ChartInterval } from './types';

/** Max fractional move vs anchor allowed for a single bar’s high/low (clips bad feed prints). */
function maxBarStretch(interval: ChartInterval): number {
  switch (interval) {
    case '1m':
    case '5m':
    case '15m':
      return 0.2;
    case '1h':
      return 0.32;
    case '1d':
      return 0.75;
    default:
      return 0.25;
  }
}

/**
 * Yahoo occasionally returns absurd highs/lows on one bar (splits, bad ticks).
 * That blows autoscale and flattens the rest of the chart. Clamp wicks to a
 * plausible band around the bar open and previous close.
 */
export function clampGlitchCandles(
  candles: CandleData[],
  interval: ChartInterval
): CandleData[] {
  if (candles.length <= 1) return candles;
  const stretch = maxBarStretch(interval);
  const out = candles.map((c) => ({ ...c }));

  for (let i = 1; i < out.length; i++) {
    const prevClose = out[i - 1].close;
    const o = out[i].open;
    let h = out[i].high;
    let l = out[i].low;
    const cl = out[i].close;

    if (!Number.isFinite(prevClose) || prevClose <= 0) continue;
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(cl)) {
      continue;
    }

    const anchorTop = Math.max(prevClose, o);
    const anchorBot = Math.min(prevClose, o);
    const hiCap = anchorTop * (1 + stretch);
    const loFloor = anchorBot * (1 - stretch);
    const bodyTop = Math.max(o, cl);
    const bodyBot = Math.min(o, cl);

    if (h > hiCap) {
      h = Math.max(bodyTop, Math.min(h, hiCap));
    }
    if (l < loFloor) {
      l = Math.min(bodyBot, Math.max(l, loFloor));
    }

    h = Math.max(h, bodyTop, l);
    l = Math.min(l, bodyBot, h);

    out[i] = { ...out[i], high: h, low: l };
  }

  return out;
}
