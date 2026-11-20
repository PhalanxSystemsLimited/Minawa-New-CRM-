// Received payments moved into Payments (update 122): old links and bookmarks land there.
import { redirect } from 'next/navigation';

export default async function Received({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, q = new URLSearchParams(Object.entries({ p: sp.p || '', month: sp.month || '', via: sp.via || '', who: sp.who || '' }).filter(([, v]) => v));
  redirect('/payments' + (q.toString() ? '?' + q : ''));
}
