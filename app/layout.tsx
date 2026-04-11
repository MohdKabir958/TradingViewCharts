import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Trading Dashboard — Multi-Chart Terminal',
  description:
    'Real-time multi-chart trading dashboard with 16 simultaneous candlestick charts powered by TradingView Lightweight Charts and Yahoo Finance.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
