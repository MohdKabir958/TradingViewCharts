'use client';

import ChartCard from './ChartCard';
import ErrorBoundary from './ErrorBoundary';

import { ChartInterval } from '@/lib/types';

interface MultiChartProps {
  symbols: string[];
  interval: ChartInterval;
}

export default function MultiChart({ symbols, interval }: MultiChartProps) {
  return (
    <div className="chart-grid" id="chart-grid">
      {symbols.map((symbol) => (
        <ErrorBoundary key={symbol}>
          <ChartCard symbol={symbol} globalInterval={interval} />
        </ErrorBoundary>
      ))}
    </div>
  );
}
