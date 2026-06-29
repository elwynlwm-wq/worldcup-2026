// Match-preview article generator — drafts a pre-match story for an A-vs-B
// fixture by handing Claude (a) the FACTUAL BRIEF we already aggregate in the
// warehouse (forecast, form, group standing, all-time H2H, squads, predicted
// XIs, fan votes) plus (b) the live web — the model runs web searches itself for
// current team news (injuries, suspensions, form, pressers) and every sourced
// claim comes back with a citation.
//
// Output: src/content/articles/<a>-vs-<b>-preview.mdx with `draft: true` (kept
// out of the build until a human reviews + flips it). Tagged with both team
// slugs so the H2H page's match-preview lookup and the blog-banner generator
// pick it up automatically.
//
// Model: claude-opus-4-8 + the web_search server tool. ANTHROPIC_API_KEY from
// data-pipeline/.env (gitignored — add it, rotate before deploy, same as the
// other keys).
//
// Usage:
//   npx tsx articles/preview.ts brazil-vs-japan        # one fixture (a-vs-b)
//   npx tsx articles/preview.ts germany paraguay       # or two slugs
//   FORCE=1 ... to overwrite an existing draft

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { ROOT } from '../lib/util';
import { provider } from '../../src/lib/provider';
import { predict } from '../../src/lib/model';
import { getH2H, getSsPair } from '../../src/lib/warehouse';

const ARTICLES_DIR = join(ROOT, '..', 'src', 'content', 'articles');
const MODEL = 'claude-opus-4-8';
const TODAY = process.env.PREVIEW_DATE || new Date().toISOString().slice(0, 10);

// ---- parse the fixture from argv: "a-vs-b" or "a b" ----
function parseFixture(args: string[]): [string, string] {
  const flagless = args.filter((a) => !a.startsWith('--'));
  if (flagless.length === 1 && flagless[0].includes('-vs-')) {
    const [a, b] = flagless[0].split('-vs-');
    return [a, b];
  }
  if (flagless.length >= 2) return [flagless[0], flagless[1]];
  throw new Error('Pass a fixture: "brazil-vs-japan" or "germany paraguay"');
}

