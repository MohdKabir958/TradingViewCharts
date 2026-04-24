import { NextRequest, NextResponse } from 'next/server';
import { fetchMultipleSymbols } from '@/lib/dataProvider';
import { parseChartSymbols } from '@/lib/apiLimits';
import { ChartInterval } from '@/lib/types';
import { SYMBOLS } from '@/lib/symbols';

export const dynamic = 'force-dynamic';

/** Allow long enough for staggered Yahoo batches (16 symbols). Fluid / Pro on Vercel. */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const symbolsParam = searchParams.get('symbols');
    const symbols = parseChartSymbols(symbolsParam, SYMBOLS);

    if (symbols.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid symbols. Use comma-separated tickers (max 32).' },
        { status: 400 }
      );
    }

    // Parse interval, default to 5m
    const interval = (searchParams.get('interval') as ChartInterval) || '5m';
    const validIntervals: ChartInterval[] = ['1m', '5m', '15m', '1h', '1d'];
    if (!validIntervals.includes(interval)) {
      return NextResponse.json(
        { error: `Invalid interval. Use: ${validIntervals.join(', ')}` },
        { status: 400 }
      );
    }

    // Parse days (number of trading days to show), default 1
    const daysParam = parseInt(searchParams.get('days') || '1', 10);
    const days = Number.isFinite(daysParam) && daysParam >= 1 ? Math.min(daysParam, 60) : 1;

    const data = await fetchMultipleSymbols(symbols, interval, days);

    return NextResponse.json({
      success: true,
      interval,
      data,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[API /charts] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch chart data',
      },
      { status: 500 }
    );
  }
}
