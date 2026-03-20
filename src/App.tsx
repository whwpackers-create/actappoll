import { useState, useEffect } from 'react';
import { loadAllData } from './services/firestore';
import { computeStats } from './utils/elo';
import type { AppData } from './types';

function App() {
  const [data, setData] = useState<AppData>({
    acts: [],
    players: [],
    seasons: [],
    sats: [],
  });
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'loading' | 'firebase' | 'local'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllData()
      .then(({ data: d, source: s }) => {
        setData(d);
        setSource(s);
      })
      .catch((e: Error) => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
          fontFamily: "'DM Sans', sans-serif",
          color: '#c8bfa8',
        }}
      >
        <div style={{ fontSize: 24 }}>🏎️</div>
        <div>Loading ACT — All Cup Tour...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
          fontFamily: "'DM Sans', sans-serif",
          color: '#e94560',
        }}
      >
        <div>Connection error: {error}</div>
      </div>
    );
  }

  const stats = computeStats(data.players, data.acts, data.sats ?? []);
  const topPlayer = stats.sort((a, b) => b.elo - a.elo)[0];

  return (
    <div
      style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: 24,
        fontFamily: "'DM Sans', sans-serif",
        color: '#c8bfa8',
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8, color: '#f0e6d3' }}>
        🏎️ ACT — All Cup Tour
      </h1>
      <p style={{ fontSize: 14, color: '#889', marginBottom: 24 }}>
        Phase 1: Firebase connected via env vars ✓
      </p>

      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 12, color: '#556', marginBottom: 8 }}>
          Data source:{' '}
          <strong
            style={{
              color: source === 'firebase' ? '#50fa7b' : '#f5a623',
            }}
          >
            {source}
          </strong>
        </div>
        <div style={{ fontSize: 13 }}>
          {data.acts.length} ACTs · {data.players.length} players ·{' '}
          {data.seasons.length} seasons
        </div>
        {topPlayer && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#889' }}>
            Top Elo:{' '}
            <strong style={{ color: '#e94560' }}>{topPlayer.name}</strong> (
            {topPlayer.elo})
          </div>
        )}
      </div>

      <p style={{ marginTop: 24, fontSize: 11, color: '#445' }}>
        Original app: <code>index (95).html</code> · Full migration in progress
      </p>
    </div>
  );
}

export default App;
