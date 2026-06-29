// Shared pipeline utilities.
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Load data-pipeline/.env (gitignored) so fetchers can read API keys via
// process.env. No-op if the file is absent (free sources need no keys).
try {
  process.loadEnvFile(join(ROOT, '.env'));
} catch {
  /* no .env — fine for the free-source pipeline */
}

export const SOURCES_DIR = join(ROOT, 'sources');
export const WAREHOUSE_DIR = join(ROOT, 'warehouse');
export const EXPORT_DIR = join(WAREHOUSE_DIR, 'export');

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/**
 * Fetch a URL with on-disk caching under sources/. Re-runs are cheap and
 * offline-friendly: once cached, we don't re-hit the network unless `force`.
 * The cached raw file is the "snapshot to R2 for reproducibility" artifact.
 */
export async function fetchCached(
  url: string,
  cacheName: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  ensureDir(SOURCES_DIR);
  const path = join(SOURCES_DIR, cacheName);
  if (!opts.force && existsSync(path)) {
    const ageH = (Date.now() - statSync(path).mtimeMs) / 3.6e6;
    console.log(`  ✓ cache hit ${cacheName} (${ageH.toFixed(1)}h old)`);
    return readFileSync(path, 'utf8');
  }
  console.log(`  ↓ fetching ${url}`);
  const res = await fetch(url, { headers: { 'user-agent': 'worldcup-2026-data-pipeline/0.1 (content site)' } });
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  const text = await res.text();
  writeFileSync(path, text);
  console.log(`  ✓ saved ${cacheName} (${(text.length / 1024).toFixed(0)}kb)`);
  return text;
}

/** Minimal CSV parser (handles quoted fields with commas/quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}
