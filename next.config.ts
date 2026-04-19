import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {},
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/intake": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
};

export default nextConfig;
