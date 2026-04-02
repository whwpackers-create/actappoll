import { useState, useMemo, Fragment } from 'react';
import { teamScores, computeAllElos, STARTING_VR } from '../utils/elo';
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
  const [playerSearch, setPlayerSearch] = useState('');

  // Compute full ELO history ONCE (O(n)), then derive per-ACT before/after from hist entries.
  // hist[player] is an array of { actId, elo, change } in chronological order.
  // before = elo - change, after = elo.
  const { eloHist, eloFinal } = useMemo(() => {
    const { elos: eloFinal, hist: eloHist } = computeAllElos(
      data.players, data.acts, undefined, data.seasons
    );
    return { eloHist, eloFinal };
  }, [data.acts, data.players, data.seasons]);

  // Helper: get before/after ELO for a player in a specific ACT
  const getEloChange = (playerName: string, actId: string): { before: number; after: number } => {
    const entry = eloHist[playerName]?.find((h) => h.actId === actId);
    if (!entry) {
      const fallback = eloFinal[playerName] ?? STARTING_VR;
      return { before: fallback, after: fallback };
    }
    return { before: Math.round(entry.elo - entry.change), after: Math.round(entry.elo) };
  };

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
      if (playerSearch.trim()) {
        const q = playerSearch.trim().toLowerCase();
        const inAct = a.teams.some((t) =>
          [...t.members, ...(t.subs ?? [])].some((m) =>
            m.toLowerCase().includes(q)
          )
        );
        if (!inAct) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (histSort === 'added') return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });


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
    <div style={{ width: '100%' }}>
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
        <datalist id="hist-plist">
          {data.players.map((p) => (
            <option key={p.name} value={p.name} />
          ))}
        </datalist>
        <input
          list="hist-plist"
          placeholder="Filter by player..."
          value={playerSearch}
          onChange={(e) => setPlayerSearch(e.target.value)}
          style={{
            ...selectStyle,
            cursor: 'text',
            minWidth: 160,
          }}
        />
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

          // Parse saved grid/playerMap/penalties
          let savedGrid = act.grid as (number | null)[][][] | null | undefined;
          if (!savedGrid && act.gridJson) {
            try { savedGrid = JSON.parse(act.gridJson); } catch { /* ignore */ }
          }
          let savedPen = act.penalties as (number[] | number)[][] | null | undefined;
          if (!savedPen && act.penaltiesJson) {
            try { savedPen = JSON.parse(act.penaltiesJson); } catch { /* ignore */ }
          }
          let savedPM = act.playerMap as number[][][] | null | undefined;
          if (!savedPM && act.playerMapJson) {
            try { savedPM = JSON.parse(act.playerMapJson); } catch { /* ignore */ }
          }

          const actType = act.type ?? '8man';
          const tSz = actType === '12man' ? 3 : actType === '16man' ? 4 : 2;
          const numTeams = actType === '6man' ? 3 : 4;

          // ELO snapshots come from precomputed history — O(1) per ACT

          // Per-player total points from races (include subs so their points show correctly)
          const pp: Record<string, number> = {};
          act.teams.forEach((t) => {
            t.members.forEach((m, i) => {
              pp[m] = 0;
              const sub = t.subs?.[i];
              if (sub && sub !== '') pp[sub] = 0;
            });
          });
          act.races.forEach((r) =>
            r.results.forEach((x) => {
              if (x.player in pp) pp[x.player] += x.points;
            })
          );

          // Round total helper
          const getRoundTot = (ri: number, ti: number): number => {
            if (!savedGrid || !savedGrid[ri]?.[ti]) return 0;
            const arr = savedGrid[ri][ti] as (number | null)[];
            let s = arr.reduce((acc: number, v) => acc + (v ?? 0), 0);
            if (savedPen?.[ri]) {
              const v = (savedPen[ri] as Record<number, number[] | number>)[ti];
              if (Array.isArray(v)) s += (v as number[]).reduce((acc: number, x: number) => acc + x * -2, 0);
              else if (typeof v === 'number') s += (v as number) * -2;
            }
            return s;
          };

          // Grand total for team
          const getGrandTot = (ti: number): number => {
            if (!savedGrid) return ts.find(x => x.team.name === act.teams[ti]?.name)?.score ?? 0;
            let s = 0;
            for (let ri = 0; ri < 4; ri++) s += getRoundTot(ri, ti);
            return s;
          };

          // Color coding for score values
          const valColor = (v: number | null) =>
            v === 3 ? '#e94560' : v === 2 ? '#f5a623' : v === 1 ? '#8be9fd' : '#444';
          const valBg = (v: number | null) =>
            v === 3 ? '#e9456033' : v === 2 ? '#f5a62333' : v === 1 ? '#8be9fd22' : 'rgba(255,255,255,0.02)';

          const scBox = {
            width: 28,
            height: 28,
            borderRadius: 4,
            display: 'flex' as const,
            alignItems: 'center' as const,
            justifyContent: 'center' as const,
            fontFamily: FONT_HEADER,
            fontSize: 14,
          };

          // Detect 16man tv1/tv2 indices from saved playerMap
          // For display: group races 0-3 as TV1 and 4-7 as TV2 for 16man
          const is16man = actType === '16man';

          return (
            <div
              key={aid}
              style={{
                ...card,
                marginBottom: 16,
                borderLeft: '4px solid #c8a030',
                background: 'rgba(20,24,36,0.85)',
                border: '1px solid rgba(200,160,48,0.18)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1 }}>
                  {/* Header row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      setSelAct(aid ?? null);
                      setView('actdetail');
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_HEADER,
                        fontSize: 20,
                        color: '#f0e6d3',
                        letterSpacing: 2,
                      }}
                    >
                      {act.name}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 11,
                        color: '#c8a030',
                        background: 'rgba(200,160,48,0.08)',
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}
                    >
                      {act.date}
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 9,
                        color: '#c8a030',
                        background: 'rgba(200,160,48,0.08)',
                        padding: '2px 8px',
                        borderRadius: 4,
                      }}
                    >
                      {actType === '12man' ? '12-Man' : actType === '16man' ? '16-Man' : actType === '6man' ? '6-Man' : '8-Man'}
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

                  {/* Winner banner */}
                  {w && (
                    <div
                      style={{
                        background: 'rgba(200,160,48,0.07)',
                        border: '1px solid rgba(200,160,48,0.25)',
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
                            color: '#c8a030',
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

                  {/* Scorecard grid — NewAct step 1 style */}
                  {savedGrid ? (
                    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: `70px repeat(${numTeams}, 1fr) 70px`,
                          gap: 0,
                          border: '1px solid rgba(200,160,48,0.15)',
                          borderRadius: 10,
                          overflow: 'hidden',
                        }}
                      >
                        {/* Header: Round label */}
                        <div
                          style={{
                            padding: 10,
                            fontFamily: FONT_HEADER,
                            fontSize: 12,
                            color: '#666',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255,255,255,0.02)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          Round
                        </div>
                        {/* Header: team columns */}
                        {act.teams.slice(0, numTeams).map((t, ti) => (
                          <div
                            key={ti}
                            style={{
                              padding: '10px 8px',
                              textAlign: 'center',
                              background: 'rgba(255,255,255,0.02)',
                              borderBottom: `3px solid ${TC[ti]}`,
                            }}
                          >
                            <div style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#f0e6d3' }}>
                              {t.name}
                            </div>
                            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#666', marginTop: 2 }}>
                              {is16man ? (
                                (() => {
                                  // Detect tv1/tv2 from savedPM or default (indices 0,2 = tv1; 1,3 = tv2)
                                  const tv1 = savedPM ? [
                                    ...new Set(
                                      [0,1,2,3].map(h => savedPM![0]?.[ti]?.[h] ?? (h < 2 ? 0 : 2))
                                    )
                                  ].slice(0, 2) : [0, 2];
                                  const tv2 = [0,1,2,3].filter(i => !tv1.includes(i));
                                  return (
                                    <>
                                      <span style={{ color: '#8be9fd' }}>
                                        TV1: {tv1.map(i => {
                                          const m = t.members[i] ?? '';
                                          const s = t.subs?.[i];
                                          if (s && s !== '') return `${s.split(' ')[0]} (sub for ${m.split(' ')[0] || `P${i+1}`})`;
                                          return m.split(' ')[0] || `P${i+1}`;
                                        }).join(' & ')}
                                      </span>
                                      <br />
                                      <span style={{ color: '#f5a623' }}>
                                        TV2: {tv2.map(i => {
                                          const m = t.members[i] ?? '';
                                          const s = t.subs?.[i];
                                          if (s && s !== '') return `${s.split(' ')[0]} (sub for ${m.split(' ')[0] || `P${i+1}`})`;
                                          return m.split(' ')[0] || `P${i+1}`;
                                        }).join(' & ')}
                                      </span>
                                    </>
                                  );
                                })()
                              ) : (
                                t.members.map((m, i) =>
                                  t.subs?.[i] && t.subs[i] !== '' ? `${t.subs[i]} (sub for ${m})` : m
                                ).join(' & ')
                              )}
                            </div>
                          </div>
                        ))}
                        {/* Header: TOT label */}
                        <div
                          style={{
                            padding: 10,
                            fontFamily: FONT_HEADER,
                            fontSize: 12,
                            color: '#666',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(255,255,255,0.02)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          TOT
                        </div>

                        {/* Row for each cup (R1–R4) */}
                        {[0, 1, 2, 3].map((ri) => (
                          <Fragment key={ri}>
                            {/* Round label cell */}
                            <div
                              style={{
                                padding: '12px 8px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2,
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                              }}
                            >
                              <span style={{ fontFamily: FONT_HEADER, fontSize: 16, color: '#c8a030' }}>
                                R{ri + 1}
                              </span>
                              <span style={{ fontSize: 14 }}>{['🏁', '⭐', '🔥', '👑'][ri]}</span>
                            </div>

                            {/* Score cells for each team */}
                            {act.teams.slice(0, numTeams).map((t, ti) => {
                              const gridRow = savedGrid![ri]?.[ti] as (number | null)[] | undefined;
                              if (!gridRow) {
                                return (
                                  <div key={ti} style={{ padding: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#333' }}>—</span>
                                  </div>
                                );
                              }

                              // Get penalty sum for display
                              const penArr = savedPen?.[ri] && Array.isArray((savedPen[ri] as (number[]|number)[])[ti])
                                ? ((savedPen[ri] as (number[]|number)[])[ti] as number[])
                                : null;
                              const penSum = penArr ? penArr.reduce((s, v) => s + v, 0) : 0;
                              const roundTot = getRoundTot(ri, ti);

                              // Groups: for 16man show TV1 (ei 0-3) then TV2 (ei 4-7), otherwise single group
                              const eiGroups: number[][] = is16man
                                ? [[0,1,2,3],[4,5,6,7]]
                                : [gridRow.map((_, i) => i)];

                              return (
                                <div
                                  key={ti}
                                  style={{
                                    padding: '8px 6px',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: 4,
                                    borderLeft: `2px solid ${TC[ti]}22`,
                                  }}
                                >
                                  {eiGroups.map((eiGroup, groupIdx) => (
                                    <div key={groupIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' }}>
                                      {is16man && (
                                        <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: groupIdx === 0 ? '#8be9fd' : '#f5a623', textAlign: 'center', marginBottom: 1 }}>
                                          {groupIdx === 0 ? 'TV1' : 'TV2'}
                                        </div>
                                      )}
                                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {eiGroup.map((ei) => {
                                          const val = gridRow[ei] ?? null;
                                          // Determine player label from playerMap
                                          const mi = savedPM?.[ri]?.[ti]?.[ei] ?? (
                                            actType === '8man' || actType === '6man'
                                              ? ei % tSz
                                              : actType === '16man'
                                                ? (ei < 4 ? (ei % 2 === 0 ? 0 : 2) : (ei % 2 === 0 ? 1 : 3))
                                                : 0
                                          );
                                          const subForMi = t.subs?.[mi];
                                          const pLabel = (subForMi && subForMi !== '' ? subForMi : (t.members[mi] ?? '')).split(' ')[0]?.slice(0, 5) || `P${mi + 1}`;
                                          return (
                                            <div
                                              key={ei}
                                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                                            >
                                              <div style={{
                                                fontFamily: FONT_MONO,
                                                fontSize: 9,
                                                color: '#666',
                                                background: 'rgba(255,255,255,0.03)',
                                                borderRadius: 3,
                                                padding: '1px 3px',
                                                minWidth: 26,
                                                textAlign: 'center',
                                              }}>
                                                {pLabel}
                                              </div>
                                              <div style={{
                                                ...scBox,
                                                background: valBg(val),
                                                color: valColor(val),
                                              }}>
                                                {val ?? ''}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                  {/* Round total + penalty */}
                                  <div style={{
                                    fontFamily: FONT_MONO,
                                    fontSize: 11,
                                    color: '#888',
                                    borderTop: '1px solid rgba(255,255,255,0.04)',
                                    paddingTop: 3,
                                    width: '100%',
                                    textAlign: 'center',
                                  }}>
                                    {roundTot}
                                    {penSum > 0 && (
                                      <span style={{ color: '#ff6b6b' }}> (-{penSum * 2})</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* TOT column for this round */}
                            <div
                              style={{
                                padding: '8px 4px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                                gap: 2,
                              }}
                            >
                              {act.teams.slice(0, numTeams).map((_, ti) => (
                                <div
                                  key={ti}
                                  style={{
                                    fontFamily: FONT_MONO,
                                    fontSize: 11,
                                    color: TC[ti],
                                    textAlign: 'center',
                                  }}
                                >
                                  {getRoundTot(ri, ti)}
                                </div>
                              ))}
                            </div>
                          </Fragment>
                        ))}

                        {/* FINAL row */}
                        <div
                          style={{
                            padding: '12px 8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgba(200,160,48,0.08)',
                          }}
                        >
                          <span style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#c8a030', letterSpacing: 2 }}>
                            FINAL
                          </span>
                        </div>
                        {act.teams.slice(0, numTeams).map((_, ti) => (
                          <div
                            key={ti}
                            style={{
                              padding: '8px 6px',
                              background: 'rgba(200,160,48,0.08)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span style={{ fontFamily: FONT_HEADER, fontSize: 28, color: TC[ti] }}>
                              {getGrandTot(ti)}
                            </span>
                          </div>
                        ))}
                        <div
                          style={{
                            padding: '8px 4px',
                            background: 'rgba(200,160,48,0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                          }}
                        >
                          {act.teams.slice(0, numTeams)
                            .map((t, ti) => ({ name: t.name, score: getGrandTot(ti), ti }))
                            .sort((a, b) => b.score - a.score)
                            .map((x, i) => (
                              <div
                                key={x.ti}
                                style={{
                                  fontFamily: FONT_MONO,
                                  fontSize: 9,
                                  color: i === 0 ? '#c8a030' : i === 1 ? '#f5a623' : '#555',
                                }}
                              >
                                {i + 1}. {x.name} ({x.score})
                              </div>
                            ))}
                        </div>

                        {/* ELO changes row — inline below FINAL, matching screenshot layout */}
                        {/* Label cell */}
                        <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(200,160,48,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#c8a030', letterSpacing: 1 }}>VR ±</span>
                        </div>
                        {/* One cell per team */}
                        {act.teams.slice(0, numTeams).map((team, ti) => (
                          <div
                            key={ti}
                            style={{
                              padding: '6px 8px',
                              background: 'rgba(0,0,0,0.25)',
                              borderTop: '1px solid rgba(200,160,48,0.12)',
                              borderLeft: `2px solid ${TC[ti]}33`,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                            }}
                          >
                            {team.members.map((member, mi) => {
                              const subName = team.subs?.[mi];
                              const eloKey = subName && subName !== '' ? subName : member;
                              const { before, after } = getEloChange(eloKey, aid ?? '');
                              const diff = after - before;
                              const slot = mi === 0 ? 'A' : mi === 1 ? 'B' : mi === 2 ? 'C' : 'D';
                              const displayFirst = subName && subName !== ''
                                ? `${subName.split(' ')[0]} (sub)`
                                : member.split(' ')[0];
                              const pts = (pp[eloKey] ?? pp[member] ?? 0);
                              return (
                                <div key={member} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#778', minWidth: 12 }}>{slot}:</span>
                                  <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#d0d4dc', flex: 1 }}>{displayFirst}</span>
                                  <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#a09880', minWidth: 30, textAlign: 'right' }}>{pts} pts</span>
                                  <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: diff > 0 ? '#50fa7b' : diff < 0 ? '#e94560' : '#556', minWidth: 50, textAlign: 'right' }}>
                                    {diff > 0 ? `+${diff}` : diff === 0 ? '0' : diff} VR
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                        {/* TOT cell spacer */}
                        <div style={{ padding: '6px 4px', background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(200,160,48,0.12)' }} />
                      </div>
                    </div>
                  ) : (
                    /* Fallback: no saved grid — show race results from act.races */
                    <div style={{ marginBottom: 10 }}>
                      <div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `1fr repeat(${act.races.length || 4}, 36px) 44px`,
                            gap: 0,
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '6px 6px 0 0',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            padding: '4px 8px',
                          }}
                        >
                          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#445' }}>PLAYER</span>
                          {act.races.map((_, i) => (
                            <span key={i} style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#445', textAlign: 'center' }}>R{i + 1}</span>
                          ))}
                          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#e94560', textAlign: 'center' }}>TOT</span>
                        </div>
                        {act.teams.map((team, ti) => {
                          const teamScore = ts.find(x => x.team.name === team.name)?.score ?? 0;
                          return (
                            <Fragment key={ti}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '3px 8px',
                                  background: `${TC[ti]}14`,
                                  borderLeft: `3px solid ${TC[ti]}`,
                                  marginTop: ti > 0 ? 2 : 0,
                                }}
                              >
                                <span style={{ fontFamily: FONT_HEADER, fontSize: 11, color: TC[ti], letterSpacing: 1 }}>
                                  {team.name}
                                </span>
                                <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: TC[ti] }}>{teamScore} pts</span>
                              </div>
                              {team.members.map((member, mi) => {
                                const displayName = team.subs?.[mi] || member;
                                const roundPts = act.races.map(r => {
                                  const res = r.results.find(x => x.player === displayName || x.player === member);
                                  return res?.points ?? null;
                                });
                                const total = roundPts.reduce((s: number, v) => s + (v ?? 0), 0);
                                return (
                                  <div
                                    key={member}
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: `1fr repeat(${act.races.length || 4}, 36px) 44px`,
                                      gap: 0,
                                      padding: '4px 8px',
                                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                                      background: mi % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#d0d4dc' }}>
                                      {displayName.split(' ')[0]}
                                    </span>
                                    {roundPts.map((pts, ri) => (
                                      <span
                                        key={ri}
                                        style={{
                                          fontFamily: FONT_MONO,
                                          fontSize: 11,
                                          color: pts !== null ? '#c8bfa8' : '#333',
                                          textAlign: 'center',
                                        }}
                                      >
                                        {pts !== null ? pts : '—'}
                                      </span>
                                    ))}
                                    <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#e94560', textAlign: 'center' }}>{total}</span>
                                  </div>
                                );
                              })}
                              {/* Inline ELO row for fallback path */}
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 8,
                                  padding: '3px 8px 5px',
                                  background: 'rgba(0,0,0,0.15)',
                                  borderBottom: '1px solid rgba(200,160,48,0.08)',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#c8a030', letterSpacing: 1, alignSelf: 'center' }}>VR±</span>
                                {team.members.map((member, mi) => {
                                  const subName = team.subs?.[mi];
                                  const eloKey = subName && subName !== '' ? subName : member;
                                  const { before, after } = getEloChange(eloKey, aid ?? '');
                                  const diff = after - before;
                                  const firstName = subName && subName !== ''
                                    ? `${subName.split(' ')[0]} (sub)`
                                    : member.split(' ')[0];
                                  return (
                                    <div key={member} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: TC[ti] }}>{firstName}</span>
                                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: diff > 0 ? '#50fa7b' : diff < 0 ? '#e94560' : '#555' }}>
                                        {diff > 0 ? `+${diff}` : `${diff}`}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
