import type { Act, Player, Sat, Season, PlayerStats, EloHistoryEntry } from '../types';

export const BASE_ELO = 1000;
export const MAX_PTS = 24;
export const K_BASE = 40;
export const LOSS_DAMP = 0.55;
export const LOW_ELO_PROTECT = 300; // ELO range below BASE where protection applies
export const MAX_EXTRA_DAMP = 0.55; // max extra loss reduction at the floor (55%)
export const CARRY = 0.3; // kept for reference but no longer used in season starting ELO
export const SAT_MULTI = 1.25;
export const PLACEMENT_ACTS = 7;    // ACTs needed to exit placement; 2× K-factor during placement
export const SEASON_BASE_ELO = 800;        // everyone starts here each season (below leaderboard 1000)
export const SEASON_K_MULTI = 2.0;         // base amplifier on all season changes — creates spread over short seasons
export const SEASON_COMP_MMR_WEIGHT = 0.4; // how much opponent MMR vs season ELO affects competition level (0=season only, 1=MMR only)
export const MMR_SCALE = 400;              // gap between MMR and season ELO at which factors hit their extremes
export const MMR_GAIN_MAX = 2.0;    // max gain multiplier (high MMR, far below season ELO)
export const MMR_GAIN_MIN = 0.5;    // min gain multiplier (low MMR, far above season ELO)
export const MMR_LOSS_MAX = 1.75;   // max loss multiplier (low MMR, overranked in season)
export const MMR_LOSS_MIN = 0.5;    // min loss multiplier (high MMR, underranked in season)
export const SEASON_DAMP_AFTER = 12;  // ACTs in a season after which changes are dampened
export const SEASON_DAMP_FACTOR = 0.6; // multiplier applied to ch after SEASON_DAMP_AFTER ACTs
// Competitive-lobby top-seed protection:
// If avg participant ELO ≥ COMP_ACT_AVG_ELO, the player with the highest pre-ACT ELO
// who scores > COMP_TOP_SEED_PTS_MIN will not lose ELO — instead everyone else gains
// the amount they would have lost (redistributed evenly).
export const COMP_ACT_AVG_ELO = 1000;       // avg ELO threshold to flag lobby as competitive
export const COMP_TOP_SEED_PTS_MIN = 14;     // top seed must score above this to be protected

