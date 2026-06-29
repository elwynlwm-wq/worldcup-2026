# Media & assets

*Where images, gifs and video live, and how the authoring process handles them. Drafted 29 June 2026. Reflects our current approach.*

## The question this answers

This is about the **authoring process**, not distribution. However an asset gets into the system, Cloudflare's CDN serves it fast — that's solved. The real fork is: when an agent (or person) produces an asset while writing an article, do we

- **(A)** commit the binary into the repo and let the build construct the final URL, or
- **(B)** upload it to object storage (Cloudflare R2) and drop the resulting URL into the MDX?

The answer depends on the file type, because Git is only good at *some* binaries.

## How Git handles binaries

Git's weakness is binaries that are **large** or **edited repeatedly** — every version is stored in full, in history, forever, and bloats every clone permanently. It's fine with small, write-once binaries.

| Asset | In-repo? | Notes |
|---|---|---|
| Images (jpg/png/webp/svg) | ✅ Yes | Small, usually write-once. 100 articles' worth is a healthy repo. |
| GIFs | ⚠️ Usually | Fine if small. Heavy gifs add up — and motion-heavy content should be MP4/WebM anyway (far smaller, better for Web Vitals). |
| Video | ❌ No | **The tipping point.** Large, permanent history bloat, GitHub caps files at 100MB (warns past 50MB). Git is genuinely bad at this. |

## The rule

Split the authoring path by file type:

| Asset | Path | Where |
|---|---|---|
| Images, SVG, small gifs | **(A) Commit to repo** | Next to / alongside the article; build optimizes and builds URLs |
| Video, large or heavy media | **(B) Upload to object storage** | **Cloudflare R2**, reference the URL in MDX |

**Default to (A) for everything Git handles well; use (B) only when the file type forces it.**

### Why images go in-repo (A)

- Simplest authoring: the agent writes the file next to the article — no external round-trip, no credentials mid-write, no orphaned uploads.
- The build (Astro's image optimization) generates responsive, modern-format, correctly-sized variants and final hashed URLs at build time — good for SEO and Web Vitals for free.
- Versioned with the article that uses it: revert a post and its images revert too.

### Why video goes external (B)

- Video in Git history is a permanent tax on every clone — unavoidable with committed binaries.
- So the agent uploads the file to R2 and embeds the URL. The trade-offs (an upload step needing credentials; the asset no longer versioned with the post) are acceptable because there's no good in-repo alternative for video, and videos are far rarer than images.
- **R2 over S3** because we're already on Cloudflare: no egress fees, same ecosystem and dashboard.

## Video: self-host vs. embed — open decision

**Not decided yet.** Two options on the table; we'll pick when video starts mattering, possibly per-video:

- **Self-host on R2 + native `<video>`** — full control, no third-party JS, best for our on-site SEO/Web-Vitals stance. Cheapest. We manage encoding/formats.
- **Embed YouTube/Vimeo** — injects heavy third-party scripts that hurt Web Vitals, *but* gives us a **public presence on those platforms**: a YouTube/Vimeo channel is its own discovery and audience surface, not just an embed. For a content site trying to grow reach, that off-site presence is a real upside, separate from page performance.

The trade-off is genuinely two-sided: self-host is better for *this site's* page speed; embedding builds an *additional* audience channel. It may even make sense to do both for key videos (upload to YouTube for reach, and/or self-host for the on-page experience). Decide when the first video lands.

## Open / to confirm at scaffold

- Exact in-repo location convention for article images (co-located with the MDX vs. a shared assets dir).
- The agent's upload-to-R2 step for video (tooling/credentials) — define when the first video is needed.
- A size threshold that pushes a large image/gif from path (A) to path (B), if we want a hard line.
