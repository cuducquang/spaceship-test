import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ship the bundled dataset + knowledge seed files with serverless functions
  // so the CSV fallback and knowledge store work on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./data/**"],
  },
};

export default nextConfig;
