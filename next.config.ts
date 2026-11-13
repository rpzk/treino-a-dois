import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained Node server for Hostinger VPS (Docker or systemd + reverse proxy).
  output: "standalone",
};

export default nextConfig;
