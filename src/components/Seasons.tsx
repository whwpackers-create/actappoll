import { useState } from 'react';
import { computeSeasonElos, teamScores, BASE_ELO } from '../utils/elo';
import { gid } from '../services/firestore';
import { PRESETS } from '../constants';
import {
  card,
  cHead,
  cTitle,
  cSub,
  Empty,
  inp,
  lbl,
  priBtn,
  secBtn,
  delBtn,
} from '../styles/shared';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { AppData, AppOps } from '../types';
import type { AuthState } from '../hooks/useAuth';

interface SeasonsProps {
  data: AppData;
  ops: AppOps;
  showToast: (msg: string) => void;
  auth: AuthState;
  setView: (v: string) => void;
}

export function Seasons({
  data,
  ops,
  showToast,
  auth,
  setView,
}: SeasonsProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [cn, setCn] = useState('');
  const [cs, setCs] = useState('');
  const [ce, setCe] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const saved = [...(data.seasons ?? [])];
  const all = [...saved];
  PRESETS.forEach((ps) => {
    if (!all.find((s) => s.name === ps.name)) {
      all.push({ ...ps, id: ps.name, isPreset: true });
    }
  });

  all.sort((a, b) => {
    const aOrd = a.sortOrder ?? 999;
    const bOrd = b.sortOrder ?? 999;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });

  const addS = () => {
    if (!cn || !cs || !ce) return;
    auth.req(async () => {
      await ops.addSeason({
        id: gid(),
        name: cn,
        startDate: cs,
        endDate: ce,
        sortOrder: all.length,
      });
      setCn('');
      setCs('');
      setCe('');
      setShowAdd(false);
      showToast('Added!');
    });
  };

  const delS = (s: (typeof all)[0]) => {
    auth.req(async () => {
      if (!confirm(`Delete season "${s.name}"?`)) return;
      await ops.deleteSeason(s.id ?? s._id ?? s.name);
      showToast('Deleted!');
    });
  };

  const moveS = async (idx: number, dir: number) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= all.length) return;
    const a = all[idx];
    const b = all[newIdx];
    const aId = a.id ?? a._id ?? a.name;
    const bId = b.id ?? b._id ?? b.name;
    if ((a as { isPreset?: boolean }).isPreset) {
      await ops.addSeason({
        ...a,
        id: aId,
        sortOrder: newIdx,
      });
      delete (a as { isPreset?: boolean }).isPreset;
    } else {
      await ops.updateSeason(aId, { sortOrder: newIdx });
    }
    if ((b as { isPreset?: boolean }).isPreset) {
      await ops.addSeason({
        ...b,
        id: bId,
        sortOrder: idx,
      });
      delete (b as { isPreset?: boolean }).isPreset;
    } else {
      await ops.updateSeason(bId, { sortOrder: idx });
    }
    showToast('Reordered!');
  };

  const vs = sel ? all.find((s) => (s.id ?? s._id ?? s.name) === sel) : null;
  const sd = vs
    ? computeSeasonElos(data.players, data.acts, vs)
    : null;

  const sBtn = {
    border: '1px solid',
    borderRadius: 8,
    padding: '10px 18px',
    fontFamily: FONT_HEADER,
    fontSize: 14,
    letterSpacing: 1.5,
    cursor: 'pointer' as const,
  };

  const backBtn = (
    <button
      onClick={() => setView('dashboard')}
      style={{
        background: 'rgba(180,160,60,0.08)',
        border: '2px solid #9a8a40',
        borderRadius: 6,
        padding: '8px 18px',
        fontFamily: FONT_HEADER,
        fontSize: 14,
        color: '#e0d080',
        cursor: 'pointer',
        marginBottom: 16,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        letterSpacing: 1,
      }}
    >
      {'←'} Back
    </button>
  );

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {backBtn}
      <div style={card}>
        <div style={cHead}>
          <span style={cTitle}>◎ Seasons</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={cSub}>Elo per semester</span>
            <button
              onClick={() => auth.req(() => setEditMode(!editMode))}
              style={{
                background: editMode
                  ? 'rgba(233,69,96,0.15)'
                  : 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '4px 10px',
                fontFamily: FONT_MONO,
                fontSize: 9,
                color: editMode ? '#e94560' : '#555',
                cursor: 'pointer',
              }}
            >
              {editMode ? 'Done Editing' : '✏️ Edit 🔒'}
            </button>
          </div>
        </div>

        {editMode ? (
          <div style={{ marginBottom: 20 }}>
            {all.map((s, idx) => {
              const sid = s.id ?? s._id ?? s.name;
              const ac = data.acts.filter((a) => {
                const d = new Date(a.date);
                return (
                  d >= new Date(s.startDate) && d <= new Date(s.endDate)
                );
              }).length;
              return (
                <div
                  key={sid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    marginBottom: 4,
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button
                      onClick={() => auth.req(() => moveS(idx, -1))}
                      disabled={idx === 0}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: idx === 0 ? '#333' : '#a09880',
                        cursor: idx === 0 ? 'default' : 'pointer',
                        fontSize: 12,
                        padding: 0,
                      }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => auth.req(() => moveS(idx, 1))}
                      disabled={idx === all.length - 1}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: idx === all.length - 1 ? '#333' : '#a09880',
                        cursor: idx === all.length - 1 ? 'default' : 'pointer',
                        fontSize: 12,
                        padding: 0,
                      }}
                    >
                      ▼
                    </button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontFamily: FONT_HEADER,
                        fontSize: 14,
                        color: '#f0e6d3',
                      }}
                    >
                      {s.name}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: '#555',
                      }}
                    >
                      {s.startDate} → {s.endDate} · {ac} ACTs
                    </div>
                  </div>
                  {!(s as { isPreset?: boolean }).isPreset && (
                    <button
                      onClick={() => delS(s)}
                      style={{ ...delBtn, fontSize: 14 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 20,
            }}
          >
            {all.map((s) => {
              const sid = s.id ?? s._id ?? s.name;
              const ac = data.acts.filter((a) => {
                const d = new Date(a.date);
                return (
                  d >= new Date(s.startDate) && d <= new Date(s.endDate)
                );
              }).length;
              return (
                <button
                  key={sid}
                  onClick={() => setSel(sel === sid ? null : sid)}
                  style={{
                    ...sBtn,
                    background: sel === sid ? '#c084fc' : 'rgba(255,255,255,0.04)',
                    color: sel === sid ? '#0d0d0d' : ac > 0 ? '#f0e6d3' : '#555',
                    borderColor:
                      sel === sid
                        ? '#c084fc'
                        : ac > 0
                          ? 'rgba(192,132,252,0.3)'
                          : 'rgba(255,255,255,0.06)',
                  }}
                >
                  {s.name}
                  {ac > 0 && (
                    <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>
                      ({ac})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {!showAdd ? (
          <button
            onClick={() => auth.req(() => setShowAdd(true))}
            style={{
              ...secBtn,
              fontSize: 12,
              padding: '8px 16px',
              marginBottom: 20,
            }}
          >
            + Add Custom Season 🔒
          </button>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 24,
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={lbl}>Custom</label>
              <input
                style={inp}
                value={cn}
                onChange={(e) => setCn(e.target.value)}
                placeholder="e.g. Summer 2025"
              />
            </div>
            <div style={{ minWidth: 130 }}>
              <label style={lbl}>Start</label>
              <input
                style={inp}
                type="date"
                value={cs}
                onChange={(e) => setCs(e.target.value)}
              />
            </div>
            <div style={{ minWidth: 130 }}>
              <label style={lbl}>End</label>
              <input
                style={inp}
                type="date"
                value={ce}
                onChange={(e) => setCe(e.target.value)}
              />
            </div>
            <button style={priBtn} onClick={addS}>
              Add
            </button>
            <button
              style={{ ...secBtn, padding: '12px 16px' }}
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </button>
          </div>
        )}

        {vs && sd && (
          <div>
            <div style={{ ...cHead, marginTop: 8 }}>
              <span style={cTitle}>⚡ {vs.name}</span>
              <span style={cSub}>{sd.actCount} ACTs</span>
            </div>
            {sd.actCount === 0 ? (
              <Empty text="No ACTs" />
            ) : (
              (() => {
                const sActs = data.acts.filter((a) => {
                  const d = new Date(a.date);
                  return (
                    d >= new Date(vs.startDate) &&
                    d <= new Date(vs.endDate)
                  );
                });
                const pl = data.players
                  .map((p) => {
                    const h = sd.seasonHistory[p.name] ?? [];
                    let races = 0;
                    let pts = 0;
                    let wins = 0;
                    let js = 0;
                    let actC = 0;
                    sActs.forEach((act) => {
                      const inTeam = act.teams.find(
                        (t) =>
                          t.members.includes(p.name) ||
                          (t.subs ?? []).includes(p.name)
                      );
                      const sMap: Record<string, string> = {};
                      act.teams.forEach((t) => {
                        if (t.subs)
                          t.members.forEach((m, i) => {
                            if (t.subs?.[i]) sMap[m] = t.subs[i];
                          });
                      });
                      const inRaces = act.races.some((r) =>
                        r.results.some(
                          (res) =>
                            res.player === p.name ||
                            (sMap[res.player] ?? res.player) === p.name
                        )
                      );
                      if (!inTeam && !inRaces) return;
                      actC++;
                      act.races.forEach((r) => {
                        const e = r.results.find(
                          (x) =>
                            (sMap[x.player] ?? x.player) === p.name ||
                            x.player === p.name
                        );
                        if (e) {
                          races++;
                          pts += e.points;
                        }
                      });
                      const ts = teamScores(act);
                      const t2 = ts.slice(0, 2);
                      const pTeam = act.teams.find(
                        (t) =>
                          t.members.includes(p.name) ||
                          (t.subs ?? []).includes(p.name)
                      );
                      if (
                        pTeam &&
                        t2.find((x) => x.team.name === pTeam.name)
                      ) {
                        js++;
                        if (t2[0].team.name === pTeam.name) wins++;
                      }
                    });
                    return {
                      name: p.name,
                      elo: Math.round(sd.seasonElos[p.name] ?? BASE_ELO),
                      lc: h.length > 0 ? h[h.length - 1].change : 0,
                      ac: actC,
                      pts,
                      races,
                      wins,
                      js,
                      avg: actC > 0 ? (pts / actC).toFixed(1) : '0',
                      wr: actC > 0 ? (wins / actC * 100).toFixed(1) : '0',
                      jsr: actC > 0 ? (js / actC * 100).toFixed(1) : '0',
                    };
                  })
                  .filter((p) => p.ac > 0)
                  .sort((a, b) => b.elo - a.elo);

                return (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 5,
                    }}
                  >
                    {pl.map((p, i) => {
                      const medal =
                        i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                      const pp = data.players.find((x) => x.name === p.name);
                      const showRetired =
                        pp?.active === false &&
                        pp?.retiredDate &&
                        (!vs.endDate ||
                          new Date(pp.retiredDate) <= new Date(vs.endDate));
                      return (
                        <div
                          key={p.name}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '40px 1fr auto',
                            gap: 8,
                            alignItems: 'center',
                            padding: '10px 14px',
                            background:
                              i < 3
                                ? 'rgba(42,80,130,0.1)'
                                : 'rgba(18,22,30,0.3)',
                            border:
                              i === 0
                                ? '1.5px solid rgba(90,150,190,0.3)'
                                : '1px solid rgba(34,42,54,0.5)',
                            borderRadius: 8,
                          }}
                        >
                          <div style={{ textAlign: 'center' }}>
                            {medal ? (
                              <div style={{ fontSize: 20 }}>{medal}</div>
                            ) : (
                              <div
                                style={{
                                  fontFamily: FONT_HEADER,
                                  fontSize: 15,
                                  color: '#4a5a6a',
                                }}
                              >
                                #{i + 1}
                              </div>
                            )}
                          </div>
                          <div>
                            <div
                              style={{
                                fontFamily: FONT_HEADER,
                                fontSize: 16,
                                color: '#e0e4ea',
                              }}
                            >
                              {p.name}
                              {showRetired && (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    fontSize: 9,
                                    color: '#888',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 4,
                                    padding: '1px 5px',
                                  }}
                                >
                                  Retired
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontFamily: FONT_MONO,
                                fontSize: 9,
                                color: '#556',
                                display: 'flex',
                                gap: 8,
                                flexWrap: 'wrap',
                              }}
                            >
                              <span>{p.ac} ACTs</span>
                              <span>{p.races} races</span>
                              <span>{p.avg} avg pts/ACT</span>
                              <span>{p.wr}% win rate</span>
                              <span>{p.jsr}% Jersey Swap</span>
                            </div>
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(5,auto)',
                              gap: 10,
                              textAlign: 'right',
                            }}
                          >
                            {[
                              { l: 'PTS', v: p.pts, c: '#6aca6a' },
                              { l: 'JS', v: p.js, c: '#aa7aca' },
                              { l: 'WINS', v: p.wins, c: '#caa040' },
                              { l: 'ELO', v: p.elo, c: '#e94560' },
                              {
                                l: 'LAST',
                                v: (p.lc > 0 ? '+' : '') + p.lc.toFixed(1),
                                c:
                                  p.lc > 0 ? '#6aca6a' : p.lc < 0 ? '#e94560' : '#556',
                              },
                            ].map((c, ci) => (
                              <div key={ci}>
                                <div
                                  style={{
                                    fontFamily: FONT_MONO,
                                    fontSize: 7,
                                    color: '#3a4a5a',
                                    letterSpacing: 1,
                                  }}
                                >
                                  {c.l}
                                </div>
                                <div
                                  style={{
                                    fontFamily: FONT_HEADER,
                                    fontSize: 14,
                                    color: c.c,
                                  }}
                                >
                                  {c.v}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}
      </div>
      <div
        style={{
          ...card,
          marginTop: 16,
          opacity: 0.7,
        }}
      >
        <div style={cTitle}>📊 How Elo Works</div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.7,
            color: '#a09880',
          }}
        >
          Everyone starts at{' '}
          <strong style={{ color: '#c084fc' }}>1000</strong>. Rating adjusts
          after each ACT based on points (max 24) vs expected performance.
          <br />
          <br />
          <strong style={{ color: '#50fa7b' }}>Playing up:</strong> Beat
          higher-rated = bonus.
          <br />
          <strong style={{ color: '#e94560' }}>Playing down:</strong> Lose to
          lower = bigger hit, but{' '}
          <strong style={{ color: '#f5a623' }}>dampened</strong> (max -25).
          <br />
          <br />
          <strong style={{ color: '#c084fc' }}>Seasonal</strong> resets with 30%
          carryover.
        </div>
      </div>
    </div>
  );
}
