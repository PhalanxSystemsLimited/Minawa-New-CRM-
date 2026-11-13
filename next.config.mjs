/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer runs on the server only, as a normal Node package.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The demo's plain <img> tags are kept as they are, so the look matches exactly.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverActions: { bodySizeLimit: '8mb' } }
};
export default nextConfig;
