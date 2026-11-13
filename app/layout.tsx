import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import '../styles/minawa-theme.css';
import '../styles/minawa-additions.css';
import '../styles/minawa-refresh.css';
import { Toasts, Behaviour } from '@/components/client';

export const metadata: Metadata = { title: 'Minawa Group ERP · Maintenance', description: 'Maintenance dues, WhatsApp bills and Safepay payments for Minawa Group', icons: { icon: '/assets/minawa-mark.png' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F6F5F1' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" />
      </head>
      <body>
        {children}
        <Suspense><Toasts /></Suspense>
        <Behaviour />
      </body>
    </html>
  );
}
