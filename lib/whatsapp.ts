// WhatsApp Cloud API (Meta), ported from the demo's scripts/whatsapp_cloud.py and extended for templates.
// Business-initiated messages (bills, notices, reminders, receipts) must use templates approved by Meta.
import { waDigits } from './fmt';

const GRAPH = process.env.WHATSAPP_GRAPH_URL || 'https://graph.facebook.com';  // override only for tests
const V = () => process.env.WHATSAPP_API_VERSION || 'v23.0';
const TOKEN = () => process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = () => process.env.WHATSAPP_PHONE_NUMBER_ID || '';
export const waConfigured = () => !!(TOKEN() && PHONE_ID());
export const waLang = () => process.env.WHATSAPP_TEMPLATE_LANG || 'en';
/** While testing, every message goes to this number instead of the owner's. Empty = send to owners. */
export const waTestNumber = () => waDigits(process.env.WHATSAPP_TEST_NUMBER || '');
/** WhatsApp's limit on how many different people Minawa's number may message in 24 hours (business-initiated):
 *  250 until Meta verifies the business, then 2,000 and up. Set WHATSAPP_DAILY_CAP to the current tier; 0 = no limit. */
export const waDailyCap = () => { const v = (process.env.WHATSAPP_DAILY_CAP ?? '').trim(); return v === '' ? 250 : Math.max(0, Math.floor(+v) || 0); };

const FRIENDLY: Record<number, string> = {
  131047: 'WhatsApp only delivers free-form messages within 24 hours of the owner\'s last message. Templates are needed outside that window.',
  131030: 'This number isn\'t on the test number\'s allowed list. In the Meta app, WhatsApp > API Setup > To, add it first.',
  131026: 'The number is not on WhatsApp.',
  190: 'The WhatsApp access token has expired or is wrong. Make a new one in Meta and update WHATSAPP_TOKEN.',
  100: 'WhatsApp rejected the request. Check WHATSAPP_PHONE_NUMBER_ID: it is the Phone number ID from API Setup, not the phone number.',
  132001: 'The template doesn\'t exist in this language or isn\'t approved yet.',
  132000: 'The template\'s variables don\'t match what Meta approved.',
  132005: 'A template value is too long.',
  132012: 'A template value has the wrong format (no line breaks or tabs are allowed inside values).'
};
export class WaError extends Error { code?: number; constructor(m: string, code?: number) { super(m); this.code = code; } }

