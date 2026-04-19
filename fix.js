const fs = require('fs');
let code = fs.readFileSync('components/ChartCard.tsx', 'utf8');

code = code.replace(
  /export function calculateSMA([^]+?)return result;\n\}/m,
  ''
);

code = code.replace(
  /import \{ calculateSMA, calculateRSI, calculateDailyChange \} from '@\/lib\/indicators';/,
  "import { calculateBollingerBands, calculateRSI, calculateDailyChange } from '@/lib/indicators';"
);

code = code.replace(
  /interface IndicatorToggles \{\n\s*sma20: boolean;\n\s*sma50: boolean;\n\s*volume: boolean;\n\s*rsi: boolean;\n\}/g,
  "interface IndicatorToggles {\n  bb: boolean;\n  volume: boolean;\n  rsi: boolean;\n}"
);

code = code.replace(
  /sma20: true, sma50: true,/,
  "bb: true,"
);

code = code.replace(
  /const sma20SeriesRef = useRef<ISeriesApi<'Line'> \| null>\(null\);\n\s*const sma50SeriesRef = useRef<ISeriesApi<'Line'> \| null>\(null\);/,
  "  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);\n  const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);\n  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);"
);

code = code.replace(
  /useEffect\(\(\) => \{\n\s*if \(sma20SeriesRef\.current\) \{\n\s*sma20SeriesRef\.current\.applyOptions\(\{\n\s*visible: indicators\.sma20,\n\s*\}\);\n\s*\}\n\s*\}, \[indicators\.sma20\]\);\n\n\s*useEffect\(\(\) => \{\n\s*if \(sma50SeriesRef\.current\) \{\n\s*sma50SeriesRef\.current\.applyOptions\(\{\n\s*visible: indicators\.sma50,\n\s*\}\);\n\s*\}\n\s*\}, \[indicators\.sma50\]\);/g,
  "useEffect(() => {\n    if (bbUpperSeriesRef.current) bbUpperSeriesRef.current.applyOptions({ visible: indicators.bb });\n    if (bbMiddleSeriesRef.current) bbMiddleSeriesRef.current.applyOptions({ visible: indicators.bb });\n    if (bbLowerSeriesRef.current) bbLowerSeriesRef.current.applyOptions({ visible: indicators.bb });\n  }, [indicators.bb]);"
);

code = code.replace(
  /const sma20Data = calculateSMA\(candles, 20\)\.map\(\(d\) => \(\{\n\s*time: d\.time as Time, value: d\.value,\n\s*\}\)\);\n\s*const sma50Data = calculateSMA\(candles, 50\)\.map\(\(d\) => \(\{\n\s*time: d\.time as Time, value: d\.value,\n\s*\}\)\);/,
  "const bbData = calculateBollingerBands(candles, 20, 2);\n        const bbUpperData = bbData.map(d => ({ time: d.time as Time, value: d.upper }));\n        const bbMiddleData = bbData.map(d => ({ time: d.time as Time, value: d.middle }));\n        const bbLowerData = bbData.map(d => ({ time: d.time as Time, value: d.lower }));"
);

code = code.replace(
  /sma20SeriesRef\.current\?\.setData\(sma20Data\);\n\s*sma50SeriesRef\.current\?\.setData\(sma50Data\);/,
  "bbUpperSeriesRef.current?.setData(bbUpperData);\n          bbMiddleSeriesRef.current?.setData(bbMiddleData);\n          bbLowerSeriesRef.current?.setData(bbLowerData);"
);

code = code.replace(
  /if \(sma20Data\.length > 0\) sma20SeriesRef\.current\?\.update\(sma20Data\[sma20Data\.length - 1\]\);\n\s*if \(sma50Data\.length > 0\) sma50SeriesRef\.current\?\.update\(sma50Data\[sma50Data\.length - 1\]\);/,
  "if (bbUpperData.length > 0) bbUpperSeriesRef.current?.update(bbUpperData[bbUpperData.length - 1]);\n          if (bbMiddleData.length > 0) bbMiddleSeriesRef.current?.update(bbMiddleData[bbMiddleData.length - 1]);\n          if (bbLowerData.length > 0) bbLowerSeriesRef.current?.update(bbLowerData[bbLowerData.length - 1]);"
);

