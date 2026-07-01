import { useEffect, useState } from 'preact/hooks';

// Predictor-first home centrepiece (Preact island). Call every knockout tie,
// then reveal the model's forecast and whether you backed it. Picks persist in
// localStorage so they stick across visits. The model output is real (built from
// the same predict()); fan splits are illustrative.
interface Side { id: string; name: string; code: string; c1: string; c2: string }
export interface Tie {
  home: Side; away: Side; win: number; draw: number; lose: number;
  date: string; city: string; venue: string; href: string;
}
type Pick = 'home' | 'draw' | 'away';
const pct = (x: number) => Math.round(x * 100);

function Mark({ c1, c2, size }: { c1: string; c2: string; size: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 7, display: 'inline-block', flex: 'none',
      background: `linear-gradient(135deg,${c1} 0 50%,${c2} 50% 100%)`,
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)',
    }} />
  );
}

export default function PredictBoard({ ties }: { ties: Tie[] }) {
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  useEffect(() => { try { const s = localStorage.getItem('kb-picks'); if (s) setPicks(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem('kb-picks', JSON.stringify(picks)); } catch {} }, [picks]);

  const set = (i: number, v: Pick) => setPicks((p) => ({ ...p, [i]: v }));
  const clear = (i: number) => setPicks((p) => { const n = { ...p }; delete n[i]; return n; });

  const made = Object.keys(picks).length;
  const withModel = ties.reduce((n, t, i) => {
    const pk = picks[i];
    if (!pk || pk === 'draw') return n;
    return n + ((pk === 'home') === (t.win >= t.lose) ? 1 : 0);
  }, 0);

  return (
    <div>
      <div class="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="font-display text-xl font-extrabold tracking-tight">Make your picks · Round of 32</h2>
        <div class="font-display text-[13px] font-bold text-muted">
          {made}/{ties.length} called{made > 0 ? ` · with the model on ${withModel}` : ''}
        </div>
      </div>
      <div class="grid gap-3">
        {ties.map((t, i) => {
          const pk = picks[i];
          const favHome = t.win >= t.lose;
          const fav = favHome ? t.home : t.away;
          const favPct = pct(Math.max(t.win, t.lose));
          const agree = pk && pk !== 'draw' && (pk === 'home') === favHome;
          return (
            <div class="rounded-2xl border border-line bg-panel p-4">
              <div class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-2 font-display font-extrabold">
                  <Mark c1={t.home.c1} c2={t.home.c2} size={26} /> {t.home.name}
                </span>
                <span class="font-display text-[11px] font-bold uppercase tracking-wide text-muted">{t.date}</span>
                <span class="flex items-center gap-2 font-display font-extrabold">
                  {t.away.name} <Mark c1={t.away.c1} c2={t.away.c2} size={26} />
                </span>
              </div>

              {!pk ? (
                <div class="mt-3">
                  <div class="mb-1.5 text-center font-display text-[11.5px] font-bold uppercase tracking-wide text-muted">
                    Your call
                  </div>
                  <div class="grid grid-cols-[1fr_auto_1fr] gap-2">
                    <button onClick={() => set(i, 'home')} class="rounded-lg py-2.5 font-display text-sm font-extrabold text-white" style={{ background: t.home.c1 }}>{t.home.code}</button>
                    <button onClick={() => set(i, 'draw')} class="rounded-lg border border-line px-3 py-2.5 font-display text-xs font-bold text-muted">Draw</button>
                    <button onClick={() => set(i, 'away')} class="rounded-lg py-2.5 font-display text-sm font-extrabold text-white" style={{ background: t.away.c1 }}>{t.away.code}</button>
                  </div>
                </div>
              ) : (
                <div class="mt-3">
                  <div class="flex h-[26px] overflow-hidden rounded-lg text-xs font-extrabold">
                    <div class="flex min-w-[24px] items-center justify-center text-[#241c00]" style={{ width: `${pct(t.win)}%`, background: 'var(--ball)' }}>{pct(t.win)}</div>
                    <div class="flex min-w-[24px] items-center justify-center text-muted" style={{ width: `${pct(t.draw)}%`, background: '#333844' }}>{pct(t.draw)}</div>
                    <div class="flex min-w-[24px] items-center justify-center text-white" style={{ width: `${pct(t.lose)}%`, background: 'var(--accent2)' }}>{pct(t.lose)}</div>
                  </div>
                  <div class="mt-2 flex flex-wrap items-center justify-between gap-1 text-[13px]">
                    <span><b class="font-display">Model backs {fav.name}</b> · {favPct}%</span>
                    <span class="font-display font-bold" style={{ color: agree ? 'var(--ball)' : 'var(--muted)' }}>
                      {pk === 'draw' ? 'you called a draw' : agree ? '✓ you agree' : '✗ you differ'}
                    </span>
                  </div>
                  <button onClick={() => clear(i)} class="mt-1 font-display text-[11.5px] font-bold text-muted hover:text-ball">change pick</button>
                </div>
              )}
              <div class="mt-2 text-right">
                <a href={t.href} class="font-display text-[12px] font-bold text-muted hover:text-ball">full forecast →</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
