import { useState } from 'react';
import { computeStats } from '../utils/elo';
import type { AppData } from '../types';
import type { AuthState } from '../hooks/useAuth';
import type { PlayerStats } from '../types';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';

interface DashboardProps {
  data: AppData;
  setView: (v: string) => void;
  setSelAct?: (id: string | null) => void;
  setSelSat?: (id: string | null) => void;
  auth: AuthState;
  onTheme: () => void;
  menuImgs: Record<string, string>;
}

function countSatWins(sats: AppData['sats'], playerName: string): number {
  let w = 0;
  sats.forEach((s) => {
    if (s.placements?.winner) {
      s.placements.winner.forEach((t) => {
        if (
          (t.members ?? []).includes(playerName) ||
          (t.subs ?? []).includes(playerName)
        ) {
          w++;
        }
      });
    }
  });
  return w;
}

function mkBar(
  label: string,
  onClick: () => void,
  selected: boolean,
  Fh: string
) {
  return (
    <button
      onClick={onClick}
      onMouseOver={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#b8a040';
          e.currentTarget.style.background = 'rgba(180,160,60,0.06)';
        }
      }}
      onMouseOut={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#6a6040';
          e.currentTarget.style.background = 'transparent';
        }
      }}
      style={{
        display: 'block',
        width: '100%',
        padding: '16px 0',
        textAlign: 'center',
        cursor: 'pointer',
        background: selected ? 'rgba(180,160,60,0.08)' : 'transparent',
        border: selected ? '2px solid #c0a840' : '2px solid #6a6040',
        borderRadius: 4,
        position: 'relative',
        boxShadow: selected
          ? '0 0 12px rgba(180,160,60,0.15), inset 0 0 20px rgba(180,160,60,0.04)'
          : 'none',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      <span
        style={{
          fontFamily: Fh,
          fontSize: 22,
          fontWeight: 900,
          color: selected ? '#e8e0c0' : '#c0c4cc',
          letterSpacing: 1,
          textShadow: '0 2px 4px rgba(0,0,0,0.6)',
        }}
      >
        {label}
      </span>
    </button>
  );
}

function menuImgLayer(
  key: string,
  menuImgs: Record<string, string>
): React.ReactNode {
  const img = menuImgs['mi_' + key];
  if (!img) return null;
  const zm = parseInt(menuImgs['mz_' + key] ?? '100') || 100;
  const px = parseInt(menuImgs['mx_' + key] ?? '50') || 50;
  const py = parseInt(menuImgs['mp_' + key] ?? '50') || 50;
  const mc = parseInt(menuImgs['mc_' + key] ?? '0') || 0;
  const mb = parseInt(menuImgs['mb_' + key] ?? '0') || 0;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${img})`,
          backgroundSize: zm + '%',
          backgroundPosition: px + '% ' + py + '%',
          backgroundRepeat: 'no-repeat',
          clipPath: `inset(${mc}% 0 ${mb}% 0)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.4)',
        }}
      />
    </>
  );
}

