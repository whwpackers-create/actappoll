export const FONT_HEADER = "'MKWii','Arial Black',sans-serif";
export const FONT_BODY = "'DM Sans','Segoe UI',sans-serif";
export const FONT_MONO = "'JetBrains Mono','Fira Code',monospace";

export const COLORS = {
  accent: '#e94560',
  gold: '#f5a623',
  success: '#50fa7b',
  cyan: '#8be9fd',
  border: '#6a6040',
  borderLight: '#c0a840',
} as const;

export const defaultTheme = {
  bgColor: '#08090e',
  bgImage: '',
  stripeOpacity: '0.025',
  stripeWidth: '3',
  headerBg:
    'linear-gradient(180deg,#e8eaf0 0%,#c8ccd8 30%,#b0b4c0 50%,#a0a4b0 70%,#8a8e9a 100%)',
  headerTextColor: '#1a1e28',
  leaderboardBg: 'rgba(12,14,22,0.75)',
  cardBg: 'rgba(255,255,255,0.02)',
  accentColor: '#e94560',
  buttonBorderColor: '#9a8a40',
} as const;

export type Theme = typeof defaultTheme;
