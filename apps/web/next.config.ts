import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@noor-drive/shared-types'],
  poweredByHeader: false,
  compress: false, // Saves Node.js buffer memory in 512MB RAM environments
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_URL || 'http://localhost:4000/api/:path*',
      },
    ];
  },
};

export default nextConfig;

