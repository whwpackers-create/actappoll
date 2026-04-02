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
  menuImgs?: Record<string, string>;
}

export function NavBar({
  setView,
  ct,
  auth,
  src,
  onSync,
  onMigrate,
  menuImgs,
}: NavBarProps) {
  const siteLogo = menuImgs?.['site_logo'] ?? '';

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Main bar */}
      <div style={{ position: 'relative', overflow: 'hidden', height: 56 }}>

        {/* Background — silver/grey gradient with diagonal dip on bottom-left */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg,#dde0e8 0%,#b8bcc8 40%,#9ca0ae 70%,#888c9a 100%)',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 52px 100%, 0 52%)',
          boxShadow: '0 3px 10px rgba(0,0,0,0.5)',
        }}/>

        {/* Diagonal blue accent line along the dip edge */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'transparent',
          clipPath: 'polygon(0 50%, 52px 100%, 64px 100%, 10px 50%)',
          backgroundColor: '#4a6aaa',
          opacity: 0.7,
        }}/>

        {/* Checker strip — right side, light grey/white squares */}
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 140, overflow: 'hidden',
        }}>
          <svg width="140" height="56" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="navChecker" width="14" height="14" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill="rgba(255,255,255,0.55)"/>
                <rect x="7" width="7" height="7" fill="rgba(160,168,185,0.35)"/>
                <rect y="7" width="7" height="7" fill="rgba(160,168,185,0.35)"/>
                <rect x="7" y="7" width="7" height="7" fill="rgba(255,255,255,0.55)"/>
              </pattern>
              {/* Fade mask: transparent on left, opaque on right */}
              <linearGradient id="navFade" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="white" stopOpacity="0"/>
                <stop offset="50%" stopColor="white" stopOpacity="1"/>
              </linearGradient>
              <mask id="navMask">
                <rect width="140" height="56" fill="url(#navFade)"/>
              </mask>
            </defs>
            <rect width="140" height="56" fill="url(#navChecker)" mask="url(#navMask)"/>
          </svg>
        </div>

        {/* Content */}
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
              <img src={siteLogo} alt="Logo" style={{ height: 36, objectFit: 'contain' }}/>
            ) : null}
            <span style={{
              fontFamily: FONT_HEADER,
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 3,
              color: '#1e2230',
              textShadow: '0 1px 0 rgba(255,255,255,0.5)',
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
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}>
              {ct}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onSync(); }}
              style={{
                background: 'rgba(0,0,0,0.1)',
                border: '1px solid rgba(0,0,0,0.18)',
                borderRadius: 3,
                padding: '1px 6px',
                fontSize: 8,
                fontFamily: FONT_MONO,
                color: src === 'firebase' ? '#1a5a2a' : '#7a5a0a',
                cursor: 'pointer',
              }}
            >
              {src === 'firebase' ? '● SYNC' : '● LOCAL'}
            </button>
          </div>

          {/* Right: admin */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 148 }}>
            {auth.unlocked && (
              <button
                onClick={(e) => { e.stopPropagation(); onMigrate(); }}
                style={{
                  background: 'rgba(0,0,0,0.08)',
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 3,
                  padding: '2px 6px',
                  fontSize: 7,
                  fontFamily: FONT_MONO,
                  color: '#5a3a7a',
                  cursor: 'pointer',
                }}
              >
                ↑Push
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); auth.unlocked ? auth.logout() : auth.req(() => {}); }}
              style={{
                background: auth.unlocked ? 'rgba(40,80,40,0.18)' : 'rgba(0,0,0,0.1)',
                border: auth.unlocked ? '1px solid rgba(60,120,60,0.35)' : '1px solid rgba(0,0,0,0.18)',
                borderRadius: 4,
                padding: '3px 10px',
                fontSize: 9,
                fontFamily: FONT_MONO,
                color: auth.unlocked ? '#2a6a2a' : '#4a4a5a',
                cursor: 'pointer',
                letterSpacing: 1,
              }}
            >
              {auth.unlocked ? '🔓 Logout' : '🔒 Admin'}
            </button>
          </div>
        </div>
      </div>

      {/* Blue accent border under the bar */}
      <div style={{
        height: 3,
        background: 'linear-gradient(90deg, #3a5aaa 0%, #5a7acc 40%, #3a5aaa 100%)',
      }}/>
    </header>
  );
}
