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
  const [playerSearch, setPlayerSearch] = useState('');

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

                  {(() => {
                    const numRounds = act.races.length || 4;
                    const rankOrder = ts.map(x => x.team.name);
                    return (
                      <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                        <div style={{ minWidth: 360 }}>
                          {/* Header */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: `1fr repeat(${numRounds}, 36px) 44px 56px`,
                              gap: 0,
                              background: 'rgba(255,255,255,0.03)',
                              borderRadius: '6px 6px 0 0',
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
                              padding: '4px 8px',
                            }}
                          >
                            <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#445' }}>PLAYER</span>
                            {Array.from({ length: numRounds }, (_, i) => (
                              <span key={i} style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#445', textAlign: 'center' }}>R{i + 1}</span>
                            ))}
                            <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#e94560', textAlign: 'center' }}>TOT</span>
                            <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#445', textAlign: 'right' }}>ELO</span>
                          </div>
                          {/* Rows grouped by team */}
                          {act.teams.map((team, ti) => {
                            const teamRank = rankOrder.indexOf(team.name);
                            const teamScore = ts.find(x => x.team.name === team.name)?.score ?? 0;
                            return (
                              <Fragment key={ti}>
                                {/* Team header row */}
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
                                    {teamRank === 0 ? '👑 ' : teamRank === 1 ? '🥈 ' : ''}{team.name}
                                  </span>
                                  <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: TC[ti] }}>{teamScore} pts</span>
                                </div>
                                {/* Member rows */}
                                {team.members.map((member, mi) => {
                                  const displayName = team.subs?.[mi] || member;
                                  const isSub = !!(team.subs?.[mi]);
                                  const roundPts = act.races.map(r => {
                                    const res = r.results.find(x => x.player === displayName || x.player === member);
                                    return res?.points ?? null;
                                  });
                                  const total = roundPts.reduce((s: number, v) => s + (v ?? 0), 0);
                                  const eloB = Math.round(eB[member] || BASE_ELO);
                                  const eloA = Math.round(eA[member] || BASE_ELO);
                                  const eloDiff = eloA - eloB;
                                  return (
                                    <div
                                      key={member}
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: `1fr repeat(${numRounds}, 36px) 44px 56px`,
                                        gap: 0,
                                        padding: '4px 8px',
                                        borderBottom: '1px solid rgba(255,255,255,0.02)',
                                        background: mi % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                                        alignItems: 'center',
                                      }}
                                    >
                                      <div>
                                        <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#d0d4dc' }}>
                                          {displayName.split(' ')[0]}
                                        </span>
                                        {isSub && (
                                          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#c084fc', marginLeft: 4 }}>sub</span>
                                        )}
                                      </div>
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
                                      <span
                                        style={{
                                          fontFamily: FONT_MONO,
                                          fontSize: 10,
                                          color: eloDiff > 0 ? '#50fa7b' : eloDiff < 0 ? '#e94560' : '#444',
                                          textAlign: 'right',
                                        }}
                                      >
                                        {eloDiff > 0 ? '+' : ''}{eloDiff}
                                      </span>
                                    </div>
                                  );
                                })}
                              </Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
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
