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

export interface IndicatorToggles {
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

function getCurrencySymbol(symbol: string): string {
  if (symbol.endsWith('.NS') || symbol.endsWith('.BO')) return '₹';
  // Indian indices: ^NSEI, ^NSEBANK, ^BSESN, ^CNX*, ^INDIAVIX, BSE-*
  if (symbol.startsWith('^') || symbol.startsWith('BSE-')) return '₹';
  return '$';
}

function measureRsiHost(host: HTMLDivElement): { width: number; height: number } {
  const parent = host.parentElement;
  const width = Math.max(1, Math.floor(host.clientWidth || parent?.clientWidth || 1));
  const height = Math.max(48, Math.floor(host.clientHeight || parent?.clientHeight || 72));
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
  const [chartDays, setChartDays] = useState(1);
  const [indicators, setIndicators] = useState<IndicatorToggles>({
    bb: true, volume: true, rsi: true,
  });
  const [currentCandles, setCurrentCandles] = useState<CandleData[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);

  const rsiPanelRef = useRef<HTMLDivElement>(null);
  const rsiChartHostRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const priceRef = useRef<HTMLSpanElement>(null);
  const lastCandleCountRef = useRef<number>(0);
  const rsiPointCountRef = useRef<number>(0);
  const initializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Sync global interval according to React 18 derived state best practices
  if (!isFullscreen && chartInterval !== globalInterval) {
    setChartInterval(globalInterval);
  }
  // BB visibility
  useEffect(() => {
    bbUpperRef.current?.applyOptions({ visible: indicators.bb });
    bbMiddleRef.current?.applyOptions({ visible: indicators.bb });
    bbLowerRef.current?.applyOptions({ visible: indicators.bb });
  }, [indicators.bb]);

  // Volume visibility
  useEffect(() => {
    volumeSeriesRef.current?.applyOptions({ visible: indicators.volume });
  }, [indicators.volume]);

  // RSI panel visibility
  useEffect(() => {
    const panel = rsiPanelRef.current;
    if (panel) panel.style.display = indicators.rsi ? 'block' : 'none';
  }, [indicators.rsi]);

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

  const updateDisplays = useCallback((candles: CandleData[]) => {
    if (candles.length === 0) return;
    const latest = candles[candles.length - 1];
    const price = latest.close.toFixed(2);
    const daily = calculateDailyChange(candles);
    const dPos = daily ? daily.changePercent >= 0 : true;
    if (priceRef.current) {
      const curr = getCurrencySymbol(activeSymbol);
      priceRef.current.className = `chart-price ${dPos ? 'positive' : 'negative'}`;
      const pct = daily != null ? `${daily.changePercent >= 0 ? '+' : ''}${daily.changePercent.toFixed(2)}%` : '—';
      const arrow = daily != null ? (daily.changePercent >= 0 ? '▲' : '▼') : '';
      priceRef.current.innerHTML = `${curr}${price}<span class="chart-price-change"><span class="chart-price-arrow" aria-hidden="true">${arrow}</span> ${pct}</span>`;
    }
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
          color: c.close >= c.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }));

        const bbRaw = calculateBollingerBands(candles, 20, 2);
        const bbUpperData = bbRaw.map((d) => ({ time: d.time as Time, value: d.upper }));
        const bbMiddleData = bbRaw.map((d) => ({ time: d.time as Time, value: d.middle }));
        const bbLowerData = bbRaw.map((d) => ({ time: d.time as Time, value: d.lower }));

        const rsiData = calculateRSI(candles).map((d) => ({ time: d.time as Time, value: d.value }));

