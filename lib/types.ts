// Normalized candle data format for TradingView Lightweight Charts
export interface CandleData {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// Supported chart intervals
export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '1d';

// Result from fetching a single symbol
export interface SymbolData {
  symbol: string;
  candles: CandleData[];
  lastUpdated: number; // Unix timestamp ms
  error?: string;
}

// Multi-symbol fetch result
export interface MultiSymbolData {
  [symbol: string]: SymbolData;
}

// Default symbols for the 16-chart dashboard
export const DEFAULT_SYMBOLS: string[] = [
  'AAPL',
  'MSFT',
  'GOOGL',
  'AMZN',
  'TSLA',
  'META',
  'NVDA',
  'JPM',
  'V',
  'JNJ',
  'WMT',
  'PG',
  'MA',
  'UNH',
  'HD',
  'DIS',
];
