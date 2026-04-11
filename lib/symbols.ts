/**
 * Symbol Configuration
 *
 * Edit this file to change the stocks displayed on the dashboard.
 * Yahoo Finance uses .NS suffix for NSE stocks.
 * When migrating to Zerodha Kite, remove the .NS suffix.
 *
 * Format:
 *   Yahoo Finance: "RELIANCE.NS"
 *   Zerodha Kite:  "RELIANCE" (instrument token based)
 */

export const SYMBOLS = [
  'RELIANCE.NS',
  'TCS.NS',
  'HDFCBANK.NS',
  'INFY.NS',
  'ICICIBANK.NS',
  'HINDUNILVR.NS',
  'SBIN.NS',
  'BHARTIARTL.NS',
  'KOTAKBANK.NS',
  'LT.NS',
  'ITC.NS',
  'AXISBANK.NS',
  'BAJFINANCE.NS',
  'MARUTI.NS',
  'WIPRO.NS',
  'SUNPHARMA.NS',
];

// Display name mapping (strips .NS suffix for clean UI)
export function getDisplayName(symbol: string): string {
  return symbol.replace('.NS', '').replace('.BO', '');
}

// Total chart count
export const CHART_COUNT = SYMBOLS.length;
