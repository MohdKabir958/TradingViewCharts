'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { getDisplayName } from '@/lib/symbols';

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

interface SymbolSelectorProps {
  currentSymbol: string;
  onSelect: (symbol: string) => void;
}

export default function SymbolSelector({ currentSymbol, onSelect }: SymbolSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Search with debounce ────────────────────────────────────────
  const searchSymbols = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setResults(json.results || []);
      setHighlightIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchSymbols(value), 300);
  };

  // ─── Keyboard navigation ────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && highlightIndex >= 0 && results[highlightIndex]) {
      handleSelect(results[highlightIndex].symbol);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      setResults([]);
    }
  };

  // ─── Select handler ──────────────────────────────────────────────
  const handleSelect = (symbol: string) => {
    onSelect(symbol);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  // ─── Click outside to close ──────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Cleanup debounce
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="symbol-selector" ref={containerRef}>
      {isOpen ? (
        <input
          ref={inputRef}
          className="symbol-input"
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search stock..."
          spellCheck={false}
          autoComplete="off"
        />
      ) : (
        <button
          className="symbol-button"
          onClick={() => setIsOpen(true)}
          title={getDisplayName(currentSymbol)}
        >
          <span className="symbol-button-name">{getDisplayName(currentSymbol)}</span>
          <span className="symbol-arrow">▾</span>
        </button>
      )}

      {isOpen && (
        <div className="symbol-dropdown">
          {isSearching && (
            <div className="symbol-dropdown-item symbol-searching">Searching...</div>
          )}
          {!isSearching && query.length > 0 && results.length === 0 && (
            <div className="symbol-dropdown-item symbol-no-results">No results</div>
          )}
          {results.map((r, i) => (
            <button
              key={r.symbol}
              className={`symbol-dropdown-item ${i === highlightIndex ? 'highlighted' : ''}`}
              onClick={() => handleSelect(r.symbol)}
              onMouseEnter={() => setHighlightIndex(i)}
            >
              <span className="symbol-dropdown-symbol">{r.symbol}</span>
              <span className="symbol-dropdown-name">{r.name}</span>
              <span className="symbol-dropdown-exchange">{r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
