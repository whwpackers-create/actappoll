import { FONT_HEADER, FONT_MONO } from '../styles/theme';

interface PlaceholderProps {
  view: string;
  onBack: () => void;
  ops?: unknown;
}

export function Placeholder({ view, onBack }: PlaceholderProps) {
  return (
    <div style={{ padding: 24 }}>
      <button
        onClick={onBack}
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
      <div
        style={{
          fontFamily: FONT_HEADER,
          fontSize: 20,
          color: '#f0e6d3',
          marginTop: 16,
        }}
      >
        {view} — Component extraction in progress
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: 12,
          color: '#667',
          marginTop: 8,
        }}
      >
        This view will be fully migrated in the next steps.
      </div>
    </div>
  );
}
