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
    <header style={{ position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 3px 12px rgba(0,0,0,0.3)' }}>
      <div style={{ position: 'relative', overflow: 'hidden', height: 52, background: '#e8ecf4' }}>

        {/* Blue diagonal swoosh — sweeps from bottom-left across to right */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="swooshGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#4a6ade" stopOpacity="0"/>
              <stop offset="30%"  stopColor="#4a6ade" stopOpacity="0.6"/>
              <stop offset="65%"  stopColor="#3a5acc" stopOpacity="1"/>
              <stop offset="100%" stopColor="#2a3aaa" stopOpacity="1"/>
            </linearGradient>
            {/* Lighter inner highlight on swoosh */}
            <linearGradient id="swooshHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%"   stopColor="rgba(255,255,255,0.35)"/>
              <stop offset="50%"  stopColor="rgba(255,255,255,0.0)"/>
            </linearGradient>

            <pattern id="navChecker" width="18" height="18" patternUnits="userSpaceOnUse">
              <rect width="9"  height="9"  fill="rgba(180,200,255,0.9)"/>
              <rect x="9" width="9" height="9"  fill="rgba(255,255,255,0.55)"/>
              <rect y="9" width="9" height="9"  fill="rgba(255,255,255,0.55)"/>
              <rect x="9" y="9" width="9" height="9"  fill="rgba(180,200,255,0.9)"/>
            </pattern>
            <linearGradient id="checkerFade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="black" stopOpacity="0"/>
              <stop offset="35%"  stopColor="black" stopOpacity="1"/>
            </linearGradient>
            <mask id="checkerMask">
              <rect width="220" height="52" fill="url(#checkerFade)"/>
            </mask>
          </defs>

          {/* Swoosh shape — wide diagonal from lower-left, fills right 70% */}
          <polygon
            points="160,52 280,0 1000,0 1000,52"
            fill="url(#swooshGrad)"
          />
          {/* Highlight stripe on top edge of swoosh */}
          <polygon
            points="160,52 280,0 1000,0 1000,10 295,10 175,52"
            fill="url(#swooshHighlight)"
          />
          {/* Checker overlay on the far right */}
          <g transform="translate(780,0)">
            <rect width="220" height="52" fill="url(#navChecker)" mask="url(#checkerMask)"/>
          </g>
          {/* Thin bright line along top of swoosh edge */}
          <line x1="280" y1="0" x2="160" y2="52" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5"/>
        </svg>

        {/* Content */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px 0 20px',
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
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }}>
              {ct}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onSync(); }}
              style={{
                background: 'rgba(255,255,255,0.45)',
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

          {/* Right: admin badge — styled like MK Wii Licence Settings pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative', zIndex: 2 }}>
            {auth.unlocked && (
              <button
                onClick={(e) => { e.stopPropagation(); onMigrate(); }}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.35)',
                  borderRadius: 3,
                  padding: '2px 7px',
                  fontSize: 7,
                  fontFamily: FONT_MONO,
                  color: '#ddeeff',
                  cursor: 'pointer',
                }}
              >
                ↑Push
              </button>
            )}
            {/* Pill badge */}
            <button
              onClick={(e) => { e.stopPropagation(); auth.unlocked ? auth.logout() : auth.req(() => {}); }}
              style={{
                background: auth.unlocked
                  ? 'linear-gradient(180deg,#5aaa6a 0%,#3a8a4a 100%)'
                  : 'linear-gradient(180deg,#6a7aee 0%,#3a4acc 100%)',
                border: 'none',
                outline: auth.unlocked ? '2px solid #2a6a3a' : '2px solid #2a3aaa',
                outlineOffset: 1,
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 10,
                fontFamily: FONT_HEADER,
                fontWeight: 900,
                letterSpacing: 1,
                color: '#fff',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                textShadow: '0 1px 2px rgba(0,0,0,0.4)',
                whiteSpace: 'nowrap',
              }}
            >
              {auth.unlocked ? '🔓 Logout' : '🔒 Admin'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
