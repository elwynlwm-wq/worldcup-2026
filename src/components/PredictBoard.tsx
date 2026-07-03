import { useEffect, useState } from 'preact/hooks';

// Interactive pick board (Preact island), light World Cup Analytics theme. The market's
// sentiment shows in every tile up front; committing a pick reveals the model
// (Elo) and how you + the market compare. Picks persist in localStorage.
interface Side { id: string; name: string; code: string }
export interface Tie {
  home: Side; away: Side;
  mh: number; md: number; ma: number;
  kh: number | null; kd: number | null; ka: number | null;
  date: string; stage: string;
}
type Pick = 'home' | 'draw' | 'away';

function Flag({ id, w = 24 }: { id: string; w?: number }) {
  const h = Math.round((w * 3) / 4);
  return (
    <img src={`/flags-country/${id}.svg`} width={w} height={h} loading="lazy" alt=""
      style={{ width: w, height: h, borderRadius: 4, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.13)', flex: 'none', objectFit: 'cover' }} />
  );
}
function Bar({ h, d, a }: { h: number; d: number; a: number }) {
  const seg = (w: number, bg: string, fg: string, v: number) => (
    <div style={{ width: `${w}%`, minWidth: 22, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{v}</div>
  );
  return (
    <div style={{ display: 'flex', height: 24, borderRadius: 8, overflow: 'hidden', fontSize: 11, fontWeight: 800 }}>
      {seg(h, 'var(--color-royal)', '#fff', h)}
      {seg(d, 'var(--color-surface-3)', 'var(--color-ink-2)', d)}
      {seg(a, 'var(--color-clay)', '#fff', a)}
    </div>
  );
}
const lbl: any = { display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--color-ink-3)', marginBottom: 4, fontFamily: 'var(--font-display)' };

export default function PredictBoard({ ties }: { ties: Tie[] }) {
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  useEffect(() => { try { const s = localStorage.getItem('kb-picks'); if (s) setPicks(JSON.parse(s)); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem('kb-picks', JSON.stringify(picks)); } catch {} }, [picks]);
  const set = (i: number, v: Pick) => setPicks((p) => ({ ...p, [i]: v }));
  const clear = (i: number) => setPicks((p) => { const n = { ...p }; delete n[i]; return n; });

  const made = Object.keys(picks).length;
  const withModel = ties.reduce((n, t, i) => {
    const pk = picks[i]; if (!pk || pk === 'draw') return n;
    return n + ((pk === 'home') === (t.mh >= t.ma) ? 1 : 0);
  }, 0);

  const btn = (): any => ({
    borderRadius: 10, padding: '10px 8px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13,
    border: '1px solid var(--color-line)', cursor: 'pointer', background: '#fff', color: 'var(--color-ink)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  });

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <h2 class="font-display" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px' }}>Make your picks</h2>
        <div class="font-display" style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-ink-3)' }}>
          {made}/{ties.length} called{made > 0 ? ` · with the model on ${withModel}` : ''}
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {ties.map((t, i) => {
          const pk = picks[i];
          const mFavHome = t.mh >= t.ma;
          const mFav = mFavHome ? t.home : t.away;
          const mPct = Math.max(t.mh, t.ma);
          const hasK = t.kh != null && t.ka != null;
          const kFavHome = hasK ? (t.kh as number) >= (t.ka as number) : true;
          const kFav = kFavHome ? t.home : t.away;
          const kPct = hasK ? Math.max(t.kh as number, t.ka as number) : 0;
          const you = pk === 'home' ? t.home.name : pk === 'away' ? t.away.name : 'a draw';
          const aM = pk && pk !== 'draw' && (pk === 'home') === mFavHome;
          const aK = pk && pk !== 'draw' && (pk === 'home') === kFavHome;
          return (
            <div style={{ borderRadius: 16, border: '1px solid var(--color-line-2)', background: '#fff', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span class="font-display" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}><Flag id={t.home.id} /> {t.home.name}</span>
                <span class="font-display" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--color-ink-3)', textAlign: 'center' }}>{t.date}<br />{t.stage}</span>
                <span class="font-display" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>{t.away.name} <Flag id={t.away.id} /></span>
              </div>

              {hasK && (
                <div style={{ marginTop: 12 }}>
                  <div style={lbl}><span>The market</span><span>{kFav.code} {kPct}%</span></div>
                  <Bar h={t.kh as number} d={t.kd as number} a={t.ka as number} />
                </div>
              )}

              {!pk ? (
                <div style={{ marginTop: 12 }}>
                  <div class="font-display" style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--color-ink-3)', marginBottom: 6 }}>Your call</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8 }}>
                    <button onClick={() => set(i, 'home')} style={btn()}><Flag id={t.home.id} w={18} /> {t.home.code}</button>
                    <button onClick={() => set(i, 'draw')} style={{ ...btn(), padding: '10px 14px', color: 'var(--color-ink-2)' }}>Draw</button>
                    <button onClick={() => set(i, 'away')} style={btn()}>{t.away.code} <Flag id={t.away.id} w={18} /></button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
                  <div>
                    <div style={lbl}><span>The model</span><span>{mFav.code} {mPct}%</span></div>
                    <Bar h={t.mh} d={t.md} a={t.ma} />
                  </div>
                  <div style={{ fontSize: 13 }}>
                    You backed <b class="font-display">{you}</b>.{' '}
                    {pk !== 'draw' && <span style={{ color: aM ? 'var(--color-pitch)' : 'var(--color-ink-3)' }}>{aM ? 'Model agrees' : 'Model differs'}</span>}
                    {hasK && pk !== 'draw' ? <> · <span style={{ color: aK ? 'var(--color-pitch)' : 'var(--color-ink-3)' }}>{aK ? 'market agrees' : 'market differs'}</span></> : null}
                  </div>
                  <button onClick={() => clear(i)} class="font-display" style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-ink-3)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>change pick</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
