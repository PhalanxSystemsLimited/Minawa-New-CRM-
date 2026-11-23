// "Add to Home Screen" for a personal attendance link: it opens straight on this employee's attendance page.
import { NextResponse } from 'next/server';

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params, start = `/a/${encodeURIComponent(token)}`;
  return NextResponse.json({
    name: 'Minawa Attendance', short_name: 'Attendance', description: 'Check in and out with your fingerprint',
    start_url: start, scope: start, display: 'standalone', orientation: 'portrait', background_color: '#F6F5F1', theme_color: '#F6F5F1',
    icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-store' } });
}