export const SEASON_RANKS = [
  { key: 'diamond',  name: 'Diamond',  min: 1100, color: '#67e8f9', bg: 'rgba(103,232,249,0.12)', icon: '💎' },
  { key: 'platinum', name: 'Platinum', min: 1025, color: '#e2e8f0', bg: 'rgba(226,232,240,0.10)', icon: '🔹' },
  { key: 'gold',     name: 'Gold',     min: 960,  color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  icon: '🥇' },
  { key: 'silver',   name: 'Silver',   min: 900,  color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', icon: '🥈' },
  { key: 'bronze',   name: 'Bronze',   min: 825,  color: '#cd7f32', bg: 'rgba(205,127,50,0.10)',  icon: '🥉' },
  { key: 'copper',   name: 'Copper',   min: 0,    color: '#b45309', bg: 'rgba(180,83,9,0.10)',    icon: '🪙' },
] as const;

export function getSeasonRank(elo: number) {
  return SEASON_RANKS.find((r) => elo >= r.min) ?? SEASON_RANKS[SEASON_RANKS.length - 1];
}
export const SAT_PLACEMENT_BONUS: Record<string, number> = {
  winner: 25,
  runnerUp: 15,
  finalist: 12,
  semi: 8,
  round2: 5,
};

function expectedScore(pE: number, oE: number): number {
  return 1 / (1 + Math.pow(10, (oE - pE) / 400));
}

function eloChange(pE: number, oE: number, pts: number): number {
  const norm = pts / MAX_PTS;
  const exp = expectedScore(pE, oE);
  const diff = oE - pE;
  let k =
    K_BASE +
    (diff > 0 ? Math.min(diff / 20, 20) : Math.min(Math.abs(diff) / 30, 10));
  let ch = k * (norm - exp);
  if (ch < 0) {
    ch *= LOSS_DAMP;
    // Extra protection for low-ELO players: scales from 0% at BASE_ELO down to MAX_EXTRA_DAMP at (BASE_ELO - LOW_ELO_PROTECT)
    if (pE < BASE_ELO) {
      const extraDamp = Math.min((BASE_ELO - pE) / LOW_ELO_PROTECT, 1) * MAX_EXTRA_DAMP;
      ch *= (1 - extraDamp);
    }
    ch = Math.max(ch, -25);
  }
  return Math.min(Math.round(ch * 10) / 10, 45);
}

export function computeAllElos(
  players: Player[],
  acts: Act[],
  sats: Sat[] | null | undefined
): { elos: Record<string, number>; hist: Record<string, EloHistoryEntry[]> } {
  const elos: Record<string, number> = {};
  const hist: Record<string, EloHistoryEntry[]> = {};
  const actCounts: Record<string, number> = {}; // tracks ACTs played so far per player (for placement)

  players.forEach((p) => {
    elos[p.name] = BASE_ELO;
    hist[p.name] = [];
    actCounts[p.name] = 0;
  });

  [...acts]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((act) => {
      const subMap: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs) {
          t.members.forEach((m, i) => {
            if (t.subs?.[i]) subMap[m] = t.subs[i];
          });
        }
      });

      const remapName = (n: string) => subMap[n] ?? n;
      const teamMembers = act.teams.flatMap((t) => t.members);
      const effectivePlayers = new Set<string>();
      teamMembers.forEach((m) => effectivePlayers.add(remapName(m)));
      act.races.forEach((r) =>
        r.results.forEach((res) => {
          if (res.player) effectivePlayers.add(remapName(res.player));
        })
      );

      const ap = [...effectivePlayers];
      const pp: Record<string, number> = {};
      ap.forEach((p) => {
        pp[p] = 0;
      });
      act.races.forEach((r) =>
        r.results.forEach((res) => {
          const pn = remapName(res.player);
          if (pn in pp) pp[pn] += res.points;
        })
      );

      const multi = act.satId ? SAT_MULTI : 1;

      const soloPlayers = new Set<string>();
      act.teams.forEach((t) => {
        const rm = t.members.map((m) => remapName(m));
        if (rm.length >= 2 && rm[0] === rm[1]) soloPlayers.add(rm[0]);
        if (
          rm.length >= 3 &&
          (rm[0] === rm[1] || rm[0] === rm[2] || rm[1] === rm[2])
        ) {
          rm.forEach((m) => {
            if (rm.filter((x) => x === m).length > 1) soloPlayers.add(m);
          });
        }
      });

      // Map each non-solo player to their slot (0 = top bracket, 1 = bottom bracket)
      const posMap: Record<string, 0 | 1> = {};
      act.teams.forEach((t) => {
        const rm = t.members.map((m) => remapName(m));
        if (rm.length >= 2 && rm[0] !== rm[1]) {
          posMap[rm[0]] = 0;
          posMap[rm[1]] = 1;
        }
      });

      // Classify each race as top (0) or bottom (1) bracket based on non-solo participants
      const racePos: (0 | 1 | null)[] = act.races.map((r) => {
        const nonSolo = r.results
          .map((res) => remapName(res.player))
          .filter((p) => !soloPlayers.has(p) && p in posMap);
        if (nonSolo.length === 0) return null;
        const c0 = nonSolo.filter((p) => posMap[p] === 0).length;
        const c1 = nonSolo.filter((p) => posMap[p] === 1).length;
        return c0 >= c1 ? 0 : 1;
      });

      // Phase 1: compute raw ELO changes (pre-placement multiplier)
      const rawCh: Record<string, number> = {};
      ap.forEach((name) => {
        if (!(name in elos)) elos[name] = BASE_ELO;
        let ch: number;
        if (soloPlayers.has(name)) {
          // Calculate ELO separately for each bracket then sum
          const pos0Opps = Object.entries(posMap).filter(([, v]) => v === 0).map(([k]) => k);
          const pos1Opps = Object.entries(posMap).filter(([, v]) => v === 1).map(([k]) => k);
          let pts0 = 0, pts1 = 0;
          act.races.forEach((r, i) => {
            const res = r.results.find((res) => remapName(res.player) === name);
            if (!res) return;
            if (racePos[i] === 0) pts0 += res.points;
            else if (racePos[i] === 1) pts1 += res.points;
          });
          const oAvg0 = pos0Opps.length > 0
            ? pos0Opps.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / pos0Opps.length
            : BASE_ELO;
          const oAvg1 = pos1Opps.length > 0
            ? pos1Opps.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / pos1Opps.length
            : BASE_ELO;
          ch = ((eloChange(elos[name], oAvg0, pts0) + eloChange(elos[name], oAvg1, pts1)) / 2) * multi;
        } else {
          const opp = ap.filter((p) => p !== name);
          const oAvg =
            opp.length > 0
              ? opp.reduce((s, o) => s + (elos[o] ?? BASE_ELO), 0) / opp.length
              : BASE_ELO;
          ch = eloChange(elos[name], oAvg, pp[name] ?? 0) * multi;
        }
        rawCh[name] = ch;
      });

      // Phase 2: competitive-lobby top-seed protection
      // If the average ELO of all participants is above the competitive threshold,
      // the highest-ELO player (top seed) who scores well enough won't lose ELO —
      // their saved loss is redistributed only to players in the same bracket (same
      // position slot), since skill gaps between brackets mean the other bracket
      // shouldn't be affected.
      if (ap.length > 1) {
        const avgLobbyElo = ap.reduce((s, n) => s + (elos[n] ?? BASE_ELO), 0) / ap.length;
        if (avgLobbyElo >= COMP_ACT_AVG_ELO) {
          const topSeed = ap.reduce((best, n) =>
            (elos[n] ?? BASE_ELO) > (elos[best] ?? BASE_ELO) ? n : best, ap[0]);
          if ((pp[topSeed] ?? 0) > COMP_TOP_SEED_PTS_MIN && rawCh[topSeed] < 0) {
            const savedLoss = -rawCh[topSeed]; // positive amount
            rawCh[topSeed] = 0;
            // Only boost players in the same bracket (same position slot 0 or 1)
            const topPos = posMap[topSeed]; // undefined for solo players
            const bracketPeers = topPos !== undefined
              ? ap.filter((n) => n !== topSeed && posMap[n] === topPos)
              : ap.filter((n) => n !== topSeed); // solo fallback: all others
            if (bracketPeers.length > 0) {
              const extra = savedLoss / bracketPeers.length;
              bracketPeers.forEach((n) => { rawCh[n] += extra; });
            }
          }
        }
      }

      // Phase 3: apply placement multiplier and commit changes
      ap.forEach((name) => {
        let ch = rawCh[name];
        // 2× K-factor during placement (first PLACEMENT_ACTS ACTs)
        if ((actCounts[name] ?? 0) < PLACEMENT_ACTS) ch *= 2;
        elos[name] = (elos[name] ?? BASE_ELO) + ch;
        if (!hist[name]) hist[name] = [];
        hist[name].push({
          actId: act.id ?? act._id ?? '',
          actName: act.name,
          date: act.date,
          elo: Math.round(elos[name]),
          change: ch,
          points: pp[name] ?? 0,
          isSat: !!act.satId,
        });
        actCounts[name] = (actCounts[name] ?? 0) + 1;
      });
    });

  if (sats) {
    sats.forEach((sat) => {
      if (!sat.placements) return;
      Object.entries(sat.placements).forEach(([pl, teams]) => {
        const b = SAT_PLACEMENT_BONUS[pl] ?? 0;
        if (!b) return;
        (teams ?? []).forEach((tm) => {
          [
            ...(tm.members ?? []),
            ...(tm.subs ?? []).filter(Boolean),
          ].forEach((name) => {
            if (!(name in elos)) elos[name] = BASE_ELO;
            elos[name] += b;
            if (!hist[name]) hist[name] = [];
            hist[name].push({
              actId: sat.id ?? sat._id ?? '',
              actName: sat.name + ' (' + pl + ')',
              date: sat.date ?? '',
              elo: Math.round(elos[name]),
              change: b,
              points: 0,
              isSat: true,
            });
          });
        });
      });
    });
  }

  return { elos, hist };
}

