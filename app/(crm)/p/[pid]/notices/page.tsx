// Notices are now part of Send on WhatsApp (Maintenance notice): this address still works.
import { redirect } from 'next/navigation';
export default async function Notices({ params }: { params: Promise<{ pid: string }> }) { const { pid } = await params; redirect(`/p/${pid}/send?mode=notice`); }
