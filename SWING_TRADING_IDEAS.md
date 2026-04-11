# Swing Trading Features Analysis

I've analyzed the current architecture of the Trading Terminal. We have built an incredibly fast, highly optimized chart viewing platform. However, to transition it from a *viewing platform* to a *swing trading weapon*, we need features that help with **scanning, risk management, and momentum confirmation**.

Swing traders hold positions for days to weeks. They care less about minute-by-minute noise and more about structural breakouts, relative strength, and risk-to-reward ratios. 

Here are the highest impact features we can add using our exact tech stack (Lightweight Charts + Yahoo Finance + Next.js).

---

## 🟢 Quick Wins (High Impact, Low Effort)

These can be added immediately with very little overhead or architectural changes.

### 1. Interactive Price Alerts (Horizontal Lines)
*   **Why**: Swing traders wait for perfectly setup levels (e.g., waiting for resistance to break at ₹1450).
*   **How**: Lightweight Charts provides a `.createPriceLine()` method. We can add a simple button to let you type a price, and it draws a persistent dashed horizontal line across the chart. We can trigger a browser notification or a simple visual "flash" when the live price crosses it.

### 2. MACD (Moving Average Convergence Divergence)
*   **Why**: The absolute gold standard for swing momentum. While RSI shows overbought/oversold, MACD shows if the trend is accelerating or decelerating.
*   **How**: Similar to how we added RSI, we can calculate MACD (12, 26, 9) and plot a `HistogramSeries` and two `LineSeries` overlapping the RSI chart or right below it.

### 3. Local Storage Persistence
*   **Why**: If you spend time setting up your 16 symbols, setting timeframes, and tuning the grid, a page refresh currently wipes it all.
*   **How**: Sync the `activeSymbol` state of each card, the global `gridCols`, and `interval` to the browser's `localStorage`.

---

## 🟡 Intermediate (High Impact, Medium Effort)

These require some new logic but will massively upgrade the analysis experience.

### 4. Anchored VWAP (Volume Weighted Average Price)
*   **Why**: For swing traders, knowing the Weekly VWAP or Monthly VWAP tells you who is in control (buyers or sellers) over the swing timeframe.
*   **How**: We can calculate VWAP by anchoring it to the start of the current week or month and plotting it as a `LineSeries` on the main chart.

### 5. ATR (Average True Range) Stop Loss Visualizer
*   **Why**: Swing traders size their positions based on volatility. A standard stop loss is 1.5x or 2x ATR.
*   **How**: We write an ATR calculator in `lib/indicators.ts`. We can then map a dynamic trailing line at the bottom of the candles representing a logical trailing stop-loss point.

### 6. Screener / Heatmap Mode
*   **Why**: Staring at 16 charts is great, but sometimes a swing trader just wants to answer: *"Which out of my 16 stocks crossed the 50 SMA today?"*
*   **How**: We build a toggle that flips the dashboard from "Grid/Charts" into a dense "Data Table" showing: Symbol, Price, RSI, % from 20 SMA, % from 50 SMA. 

---

## 🔴 Architectural Expansions (High Effort)

These require backend modifications or expanding the Yahoo Finance data fetch.

### 7. Relative Strength (RS) Line
*   **Why**: A core swing trading tenet: "Buy the strongest stocks in a weak market."
*   **How**: We fetch `^NSEI` (Nifty 50) data in the background. On every chart, you have a toggle to show an overlay line that is `(Stock Price / Nifty 50 Price) * 100`. If the stock is going down but the RS line is going up, it's a prime buy setup.

### 8. Upcoming Earnings Badges
*   **Why**: Holding swinging trades through an earnings report is effectively gambling. Swing traders must know if a report is imminent.
*   **How**: We query Yahoo Finance's quote module to fetch the next earnings date. We place a small `[E]` marker on the X-axis (using Lightweight Charts `setMarkers()`) so you visually see when earnings are coming up.
