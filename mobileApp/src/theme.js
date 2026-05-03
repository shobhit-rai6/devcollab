// DevCollab design tokens – mirrors the web app colour palette

export const colors = {
  // Backgrounds
  bg:          '#0a0b0f',
  bgCard:      'rgba(255,255,255,0.03)',
  bgCardHover: 'rgba(255,255,255,0.055)',
  bgInput:     'rgba(255,255,255,0.04)',
  bgModal:     '#13151f',
  bgOverlay:   'rgba(0,0,0,0.75)',

  // Borders
  border:       'rgba(255,255,255,0.07)',
  borderFocus:  'rgba(99,102,241,0.5)',

  // Brand
  primary:  '#6366f1',
  primary2: '#8b5cf6',
  pink:     '#ec4899',

  // Text
  textPrimary:   '#e8e9f0',
  textSecondary: '#94a3b8',
  textMuted:     '#64748b',
  textDimmed:    '#475569',

  // Accents
  indigo:  '#818cf8',
  indigoLight: '#a5b4fc',
  green:   '#22c55e',
  red:     '#ef4444',
  redLight:'#fca5a5',
  yellow:  '#fbbf24',

  // Gradient endpoints (use as LinearGradient colors)
  gradStart: '#6366f1',
  gradEnd:   '#8b5cf6',
};

export const fonts = {
  // Use system fonts – closest match to Syne/DM Sans
  heading:  'System',
  body:     'System',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  button: {
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
};
