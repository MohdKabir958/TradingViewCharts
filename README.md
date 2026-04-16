# 📈 Trading Terminal

A high-performance, multi-chart, web-based financial dashboard. 

Designed for active monitoring and swing trading, this platform renders numerous dense, data-heavy HTML5 Canvas canvases efficiently without sacrificing UI responsiveness. It utilizes TradingView's Charting Library natively coupled with a custom React rendering pipeline.

## ✨ Features

- **Multi-Chart Grid System:** Simultaneously track up to 16 assets across dynamic, customizable layouts (2x2, 3x3, 4x4) with fully independent component lifecycles.
- **Built-in Indicators:** Every chart is equipped by default with SMA (20 & 50 period) overlaps, Volume Histograms, and a dedicated, synchronized RSI (14 period) sub-chart.
- **Compare Mode:** Isolate focus by bringing up a side-by-side modal to study cross-asset correlation intimately.
- **Highly Performant UI:** Input interactions and state propagations run through a Request Animation Frame (`RAF`) throttle and batch pipeline, ensuring smooth 60fps across dozens of overlapping HTML5 canvases.
- **Self-Healing Data Layer:** Integrates directly with `yahoo-finance2` backing a custom algorithm that protects against corrupted market data ticks / API anomalies (clamping glitch candles to protect scaling logic).
- **Backend Infrastructure:** Efficient multi-symbol HTTP data batching, fortified by Upstash Redis caching modules, drastically reduces rate-limiting risks on public APIs.

## 🛠️ Technology Stack

- **Framework:** Next.js 16 (App Router) + React 19
- **Charting Engine:** TradingView's `lightweight-charts` (v5.1.0)
- **Data APIs:** `yahoo-finance2`
- **Caching:** `@upstash/redis` (optional local dependency fallback)
- **Styling:** Vanilla Modular CSS optimized for tight grid layout constraints.

## 🚀 Getting Started

### 1. Installation

Clone the repository and install packages:

```bash
npm install
# or
yarn install
# or
pnpm install
```

### 2. Environment Variables

Create a `.env.local` file in the root directory. To enable aggressive server-side caching (which limits the times Yahoo Finance is artificially delayed), enter your Upstash details:

```env
UPSTASH_REDIS_REST_URL="your-upstash-url"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"
```

*(Note: The application is designed to gracefully fallback to live fetches if these keys are missing during early development).*

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to launch the terminal.

## 🗺️ Roadmap (Swing Trading Migration)

The platform is actively adopting features that augment end-of-day Swing Traders over active Day Traders:
- **Alert Persistence**: Mapping `createPriceLine()` horizontal alarms via Local Storage saving layouts natively.
- **Advanced Momentum**: Introduction of MACD arrays beneath RSI logic.
- **Risk Calculation**: Adding ATR (Average True Range) trailing visualizers to automatically model viable stop-loss levels.
- **Relative Strength Overlays**: Custom division plotting against dominant indices (e.g. `^NSEI`).

## 🤝 Contributing

Contributions, issues and feature requests are welcome! Feel free to check the issues page or reference `SWING_TRADING_IDEAS.md` for our current directional strategies.
