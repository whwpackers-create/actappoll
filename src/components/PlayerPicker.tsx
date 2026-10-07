import { useState, useMemo, useRef, type CSSProperties } from 'react';
import { inp } from '../styles/shared';
import { FONT_MONO } from '../styles/theme';
import { computeStats } from '../utils/VR';
import type { AppData, PlayerStats } from '../types';

export interface PlayerInfo {
  name: string;
  active: boolean;
  elo: number;
  rank: number | null; // VR rank among active players
  actCount: number;
  avgPtsAct: number;
  winRate: number;
}

// Rank = VR rank among active players with at least one ACT; new members get no rank
export function buildPlayerInfos(stats: PlayerStats[]): PlayerInfo[] {
  const ranked = stats.filter((s) => s.active !== false && s.actCount > 0).sort((a, b) => b.elo - a.elo);
  const rankOf = Object.fromEntries(ranked.map((s, i) => [s.name, i + 1]));
  return stats.map((s) => ({
    name: s.name,
    active: s.active !== false,
    elo: s.elo,
    rank: rankOf[s.name] ?? null,
    actCount: s.actCount,
    avgPtsAct: s.avgPtsAct,
    winRate: s.winRate,
  }));
}

export function usePlayerInfos(data: AppData): PlayerInfo[] {
  return useMemo(
    () => buildPlayerInfos(computeStats(data.players, data.acts, data.sats ?? [], data.seasons)),
    [data.players, data.acts, data.sats, data.seasons]
  );
}

// Rank candidates for a typed query: exact > prefix > word-prefix > substring, then active, then VR
export function matchPlayers(q: string, list: PlayerInfo[], limit = 8): PlayerInfo[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const score = (n: string) => {
    const l = n.toLowerCase();
    if (l === s) return 0;
    if (l.startsWith(s)) return 1;
    if (l.split(/\s+/).some((w) => w.startsWith(s))) return 2;
    if (l.includes(s)) return 3;
    return 9;
  };
  return list
    .map((p) => ({ p, sc: score(p.name) }))
    .filter((x) => x.sc < 9)
    .sort((a, b) => a.sc - b.sc || Number(b.p.active) - Number(a.p.active) || b.p.elo - a.p.elo)
    .slice(0, limit)
    .map((x) => x.p);
}

// Map typed text to a real player name when unambiguous
export function resolvePlayer(q: string, list: PlayerInfo[]): PlayerInfo | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  const exact = list.find((p) => p.name.toLowerCase() === s);
  if (exact) return exact;
  // Only resolve when the text is the start of exactly one full name, so new members aren't swapped for someone else
  const prefix = list.filter((p) => p.name.toLowerCase().startsWith(s));
  const activePrefix = prefix.filter((p) => p.active);
  if (activePrefix.length === 1) return activePrefix[0];
  return prefix.length === 1 ? prefix[0] : null;
}

export function PlayerPicker({ value, onChange, onCommit, onEnter, onEscape, placeholder, players, style, showStats = true, autoFocus, unknownLabel = 'Not on roster' }: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void; // fires on blur / pick with the resolved value
  onEnter?: (v: string) => void; // Enter with no dropdown open
  onEscape?: () => void;
  placeholder: string;
  players: PlayerInfo[];
  style?: CSSProperties;
  showStats?: boolean;
  autoFocus?: boolean;
  unknownLabel?: string; // stats line text for a name that isn't a known player
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const byName = useMemo(() => Object.fromEntries(players.map((p) => [p.name, p])), [players]);
  const cur = byName[value] ?? null;
  const suggs = cur ? [] : matchPlayers(value, players);
  const show = () => { setOpen(true); setRect(ref.current?.getBoundingClientRect() ?? null); };
  const pick = (n: string) => { onChange(n); onCommit?.(n); setOpen(false); setHi(0); };
  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
      <input ref={ref} autoFocus={autoFocus}
        style={{ ...inp, width: '100%', boxSizing: 'border-box', ...style, ...(value.trim() && !cur ? { borderColor: 'rgba(192,132,252,0.6)' } : {}) }}
        value={value}
        placeholder={placeholder}
        onFocus={() => { show(); setHi(0); }}
        onBlur={() => {
          setOpen(false);
          const r = cur ? null : resolvePlayer(value, players);
          if (r) onChange(r.name);
          onCommit?.(r ? r.name : value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onEscape?.();
          if (!open || suggs.length === 0) {
            if (e.key === 'Enter') onEnter?.(cur ? value : resolvePlayer(value, players)?.name ?? value);
            return;
          }
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((hi + 1) % suggs.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((hi - 1 + suggs.length) % suggs.length); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(suggs[Math.min(hi, suggs.length - 1)].name); }
          else if (e.key === 'Tab') pick(suggs[Math.min(hi, suggs.length - 1)].name);
          else if (e.key === 'Escape') setOpen(false);
        }}
        onChange={(e) => { onChange(e.target.value); show(); setHi(0); }} />
      {open && suggs.length > 0 && rect && (
        <div style={{ position: 'fixed', top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 220), background: '#1a1f2e', border: '1px solid rgba(200,160,48,0.3)', borderRadius: 6, zIndex: 1000, overflow: 'hidden', textAlign: 'left' }}>
          {suggs.map((p, si) => (
            <div key={p.name} onMouseDown={(e) => { e.preventDefault(); pick(p.name); }}
              onMouseEnter={() => setHi(si)}
              style={{ padding: '8px 12px', fontFamily: FONT_MONO, fontSize: 12, color: p.active ? '#e0d4c0' : '#667', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)', background: si === hi ? 'rgba(200,160,48,0.12)' : 'transparent', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{p.name}{!p.active && <span style={{ fontSize: 9, color: '#556' }}> (inactive)</span>}</span>
              <span style={{ color: '#c8a030', fontSize: 10 }}>{p.actCount > 0 ? `${p.rank ? `#${p.rank} · ` : ''}${p.elo} VR` : `New · ${p.elo} VR`}</span>
            </div>
          ))}
        </div>
      )}
      {showStats && <div style={{ fontFamily: FONT_MONO, fontSize: 9, marginTop: 3, minHeight: 12, color: cur && cur.actCount > 0 ? '#8090a0' : '#c084fc' }}>
        {cur && cur.actCount === 0
          ? `New member · no ACTs yet · ${cur.elo} VR`
          : cur
          ? <><span style={{ color: '#c8a030' }}>{cur.rank ? `#${cur.rank} · ` : ''}{cur.elo} VR</span> · {cur.actCount} ACTs · {cur.avgPtsAct.toFixed(1)} pts/ACT · {Math.round(cur.winRate * 100)}% W</>
          : value.trim() ? unknownLabel : ''}
      </div>}
    </div>
  );
}
