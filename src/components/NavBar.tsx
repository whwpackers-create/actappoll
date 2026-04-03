import { useState, useRef, useEffect } from 'react';
import type { AuthState } from '../hooks/useAuth';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';

interface NavBarProps {
  view: string;
  setView: (v: string) => void;
  ct: number;
  auth: AuthState;
  src: 'firebase' | 'local' | 'loading';
  onSync: () => void;
  onMigrate: () => void;
  onTheme: () => void;
  menuImgs?: Record<string, string>;
}

export function NavBar({
  setView,
  ct,
  auth,
  src,
  onSync,
  onMigrate,
  onTheme,
  menuImgs,
}: NavBarProps) {
  const siteLogo = menuImgs?.['site_logo'] ?? '';
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 200 }}>
      {/* Main bar */}
      <div style={{
        position: 'relative', overflow: 'visible', height: 52,
        background: 'repeating-linear-gradient(180deg, #ffffff 0px, #ffffff 3px, #ebebeb 3px, #ebebeb 4px)',
      }}>

        {/* Clip mask for checkers only — does not clip the dropdown */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 240, overflow: 'hidden' }}>
            <svg width="240" height="52" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="navChecker" width="26" height="26" patternUnits="userSpaceOnUse">
                  <rect width="13" height="13" fill="rgba(180,210,255,0.85)"/>
                  <rect x="13" width="13" height="13" fill="rgba(235,245,255,0.85)"/>
                  <rect y="13" width="13" height="13" fill="rgba(235,245,255,0.85)"/>
                  <rect x="13" y="13" width="13" height="13" fill="rgba(180,210,255,0.85)"/>
                </pattern>
                <linearGradient id="navFade" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"  stopColor="white" stopOpacity="0"/>
                  <stop offset="45%" stopColor="white" stopOpacity="1"/>
                </linearGradient>
                <mask id="navMask">
                  <rect width="240" height="52" fill="url(#navFade)"/>
                </mask>
              </defs>
              <rect width="240" height="52" fill="url(#navChecker)" mask="url(#navMask)"/>
            </svg>
          </div>
        </div>

        {/* Content — outside clip div so dropdown overflows freely */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px 0 20px',
        }}>
          {/* Left: site name */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => setView('dashboard')}
          >
            {siteLogo ? (
              <img src={siteLogo} alt="Logo" style={{ height: 34, objectFit: 'contain' }}/>
            ) : null}
            <span style={{
              fontFamily: FONT_HEADER,
              fontSize: 19,
              fontWeight: 900,
              letterSpacing: 2,
              color: '#2a2e40',
              whiteSpace: 'nowrap',
            }}>
              ACT AP POLL
            </span>
            <span style={{
              background: '#c03040',
              color: '#fff',
              fontFamily: FONT_HEADER,
              fontSize: 10,
              padding: '2px 6px',
              borderRadius: 3,
              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            }}>
              {ct}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onSync(); }}
              style={{
                background: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(0,0,0,0.15)',
                borderRadius: 3,
                padding: '1px 7px',
                fontSize: 8,
                fontFamily: FONT_MONO,
                color: src === 'firebase' ? '#1a5a2a' : '#7a5a0a',
                cursor: 'pointer',
              }}
            >
              {src === 'firebase' ? '● SYNC' : '● LOCAL'}
            </button>
          </div>

          {/* Right: admin area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 150, position: 'relative' }} ref={dropRef}>

            {/* Push button — only when unlocked */}
            {auth.unlocked && (
              <button
                onClick={(e) => { e.stopPropagation(); onMigrate(); }}
                style={{
                  background: 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 3,
                  padding: '2px 7px',
                  fontSize: 7,
                  fontFamily: FONT_MONO,
                  color: '#5a3a7a',
                  cursor: 'pointer',
                }}
              >
                ↑Push
              </button>
            )}

            {/* Admin / Logout button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (auth.unlocked) {
                  setDropOpen(o => !o);
                } else {
                  auth.req(() => {});
                }
              }}
              style={{
                background: auth.unlocked ? 'rgba(40,160,80,0.12)' : 'rgba(255,255,255,0.7)',
                border: auth.unlocked ? '1px solid rgba(40,140,70,0.5)' : '1px solid rgba(0,0,0,0.18)',
                borderRadius: 4,
                padding: '3px 10px',
                fontSize: 9,
                fontFamily: FONT_MONO,
                color: auth.unlocked ? '#1a6a30' : '#3a3a4a',
                cursor: 'pointer',
                letterSpacing: 1,
              }}
            >
              {auth.unlocked ? `🔓 Admin ${dropOpen ? '▲' : '▼'}` : '🔒 Admin'}
            </button>

            {/* Dropdown */}
            {auth.unlocked && dropOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 6,
                background: '#fff',
                border: '1px solid #d0d8e8',
                borderRadius: 6,
                boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                overflow: 'hidden',
                minWidth: 150,
                zIndex: 200,
              }}>
                {[
                  { label: '➕ New ACT', action: () => { setView('newact'); setDropOpen(false); } },
                  { label: '🎨 Customize', action: () => { onTheme(); setDropOpen(false); } },
                  { label: '🔓 Logout', action: () => { auth.logout(); setDropOpen(false); }, danger: true },
                ].map(({ label, action, danger }) => (
                  <button
                    key={label}
                    onClick={(e) => { e.stopPropagation(); action(); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      background: 'none', border: 'none',
                      borderBottom: '1px solid #f0f0f0',
                      padding: '10px 16px',
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      color: danger ? '#c03040' : '#2a2e40',
                      cursor: 'pointer',
                      letterSpacing: 0.5,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = danger ? '#fff0f2' : '#f0f4ff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Blue border underneath */}
      <div style={{ height: 3, background: '#4a6ade' }}/>
      <div style={{ height: 1, background: '#2a3aaa' }}/>
    </header>
  );
}
