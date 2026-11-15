import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@noor-drive/shared-types'],
  poweredByHeader: false,
  compress: false, // Saves Node.js buffer memory in 512MB RAM environments
};

export default nextConfig;

