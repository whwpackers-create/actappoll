import { useState, useMemo } from 'react';
import { computeStats, computeSeasonElos, computeAllElos, getSeasonRank, SEASON_RANKED_THRESHOLD } from '../utils/VR';
import { PRESETS } from '../constants';
import type { AppData, Act, Sat } from '../types';
import type { PlayerStats } from '../types';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';

const TIERS = [
  { name: 'Copper',   min: 0,    max: 4900, color: '#b45309', icon: '🪙' },
  { name: 'Bronze',   min: 4900, max: 5200, color: '#cd7f32', icon: '🥉' },
  { name: 'Silver',   min: 5200, max: 5500, color: '#94a3b8', icon: '🥈' },
  { name: 'Gold',     min: 5500, max: 5900, color: '#fbbf24', icon: '🥇' },
  { name: 'Platinum', min: 5900, max: 6500, color: '#60a5fa', icon: '💎' },
  { name: 'Diamond',  min: 6500, max: Infinity, color: '#c084fc', icon: '💠' },
];

function getTier(elo: number) {
  return TIERS.find((t) => elo >= t.min && elo < t.max) ?? TIERS[0];
}

function getPlayerFinishes(name: string, acts: Act[]) {
  const counts = [0, 0, 0, 0]; // 1st, 2nd, 3rd, 4th
  for (const act of acts) {
    let activeName = name;
    for (const team of act.teams ?? []) {
      const idx = (team.members ?? []).indexOf(name);
      if (idx !== -1) { activeName = team.subs?.[idx] || name; break; }
    }
    for (const race of act.races ?? []) {
      const sorted = [...(race.results ?? [])].sort((a, b) => b.points - a.points);
      const pos = sorted.findIndex((r) => r.player === activeName);
      if (pos === -1) continue;
      counts[Math.min(pos, 3)]++;
    }
  }
  return counts;
}

