/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output for static export (S3/CloudFront deployment)
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  
  // Allow API calls to FastAPI backend (development only)
  // In production, CloudFront handles /api/* routing
  async rewrites() {
    // Only use rewrites in development
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
  
  // For static export
  images: {
    unoptimized: true,
  },
  
  // Trailing slashes for S3 compatibility
  trailingSlash: true,
};

module.exports = nextConfig;
