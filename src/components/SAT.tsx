import { useState, Fragment } from 'react';
import { fsGet, fsSet, gid } from '../services/firestore';
import {
  card,
  cHead,
  cTitle,
  cSub,
  lbl,
  inp,
  priBtn,
  secBtn,
  delBtn,
  TC,
} from '../styles/shared';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type {
  AppData,
  AppOps,
  PlacementTeam,
  Sat,
  SatHeat,
  SatHeatTeam,
} from '../types';

interface RosterRow {
  p1: string;
  p2: string;
  seed: number | null;
  sub1: string;
  sub2: string;
}

interface AuthState {
  req: (fn: () => void | Promise<void>) => void;
}

export interface SATProps {
  data: AppData;
  ops: AppOps;
  showToast: (msg: string) => void;
  auth: AuthState;
  setView: (v: string) => void;
  setSelAct: (id: string | null) => void;
  selSat: string | null;
  setSelSat: (id: string | null) => void;
}

const RN = ['Round 1', 'Round 2', 'Semifinals', 'Final', 'Round 5'];

const scI = {
  width: 36,
  height: 36,
  borderRadius: 6,
  fontFamily: FONT_HEADER,
  fontSize: 18,
  textAlign: 'center' as const,
  outline: 'none',
  border: '1px solid rgba(255,255,255,0.1)',
  boxSizing: 'border-box' as const,
  padding: 0,
  background: 'rgba(255,255,255,0.04)',
  color: '#f0e6d3',
};

function getRoundDate(satDate: string, round: number): string {
  const d = new Date(satDate + 'T12:00:00');
  if (round === 0) return satDate;
  if (round === 1) d.setDate(d.getDate() + 1);
  else d.setDate(d.getDate() + 2);
  return d.toISOString().slice(0, 10);
}

function autoTeamName(members: string[]): string {
  if (members[0] && members[1]) return members[0].split(' ')[0] + ' & ' + members[1].split(' ')[0];
  return '';
}

function getDefMap4(ro: string): number[][][] {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, (_, ei) => (ro === 'A' ? ei % 2 : 1 - (ei % 2)))
    )
  );
}

