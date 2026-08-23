/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // CSV uploads
    },
  },
  async rewrites() {
    // Serve the polished static prototypes as the public marketing + demo app.
    // The Next.js App Router under /app, /login, /signup stays available for the real product.
    return [
      { source: '/', destination: '/landing.html' },
    ];
  },
};

export default nextConfig;
