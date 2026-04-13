'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickData, Time, CandlestickSeries,
  LineSeries, HistogramSeries, CrosshairMode,
} from 'lightweight-charts';
import { chartStore, SymbolState } from '@/lib/store';
import { scheduleChartUpdate } from '@/lib/rafBatcher';
import { CandleData, ChartInterval } from '@/lib/types';
import { calculateSMA, calculateRSI, calculateDailyChange } from '@/lib/indicators';
import SymbolSelector from './SymbolSelector';
import ChartControls from './ChartControls';
import FullscreenToolbar from './FullscreenToolbar';

interface ChartCardProps {
  symbol: string;
  globalInterval?: ChartInterval;
  onSymbolChange?: (symbol: string) => void;
}

interface IndicatorToggles {
  sma20: boolean;
  sma50: boolean;
  volume: boolean;
  rsi: boolean;
}

function throttle<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = ms - (now - lastCall);
    if (remaining <= 0) {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      lastCall = now;
      fn(...args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now(); timeoutId = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

// Detect currency symbol from ticker suffix
function getCurrencySymbol(symbol: string): string {
  if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) return '₹';
  return '$';
}

export default function ChartCard({ symbol: initialSymbol, globalInterval = '5m', onSymbolChange }: ChartCardProps) {
  const [activeSymbol, setActiveSymbol] = useState(initialSymbol);
  const [crosshairEnabled, setCrosshairEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartInterval, setChartInterval] = useState<ChartInterval>(globalInterval);
  const [indicators, setIndicators] = useState<IndicatorToggles>({
    sma20: true, sma50: true, volume: true, rsi: true,
  });
  const [currentCandles, setCurrentCandles] = useState<CandleData[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const sma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  /** Outer RSI pane (show/hide). Inner host must be chart-only for Lightweight Charts sizing. */
  const rsiPanelRef = useRef<HTMLDivElement>(null);
  const rsiChartHostRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const priceRef = useRef<HTMLSpanElement>(null);

  const lastCandleCountRef = useRef<number>(0);
  const rsiPointCountRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ─── Sync global interval → per-card interval ─────────────────────
  useEffect(() => {
    // Only sync when NOT in fullscreen (user may have overridden it there)
    if (!isFullscreen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror dashboard timeframe when not in fullscreen override
      setChartInterval(globalInterval);
    }
  }, [globalInterval, isFullscreen]);

  // ─── Indicator visibility ────────────────────────────────────────
  useEffect(() => {
    if (sma20SeriesRef.current) {
      sma20SeriesRef.current.applyOptions({
        visible: indicators.sma20,
      });
    }
  }, [indicators.sma20]);

  useEffect(() => {
    if (sma50SeriesRef.current) {
      sma50SeriesRef.current.applyOptions({
        visible: indicators.sma50,
      });
    }
  }, [indicators.sma50]);

  useEffect(() => {
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.applyOptions({
        visible: indicators.volume,
      });
    }
  }, [indicators.volume]);

  useEffect(() => {
    const panel = rsiPanelRef.current;
    if (panel) {
      panel.style.display = indicators.rsi ? 'block' : 'none';
    }
  }, [indicators.rsi]);

  const handleToggleIndicator = useCallback((key: keyof IndicatorToggles) => {
    setIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ─── Update displays ────────────────────────────────────────────
  const updateDisplays = useCallback((candles: CandleData[]) => {
    if (candles.length === 0) return;

    const latest = candles[candles.length - 1];
    const price = latest.close.toFixed(2);
    const daily = calculateDailyChange(candles);
    const dPos = daily ? daily.changePercent >= 0 : true;

    if (priceRef.current) {
      const currencySymbol = getCurrencySymbol(activeSymbol);
      priceRef.current.className = `chart-price ${dPos ? 'positive' : 'negative'}`;
      const pct =
        daily != null
          ? `${daily.changePercent >= 0 ? '+' : ''}${daily.changePercent.toFixed(2)}%`
          : '—';
      const arrow = daily != null ? (daily.changePercent >= 0 ? '▲' : '▼') : '';
      priceRef.current.innerHTML = `${currencySymbol}${price}<span class="chart-price-change"><span class="chart-price-arrow" aria-hidden="true">${arrow}</span> ${pct}</span>`;
    }

    // Store candles for fullscreen toolbar
    setCurrentCandles(candles);
  }, [activeSymbol]);

  const createHandler = useCallback(() => {
    return throttle((_sym: string, state: SymbolState) => {
      scheduleChartUpdate(() => {
        if (!seriesRef.current || !chartRef.current) return;
        const { candles } = state;
        if (candles.length === 0) return;

        const formatted: CandlestickData<Time>[] = candles.map((c) => ({
          time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close,
        }));

        const volumeData = candles.map((c) => ({
          time: c.time as Time,
          value: c.volume || 0,
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)',
        }));

        const sma20Data = calculateSMA(candles, 20).map((d) => ({
          time: d.time as Time, value: d.value,
        }));
        const sma50Data = calculateSMA(candles, 50).map((d) => ({
          time: d.time as Time, value: d.value,
        }));
        const rsiData = calculateRSI(candles).map((d) => ({
          time: d.time as Time, value: d.value,
        }));

        if (!initializedRef.current) {
          seriesRef.current.setData(formatted);
          volumeSeriesRef.current?.setData(volumeData);
          sma20SeriesRef.current?.setData(sma20Data);
          sma50SeriesRef.current?.setData(sma50Data);
          rsiSeriesRef.current?.setData(rsiData);
          rsiPointCountRef.current = rsiData.length;
          chartRef.current.timeScale().fitContent();
          rsiChartRef.current?.timeScale().fitContent();
          initializedRef.current = true;
          lastCandleCountRef.current = candles.length;
        } else {
          const last = formatted[formatted.length - 1];
          seriesRef.current.update(last);
          if (volumeData.length > 0) volumeSeriesRef.current?.update(volumeData[volumeData.length - 1]);
          if (sma20Data.length > 0) sma20SeriesRef.current?.update(sma20Data[sma20Data.length - 1]);
          if (sma50Data.length > 0) sma50SeriesRef.current?.update(sma50Data[sma50Data.length - 1]);
          // RSI needs full setData when the series was empty (<15 bars on first paint) or bar count changes;
          // update(last) alone never draws a line on an empty series.
          const rsi = rsiSeriesRef.current;
          if (rsi) {
            if (rsiData.length === 0) {
              rsi.setData([]);
              rsiPointCountRef.current = 0;
            } else if (
              rsiPointCountRef.current === 0 ||
              rsiData.length !== rsiPointCountRef.current
            ) {
              rsi.setData(rsiData);
              rsiPointCountRef.current = rsiData.length;
            } else {
              rsi.update(rsiData[rsiData.length - 1]);
            }
          }
          lastCandleCountRef.current = candles.length;
        }

        updateDisplays(candles);
      });
    }, 250);
  }, [updateDisplays]);

  // ─── Initialize charts ONCE ──────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !rsiChartHostRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const sma20 = chart.addSeries(LineSeries, {
      color: '#f59e0b', lineWidth: 1,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });

    const sma50 = chart.addSeries(LineSeries, {
      color: '#8b5cf6', lineWidth: 1,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    sma20SeriesRef.current = sma20;
    sma50SeriesRef.current = sma50;

    // RSI chart
    const rsiChart = createChart(rsiChartHostRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', fontSize: 9, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(100, 116, 139, 0.1)', style: 2 } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.05 }, autoScale: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const rsiLine = rsiChart.addSeries(LineSeries, {
      color: '#06b6d4', lineWidth: 2,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: true,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiLine;

    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) rsiChart.timeScale().setVisibleLogicalRange(range);
    });

    return () => {
      chart.remove(); rsiChart.remove();
      chartRef.current = null; seriesRef.current = null;
      volumeSeriesRef.current = null; sma20SeriesRef.current = null; sma50SeriesRef.current = null;
      rsiChartRef.current = null; rsiSeriesRef.current = null;
    };
  }, []);

  const fetchSymbolData = useCallback(async (symbol: string, interval: string) => {
    try {
      const res = await fetch(`/api/charts?symbols=${symbol}&interval=${interval}`);
      const json = await res.json();
      if (json.success && json.data?.[symbol]) {
        chartStore.update(symbol, json.data[symbol].candles, json.data[symbol].error);
      }
    } catch { /* handled */ }
  }, []);

  // ─── Subscribe to active symbol ──────────────────────────────────
  useEffect(() => {
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    initializedRef.current = false;
    lastCandleCountRef.current = 0;
    rsiPointCountRef.current = 0;
    seriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);
    sma20SeriesRef.current?.setData([]);
    sma50SeriesRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    if (priceRef.current) { priceRef.current.innerHTML = '...'; priceRef.current.className = 'chart-price'; }
    const handler = createHandler();
    const existing = chartStore.get(activeSymbol);
    if (existing && existing.candles.length > 0) handler(activeSymbol, existing);
    else fetchSymbolData(activeSymbol, chartInterval);
    unsubscribeRef.current = chartStore.subscribe(activeSymbol, handler);

    return () => { if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; } };
  }, [activeSymbol, createHandler, chartInterval, fetchSymbolData]);


  const handleSymbolChange = (s: string) => {
    if (s !== activeSymbol) {
      setActiveSymbol(s);
      onSymbolChange?.(s);
    }
  };

  // ─── Fullscreen interval change ──────────────────────────────────
  const handleIntervalChange = useCallback((newInterval: ChartInterval) => {
    setChartInterval(newInterval);
    initializedRef.current = false;
    lastCandleCountRef.current = 0;
    rsiPointCountRef.current = 0;
    // Clear and refetch with new interval
    seriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);
    sma20SeriesRef.current?.setData([]);
    sma50SeriesRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    fetchSymbolData(activeSymbol, newInterval);
  }, [activeSymbol, fetchSymbolData]);

  const handleToggleCrosshair = useCallback(() => {
    if (!chartRef.current) return;
    const next = !crosshairEnabled;
    setCrosshairEnabled(next);
    const mode = next ? CrosshairMode.Normal : CrosshairMode.Hidden;
    chartRef.current.applyOptions({ crosshair: { mode } });
    rsiChartRef.current?.applyOptions({ crosshair: { mode } });
  }, [crosshairEnabled]);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
    setTimeout(() => {
      chartRef.current?.timeScale().fitContent();
      rsiChartRef.current?.timeScale().fitContent();
    }, 350);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  return (
    <div className={`chart-card ${isFullscreen ? 'chart-card-fullscreen' : ''}`} id={`chart-card-${activeSymbol}`}>
      <div className="chart-card-header">
        <SymbolSelector currentSymbol={activeSymbol} onSelect={handleSymbolChange} />
        <div className="chart-card-header-xscroll">
          <div className="chart-card-header-track">
            <ChartControls
              chartRef={chartRef}
              onToggleCrosshair={handleToggleCrosshair} crosshairEnabled={crosshairEnabled}
              onToggleFullscreen={handleToggleFullscreen} isFullscreen={isFullscreen}
            />
            <span className="chart-header-spacer" aria-hidden />
            <span className="chart-price" ref={priceRef}>...</span>
          </div>
        </div>
      </div>

      {/* Fullscreen-only toolbar */}
      {isFullscreen && (
        <FullscreenToolbar
          symbol={activeSymbol}
          candles={currentCandles}
          chartRef={chartRef}
          interval={chartInterval}
          onIntervalChange={handleIntervalChange}
          indicators={indicators}
          onToggleIndicator={handleToggleIndicator}
          onClose={() => setIsFullscreen(false)}
        />
      )}

      <div className="chart-body">
        <div className="chart-indicators-legend">
          {indicators.sma20 && <span className="legend-item" style={{ color: '#f59e0b' }}>● SMA 20</span>}
          {indicators.sma50 && <span className="legend-item" style={{ color: '#8b5cf6' }}>● SMA 50</span>}
        </div>
        <div className="chart-container-main" ref={containerRef} />
        <div className="chart-container-rsi" ref={rsiPanelRef}>
          <div className="chart-rsi-host" ref={rsiChartHostRef} />
          <span className="rsi-label">RSI 14</span>
        </div>
      </div>
    </div>
  );
}
