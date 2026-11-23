// Attendance screens: while one is open, the Attendance notification counter is cleared (on every device).
import { requireStaff } from '@/lib/session';
import { attFeed } from '@/lib/att-notify';
import { AttSeen } from '@/components/AttBits';

export const dynamic = 'force-dynamic';

export default async function AttLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff(), f = await attFeed(me);
  return <>{children}<AttSeen unseen={f.unseen} /></>;
}
