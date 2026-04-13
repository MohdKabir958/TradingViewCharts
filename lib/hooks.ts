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
    // Re-sync when `symbol` changes (initial useState only runs once per mount).
    const current = chartStore.get(symbol);
    if (current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external store snapshot when symbol changes
      setState(current);
    }

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
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 5_000;

  const fetchData = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    try {
      const symbolsParam = symbols.join(',');
      const res = await fetch(
        `/api/charts?symbols=${encodeURIComponent(symbolsParam)}&interval=${encodeURIComponent(interval)}`
      );

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();

      if (json.success && json.data) {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        for (const symbol of symbols) {
          const symbolData = json.data[symbol];
          if (symbolData) {
            chartStore.update(symbol, symbolData.candles, symbolData.error);
          }
        }
        setLastUpdate(new Date().toLocaleTimeString());
        setError(null);
        retryCountRef.current = 0;
      } else {
        const msg =
          typeof json.error === 'string' ? json.error : 'Failed to load chart data';
        setError(msg);
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null;
            void fetchData();
          }, RETRY_DELAY * retryCountRef.current);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setError(msg);

      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          void fetchData();
        }, RETRY_DELAY * retryCountRef.current);
      }
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [symbols, interval]);

  useEffect(() => {
    void fetchData();
    const timer = setInterval(() => void fetchData(), refreshMs);
    return () => {
      clearInterval(timer);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [fetchData, refreshMs]);

  return { isLoading, lastUpdate, error, refetch: fetchData };
}
