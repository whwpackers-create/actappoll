import { useState, useMemo } from 'react';
import { computeStats } from '../utils/elo';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { AppData } from '../types';

interface AnalyticsProps {
  data: AppData;
  setView: (v: string) => void;
}

export function Analytics({ data, setView }: AnalyticsProps) {
  const stats = computeStats(data.players, data.acts, data.sats ?? [], data.seasons);
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
  const [h2hQ1, setH2hQ1] = useState('');
  const [h2hQ2, setH2hQ2] = useState('');
  const [h2hShow1, setH2hShow1] = useState(false);
  const [h2hShow2, setH2hShow2] = useState(false);

  const h2hData = useMemo(() => {
    if (!h2hP1 || !h2hP2 || h2hP1 === h2hP2) return null;

    const getActiveName = (act: AppData['acts'][0], name: string): string | null => {
      for (const team of act.teams ?? []) {
        const idx = (team.members ?? []).indexOf(name);
        if (idx !== -1) return team.subs?.[idx] || name;
      }
      return null;
    };

    const sharedActsRaw = (data.acts ?? []).filter(
      (act) => getActiveName(act, h2hP1) !== null && getActiveName(act, h2hP2) !== null
    );

    if (sharedActsRaw.length === 0) return { actRows: [], p1: h2hP1, p2: h2hP2, totalRaces: 0, p1RaceWins: 0, p2RaceWins: 0, p1TotalPts: 0, p2TotalPts: 0 };

    const actRows = sharedActsRaw.map((act) => {
      const an1 = getActiveName(act, h2hP1)!;
      const an2 = getActiveName(act, h2hP2)!;
      let p1RaceWins = 0, p2RaceWins = 0, tiedRaces = 0, sharedRaces = 0;
      let p1TotalPts = 0, p2TotalPts = 0;
      for (const race of act.races ?? []) {
        const r1 = (race.results ?? []).find((x) => x.player === an1);
        const r2 = (race.results ?? []).find((x) => x.player === an2);
        if (!r1 || !r2) continue;
        sharedRaces++;
        p1TotalPts += r1.points;
        p2TotalPts += r2.points;
        if (r1.points > r2.points) p1RaceWins++;
        else if (r2.points > r1.points) p2RaceWins++;
        else tiedRaces++;
      }
      return { act, p1RaceWins, p2RaceWins, tiedRaces, sharedRaces, p1TotalPts, p2TotalPts };
    }).filter((r) => r.sharedRaces > 0);

    const totalRaces = actRows.reduce((s, r) => s + r.sharedRaces, 0);
    const p1RaceWins = actRows.reduce((s, r) => s + r.p1RaceWins, 0);
    const p2RaceWins = actRows.reduce((s, r) => s + r.p2RaceWins, 0);
    const p1TotalPts = actRows.reduce((s, r) => s + r.p1TotalPts, 0);
    const p2TotalPts = actRows.reduce((s, r) => s + r.p2TotalPts, 0);

    return {
      actRows,
      p1: h2hP1,
      p2: h2hP2,
      totalRaces,
      p1RaceWins,
      p2RaceWins,
      p1TotalPts,
      p2TotalPts,
      p1AvgPts: totalRaces > 0 ? p1TotalPts / totalRaces : 0,
      p2AvgPts: totalRaces > 0 ? p2TotalPts / totalRaces : 0,
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
          minHeight: 36,
        }}
      >
        {'←'} Back
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

  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 60;
  const W = 900;
  const H = 380;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const scaleX = (i: number) =>
    padL + (i / Math.max(uniqueDates.length - 1, 1)) * chartW;
  const scaleY = (v: number) =>
    padT + chartH - ((v - minE) / (maxE - minE)) * chartH;
  const gridLines = 5;
  const labelStep = Math.max(1, Math.floor(uniqueDates.length / 6));

  const handleSvgTouch = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * (W / rect.width);
    if (uniqueDates.length < 2) return;
    const idx = Math.round(((x - padL) / chartW) * (uniqueDates.length - 1));
    const clamped = Math.max(0, Math.min(uniqueDates.length - 1, idx));
    setHoverPt({ idx: clamped, date: uniqueDates[clamped] });
  };

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
          background: 'rgba(14,18,30,0.85)',
          border: '1px solid rgba(200,160,48,0.18)',
          borderRadius: 12,
          padding: '20px 24px',
        }}
      >
        <div
          style={{
            fontFamily: FONT_HEADER,
            fontSize: 22,
            color: '#ffffff',
            marginBottom: 4,
            letterSpacing: 3,
          }}
        >
          Elo History
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            color: '#8090a0',
            letterSpacing: 2,
            marginBottom: 16,
          }}
        >
          COMPARE PLAYER ELO RATINGS OVER TIME
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
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(200,160,48,0.2)',
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
          <div style={{ position: 'relative', width: '100%' }}>
            <svg
              viewBox={'0 0 ' + W + ' ' + H}
              style={{
                width: '100%',
                display: 'block',
                touchAction: 'none',
              }}
              onMouseLeave={() => setHoverPt(null)}
              onTouchStart={handleSvgTouch}
              onTouchMove={handleSvgTouch}
              onTouchEnd={() => setHoverPt(null)}
            >
              <text
                x="16"
                y={H / 2}
                fill="#8899aa"
                fontSize="14"
                fontFamily={FONT_MONO}
                textAnchor="middle"
                transform={'rotate(-90,16,' + H / 2 + ')'}
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
                      stroke="rgba(255,255,255,0.10)"
                      strokeWidth="1"
                    />
                    <text
                      x={padL - 8}
                      y={y + 5}
                      fill="#99aabb"
                      fontSize="14"
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
                    y={H - 10}
                    fill="#99aabb"
                    fontSize="13"
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

            {hoverPt && (() => {
              const pct = (scaleX(hoverPt.idx) / W) * 100;
              const showRight = pct < 22;
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: 20,
                    ...(showRight
                      ? { left: `calc(${pct}% + 8px)` }
                      : { left: `calc(${pct}% - 185px)` }
                    ),
                    background: 'rgba(12,14,22,0.95)',
                    border: '1px solid #3a4050',
                    borderRadius: 8,
                    padding: '10px 14px',
                    pointerEvents: 'none',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                    zIndex: 5,
                    minWidth: 160,
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
              );
            })()}
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
          background: 'rgba(14,18,30,0.85)',
          border: '1px solid rgba(200,160,48,0.18)',
          borderRadius: 12,
          padding: '20px 24px',
        }}
      >
        <div style={{ fontFamily: FONT_HEADER, fontSize: 22, color: '#ffffff', marginBottom: 4, letterSpacing: 3 }}>
          VERSUS
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 22 }}>
          COMPARE TWO RACERS ACROSS ACT HISTORY
        </div>

        {/* Player inputs — full width side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { val: h2hP1, setVal: setH2hP1, q: h2hQ1, setQ: setH2hQ1, show: h2hShow1, setShow: setH2hShow1, label: 'Player 1' },
            { val: h2hP2, setVal: setH2hP2, q: h2hQ2, setQ: setH2hQ2, show: h2hShow2, setShow: setH2hShow2, label: 'Player 2' },
          ].map(({ val, setVal, q, setQ, show, setShow, label }) => {
            const filtered = allPlayerNames.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
            return (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5, position: 'relative' }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2 }}>{label.toUpperCase()}</span>
                <input
                  value={val && !show ? val : q}
                  onChange={(e) => { setQ(e.target.value); setShow(true); setVal(''); }}
                  onFocus={() => { setQ(''); setShow(true); }}
                  onBlur={() => setTimeout(() => setShow(false), 150)}
                  placeholder="Search player..."
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: `1px solid ${val ? 'rgba(200,160,48,0.4)' : 'rgba(200,160,48,0.2)'}`,
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontFamily: FONT_MONO,
                    fontSize: 14,
                    color: '#f0e6d3',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                    minHeight: 36,
                  }}
                />
                {show && filtered.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#1a1e28',
                    border: '1px solid #3a4050',
                    borderRadius: 8,
                    marginTop: 2,
                    zIndex: 20,
                    maxHeight: 220,
                    overflowY: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    {filtered.map((n) => (
                      <div
                        key={n}
                        onMouseDown={() => { setVal(n); setQ(''); setShow(false); }}
                        style={{ padding: '10px 16px', fontFamily: FONT_HEADER, fontSize: 14, color: '#f0e6d3', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {h2hP1 && h2hP2 && h2hP1 === h2hP2 && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#556', padding: '20px 0' }}>Select two different players.</div>
        )}
        {h2hData && h2hData.totalRaces === 0 && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#556', padding: '20px 0' }}>No shared races found for these two players.</div>
        )}
        {(!h2hP1 || !h2hP2) && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#445', padding: '10px 0' }}>Select two players above to see their record.</div>
        )}

        {h2hData && h2hData.totalRaces > 0 && (() => {
          const p1Leading = h2hData.p1RaceWins > h2hData.p2RaceWins;
          const p2Leading = h2hData.p2RaceWins > h2hData.p1RaceWins;
          const p1Pct = Math.round((h2hData.p1RaceWins / h2hData.totalRaces) * 100);
          const p2Pct = Math.round((h2hData.p2RaceWins / h2hData.totalRaces) * 100);
          const totalPct = 100;
          return (
            <>
              {/* Three stat boxes */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10, marginBottom: 28 }}>
                {/* Races against */}
                <div style={{ background: 'rgba(200,160,48,0.05)', border: '1px solid rgba(200,160,48,0.15)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 8 }}>RACES AGAINST</div>
                  <div style={{ fontFamily: FONT_HEADER, fontSize: 28, color: '#f0e6d3', lineHeight: 1 }}>{h2hData.totalRaces}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#556', marginTop: 4 }}>{totalPct}%</div>
                </div>
                {/* P1 wins */}
                <div style={{
                  background: p1Leading ? 'rgba(200,160,48,0.1)' : 'rgba(255,255,255,0.02)',
                  border: p1Leading ? '1px solid rgba(200,160,48,0.35)' : '1px solid rgba(200,160,48,0.1)',
                  borderLeft: p1Leading ? '4px solid #c8a030' : '1px solid rgba(200,160,48,0.1)',
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 8 }}>{h2hData.p1.toUpperCase()} WINS</div>
                  <div style={{ fontFamily: FONT_HEADER, fontSize: 28, color: '#f0e6d3', lineHeight: 1 }}>{h2hData.p1RaceWins}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#556', marginTop: 4 }}>{p1Pct}%</div>
                </div>
                {/* P2 wins */}
                <div style={{
                  background: p2Leading ? 'rgba(200,160,48,0.1)' : 'rgba(255,255,255,0.02)',
                  border: p2Leading ? '1px solid rgba(200,160,48,0.35)' : '1px solid rgba(200,160,48,0.1)',
                  borderLeft: p2Leading ? '4px solid #c8a030' : '1px solid rgba(200,160,48,0.1)',
                  borderRadius: 10, padding: '14px 16px',
                }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 8 }}>{h2hData.p2.toUpperCase()} WINS</div>
                  <div style={{ fontFamily: FONT_HEADER, fontSize: 28, color: '#f0e6d3', lineHeight: 1 }}>{h2hData.p2RaceWins}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#556', marginTop: 4 }}>{p2Pct}%</div>
                </div>
              </div>

              {/* Per-ACT breakdown */}
              <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 8 }}>
                SHARED ACTS ({h2hData.actRows.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 360 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', background: 'rgba(200,160,48,0.08)', borderRadius: '6px 6px 0 0', padding: '6px 10px', borderBottom: '1px solid rgba(200,160,48,0.15)' }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#8090a0', letterSpacing: 2 }}>ACT</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#8090a0', textAlign: 'center', letterSpacing: 1 }}>{h2hData.p1.split(' ')[0].toUpperCase()} PTS</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#8090a0', textAlign: 'center', letterSpacing: 1 }}>{h2hData.p2.split(' ')[0].toUpperCase()} PTS</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#8090a0', textAlign: 'right', letterSpacing: 1 }}>W-L</span>
                  </div>
                  {[...h2hData.actRows].sort((a, b) => b.act.date.localeCompare(a.act.date)).map(({ act, p1TotalPts, p2TotalPts, p1RaceWins, p2RaceWins }, i) => (
                    <div
                      key={act.id || act._id}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px', padding: '8px 10px', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.03)', alignItems: 'center' }}
                    >
                      <div>
                        <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#c8bfa8' }}>{act.name}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445', marginLeft: 6 }}>{act.date}</span>
                      </div>
                      <span style={{ fontFamily: FONT_HEADER, fontSize: 15, color: p1TotalPts > p2TotalPts ? '#f0e6d3' : '#556', textAlign: 'center' }}>{p1TotalPts}</span>
                      <span style={{ fontFamily: FONT_HEADER, fontSize: 15, color: p2TotalPts > p1TotalPts ? '#f0e6d3' : '#556', textAlign: 'center' }}>{p2TotalPts}</span>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: p1RaceWins > p2RaceWins ? '#50fa7b' : p2RaceWins > p1RaceWins ? '#e94560' : '#445', textAlign: 'right' }}>
                        {p1RaceWins}–{p2RaceWins}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