export function Dashboard({
  data,
  setView,
  auth,
  onTheme,
  menuImgs,
}: DashboardProps) {
  const stats = computeStats(data.players, data.acts, data.sats ?? []);
  const activePlayers = data.players
    .filter((p) => p.active !== false)
    .map((p) => p.name);
  const [sortBy, setSortBy] = useState('elo');
  const [filterStatus, setFilterStatus] = useState('active');

  let filtered: PlayerStats[] = [...stats];
  if (filterStatus === 'active')
    filtered = filtered.filter((s) => activePlayers.includes(s.name));
  else if (filterStatus === 'inactive')
    filtered = filtered.filter((s) => !activePlayers.includes(s.name));
  filtered.sort((a, b) => {
    if (sortBy === 'elo') return b.elo - a.elo;
    if (sortBy === 'points') return b.pts - a.pts;
    if (sortBy === 'wins') return b.wins - a.wins;
    if (sortBy === 'acts') return b.actCount - a.actCount;
    if (sortBy === 'avg')
      return (b.actCount ? b.pts / b.actCount : 0) - (a.actCount ? a.pts / a.actCount : 0);
    if (sortBy === 'winrate')
      return (b.actCount ? b.wins / b.actCount : 0) - (a.actCount ? a.wins / a.actCount : 0);
    if (sortBy === 'jerseyswap') return (b.jerseySwaps ?? 0) - (a.jerseySwaps ?? 0);
    if (sortBy === '30d') return (b.change30d ?? 0) - (a.change30d ?? 0);
    return b.elo - a.elo;
  });

  const totalActive = activePlayers.length;
  const selS = {
    background: '#181c24',
    border: '2px solid #6a6040',
    borderRadius: 4,
    padding: '4px 8px',
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: '#aab',
    cursor: 'pointer',
    outline: 'none' as const,
  };

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '0 16px',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <div
        className="stat-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4,1fr)',
          gap: 0,
          marginBottom: 20,
          border: '2px solid #6a6040',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {[
          { icon: '👥', val: totalActive, label: 'Active Players' },
          {
            icon: '🎓',
            val: data.players.filter((p) => p.active === false).length,
            label: 'Inactive Players',
          },
          { icon: '🏁', val: data.acts.length, label: 'Total ACTs' },
          {
            icon: '🍺',
            val: (data.acts.length * 64).toLocaleString(),
            label: 'Beers Drank',
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              background: 'rgba(15,18,25,0.7)',
              backdropFilter: 'blur(4px)',
              borderRight: i < 3 ? '1px solid rgba(106,96,64,0.3)' : 'none',
              padding: '14px 16px',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
              <div
                style={{
                  fontFamily: FONT_HEADER,
                  fontSize: 26,
                  color: '#fff',
                  textShadow: '0 2px 6px rgba(0,0,0,0.5)',
                }}
              >
                {s.val}
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 8,
                  color: '#667',
                  letterSpacing: 1.5,
                  marginTop: 2,
                }}
              >
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="dash-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 240px',
          gap: 16,
        }}
      >
        <div
          style={{
            background: 'rgba(12,14,22,0.75)',
            backdropFilter: 'blur(4px)',
            border: '2px solid #6a6040',
            borderRadius: 8,
            padding: 16,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 14 }}>🏅</span>
                <span
                  style={{
                    fontFamily: FONT_HEADER,
                    fontSize: 18,
                    color: '#fff',
                    letterSpacing: 2,
                    textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                  }}
                >
                  PLAYER LEADERBOARD
                </span>
                <span
                  style={{
                    background: 'rgba(80,180,100,0.15)',
                    border: '1px solid rgba(80,180,100,0.25)',
                    borderRadius: 3,
                    padding: '1px 6px',
                    fontFamily: FONT_HEADER,
                    fontSize: 9,
                    color: '#5a8',
                  }}
                >
                  {filtered.length} PLAYERS
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#556' }}>
                  Sort By:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={selS}
                >
                  <option value="elo">ELO</option>
                  <option value="points">Points</option>
                  <option value="wins">Wins</option>
                  <option value="acts">ACTs</option>
                  <option value="avg">Avg Pts</option>
                  <option value="winrate">Win Rate</option>
                  <option value="jerseyswap">Jersey Swaps</option>
                  <option value="30d">30D Change</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#556' }}>
                  Status:
                </span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={selS}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All</option>
                </select>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 700,
                overflowY: 'auto',
              }}
            >
              {filtered.map((p, i) => {
                const rank = i + 1;
                const medal =
                  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                const avgPts = p.actCount ? (p.pts / p.actCount).toFixed(2) : '0';
                const winRate = p.actCount
                  ? (p.wins / p.actCount * 100).toFixed(1)
                  : '0';
                const jsRate = p.actCount
                  ? (((p.jerseySwaps ?? 0) / p.actCount) * 100).toFixed(1)
                  : '0';
                const ch30 = p.change30d ?? 0;
                const satWins = countSatWins(data.sats ?? [], p.name);

                return (
                  <div
                    key={p.name}
                    className="lb-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '46px 1fr auto',
                      gap: 6,
                      alignItems: 'center',
                      padding: '10px 14px',
                      background:
                        rank <= 3
                          ? 'linear-gradient(90deg,rgba(42,80,130,0.12) 0%,rgba(18,22,30,0.4) 100%)'
                          : 'rgba(18,22,30,0.3)',
                      border:
                        rank === 1
                          ? '1.5px solid rgba(180,160,60,0.4)'
                          : '1px solid rgba(106,96,64,0.15)',
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      {medal ? (
                        <div style={{ fontSize: 24 }}>{medal}</div>
                      ) : (
                        <div
                          style={{
                            fontFamily: FONT_HEADER,
                            fontSize: 16,
                            color: '#4a5a6a',
                          }}
                        >
                          #{rank}
                        </div>
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 18,
                          color: '#e0e4ea',
                          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        }}
                      >
                        {p.name}
                        {satWins > 0 && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: '#f5a623',
                              background: 'rgba(245,166,35,0.12)',
                              border: '1px solid rgba(245,166,35,0.25)',
                              borderRadius: 4,
                              padding: '1px 6px',
                            }}
                          >
                            🏆x{satWins}
                          </span>
                        )}
                        {!activePlayers.includes(p.name) && (
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
                          fontSize: 10,
                          color: '#556',
                          display: 'flex',
                          gap: 10,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span>{p.actCount} ACTs</span>
                        <span>{p.raceCount ?? 0} races</span>
                        <span>{avgPts} avg pts/ACT</span>
                        <span>{winRate}% win rate</span>
                        <span>{jsRate}% Jersey Swap</span>
                      </div>
                    </div>
                    <div
                      className="lb-stats"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(5,auto)',
                        gap: 14,
                        textAlign: 'right',
                      }}
                    >
                      {[
                        { l: 'ELO', v: Math.round(p.elo), c: '#e94560' },
                        {
                          l: '30D',
                          v: (ch30 > 0 ? '+' : '') + ch30,
                          c:
                            ch30 > 0 ? '#5a8' : ch30 < 0 ? '#e94560' : '#445',
                        },
                        { l: 'WINS', v: p.wins, c: '#ca8' },
                        { l: 'PTS', v: p.pts, c: '#5a8' },
                        {
                          l: 'JS',
                          v: p.jerseySwaps ?? 0,
                          c: '#a7c',
                        },
                      ].map((c, ci) => (
                        <div key={ci}>
                          <div
                            style={{
                              fontFamily: FONT_MONO,
                              fontSize: 8,
                              color: '#445',
                              letterSpacing: 1,
                            }}
                          >
                            {c.l}
                          </div>
                          <div
                            style={{
                              fontFamily: FONT_HEADER,
                              fontSize: 16,
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
          </div>
        </div>

        <div
          className="dash-menu"
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
        >
          <div
            style={{
              position: 'relative',
              borderRadius: 4,
              overflow: 'hidden',
              minHeight: 0,
            }}
          >
            {menuImgLayer('newact', menuImgs)}
            {auth.unlocked &&
              mkBar('New ACT', () => setView('newact'), true, FONT_HEADER)}
          </div>
          {auth.unlocked && mkBar('Customize 🎨', onTheme, false, FONT_HEADER)}
          {['history', 'roster', 'seasons', 'sat', 'chooser', 'analytics'].map(
            (key) => (
              <div
                key={key}
                style={{
                  position: 'relative',
                  borderRadius: 4,
                  overflow: 'hidden',
                  minHeight: 0,
                }}
              >
                {menuImgLayer(key, menuImgs)}
                {mkBar(
                  key === 'roster' ? 'Roster' : key === 'analytics' ? 'Elo Analytics' : key.charAt(0).toUpperCase() + key.slice(1),
                  () =>
                    setView(
                      key === 'roster' ? 'players' : key === 'analytics' ? 'analytics' : key
                    ),
                  false,
                  FONT_HEADER
                )}
              </div>
            )
          )}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 100,
              position: 'relative',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {menuImgs['mi_trophy'] ? (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundImage: `url(${menuImgs['mi_trophy']})`,
                  backgroundSize: `${parseInt(menuImgs['mz_trophy'] ?? '100') || 100}%`,
                  backgroundPosition: `${parseInt(menuImgs['mx_trophy'] ?? '50') || 50}% ${parseInt(menuImgs['mp_trophy'] ?? '50') || 50}%`,
                  backgroundRepeat: 'no-repeat',
                }}
              />
            ) : (
              <div
                style={{
                  fontSize: 72,
                  filter:
                    'drop-shadow(0 8px 16px rgba(0,0,0,0.6)) drop-shadow(0 0 30px rgba(200,170,60,0.15))',
                  opacity: 0.7,
                }}
              >
                🏆
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div
          style={{
            height: 2,
            background:
              'linear-gradient(180deg,#666a74 0%,#8a8e9a 50%,#666a74 100%)',
          }}
        />
        <div
          style={{
            background:
              'linear-gradient(180deg,#c8ccd8 0%,#a0a4b0 50%,#888c98 100%)',
            height: 8,
            marginTop: 1,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            textAlign: 'right',
            padding: '4px 0',
            fontFamily: FONT_MONO,
            fontSize: 9,
            color: '#556',
            fontStyle: 'italic',
          }}
        >
          A four-cup race for first place!
        </div>
      </div>
    </div>
  );
}
