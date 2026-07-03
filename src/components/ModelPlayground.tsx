import { useState } from 'preact/hooks';

// Interactive companion for /how-it-works (Preact island). Runs the REAL
// forecast maths client-side — keep in lockstep with src/lib/model.ts
// (expScore + draw term). Teams arrive as a build-time prop with the same
// adjusted ratings the site uses.
export interface PlayTeam {
  id: string; name: string;
  elo: number; formAdj: number; squadAdj: number; hostAdj: number; adjRating: number;
}

function probs(d: number) {
  const E = 1 / (1 + Math.pow(10, -d / 400));
  const draw = 0.28 * Math.exp(-Math.abs(d) / 220);
  let win = E - draw / 2;
  let lose = 1 - win - draw;
  if (win < 0.01) win = 0.01;
  if (lose < 0.01) lose = 0.01;
  const s = win + draw + lose;
  return { win: win / s, draw: draw / s, lose: lose / s };
}
const pc = (x: number) => Math.round(x * 100);

function Flag({ id, w = 26 }: { id: string; w?: number }) {
  const h = Math.round((w * 3) / 4);
  return (
    <img src={`/flags-country/${id}.svg`} width={w} height={h} loading="lazy" alt=""
      style={{ width: w, height: h, borderRadius: 4, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.13)', flex: 'none', objectFit: 'cover' }} />
  );
}

function Bar({ w, d, l }: { w: number; d: number; l: number }) {
  const seg = (width: number, bg: string, fg: string, label: string) => (
    <div style={{ width: `${width}%`, minWidth: 30, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'width .35s ease' }}>{label}</div>
  );
  return (
    <div style={{ display: 'flex', height: 30, borderRadius: 9, overflow: 'hidden', fontSize: 12, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
      {seg(w, 'var(--color-royal)', '#fff', `${w}%`)}
      {seg(d, 'var(--color-surface-3)', 'var(--color-ink-2)', `${d}%`)}
      {seg(l, 'var(--color-clay)', '#fff', `${l}%`)}
    </div>
  );
}

const selStyle: any = {
  width: '100%', padding: '9px 10px', borderRadius: 10, border: '1px solid var(--color-line)',
  background: '#fff', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: 'var(--color-ink)',
};
const rowStyle: any = { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: 'var(--color-ink-2)' };
const adjFmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);
const adjCol = (n: number) => (n > 0 ? 'var(--color-pitch)' : n < 0 ? 'var(--color-clay)' : 'var(--color-ink-3)');

function Breakdown({ t }: { t: PlayTeam }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={rowStyle}><span>Elo rating</span><b style={{ color: 'var(--color-ink)' }}>{t.elo}</b></div>
      <div style={rowStyle}><span>Form here</span><b style={{ color: adjCol(t.formAdj) }}>{adjFmt(t.formAdj)}</b></div>
      <div style={rowStyle}><span>Squad firepower</span><b style={{ color: adjCol(t.squadAdj) }}>{adjFmt(t.squadAdj)}</b></div>
      <div style={rowStyle}><span>Host advantage</span><b style={{ color: adjCol(t.hostAdj) }}>{adjFmt(t.hostAdj)}</b></div>
      <div style={{ ...rowStyle, borderTop: '1px solid var(--color-line)', marginTop: 4, paddingTop: 6 }}>
        <span style={{ fontWeight: 800, color: 'var(--color-ink)' }}>Adjusted</span>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-royal)' }}>{t.adjRating}</b>
      </div>
    </div>
  );
}

export default function ModelPlayground({ teams }: { teams: PlayTeam[] }) {
  const sorted = teams.slice().sort((a, b) => a.name.localeCompare(b.name));
  const byRating = teams.slice().sort((a, b) => b.adjRating - a.adjRating);
  const [aId, setA] = useState(byRating[0]?.id);
  const [bId, setB] = useState(byRating[1]?.id);
  const [gap, setGap] = useState(120);

  const a = teams.find((t) => t.id === aId)!;
  const b = teams.find((t) => t.id === bId)!;
  const d = a.adjRating - b.adjRating;
  const p = probs(d);
  const g = probs(gap);

  const Sel = ({ val, set, exclude }: { val: string; set: (v: string) => void; exclude: string }) => (
    <select style={selStyle} value={val} onChange={(e: any) => set(e.currentTarget.value)}>
      {sorted.map((t) => (
        <option value={t.id} disabled={t.id === exclude}>{t.name}</option>
      ))}
    </select>
  );

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid var(--color-line-2)', borderRadius: 16, padding: '18px 18px 16px' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Flag id={a.id} /> <Sel val={aId} set={setA} exclude={bId} />
            </div>
            <Breakdown t={a} />
          </div>
          <div style={{ alignSelf: 'center', textAlign: 'center', flex: '0 0 auto' }}>
            <button
              onClick={() => { setA(bId); setB(aId); }}
              aria-label="Swap teams"
              style={{ border: '1px solid var(--color-line)', background: 'var(--color-surface-2)', borderRadius: 10, padding: '7px 11px', cursor: 'pointer', fontSize: 15, color: 'var(--color-ink-2)' }}
            >⇄</button>
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--color-ink-3)', fontFamily: 'var(--font-display)' }}>
              gap {adjFmt(d)}
            </div>
          </div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Flag id={b.id} /> <Sel val={bId} set={setB} exclude={aId} />
            </div>
            <Breakdown t={b} />
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--color-ink-3)', marginBottom: 5, fontFamily: 'var(--font-display)' }}>
            <span>{a.name} win</span><span>Draw</span><span>{b.name} win</span>
          </div>
          <Bar w={pc(p.win)} d={pc(p.draw)} l={pc(p.lose)} />
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--color-line-2)', borderRadius: 16, padding: '18px 18px 16px', marginTop: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--color-ink-3)', fontFamily: 'var(--font-display)' }}>
          Feel the curve — drag the rating gap
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 12px' }}>
          <input type="range" min={-600} max={600} step={10} value={gap}
            onInput={(e: any) => setGap(Number(e.currentTarget.value))} style={{ flex: 1 }} />
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, width: 52, textAlign: 'right', color: 'var(--color-royal)' }}>{adjFmt(gap)}</b>
        </div>
        <Bar w={pc(g.win)} d={pc(g.draw)} l={pc(g.lose)} />
        <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-ink-2)' }}>
          {Math.abs(gap) < 60
            ? 'Coin-flip territory — this is where the draw peaks at 28%.'
            : Math.abs(gap) < 250
              ? 'A clear favourite, but far from safe. Most World Cup fixtures live in this range.'
              : 'A heavy mismatch — the draw all but vanishes. Think hosts against a debutant.'}
        </p>
      </div>
    </div>
  );
}
