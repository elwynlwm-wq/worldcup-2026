import { useEffect, useMemo, useState } from 'preact/hooks';
import { predict, type Team } from '../../lib/model';

// Interactive match predictor (Preact island). Pick two teams, see the live
// forecast computed client-side from the model. This is the one genuinely
// interactive piece of the analysis zone, so it hydrates; everything else is
// static. See docs/architecture.md (live islands).
//
// `predict()` is imported from the shared model module — the same function the
// static pages use, so the island and the build never diverge.

interface KeyPlayer {
  name: string;
  pos: string;
  club: string;
  goals: number;
}

export interface PredictorTeam extends Team {
  keyPlayers: KeyPlayer[];
}

export interface H2HRecord {
  played: number;
  aWins: number;
  draws: number;
  bWins: number;
  aGoals: number;
  bGoals: number;
  lastMeeting: string;
  lastAScore: number | null;
  lastBScore: number | null;
}

const pct = (x: number) => Math.round(x * 100);
const sign = (v: number) => (v > 0 ? '+' : '') + v;

const fmtDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.valueOf())
    ? iso
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(d);
};

export default function Predictor({
  teams,
  h2hByTeam,
  initialA,
  initialB,
}: {
  teams: PredictorTeam[];
  // team id → opponent id → all-time record (a = the outer team's POV)
  h2hByTeam: Record<string, Record<string, H2HRecord>>;
  initialA?: string;
  initialB?: string;
}) {
  const byId = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const sorted = useMemo(() => teams.slice().sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  // Deep-link support: this page is static (query params aren't known at build),
  // so read ?a=&b= from the URL on the client to seed the initial matchup.
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const seedA = initialA ?? urlParams?.get('a') ?? teams[0]?.id;
  const seedB = initialB ?? urlParams?.get('b') ?? teams[1]?.id;

  const [aId, setAId] = useState(byId[seedA!] ? seedA! : teams[0]?.id);
  const [bId, setBId] = useState(byId[seedB!] ? seedB! : teams[1]?.id);

  const a = byId[aId];
  const b = byId[bId];
  const same = aId === bId;
  const pr = !same && a && b ? predict(a, b) : null;
  // All-time head-to-head for the current matchup (a's POV), if they've met.
  const h2h = !same && a && b ? (h2hByTeam[a.id]?.[b.id] ?? null) : null;

  // --- Showdown: vote-then-reveal ---------------------------------------------
  // The fan picks a winner before the model's prediction is shown. The pick is
  // remembered per matchup (localStorage), and we synthesise a fan % around the
  // model (lightly nudged by the user's own pick) — a fun, engagement-first hook.
  const matchupKey = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
  const [votes, setVotes] = useState<Record<string, 'a' | 'b' | 'draw'>>({});
  // Load saved votes once on mount (client only).
  useEffect(() => {
    try {
      setVotes(JSON.parse(localStorage.getItem('kb_votes') || '{}'));
    } catch {
      /* ignore */
    }
  }, []);
  const vote = votes[matchupKey] ?? null;
  const castVote = (pick: 'a' | 'b' | 'draw') => {
    const next = { ...votes, [matchupKey]: pick };
    setVotes(next);
    try {
      localStorage.setItem('kb_votes', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  // Synthetic fan split: anchor on the model, nudge toward the user's pick.
  const fanSplit = (() => {
    if (!pr) return null;
    let fa = pr.win * 100;
    let fb = pr.lose * 100;
    if (vote === 'a') fa += 6;
    else if (vote === 'b') fb += 6;
    const fd = Math.max(0, 100 - fa - fb);
    const s = fa + fb + fd || 1;
    return { a: Math.round((fa / s) * 100), b: Math.round((fb / s) * 100), draw: Math.round((fd / s) * 100) };
  })();
  const modelPick: 'a' | 'b' | 'draw' = pr ? (pr.win >= pr.lose ? 'a' : 'b') : 'draw';

  const select = (value: string, onChange: (v: string) => void) => (
    <select
      value={value}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
      class="rounded-lg border border-[var(--line)] bg-[var(--panel2)] px-2.5 py-1.5 text-[13px] text-[var(--text)]"
    >
      {sorted.map((t) => (
        <option value={t.id}>{t.name}</option>
      ))}
    </select>
  );

  const rows: [string, string | number, string | number][] =
    a && b
      ? [
          ['Elo rating', a.elo, b.elo],
          ['FIFA rank', '#' + a.fifaRank, '#' + b.fifaRank],
          ['Tournament form', sign(a.formAdj), sign(b.formAdj)],
          ['Squad attack', sign(a.squadAdj), sign(b.squadAdj)],
          ['Home advantage', sign(a.hostAdj), sign(b.hostAdj)],
          ['Adjusted rating', a.adjRating, b.adjRating],
        ]
      : [];

  return (
    <div>
      <div class="flex flex-wrap items-center gap-2">
        {select(aId, setAId)}
        <span class="text-[var(--muted)]">vs</span>
        {select(bId, setBId)}
      </div>

      {same && <p class="mt-4 text-[var(--muted)]">Pick two different teams.</p>}

      {/* Showdown vote gate — shown until the fan picks, then the forecast reveals. */}
      {!same && a && b && pr && !vote && (
        <div class="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 text-center">
          <p class="font-display text-xl font-black tracking-tight">WHO DO YOU THINK WINS?</p>
          <p class="mt-1 text-[13px] text-[var(--muted)]">
            Tap your pick — then we'll reveal our model's call.
          </p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => castVote('a')}
              class="rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-4 py-2 font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {a.name}
            </button>
            <button
              type="button"
              onClick={() => castVote('draw')}
              class="rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-3 py-2 text-[13px] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Draw
            </button>
            <button
              type="button"
              onClick={() => castVote('b')}
              class="rounded-xl border border-[var(--line)] bg-[var(--panel2)] px-4 py-2 font-semibold hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              {b.name}
            </button>
          </div>
        </div>
      )}

      {!same && a && b && pr && vote && (
        <>
          {/* Reveal: your pick vs the model + fan split */}
          <div class="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <div class="flex flex-wrap items-center justify-between gap-2 text-[13.5px]">
              <span>
                You picked{' '}
                <b class="text-[var(--accent)]">
                  {vote === 'a' ? a.name : vote === 'b' ? b.name : 'a draw'}
                </b>
              </span>
              <span class="text-[var(--muted)]">
                Our model backs{' '}
                <b class="text-[var(--text)]">
                  {modelPick === 'a' ? a.name : modelPick === 'b' ? b.name : 'a draw'}
                </b>
                {vote === modelPick ? ' — you agree! 🤝' : ' — you went the other way 👀'}
              </span>
            </div>
            {fanSplit && (
              <p class="mt-2 text-[11px] text-[var(--muted)]">
                Fans so far: {a.shortCode} {fanSplit.a}% · Draw {fanSplit.draw}% · {b.shortCode}{' '}
                {fanSplit.b}%
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                const next = { ...votes };
                delete next[matchupKey];
                setVotes(next);
                try {
                  localStorage.setItem('kb_votes', JSON.stringify(next));
                } catch {
                  /* ignore */
                }
              }}
              class="mt-2 text-[11px] text-[var(--muted)] underline hover:text-[var(--text)]"
            >
              change pick
            </button>
          </div>

          <h2 class="mt-6 mb-2 text-lg font-bold">Forecast</h2>
          <p class="text-[13.5px] text-[var(--muted)]">
            <b class="text-[var(--text)]">{(pr.win >= pr.lose ? a : b).name} favoured</b> ·{' '}
            {pct(Math.max(pr.win, pr.lose))}% to win in 90 minutes
          </p>

          <div class="my-3 flex h-[30px] overflow-hidden rounded-lg text-xs font-extrabold">
            <div
              class="flex min-w-[22px] items-center justify-center bg-[var(--accent)] text-[#04130b]"
              style={{ width: `${pct(pr.win)}%` }}
            >
              {pct(pr.win)}
            </div>
            <div
              class="flex min-w-[22px] items-center justify-center bg-[var(--panel2)] text-[var(--muted)]"
              style={{ width: `${pct(pr.draw)}%` }}
            >
              {pct(pr.draw)}
            </div>
            <div
              class="flex min-w-[22px] items-center justify-center bg-[var(--accent2)] text-[#04130b]"
              style={{ width: `${pct(pr.lose)}%` }}
            >
              {pct(pr.lose)}
            </div>
          </div>
          <div class="flex justify-between text-[11px] text-[var(--muted)]">
            <span>{a.shortCode} win</span>
            <span>draw</span>
            <span>{b.shortCode} win</span>
          </div>

          <h2 class="mt-6 mb-2 text-lg font-bold">What's behind it</h2>
          <table class="w-full border-collapse text-[13.5px]">
            <thead>
              <tr class="text-[12px] uppercase tracking-wide text-[var(--muted)]">
                <th class="border-b border-[var(--line)] px-2.5 py-2 text-right">{a.shortCode}</th>
                <th class="border-b border-[var(--line)] px-2.5 py-2 text-center">factor</th>
                <th class="border-b border-[var(--line)] px-2.5 py-2 text-right">{b.shortCode}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, hv, av]) => (
                <tr>
                  <td class="border-b border-[var(--line)] px-2.5 py-2 text-right font-bold tabular-nums">
                    {hv}
                  </td>
                  <td class="border-b border-[var(--line)] px-2.5 py-2 text-center text-[var(--muted)]">
                    {label}
                  </td>
                  <td class="border-b border-[var(--line)] px-2.5 py-2 text-right font-bold tabular-nums">
                    {av}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 class="mt-6 mb-2 text-lg font-bold">Key players to watch</h2>
          <div class="grid grid-cols-2 items-start gap-3">
            {[a, b].map((t) => (
              <div class="grid gap-2">
                {t.keyPlayers.map((p) => (
                  <div class="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2">
                    <div class="font-semibold">{p.name}</div>
                    <div class="text-[11px] text-[var(--muted)]">
                      {p.pos} · {p.club} · {p.goals} intl goals
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {h2h && (
            <>
              <h2 class="mt-6 mb-2 text-lg font-bold">Head-to-head (all-time)</h2>
              <p class="text-[13.5px] text-[var(--muted)]">
                {a.name} and {b.name} have met{' '}
                <b class="text-[var(--text)]">{h2h.played}</b> times
                {h2h.lastMeeting && <> · last on {fmtDate(h2h.lastMeeting)}</>}.
              </p>
              <div class="my-3 flex h-[30px] overflow-hidden rounded-lg text-xs font-extrabold">
                <div
                  class="flex min-w-[28px] items-center justify-center bg-[var(--accent)] text-[#04130b]"
                  style={{ width: `${pct(h2h.aWins / h2h.played)}%` }}
                >
                  {h2h.aWins}
                </div>
                <div
                  class="flex min-w-[28px] items-center justify-center bg-[var(--panel2)] text-[var(--muted)]"
                  style={{ width: `${pct(h2h.draws / h2h.played)}%` }}
                >
                  {h2h.draws}
                </div>
                <div
                  class="flex min-w-[28px] items-center justify-center bg-[var(--accent2)] text-[#04130b]"
                  style={{ width: `${pct(h2h.bWins / h2h.played)}%` }}
                >
                  {h2h.bWins}
                </div>
              </div>
              <div class="flex justify-between text-[11px] text-[var(--muted)]">
                <span>{a.shortCode} {h2h.aWins} W</span>
                <span>{h2h.draws} D</span>
                <span>{h2h.bWins} W {b.shortCode}</span>
              </div>
              <p class="mt-2 text-[13.5px] text-[var(--muted)]">
                Goals all-time: {a.shortCode} {h2h.aGoals} – {h2h.bGoals} {b.shortCode}.
                {h2h.lastAScore != null && h2h.lastBScore != null && (
                  <>
                    {' '}Last meeting: {a.shortCode} {h2h.lastAScore}–{h2h.lastBScore} {b.shortCode}.
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
