import { useState, useEffect } from 'react';
import { FONT_HEADER, FONT_MONO } from '../styles/theme';

interface ChooserProps {
  setView: (v: string) => void;
}

const TC4 = ['#e94560', '#f5a623', '#50fa7b', '#8be9fd'];
const teamNames = ['Team 1', 'Team 2', 'Team 3', 'Team 4'];
const ordinalLabels = ['1st Pick', '2nd Pick', '3rd Pick', '4th Pick'];

export function Chooser({ setView }: ChooserProps) {
  const [phase, setPhase] = useState<'ready' | 'countdown' | 'revealing' | 'done'>('ready');
  const [order, setOrder] = useState<number[]>([]);
  const [revealIdx, setRevealIdx] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

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
      ← Back
    </button>
  );

  const startChoosing = () => {
    const shuffled = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setOrder(shuffled);
    setRevealIdx(0);
    setPhase('countdown');
    setCountdown(3);
  };

  useEffect(() => {
    if (phase === 'countdown' && countdown !== null && countdown > 0) {
      const t = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(t);
    }
    if (phase === 'countdown' && countdown === 0) {
      setPhase('revealing');
    }
  }, [phase, countdown]);

  const revealNext = () => {
    if (revealIdx < order.length - 1) setRevealIdx(revealIdx + 1);
    else setPhase('done');
  };

  if (phase === 'ready') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        {backBtn}
        <div
          style={{
            background: 'rgba(12,14,22,0.75)',
            border: '1px solid #2a3040',
            borderRadius: 10,
            padding: 30,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎲</div>
          <div
            style={{
              fontFamily: FONT_HEADER,
              fontSize: 24,
              color: '#fff',
              letterSpacing: 2,
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              marginBottom: 8,
            }}
          >
            CHOOSER
          </div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 12,
              color: '#667',
              marginBottom: 24,
            }}
          >
            Randomizes character pick order for Teams 1–4
          </div>
          <button
            onClick={startChoosing}
            style={{
              display: 'block',
              width: '100%',
              padding: '18px 0',
              cursor: 'pointer',
              background: 'rgba(180,160,60,0.08)',
              border: '2px solid #c0a840',
              borderRadius: 6,
              fontFamily: FONT_HEADER,
              fontSize: 22,
              color: '#e0d080',
              letterSpacing: 1,
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            Randomize 🎲
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <div
          style={{
            background: 'rgba(12,14,22,0.75)',
            border: '1px solid #2a3040',
            borderRadius: 10,
            padding: 40,
            textAlign: 'center',
            minHeight: 250,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: FONT_HEADER,
              fontSize: 80,
              color: '#f5a623',
              textShadow: '0 0 40px rgba(245,166,35,0.3)',
            }}
          >
            {countdown}
          </div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 14, color: '#667', marginTop: 8 }}>
            Get ready...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <div
        style={{
          background: 'rgba(12,14,22,0.75)',
          border: '1px solid #2a3040',
          borderRadius: 10,
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div
            style={{
              fontFamily: FONT_HEADER,
              fontSize: 20,
              color: '#fff',
              letterSpacing: 2,
            }}
          >
            PICK ORDER
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {order.map((teamIdx, i) => {
            const revealed = i <= revealIdx;
            const isCurrent = i === revealIdx && phase === 'revealing';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 20px',
                  background: revealed
                    ? isCurrent
                      ? 'rgba(245,166,35,0.12)'
                      : 'rgba(80,250,123,0.05)'
                    : 'rgba(255,255,255,0.02)',
                  border: revealed
                    ? isCurrent
                      ? '2px solid #f5a623'
                      : '1px solid rgba(80,250,123,0.2)'
                    : '1px solid rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  transform: isCurrent ? 'scale(1.03)' : 'scale(1)',
                  transition: 'all 0.3s ease',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: revealed ? TC4[teamIdx] + '22' : 'rgba(255,255,255,0.03)',
                    border: '2px solid ' + (revealed ? TC4[teamIdx] : 'rgba(255,255,255,0.06)'),
                  }}
                >
                  <span
                    style={{
                      fontFamily: FONT_HEADER,
                      fontSize: 18,
                      color: revealed ? TC4[teamIdx] : '#333',
                    }}
                  >
                    {i + 1}
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      color: revealed ? '#889' : '#333',
                      letterSpacing: 1,
                      marginBottom: 2,
                    }}
                  >
                    {ordinalLabels[i]}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_HEADER,
                      fontSize: 24,
                      color: revealed ? TC4[teamIdx] : '#222',
                      textShadow: revealed ? '0 2px 4px rgba(0,0,0,0.5)' : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {revealed ? teamNames[teamIdx] : '???'}
                  </div>
                </div>
                {isCurrent && <div style={{ fontSize: 26 }}>👈</div>}
                {revealed && !isCurrent && <div style={{ fontSize: 20, color: '#50fa7b' }}>✓</div>}
              </div>
            );
          })}
        </div>

        {phase === 'revealing' && (
          <button
            onClick={revealNext}
            style={{
              display: 'block',
              width: '100%',
              padding: '16px 0',
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(245,166,35,0.1)',
              border: '2px solid #f5a623',
              borderRadius: 6,
              fontFamily: FONT_HEADER,
              fontSize: 20,
              color: '#f5a623',
              letterSpacing: 1,
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            }}
          >
            {revealIdx < order.length - 1 ? 'Reveal Next 🎲' : 'Reveal Last! 🏁'}
          </button>
        )}

        {phase === 'done' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={startChoosing}
              style={{
                flex: 1,
                padding: '16px 0',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(80,250,123,0.08)',
                border: '2px solid rgba(80,250,123,0.3)',
                borderRadius: 6,
                fontFamily: FONT_HEADER,
                fontSize: 18,
                color: '#50fa7b',
                letterSpacing: 1,
              }}
            >
              Reshuffle 🔄
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