code = code.replace(
  /upColor: '#10b981', downColor: '#ef4444',\n\s*borderUpColor: '#10b981', borderDownColor: '#ef4444',\n\s*wickUpColor: '#10b981', wickDownColor: '#ef4444',/,
  "upColor: '#ffffff', downColor: '#0f172a',\n      borderUpColor: '#0f172a', borderDownColor: '#0f172a',\n      wickUpColor: '#0f172a', wickDownColor: '#0f172a',"
);

code = code.replace(
  /const sma20 = chart\.addSeries\(LineSeries, \{\n\s*color: '#f59e0b', lineWidth: 1,\n\s*crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,\n\s*\}\);\n\n\s*const sma50 = chart\.addSeries\(LineSeries, \{\n\s*color: '#8b5cf6', lineWidth: 1,\n\s*crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,\n\s*\}\);\n\n\s*chartRef\.current = chart;\n\s*seriesRef\.current = candleSeries;\n\s*volumeSeriesRef\.current = volumeSeries;\n\s*sma20SeriesRef\.current = sma20;\n\s*sma50SeriesRef\.current = sma50;/,
  `const bbUpper = chart.addSeries(LineSeries, { color: 'rgba(59, 130, 246, 0.4)', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });
    const bbMiddle = chart.addSeries(LineSeries, { color: 'rgba(245, 158, 11, 0.8)', lineWidth: 1, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });
    const bbLower = chart.addSeries(LineSeries, { color: 'rgba(59, 130, 246, 0.4)', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false });

    chartRef.current = chart;
    seriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    bbUpperSeriesRef.current = bbUpper;
    bbMiddleSeriesRef.current = bbMiddle;
    bbLowerSeriesRef.current = bbLower;`
);

code = code.replace(
  /sma20SeriesRef\.current\?\.setData\(\[\]\);\n\s*sma50SeriesRef\.current\?\.setData\(\[\]\);/g,
  "bbUpperSeriesRef.current?.setData([]);\n    bbMiddleSeriesRef.current?.setData([]);\n    bbLowerSeriesRef.current?.setData([]);"
);

code = code.replace(
  /\{indicators\.sma20 && <span className="legend-item" style=\{\{ color: '#f59e0b' \}\}>● SMA 20<\/span>\}\n\s*\{indicators\.sma50 && <span className="legend-item" style=\{\{ color: '#8b5cf6' \}\}>● SMA 50<\/span>\}/,
  "{indicators.bb && <span className=\"legend-item\" style={{ color: '#f59e0b' }}>● BB (20, 2)</span>}"
);

fs.writeFileSync('components/ChartCard.tsx', code);

// Now do FullscreenToolbar.tsx
let tb = fs.readFileSync('components/FullscreenToolbar.tsx', 'utf8');

tb = tb.replace(
  /interface IndicatorToggles \{\n\s*sma20: boolean;\n\s*sma50: boolean;\n\s*volume: boolean;\n\s*rsi: boolean;\n\}/,
  "interface IndicatorToggles {\n  bb: boolean;\n  volume: boolean;\n  rsi: boolean;\n}"
);

tb = tb.replace(
  /<button\n\s*className=\{\`fs-toggle \$\{indicators\.sma20 \? 'active' : ''\}\`\}\n\s*onClick=\{\(\) => onToggleIndicator\('sma20'\)\}\n\s*style=\{\{ '--toggle-color': '#f59e0b' \} as React\.CSSProperties\}\n\s*>\n\s*<span className="fs-toggle-dot" \/>\n\s*SMA 20\n\s*<\/button>\n\s*<button\n\s*className=\{\`fs-toggle \$\{indicators\.sma50 \? 'active' : ''\}\`\}\n\s*onClick=\{\(\) => onToggleIndicator\('sma50'\)\}\n\s*style=\{\{ '--toggle-color': '#8b5cf6' \} as React\.CSSProperties\}\n\s*>\n\s*<span className="fs-toggle-dot" \/>\n\s*SMA 50\n\s*<\/button>/,
  `<button
              className={\`fs-toggle \${indicators.bb ? 'active' : ''}\`}
              onClick={() => onToggleIndicator('bb')}
              style={{ '--toggle-color': '#f59e0b' } as React.CSSProperties}
            >
              <span className="fs-toggle-dot" />
              BB
            </button>`
);

fs.writeFileSync('components/FullscreenToolbar.tsx', tb);

console.log('Script completed Successfully!');
