import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {},
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/intake": ["./node_modules/playwright-core/.local-browsers/**/*"],
  },
};

export default nextConfig;
