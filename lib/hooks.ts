import { useEffect, useRef, useState, useCallback } from 'react';
import { chartStore, SymbolState } from './store';

/**
 * Hook to subscribe to a single symbol's data in the store.
 * Only triggers re-render when THIS symbol's data changes.
 */
export function useSymbolData(symbol: string): SymbolState | undefined {
  const [state, setState] = useState<SymbolState | undefined>(
    () => chartStore.get(symbol)
  );

  useEffect(() => {
    const current = chartStore.get(symbol);
    if (current) setState(current);

    const unsubscribe = chartStore.subscribe(symbol, (_sym, newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, [symbol]);

  return state;
}

/**
 * Hook to fetch data from API and push into the store.
 * Runs on an interval with retry logic and error tracking.
 */
export function useDataFetcher(
  symbols: string[],
  interval: string,
  refreshMs: number = 30_000
) {
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('—');
  const [error, setError] = useState<string | null>(null);
  const fetchingRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5_000;

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const symbolsParam = symbols.join(',');
      const res = await fetch(
        `/api/charts?symbols=${symbolsParam}&interval=${interval}`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();

      if (json.success && json.data) {
        for (const symbol of symbols) {
          const symbolData = json.data[symbol];
          if (symbolData) {
            chartStore.update(symbol, symbolData.candles, symbolData.error);
          }
        }
        setLastUpdate(new Date().toLocaleTimeString());
        setError(null);
        retryCountRef.current = 0;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setError(msg);

      // Retry with backoff
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setTimeout(fetchData, RETRY_DELAY * retryCountRef.current);
      }
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [symbols, interval]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, refreshMs);
    return () => clearInterval(timer);
  }, [fetchData, refreshMs]);

  return { isLoading, lastUpdate, error, refetch: fetchData };
}
