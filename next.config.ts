import type { NextConfig } from "next";

// Hosts allowed to invoke Server Actions in addition to the app's own host.
// Needed when a reverse proxy (preview URLs, tunnels) rewrites Origin/X-Forwarded-Host.
const allowedOrigins = [
  "localhost",
  "localhost:3000",
  "127.0.0.1:3000",
  "**.preview.devinapps.com",
  ...(process.env.WATTWATCH_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
