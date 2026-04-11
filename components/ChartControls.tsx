'use client';

import { IChartApi } from 'lightweight-charts';
import { useCallback } from 'react';

interface ChartControlsProps {
  chartRef: React.RefObject<IChartApi | null>;
  symbol: string;
  onToggleCrosshair: () => void;
  crosshairEnabled: boolean;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
}

export default function ChartControls({
  chartRef,
  onToggleCrosshair,
  crosshairEnabled,
  onToggleFullscreen,
  isFullscreen,
}: ChartControlsProps) {

  const handleZoomIn = useCallback(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (range) {
      const center = (range.from + range.to) / 2;
      const halfSpan = (range.to - range.from) / 2;
      const newHalf = halfSpan * 0.7;
      timeScale.setVisibleLogicalRange({
        from: center - newHalf,
        to: center + newHalf,
      });
    }
  }, [chartRef]);

  const handleZoomOut = useCallback(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (range) {
      const center = (range.from + range.to) / 2;
      const halfSpan = (range.to - range.from) / 2;
      const newHalf = halfSpan * 1.4;
      timeScale.setVisibleLogicalRange({
        from: center - newHalf,
        to: center + newHalf,
      });
    }
  }, [chartRef]);

  const handleFitContent = useCallback(() => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().fitContent();
  }, [chartRef]);

  const handleScrollLeft = useCallback(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (range) {
      const span = range.to - range.from;
      const shift = span * 0.3;
      timeScale.setVisibleLogicalRange({
        from: range.from - shift,
        to: range.to - shift,
      });
    }
  }, [chartRef]);

  const handleScrollRight = useCallback(() => {
    if (!chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const range = timeScale.getVisibleLogicalRange();
    if (range) {
      const span = range.to - range.from;
      const shift = span * 0.3;
      timeScale.setVisibleLogicalRange({
        from: range.from + shift,
        to: range.to + shift,
      });
    }
  }, [chartRef]);

  return (
    <div className="chart-controls">
      <button
        className="chart-ctrl-btn"
        onClick={handleScrollLeft}
        title="Scroll left"
      >
        ◀
      </button>
      <button
        className="chart-ctrl-btn"
        onClick={handleZoomIn}
        title="Zoom in"
      >
        +
      </button>
      <button
        className="chart-ctrl-btn"
        onClick={handleZoomOut}
        title="Zoom out"
      >
        −
      </button>
      <button
        className="chart-ctrl-btn"
        onClick={handleScrollRight}
        title="Scroll right"
      >
        ▶
      </button>
      <button
        className="chart-ctrl-btn"
        onClick={handleFitContent}
        title="Fit all candles"
      >
        ⊞
      </button>
      <button
        className={`chart-ctrl-btn ${crosshairEnabled ? 'active' : ''}`}
        onClick={onToggleCrosshair}
        title="Toggle crosshair"
      >
        ┼
      </button>
      <button
        className={`chart-ctrl-btn ${isFullscreen ? 'active' : ''}`}
        onClick={onToggleFullscreen}
        title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      >
        {isFullscreen ? '⊗' : '⛶'}
      </button>
    </div>
  );
}
