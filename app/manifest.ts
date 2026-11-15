import type { MetadataRoute } from 'next';

// "Add to Home Screen" on phones: the CRM opens full screen with the Minawa icon, like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Minawa Group CRM',
    short_name: 'Minawa CRM',
    description: 'Maintenance dues, WhatsApp bills and Safepay payments for Minawa Group',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F5F1',
    theme_color: '#F6F5F1',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}