export function SAT({ data, ops, showToast, auth, setView, setSelAct, selSat, setSelSat }: SATProps) {
  const [mode, setMode] = useState<'list' | 'create' | 'detail'>(selSat ? 'detail' : 'list');
  const [editingSat, setEditingSat] = useState(false);
  const [eSatName, setESatName] = useState('');
  const [eSatDate, setESatDate] = useState('');
  const [eSatRounds, setESatRounds] = useState(4);
  const [eSatRoster, setESatRoster] = useState<RosterRow[]>([]);
  const [satName, setSatName] = useState('');
  const [satRoster, setSatRoster] = useState<RosterRow[]>([]);
  const [satDate, setSatDate] = useState(new Date().toISOString().slice(0, 10));
  const [numRounds, setNumRounds] = useState(4);
  const [heatRound, setHeatRound] = useState(0);
  const [heatStep, setHeatStep] = useState(0);
  const [heatTeams, setHeatTeams] = useState<SatHeatTeam[]>(
    Array.from({ length: 4 }, (_, i) => ({
      name: 'Team ' + (i + 1),
      members: ['', ''],
      subs: ['', ''],
      seed: null,
    }))
  );
  const [heatGrid, setHeatGrid] = useState<(number | null)[][][]>(
    Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => Array(4).fill(null)))
  );
  const [heatPen, setHeatPen] = useState<number[][][]>(
    Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => Array(4).fill(0)))
  );
  const [heatOrder, setHeatOrder] = useState<'A' | 'B'>('A');
  const [heatPlayerMap, setHeatPlayerMap] = useState<number[][][] | null>(null);
  const [hDragSrc, setHDragSrc] = useState<{ ri: number; ti: number; ei: number } | null>(null);
  const [advCount, setAdvCount] = useState(2);
  const [showHeatEntry, setShowHeatEntry] = useState(false);
  const [editAdvHeat, setEditAdvHeat] = useState<{ round: number; idx: number } | null>(null);
  const [editAdvCount, setEditAdvCount] = useState(2);

  const sats = (data.sats ?? []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const curSat = selSat ? sats.find((s) => (s.id ?? s._id) === selSat) ?? null : null;

  const startEditSat = (sat: Sat) => {
    auth.req(() => {
      setEditingSat(true);
      setESatName(sat.name);
      setESatDate(sat.date);
      setESatRounds(sat.rounds ?? 4);
      setESatRoster(
        (sat.roster ?? []).map((t) => ({
          p1: t.members[0] ?? '',
          p2: t.members[1] ?? '',
          seed: t.seed ?? null,
          sub1: (t.subs ?? [])[0] ?? '',
          sub2: (t.subs ?? [])[1] ?? '',
        }))
      );
    });
  };

  const saveEditSat = () => {
    if (!curSat) return;
    auth.req(async () => {
      const roster = eSatRoster
        .filter((t) => t.p1 && t.p2)
        .map((t) => ({
          name: t.p1.split(' ')[0] + ' & ' + t.p2.split(' ')[0],
          members: [t.p1, t.p2],
          subs: [t.sub1 || '', t.sub2 || ''],
          seed: t.seed,
        }));
      const seedMap: Record<string, number> = {};
      roster.forEach((t) => {
        if (t.seed) seedMap[t.name] = t.seed;
      });
      const sid = curSat.id ?? curSat._id ?? '';
      for (const h of curSat.heats ?? []) {
        if (h.actId) {
          const rd = h.round ?? 0;
          const correctDate = getRoundDate(eSatDate, rd);
          try {
            const acts = await fsGet<{ id?: string; _id?: string; date?: string }>('acts');
            const act = acts.find((a) => (a.id ?? a._id) === h.actId);
            if (act && act.date !== correctDate) {
              await fsSet('acts', h.actId, { ...act, date: correctDate, id: h.actId });
            }
          } catch {
            // ignore
          }
        }
      }
      await ops.updateSat(sid,{ name: eSatName.trim(), date: eSatDate, rounds: eSatRounds, roster, seeds: seedMap });
      setEditingSat(false);
      showToast('SAT updated! Elo recalculated.');
    });
  };

  const addRosterTeam = () =>
    setSatRoster([...satRoster, { p1: '', p2: '', seed: satRoster.length + 1, sub1: '', sub2: '' }]);
  const updateRosterTeam = (idx: number, field: keyof RosterRow, val: string | number | null) => {
    const r = satRoster.map((t) => ({ ...t }));
    (r[idx] as Record<string, unknown>)[field] = val;
    setSatRoster(r);
  };
  const removeRosterTeam = (idx: number) => setSatRoster(satRoster.filter((_, i) => i !== idx));

  const resetHeat = (ri: number, satObj: Sat | null) => {
    setHeatRound(ri);
    setHeatStep(0);
    let prefill: SatHeatTeam[] = Array.from({ length: 4 }, (_, i) => ({
      name: 'Team ' + (i + 1),
      members: ['', ''],
      subs: ['', ''],
      seed: null,
    }));
    if (ri > 0 && satObj) {
      const prevAdv = (satObj.heats ?? [])
        .filter((h) => h.round === ri - 1)
        .flatMap((h) => h.advanced ?? []);
      for (let i = 0; i < 4 && i < prevAdv.length; i++) {
        prefill[i] = {
          name: prevAdv[i].name ?? '',
          members: [...(prevAdv[i].members ?? ['', ''])],
          subs: ['', ''],
          seed: prevAdv[i].seed ?? null,
        };
      }
    }
    setHeatTeams(prefill);
    setHeatGrid(Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => Array(4).fill(null))));
    setHeatPen(Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => Array(4).fill(0))));
    setHeatOrder('A');
    setAdvCount(ri === 0 ? 3 : 2);
    setHeatPlayerMap(null);
    setShowHeatEntry(true);
  };

  const hHandleDrop = (ri: number, ti: number, ei: number) => {
    if (!hDragSrc || hDragSrc.ri !== ri || hDragSrc.ti !== ti) {
      setHDragSrc(null);
      return;
    }
    const m = (heatPlayerMap ?? getDefMap4(heatOrder)).map((r) => r.map((t) => [...t]));
    const tmp = m[ri][ti][ei];
    m[ri][ti][ei] = m[ri][ti][hDragSrc.ei];
    m[ri][ti][hDragSrc.ei] = tmp;
    setHeatPlayerMap(m);
    setHDragSrc(null);
  };

  const hCurMap = heatPlayerMap ?? getDefMap4(heatOrder);

  const toggleHP = (ri: number, ti: number, ei: number) => {
    const m = (heatPlayerMap ?? getDefMap4(heatOrder)).map((r) => r.map((t) => [...t]));
    const cur = m[ri][ti][ei];
    const next = cur === 0 ? 1 : 0;
    const otherIdx = m[ri][ti].findIndex((v, i) => i !== ei && v === next);
    if (otherIdx === -1) m[ri][ti][ei] = next;
    else {
      m[ri][ti][ei] = next;
      m[ri][ti][otherIdx] = cur;
    }
    setHeatPlayerMap(m);
  };

  const setHC = (ri: number, ti: number, ei: number, val: number | null) => {
    const g = heatGrid.map((r) => r.map((t) => [...t]));
    g[ri][ti][ei] = val;
    setHeatGrid(g);
  };
  const setHP = (ri: number, ti: number, ei: number, val: number) => {
    const p = heatPen.map((r) => r.map((t) => [...t]));
    p[ri][ti][ei] = val;
    setHeatPen(p);
  };
  const hRT = (ri: number, ti: number) =>
    (heatGrid[ri]?.[ti] ?? []).reduce((s: number, v) => s + (v ?? 0), 0) +
    (heatPen[ri]?.[ti] ?? []).reduce((s: number, v) => s + v * -2, 0);
  const hGT = (ti: number) =>
    heatGrid.reduce(
      (s: number, r, ri) =>
        s +
        (r[ti] ?? []).reduce((s2: number, v) => s2 + (v ?? 0), 0) +
        (heatPen[ri]?.[ti] ?? []).reduce((s2: number, v) => s2 + v * -2, 0),
      0
    );
  const allHF = heatGrid.every((r) => (r ?? []).every((t) => (t ?? []).every((v) => v !== null)));
  const allHTOk = heatTeams.every((t) => (t.members ?? []).every((m) => m.trim()));

  const buildHR = () => {
    const races: { raceNum: number; results: { player: string; points: number }[] }[] = [];
    let n = 1;
    const m = hCurMap;
    for (let ri = 0; ri < 4; ri++) {
      for (let h = 0; h < 4; h++) {
        const res: { player: string; points: number }[] = [];
        for (let ti = 0; ti < 4; ti++) {
          const mi = m[ri][ti][h];
          const mem = heatTeams[ti]?.members ?? ['', ''];
          const subs = heatTeams[ti]?.subs ?? ['', ''];
          const pName = mi < 2 && subs[mi] ? subs[mi] : mem[mi] ?? 'P';
          res.push({ player: pName, points: heatGrid[ri]?.[ti]?.[h] ?? 0 });
        }
        res.sort((a, b) => b.points - a.points);
        races.push({ raceNum: n, results: res });
        n++;
      }
    }
    return races;
  };

  const createSat = () => {
    auth.req(async () => {
      if (!satName.trim()) return;
      const roster = satRoster
        .filter((t) => t.p1 && t.p2)
        .map((t) => ({
          name: t.p1.split(' ')[0] + ' & ' + t.p2.split(' ')[0],
          members: [t.p1, t.p2],
          subs: [t.sub1 || '', t.sub2 || ''],
          seed: t.seed,
        }));
      const seedMap: Record<string, number> = {};
      roster.forEach((t) => {
        if (t.seed) seedMap[t.name] = t.seed;
      });
      await ops.addSat({
        id: gid(),
        name: satName.trim(),
        date: satDate,
        type: '8man',
        teams: [],
        races: [],
        rounds: numRounds,
        heats: [],
        seeds: seedMap,
        roster,
      } as unknown as Sat);
      showToast('SAT created!');
      setSatName('');
      setSatRoster([]);
      setMode('list');
    });
  };

  const deleteSat = (id: string) => {
    auth.req(async () => {
      if (!confirm('Delete this SAT and all its heats?')) return;
      const sat = sats.find((s) => (s.id ?? s._id) === id);
      if (sat?.heats) {
        for (const h of sat.heats) {
          if (h.actId) try { await ops.deleteAct(h.actId); } catch {}
        }
      }
      await ops.deleteSat(id);
      showToast('Deleted!');
      setSelSat(null);
      setMode('list');
    });
  };

  const deleteHeat = (satObj: Sat, heatIdx: number) => {
    auth.req(async () => {
      if (!confirm('Delete this heat? It will be removed everywhere.')) return;
      const h = satObj.heats?.[heatIdx];
      if (h?.actId) try { await ops.deleteAct(h.actId); } catch {}
      const newHeats = (satObj.heats ?? []).filter((_, i) => i !== heatIdx);
      await ops.updateSat(satObj.id ?? satObj._id ?? '', { heats: newHeats });
      showToast('Heat deleted!');
    });
  };

  const updateAdvancing = (satObj: Sat, heatIdx: number, newCount: number) => {
    auth.req(async () => {
      const h = { ...satObj.heats![heatIdx] };
      const ranked = [...(h.scores ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      h.advanced = ranked.slice(0, newCount).map((s) => {
        const tm = (h.teams ?? []).find((t) => t.name === s.name);
        return tm ? { ...tm, score: s.score } : { name: s.name, members: [], score: s.score };
      });
      h.advanceCount = newCount;
      const newHeats = satObj.heats!.map((x, i) => (i === heatIdx ? h : x));
      await ops.updateSat(satObj.id ?? satObj._id ?? '', { heats: newHeats });
      showToast('Updated!');
      setEditAdvHeat(null);
    });
  };

  const saveHeat = async () => {
    if (!curSat) return;
    auth.req(async () => {
      let cp: { name: string }[];
      try {
        cp = await fsGet('players');
      } catch {
        cp = data.players;
      }
      const en = new Set(cp.map((p) => p.name.toLowerCase()));
      for (const name of heatTeams.flatMap((t) => [...(t.members ?? []), ...(t.subs ?? [])].filter(Boolean))) {
        if (!en.has(name.toLowerCase())) {
          const id = gid();
          try {
            await fsSet('players', id, { name, id, active: true });
          } catch {}
          en.add(name.toLowerCase());
        }
      }
      const finalTeams = heatTeams.map((t) => ({ ...t, name: autoTeamName(t.members ?? []) || t.name }));
      const actId = gid();
      const rn = heatRound < RN.length ? RN[heatRound] : 'Round ' + (heatRound + 1);
      const hNum = (curSat.heats ?? []).filter((h) => h.round === heatRound).length + 1;
      const actData = {
        id: actId,
        name: curSat.name + ' - ' + rn + ' H' + hNum,
        date: getRoundDate(curSat.date, heatRound),
        type: '8man' as const,
        satId: curSat.id ?? curSat._id,
        satRound: heatRound,
        teams: finalTeams.map((t) => ({
          name: t.name,
          members: [...(t.members ?? [])],
          subs: [...(t.subs ?? ['', ''])],
        })),
        races: buildHR(),
        gridJson: JSON.stringify(heatGrid),
        penaltiesJson: JSON.stringify(heatPen),
        playerMapJson: JSON.stringify(hCurMap),
        raceOrder: heatOrder,
      };
      try {
        await fsSet('acts', actId, actData);
      } catch (e) {
        console.error(e);
      }
      const ranked = finalTeams
        .map((t, ti) => ({ ...t, ti, score: hGT(ti) }))
        .sort((a, b) => b.score - a.score);
      const adv = ranked
        .slice(0, advCount)
        .map((t) => ({
          name: t.name,
          members: [...(t.members ?? [])],
          subs: [...(t.subs ?? ['', ''])],
          score: t.score,
          seed: t.seed,
        }));
      const sid = curSat.id ?? curSat._id ?? '';
      const newH: SatHeat = {
        actId,
        round: heatRound,
        advanceCount: advCount,
        teams: finalTeams.map((t) => ({ name: t.name, members: [...(t.members ?? [])], seed: t.seed })),
        advanced: adv,
        scores: ranked.map((t) => ({ name: t.name, score: t.score, seed: t.seed })),
      };
      let seedUpdate: { seeds?: Record<string, number> } = {};
      if (heatRound === 0) {
        const seeds = { ...(curSat.seeds ?? {}) };
        finalTeams.forEach((t) => {
          if (t.seed && t.name) seeds[t.name] = t.seed;
        });
        seedUpdate = { seeds };
      }
      await ops.updateSat(sid, { heats: [...(curSat.heats ?? []), newH], ...seedUpdate });
      const hScores = finalTeams
        .map((t, ti) => ({ name: t.name, score: hGT(ti) }))
        .sort((a, b) => b.score - a.score);
      if (hScores.length >= 2 && hScores[0].score === hScores[1].score) {
        showToast('Heat saved! Tie detected - set tiebreaker in ACT detail.');
      } else {
        showToast('Heat saved! ' + adv.map((t) => t.name).join(', ') + ' advance');
      }
      setShowHeatEntry(false);
    });
  };

  // === LIST ===
  if (mode === 'list' && !selSat) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
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
        <div style={cHead}>
          <span style={cTitle}>{'🏆'} SAT Tournaments</span>
          <button onClick={() => auth.req(() => setMode('create'))} style={priBtn}>
            + New SAT
          </button>
        </div>
        {sats.length === 0 ? (
          <div style={card}>
            <div style={{ textAlign: 'center', color: '#444', fontFamily: FONT_MONO, fontSize: 13, padding: '32px 0' }}>
              No SATs yet
            </div>
          </div>
        ) : (
          sats.map((sat) => {
            const sid = sat.id ?? sat._id ?? '';
            const hc = (sat.heats ?? []).length;
            const w = sat.placements?.winner?.[0];
            return (
              <div
                key={sid}
                style={{
                  ...card,
                  marginBottom: 12,
                  cursor: 'pointer',
                  borderLeft: w ? '3px solid #f5a623' : '3px solid #c084fc',
                }}
                onClick={() => {
                  setSelSat(sid);
                  setMode('detail');
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: FONT_HEADER, fontSize: 20, color: '#f0e6d3' }}>{sat.name}</div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555' }}>
                      {sat.date} - {hc} heats - {sat.rounds ?? 4} rounds
                    </div>
                    {w && (
                      <div style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#f5a623', marginTop: 4 }}>
                        {'🏆'} {(w as PlacementTeam & { name?: string }).name}
                      </div>
                    )}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteSat(sid); }} style={delBtn}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* SAT Player Stats */}
        <div style={{ ...card, marginTop: 16 }}>
          <div style={cTitle}>📊 SAT Player Stats</div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#556', marginBottom: 12 }}>
            Aggregated across all SATs
          </div>
          {(() => {
            const playerStats: Record<
              string,
              {
                name: string;
                satsPlayed: number;
                heats: number;
                pts: number;
                adv: number;
                qf: number;
                semi: number;
                finals: number;
                satWins: number;
              }
            > = {};
            (data.sats ?? []).forEach((sat) => {
              const rounds = sat.rounds ?? 4;
              const satPlayers: Record<string, { heats: number; pts: number; adv: number; roundsPlayed: Record<number, boolean> }> = {};
              (sat.heats ?? []).forEach((heat) => {
                const rd = heat.round ?? 0;
                (heat.teams ?? []).forEach((tm) => {
                  const members = [...(tm.members ?? []), ...((tm.subs ?? []).filter(Boolean))];
                  members.forEach((name) => {
                    if (!name) return;
                    if (!satPlayers[name]) satPlayers[name] = { heats: 0, pts: 0, adv: 0, roundsPlayed: {} };
                    satPlayers[name].heats++;
                    satPlayers[name].roundsPlayed[rd] = true;
                  });
                });
                (heat.scores ?? []).forEach((score) => {
                  const tm = (heat.teams ?? []).find((t) => t.name === score.name);
                  if (!tm) return;
                  const members = [...(tm.members ?? []), ...((tm.subs ?? []).filter(Boolean))];
                  members.forEach((name) => {
                    if (name && satPlayers[name]) satPlayers[name].pts += score.score ?? 0;
                  });
                });
                (heat.advanced ?? []).forEach((a) => {
                  const members = [...(a.members ?? []), ...((a.subs ?? []).filter(Boolean))];
                  members.forEach((name) => {
                    if (name && satPlayers[name]) satPlayers[name].adv++;
                  });
                });
              });
              Object.keys(satPlayers).forEach((name) => {
                if (!playerStats[name])
                  playerStats[name] = {
                    name,
                    satsPlayed: 0,
                    heats: 0,
                    pts: 0,
                    adv: 0,
                    qf: 0,
                    semi: 0,
                    finals: 0,
                    satWins: 0,
                  };
                const sp = satPlayers[name];
                playerStats[name].satsPlayed++;
                playerStats[name].heats += sp.heats;
                playerStats[name].pts += sp.pts;
                playerStats[name].adv += sp.adv;
                if (sp.roundsPlayed[Math.max(rounds - 3, 1)]) playerStats[name].qf++;
                if (sp.roundsPlayed[rounds - 2]) playerStats[name].semi++;
                if (sp.roundsPlayed[rounds - 1]) playerStats[name].finals++;
              });
              if (sat.placements?.winner) {
                sat.placements.winner.forEach((t) => {
                  const members = [...(t.members ?? []), ...((t.subs ?? []).filter(Boolean))];
                  members.forEach((name) => {
                    if (name && playerStats[name]) playerStats[name].satWins++;
                  });
                });
              }
            });
            const sorted = Object.values(playerStats).sort((a, b) => b.pts - a.pts);
            if (sorted.length === 0)
              return (
                <div style={{ textAlign: 'center', color: '#444', fontFamily: FONT_MONO, fontSize: 13, padding: '32px 0' }}>
                  No SAT data yet
                </div>
              );
            return (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxHeight: 500,
                  overflowY: 'auto',
                }}
              >
                {sorted.map((p, i) => {
                  const avg = p.heats > 0 ? (p.pts / p.heats).toFixed(1) : '0';
                  return (
                    <div
                      key={p.name}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '36px 1fr auto',
                        gap: 8,
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: i < 3 ? 'rgba(42,80,130,0.1)' : 'rgba(18,22,30,0.3)',
                        border:
                          i === 0 ? '1.5px solid rgba(90,150,190,0.3)' : '1px solid rgba(34,42,54,0.5)',
                        borderRadius: 6,
                      }}
                    >
                      <div
                        style={{
                          textAlign: 'center',
                          fontFamily: FONT_HEADER,
                          fontSize: 14,
                          color:
                            i === 0 ? '#f5a623' : i === 1 ? '#c8bfa8' : i === 2 ? '#cd7f32' : '#4a5a6a',
                        }}
                      >
                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : '#' + (i + 1)}
                      </div>
                      <div>
                        <div style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#e0e4ea' }}>
                          {p.name}
                          {p.satWins > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 9, color: '#f5a623' }}>
                              {'🏆'}x{p.satWins}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            color: '#556',
                            display: 'flex',
                            gap: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>{p.satsPlayed} SATs</span>
                          <span>{p.heats} heats</span>
                          <span>{avg} avg pts</span>
                          <span>{p.qf} QF</span>
                          <span>{p.semi} SF</span>
                          <span>{p.finals} Finals</span>
                        </div>
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4,auto)',
                          gap: 8,
                          textAlign: 'right',
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: FONT_MONO, fontSize: 7, color: '#3a4a5a' }}>PTS</div>
                          <div style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#6aca6a' }}>
                            {p.pts}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: FONT_MONO, fontSize: 7, color: '#3a4a5a' }}>AVG</div>
                          <div style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#aa7aca' }}>
                            {avg}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: FONT_MONO, fontSize: 7, color: '#3a4a5a' }}>
                            FINALS
                          </div>
                          <div style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#caa040' }}>
                            {p.finals}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontFamily: FONT_MONO, fontSize: 7, color: '#3a4a5a' }}>WINS</div>
                          <div style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#e94560' }}>
                            {p.satWins}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // === CREATE ===
  if (mode === 'create') {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={card}>
          <div style={cTitle}>{'🏆'} New SAT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16, marginBottom: 16 }}>
            <div>
              <label style={lbl}>Name</label>
              <input
                style={inp}
                value={satName}
                onChange={(e) => setSatName(e.target.value)}
                placeholder="Spring 2026 SAT"
              />
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input style={inp} type="date" value={satDate} onChange={(e) => setSatDate(e.target.value)} />
            </div>
          </div>
          <label style={lbl}>Rounds</label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setNumRounds(n)}
                style={{
                  flex: 1,
                  background: numRounds === n ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.03)',
                  border: numRounds === n ? '1px solid #e94560' : '1px solid rgba(255,255,255,0.06)',
                  borderRadius: 6,
                  padding: 8,
                  fontFamily: FONT_HEADER,
                  fontSize: 14,
                  color: numRounds === n ? '#e94560' : '#666',
                  cursor: 'pointer',
                }}
              >
                {n}
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ ...lbl, margin: 0 }}>Team Roster ({satRoster.length} teams)</label>
              <button
                onClick={addRosterTeam}
                style={{
                  background: 'rgba(192,132,252,0.1)',
                  border: '1px solid rgba(192,132,252,0.3)',
                  borderRadius: 6,
                  padding: '4px 12px',
                  fontSize: 10,
                  fontFamily: FONT_MONO,
                  color: '#c084fc',
                  cursor: 'pointer',
                }}
              >
                + Add Team
              </button>
            </div>
            {satRoster.length === 0 ? (
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  color: '#444',
                  padding: '12px 0',
                  textAlign: 'center',
                }}
              >
                No teams yet — click Add Team to start building your bracket
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  maxHeight: 400,
                  overflowY: 'auto',
                }}
              >
                {satRoster.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '35px 1fr 1fr 1fr 1fr 30px',
                      gap: 6,
                      alignItems: 'center',
                      padding: '6px 8px',
                      background: 'rgba(255,255,255,0.02)',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.04)',
                    }}
                  >
                    <input
                      style={{ ...inp, fontSize: 12, padding: '4px', textAlign: 'center', width: 30 }}
                      type="number"
                      value={t.seed ?? ''}
                      onChange={(e) =>
                        updateRosterTeam(i, 'seed', e.target.value ? parseInt(e.target.value) : null)
                      }
                      placeholder="#"
                    />
                    <input
                      style={{ ...inp, fontSize: 11, padding: '4px 6px' }}
                      value={t.p1}
                      onChange={(e) => updateRosterTeam(i, 'p1', e.target.value)}
                      placeholder="Player 1"
                      list="plist"
                    />
                    <input
                      style={{ ...inp, fontSize: 11, padding: '4px 6px' }}
                      value={t.p2}
                      onChange={(e) => updateRosterTeam(i, 'p2', e.target.value)}
                      placeholder="Player 2"
                      list="plist"
                    />
                    <input
                      style={{ ...inp, fontSize: 10, padding: '4px 6px', borderColor: 'rgba(192,132,252,0.2)' }}
                      value={t.sub1}
                      onChange={(e) => updateRosterTeam(i, 'sub1', e.target.value)}
                      placeholder="Sub 1"
                      list="plist"
                    />
                    <input
                      style={{ ...inp, fontSize: 10, padding: '4px 6px', borderColor: 'rgba(192,132,252,0.2)' }}
                      value={t.sub2}
                      onChange={(e) => updateRosterTeam(i, 'sub2', e.target.value)}
                      placeholder="Sub 2"
                      list="plist"
                    />
                    <button onClick={() => removeRosterTeam(i)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <datalist id="plist">
              {data.players.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button
              style={secBtn}
              onClick={() => {
                setMode('list');
                setSatRoster([]);
              }}
            >
              Cancel
            </button>
            <button style={priBtn} onClick={createSat}>
              Create SAT
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === DETAIL ===
  if (curSat) {
    const heats = curSat.heats ?? [];
    const rounds = curSat.rounds ?? 4;
    const seeds = curSat.seeds ?? {};

    const bracketData = Array.from({ length: rounds }).map((_, ri) => {
      const rHeats = heats.filter((h) => h.round === ri);
      const allTeams = rHeats.flatMap((h) =>
        (h.scores ?? []).map((s) => ({
          ...s,
          advanced: !!(h.advanced ?? []).find((a) => a.name === s.name),
          seed: seeds[s.name ?? ''] ?? s.seed ?? null,
        }))
      );
      return { round: ri, name: ri < RN.length ? RN[ri] : 'Round ' + (ri + 1), heats: rHeats, teams: allTeams };
    });

    const placementOrder = ['winner', 'runnerUp', 'finalist', 'semi', 'round2'] as const;
    const plLabels: Record<string, string> = {
      winner: 'Champion',
      runnerUp: 'Runner-up',
      finalist: 'Finalist',
      semi: 'Semifinalist',
      round2: 'Round 2',
    };
    const plColors: Record<string, string> = {
      winner: '#f5a623',
      runnerUp: '#c8bfa8',
      finalist: '#8be9fd',
      semi: '#c084fc',
      round2: '#666',
    };
    let allPlacedTeams: Array<{ name: string; placement: string; plLabel: string; totalPts: number; seed: number | null; members?: string[] }> = [];
    if (curSat.placements) {
      placementOrder.forEach((pl) => {
        ((curSat.placements as Record<string, Array<PlacementTeam & { name?: string }>>)[pl] ?? []).forEach((t) => {
          const name = t.name ?? '';
          const totalPts = heats
            .filter((h) => (h.scores ?? []).find((s) => s.name === name))
            .reduce((s, h) => {
              const sc = (h.scores ?? []).find((x) => x.name === name);
              return s + (sc?.score ?? 0);
            }, 0);
          allPlacedTeams.push({
            ...t,
            name,
            placement: pl,
            plLabel: plLabels[pl],
            totalPts,
            seed: seeds[name] ?? null,
          });
        });
      });
    }
    allPlacedTeams.sort((a, b) => {
      const ai = placementOrder.indexOf((a.placement ?? '') as (typeof placementOrder)[number]);
      const bi = placementOrder.indexOf((b.placement ?? '') as (typeof placementOrder)[number]);
      if (ai !== bi) return ai - bi;
      return b.totalPts - a.totalPts;
    });

    return (
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <button
          style={{
            background: 'none',
            border: 'none',
            color: '#e94560',
            fontFamily: FONT_HEADER,
            fontSize: 14,
            cursor: 'pointer',
            marginBottom: 16,
          }}
          onClick={() => {
            setSelSat(null);
            setMode('list');
          }}
        >
          {'←'} Back
        </button>

        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(192,132,252,0.15) 0%, rgba(233,69,96,0.1) 100%)',
            border: '2px solid rgba(192,132,252,0.3)',
            borderRadius: 14,
            padding: '20px 24px',
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 36 }}>{'🏆'}</div>
            <button
              onClick={() => startEditSat(curSat)}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 9,
                fontFamily: FONT_MONO,
                color: '#888',
                cursor: 'pointer',
              }}
            >
              Edit SAT
            </button>
          </div>
          <div style={{ fontFamily: FONT_HEADER, fontSize: 28, color: '#c084fc', letterSpacing: 3 }}>
            {curSat.name}
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#a09880', marginTop: 6 }}>
            {curSat.date} - {heats.length} heats
          </div>
          {curSat.placements?.winner?.[0] && (
            <div style={{ fontFamily: FONT_HEADER, fontSize: 18, color: '#f5a623', marginTop: 8 }}>
              Champion: {(curSat.placements.winner[0] as PlacementTeam & { name?: string }).name}
            </div>
          )}
        </div>

        {/* Master Roster */}
        {curSat.roster && curSat.roster.length > 0 && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={cTitle}>Team Roster ({curSat.roster.length} teams)</div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))',
                gap: 6,
                marginTop: 8,
              }}
            >
              {curSat.roster
                .sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99))
                .map((t, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.04)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#f0e6d3' }}>
                        {t.seed ? '(' + t.seed + ') ' : ''}
                        {t.name}
                      </div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#555' }}>
                        {(t.members ?? []).join(' & ')}
                      </div>
                      {(t.subs ?? []).filter(Boolean).length > 0 && (
                        <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#c084fc' }}>
                          Subs: {t.subs!.filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* BRACKET VIEW */}
        <div style={{ ...card, marginBottom: 16, overflowX: 'auto' }}>
          <div style={cTitle}>Bracket</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rounds},1fr)`, gap: 8, minWidth: rounds * 180 }}>
            {bracketData.map((rd, ri) => (
              <div
                key={ri}
                style={{
                  borderLeft: ri > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  paddingLeft: ri > 0 ? 8 : 0,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_HEADER,
                    fontSize: 13,
                    color: ri === rounds - 1 ? '#f5a623' : '#c084fc',
                    marginBottom: 8,
                    textAlign: 'center',
                  }}
                >
                  {rd.name}
                </div>
                {rd.teams.length === 0 ? (
                  <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#333', textAlign: 'center' }}>
                    —
                  </div>
                ) : (
                  rd.teams.map((t, ti) => (
                    <div
                      key={ti}
                      style={{
                        padding: '4px 8px',
                        marginBottom: 3,
                        borderRadius: 4,
                        background: t.advanced ? 'rgba(80,250,123,0.08)' : 'rgba(255,255,255,0.02)',
                        borderLeft: t.advanced ? '2px solid #50fa7b' : '2px solid transparent',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <span
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 10,
                            color: t.advanced ? '#50fa7b' : '#555',
                          }}
                        >
                          {t.seed ? '(' + t.seed + ') ' : ''}
                          {t.name}
                        </span>
                      </div>
                      <span
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 11,
                          color: t.advanced ? '#50fa7b' : '#444',
                        }}
                      >
                        {t.score}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Placement Rankings */}
        {allPlacedTeams.length > 0 && (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={cTitle}>Final Rankings</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allPlacedTeams.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '30px 100px 1fr 60px 60px',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: i === 0 ? 'rgba(245,166,35,0.08)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_HEADER,
                      fontSize: 14,
                      color: i === 0 ? '#f5a623' : i === 1 ? '#c8bfa8' : '#666',
                      textAlign: 'center',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 9,
                      color: plColors[t.placement] ?? '#555',
                      padding: '2px 6px',
                      background: 'rgba(255,255,255,0.03)',
                      borderRadius: 3,
                      textAlign: 'center',
                    }}
                  >
                    {t.plLabel}
                  </span>
                  <div>
                    <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#f0e6d3' }}>
                      {t.seed ? '(' + t.seed + ') ' : ''}
                      {t.name}
                    </span>
                    {t.members && (
                      <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#444', marginLeft: 6 }}>
                        {(t.members ?? []).join(' & ')}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#e94560', textAlign: 'right' }}>
                    {t.totalPts}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#555', textAlign: 'right' }}>
                    pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rounds with heats */}
        {Array.from({ length: rounds }).map((_, ri) => {
          const rn = ri < RN.length ? RN[ri] : 'Round ' + (ri + 1);
          const rH = heats.filter((h) => h.round === ri);
          return (
            <div key={ri} style={{ ...card, marginBottom: 12 }}>
              <div style={cHead}>
                <span style={cTitle}>
                  {ri === rounds - 1 ? '👑' : ri === rounds - 2 ? '🔥' : '🏁'} {rn}
                </span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={cSub}>
                    {rH.length} heat{rH.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => auth.req(() => resetHeat(ri, curSat))}
                    style={{
                      background: 'rgba(192,132,252,0.1)',
                      border: '1px solid rgba(192,132,252,0.3)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 9,
                      fontFamily: FONT_MONO,
                      color: '#c084fc',
                      cursor: 'pointer',
                    }}
                  >
                    + Heat
                  </button>
                </div>
              </div>
              {rH.length === 0 ? (
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#444', padding: '8px 0' }}>
                  No heats yet
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))',
                    gap: 8,
                  }}
                >
                  {rH.map((h, hi) => {
                    const globalHi = heats.indexOf(h);
                    return (
                      <div
                        key={hi}
                        style={{
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(106,96,64,0.25)',
                          borderRadius: 8,
                          padding: 10,
                          position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span
                            style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#f0e6d3', cursor: 'pointer' }}
                            onClick={() => {
                              if (h.actId) {
                                setSelAct(h.actId);
                                setView('actdetail');
                              }
                            }}
                          >
                            Heat {hi + 1} {'→'}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteHeat(curSat, globalHi);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#555',
                              cursor: 'pointer',
                              fontSize: 12,
                              padding: '0 4px',
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        {(h.scores ?? []).map((s, si) => (
                          <div
                            key={si}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontFamily: FONT_MONO,
                              fontSize: 10,
                              padding: '1px 0',
                              color: (h.advanced ?? []).find((a) => a.name === s.name) ? '#50fa7b' : '#555',
                            }}
                          >
                            <span>
                              {s.seed ? '(' + s.seed + ') ' : ''}
                              {s.name}
                            </span>
                            <span>{s.score}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#c084fc' }}>
                            Adv: {(h.advanced ?? []).map((a) => a.name).join(', ')}
                          </span>
                          <button
                            onClick={() =>
                              auth.req(() => {
                                setEditAdvHeat({ round: ri, idx: globalHi });
                                setEditAdvCount(h.advanceCount ?? (h.advanced ?? []).length ?? 2);
                              })
                            }
                            style={{
                              fontFamily: FONT_MONO,
                              fontSize: 7,
                              color: '#555',
                              background: 'none',
                              border: '1px solid rgba(255,255,255,0.06)',
                              borderRadius: 3,
                              padding: '1px 4px',
                              cursor: 'pointer',
                            }}
                          >
                            edit adv
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Edit advancing modal */}
        {editAdvHeat && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
            }}
          >
            <div
              style={{
                background: '#141418',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 16,
                padding: 28,
                maxWidth: 300,
                width: '90%',
              }}
            >
              <div style={{ fontFamily: FONT_HEADER, fontSize: 16, color: '#f0e6d3', marginBottom: 12 }}>
                Change Advancing Teams
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setEditAdvCount(n)}
                    style={{
                      flex: 1,
                      background: editAdvCount === n ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.03)',
                      border: editAdvCount === n ? '1px solid #e94560' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 6,
                      padding: 8,
                      fontFamily: FONT_HEADER,
                      fontSize: 14,
                      color: editAdvCount === n ? '#e94560' : '#666',
                      cursor: 'pointer',
                    }}
                  >
                    Top {n}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button style={secBtn} onClick={() => setEditAdvHeat(null)}>
                  Cancel
                </button>
                <button style={priBtn} onClick={() => updateAdvancing(curSat, editAdvHeat.idx, editAdvCount)}>
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Placements (Auto) */}
        {heats.length > 0 &&
          (() => {
            const fH = heats.filter((h) => h.round === rounds - 1);
            const sH = heats.filter((h) => h.round === rounds - 2);
            const r2H = heats.filter((h) => h.round === 1);
            const fTeams = fH.flatMap((h) => (h.scores ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)));
            const sElim = sH.flatMap((h) =>
              (h.scores ?? []).filter((s) => !(h.advanced ?? []).find((a) => a.name === s.name))
            );
            const r2Elim = r2H.flatMap((h) =>
              (h.scores ?? []).filter((s) => !(h.advanced ?? []).find((a) => a.name === s.name))
            );

            const autoP: Record<string, Array<{ name: string; members: string[]; subs?: string[] }>> = {};
            if (fTeams.length >= 1)
              autoP.winner = [fTeams[0]].map((s) => {
                const td = heats.flatMap((h) => h.teams ?? []).find((t) => t.name === s.name);
                return td ? { name: td.name ?? s.name ?? '', members: td.members ?? [] } : { name: s.name ?? '', members: [] };
              });
            if (fTeams.length >= 2)
              autoP.runnerUp = [fTeams[1]].map((s) => {
                const td = heats.flatMap((h) => h.teams ?? []).find((t) => t.name === s.name);
                return td ? { name: td.name ?? s.name ?? '', members: td.members ?? [] } : { name: s.name ?? '', members: [] };
              });
            if (fTeams.length >= 3)
              autoP.finalist = fTeams.slice(2).map((s) => {
                const td = heats.flatMap((h) => h.teams ?? []).find((t) => t.name === s.name);
                return td ? { name: td.name ?? s.name ?? '', members: td.members ?? [] } : { name: s.name ?? '', members: [] };
              });
            if (sElim.length > 0)
              autoP.semi = sElim.map((s) => {
                const td = heats.flatMap((h) => h.teams ?? []).find((t) => t.name === s.name);
                return td ? { name: td.name ?? s.name ?? '', members: td.members ?? [] } : { name: s.name ?? '', members: [] };
              });
            if (r2Elim.length > 0)
              autoP.round2 = r2Elim.map((s) => {
                const td = heats.flatMap((h) => h.teams ?? []).find((t) => t.name === s.name);
                return td ? { name: td.name ?? s.name ?? '', members: td.members ?? [] } : { name: s.name ?? '', members: [] };
              });

            const curPStr = JSON.stringify(curSat.placements ?? {});
            const newPStr = JSON.stringify(autoP);
            if (curPStr !== newPStr && fTeams.length > 0) {
              const sid = curSat.id ?? curSat._id ?? '';
              ops.updateSat(sid, { placements: autoP as Record<string, PlacementTeam[]> });
            }

            const plLabels2: Record<string, string> = {
              winner: 'Champion (+25)',
              runnerUp: 'Runner-up (+15)',
              finalist: 'Finalist (+12)',
              semi: 'Semifinalist (+8)',
              round2: 'Round 2 (+5)',
            };
            const plColors2: Record<string, string> = {
              winner: '#f5a623',
              runnerUp: '#c8bfa8',
              finalist: '#8be9fd',
              semi: '#c084fc',
              round2: '#666',
            };

            return fTeams.length > 0 ? (
              <div style={{ ...card, marginBottom: 12 }}>
                <div style={cTitle}>Placements (Auto)</div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#555', marginBottom: 8 }}>
                  Automatically calculated from results. Elo bonuses applied.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(['winner', 'runnerUp', 'finalist', 'semi', 'round2'] as const).map((pl) => {
                    const teams = autoP[pl] ?? [];
                    return teams.length > 0 ? (
                      <div
                        key={pl}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '4px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: FONT_HEADER,
                            fontSize: 11,
                            color: plColors2[pl],
                            width: 140,
                            flexShrink: 0,
                          }}
                        >
                          {plLabels2[pl]}
                        </span>
                        <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {teams.map((t, i) => (
                            <span
                              key={i}
                              style={{
                                fontFamily: FONT_MONO,
                                fontSize: 10,
                                color: plColors2[pl],
                                background: 'rgba(255,255,255,0.03)',
                                padding: '2px 8px',
                                borderRadius: 4,
                              }}
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            ) : null;
          })()}

        {/* EDIT SAT MODAL */}
        {editingSat && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 2000,
              overflowY: 'auto',
            }}
          >
            <div style={{ maxWidth: 800, margin: '24px auto', padding: 16 }}>
              <div style={{ ...card, maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={cHead}>
                  <span style={cTitle}>Edit SAT</span>
                  <button
                    onClick={() => setEditingSat(false)}
                    style={{ ...secBtn, padding: '6px 12px', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>Name</label>
                    <input style={inp} value={eSatName} onChange={(e) => setESatName(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Date</label>
                    <input
                      style={inp}
                      type="date"
                      value={eSatDate}
                      onChange={(e) => setESatDate(e.target.value)}
                    />
                  </div>
                </div>
                <label style={lbl}>Rounds</label>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  {[3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setESatRounds(n)}
                      style={{
                        flex: 1,
                        background: eSatRounds === n ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.03)',
                        border: eSatRounds === n ? '1px solid #e94560' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 6,
                        padding: 8,
                        fontFamily: FONT_HEADER,
                        fontSize: 14,
                        color: eSatRounds === n ? '#e94560' : '#666',
                        cursor: 'pointer',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ ...lbl, margin: 0 }}>Roster ({eSatRoster.length})</label>
                    <button
                      onClick={() =>
                        setESatRoster([
                          ...eSatRoster,
                          { p1: '', p2: '', seed: eSatRoster.length + 1, sub1: '', sub2: '' },
                        ])
                      }
                      style={{
                        background: 'rgba(192,132,252,0.1)',
                        border: '1px solid rgba(192,132,252,0.3)',
                        borderRadius: 6,
                        padding: '3px 10px',
                        fontSize: 9,
                        fontFamily: FONT_MONO,
                        color: '#c084fc',
                        cursor: 'pointer',
                      }}
                    >
                      + Team
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                    {eSatRoster.map((t, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '35px 1fr 1fr 1fr 1fr 24px',
                          gap: 4,
                          alignItems: 'center',
                        }}
                      >
                        <input
                          style={{ ...inp, fontSize: 10, padding: '3px', textAlign: 'center' }}
                          type="number"
                          value={t.seed ?? ''}
                          onChange={(e) => {
                            const r = eSatRoster.map((x) => ({ ...x }));
                            r[i].seed = e.target.value ? parseInt(e.target.value) : null;
                            setESatRoster(r);
                          }}
                          placeholder="#"
                        />
                        <input
                          style={{ ...inp, fontSize: 10, padding: '3px 5px' }}
                          value={t.p1}
                          onChange={(e) => {
                            const r = eSatRoster.map((x) => ({ ...x }));
                            r[i].p1 = e.target.value;
                            setESatRoster(r);
                          }}
                          placeholder="P1"
                          list="plist"
                        />
                        <input
                          style={{ ...inp, fontSize: 10, padding: '3px 5px' }}
                          value={t.p2}
                          onChange={(e) => {
                            const r = eSatRoster.map((x) => ({ ...x }));
                            r[i].p2 = e.target.value;
                            setESatRoster(r);
                          }}
                          placeholder="P2"
                          list="plist"
                        />
                        <input
                          style={{ ...inp, fontSize: 9, padding: '3px 5px', borderColor: 'rgba(192,132,252,0.2)' }}
                          value={t.sub1}
                          onChange={(e) => {
                            const r = eSatRoster.map((x) => ({ ...x }));
                            r[i].sub1 = e.target.value;
                            setESatRoster(r);
                          }}
                          placeholder="Sub1"
                          list="plist"
                        />
                        <input
                          style={{ ...inp, fontSize: 9, padding: '3px 5px', borderColor: 'rgba(192,132,252,0.2)' }}
                          value={t.sub2}
                          onChange={(e) => {
                            const r = eSatRoster.map((x) => ({ ...x }));
                            r[i].sub2 = e.target.value;
                            setESatRoster(r);
                          }}
                          placeholder="Sub2"
                          list="plist"
                        />
                        <button
                          onClick={() => setESatRoster(eSatRoster.filter((_, j) => j !== i))}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#555',
                            cursor: 'pointer',
                            fontSize: 12,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button style={secBtn} onClick={() => setEditingSat(false)}>
                    Cancel
                  </button>
                  <button style={priBtn} onClick={saveEditSat}>
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HEAT ENTRY MODAL */}
        {showHeatEntry && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(8px)',
              zIndex: 2000,
              overflowY: 'auto',
            }}
          >
            <div style={{ maxWidth: 900, margin: '24px auto', padding: 16 }}>
              <div style={{ ...card, maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={cHead}>
                  <span style={cTitle}>
                    {'🏆'} {heatRound < RN.length ? RN[heatRound] : 'Round ' + (heatRound + 1)} — New Heat
                  </span>
                  <button
                    onClick={() => setShowHeatEntry(false)}
                    style={{ ...secBtn, padding: '6px 12px', fontSize: 12 }}
                  >
                    ✕
                  </button>
                </div>
                {heatStep === 0 && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                      {heatTeams.map((t, ti) => {
                        const roster = curSat?.roster;
                        return (
                          <div
                            key={ti}
                            style={{
                              background: 'rgba(255,255,255,0.02)',
                              border: '2px solid ' + TC[ti],
                              borderRadius: 10,
                              padding: 10,
                            }}
                          >
                            {roster && roster.length > 0 && (
                              <div style={{ marginBottom: 6 }}>
                                <select
                                  style={{ ...inp, fontSize: 11, padding: '4px 6px', width: '100%', cursor: 'pointer' }}
                                  value={
                                    (t.members ?? [])[0] && (t.members ?? [])[1]
                                      ? (t.members ?? [])[0] + '||' + (t.members ?? [])[1]
                                      : ''
                                  }
                                  onChange={(e) => {
                                    if (!e.target.value) return;
                                    const [p1, p2] = e.target.value.split('||');
                                    const rt = roster.find((r) => r.members[0] === p1 && r.members[1] === p2);
                                    const c = heatTeams.map((x) => ({
                                      ...x,
                                      members: [...(x.members ?? [])],
                                      subs: [...(x.subs ?? ['', ''])],
                                    }));
                                    c[ti] = {
                                      name: autoTeamName([p1, p2]),
                                      members: [p1, p2],
                                      subs: rt ? [...(rt.subs ?? ['', ''])] : ['', ''],
                                      seed: rt?.seed ?? null,
                                    };
                                    setHeatTeams(c);
                                  }}
                                >
                                  <option value="">Pick team...</option>
                                  {roster.map((r, ri) => (
                                    <option key={ri} value={r.members[0] + '||' + r.members[1]}>
                                      {r.seed ? '(' + r.seed + ') ' : ''}
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {heatRound === 0 && !roster && (
                              <div style={{ marginBottom: 4 }}>
                                <label style={{ ...lbl, fontSize: 8 }}>Seed #</label>
                                <input
                                  style={{ ...inp, fontSize: 11, padding: '3px 6px', width: 50 }}
                                  type="number"
                                  value={t.seed ?? ''}
                                  onChange={(e) => {
                                    const c = heatTeams.map((x) => ({ ...x, members: [...(x.members ?? [])] }));
                                    c[ti].seed = e.target.value ? parseInt(e.target.value) : null;
                                    setHeatTeams(c);
                                  }}
                                  placeholder="#"
                                />
                              </div>
                            )}
                            {(t.members ?? []).map((m, mi) => (
                              <input
                                key={mi}
                                style={{ ...inp, fontSize: 12, marginTop: 4, padding: '6px 8px' }}
                                value={m}
                                onChange={(e) => {
                                  const c = heatTeams.map((x) => ({
                                    ...x,
                                    members: [...(x.members ?? [])],
                                    subs: [...(x.subs ?? ['', ''])],
                                  }));
                                  c[ti].members[mi] = e.target.value;
                                  setHeatTeams(c);
                                }}
                                onBlur={() => {
                                  const c = heatTeams.map((x) => ({
                                    ...x,
                                    members: [...(x.members ?? [])],
                                    subs: [...(x.subs ?? ['', ''])],
                                  }));
                                  c[ti].name = autoTeamName(c[ti].members ?? []) || c[ti].name;
                                  setHeatTeams(c);
                                }}
                                placeholder={'Player ' + (mi + 1)}
                                list="plist"
                              />
                            ))}
                            <div
                              style={{
                                fontFamily: FONT_MONO,
                                fontSize: 11,
                                color: '#666',
                                marginTop: 4,
                                textAlign: 'center',
                              }}
                            >
                              {autoTeamName(t.members ?? []) || t.name}
                            </div>
                            <div
                              style={{
                                borderTop: '1px dashed rgba(192,132,252,0.2)',
                                marginTop: 6,
                                paddingTop: 4,
                              }}
                            >
                              <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#c084fc', marginBottom: 2 }}>
                                SUB IN (optional)
                              </div>
                              {(t.members ?? []).map((m, mi) => {
                                const subVal = (t.subs ?? ['', ''])[mi] ?? '';
                                const pName = (m ?? '').split(' ')[0] || 'P' + (mi + 1);
                                return (
                                  <div
                                    key={'sub' + mi}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}
                                  >
                                    <span
                                      style={{
                                        fontFamily: FONT_MONO,
                                        fontSize: 9,
                                        color: subVal ? '#c084fc' : '#555',
                                        minWidth: 50,
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {pName} {'→'}
                                    </span>
                                    <input
                                      style={{
                                        ...inp,
                                        fontSize: 11,
                                        padding: '4px 6px',
                                        borderColor: subVal ? 'rgba(192,132,252,0.4)' : 'rgba(192,132,252,0.15)',
                                        flex: 1,
                                        background: subVal ? 'rgba(192,132,252,0.06)' : 'rgba(255,255,255,0.02)',
                                      }}
                                      value={subVal}
                                      onChange={(e) => {
                                        const c = heatTeams.map((x) => ({
                                          ...x,
                                          members: [...(x.members ?? [])],
                                          subs: [...(x.subs ?? ['', ''])],
                                        }));
                                        c[ti].subs![mi] = e.target.value;
                                        setHeatTeams(c);
                                      }}
                                      placeholder="no sub"
                                      list="plist"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <datalist id="plist">
                      {data.players.map((p) => (
                        <option key={p.name} value={p.name} />
                      ))}
                    </datalist>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Race Order</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setHeatOrder('A')}
                            style={{
                              flex: 1,
                              background: heatOrder === 'A' ? 'rgba(80,250,123,0.15)' : 'rgba(255,255,255,0.03)',
                              border: heatOrder === 'A' ? '1px solid #50fa7b' : '1px solid rgba(255,255,255,0.06)',
                              borderRadius: 6,
                              padding: 8,
                              fontFamily: FONT_MONO,
                              fontSize: 10,
                              color: heatOrder === 'A' ? '#50fa7b' : '#555',
                              cursor: 'pointer',
                            }}
                          >
                            A First
                          </button>
                          <button
                            onClick={() => setHeatOrder('B')}
                            style={{
                              flex: 1,
                              background: heatOrder === 'B' ? 'rgba(139,233,253,0.15)' : 'rgba(255,255,255,0.03)',
                              border: heatOrder === 'B' ? '1px solid #8be9fd' : '1px solid rgba(255,255,255,0.06)',
                              borderRadius: 6,
                              padding: 8,
                              fontFamily: FONT_MONO,
                              fontSize: 10,
                              color: heatOrder === 'B' ? '#8be9fd' : '#555',
                              cursor: 'pointer',
                            }}
                          >
                            B First
                          </button>
                        </div>
                      </div>
                      <div>
                        <label style={lbl}>Advancing</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[1, 2, 3].map((n) => (
                            <button
                              key={n}
                              onClick={() => setAdvCount(n)}
                              style={{
                                flex: 1,
                                background: advCount === n ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.03)',
                                border: advCount === n ? '1px solid #e94560' : '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 6,
                                padding: 8,
                                fontFamily: FONT_MONO,
                                fontSize: 10,
                                color: advCount === n ? '#e94560' : '#555',
                                cursor: 'pointer',
                              }}
                            >
                              Top {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button style={priBtn} disabled={!allHTOk} onClick={() => setHeatStep(1)}>
                        Next: Scores {'→'}
                      </button>
                    </div>
                  </div>
                )}
                {heatStep === 1 && (
                  <div>
                    <div style={{ overflowX: 'auto' }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '55px repeat(4,1fr) 55px',
                          gap: 0,
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 10,
                          overflow: 'hidden',
                          minWidth: 620,
                        }}
                      >
                        <div
                          style={{
                            padding: 8,
                            fontFamily: FONT_MONO,
                            fontSize: 11,
                            color: '#555',
                            textAlign: 'center',
                            background: 'rgba(255,255,255,0.02)',
                          }}
                        >
                          RND
                        </div>
                        {heatTeams.map((t, ti) => (
                          <div
                            key={ti}
                            style={{
                              padding: '8px 4px',
                              textAlign: 'center',
                              background: 'rgba(255,255,255,0.02)',
                              borderBottom: '3px solid ' + TC[ti],
                            }}
                          >
                            <div style={{ fontFamily: FONT_HEADER, fontSize: 15, color: '#f0e6d3' }}>
                              {autoTeamName(t.members ?? []) || t.name}
                            </div>
                            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555' }}>
                              {(t.members ?? []).join(' & ')}
                            </div>
                          </div>
                        ))}
                        <div
                          style={{
                            padding: 8,
                            fontFamily: FONT_MONO,
                            fontSize: 11,
                            color: '#555',
                            textAlign: 'center',
                            background: 'rgba(255,255,255,0.02)',
                          }}
                        >
                          TOT
                        </div>
                        {[0, 1, 2, 3].map((ri) => (
                          <Fragment key={ri}>
                            <div
                              style={{
                                padding: '8px 4px',
                                textAlign: 'center',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                              }}
                            >
                              <span style={{ fontFamily: FONT_HEADER, fontSize: 16, color: '#a09880' }}>
                                R{ri + 1}
                              </span>
                            </div>
                            {heatTeams.map((t, ti) => (
                              <div
                                key={ti}
                                style={{
                                  padding: '6px 4px',
                                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 3,
                                  borderLeft: '2px solid ' + TC[ti] + '22',
                                }}
                              >
                                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                  {heatGrid[ri][ti].map((val, ei) => {
                                    const cid = 'sh-' + ri + '-' + ti + '-' + ei;
                                    const nxt = () => {
                                      let nt = ti,
                                        ne = ei + 1;
                                      if (ne >= 4) {
                                        ne = 0;
                                        nt++;
                                      }
                                      if (nt >= 4) {
                                        nt = 0;
                                        const nr = ri + 1;
                                        if (nr >= 4) return null;
                                        return 'sh-' + nr + '-0-0';
                                      }
                                      return 'sh-' + ri + '-' + nt + '-' + ne;
                                    };
                                    const pv = heatPen[ri][ti][ei] ?? 0;
                                    const hmi = hCurMap[ri][ti][ei];
                                    const hDefMi = heatOrder === 'A' ? ei % 2 : 1 - (ei % 2);
                                    const hSwap = hmi !== hDefMi;
                                    const hSubs = t.subs ?? ['', ''];
                                    const hEffective =
                                      hmi < 2 && hSubs[hmi] ? hSubs[hmi] : (t.members ?? [])[hmi];
                                    const hpLbl =
                                      (hEffective ?? '').split(' ')[0]?.slice(0, 4) || 'P' + (hmi + 1);
                                    return (
                                      <div
                                        key={ei}
                                        style={{
                                          display: 'flex',
                                          flexDirection: 'column',
                                          alignItems: 'center',
                                          gap: 1,
                                        }}
                                      >
                                        <div
                                          draggable
                                          onDragStart={() => setHDragSrc({ ri, ti, ei })}
                                          onDragOver={(e) => e.preventDefault()}
                                          onDrop={() => hHandleDrop(ri, ti, ei)}
                                          onClick={() => toggleHP(ri, ti, ei)}
                                          style={{
                                            fontFamily: FONT_MONO,
                                            fontSize: 10,
                                            color: hSwap ? '#c084fc' : '#666',
                                            cursor: 'grab',
                                            userSelect: 'none',
                                            background: hSwap ? 'rgba(192,132,252,0.15)' : 'rgba(255,255,255,0.03)',
                                            borderRadius: 3,
                                            padding: '2px 4px',
                                            minWidth: 28,
                                            textAlign: 'center',
                                            border: hSwap ? '1px solid rgba(192,132,252,0.3)' : '1px solid transparent',
                                            lineHeight: '12px',
                                            touchAction: 'none',
                                          }}
                                        >
                                          {hpLbl}
                                          {hSwap && ' ↺'}
                                        </div>
                                        <input
                                          id={cid}
                                          type="text"
                                          inputMode="numeric"
                                          maxLength={1}
                                          value={val === null ? '' : val}
                                          onFocus={(e) => e.target.select()}
                                          onChange={(e) => {
                                            const r = e.target.value;
                                            if (r === '') {
                                              setHC(ri, ti, ei, null);
                                              return;
                                            }
                                            const n = parseInt(r);
                                            if (isNaN(n) || n < 0 || n > 3) return;
                                            setHC(ri, ti, ei, n);
                                            const nx = nxt();
                                            if (nx)
                                              setTimeout(() => {
                                                const el = document.getElementById(nx);
                                                if (el) {
                                                  el.focus();
                                                  (el as HTMLInputElement).select();
                                                }
                                              }, 30);
                                          }}
                                          style={{
                                            ...scI,
                                            background:
                                              val === 3
                                                ? '#e9456033'
                                                : val === 2
                                                  ? '#f5a62333'
                                                  : val === 1
                                                    ? '#8be9fd22'
                                                    : 'rgba(255,255,255,0.03)',
                                            color:
                                              val === null
                                                ? '#333'
                                                : val === 3
                                                  ? '#e94560'
                                                  : val === 2
                                                    ? '#f5a623'
                                                    : val === 1
                                                      ? '#8be9fd'
                                                      : '#555',
                                            borderColor: 'rgba(255,255,255,0.08)',
                                          }}
                                        />
                                        <button
                                          onClick={() => setHP(ri, ti, ei, pv + 1)}
                                          onDoubleClick={() => setHP(ri, ti, ei, 0)}
                                          style={{
                                            fontSize: 9,
                                            fontFamily: FONT_MONO,
                                            background: pv > 0 ? 'rgba(255,60,60,0.2)' : 'none',
                                            border: 'none',
                                            color: pv > 0 ? '#ff6b6b' : '#333',
                                            cursor: 'pointer',
                                            padding: '0 3px',
                                          }}
                                        >
                                          {pv > 0 ? '-' + pv * 2 : '⚠'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#888' }}>
                                  {hRT(ri, ti)}
                                </div>
                              </div>
                            ))}
                            <div
                              style={{
                                padding: '8px 2px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                              }}
                            >
                              {heatTeams.map((_, ti) => (
                                <div
                                  key={ti}
                                  style={{
                                    fontFamily: FONT_MONO,
                                    fontSize: 12,
                                    color: TC[ti],
                                    textAlign: 'center',
                                  }}
                                >
                                  {hRT(ri, ti)}
                                </div>
                              ))}
                            </div>
                          </Fragment>
                        ))}
                        <div
                          style={{
                            padding: 8,
                            background: 'rgba(233,69,96,0.08)',
                            fontFamily: FONT_HEADER,
                            fontSize: 13,
                            color: '#e94560',
                            textAlign: 'center',
                          }}
                        >
                          FINAL
                        </div>
                        {heatTeams.map((_, ti) => (
                          <div
                            key={ti}
                            style={{
                              padding: 8,
                              background: 'rgba(233,69,96,0.05)',
                              textAlign: 'center',
                            }}
                          >
                            <span style={{ fontFamily: FONT_HEADER, fontSize: 26, color: TC[ti] }}>
                              {hGT(ti)}
                            </span>
                          </div>
                        ))}
                        <div style={{ padding: 8, background: 'rgba(233,69,96,0.05)' }}>
                          {heatTeams
                            .map((t, ti) => ({
                              name: autoTeamName(t.members ?? []) || t.name,
                              score: hGT(ti),
                              ti,
                            }))
                            .sort((a, b) => b.score - a.score)
                            .map((x, i) => (
                              <div
                                key={x.ti}
                                style={{
                                  fontFamily: FONT_MONO,
                                  fontSize: 9,
                                  color: i < advCount ? '#50fa7b' : '#555',
                                }}
                              >
                                {i + 1}. {x.name}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                    {allHF && (
                      <div
                        style={{
                          marginTop: 12,
                          padding: 12,
                          background: 'rgba(80,250,123,0.06)',
                          borderRadius: 8,
                          border: '1px solid rgba(80,250,123,0.15)',
                        }}
                      >
                        <div style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#50fa7b', marginBottom: 4 }}>
                          Advancing (Top {advCount})
                        </div>
                        {heatTeams
                          .map((t, ti) => ({
                            name: autoTeamName(t.members ?? []) || t.name,
                            score: hGT(ti),
                            members: t.members ?? [],
                          }))
                          .sort((a, b) => b.score - a.score)
                          .slice(0, advCount)
                          .map((t, i) => (
                            <div key={i} style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#f0e6d3' }}>
                              {i + 1}. {t.name} — {t.score} pts
                            </div>
                          ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                      <button style={secBtn} onClick={() => setHeatStep(0)}>
                        {'←'} Back
                      </button>
                      <button
                        style={{
                          ...priBtn,
                          background: allHF ? '#50fa7b' : '#333',
                          color: allHF ? '#0d0d0d' : '#666',
                        }}
                        disabled={!allHF}
                        onClick={saveHeat}
                      >
                        Save Heat {'🏁'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}
