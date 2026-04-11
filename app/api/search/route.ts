import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 1) {
      return NextResponse.json({ results: [] });
    }

    const result = await yahooFinance.search(query, {
      quotesCount: 15,
      newsCount: 0,
    });

    const stocks = (result.quotes || [])
      .filter((q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || '',
        type: q.quoteType,
      }));

    return NextResponse.json({ results: stocks });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ results: [], error: msg }, { status: 500 });
  }
}
