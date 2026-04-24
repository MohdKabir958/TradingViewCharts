'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import ChartCard from '@/components/ChartCard';
import { ChartInterval } from '@/lib/types';
import { useDataFetcher } from '@/lib/hooks';

const DEFAULT_INDICES = [
  { symbol: '^NSEI',      name: 'Nifty 50',       desc: 'NSE Top 50' },
  { symbol: '^NSEBANK',   name: 'Bank Nifty',      desc: 'Banking Index' },
  { symbol: '^BSESN',     name: 'Sensex',          desc: 'BSE Top 30' },
  { symbol: '^CNXIT',     name: 'Nifty IT',        desc: 'IT Sector' },
  { symbol: '^NSEMDCP50', name: 'Nifty Midcap 50', desc: 'Midcap Index' },
  { symbol: '^INDIAVIX',  name: 'India VIX',       desc: 'Volatility Index' },
  { symbol: '^CNXAUTO',   name: 'Nifty Auto',      desc: 'Automobile Sector' },
  { symbol: '^CNXPHARMA', name: 'Nifty Pharma',    desc: 'Pharma Sector' },
  { symbol: '^CNXMETAL',  name: 'Nifty Metal',     desc: 'Metal Sector' },
  { symbol: '^CNXFMCG',   name: 'Nifty FMCG',     desc: 'FMCG Sector' },
  { symbol: '^CNXREALTY', name: 'Nifty Realty',    desc: 'Real Estate' },
  { symbol: '^CNXENERGY', name: 'Nifty Energy',    desc: 'Energy Sector' },
  { symbol: '^CNXPSUBANK',name: 'PSU Bank',        desc: 'Public Sector Banks' },
  { symbol: 'BSE-OILGAS.BO', name: 'Oil & Gas',   desc: 'Oil & Gas Sector' },
];

const INTERVALS: { label: string; value: ChartInterval }[] = [
  { label: '1m',  value: '1m' },
  { label: '5m',  value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H',  value: '1h' },
  { label: '1D',  value: '1d' },
];

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

export default function IndicesPage() {
  const [indices, setIndices]       = useState(DEFAULT_INDICES.map(i => i.symbol));
  const [interval, setInterval]     = useState<ChartInterval>('5m');
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<SearchResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDark, setIsDark]         = useState(false);

  // Auto-refresh every 30s — keeps indices data live same as main dashboard
  useDataFetcher(indices, interval);

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setIsDark(current === 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); setShowDropdown(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results || []);
      setShowDropdown(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 350);
    return () => clearTimeout(t);
  }, [query, search]);

  const addIndex = (symbol: string) => {
    if (!indices.includes(symbol)) setIndices(prev => [...prev, symbol]);
    setQuery(''); setResults([]); setShowDropdown(false);
  };

  const removeIndex = (symbol: string) => {
    setIndices(prev => prev.filter(s => s !== symbol));
  };

  return (
    <div className="dashboard">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="header-title">
            <div className="header-logo">📈</div>
            <h1>Indian Indices</h1>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-surface)', border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)', padding: '6px 12px',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>🔍</span>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search indices, e.g. ^CNXSMALL..."
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: '0.85rem',
                  fontFamily: 'var(--font-sans)', width: '100%',
                }}
              />
              {searching && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>...</span>}
            </div>
            {showDropdown && results.length > 0 && (
              <div style={{
                position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 999,
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-card)',
                maxHeight: 240, overflowY: 'auto',
              }}>
                {results.map(r => (
                  <button
                    key={r.symbol}
                    onClick={() => addIndex(r.symbol)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', padding: '8px 12px', border: 'none',
                      background: 'none', cursor: 'pointer', textAlign: 'left',
                      color: 'var(--text-primary)', fontSize: '0.8rem',
                      borderBottom: '1px solid var(--border-color)',
                      fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--accent-blue)' }}>{r.symbol}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: 8, flex: 1, textAlign: 'left', paddingLeft: 8 }}>{r.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', background: 'var(--bg-surface)', padding: '1px 6px', borderRadius: 3 }}>{r.exchange}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Interval selector + right controls */}
          <div className="header-controls" style={{ gap: 'var(--gap-md)' }}>
            <div className="control-group">
              <span className="control-label">Timeframe</span>
              <div className="control-tabs">
                {INTERVALS.map(tf => (
                  <button
                    key={tf.value}
                    className={`control-tab ${interval === tf.value ? 'active' : ''}`}
                    onClick={() => setInterval(tf.value)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="control-action-btn"
              onClick={() => setIsDark(d => !d)}
              title={isDark ? 'Switch to Light' : 'Switch to Dark'}
              style={{ fontSize: '1rem' }}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <Link href="/" className="control-action-btn" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Index filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 24px 0' }}>
        {DEFAULT_INDICES.map(idx => (
          <button
            key={idx.symbol}
            onClick={() => indices.includes(idx.symbol) ? removeIndex(idx.symbol) : addIndex(idx.symbol)}
            style={{
              padding: '4px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
              border: '1px solid var(--border-color)', cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              background: indices.includes(idx.symbol) ? 'var(--accent-blue)' : 'var(--bg-surface)',
              color: indices.includes(idx.symbol) ? '#fff' : 'var(--text-muted)',
              transition: 'all 150ms ease',
            }}
            title={idx.desc}
          >
            {idx.name}
          </button>
        ))}
      </div>

      {/* Chart grid — same 9:16 cards as main dashboard */}
      <main>
        <div className="chart-grid indices-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {indices.map(symbol => (
            <ChartCard
              key={symbol}
              symbol={symbol}
              globalInterval={interval}
              onSymbolChange={newSym => {
                setIndices(prev => prev.map(s => s === symbol ? newSym : s));
              }}
            />
          ))}
        </div>
      </main>

      <footer className="footer">
        Indian Market Indices • Data via Yahoo Finance • Click a pill to add/remove
      </footer>
    </div>
  );
}
