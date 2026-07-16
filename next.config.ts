import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Next.js sizes build worker concurrency off os.cpus(), which on this
  // Hostinger plan reports far more cores than the account's process quota
  // (120) actually allows — every build was spiking to the ceiling.
  experimental: {
    cpus: 2,
  },
};

export default nextConfig;
