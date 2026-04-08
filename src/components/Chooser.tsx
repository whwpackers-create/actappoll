import { useState, useEffect } from 'react';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { AppData } from '../types';
import type { PlayerStats } from '../types';

interface ChooserProps {
  setView: (v: string) => void;
  data: AppData;
  stats: PlayerStats[];
}

const TC4 = ['#e94560', '#f5a623', '#50fa7b', '#8be9fd'];
const teamNames = ['Team 1', 'Team 2', 'Team 3', 'Team 4'];
const ordinalLabels = ['1st Pick', '2nd Pick', '3rd Pick', '4th Pick'];

// ─── Team generation helpers ─────────────────────────────────────────────────

function variance(vals: number[]): number {
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return vals.reduce((a, b) => a + (b - mean) ** 2, 0);
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.filter((_, j) => j !== i);
    for (const p of permutations(rest)) result.push([arr[i], ...p]);
  }
  return result;
}

function generateTeams(
  playerNames: string[],
  format: '8man' | '12man' | '16man',
  eloMap: Record<string, number>
): { name: string; players: { seed: number; name: string; elo: number; slot: string }[]; total: number }[] {
  const getElo = (name: string) => eloMap[name] ?? 5000;

  // Sort by ELO descending to assign seeds
  const sorted = [...playerNames].sort((a, b) => getElo(b) - getElo(a));

  if (format === '8man') {
    // Optimize: try all 24 pairings of top-4 (0-3) with bottom-4 (4-7)
    // Each top seed is always slot A, each bottom seed is slot B
    const bottom = [4, 5, 6, 7];
    let bestPerm8 = bottom;
    let bestVar8 = Infinity;
    for (const perm of permutations(bottom)) {
      const totals = [0, 1, 2, 3].map((ai, ti) => getElo(sorted[ai]) + getElo(sorted[perm[ti]]));
      const v = variance(totals);
      if (v < bestVar8) { bestVar8 = v; bestPerm8 = perm; }
    }
    return [0, 1, 2, 3].map((ai, ti) => {
      const bi = bestPerm8[ti];
      const a = sorted[ai];
      const b = sorted[bi];
      return {
        name: teamNames[ti],
        players: [
          { seed: ai + 1, name: a, elo: getElo(a), slot: 'A' },
          { seed: bi + 1, name: b, elo: getElo(b), slot: 'B' },
        ],
        total: getElo(a) + getElo(b),
      };
    });
  }

  if (format === '12man') {
    // Seeds 3+10, 4+9 are fixed. Seeds 1 and 2 can swap between 11 and 12
    // to account for unequal skill gaps at the bottom. Try both assignments.
    // Middle seeds (5-8) optimized across all 4 teams via permutations.
    const midSeeds = [4, 5, 6, 7];

    const tryAnchors = (top2bottom: [number, number][]): { anchors: [number, number][]; perm: number[]; v: number } => {
      const anchors: [number, number][] = [top2bottom[0], top2bottom[1], [2, 9], [3, 8]];
      let bestPerm = midSeeds;
      let bestVar = Infinity;
      for (const perm of permutations(midSeeds)) {
        const totals = anchors.map(([ai, bi], ti) =>
          getElo(sorted[ai]) + getElo(sorted[bi]) + getElo(sorted[perm[ti]])
        );
        const v = variance(totals);
        if (v < bestVar) { bestVar = v; bestPerm = perm; }
      }
      return { anchors, perm: bestPerm, v: bestVar };
    };

    const optionA = tryAnchors([[0, 11], [1, 10]]); // 1+12, 2+11
    const optionB = tryAnchors([[0, 10], [1, 11]]); // 1+11, 2+12
    const { anchors, perm: bestPerm } = optionA.v <= optionB.v ? optionA : optionB;

    return anchors.map(([ai, bi], ti) => {
      const a = sorted[ai];
      const b = sorted[bi];
      const m = sorted[bestPerm[ti]];
      return {
        name: teamNames[ti],
        players: [
          { seed: ai + 1, name: a, elo: getElo(a), slot: 'A' },
          { seed: bi + 1, name: b, elo: getElo(b), slot: 'C' },
          { seed: bestPerm[ti] + 1, name: m, elo: getElo(m), slot: 'B' },
        ].sort((x, y) => x.seed - y.seed),
        total: getElo(a) + getElo(b) + getElo(m),
      };
    });
  }

  // 16-man: snake draft across 4 brackets of 4
  // Bracket 1: 1-4 → teams 1,2,3,4
  // Bracket 2: 5-8 → teams 4,3,2,1 (snake)
  // Bracket 3: 9-12 → teams 1,2,3,4
  // Bracket 4: 13-16 → teams 4,3,2,1 (snake)
  const assignments: number[][] = [[], [], [], []]; // per team
  const slots = ['A', 'B', 'C', 'D'];
  for (let bracket = 0; bracket < 4; bracket++) {
    const base = bracket * 4;
    const order = bracket % 2 === 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    order.forEach((teamIdx, pos) => assignments[teamIdx].push(base + pos));
  }
  return assignments.map((idxs, ti) => ({
    name: teamNames[ti],
    players: idxs
      .sort((a, b) => a - b)
      .map((si, slotIdx) => ({
        seed: si + 1,
        name: sorted[si],
        elo: getElo(sorted[si]),
        slot: slots[slotIdx],
      })),
    total: idxs.reduce((s, si) => s + getElo(sorted[si]), 0),
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function Chooser({ setView, data, stats }: ChooserProps) {
  const [tab, setTab] = useState<'picker' | 'generator'>('picker');

  // ── Pick Order state ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'revealing' | 'done'>('ready');
  const [order, setOrder] = useState<number[]>([]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // ── Generator state ───────────────────────────────────────────────────────
  const [format, setFormat] = useState<'8man' | '12man' | '16man'>('8man');
  const playerCount = format === '16man' ? 16 : format === '12man' ? 12 : 8;
  const [names, setNames] = useState<string[]>(Array(16).fill(''));
  const [result, setResult] = useState<ReturnType<typeof generateTeams> | null>(null);
  const [genError, setGenError] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  const rosterNames = data.players
    .filter(p => p.active !== false)
    .map(p => p.name)
    .sort();

  const eloMap = Object.fromEntries(stats.map(s => [s.name, Math.round(s.elo)]));

  const setName = (i: number, val: string) => {
    setNames(prev => { const n = [...prev]; n[i] = val; return n; });
    setResult(null);
    setGenError('');
  };

  const generate = () => {
    const filled = names.slice(0, playerCount).map(n => n.trim()).filter(Boolean);
    if (filled.length !== playerCount) {
      setGenError(`Please fill in all ${playerCount} player names.`);
      return;
    }
    const dupes = filled.filter((n, i) => filled.indexOf(n) !== i);
    if (dupes.length > 0) {
      setGenError(`Duplicate names: ${[...new Set(dupes)].join(', ')}`);
      return;
    }
    setGenError('');
    setResult(generateTeams(filled, format, eloMap));
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
      ← Back
    </button>
  );

  // ── Pick Order effects ────────────────────────────────────────────────────
  const startChoosing = () => {
    const shuffled = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setOrder(shuffled);
    setRevealIdx(0);
    setPhase('countdown');
    setCountdown(3);
  };

  useEffect(() => {
    if (phase === 'countdown' && countdown !== null && countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
    if (phase === 'countdown' && countdown === 0) setPhase('revealing');
  }, [phase, countdown]);

  const revealNext = () => {
    if (revealIdx < order.length - 1) setRevealIdx(revealIdx + 1);
    else setPhase('done');
  };

  // ── Shared tab bar ────────────────────────────────────────────────────────
  const tabBar = (
    <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(200,160,48,0.2)' }}>
      {([['picker', '🎲 Pick Order'], ['generator', '⚖️ Team Generator']] as const).map(([t, label]) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          style={{
            flex: 1,
            padding: '10px 0',
            fontFamily: FONT_HEADER,
            fontSize: 13,
            letterSpacing: 1,
            cursor: 'pointer',
            border: 'none',
            background: tab === t ? 'rgba(200,160,48,0.18)' : 'rgba(255,255,255,0.02)',
            color: tab === t ? '#c8a030' : '#556',
            borderRight: t === 'picker' ? '1px solid rgba(200,160,48,0.2)' : 'none',
            transition: 'background 0.15s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%' }}>
      {backBtn}

      <div style={{ background: 'rgba(12,14,22,0.75)', border: '1px solid #2a3040', borderRadius: 10, padding: 24 }}>
        <div style={{ fontFamily: FONT_HEADER, fontSize: 22, color: '#f0e6d3', letterSpacing: 3, marginBottom: 16, textAlign: 'center' }}>
          ACT SETUP
        </div>

        {tabBar}

        {/* ── Tab: Pick Order ── */}
        {tab === 'picker' && (() => {
          if (phase === 'ready') return (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🎲</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#667', marginBottom: 24 }}>
                Randomizes character pick order for Teams 1–4
              </div>
              <button onClick={startChoosing} style={{ display: 'block', width: '100%', padding: '18px 0', cursor: 'pointer', background: 'rgba(180,160,60,0.08)', border: '2px solid #c0a840', borderRadius: 6, fontFamily: FONT_HEADER, fontSize: 22, color: '#e0d080', letterSpacing: 1 }}>
                Randomize 🎲
              </button>
            </div>
          );

          if (phase === 'countdown') return (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontFamily: FONT_HEADER, fontSize: 80, color: '#f5a623', textShadow: '0 0 40px rgba(245,166,35,0.3)' }}>{countdown}</div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: '#667', marginTop: 8 }}>Get ready...</div>
            </div>
          );

          return (
            <>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontFamily: FONT_HEADER, fontSize: 20, color: '#fff', letterSpacing: 2 }}>PICK ORDER</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {order.map((teamIdx, i) => {
                  const revealed = i <= revealIdx;
                  const isCurrent = i === revealIdx && phase === 'revealing';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: revealed ? (isCurrent ? 'rgba(245,166,35,0.12)' : 'rgba(80,250,123,0.05)') : 'rgba(255,255,255,0.02)', border: revealed ? (isCurrent ? '2px solid #f5a623' : '1px solid rgba(80,250,123,0.2)') : '1px solid rgba(255,255,255,0.04)', borderRadius: 8, transform: isCurrent ? 'scale(1.03)' : 'scale(1)', transition: 'all 0.3s ease' }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: revealed ? TC4[teamIdx] + '22' : 'rgba(255,255,255,0.03)', border: '2px solid ' + (revealed ? TC4[teamIdx] : 'rgba(255,255,255,0.06)') }}>
                        <span style={{ fontFamily: FONT_HEADER, fontSize: 18, color: revealed ? TC4[teamIdx] : '#333' }}>{i + 1}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: revealed ? '#889' : '#333', letterSpacing: 1, marginBottom: 2 }}>{ordinalLabels[i]}</div>
                        <div style={{ fontFamily: FONT_HEADER, fontSize: 24, color: revealed ? TC4[teamIdx] : '#222', transition: 'all 0.3s ease' }}>{revealed ? teamNames[teamIdx] : '???'}</div>
                      </div>
                      {isCurrent && <div style={{ fontSize: 26 }}>👈</div>}
                      {revealed && !isCurrent && <div style={{ fontSize: 20, color: '#50fa7b' }}>✓</div>}
                    </div>
                  );
                })}
              </div>
              {phase === 'revealing' && (
                <button onClick={revealNext} style={{ display: 'block', width: '100%', padding: '16px 0', textAlign: 'center', cursor: 'pointer', background: 'rgba(245,166,35,0.1)', border: '2px solid #f5a623', borderRadius: 6, fontFamily: FONT_HEADER, fontSize: 20, color: '#f5a623', letterSpacing: 1 }}>
                  {revealIdx < order.length - 1 ? 'Reveal Next 🎲' : 'Reveal Last! 🏁'}
                </button>
              )}
              {phase === 'done' && (
                <button onClick={startChoosing} style={{ display: 'block', width: '100%', padding: '16px 0', textAlign: 'center', cursor: 'pointer', background: 'rgba(80,250,123,0.08)', border: '2px solid rgba(80,250,123,0.3)', borderRadius: 6, fontFamily: FONT_HEADER, fontSize: 18, color: '#50fa7b', letterSpacing: 1 }}>
                  Reshuffle 🔄
                </button>
              )}
            </>
          );
        })()}

        {/* ── Tab: Team Generator ── */}
        {tab === 'generator' && (
          <div>
            {/* Format selector */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {(['8man', '12man', '16man'] as const).map(f => (
                <button key={f} onClick={() => { setFormat(f); setResult(null); setGenError(''); }} style={{ flex: 1, padding: '10px 0', fontFamily: FONT_HEADER, fontSize: 13, letterSpacing: 1, cursor: 'pointer', border: `2px solid ${format === f ? '#c8a030' : 'rgba(200,160,48,0.2)'}`, borderRadius: 8, background: format === f ? 'rgba(200,160,48,0.15)' : 'rgba(255,255,255,0.02)', color: format === f ? '#c8a030' : '#556' }}>
                  {f === '8man' ? '8-Man' : f === '12man' ? '12-Man' : '16-Man'}
                </button>
              ))}
            </div>

            {/* Format hint */}
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#445', marginBottom: 16, lineHeight: 1.6 }}>
              {format === '8man' && 'Optimized pairings: top 4 matched with bottom 4 for lowest ELO variance across teams.'}
              {format === '12man' && 'Seeds 3+10, 4+9 fixed. Seeds 1 & 2 swap with 11/12 if it balances better. Middle (5–8) optimized.'}
              {format === '16man' && 'Snake draft across 4 brackets: 1+8+9+16, 2+7+10+15, 3+6+11+14, 4+5+12+13'}
            </div>

            {/* Player name inputs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 16 }}>
              {Array.from({ length: playerCount }, (_, i) => {
                const val = names[i] ?? '';
                const suggestions = val.trim().length > 0
                  ? rosterNames.filter(n => n.toLowerCase().includes(val.toLowerCase()) && n !== val).slice(0, 6)
                  : [];
                const isOpen = activeDropdown === i && suggestions.length > 0;
                return (
                  <div key={i} style={{ position: 'relative' }}>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445', marginBottom: 3 }}>
                      Player {i + 1}
                      {eloMap[names[i]?.trim()] && (
                        <span style={{ color: '#60a5fa', marginLeft: 4 }}>{eloMap[names[i].trim()]} VR</span>
                      )}
                    </div>
                    <input
                      value={val}
                      onChange={e => { setName(i, e.target.value); setActiveDropdown(i); }}
                      onFocus={() => setActiveDropdown(i)}
                      onBlur={() => setTimeout(() => setActiveDropdown(null), 150)}
                      placeholder={`Player ${i + 1}`}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: 'rgba(255,255,255,0.04)',
                        border: `1px solid ${val.trim() ? 'rgba(200,160,48,0.3)' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: isOpen ? '6px 6px 0 0' : 6,
                        padding: '8px 10px',
                        fontFamily: FONT_HEADER,
                        fontSize: 13,
                        color: '#f0e6d3',
                        outline: 'none',
                      }}
                    />
                    {isOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: '#0f1420',
                        border: '1px solid rgba(200,160,48,0.2)',
                        borderTop: 'none',
                        borderRadius: '0 0 6px 6px',
                        overflow: 'hidden',
                      }}>
                        {suggestions.map(n => (
                          <div
                            key={n}
                            onMouseDown={() => { setName(i, n); setActiveDropdown(null); }}
                            style={{
                              padding: '7px 10px', cursor: 'pointer',
                              fontFamily: FONT_HEADER, fontSize: 13, color: '#c8bfa8',
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                            }}
                            onMouseOver={e => (e.currentTarget.style.background = 'rgba(200,160,48,0.1)')}
                            onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
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

            {genError && (
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#e94560', marginBottom: 12 }}>{genError}</div>
            )}

            <button
              onClick={generate}
              style={{ display: 'block', width: '100%', padding: '14px 0', cursor: 'pointer', background: 'rgba(200,160,48,0.12)', border: '2px solid #c8a030', borderRadius: 8, fontFamily: FONT_HEADER, fontSize: 18, color: '#c8a030', letterSpacing: 2, marginBottom: 24 }}
            >
              ⚖️ Generate Fair Teams
            </button>

            {/* Results */}
            {result && (
              <div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#445', letterSpacing: 2, marginBottom: 12 }}>
                  SUGGESTED TEAMS
                  <span style={{ marginLeft: 10, color: '#556', letterSpacing: 0 }}>
                    — range: {Math.max(...result.map(t => t.total)) - Math.min(...result.map(t => t.total))} VR difference
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {result.map((team, ti) => (
                    <div key={ti} style={{ background: 'rgba(255,255,255,0.02)', border: `2px solid ${TC4[ti]}66`, borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontFamily: FONT_HEADER, fontSize: 16, color: TC4[ti], marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {team.name}
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#556' }}>{team.total} VR</span>
                      </div>
                      {team.players.map((pl, pi) => (
                        <div key={pi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: pi < team.players.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: TC4[ti], minWidth: 14 }}>{pl.slot}</span>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445', minWidth: 16 }}>#{pl.seed}</span>
                          <span style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#e0e4ea', flex: 1 }}>{pl.name}</span>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#60a5fa' }}>{pl.elo}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
