// Cloudflare Cron Worker → dispatches the GitHub Actions "Hourly data refresh"
// workflow. GitHub's own scheduled (cron) trigger has been unreliable, so CF's
// (reliable) cron drives it instead. The Actions workflow still does all the
// work — fetch → build warehouse → export → commit JSON → publish D1 → deploy.
//
// Secrets (wrangler secret put):
//   GITHUB_TOKEN — fine-grained PAT with Actions: Read+Write on the repo
//                  (or classic token with `workflow` scope).
// Vars (wrangler.toml [vars]): GH_OWNER, GH_REPO, GH_WORKFLOW, GH_REF.

interface Env {
  GITHUB_TOKEN: string;
  GH_OWNER: string;
  GH_REPO: string;
  GH_WORKFLOW: string; // filename, e.g. "hourly-refresh.yml"
  GH_REF: string;      // branch to run on, e.g. "main"
}

async function dispatch(env: Env): Promise<Response> {
  const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/actions/workflows/${env.GH_WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kickabout-cron-trigger',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: env.GH_REF }),
  });
  // 204 No Content = accepted. Anything else is an error worth surfacing.
  if (res.status !== 204) {
    const text = await res.text();
    console.error(`dispatch failed: ${res.status} ${text}`);
    return new Response(`dispatch failed: ${res.status} ${text}`, { status: 502 });
  }
  console.log(`dispatched ${env.GH_WORKFLOW} on ${env.GH_REF}`);
  return new Response('dispatched', { status: 200 });
}

export default {
  // Fired by the cron trigger in wrangler.toml.
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await dispatch(env);
  },
  // Manual trigger for testing: GET the worker URL to fire a run on demand.
  async fetch(_req: Request, env: Env): Promise<Response> {
    return dispatch(env);
  },
};
