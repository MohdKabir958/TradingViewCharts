import { CandleData } from './types';

const MAX_CANDLES = 2000;

/**
 * Merges incoming candles with existing ones.
 * - Deduplicates by timestamp
 * - Updates the last candle if timestamps match (live update)
 * - Appends new candles
 * - Caps at MAX_CANDLES (trims oldest)
 */
export function mergeCandles(
  existing: CandleData[],
  incoming: CandleData[]
): CandleData[] {
  if (incoming.length === 0) return existing;
  if (existing.length === 0) return incoming.slice(-MAX_CANDLES);

  // Build a map from existing candles for fast lookup
  const candleMap = new Map<number, CandleData>();
  for (const c of existing) {
    candleMap.set(c.time, c);
  }

  // Merge incoming — update existing timestamps or add new ones
  for (const c of incoming) {
    candleMap.set(c.time, c); // Overwrites if same timestamp
  }

  // Sort by time and cap
  const merged = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

  if (merged.length > MAX_CANDLES) {
    return merged.slice(merged.length - MAX_CANDLES);
  }

  return merged;
}
