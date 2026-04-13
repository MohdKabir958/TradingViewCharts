'use client';

import { useEffect, useState, useCallback } from 'react';
import ChartCard from './ChartCard';
import { SYMBOLS } from '@/lib/symbols';
import { ChartInterval } from '@/lib/types';

interface CompareOverlayProps {
  onClose: () => void;
  initialSymbols?: [string, string];
  onSymbolsChange?: (symbols: [string, string]) => void;
  interval: ChartInterval;
}

export default function CompareOverlay({
  onClose,
  initialSymbols,
  onSymbolsChange,
  interval,
}: CompareOverlayProps) {
  const [symbolA, setSymbolA] = useState<string>(initialSymbols?.[0] ?? SYMBOLS[0]);
  const [symbolB, setSymbolB] = useState<string>(initialSymbols?.[1] ?? (SYMBOLS[1] || SYMBOLS[0]));

  // Notify parent whenever a symbol changes so selections survive close/reopen
  useEffect(() => {
    onSymbolsChange?.([symbolA, symbolB]);
  }, [symbolA, symbolB, onSymbolsChange]);

  const handleSelectA = useCallback((s: string) => setSymbolA(s), []);
  const handleSelectB = useCallback((s: string) => setSymbolB(s), []);

  // Prevent scrolling on the body while compare mode is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="compare-overlay">
      <div className="compare-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
          <span style={{ fontSize: '1.2rem', color: 'var(--accent-blue)' }}>◫</span>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>Compare Mode</h2>
          <span style={{ marginLeft: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Use the symbol selector on each chart to pick any two stocks.
          </span>
        </div>
        <button className="fs-close-btn" onClick={onClose} title="Close Compare Mode">
          ✕ Close
        </button>
      </div>
      <div className="compare-body">
        <ChartCard symbol={symbolA} globalInterval={interval} onSymbolChange={handleSelectA} />
        <ChartCard symbol={symbolB} globalInterval={interval} onSymbolChange={handleSelectB} />
      </div>
    </div>
  );
}
