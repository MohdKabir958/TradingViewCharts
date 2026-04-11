import { CandleData } from './types';
import { mergeCandles } from './candleBuilder';

// ─── Types ─────────────────────────────────────────────────────────
export interface SymbolState {
  candles: CandleData[];
  lastUpdated: number;
  error?: string;
}

type Listener = (symbol: string, state: SymbolState) => void;

// ─── Store ─────────────────────────────────────────────────────────
class ChartStore {
  private data = new Map<string, SymbolState>();
  private listeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();

  /**
   * Get current state for a symbol
   */
  get(symbol: string): SymbolState | undefined {
    return this.data.get(symbol);
  }

  /**
   * Get all symbol states
   */
  getAll(): Map<string, SymbolState> {
    return this.data;
  }

  /**
   * Update a symbol with new candles.
   * Merges with existing data and notifies subscribers.
   */
  update(symbol: string, candles: CandleData[], error?: string): void {
    const existing = this.data.get(symbol);
    const mergedCandles = existing
      ? mergeCandles(existing.candles, candles)
      : mergeCandles([], candles);

    const newState: SymbolState = {
      candles: mergedCandles,
      lastUpdated: Date.now(),
      error,
    };

    this.data.set(symbol, newState);
    this.notify(symbol, newState);
  }

  /**
   * Subscribe to changes for a specific symbol.
   * Returns unsubscribe function.
   */
  subscribe(symbol: string, listener: Listener): () => void {
    if (!this.listeners.has(symbol)) {
      this.listeners.set(symbol, new Set());
    }
    this.listeners.get(symbol)!.add(listener);

    return () => {
      this.listeners.get(symbol)?.delete(listener);
    };
  }

  /**
   * Subscribe to ALL symbol changes.
   * Returns unsubscribe function.
   */
  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Notify listeners for a specific symbol
   */
  private notify(symbol: string, state: SymbolState): void {
    // Symbol-specific listeners
    const symbolListeners = this.listeners.get(symbol);
    if (symbolListeners) {
      for (const listener of symbolListeners) {
        listener(symbol, state);
      }
    }

    // Global listeners
    for (const listener of this.globalListeners) {
      listener(symbol, state);
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear();
  }
}

// Singleton instance
export const chartStore = new ChartStore();
