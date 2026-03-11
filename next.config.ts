import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas', 'pdfjs-dist'],
} as NextConfig & { eslint?: { ignoreDuringBuilds: boolean } };
(nextConfig as Record<string, unknown>).eslint = { ignoreDuringBuilds: true };

export default nextConfig;