export function computeSeasonElos(
  players: Player[],
  acts: Act[],
  season: Season
): {
  seasonElos: Record<string, number>;
  seasonHistory: Record<string, EloHistoryEntry[]>;
  actCount: number;
} {
  const sActs = acts
    .filter((a) => {
      const d = new Date(a.date);
      return (
        d >= new Date(season.startDate) && d <= new Date(season.endDate)
      );
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const { elos: atE } = computeAllElos(players, acts, []);
  const sE: Record<string, number> = {};
  const sH: Record<string, EloHistoryEntry[]> = {};

  players.forEach((p) => {
    sE[p.name] = SEASON_BASE_ELO; // flat start — no carryover; MMR influences gain/loss rates instead
    sH[p.name] = [];
  });
  const sActCounts: Record<string, number> = {}; // per-player ACT count within this season

  sActs.forEach((act) => {
    const subMap: Record<string, string> = {};
    act.teams.forEach((t) => {
      if (t.subs) {
        t.members.forEach((m, i) => {
          if (t.subs?.[i]) subMap[m] = t.subs[i];
        });
      }
    });
    const remapName = (n: string) => subMap[n] ?? n;

    const ap = [...new Set(act.teams.flatMap((t) => t.members).map(remapName))];
    const pp: Record<string, number> = {};
    ap.forEach((p) => { pp[p] = 0; });
    act.races.forEach((r) =>
      r.results.forEach((res) => {
        const pn = remapName(res.player);
        if (pn in pp) pp[pn] += res.points;
      })
    );
    const multi = act.satId ? SAT_MULTI : 1;

    const soloPlayers = new Set<string>();
    act.teams.forEach((t) => {
      const rm = t.members.map((m) => remapName(m));
      if (rm.length >= 2 && rm[0] === rm[1]) soloPlayers.add(rm[0]);
    });

    const posMap: Record<string, 0 | 1> = {};
    act.teams.forEach((t) => {
      const rm = t.members.map((m) => remapName(m));
      if (rm.length >= 2 && rm[0] !== rm[1]) {
        posMap[rm[0]] = 0;
        posMap[rm[1]] = 1;
      }
    });

    const racePos: (0 | 1 | null)[] = act.races.map((r) => {
      const nonSolo = r.results
        .map((res) => remapName(res.player))
        .filter((p) => !soloPlayers.has(p) && p in posMap);
      if (nonSolo.length === 0) return null;
      const c0 = nonSolo.filter((p) => posMap[p] === 0).length;
      const c1 = nonSolo.filter((p) => posMap[p] === 1).length;
      return c0 >= c1 ? 0 : 1;
    });

    // Helper: blend an opponent's MMR and season ELO for competition level
    const blendOpp = (o: string) =>
      (atE[o] ?? BASE_ELO) * SEASON_COMP_MMR_WEIGHT +
      (sE[o] ?? SEASON_BASE_ELO) * (1 - SEASON_COMP_MMR_WEIGHT);

    // Phase 1: compute raw season changes
    const sRawCh: Record<string, number> = {};
    ap.forEach((name) => {
      if (!(name in sE)) sE[name] = SEASON_BASE_ELO;
      let ch: number;
      if (soloPlayers.has(name)) {
        const pos0Opps = Object.entries(posMap).filter(([, v]) => v === 0).map(([k]) => k);
        const pos1Opps = Object.entries(posMap).filter(([, v]) => v === 1).map(([k]) => k);
        let pts0 = 0, pts1 = 0;
        act.races.forEach((r, i) => {
          const res = r.results.find((res) => remapName(res.player) === name);
          if (!res) return;
          if (racePos[i] === 0) pts0 += res.points;
          else if (racePos[i] === 1) pts1 += res.points;
        });
        // Blend MMR + season ELO for opponent strength
        const oAvg0 = pos0Opps.length > 0
          ? pos0Opps.reduce((s, o) => s + blendOpp(o), 0) / pos0Opps.length
          : BASE_ELO;
        const oAvg1 = pos1Opps.length > 0
          ? pos1Opps.reduce((s, o) => s + blendOpp(o), 0) / pos1Opps.length
          : BASE_ELO;
        ch = ((eloChange(sE[name], oAvg0, pts0) + eloChange(sE[name], oAvg1, pts1)) / 2) * multi;
      } else {
        // Position-based opponents: compare against same-slot players from other teams only
        const playerTeam = act.teams.find((t) => t.members.map(remapName).includes(name));
        const playerPos = playerTeam ? playerTeam.members.map(remapName).indexOf(name) : -1;
        const posOpps = playerPos >= 0
          ? act.teams
              .filter((t) => t !== playerTeam)
              .map((t) => remapName(t.members[playerPos]))
              .filter((n) => n && n !== name)
          : ap.filter((p) => p !== name); // fallback: all opponents
        const oAvg = posOpps.length > 0
          ? posOpps.reduce((s, o) => s + blendOpp(o), 0) / posOpps.length
          : BASE_ELO;
        ch = eloChange(sE[name], oAvg, pp[name] ?? 0) * multi;
      }
      ch *= SEASON_K_MULTI;
      const mmr = atE[name] ?? BASE_ELO;
      const mmrDiff = mmr - sE[name];
      const gainFactor = Math.max(MMR_GAIN_MIN, Math.min(MMR_GAIN_MAX, 1 + mmrDiff / MMR_SCALE));
      const lossFactor = Math.max(MMR_LOSS_MIN, Math.min(MMR_LOSS_MAX, 1 - mmrDiff / MMR_SCALE));
      if (ch > 0) ch *= gainFactor;
      else if (ch < 0) ch *= lossFactor;
      sRawCh[name] = ch;
    });

    // Phase 2: competitive-lobby top-seed protection (same rule as MMR ELO)
    // Redistributes only within the same bracket (same position slot).
    if (ap.length > 1) {
      const avgLobbyElo = ap.reduce((s, n) => s + (atE[n] ?? BASE_ELO), 0) / ap.length;
      if (avgLobbyElo >= COMP_ACT_AVG_ELO) {
        const topSeed = ap.reduce((best, n) =>
          (atE[n] ?? BASE_ELO) > (atE[best] ?? BASE_ELO) ? n : best, ap[0]);
        if ((pp[topSeed] ?? 0) > COMP_TOP_SEED_PTS_MIN && sRawCh[topSeed] < 0) {
          const savedLoss = -sRawCh[topSeed];
          sRawCh[topSeed] = 0;
          const topPos = posMap[topSeed];
          const bracketPeers = topPos !== undefined
            ? ap.filter((n) => n !== topSeed && posMap[n] === topPos)
            : ap.filter((n) => n !== topSeed);
          if (bracketPeers.length > 0) {
            const extra = savedLoss / bracketPeers.length;
            bracketPeers.forEach((n) => { sRawCh[n] += extra; });
          }
        }
      }
    }

    // Phase 3: apply dampen + commit
    ap.forEach((name) => {
      let ch = sRawCh[name];
      // Dampen changes after SEASON_DAMP_AFTER ACTs — rating stabilises late in the season
      if ((sActCounts[name] ?? 0) >= SEASON_DAMP_AFTER) ch *= SEASON_DAMP_FACTOR;
      sE[name] += ch;
      sActCounts[name] = (sActCounts[name] ?? 0) + 1;
      if (!sH[name]) sH[name] = [];
      sH[name].push({
        actId: act.id ?? act._id ?? '',
        actName: act.name,
        date: act.date,
        elo: Math.round(sE[name]),
        change: ch,
        points: pp[name] ?? 0,
      });
    });
  });

  return { seasonElos: sE, seasonHistory: sH, actCount: sActs.length };
}

export function computeStats(
  players: Player[],
  acts: Act[],
  sats: Sat[] | null | undefined
): PlayerStats[] {
  const { elos, hist } = computeAllElos(players, acts, sats ?? []);

  return players.map((p) => {
    let tR = 0;
    let tP = 0;
    let aC = 0;
    let jW = 0;
    let jC = 0;
    let w = 0;

    acts.forEach((act) => {
      const inTeam = act.teams.find(
        (t) =>
          t.members.includes(p.name) || (t.subs ?? []).includes(p.name)
      );
      const sMap2: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs)
          t.members.forEach((m, i) => {
            if (t.subs?.[i]) sMap2[m] = t.subs[i];
          });
      });
      const inRaces = act.races.some((r) =>
        r.results.some(
          (res) =>
            res.player === p.name ||
            (sMap2[res.player] ?? res.player) === p.name
        )
      );
      if (!inTeam && !inRaces) return;
      aC++;

      const sMap: Record<string, string> = {};
      act.teams.forEach((t) => {
        if (t.subs)
          t.members.forEach((m, i) => {
            if (t.subs?.[i]) sMap[m] = t.subs[i];
          });
      });

      act.races.forEach((r) => {
        const e = r.results.find(
          (x) =>
            (sMap[x.player] ?? x.player) === p.name || x.player === p.name
        );
        if (e) {
          tR++;
          tP += e.points;
        }
      });

      let pen = act.penalties;
      if (!pen && act.penaltiesJson) {
        try {
          pen = JSON.parse(act.penaltiesJson) as Act['penalties'];
        } catch {
          // ignore
        }
      }

      const ts = act.teams
        .map((t, ti) => {
          let s = 0;
          act.races.forEach((r) =>
            r.results.forEach((x) => {
              if (t.members.includes(x.player)) s += x.points;
            })
          );
          if (pen) {
            pen.forEach((round) => {
              const v = round[ti];
              if (Array.isArray(v)) {
                s += v.reduce((s2, x) => s2 + x * -2, 0);
              } else {
                s += (v ?? 0) * -2;
              }
            });
          }
          return { team: t, score: s };
        })
        .sort((a, b) => b.score - a.score);

      const t2 = ts.slice(0, 2);
      const playerTeam = act.teams.find(
        (t) =>
          t.members.includes(p.name) || (t.subs ?? []).includes(p.name)
      );
      if (
        playerTeam &&
        t2.find((x) => x.team.name === playerTeam.name)
      ) {
        jC++;
        if (t2[0].team.name === playerTeam.name) {
          jW++;
          w++;
        }
      }
    });

    const eloH = hist[p.name] ?? [];
    let change30d = 0;
    if (eloH.length > 0) {
      const now = new Date();
      const d30 = new Date(now.getTime() - 30 * 86400000);
      const recent = eloH.filter((h) => new Date(h.date) >= d30);
      change30d = recent.reduce((s, h) => s + h.change, 0);
    }

    return {
      ...p,
      elo: Math.round(elos[p.name] ?? BASE_ELO),
      eloHistory: eloH,
      totalRaces: tR,
      totalPoints: tP,
      pts: tP,
      raceCount: tR,
      actCount: aC,
      avgPtsAct: aC > 0 ? tP / aC : 0,
      avgPtsRace: tR > 0 ? tP / tR : 0,
      winRate: aC > 0 ? w / aC : 0,
      jsPct: jC > 0 ? jW / jC : 0,
      jsW: jC,
      jsC: jC,
      jerseySwaps: jC,
      wins: w,
      change30d: Math.round(change30d),
    };
  });
}

