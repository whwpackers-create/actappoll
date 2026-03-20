import { FONT_HEADER, FONT_MONO } from './theme';

export const TC = ['#e94560', '#f5a623', '#50fa7b', '#8be9fd'];

export const cSub = {
  fontFamily: FONT_MONO,
  fontSize: 11,
  color: '#666',
  letterSpacing: 1,
};

export const card = {
  background: 'rgba(12,14,22,0.6)',
  border: '1px solid #6a6040',
  borderRadius: 12,
  padding: 20,
};

export const cHead = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 16,
  flexWrap: 'wrap' as const,
  gap: 8,
};

export const cTitle = {
  fontFamily: FONT_HEADER,
  fontSize: 20,
  color: '#f0e6d3',
  letterSpacing: 1.5,
};

export const priBtn = {
  background: '#e94560',
  border: 'none',
  color: '#fff',
  fontFamily: FONT_HEADER,
  fontSize: 15,
  letterSpacing: 1.5,
  padding: '12px 24px',
  borderRadius: 8,
  cursor: 'pointer',
};

export const secBtn = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#a09880',
  fontFamily: FONT_HEADER,
  fontSize: 14,
  padding: '10px 20px',
  borderRadius: 8,
  cursor: 'pointer',
};

export const inp = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(106,96,64,0.3)',
  borderRadius: 8,
  padding: '10px 14px',
  color: '#f0e6d3',
  fontFamily: "'DM Sans','Segoe UI',sans-serif",
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box' as const,
};

export const lbl = {
  display: 'block',
  fontFamily: FONT_HEADER,
  fontSize: 12,
  color: '#a09880',
  letterSpacing: 1.5,
  marginBottom: 4,
  textTransform: 'uppercase' as const,
};

export const delBtn = {
  background: 'none',
  border: 'none',
  color: '#555',
  fontSize: 16,
  cursor: 'pointer',
  padding: 4,
  lineHeight: 1,
};

export function Empty({ text = 'No data yet' }: { text?: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        color: '#444',
        fontFamily: FONT_MONO,
        fontSize: 13,
        padding: '32px 0',
      }}
    >
      {text}
    </div>
  );
}
