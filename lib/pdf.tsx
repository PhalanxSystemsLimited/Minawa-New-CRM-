// PDFs of bills, receipts, statements and clearance certificates, in the same look as the on-screen documents.
import path from 'node:path';
import fs from 'node:fs';
import React from 'react';
// Loaded on first use with import(), so command-line scripts (tsx) can load it too.
type RPDF = typeof import('@react-pdf/renderer');
let R: RPDF | null = null;
import type { DocData } from './docdata';

const pub = (...p: string[]) => path.join(process.cwd(), 'public', ...p);
let fonts = false;
function registerFonts(Font: RPDF['Font']) {
  if (fonts) return; fonts = true;
  Font.register({ family: 'Inter', fonts: [
    { src: pub('fonts', 'inter-latin-400-normal.woff'), fontWeight: 400 },
    { src: pub('fonts', 'inter-latin-600-normal.woff'), fontWeight: 600 },
    { src: pub('fonts', 'inter-latin-700-normal.woff'), fontWeight: 700 }] });
  Font.register({ family: 'Space Grotesk', fonts: [
    { src: pub('fonts', 'space-grotesk-latin-500-normal.woff'), fontWeight: 500 },
    { src: pub('fonts', 'space-grotesk-latin-700-normal.woff'), fontWeight: 700 }] });
  Font.registerHyphenationCallback(w => [w]);
}

const INK = '#161B1F', LINE = '#D9D3C9', MUTED = '#565B5F', STONE = '#F3F0EA';
const styles = () => ({
  page: { padding: 36, fontFamily: 'Inter', fontSize: 9.5, color: '#232a30' },
  doc: { display: 'flex', flexDirection: 'column', gap: 12 },
  dh: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 10 },
  logo: { height: 40, objectFit: 'contain', alignSelf: 'flex-start' },
  sub: { color: MUTED, fontSize: 8.5, marginTop: 2 },
  ref: { fontWeight: 700, textAlign: 'right' },
  kv: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  kvItem: { width: '50%', paddingRight: 12 },
  kvLabel: { color: '#697277', fontSize: 8 },
  table: { borderTopWidth: 0 },
  th: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 5 },
  thText: { color: MUTED, fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eef2f2', paddingVertical: 5 },
  tot: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: INK, paddingVertical: 6 },
  c1: { flexGrow: 1, flexShrink: 1, paddingRight: 8 }, c2: { width: 120, textAlign: 'right' },
  rowSub: { color: '#697277', fontSize: 8, marginTop: 1 },
  fine: { backgroundColor: '#fff4e0', padding: 8, color: '#6b4200' },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 2, borderColor: INK, backgroundColor: STONE, padding: 10 },
  stampSp: { backgroundColor: '#E2EDE4', borderColor: '#2F6B3F' },
  rsIc: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2F6B3F', color: '#fff', textAlign: 'center', paddingTop: 5, fontWeight: 700 },
  rsTitle: { fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 11, color: INK },
  rsText: { color: '#4a524c', fontSize: 9, marginTop: 1 },
  rsAmt: { marginLeft: 'auto', fontFamily: 'Space Grotesk', fontWeight: 700, fontSize: 15, color: INK },
  cert: { borderWidth: 2, borderColor: INK, backgroundColor: STONE, padding: 9, textAlign: 'center', fontWeight: 700, letterSpacing: 1, color: INK },
  foot: { color: '#4a524c', fontSize: 8.5 }
});

function Doc({ d }: { d: DocData }) {
  const { Document, Page, Text, View, Image } = R!;
  const st = styles() as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const logo = fs.existsSync(pub('assets', 'minawa-logo.png')) ? pub('assets', 'minawa-logo.png') : null;
  return (
    <Document title={d.filename.replace(/\.pdf$/, '')} author="Minawa Group">
      <Page size="A4" style={st.page}>
        <View style={st.doc}>
          <View style={st.dh}>
            <View>{/* eslint-disable-next-line jsx-a11y/alt-text */}{logo ? <Image src={logo} style={st.logo} /> : <Text style={{ fontWeight: 700 }}>Minawa Group</Text>}<Text style={st.sub}>{d.subtitle}</Text></View>
            <View><Text style={st.ref}>{d.refNo}</Text><Text style={[st.sub, { textAlign: 'right' }]}>{d.refSub}</Text></View>
          </View>
          {d.stamp ? <View style={d.stamp.sp ? [st.stamp, st.stampSp] : st.stamp}><Text style={st.rsIc}>✓</Text><View><Text style={st.rsTitle}>{d.stamp.title}</Text><Text style={st.rsText}>{d.stamp.text}</Text></View><Text style={st.rsAmt}>{d.stamp.amount}</Text></View> : null}
          {d.certificate ? <Text style={st.cert}>{d.certificate}</Text> : null}
          {(d.paras || []).map((p, i) => <Text key={i}>{p}</Text>)}
          <View style={st.kv}>{d.kv.map(([k, v]) => <View key={k} style={st.kvItem}><Text style={st.kvLabel}>{k}</Text><Text>{v}</Text></View>)}</View>
          {d.tables.map((t, i) => (
            <View key={i} style={st.table}>
              {t.head ? <View style={st.th}><Text style={[st.thText, st.c1]}>{t.head[0]}</Text><Text style={[st.thText, st.c2]}>{t.head[1]}</Text></View> : null}
              {t.rows.map((r, j) => (
                <View key={j} style={r.tot ? st.tot : st.tr} wrap={false}>
                  <View style={st.c1}><Text style={r.tot || r.bold ? { fontWeight: 700 } : {}}>{r.label}</Text>{r.sub ? <Text style={st.rowSub}>{r.sub}</Text> : null}</View>
                  <Text style={[st.c2, r.tot || r.bold ? { fontWeight: 700 } : {}]}>{r.amount}</Text>
                </View>))}
            </View>))}
          {d.howToPay ? <View><Text style={{ fontWeight: 700 }}>How to pay</Text>{d.howToPay.map((h, i) => <Text key={i}>{h}</Text>)}</View> : null}
          {d.fine ? <Text style={st.fine}>{d.fine}</Text> : null}
          {d.foot ? <Text style={st.foot}>{d.foot}</Text> : null}
          {d.org ? <Text style={[st.foot, { borderTopWidth: 1, borderTopColor: LINE, paddingTop: 6 }]}>{d.org}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}

export async function renderPdf(d: DocData): Promise<Buffer> {
  if (!R) R = await import('@react-pdf/renderer');
  registerFonts(R.Font);
  return R.renderToBuffer(<Doc d={d} />);
}
