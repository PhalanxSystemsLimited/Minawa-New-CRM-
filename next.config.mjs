/** @type {import('next').NextConfig} */
const nextConfig = {
  // @react-pdf/renderer runs on the server only, as a normal Node package.
  serverExternalPackages: ['@react-pdf/renderer'],
  // The PDF maker loads pdfkit's built-in fonts (standard-fonts/*.cjs) at run time, which Vercel's bundler doesn't see,
  // so it left them out and every PDF failed ("Cannot find module …/standard-fonts/Helvetica.cjs"). Pack them, plus
  // the brand fonts and logo, with the PDF route.
  outputFileTracingIncludes: {
    '/api/pdf/**': ['./node_modules/pdfkit/js/standard-fonts/**/*', './node_modules/pdfkit/js/data/**/*', './public/fonts/**/*', './public/assets/minawa-logo.png']
  },
  // The demo's plain <img> tags are kept as they are, so the look matches exactly.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverActions: { bodySizeLimit: '8mb' } }
};
export default nextConfig;
