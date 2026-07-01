import { useState } from 'preact/hooks';

// Vote-then-reveal "Who do you think wins?" hero (Preact island). Fan vote is a
// local, illustrative interaction; the model pick is real (computed at build).
interface Side { id: string; name: string; code: string; c1: string; c2: string }
interface Props {
  home: Side; away: Side;
  win: number; draw: number; lose: number;
  fanHome: number; date: string; city: string; venue: string; predictHref: string;
}
const pct = (x: number) => Math.round(x * 100);
function Mark({ c1, c2, size }: { c1: string; c2: string; size: number }) {
  return (
    <span
      style={{
        width: size, height: size, borderRadius: 9, display: 'inline-block', flex: 'none',
        background: `linear-gradient(135deg,${c1} 0 50%,${c2} 50% 100%)`,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)',
      }}
    />
  );
}
export default function Showdown(p: Props) {
  const [pick, setPick] = useState<string | null>(null);
  const modelFav = p.win >= p.lose ? p.home : p.away;
  const favPct = pct(Math.max(p.win, p.lose));
  const fanAway = 100 - p.fanHome;
  return (
    <div class="relative overflow-hidden rounded-2xl border border-line bg-panel p-5">
      <div
        class="pointer-events-none absolute inset-0"
        style="background:repeating-linear-gradient(90deg,rgba(47,150,90,.04) 0 46px,rgba(47,150,90,.10) 46px 92px)"
      />
      <div class="relative">
        <div class="font-display text-[12px] font-extrabold uppercase tracking-[0.1em] text-ball">
          Next up · {p.date}
        </div>
        <div class="my-4 flex items-center justify-center gap-6">
          <div class="flex flex-1 flex-col items-center gap-2">
            <Mark c1={p.home.c1} c2={p.home.c2} size={56} />
            <div class="text-center font-display text-lg font-extrabold">{p.home.name}</div>
          </div>
          <div class="font-display font-extrabold text-muted">VS</div>
          <div class="flex flex-1 flex-col items-center gap-2">
            <Mark c1={p.away.c1} c2={p.away.c2} size={56} />
            <div class="text-center font-display text-lg font-extrabold">{p.away.name}</div>
          </div>
        </div>
        <div class="mb-3 text-center text-[12.5px] text-muted">
          Round of 32 · {p.city} · {p.venue}
        </div>
        {pick === null ? (
          <>
            <div class="mb-2 text-center font-display text-[13px] font-extrabold uppercase tracking-wide">
              Who do you think wins?
            </div>
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
              <button
                onClick={() => setPick(p.home.id)}
                class="rounded-xl py-3.5 font-display text-base font-extrabold text-white"
                style={{ background: p.home.c1 }}
              >{p.home.code}</button>
              <span class="font-display text-xs font-bold text-muted">draw</span>
              <button
                onClick={() => setPick(p.away.id)}
                class="rounded-xl py-3.5 font-display text-base font-extrabold text-white"
                style={{ background: p.away.c1 }}
              >{p.away.code}</button>
            </div>
            <div class="mt-3 text-center text-[13px]">
              <a href={p.predictHref} class="font-display font-extrabold text-ball">Vote &amp; see our prediction →</a>
            </div>
          </>
        ) : (
          <>
            <div class="mb-1 flex justify-between text-[12px] text-muted">
              <span>Fans: {p.home.code} {p.fanHome}%</span>
              <span>{fanAway}% {p.away.code}</span>
            </div>
            <div class="flex h-3 overflow-hidden rounded-md">
              <span style={{ width: `${p.fanHome}%`, background: p.home.c1 }} />
              <span style={{ width: `${fanAway}%`, background: p.away.c1 }} />
            </div>
            <div class="mt-4 flex items-center gap-3 rounded-xl bg-panel2 p-3.5">
              <span class="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-ball font-display text-xl font-black text-[#241c00]">
                {pick === modelFav.id ? '✓' : '!'}
              </span>
              <div class="text-[14px]">
                <b class="font-display">Our model backs {modelFav.name}</b> · {favPct}% to win<br />
                <span class="text-[13px] text-muted">
                  {pick === modelFav.id ? 'You and the model agree.' : 'You went against the model — bold.'}
                </span>
              </div>
            </div>
            <div class="mt-3 text-center text-[13px]">
              <a href={p.predictHref} class="font-display font-extrabold text-ball">See the full forecast →</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
