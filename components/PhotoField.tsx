'use client';
// A photo field (21 Nov 2026): "Take photo" opens the phone's camera, "Choose image" picks one already on the phone.
// The photo is shrunk here before it is sent (longest side 1600 px, JPEG; usually 100–400 KB instead of 3–5 MB),
// uploaded, and its id goes with the form (hidden field). With `attach`, it is saved straight onto that bill instead.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { attachBillPhotoAction } from '@/lib/actions-photos';
import { Ic } from './icons';

const kb = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

/** Shrinks a photo to a JPEG no larger than `max` px on its longest side. Falls back to the original when the
 *  browser can't read it (the server then checks it). */
export async function shrink(file: File, max = 1600, quality = 0.72): Promise<Blob> {
  let bmp: ImageBitmap | HTMLImageElement;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); }
  catch {
    try {
      bmp = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(file); });
    } catch { return file; }
  }
  const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, max / Math.max(w0, h0)), w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (!g) return file;
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
  const out = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/jpeg', quality));
  if (!out) return file;
  // Still large (a very detailed photo): once more, smaller.
  if (out.size > 600 * 1024 && max > 1280) return shrink(file, 1280, 0.62);
  return out.size < file.size || !/jpe?g|png/i.test(file.type) ? out : file;
}

export function PhotoField({ pid, kind = 'payment', owner = '', name = 'photo', label = 'Photo', hint, required = false, requiredWhen, attach, current, small = false }: {
  pid: string; kind?: 'payment' | 'bill'; owner?: string; name?: string; label?: string; hint?: string;
  /** Always required, or only when another field of the form has this value (e.g. method = Bank transfer). */
  required?: boolean; requiredWhen?: { name: string; value: string };
  /** Save it straight onto this electricity bill (no form). */
  attach?: { billId: string };
  /** A photo already there (its id). */
  current?: string | null; small?: boolean;
}) {
  const router = useRouter();
  const [id, setId] = useState<string>(current || ''), [busy, setBusy] = useState(''), [err, setErr] = useState(''), [info, setInfo] = useState('');
  const [need, setNeed] = useState(required), box = useRef<HTMLDivElement>(null), check = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null), pick = useRef<HTMLInputElement>(null), [live, setLive] = useState(false);
  // "Take photo": a phone opens its own camera app (the file input's capture hint); a laptop or desktop ignores that
  // hint, so the CRM opens the webcam itself (21 Nov 2026). If no camera can be used, the file picker opens instead.
  const takePhoto = () => {
    const phone = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (phone || !navigator.mediaDevices?.getUserMedia) { cam.current?.click(); return; }
    setErr(''); setLive(true);
  };
  // Required only for some answers of the form (a bank transfer): follow that field.
  useEffect(() => {
    if (!requiredWhen) return;
    const form = box.current?.closest('form'); if (!form) return;
    const upd = () => { const v = (form.elements.namedItem(requiredWhen.name) as RadioNodeList | HTMLInputElement | null)?.value; setNeed(required || v === requiredWhen.value); };
    upd(); form.addEventListener('change', upd); return () => form.removeEventListener('change', upd);
  }, [requiredWhen, required]);
  useEffect(() => { check.current?.setCustomValidity(need && !id ? (busy ? 'Wait for the photo to finish uploading.' : `Add the ${label.toLowerCase()}: take it with the camera or choose it from the phone.`) : ''); }, [need, id, busy, label]);
  const go = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setInfo(''); setBusy('Shrinking the photo…');
    try {
      const small = await shrink(f);
      setBusy('Uploading…');
      const fd = new FormData(); fd.append('file', small, 'photo.jpg'); fd.append('pid', pid); fd.append('kind', kind); if (owner) fd.append('owner', owner);
      const r = await fetch('/api/upload', { method: 'POST', body: fd }), j = await r.json().catch(() => ({})) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error || 'The photo couldn\'t be uploaded. Try again.');
      if (attach) {
        setBusy('Saving on the bill…');
        const a = await attachBillPhotoAction({ pid, billId: attach.billId, imageId: j.id });
        if (!a.ok) throw new Error(a.error || 'Not saved on the bill. Try again.');
        router.refresh();
      }
      setId(j.id); setInfo(`${kb(small.size)}${small.size < f.size ? ` (was ${kb(f.size)})` : ''}`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(''); if (cam.current) cam.current.value = ''; if (pick.current) pick.current.value = ''; }
  };
  return <div ref={box} className={'ph-field' + (small ? ' sm' : '') + (err ? ' bad' : '')}>
    {small ? null : <div className="ph-l">{label}{need ? <span className="req"> required</span> : <span className="cell-sub"> (optional)</span>}</div>}
    <input type="hidden" name={attach ? undefined : name} value={id} />
    <input ref={check} className="ph-check" tabIndex={-1} aria-hidden="true" value={id} onChange={() => undefined} required={need} />
    <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={e => go(e.target.files?.[0])} />
    <input ref={pick} type="file" accept="image/jpeg,image/png,image/*" hidden onChange={e => go(e.target.files?.[0])} />
    <div className="ph-row">
      {id ? <a className="ph-thumb" href={`/api/img/${id}`} target="_blank" rel="noopener" title="Open the photo"><img src={`/api/img/${id}`} alt={label} /></a> : null}
      <div className="ph-btns">
        <button type="button" className="btn sm" disabled={!!busy} onClick={takePhoto}><Ic n="camera" s={15} /> {id ? 'Retake' : 'Take photo'}</button>
        <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => pick.current?.click()}><Ic n="image" s={15} /> {id ? 'Choose another' : 'Choose image'}</button>
      </div>
      <div className="ph-st" role="status">{busy ? <span className="cell-sub">{busy}</span> : err ? <span className="bld-err">{err}</span> : id ? <span className="tag good">{attach ? 'On the bill' : 'Photo added'}{info ? ` · ${info}` : ''}</span> : null}</div>
    </div>
    {hint && !small ? <p className="cell-sub" style={{ margin: '4px 0 0' }}>{hint}</p> : null}
    {live ? <CameraBox label={label} onClose={() => setLive(false)} onShot={f => { setLive(false); void go(f); }}
      onFail={why => { setLive(false); setErr(why); pick.current?.click(); }} /> : null}
  </div>;
}

