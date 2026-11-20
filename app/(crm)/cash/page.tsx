// Cash moved into Payments (update 122): old links and bookmarks land there, on the cash view.
import { redirect } from 'next/navigation';

export default async function Cash({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams, q = new URLSearchParams({ via: 'Cash', ...(sp.d ? { d: sp.d } : {}) });
  redirect('/payments?' + q.toString());
}
