import YahooFinance from 'yahoo-finance2';
import type { ChartResultArrayQuote } from 'yahoo-finance2/modules/chart';
import { Redis } from '@upstash/redis';
import { clampGlitchCandles } from './candleSanitize';
import { CandleData, ChartInterval, SymbolData, MultiSymbolData } from './types';

// ─── Yahoo Finance Client (singleton) ──────────────────────────────
const yahooFinance = new YahooFinance();

// ─── Upstash Redis (optional — omit env in dev/small deploys) ─────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis: Redis | null =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// ─── Cache Configuration ───────────────────────────────────────────
const CACHE_TTL_SECONDS = 30; // 30 seconds cache lifetime

// ─── In-flight request deduplication ───────────────────────────────
const inFlightRequests = new Map<string, Promise<SymbolData>>();

// ─── Interval Mapping ──────────────────────────────────────────────
type YahooInterval = '1m' | '5m' | '15m' | '1h' | '1d';

function getYahooInterval(interval: ChartInterval): YahooInterval {
  const map: Record<ChartInterval, YahooInterval> = {
    '1m': '1m',
    '5m': '5m',
    '15m': '15m',
    '1h': '1h',
    '1d': '1d',
  };
  return map[interval];
}

function getPeriodDays(interval: ChartInterval): number {
  const map: Record<ChartInterval, number> = {
    '1m': 5,
    '5m': 5,
    '15m': 30,
    '1h': 30,
    '1d': 180,
  };
  return map[interval];
}

// ─── Normalize Yahoo Data ──────────────────────────────────────────
function normalizeCandles(quotes: ChartResultArrayQuote[]): CandleData[] {
  return quotes
    .filter(
      (q) =>
        q.date != null &&
        q.open != null &&
        q.high != null &&
        q.low != null &&
        q.close != null
    )
    .map((q) => ({
      time: Math.floor(new Date(q.date).getTime() / 1000),
      open: Number(q.open),
      high: Number(q.high),
      low: Number(q.low),
      close: Number(q.close),
      volume: q.volume != null ? Number(q.volume) : undefined,
    }))
    .filter(
      (c) =>
        Number.isFinite(c.time) &&
        Number.isFinite(c.open) &&
        Number.isFinite(c.high) &&
        Number.isFinite(c.low) &&
        Number.isFinite(c.close)
    );
}

// ─── Redis Cache Helpers ───────────────────────────────────────────
function cacheKey(symbol: string, interval: ChartInterval): string {
  return `chart:${symbol}:${interval}`;
}

async function getFromCache(symbol: string, interval: ChartInterval): Promise<SymbolData | null> {
  if (!redis) return null;
  try {
    const data = await redis.get<SymbolData>(cacheKey(symbol, interval));
    if (!data?.candles?.length) return data;
    return {
      ...data,
      candles: clampGlitchCandles(data.candles, interval),
    };
  } catch (err) {
    console.error(`[Redis] Cache read error for ${symbol}:`, err);
    return null;
  }
}

async function setToCache(symbol: string, interval: ChartInterval, data: SymbolData): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(cacheKey(symbol, interval), data, { ex: CACHE_TTL_SECONDS });
  } catch (err) {
    console.error(`[Redis] Cache write error for ${symbol}:`, err);
  }
}

// ─── Single Symbol Fetch ───────────────────────────────────────────
async function fetchSingleSymbol(
  symbol: string,
  interval: ChartInterval
): Promise<SymbolData> {
  const key = `${symbol}:${interval}`;

  // 1. Check Redis cache first
  const cached = await getFromCache(symbol, interval);
  if (cached) {
    return cached;
  }

  // 2. Check for in-flight request (deduplication)
  const inFlight = inFlightRequests.get(key);
  if (inFlight) {
    return inFlight;
  }

  // 3. Create new request
  const requestPromise = (async (): Promise<SymbolData> => {
    try {
      const yahooInterval = getYahooInterval(interval);
      const periodDays = getPeriodDays(interval);

      const period1 = new Date();
      period1.setDate(period1.getDate() - periodDays);

      const result = await yahooFinance.chart(symbol, {
        period1,
        interval: yahooInterval,
      });

      const quotes = result?.quotes;
      const raw = normalizeCandles(Array.isArray(quotes) ? quotes : []);
      const candles = clampGlitchCandles(raw, interval);

      const symbolData: SymbolData = {
        symbol,
        candles,
        lastUpdated: Date.now(),
      };

      // Write to Redis cache
      await setToCache(symbol, interval, symbolData);

      return symbolData;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error fetching data';

      // Server-side error log — goes to server logs only
      console.error(`[DataProvider] ${symbol}:`, errorMessage);

      return {
        symbol,
        candles: [],
        lastUpdated: Date.now(),
        error: errorMessage,
      };
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, requestPromise);

  return requestPromise;
}

// ─── Multi-Symbol Fetch ────────────────────────────────────────────
export async function fetchMultipleSymbols(
  symbols: string[],
  interval: ChartInterval = '5m'
): Promise<MultiSymbolData> {
  const results = await Promise.allSettled(
    symbols.map((symbol) => fetchSingleSymbol(symbol, interval))
  );

  const data: MultiSymbolData = {};

  results.forEach((result, index) => {
    const symbol = symbols[index];
    if (result.status === 'fulfilled') {
      data[symbol] = result.value;
    } else {
      data[symbol] = {
        symbol,
        candles: [],
        lastUpdated: Date.now(),
        error: result.reason?.message || 'Failed to fetch',
      };
    }
  });

  return data;
}

// ─── Single Symbol Export ──────────────────────────────────────────
export async function fetchSymbolData(
  symbol: string,
  interval: ChartInterval = '5m'
): Promise<SymbolData> {
  return fetchSingleSymbol(symbol, interval);
}

// ─── Clear Cache ───────────────────────────────────────────────────
export async function clearCache(symbols?: string[], interval?: ChartInterval): Promise<void> {
  if (!redis) return;
  try {
    if (symbols && interval) {
      await Promise.all(symbols.map((s) => redis.del(cacheKey(s, interval))));
    }
    // Cache cleared successfully
  } catch (err) {
    console.error('[DataProvider] Cache clear error:', err);
  }
}