function getSatPlacements(name: string, sats: Sat[]) {
  const out: { satName: string; placement: string; date: string }[] = [];
  for (const sat of sats) {
    if (!sat.placements) continue;
    for (const [place, teams] of Object.entries(sat.placements)) {
      for (const team of teams) {
        if ((team.members ?? []).includes(name) || (team.subs ?? []).includes(name)) {
          out.push({ satName: sat.name, placement: place, date: sat.date });
        }
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

interface DashboardProps {
  data: AppData;
  setView: (v: string) => void;
  setSelAct?: (id: string | null) => void;
  setSelSat?: (id: string | null) => void;
  menuImgs: Record<string, string>;
}

// Wins that predate data collection — added manually
const MANUAL_SAT_WINS: Record<string, number> = {
  'Mcg': 1,
  'Nate Kim': 1,
};

// Pre-data SAT placements shown in player detail
const MANUAL_SAT_PLACEMENTS: Record<string, { satName: string; placement: string; date: string }[]> = {
  'Mcg': [{ satName: 'Spring 2023 SAT', placement: 'winner', date: '2023-05-01' }],
  'Nate Kim': [{ satName: 'Spring 2023 SAT', placement: 'winner', date: '2023-05-01' }],
};

function countSatWins(sats: AppData['sats'], playerName: string): number {
  let w = MANUAL_SAT_WINS[playerName] ?? 0;
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
          e.currentTarget.style.borderColor = '#5070a0';
          e.currentTarget.style.background = 'rgba(60,90,150,0.1)';
        }
      }}
      onMouseOut={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = '#2a3550';
          e.currentTarget.style.background = 'transparent';
        }
      }}
      style={{
        display: 'block',
        width: '100%',
        padding: '44px 0',
        textAlign: 'center',
        cursor: 'pointer',
        background: selected ? 'rgba(60,90,150,0.12)' : 'transparent',
        border: selected ? '2px solid #4a6898' : '2px solid #2a3550',
        borderRadius: 4,
        position: 'relative',
        boxShadow: selected
          ? '0 0 12px rgba(60,90,150,0.3), inset 0 0 20px rgba(60,90,150,0.06)'
          : 'none',
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      <span
        style={{
          fontFamily: Fh,
          fontSize: 26,
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
  const isGif = img.startsWith('data:image/gif');
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          overflow: 'hidden',
          clipPath: `inset(${mc}% 0 ${mb}% 0)`,
        }}
      >
        {isGif ? (
          /* <img> guarantees GIF animation on iOS Safari — background-image does not */
          <img
            src={img}
            alt=""
            style={{
              position: 'absolute',
              width: zm + '%',
              height: 'auto',
              top: py + '%',
              left: px + '%',
              transform: `translate(-${px}%, -${py}%)`,
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${img})`,
              backgroundSize: zm + '%',
              backgroundPosition: px + '% ' + py + '%',
              backgroundRepeat: 'no-repeat',
            }}
          />
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
        }}
      />
    </>
  );
}

export function Dashboard({
  data,
  setView,
  setSelSat,
  menuImgs,
}: DashboardProps) {
  const stats = useMemo(
    () => computeStats(data.players, data.acts, data.sats ?? [], data.seasons),
    [data.players, data.acts, data.sats, data.seasons]
  );
  const vrMap = useMemo(
    () => Object.fromEntries(stats.map((s) => [s.name, s.elo])),
    [stats]
  );
  const activePlayers = data.players
    .filter((p) => p.active !== false)
    .map((p) => p.name);
  const [sortBy, setSortBy] = useState('elo');
  const [filterStatus, setFilterStatus] = useState('active');
  const [selPlayer, setSelPlayer] = useState<string | null>(null);
  const [showEloInfo, setShowEloInfo] = useState(false);
  const [showCurrentSeason, setShowCurrentSeason] = useState(false);

  // Merge saved seasons with presets (same logic as Seasons.tsx)
  const allSeasons = useMemo(() => {
    const saved = data.seasons ?? [];
    const merged = [...saved];
    PRESETS.forEach(ps => {
      if (!merged.find(s => s.name === ps.name)) {
        merged.push({ ...ps, id: ps.name, isPreset: true } as typeof merged[0]);
      }
    });
    return merged.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [data.seasons]);

  // Determine current season (uses allSeasons so presets are included)
  const currentSeason = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return allSeasons.find(s => today >= s.startDate && today <= s.endDate) ?? null;
  }, [allSeasons]);

  // Compute current season VRs using the proper midpoint-start season engine
  const currentSeasonData = useMemo(() => {
    if (!currentSeason) return null;
    const allTimeAtStart = computeAllElos(
      data.players,
      data.acts.filter(a => new Date(a.date) < new Date(currentSeason.startDate))
    ).elos;
    return computeSeasonElos(data.players, data.acts, currentSeason, allTimeAtStart);
  }, [currentSeason, data.players, data.acts]);

  // Per-player season stats (acts, races, pts, wins, jersey swaps)
  const csStatsMap = useMemo(() => {
    if (!currentSeason) return {} as Record<string, { acts: number; races: number; pts: number; wins: number; js: number }>;
    const sActs = data.acts.filter(a => a.date >= currentSeason.startDate && a.date <= currentSeason.endDate);
    const map: Record<string, { acts: number; races: number; pts: number; wins: number; js: number }> = {};
    const ensure = (name: string) => { if (!map[name]) map[name] = { acts: 0, races: 0, pts: 0, wins: 0, js: 0 }; };
    sActs.forEach(act => {
      const sMap: Record<string, string> = {};
      act.teams.forEach(t => { t.members.forEach((m, i) => { if (t.subs?.[i]) sMap[m] = t.subs[i]; }); });
      const active = (name: string) => sMap[name] ?? name;
      // ACT participation
      const actPlayers = new Set<string>();
      act.teams.forEach(t => t.members.forEach(m => actPlayers.add(active(m))));
      act.races.forEach(r => r.results.forEach(res => { if (res.player) actPlayers.add(active(res.player)); }));
      actPlayers.forEach(name => { ensure(name); map[name].acts++; });
      // Race results
      act.races.forEach(r => {
        r.results.forEach(res => {
          const name = active(res.player);
          ensure(name);
          map[name].races++;
          map[name].pts += res.points;
        });
      });
      // ACT wins (jersey swaps = top-2 teams)
      const sortedTeams = [...act.teams].map(t => {
        const score = act.races.reduce((s, r) => {
          return s + r.results.filter(x => t.members.map(m => active(m)).includes(active(x.player))).reduce((ps, x) => ps + x.points, 0);
        }, 0);
        return { team: t, score };
      }).sort((a, b) => b.score - a.score);
      if (sortedTeams.length >= 2) {
        // Top 2 teams get jersey swap credit; top 1 gets win
        sortedTeams.slice(0, 2).forEach(({ team }, idx) => {
          team.members.forEach(m => {
            const name = active(m);
            ensure(name);
            map[name].js++;
            if (idx === 0) map[name].wins++;
          });
        });
      }
    });
    return map;
  }, [currentSeason, data.acts]);

  const csActCountMap = useMemo(() => {
    const m: Record<string, number> = {};
    Object.entries(csStatsMap).forEach(([n, s]) => { m[n] = s.acts; });
    return m;
  }, [csStatsMap]);

  // Build lookup for current season ELO — only players who actually played ≥1 act
  const csEloMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (currentSeasonData) {
      Object.entries(currentSeasonData.seasonElos).forEach(([name, elo]) => {
        // Only include if they have history entries (played at least 1 act this season)
        if ((currentSeasonData.seasonHistory[name] ?? []).length > 0) {
          map[name] = Math.round(elo);
        }
      });
    }
    return map;
  }, [currentSeasonData]);

  // Rank movement: compare each player's current rank vs 30 days ago,
  // using only ACTIVE players so the comparison pool matches the default leaderboard view
  const rankMovement30d = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const activeStats = stats.filter(ps => activePlayers.includes(ps.name));
    const vr30ago: Record<string, number> = {};
    activeStats.forEach(ps => {
      const old = (ps.eloHistory ?? []).filter(h => h.date < cutoff);
      if (old.length > 0) vr30ago[ps.name] = old[old.length - 1].elo;
    });
    const oldSorted = activeStats
      .filter(ps => ps.name in vr30ago)
      .sort((a, b) => vr30ago[b.name] - vr30ago[a.name]);
    const oldRankMap: Record<string, number> = {};
    oldSorted.forEach((ps, i) => { oldRankMap[ps.name] = i + 1; });
    return oldRankMap;
  }, [stats, activePlayers]);

  let filtered: PlayerStats[] = [...stats];
  if (filterStatus === 'active')
    filtered = filtered.filter((s) => activePlayers.includes(s.name));
  else if (filterStatus === 'inactive')
    filtered = filtered.filter((s) => !activePlayers.includes(s.name));

  if (showCurrentSeason && currentSeasonData) {
    // In current season mode: only show players with season data, sorted by season ELO
    const csNames = new Set(Object.keys(csEloMap));
    filtered = filtered.filter(p => csNames.has(p.name));
    filtered.sort((a, b) => (csEloMap[b.name] ?? 0) - (csEloMap[a.name] ?? 0));
  } else {
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
  }

  const selPlayerStats = useMemo(() => {
    if (!selPlayer) return null;
    const ps = stats.find((s) => s.name === selPlayer);
    if (!ps) return null;
    const finishes = getPlayerFinishes(selPlayer, data.acts);
    const totalFinishes = finishes.reduce((a, b) => a + b, 0);
    const satPlacements = [
      ...(MANUAL_SAT_PLACEMENTS[selPlayer] ?? []),
      ...getSatPlacements(selPlayer, data.sats ?? []),
    ];
    const peakElo = ps.eloHistory.length > 0 ? Math.round(Math.max(...ps.eloHistory.map((h) => h.elo))) : Math.round(ps.elo);
    const lbRank = filtered.findIndex((p) => p.name === selPlayer) + 1;
    const seasonRanks = [...allSeasons]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map((season) => {
        // Compute proper season VRs using the same midpoint-start engine as the Seasons page
        const allTimeAtStart = computeAllElos(
          data.players,
          data.acts.filter(a => new Date(a.date) < new Date(season.startDate))
        ).elos;
        const sd = computeSeasonElos(data.players, data.acts, season, allTimeAtStart);
        const myVR = sd.seasonElos[selPlayer!];
        if (myVR == null) return null;
        // Per-player ACT count = length of their season history
        const myActCount = (sd.seasonHistory[selPlayer!] ?? []).length;
        // Build ranked list of all players who have season history
        const participants = Object.entries(sd.seasonElos)
          .filter(([name]) => (sd.seasonHistory[name] ?? []).length > 0)
          .map(([name, elo]) => ({ name, elo }));
        const sorted = [...participants].sort((a, b) => b.elo - a.elo);
        const rank = sorted.findIndex(s => s.name === selPlayer) + 1;
        if (rank === 0) return null;
        const seasonRankBadge = getSeasonRank(Math.round(myVR));
        const isUnrankedEntry = myActCount < SEASON_RANKED_THRESHOLD;
        return {
          seasonName: season.name,
          rank: isUnrankedEntry ? null : rank,
          total: sorted.filter((_, i) => {
            const n = sorted[i].name;
            return (sd.seasonHistory[n] ?? []).length >= SEASON_RANKED_THRESHOLD;
          }).length,
          elo: Math.round(myVR),
          actCount: myActCount,
          badge: seasonRankBadge,
          isUnranked: isUnrankedEntry,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    return { ps, finishes, totalFinishes, satPlacements, peakElo, lbRank, seasonRanks };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selPlayer, stats, data.acts, data.sats, allSeasons, data.players]);

  const totalActive = activePlayers.length;

  const activeStats = stats.filter((ps) => activePlayers.includes(ps.name));
  const biggestClimber = activeStats.reduce<PlayerStats | null>(
    (best, ps) => (!best || (ps.change30d ?? 0) > (best.change30d ?? 0) ? ps : best),
    null
  );
  const biggestLoser = activeStats.reduce<PlayerStats | null>(
    (worst, ps) => (!worst || (ps.change30d ?? 0) < (worst.change30d ?? 0) ? ps : worst),
    null
  );

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
    <>
    <div
      style={{
        width: '100%',
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
          marginBottom: 0,
          border: '2px solid #2a3550',
          borderRadius: '6px 6px 0 0',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {[
          {
            icon: (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="7" r="4"/>
                <path d="M5.5 21a8.38 8.38 0 0 1 13 0"/>
                <circle cx="7" cy="10" r="2.5"/>
                <path d="M2 20a5.6 5.6 0 0 1 5-3"/>
                <circle cx="17" cy="10" r="2.5"/>
                <path d="M22 20a5.6 5.6 0 0 0-5-3"/>
              </svg>
            ),
            val: totalActive,
            label: 'ACTIVE PLAYERS',
            color: '#60a5fa',
          },
          {
            icon: (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M6 20v-1a6 6 0 0 1 12 0v1"/>
                <path d="M9 12l1.5 1.5L15 9"/>
              </svg>
            ),
            val: data.players.filter((p) => p.active === false).length,
            label: 'RETIRED PLAYERS',
            color: '#94a3b8',
          },
          {
            icon: (
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="4" height="4" fill="#fbbf24" stroke="none"/>
                <rect x="7" y="3" width="4" height="4" fill="none" stroke="none" style={{fill:'rgba(251,191,36,0.2)'}}/>
                <rect x="11" y="3" width="4" height="4" fill="#fbbf24" stroke="none"/>
                <rect x="15" y="3" width="4" height="4" fill="none"/>
                <rect x="3" y="7" width="4" height="4" fill="none"/>
                <rect x="7" y="7" width="4" height="4" fill="#fbbf24" stroke="none"/>
                <rect x="11" y="7" width="4" height="4" fill="none"/>
                <rect x="15" y="7" width="4" height="4" fill="#fbbf24" stroke="none"/>
                <line x1="19" y1="3" x2="19" y2="11"/>
                <line x1="19" y1="14" x2="19" y2="21"/>
                <line x1="3" y1="21" x2="19" y2="21"/>
              </svg>
            ),
            val: data.acts.length,
            label: 'TOTAL ACTs',
            color: '#fbbf24',
          },
          (() => {
            const nextSat = (data.sats ?? [])
              .filter((s) => s.upcoming)
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
            const satLabel = nextSat ? nextSat.name.toUpperCase() : 'NO UPCOMING SAT';
            const satVal = nextSat ? new Date(nextSat.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—';
            const satId = nextSat ? (nextSat.id ?? nextSat._id ?? '') : null;
            return {
              icon: (
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f9a8d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H3.5a2.5 2.5 0 0 0 0 5H6"/>
                  <path d="M18 9h2.5a2.5 2.5 0 0 1 0 5H18"/>
                  <path d="M6 4h12v10a6 6 0 0 1-12 0V4z"/>
                  <path d="M9 21h6"/>
                  <path d="M12 18v3"/>
                </svg>
              ),
              val: satVal,
              label: satLabel,
              color: '#f9a8d4',
              satId,
            };
          })(),
        ].map((s, i) => (
          <div
            key={i}
            onClick={'satId' in s && s.satId ? () => { setSelSat?.(s.satId!); setView('sat'); } : undefined}
            style={{
              background: 'rgba(15,18,25,0.48)',
              backdropFilter: 'blur(4px)',
              borderRight: i < 3 ? `1px solid rgba(42,53,80,0.6)` : 'none',
              padding: '22px 20px',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
              cursor: 'satId' in s && s.satId ? 'pointer' : 'default',
            }}
          >
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ opacity: 0.85 }}>{s.icon}</div>
              <div
                style={{
                  fontFamily: FONT_HEADER,
                  fontSize: 38,
                  color: s.color,
                  textShadow: `0 2px 10px ${s.color}40`,
                  lineHeight: 1,
                }}
              >
                {s.val}
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  color: '#556',
                  letterSpacing: 2,
                  marginTop: 2,
                }}
              >
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Biggest climber / loser row — below stat cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 0,
          marginBottom: 20,
          borderLeft: '2px solid #2a3550',
          borderRight: '2px solid #2a3550',
          borderBottom: '2px solid #2a3550',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          overflow: 'hidden',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Biggest Climber */}
        <div
          style={{
            background: 'rgba(15,18,25,0.48)',
            backdropFilter: 'blur(4px)',
            borderRight: '1px solid rgba(42,53,80,0.6)',
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
              <polyline points="17 6 23 6 23 12"/>
            </svg>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#556', letterSpacing: 2 }}>BIGGEST CLIMBER (30D)</div>
          </div>
          {biggestClimber && (biggestClimber.change30d ?? 0) > 0 ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: FONT_HEADER, fontSize: 26, color: '#e8e0c0' }}>{biggestClimber.name}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 16, color: '#4ade80', fontWeight: 700 }}>+{biggestClimber.change30d}</span>
            </div>
          ) : (
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: '#556' }}>—</span>
          )}
        </div>
        {/* Biggest Loser */}
        <div
          style={{
            background: 'rgba(15,18,25,0.48)',
            backdropFilter: 'blur(4px)',
            padding: '18px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/>
              <polyline points="17 18 23 18 23 12"/>
            </svg>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#556', letterSpacing: 2 }}>BIGGEST LOSER (30D)</div>
          </div>
          {biggestLoser && (biggestLoser.change30d ?? 0) < 0 ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: FONT_HEADER, fontSize: 26, color: '#e8e0c0' }}>{biggestLoser.name}</span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 16, color: '#f87171', fontWeight: 700 }}>{biggestLoser.change30d}</span>
            </div>
          ) : (
            <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: '#556' }}>—</span>
          )}
        </div>
      </div>

      {/* Upcoming SAT heats */}
      {(() => {
        const upcomingSats = (data.sats ?? []).filter((s) => s.upcoming);
        if (upcomingSats.length === 0) return null;
        const sat = upcomingSats.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
        const teams = (sat.roster ?? []).map((t) => {
          const vr1 = vrMap[t.members[0]] ?? 5000;
          const vr2 = vrMap[t.members[1]] ?? 5000;
          return { ...t, avgVR: Math.round((vr1 + vr2) / 2), vr1, vr2 };
        }).sort((a, b) => b.avgVR - a.avgVR);
        if (teams.length === 0) return null;
        const NUM_HEATS = 6;
        const seededHeats: (typeof teams[0])[][] = Array.from({ length: NUM_HEATS }, () => []);
        teams.forEach((t, i) => {
          const round = Math.floor(i / NUM_HEATS);
          const pos = i % NUM_HEATS;
          const heatIdx = round % 2 === 0 ? pos : NUM_HEATS - 1 - pos;
          seededHeats[heatIdx].push(t);
        });
        const heatColors = ['#f9a8d4', '#8be9fd', '#50fa7b', '#f5a623', '#c084fc', '#fbbf24'];
        const satDate = new Date(sat.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
        return (
          <div style={{ marginBottom: 16, position: 'relative', zIndex: 1 }}>
            <div style={{ background: 'rgba(8,12,22,0.58)', backdropFilter: 'blur(4px)', border: '2px solid #2a3550', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f9a8d4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4M16 2v4M3 10h18M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>
                </svg>
                <span style={{ fontFamily: FONT_HEADER, fontSize: 18, color: '#f9a8d4', letterSpacing: 2 }}>UPCOMING SAT HEATS</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#8090a0', marginLeft: 4 }}>{sat.name} · {satDate}</span>
                <button
                  onClick={() => { setSelSat?.(sat.id ?? sat._id ?? ''); setView('sats'); }}
                  style={{ marginLeft: 'auto', background: 'rgba(249,168,212,0.1)', border: '1px solid rgba(249,168,212,0.25)', borderRadius: 4, padding: '3px 10px', fontFamily: FONT_MONO, fontSize: 10, color: '#f9a8d4', cursor: 'pointer', letterSpacing: 1 }}
                >
                  VIEW →
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {seededHeats.map((hTeams, hi) => {
                  if (hTeams.length === 0) return null;
                  const hColor = heatColors[hi] ?? '#f9a8d4';
                  const hAvg = Math.round(hTeams.reduce((s, t) => s + t.avgVR, 0) / hTeams.length);
                  return (
                    <div key={hi} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${hColor}33`, borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: hColor, letterSpacing: 2 }}>HEAT {hi + 1}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#556' }}>avg {hAvg}</span>
                      </div>
                      {hTeams.map((t, ti) => (
                        <div key={ti} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderTop: ti > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#e0d4c0' }}>
                            {t.members[0] && <span>{t.members[0].split(' ')[0]}</span>}
                            {t.members[1] && <span style={{ color: '#8090a0' }}> &amp; {t.members[1].split(' ')[0]}</span>}
                          </div>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#c8a030' }}>{t.avgVR}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      <div
        className="dash-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          gap: 16,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          style={{
            background: 'rgba(8,12,22,0.58)',
            backdropFilter: 'blur(4px)',
            border: '2px solid #2a3550',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H3.5a2.5 2.5 0 0 0 0 5H6"/>
                  <path d="M18 9h2.5a2.5 2.5 0 0 1 0 5H18"/>
                  <path d="M6 4h12v10a6 6 0 0 1-12 0V4z"/>
                  <path d="M9 21h6"/><path d="M12 18v3"/>
                </svg>
                <span
                  style={{
                    fontFamily: FONT_HEADER,
                    fontSize: 22,
                    color: '#ffffff',
                    letterSpacing: 3,
                    textShadow: '0 2px 10px rgba(255,255,255,0.4), 0 0 30px rgba(255,255,255,0.15)',
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
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {/* Tab: All-Time */}
                <button
                  onClick={() => setShowCurrentSeason(false)}
                  style={{
                    background: !showCurrentSeason ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${!showCurrentSeason ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '6px 0 0 6px',
                    padding: '6px 14px',
                    fontFamily: FONT_HEADER,
                    fontSize: 11,
                    color: !showCurrentSeason ? '#60a5fa' : '#445',
                    cursor: 'pointer',
                    letterSpacing: 1,
                  }}
                >
                  ALL-TIME
                </button>
                {/* Tab: Current Season */}
                <button
                  onClick={() => setShowCurrentSeason(true)}
                  disabled={!currentSeason}
                  style={{
                    background: showCurrentSeason ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${showCurrentSeason ? 'rgba(96,165,250,0.6)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: '0 6px 6px 0',
                    padding: '6px 14px',
                    fontFamily: FONT_HEADER,
                    fontSize: 11,
                    color: showCurrentSeason ? '#60a5fa' : currentSeason ? '#445' : '#2a3040',
                    cursor: currentSeason ? 'pointer' : 'default',
                    letterSpacing: 1,
                    borderLeft: 'none',
                  }}
                >
                  {currentSeason ? currentSeason.name.toUpperCase() : 'NO ACTIVE SEASON'}
                </button>
                <button
                  onClick={() => setShowEloInfo(v => !v)}
                  style={{
                    marginLeft: 6,
                    background: showEloInfo ? 'rgba(200,160,48,0.18)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${showEloInfo ? 'rgba(200,160,48,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontFamily: FONT_HEADER,
                    fontSize: 11,
                    color: showEloInfo ? '#c8a030' : '#8090a8',
                    cursor: 'pointer',
                    letterSpacing: 1,
                  }}
                >
                  VR INFO
                </button>
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
                  <option value="elo">VR</option>
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
                const rankColor =
                  rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : rank === 3 ? '#cd7f32' : '#3a6090';
                const rankBg =
                  rank === 1 ? 'rgba(251,191,36,0.12)' : rank === 2 ? 'rgba(148,163,184,0.1)' : rank === 3 ? 'rgba(205,127,50,0.1)' : 'transparent';
                const avgPts = p.actCount ? (p.pts / p.actCount).toFixed(2) : '0';
                const winRate = p.actCount
                  ? (p.wins / p.actCount * 100).toFixed(1)
                  : '0';
                const jsRate = p.actCount
                  ? (((p.jerseySwaps ?? 0) / p.actCount) * 100).toFixed(1)
                  : '0';
                const ch30 = p.change30d ?? 0;
                const satWins = countSatWins(data.sats ?? [], p.name);
                const sStats = csStatsMap[p.name];

                // Rank movement: spots gained/lost vs 30 days ago
                const oldRank = rankMovement30d[p.name];
                const rankDelta = oldRank != null ? oldRank - rank : null; // positive = moved up

                // Season mode extras
                const sVR = csEloMap[p.name];
                const sActC = csActCountMap[p.name] ?? 0;
                const isUnranked = sActC < SEASON_RANKED_THRESHOLD;
                const sRank = sVR != null ? getSeasonRank(sVR) : null;

                return (
                  <div
                    key={p.name}
                    className="lb-row"
                    onClick={() => setSelPlayer(p.name)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '54px 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                      padding: '16px 20px',
                      cursor: 'pointer',
                      background:
                        rank <= 3
                          ? 'linear-gradient(90deg,rgba(42,80,130,0.14) 0%,rgba(18,22,30,0.5) 100%)'
                          : 'rgba(18,22,30,0.35)',
                      border:
                        rank === 1
                          ? '1.5px solid rgba(80,120,200,0.5)'
                          : rank <= 3
                          ? '1px solid rgba(60,90,150,0.3)'
                          : '1px solid rgba(30,45,80,0.4)',
                      borderRadius: 8,
                      transition: 'background 0.15s',
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(42,80,130,0.22)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = rank <= 3 ? 'linear-gradient(90deg,rgba(42,80,130,0.14) 0%,rgba(18,22,30,0.5) 100%)' : 'rgba(18,22,30,0.35)'; }}
                  >
                    {/* Rank */}
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        background: rankBg,
                        border: `1.5px solid ${rankColor}60`,
                        fontFamily: FONT_HEADER,
                        fontSize: rank <= 9 ? 16 : 13,
                        color: rankColor,
                        textShadow: rank <= 3 ? `0 0 8px ${rankColor}80` : 'none',
                      }}>
                        #{rank}
                      </div>
                      {rankDelta !== null && rankDelta !== 0 && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          color: rankDelta > 0 ? '#50fa7b' : '#e94560',
                          lineHeight: 1,
                        }}>
                          {rankDelta > 0 ? '▲' : '▼'}
                          {Math.abs(rankDelta)}
                        </div>
                      )}
                    </div>
                    {/* Name + sub-stats */}
                    <div>
                      <div style={{ fontFamily: FONT_HEADER, fontSize: 22, color: '#e0e4ea', marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                        {p.name}
                        {showCurrentSeason && sRank && (
                          isUnranked ? (
                            <span style={{ fontSize: 10, color: '#445', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 6px', fontFamily: FONT_MONO }}>
                              UNRANKED ({sActC}/{SEASON_RANKED_THRESHOLD})
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: sRank.color, background: sRank.bg, border: `1px solid ${sRank.color}55`, borderRadius: 4, padding: '2px 7px', fontFamily: FONT_MONO, letterSpacing: 0.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {menuImgs['ri_' + sRank.key]
                                ? <img src={menuImgs['ri_' + sRank.key]} style={{ width: 14, height: 14, objectFit: 'contain' }} alt={sRank.name} />
                                : sRank.icon}
                              {sRank.name.toUpperCase()}
                            </span>
                          )
                        )}
                        {satWins > 0 && (
                          <span style={{ fontSize: 11, color: '#f5a623', background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 4, padding: '2px 7px' }}>
                            🏆x{satWins}
                          </span>
                        )}
                        {!activePlayers.includes(p.name) && (
                          <span style={{ fontSize: 10, color: '#888', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 6px' }}>
                            Retired
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#556', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        {showCurrentSeason && sStats ? <>
                          <span>{sStats.acts} ACTs this season</span>
                          <span>{sStats.races} races</span>
                          <span>{sStats.acts > 0 ? (sStats.pts / sStats.acts).toFixed(1) : '0'} avg pts/ACT</span>
                          <span>{sStats.acts > 0 ? (sStats.wins / sStats.acts * 100).toFixed(1) : '0'}% win rate</span>
                        </> : <>
                          <span>{p.actCount} ACTs</span>
                          <span>{p.raceCount ?? 0} races</span>
                          <span>{avgPts} avg pts/ACT</span>
                          <span>{winRate}% win rate</span>
                          <span>{jsRate}% Jersey Swap</span>
                        </>}
                      </div>
                    </div>
                    {/* Stats */}
                    <div
                      className="lb-stats"
                      style={{ display: 'grid', gridTemplateColumns: 'repeat(5,auto)', gap: 20, textAlign: 'right' }}
                    >
                      {(showCurrentSeason && sStats ? [
                        { l: 'SEASON VR', v: csEloMap[p.name], c: '#60a5fa' },
                        { l: 'POINTS', v: sStats.pts, c: '#fde68a' },
                        { l: 'WINS', v: sStats.wins, c: '#86efac' },
                        { l: 'AVG PTS/ACT', v: sStats.acts > 0 ? (sStats.pts / sStats.acts).toFixed(1) : '0', c: '#93c5fd' },
                        { l: 'JERSEY SWAPS', v: sStats.js, c: '#f9a8d4' },
                      ] : [
                        { l: 'VR', v: Math.round(p.elo), c: '#93c5fd' },
                        { l: '30D CHANGE', v: (ch30 > 0 ? '+' : '') + ch30, c: ch30 > 0 ? '#86efac' : ch30 < 0 ? '#fca5a5' : '#556' },
                        { l: 'POINTS', v: p.pts, c: '#fde68a' },
                        { l: 'WINS', v: p.wins, c: '#86efac' },
                        { l: 'JERSEY SWAPS', v: p.jerseySwaps ?? 0, c: '#f9a8d4' },
                      ]).map((c, ci) => (
                        <div key={ci}>
                          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445', letterSpacing: 1, marginBottom: 3 }}>
                            {c.l}
                          </div>
                          <div style={{ fontFamily: FONT_HEADER, fontSize: 20, color: c.c }}>
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
          {['history', 'roster', 'seasons', 'sat', 'chooser', 'analytics', 'blackjack'].map(
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
                  key === 'roster' ? 'Roster' : key === 'analytics' ? 'Analytics' : key === 'blackjack' ? '🃏 Blackjack' : key === 'chooser' ? 'ACT Setup' : key.charAt(0).toUpperCase() + key.slice(1),
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
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <div
          style={{
            height: 2,
            background:
              'linear-gradient(90deg,#1a3060 0%,#c8a030 30%,#fbbf24 50%,#c8a030 70%,#1a3060 100%)',
          }}
        />
        <div
          style={{
            background:
              'linear-gradient(90deg,#0a1830 0%,#2a5090 30%,#4080c0 50%,#2a5090 70%,#0a1830 100%)',
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

    {/* ELO Info modal */}
    {showEloInfo && (
      <div
        onClick={() => setShowEloInfo(false)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ background: '#0c1018', border: '1px solid rgba(200,160,48,0.3)', borderRadius: 14, padding: '28px 30px', width: '100%', maxWidth: 780, maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 0 40px rgba(200,160,48,0.08)' }}
        >
          <button onClick={() => setShowEloInfo(false)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: '#556', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          <div style={{ fontFamily: FONT_HEADER, fontSize: 16, color: '#c8a030', letterSpacing: 2, marginBottom: 20 }}>HOW VR WORKS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {[
              {
                title: 'Starting VR',
                body: 'Every player starts at 5000 VR — the same as Mario Kart Wii. VR is calculated per race, not per ACT, so each individual race moves your rating.',
              },
              {
                title: 'Finish Position',
                body: '1st place: +20 VR. 2nd place: +10 VR. 3rd place: −10 VR. 4th place: −20 VR. These are base values before the skill modifier is applied.',
              },
              {
                title: 'Skill Modifier',
                body: 'Your VR vs the room average adjusts your gain/loss. If you\'re rated well above the room, wins are worth less and losses cost more. If you\'re the underdog, wins pay more and losses hurt less.',
              },
              {
                title: 'Ceiling at 9999',
                body: 'VR is capped at 9999. Above 9000, gains start shrinking — at 9500 you earn half the normal gain, at 9900 only 10%. Losses are always full strength.',
              },
              {
                title: 'SAT Multipliers',
                body: 'SAT gains are boosted by day: Day 1 = 1.1×, Day 2 = 1.2×, Day 3 = 1.5×, Finals = 2×. Only gains are amplified — SAT losses are normal.',
              },
            ].map((item) => (
              <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '12px 14px' }}>
                <div style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#c8a030', marginBottom: 6, letterSpacing: 1 }}>{item.title}</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#8090a8', lineHeight: 1.6 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}

    {/* Player detail modal */}
    {selPlayer && selPlayerStats && (() => {
      const { ps, finishes, totalFinishes, satPlacements, peakElo, lbRank, seasonRanks } = selPlayerStats!;
      const ch30 = ps.change30d ?? 0;
      const finishLabels = ['1st', '2nd', '3rd', '4th'];
      const finishColors = ['#fbbf24', '#94a3b8', '#cd7f32', '#4aade0'];
      const avgPts = ps.actCount ? (ps.pts / ps.actCount).toFixed(1) : '0';
      const avgPtsRace = ps.raceCount ? (ps.pts / ps.raceCount).toFixed(1) : '0';
      const winRate = ps.actCount ? (ps.wins / ps.actCount * 100).toFixed(1) : '0';
      const jsRate = ps.actCount ? ((ps.jerseySwaps ?? 0) / ps.actCount * 100).toFixed(1) : '0';
      const satWins = countSatWins(data.sats ?? [], ps.name);
      const currentTier = getTier(Math.round(ps.elo));

      const coreStats = [
        { l: 'ACTs', v: ps.actCount, c: '#94b8d8' },
        { l: 'Races', v: ps.raceCount ?? 0, c: '#94b8d8' },
        { l: 'Total Pts', v: ps.pts, c: '#fbbf24' },
        { l: 'ACT Wins', v: ps.wins, c: '#fbbf24' },
        { l: 'Avg Pts/ACT', v: avgPts, c: '#94b8d8' },
        { l: 'Avg Pts/Race', v: avgPtsRace, c: '#94b8d8' },
        { l: 'Win Rate', v: winRate + '%', c: '#60a5fa' },
        { l: 'Jersey Swap', v: jsRate + '%', c: '#60a5fa' },
      ];

      return (
        <div
          onClick={() => setSelPlayer(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(4px)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#0d1020', border: '2px solid #2a4070', borderRadius: 14, padding: '28px 30px', width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 0 40px rgba(40,80,160,0.2)' }}
          >
            {/* Close */}
            <button onClick={() => setSelPlayer(null)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: '#556', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>✕</button>

            {/* Header */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontFamily: FONT_HEADER, fontSize: 28, color: '#f0e6d3' }}>{ps.name}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#556' }}>#{lbRank}</span>
                <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: currentTier.color, background: `${currentTier.color}18`, border: `1px solid ${currentTier.color}50`, borderRadius: 6, padding: '3px 10px' }}>
                  {currentTier.icon} {currentTier.name}
                </span>
                {satWins > 0 && <span style={{ fontSize: 11, color: '#f5a623', background: 'rgba(245,166,35,0.12)', border: '1px solid rgba(245,166,35,0.25)', borderRadius: 4, padding: '2px 8px' }}>🏆 {satWins} SAT win{satWins > 1 ? 's' : ''}</span>}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#60a5fa' }}>
                  VR {Math.round(ps.elo)}
                </span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#6080a0' }}>Peak {peakElo}</span>
                <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: ch30 > 0 ? '#4ade80' : ch30 < 0 ? '#f87171' : '#445' }}>
                  30d {ch30 > 0 ? '+' : ''}{ch30}
                </span>
              </div>
            </div>

            {/* Core stats grid */}
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 10 }}>OVERVIEW</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
              {coreStats.map(({ l, v, c }) => (
                <div key={l} style={{ background: 'rgba(30,50,80,0.25)', border: '1px solid rgba(100,140,200,0.15)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#506070', marginBottom: 4 }}>{l}</div>
                  <div style={{ fontFamily: FONT_HEADER, fontSize: 18, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Season rankings */}
            {seasonRanks.length > 0 && (
              <>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 10 }}>SEASON RANKINGS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
                  {seasonRanks.map((sr, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30,50,80,0.2)', border: '1px solid rgba(100,140,200,0.12)', borderRadius: 6, padding: '10px 14px', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#c8d4e8', flex: 1 }}>{sr.seasonName}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {sr.isUnranked ? (
                          <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#445', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 7px' }}>
                            UNRANKED ({sr.actCount}/{SEASON_RANKED_THRESHOLD})
                          </span>
                        ) : (
                          <>
                            <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: sr.badge.color, background: sr.badge.bg, border: `1px solid ${sr.badge.color}50`, borderRadius: 5, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              {menuImgs['ri_' + sr.badge.key]
                                ? <img src={menuImgs['ri_' + sr.badge.key]} style={{ width: 18, height: 18, objectFit: 'contain' }} alt={sr.badge.name} />
                                : sr.badge.icon}
                              {sr.badge.name}
                            </span>
                            <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: sr.rank === 1 ? '#fde68a' : sr.rank === 2 ? '#94a3b8' : sr.rank === 3 ? '#cd7f32' : '#93c5fd' }}>
                              #{sr.rank}<span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445' }}>/{sr.total}</span>
                            </span>
                          </>
                        )}
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#93c5fd', fontWeight: 700 }}>VR {sr.elo}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#445' }}>{sr.actCount} ACTs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Race finish distribution */}
            {totalFinishes > 0 && (
              <>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 12 }}>RACE FINISHES</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {finishes.map((count: number, i: number) => {
                    const pct = totalFinishes > 0 ? (count / totalFinishes) * 100 : 0;
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 36px 38px', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: finishColors[i] }}>{finishLabels[i]}</span>
                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div style={{ width: pct + '%', height: '100%', background: finishColors[i], borderRadius: 4, transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: finishColors[i], textAlign: 'right' }}>{count}</span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#445', textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* SAT placements */}
            {satPlacements.length > 0 && (
              <>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 10 }}>SAT RECORD</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {satPlacements.map((sp: { satName: string; placement: string; date: string }, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(30,50,80,0.2)', border: '1px solid rgba(100,140,200,0.12)', borderRadius: 6, padding: '8px 12px' }}>
                      <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#c8bfa8' }}>{sp.satName}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#445' }}>{sp.date}</span>
                        <span style={{ fontFamily: FONT_HEADER, fontSize: 14, color: sp.placement === 'winner' ? '#fbbf24' : sp.placement === '2nd' ? '#94a3b8' : sp.placement === '3rd' ? '#cd7f32' : '#c8bfa8' }}>
                          {sp.placement === 'winner' ? '🏆 1st' : sp.placement}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      );
    })()}
    </>
  );
}
