'use client';

import { IChartApi } from 'lightweight-charts';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ChartControlsProps {
  chartRef: React.RefObject<IChartApi | null>;
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const positionMenu = useCallback(() => {
    const t = triggerRef.current;
    const m = menuRef.current;
    if (!t || !m) return;
    const rect = t.getBoundingClientRect();
    m.style.top = `${rect.bottom + 4}px`;
    m.style.right = `${window.innerWidth - rect.right}px`;
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionMenu();
  }, [open, positionMenu]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    const onReposition = () => positionMenu();

    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, positionMenu]);

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
    setOpen(false);
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

  const onToggleCrosshairClick = useCallback(() => {
    onToggleCrosshair();
    setOpen(false);
  }, [onToggleCrosshair]);

  const onToggleFullscreenClick = useCallback(() => {
    onToggleFullscreen();
    setOpen(false);
  }, [onToggleFullscreen]);

  const menu =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div ref={menuRef} className="chart-menu-dropdown" role="menu">
        <button type="button" className="chart-menu-item" role="menuitem" onClick={handleFitContent}>
          ⊞ Fit all candles
        </button>
        <button
          type="button"
          className={`chart-menu-item ${crosshairEnabled ? 'active' : ''}`}
          role="menuitem"
          onClick={onToggleCrosshairClick}
        >
          ┼ Crosshair {crosshairEnabled ? 'on' : 'off'}
        </button>
        <button
          type="button"
          className={`chart-menu-item ${isFullscreen ? 'active' : ''}`}
          role="menuitem"
          onClick={onToggleFullscreenClick}
        >
          {isFullscreen ? 'Exit fullscreen' : '⛶ Fullscreen'}
        </button>
      </div>,
      document.body
    );

  return (
    <>
      <div className="chart-controls">
        <button type="button" className="chart-ctrl-btn" onClick={handleScrollLeft} title="Scroll left">
          ◀
        </button>
        <button type="button" className="chart-ctrl-btn" onClick={handleZoomIn} title="Zoom in">
          +
        </button>
        <button type="button" className="chart-ctrl-btn" onClick={handleZoomOut} title="Zoom out">
          −
        </button>
        <button type="button" className="chart-ctrl-btn" onClick={handleScrollRight} title="Scroll right">
          ▶
        </button>
        <div className="chart-controls-menu">
          <button
            ref={triggerRef}
            type="button"
            className="chart-menu-trigger"
            aria-label="More chart actions"
            aria-expanded={open}
            aria-haspopup="menu"
            title="Fit, crosshair, fullscreen"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="chart-menu-dots" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>
      {menu}
    </>
  );
}
