import { useState } from 'react';
import { computeStats } from '../utils/elo';
import { gid, fsDel } from '../services/firestore';
import {
  card,
  cHead,
  cTitle,
  Empty,
  inp,
  lbl,
  priBtn,
  secBtn,
  delBtn,
} from '../styles/shared';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';
import type { AppData, AppOps } from '../types';
import type { AuthState } from '../hooks/useAuth';

interface RosterProps {
  data: AppData;
  ops: AppOps;
  showToast: (msg: string) => void;
  auth: AuthState;
  setView: (v: string) => void;
}

export function Roster({
  data,
  ops,
  showToast,
  auth,
  setView,
}: RosterProps) {
  const [nn, setNn] = useState('');
  const [rosterFilter, setRosterFilter] = useState<'all' | 'active' | 'retired'>('active');
  const [retireModal, setRetireModal] = useState<string | null>(null);
  const [retireDate, setRetireDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [renameModal, setRenameModal] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const stats = computeStats(data.players, data.acts, data.sats ?? []);
  const sorted = [...stats].sort((a, b) => a.name.localeCompare(b.name));

  const getStatus = (name: string) => {
    const p = data.players.find((x) => x.name === name);
    return p?.active !== false;
  };
  const getRetiredDate = (name: string) => {
    const p = data.players.find((x) => x.name === name);
    return p?.retiredDate ?? null;
  };

  const filtered = sorted.filter((p) => {
    const isActive = getStatus(p.name);
    if (rosterFilter === 'active') return isActive;
    if (rosterFilter === 'retired') return !isActive;
    return true;
  });

  const activeCount = sorted.filter((p) => getStatus(p.name)).length;
  const retiredCount = sorted.length - activeCount;

  const add = () => {
    if (!nn.trim()) return;
    auth.req(async () => {
      if (
        data.players.find(
          (p) => p.name.toLowerCase() === nn.trim().toLowerCase()
        )
      ) {
        showToast('Exists!');
        return;
      }
      await ops.addPlayer({
        name: nn.trim(),
        id: gid(),
        active: true,
      });
      setNn('');
      showToast('Added!');
    });
  };

  const rm = (name: string) => {
    auth.req(async () => {
      if (
        !confirm(
          `Remove ${name} from roster? Their ACT history and scores will be preserved.`
        )
      )
        return;
      await ops.removePlayer(null, name);
      showToast('Removed from roster');
    });
  };

  const toggleActive = (name: string) => {
    auth.req(async () => {
      const p = data.players.find((x) => x.name === name);
      const cur = p?.active !== false;
      if (cur) {
        setRetireModal(name);
        setRetireDate(new Date().toISOString().slice(0, 10));
      } else {
        await ops.updatePlayer(name, { active: true, retiredDate: null });
        showToast('Reactivated!');
      }
    });
  };

  const confirmRetire = () => {
    if (!retireModal) return;
    auth.req(async () => {
      await ops.updatePlayer(retireModal, {
        active: false,
        retiredDate: retireDate,
      });
      showToast('Retired!');
      setRetireModal(null);
    });
  };

  const startRename = (name: string) => {
    auth.req(() => {
      setRenameModal(name);
      setNewName(name);
    });
  };

  const confirmRename = () => {
    if (!renameModal || !newName.trim()) return;
    auth.req(async () => {
      if (newName.trim() === renameModal) {
        setRenameModal(null);
        return;
      }
      const existing = data.players.find(
        (p) =>
          p.name.toLowerCase() === newName.trim().toLowerCase() &&
          p.name !== renameModal
      );
      if (existing) {
        if (
          !confirm(
            `Player "${newName.trim()}" already exists. Merge "${renameModal}" into "${newName.trim()}"? All ACTs and stats will be combined.`
          )
        ) {
          return;
        }
        await ops.renamePlayer(renameModal, newName.trim());
        const oldP = data.players.find((p) => p.name === renameModal);
        if (oldP) {
          const oid = oldP.id ?? oldP._id;
          if (oid) {
            try {
              await fsDel('players', oid);
            } catch {
              // ignore
            }
          }
        }
        showToast('Merged! ' + renameModal + ' → ' + newName.trim());
        setRenameModal(null);
      } else {
        await ops.renamePlayer(renameModal, newName.trim());
        showToast('Renamed!');
        setRenameModal(null);
      }
    });
  };

  const tc = {
    width: 60,
    textAlign: 'center' as const,
    flexShrink: 0,
    fontFamily: FONT_MONO,
    fontSize: 13,
  };

  const filterBtn = (id: 'all' | 'active' | 'retired') => ({
    background:
      rosterFilter === id ? 'rgba(233,69,96,0.15)' : 'rgba(255,255,255,0.03)',
    border:
      rosterFilter === id
        ? '1px solid rgba(233,69,96,0.3)'
        : '1px solid rgba(255,255,255,0.06)',
    borderRadius: 6,
    padding: '6px 14px',
    fontFamily: FONT_MONO,
    fontSize: 10,
    color: rosterFilter === id ? '#f0e6d3' : '#555',
    cursor: 'pointer' as const,
  });

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
      {'←'} Back
    </button>
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {backBtn}
      <div style={card}>
        <div style={cHead}>
          <span style={cTitle}>☆ Roster & Stats</span>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 6,
            marginBottom: 16,
          }}
        >
          <button
            onClick={() => setRosterFilter('all')}
            style={filterBtn('all')}
          >
            All ({sorted.filter((p) => p.actCount >= 1).length})
          </button>
          <button
            onClick={() => setRosterFilter('active')}
            style={filterBtn('active')}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setRosterFilter('retired')}
            style={filterBtn('retired')}
          >
            Retired ({retiredCount})
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <input
            style={{ ...inp, flex: 1 }}
            value={nn}
            onChange={(e) => setNn(e.target.value)}
            placeholder="Add player..."
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button style={priBtn} onClick={add}>
            Add
          </button>
          <button
            style={{ ...secBtn, fontSize: 9, padding: '8px 10px' }}
            onClick={() =>
              auth.req(async () => {
                const n = await ops.fixTeamNames();
                showToast('Fixed ' + n + ' ACTs!');
              })
            }
          >
            Fix Names
          </button>
        </div>

        {retireModal && (
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
                maxWidth: 380,
                width: '90%',
              }}
            >
              <div
                style={{
                  fontFamily: FONT_HEADER,
                  fontSize: 18,
                  color: '#f0e6d3',
                  marginBottom: 4,
                }}
              >
                🎓 Retire {retireModal}
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  color: '#666',
                  marginBottom: 16,
                }}
              >
                Set graduation / retirement date for Elo records
              </div>
              <label style={lbl}>Retirement Date</label>
              <input
                style={inp}
                type="date"
                value={retireDate}
                onChange={(e) => setRetireDate(e.target.value)}
              />
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 16,
                  justifyContent: 'flex-end',
                }}
              >
                <button style={secBtn} onClick={() => setRetireModal(null)}>
                  Cancel
                </button>
                <button style={priBtn} onClick={confirmRetire}>
                  Retire
                </button>
              </div>
            </div>
          </div>
        )}

        {renameModal && (
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
                maxWidth: 380,
                width: '90%',
              }}
            >
              <div
                style={{
                  fontFamily: FONT_HEADER,
                  fontSize: 18,
                  color: '#f0e6d3',
                  marginBottom: 4,
                }}
              >
                ✏️ Rename Player
              </div>
              <div
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  color: '#666',
                  marginBottom: 16,
                }}
              >
                This updates the name across all ACTs and history
              </div>
              <label style={lbl}>New Name</label>
              <input
                style={inp}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                autoFocus
              />
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  marginTop: 16,
                  justifyContent: 'flex-end',
                }}
              >
                <button style={secBtn} onClick={() => setRenameModal(null)}>
                  Cancel
                </button>
                <button style={priBtn} onClick={confirmRename}>
                  Rename
                </button>
              </div>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <Empty
            text={
              rosterFilter === 'retired' ? 'No retired players' : 'No players'
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                display: 'flex',
                gap: 4,
                padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                fontFamily: FONT_MONO,
                fontSize: 10,
                color: '#555',
                textTransform: 'uppercase',
                minWidth: 950,
              }}
            >
              <span style={{ flex: 2 }}>Player</span>
              <span style={{ width: 70, textAlign: 'center' }}>Status</span>
              <span style={tc}>Elo</span>
              <span style={tc}>ACTs</span>
              <span style={tc}>Races</span>
              <span style={tc}>Pts</span>
              <span style={tc}>Avg/ACT</span>
              <span style={tc}>Avg/R</span>
              <span style={tc}>Win%</span>
              <span style={tc}>JS%</span>
              <span style={{ width: 52 }}></span>
            </div>
            {filtered.map((p) => {
              const lc =
                p.eloHistory.length > 0
                  ? p.eloHistory[p.eloHistory.length - 1].change
                  : 0;
              const isActive = getStatus(p.name);
              const rd = getRetiredDate(p.name);
              return (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    gap: 4,
                    padding: '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    alignItems: 'center',
                    fontSize: 14,
                    minWidth: 950,
                    opacity: isActive ? 1 : 0.5,
                  }}
                >
                  <div
                    style={{ flex: 2, cursor: 'pointer' }}
                    onClick={() => startRename(p.name)}
                  >
                    <span style={{ fontFamily: FONT_HEADER, color: '#f0e6d3' }}>
                      {p.name}
                      {!getStatus(p.name) && (
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
                    </span>
                    <span
                      style={{
                        fontFamily: FONT_MONO,
                        fontSize: 8,
                        color: '#444',
                        marginLeft: 4,
                      }}
                    >
                      ✏️
                    </span>
                    {rd && (
                      <div
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 8,
                          color: '#555',
                          marginTop: 1,
                        }}
                      >
                        Retired {rd}
                      </div>
                    )}
                  </div>
                  <span style={{ width: 70, textAlign: 'center' }}>
                    <button
                      onClick={() => toggleActive(p.name)}
                      style={{
                        background: isActive
                          ? 'rgba(80,250,123,0.15)'
                          : 'rgba(255,255,255,0.04)',
                        border: isActive
                          ? '1px solid rgba(80,250,123,0.3)'
                          : '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 9,
                        fontFamily: FONT_MONO,
                        color: isActive ? '#50fa7b' : '#666',
                        cursor: 'pointer',
                      }}
                    >
                      {isActive ? 'ACTIVE' : 'RETIRED'}
                    </button>
                  </span>
                  <span style={tc}>
                    <span style={{ color: '#c084fc', fontWeight: 700 }}>
                      {p.elo}
                    </span>
                    <br />
                    <span
                      style={{
                        fontSize: 9,
                        color:
                          lc > 0 ? '#50fa7b' : lc < 0 ? '#e94560' : '#555',
                      }}
                    >
                      {lc !== 0 && (lc > 0 ? '+' : '') + lc.toFixed(1)}
                    </span>
                  </span>
                  <span style={tc}>{p.actCount}</span>
                  <span style={tc}>{p.totalRaces}</span>
                  <span style={{ ...tc, color: '#e94560', fontWeight: 700 }}>
                    {p.totalPoints}
                  </span>
                  <span style={tc}>{p.avgPtsAct.toFixed(1)}</span>
                  <span style={tc}>{p.avgPtsRace.toFixed(2)}</span>
                  <span style={{ ...tc, color: '#50fa7b' }}>
                    {(p.winRate * 100).toFixed(0)}%
                  </span>
                  <span style={{ ...tc, color: '#f5a623' }}>
                    {(p.jsPct * 100).toFixed(0)}%
                  </span>
                  <button onClick={() => rm(p.name)} style={delBtn}>
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
