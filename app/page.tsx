'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import MultiChart from '@/components/MultiChart';
import { ChartInterval } from '@/lib/types';
import { SYMBOLS } from '@/lib/symbols';
import { useDataFetcher } from '@/lib/hooks';
import { startFpsMonitor, stopFpsMonitor } from '@/lib/fpsMonitor';
import { chartStore } from '@/lib/store';
import CompareOverlay from '@/components/CompareOverlay';

const INTERVALS: { label: string; value: ChartInterval }[] = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '1D', value: '1d' },
];

const GRID_OPTIONS = [
  { label: '2', cols: 2 },
  { label: '3', cols: 3 },
  { label: '4', cols: 4 },
];

export default function HomePage() {
  const [interval, setInterval] = useState<ChartInterval>('5m');
  const [gridCols, setGridCols] = useState(4);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [compareSymbols, setCompareSymbols] = useState<[string, string]>(
    [SYMBOLS[0], SYMBOLS[1] || SYMBOLS[0]]
  );
  const { isLoading, lastUpdate, error, refetch } = useDataFetcher(SYMBOLS, interval);

  // FPS monitor — dev only
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      startFpsMonitor();
      return () => stopFpsMonitor();
    }
  }, []);

  // Theme toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Apply grid columns as CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--grid-cols', String(gridCols));
  }, [gridCols]);

  // Switch timeframe — clear store so charts reload fresh
  const handleIntervalChange = useCallback((newInterval: ChartInterval) => {
    chartStore.clear();
    setInterval(newInterval);
  }, []);

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="header-title">
            <div className="header-logo">📊</div>
            <h1>Trading Terminal</h1>
          </div>

          {/* ── Center Controls ── */}
          <div className="header-controls">
            {/* Indices Page */}
            <Link
              href="/indices"
              className="control-action-btn"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5, color: 'var(--accent-cyan)' }}
            >
              📈 Indices
            </Link>

            {/* Compare Mode */}
            <button
              className="control-action-btn"
              onClick={() => setIsCompareMode(true)}
              title="Compare any two charts side-by-side"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-blue)', borderColor: 'var(--accent-blue)' }}
            >
              ◫ Compare
            </button>

            <div className="fs-divider" style={{ margin: '0 8px', height: '24px' }} />

            {/* Timeframe */}
            <div className="control-group">
              <span className="control-label">Timeframe</span>
              <div className="control-tabs">
                {INTERVALS.map((tf) => (
                  <button
                    key={tf.value}
                    className={`control-tab ${interval === tf.value ? 'active' : ''}`}
                    onClick={() => handleIntervalChange(tf.value)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid Layout */}
            <div className="control-group">
              <span className="control-label">Grid</span>
              <div className="control-tabs">
                {GRID_OPTIONS.map((g) => (
                  <button
                    key={g.cols}
                    className={`control-tab ${gridCols === g.cols ? 'active' : ''}`}
                    onClick={() => setGridCols(g.cols)}
                  >
                    {g.label}×{g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme toggle */}
            <button
              className="control-action-btn"
              onClick={() => setIsDark((d) => !d)}
              title={isDark ? 'Switch to Light' : 'Switch to Dark'}
              style={{ fontSize: '1rem' }}
            >
              {isDark ? '☀️' : '🌙'}
            </button>

            {/* Refresh */}
            <button
              className="control-action-btn"
              onClick={refetch}
              disabled={isLoading}
              title="Refresh all charts"
            >
              ↻ Refresh
            </button>
          </div>

          {/* ── Status ── */}
          <div className="header-status">
            {error ? (
              <div className="status-badge" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <span className="status-dot" style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.6)' }} />
                <span style={{ color: '#ef4444' }}>Offline</span>
              </div>
            ) : (
              <div className="status-badge">
                <span className="status-dot" />
                <span>{isLoading ? 'Loading' : 'Live'}</span>
              </div>
            )}
            <div className="status-badge">
              <span>Updated: {lastUpdate}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Chart Grid ── */}
      <main>
        <MultiChart symbols={SYMBOLS} interval={interval} />
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        Data provided by Yahoo Finance • {SYMBOLS.length} charts • Auto-refresh every 30s
      </footer>

      {/* ── Compare Overlay ── */}
      {isCompareMode && (
        <CompareOverlay
          onClose={() => setIsCompareMode(false)}
          initialSymbols={compareSymbols}
          onSymbolsChange={setCompareSymbols}
          interval={interval}
        />
      )}
    </div>
  );
}
