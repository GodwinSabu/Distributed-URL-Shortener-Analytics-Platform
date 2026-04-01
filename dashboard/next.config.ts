import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy /bun/* to the Bun backend — avoids CORS in browser
      {
        source:      "/bun/:path*",
        destination: "http://localhost:3000/:path*",
      },
    ];
  },
};

export default nextConfig;