export interface BracketBreakdown {
  pts0: number;
  pts1: number;
  ch0: number;
  ch1: number;
}

export function computeActBracketBreakdown(
  act: Act,
  elosBefore: Record<string, number>
): Record<string, BracketBreakdown> {
  const result: Record<string, BracketBreakdown> = {};

  const subMap: Record<string, string> = {};
  act.teams.forEach((t) => {
    if (t.subs) {
      t.members.forEach((m, i) => {
        if (t.subs?.[i]) subMap[m] = t.subs[i];
      });
    }
  });
  const remapName = (n: string) => subMap[n] ?? n;

  const soloPlayers = new Set<string>();
  act.teams.forEach((t) => {
    const rm = t.members.map((m) => remapName(m));
    if (rm.length >= 2 && rm[0] === rm[1]) soloPlayers.add(rm[0]);
  });

  if (soloPlayers.size === 0) return result;

  const posMap: Record<string, 0 | 1> = {};
  act.teams.forEach((t) => {
    const rm = t.members.map((m) => remapName(m));
    if (rm.length >= 2 && rm[0] !== rm[1]) {
      posMap[rm[0]] = 0;
      posMap[rm[1]] = 1;
    }
  });

  const racePos: (0 | 1 | null)[] = act.races.map((r) => {
    const nonSolo = r.results
      .map((res) => remapName(res.player))
      .filter((p) => !soloPlayers.has(p) && p in posMap);
    if (nonSolo.length === 0) return null;
    const c0 = nonSolo.filter((p) => posMap[p] === 0).length;
    const c1 = nonSolo.filter((p) => posMap[p] === 1).length;
    return c0 >= c1 ? 0 : 1;
  });

  const multi = act.satId ? SAT_MULTI : 1;

  soloPlayers.forEach((name) => {
    const pos0Opps = Object.entries(posMap).filter(([, v]) => v === 0).map(([k]) => k);
    const pos1Opps = Object.entries(posMap).filter(([, v]) => v === 1).map(([k]) => k);
    let pts0 = 0, pts1 = 0;
    act.races.forEach((r, i) => {
      const res = r.results.find((res) => remapName(res.player) === name);
      if (!res) return;
      if (racePos[i] === 0) pts0 += res.points;
      else if (racePos[i] === 1) pts1 += res.points;
    });
    const oAvg0 = pos0Opps.length > 0
      ? pos0Opps.reduce((s, o) => s + (elosBefore[o] ?? BASE_ELO), 0) / pos0Opps.length
      : BASE_ELO;
    const oAvg1 = pos1Opps.length > 0
      ? pos1Opps.reduce((s, o) => s + (elosBefore[o] ?? BASE_ELO), 0) / pos1Opps.length
      : BASE_ELO;
    const ch0 = (eloChange(elosBefore[name] ?? BASE_ELO, oAvg0, pts0) / 2) * multi;
    const ch1 = (eloChange(elosBefore[name] ?? BASE_ELO, oAvg1, pts1) / 2) * multi;
    result[name] = { pts0, pts1, ch0, ch1 };
  });

  return result;
}

