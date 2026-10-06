import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/api/auth/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, private' }],
      },
      {
        source: '/api/tasks/events',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-transform' },
          { key: 'X-Accel-Buffering', value: 'no' },
        ],
      },
    ];
  },
};

export default nextConfig;