// ---- assemble the factual brief from the warehouse (the data half) ----
function buildBrief(aId: string, bId: string): string {
  const a = provider.getTeam(aId);
  const b = provider.getTeam(bId);
  if (!a || !b) throw new Error(`Unknown team(s): ${aId} / ${bId}`);

  const pr = predict(a, b);
  const pct = (x: number) => Math.round(x * 100);
  const h2h = getH2H(aId, bId);
  const ss = getSsPair(aId, bId);

  const squadLine = (id: string) => {
    const top = provider
      .getSquad(id)
      .slice()
      .sort((x, y) => y.goals - x.goals)
      .slice(0, 4)
      .map((p) => `${p.name} (${p.pos}, ${p.club}${p.goals ? `, ${p.goals}g` : ''})`)
      .join('; ');
    return top || 'squad not loaded';
  };
  const xi = (id: string) => {
    const lu = ss?.lineups?.[id];
    if (!lu?.starters?.length) return 'no predicted XI';
    return `${lu.formation || '?'} — ${lu.starters.map((p) => p.name).join(', ')}`;
  };

  const fav = pr.win >= pr.lose ? a : b;
  const lines = [
    `FIXTURE: ${a.name} vs ${b.name}`,
    ``,
    `${a.name}: FIFA #${a.fifaRank}, Elo ${a.elo}, adjusted rating ${a.adjRating}, Group ${a.groupLetter} (${a.confederation}), ${a.points} group pts, status: ${a.status}.`,
    `${b.name}: FIFA #${b.fifaRank}, Elo ${b.elo}, adjusted rating ${b.adjRating}, Group ${b.groupLetter} (${b.confederation}), ${b.points} group pts, status: ${b.status}.`,
    ``,
    `OUR FORECAST (transparent Elo-based heuristic, not betting advice): ${a.shortCode} win ${pct(pr.win)}%, draw ${pct(pr.draw)}%, ${b.shortCode} win ${pct(pr.lose)}%. Favoured: ${fav.name}.`,
    `Form adjustment: ${a.shortCode} ${a.formAdj >= 0 ? '+' : ''}${a.formAdj}, ${b.shortCode} ${b.formAdj >= 0 ? '+' : ''}${b.formAdj}. Squad-attack adjustment: ${a.shortCode} ${a.squadAdj >= 0 ? '+' : ''}${a.squadAdj}, ${b.shortCode} ${b.squadAdj >= 0 ? '+' : ''}${b.squadAdj}.`,
    ``,
    h2h
      ? `ALL-TIME HEAD-TO-HEAD: played ${h2h.played} — ${a.shortCode} ${h2h.aWins}W, ${h2h.draws}D, ${b.shortCode} ${h2h.bWins}W.${h2h.lastMeeting ? ` Last meeting: ${a.shortCode} ${h2h.lastAScore}–${h2h.lastBScore} ${b.shortCode} (${h2h.lastMeeting}).` : ''}`
      : `ALL-TIME HEAD-TO-HEAD: no recorded meetings.`,
    ``,
    ss?.votes ? `FAN WHO-WILL-WIN VOTE: leaning per SofaScore (use only as colour, not fact).` : ``,
    `${a.name} top scorers / key players: ${squadLine(aId)}.`,
    `${b.name} top scorers / key players: ${squadLine(bId)}.`,
    `${a.name} predicted XI: ${xi(aId)}.`,
    `${b.name} predicted XI: ${xi(bId)}.`,
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

const SYSTEM = `You are a staff football writer for "Kickabout", a World Cup 2026 site. Voice: sharp, knowledgeable, lightly opinionated — never breathless or clickbaity. British spelling. Audience ranges from die-hards to casuals, so explain stakes plainly.

You are given a FACTUAL BRIEF of our own aggregated data (forecast, ratings, form, all-time head-to-head, squads, predicted XIs). Treat those numbers as ground truth — quote them where useful. For everything time-sensitive (injuries, suspensions, recent form, manager comments, anything that changed in the last few weeks), USE WEB SEARCH and only state what you can source. Do not invent quotes, scores, or injury news. If you cannot verify something, leave it out rather than guess.

Write a ~550-650 word match preview structured as:
- A 2-3 sentence scene-setter (what this match is and why it matters).
- "## The matchup" — the stylistic/tactical contrast, grounded in the brief + current form from search.
- "## What the numbers say" — our forecast and the key factors behind it, in prose (cite the percentages from the brief).
- "## Team news" — current injuries/availability/form FROM WEB SEARCH (this is the value-add; be specific and current).
- "## Players to watch" — 2-3 names with one line each.
- "## Our prediction" — a clear, hedged call.

Output ONLY the article BODY as GitHub-flavoured Markdown (## headings, **bold**, short paragraphs). No frontmatter, no H1 title, no preamble. Do not include a sources list — citations are tracked separately.`;

interface Generated {
  title: string;
  description: string;
  body: string;
  sources: { title: string; url: string }[];
}

async function generate(aId: string, bId: string): Promise<Generated> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing — add it to data-pipeline/.env');
  const client = new Anthropic({ apiKey: key });

  const a = provider.getTeam(aId)!;
  const b = provider.getTeam(bId)!;
  const brief = buildBrief(aId, bId);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 } as any],
    messages: [
      {
        role: 'user',
        content: `Today is ${TODAY}. Write the pre-match preview for this upcoming 2026 World Cup fixture. Search the web for the latest team news on both sides before writing.\n\nFACTUAL BRIEF:\n${brief}`,
      },
    ],
  });

  // Collect the article body (text blocks) and any cited sources (web_search results).
  let body = '';
  const sources: { title: string; url: string }[] = [];
  for (const block of res.content) {
    if (block.type === 'text') body += block.text;
    // Citations ride on text blocks; also pull from search result blocks.
    const cites = (block as any).citations as { title?: string; url?: string }[] | undefined;
    cites?.forEach((c) => c.url && sources.push({ title: c.title || c.url, url: c.url }));
    if ((block as any).type === 'web_search_tool_result') {
      const items = (block as any).content;
      if (Array.isArray(items)) {
        items.forEach((it: any) => it?.url && sources.push({ title: it.title || it.url, url: it.url }));
      }
    }
  }
  body = body.trim();
  if (!body) throw new Error('Model returned no article text');

  // Dedupe sources by URL.
  const seen = new Set<string>();
  const uniqueSources = sources.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));

  const title = `${a.name} vs ${b.name}: prediction, team news & head-to-head`.slice(0, 70);
  const description =
    `Our forecast, the latest team news and the all-time head-to-head for ${a.name} vs ${b.name} at the 2026 World Cup.`.slice(
      0,
      160,
    );

  return { title, description, body, sources: uniqueSources };
}

function toMdx(aId: string, bId: string, g: Generated): string {
  const sourcesBlock = g.sources.length
    ? `\n\n---\n\n_Sources: ${g.sources.map((s) => `[${s.title.replace(/[[\]]/g, '')}](${s.url})`).join(' · ')}_\n`
    : '';
  return `---
title: ${JSON.stringify(g.title)}
description: ${JSON.stringify(g.description)}
publishDate: ${TODAY}
author: "Kickabout Staff"
tags: ["preview", "match-preview", ${JSON.stringify(aId)}, ${JSON.stringify(bId)}]
pageStyle: "standard"
draft: true
---

${g.body}${sourcesBlock}`;
}

async function main() {
  const [aId, bId] = parseFixture(process.argv.slice(2));
  mkdirSync(ARTICLES_DIR, { recursive: true });
  const slug = `${aId}-vs-${bId}-preview`;
  const out = join(ARTICLES_DIR, `${slug}.mdx`);
  if (existsSync(out) && process.env.FORCE !== '1') {
    console.log(`✓ ${slug}.mdx already exists (FORCE=1 to overwrite). Skipping.`);
    return;
  }
  console.log(`Generating preview for ${aId} vs ${bId} via ${MODEL} (with web search)…`);
  const g = await generate(aId, bId);
  writeFileSync(out, toMdx(aId, bId, g));
  console.log(`  ✓ ${slug}.mdx  (draft, ${g.sources.length} source(s) cited)`);
  console.log(`  Review it, then set draft: false to publish.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