        if (!initializedRef.current) {
          seriesRef.current.setData(formatted);
          volumeSeriesRef.current?.setData(volumeData);
          bbUpperRef.current?.setData(bbUpperData);
          bbMiddleRef.current?.setData(bbMiddleData);
          bbLowerRef.current?.setData(bbLowerData);
          rsiSeriesRef.current?.setData(rsiData);
          rsiPointCountRef.current = rsiData.length;
          chartRef.current.timeScale().fitContent();
          resizeRsiChartPane(rsiChartRef.current, rsiChartHostRef.current);
          rsiChartRef.current?.timeScale().fitContent();
          initializedRef.current = true;
          lastCandleCountRef.current = candles.length;
        } else {
          seriesRef.current.update(formatted[formatted.length - 1]);
          if (volumeData.length > 0) volumeSeriesRef.current?.update(volumeData[volumeData.length - 1]);
          if (bbUpperData.length > 0) bbUpperRef.current?.update(bbUpperData[bbUpperData.length - 1]);
          if (bbMiddleData.length > 0) bbMiddleRef.current?.update(bbMiddleData[bbMiddleData.length - 1]);
          if (bbLowerData.length > 0) bbLowerRef.current?.update(bbLowerData[bbLowerData.length - 1]);

          const rsi = rsiSeriesRef.current;
          if (rsi) {
            if (rsiData.length === 0) {
              rsi.setData([]); rsiPointCountRef.current = 0;
            } else if (rsiPointCountRef.current === 0 || rsiData.length !== rsiPointCountRef.current) {
              rsi.setData(rsiData); rsiPointCountRef.current = rsiData.length;
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

  // Initialize charts ONCE
  useEffect(() => {
    if (!containerRef.current || !rsiChartHostRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#334155' },
        horzLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#334155' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.2 } },
      localization: {
        timeFormatter: (timestamp: number) => {
          const d = new Date(timestamp * 1000);
          let h = d.getUTCHours();
          const m = d.getUTCMinutes().toString().padStart(2, '0');
          const ampm = h >= 12 ? 'PM' : 'AM';
          h = h % 12 || 12;
          return `${h}:${m} ${ampm}`;
        },
      },
      timeScale: {
        borderVisible: false, timeVisible: true, secondsVisible: false,
        fixLeftEdge: true, fixRightEdge: true, ticksVisible: false,
        tickMarkFormatter: (timestamp: number) => {
          // Short format for axis labels: "9:30" — saves width so 9:30 fits in small cards
          const d = new Date(timestamp * 1000);
          const h = d.getUTCHours();
          const m = d.getUTCMinutes().toString().padStart(2, '0');
          const hh = h % 12 || 12;
          return `${hh}:${m}`;
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    // Slim candles: hollow green body on up, solid red body on down
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#10b981',
      borderDownColor: '#ef4444',
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    // Bollinger Bands — dashed upper/lower, solid middle (basis SMA)
    const bbUpper = chart.addSeries(LineSeries, {
      color: 'rgba(0, 0, 0, 0.5)', lineWidth: 1, lineStyle: 2,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });
    const bbMiddle = chart.addSeries(LineSeries, {
      color: 'rgba(0, 0, 0, 0.7)', lineWidth: 1,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });
    const bbLower = chart.addSeries(LineSeries, {
      color: 'rgba(0, 0, 0, 0.5)', lineWidth: 1, lineStyle: 2,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    bbUpperRef.current = bbUpper;
    bbMiddleRef.current = bbMiddle;
    bbLowerRef.current = bbLower;

    // RSI chart
    const rsiHostEl = rsiChartHostRef.current;
    const rsiBox = measureRsiHost(rsiHostEl);
    const rsiChart = createChart(rsiHostEl, {
      width: rsiBox.width, height: rsiBox.height, autoSize: false,
      layout: { background: { color: 'transparent' }, textColor: '#64748b', fontSize: 9, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(100, 116, 139, 0.1)', style: 2 } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#334155' },
        horzLine: { color: 'rgba(59, 130, 246, 0.3)', width: 1, style: 2, labelBackgroundColor: '#334155' },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.05, bottom: 0.05 }, autoScale: true },
      timeScale: { visible: false },
      handleScroll: false, handleScale: false,
    });

    const rsiResizeObs = new ResizeObserver(() => resizeRsiChartPane(rsiChart, rsiHostEl));
    rsiResizeObs.observe(rsiHostEl);
    if (rsiHostEl.parentElement) rsiResizeObs.observe(rsiHostEl.parentElement);
    requestAnimationFrame(() => {
      resizeRsiChartPane(rsiChart, rsiHostEl);
      rsiChart.timeScale().fitContent();
      requestAnimationFrame(() => {
        resizeRsiChartPane(rsiChart, rsiHostEl);
        rsiChart.timeScale().fitContent();
      });
    });

    const rsiLine = rsiChart.addSeries(LineSeries, {
      color: '#0891b2', lineWidth: 2,
      crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: true,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });

    rsiChartRef.current = rsiChart;
    rsiSeriesRef.current = rsiLine;

    return () => {
      rsiResizeObs.disconnect();
      chart.remove(); rsiChart.remove();
      chartRef.current = null; seriesRef.current = null;
      volumeSeriesRef.current = null;
      bbUpperRef.current = null; bbMiddleRef.current = null; bbLowerRef.current = null;
      rsiChartRef.current = null; rsiSeriesRef.current = null;
    };
  }, []);

  const fetchSymbolData = useCallback(async (symbol: string, interval: string, days: number) => {
    try {
      const res = await fetch(`/api/charts?symbols=${symbol}&interval=${interval}&days=${days}`);
      const json = await res.json();
      if (json.success && json.data?.[symbol]) {
        chartStore.update(symbol, json.data[symbol].candles, json.data[symbol].error);
      }
    } catch { /* handled */ }
  }, []);

  // Subscribe to active symbol
  useEffect(() => {
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    initializedRef.current = false;
    lastCandleCountRef.current = 0;
    rsiPointCountRef.current = 0;
    seriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);
    bbUpperRef.current?.setData([]);
    bbMiddleRef.current?.setData([]);
    bbLowerRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    if (priceRef.current) { priceRef.current.innerHTML = '...'; priceRef.current.className = 'chart-price'; }
    const handler = createHandler();
    // Always fetch fresh — don't reuse stale store data when days filter changes
    fetchSymbolData(activeSymbol, chartInterval, chartDays);
    unsubscribeRef.current = chartStore.subscribe(activeSymbol, handler);
    return () => { if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; } };
  }, [activeSymbol, createHandler, chartInterval, chartDays, fetchSymbolData]);

  const handleSymbolChange = (s: string) => {
    if (s !== activeSymbol) { setActiveSymbol(s); onSymbolChange?.(s); }
  };

  const handleIntervalChange = useCallback((newInterval: ChartInterval) => {
    setChartInterval(newInterval);
    initializedRef.current = false;
    lastCandleCountRef.current = 0;
    rsiPointCountRef.current = 0;
    seriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);
    bbUpperRef.current?.setData([]);
    bbMiddleRef.current?.setData([]);
    bbLowerRef.current?.setData([]);
    rsiSeriesRef.current?.setData([]);
    fetchSymbolData(activeSymbol, newInterval, chartDays);
  }, [activeSymbol, chartDays, fetchSymbolData]);

  const handleDaysChange = useCallback((newDays: number) => {
    // Clear store so mergeCandles cannot blend old-day data into the new fetch.
    // The subscribe useEffect fires automatically when chartDays state updates,
    // so no manual fetchSymbolData call is needed here.
    chartStore.clearSymbol(activeSymbol);
    setChartDays(newDays);
  }, [activeSymbol]);

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
              chartDays={chartDays}
              onDaysChange={handleDaysChange}
            />
            <span className="chart-header-spacer" aria-hidden />
            <span className="chart-price" ref={priceRef}>...</span>
          </div>
        </div>
      </div>

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
          {indicators.bb && <>
            <span className="legend-item" style={{ color: 'rgba(37,99,235,0.8)' }}>── BB Upper</span>
            <span className="legend-item" style={{ color: 'rgba(217,119,6,0.9)' }}>── BB Mid</span>
            <span className="legend-item" style={{ color: 'rgba(37,99,235,0.8)' }}>── BB Lower</span>
          </>}
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
