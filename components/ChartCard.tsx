'use client';

import { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickData, Time, CandlestickSeries,
  LineSeries, HistogramSeries, CrosshairMode,
} from 'lightweight-charts';
import { chartStore, SymbolState } from '@/lib/store';
import { scheduleChartUpdate } from '@/lib/rafBatcher';
import { CandleData, ChartInterval } from '@/lib/types';
import { calculateBollingerBands, calculateRSI, calculateDailyChange } from '@/lib/indicators';
import SymbolSelector from './SymbolSelector';
import ChartControls from './ChartControls';
import FullscreenToolbar from './FullscreenToolbar';

interface ChartCardProps {
  symbol: string;
  globalInterval?: ChartInterval;
  onSymbolChange?: (symbol: string) => void;
}

interface IndicatorToggles {
  bb: boolean;
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

/** Absolute `.chart-rsi-host` often reports 0×0 with autoSize; explicit resize is required. */
function measureRsiHost(host: HTMLDivElement): { width: number; height: number } {
  const parent = host.parentElement;
  const width = Math.max(
    1,
    Math.floor(host.clientWidth || parent?.clientWidth || 1)
  );
  const height = Math.max(
    48,
    Math.floor(host.clientHeight || parent?.clientHeight || 72)
  );
  return { width, height };
}

function resizeRsiChartPane(chart: IChartApi | null, host: HTMLDivElement | null) {
  if (!chart || !host) return;
  const { width, height } = measureRsiHost(host);
  chart.resize(width, height, true);
}

export default function ChartCard({ symbol: initialSymbol, globalInterval = '5m', onSymbolChange }: ChartCardProps) {
  const [activeSymbol, setActiveSymbol] = useState(initialSymbol);
  const [crosshairEnabled, setCrosshairEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartInterval, setChartInterval] = useState<ChartInterval>(globalInterval);
  const [indicators, setIndicators] = useState<IndicatorToggles>({
    bb: true, volume: true, rsi: true,
  });
  const [currentCandles, setCurrentCandles] = useState<CandleData[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMidSeriesRef   = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

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

  // ─── BB visibility ───────────────────────────────────────────────
  useEffect(() => {
    [bbUpperSeriesRef, bbMidSeriesRef, bbLowerSeriesRef].forEach((ref) => {
      ref.current?.applyOptions({ visible: indicators.bb });
    });
  }, [indicators.bb]);

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

  // Prod / toggles: `display:none` → `block` does not always trigger ResizeObserver before paint; sync size in layout phase.
  useLayoutEffect(() => {
    if (!indicators.rsi) return;
    const c = rsiChartRef.current;
    const host = rsiChartHostRef.current;
    if (!c || !host) return;
    resizeRsiChartPane(c, host);
    c.timeScale().fitContent();
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

        const bbData = calculateBollingerBands(candles);
        const bbUpperData = bbData.map((d) => ({ time: d.time as Time, value: d.upper }));
        const bbMidData   = bbData.map((d) => ({ time: d.time as Time, value: d.middle }));
        const bbLowerData = bbData.map((d) => ({ time: d.time as Time, value: d.lower }));
        const rsiData = calculateRSI(candles).map((d) => ({
          time: d.time as Time, value: d.value,
        }));

        if (!initializedRef.current) {
          seriesRef.current.setData(formatted);
          volumeSeriesRef.current?.setData(volumeData);
          bbUpperSeriesRef.current?.setData(bbUpperData);
          bbMidSeriesRef.current?.setData(bbMidData);
          bbLowerSeriesRef.current?.setData(bbLowerData);
          rsiSeriesRef.current?.setData(rsiData);
          rsiPointCountRef.current = rsiData.length;
          chartRef.current.timeScale().fitContent();
          resizeRsiChartPane(rsiChartRef.current, rsiChartHostRef.current);
          rsiChartRef.current?.timeScale().fitContent();
          initializedRef.current = true;
          lastCandleCountRef.current = candles.length;
        } else {
          const last = formatted[formatted.length - 1];
          seriesRef.current.update(last);
          if (volumeData.length > 0) volumeSeriesRef.current?.update(volumeData[volumeData.length - 1]);
          if (bbUpperData.length > 0) bbUpperSeriesRef.current?.update(bbUpperData[bbUpperData.length - 1]);
          if (bbMidData.length > 0) bbMidSeriesRef.current?.update(bbMidData[bbMidData.length - 1]);
          if (bbLowerData.length > 0) bbLowerSeriesRef.current?.update(bbLowerData[bbLowerData.length - 1]);
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
              resizeRsiChartPane(rsiChartRef.current, rsiChartHostRef.current);
              rsiChartRef.current?.timeScale().fitContent();
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

    const bbUpper = chart.addSeries(LineSeries, {
      color: 'rgba(59, 130, 246, 0.5)', lineWidth: 1, lineStyle: 2,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });

    const bbMid = chart.addSeries(LineSeries, {
      color: 'rgba(245, 158, 11, 0.8)', lineWidth: 1,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });

    const bbLower = chart.addSeries(LineSeries, {
      color: 'rgba(59, 130, 246, 0.5)', lineWidth: 1, lineStyle: 2,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    bbUpperSeriesRef.current = bbUpper;
    bbMidSeriesRef.current = bbMid;
    bbLowerSeriesRef.current = bbLower;

    // RSI chart — autoSize + ResizeObserver ignores resize(); host can be 0×0 when absolute. Use fixed size + RO.
    const rsiHostEl = rsiChartHostRef.current;
    const rsiBox = measureRsiHost(rsiHostEl);
    const rsiChart = createChart(rsiHostEl, {
      width: rsiBox.width,
      height: rsiBox.height,
      autoSize: false,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', fontSize: 9, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(100, 116, 139, 0.1)', style: 2 } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
        horzLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#1e293b' },
      },
      // autoScale must stay true: with false, v5 ignores series autoscaleInfoProvider and the scale has no range → no line.
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.05 }, autoScale: true },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const onRsiHostResize = () => resizeRsiChartPane(rsiChart, rsiHostEl);
    const rsiResizeObs = new ResizeObserver(() => onRsiHostResize());
    rsiResizeObs.observe(rsiHostEl);
    const rsiPaneEl = rsiHostEl.parentElement;
    if (rsiPaneEl) rsiResizeObs.observe(rsiPaneEl);
    const syncRsiAfterLayout = () => {
      resizeRsiChartPane(rsiChart, rsiHostEl);
      rsiChart.timeScale().fitContent();
    };
    requestAnimationFrame(() => {
      syncRsiAfterLayout();
      requestAnimationFrame(syncRsiAfterLayout);
    });

    const rsiLine = rsiChart.addSeries(LineSeries, {
      color: '#06b6d4', lineWidth: 2,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: true,
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: 0, maxValue: 100 },
      }),
    });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiLine;

    // RSI uses its own time scale (hidden). fitContent() after data — syncing main↔RSI by
    // logical or time range broke on Vercel (empty pane). Scroll lock with main is sacrificed.

    return () => {
      rsiResizeObs.disconnect();
      chart.remove(); rsiChart.remove();
      chartRef.current = null; seriesRef.current = null;
      volumeSeriesRef.current = null; bbUpperSeriesRef.current = null; bbMidSeriesRef.current = null; bbLowerSeriesRef.current = null;
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
    bbUpperSeriesRef.current?.setData([]);
    bbMidSeriesRef.current?.setData([]);
    bbLowerSeriesRef.current?.setData([]);
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
    bbUpperSeriesRef.current?.setData([]);
    bbMidSeriesRef.current?.setData([]);
    bbLowerSeriesRef.current?.setData([]);
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
      resizeRsiChartPane(rsiChartRef.current, rsiChartHostRef.current);
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
          {indicators.bb && (
            <span className="legend-item">
              <span style={{ color: '#3b82f6' }}>— BB Upper</span>
              <span style={{ margin: '0 6px', color: '#f59e0b' }}>— BB Mid</span>
              <span style={{ color: '#3b82f6' }}>— BB Lower</span>
            </span>
          )}
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
