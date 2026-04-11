'use client';

import { useEffect } from 'react';
import ChartCard from './ChartCard';
import { SYMBOLS } from '@/lib/symbols';

interface CompareOverlayProps {
  onClose: () => void;
}

export default function CompareOverlay({ onClose }: CompareOverlayProps) {
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
        <ChartCard symbol={SYMBOLS[0]} />
        <ChartCard symbol={SYMBOLS[1] || SYMBOLS[0]} />
      </div>
    </div>
  );
}
