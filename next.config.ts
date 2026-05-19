import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ESLint runs in CI/lint script; do not block production builds on lint warnings.
  // (Type errors are still caught by tsc during build.)
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
