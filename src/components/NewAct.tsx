import { useState, useEffect, Fragment } from 'react';
import { fsGet, fsSet, gid } from '../services/firestore';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import { TC, card, cHead, cTitle, cSub, inp, lbl, priBtn, secBtn } from '../styles/shared';
import type { AppData, Act } from '../types';

interface NewActProps {
  data: AppData;
  ops: { addAct: (act: Act) => Promise<void> };
  setView: (v: string) => void;
  showToast: (msg: string) => void;
  setSelAct: (id: string | null) => void;
}

export function NewAct({ data, ops, setView, showToast, setSelAct }: NewActProps) {
  const [step, setStep] = useState(0);
  const now = new Date();
  const [actName, setActName] = useState(
    `${now.getMonth() + 1}/${now.getDate()}/202${now.getFullYear().toString().slice(-1)}`
  );
  const [actMonth, setActMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [actDay, setActDay] = useState(String(now.getDate()).padStart(2, '0'));
  const [actYearDigit, setActYearDigit] = useState(String(now.getFullYear()).slice(-1));
  const actDate =
    '202' + actYearDigit + '-' + actMonth.padStart(2, '0') + '-' + actDay.padStart(2, '0');
  useEffect(() => {
    setActName(
      parseInt(actMonth) + '/' + parseInt(actDay) + '/202' + actYearDigit
    );
  }, [actMonth, actDay, actYearDigit]);
  const [actType, setActType] = useState<'8man' | '12man'>('8man');
  const tSz = actType === '12man' ? 3 : 2;
  const [teams, setTeams] = useState(
    Array.from({ length: 4 }, (_, i) => ({
      name: `Team ${i + 1}`,
      members: Array(2).fill('') as string[],
    }))
  );
  const [grid, setGrid] = useState(
    Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => Array(tSz * 2).fill(null) as (number | null)[])
    )
  );
  const [penalties, setPenalties] = useState(
    Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () => Array(tSz * 2).fill(0) as number[])
    )
  );
  const [raceOrder, setRaceOrder] = useState('A');
  const [playerMap, setPlayerMap] = useState<number[][][] | null>(null);
  const [actTiebreaker, setActTiebreaker] = useState<string | null>(null);
  const [actJSTiebreaker, setActJSTiebreaker] = useState<string | null>(null);
  const [dragSrc, setDragSrc] = useState<{ ri: number; ti: number; ei: number } | null>(null);

  const getDefaultMap = (ro: string, type: string, tsz: number) => {
    return Array.from({ length: 4 }, () =>
      Array.from({ length: 4 }, () =>
        Array.from({ length: tsz * 2 }, (_, ei) => {
          if (type === '8man') return ro === 'A' ? ei % tsz : tsz - 1 - (ei % tsz);
          const map: Record<string, number> = { A: 0, B: 1, C: 2 };
          const seq: number[] = [];
          for (let i = 0; i < ro.length; i++) seq.push(map[ro[i]] ?? 0);
          const raceSeq: number[] = [];
          seq.forEach((x) => {
            raceSeq.push(x);
            raceSeq.push(x);
          });
          return raceSeq[ei] ?? 0;
        })
      )
    );
  };
  const curMap = playerMap ?? getDefaultMap(raceOrder, actType, tSz);

  const togglePlayer = (ri: number, ti: number, ei: number) => {
    const m = (playerMap ?? getDefaultMap(raceOrder, actType, tSz)).map((r) =>
      r.map((t) => [...t])
    );
    const cur = m[ri][ti][ei];
    const next =
      actType === '8man' ? (cur === 0 ? 1 : 0) : ((cur + 1) % 3);
    const otherIdx = m[ri][ti].findIndex((v, i) => i !== ei && v === next);
    if (otherIdx === -1) {
      m[ri][ti][ei] = next;
    } else {
      m[ri][ti][ei] = next;
      m[ri][ti][otherIdx] = cur;
    }
    setPlayerMap(m);
  };

  const handleDrop = (ri: number, ti: number, ei: number) => {
    if (!dragSrc || dragSrc.ri !== ri || dragSrc.ti !== ti) {
      setDragSrc(null);
      return;
    }
    const m = (playerMap ?? getDefaultMap(raceOrder, actType, tSz)).map((r) =>
      r.map((t) => [...t])
    );
    const tmp = m[ri][ti][ei];
    m[ri][ti][ei] = m[ri][ti][dragSrc.ei];
    m[ri][ti][dragSrc.ei] = tmp;
    setPlayerMap(m);
    setDragSrc(null);
  };

  const swapRound = (ri: number, ti: number) => {
    const m = (playerMap ?? getDefaultMap(raceOrder, actType, tSz)).map((r) =>
      r.map((t) => [...t])
    );
    for (let ei = 0; ei < m[ri][ti].length; ei++) {
      if (actType === '8man') m[ri][ti][ei] = m[ri][ti][ei] === 0 ? 1 : 0;
      else m[ri][ti][ei] = (m[ri][ti][ei] + 1) % 3;
    }
    setPlayerMap(m);
  };

  useEffect(() => {
    setTeams((p) =>
      Array.from({ length: 4 }, (_, i) => ({
        name: p[i]?.name ?? `Team ${i + 1}`,
        members: Array(tSz)
          .fill('')
          .map((_, j) => p[i]?.members[j] ?? ''),
      }))
    );
    setGrid(
      Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => Array(tSz * 2).fill(null) as (number | null)[])
      )
    );
    setPenalties(
      Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => Array(tSz * 2).fill(0) as number[])
      )
    );
    if (actType === '12man') setRaceOrder('BCA');
    else setRaceOrder('A');
    setPlayerMap(null);
  }, [actType, tSz]);

  const allP = teams.flatMap((t) => t.members.filter(Boolean));
  const ok0 = actName.trim() && actDate;
  const ok1 = teams.every(
    (t) => t.name.trim() && t.members.every((m) => m.trim())
  );
  const allF = grid.every((r) => r.every((t) => t.every((v) => v !== null)));
  const setCell = (ri: number, ti: number, ei: number, val: number | null) => {
    const g = grid.map((r) => r.map((t) => [...t]));
    g[ri][ti][ei] = val;
    setGrid(g);
  };
  const setPen = (ri: number, ti: number, ei: number, val: number) => {
    const p = penalties.map((r) => r.map((t) => [...t]));
    p[ri][ti][ei] = val;
    setPenalties(p);
  };
  const rTot = (ri: number, ti: number) =>
    (grid[ri]?.[ti] ?? []).reduce((s: number, v) => s + (v ?? 0), 0) +
    (penalties[ri]?.[ti] ?? []).reduce((s: number, v) => s + v * -2, 0);
  const gTot = (ti: number) =>
    grid.reduce(
      (s: number, r, ri) =>
        s +
        (r[ti] ?? []).reduce((s2: number, v) => s2 + (v ?? 0), 0) +
        (penalties[ri]?.[ti] ?? []).reduce((s2: number, v) => s2 + v * -2, 0),
      0
    );

  const buildRaces = () => {
    const races: Act['races'] = [];
    let n = 1;
    const m = curMap;
    for (let ri = 0; ri < 4; ri++) {
      for (let h = 0; h < tSz * 2; h++) {
        const res = [];
        for (let ti = 0; ti < 4; ti++) {
          const mi = m[ri][ti][h];
          res.push({
            player: teams[ti].members[mi] ?? 'P' + mi,
            points: grid[ri][ti][h] ?? 0,
          });
        }
        res.sort((a, b) => b.points - a.points);
        races.push({ raceNum: n, results: res });
        n++;
      }
    }
    return races;
  };

  const save = () => {
    const snapTeams = teams.map((t) => ({ name: t.name, members: [...t.members] }));
    const snapGrid = JSON.parse(JSON.stringify(grid));
    const snapPenalties = JSON.parse(JSON.stringify(penalties));
    const snapMap = JSON.parse(JSON.stringify(curMap));
    const snapName = actName;
    const snapDate = actDate;
    const snapType = actType;
    const snapOrder = raceOrder;
    const snapAllP = [...allP];
    const snapBuildRaces = buildRaces();
    const snapTiebreaker = actTiebreaker;
    const snapJSTiebreaker = actJSTiebreaker;

    showToast('Saving ACT...');
    setStep(0);
    setTeams(
      Array.from({ length: 4 }, (_, i) => ({
        name: 'Team ' + (i + 1),
        members: Array(tSz).fill('') as string[],
      }))
    );
    setGrid(
      Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => Array(tSz * 2).fill(null) as (number | null)[])
      )
    );
    setPenalties(
      Array.from({ length: 4 }, () =>
        Array.from({ length: 4 }, () => Array(tSz * 2).fill(0) as number[])
      )
    );
    setPlayerMap(null);
    setActTiebreaker(null);
    setActJSTiebreaker(null);
    setActName(
      `${now.getMonth() + 1}/${now.getDate()}/202${now.getFullYear().toString().slice(-1)}`
    );
    const nextDate = new Date(snapDate + 'T12:00:00');
    nextDate.setDate(nextDate.getDate() + 1);
    setActMonth(String(nextDate.getMonth() + 1).padStart(2, '0'));
    setActDay(String(nextDate.getDate()).padStart(2, '0'));
    setActYearDigit(String(nextDate.getFullYear()).slice(-1));

    (async () => {
      try {
        let currentPlayers: { name: string }[];
        try {
          currentPlayers = await fsGet('players');
        } catch {
          currentPlayers = data.players;
        }
        const existingNames = new Set(currentPlayers.map((p) => p.name.toLowerCase()));
        for (const name of snapAllP) {
          if (!existingNames.has(name.toLowerCase())) {
            const id = gid();
            try {
              await fsSet('players', id, { name, id, active: true });
            } catch {
              // ignore
            }
            existingNames.add(name.toLowerCase());
          }
        }
        const actId = gid();
        const actData: Act = {
          id: actId,
          name: snapName,
          date: snapDate,
          type: snapType,
          teams: snapTeams,
          races: snapBuildRaces,
          gridJson: JSON.stringify(snapGrid),
          playerMapJson: JSON.stringify(snapMap),
          penaltiesJson: JSON.stringify(snapPenalties),
          raceOrder: snapOrder,
          tiebreaker: snapTiebreaker ?? undefined,
          jerseyTiebreaker: snapJSTiebreaker ?? undefined,
        };
        await ops.addAct(actData);
        setSelAct(actId);
        showToast('ACT saved! 🏁');
        setView('actdetail');
      } catch (e) {
        console.error('Save failed:', e);
        showToast('Save error - check connection');
      }
    })();
  };

  const togBtn: React.CSSProperties = {
    flex: 1,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: '10px',
    color: '#666',
    fontFamily: FONT_HEADER,
    fontSize: 13,
    cursor: 'pointer',
  };
  const togAct: React.CSSProperties = {
    background: 'rgba(233,69,96,0.15)',
    borderColor: '#e94560',
    color: '#e94560',
  };
  const scInp: React.CSSProperties = {
    width: 38,
    height: 38,
    borderRadius: 6,
    fontFamily: FONT_HEADER,
    fontSize: 20,
    textAlign: 'center',
    outline: 'none',
    border: '1px solid',
    boxSizing: 'border-box',
    padding: 0,
    caretColor: '#e94560',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <button
        onClick={() => setView('dashboard')}
        style={{
          background: 'none',
          border: '1px solid #6a6040',
          borderRadius: 4,
          padding: '6px 14px',
          fontFamily: FONT_HEADER,
          fontSize: 13,
          color: '#c0b880',
          cursor: 'pointer',
          marginBottom: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ← Back
      </button>

      {step === 0 && (
        <div style={card}>
          <div style={cTitle}>🏎️ New ACT</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div>
              <label style={lbl}>Name</label>
              <input style={inp} value={actName} onChange={(e) => setActName(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Date</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  id="act-mm"
                  style={{ ...inp, width: 45, textAlign: 'center', padding: '10px 4px' }}
                  maxLength={2}
                  value={actMonth}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v.length <= 2) {
                      setActMonth(v);
                      if (v.length === 2)
                        document.getElementById('act-dd')?.focus();
                    }
                  }}
                  placeholder="MM"
                />
                <span style={{ color: '#666', fontSize: 16 }}>/</span>
                <input
                  id="act-dd"
                  style={{ ...inp, width: 45, textAlign: 'center', padding: '10px 4px' }}
                  maxLength={2}
                  value={actDay}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v.length <= 2) {
                      setActDay(v);
                      if (v.length === 2)
                        document.getElementById('act-yy')?.focus();
                    }
                  }}
                  placeholder="DD"
                />
                <span style={{ color: '#666', fontSize: 16 }}>/</span>
                <span style={{ color: '#666', fontFamily: FONT_MONO, fontSize: 15 }}>202</span>
                <input
                  id="act-yy"
                  style={{ ...inp, width: 30, textAlign: 'center', padding: '10px 2px' }}
                  maxLength={1}
                  value={actYearDigit}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    if (v.length <= 1) setActYearDigit(v);
                  }}
                  placeholder="_"
                />
              </div>
            </div>
            <div>
              <label style={lbl}>Format</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  style={{ ...togBtn, ...(actType === '8man' ? togAct : {}) }}
                  onClick={() => setActType('8man')}
                >
                  8-Man
                </button>
                <button
                  style={{ ...togBtn, ...(actType === '12man' ? togAct : {}) }}
                  onClick={() => setActType('12man')}
                >
                  12-Man
                </button>
              </div>
            </div>
          </div>
          <div style={cTitle}>👥 Teams</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 10,
              marginBottom: 20,
            }}
          >
            {teams.map((t, ti) => (
              <div
                key={ti}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: `2px solid ${TC[ti]}`,
                  borderRadius: 10,
                  padding: 10,
                }}
              >
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
                  value={t.name}
                  onChange={(e) => {
                    const c = teams.map((x) => ({ ...x, members: [...x.members] }));
                    c[ti].name = e.target.value;
                    setTeams(c);
                  }}
                />
                {t.members.map((m, mi) => (
                  <input
                    key={mi}
                    style={{ ...inp, fontSize: 13, marginTop: 4, padding: '6px 8px' }}
                    value={m}
                    onChange={(e) => {
                      const c = teams.map((x) => ({ ...x, members: [...x.members] }));
                      c[ti].members[mi] = e.target.value;
                      setTeams(c);
                    }}
                    placeholder={
                      actType === '12man'
                        ? `Player ${mi + 1} (${['A', 'B', 'C'][mi]})`
                        : `Player ${mi + 1} (${mi === 0 ? '1-4' : '5-8'})`
                    }
                    list="plist"
                    onBlur={() => {
                      if (actType !== '12man') {
                        const ms = teams.map((x) => ({ ...x, members: [...x.members] }));
                        const tt = ms[ti];
                        if (tt.members[0] && tt.members[1]) {
                          tt.name =
                            tt.members[0].split(' ')[0] + ' & ' + tt.members[1].split(' ')[0];
                        }
                        setTeams(ms);
                      }
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          <div style={cTitle}>🔀 Race Order</div>
          {actType === '8man' ? (
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setRaceOrder('A')}
                style={{
                  ...togBtn,
                  ...(raceOrder === 'A'
                    ? { background: 'rgba(80,250,123,0.15)', borderColor: '#50fa7b', color: '#50fa7b' }
                    : {}),
                }}
              >
                Group A (1-4) First
              </button>
              <button
                onClick={() => setRaceOrder('B')}
                style={{
                  ...togBtn,
                  ...(raceOrder === 'B'
                    ? { background: 'rgba(139,233,253,0.15)', borderColor: '#8be9fd', color: '#8be9fd' }
                    : {}),
                }}
              >
                Group B (5-8) First
              </button>
            </div>
          ) : (
            <div
              style={{
                marginBottom: 20,
                padding: 12,
                background: 'rgba(192,132,252,0.06)',
                borderRadius: 8,
                border: '1px solid rgba(192,132,252,0.15)',
              }}
            >
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#a09880' }}>
                12-man order: <strong style={{ color: '#8be9fd' }}>Group B (5-8)</strong> →{' '}
                <strong style={{ color: '#f5a623' }}>Group C (9-12)</strong> →{' '}
                <strong style={{ color: '#e94560' }}>Group A (1-4)</strong> → repeat
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#555', marginTop: 4 }}>
                P1 = Group A, P2 = Group B, P3 = Group C
              </div>
            </div>
          )}

          <datalist id="plist">
            {data.players.map((p) => (
              <option key={p.name} value={p.name} />
            ))}
          </datalist>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              style={priBtn}
              disabled={!ok0 || !ok1}
              onClick={() => setStep(1)}
            >
              Next: Enter Scores →
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div style={card}>
          <div style={cHead}>
            <span style={cTitle}>📋 Scorecard</span>
            <span style={cSub}>Type 0-3 for each race</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '70px repeat(4,1fr) 70px',
                gap: 0,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                overflow: 'hidden',
                minWidth: 650,
              }}
            >
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
              {teams.map((t, ti) => (
                <div
                  key={ti}
                  style={{
                    padding: '10px 8px',
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    borderBottom: `3px solid ${TC[ti]}`,
                  }}
                >
                  <div style={{ fontFamily: FONT_HEADER, fontSize: 15, color: '#f0e6d3' }}>
                    {t.name}
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#666' }}>
                    {t.members.join(' & ')}
                  </div>
                </div>
              ))}
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

              {[0, 1, 2, 3].map((ri) => {
                const orderLabel =
                  actType === '8man'
                    ? raceOrder === 'B'
                      ? '5-8 → 1-4'
                      : '1-4 → 5-8'
                    : 'B→C→A';
                return (
                  <Fragment key={ri}>
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
                      <span style={{ fontFamily: FONT_MONO, fontSize: 7, color: '#555' }}>
                        {orderLabel}
                      </span>
                    </div>
                    {teams.map((t, ti) => (
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
                        <div style={{ textAlign: 'center', marginBottom: 2 }}>
                          <button
                            onClick={() => swapRound(ri, ti)}
                            style={{
                              background: 'none',
                              border: '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 3,
                              padding: '1px 6px',
                              fontSize: 8,
                              fontFamily: FONT_MONO,
                              color: '#889',
                              cursor: 'pointer',
                            }}
                            title="Swap player order for this round"
                          >
                            ⇅
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                          {grid[ri][ti].map((val, ei) => {
                            const cid = `sc-${ri}-${ti}-${ei}`;
                            let nt = ti,
                              ne = ei + 1;
                            if (ne >= tSz * 2) {
                              ne = 0;
                              nt++;
                            }
                            if (nt >= 4) {
                              nt = 0;
                              const nr = ri + 1;
                              if (nr >= 4) {
                                // no next
                              }
                            }
                            const nxt = () => {
                              let ntt = ti,
                                nee = ei + 1;
                              if (nee >= tSz * 2) {
                                nee = 0;
                                ntt++;
                              }
                              if (ntt >= 4) {
                                ntt = 0;
                                const nrr = ri + 1;
                                if (nrr >= 4) return null;
                                return `sc-${nrr}-0-0`;
                              }
                              return `sc-${ri}-${ntt}-${nee}`;
                            };
                            const mi = curMap[ri][ti][ei];
                            const defaultMi =
                              actType === '8man'
                                ? raceOrder === 'A'
                                  ? ei % tSz
                                  : tSz - 1 - (ei % tSz)
                                : 0;
                            const isSwapped = mi !== defaultMi;
                            const pLabel =
                              (t.members[mi] ?? '').split(' ')[0]?.slice(0, 4) ?? 'P' + (mi + 1);
                            const penVal = penalties[ri][ti][ei] ?? 0;
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
                                  onDragStart={() => setDragSrc({ ri, ti, ei })}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => handleDrop(ri, ti, ei)}
                                  onClick={() => togglePlayer(ri, ti, ei)}
                                  style={{
                                    fontFamily: FONT_MONO,
                                    fontSize: 10,
                                    color: isSwapped ? '#c084fc' : '#666',
                                    cursor: 'grab',
                                    userSelect: 'none',
                                    background: isSwapped
                                      ? 'rgba(192,132,252,0.15)'
                                      : 'rgba(255,255,255,0.03)',
                                    borderRadius: 3,
                                    padding: '2px 4px',
                                    minWidth: 28,
                                    textAlign: 'center',
                                    border: isSwapped
                                      ? '1px solid rgba(192,132,252,0.3)'
                                      : '1px solid transparent',
                                    lineHeight: '12px',
                                    touchAction: 'none',
                                  }}
                                >
                                  {pLabel}
                                  {isSwapped && ' ↺'}
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
                                      setCell(ri, ti, ei, null);
                                      return;
                                    }
                                    const n = parseInt(r);
                                    if (isNaN(n) || n < 0 || n > 3) return;
                                    setCell(ri, ti, ei, n);
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
                                  onKeyDown={(e) => {
                                    if (e.key === 'Tab') return;
                                    if (e.key === 'Backspace' && val === null) {
                                      e.preventDefault();
                                      let pt = ti,
                                        pe = ei - 1;
                                      if (pe < 0) {
                                        pe = tSz * 2 - 1;
                                        pt--;
                                      }
                                      if (pt < 0) {
                                        const pr = ri - 1;
                                        if (pr < 0) return;
                                        const pid = `sc-${pr}-3-${tSz * 2 - 1}`;
                                        const el = document.getElementById(pid);
                                        if (el) {
                                          el.focus();
                                          (el as HTMLInputElement).select();
                                        }
                                        return;
                                      }
                                      const pid = `sc-${ri}-${pt}-${pe}`;
                                      const el = document.getElementById(pid);
                                      if (el) {
                                        el.focus();
                                        (el as HTMLInputElement).select();
                                      }
                                    }
                                  }}
                                  style={{
                                    ...scInp,
                                    background:
                                      val === null
                                        ? 'rgba(255,255,255,0.03)'
                                        : val === 3
                                          ? '#e9456033'
                                          : val === 2
                                            ? '#f5a62333'
                                            : val === 1
                                              ? '#8be9fd22'
                                              : 'rgba(255,255,255,0.02)',
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
                                    borderColor:
                                      val === null
                                        ? 'rgba(255,255,255,0.06)'
                                        : val === 3
                                          ? '#e9456066'
                                          : val === 2
                                            ? '#f5a62366'
                                            : val === 1
                                              ? '#8be9fd44'
                                              : '#33333366',
                                  }}
                                />
                                <button
                                  onClick={() => setPen(ri, ti, ei, penVal + 1)}
                                  onDoubleClick={() => setPen(ri, ti, ei, 0)}
                                  style={{
                                    background:
                                      penVal > 0 ? 'rgba(255,60,60,0.25)' : 'rgba(255,255,255,0.02)',
                                    border:
                                      penVal > 0
                                        ? '1px solid rgba(255,60,60,0.5)'
                                        : '1px solid rgba(255,255,255,0.04)',
                                    borderRadius: 3,
                                    padding: '0px 4px',
                                    fontSize: 7,
                                    fontFamily: FONT_MONO,
                                    color: penVal > 0 ? '#ff6b6b' : '#333',
                                    cursor: 'pointer',
                                    lineHeight: '14px',
                                    minWidth: 24,
                                  }}
                                >
                                  {penVal > 0 ? `-${penVal * 2}` : '⚠'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {(() => {
                          const rPen = penalties[ri][ti].reduce((s, v) => s + v, 0);
                          return (
                            <div
                              style={{
                                fontFamily: FONT_MONO,
                                fontSize: 11,
                                color: '#888',
                                borderTop: '1px solid rgba(255,255,255,0.04)',
                                paddingTop: 3,
                                width: '100%',
                                textAlign: 'center',
                              }}
                            >
                              {rTot(ri, ti)}
                              {rPen > 0 && (
                                <span style={{ color: '#ff6b6b' }}> ({rPen * -2} pen)</span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
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
                      {teams.map((_, ti) => (
                        <div
                          key={ti}
                          style={{
                            fontFamily: FONT_MONO,
                            fontSize: 11,
                            color: TC[ti],
                            textAlign: 'center',
                          }}
                        >
                          {rTot(ri, ti)}
                        </div>
                      ))}
                    </div>
                  </Fragment>
                );
              })}

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
              {teams.map((_, ti) => (
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
                  <span style={{ fontFamily: FONT_HEADER, fontSize: 28, color: TC[ti] }}>
                    {gTot(ti)}
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
                {teams
                  .map((t, ti) => ({ name: t.name, score: gTot(ti), ti }))
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
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: '#555',
              marginTop: 12,
              textAlign: 'center',
            }}
          >
            Type 0-3. Auto-advances. Backspace goes back. Tap or drag player names to swap who
            races. Click ⚠ for -2 penalty. Dbl-click to reset.
          </div>
          {allF &&
            (() => {
              const s = teams
                .map((t, ti) => ({
                  name: t.name,
                  score: gTot(ti),
                  members: t.members,
                  ti,
                }))
                .sort((a, b) => b.score - a.score);
              return (
                <div
                  style={{
                    marginTop: 20,
                    padding: 16,
                    background: 'rgba(233,69,96,0.06)',
                    borderRadius: 10,
                    border: '1px solid rgba(233,69,96,0.15)',
                  }}
                >
                  <div style={{ fontFamily: FONT_HEADER, fontSize: 16, color: '#f0e6d3', marginBottom: 8 }}>
                    🏆 Jersey Swap
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {s.slice(0, 2).map((x, i) => (
                      <div
                        key={x.ti}
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 14,
                          color: i === 0 ? '#e94560' : '#f5a623',
                        }}
                      >
                        {i === 0 ? '👑' : '🥈'} {x.name} — {x.score} pts ({x.members.join(' & ')})
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          {allF &&
            (() => {
              const s = teams
                .map((t, ti) => ({
                  name: t.name,
                  score: gTot(ti),
                  members: t.members,
                  ti,
                }))
                .sort((a, b) => b.score - a.score);
              const tied = s.filter((t) => t.score === s[0].score);
              if (tied.length < 2) return null;
              const jsTied = actTiebreaker
                ? tied.filter((t) => t.name !== actTiebreaker)
                : tied;
              return (
                <div style={{ marginTop: 12 }}>
                  <div
                    style={{
                      background: 'rgba(245,166,35,0.1)',
                      border: '1px solid rgba(245,166,35,0.3)',
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT_HEADER,
                        fontSize: 14,
                        color: '#f5a623',
                        marginBottom: 6,
                      }}
                    >
                      ⚠ {tied.length}-Way Tie for 1st — {s[0].score} pts each
                    </div>
                    <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#889', marginBottom: 8 }}>
                      Who won?
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {tied.map((t) => (
                        <button
                          key={t.name}
                          onClick={() => {
                            setActTiebreaker(t.name);
                            setActJSTiebreaker(null);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 4,
                            fontFamily: FONT_HEADER,
                            fontSize: 13,
                            cursor: 'pointer',
                            border:
                              actTiebreaker === t.name
                                ? '2px solid #50fa7b'
                                : '1px solid rgba(245,166,35,0.3)',
                            background:
                              actTiebreaker === t.name
                                ? 'rgba(80,250,123,0.12)'
                                : 'rgba(245,166,35,0.06)',
                            color: actTiebreaker === t.name ? '#50fa7b' : '#f5a623',
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  {actTiebreaker && jsTied.length >= 2 && (
                    <div
                      style={{
                        background: 'rgba(192,132,252,0.1)',
                        border: '1px solid rgba(192,132,252,0.3)',
                        borderRadius: 8,
                        padding: 12,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: FONT_HEADER,
                          fontSize: 14,
                          color: '#c084fc',
                          marginBottom: 6,
                        }}
                      >
                        👕 Who gets Jersey Swap (2nd place)?
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {jsTied.map((t) => (
                          <button
                            key={t.name}
                            onClick={() => setActJSTiebreaker(t.name)}
                            style={{
                              padding: '6px 14px',
                              borderRadius: 4,
                              fontFamily: FONT_HEADER,
                              fontSize: 13,
                              cursor: 'pointer',
                              border:
                                actJSTiebreaker === t.name
                                  ? '2px solid #c084fc'
                                  : '1px solid rgba(192,132,252,0.3)',
                              background:
                                actJSTiebreaker === t.name
                                  ? 'rgba(192,132,252,0.12)'
                                  : 'rgba(192,132,252,0.06)',
                              color:
                                actJSTiebreaker === t.name ? '#c084fc' : '#aa7aca',
                            }}
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button style={secBtn} onClick={() => setStep(0)}>
              ← Back
            </button>
            <button
              style={{
                ...priBtn,
                background: allF ? '#50fa7b' : '#333',
                color: allF ? '#0d0d0d' : '#666',
              }}
              disabled={!allF}
              onClick={save}
            >
              Save ACT 🏁
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
