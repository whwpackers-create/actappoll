import React, { useState, Fragment } from 'react';
import { teamScores, computeAllElos, computeActBracketBreakdown, STARTING_VR } from '../utils/VR';
import { fsSet, gid } from '../services/firestore';
import { card, cHead, cTitle, cSub, inp, TC } from '../styles/shared';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { Act, AppData, AppOps } from '../types';
import type { AuthState } from '../hooks/useAuth';

// Build a default 16-man playerMap: TV1 entries 0-3 alternate t1[0]/t1[1], TV2 entries 4-7 alternate t2[0]/t2[1]
function defaultMap16(t1: number[], t2: number[], ro: string, numTeams: number): number[][][] {
  return Array.from({ length: 4 }, () =>
    Array.from({ length: numTeams }, () => {
      const result: number[] = [];
      for (let h = 0; h < 8; h++) {
        if (h < 4) result.push(ro === 'A' ? t1[h % 2] : t1[1 - h % 2]);
        else result.push(ro === 'A' ? t2[(h - 4) % 2] : t2[1 - (h - 4) % 2]);
      }
      return result;
    })
  );
}

export interface ActDetailProps {
  act: Act | undefined;
  data: AppData;
  setView: (v: string) => void;
  ops: AppOps;
  showToast: (msg: string) => void;
  auth: AuthState;
}

