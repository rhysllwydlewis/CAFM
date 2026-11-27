import type { NextConfig } from 'next';

// Read at build time: the /api rewrite is fixed into the build. The production
// start script runs the API on 127.0.0.1:4000 in the same container.
const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:4000';

const config: NextConfig = {
  transpilePackages: ['@fmstead/ui'],
  poweredByHeader: false,
  // The API is served on the same site under /api so session cookies stay first-party (doc 06).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // The camera is allowed for this site only: /m/scan reads QR labels with getUserMedia, and `camera=()`
          // would block it for everyone, so the scanner could never start.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default config;
