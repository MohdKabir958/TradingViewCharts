import { Redis } from '@upstash/redis';
import { clampGlitchCandles } from './candleSanitize';
import { CandleData, ChartInterval, SymbolData, MultiSymbolData } from './types';

// ─── Upstash Redis (optional — omit env in dev/small deploys) ─────
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis: Redis | null =
  redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// ─── Browser-like headers to bypass Vercel/datacenter IP blocks ────
// Yahoo Finance blocks cloud IPs; spoofing a real browser User-Agent fixes this.
const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://finance.yahoo.com',
  'Referer': 'https://finance.yahoo.com/',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

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


// ─── Yahoo Finance v8 chart URL builder ───────────────────────────
// Using direct fetch() instead of the SDK so we can set browser-like headers.
// The SDK's internal HTTP client gets blocked by Yahoo on cloud/Vercel IPs.
function buildYahooUrl(symbol: string, interval: ChartInterval): string {
  const yahooInterval = getYahooInterval(interval);
  // Fetch 5d of raw data — filterToLatestTradingDay() will trim to the newest session only.
  // Using 5d (not 1d) ensures we always have a previous trading day when market is closed.
  const rangeMap: Record<ChartInterval, string> = {
    '1m':  '5d',
    '5m':  '5d',
    '15m': '5d',
    '1h':  '5d',
    '1d':  '5d',   // daily: show last 5 trading days for context
  };
  const range = rangeMap[interval];
  return (
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=${yahooInterval}&range=${range}&includePrePost=false&events=none`
  );
}

// ─── Normalize Yahoo v8 JSON response ─────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCandles(result: any): CandleData[] {
  const chart = result?.chart?.result?.[0];
  if (!chart) return [];

  const timestamps: number[] = chart.timestamp ?? [];
  const q = chart.indicators?.quote?.[0] ?? {};
  const opens: number[] = q.open ?? [];
  const highs: number[] = q.high ?? [];
  const lows: number[] = q.low ?? [];
  const closes: number[] = q.close ?? [];
  const volumes: number[] = q.volume ?? [];

  const candles: CandleData[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    if (
      time != null && open != null && high != null &&
      low != null && close != null &&
      Number.isFinite(open) && Number.isFinite(high) &&
      Number.isFinite(low) && Number.isFinite(close)
    ) {
      candles.push({
        // Shift UTC → IST so chart x-axis shows 09:15–15:30 IST natively
        time: time + IST_OFFSET_SEC,
        open,
        high,
        low,
        close,
        volume: volumes[i] != null ? Number(volumes[i]) : undefined,
      });
    }
  }
  return candles;
}

// ─── Filter to latest trading day (IST) ──────────────────────────────
// Yahoo's 5d range for a 5-minute interval includes multi-day data.
// We find the latest trading date in the fetched candles (in IST UTC+5:30)
// and discard everything from earlier dates.
// This gives: live market → today's candles; closed market → last session.
const IST_OFFSET_SEC = 5.5 * 60 * 60; // 19800 seconds

function filterToLatestTradingDay(candles: CandleData[]): CandleData[] {
  if (candles.length === 0) return candles;

  // Timestamps are already IST (pre-shifted in normalizeCandles),
  // so we just floor-divide by 86400 to get the IST day number.
  const dayOf = (t: number) => Math.floor(t / 86400);

  const latestDay = dayOf(candles[candles.length - 1].time);
  return candles.filter((c) => dayOf(c.time) === latestDay);
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

  // 3. Create new request using direct fetch() with browser-like headers
  const requestPromise = (async (): Promise<SymbolData> => {
    try {
      const url = buildYahooUrl(symbol, interval);

      // Two attempts — Yahoo occasionally returns non-JSON on first hit
      let json: unknown = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(url, {
          headers: YAHOO_HEADERS,
          // Disable Next.js fetch cache — we manage caching via Redis
          cache: 'no-store',
        });

        if (!res.ok) {
          console.error(`[DataProvider] ${symbol} HTTP ${res.status} (attempt ${attempt + 1})`);
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          throw new Error(`Yahoo Finance returned HTTP ${res.status}`);
        }

        const text = await res.text();
        try {
          json = JSON.parse(text);
          break;
        } catch {
          if (attempt === 0) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          throw new Error('Yahoo Finance returned non-JSON response');
        }
      }

      const raw = normalizeCandles(json);
      // For intraday: keep only the latest trading day's candles
      // For daily (1d): keep all bars so the daily chart has context
      const filtered = interval !== '1d' ? filterToLatestTradingDay(raw) : raw;
      const candles = clampGlitchCandles(filtered, interval);

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

      // Server-side error log — goes to Vercel function logs
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
/** Small batches + pause reduce Yahoo 429s and keep Vercel functions under time limits. */
const YAHOO_BATCH_SIZE = 4;
const YAHOO_BATCH_PAUSE_MS = 150;

export async function fetchMultipleSymbols(
  symbols: string[],
  interval: ChartInterval = '5m'
): Promise<MultiSymbolData> {
  const data: MultiSymbolData = {};

  for (let i = 0; i < symbols.length; i += YAHOO_BATCH_SIZE) {
    const slice = symbols.slice(i, i + YAHOO_BATCH_SIZE);
    const results = await Promise.allSettled(
      slice.map((symbol) => fetchSingleSymbol(symbol, interval))
    );

    results.forEach((result, j) => {
      const symbol = slice[j];
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

    if (i + YAHOO_BATCH_SIZE < symbols.length) {
      await new Promise((r) => setTimeout(r, YAHOO_BATCH_PAUSE_MS));
    }
  }

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
