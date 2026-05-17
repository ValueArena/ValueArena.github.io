import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
// basePath is empty by default. Override with BASE_PATH env if you ever need a
// subpath deploy (e.g. BASE_PATH=/v2). For deploying side-by-side with the
// existing static site under /next/, set BASE_PATH=/next at build time.
const basePath = process.env.BASE_PATH || '';

const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  // Next 16 (Turbopack) tries to infer the workspace root and gets confused by
  // the sibling `valuearena/valuearena/` Next app. Pin it explicitly.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
