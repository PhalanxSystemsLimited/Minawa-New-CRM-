// "New payments" badges: each person's last look at a project's Payments page is kept in a cookie (per person and
// project). Payments recorded after it count as new; on a first visit, those of the last 7 days.
export const payKey = (p: { d: string; t: string; id: string }) => `${p.d}T${p.t}~${p.id}`;
export const paySeenCookie = (staffId: string, pid: string) => `mpay_${staffId.replace(/[^a-z0-9-]/gi, '')}_${pid}`;
export const NEW_DAYS = 7;
