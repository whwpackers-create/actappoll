import { useState, useMemo } from 'react';
import { computeStats, teamScores } from '../utils/elo';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { AppData } from '../types';

interface AnalyticsProps {
  data: AppData;
  setView: (v: string) => void;
}

export function Analytics({ data, setView }: AnalyticsProps) {
  const stats = computeStats(data.players, data.acts, data.sats ?? []);
  const topPlayers = [...stats]
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 3)
    .map((p) => p.name);
  const [selected, setSelected] = useState<string[]>(topPlayers);
  const [hoverPt, setHoverPt] = useState<{ idx: number; date: string } | null>(
    null
  );
  const [searchQ, setSearchQ] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const allPlayerNames = stats
    .filter((p) => p.actCount > 0)
    .sort((a, b) => b.elo - a.elo)
    .map((p) => p.name);
  const [h2hP1, setH2hP1] = useState('');
  const [h2hP2, setH2hP2] = useState('');

  const h2hData = useMemo(() => {
    if (!h2hP1 || !h2hP2 || h2hP1 === h2hP2) return null;
    const getPlayerInAct = (act: AppData['acts'][0], name: string) => {
      for (const team of act.teams ?? []) {
        const memberIdx = (team.members ?? []).indexOf(name);
        if (memberIdx !== -1) {
          const activeName = team.subs?.[memberIdx] || name;
          return { team, activeName };
        }
      }
      return null;
    };
    const getPlayerPts = (act: AppData['acts'][0], activeName: string) => {
      return (act.races ?? []).reduce((sum, r) => {
        const res = (r.results ?? []).find((x) => x.player === activeName);
        return sum + (res?.points ?? 0);
      }, 0);
    };

    const sharedActs = (data.acts ?? []).filter(
      (act) => getPlayerInAct(act, h2hP1) !== null && getPlayerInAct(act, h2hP2) !== null
    );

    if (sharedActs.length === 0) return { sharedActs: [], p1: h2hP1, p2: h2hP2 };

    const rows = sharedActs.map((act) => {
      const p1Info = getPlayerInAct(act, h2hP1)!;
      const p2Info = getPlayerInAct(act, h2hP2)!;
      const p1Pts = getPlayerPts(act, p1Info.activeName);
      const p2Pts = getPlayerPts(act, p2Info.activeName);
      const ts = teamScores(act);
      const p1TeamScore = ts.find((x) => x.team.name === p1Info.team.name)?.score ?? 0;
      const p2TeamScore = ts.find((x) => x.team.name === p2Info.team.name)?.score ?? 0;
      const sameTeam = p1Info.team.name === p2Info.team.name;
      const p1TeamWon = !sameTeam && p1TeamScore > p2TeamScore;
      const p2TeamWon = !sameTeam && p2TeamScore > p1TeamScore;
      return { act, p1Pts, p2Pts, p1TeamWon, p2TeamWon, sameTeam, p1TeamScore, p2TeamScore };
    });

    const p1TotalPts = rows.reduce((s, r) => s + r.p1Pts, 0);
    const p2TotalPts = rows.reduce((s, r) => s + r.p2Pts, 0);
    const headToHeadActs = rows.filter((r) => !r.sameTeam);
    const p1Wins = headToHeadActs.filter((r) => r.p1TeamWon).length;
    const p2Wins = headToHeadActs.filter((r) => r.p2TeamWon).length;
    const p1HigherPts = rows.filter((r) => r.p1Pts > r.p2Pts).length;
    const p2HigherPts = rows.filter((r) => r.p2Pts > r.p1Pts).length;

    return {
      sharedActs: rows,
      p1: h2hP1,
      p2: h2hP2,
      p1TotalPts,
      p2TotalPts,
      p1AvgPts: p1TotalPts / sharedActs.length,
      p2AvgPts: p2TotalPts / sharedActs.length,
      headToHeadCount: headToHeadActs.length,
      p1Wins,
      p2Wins,
      p1HigherPts,
      p2HigherPts,
    };
  }, [h2hP1, h2hP2, data.acts]);

  const colors = [
    '#e94560',
    '#50fa7b',
    '#f5a623',
    '#aa7aca',
    '#4aade0',
    '#ff6b9d',
    '#c084fc',
    '#6aca6a',
    '#e0a040',
    '#40c0c0',
  ];

  const backBtn = (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setView('dashboard')}
        style={{
          background: 'rgba(180,160,60,0.08)',
          border: '2px solid #6a6040',
          borderRadius: 4,
          padding: '8px 16px',
          fontFamily: FONT_HEADER,
          fontSize: 14,
          color: '#c0c4cc',
          cursor: 'pointer',
        }}
      >
        &lt; Back
      </button>
    </div>
  );

  const allPlayers = stats
    .filter((p) => p.eloHistory && p.eloHistory.length > 0)
    .sort((a, b) => b.elo - a.elo);
  const searchResults =
    searchQ.length > 0
      ? allPlayers
          .filter(
            (p) =>
              p.name.toLowerCase().includes(searchQ.toLowerCase()) &&
              !selected.includes(p.name)
          )
          .slice(0, 8)
      : [];

  const addPlayer = (name: string) => {
    if (selected.length < 10 && !selected.includes(name)) {
      setSelected((prev) => [...prev, name]);
    }
    setSearchQ('');
    setShowDropdown(false);
  };
  const removePlayer = (name: string) => {
    setSelected((prev) => prev.filter((n) => n !== name));
  };

  const allDates: string[] = [];
  selected.forEach((name) => {
    const p = stats.find((s) => s.name === name);
    if (p?.eloHistory) {
      // Exclude SAT placement bonus entries (isSat + points===0) — they store
      // ELO computed after all future acts, causing false spikes in the chart
      p.eloHistory.forEach((h) => {
        if (h.date && !(h.isSat && h.points === 0)) allDates.push(h.date);
      });
    }
  });
  const uniqueDates = [...new Set(allDates)].sort();

  let minE = 9999;
  let maxE = 0;
  const lines = selected.map((name, ni) => {
    const p = stats.find((s) => s.name === name);
    // Filter out SAT placement bonus entries for the same reason
    const hist = (p?.eloHistory ?? []).filter((h) => !(h.isSat && h.points === 0));
    const finalElo = p ? Math.round(p.elo) : 1000;
    // First date the player actually appeared in an ACT
    const firstDate = hist.length > 0
      ? [...hist].sort((a, b) => a.date.localeCompare(b.date))[0].date
      : null;
    const pts: { date: string; elo: number | null; idx: number }[] = [];
    let curElo = 1000;
    uniqueDates.forEach((date, di) => {
      const isLast = di === uniqueDates.length - 1;
      // Don't show a line before the player's first recorded ACT
      if (firstDate && date < firstDate) {
        pts.push({ date, elo: null, idx: di });
        return;
      }
      const entry = hist.find((h) => h.date === date) ?? null;
      if (entry) curElo = Math.round(entry.elo);
      // Snap the last point to the real leaderboard ELO so chart always matches
      const displayElo = isLast ? finalElo : curElo;
      pts.push({ date, elo: displayElo, idx: di });
      if (displayElo < minE) minE = displayElo;
      if (displayElo > maxE) maxE = displayElo;
    });
    return { name, pts, color: colors[ni % colors.length] };
  });

  if (minE > maxE) {
    minE = 950;
    maxE = 1050;
  }
  minE = Math.max(800, minE - 20);
  maxE = maxE + 20;

  const padL = 50;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const W = 900;
  const H = 380;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const scaleX = (i: number) =>
    padL + (i / Math.max(uniqueDates.length - 1, 1)) * chartW;
  const scaleY = (v: number) =>
    padT + chartH - ((v - minE) / (maxE - minE)) * chartH;
  const gridLines = 6;
  const labelStep = Math.max(1, Math.floor(uniqueDates.length / 8));

  const formatDate = (d: string) => {
    const p = d.split('-');
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return months[parseInt(p[1]) - 1] + ' ' + parseInt(p[2]) + ', ' + p[0];
  };
  const shortDate = (d: string) => {
    const p = d.split('-');
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return months[parseInt(p[1]) - 1] + " '" + p[0].slice(2);
  };

  return (
    <div style={{ width: '100%' }}>
      {backBtn}
      <div
        style={{
          background: 'rgba(12,14,22,0.75)',
          backdropFilter: 'blur(4px)',
          border: '2px solid #2a3040',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEADER,
            fontSize: 22,
            color: '#f0e6d3',
            marginBottom: 4,
            letterSpacing: 2,
          }}
        >
          📈 Elo History
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: '#556',
            marginBottom: 16,
          }}
        >
          Compare player Elo ratings over time
        </div>

        <div
          style={{
            position: 'relative',
            marginBottom: 12,
            maxWidth: 350,
          }}
        >
          <input
            value={searchQ}
            onChange={(e) => {
              setSearchQ(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Add player..."
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              padding: '8px 12px',
              fontFamily: FONT_MONO,
              fontSize: 13,
              color: '#f0e6d3',
              width: '100%',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {showDropdown && searchResults.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#1a1e28',
                border: '1px solid #3a4050',
                borderRadius: 6,
                marginTop: 2,
                zIndex: 10,
                maxHeight: 200,
                overflowY: 'auto',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {searchResults.map((p) => (
                <div
                  key={p.name}
                  onClick={() => addPlayer(p.name)}
                  style={{
                    padding: '8px 12px',
                    fontFamily: FONT_MONO,
                    fontSize: 12,
                    color: '#f0e6d3',
                    cursor: 'pointer',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {p.name}{' '}
                  <span style={{ color: '#556', fontSize: 10 }}>
                    ({Math.round(p.elo)} Elo)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            {selected.map((name, i) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 20,
                  border: '2px solid ' + colors[i % colors.length],
                  background: 'rgba(255,255,255,0.03)',
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  color: colors[i % colors.length],
                }}
              >
                {name}
                <span
                  onClick={() => removePlayer(name)}
                  style={{
                    cursor: 'pointer',
                    opacity: 0.6,
                    fontSize: 14,
                    marginLeft: 2,
                  }}
                >
                  ×
                </span>
              </div>
            ))}
          </div>
        )}

        {selected.length > 0 && uniqueDates.length >= 2 && (
          <div style={{ position: 'relative' }}>
            <svg
              viewBox={'0 0 ' + W + ' ' + H}
              style={{
                width: '100%',
                maxWidth: 900,
                height: 380,
                display: 'block',
              }}
              onMouseLeave={() => setHoverPt(null)}
            >
              <text
                x="14"
                y={H / 2}
                fill="#445"
                fontSize="10"
                fontFamily={FONT_MONO}
                textAnchor="middle"
                transform={'rotate(-90,14,' + H / 2 + ')'}
              >
                Elo Rating
              </text>
              {Array.from({ length: gridLines }).map((_, gi) => {
                const v = minE + ((maxE - minE) / (gridLines - 1)) * gi;
                const y = scaleY(v);
                return (
                  <g key={gi}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={W - padR}
                      y2={y}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 6}
                      y={y + 4}
                      fill="#445"
                      fontSize="10"
                      textAnchor="end"
                      fontFamily="monospace"
                    >
                      {Math.round(v)}
                    </text>
                  </g>
                );
              })}
              {uniqueDates.map((d, i) => {
                if (i % labelStep !== 0 && i !== uniqueDates.length - 1)
                  return null;
                return (
                  <text
                    key={i}
                    x={scaleX(i)}
                    y={H - 12}
                    fill="#445"
                    fontSize="9"
                    textAnchor="middle"
                    fontFamily="monospace"
                  >
                    {shortDate(d)}
                  </text>
                );
              })}
              {lines.map((line) => {
                let d = '';
                let segStarted = false;
                line.pts.forEach((pt, i) => {
                  if (pt.elo === null) { segStarted = false; return; }
                  if (!segStarted) { d += 'M' + scaleX(i) + ',' + scaleY(pt.elo); segStarted = true; }
                  else { d += 'L' + scaleX(i) + ',' + scaleY(pt.elo); }
                });
                return (
                  <path
                    key={line.name}
                    d={d}
                    fill="none"
                    stroke={line.color}
                    strokeWidth="2"
                    opacity="0.85"
                    strokeLinejoin="round"
                  />
                );
              })}
              {hoverPt &&
                lines.map((line) => {
                  const pt = line.pts[hoverPt.idx];
                  return pt && pt.elo !== null ? (
                    <circle
                      key={line.name}
                      cx={scaleX(hoverPt.idx)}
                      cy={scaleY(pt.elo as number)}
                      r="5"
                      fill={line.color}
                      stroke="#1a1e28"
                      strokeWidth="2"
                    />
                  ) : null;
                })}
              {uniqueDates.map((d, i) => {
                const colW = chartW / Math.max(uniqueDates.length - 1, 1);
                return (
                  <rect
                    key={i}
                    x={scaleX(i) - colW / 2}
                    y={padT}
                    width={colW}
                    height={chartH}
                    fill="transparent"
                    onMouseEnter={() => setHoverPt({ idx: i, date: d })}
                  />
                );
              })}
              {hoverPt && (
                <line
                  x1={scaleX(hoverPt.idx)}
                  y1={padT}
                  x2={scaleX(hoverPt.idx)}
                  y2={padT + chartH}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="1"
                />
              )}
            </svg>

            {hoverPt && (
              <div
                style={{
                  position: 'absolute',
                  top: 20,
                  left: Math.min(scaleX(hoverPt.idx) + 10, W - 180),
                  background: 'rgba(12,14,22,0.95)',
                  border: '1px solid #3a4050',
                  borderRadius: 8,
                  padding: '10px 14px',
                  pointerEvents: 'none',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                  zIndex: 5,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    color: '#889',
                    marginBottom: 6,
                  }}
                >
                  {formatDate(hoverPt.date)}
                </div>
                {lines.map((line) => {
                  const pt = line.pts[hoverPt.idx];
                  return pt && pt.elo !== null ? (
                    <div
                      key={line.name}
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 12,
                        color: line.color,
                        marginBottom: 2,
                      }}
                    >
                      <span style={{ fontWeight: 'bold' }}>{line.name}:</span>{' '}
                      {pt.elo}
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {selected.length === 0 && (
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 13,
              color: '#445',
              padding: '60px 0',
              textAlign: 'center',
            }}
          >
            Search and add players to compare their Elo history
          </div>
        )}
        {selected.length > 0 && uniqueDates.length < 2 && (
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 13,
              color: '#445',
              padding: '60px 0',
              textAlign: 'center',
            }}
          >
            Not enough data for selected players
          </div>
        )}

        {lines.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              justifyContent: 'center',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            {lines.map((line) => {
              const last = line.pts[line.pts.length - 1];
              const firstNonNull = line.pts.find((p) => p.elo !== null);
              const diff = last?.elo != null && firstNonNull?.elo != null ? last.elo - firstNonNull.elo : 0;
              return (
                <div
                  key={line.name}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 3,
                      borderRadius: 2,
                      background: line.color,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      color: line.color,
                    }}
                  >
                    {line.name}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      color: '#889',
                    }}
                  >
                    {last ? last.elo : ''}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 9,
                      color:
                        diff > 0 ? '#50fa7b' : diff < 0 ? '#e94560' : '#556',
                    }}
                  >
                    ({diff > 0 ? '+' : ''}{diff})
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Head to Head */}
      <div
        style={{
          marginTop: 24,
          background: 'rgba(12,14,22,0.75)',
          backdropFilter: 'blur(4px)',
          border: '2px solid #2a3040',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <div style={{ fontFamily: FONT_HEADER, fontSize: 22, color: '#f0e6d3', marginBottom: 4, letterSpacing: 2 }}>
          ⚔️ Head to Head
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#556', marginBottom: 16 }}>
          Compare two players across ACTs where both competed
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {[{ val: h2hP1, set: setH2hP1, label: 'Player 1', color: '#e94560' }, { val: h2hP2, set: setH2hP2, label: 'Player 2', color: '#50fa7b' }].map(({ val, set, label, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#556' }}>{label}</span>
              <select
                value={val}
                onChange={(e) => set(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `2px solid ${val ? color : 'rgba(255,255,255,0.1)'}`,
                  borderRadius: 6,
                  padding: '8px 12px',
                  fontFamily: FONT_MONO,
                  fontSize: 13,
                  color: val ? color : '#556',
                  cursor: 'pointer',
                  minWidth: 160,
                }}
              >
                <option value="">— Select player —</option>
                {allPlayerNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {h2hP1 && h2hP2 && h2hP1 === h2hP2 && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#556', padding: '20px 0' }}>
            Select two different players.
          </div>
        )}

        {h2hData && h2hData.sharedActs.length === 0 && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#556', padding: '20px 0' }}>
            No shared ACTs found for these two players.
          </div>
        )}

        {h2hData && h2hData.sharedActs.length > 0 && (
          <>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 20, alignItems: 'center' }}>
              {/* P1 stats */}
              <div style={{ background: 'rgba(233,69,96,0.08)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontFamily: FONT_HEADER, fontSize: 18, color: '#e94560', marginBottom: 8 }}>{h2hData.p1}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <StatRow label="Avg pts / ACT" value={(h2hData.p1AvgPts ?? 0).toFixed(1)} color="#e94560" />
                  <StatRow label="Total pts" value={String(h2hData.p1TotalPts)} color="#e94560" />
                  {(h2hData.headToHeadCount ?? 0) > 0 && (
                    <StatRow label="Team wins" value={`${h2hData.p1Wins}/${h2hData.headToHeadCount}`} color="#e94560" />
                  )}
                  <StatRow label="Higher indiv. pts" value={`${h2hData.p1HigherPts}/${h2hData.sharedActs.length}`} color="#e94560" />
                </div>
              </div>
              {/* VS badge */}
              <div style={{ fontFamily: FONT_HEADER, fontSize: 22, color: '#445', textAlign: 'center', padding: '0 8px' }}>VS</div>
              {/* P2 stats */}
              <div style={{ background: 'rgba(80,250,123,0.06)', border: '1px solid rgba(80,250,123,0.2)', borderRadius: 10, padding: '14px 18px' }}>
                <div style={{ fontFamily: FONT_HEADER, fontSize: 18, color: '#50fa7b', marginBottom: 8 }}>{h2hData.p2}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <StatRow label="Avg pts / ACT" value={(h2hData.p2AvgPts ?? 0).toFixed(1)} color="#50fa7b" />
                  <StatRow label="Total pts" value={String(h2hData.p2TotalPts)} color="#50fa7b" />
                  {(h2hData.headToHeadCount ?? 0) > 0 && (
                    <StatRow label="Team wins" value={`${h2hData.p2Wins}/${h2hData.headToHeadCount}`} color="#50fa7b" />
                  )}
                  <StatRow label="Higher indiv. pts" value={`${h2hData.p2HigherPts}/${h2hData.sharedActs.length}`} color="#50fa7b" />
                </div>
              </div>
            </div>

            {/* Per-ACT breakdown */}
            <div style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#889', letterSpacing: 1, marginBottom: 8 }}>
              SHARED ACTs ({h2hData.sharedActs.length})
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 360 }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 60px', gap: 0, background: 'rgba(255,255,255,0.03)', borderRadius: '6px 6px 0 0', padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445' }}>ACT</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#e94560', textAlign: 'center' }}>{h2hData.p1.split(' ')[0].toUpperCase()}</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#50fa7b', textAlign: 'center' }}>{h2hData.p2.split(' ')[0].toUpperCase()}</span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445', textAlign: 'right' }}>RESULT</span>
                </div>
                {h2hData.sharedActs.map(({ act, p1Pts, p2Pts, p1TeamWon, p2TeamWon, sameTeam }, i) => (
                  <div
                    key={act.id || act._id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 70px 70px 60px',
                      gap: 0,
                      padding: '7px 10px',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#c8bfa8' }}>{act.name}</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445', marginLeft: 6 }}>{act.date}</span>
                    </div>
                    <span style={{ fontFamily: FONT_HEADER, fontSize: 14, color: p1Pts > p2Pts ? '#e94560' : '#667', textAlign: 'center' }}>{p1Pts}</span>
                    <span style={{ fontFamily: FONT_HEADER, fontSize: 14, color: p2Pts > p1Pts ? '#50fa7b' : '#667', textAlign: 'center' }}>{p2Pts}</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: sameTeam ? '#f5a623' : p1TeamWon ? '#e94560' : p2TeamWon ? '#50fa7b' : '#445', textAlign: 'right' }}>
                      {sameTeam ? 'same team' : p1TeamWon ? `${h2hData.p1.split(' ')[0]} W` : p2TeamWon ? `${h2hData.p2.split(' ')[0]} W` : 'tie'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {(!h2hP1 || !h2hP2) && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#445', padding: '20px 0' }}>
            Select two players above to see their head-to-head record.
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#556' }}>{label}</span>
      <span style={{ fontFamily: FONT_HEADER, fontSize: 14, color }}>{value}</span>
    </div>
  );
}
