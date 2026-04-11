'use client';

import ChartCard from './ChartCard';
import ErrorBoundary from './ErrorBoundary';

interface MultiChartProps {
  symbols: string[];
}

export default function MultiChart({ symbols }: MultiChartProps) {
  return (
    <div className="chart-grid" id="chart-grid">
      {symbols.map((symbol) => (
        <ErrorBoundary key={symbol}>
          <ChartCard symbol={symbol} />
        </ErrorBoundary>
      ))}
    </div>
  );
}
