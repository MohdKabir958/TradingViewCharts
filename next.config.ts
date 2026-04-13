import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // yahoo-finance2 uses some Node.js features that trigger
  // webpack warnings in the server bundle — this is safe to ignore.
  serverExternalPackages: ['yahoo-finance2'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
