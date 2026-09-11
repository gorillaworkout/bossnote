import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/api/auth/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, private' }],
      },
    ];
  },
};

export default nextConfig;
