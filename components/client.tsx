'use client';
// Small client pieces. Everything else renders on the server, so the markup matches the demo exactly.
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode, type CSSProperties } from 'react';

/** A <button> that navigates (the demo's buttons, kept as buttons so they look identical). */
export function Go({ href, className, children, title, ariaLabel, current, pressed, style, replace }: {
  href: string; className?: string; children?: ReactNode; title?: string; ariaLabel?: string; current?: boolean | 'page' | 'true' | 'false'; pressed?: boolean; style?: CSSProperties; replace?: boolean;
}) {
  const r = useRouter();
  const cur = current === true ? 'page' : current === false ? undefined : current;
  return <button type="button" className={className} title={title} aria-label={ariaLabel} aria-current={cur} aria-pressed={pressed} style={style}
    onClick={e => { e.stopPropagation(); closeSide(); if (replace) r.replace(href, { scroll: false }); else r.push(href); }}>{children}</button>;
}
/** A link styled as the demo's plain links (<a href="#">). */
export function A({ href, className, children, title }: { href: string; className?: string; children?: ReactNode; title?: string }) {
  const r = useRouter();
  return <a href={href} className={className} title={title} onClick={e => { e.preventDefault(); e.stopPropagation(); closeSide(); r.push(href); }}>{children}</a>;
}
/** A clickable row or list item. */
export function GoRow({ href, as = 'tr', className, children }: { href: string; as?: 'tr' | 'div'; className?: string; children?: ReactNode }) {
  const r = useRouter();
  const go = () => r.push(href);
  if (as === 'div') return <div className={className} onClick={go}>{children}</div>;
  return <tr className={className} onClick={go}>{children}</tr>;
}
function closeSide() { if (typeof document !== 'undefined') document.body.classList.remove('side-open'); }

