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
}

export function NavBar({
  setView,
  ct,
  auth,
  src,
  onSync,
  onMigrate,
}: NavBarProps) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      <div
        style={{
          background:
            'linear-gradient(180deg,#e8eaf0 0%,#c8ccd8 30%,#b0b4c0 50%,#a0a4b0 70%,#8a8e9a 100%)',
          padding: '10px 16px',
          boxShadow:
            '0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.6)',
          borderBottom: '2px solid #666a74',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
            onClick={() => setView('dashboard')}
          >
            <span style={{ fontSize: 24 }}>🏎️</span>
            <span
              style={{
                fontFamily: FONT_HEADER,
                fontSize: 22,
                color: '#1a1e28',
                letterSpacing: 2,
                textShadow: '0 1px 0 rgba(255,255,255,0.4)',
              }}
            >
              ACT
            </span>
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: 8,
                color: '#4a4e58',
                letterSpacing: 2,
              }}
            >
              ALL CUP TOUR
            </span>
            <span
              style={{
                background: '#c03040',
                color: '#fff',
                fontFamily: FONT_HEADER,
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 3,
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
            >
              {ct}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSync();
              }}
              style={{
                background: 'rgba(0,0,0,0.1)',
                border: '1px solid rgba(0,0,0,0.15)',
                borderRadius: 3,
                padding: '1px 7px',
                fontSize: 8,
                fontFamily: FONT_MONO,
                color: src === 'firebase' ? '#2a6a3a' : '#8a6a1a',
                cursor: 'pointer',
              }}
            >
              {src === 'firebase' ? '● SYNC' : '● LOCAL'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {auth.unlocked && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMigrate();
                }}
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
              onClick={(e) => {
                e.stopPropagation();
                auth.req(() => {});
              }}
              style={{
                background: auth.unlocked
                  ? 'rgba(40,80,40,0.15)'
                  : 'rgba(0,0,0,0.08)',
                border: auth.unlocked
                  ? '1px solid rgba(60,120,60,0.3)'
                  : '1px solid rgba(0,0,0,0.15)',
                borderRadius: 4,
                padding: '3px 10px',
                fontSize: 9,
                fontFamily: FONT_MONO,
                color: auth.unlocked ? '#3a7a3a' : '#5a5a6a',
                cursor: 'pointer',
                letterSpacing: 1,
              }}
            >
              {auth.unlocked ? '🔓 Admin' : '🔒 Admin'}
            </button>
          </div>
        </div>
      </div>
      <div
        style={{
          height: 2,
          background: 'linear-gradient(180deg,#3a3e48 0%,#1a1e28 100%)',
        }}
      />
    </header>
  );
}