async function graph(method: string, path: string, body?: BodyInit, contentType = 'application/json') {
  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN()}`, 'User-Agent': 'MinawaERP/1.0' };
  if (contentType) headers['Content-Type'] = contentType;
  const res = await fetch(`${GRAPH}/${path}`, { method, headers, body, cache: 'no-store' });
  let json: Record<string, unknown> = {};
  try { json = await res.json(); } catch { /* empty */ }
  if (res.status >= 300) {
    const e = (json.error || {}) as { code?: number; message?: string; error_user_msg?: string; error_data?: { details?: string } };
    throw new WaError((e.code && FRIENDLY[e.code]) || e.error_user_msg || e.error_data?.details || e.message || `WhatsApp answered HTTP ${res.status}`, e.code);
  }
  return json;
}

export async function sender() {
  const j = await graph('GET', `${V()}/${PHONE_ID()}?fields=display_phone_number,verified_name,quality_rating`);
  return { from: String(j.display_phone_number || ''), name: String(j.verified_name || ''), quality: String(j.quality_rating || '') };
}

export async function uploadPdf(pdf: Buffer, filename: string): Promise<string> {
  const fd = new FormData();
  fd.append('messaging_product', 'whatsapp');
  fd.append('type', 'application/pdf');
  fd.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
  const j = await graph('POST', `${V()}/${PHONE_ID()}/media`, fd, '');
  if (!j.id) throw new WaError('WhatsApp did not return a media id for the PDF.');
  return String(j.id);
}

export interface TemplateSend {
  to: string; name: string; vars: Record<string, string>; doc?: { mediaId: string; filename: string } | null; buttonSuffix?: string | null;
}
// Meta allows no newlines, tabs or 4+ spaces inside a value.
const clean = (v: string) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').slice(0, 1000) || '-';

export async function sendTemplate(m: TemplateSend) {
  const components: unknown[] = [];
  if (m.doc) components.push({ type: 'header', parameters: [{ type: 'document', document: { id: m.doc.mediaId, filename: m.doc.filename } }] });
  const params = Object.entries(m.vars).map(([k, v]) => ({ type: 'text', parameter_name: k, text: clean(v) }));
  if (params.length) components.push({ type: 'body', parameters: params });
  if (m.buttonSuffix) components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.buttonSuffix }] });
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to: m.to, type: 'template', template: { name: m.name, language: { code: waLang() }, components } };
  const j = await graph('POST', `${V()}/${PHONE_ID()}/messages`, JSON.stringify(body));
  const id = ((j.messages as { id: string }[]) || [])[0]?.id;
  if (!id) throw new WaError('WhatsApp did not return a message id.');
  return id;
}

export async function sendText(to: string, text: string) {
  const body = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text.slice(0, 4096), preview_url: true } };
  const j = await graph('POST', `${V()}/${PHONE_ID()}/messages`, JSON.stringify(body));
  return ((j.messages as { id: string }[]) || [])[0]?.id || '';
}

export async function downloadMedia(mediaId: string): Promise<{ url: string; mime: string }> {
  const j = await graph('GET', `${V()}/${mediaId}`);
  return { url: String(j.url || ''), mime: String(j.mime_type || '') };
}

/* ---------- submitting templates to Meta for approval ---------- */
// Needs WHATSAPP_BUSINESS_ACCOUNT_ID, and META_APP_ID for the sample PDF that document-header templates require.
async function sampleHandle(pdf: Buffer) {
  const app = process.env.META_APP_ID;
  if (!app) throw new WaError('Set META_APP_ID (your Meta app\'s ID) to submit templates with a PDF header.');
  const s = await graph('POST', `${V()}/${app}/uploads?file_name=sample.pdf&file_length=${pdf.length}&file_type=application/pdf`, undefined, '');
  const res = await fetch(`${GRAPH}/${V()}/${s.id}`, { method: 'POST', headers: { Authorization: `OAuth ${TOKEN()}`, file_offset: '0' }, body: new Uint8Array(pdf) });
  const j = await res.json() as { h?: string; error?: { message?: string } };
  if (!j.h) throw new WaError(j.error?.message || 'Meta did not accept the sample PDF.');
  return j.h;
}
export async function submitTemplate(o: { name: string; text: string; examples: Record<string, string>; pdfHeader?: Buffer | null; payButtonUrl?: string | null }) {
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!waba) throw new WaError('Set WHATSAPP_BUSINESS_ACCOUNT_ID to submit templates from the CRM.');
  const names = [...new Set([...o.text.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))];
  const components: unknown[] = [];
  if (o.pdfHeader) components.push({ type: 'HEADER', format: 'DOCUMENT', example: { header_handle: [await sampleHandle(o.pdfHeader)] } });
  components.push({ type: 'BODY', text: o.text, example: { body_text_named_params: names.map(n => ({ param_name: n, example: clean(o.examples[n] || n) })) } });
  if (o.payButtonUrl) components.push({ type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Pay Now', url: `${o.payButtonUrl.replace(/\/$/, '')}/pay/{{1}}`, example: ['PL-4801'] }] });
  const body = { name: o.name, language: waLang(), category: 'UTILITY', parameter_format: 'NAMED', components };
  // Each new wording goes in under a new versioned name, so the approved one keeps working until Meta approves it.
  return graph('POST', `${V()}/${waba}/message_templates`, JSON.stringify(body));
}
