import { CandleData } from './types';

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(
  candles: CandleData[],
  period: number
): { time: number; value: number }[] {
  const result: { time: number; value: number }[] = [];

  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close;
    }
    result.push({
      time: candles[i].time,
      value: sum / period,
    });
  }

  return result;
}

/**
 * Calculate RSI (Relative Strength Index)
 * Default period: 14
 */
export function calculateRSI(
  candles: CandleData[],
  period: number = 14
): { time: number; value: number }[] {
  if (candles.length < period + 1) return [];

  const result: { time: number; value: number }[] = [];
  const gains: number[] = [];
  const losses: number[] = [];

  // Calculate price changes
  for (let i = 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }

  // First average gain/loss (SMA)
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += gains[i];
    avgLoss += losses[i];
  }
  avgGain /= period;
  avgLoss /= period;

  // First RSI value
  const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push({
    time: candles[period].time,
    value: 100 - 100 / (1 + rs0),
  });

  // Subsequent values using exponential smoothing
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push({
      time: candles[i + 1].time,
      value: 100 - 100 / (1 + rs),
    });
  }

  return result;
}

/**
 * Calculate daily percentage change
 * Returns the change from the first candle of the current day to the latest candle
 */
export function calculateDailyChange(candles: CandleData[]): {
  change: number;
  changePercent: number;
  dayOpen: number;
  current: number;
} | null {
  if (candles.length === 0) return null;

  const latest = candles[candles.length - 1];
  const latestDate = new Date(latest.time * 1000);
  const todayStart = new Date(latestDate);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartUnix = Math.floor(todayStart.getTime() / 1000);

  // Find the first candle of today
  let dayOpen = latest.open;
  for (const c of candles) {
    if (c.time >= todayStartUnix) {
      dayOpen = c.open;
      break;
    }
  }

  const change = latest.close - dayOpen;
  const changePercent = (change / dayOpen) * 100;

  return { change, changePercent, dayOpen, current: latest.close };
}
