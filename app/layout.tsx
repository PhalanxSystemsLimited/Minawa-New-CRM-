import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import '../styles/minawa-theme.css';
import '../styles/minawa-additions.css';
import '../styles/minawa-refresh.css';
import '../styles/minawa-live.css';
import '../styles/minawa-mobile.css';
import '../styles/minawa-themes-auto.css';
import '../styles/minawa-themes.css';
import { Toasts, Behaviour } from '@/components/client';

export const metadata: Metadata = { title: 'Minawa Group ERP · Maintenance', description: 'Maintenance dues, WhatsApp bills and payments for Minawa Group', icons: { icon: '/assets/minawa-mark.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Minawa CRM', statusBarStyle: 'default' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F6F5F1' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The CRM theme (Light, Dark or Frost) is set before the page paints. Not on sign-in or owners' payment pages. */}
        <script dangerouslySetInnerHTML={{ __html: "try{var m=document.cookie.match(/(?:^|; )minawa-theme=(dark|frost)/);if(m&&!/^\\/(login|pay)(\\/|$)/.test(location.pathname))document.documentElement.dataset.theme=m[1]}catch(e){}" }} />
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
