import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Tunnel host must be allowed or /_next chunks throw a client exception.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
