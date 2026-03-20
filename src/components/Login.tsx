import type { AuthState } from '../hooks/useAuth';
import { FONT_HEADER, FONT_BODY, FONT_MONO } from '../styles/theme';

interface LoginProps {
  auth: AuthState;
}

export function Login({ auth }: LoginProps) {
  return (
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
            fontSize: 22,
            color: '#f0e6d3',
            letterSpacing: 2,
            marginBottom: 4,
          }}
        >
          🔒 Admin Access
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            color: '#666',
            marginBottom: 16,
          }}
        >
          Enter password to modify data
        </div>
        <input
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#f0e6d3',
            fontFamily: FONT_BODY,
            fontSize: 15,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          type="password"
          value={auth.pw}
          onChange={(e) => auth.setPw(e.target.value)}
          onKeyDown={(e) =>
            e.key === 'Enter' && !auth.checking && auth.submit()
          }
          placeholder="Password..."
          autoFocus
          disabled={auth.checking}
        />
        {auth.err && (
          <div
            style={{
              color: '#e94560',
              fontFamily: FONT_MONO,
              fontSize: 12,
              marginTop: 8,
            }}
          >
            {auth.err}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 16,
            justifyContent: 'flex-end',
          }}
        >
          <button
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#a09880',
              fontFamily: FONT_HEADER,
              fontSize: 14,
              padding: '10px 20px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onClick={auth.cancel}
            disabled={auth.checking}
          >
            Cancel
          </button>
          <button
            style={{
              background: auth.checking ? '#666' : '#e94560',
              border: 'none',
              color: '#fff',
              fontFamily: FONT_HEADER,
              fontSize: 15,
              padding: '12px 24px',
              borderRadius: 8,
              cursor: auth.checking ? 'wait' : 'pointer',
            }}
            onClick={auth.submit}
            disabled={auth.checking}
          >
            {auth.checking ? 'Checking...' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
