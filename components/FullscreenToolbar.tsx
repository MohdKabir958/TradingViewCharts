'use client';

import { useRef, useEffect, useCallback } from 'react';
import { IChartApi } from 'lightweight-charts';
import { CandleData, ChartInterval } from '@/lib/types';
import { calculateDailyChange } from '@/lib/indicators';

interface IndicatorToggles {
  bb: boolean;
  volume: boolean;
  rsi: boolean;
}

interface FullscreenToolbarProps {
  symbol: string;
  candles: CandleData[];
  chartRef: React.RefObject<IChartApi | null>;
  interval: ChartInterval;
  onIntervalChange: (interval: ChartInterval) => void;
  indicators: IndicatorToggles;
  onToggleIndicator: (key: keyof IndicatorToggles) => void;
  onClose: () => void;
}

const INTERVALS: { label: string; value: ChartInterval }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '1D', value: '1d' },
];

function formatVolume(vol: number): string {
  if (vol >= 10_000_000) return (vol / 10_000_000).toFixed(2) + ' Cr';
  if (vol >= 100_000) return (vol / 100_000).toFixed(2) + ' L';
  if (vol >= 1_000) return (vol / 1_000).toFixed(1) + ' K';
  return String(vol);
}

export default function FullscreenToolbar({
  candles,
  chartRef,
  interval,
  onIntervalChange,
  indicators,
  onToggleIndicator,
  onClose,
}: FullscreenToolbarProps) {
  const ohlcRef = useRef<HTMLDivElement>(null);

  const renderOHLC = useCallback((c: {
    open: number; high: number; low: number; close: number;
    volume?: number; time?: number;
  }) => {
    if (!ohlcRef.current) return;
    const isUp = c.close >= c.open;
    const cls = isUp ? 'positive' : 'negative';
    ohlcRef.current.innerHTML = `
      <span class="ohlc-item">O <span class="ohlc-val ${cls}">${c.open.toFixed(2)}</span></span>
      <span class="ohlc-item">H <span class="ohlc-val ${cls}">${c.high.toFixed(2)}</span></span>
      <span class="ohlc-item">L <span class="ohlc-val ${cls}">${c.low.toFixed(2)}</span></span>
      <span class="ohlc-item">C <span class="ohlc-val ${cls}">${c.close.toFixed(2)}</span></span>
      ${c.volume ? `<span class="ohlc-item">Vol <span class="ohlc-val">${formatVolume(c.volume)}</span></span>` : ''}
    `;
  }, []);

  // ─── OHLCV display on crosshair move ─────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !ohlcRef.current) return;

    const chart = chartRef.current;

    const handleCrosshairMove = (param: { time?: unknown; seriesData?: Map<unknown, unknown> }) => {
      if (!ohlcRef.current) return;

      if (!param.time || !param.seriesData || param.seriesData.size === 0) {
        // Show latest candle when not hovering
        if (candles.length > 0) {
          const c = candles[candles.length - 1];
          renderOHLC(c);
        }
        return;
      }

      // Find the candle data from seriesData
      const entries = param.seriesData.entries();
      const first = entries.next().value;
      if (first && first[1]) {
        const data = first[1] as { open?: number; high?: number; low?: number; close?: number };
        if (data.open !== undefined) {
          // Find matching candle for volume
          const timeVal = param.time as number;
          const matchedCandle = candles.find((c) => c.time === timeVal);
          renderOHLC({
            open: data.open,
            high: data.high || 0,
            low: data.low || 0,
            close: data.close || 0,
            volume: matchedCandle?.volume,
            time: timeVal,
          });
        }
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);
    return () => {
      try { chart.unsubscribeCrosshairMove(handleCrosshairMove); } catch { /* unmounted */ }
    };
  }, [chartRef, candles, renderOHLC]);

  // Day stats
  const daily = candles.length > 0 ? calculateDailyChange(candles) : null;
  const dayHigh = candles.length > 0 ? Math.max(...candles.slice(-50).map((c) => c.high)) : 0;
  const dayLow = candles.length > 0 ? Math.min(...candles.slice(-50).map((c) => c.low)) : 0;

  return (
    <>
      {/* ── Fullscreen Top Toolbar ── */}
      <div className="fs-toolbar">
        {/* Timeframe selector */}
        <div className="fs-group">
          <span className="fs-group-label">Timeframe</span>
          <div className="fs-tabs">
            {INTERVALS.map((tf) => (
              <button
                key={tf.value}
                className={`fs-tab ${interval === tf.value ? 'active' : ''}`}
                onClick={() => onIntervalChange(tf.value)}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="fs-divider" />

        {/* Indicator Toggles */}
        <div className="fs-group">
          <span className="fs-group-label">Indicators</span>
          <div className="fs-toggles">
            <button
              className={`fs-toggle ${indicators.bb ? 'active' : ''}`}
              onClick={() => onToggleIndicator('bb')}
              style={{ '--toggle-color': '#2563eb' } as React.CSSProperties}
            >
              <span className="fs-toggle-dot" />
              BB (20,2)
            </button>
            <button
              className={`fs-toggle ${indicators.volume ? 'active' : ''}`}
              onClick={() => onToggleIndicator('volume')}
              style={{ '--toggle-color': '#3b82f6' } as React.CSSProperties}
            >
              <span className="fs-toggle-dot" />
              Volume
            </button>
            <button
              className={`fs-toggle ${indicators.rsi ? 'active' : ''}`}
              onClick={() => onToggleIndicator('rsi')}
              style={{ '--toggle-color': '#06b6d4' } as React.CSSProperties}
            >
              <span className="fs-toggle-dot" />
              RSI 14
            </button>
          </div>
        </div>

        <div className="fs-divider" />

        {/* Close */}
        <button className="fs-close-btn" onClick={onClose} title="Exit fullscreen (Esc)">
          ✕ Close
        </button>
      </div>

      {/* ── Fullscreen Bottom Status Bar ── */}
      <div className="fs-statusbar">
        <div className="fs-ohlc" ref={ohlcRef}>
          <span className="ohlc-item">Hover on chart for OHLCV</span>
        </div>
        <div className="fs-daystats">
          {daily && (
            <>
              <span className="fs-stat">
                Day: <span className={daily.changePercent >= 0 ? 'positive' : 'negative'}>
                  {daily.changePercent >= 0 ? '+' : ''}{daily.changePercent.toFixed(2)}%
                </span>
              </span>
              <span className="fs-stat">Open: ₹{daily.dayOpen.toFixed(2)}</span>
            </>
          )}
          <span className="fs-stat">High: <span className="positive">₹{dayHigh.toFixed(2)}</span></span>
          <span className="fs-stat">Low: <span className="negative">₹{dayLow.toFixed(2)}</span></span>
          <span className="fs-stat">Range: ₹{(dayHigh - dayLow).toFixed(2)}</span>
        </div>
      </div>
    </>
  );
}
