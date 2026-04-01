import { FONT_HEADER, FONT_MONO } from './theme';

export const TC = ['#e94560', '#f5a623', '#50fa7b', '#8be9fd'];

export const cSub = {
  fontFamily: FONT_MONO,
  fontSize: 10,
  color: '#8090a0',
  letterSpacing: 2,
};

export const card = {
  background: 'rgba(14,18,30,0.62)',
  border: '1px solid rgba(200,160,48,0.18)',
  borderRadius: 12,
  padding: '20px 24px',
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
  color: '#ffffff',
  letterSpacing: 3,
};

export const priBtn = {
  background: '#e94560',
  border: 'none',
  color: '#fff',
  fontFamily: FONT_HEADER,
  fontSize: 14,
  letterSpacing: 1.5,
  padding: '10px 22px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 36,
};

export const secBtn = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(200,160,48,0.2)',
  color: '#a09880',
  fontFamily: FONT_HEADER,
  fontSize: 13,
  padding: '8px 18px',
  borderRadius: 8,
  cursor: 'pointer',
  minHeight: 36,
};

export const inp = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(200,160,48,0.2)',
  borderRadius: 6,
  padding: '8px 12px',
  color: '#f0e6d3',
  fontFamily: "'DM Sans','Segoe UI',sans-serif",
  fontSize: 14,
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
