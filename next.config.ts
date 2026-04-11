import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // yahoo-finance2 uses some Node.js features that trigger
  // webpack warnings in the server bundle — this is safe to ignore.
  serverExternalPackages: ['yahoo-finance2'],
};

export default nextConfig;
