import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "marvelcdb.com",
        pathname: "/bundles/cards/**",
      },
    ],
  },
};

export default nextConfig;
