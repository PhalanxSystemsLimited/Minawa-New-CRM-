// A building manager's view of one customer (25 Nov 2026): full history to read, Add payment, and the locked
// "Send the receipt" screen after each payment (components/views/manager.tsx).
import { redirect } from 'next/navigation';
import { requireStaff } from '@/lib/session';
import { ManagerCustomer } from '@/components/views/manager';

export const dynamic = 'force-dynamic';

export default async function MgrCustomer({ params, searchParams }: { params: Promise<{ pid: string; oid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { pid, oid } = await params, sp = await searchParams;
  const staff = await requireStaff();
  // Everyone else has the full customer page.
  if (staff.role !== 'manager') redirect(`/p/${pid}/apartments/${encodeURIComponent(decodeURIComponent(oid))}`);
  return <ManagerCustomer staff={staff} pid={pid} oid={decodeURIComponent(oid)} sp={sp} />;
}