export interface TeamScore {
  team: Act['teams'][0];
  score: number;
}

export function teamScores(act: Act): TeamScore[] {
  let pen = act.penalties;
  if (!pen && act.penaltiesJson) {
    try {
      pen = JSON.parse(act.penaltiesJson) as Act['penalties'];
    } catch {
      // ignore
    }
  }

  const scored: TeamScore[] = act.teams.map((t, ti) => {
    let s = 0;
    act.races.forEach((r) =>
      r.results.forEach((x) => {
        if (
          t.members.includes(x.player) ||
          (t.subs ?? []).includes(x.player)
        )
          s += x.points;
      })
    );
    if (pen) {
      pen.forEach((round) => {
        const v = round[ti];
        if (Array.isArray(v)) {
          s += v.reduce((s2, x) => s2 + x * -2, 0);
        } else {
          s += (v ?? 0) * -2;
        }
      });
    }
    return { team: t, score: s };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (act.tiebreaker) {
      if (a.team.name === act.tiebreaker) return -1;
      if (b.team.name === act.tiebreaker) return 1;
    }
    if (act.jerseyTiebreaker) {
      if (a.team.name === act.jerseyTiebreaker) return -1;
      if (b.team.name === act.jerseyTiebreaker) return 1;
    }
    return 0;
  });

  return scored;
}