/** The webcam, on top of everything (21 Nov 2026): a live picture, Capture, Switch camera (when there are two) and
 *  Cancel. The picture taken goes through the same shrinking and upload as a chosen photo. */
function CameraBox({ label, onClose, onShot, onFail }: { label: string; onClose: () => void; onShot: (f: File) => void; onFail: (why: string) => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment'), [ready, setReady] = useState(false), [many, setMany] = useState(false);
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (stop) { s.getTracks().forEach(t => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => undefined); }
        setReady(true);
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        setMany(cams.length > 1);
      } catch (e) {
        const n = (e as DOMException)?.name;
        onFail(n === 'NotAllowedError' || n === 'SecurityError' ? 'The camera is blocked for this site. Allow the camera in the browser (the camera icon in the address bar), or choose the photo instead.'
          : n === 'NotFoundError' || n === 'OverconstrainedError' ? 'No camera was found on this computer. Choose the photo instead.'
          : 'The camera couldn\'t be opened (it may be in use by another app). Choose the photo instead.');
      }
    })();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', k, true);
    return () => { stop = true; document.removeEventListener('keydown', k, true); stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; setReady(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);
  const shoot = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(b => { if (b) onShot(new File([b], 'camera.jpg', { type: 'image/jpeg' })); }, 'image/jpeg', 0.92);
  };
  return createPortal(<div className="cam-box" role="dialog" aria-modal="true" aria-label={`Take the ${label.toLowerCase()}`}>
    <div className="cam-card">
      <div className="cam-head"><b>{label}</b><button type="button" className="icon cam-x" aria-label="Close the camera" onClick={onClose}>×</button></div>
      <div className="cam-view">{/* eslint-disable-next-line jsx-a11y/media-has-caption */}<video ref={video} playsInline muted autoPlay />{ready ? null : <span className="cam-wait">Opening the camera… allow it if the browser asks.</span>}</div>
      <div className="cam-acts">
        {many ? <button type="button" className="btn sm ghost" onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}>Switch camera</button> : <span />}
        <div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary cam-shot" disabled={!ready} onClick={shoot}><Ic n="camera" s={16} /> Capture</button></div>
      </div>
    </div>
  </div>, document.body);
}
