import { AccentName } from '@/src/types/media';

const accentPalettes = {
  blood: {
    accent: '#D93A46',
    accentMuted: '#5A1A22',
    accentGlow: '#FF7A84',
  },
  blue: {
    accent: '#67B7FF',
    accentMuted: '#193754',
    accentGlow: '#A8D8FF',
  },
  steel: {
    accent: '#A3B0C2',
    accentMuted: '#202A37',
    accentGlow: '#D5DEEA',
  },
} as const satisfies Record<
  AccentName,
  {
    accent: string;
    accentMuted: string;
    accentGlow: string;
  }
>;

export function getTheme(accent: AccentName) {
  const palette = accentPalettes[accent];

  return {
    ...palette,
    background: '#070B12',
    surface: '#101723',
    surfaceElevated: '#141E2D',
    surfaceMuted: '#1B2635',
    textPrimary: '#F4F7FB',
    textSecondary: '#A4B0C1',
    textMuted: '#6F7D91',
    border: '#263346',
    success: '#73DBAA',
    warning: '#F4BD5D',
    danger: '#FF6D7C',
    shadow: 'rgba(0, 0, 0, 0.42)',
  };
}
