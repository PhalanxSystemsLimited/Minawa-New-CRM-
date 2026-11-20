// Apartment bits shared by the Apartments screens (21 Nov 2026).
import type { FlatRow } from '@/lib/people';

/** Possessed, booked (a possession waiting for the Admin's approval) or available. */
export const statusTag = (f: FlatRow) => f.status === 'occupied' ? <span className="tag good">Possessed</span>
  : f.status === 'booked' ? <span className="tag info">Booked · waiting for approval</span>
  : <span className="tag warn">Available</span>;