/** Removes one or more query keys (to close a modal) while keeping the rest. */
export function useWithout() {
  const path = usePathname(), sp = useSearchParams();
  return (...keys: string[]) => { const q = new URLSearchParams(sp.toString()); keys.forEach(k => q.delete(k)); const s = q.toString(); return path + (s ? '?' + s : ''); };
}
export function ModalShell({ title, wide, children, closeKeys = ['m', 'doc', 'id', 'flash'] }: { title: string; wide?: boolean; children: ReactNode; closeKeys?: string[] }) {
  const r = useRouter(), without = useWithout(), card = useRef<HTMLDivElement>(null);
  const close = () => r.replace(without(...closeKeys), { scroll: false });
  useEffect(() => {
    const f = card.current?.querySelector<HTMLElement>('input:not([type=radio]):not([type=hidden]),select,textarea,button.primary'); f?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div id="modal">
      <div className="m-back" onClick={close}></div>
      <div ref={card} className={'m-card' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="m-head"><h3>{title}</h3><button className="icon" onClick={close} aria-label="Close">×</button></div>
        <div className="m-body">{children}</div>
      </div>
    </div>
  );
}
export function CloseBtn({ label = 'Cancel', className = 'btn', keys = ['m', 'doc', 'id', 'flash'] }: { label?: string; className?: string; keys?: string[] }) {
  const r = useRouter(), without = useWithout();
  return <button type="button" className={className} onClick={() => r.replace(without(...keys), { scroll: false })}>{label}</button>;
}

/** Toast from ?t=…, shown once, then removed from the address. */
export function Toasts() {
  const sp = useSearchParams(), r = useRouter(), without = useWithout();
  const [list, setList] = useState<{ id: number; text: string }[]>([]);
  const t = sp.get('t');
  useEffect(() => {
    if (!t) return;
    const id = Date.now();
    setList(l => [...l, { id, text: t }]);
    r.replace(without('t'), { scroll: false });
    setTimeout(() => setList(l => l.filter(x => x.id !== id)), 3600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  return <div id="toast" aria-live="polite">{list.map(x => <div key={x.id} className="toast">{x.text}</div>)}</div>;
}

/** Closes open <details> menus on an outside click or Escape, and opens the sidebar on phones. */
export function Behaviour() {
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      document.querySelectorAll('details.more[open]').forEach(d => { if (!d.contains(t)) d.removeAttribute('open'); });
      if (t.closest('[data-a="side-open"]')) document.body.classList.add('side-open');
      if (t.closest('[data-a="side-close"]')) document.body.classList.remove('side-open');
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') document.querySelectorAll('details.more[open]').forEach(d => d.removeAttribute('open')); };
    document.addEventListener('click', click); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('click', click); document.removeEventListener('keydown', key); };
  }, []);
  return null;
}

/** A search box that filters as you type, by updating one query key. */
export function LiveSearch({ name, placeholder, className = 'search', id, ariaLabel, base, defaultValue = '' }: { name: string; placeholder: string; className?: string; id?: string; ariaLabel?: string; base?: string; defaultValue?: string }) {
  const r = useRouter(), path = usePathname(), sp = useSearchParams();
  const [v, setV] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const push = (val: string) => {
    const q = new URLSearchParams(base ? '' : sp.toString());
    if (val) q.set(name, val); else q.delete(name);
    const s = q.toString();
    r.replace((base || path) + (s ? '?' + s : ''), { scroll: false });
  };
  return <input className={className} id={id} type="search" placeholder={placeholder} aria-label={ariaLabel || placeholder} value={v}
    onChange={e => { setV(e.target.value); if (timer.current) clearTimeout(timer.current); const val = e.target.value; timer.current = setTimeout(() => push(val), 220); }} />;
}

/** The global search in the top bar: goes to the project's Apartments page with the search filled in. */
export function GlobalSearch({ base, defaultValue }: { base: string; defaultValue: string }) {
  const r = useRouter();
  const [v, setV] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return <input id="gsearch" type="search" placeholder="Search apartments or owners" aria-label="Search apartments or owners" value={v}
    onChange={e => { const val = e.target.value; setV(val); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => r.replace(`${base}${val ? '?q=' + encodeURIComponent(val) : ''}`, { scroll: false }), 220); }} />;
}

/** A select that navigates when changed (filters). */
export function GoSelect({ name, options, value, id, ariaLabel, style }: { name: string; options: [string, string][]; value: string; id?: string; ariaLabel?: string; style?: CSSProperties }) {
  const r = useRouter(), path = usePathname(), sp = useSearchParams();
  return <select id={id} aria-label={ariaLabel} style={style} value={value} onChange={e => { const q = new URLSearchParams(sp.toString()); q.set(name, e.target.value); r.replace(path + '?' + q.toString(), { scroll: false }); }}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>;
}

/** A switch or checkbox that calls a server action, then refreshes. */
export function ActionCheck({ action, args, checked, disabled, mixed, role, title }: { action: (fd: FormData) => Promise<void>; args: Record<string, string>; checked: boolean; disabled?: boolean; mixed?: boolean; role?: string; title?: string }) {
  const ref = useRef<HTMLInputElement>(null), [pending, start] = useTransition(), r = useRouter();
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" role={role} defaultChecked={checked} disabled={disabled || pending} title={title}
    onChange={e => { const fd = new FormData(); Object.entries(args).forEach(([k, v]) => fd.set(k, v)); fd.set('on', e.target.checked ? '1' : ''); start(async () => { await action(fd); r.refresh(); }); }} />;
}

/** Copies text to the clipboard (manual WhatsApp sending). */
export function CopyOpen({ text, href, className, children }: { text: string; href: string; className?: string; children: ReactNode }) {
  return <a className={className} href={href} target="_blank" rel="noopener" onClick={() => { navigator.clipboard?.writeText(text).catch(() => undefined); }}>{children}</a>;
}
export function PrintBtn({ className = 'btn', children }: { className?: string; children: ReactNode }) {
  return <button type="button" className={className} onClick={() => window.print()}>{children}</button>;
}
/** A submit button that shows it is working. */
export function Submit({ className = 'btn primary', children, pendingText = 'Working…', disabled }: { className?: string; children: ReactNode; pendingText?: string; disabled?: boolean }) {
  return <SubmitInner className={className} pendingText={pendingText} disabled={disabled}>{children}</SubmitInner>;
}
import { useFormStatus } from 'react-dom';
function SubmitInner({ className, children, pendingText, disabled }: { className: string; children: ReactNode; pendingText: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending || disabled}>{pending ? pendingText : children}</button>;
}

/** Password box with an eye button: click to show the password, click again to hide it. */
export function PasswordInput({ id, name, autoComplete, required, minLength, placeholder }: { id: string; name: string; autoComplete?: string; required?: boolean; minLength?: number; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input id={id} name={name} type={show ? 'text' : 'password'} autoComplete={autoComplete} required={required} minLength={minLength} placeholder={placeholder}
        autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pw-eye" onClick={() => setShow(v => !v)} aria-pressed={show} aria-controls={id}
        aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
        {show ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
