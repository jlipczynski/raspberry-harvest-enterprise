import type { NextConfig } from "next";

const nextConfig: import('next').NextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
