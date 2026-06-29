// Story ↔ match linking — one shared definition so both directions agree.
//
// An article is "about a match" when its tags name exactly two WC teams plus a
// kind (preview | recap | feature). We resolve that pair to a real AF fixture so
// the match page can surface its story, and the story can link back to the match.
import { provider } from './provider';
import { getAfFixtures, type AfFixture } from './warehouse';
import type { CollectionEntry } from 'astro:content';

export type StoryKind = 'preview' | 'recap' | 'feature';
export const KIND_META: Record<StoryKind, { label: string; accent: string; bannerLabel: string }> = {
  preview: { label: 'Preview', accent: '#1f3fbf', bannerLabel: 'Match preview' },
  recap: { label: 'Recap', accent: '#138a5e', bannerLabel: 'Match recap' },
  feature: { label: 'Feature', accent: '#b23b2e', bannerLabel: 'Feature' },
};

const FINISHED = new Set(['FT', 'AET', 'PEN']);
const teamIds = new Set(provider.getTeams().map((t) => t.id));

/** Kind + the two team slugs an article is about (teams may be < 2 for features). */
export function storyMeta(entry: CollectionEntry<'articles'>) {
  const tags = (entry.data.tags || []).map((t) => t.toLowerCase());
  const kind = (['preview', 'recap', 'feature'] as StoryKind[]).find((k) => tags.includes(k)) ?? 'feature';
  const teams = tags.filter((t) => teamIds.has(t)).slice(0, 2);
  return { kind, teams, a: teams[0] ?? null, b: teams[1] ?? null };
}

/** The AF fixture an article points at (the pairing's match), or null. */
export function fixtureForStory(entry: CollectionEntry<'articles'>): AfFixture | null {
  const { a, b } = storyMeta(entry);
  if (!a || !b) return null;
  const pair = new Set([a, b]);
  const fixtures = getAfFixtures().filter(
    (f) => pair.has(f.homeTeamId) && pair.has(f.awayTeamId),
  );
  if (!fixtures.length) return null;
  // Prefer a fixture whose lifecycle matches the kind (recap→finished, preview→
  // upcoming/live); else just the first (e.g. two meetings is impossible in a WC).
  const wantFinished = entry.data.tags?.map((t) => t.toLowerCase()).includes('recap');
  return fixtures.find((f) => FINISHED.has(f.status) === !!wantFinished) ?? fixtures[0];
}

/** /matches/<a>-vs-<b>-<stage> URL for a fixture. */
export function matchHref(f: { homeTeamId: string; awayTeamId: string; stage: string }) {
  return `/matches/${f.homeTeamId}-vs-${f.awayTeamId}-${f.stage}`;
}

/**
 * Best story for a given match, by lifecycle: an ended match wants its recap (or
 * falls back to a preview), an upcoming/live match wants its preview. Returns the
 * matching non-draft article entry + its kind, or null.
 */
export function storyForMatch(
  articles: CollectionEntry<'articles'>[],
  homeId: string,
  awayId: string,
  ended: boolean,
): { entry: CollectionEntry<'articles'>; kind: StoryKind } | null {
  const pair = new Set([homeId, awayId]);
  const candidates = articles
    .map((entry) => ({ entry, m: storyMeta(entry) }))
    .filter(({ m }) => m.a && m.b && pair.has(m.a) && pair.has(m.b));
  if (!candidates.length) return null;
  const want: StoryKind = ended ? 'recap' : 'preview';
  const pick = candidates.find(({ m }) => m.kind === want) ?? candidates[0];
  return { entry: pick.entry, kind: pick.m.kind };
}
