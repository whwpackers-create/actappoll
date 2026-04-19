import { useState, useMemo, Fragment } from 'react';
import { teamScores, computeAllElos, STARTING_VR } from '../utils/VR';
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
  const [histType, setHistType] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => { setPage(0); }, [histSort, histMonth, histYear, histType, playerSearch]);

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

  const sorted = useMemo(() => [...data.acts]
    .filter((a) => {
      const d = new Date(a.date);
      if (histYear && d.getFullYear() !== parseInt(histYear)) return false;
      if (histMonth && d.getMonth() !== parseInt(histMonth)) return false;
      if (histType) {
        // Use grid width to detect true type (same logic as display)
        let savedGridForFilter: (number | null)[][][] | null = null;
        if (a.gridJson) { try { savedGridForFilter = JSON.parse(a.gridJson); } catch { /* ignore */ } }
        const gw = (savedGridForFilter?.[0]?.[0] as (number | null)[] | undefined)?.length;
        let detectedType = a.type ?? '8man';
        if (gw === 8) detectedType = '16man';
        else if (gw === 6) detectedType = '12man';
        if (detectedType !== histType) return false;
      }
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
      const dt = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dt !== 0) return dt;
      return (b.satRound ?? 0) - (a.satRound ?? 0);
    }), [data.acts, histYear, histMonth, histType, playerSearch, histSort]);

  // Reset to page 0 when filters change
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(0, totalPages - 1));
  const pageSlice = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);


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
        <select
          value={histType}
          onChange={(e) => setHistType(e.target.value)}
          style={selectStyle}
        >
          <option value="">All Types</option>
          <option value="8man">8-Man</option>
          <option value="12man">12-Man</option>
          <option value="16man">16-Man</option>
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
        pageSlice.map((act) => {
          const ts = teamScores(act);
          const w = ts[0];
          const aid = act.id || act._id;
          const hasDupScores = act.races.some((race) => {
            const pts = race.results.map((r) => r.points);
            return pts.length !== new Set(pts).size;
          });

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

          // Auto-detect actType from saved grid dimensions — more reliable than
          // the stored type field, which may have been saved wrong (e.g. 16-man
          // saved as 8-man because the actType state wasn't updated in time).
          const gridWidth = (savedGrid?.[0]?.[0] as (number | null)[] | undefined)?.length;
          let actType = act.type ?? '8man';
          if (gridWidth === 8) actType = '16man';
          else if (gridWidth === 6) actType = '12man';
          const tSz = actType === '12man' ? 3 : actType === '16man' ? 4 : 2;
          const numTeams = actType === '6man' ? 3 : 4;

          // ELO snapshots come from precomputed history — O(1) per ACT

          // Per-player total points — computed from savedGrid+savedPM when available
          // so that TV2 (B/D slot) players in 16-man get their correct points
          // even when act.races was saved with wrong actType (only TV1 in races).
          const pp: Record<string, number> = {};
          if (savedGrid && savedPM) {
            for (let ri = 0; ri < 4; ri++) {
              for (let ti = 0; ti < numTeams; ti++) {
                const gridRow = savedGrid[ri]?.[ti] as (number | null)[] | undefined;
                if (!gridRow) continue;
                for (let h = 0; h < gridRow.length; h++) {
                  const miRaw = savedPM?.[ri]?.[ti]?.[h];
                  // Use saved PM entry; fall back to default layout when PM is shorter than grid
                  const mi = miRaw !== undefined && miRaw !== null ? miRaw : (
                    actType === '16man'
                      ? (h < 4 ? (h % 2 === 0 ? 0 : 2) : (h % 2 === 0 ? 1 : 3))
                      : h % tSz
                  );
                  const t = act.teams[ti];
                  if (!t) continue;
                  const sub = t.subs?.[mi];
                  const playerName = (sub && sub !== '') ? sub : (t.members[mi] ?? '');
                  if (!playerName) continue;
                  pp[playerName] = (pp[playerName] ?? 0) + (gridRow[h] ?? 0);
                }
              }
            }
          } else {
            // Fallback: accumulate from race results
            act.races.forEach((r) =>
              r.results.forEach((x) => {
                if (x.player && x.player.trim()) {
                  pp[x.player] = (pp[x.player] ?? 0) + x.points;
                }
              })
            );
          }

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
                    {hasDupScores && (
                      <span
                        title="Duplicate scores detected in one or more races"
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: '#f97316',
                          background: 'rgba(249,115,22,0.12)',
                          border: '1px solid rgba(249,115,22,0.3)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          marginLeft: 4,
                          cursor: 'help',
                        }}
                      >
                        ⚠ DUP
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
                    <>
                    {/* ── Mobile card layout ── */}
                    <div className="history-grid-mobile" style={{ marginBottom: 10 }}>
                      {/* Team score cards: 2 per row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                        {act.teams.slice(0, numTeams).map((t, ti) => {
                          const tot = getGrandTot(ti);
                          const isWinner = ts[0]?.team.name === t.name;
                          return (
                            <div key={ti} style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: `2px solid ${TC[ti]}${isWinner ? '' : '88'}`,
                              borderRadius: 10,
                              padding: '10px 12px',
                            }}>
                              <div style={{ fontFamily: FONT_HEADER, fontSize: 14, color: isWinner ? '#c8a030' : '#f0e6d3', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {isWinner && <span style={{ fontSize: 16 }}>🏆</span>}
                                {t.name}
                              </div>
                              {t.members.map((m, mi) => {
                                const sub = t.subs?.[mi];
                                const displayName = sub && sub !== '' ? sub : m;
                                const slot = ['A','B','C','D'][mi];
                                return (
                                  <div key={mi} style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#778', marginBottom: 2 }}>
                                    <span style={{ color: TC[ti], marginRight: 4 }}>{slot}:</span>
                                    {displayName.split(' ')[0]}
                                    {sub && sub !== '' && <span style={{ color: '#445', fontSize: 9 }}> (sub)</span>}
                                  </div>
                                );
                              })}
                              <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {[0,1,2,3].map((ri) => (
                                  <div key={ri} style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#666', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '2px 5px' }}>
                                    R{ri+1}: <span style={{ color: TC[ti] }}>{getRoundTot(ri, ti)}</span>
                                  </div>
                                ))}
                              </div>
                              <div style={{ marginTop: 6, fontFamily: FONT_HEADER, fontSize: 20, color: TC[ti] }}>
                                {tot} <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#445' }}>pts</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Player VR summary */}
                      <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445', letterSpacing: 1, marginBottom: 6 }}>PLAYER SUMMARY</div>
                        {act.teams.slice(0, numTeams).map((t, ti) =>
                          t.members.map((m, mi) => {
                            // Recover name from races for old 16-man acts with empty member slots
                            let resolvedM = m;
                            if (!resolvedM.trim() && is16man && savedPM) {
                              for (let ri = 0; ri < 4 && !resolvedM.trim(); ri++) {
                                for (let h = 0; h < (savedPM[ri]?.[ti]?.length ?? 0); h++) {
                                  if (savedPM[ri]?.[ti]?.[h] === mi) {
                                    const raceIdx = ri * tSz * 2 + h;
                                    const race = act.races[raceIdx];
                                    if (race) {
                                      const res = race.results.find(r => r.player && r.player.trim() && !r.player.startsWith('P'));
                                      if (res) { resolvedM = res.player; break; }
                                    }
                                  }
                                }
                              }
                            }
                            if (!resolvedM.trim()) return null;
                            const sub = t.subs?.[mi];
                            const eloKey = sub && sub !== '' ? sub : resolvedM;
                            const displayName = sub && sub !== '' ? `${sub.split(' ')[0]} (sub)` : resolvedM.split(' ')[0];
                            const { before, after } = getEloChange(eloKey, aid ?? '');
                            const diff = after - before;
                            const pts2 = pp[eloKey] ?? pp[resolvedM] ?? 0;
                            const slot = ['A','B','C','D'][mi];
                            return (
                              <div key={`${ti}-${mi}`} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 5, marginBottom: 5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: TC[ti], minWidth: 14 }}>{slot}</span>
                                <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#d0d4dc', flex: 1 }}>{displayName}</span>
                                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#a09880' }}>{pts2} pts</span>
                                <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: diff > 0 ? '#50fa7b' : diff < 0 ? '#e94560' : '#556', minWidth: 48, textAlign: 'right' }}>
                                  {diff > 0 ? `+${diff}` : diff === 0 ? '0' : diff} VR
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    {/* ── Desktop grid layout ── */}
                    <div className="history-grid-desktop" style={{ overflowX: 'auto', marginBottom: 10 }}>
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
                              // For 16-man acts with old data, member slots may be empty strings.
                              // Try to recover the actual player name from race results when possible.
                              let resolvedMember = member;
                              if (!resolvedMember.trim() && is16man && savedPM) {
                                // Find which heat positions map to this member index
                                for (let ri = 0; ri < 4 && !resolvedMember.trim(); ri++) {
                                  for (let h = 0; h < (savedPM[ri]?.[act.teams.indexOf(team)]?.length ?? 0); h++) {
                                    if (savedPM[ri]?.[ti]?.[h] === mi) {
                                      const raceIdx = ri * tSz * 2 + h;
                                      const race = act.races[raceIdx];
                                      if (race) {
                                        const res = race.results.find(r => r.player && r.player.trim() && !r.player.startsWith('P'));
                                        if (res) { resolvedMember = res.player; break; }
                                      }
                                    }
                                  }
                                }
                              }
                              // Skip completely empty member slots (old 16-man data gap)
                              if (!resolvedMember.trim()) return null;
                              const eloKey = subName && subName !== '' ? subName : resolvedMember;
                              const { before, after } = getEloChange(eloKey, aid ?? '');
                              const diff = after - before;
                              const slot = mi === 0 ? 'A' : mi === 1 ? 'B' : mi === 2 ? 'C' : 'D';
                              const displayFirst = subName && subName !== ''
                                ? `${subName.split(' ')[0]} (sub)`
                                : resolvedMember.split(' ')[0];
                              const pts = (pp[eloKey] ?? pp[resolvedMember] ?? 0);
                              return (
                                <div key={resolvedMember || `slot-${mi}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                    </>
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
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 0' }}>
          <button
            onClick={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 16px', fontFamily: FONT_MONO, fontSize: 12, color: safePage === 0 ? '#333' : '#a09880', cursor: safePage === 0 ? 'default' : 'pointer' }}
          >
            ← Prev
          </button>
          <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#556' }}>
            {safePage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage >= totalPages - 1}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 16px', fontFamily: FONT_MONO, fontSize: 12, color: safePage >= totalPages - 1 ? '#333' : '#a09880', cursor: safePage >= totalPages - 1 ? 'default' : 'pointer' }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
