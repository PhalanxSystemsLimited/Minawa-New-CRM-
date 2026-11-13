// Staff activity is now part of Activity (/log): this address still works and opens it with the same filters.
import { redirect } from 'next/navigation';

export default async function StaffActivity({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams, q = new URLSearchParams({ who: 'accountants', ...sp });
  redirect('/log?' + q.toString());
}