export function ActDetail({
  act,
  data,
  setView,
  ops,
  showToast,
  auth,
}: ActDetailProps) {
  if (!act) {
    setView('history');
    return null;
  }

  const tSz = act.type === '12man' ? 3 : 2;
  let savedGrid = act.grid;
  if (!savedGrid && act.gridJson) {
    try {
      savedGrid = JSON.parse(act.gridJson) as Act['grid'];
    } catch {
      /* ignore */
    }
  }
  let savedPen = act.penalties;
  if (!savedPen && act.penaltiesJson) {
    try {
      savedPen = JSON.parse(act.penaltiesJson) as Act['penalties'];
    } catch {
      /* ignore */
    }
  }
  let savedPM = act.playerMap;
  if (!savedPM && act.playerMapJson) {
    try {
      savedPM = JSON.parse(act.playerMapJson) as number[][][];
    } catch {
      /* ignore */
    }
  }

  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState(act.name);
  const [eDate, setEDate] = useState(act.date);
  // Separate month/day/year strings so the user can freely type without padStart fighting them
  const [eMonth, setEMonth] = useState(act.date.split('-')[1] ?? '');
  const [eDay, setEDay] = useState(act.date.split('-')[2] ?? '');
  const [eYearDigit, setEYearDigit] = useState((act.date.split('-')[0] ?? '').slice(-1));
  const [eGrid, setEGrid] = useState<Act['grid'] | null>(null);
  const [ePen, setEPen] = useState<Act['penalties'] | null>(null);
  const [eTeamNames, setETeamNames] = useState(act.teams.map((t) => t.name));
  const [eMembers, setEMembers] = useState(act.teams.map((t) => [...t.members]));
  const [eSubs, setESubs] = useState(
    act.teams.map((t) => [...(t.subs ?? ['', ''])])
  );
  const [ePlayerMap, setEPlayerMap] = useState<number[][][] | null>(null);
  const [eTv1Pair, setETv1Pair] = useState<'02' | '01' | '03'>(
    (act.tv1Pair as '02' | '01' | '03') ?? '02'
  );
  const [dragSlot, setDragSlot] = useState<{ ri: number; ti: number; ei: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ ri: number; ti: number; ei: number } | null>(null);

  const startEdit = () => {
    auth.req(() => {
      setEditing(true);
      setEName(act.name);
      setEDate(act.date);
      const dp = act.date.split('-');
      setEMonth(dp[1] ?? '');
      setEDay(dp[2] ?? '');
      setEYearDigit((dp[0] ?? '').slice(-1));
      const defaultGrid = (): Act['grid'] => {
        const actType = act.type ?? '8man';
        const nTeams = actType === '6man' ? 3 : 4;
        const nSlots = actType === '16man' ? 8 : actType === '12man' ? 6 : 4;
        return Array.from({ length: 4 }, () =>
          Array.from({ length: nTeams }, () =>
            Array.from({ length: nSlots }, () => null)
          )
        ) as Act['grid'];
      };
      setEGrid(savedGrid ? JSON.parse(JSON.stringify(savedGrid)) : defaultGrid());
      const defaultPen = (): Act['penalties'] => {
        const actType = act.type ?? '8man';
        const nTeams = actType === '6man' ? 3 : 4;
        const nSlots = actType === '16man' ? 8 : actType === '12man' ? 6 : 4;
        return Array.from({ length: 4 }, () =>
          Array.from({ length: nTeams }, () =>
            Array.from({ length: nSlots }, () => 0)
          )
        ) as Act['penalties'];
      };
      setEPen(savedPen ? JSON.parse(JSON.stringify(savedPen)) : defaultPen());
      setETeamNames(act.teams.map((t) => t.name));
      setEMembers(act.teams.map((t) => [...t.members]));
      setESubs(act.teams.map((t) => [...(t.subs ?? ['', ''])]));
      setEPlayerMap(savedPM ? JSON.parse(JSON.stringify(savedPM)) : null);
      setETv1Pair((act.tv1Pair as '02' | '01' | '03') ?? '02');
    });
  };

  const isGridCellDup = (g: (number | null)[][][], ri: number, ti: number, ei: number): boolean => {
    const val = g[ri]?.[ti]?.[ei];
    if (val === null || val === undefined) return false;
    const nT = act.teams.length;
    for (let t = 0; t < nT; t++) {
      if (t !== ti && g[ri]?.[t]?.[ei] === val) return true;
    }
    return false;
  };
  const setECell = (ri: number, ti: number, ei: number, val: number | null) => {
    if (!eGrid) return;
    if (val !== null) {
      const nT = act.teams.length;
      for (let t = 0; t < nT; t++) {
        if (t !== ti && eGrid[ri]?.[t]?.[ei] === val) return;
      }
    }
    const g = eGrid.map((r) => r.map((t) => [...t]));
    g[ri][ti][ei] = val;
    setEGrid(g);
  };

  const setEPenCell = (ri: number, ti: number, ei: number, val: number) => {
    if (!ePen) return;
    const p = ePen.map((r) =>
      r.map((t) => (Array.isArray(t) ? [...t] : t))
    ) as (number[] | number)[][];
    if (!Array.isArray(p[ri][ti])) p[ri][ti] = Array(tSz * 2).fill(0);
    (p[ri][ti] as number[])[ei] = val;
    setEPen(p);
  };

  const buildEditRaces = () => {
    const g = eGrid ?? (act.gridJson ? JSON.parse(act.gridJson) : null);
    if (!g) return act.races;
    const races: Act['races'] = [];
    let n = 1;
    const ro = act.raceOrder ?? 'A';
    const actType = act.type ?? '8man';
    const eTSz = actType === '12man' ? 3 : actType === '16man' ? 4 : 2;
    const eNumTeams = actType === '6man' ? 3 : 4;

    // Resolve the effective playerMap, falling back to a computed default
    let pm: number[][][] | null = ePlayerMap ?? savedPM ?? null;
    if (!pm && actType === '16man') {
      const pair = eTv1Pair;
      const t1 = pair === '02' ? [0, 2] : pair === '01' ? [0, 1] : [0, 3];
      const t2 = pair === '02' ? [1, 3] : pair === '01' ? [2, 3] : [1, 2];
      pm = defaultMap16(t1, t2, ro, eNumTeams);
    }

    for (let ri = 0; ri < 4; ri++) {
      for (let h = 0; h < eTSz * 2; h++) {
        const res: { player: string; points: number }[] = [];
        for (let ti = 0; ti < eNumTeams; ti++) {
          let mi: number;
          if (pm?.[ri]?.[ti]) {
            mi = pm[ri][ti][h];
          } else if (actType === '8man' || actType === '6man') {
            mi = ro === 'A' ? h % eTSz : eTSz - 1 - (h % eTSz);
          } else if (actType === '12man') {
            const mapR: Record<string, number> = { A: 0, B: 1, C: 2 };
            const seq: number[] = [];
            for (let i = 0; i < ro.length; i++) seq.push(mapR[ro[i]] ?? 0);
            const raceSeq = [...seq, ...seq];
            mi = raceSeq[h] ?? 0;
          } else {
            mi = 0;
          }
          const pName = (eSubs[ti]?.[mi]) ? eSubs[ti][mi] : eMembers[ti]?.[mi] ?? 'P';
          res.push({ player: pName, points: (g[ri]?.[ti]?.[h] as number) ?? 0 });
        }
        res.sort((a, b) => b.points - a.points);
        races.push({ raceNum: n, results: res });
        n++;
      }
    }
    return races;
  };

  const saveEdit = () => {
    auth.req(async () => {
      const aid = act.id ?? act._id ?? '';
      const allNames = [...eMembers.flat(), ...eSubs.flat()].filter(Boolean);
      const existing = new Set(data.players.map((p) => p.name.toLowerCase()));
      for (const name of allNames) {
        if (!existing.has(name.toLowerCase())) {
          try {
            await fsSet('players', gid(), { name, id: gid(), active: true });
          } catch {
            /* ignore */
          }
          existing.add(name.toLowerCase());
        }
      }
      const newTeams = act.teams.map((t, i) => ({
        ...t,
        name: eTeamNames[i] ?? t.name,
        members: eMembers[i] ?? t.members,
        subs: eSubs[i] ?? t.subs ?? ['', ''],
      }));
      const actType = act.type ?? '8man';
      const eNumTeams = actType === '6man' ? 3 : 4;
      const eTSz = actType === '12man' ? 3 : actType === '16man' ? 4 : 2;
      // Resolve final playerMap to save
      let finalPM = ePlayerMap ?? savedPM ?? null;
      if (!finalPM && actType === '16man') {
        const pair = eTv1Pair;
        const t1 = pair === '02' ? [0, 2] : pair === '01' ? [0, 1] : [0, 3];
        const t2 = pair === '02' ? [1, 3] : pair === '01' ? [2, 3] : [1, 2];
        finalPM = defaultMap16(t1, t2, act.raceOrder ?? 'A', eNumTeams);
      }
      void eTSz; // used in buildEditRaces via closure
      const updates: Partial<Act> = {
        name: eName,
        date: eDate,
        teams: newTeams,
        races: buildEditRaces(),
        tv1Pair: eTv1Pair,
      };
      if (eGrid) updates.gridJson = JSON.stringify(eGrid);
      if (ePen) updates.penaltiesJson = JSON.stringify(ePen);
      if (finalPM) updates.playerMapJson = JSON.stringify(finalPM);
      await ops.updateAct(aid, updates);
      showToast('ACT updated!');
      setEditing(false);
    });
  };

  const ts = teamScores(act);
  const winner = ts[0];
  const hasTie = ts.length >= 2 && ts[0].score === ts[1].score;
  const tiedTeams = hasTie ? ts.filter((t) => t.score === ts[0].score) : [];
  const hasJSTie =
    ts.length >= 3 &&
    ts[1].score === ts[2].score &&
    (!hasTie || ts[0].score !== ts[1].score);
  const jsTiedTeams = hasJSTie ? ts.filter((t) => t.score === ts[1].score) : [];

  const chronoActs = [...data.acts].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const ci = chronoActs.findIndex(
    (a) => (a.id ?? a._id) === (act.id ?? act._id)
  );
  const { elos: eB } = computeAllElos(
    data.players,
    chronoActs.slice(0, ci),
    data.sats,
    data.seasons
  );
  const { elos: eA } = computeAllElos(
    data.players,
    chronoActs.slice(0, ci + 1),
    data.sats,
    data.seasons
  );

  const bracketBreakdown = computeActBracketBreakdown(act, eB);

  const playerPts: Record<string, number> = {};
  act.teams.flatMap((t) => t.members).forEach((n) => {
    playerPts[n] = 0;
  });
  act.races.forEach((r) =>
    r.results.forEach((x) => {
      if (x.player in playerPts) playerPts[x.player] += x.points;
    })
  );

  const getRoundTot = (
    ri: number,
    ti: number,
    g: Act['grid'],
    p: Act['penalties']
  ): number | null => {
    if (!g || !g[ri]?.[ti]) return null;
    const arr = g[ri][ti] as (number | null | undefined)[];
    let s = arr.reduce((a: number, v) => a + (v ?? 0), 0);
    if (p?.[ri]) {
      const v = (p[ri] as Record<number, number[] | number>)[ti];
      if (Array.isArray(v)) s += (v as number[]).reduce((a: number, x) => a + x * -2, 0);
      else if (typeof v === 'number') s += v * -2;
    }
    return s;
  };

  const scBox = {
    width: 30,
    height: 30,
    borderRadius: 4,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontFamily: FONT_HEADER,
    fontSize: 15,
  };
  const scInpS = {
    width: 34,
    height: 34,
    borderRadius: 5,
    fontFamily: FONT_HEADER,
    fontSize: 16,
    textAlign: 'center' as const,
    outline: 'none',
    border: '1px solid rgba(255,255,255,0.1)',
    boxSizing: 'border-box' as const,
    padding: 0,
    background: 'rgba(255,255,255,0.04)',
    color: '#f0e6d3',
  };

  // ── Edit mode: full NewAct-style form ──────────────────────────────────────
  if (editing) {
    const actType = act.type ?? '8man';
    const eTSz = actType === '12man' ? 3 : actType === '16man' ? 4 : 2;
    const eNumTeams = actType === '6man' ? 3 : 4;
    const is16man = actType === '16man';

    // Commit the free-typed month/day/year into eDate (used on blur / auto-advance)
    const commitDate = (mm: string, dd: string, yy: string) => {
      if (mm && dd && yy) setEDate(`202${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`);
    };

    // Score cell colors
    const eValColor = (v: number | null) =>
      v === 3 ? '#e94560' : v === 2 ? '#f5a623' : v === 1 ? '#8be9fd' : '#555';
    const eValBg = (v: number | null) =>
      v === 3 ? '#e9456033' : v === 2 ? '#f5a62333' : v === 1 ? '#8be9fd22' : 'rgba(255,255,255,0.03)';
    const eValBorder = (v: number | null) =>
      v === 3 ? '#e9456066' : v === 2 ? '#f5a62366' : v === 1 ? '#8be9fd44' : 'rgba(255,255,255,0.06)';

    // Round total for edit grid
    const eRoundTot = (ri: number, ti: number): number => {
      if (!eGrid || !eGrid[ri]?.[ti]) return 0;
      const arr = eGrid[ri][ti] as (number | null)[];
      let s = arr.reduce((acc: number, v) => acc + (v ?? 0), 0);
      if (ePen?.[ri]) {
        const v = (ePen[ri] as Record<number, number[] | number>)[ti];
        if (Array.isArray(v)) s += (v as number[]).reduce((acc: number, x: number) => acc + x * -2, 0);
        else if (typeof v === 'number') s += (v as number) * -2;
      }
      return s;
    };
    const eGrandTot = (ti: number): number => {
      let s = 0;
      for (let ri = 0; ri < 4; ri++) s += eRoundTot(ri, ti);
      return s;
    };

    // Penalty value helper
    const getEPenVal = (ri: number, ti: number, ei: number): number => {
      if (!ePen?.[ri]) return 0;
      const v = (ePen[ri] as Record<number, number[] | number>)[ti];
      if (Array.isArray(v)) return (v as number[])[ei] ?? 0;
      return 0;
    };

    const scInpEdit: React.CSSProperties = {
      width: 36,
      height: 36,
      borderRadius: 5,
      fontFamily: FONT_HEADER,
      fontSize: 18,
      textAlign: 'center',
      outline: 'none',
      border: '1px solid',
      boxSizing: 'border-box',
      padding: 0,
      caretColor: '#e94560',
    };

    // Swap player order within a team (0↔1) and mirror in playerMap
    const swapTeamPlayers = (ti: number) => {
      const newMembers = eMembers.map((x) => [...x]);
      [newMembers[ti][0], newMembers[ti][1]] = [newMembers[ti][1], newMembers[ti][0]];
      setEMembers(newMembers);
      const newSubs = eSubs.map((x) => [...x]);
      [newSubs[ti][0], newSubs[ti][1]] = [newSubs[ti][1], newSubs[ti][0]];
      setESubs(newSubs);
      const map = (ePlayerMap ?? savedPM ??
        (is16man ? defaultMap16(eTv1Pair === '02' ? [0,2] : eTv1Pair === '01' ? [0,1] : [0,3], eTv1Pair === '02' ? [1,3] : eTv1Pair === '01' ? [2,3] : [1,2], act.raceOrder ?? 'A', eNumTeams) : [])
      ).map((r) => r.map((t) => [...t]));
      for (let r = 0; r < map.length; r++) {
        for (let e = 0; e < (map[r][ti]?.length ?? 0); e++) {
          if (map[r][ti][e] === 0) map[r][ti][e] = 1;
          else if (map[r][ti][e] === 1) map[r][ti][e] = 0;
        }
      }
      setEPlayerMap(map);
    };

    // TV1 pair indices for 16man
    const eTv1Idx = eTv1Pair === '02' ? [0, 2] : eTv1Pair === '01' ? [0, 1] : [0, 3];
    const eTv2Idx = eTv1Pair === '02' ? [1, 3] : eTv1Pair === '01' ? [2, 3] : [1, 2];

    // Effective playerMap for display (ePlayerMap > savedPM > default)
    const curEMap: number[][][] = ePlayerMap ?? savedPM ??
      (is16man ? defaultMap16(eTv1Idx, eTv2Idx, act.raceOrder ?? 'A', eNumTeams) : []);

    // Toggle a single slot in the edit playerMap
    const toggleESlot = (ri: number, ti: number, ei: number) => {
      const m = (ePlayerMap ?? savedPM ??
        (is16man ? defaultMap16(eTv1Idx, eTv2Idx, act.raceOrder ?? 'A', eNumTeams) : [])
      ).map((r) => r.map((t) => [...t]));
      const cur = m[ri][ti][ei];
      const pair = ei < 4 ? eTv1Idx : eTv2Idx;
      const next = pair.find((idx) => idx !== cur) ?? cur;
      // Swap with whichever slot currently holds 'next' in the same half
      const halfStart = ei < 4 ? 0 : 4;
      const swapIdx = m[ri][ti].findIndex((v, i) => i >= halfStart && i < halfStart + 4 && i !== ei && v === next);
      m[ri][ti][ei] = next;
      if (swapIdx !== -1) m[ri][ti][swapIdx] = cur;
      setEPlayerMap(m);
    };

    // Groups for 16man: ei 0-3 = TV1, 4-7 = TV2
    const getEiGroups = (ri: number, ti: number): number[][] => {
      if (is16man) return [[0,1,2,3],[4,5,6,7]];
      if (!eGrid || !eGrid[ri]?.[ti]) return [Array.from({ length: eTSz * 2 }, (_, i) => i)];
      return [(eGrid[ri][ti] as unknown[]).map((_, i) => i)];
    };

    // Build a full editable player map from current state or defaults
    const buildFullMap = (): number[][][] => {
      if (ePlayerMap) return ePlayerMap.map((r) => r.map((t) => [...t]));
      if (savedPM) return savedPM.map((r) => r.map((t) => [...t]));
      const ro = act.raceOrder ?? 'A';
      return Array.from({ length: 4 }, () =>
        Array.from({ length: eNumTeams }, () =>
          Array.from({ length: eTSz * 2 }, (_, ei) => {
            if (is16man) {
              const group = ei < 4 ? eTv1Idx : eTv2Idx;
              return group[ei % 2];
            } else if (actType === '12man') {
              const mapR: Record<string, number> = { A: 0, B: 1, C: 2 };
              const seq = [...ro].map((c) => mapR[c] ?? 0);
              return ([...seq, ...seq])[ei] ?? 0;
            } else {
              return ro === 'A' ? ei % eTSz : eTSz - 1 - (ei % eTSz);
            }
          })
        )
      );
    };

    const handleDropSlot = (toRi: number, toTi: number, toEi: number) => {
      if (!dragSlot) return;
      const { ri: fRi, ti: fTi, ei: fEi } = dragSlot;
      if (fRi === toRi && fTi === toTi && fEi === toEi) { setDragSlot(null); setDropTarget(null); return; }
      const map = buildFullMap();
      const tmp = map[fRi][fTi][fEi];
      map[fRi][fTi][fEi] = map[toRi][toTi][toEi];
      map[toRi][toTi][toEi] = tmp;
      setEPlayerMap(map);
      setDragSlot(null);
      setDropTarget(null);
    };

    // Player label from effective playerMap
    const getEPLabel = (ri: number, ti: number, ei: number): string => {
      let mi: number;
      if (curEMap?.[ri]?.[ti]) {
        mi = curEMap[ri][ti][ei];
      } else if (actType === '8man' || actType === '6man') {
        mi = ei % eTSz;
      } else if (actType === '16man') {
        mi = ei < 4 ? (ei % 2 === 0 ? 0 : 2) : (ei % 2 === 0 ? 1 : 3);
      } else {
        mi = 0;
      }
      const sub = eSubs[ti]?.[mi];
      const name = sub || (eMembers[ti]?.[mi] ?? act.teams[ti]?.members[mi] ?? '');
      return name.split(' ')[0] || `P${mi + 1}`;
    };

    return (
      <div style={{ width: '100%' }}>
        <button
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
          onClick={() => setEditing(false)}
        >
          {'←'} Cancel Edit
        </button>

        <div style={card}>
          <div style={{ ...cHead, marginBottom: 20 }}>
            <span style={cTitle}>✏️ Edit ACT</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{
                  background: '#e94560',
                  border: 'none',
                  color: '#fff',
                  fontFamily: FONT_HEADER,
                  padding: '10px 22px',
                  fontSize: 13,
                  borderRadius: 8,
                  cursor: 'pointer',
                  letterSpacing: 1,
                }}
                onClick={saveEdit}
              >
                Save All
              </button>
              <button
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#a09880',
                  fontFamily: FONT_HEADER,
                  padding: '10px 20px',
                  fontSize: 13,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Name + Date fields */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div>
              <label style={{ display: 'block', fontFamily: FONT_HEADER, fontSize: 12, color: '#a09880', letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase' as const }}>
                Name
              </label>
              <input
                style={inp}
                value={eName}
                onChange={(e) => setEName(e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: FONT_HEADER, fontSize: 12, color: '#a09880', letterSpacing: 1.5, marginBottom: 4, textTransform: 'uppercase' as const }}>
                Date
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  id="edit-mm"
                  style={{ ...inp, width: 45, textAlign: 'center', padding: '10px 4px' }}
                  maxLength={2}
                  value={eMonth}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v.length <= 2) {
                      setEMonth(v);
                      commitDate(v, eDay, eYearDigit);
                      if (v.length === 2) document.getElementById('edit-dd')?.focus();
                    }
                  }}
                  placeholder="MM"
                />
                <span style={{ color: '#666', fontSize: 16 }}>/</span>
                <input
                  id="edit-dd"
                  style={{ ...inp, width: 45, textAlign: 'center', padding: '10px 4px' }}
                  maxLength={2}
                  value={eDay}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v.length <= 2) {
                      setEDay(v);
                      commitDate(eMonth, v, eYearDigit);
                      if (v.length === 2) document.getElementById('edit-yy')?.focus();
                    }
                  }}
                  placeholder="DD"
                />
                <span style={{ color: '#666', fontSize: 16 }}>/</span>
                <span style={{ color: '#666', fontFamily: FONT_MONO, fontSize: 15 }}>202</span>
                <input
                  id="edit-yy"
                  style={{ ...inp, width: 30, textAlign: 'center', padding: '10px 2px' }}
                  maxLength={1}
                  value={eYearDigit}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v.length <= 1) { setEYearDigit(v); commitDate(eMonth, eDay, v); }
                  }}
                  placeholder="_"
                />
              </div>
            </div>
          </div>

          {/* Teams section */}
          <div style={{ fontFamily: FONT_HEADER, fontSize: 18, color: '#f0e6d3', letterSpacing: 1, marginBottom: 12 }}>
            👥 Teams
          </div>
          <datalist id="plist">
            {data.players.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fill, minmax(140px, 1fr))`,
              gap: 10,
              marginBottom: 20,
            }}
          >
            {act.teams.slice(0, eNumTeams).map((origTeam, ti) => (
              <div
                key={ti}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: `2px solid ${TC[ti]}`,
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                {/* Team name input */}
                <input
                  style={{
                    ...inp,
                    fontFamily: FONT_HEADER,
                    fontSize: 15,
                    borderBottom: `2px solid ${TC[ti]}`,
                    borderRadius: 0,
                    background: 'none',
                    padding: '4px 0',
                    marginBottom: 6,
                  }}
                  value={eTeamNames[ti] ?? origTeam.name}
                  onChange={(e) => {
                    const c = [...eTeamNames];
                    c[ti] = e.target.value;
                    setETeamNames(c);
                  }}
                />
                {/* Player name inputs */}
                {(eMembers[ti] ?? origTeam.members).map((m, mi) => {
                  const origName = origTeam.members[mi] ?? '';
                  const changed = m && origName && m !== origName;
                  return (
                    <div key={mi}>
                      <input
                        style={{ ...inp, fontSize: 13, marginTop: 4, padding: '6px 8px' }}
                        value={m}
                        list="plist"
                        onChange={(e) => {
                          const c = eMembers.map((x) => [...x]);
                          c[ti][mi] = e.target.value;
                          setEMembers(c);
                        }}
                        placeholder={`Player ${mi + 1}`}
                      />
                      {changed && (
                        <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#c084fc', marginTop: 2, paddingLeft: 4 }}>
                          (was: {origName})
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Swap player order button */}
                <button
                  onClick={() => swapTeamPlayers(ti)}
                  style={{
                    marginTop: 6,
                    width: '100%',
                    background: 'rgba(139,233,253,0.08)',
                    border: '1px solid rgba(139,233,253,0.2)',
                    borderRadius: 4,
                    padding: '3px 0',
                    fontSize: 10,
                    fontFamily: FONT_MONO,
                    color: '#8be9fd',
                    cursor: 'pointer',
                    letterSpacing: 0.5,
                  }}
                >
                  ↕ Swap Order
                </button>
                {/* Sub inputs */}
                {(eSubs[ti] ?? ['', '']).map((s, si) => (
                  <input
                    key={'s' + si}
                    style={{
                      ...inp,
                      fontSize: 11,
                      marginTop: 4,
                      padding: '4px 8px',
                      borderColor: 'rgba(192,132,252,0.25)',
                    }}
                    value={s}
                    list="plist"
                    onChange={(e) => {
                      const c = eSubs.map((x) => [...x]);
                      c[ti][si] = e.target.value;
                      setESubs(c);
                    }}
                    placeholder={`Sub ${si + 1}`}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Score grid — NewAct step 1 style */}
          {eGrid && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ fontFamily: FONT_HEADER, fontSize: 18, color: '#f0e6d3', letterSpacing: 1 }}>
                  📋 Scorecard
                </div>
                {is16man && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#888' }}>TV pairing:</span>
                    {(['02', '01', '03'] as const).map((pair) => {
                      const labels: Record<string, string> = { '02': 'P1+P3 / P2+P4', '01': 'P1+P2 / P3+P4', '03': 'P1+P4 / P2+P3' };
                      return (
                        <button
                          key={pair}
                          onClick={() => { setETv1Pair(pair); setEPlayerMap(null); }}
                          style={{
                            fontFamily: FONT_MONO, fontSize: 10,
                            background: eTv1Pair === pair ? 'rgba(139,233,253,0.15)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${eTv1Pair === pair ? '#8be9fd' : 'rgba(255,255,255,0.08)'}`,
                            color: eTv1Pair === pair ? '#8be9fd' : '#666',
                            borderRadius: 5, padding: '4px 8px', cursor: 'pointer',
                          }}
                        >
                          {labels[pair]}
                        </button>
                      );
                    })}
                    <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#555' }}>(tap name to swap)</span>
                  </div>
                )}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `70px repeat(${eNumTeams}, 1fr) 70px`,
                    gap: 0,
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    overflow: 'hidden',
                    minWidth: 600,
                  }}
                >
                  {/* Header: Round */}
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
                  {act.teams.slice(0, eNumTeams).map((origTeam, ti) => (
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
                        {eTeamNames[ti] ?? origTeam.name}
                      </div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#666', marginTop: 2 }}>
                        {(eMembers[ti] ?? origTeam.members).join(' & ')}
                      </div>
                    </div>
                  ))}
                  {/* Header: TOT */}
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

                  {/* Score rows R1–R4 */}
                  {[0, 1, 2, 3].map((ri) => (
                    <Fragment key={ri}>
                      {/* Round label */}
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
                        <span style={{ fontFamily: FONT_HEADER, fontSize: 16, color: '#a09880' }}>
                          R{ri + 1}
                        </span>
                        <span style={{ fontSize: 14 }}>{['🏁', '⭐', '🔥', '👑'][ri]}</span>
                      </div>

                      {/* Score cells for each team */}
                      {act.teams.slice(0, eNumTeams).map((_, ti) => {
                        const gridRow = eGrid[ri]?.[ti] as (number | null)[] | undefined;
                        const penSum = (() => {
                          if (!ePen?.[ri]) return 0;
                          const v = (ePen[ri] as Record<number, number[] | number>)[ti];
                          if (Array.isArray(v)) return (v as number[]).reduce((a, x) => a + x, 0);
                          return 0;
                        })();

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
                            {getEiGroups(ri, ti).map((eiGroup, groupIdx) => (
                              <div key={groupIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' }}>
                                {is16man && (
                                  <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: groupIdx === 0 ? '#8be9fd' : '#f5a623', textAlign: 'center', marginBottom: 1 }}>
                                    {groupIdx === 0 ? 'TV1' : 'TV2'}
                                  </div>
                                )}
                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                                  {eiGroup.map((ei) => {
                                    const val = gridRow ? (gridRow[ei] ?? null) : null;
                                    const penVal = getEPenVal(ri, ti, ei);
                                    const pLabel = getEPLabel(ri, ti, ei);
                                    const isDup = eGrid ? isGridCellDup(eGrid as (number | null)[][][], ri, ti, ei) : false;
                                    return (
                                      <div
                                        key={ei}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
                                        onDragOver={(e) => { e.preventDefault(); setDropTarget({ ri, ti, ei }); }}
                                        onDragLeave={() => setDropTarget(null)}
                                        onDrop={() => handleDropSlot(ri, ti, ei)}
                                      >
                                        {/* Player label — draggable to reassign slot (double-ups); clickable in 16man to swap */}
                                        <div
                                          draggable
                                          onDragStart={() => setDragSlot({ ri, ti, ei })}
                                          onDragEnd={() => { setDragSlot(null); setDropTarget(null); }}
                                          onClick={is16man ? () => toggleESlot(ri, ti, ei) : undefined}
                                          style={{
                                            fontFamily: FONT_MONO,
                                            fontSize: 9,
                                            color: dragSlot && dropTarget?.ri === ri && dropTarget?.ti === ti && dropTarget?.ei === ei
                                              ? '#fbbf24'
                                              : dragSlot?.ri === ri && dragSlot?.ti === ti && dragSlot?.ei === ei
                                              ? '#60a5fa'
                                              : is16man ? '#8be9fd' : '#888',
                                            background: dragSlot && dropTarget?.ri === ri && dropTarget?.ti === ti && dropTarget?.ei === ei
                                              ? 'rgba(251,191,36,0.2)'
                                              : dragSlot?.ri === ri && dragSlot?.ti === ti && dragSlot?.ei === ei
                                              ? 'rgba(96,165,250,0.2)'
                                              : is16man ? 'rgba(139,233,253,0.08)' : 'rgba(255,255,255,0.03)',
                                            border: dragSlot && dropTarget?.ri === ri && dropTarget?.ti === ti && dropTarget?.ei === ei
                                              ? '1px dashed #fbbf24'
                                              : '1px solid transparent',
                                            borderRadius: 3,
                                            padding: '1px 3px',
                                            minWidth: 28,
                                            textAlign: 'center',
                                            cursor: 'grab',
                                            userSelect: 'none',
                                          }}
                                        >
                                          {pLabel}
                                        </div>
                                        {/* Score input */}
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          maxLength={1}
                                          value={val === null ? '' : String(val)}
                                          onFocus={(e) => e.target.select()}
                                          onClick={(e) => (e.target as HTMLInputElement).select()}
                                          onKeyDown={(e) => {
                                            if (e.key >= '0' && e.key <= '3') {
                                              e.preventDefault();
                                              setECell(ri, ti, ei, parseInt(e.key, 10));
                                            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                                              e.preventDefault();
                                              setECell(ri, ti, ei, null);
                                            }
                                          }}
                                          onChange={(e) => {
                                            const r = e.target.value;
                                            if (r === '') { setECell(ri, ti, ei, null); return; }
                                            const n = parseInt(r, 10);
                                            if (!isNaN(n) && n >= 0 && n <= 3) setECell(ri, ti, ei, n);
                                          }}
                                          style={{
                                            ...scInpEdit,
                                            background: eValBg(val),
                                            color: eValColor(val),
                                            borderColor: isDup ? 'rgba(249,115,22,0.7)' : eValBorder(val),
                                            boxShadow: isDup ? '0 0 0 2px rgba(249,115,22,0.35)' : undefined,
                                          }}
                                        />
                                        {/* Penalty button */}
                                        <button
                                          onClick={() => setEPenCell(ri, ti, ei, penVal + 1)}
                                          onDoubleClick={() => setEPenCell(ri, ti, ei, 0)}
                                          style={{
                                            fontSize: 9,
                                            fontFamily: FONT_MONO,
                                            background: penVal > 0 ? 'rgba(255,60,60,0.2)' : 'none',
                                            border: 'none',
                                            color: penVal > 0 ? '#ff6b6b' : '#333',
                                            cursor: 'pointer',
                                            padding: '0 3px',
                                          }}
                                        >
                                          {penVal > 0 ? `-${penVal * 2}` : '⚠'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                            {/* Round total */}
                            <div style={{
                              fontFamily: FONT_MONO,
                              fontSize: 11,
                              color: '#888',
                              borderTop: '1px solid rgba(255,255,255,0.04)',
                              paddingTop: 3,
                              width: '100%',
                              textAlign: 'center',
                            }}>
                              {eRoundTot(ri, ti)}
                              {penSum > 0 && <span style={{ color: '#ff6b6b' }}> (-{penSum * 2})</span>}
                            </div>
                          </div>
                        );
                      })}

                      {/* TOT column */}
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
                        {act.teams.slice(0, eNumTeams).map((_, ti) => (
                          <div
                            key={ti}
                            style={{
                              fontFamily: FONT_MONO,
                              fontSize: 11,
                              color: TC[ti],
                              textAlign: 'center',
                            }}
                          >
                            {eRoundTot(ri, ti)}
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
                      background: 'rgba(233,69,96,0.08)',
                    }}
                  >
                    <span style={{ fontFamily: FONT_HEADER, fontSize: 16, color: '#e94560', letterSpacing: 2 }}>
                      FINAL
                    </span>
                  </div>
                  {act.teams.slice(0, eNumTeams).map((_, ti) => (
                    <div
                      key={ti}
                      style={{
                        padding: '8px 6px',
                        background: 'rgba(233,69,96,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontFamily: FONT_HEADER, fontSize: 26, color: TC[ti] }}>
                        {eGrandTot(ti)}
                      </span>
                    </div>
                  ))}
                  <div
                    style={{
                      padding: '8px 4px',
                      background: 'rgba(233,69,96,0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    }}
                  >
                    {act.teams.slice(0, eNumTeams)
                      .map((t, ti) => ({ name: eTeamNames[ti] ?? t.name, score: eGrandTot(ti), ti }))
                      .sort((a, b) => b.score - a.score)
                      .map((x, i) => (
                        <div
                          key={x.ti}
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 10,
                            color: i === 0 ? '#e94560' : i === 1 ? '#f5a623' : '#555',
                          }}
                        >
                          {i + 1}. {x.name} ({x.score})
                        </div>
                      ))}
                  </div>
                </div>
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555', marginTop: 10, textAlign: 'center' }}>
                Edit scores (0-3). Click ⚠ for -2 penalty. Dbl-click to reset.
              </div>
            </>
          )}

          {/* Save / Cancel buttons at bottom */}
          <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
            <button
              style={{
                background: '#e94560',
                border: 'none',
                color: '#fff',
                fontFamily: FONT_HEADER,
                padding: '12px 28px',
                fontSize: 14,
                borderRadius: 8,
                cursor: 'pointer',
                letterSpacing: 1,
              }}
              onClick={saveEdit}
            >
              Save All
            </button>
            <button
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#a09880',
                fontFamily: FONT_HEADER,
                padding: '12px 24px',
                fontSize: 14,
                borderRadius: 8,
                cursor: 'pointer',
              }}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
  // ── End edit mode ──────────────────────────────────────────────────────────

  return (
    <div style={{ width: '100%' }}>
      <button
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
        onClick={() => setView('history')}
      >
        {'←'} Back
      </button>

      <div
        style={{
          background: 'rgba(14,18,30,0.85)',
          border: '1px solid rgba(200,160,48,0.18)',
          borderLeft: '4px solid #c8a030',
          borderRadius: 12,
          padding: '20px 24px',
          marginBottom: 16,
          textAlign: 'center',
        }}
      >
        <div style={{ fontFamily: FONT_HEADER, fontSize: 28, color: '#c8a030', letterSpacing: 3 }}>
          {winner.team.name}
        </div>
        <div style={{ fontFamily: FONT_HEADER, fontSize: 18, color: '#f0e6d3', marginTop: 4, letterSpacing: 2 }}>
          {winner.score} POINTS
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#8090a0', marginTop: 6, letterSpacing: 1 }}>
          {winner.team.members.join(' & ')}
        </div>
      </div>

      <div style={card}>
        <div style={cHead}>
          {editing ? (
            <div
              style={{
                display: 'flex',
                gap: 8,
                flex: 1,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <input
                style={{ ...inp, flex: 1, minWidth: 150 }}
                value={eName}
                onChange={(e) => setEName(e.target.value)}
              />
              <input
                style={{ ...inp, width: 150 }}
                type="date"
                value={eDate}
                onChange={(e) => setEDate(e.target.value)}
              />
              <button
                style={{
                  background: '#e94560',
                  border: 'none',
                  color: '#fff',
                  fontFamily: FONT_HEADER,
                  padding: '8px 16px',
                  fontSize: 12,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={saveEdit}
              >
                Save All
              </button>
              <button
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#a09880',
                  fontFamily: FONT_HEADER,
                  padding: '8px 16px',
                  fontSize: 12,
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <span style={cTitle}>{act.name}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={cSub}>
                  {act.date} · {act.type === '12man' ? '12-Man' : '8-Man'}
                </span>
                <button
                  onClick={startEdit}
                  style={{
                    background: 'rgba(233,69,96,0.1)',
                    border: '1px solid rgba(233,69,96,0.3)',
                    borderRadius: 6,
                    padding: '4px 12px',
                    fontSize: 10,
                    fontFamily: FONT_MONO,
                    color: '#e94560',
                    cursor: 'pointer',
                  }}
                >
                  ✏️ Edit ACT 🔒
                </button>
              </div>
            </>
          )}
        </div>

        {hasTie && !act.tiebreaker && (
          <div
            style={{
              background: 'rgba(245,166,35,0.1)',
              border: '1px solid rgba(245,166,35,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 10,
            }}
          >
            <div style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#f5a623', marginBottom: 6 }}>
              ⚠ Tie for 1st Place — {ts[0].score} pts each
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#888', marginBottom: 8 }}>
              Pick the winner:
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {tiedTeams.map((t, i) => (
                <button
                  key={i}
                  onClick={() =>
                    auth.req(async () => {
                      await ops.updateAct(act.id ?? act._id ?? '', {
                        tiebreaker: t.team.name,
                      });
                      showToast(t.team.name + ' wins the tiebreaker!');
                    })
                  }
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontFamily: FONT_HEADER,
                    fontSize: 13,
                    color: '#f0e6d3',
                    cursor: 'pointer',
                  }}
                >
                  {t.team.name} ({t.score})
                </button>
              ))}
            </div>
          </div>
        )}
        {hasTie && act.tiebreaker && (
          <div
            style={{
              background: 'rgba(80,250,123,0.06)',
              border: '1px solid rgba(80,250,123,0.15)',
              borderRadius: 8,
              padding: '8px 14px',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#50fa7b' }}>
                Tiebreaker: {act.tiebreaker} wins
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#555', marginLeft: 8 }}>
                (tied at {ts[0].score} pts)
              </span>
            </div>
            <button
              onClick={() =>
                auth.req(async () => {
                  await ops.updateAct(act.id ?? act._id ?? '', { tiebreaker: null });
                  showToast('Tiebreaker cleared');
                })
              }
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 8,
                fontFamily: FONT_MONO,
                color: '#555',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        )}
        {hasJSTie && !act.jerseyTiebreaker && (
          <div
            style={{
              background: 'rgba(192,132,252,0.1)',
              border: '1px solid rgba(192,132,252,0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 10,
            }}
          >
            <div style={{ fontFamily: FONT_HEADER, fontSize: 14, color: '#c084fc', marginBottom: 6 }}>
              👕 Tie for Jersey Swap — {ts[1].score} pts each
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#888', marginBottom: 8 }}>
              Who gets 2nd place (jersey swap)?
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {jsTiedTeams.map((t, i) => (
                <button
                  key={i}
                  onClick={() =>
                    auth.req(async () => {
                      await ops.updateAct(act.id ?? act._id ?? '', {
                        jerseyTiebreaker: t.team.name,
                      });
                      showToast(t.team.name + ' gets the jersey swap!');
                    })
                  }
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    padding: '8px 16px',
                    fontFamily: FONT_HEADER,
                    fontSize: 13,
                    color: '#f0e6d3',
                    cursor: 'pointer',
                  }}
                >
                  {t.team.name} ({t.score})
                </button>
              ))}
            </div>
          </div>
        )}
        {hasJSTie && act.jerseyTiebreaker && (
          <div
            style={{
              background: 'rgba(192,132,252,0.06)',
              border: '1px solid rgba(192,132,252,0.15)',
              borderRadius: 8,
              padding: '8px 14px',
              marginBottom: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontFamily: FONT_HEADER, fontSize: 12, color: '#c084fc' }}>
                Jersey Swap: {act.jerseyTiebreaker} gets 2nd
              </span>
              <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#555', marginLeft: 8 }}>
                (tied at {ts[1].score} pts)
              </span>
            </div>
            <button
              onClick={() =>
                auth.req(async () => {
                  await ops.updateAct(act.id ?? act._id ?? '', { jerseyTiebreaker: null });
                  showToast('Cleared');
                })
              }
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 8,
                fontFamily: FONT_MONO,
                color: '#555',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        )}

        {savedGrid && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' as const }}>Scorecard</div>
            <div style={{ overflowX: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '55px repeat(4,1fr) 55px',
                  gap: 0,
                  border: '1px solid rgba(200,160,48,0.12)',
                  borderRadius: 8,
                  overflow: 'hidden',
                  minWidth: 620,
                }}
              >
                <div
                  style={{
                    padding: 6,
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    color: '#8090a0',
                    textAlign: 'center',
                    background: 'rgba(200,160,48,0.06)',
                    letterSpacing: 1,
                  }}
                >
                  RND
                </div>
                {act.teams.map((t, ti) => (
                  <div
                    key={ti}
                    style={{
                      padding: '6px 4px',
                      textAlign: 'center',
                      background: 'rgba(200,160,48,0.06)',
                      borderBottom: `2px solid ${TC[ti]}`,
                    }}
                  >
                    {editing ? (
                      <input
                        style={{ ...inp, fontSize: 11, padding: '2px 4px', textAlign: 'center' }}
                        value={eTeamNames[ti]}
                        onChange={(e) => {
                          const c = [...eTeamNames];
                          c[ti] = e.target.value;
                          setETeamNames(c);
                        }}
                      />
                    ) : (
                      <div style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#f0e6d3' }}>
                        {t.name}
                      </div>
                    )}
                    {editing ? (
                      <div
                        style={{
                          display: 'flex',
                          gap: 2,
                          marginTop: 2,
                          justifyContent: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        {eMembers[ti].map((m, mi) => (
                          <input
                            key={mi}
                            style={{
                              ...inp,
                              fontSize: 8,
                              padding: '1px 2px',
                              width: 55,
                              textAlign: 'center',
                            }}
                            value={m}
                            onChange={(e) => {
                              const c = eMembers.map((x) => [...x]);
                              c[ti][mi] = e.target.value;
                              setEMembers(c);
                            }}
                          />
                        ))}
                        <div
                          style={{
                            display: 'flex',
                            gap: 2,
                            marginTop: 2,
                            justifyContent: 'center',
                            width: '100%',
                          }}
                        >
                          {(eSubs[ti] ?? ['', '']).map((s, si) => (
                            <input
                              key={'s' + si}
                              style={{
                                ...inp,
                                fontSize: 7,
                                padding: '1px 2px',
                                width: 50,
                                textAlign: 'center',
                                borderColor: 'rgba(192,132,252,0.25)',
                              }}
                              value={s}
                              onChange={(e) => {
                                const c = eSubs.map((x) => [...x]);
                                c[ti][si] = e.target.value;
                                setESubs(c);
                              }}
                              placeholder={'Sub' + (si + 1)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#555' }}>
                        {t.members.map((m, mi) => t.subs?.[mi] ? <span key={mi}><span style={{ color: '#c084fc' }}>{t.subs[mi]}</span><span style={{ color: '#444' }}> ({m})</span></span> : <span key={mi}>{m}</span>).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ' & ', el], [] as React.ReactNode[])}
                      </div>
                    )}
                  </div>
                ))}
                <div
                  style={{
                    padding: 6,
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    color: '#8090a0',
                    textAlign: 'center',
                    background: 'rgba(200,160,48,0.06)',
                    letterSpacing: 1,
                  }}
                >
                  TOT
                </div>

                {[0, 1, 2, 3].map((ri) => (
                  <Fragment key={ri}>
                    <div
                      style={{
                        padding: '6px 4px',
                        textAlign: 'center',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}
                    >
                      <span style={{ fontFamily: FONT_HEADER, fontSize: 13, color: '#a09880' }}>
                        R{ri + 1}
                      </span>
                      <br />
                      <span style={{ fontSize: 11 }}>
                        {['🏁', '⭐', '🔥', '👑'][ri]}
                      </span>
                    </div>
                    {act.teams.map((_, ti) => {
                      const useGrid = editing ? eGrid : savedGrid;
                      const usePen = editing ? ePen : savedPen;
                      if (!useGrid || !useGrid[ri]?.[ti])
                        return (
                          <div
                            key={ti}
                            style={{
                              padding: 4,
                              borderBottom: '1px solid rgba(255,255,255,0.03)',
                            }}
                          >
                            <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#444' }}>
                              —
                            </span>
                          </div>
                        );
                      return (
                        <div
                          key={ti}
                          style={{
                            padding: '4px 3px',
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            borderLeft: `1px solid ${TC[ti]}22`,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: 2,
                              justifyContent: 'center',
                              flexWrap: 'wrap',
                            }}
                          >
                            {(useGrid[ri][ti] as (number | null)[]).map((val: number | null, ei: number) => {
                              const isDup = isGridCellDup(useGrid as (number | null)[][][], ri, ti, ei);
                              if (editing) {
                                const penArr =
                                  usePen?.[ri] && Array.isArray(usePen[ri][ti])
                                    ? (usePen[ri][ti] as number[])
                                    : [];
                                const penVal = penArr[ei] ?? 0;
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
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      maxLength={1}
                                      value={val === null ? '' : String(val)}
                                      onChange={(e) => {
                                        const r = e.target.value;
                                        if (r === '') {
                                          setECell(ri, ti, ei, null);
                                          return;
                                        }
                                        const n = parseInt(r, 10);
                                        if (
                                          !isNaN(n) &&
                                          n >= 0 &&
                                          n <= 3
                                        )
                                          setECell(ri, ti, ei, n);
                                      }}
                                      style={{
                                        ...scInpS,
                                        background:
                                          val === 3
                                            ? '#e9456033'
                                            : val === 2
                                              ? '#f5a62333'
                                              : 'rgba(255,255,255,0.03)',
                                        color:
                                          val === 3
                                            ? '#e94560'
                                            : val === 2
                                              ? '#f5a623'
                                              : val === 1
                                                ? '#8be9fd'
                                                : '#555',
                                        borderColor: isDup ? 'rgba(249,115,22,0.7)' : undefined,
                                        boxShadow: isDup ? '0 0 0 2px rgba(249,115,22,0.35)' : undefined,
                                      }}
                                    />
                                    <button
                                      onClick={() =>
                                        setEPenCell(ri, ti, ei, penVal + 1)
                                      }
                                      onDoubleClick={() =>
                                        setEPenCell(ri, ti, ei, 0)
                                      }
                                      style={{
                                        fontSize: 9,
                                        fontFamily: FONT_MONO,
                                        background:
                                          penVal > 0
                                            ? 'rgba(255,60,60,0.2)'
                                            : 'none',
                                        border: 'none',
                                        color: penVal > 0 ? '#ff6b6b' : '#333',
                                        cursor: 'pointer',
                                        padding: '0 3px',
                                      }}
                                    >
                                      {penVal > 0 ? `-${penVal * 2}` : '⚠'}
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div
                                  key={ei}
                                  style={{
                                    ...scBox,
                                    background:
                                      val === 3
                                        ? '#e9456033'
                                        : val === 2
                                          ? '#f5a62333'
                                          : val === 1
                                            ? '#8be9fd22'
                                            : 'rgba(255,255,255,0.02)',
                                    color:
                                      val === 3
                                        ? '#e94560'
                                        : val === 2
                                          ? '#f5a623'
                                          : val === 1
                                            ? '#8be9fd'
                                            : '#555',
                                    outline: isDup ? '2px solid rgba(249,115,22,0.6)' : undefined,
                                  }}
                                >
                                  {val ?? ''}
                                </div>
                              );
                            })}
                          </div>
                          {(() => {
                            const rPen =
                              usePen?.[ri] && Array.isArray(usePen[ri][ti])
                                ? (usePen[ri][ti] as number[]).reduce(
                                    (s: number, v) => s + v,
                                    0
                                  )
                                : typeof usePen?.[ri]?.[ti] === 'number'
                                  ? (usePen[ri][ti] as number)
                                  : 0;
                            return (
                              <div
                                style={{
                                  fontFamily: FONT_MONO,
                                  fontSize: 9,
                                  color: '#666',
                                  textAlign: 'center',
                                  marginTop: 2,
                                }}
                              >
                                {getRoundTot(
                                  ri,
                                  ti,
                                  useGrid ?? undefined,
                                  (usePen ?? []) as Act['penalties']
                                )}
                                {rPen > 0 && (
                                  <span style={{ color: '#ff6b6b' }}>
                                    {' '}
                                    (-{rPen * 2})
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                    <div
                      style={{
                        padding: '4px 2px',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: 1,
                      }}
                    >
                      {act.teams.map((_, ti) => (
                        <div
                          key={ti}
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            color: TC[ti],
                            textAlign: 'center',
                          }}
                        >
                          {getRoundTot(
                            ri,
                            ti,
                            editing ? eGrid! : savedGrid!,
                            editing ? ePen ?? [] : savedPen ?? []
                          )}
                        </div>
                      ))}
                    </div>
                  </Fragment>
                ))}

                <div
                  style={{
                    padding: 6,
                    background: 'rgba(200,160,48,0.1)',
                    fontFamily: FONT_HEADER,
                    fontSize: 10,
                    color: '#c8a030',
                    textAlign: 'center',
                    letterSpacing: 2,
                  }}
                >
                  FINAL
                </div>
                {act.teams.map((_, ti) => {
                  const sc = ts.find((x) => x.team.name === act.teams[ti].name);
                  return (
                    <div
                      key={ti}
                      style={{
                        padding: 6,
                        background: 'rgba(200,160,48,0.06)',
                        textAlign: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 18,
                          color: TC[ti],
                        }}
                      >
                        {sc ? sc.score : 0}
                      </span>
                    </div>
                  );
                })}
                <div
                  style={{
                    padding: 6,
                    background: 'rgba(200,160,48,0.06)',
                  }}
                >
                  {ts.map((x, i) => (
                    <div
                      key={i}
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 8,
                        color:
                          i === 0 ? '#e94560' : i === 1 ? '#f5a623' : '#555',
                      }}
                    >
                      {i + 1}. {x.score}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {editing && (
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  color: '#666',
                  marginTop: 10,
                  textAlign: 'center',
                }}
              >
                Edit scores (0-3). Click ⚠ for -2 penalty. Dbl-click to reset.
              </div>
            )}
          </div>
        )}

        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' as const }}>Team Standings</div>
        {ts.map((x, i) => {
          const isWinner = i === 0;
          const isJS = i < 2;
          return (
            <div
              key={x.team.name}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr auto',
                gap: '4px 10px',
                padding: '12px 14px',
                borderRadius: 8,
                alignItems: 'center',
                marginBottom: 6,
                borderLeft: `4px solid ${
                  isWinner ? '#c8a030' : i === 1 ? 'rgba(200,160,48,0.4)' : 'rgba(200,160,48,0.1)'
                }`,
                background: isWinner
                  ? 'rgba(200,160,48,0.12)'
                  : isJS
                    ? 'rgba(200,160,48,0.05)'
                    : 'rgba(255,255,255,0.02)',
              }}
            >
              <span
                style={{
                  fontFamily: FONT_HEADER,
                  fontSize: 20,
                  color: isWinner ? '#e94560' : i === 1 ? '#f5a623' : '#666',
                  gridRow: '1/3',
                  textAlign: 'center',
                }}
              >
                {isWinner ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <div>
                <span
                  style={{
                    fontFamily: FONT_HEADER,
                    fontSize: 16,
                    color: isWinner ? '#f0e6d3' : '#c8bfa8',
                  }}
                >
                  {x.team.name}
                </span>
                {isJS && (
                  <span
                    style={{
                      color: '#f5a623',
                      fontSize: 10,
                      fontFamily: FONT_MONO,
                      marginLeft: 8,
                      letterSpacing: 1,
                    }}
                  >
                    JERSEY SWAP
                  </span>
                )}
              </div>
              <span
                style={{
                  fontFamily: FONT_HEADER,
                  fontSize: 22,
                  color: isWinner ? '#e94560' : '#a09880',
                  textAlign: 'right',
                  gridRow: '1/3',
                }}
              >
                {x.score}
              </span>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {x.team.members
                  .filter((name, idx, arr) => arr.indexOf(name) === idx)
                  .map((name) => {
                    const isSolo = x.team.members.filter((m) => m === name).length > 1;
                    const bd = bracketBreakdown[name];
                    if (isSolo && bd) {
                      const d0 = Math.round(bd.ch0);
                      const d1 = Math.round(bd.ch1);
                      return (
                        <span key={name} style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#888', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span>
                            {name} <span style={{ color: '#555' }}>(Top):</span>{' '}
                            <strong style={{ color: '#f0e6d3' }}>{bd.pts0}pts</strong>
                            <span style={{ color: d0 > 0 ? '#50fa7b' : d0 < 0 ? '#e94560' : '#555', marginLeft: 4 }}>
                              {d0 > 0 ? '+' : ''}{d0} VR
                            </span>
                          </span>
                          <span>
                            {name} <span style={{ color: '#555' }}>(Bot):</span>{' '}
                            <strong style={{ color: '#f0e6d3' }}>{bd.pts1}pts</strong>
                            <span style={{ color: d1 > 0 ? '#50fa7b' : d1 < 0 ? '#e94560' : '#555', marginLeft: 4 }}>
                              {d1 > 0 ? '+' : ''}{d1} VR
                            </span>
                          </span>
                        </span>
                      );
                    }
                    const pts = playerPts[name] ?? 0;
                    const b = Math.round(eB[name] ?? STARTING_VR);
                    const a = Math.round(eA[name] ?? STARTING_VR);
                    const d = a - b;
                    return (
                      <span
                        key={name}
                        style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#888' }}
                      >
                        {name}:{' '}
                        <strong style={{ color: '#f0e6d3' }}>{pts}pts</strong>
                        <span
                          style={{
                            color: d > 0 ? '#50fa7b' : d < 0 ? '#e94560' : '#555',
                            marginLeft: 4,
                          }}
                        >
                          {d > 0 ? '+' : ''}
                          {d} VR
                        </span>
                      </span>
                    );
                  })}
              </div>
            </div>
          );
        })}

        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8090a0', letterSpacing: 2, marginBottom: 12, marginTop: 24, textTransform: 'uppercase' as const }}>
          Player Breakdown
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))',
            gap: 8,
          }}
        >
          {act.teams.flatMap((t, ti) =>
            t.members.map((name) => {
              const pts = playerPts[name] ?? 0;
              const b = Math.round(eB[name] ?? STARTING_VR);
              const a = Math.round(eA[name] ?? STARTING_VR);
              const d = a - b;
              const races = act.races.filter((r) =>
                r.results.find((x) => x.player === name)
              ).length;
              const avgPts = races > 0 ? pts / races : 0;
              return (
                <div
                  key={name}
                  style={{
                    background: 'rgba(14,18,30,0.6)',
                    border: `1px solid ${TC[ti]}44`,
                    borderLeft: `3px solid ${TC[ti]}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: FONT_HEADER,
                        fontSize: 15,
                        color: '#f0e6d3',
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{ fontFamily: FONT_MONO, fontSize: 10, color: TC[ti] }}
                    >
                      {t.name}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 4,
                      textAlign: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 20,
                          color: '#e94560',
                        }}
                      >
                        {pts}
                      </div>
                      <div
                        style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#555' }}
                      >
                        POINTS
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 20,
                          color: '#f5a623',
                        }}
                      >
                        {avgPts.toFixed(1)}
                      </div>
                      <div
                        style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#555' }}
                      >
                        AVG/RACE
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 20,
                          color:
                            d > 0 ? '#50fa7b' : d < 0 ? '#e94560' : '#555',
                        }}
                      >
                        {d > 0 ? '+' : ''}
                        {d}
                      </div>
                      <div
                        style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#555' }}
                      >
                        VR
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      color: '#556',
                      marginTop: 6,
                      textAlign: 'center',
                    }}
                  >
                    {b} → <span style={{ color: '#c8a030' }}>{a}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
