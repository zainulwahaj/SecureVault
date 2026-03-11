/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Docker / Nginx serving
  output: 'export',
  
  // Development: proxy /api to FastAPI backend
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/api/:path*',
      },
    ];
  },
  
  images: {
    unoptimized: true,
  },

  trailingSlash: true,
};

module.exports = nextConfig;
