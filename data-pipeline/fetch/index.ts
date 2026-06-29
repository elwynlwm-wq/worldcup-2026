// Warms the on-disk cache for all network sources. Idempotent and re-runnable;
// the build step reads from these caches. (The snapshot source is in-repo, no fetch.)
import { fetchOpenfootball } from './openfootball';
import { fetchClubElo } from './clubelo';
import { fetchIntlResults } from './intlresults';

async function main() {
  console.log('Fetching free sources (keyless)…');
  console.log('openfootball:');
  const of = await fetchOpenfootball();
  console.log(`  → ${of.length} WC2026 matches`);
  console.log('clubelo:');
  const ce = await fetchClubElo();
  console.log(`  → ${ce.length} clubs rated`);
  console.log('international_results:');
  const ir = await fetchIntlResults();
  console.log(`  → ${ir.length} all-time intl matches`);
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
