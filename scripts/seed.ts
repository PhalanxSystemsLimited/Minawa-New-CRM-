// npm run seed: puts the demo's sample data in the store. Local mode: rewrites data/local-db.json.
// Supabase: replaces the data of the three sample projects (Park Towers, Clara, Country Club). Never run it on live data.
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { buildSample, SAMPLE_START } = await import('../lib/seed');
  const { getStore } = await import('../lib/store');
  const store = await getStore();
  if (store.kind === 'local') {
    const { resetLocal, sampleDb } = await import('../lib/store/local');
    resetLocal(sampleDb());
    console.log('Local sample data written to data/local-db.json (as of ' + SAMPLE_START + ').');
    return;
  }
  if (process.argv[2] !== '--yes') { console.log('This replaces Park Towers, Clara and Country Club data in Supabase with sample data. Run: npm run seed -- --yes'); return; }
  const { projects, states } = buildSample();
  for (const p of projects) await store.saveProject(p);
  for (const s of states) { s.settings.lastRun = SAMPLE_START; await store.replaceProjectData(s.project, s); console.log('Seeded ' + s.proj.name); }
}
main().catch(e => { console.error(e); process.exit(1); });
