// One change request (an accountant's change to an owner's charges): what it changes, what it is now, who asked and
// when, and Approve / Reject for admins or Withdraw for the person who asked. Used on the Approvals page, the dashboard
// and the apartment page.
import type { Approval } from '@/lib/types';
import { KIND_LABEL } from '@/lib/approvals';
import { approveAction, rejectAction, withdrawApprovalAction } from '@/lib/actions-approvals';
import { Go } from '@/components/client';
import { IC, lastSeen } from './activity';

export interface ApprovalView { a: Approval; apt: string; owner: string; pname: string }

const STATUS: Record<Approval['status'], [string, string, string]> = {
  pending: ['Waiting for approval', 'warn', 'clock'], approved: ['Approved', 'good', 'check'], rejected: ['Rejected', 'bad', 'x'], withdrawn: ['Withdrawn', 'muted', 'x']
};
const KIND_TONE: Record<Approval['kind'], string> = { discount: 'good', generator: 'info', plan: 'accent', rate: 'accent', adjust: 'warn', rates: 'accent', rules: 'info', fine: 'bad', announce: 'wa' };

export function ApprovalItem({ v, admin, meId, back, showOwner = true }: { v: ApprovalView; admin: boolean; meId: string; back: string; showOwner?: boolean }) {
  const { a } = v, [sl, st, si] = STATUS[a.status];
  const verb = a.status === 'approved' ? 'Approved' : a.status === 'rejected' ? 'Rejected' : 'Withdrawn';
  return <div className={`apv apv-${a.status}`}>
    <div className="apv-main">
      <div className="apv-top">
        <span className={`k abadge t-${KIND_TONE[a.kind]}`}>{IC.shield}{KIND_LABEL[a.kind]}</span>
        <span className={`k abadge${a.status === 'withdrawn' ? '' : ' solid'} t-${st}`}>{IC[si]}{sl}</span>
        {!a.ownerId ? <span className="apv-who"><Go href={a.kind === 'announce' ? `/p/${a.project}/send?mode=announce` : `/p/${a.project}/settings`} className="apt-a">{v.pname}</Go> <span className="cell-sub">whole project · {a.kind === 'announce' ? 'Send on WhatsApp' : 'Settings'}</span></span>
          : showOwner ? <span className="apv-who"><Go href={`/p/${a.project}/apartments/${a.ownerId}`} className="apt-a">{v.apt}</Go> <span className="cell-sub">{v.owner} · {v.pname}</span></span> : null}
      </div>
      <div className="apv-sum">{a.summary}</div>
      <div className="apv-now"><span className="muted">Now:</span> {a.before}</div>
      {a.note ? <div className="apv-note"><span className="muted">Reason:</span> {a.note}</div> : null}
      <div className="cell-sub">Asked by <b>{a.byName}</b> · {lastSeen(a.d, a.t)}{a.status !== 'pending' && a.decidedD ? <> · {verb}{a.decidedByName && a.decidedByName !== a.byName ? <> by <b>{a.decidedByName}</b></> : null} · {lastSeen(a.decidedD, a.decidedT || '')}</> : null}</div>
      {a.reply ? <div className={`apv-reply${a.status === 'rejected' ? ' bad' : ''}`}><span className="muted">{a.status === 'rejected' ? 'Why it was rejected' : 'Admin\'s note'}:</span> {a.reply}</div> : a.status === 'rejected' ? <div className="apv-reply bad"><span className="muted">Rejected without a note.</span></div> : null}
    </div>
    {a.status !== 'pending' ? null : admin ? <form action={approveAction} className="apv-act">
      <input type="hidden" name="pid" value={a.project} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} />
      <input name="reply" type="text" placeholder="Note for the accountant (optional)" aria-label={`Note for ${a.byName}`} />
      <div className="apv-btns"><button type="submit" formAction={rejectAction} className="btn sm">Reject</button><button type="submit" className="btn sm primary">Approve</button></div>
    </form> : a.byId === meId ? <form action={withdrawApprovalAction} className="apv-act">
      <input type="hidden" name="pid" value={a.project} /><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} />
      <div className="apv-btns"><button type="submit" className="btn sm">Withdraw</button></div>
    </form> : null}
  </div>;
}
