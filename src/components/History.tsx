import { useState, Fragment } from 'react';
import { teamScores, computeAllElos, BASE_ELO } from '../utils/elo';
import {
  card,
  cHead,
  cTitle,
  cSub,
  delBtn,
  TC,
  Empty,
} from '../styles/shared';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { AppData } from '../types';
import type { AppOps } from '../types';
import type { AuthState } from '../hooks/useAuth';

interface HistoryProps {
  data: AppData;
  setView: (v: string) => void;
  setSelAct: (id: string | null) => void;
  ops: AppOps;
  showToast: (msg: string) => void;
  auth: AuthState;
}

export function History({
  data,
  setView,
  setSelAct,
  ops,
  showToast,
  auth,
}: HistoryProps) {
  const del = (id: string) => {
    auth.req(async () => {
      if (!confirm('Delete?')) return;
      await ops.deleteAct(id);
      showToast('Deleted');
    });
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

  const [histSort, setHistSort] = useState('date');
  const [histMonth, setHistMonth] = useState('');
  const [histYear, setHistYear] = useState('');

  const histYears = [
    ...new Set(data.acts.map((a) => new Date(a.date).getFullYear())),
  ].sort((a, b) => b - a);
  const histMonths = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const sorted = [...data.acts]
    .filter((a) => {
      const d = new Date(a.date);
      if (histYear && d.getFullYear() !== parseInt(histYear)) return false;
      if (histMonth && d.getMonth() !== parseInt(histMonth)) return false;
      return true;
    })
    .sort((a, b) => {
      if (histSort === 'added') return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const getRoundTot = (
    g: unknown[][][] | undefined,
    p: (number[] | number)[][] | undefined,
    ri: number,
    ti: number
  ): number | null => {
    if (!g || !g[ri] || !g[ri][ti]) return null;
    const arr = g[ri][ti] as (number | undefined)[];
    let s = 0;
    for (const v of arr) s += v ?? 0;
    if (p && p[ri]) {
      const pv = p[ri][ti];
      if (Array.isArray(pv)) {
        for (const x of pv) s += (x ?? 0) * -2;
      } else if (typeof pv === 'number') {
        s += pv * -2;
      }
    }
    return s;
  };

  const selectStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    padding: '6px 10px',
    fontFamily: FONT_MONO,
    fontSize: 12,
    color: '#f0e6d3',
    cursor: 'pointer' as const,
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {backBtn}
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <select
          value={histSort}
          onChange={(e) => setHistSort(e.target.value)}
          style={selectStyle}
        >
          <option value="date">By Date</option>
          <option value="added">Recently Added</option>
        </select>
        <select
          value={histYear}
          onChange={(e) => setHistYear(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Years</option>
          {histYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={histMonth}
          onChange={(e) => setHistMonth(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Months</option>
          {histMonths.map((m, i) => (
            <option key={i} value={i}>
              {m}
            </option>
          ))}
        </select>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#556' }}>
          {sorted.length} ACTs
        </span>
      </div>
      <div style={cHead}>
        <span style={cTitle}>📜 History</span>
        <span style={cSub}>{data.acts.length} recorded</span>
      </div>
      {sorted.length === 0 ? (
        <div style={card}>
          <Empty text="No ACTs yet" />
        </div>
      ) : (
        sorted.map((act) => {
          const ts = teamScores(act);
          const w = ts[0];
          const aid = act.id || act._id;

          const pp: Record<string, number> = {};
          act.teams.flatMap((t) => t.members).forEach((n) => {
            pp[n] = 0;
          });
          act.races.forEach((r) =>
            r.results.forEach((x) => {
              if (x.player in pp) pp[x.player] += x.points;
            })
          );

          const chronoActs = [...data.acts].sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
          );
          const ci = chronoActs.findIndex((a) => (a.id || a._id) === aid);
          const { elos: eB } = computeAllElos(
            data.players,
            chronoActs.slice(0, ci),
            undefined
          );
          const { elos: eA } = computeAllElos(
            data.players,
            chronoActs.slice(0, ci + 1),
            undefined
          );

          let grid = act.grid;
          if (!grid && act.gridJson) {
            try {
              grid = JSON.parse(act.gridJson) as typeof act.grid;
            } catch {
              // ignore
            }
          }
          let pen = act.penalties;
          if (!pen && act.penaltiesJson) {
            try {
              pen = JSON.parse(act.penaltiesJson) as typeof act.penalties;
            } catch {
              // ignore
            }
          }

          return (
            <div
              key={aid}
              style={{
                ...card,
                marginBottom: 16,
                borderLeft: '3px solid #e94560',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{ flex: 1, cursor: 'pointer' }}
                  onClick={() => {
                    setSelAct(aid ?? null);
                    setView('actdetail');
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_HEADER,
                        fontSize: 18,
                        color: '#f0e6d3',
                        letterSpacing: 1,
                      }}
                    >
                      {act.name}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 11,
                        color: '#555',
                      }}
                    >
                      {act.date}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: '#666',
                        background: 'rgba(255,255,255,0.04)',
                        padding: '2px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {act.type === '12man' ? '12-Man' : '8-Man'}
                    </span>
                    {act.satId && (
                      <span
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: '#c084fc',
                          background: 'rgba(192,132,252,0.1)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          marginLeft: 4,
                        }}
                      >
                        SAT
                      </span>
                    )}
                  </div>

                  {w && (
                    <div
                      style={{
                        background: 'rgba(233,69,96,0.08)',
                        border: '1px solid rgba(233,69,96,0.2)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        marginBottom: 10,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 20 }}>🏆</span>
                      <div>
                        <div
                          style={{
                            fontFamily: FONT_HEADER,
                            fontSize: 16,
                            color: '#e94560',
                          }}
                        >
                          {w.team.name} — {w.score} pts
                        </div>
                        <div
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 10,
                            color: '#a09880',
                          }}
                        >
                          {w.team.members.join(' & ')}
                        </div>
                      </div>
                    </div>
                  )}

                  {grid && (
                    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '40px repeat(4,1fr)',
                          gap: 0,
                          border: '1px solid rgba(255,255,255,0.04)',
                          borderRadius: 6,
                          overflow: 'hidden',
                          minWidth: 400,
                        }}
                      >
                        <div
                          style={{
                            padding: 3,
                            fontFamily: FONT_MONO,
                            fontSize: 8,
                            color: '#444',
                            textAlign: 'center',
                            background: 'rgba(255,255,255,0.01)',
                          }}
                        >
                          RND
                        </div>
                        {act.teams.map((t, ti) => (
                          <div
                            key={ti}
                            style={{
                              padding: '3px 2px',
                              textAlign: 'center',
                              background: 'rgba(255,255,255,0.01)',
                              borderBottom: `2px solid ${TC[ti]}`,
                            }}
                          >
                            <div
                              style={{
                                fontFamily: FONT_HEADER,
                                fontSize: 10,
                                color: '#f0e6d3',
                              }}
                            >
                              {t.name}
                            </div>
                          </div>
                        ))}
                        {[0, 1, 2, 3].map((ri) => (
                          <Fragment key={ri}>
                            <div
                              style={{
                                padding: '3px 2px',
                                textAlign: 'center',
                                borderBottom:
                                  '1px solid rgba(255,255,255,0.02)',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: FONT_MONO,
                                  fontSize: 9,
                                  color: '#666',
                                }}
                              >
                                R{ri + 1}
                              </span>
                            </div>
                            {act.teams.map((_, ti) => {
                              const rt = getRoundTot(
                                grid as unknown[][][],
                                pen,
                                ri,
                                ti
                              );
                              return (
                                <div
                                  key={ti}
                                  style={{
                                    padding: '2px 4px',
                                    borderBottom:
                                      '1px solid rgba(255,255,255,0.02)',
                                    textAlign: 'center',
                                    borderLeft: `1px solid ${TC[ti]}22`,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontFamily: FONT_HEADER,
                                      fontSize: 12,
                                      color: TC[ti],
                                    }}
                                  >
                                    {rt !== null ? rt : '—'}
                                  </span>
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                        <div
                          style={{
                            padding: 3,
                            background: 'rgba(233,69,96,0.04)',
                            fontFamily: FONT_MONO,
                            fontSize: 8,
                            color: '#e94560',
                            textAlign: 'center',
                          }}
                        >
                          TOT
                        </div>
                        {act.teams.map((_, ti) => {
                          const sc = ts.find(
                            (x) => x.team.name === act.teams[ti].name
                          );
                          return (
                            <div
                              key={ti}
                              style={{
                                padding: 3,
                                background: 'rgba(233,69,96,0.03)',
                                textAlign: 'center',
                              }}
                            >
                              <span
                                style={{
                                  fontFamily: FONT_HEADER,
                                  fontSize: 13,
                                  color: TC[ti],
                                }}
                              >
                                {sc ? sc.score : 0}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fill,minmax(180px,1fr))',
                      gap: 6,
                      marginBottom: 8,
                    }}
                  >
                    {ts.map((x, i) => (
                      <div
                        key={x.team.name}
                        style={{
                          padding: '6px 10px',
                          borderRadius: 6,
                          background:
                            i === 0
                              ? 'rgba(233,69,96,0.06)'
                              : i === 1
                                ? 'rgba(245,166,35,0.04)'
                                : 'rgba(255,255,255,0.02)',
                          borderLeft: `3px solid ${
                            i === 0
                              ? '#e94560'
                              : i === 1
                                ? '#f5a623'
                                : '#333'
                          }`,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: FONT_HEADER,
                              fontSize: 13,
                              color:
                                i === 0
                                  ? '#e94560'
                                  : i === 1
                                    ? '#f5a623'
                                    : '#888',
                            }}
                          >
                            {i === 0 ? '👑' : i === 1 ? '🥈' : ''}{' '}
                            {x.team.name}
                          </span>
                          <span
                            style={{
                              fontFamily: FONT_HEADER,
                              fontSize: 15,
                              color: i === 0 ? '#e94560' : '#888',
                            }}
                          >
                            {x.score}
                          </span>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: 8,
                            marginTop: 3,
                            flexWrap: 'wrap',
                          }}
                        >
                          {x.team.members.map((name) => {
                            const pts = pp[name] || 0;
                            const b = Math.round(eB[name] || BASE_ELO);
                            const a = Math.round(eA[name] || BASE_ELO);
                            const d = a - b;
                            return (
                              <span
                                key={name}
                                style={{
                                  fontFamily: FONT_MONO,
                                  fontSize: 9,
                                  color: '#666',
                                }}
                              >
                                {name.split(' ')[0]}:{' '}
                                <strong style={{ color: '#c8bfa8' }}>
                                  {pts}
                                </strong>
                                <span
                                  style={{
                                    color:
                                      d > 0
                                        ? '#50fa7b'
                                        : d < 0
                                          ? '#e94560'
                                          : '#444',
                                    marginLeft: 2,
                                  }}
                                >
                                  ({d > 0 ? '+' : ''}{d})
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    del(aid ?? '');
                  }}
                  style={{ ...delBtn, marginLeft: 8, fontSize: 18 }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
