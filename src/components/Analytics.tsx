import { useState } from 'react';
import { computeStats } from '../utils/elo';
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
      p.eloHistory.forEach((h) => {
        if (h.date) allDates.push(h.date);
      });
    }
  });
  const uniqueDates = [...new Set(allDates)].sort();

  let minE = 9999;
  let maxE = 0;
  const lines = selected.map((name, ni) => {
    const p = stats.find((s) => s.name === name);
    const hist = p?.eloHistory ?? [];
    const pts: { date: string; elo: number; idx: number }[] = [];
    let curElo = 1000;
    uniqueDates.forEach((date, di) => {
      const entry = hist.find((h) => h.date === date) ?? null;
      if (entry) curElo = Math.round(entry.elo);
      pts.push({ date, elo: curElo, idx: di });
      if (curElo < minE) minE = curElo;
      if (curElo > maxE) maxE = curElo;
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
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
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
                line.pts.forEach((pt, i) => {
                  d += (i === 0 ? 'M' : 'L') + scaleX(i) + ',' + scaleY(pt.elo);
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
                  return pt ? (
                    <circle
                      key={line.name}
                      cx={scaleX(hoverPt.idx)}
                      cy={scaleY(pt.elo)}
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
                  return pt ? (
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
              const first = line.pts[0];
              const diff = last ? last.elo - (first?.elo ?? 0) : 0;
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
    </div>
  );
}
